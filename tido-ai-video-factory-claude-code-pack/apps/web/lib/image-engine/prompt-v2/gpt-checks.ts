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
  | "VERDICT_WORD";

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

  return {
    ok: failures.length === 0,
    failures,
    stats: { chars: text.length, quoted: allQuotes.length, sections: MASTER_SECTIONS.length - missing.length },
  };
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
