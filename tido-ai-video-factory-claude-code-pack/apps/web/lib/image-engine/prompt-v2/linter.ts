/**
 * The linter — the gate between the LLM and a paid render.
 *
 * WHY IT EXISTS
 * -------------
 * Everything it checks is something the audit found in a prompt that was actually
 * sent: `4/255`, `key:fill 4:1`, `haze 7%`, "fills about 3800% of the frame",
 * `BUSINESS GOAL: in beauty_skincare`, a field cut off with "…", a copy string
 * that appeared twice, 3,500 words where 400 were wanted. A model asked for prose
 * will reproduce the habits of the prompt it was trained beside unless something
 * refuses the result.
 *
 * ONE RULE ABOUT QUOTED TEXT
 * --------------------------
 * Everything inside double quotes is the CLIENT'S words -- copy, or lettering read
 * off a label -- and is exempt from every content check. "Giảm 20% — chỉ 14 ngày"
 * is a headline, not a technical parameter, and a linter that cannot tell the
 * difference would reject the brief for containing the brief.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not rewrite. A failure returns codes and messages; the caller decides
 * whether to ask the model for one repair or to fall back to v1. A linter that
 * edits prompts would be a second author.
 *
 * Pure. No model call, no I/O.
 */
import type { AspectRatio, Playbook } from "./playbooks";

export interface LintError {
  code:
    | "length"
    | "over_provider_ceiling"
    | "technical_term"
    | "verdict_word"
    | "copy_not_once"
    | "placeholder"
    | "truncated"
    | "suspicious_percent"
    | "no_aspect_ratio"
    | "too_many_strings"
    | "copy_on_product";
  message: string;
}

export interface LintResult {
  ok: boolean;
  errors: LintError[];
  warnings: string[];
  stats: { words: number; chars: number; quoted_strings: number };
}

export interface LintOptions {
  /** The strings that must appear, each exactly once. */
  copy: string[];
  /** The ratio the user chose. The prompt has to end by stating it. */
  aspectRatio: AspectRatio;
  playbook: Playbook;
  /** Label lettering, exempt from the content checks like any quoted string. */
  labelText?: string[];
}

const MIN_WORDS = 200;
const MAX_WORDS = 500;

/** The provider's own ceiling, read from the same variable the rest of the engine reads. */
const PROVIDER_CEILING = Number(process.env.PROMPT_HARD_MAXIMUM_CHARS || 32000);

/** Measurements a renderer cannot act on, which the audit found it ignoring. */
const TECHNICAL: Array<[RegExp, string]> = [
  [/\b\d{3,5}\s?K\b/, "colour temperature in Kelvin"],
  [/\b\d{2,3}\s?mm\b/, "a focal length in millimetres"],
  [/\bf\/\s?\d/, "an f-number"],
  [/\bISO\s?\d/i, "an ISO value"],
  [/\b\d+(\.\d+)?\s?%/, "a percentage"],
  [/\b\d+\s?\/\s?255\b/, "a 0-255 value"],
  [/\b\d+\s?:\s?\d+\b/, "a ratio"],
  [/\b\d+(\.\d+)?\s?(stops?|lux|nits|lumens)\b/i, "a photometric unit"],
  [/\b(aperture|focal length|shutter speed|white balance|colour temperature|color temperature|key[- ]to[- ]fill|key:fill|kelvin)\b/i, "a camera or lighting term"],
];

/** Words that grade a finished picture instead of describing one. */
const VERDICT =
  /\b(premium|luxur(y|ious)|cinematic|stunning|beautiful|gorgeous|exquisite|breathtaking|eye-?catching|high-?end|world-?class|striking|sophisticated)\b/gi;

/** Template residue. Each pattern is something that reached a real prompt. */
const PLACEHOLDER: Array<[RegExp, string]> = [
  [/\{\{[^}]*\}\}/, "an unsubstituted template placeholder"],
  [/\b(TODO|FIXME|lorem ipsum)\b/i, "a development marker"],
  [/\b(undefined|null|NaN)\b/, "a missing value printed as text"],
  [/\bCommercial Brand\b/, "the fallback brand name"],
  [/\bAuthentic reflection of\b/, "the audience-portrait placeholder"],
  [/\bPRODUCT_\d+\b/, "an internal product id"],
  [/\b(Item|Product)\s+\d+\s*\)/, "an internal item label"],
  // `BUSINESS GOAL: in beauty_skincare` — an ALL-CAPS label whose value is an
  // internal snake_case token rather than a sentence.
  [/^[A-Z][A-Z ]{3,}:\s*(in\s+)?[a-z][a-z0-9]*_[a-z0-9_]+\s*$/m, "a label whose value is an internal token"],
];

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const nfc = (s: string) => String(s ?? "").normalize("NFC");

/** Every double-quoted span, which is where the client's words live. */
function quotedSpans(text: string): string[] {
  return [...text.matchAll(/"([^"\n]{1,400})"|“([^”\n]{1,400})”/g)].map((m) => m[1] ?? m[2] ?? "");
}

/**
 * The prompt with the client's words and the declared ratio removed.
 *
 * The ratio has to be exempt for the same reason the copy does: `1:1` is a ratio
 * the prompt is REQUIRED to state, and the ratio check is what enforces it.
 */
function scannable(text: string, opts: LintOptions): string {
  let out = text.replace(/"[^"\n]{1,400}"/g, " ").replace(/“[^”\n]{1,400}”/g, " ");
  for (const c of [...opts.copy, ...(opts.labelText || [])]) {
    if (c && c.trim()) out = out.split(nfc(c)).join(" ");
  }
  out = out.split(opts.aspectRatio).join(" ");
  return out;
}

/** How the prompt is allowed to state the ratio. */
function statesRatio(text: string, ratio: AspectRatio): boolean {
  if (text.includes(ratio)) return true;
  const words: Record<AspectRatio, RegExp> = {
    "1:1": /\bsquare\b/i,
    "9:16": /\b(vertical|portrait)\b/i,
    "16:9": /\b(wide|landscape|horizontal)\b/i,
  };
  // A word alone is not enough: the number is what the provider is given, and a
  // prompt that says "wide" while the API is told 1:1 is the mismatch this catches.
  return words[ratio].test(text) && new RegExp(ratio.replace(":", "\\s*:\\s*")).test(text);
}

export function lintMasterPrompt(prompt: string, opts: LintOptions): LintResult {
  const text = nfc(prompt);
  const errors: LintError[] = [];
  const warnings: string[] = [];
  const words = squash(text).split(" ").filter(Boolean).length;
  const quoted = quotedSpans(text);
  const scan = scannable(text, opts);

  // ── length ──────────────────────────────────────────────────────────────
  if (words < MIN_WORDS || words > MAX_WORDS) {
    errors.push({ code: "length", message: `${words} words; the budget is ${MIN_WORDS}-${MAX_WORDS}` });
  }
  if (text.length >= PROVIDER_CEILING) {
    errors.push({ code: "over_provider_ceiling", message: `${text.length} chars against the provider ceiling of ${PROVIDER_CEILING}` });
  }

  // ── content, outside the client's own words ─────────────────────────────
  for (const [re, what] of TECHNICAL) {
    const hit = re.exec(scan);
    if (hit) errors.push({ code: "technical_term", message: `${what}: ${squash(hit[0])}` });
  }
  const verdicts = [...new Set((scan.match(VERDICT) || []).map((v) => v.toLowerCase()))];
  if (verdicts.length) {
    errors.push({ code: "verdict_word", message: `words that grade rather than describe: ${verdicts.join(", ")}` });
  }
  for (const [re, what] of PLACEHOLDER) {
    const hit = re.exec(scan);
    if (hit) errors.push({ code: "placeholder", message: `${what}: ${squash(hit[0]).slice(0, 60)}` });
  }
  if (/…|\.\.\.(\s|$)/.test(scan)) {
    errors.push({ code: "truncated", message: "a field was cut off mid-sentence" });
  }
  for (const m of scan.matchAll(/\b(\d{1,5})(\.\d+)?\s?%/g)) {
    const n = Number(m[1]);
    if (n > 100 || n === 0) errors.push({ code: "suspicious_percent", message: `${m[0]} cannot be a share of a frame` });
  }

  // ── the ratio ───────────────────────────────────────────────────────────
  if (!statesRatio(text, opts.aspectRatio)) {
    errors.push({ code: "no_aspect_ratio", message: `the prompt does not state the ${opts.aspectRatio} frame it was asked for` });
  }

  // ── the copy ────────────────────────────────────────────────────────────
  for (const line of opts.copy) {
    const needle = nfc(line).trim();
    if (!needle) continue;
    const count = text.split(needle).length - 1;
    if (count !== 1) {
      errors.push({ code: "copy_not_once", message: `"${needle.slice(0, 28)}${needle.length > 28 ? "…" : ""}" appears ${count} times, not once` });
    }
  }
  const budget = opts.playbook.copy_budget.max_strings;
  const quotedCopy = quoted.filter((q) => q.trim().length > 1);
  if (quotedCopy.length > budget) {
    errors.push({
      code: "too_many_strings",
      message: `${quotedCopy.length} quoted lines for a ${opts.playbook.id} at ${opts.playbook.ratio}, which carries ${budget}`,
    });
  }

  // ── the product's own surface ───────────────────────────────────────────
  if (/\b(headline|copy|text|words)\b[^.]{0,40}\bon the (label|bottle|cap|packaging|product)\b/i.test(scan)) {
    errors.push({ code: "copy_on_product", message: "the prompt puts campaign copy on the product's own surface" });
  }

  if (!/exactly as in attached photo/i.test(text) && opts.playbook.id !== "ugc") {
    warnings.push("the prompt never says 'exactly as in attached photo N', so product fidelity rests on the reference alone");
  }

  return { ok: errors.length === 0, errors, warnings, stats: { words, chars: text.length, quoted_strings: quoted.length } };
}

/** Counts and codes only. Never the prompt, never the copy. */
export function lintTelemetry(r: LintResult | null | undefined) {
  if (!r) return { lint: false };
  return {
    lint: true,
    ok: r.ok,
    words: r.stats.words,
    chars: r.stats.chars,
    codes: r.errors.map((e) => e.code),
    warnings: r.warnings.length,
  };
}
