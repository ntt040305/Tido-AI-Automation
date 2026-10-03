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
  /** What the model says it used. Equal to the original under `exact`. */
  copyFinal: string[];
  policy: CopyPolicy;
  aspectRatio: AspectRatio;
  /** The provider's hard character ceiling. */
  maxChars?: number;
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
    const missing = original.filter((o) => !final.includes(o));
    const added = final.filter((f) => !original.includes(f));
    if (missing.length) {
      failures.push({
        code: "copy",
        message: `copy_final must repeat the client's strings character for character under the exact policy; these were changed or dropped: ${missing
          .map((m) => `"${m.slice(0, 40)}"`)
          .join(", ")}`,
      });
    }
    if (added.length) {
      failures.push({
        code: "copy",
        message: `copy_final contains strings the client did not write: ${added.map((a) => `"${a.slice(0, 40)}"`).join(", ")}`,
      });
    }
  }

  // Both policies: whatever copy_final ended up being, each string appears in the
  // prompt exactly once. Twice is two draw orders; never is a frame with no words.
  for (const line of final) {
    const count = text.split(line).length - 1;
    if (count !== 1) {
      failures.push({
        code: "copy",
        message: `"${line.slice(0, 40)}${line.length > 40 ? "…" : ""}" appears ${count} time(s) in the prompt; it must appear exactly once`,
      });
    }
  }
  if (opts.policy === "adapt" && !final.length && original.length) {
    failures.push({ code: "copy", message: "copy_final is empty although the client supplied copy" });
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
