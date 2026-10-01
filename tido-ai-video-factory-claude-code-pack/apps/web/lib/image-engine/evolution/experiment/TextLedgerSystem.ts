import type { TextMode, TextRequirement } from "../../compiler/ExactCopyIntegrityValidator";
import type { TextLine, TextRole } from "./TypographySystem";

/**
 * The Text Ledger System — two kinds of words, and the physics that tells them
 * apart.
 *
 * WHY THIS EXISTS
 * ---------------
 * One-pass rendering means the image model draws every word in the frame: the
 * campaign headline AND the lettering on the product's own label. Those two are
 * not two sizes of the same thing. One is a string the client typed, which the
 * model must SET into the layout. The other is part of a physical object, which
 * the model must COPY off the reference. Asked to do both from one undifferen-
 * tiated list of words, a renderer resolves the ambiguity the cheapest way it
 * can: it prints the campaign onto the label. Measured on this engine, in the
 * one brief whose frame had no free space for copy, it did exactly that in 4 of
 * 4 renders.
 *
 * A prohibition alone does not fix it. "Do not print the headline on the
 * product" is a rule the model can soften. Two different PHYSICAL FACTS cannot
 * be softened, because they describe two different acts of drawing:
 *
 *   product text    lies ON a surface: it curves with that surface, takes that
 *                   surface's perspective, and may be partly turned away.
 *   campaign text   lies in its OWN plane, parallel to the image plane: no
 *                   curvature, no perspective, and never occluded.
 *
 * So this module does not produce a word list. It produces two ledgers, each
 * carrying a verb, a plane, and an occlusion rule — and a cross-exclusion
 * matrix stating, in both directions, what may not migrate.
 *
 * WHAT IT MAY AND MAY NOT DECIDE
 * ------------------------------
 * It may decide codes, counts, diacritic inventories, physics and ordering. It
 * may not decide a single character: every string is carried verbatim from the
 * requirement, and nothing here writes, shortens, translates, re-cases or
 * repairs one. A ledger entry whose text is empty means "read it off the
 * reference", which is a real instruction, not a missing value.
 *
 * Pure. No model call, no I/O, no clock.
 */

// ── codes ────────────────────────────────────────────────────────────────────

/**
 * Which ledger an entry belongs to. The name is the ontology: a campaign string
 * belongs to the LAYOUT, a product string belongs to the PRODUCT.
 */
export type LedgerKind = "campaign" | "product";

/**
 * The verb the prompt uses for this entry, and the only two verbs allowed.
 *
 * Kept as a word rather than a boolean because the word is what reaches the
 * model. "Set" and "reproduce" are different instructions to a renderer; "true"
 * and "false" are not instructions at all.
 */
export type LedgerVerb = "RENDER" | "COPY";

/** Code prefix per role. `B` extends the H/S/C convention to supporting lines. */
const ROLE_PREFIX: Record<TextRole, string> = {
  headline: "H",
  subheadline: "S",
  body: "B",
  cta: "C",
};

/** Surfaces that belong to the product. Named, because "the product" is a concept and a cap is a place. */
export const PRODUCT_SURFACES = [
  "label",
  "front panel",
  "cap",
  "lid",
  "neck",
  "shoulder",
  "shrink sleeve",
  "box face",
  "foil seal",
  "pump collar",
  "base",
] as const;

// ── the physics that separates the two ledgers ───────────────────────────────

/**
 * What is true of this text as an object in the scene.
 *
 * Every field is a statement a renderer can act on without interpretation. This
 * is the part of the system that makes the boundary geometric rather than
 * moral.
 */
export interface EntryPhysics {
  /** Which plane the letters occupy. */
  plane: "image plane" | "product surface";
  /** Whether the letters bend with the thing they sit on. */
  follows_surface: boolean;
  /** Whether the letters take the perspective of the object under them. */
  perspective: "none" | "the product's own";
  /** Whether part of the text may be hidden. A turned label may be; a headline may not. */
  occlusion: "permitted" | "forbidden";
  /** Where its light comes from, phrased without the lighting owner's vocabulary. */
  light: string;
}

const CAMPAIGN_PHYSICS: EntryPhysics = {
  plane: "image plane",
  follows_surface: false,
  perspective: "none",
  occlusion: "forbidden",
  light: "takes its light from the same source BLOCK 4 establishes, at the same angle and the same shadow softness",
};

const PRODUCT_PHYSICS: EntryPhysics = {
  plane: "product surface",
  follows_surface: true,
  perspective: "the product's own",
  occlusion: "permitted",
  light: "takes whatever reaches the surface carrying it, including shadow and falloff",
};

// ── diacritics ───────────────────────────────────────────────────────────────

/**
 * Combining marks a Vietnamese string can carry, by their Unicode names.
 *
 * The names matter more than the characters. A renderer trained on English
 * descriptions of type has seen "circumflex" and "grave" written out far more
 * often than it has seen "ầ", so naming the marks converts "do not drop the
 * accents" — advice — into "there are two marks on this a" — a count. Whether
 * that measurably lifts accuracy on this provider is UNVERIFIED; it is cheap
 * (~40 chars a line) and it is falsifiable, which is why it is here.
 */
const MARK_NAMES: Record<string, string> = {
  "̀": "grave",
  "́": "acute",
  "̃": "tilde",
  "̉": "hook above",
  "̣": "dot below",
  "̂": "circumflex",
  "̆": "breve",
  "̛": "horn",
};

/** Letters that are their own glyph rather than a base plus a mark. */
const STANDALONE: Record<string, string> = {
  "đ": "d with stroke",
  "Đ": "D with stroke",
};

export interface MarkCount {
  /** The Unicode name, as the prompt states it. */
  name: string;
  count: number;
}

/** One accented character, decomposed the way the prompt describes it. */
export interface AccentedChar {
  /** The character as written. */
  char: string;
  /** The unaccented letter under it. */
  base: string;
  /**
   * The marks on it, outermost last, by name. Empty for a letter that is its own
   * glyph rather than a base plus a mark: `đ` is not a `d` wearing anything, and
   * describing it as one is how a renderer ends up drawing a `d`.
   */
  marks: string[];
  /** True for `đ`/`Đ` — a distinct letter, listed apart from the marks. */
  standalone: boolean;
}

const squash = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Case- and accent-insensitive form, used ONLY to recognise that two entries
 * are the same words — never to accept a string in this form.
 *
 * A local copy rather than an import, for the same reason `TypographyCritique`
 * keeps its own: this module is pure and must not depend on a validator that
 * may later reach for I/O.
 */
const loose = (s: string) =>
  squash(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, "");

/**
 * Graphemes, counted as a reader counts them.
 *
 * `"Giảm".length` is 4 in NFC and 5 in NFD for the same word, so `.length` is
 * not a count of anything a person sees. Decomposing and then discarding the
 * combining marks leaves exactly the base characters, which for Vietnamese IS
 * the grapheme count. `Intl.Segmenter` would also work and is deliberately not
 * used: it is a locale service, and this count has to be identical on every
 * machine that renders the same brief.
 */
export function graphemeCount(text: string): number {
  const nfd = squash(text).normalize("NFD");
  let n = 0;
  for (const ch of nfd) if (!/\p{M}/u.test(ch)) n++;
  return n;
}

/** Every accented character in the string, in the order it appears, deduplicated. */
export function accentedChars(text: string): AccentedChar[] {
  const out: AccentedChar[] = [];
  const seen = new Set<string>();
  for (const ch of squash(text)) {
    if (seen.has(ch)) continue;
    if (STANDALONE[ch]) {
      seen.add(ch);
      out.push({ char: ch, base: ch === "Đ" ? "D" : "d", marks: [], standalone: true });
      continue;
    }
    const nfd = ch.normalize("NFD");
    if (nfd.length < 2) continue;
    const marks = [...nfd].slice(1).map((m) => MARK_NAMES[m]).filter(Boolean) as string[];
    if (!marks.length) continue;
    seen.add(ch);
    out.push({ char: ch, base: nfd[0], marks, standalone: false });
  }
  return out;
}

/** How many of each COMBINING mark the string carries, commonest first. `đ` is a letter and is counted nowhere here. */
export function markCounts(text: string): MarkCount[] {
  const tally = new Map<string, number>();
  const nfd = squash(text).normalize("NFD");
  for (const ch of nfd) {
    const name = MARK_NAMES[ch];
    if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ── entries ──────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  /** `H1`, `S1`, `C1`, `B2`, `P1`. The handle every other block refers to. */
  code: string;
  kind: LedgerKind;
  verb: LedgerVerb;
  /** The string, exactly as supplied. Empty only for an undeclared product entry. */
  text: string;
  /** The job the line does, or `product` for anything on the object itself. */
  role: TextRole | "product";
  graphemes: number;
  marks: MarkCount[];
  accents: AccentedChar[];
  physics: EntryPhysics;
  /** For a product entry: which surface carries it, when the caller said. */
  surface?: string;
  /**
   * False when the entry stands for lettering nobody enumerated — the words the
   * product reference already shows. The prompt then points at the reference
   * instead of quoting a string, which is the only honest instruction available:
   * nothing in this system reads text off a product image.
   */
  declared: boolean;
}

/** Lettering the caller can state is printed on the product. */
export interface ProductTextInput {
  text?: string | null;
  /** One of `PRODUCT_SURFACES`, or the caller's own word for it. */
  surface?: string | null;
  /** True when it is a mark or wordmark rather than set text. */
  is_mark?: boolean;
}

export interface TextLedgerInput {
  requirement: TextRequirement;
  /**
   * Roles for the requirement's lines, where something upstream decided them.
   * Matched by exact string. Lines with no decided role are typed by position.
   */
  roles?: TextLine[] | null;
  /** Lettering on the product, when the caller knows it. */
  productText?: ProductTextInput[] | null;
  /** True when a product reference image is attached, declared or not. */
  hasProductReference?: boolean;
}

// ── conflicts ────────────────────────────────────────────────────────────────

export type LedgerConflictKind =
  /** The same words twice in the campaign ledger: one string, two draw orders. */
  | "duplicate_in_campaign"
  /** The same words twice in the product ledger. */
  | "duplicate_in_product"
  /** One string in BOTH ledgers — almost always the brand name. */
  | "dual_locus"
  /** Enough text that materials become a spelling risk. Read by the compiler. */
  | "over_budget";

export interface LedgerConflict {
  kind: LedgerConflictKind;
  /** Blocking conflicts must be resolved upstream; a warning changes the prompt. */
  severity: "blocking" | "warning";
  /** Codes involved. Never the strings: a conflict is logged, and logs do not carry the client's copy. */
  codes: string[];
  because: string;
}

/**
 * Above this many graphemes across the campaign ledger, letterform materials
 * stop being art direction and start being a spelling hazard: every additional
 * decorated glyph is another place a tone mark can deform. The compiler reads
 * this conflict and forces flat ink.
 */
export const PLAIN_INK_ABOVE_GRAPHEMES = 60;

export interface TextLedgers {
  mode: TextMode;
  /** H/S/C/B entries, hierarchy order. */
  campaign: LedgerEntry[];
  /** P entries. May hold a single undeclared entry, or be empty. */
  product: LedgerEntry[];
  /** Total graphemes across the campaign ledger. The number the compiler budgets against. */
  campaignGraphemes: number;
  conflicts: LedgerConflict[];
  /** True when any conflict is blocking. */
  blocked: boolean;
}

const HIERARCHY: Record<TextRole, number> = { headline: 1, subheadline: 2, body: 3, cta: 4 };

/** The role something upstream decided for this exact string, or null. */
function decidedRole(text: string, roles: TextLine[] | null | undefined): TextRole | null {
  const match = (roles || []).find((r) => squash(r.text) === squash(text));
  return match ? match.role : null;
}

/**
 * The role a line gets when nobody decided one.
 *
 * Positional, and deliberately crude: the first line is the one that carries the
 * idea, a short last line reads as an action, everything between supports. This
 * is a fallback, not inference — when `TypographyPlan` ran, its roles are passed
 * in and used instead.
 */
function positionalRole(index: number, total: number, text: string): TextRole {
  if (index === 0) return "headline";
  if (index === total - 1 && graphemeCount(text) <= 24) return "cta";
  return index === 1 ? "subheadline" : "body";
}

/**
 * Builds both ledgers from the resolved requirement.
 *
 * The campaign ledger is ordered by hierarchy, because that is the order the
 * reader meets the words in and therefore the order the prompt should name them
 * in. The product ledger keeps the caller's order: it describes an object, and
 * an object has no hierarchy.
 */
export function buildTextLedgers(input: TextLedgerInput): TextLedgers {
  const req = input.requirement;
  const lines = req.mode === "exact" ? req.lines.filter((l) => squash(l)) : [];

  const typed = lines.map((text, i) => ({
    text: squash(text),
    role: decidedRole(text, input.roles) ?? positionalRole(i, lines.length, text),
  }));
  typed.sort((a, b) => HIERARCHY[a.role] - HIERARCHY[b.role]);

  const used = new Map<string, number>();
  const campaign: LedgerEntry[] = typed.map(({ text, role }) => {
    const prefix = ROLE_PREFIX[role];
    const n = (used.get(prefix) ?? 0) + 1;
    used.set(prefix, n);
    return {
      code: `${prefix}${n}`,
      kind: "campaign",
      verb: "RENDER",
      text,
      role,
      graphemes: graphemeCount(text),
      marks: markCounts(text),
      accents: accentedChars(text),
      physics: CAMPAIGN_PHYSICS,
      declared: true,
    };
  });

  const declaredProduct = (input.productText || [])
    .map((p) => ({ text: squash(p?.text ?? ""), surface: squash(p?.surface ?? ""), is_mark: Boolean(p?.is_mark) }))
    .filter((p) => p.text);

  const product: LedgerEntry[] = declaredProduct.map((p, i) => ({
    code: `P${i + 1}`,
    kind: "product",
    verb: "COPY",
    text: p.text,
    role: "product",
    graphemes: graphemeCount(p.text),
    marks: markCounts(p.text),
    accents: accentedChars(p.text),
    physics: PRODUCT_PHYSICS,
    ...(p.surface ? { surface: p.surface } : {}),
    declared: true,
  }));

  // Nothing was enumerated but there is an object in frame that carries words.
  // The entry exists so the prompt has something to point at: without it the
  // product's own lettering is governed by no rule at all, and a renderer with
  // no rule about it will restyle it to match the campaign type.
  if (!product.length && input.hasProductReference) {
    product.push({
      code: "P0",
      kind: "product",
      verb: "COPY",
      text: "",
      role: "product",
      graphemes: 0,
      marks: [],
      accents: [],
      physics: PRODUCT_PHYSICS,
      declared: false,
    });
  }

  const campaignGraphemes = campaign.reduce((n, e) => n + e.graphemes, 0);
  const conflicts = findConflicts(campaign, product, campaignGraphemes);

  return {
    mode: req.mode,
    campaign,
    product,
    campaignGraphemes,
    conflicts,
    blocked: conflicts.some((c) => c.severity === "blocking"),
  };
}

/** Every conflict the two ledgers can hold, found on the loose form so a re-cased repeat still counts. */
function findConflicts(campaign: LedgerEntry[], product: LedgerEntry[], graphemes: number): LedgerConflict[] {
  const out: LedgerConflict[] = [];

  const dupes = (entries: LedgerEntry[], kind: LedgerConflictKind) => {
    const byLoose = new Map<string, string[]>();
    for (const e of entries) {
      if (!e.text) continue;
      const key = loose(e.text);
      if (!key) continue;
      byLoose.set(key, [...(byLoose.get(key) ?? []), e.code]);
    }
    for (const codes of byLoose.values()) {
      if (codes.length > 1) {
        out.push({
          kind,
          severity: "blocking",
          codes,
          because:
            "the same words appear under two codes, which reaches the renderer as two separate draw orders -- " +
            "the duplicate-text defect this engine has already measured once",
        });
      }
    }
  };
  dupes(campaign, "duplicate_in_campaign");
  dupes(product, "duplicate_in_product");

  // The brand name, nearly always. Not an error: the pack carries it and the
  // campaign may legitimately set it too. It IS an ambiguity, and the prompt has
  // to resolve it explicitly, so it is raised as a warning the renderer of T1
  // reads rather than a failure the pipeline stops for.
  for (const c of campaign) {
    if (!c.text) continue;
    const twin = product.find((p) => p.text && loose(p.text) === loose(c.text));
    if (twin) {
      out.push({
        kind: "dual_locus",
        severity: "warning",
        codes: [c.code, twin.code],
        because:
          "one string is both printed on the product and set in the layout; without an explicit note the renderer " +
          "has no way to know it must appear twice, in two planes, under two different physics",
      });
    }
  }

  if (graphemes > PLAIN_INK_ABOVE_GRAPHEMES) {
    out.push({
      kind: "over_budget",
      severity: "warning",
      codes: campaign.map((e) => e.code),
      because:
        `${graphemes} graphemes of campaign copy is past the ${PLAIN_INK_ABOVE_GRAPHEMES}-grapheme point where a ` +
        "decorated letterform becomes a spelling risk; the typography block drops to flat ink",
    });
  }

  return out;
}

// ── what the prompt says ─────────────────────────────────────────────────────

/**
 * The campaign ledger, as T1 states it.
 *
 * This is the ONLY place a campaign string is written out. Every other block
 * refers to `[H1]`, never to its content — see `auditLedgerUse`, which measures
 * that rather than trusting it.
 */
export function renderCampaignLedger(ledgers: TextLedgers): string {
  if (!ledgers.campaign.length) return "";
  const lines: string[] = [
    "CAMPAIGN COPY — SET THESE WORDS. Verb: RENDER.",
    "Each line below is set by you into the layout. Reproduce every character exactly: spelling, capitalization, punctuation, numbers and every accent. Each line appears exactly ONCE in the frame.",
  ];
  for (const e of ledgers.campaign) {
    lines.push(`  [${e.code}] ${e.role} · ${e.graphemes} graphemes · "${e.text}"`);
    const marked = e.accents.filter((a) => !a.standalone);
    const letters = e.accents.filter((a) => a.standalone);
    if (e.marks.length) {
      const names = e.marks.map((m) => (m.count > 1 ? `${m.count}x ${m.name}` : m.name)).join(", ");
      const total = e.marks.reduce((n, m) => n + m.count, 0);
      lines.push(`        required marks (${total}): ${names}`);
      lines.push(`        ${marked.map((a) => `${a.char} = ${a.base} + ${a.marks.join(" + ")}`).join(" · ")}`);
    }
    if (letters.length) {
      lines.push(`        distinct letters, not a plain letter with a mark: ${letters.map((a) => `${a.char} (${STANDALONE[a.char]})`).join(" · ")}`);
    }
  }
  return lines.join("\n");
}

/** The product ledger, as T1 states it. Different header, different verb, on purpose. */
export function renderProductLedger(ledgers: TextLedgers): string {
  if (!ledgers.product.length) return "";
  const lines: string[] = [
    "PRODUCT LETTERING — COPY THESE WORDS. Verb: REPRODUCE.",
    "This text is part of the physical object, not part of the layout. It lies on the surface carrying it, curves with that surface, takes that surface's perspective, and may be partly turned away or in shadow. Do not restyle it, re-set it, translate it, or make it match the campaign type.",
  ];
  for (const e of ledgers.product) {
    if (!e.declared) {
      lines.push(
        "  [P0] the lettering the attached product reference already shows. It is not quoted here because it is read from the reference, not from the brief: reproduce exactly what the reference shows, and invent no additional words, marks, logos or label text.",
      );
      continue;
    }
    lines.push(`  [${e.code}]${e.surface ? ` on the ${e.surface}` : ""} · "${e.text}"`);
  }
  return lines.join("\n");
}

/**
 * The cross-exclusion matrix, both directions, stated as places rather than as
 * a principle.
 *
 * "Do not print campaign copy on the product" names a concept. "Do not print it
 * on the cap" names a place, and a place is what a renderer draws on.
 */
export function renderExclusionMatrix(ledgers: TextLedgers): string {
  const campaignCodes = ledgers.campaign.map((e) => `[${e.code}]`).join(" ");
  const productCodes = ledgers.product.map((e) => `[${e.code}]`).join(" ");
  const lines: string[] = ["THE TWO LEDGERS DO NOT MIX. Both directions are forbidden:"];

  if (campaignCodes) {
    lines.push(
      `- ${campaignCodes} never touch the product: not on its ${PRODUCT_SURFACES.slice(0, -1).join(", ")} or ` +
        `${PRODUCT_SURFACES[PRODUCT_SURFACES.length - 1]}; not on any packaging, wrapper, tag or sticker; and not on any sign, ` +
        "screen or printed surface standing in for one. They exist only in their own plane in the open frame.",
    );
  }
  if (productCodes) {
    lines.push(
      `- ${productCodes} never leave the product. Do not lift the label's words into the frame, enlarge them as a headline, ` +
        "repeat them in the open space, or echo them anywhere outside the object itself.",
    );
  }

  // The brand name case. Said out loud or not at all: a renderer that meets the
  // same string in two ledgers with no instruction picks one and drops the
  // other, and which one it drops is not predictable.
  for (const c of ledgers.conflicts.filter((x) => x.kind === "dual_locus")) {
    const [campaignCode, productCode] = c.codes;
    lines.push(
      `- [${campaignCode}] and [${productCode}] are the same words in two different places, and both are required: ` +
        `[${productCode}] stays on the product exactly as the reference shows it, and [${campaignCode}] is set separately in the layout. ` +
        "Neither replaces the other, and neither is a duplicate of the other.",
    );
  }

  lines.push(
    "- No words exist in this frame beyond the two ledgers above: no extra headline, slogan, caption, price, watermark, signature, stamp, address, URL, QR code, or decorative lettering, and no invented brand mark or logo of any kind.",
  );
  return lines.join("\n");
}

/**
 * The same text with every campaign string replaced by its code.
 *
 * The analysis layer quotes the client's copy all over its own reasoning -- the
 * content message lists it, the strategy explains it, the blueprint's story
 * quotes the headline back. All of that is legitimate reasoning and none of it
 * may reach a renderer that now DRAWS whatever words it reads: measured on a real
 * stored prompt, the headline appeared four times and the subline three, which to
 * a one-pass renderer is seven draw orders.
 *
 * Substitution, not deletion: `[H1]` keeps the sentence readable and keeps the
 * reference, while the string itself exists once, in T1. Exact matches only --
 * and quoted forms, since prose quotes copy -- because a loose match would edit
 * sentences that were never about the copy at all.
 */
export function redactLedgerStrings(text: string, ledgers: TextLedgers): string {
  let out = String(text || "");
  if (!out) return out;
  // Longest first: a short line that is a substring of a longer one must not
  // consume the longer one's text before it is matched.
  const entries = [...ledgers.campaign].sort((a, b) => b.text.length - a.text.length);
  for (const e of entries) {
    if (!e.text) continue;
    for (const form of [`"${e.text}"`, `'${e.text}'`, `\u201c${e.text}\u201d`, e.text]) {
      out = out.split(form).join(`[${e.code}]`);
    }
  }
  return out;
}

// ── measuring the count-once invariant ───────────────────────────────────────

export interface LedgerUseViolation {
  /** Which block the string was found in, outside the ledger. */
  block: string;
  code: string;
  because: string;
}

/**
 * Finds campaign strings quoted outside the ledger.
 *
 * The invariant this measures is the whole reason the ledger exists: a string
 * mentioned in two blocks is a string a renderer may draw twice. The engine has
 * already paid for this lesson once — a line present in both the typography
 * section and the composition section came back rendered twice in the same
 * frame — so the rule is checked, not trusted.
 *
 * Reported, never repaired: silently editing another module's block would make
 * this module a second author, which is the failure it is here to prevent.
 */
export function auditLedgerUse(
  blocks: Array<{ name: string; text: string }>,
  ledgers: TextLedgers,
  ledgerBlockName: string,
): LedgerUseViolation[] {
  const out: LedgerUseViolation[] = [];
  for (const block of blocks) {
    if (block.name === ledgerBlockName) continue;
    const haystack = loose(block.text);
    if (!haystack) continue;
    for (const e of ledgers.campaign) {
      const needle = loose(e.text);
      // Short strings ("Mới", "50%") collide with ordinary prose once accents
      // and punctuation are gone, so the loose test only runs where a collision
      // would be a coincidence rather than a likelihood.
      if (needle.length < 8) {
        if (!block.text.includes(e.text)) continue;
      } else if (!haystack.includes(needle)) {
        continue;
      }
      out.push({
        block: block.name,
        code: e.code,
        because: `${block.name} quotes the words of [${e.code}] instead of referring to it by code, which reaches the renderer as a second draw order`,
      });
    }
  }
  return out;
}

/** Counts and codes only. Never the client's copy. */
export function ledgerTelemetry(l: TextLedgers | null | undefined) {
  if (!l) return { text_ledgers: false };
  return {
    text_ledgers: true,
    mode: l.mode,
    campaign_entries: l.campaign.length,
    product_entries: l.product.length,
    product_declared: l.product.filter((e) => e.declared).length,
    campaign_graphemes: l.campaignGraphemes,
    marks: l.campaign.reduce((n, e) => n + e.marks.reduce((m, x) => m + x.count, 0), 0),
    conflicts: l.conflicts.map((c) => c.kind),
    blocked: l.blocked,
  };
}
