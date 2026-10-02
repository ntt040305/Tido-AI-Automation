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
 *   2. RATIO  the frame the user chose, stated in the prompt. The provider is told
 *             separately, and a prompt that describes a different shape fights it.
 *   3. SHAPE  length, and the forbidden vocabulary. Scanned AFTER quoted strings are
 *             removed, because the client's own words are not the engine's prose.
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
  /** Word bounds for the prompt. */
  minWords?: number;
  maxWords?: number;
  /** The provider's hard character ceiling. */
  maxChars?: number;
}

const DEFAULT_MIN_WORDS = 200;
const DEFAULT_MAX_WORDS = 500;

/**
 * Words that grade a picture instead of describing one.
 *
 * Also written into the meta-prompt, from one place: `FORBIDDEN_WORDS` is a slot, so
 * the model is told exactly what the check will reject. A rule the model cannot see
 * is a trap rather than a specification.
 */
export const FORBIDDEN_WORDS = [
  "premium",
  "luxury",
  "luxurious",
  "cinematic",
  "stunning",
  "beautiful",
  "gorgeous",
  "exquisite",
  "breathtaking",
  "eye-catching",
  "high-end",
  "world-class",
  "striking",
  "sophisticated",
];

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
  const minWords = opts.minWords ?? DEFAULT_MIN_WORDS;
  const maxWords = opts.maxWords ?? DEFAULT_MAX_WORDS;
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

  // ── 2. the ratio ────────────────────────────────────────────────────────
  if (!text.includes(opts.aspectRatio)) {
    failures.push({
      code: "ratio",
      message: `the prompt must state the frame the user chose; end it with "${RATIO_SENTENCE[opts.aspectRatio]}"`,
    });
  }
  for (const other of Object.keys(RATIO_SENTENCE) as AspectRatio[]) {
    if (other !== opts.aspectRatio && text.includes(other)) {
      failures.push({ code: "ratio", message: `the prompt mentions ${other} but the user chose ${opts.aspectRatio}` });
    }
  }

  // ── 3. the shape ────────────────────────────────────────────────────────
  const scan = scannable(text, final, opts.aspectRatio);
  if (words < minWords || words > maxWords) {
    failures.push({ code: "shape", message: `the prompt is ${words} words; it must be between ${minWords} and ${maxWords}` });
  }
  if (text.length > maxChars) {
    failures.push({ code: "shape", message: `the prompt is ${text.length} characters, over the provider's ceiling of ${maxChars}` });
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
