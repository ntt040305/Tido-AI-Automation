import { CopyItemInput } from "../types";

export interface ExactCopyValidationResult {
  isValid: boolean;
  missingItems: string[];
}

export class ExactCopyIntegrityValidator {
  /**
   * Verifies that every supplied non-empty copy item appears exactly in the compiled prompt string.
   * Performs exact Unicode string matching without stripping diacritics or altering casing.
   */
  public static validate(
    copyItems: (CopyItemInput | string)[] | undefined,
    compiledPrompt: string
  ): ExactCopyValidationResult {
    if (!copyItems || copyItems.length === 0) {
      return { isValid: true, missingItems: [] };
    }

    const missingItems: string[] = [];

    for (const item of copyItems) {
      const rawText = typeof item === "string" ? item : item.text;
      if (!rawText || !rawText.trim()) continue;

      const trimmedText = rawText.trim();
      if (!compiledPrompt.includes(trimmedText)) {
        missingItems.push(trimmedText);
      }
    }

    return {
      isValid: missingItems.length === 0,
      missingItems,
    };
  }
}

// ── The text requirement ─────────────────────────────────────────────────────
//
// One explicit state for "what words may appear in this image", resolved once
// from what the person actually typed and read by every layer that could put
// words on the picture: the director, the blueprint, the prompt, and the vision
// review.
//
// Two modes and no third:
//
//   exact  The person supplied text. Those lines -- and only those lines -- may
//          appear, character for character. The AI decides how they LOOK: style,
//          size, placement, hierarchy, treatment. It never decides what they SAY.
//
//   none   The person supplied nothing. The image carries no generated text at
//          all: no headline, slogan, CTA, caption or decorative lettering. Words
//          physically printed on the uploaded product are part of the product,
//          not typography, and are reproduced as the reference shows them.
//
// What counts as supplied: the "Nội dung muốn xuất hiện trên ảnh" field
// (`contentMessage`, one line per string) and copy an API caller passed
// explicitly (`copyItems`). NOT text a model extracted from the concept: that is
// the model's reading of the brief, and reading it back as copy is exactly how
// the system came to write words the person never gave it.

export type TextMode = "exact" | "none";

export interface TextRequirement {
  mode: TextMode;
  /** The only strings that may appear, in the order given. Empty in "none". */
  lines: string[];
}

/** The typography answer for an image that carries no text. */
export const NO_TEXT_TYPOGRAPHY = "none — this image carries no text";

/** Resolves the requirement from the request. Lines are kept exactly as typed, trimmed at the ends. */
export function resolveTextRequirement(request: {
  contentMessage?: string | null;
  copyItems?: (CopyItemInput | string)[] | null;
}): TextRequirement {
  const lines: string[] = [];
  const add = (raw: unknown) => {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text && !lines.includes(text)) lines.push(text);
  };
  for (const line of String(request?.contentMessage || "").split(/\r?\n/)) add(line);
  for (const item of request?.copyItems || []) add(typeof item === "string" ? item : item?.text);
  return lines.length ? { mode: "exact", lines } : { mode: "none", lines: [] };
}

/**
 * The render prompt's last word on text. Appended at the END of the prompt,
 * because recency is how a renderer resolves two lines that conflict, and every
 * section before this one -- the director's, the blueprint's -- may mention
 * type.
 */
export function textDirective(req: TextRequirement): string {
  if (req.mode === "exact") {
    return [
      "TEXT IN THE IMAGE — use exactly the provided text.",
      "These lines, and only these, appear as text in the image. Reproduce each one character for character — spelling, capitalization, punctuation, numbers, accents and line content — and add no other words:",
      ...req.lines.map((l, i) => `  ${i + 1}. "${l}"`),
      "Each of those lines appears EXACTLY ONCE in the frame, as one block of type. Earlier sections of this prompt describe how the same lines are set and where they sit; they are describing these lines, not additional ones. Do not draw a line twice, do not echo it at a second size or in a second corner, and do not repeat it as a watermark, a caption or a label.",
      "Style, size, weight, placement, hierarchy and treatment are yours to decide. The words are not: do not rewrite, replace, shorten, summarize, translate or extend them, and do not add a headline, slogan, CTA, caption or decorative lettering of your own. Words already printed on the product stay exactly as the product reference shows them.",
    ].join("\n");
  }
  return [
    "TEXT IN THE IMAGE — none. Do not add any typography or text.",
    "Render no headline, slogan, tagline, CTA, price, caption, watermark, sign, poster, or decorative lettering anywhere in the frame. Earlier sections may describe composition and visual direction; none of them authorizes words. The only lettering allowed is what is physically printed on the uploaded product itself, reproduced exactly as the product reference shows it.",
  ].join("\n");
}

/**
 * Quoted strings in a piece of prose: "…", “…” and «…».
 *
 * Single quotes are deliberately not read: English prose is full of
 * apostrophes ("the product's surface … the brand's voice"), and treating the
 * span between two of them as quoted copy would strip good reasoning.
 */
export function quotedStrings(text: string): string[] {
  const out: string[] = [];
  const s = String(text || "");
  for (const m of s.matchAll(/"([^"\n]{1,160})"|“([^”\n]{1,160})”|«([^»\n]{1,160})»/g)) {
    const q = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (q) out.push(q);
  }
  return out;
}

/** Words that, in a director's prose, mean it is writing or adding on-image text. */
const TEXT_CREATION = /\b(headline|slogan|tagline|caption|call[- ]to[- ]action|CTA|lettering|wordmark|copy line|text reading|reads?\s*:|that reads|with the words?)\b/i;

/**
 * Text a director's prose introduces that the requirement does not authorize.
 *
 * exact: any quoted string that is not one of the provided lines.
 * none:  any quoted string, and any sentence that creates on-image text.
 */
export function unauthorizedText(fields: (string | null | undefined)[], req: TextRequirement): string[] {
  const found: string[] = [];
  for (const field of fields) {
    const s = String(field || "");
    if (!s) continue;
    for (const q of quotedStrings(s)) {
      if (req.mode === "none" || !req.lines.includes(q)) found.push(`"${q}"`);
    }
    if (req.mode === "none" && s !== NO_TEXT_TYPOGRAPHY) {
      for (const sentence of s.split(/(?<=[.;!?])\s+/)) {
        if (TEXT_CREATION.test(sentence)) found.push(sentence.trim().slice(0, 160));
      }
    }
  }
  return [...new Set(found)];
}

/**
 * The same prose with every unauthorized sentence removed. A sentence that
 * quotes invented copy, or (in "none") describes adding text, is dropped whole
 * rather than half-edited, so what remains still reads as the director wrote it.
 */
export function stripUnauthorizedText(text: string | null | undefined, req: TextRequirement): string {
  const s = String(text || "");
  if (!s) return s;
  const kept = s
    .split(/(?<=[.;!?])\s+/)
    .filter((sentence) => unauthorizedText([sentence], req).length === 0);
  return kept.join(" ").trim();
}

// ── Checking the rendered picture ────────────────────────────────────────────

/** What the vision model read in the render. */
export interface VisibleText {
  text: string;
  /** True when the words are printed on the product itself (its label, cap, packaging). */
  on_product?: boolean;
  /**
   * Phase 5.4. True when the words are part of the attached brand logo. The
   * logo is the client's own mark, supplied as an asset, not typography the
   * renderer generated -- so, like a product label, it is outside the check.
   */
  on_logo?: boolean;
}

export interface TextCheck {
  mode: TextMode;
  required: string[];
  /** Required lines that do not appear exactly. */
  missing: string[];
  /** Required lines that appear only with a spelling, accent, number or punctuation difference. */
  incorrect: { expected: string; rendered: string }[];
  /**
   * Required lines rendered with every character right but a different letter
   * case -- "Summer Sale 50%" set as "SUMMER SALE 50%". Case is a typographic
   * treatment (the text-transform a designer applies), which the requirement
   * leaves to the AI; the words are unchanged. Reported, not counted against
   * compliance. Any other difference is `incorrect`.
   */
  case_styled: { expected: string; rendered: string }[];
  /** Generated text that should not be there: extra words in "exact", any words in "none". */
  unwanted: string[];
  /** True when the render honours the requirement exactly. */
  compliant: boolean;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** Loose form, used only to recognise a misspelling of a line -- never to accept one. */
const loose = (s: string) =>
  squash(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, "");

/** Levenshtein distance. Short strings only -- one line of on-image text. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 40) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Compares what the vision model read against the requirement. Deterministic:
 * the verdict is not left to the model that reported what it saw.
 *
 * A required line counts as present only when it appears exactly, allowing only
 * for line breaks the layout introduced (the renderer may set "Summer Sale 50%"
 * across two lines). Text printed on the product is ignored in both modes: it
 * belongs to the product. So is the wordmark of an attached brand logo.
 */
export function checkRenderedText(visible: VisibleText[] | null | undefined, req: TextRequirement): TextCheck {
  const generated = (visible || []).filter((v) => v && squash(String(v.text || "")) && !v.on_product && !v.on_logo).map((v) => squash(v.text));
  const joined = squash(generated.join(" "));
  const missing: string[] = [];
  const incorrect: { expected: string; rendered: string }[] = [];
  const caseStyled: { expected: string; rendered: string }[] = [];
  // Letter case only; every accent, number and punctuation mark still counts.
  const caseless = (s: string) => squash(s).toLocaleLowerCase("vi");

  if (req.mode === "exact") {
    for (const line of req.lines) {
      if (joined.includes(squash(line))) continue;
      if (caseless(joined).includes(caseless(line))) {
        const shown = generated.filter((g) => caseless(line).includes(caseless(g))).join(" ");
        caseStyled.push({ expected: line, rendered: shown || joined });
        continue;
      }
      // A near miss -- a dropped accent, a changed number, a misspelled word --
      // is the required line rendered wrongly, not a missing line plus a stray
      // one. Near means within a fifth of the line's length in edits.
      const target = loose(line);
      const near =
        generated.find((g) => loose(g) && (loose(g) === target || loose(joined).includes(target))) ??
        generated.find((g) => loose(g) && editDistance(loose(g), target) <= Math.max(1, Math.floor(target.length / 5)));
      if (near) incorrect.push({ expected: line, rendered: near });
      else missing.push(line);
    }
  }

  const unwanted =
    req.mode === "none"
      ? generated
      : generated.filter((g) => {
          const lg = loose(g);
          // Part of a required line (split across lines by the layout), or a
          // misspelling already reported above, is not EXTRA text.
          return !req.lines.some((l) => caseless(l).includes(caseless(g)) || (lg && loose(l).includes(lg))) &&
            !incorrect.some((i) => i.rendered === g);
        });

  return {
    mode: req.mode,
    required: [...req.lines],
    missing,
    incorrect,
    case_styled: caseStyled,
    unwanted,
    compliant: missing.length === 0 && incorrect.length === 0 && unwanted.length === 0,
  };
}
