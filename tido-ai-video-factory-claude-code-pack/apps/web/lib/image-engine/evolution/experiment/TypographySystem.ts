import type { CreativeBlueprint, Decision, DecisionBasis } from "./CreativeBlueprint";
import type { MarketingInsight } from "./MarketingInsight";
import type { ProductMeaning } from "./ProductMeaning";
import type { AssetContext } from "./AssetContext";
import type { LayoutGeometry, ZoneName } from "./LayoutGeometry";
import { colorFor, contrastRatio, readableOn, type BrandKit } from "./BrandKit";

/**
 * Typography System — typography that can be executed, not only described.
 *
 * The existing `design` section reasons about typography in prose: "the words
 * should feel spoken across a counter rather than set". That is the right
 * thought and a renderer can act on it, but nothing downstream can lay a text
 * object from it. This turns the reasoning into a spec: a role per string, a
 * relative scale, a weight, a tracking behaviour, and a position taken from the
 * layout geometry.
 *
 * Deterministic, pure, no model call.
 *
 * No font names, ever
 * -------------------
 * `font_personality` is a description of behaviour — "high contrast between
 * thick and thin, generous space between letters" — not a typeface. The image
 * model has its own fonts and naming one it may not have is an instruction it
 * cannot follow. Naming one it DOES have is a house style, which this codebase
 * refuses. So the spec describes what the letterforms must DO.
 *
 * Scales are relative, not points
 * -------------------------------
 * A headline is "2.4× the supporting text", not "48pt". Point sizes assume an
 * output resolution nobody has fixed, and a ratio survives any frame size. The
 * ratios come from the format's own information density, which is the real
 * difference between a poster read at distance and a banner read in passing.
 */

export type TypographyPersonality =
  | "editorial"
  | "technical"
  | "crafted"
  | "direct"
  | "quiet"
  | "assertive";

export type TextRole = "headline" | "subheadline" | "body" | "cta";

export interface TextSpec {
  role: TextRole;
  /** The zone this string occupies, from `LayoutGeometry`. */
  zone: ZoneName;
  /** Relative to the smallest text in the frame. Never a point size. */
  scale: number;
  /** Behavioural, not a numeric weight: what the strokes must do. */
  weight: string;
  /** Letter spacing as behaviour. */
  tracking: string;
  alignment: "left" | "centre" | "right";
  /** What this string is for in the reading order. */
  purpose: string;
  because: string;
  // ── Phase 5.2: executable typography. All optional: a spec built without
  // the client's lines is exactly what it was before this existed. ──────────
  /** The client's exact line. Never rewritten; only its treatment is decided. */
  text?: string;
  /** The letterform class -- serif, sans-serif, display... A class, not a typeface. */
  font_class?: FontClass;
  /** A named font, ONLY when the client's Brand Kit supplied it. */
  font_family?: string | null;
  /** Line height as a multiple of the size. */
  line_height?: number;
  /** A colour when the brand fixes one; null when it must be chosen against the image. */
  color?: string | null;
  /** The contrast the line must reach, and against what. */
  contrast?: { minimum: number; against: string; ratio?: number };
  /** How the line is set apart -- above all, the CTA's treatment. */
  treatment?: string;
}

export type FontClass = "serif" | "sans-serif" | "display-sans" | "script" | "slab-serif";

/** One of the client's lines and the job it does. */
export interface TextLine {
  text: string;
  role: TextRole;
}

/** Which classes pair, and why. */
export interface FontPairing {
  heading_class: FontClass;
  body_class: FontClass;
  heading_font: string | null;
  body_font: string | null;
  because: string;
}

export interface TypographySystem {
  personality: Decision | null;
  /** Ordered by what the viewer meets first. */
  attention_order: { position: number; role: TextRole; what_it_does: string }[];
  specs: TextSpec[];
  /** Phase 5.2. Font classes for headline and supporting text, and why. */
  pairing?: FontPairing | null;
  /** Phase 5.2. True when the client supplied no text: nothing here is drawn. */
  disabled?: boolean;
  /** Phase 5.2. Requirements every line must meet to be read. */
  readability_rules?: string[];
  /** Five checks a senior designer would run before sending it out. */
  validation: {
    hierarchy_clarity: number;
    readability: number;
    premium_feeling: number;
    brand_fit: number;
    visual_balance: number;
    overall: number;
    issues: string[];
  };
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Reads a personality out of what the director already decided.
 *
 * Derived from the typographic voice the brain resolved, which itself rests on
 * product meaning or the brand. Where nothing was decided this returns null
 * rather than picking a default, because a default personality is a house
 * style with one extra step.
 */
function readPersonality(
  b: CreativeBlueprint | null,
  pm: ProductMeaning | null,
  mi: MarketingInsight | null
): Decision | null {
  const voice = b?.design?.typographic_voice || b?.design?.font_character || null;
  if (!voice?.value?.trim()) return null;

  const v = voice.value.toLowerCase();
  // Structural words only. These describe how letterforms behave, and mean the
  // same thing for a serum, a bowl of pho or a laptop.
  let personality: TypographyPersonality = "direct";
  if (/spoken|handwritten|by hand|hand-|informal|warm/.test(v)) personality = "crafted";
  else if (/quiet|restrained|understated|soft|not sell/.test(v)) personality = "quiet";
  else if (/loud|bold|shout|assertive|urgent|immediate/.test(v)) personality = "assertive";
  else if (/precise|technical|exact|specification|engineered/.test(v)) personality = "technical";
  else if (/heritage|craft|made|process|tradition|considered/.test(v)) personality = "editorial";

  const supporting = [
    pm?.emotional_value ? `ProductMeaning.emotional_value — ${pm.emotional_value.because}` : "",
    mi?.target_customer ? `MarketingInsight.target_customer — ${mi.target_customer.because}` : "",
  ].filter(Boolean);

  return {
    value: personality,
    because: `${voice.because}${supporting.length ? `; supported by ${supporting[0]}` : ""}`,
    derived_from: voice.derived_from as DecisionBasis,
    confidence: voice.confidence,
  };
}

/** How letterforms behave for each personality. Behaviour, never a typeface. */
const LETTERFORMS: Record<TypographyPersonality, { weight: string; tracking: string }> = {
  editorial: {
    weight: "high contrast between thick and thin strokes; the difference is the character",
    tracking: "generous space between letters, so the words breathe rather than lock together",
  },
  technical: {
    weight: "even stroke weight throughout; no modulation, nothing decorative",
    tracking: "tight and regular, so the line reads as one unit",
  },
  crafted: {
    weight: "uneven weight as if made by a hand rather than set by a machine",
    tracking: "irregular spacing, closer to writing than to typesetting",
  },
  direct: {
    weight: "solid and unmodulated, heavy enough to be read at a glance",
    tracking: "normal spacing; nothing draws attention to the letterforms themselves",
  },
  quiet: {
    weight: "light strokes that recede rather than announce",
    tracking: "open spacing, so the words sit quietly in their space",
  },
  assertive: {
    weight: "heavy, filled strokes that dominate whatever is behind them",
    tracking: "tight, so the words read as a single block of weight",
  },
};

export interface TypographyInput {
  blueprint?: CreativeBlueprint | null;
  productMeaning?: ProductMeaning | null;
  marketingInsight?: MarketingInsight | null;
  assetContext?: AssetContext | null;
  geometry?: LayoutGeometry | null;
  /** Roles the client labelled or the director assigned, in order. */
  copyRoles?: string[];
  /**
   * Phase 5.2. The client's exact lines, each with its role. When given, there
   * is one spec per line carrying that line verbatim, and an empty list means
   * the image carries no text at all. Absent, specs are built from `copyRoles`
   * exactly as before.
   */
  lines?: TextLine[];
  /** Phase 5.4. The brand's fonts, colours and typography preference. */
  brandKit?: BrandKit | null;
}

/**
 * Which class each personality's letterforms belong to. Classes, not typefaces:
 * "serif" names what the strokes do, not whose font it is.
 */
const CLASSES: Record<TypographyPersonality, { heading: FontClass; body: FontClass; because: string }> = {
  editorial: { heading: "serif", body: "sans-serif", because: "a high-contrast serif headline over plain sans-serif text: the change of class does the work of hierarchy" },
  technical: { heading: "sans-serif", body: "sans-serif", because: "one even sans-serif family throughout, separated by weight and size -- precision reads as consistency" },
  crafted: { heading: "script", body: "sans-serif", because: "a hand-made headline needs a quiet sans-serif beneath it, or the frame reads as decoration" },
  direct: { heading: "sans-serif", body: "sans-serif", because: "a heavy sans-serif headline and a regular sans-serif for the rest: nothing about the letters distracts from the message" },
  quiet: { heading: "serif", body: "sans-serif", because: "a light serif headline with a light sans-serif: restraint in both, contrast in class only" },
  assertive: { heading: "display-sans", body: "sans-serif", because: "a condensed, heavy display headline over a plain sans-serif: the headline is the weight, the rest stays out of its way" },
};

const LINE_HEIGHT: Record<TextRole, number> = { headline: 1.05, subheadline: 1.2, body: 1.4, cta: 1.1 };

/** A class the brand stated in its own typography preference, if any. */
function classFromPreference(pref: string | undefined): FontClass | null {
  const p = String(pref || "").toLowerCase();
  if (/slab/.test(p)) return "slab-serif";
  if (/sans/.test(p)) return "sans-serif";
  if (/serif/.test(p)) return "serif";
  if (/script|hand/.test(p)) return "script";
  return null;
}

const ACTION = /^(đặt|mua|order|shop|buy|call|gọi|liên hệ|đăng ký|sign up|book|visit|ghé|xem|nhắn|inbox|try|get|tải|download|khám phá|discover)\b|(\d[\d .]{7,}\d)|(https?:\/\/|www\.|\.vn\b|\.com\b)/i;

/**
 * The role each of the client's lines plays.
 *
 * The director's own assignment wins where it labelled a line exactly as
 * given. Otherwise the order the client wrote them decides: the first line
 * leads, a closing line that names an action (or carries a number or address to
 * act on) is the CTA, and the rest support. The text itself is never touched.
 */
export function assignTextRoles(
  lines: string[],
  directorRoles?: { text?: string; role?: string }[] | null,
): TextLine[] {
  const byText = new Map<string, string>();
  for (const r of directorRoles || []) if (r?.text) byText.set(String(r.text).trim(), String(r.role || "").toUpperCase());
  const out: TextLine[] = [];
  lines.forEach((text, i) => {
    const labelled = ROLE_OF[byText.get(text) || ""];
    if (labelled) return out.push({ text, role: labelled });
    const last = i === lines.length - 1;
    if (i === 0) return out.push({ text, role: "headline" });
    if (last && ACTION.test(text)) return out.push({ text, role: "cta" });
    out.push({ text, role: out.some((l) => l.role === "subheadline") ? "body" : "subheadline" });
  });
  return out;
}

/** The layout roles for `buildGeometry`, from assigned lines. */
export function geometryRolesFor(lines: TextLine[]): string[] {
  const map: Record<TextRole, string> = { headline: "HEADLINE", subheadline: "SUBHEADLINE", body: "SUPPORTING_TEXT", cta: "CTA" };
  return lines.map((l) => map[l.role]);
}

const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

const ROLE_OF: Record<string, TextRole> = {
  HEADLINE: "headline",
  OFFER: "headline",
  SUBHEADLINE: "subheadline",
  SUPPORTING_TEXT: "body",
  PRODUCT_NAME: "body",
  CTA: "cta",
};

const ZONE_OF: Record<TextRole, ZoneName> = {
  headline: "headline",
  subheadline: "subheadline",
  body: "supporting",
  cta: "cta",
};

/**
 * Where a role's zone may fall back to, nearest first. The geometry lays out
 * a SUPPORTING_TEXT line in the subheadline band, so a body line has to be
 * able to land there -- a line whose zone does not exist was silently lost.
 */
const ZONE_FALLBACK: Record<TextRole, ZoneName[]> = {
  headline: ["headline", "subheadline", "supporting"],
  subheadline: ["subheadline", "supporting", "headline"],
  body: ["supporting", "subheadline", "headline"],
  cta: ["cta", "supporting", "subheadline", "headline"],
};

/** The zone the geometry actually laid out for a role. */
function zoneFor(role: TextRole, geometry: LayoutGeometry | null | undefined): ZoneName {
  if (!geometry) return ZONE_OF[role];
  return ZONE_FALLBACK[role].find((n) => geometry.zones.some((z) => z.name === n)) ?? ZONE_OF[role];
}

/** Scale relative to the smallest text. Wider spread where density is lower. */
function scaleFor(role: TextRole, density: string): number {
  const sparse = /one idea|single|only|room/i.test(density);
  const base: Record<TextRole, number> = { headline: sparse ? 3.2 : 2.4, subheadline: 1.6, cta: 1.3, body: 1 };
  return base[role];
}

export function buildTypographySystem(input: TypographyInput): TypographySystem {
  if (input.lines) return buildFromLines(input);
  const b = input.blueprint || null;
  const density = clean(input.assetContext?.information_density);
  const personality = readPersonality(b, input.productMeaning || null, input.marketingInsight || null);
  const letterforms = LETTERFORMS[(personality?.value as TypographyPersonality) || "direct"];

  const roles = (input.copyRoles || []).map((r) => clean(r).toUpperCase()).filter(Boolean);
  const seen = new Set<TextRole>();
  const specs: TextSpec[] = [];

  for (const raw of roles) {
    const role = ROLE_OF[raw];
    if (!role || seen.has(role)) continue;
    seen.add(role);
    const zone = input.geometry?.zones.find((z) => z.name === ZONE_OF[role]);
    specs.push({
      role,
      zone: ZONE_OF[role],
      scale: scaleFor(role, density),
      weight: letterforms.weight,
      tracking: letterforms.tracking,
      alignment: input.geometry?.ratio === "16:9" ? "left" : "centre",
      purpose:
        role === "headline"
          ? "Read first and carry the message on its own."
          : role === "cta"
            ? "Close the reading path and name the action."
            : role === "subheadline"
              ? "Complete the headline without competing with it."
              : "Supply the detail the headline left out.",
      because:
        zone?.because ||
        `placed by the layout for a ${clean(input.geometry?.ratio) || "square"} frame`,
    });
  }

  // ── attention order ────────────────────────────────────────────────────
  const ORDER: TextRole[] = ["headline", "subheadline", "body", "cta"];
  const attention_order = ORDER.filter((r) => seen.has(r)).map((role, i) => ({
    position: i + 1,
    role,
    what_it_does:
      role === "headline"
        ? "seen first"
        : role === "cta"
          ? "acted on"
          : role === "subheadline"
            ? "understood second"
            : "remembered",
  }));

  // ── validation ─────────────────────────────────────────────────────────
  const issues: string[] = [];
  const scales = specs.map((s) => s.scale);
  const spread = scales.length > 1 ? Math.max(...scales) / Math.min(...scales) : 1;
  const hierarchy_clarity = round(Math.max(1, Math.min(10, spread * 3)));
  if (spread < 1.5 && scales.length > 1) issues.push("Sizes are too close: nothing clearly leads.");

  const readability = specs.length && specs.length <= 4 ? 9 : specs.length > 4 ? 5 : 1;
  if (specs.length > 4) issues.push(`${specs.length} text roles in one frame is more than a viewer will read.`);
  if (!specs.length) issues.push("No text roles resolved: typography cannot be executed.");

  const premium_feeling = round(
    personality ? (["quiet", "editorial"].includes(personality.value) ? 9 : 6) : 3
  );
  if (!personality) issues.push("No typographic personality was decided; the renderer picks one.");

  const brand_fit = personality
    ? personality.derived_from === "product_truth" || personality.derived_from === "user"
      ? 10
      : 7
    : 2;

  const balanceScore = input.geometry?.score.balance ?? 5;
  const visual_balance = round(balanceScore);

  const overall = round(
    (hierarchy_clarity + readability + premium_feeling + brand_fit + visual_balance) / 5
  );

  return {
    personality,
    attention_order,
    specs,
    validation: { hierarchy_clarity, readability, premium_feeling, brand_fit, visual_balance, overall, issues },
  };
}

/**
 * Phase 5.2. One spec per client line, carrying the line verbatim.
 *
 * Everything the AI decides is here -- class, pairing, scale, weight, spacing,
 * alignment, colour, contrast, treatment -- and nothing it may not: the text is
 * copied in, never produced. No lines, no specs: the image carries no text.
 */
function buildFromLines(input: TypographyInput): TypographySystem {
  const b = input.blueprint || null;
  const kit = input.brandKit || null;
  const lines = (input.lines || []).filter((l) => l && typeof l.text === "string" && l.text.trim());
  const personality = readPersonality(b, input.productMeaning || null, input.marketingInsight || null);
  const pv = (personality?.value as TypographyPersonality) || "direct";
  const letterforms = LETTERFORMS[pv];
  const density = clean(input.assetContext?.information_density);

  if (!lines.length) {
    return {
      personality,
      attention_order: [],
      specs: [],
      pairing: null,
      disabled: true,
      readability_rules: [],
      validation: {
        hierarchy_clarity: 10, readability: 10, premium_feeling: personality ? 7 : 5, brand_fit: 10, visual_balance: round(input.geometry?.score.balance ?? 5), overall: 8,
        issues: [],
      },
    };
  }

  const preferred = classFromPreference(kit?.style.typography_preference);
  const base = CLASSES[pv];
  const pairing: FontPairing = {
    heading_class: kit?.fonts.heading ? preferred || base.heading : preferred || base.heading,
    body_class: base.body,
    heading_font: kit?.fonts.heading || null,
    body_font: kit?.fonts.body || kit?.fonts.heading || null,
    because: kit?.fonts.heading || kit?.fonts.body
      ? `the brand kit names its fonts${kit?.style.typography_preference ? ` and asks for ${kit.style.typography_preference}` : ""}; ${base.because}`
      : preferred
        ? `the brand asks for ${kit?.style.typography_preference}; ${base.because}`
        : base.because,
  };

  const textColor = colorFor(kit, "text", "primary");
  const plate = colorFor(kit, "accent", "primary");
  const plateText = plate ? colorFor(kit, "background") && contrastRatio(colorFor(kit, "background")!, plate) >= 4.5 ? colorFor(kit, "background")! : readableOn(plate) : null;
  const wide = input.geometry?.ratio === "16:9";
  const align = input.geometry?.decisions?.alignment;
  const alignment: TextSpec["alignment"] = align === "left" ? "left" : align === "right" ? "right" : wide ? "left" : "centre";

  const specs: TextSpec[] = lines.map((line) => {
    const role = line.role;
    const zone = zoneFor(role, input.geometry);
    const z = input.geometry?.zones.find((g) => g.name === zone);
    const large = role === "headline" || role === "subheadline";
    const isCta = role === "cta";
    return {
      role,
      zone,
      scale: scaleFor(role, density),
      weight: isCta ? "solid and heavy enough to read as the action, whatever sits behind it" : letterforms.weight,
      tracking: isCta ? "slightly open, so a short line still reads at a glance" : letterforms.tracking,
      alignment,
      purpose:
        role === "headline"
          ? "Read first and carry the message on its own."
          : isCta
            ? "Close the reading path and name the action."
            : role === "subheadline"
              ? "Complete the headline without competing with it."
              : "Supply the detail the headline left out.",
      because: z?.because || `placed by the layout for a ${clean(input.geometry?.ratio) || "square"} frame`,
      text: line.text,
      font_class: role === "headline" ? pairing.heading_class : pairing.body_class,
      font_family: role === "headline" ? pairing.heading_font : pairing.body_font,
      line_height: LINE_HEIGHT[role],
      color: isCta ? plateText : textColor,
      contrast: isCta && plate
        ? { minimum: 4.5, against: `a solid ${plate} plate`, ratio: contrastRatio(plateText!, plate) }
        : { minimum: large ? 3 : 4.5, against: "the image directly behind it" },
      treatment: isCta
        ? plate
          ? `set on a solid ${plate} plate in ${plateText} -- the highest-contrast element in the frame`
          : "high contrast: light on a dark area or dark on a light one, or on a solid plate, never mid-tone on mid-tone"
        : role === "headline"
          ? "the largest and heaviest line; nothing else may compete with it for first read"
          : "clearly subordinate to the headline in size and weight",
    };
  });

  const ORDER: TextRole[] = ["headline", "subheadline", "body", "cta"];
  const present = new Set(specs.map((s) => s.role));
  const attention_order = ORDER.filter((r) => present.has(r)).map((role, i) => ({
    position: i + 1,
    role,
    what_it_does: role === "headline" ? "seen first" : role === "cta" ? "acted on" : role === "subheadline" ? "understood second" : "remembered",
  }));

  const readability_rules = [
    "every line reaches at least 4.5:1 contrast against what is directly behind it (3:1 for headline-size text)",
    "no line crosses the product or runs into the frame's safe margin",
    ...(lines.some((l) => VIETNAMESE.test(l.text)) ? ["the letterforms support full Vietnamese diacritics -- every accent and tone mark drawn, none dropped"] : []),
  ];

  const issues: string[] = [];
  const scales = specs.map((s) => s.scale);
  const spread = scales.length > 1 ? Math.max(...scales) / Math.min(...scales) : 1;
  const hierarchy_clarity = round(Math.max(1, Math.min(10, specs.length === 1 ? 8 : spread * 3)));
  if (spread < 1.5 && scales.length > 1) issues.push("Sizes are too close: nothing clearly leads.");
  const readability = specs.length <= 4 ? 9 : 5;
  if (specs.length > 4) issues.push(`${specs.length} lines in one frame is more than a viewer will read.`);
  if (!personality) issues.push("No typographic personality was decided; classes follow the plain default.");
  const premium_feeling = round(personality ? (["quiet", "editorial"].includes(personality.value) ? 9 : 6) : 4);
  const brand_fit = kit && (kit.fonts.heading || kit.fonts.body) ? 10 : personality ? 7 : 4;
  const visual_balance = round(input.geometry?.score.balance ?? 5);
  const overall = round((hierarchy_clarity + readability + premium_feeling + brand_fit + visual_balance) / 5);

  return {
    personality,
    attention_order,
    specs,
    pairing,
    disabled: false,
    readability_rules,
    validation: { hierarchy_clarity, readability, premium_feeling, brand_fit, visual_balance, overall, issues },
  };
}

/** Counts and roles only — never the client's copy. */
export function typographyTelemetry(t: TypographySystem | null | undefined) {
  if (!t) return { typography_system: false };
  return {
    typography_system: true,
    personality: t.personality?.value ?? null,
    personality_from: t.personality?.derived_from ?? null,
    roles: t.specs.map((s) => s.role),
    attention_order: t.attention_order.map((a) => a.role),
    score: t.validation.overall,
    issues: t.validation.issues.length,
  };
}

/** The spec as the prompt carries it. */
export function renderTypography(t: TypographySystem | null | undefined): string | undefined {
  if (!t?.specs.length) return undefined;
  // Phase 5.2: specs built from the client's lines carry the text itself.
  if (t.specs.some((s) => s.text)) return renderLineTypography(t);
  const lines = ["TYPOGRAPHY — how the words behave. No typeface is named; these describe what the letterforms must do."];
  if (t.personality) lines.push(`- personality: ${t.personality.value} — ${t.personality.because}`);
  for (const s of t.specs) {
    lines.push(
      `- ${s.role}: ${s.scale}× the smallest text, ${s.alignment}-aligned in the ${s.zone} zone. ${s.purpose}`,
      `    strokes: ${s.weight}`,
      `    spacing: ${s.tracking}`
    );
  }
  if (t.attention_order.length) {
    lines.push(`- read in this order: ${t.attention_order.map((a) => `${a.role} (${a.what_it_does})`).join(" → ")}`);
  }
  return lines.join("\n");
}


/**
 * The line-by-line typography, as the render prompt carries it.
 *
 * THE WORDS ARE NOT REPEATED HERE.
 *
 * They used to be. Measured on a three-line brief, each of the client's lines
 * reached the image model three separate times in one prompt: once in the
 * compiler's TYPOGRAPHY & READABLE COPY section, once in this block, and once
 * in the TEXT IN THE IMAGE directive appended last. Three blocks, three
 * different wordings, each independently telling a renderer to set type -- and
 * a renderer given the same string in three instructions has been given a
 * reason to draw it more than once. That is the duplicated-text defect, and
 * this is where it was cheapest to remove.
 *
 * So each line is named by its ROLE and by its NUMBER in the text directive's
 * own list, which is the single authoritative statement of what the words are.
 * Everything this block decides -- class, size, spacing, colour, treatment --
 * is unchanged and still transmitted. Only the duplicate copy is gone.
 */
function renderLineTypography(t: TypographySystem): string {
  const out = [
    "TYPOGRAPHY — how each supplied line is SET. The lines themselves are listed once, in TEXT IN THE IMAGE below; this block never repeats them and adds none.",
  ];
  if (t.pairing) {
    const heading = t.pairing.heading_font ? `${t.pairing.heading_font} (${t.pairing.heading_class})` : t.pairing.heading_class;
    const body = t.pairing.body_font ? `${t.pairing.body_font} (${t.pairing.body_class})` : t.pairing.body_class;
    out.push(`- pairing: ${heading} for the headline, ${body} for the rest — ${t.pairing.because}`);
  }
  t.specs.forEach((s, i) => {
    out.push(
      `- ${s.role} (line ${i + 1} of the text list): ${s.font_family ? `${s.font_family}, ` : ""}${s.font_class}, ${s.scale}× the smallest text, line height ${s.line_height}, ${s.alignment}-aligned in the ${s.zone} zone${s.color ? `, colour ${s.color}` : ""}.`,
      `    ${s.treatment}`,
      `    strokes: ${s.weight}; spacing: ${s.tracking}`,
    );
  });
  out.push(
    "- set each listed line exactly once. One line of copy is one block of type: never repeat it elsewhere in the frame, never echo it at another size, and never add a second version of it.",
  );
  if (t.attention_order.length) out.push(`- read in this order: ${t.attention_order.map((a) => a.role).join(" → ")}`);
  for (const r of t.readability_rules || []) out.push(`- ${r}`);
  return out.join("\n");
}
