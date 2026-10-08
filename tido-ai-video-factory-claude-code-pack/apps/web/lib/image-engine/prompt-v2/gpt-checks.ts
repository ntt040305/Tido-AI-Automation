/**
 * The deterministic checks on a Sunburst master prompt.
 *
 * WHY A SEPARATE SET
 * ------------------
 * The Gemini checks (`checks.ts`) enforce a different contract and must keep enforcing
 * exactly it, because that is the rollback. In particular `02-plan.md` K12 records a
 * collision: the Gemini `ratio` check wants the ratio digits at the end of the prompt,
 * and this dialect **bans ratio digits entirely** — the ratio travels as a provider
 * parameter and the prompt states orientation in words. One file cannot hold both rules.
 *
 * WHAT THESE REFUSE
 * -----------------
 * Only things that are decidable by reading the text. No judgement about whether the
 * prompt is any good: that is the director's job and a check that guesses at quality
 * fails the wrong prompts.
 *
 * Pure. No I/O, no model call.
 */
import { MASTER_SECTIONS, ORIENTATION } from "./gpt-brief";
import type { NumericWordsDensity } from "./engine-selector";
import type { ArtDirectionSheet } from "./art-direction/art-direction-sheet";
import { printRuleBranchesIn, type PrintRuleBranch } from "./art-direction/print-rule";

export type GptCheckCode =
  | "SECTIONS_MISSING"
  | "SECTIONS_OUT_OF_ORDER"
  | "COPY_MISSING"
  | "COPY_NOT_VERBATIM"
  | "COPY_REPEATED"
  | "COPY_OUTSIDE_TEXT"
  | "UNAUTHORIZED_QUOTE"
  | "REFERENCE_COUNT"
  | "REFERENCE_NUMBER_UNKNOWN"
  | "PHYSICAL_NUMBER"
  | "UNFILLED_SLOT"
  | "LEDGER_TOKEN"
  | "LENGTH"
  | "ORIENTATION_MISMATCH"
  | "NO_TEXT_NOT_DECLARED"
  | "LABEL_LOCK_ON_SMALL_PANEL"
  | "VERDICT_WORD"
  // ── The art-director rule set. Dormant unless a sheet is supplied ──────
  | "UNRESOLVED_AUTO"
  | "QUOTE_OUTSIDE_MANIFEST"
  | "PRINT_RULE_BRANCHES"
  | "PERCENT_WORDS_OUTSIDE_LAYOUT"
  | "TYPE_FAMILIES"
  | "TEXT_BELOW_SIZE_FLOOR"
  | "TEXT_ZONE_OVERLAPS_HERO"
  | "BACKGROUND_EQUALS_PRODUCT"
  | "RAW_IDENTIFIER";

export interface GptCheckFailure {
  code: GptCheckCode;
  /** One sentence, written so it can be handed straight back to the model. */
  message: string;
}

export interface GptCheckResult {
  ok: boolean;
  failures: GptCheckFailure[];
  stats: { chars: number; quoted: number; sections: number };
}

export interface GptCheckOptions {
  /** The client's strings, NFC, in order. Empty means the prompt must declare no text. */
  copy: string[];
  /** How many images the provider will actually receive. */
  referenceCount: number;
  aspectRatio: string;
  minChars?: number;
  maxChars?: number;
  /** Panels the brief declared too small to label-lock. */
  unsafePanels?: { slot: number; label: string }[];
  /**
   * Refuse verdict words ("stunning", "beautiful") in the prompt.
   *
   * OFF by default and deliberately so: it is a taste rule, not a correctness rule, and a
   * check that fails a prompt for enthusiasm costs a repair call for nothing.
   */
  banVerdictWords?: boolean;

  /**
   * The Art Direction Sheet this prompt was written from. Supplying it turns on the
   * second rule set and nothing else.
   *
   * Passed as the whole sheet rather than as a handful of scalars because the sheet IS the
   * specification the prompt is being checked against — a check that reads a copy of two
   * of its fields is a check that can disagree with it.
   *
   * Absent means the art-director path is off, and then this file behaves exactly as it
   * did before: the nine original checks, the same codes, the same messages. That is what
   * makes `GPT_ART_DIRECTOR` a rollback rather than a migration.
   */
  sheet?: ArtDirectionSheet | null;
  /** Which density the brief was written in. Decides whether percentage WORDS are legal. */
  density?: NumericWordsDensity;
  /** The one print-rule branch the brief selected. Any other count is the defect. */
  printRuleBranch?: PrintRuleBranch;
}

const nfc = (s: unknown): string => String(s ?? "").normalize("NFC");

/**
 * Physical numbers, each branch carrying its own boundaries.
 *
 * Written this way after measuring the opposite: a single `\b` closing a whole
 * alternation can never match a token that ends in a non-ASCII character, and
 * `/(?:ISO\s?\d+|...)\b/` silently failed on "ISO 400". Every branch is self-contained.
 */
const PHYSICAL = new RegExp(
  [
    "\\b\\d+\\s?K\\b", // 5600K
    "\\bf\\s?/\\s?\\d", // f/1.8
    "\\bf\\d+(?:\\.\\d+)?\\b", // f1.8
    "\\b\\d+(?:\\.\\d+)?\\s?mm\\b", // 85mm
    "\\b\\d+\\s?:\\s?\\d+\\b", // 9:16
    "\\d+(?:\\.\\d+)?\\s?%", // 60%
    "\\b\\d+(?:\\.\\d+)?\\s?stops?\\b", // two stops / 2 stops
    "\\b(?:one|two|three|four|five)\\s+stops?\\b",
    "\\bISO\\s?\\d+\\b",
    "\\b\\d+\\s?(?:kelvin|nits|lux)\\b",
  ].join("|"),
  "i",
);

const VERDICT_WORDS = /\b(stunning|beautiful|gorgeous|breathtaking|amazing|perfect|exquisite)\b/i;

/**
 * Words that say a decision was NOT made.
 *
 * The art-director contract is that every decision is resolved before the prompt is
 * written, so one of these in the finished text means a slot leaked through unresolved —
 * "lighting: auto" or "a tasteful arrangement" is the renderer being handed the choice
 * the sheet was built to make.
 *
 * `appropriate` is deliberately included and `appropriately` is deliberately not: the
 * adverb usually modifies a real instruction ("scaled appropriately to the cup"), while
 * the adjective almost always replaces one.
 */
const AUTO_WORDS = /\b(?:auto|AI\s+decides|suitable|tasteful|appropriate|as\s+needed|as\s+you\s+see\s+fit)\b/i;

/** A spelled-out percentage: "about thirty percent", "seven percent". */
const PERCENT_WORDS = /\b[a-z]+(?:-[a-z]+)?\s+percent\b/i;

/**
 * A raw snake_case identifier, such as `coffee_tea`.
 *
 * The measured leak: a live OUTPUT line read "for the coffee and tea brand Florian,
 * coffee_tea". A database enum reached the image model as a word to interpret.
 */
const RAW_IDENTIFIER = /\b[a-z]{2,}_[a-z]{2,}\b/;

/** The sections in which a spelled-out percentage is permitted. D1. */
const LAYOUT_SECTIONS = ["SUBJECT ARRANGEMENT:", "COMPOSITION & LAYOUT:", "TEXT:"] as const;

/** Every double-quoted run in the text. Straight quotes only — the contract says so. */
export function quoted(prompt: string): string[] {
  return [...String(prompt || "").matchAll(/"([^"\n]*)"/g)].map((m) => m[1]);
}

/** The TEXT section's body, or "" when the heading is absent. */
export function textSection(prompt: string): string {
  const start = prompt.indexOf("TEXT:");
  if (start < 0) return "";
  const after = prompt.slice(start + "TEXT:".length);
  const end = after.indexOf("CONSTRAINTS:");
  return end < 0 ? after : after.slice(0, end);
}

/**
 * One named section's body, bounded by whichever heading comes next.
 *
 * Bounded by the NEXT heading in `MASTER_SECTIONS` order rather than by a fixed successor,
 * so a prompt that omits a heading still yields a correct body for the ones it has. The
 * alternative — hard-coding each section's successor, which is what `textSection` does for
 * the one case that predates this — would read the whole rest of the prompt as the body of
 * any section whose successor went missing.
 */
export function sectionBody(prompt: string, heading: string): string {
  const text = String(prompt || "");
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const from = start + heading.length;
  let end = text.length;
  for (const other of MASTER_SECTIONS) {
    if (other === heading) continue;
    const at = text.indexOf(other, from);
    if (at >= 0 && at < end) end = at;
  }
  return text.slice(from, end);
}

/** Quotes stripped, so a scan for numbers never reads the client's own copy. */
function withoutQuotes(prompt: string): string {
  return String(prompt || "").replace(/"[^"\n]*"/g, " ");
}

function canonical(s: string): string {
  return nfc(s).replace(/\s+/g, " ").trim();
}

export function runGptChecks(prompt: string, opts: GptCheckOptions): GptCheckResult {
  const text = nfc(prompt || "");
  const failures: GptCheckFailure[] = [];
  const copy = opts.copy.map(nfc).filter((c) => c.trim());
  const minChars = opts.minChars ?? 1200;
  const maxChars = opts.maxChars ?? 3500;

  // ── 1. The nine sections, present and in order ──────────────────────────
  const positions: number[] = [];
  const missing: string[] = [];
  for (const heading of MASTER_SECTIONS) {
    const at = text.indexOf(heading);
    if (at < 0) missing.push(heading);
    else positions.push(at);
  }
  if (missing.length) {
    failures.push({
      code: "SECTIONS_MISSING",
      message: `these required headings are missing, spelled exactly as given: ${missing.join(", ")}`,
    });
  } else {
    const ordered = positions.every((p, i) => i === 0 || p > positions[i - 1]);
    if (!ordered) {
      failures.push({
        code: "SECTIONS_OUT_OF_ORDER",
        message: `the nine sections must appear in this order: ${MASTER_SECTIONS.join(" ")}`,
      });
    }
  }

  // ── 2. The copy: verbatim, once, inside TEXT ────────────────────────────
  const inText = textSection(text);
  const allQuotes = quoted(text).map(canonical).filter(Boolean);

  if (copy.length === 0) {
    // No copy means the prompt must SAY so. An empty TEXT section leaves the renderer to
    // decide, and it decides to write something.
    const declared = /no text of any kind anywhere in the image/i.test(inText);
    if (!declared) {
      failures.push({
        code: "NO_TEXT_NOT_DECLARED",
        message:
          'there is no copy, so the TEXT section must be exactly: "No text of any kind anywhere in the image."',
      });
    }
    if (allQuotes.length > 0) {
      failures.push({
        code: "UNAUTHORIZED_QUOTE",
        message: `there is no copy, so nothing may be quoted, but the prompt quotes: ${allQuotes
          .slice(0, 4)
          .map((q) => `"${q}"`)
          .join(", ")}`,
      });
    }
  } else {
    const quotesInText = quoted(inText).map(canonical).filter(Boolean);
    for (const line of copy) {
      const want = canonical(line);
      const occurrences = allQuotes.filter((q) => q === want).length;
      if (occurrences === 0) {
        // Present but altered is a different, more useful complaint than absent.
        const loose = allQuotes.find((q) => q.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === want.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
        if (loose) {
          failures.push({
            code: "COPY_NOT_VERBATIM",
            message: `the string "${line}" was altered to "${loose}". Reproduce it character for character, with every diacritic.`,
          });
        } else {
          failures.push({
            code: "COPY_MISSING",
            message: `the string "${line}" must appear in the TEXT section, in straight double quotes, exactly as given`,
          });
        }
      } else if (occurrences > 1) {
        failures.push({
          code: "COPY_REPEATED",
          message: `the string "${line}" appears ${occurrences} times. Each string is set exactly once in the whole prompt.`,
        });
      } else if (!quotesInText.includes(want)) {
        failures.push({
          code: "COPY_OUTSIDE_TEXT",
          message: `the string "${line}" is quoted outside the TEXT section. Every drawn string belongs in TEXT.`,
        });
      }
    }

    // Anything quoted that the client did not supply is invented copy.
    const authorized = new Set(copy.map(canonical));
    for (const q of allQuotes) {
      if (!authorized.has(q)) {
        failures.push({
          code: "UNAUTHORIZED_QUOTE",
          message: `"${q}" is quoted but is not one of the client's strings. Quote only the supplied copy.`,
        });
        break;
      }
    }
  }

  // ── 3. References: the numbers named match the images attached ──────────
  const named = new Set<number>();
  for (const m of text.matchAll(/\bImage\s+(\d+)\b/gi)) named.add(Number(m[1]));
  const expected = Math.max(0, Math.floor(opts.referenceCount));
  for (const n of named) {
    if (n < 1 || n > expected) {
      failures.push({
        code: "REFERENCE_NUMBER_UNKNOWN",
        message: `the prompt names "Image ${n}" but only ${expected} image(s) are attached. Name Image 1..${expected} and nothing else.`,
      });
      break;
    }
  }
  if (expected > 0 && named.size < expected) {
    const absent = [];
    for (let i = 1; i <= expected; i++) if (!named.has(i)) absent.push(i);
    failures.push({
      code: "REFERENCE_COUNT",
      message: `${expected} image(s) are attached but the prompt never names Image ${absent.join(", ")}. Every attached image must be assigned a role by number.`,
    });
  }

  // ── 4. No physical numbers, scanned AFTER removing the client's copy ───
  const scan = withoutQuotes(text);
  const hit = PHYSICAL.exec(scan);
  if (hit) {
    failures.push({
      code: "PHYSICAL_NUMBER",
      message: `"${hit[0]}" is a physical measurement. Describe the visible effect in words instead: no Kelvin, f-numbers, millimetres, ratios, percentages or stops.`,
    });
  }

  // ── 5. Nothing left unfilled, no internal token leaked ─────────────────
  if (/\{\{[^}]*\}\}/.test(text)) {
    failures.push({ code: "UNFILLED_SLOT", message: "the prompt still contains an unfilled {{SLOT}}" });
  }
  if (/\[B\d+\]|\[\s*LEDGER|\[\s*SLOT/i.test(text)) {
    failures.push({ code: "LEDGER_TOKEN", message: "the prompt contains an internal token such as [B1]; write plain prose" });
  }

  // ── 6. Length ──────────────────────────────────────────────────────────
  if (text.length < minChars || text.length > maxChars) {
    failures.push({
      code: "LENGTH",
      message: `the prompt is ${text.length} characters; it must be between ${minChars} and ${maxChars}`,
    });
  }

  // ── 7. The orientation word matches the canvas ──────────────────────────
  const want = ORIENTATION[String(opts.aspectRatio).trim()];
  if (want) {
    const others = Object.values(ORIENTATION).filter((o) => o !== want);
    const saysRight = new RegExp(`\\b${want}\\b`, "i").test(text);
    const saysWrong = others.find((o) => new RegExp(`\\b${o}\\b`, "i").test(text));
    if (!saysRight) {
      failures.push({
        code: "ORIENTATION_MISMATCH",
        message: `the canvas is ${want}, so the OUTPUT section must say "${want}"`,
      });
    } else if (saysWrong) {
      failures.push({
        code: "ORIENTATION_MISMATCH",
        message: `the canvas is ${want} but the prompt also says "${saysWrong}". State one orientation.`,
      });
    }
  }

  // ── 8. No label-locking a panel that is too small to read ──────────────
  //
  // The measured fact this exists for: at five products or more every panel is under
  // Sunburst's 512px floor, and a prompt that confidently says "reproduce the lettering
  // from panel C" at 496px is asking for invented letters on a real product.
  for (const panel of opts.unsafePanels || []) {
    const pattern = new RegExp(
      `panel\\s+${panel.label}\\b[^.]{0,160}?\\b(letter|lettering|text|wording|label text|type)\\b`,
      "i",
    );
    const reverse = new RegExp(
      `\\b(letter|lettering|wording|label text)\\b[^.]{0,160}?panel\\s+${panel.label}\\b`,
      "i",
    );
    if (pattern.test(text) || reverse.test(text)) {
      failures.push({
        code: "LABEL_LOCK_ON_SMALL_PANEL",
        message:
          `panel ${panel.label} on Image ${panel.slot} is below the size at which lettering can be ` +
          `trusted, so the prompt must not ask for its lettering to be reproduced. Take shape, ` +
          `proportions, colours and materials from the panel and the wording from the product facts.`,
      });
      break;
    }
  }

  // ── 9. Verdict words, off by default ───────────────────────────────────
  if (opts.banVerdictWords) {
    const verdict = VERDICT_WORDS.exec(scan);
    if (verdict) {
      failures.push({
        code: "VERDICT_WORD",
        message: `"${verdict[0]}" is a verdict, not a description. Say what is visible instead.`,
      });
    }
  }

  // ── 10. The art-director rule set ──────────────────────────────────────
  //
  // Everything below needs the sheet, so none of it can fire on a prompt written without
  // one. A check that refuses something the brief never asked for is a repair call with
  // extra steps, and the repair ladder is unchanged by this block: a failure here blocks
  // exactly as any other failure does, through the one existing repair call and then the
  // code-built fallback. No new call is added.
  if (opts.sheet) {
    failures.push(...artDirectorChecks(text, scan, allQuotes, opts, opts.sheet));
  }

  return {
    ok: failures.length === 0,
    failures,
    stats: { chars: text.length, quoted: allQuotes.length, sections: MASTER_SECTIONS.length - missing.length },
  };
}

/**
 * The second rule set. Only ever called with a sheet.
 *
 * Split into its own function rather than inlined for one reason: the nine original checks
 * must stay readable as the thing they are — the contract the rollback depends on — and a
 * reader comparing this file against the version before the art-director work should be
 * able to see at a glance that nothing above this line moved.
 */
function artDirectorChecks(
  text: string,
  scan: string,
  allQuotes: string[],
  opts: GptCheckOptions,
  sheet: ArtDirectionSheet,
): GptCheckFailure[] {
  const failures: GptCheckFailure[] = [];
  const density = opts.density ?? "words_only";

  // A decision that was never made. The whole point of the sheet is that there are none.
  const auto = AUTO_WORDS.exec(scan);
  if (auto) {
    failures.push({
      code: "UNRESOLVED_AUTO",
      message:
        `"${auto[0]}" leaves the decision to the renderer. Every decision is already made — ` +
        `write the decision itself, not the fact that one was needed.`,
    });
  }

  // A raw enum reaching the image as a word to interpret.
  const raw = RAW_IDENTIFIER.exec(scan);
  if (raw) {
    failures.push({
      code: "RAW_IDENTIFIER",
      message: `"${raw[0]}" is an internal identifier, not English. Write the phrase a person would say.`,
    });
  }

  // Every quoted string must be in the manifest, and the manifest IS the copy list — so
  // this is a second, independent statement of the same contract from the sheet's side.
  // Kept because the two can disagree: a manifest built from a copy list the caller
  // shortened is exactly the defect that let a client's words be silently cut once before.
  const manifest = new Set(sheet.text_manifest.map((m) => canonical(m.exact_string)));
  for (const q of allQuotes) {
    if (!manifest.has(q)) {
      failures.push({
        code: "QUOTE_OUTSIDE_MANIFEST",
        message: `"${q}" is set in the image but is not in the text manifest. Only manifest strings may be drawn.`,
      });
      break;
    }
  }

  // Exactly one print rule. Two is the live defect this whole branch exists to fix: a
  // prompt that said both "keep the branding as photographed" and "draw no brand mark"
  // handed the renderer a contradiction and let it pick.
  const branches = printRuleBranchesIn(text);
  if (branches.length !== 1) {
    failures.push({
      code: "PRINT_RULE_BRANCHES",
      message:
        branches.length === 0
          ? `the prompt states no rule about printed branding. It must carry exactly the one supplied${opts.printRuleBranch ? ` (${opts.printRuleBranch})` : ""}.`
          : `the prompt states ${branches.length} different rules about branding (${branches.join(", ")}). State exactly one.`,
    });
  } else if (opts.printRuleBranch && branches[0] !== opts.printRuleBranch) {
    failures.push({
      code: "PRINT_RULE_BRANCHES",
      message: `the prompt states the "${branches[0]}" branding rule, but this job's rule is "${opts.printRuleBranch}". Carry the supplied sentence through.`,
    });
  }

  // D1: spelled-out percentages are a layout device. In a lighting or colour sentence they
  // are a parameter dump that happens to be spelled out.
  const allowed = new Set<string>(LAYOUT_SECTIONS);
  for (const heading of MASTER_SECTIONS) {
    if (allowed.has(heading)) continue;
    const body = withoutQuotes(sectionBody(text, heading));
    const hit = PERCENT_WORDS.exec(body);
    if (hit) {
      failures.push({
        code: "PERCENT_WORDS_OUTSIDE_LAYOUT",
        message:
          `"${hit[0].trim()}" appears under ${heading} — a spelled-out percentage belongs only in ` +
          `${LAYOUT_SECTIONS.join(", ")}. Describe the visible effect here instead.`,
      });
      break;
    }
  }
  if (density === "words_only") {
    // The brief never spelled a percentage, so one in the prompt was invented by the
    // director rather than carried from the sheet.
    for (const heading of LAYOUT_SECTIONS) {
      const hit = PERCENT_WORDS.exec(withoutQuotes(sectionBody(text, heading)));
      if (hit) {
        failures.push({
          code: "PERCENT_WORDS_OUTSIDE_LAYOUT",
          message:
            `"${hit[0].trim()}" is a percentage, and this job is written in relative language only. ` +
            `Say it as a share — "about half the height", "the upper third".`,
        });
        break;
      }
    }
  }

  // More than two type families is the single most reliable way to make a layout look
  // amateur, and it is decidable: the sheet named the families it allows.
  const familyCap = Math.max(1, sheet.typography.families.length || 1);
  if (familyCap < 3) {
    const named = sheet.typography.families.filter((f) => f && text.toLowerCase().includes(f.toLowerCase()));
    if (sheet.typography.families.length > 2 || named.length > 2) {
      failures.push({
        code: "TYPE_FAMILIES",
        message: `the prompt asks for ${named.length} type families. Two is the maximum, and one is usually right.`,
      });
    }
  }

  // ── Sheet invariants ───────────────────────────────────────────────────
  //
  // These three are properties of the SHEET rather than of the prose, and they are checked
  // here rather than inside `buildArtDirectionSheet` on purpose: the sheet's job is to
  // derive, and a deriver that also audits itself will quietly correct its own bug instead
  // of reporting it. A failure here means a derivation rule is wrong, which is worth a
  // blocked render.
  const z = sheet.canvas_zones;
  const overlapsVertically =
    z.text.height_pct > 0 &&
    z.text.top_pct < z.subject.top_pct + z.subject.height_pct &&
    z.subject.top_pct < z.text.top_pct + z.text.height_pct;
  const overlapsHorizontally =
    z.text.width_pct > 0 &&
    z.text.left_pct < z.subject.left_pct + z.subject.width_pct &&
    z.subject.left_pct < z.text.left_pct + z.text.width_pct;
  if (overlapsVertically && overlapsHorizontally) {
    failures.push({
      code: "TEXT_ZONE_OVERLAPS_HERO",
      message:
        "the text zone overlaps the subject zone on both axes, so the copy would be set over the product. " +
        "The zones are derived together precisely so that cannot happen.",
    });
  }

  for (const entry of sheet.text_manifest) {
    if (entry.size_pct < sheet.typography.sizes_pct.small) {
      failures.push({
        code: "TEXT_BELOW_SIZE_FLOOR",
        message: `"${entry.exact_string}" is set below this channel's legibility floor and would not be readable.`,
      });
      break;
    }
  }

  const background = String(sheet.palette.sixty || "").trim().toLowerCase();
  const productColour = String(sheet.palette.product_dominant || "").trim().toLowerCase();
  if (productColour && background === productColour) {
    failures.push({
      code: "BACKGROUND_EQUALS_PRODUCT",
      message:
        `the field colour is ${sheet.palette.sixty}, which is the product's own dominant colour, so the product ` +
        `would not separate from the background. The field must differ from the product.`,
    });
  }

  return failures;
}

/** Counts and codes only. Never the prompt, never the client's copy. */
export function gptCheckTelemetry(r: GptCheckResult | null | undefined) {
  if (!r) return { gpt_checks: false };
  return {
    gpt_checks: true,
    ok: r.ok,
    failures: r.failures.map((f) => f.code),
    ...r.stats,
  };
}
