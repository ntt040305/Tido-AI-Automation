/**
 * Three checks, and only three.
 *
 * WHY ONLY THREE
 * --------------
 * The previous linter had eleven rules, each refusing something a prompt had once
 * done. Eleven rules is eleven things that can reject a good brief, and nine of them
 * were describing the SAME failure from different angles: a prompt written in
 * parameters rather than in pictures. These three are the ones whose failure cannot
 * be recovered downstream:
 *
 *   1. COPY   the client's words, intact and used once. Nothing downstream can fix
 *             a prompt that lost a string or asked for it twice.
 *   2. RATIO  the frame the user chose, stated at the END of the prompt. The provider
 *             is told separately, and a prompt that describes a different shape
 *             fights it.
 *   3. SHAPE  not empty, inside the provider's character ceiling, and free of the
 *             forbidden vocabulary — scanned AFTER quoted strings are removed,
 *             because the client's own words are not the engine's prose.
 *             There is deliberately NO WORD LIMIT: see the note at the check.
 *
 * Everything else -- placeholders, ellipses, impossible percentages -- was a symptom
 * of a template assembling text. A model writing prose does not produce them, and a
 * check for them is a rule nobody will ever hit.
 *
 * Pure. No model call, no I/O.
 */
import type { AspectRatio } from "./templates";
import { RATIO_SENTENCE } from "./templates";

export type CheckCode = "copy" | "ratio" | "shape";

export interface CheckFailure {
  code: CheckCode;
  /** One sentence, written so it can be handed straight back to the model. */
  message: string;
}

export interface CheckResult {
  ok: boolean;
  failures: CheckFailure[];
  stats: { words: number; chars: number; quoted: number };
}

export type CopyPolicy = "exact" | "adapt";

export interface CheckOptions {
  /** What the client typed, in order. */
  copyOriginal: string[];
  /** What the model says it used: the client's text, tiered. */
  copyFinal: string[];
  policy: CopyPolicy;
  aspectRatio: AspectRatio;
  /** The provider's hard character ceiling. */
  maxChars?: number;
  /**
   * Lettering the director may legitimately quote although the client never typed it:
   * what is printed on the product. Only when `V2_INCLUDE_LABEL_TEXT` is on.
   */
  labelText?: string[];
  /**
   * Whether a quoted string the client never wrote may be LABEL lettering.
   *
   * True when `V2_INCLUDE_LABEL_TEXT` is on, because `system.v1.md` then tells the
   * director to transcribe what is printed on the product -- so the prompt will legally
   * contain quoted words nobody typed into the brief, and nothing in this repo supplies
   * a list of them to compare against (`promptV2.labels` is empty on this path).
   *
   * With it on, an unlisted quote is a FAILURE only when nothing around it ties it to a
   * product surface. That keeps the case this check exists for -- an invented "MUA NGAY"
   * floating in the frame -- while not rejecting a transcribed label.
   */
  allowUnlistedLabelText?: boolean;
}


/**
 * Words that grade a picture instead of describing one.
 *
 * THIS LIST IS EXACTLY THE WORDS `system.v1.md` NAMES, and it is narrower than it was
 * on purpose. It used to hold fourteen -- gorgeous, exquisite, breathtaking,
 * eye-catching, high-end, world-class, striking, sophisticated -- while the director
 * was only ever shown five, which made nine of them traps: a reply rejected for a word
 * nobody asked it to avoid, costing a repair call and sometimes a fallback to v1.
 *
 * A check may only enforce what the instructions state. To forbid another word, add it
 * to the sentence in `system.v1.md` that lists the praise words AND add it here, in
 * that order. The test asserts the two lists agree in both directions, so forgetting
 * one half fails rather than drifting.
 *
 * KNOWN GAP: `luxurious` slips through, because the matcher is `\bluxury\b` and the
 * instructions name `luxury`. Closing it means adding the word to `system.v1.md`,
 * which is the author's file, so it is reported rather than assumed.
 */
export const FORBIDDEN_WORDS = ["premium", "luxury", "cinematic", "stunning", "beautiful"];

/**
 * Measurements the renderer does not act on. One pattern, not nine.
 *
 * Each branch carries its own boundaries. A single `\b` wrapped around the whole
 * alternation looks tidier and is wrong: `ISO\s?\d` followed by `\b` cannot match
 * "ISO 400", because the character after the matched `4` is another digit. That let
 * every three-digit ISO through until a test asked.
 */
const TECHNICAL = new RegExp(
  [
    "\\b\\d{3,5}\\s?K\\b", //              5600K
    "\\b\\d{2,3}\\s?mm\\b", //             85mm
    "\\bf\\/\\s?\\d", //                   f/2.8
    "\\bISO\\s?\\d", //                     ISO 400 — no trailing boundary
    "\\b\\d+(?:\\.\\d+)?\\s?%", //         12%, 0.15%
    "\\b\\d+\\s?\\/\\s?255\\b", //         18/255
    "\\b\\d+\\s?:\\s?\\d+\\b", //          3:1
    "\\b(?:\\d+(?:\\.\\d+)?|one|two|three|four|five|six|half)\\s+stops?\\b",
    "\\baperture\\b",
    "\\bfocal length\\b",
    "\\bshutter speed\\b",
    "\\bwhite balance\\b",
    "\\bcolou?r temperature\\b",
    "\\bkelvin\\b",
  ].join("|"),
  "i",
);

const nfc = (s: string) => String(s ?? "").normalize("NFC");
const squash = (s: string) => nfc(s).replace(/\s+/g, " ").trim();

/** The prompt with the client's words and the declared ratio taken out. */
function scannable(prompt: string, copy: string[], ratio: AspectRatio): string {
  let out = nfc(prompt)
    .replace(/"[^"\n]{1,400}"/g, " ")
    .replace(/“[^”\n]{1,400}”/g, " ");
  for (const c of copy) {
    const needle = nfc(c).trim();
    if (needle) out = out.split(needle).join(" ");
  }
  // The ratio is a number the prompt is REQUIRED to carry, and check 2 enforces it.
  return out.split(ratio).join(" ");
}

/**
 * The client's whole text, as one comparable string.
 *
 * Whitespace is squashed and the result NFC-normalised, so a tier break the director
 * chose, a line the client happened to wrap, and a decomposed Vietnamese vowel all
 * compare equal. Nothing else is touched: punctuation, capitalisation, numbers and
 * accents all have to survive.
 */
function canonical(parts: string[]): string {
  return squash(parts.join(" "));
}

/**
 * exact: the tiers, concatenated, ARE the client's text.
 *
 * Not "every string appears somewhere" -- that passed a reply which dropped a whole
 * sentence, because the sentences it kept were all present. Concatenation is the only
 * comparison that catches an omission, a reordering AND an addition at once.
 *
 * The director may cut WHERE it likes; a tier boundary is a layout decision. What it may
 * not do is change, drop or add a character.
 */
export function exactCopyFailures(original: string[], final: string[]): CheckFailure[] {
  const want = canonical(original);
  const got = canonical(final);
  if (want === got) return [];
  if (!want) return [];
  if (!got) {
    return [{ code: "copy", message: "copy_final is empty although the client supplied copy; under the exact policy every character has to be rendered" }];
  }
  // Say WHICH way it differs, because "they are not equal" is not actionable.
  const detail = got.length < want.length && want.includes(got)
    ? `the end was cut: the client's text continues "...${want.slice(got.length).trim().slice(0, 60)}"`
    : want.startsWith(got.slice(0, Math.min(got.length, 40)))
      ? `they diverge after "${got.slice(0, 40)}"`
      : `copy_final starts "${got.slice(0, 40)}" where the client's text starts "${want.slice(0, 40)}"`;
  return [
    {
      code: "copy",
      message:
        `the tiers in copy_final do not reproduce the client's text exactly. ${detail}. ` +
        "Under the exact policy the tiers joined together must equal the client's text character for character: " +
        "re-tier it if you like, but restore every word, number, accent and punctuation mark",
    },
  ];
}

/** Every double-quoted run in the prompt. Straight and curly quotes both. */
export function quotedStrings(prompt: string): string[] {
  const out: string[] = [];
  const re = /"([^"\n]{1,400})"|\u201c([^\u201d\n]{1,400})\u201d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(nfc(prompt)))) out.push((m[1] ?? m[2] ?? "").trim());
  return out;
}

/**
 * Does the sentence around this quote say it is printed on the product?
 *
 * The honest version of "is this label text". Nothing in the repo lists what a label
 * actually says, so the evidence available is what the prompt itself claims about the
 * words: a transcribed label is described as being ON something, an invented call to
 * action is described as being set in the frame. Checked within the sentence containing
 * the quote, so a product mentioned three paragraphs earlier does not excuse it.
 */
function readsAsLabel(prompt: string, quoted: string): boolean {
  const text = nfc(prompt);
  const at = text.indexOf(quoted);
  if (at < 0) return false;
  const from = Math.max(0, text.lastIndexOf(".", at) + 1);
  const dot = text.indexOf(".", at + quoted.length);
  const sentence = text.slice(from, dot < 0 ? text.length : dot + 1);
  return /\b(label|printed|packaging|bottle|cap|tube|jar|box|sachet|pouch|can|carton|attached photo|on the product)\b/i.test(
    sentence,
  );
}

/** Is `part` a contiguous slice of `whole`, comparing on squashed NFC? */
export function isSlice(part: string, whole: string): boolean {
  const a = squash(part);
  const b = squash(whole);
  return Boolean(a) && b.includes(a);
}

function isSliceOfAny(part: string, originals: string[]): boolean {
  // Against each line AND against the whole text, because a tier may legitimately span
  // a line break the client typed.
  return isSlice(part, canonical(originals)) || originals.some((o) => isSlice(part, o));
}

/**
 * Tokens that are facts rather than wording: digit runs, and ALL-CAPS or model-code
 * tokens like `K70`, `XXL`, `500`, `SKIN1004`.
 *
 * Under `adapt` the director may rewrite prose. It may not drop the price, the size or
 * the model number, and those are exactly what a summariser throws away first.
 */
export function lostTokens(original: string[], final: string[]): string[] {
  const got = canonical(final);
  const tokens = new Set<string>();
  for (const raw of canonical(original).split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const hasDigit = /\p{N}/u.test(raw);
    const allCaps = raw.length >= 2 && raw === raw.toUpperCase() && /\p{L}/u.test(raw);
    if (hasDigit || allCaps) tokens.add(raw);
  }
  return [...tokens].filter((t) => !got.includes(t));
}

export function checkPrompt(prompt: string, opts: CheckOptions): CheckResult {
  const text = nfc(prompt);
  const failures: CheckFailure[] = [];
  const maxChars = opts.maxChars ?? Number(process.env.PROMPT_HARD_MAXIMUM_CHARS || 32000);

  const words = squash(text).split(" ").filter(Boolean).length;
  const quoted = (text.match(/"[^"\n]{1,400}"/g) || []).length;

  // ── 1. the copy ─────────────────────────────────────────────────────────
  const original = opts.copyOriginal.map((c) => nfc(c).trim()).filter(Boolean);
  const final = opts.copyFinal.map((c) => nfc(c).trim()).filter(Boolean);

  if (opts.policy === "exact") {
    failures.push(...exactCopyFailures(original, final));
  } else {
    // adapt: wording may shorten, but nothing countable may vanish.
    if (!final.length && original.length) {
      failures.push({ code: "copy", message: "copy_final is empty although the client supplied copy" });
    }
    const lost = lostTokens(original, final);
    if (lost.length) {
      failures.push({
        code: "copy",
        message:
          `shortening dropped these, and they are facts rather than wording: ${lost.join(", ")}. ` +
          "Put every number, model name and capitalised token back; shorten the words around them instead",
      });
    }
  }

  // Every quoted string in the prompt must be the client's text or the product's own
  // lettering. This is the check that catches an invented "MUA NGAY": the director adds
  // a call to action nobody wrote, it reads as deliberate, and only a comparison against
  // the source catches it.
  for (const quoted of quotedStrings(text)) {
    if (!quoted) continue;
    if (isSliceOfAny(quoted, original)) continue;
    if (opts.policy === "adapt" && final.some((f) => squash(f) === squash(quoted))) continue;
    if ((opts.labelText || []).some((l) => isSlice(quoted, l) || isSlice(l, quoted))) continue;
    if (opts.allowUnlistedLabelText && readsAsLabel(text, quoted)) continue;
    failures.push({
      code: "copy",
      message: `the prompt asks for "${quoted.slice(0, 60)}" to be rendered, and the client never wrote it; remove it or replace it with the client's own words`,
    });
  }

  // Each tier is drawn once. Twice is two draw orders; never is a frame missing a line.
  for (const line of final) {
    const count = text.split(line).length - 1;
    if (count !== 1) {
      failures.push({
        code: "copy",
        message: `"${line.slice(0, 40)}${line.length > 40 ? "…" : ""}" appears ${count} time(s) in the prompt; it must appear exactly once`,
      });
    }
  }

  // ── 2. the ratio, and at the END ────────────────────────────────────────
  //
  // Position is part of the requirement, not pedantry. The ratio is the last thing
  // the renderer should read, and a prompt that mentions it in passing halfway
  // through has usually described a different shape around it.
  const tail = squash(text).slice(-120);
  if (!text.includes(opts.aspectRatio)) {
    failures.push({
      code: "ratio",
      message: `the prompt must state the frame the user chose; end it with "${RATIO_SENTENCE[opts.aspectRatio]}"`,
    });
  } else if (!tail.includes(opts.aspectRatio)) {
    failures.push({
      code: "ratio",
      message: `the prompt states ${opts.aspectRatio} but not at the end; the last sentence must be the frame, "${RATIO_SENTENCE[opts.aspectRatio]}"`,
    });
  }
  for (const other of Object.keys(RATIO_SENTENCE) as AspectRatio[]) {
    if (other !== opts.aspectRatio && text.includes(other)) {
      failures.push({ code: "ratio", message: `the prompt mentions ${other} but the user chose ${opts.aspectRatio}` });
    }
  }

  // ── 3. the shape ────────────────────────────────────────────────────────
  //
  // NO WORD LIMIT. There used to be a 200-500 word window, and it was a target
  // masquerading as a check: length is decided by the design. A poster with one
  // product and one line needs a few paragraphs; three products, a layered scene and
  // four strings need many, and truncating the second to satisfy a number throws away
  // decisions the renderer then makes for itself. The word count is still measured and
  // still reported -- it is a thing to watch, not a thing to fail.
  //
  // What remains is the pair of limits that are real: the prompt must say something,
  // and it must fit the provider.
  const scan = scannable(text, final, opts.aspectRatio);
  if (!squash(text)) {
    failures.push({ code: "shape", message: "the prompt is empty" });
  }
  if (text.length > maxChars) {
    failures.push({
      code: "shape",
      message: `the prompt is ${text.length} characters, over the provider's ceiling of ${maxChars}: condense it but keep every decision — drop no element, no position, no colour and no line of text`,
    });
  }
  const found = FORBIDDEN_WORDS.filter((w) => new RegExp(`\\b${w.replace("-", "[- ]?")}\\b`, "i").test(scan));
  if (found.length) {
    failures.push({
      code: "shape",
      message: `remove the words that grade the picture instead of describing it: ${found.join(", ")} — describe what would earn them`,
    });
  }
  const tech = TECHNICAL.exec(scan);
  if (tech) {
    failures.push({
      code: "shape",
      message: `remove the technical parameter "${squash(tech[0])}" and say what is seen instead`,
    });
  }

  return { ok: failures.length === 0, failures, stats: { words, chars: text.length, quoted } };
}

/** Counts and codes. Never the prompt, never the copy. */
export function checkTelemetry(r: CheckResult | null | undefined) {
  if (!r) return { checks: false };
  return {
    checks: true,
    ok: r.ok,
    words: r.stats.words,
    chars: r.stats.chars,
    codes: [...new Set(r.failures.map((f) => f.code))],
    failures: r.failures.length,
  };
}
