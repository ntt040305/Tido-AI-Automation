/**
 * The render, checked against the SAME Art Direction Sheet that produced it.
 *
 * WHY AGAINST THE SHEET AND NOT AGAINST THE PROMPT
 * -----------------------------------------------
 * A prompt states conclusions in prose. You cannot ask "is the headline at least three
 * percent of the canvas height" of a paragraph, and a QC pass that re-reads the prompt is
 * asking a model to re-interpret an interpretation. The sheet holds the concrete values —
 * the zones, the safe margin, the manifest with its exact strings, the hero's share, the
 * excluded cultural confusion — so every check below has something specific to compare
 * against, and a failure names the field it failed.
 *
 * AUTO-FAIL BEFORE SCORE
 * ----------------------
 * Some faults are not matters of degree. A missing diacritic is wrong; a product count
 * that does not match is wrong; an invented logo on a real brand is wrong. Those are
 * auto-fails and no average can outvote them. The 1-10 scores decide only the cases where
 * nothing is outright broken, and the threshold is config rather than a constant because
 * nobody has measured where it should sit.
 *
 * FAIL-CLOSED, THE WAY TypographyCritique ALREADY DOES IT
 * ------------------------------------------------------
 * `verdict: "unverified"` is reused deliberately rather than invented here. When the QC
 * model cannot see the small text — which is most of what matters and the hardest thing to
 * see — the honest answer is "I could not check", and that must NOT loop: a retry on the
 * strength of our own blindness charges the user for an outage. An unverified render is
 * DELIVERED, flagged for a human.
 *
 * The same rule `VisionReview` already enforces for the typographic critique, and the same
 * rule that was broken there for a whole phase. One shape, one meaning.
 *
 * NEVER BLOCKS, NEVER LOOPS, NEVER OVERSPENDS
 * -------------------------------------------
 * Every failure path returns `unverified` and the render is delivered. Retries are capped
 * by a count AND by a hard cost ceiling in VND, checked before each attempt, because a
 * count alone does not bound spend when a brief carries reference images at 250 VND a
 * render.
 */
import { z } from "zod";

import type { ArtDirectionSheet } from "./art-direction-sheet";

/** Bumped when the question changes. */
export const VISION_QC_PROMPT_VERSION = "qc1";

/**
 * The faults that are not matters of degree.
 *
 * Each one is a thing a reviewer would reject outright, and each is decidable by looking —
 * no taste involved. `wrong_culture_signal` is the one that needs the sheet most: it fires
 * when the confusion the brief told the director to EXCLUDE is the thing in the picture.
 */
export const AUTO_FAIL_CODES = [
  "text_not_verbatim",
  "text_missing",
  "product_count_mismatch",
  "invented_logo_or_label",
  "wrong_culture_signal",
  "outside_safe_margin",
  "hero_not_dominant",
] as const;

export type AutoFailCode = (typeof AUTO_FAIL_CODES)[number];

export const VisionQcSchema = z.object({
  /**
   * `unverified` when the model could not see well enough to judge — small text especially.
   * Never a pass and never a fail.
   */
  verdict: z.enum(["verified", "unverified"]),
  auto_fails: z
    .array(
      z.object({
        code: z.enum(AUTO_FAIL_CODES),
        /** What was seen, in one sentence. Quoted back to a human, never to a model. */
        what: z.string().default(""),
      }),
    )
    .default([]),
  scores: z
    .object({
      hierarchy: z.number().min(1).max(10),
      realism: z.number().min(1).max(10),
      light_consistency: z.number().min(1).max(10),
      label_fidelity: z.number().min(1).max(10),
      legibility_at_phone_size: z.number().min(1).max(10),
      colour_harmony: z.number().min(1).max(10),
    })
    .nullable()
    .default(null),
  notes: z.string().default(""),
});

export type VisionQc = z.infer<typeof VisionQcSchema>;

export interface QcConfig {
  /** Mean score a verified render must reach. Config, because nobody has measured it. */
  threshold: number;
  /** Retries allowed. Default 1, hard maximum 2. */
  maxRetries: number;
  /** Total VND this request may spend across every attempt, QC calls included. */
  costCapVnd: number;
}

/** The hard ceiling on retries, whatever the config says. */
export const HARD_MAX_RETRIES = 2;
const VND_PER_RENDER = 250;
const VND_PER_QC_CALL = 50;

export function qcConfig(env: Record<string, string | undefined> = process.env): QcConfig {
  const threshold = Number(env.GPT_VISION_QC_THRESHOLD);
  const retries = Number(env.GPT_VISION_QC_MAX_RETRIES);
  const cap = Number(env.GPT_RENDER_COST_CAP_VND);
  return {
    threshold: Number.isFinite(threshold) && threshold > 0 && threshold <= 10 ? threshold : 8.5,
    maxRetries: Number.isFinite(retries) ? Math.max(0, Math.min(HARD_MAX_RETRIES, Math.floor(retries))) : 1,
    // Default: the first render, one retry, and a QC call for each. Anything beyond that is
    // a deliberate choice somebody has to type.
    costCapVnd: Number.isFinite(cap) && cap > 0 ? cap : VND_PER_RENDER * 2 + VND_PER_QC_CALL * 2,
  };
}

export type QcOutcome = "pass" | "fail" | "unverified";

/**
 * The verdict. Auto-fails first, then the mean.
 *
 * An `unverified` QC is neither a pass nor a fail and never triggers a retry. A verified QC
 * with any auto-fail is a fail whatever the scores say — that is what "auto" means.
 */
export function qcOutcome(qc: VisionQc | null, config: QcConfig): { outcome: QcOutcome; because: string } {
  if (!qc) return { outcome: "unverified", because: "the QC pass produced no usable answer" };
  if (qc.verdict === "unverified") {
    return { outcome: "unverified", because: qc.notes.trim() || "the QC model could not see well enough to judge" };
  }
  if (qc.auto_fails.length) {
    return {
      outcome: "fail",
      because: qc.auto_fails.map((f) => `${f.code}${f.what ? `: ${f.what}` : ""}`).join("; "),
    };
  }
  if (!qc.scores) {
    // Verified, nothing broken, and no scores. Nothing to measure against the threshold,
    // so this is not a pass by default: it is a render nobody scored.
    return { outcome: "unverified", because: "the QC pass returned no scores" };
  }
  const values = Object.values(qc.scores);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const rounded = Math.round(mean * 10) / 10;
  return rounded >= config.threshold
    ? { outcome: "pass", because: `mean ${rounded} against a threshold of ${config.threshold}` }
    : { outcome: "fail", because: `mean ${rounded} is below the threshold of ${config.threshold}` };
}

/**
 * ONE sentence, appended to the same prompt, for the fault that was found.
 *
 * One, and targeted. The alternative — rewriting the prompt, or stacking a correction per
 * fault — changes the thing that was mostly right and makes the second render's failure
 * impossible to attribute. The sentences are imperative, concrete, and say nothing about
 * QC, models or attempts.
 *
 * Returns null for a code with no single-sentence fix, in which case there is nothing
 * honest to retry WITH and the render is delivered flagged instead.
 */
export function correctionFor(code: AutoFailCode, sheet: ArtDirectionSheet): string | null {
  switch (code) {
    // The two text faults share a remedy — set the listed strings — but LEAD with the
    // thing that actually went wrong, because a correction that opens on the symptom is
    // the one a renderer acts on, and because two identical sentences would make a retry
    // impossible to attribute to the fault that caused it.
    case "text_not_verbatim": {
      const strings = sheet.text_manifest.map((m) => `"${m.exact_string}"`).join(", ");
      return strings
        ? `Reproduce each of these character for character, with every diacritic exactly as written, changing nothing: ${strings}.`
        : "Render no text of any kind anywhere in the image.";
    }
    case "text_missing": {
      const strings = sheet.text_manifest.map((m) => `"${m.exact_string}"`).join(", ");
      return strings
        ? `Every one of these must appear in the image, each exactly once, and no others: ${strings}.`
        : "Render no text of any kind anywhere in the image.";
    }
    case "product_count_mismatch": {
      const n = sheet.products.length;
      return `Show exactly ${n === 1 ? "one product" : `${n} products`} — no duplicates, no extra copies, and none omitted.`;
    }
    case "invented_logo_or_label":
      // Taken from the sheet's own print rule rather than written here, so the correction
      // cannot contradict the rule the prompt already carries.
      return "Draw no logo, wordmark, emblem or icon that is not already printed on the supplied product photographs.";
    case "wrong_culture_signal":
      return (
        "Render the culturally specific elements exactly as the scene describes them, and include none of the " +
        "visually similar alternatives from another culture or season."
      );
    case "outside_safe_margin":
      return "Keep every word and every edge of the product inside a clear, even margin on all four sides.";
    case "hero_not_dominant": {
      const hero = sheet.products.find((p) => p.id === sheet.hero.id);
      return `Make ${hero ? hero.description : "the lead product"} clearly the largest and nearest thing in the frame.`;
    }
    default:
      return null;
  }
}

/** The correction for a whole verdict: the FIRST auto-fail that has one. */
export function correctionForVerdict(qc: VisionQc | null, sheet: ArtDirectionSheet): string | null {
  for (const fail of qc?.auto_fails ?? []) {
    const sentence = correctionFor(fail.code, sheet);
    if (sentence) return sentence;
  }
  return null;
}

const SYSTEM =
  "You are a print production checker. You compare a rendered advertisement against the " +
  "specification it was made from and report only what you can SEE. You never guess at " +
  "lettering you cannot read: if you cannot read it, you say the whole check is unverified.";

/** The question, built from the sheet so every check has a concrete value to compare. */
export function qcPrompt(sheet: ArtDirectionSheet): string {
  const manifest = sheet.text_manifest.length
    ? sheet.text_manifest.map((m) => `  [${m.role}] "${m.exact_string}"`).join("\n")
    : "  (no text at all should appear)";
  const exclusions = sheet.set.exclusions.length ? sheet.set.exclusions.join("; ") : "(none stated)";

  return [
    "Check the attached rendered image against this specification.",
    "",
    "THE TEXT THAT SHOULD APPEAR, each exactly once and character for character:",
    manifest,
    "",
    `PRODUCTS THAT SHOULD APPEAR: ${sheet.products.length}, no duplicates and none missing.`,
    `THE HERO, which should be clearly largest and nearest: ${
      sheet.products.find((p) => p.id === sheet.hero.id)?.description ?? "the lead product"
    }.`,
    "SAFE MARGIN: nothing that must be read, and no edge of the hero, may touch or cross a",
    "clear even margin on all four sides.",
    `THINGS THE SCENE EXCLUDES: ${exclusions}`,
    "",
    "FIRST, the verdict:",
    "  If you cannot READ the small text in the image well enough to compare it with the list",
    "  above, answer verdict: \"unverified\" and stop there. Do not guess. An unverified answer",
    "  is the correct and useful answer when the image is not legible to you.",
    "  Otherwise answer verdict: \"verified\" and complete the rest.",
    "",
    "THEN, any of these that you can SEE, as auto_fails:",
    "  text_not_verbatim        a string appears but differs — a wrong or missing diacritic,",
    "                           a misspelling, a changed word.",
    "  text_missing             a string from the list does not appear at all.",
    "  product_count_mismatch   more or fewer products than stated, or one duplicated.",
    "  invented_logo_or_label   a logo, wordmark or label that is not on a supplied product.",
    "  wrong_culture_signal     one of the excluded things above is in the picture.",
    "  outside_safe_margin      text or a product edge touching or crossing the margin.",
    "  hero_not_dominant        the hero is not clearly the largest and nearest.",
    "",
    "THEN score one to ten, where ten is work you would send to a client:",
    "  hierarchy, realism, light_consistency, label_fidelity,",
    "  legibility_at_phone_size, colour_harmony",
    "",
    "Answer with ONLY a JSON object:",
    '{"verdict":"verified","auto_fails":[{"code":"text_missing","what":""}],' +
      '"scores":{"hierarchy":8,"realism":8,"light_consistency":8,"label_fidelity":8,' +
      '"legibility_at_phone_size":8,"colour_harmony":8},"notes":""}',
  ].join("\n");
}

export function qcMessages(
  sheet: ArtDirectionSheet,
  image: { buffer: Buffer; mimeType?: string },
): Array<{ role: "system" | "user"; content: unknown }> {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text: qcPrompt(sheet) },
        {
          type: "image_url",
          image_url: { url: `data:${image.mimeType || "image/png"};base64,${image.buffer.toString("base64")}`, detail: "high" },
        },
      ],
    },
  ];
}

/** Tolerant about where the JSON sits, strict about its shape. Null means unverified. */
export function parseVisionQc(raw: string): VisionQc | null {
  const match = String(raw || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = VisionQcSchema.safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface QcDeps {
  chat: (messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>, purpose: string) => Promise<string>;
  timeoutMs?: number;
}

/** Runs the QC pass. Never throws: any failure is an unverified verdict. */
export async function runVisionQc(
  sheet: ArtDirectionSheet,
  image: { buffer: Buffer; mimeType?: string } | null,
  deps: QcDeps,
): Promise<{ qc: VisionQc | null; reason?: string }> {
  if (!image?.buffer?.length) return { qc: null, reason: "no rendered image to check" };
  const timeoutMs = deps.timeoutMs ?? 45000;
  try {
    const raw = await Promise.race([
      deps.chat(qcMessages(sheet, image), "vision_qc"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`vision QC timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    const qc = parseVisionQc(raw);
    return qc ? { qc } : { qc: null, reason: "the reply was not valid QC JSON" };
  } catch (err) {
    return { qc: null, reason: (err as Error)?.message?.slice(0, 160) || "unknown" };
  }
}

/**
 * The ledger: what has been spent, what was tried, and whether another attempt is allowed.
 *
 * A COUNT alone does not bound spend. One retry of a brief carrying reference images is
 * 250 VND plus a QC call, and a count of two says nothing about the total. So both are
 * checked, and the cost is checked BEFORE the attempt rather than after it.
 */
export interface QcAttempt {
  attempt: number;
  /** The sentence appended to the prompt for this attempt, or null for the first. */
  correction: string | null;
  outcome: QcOutcome;
  because: string;
  /** VND this attempt cost: the render, plus its QC call when one was made. */
  cost_vnd: number;
}

export class QcBudget {
  readonly config: QcConfig;
  readonly attempts: QcAttempt[] = [];

  constructor(config: QcConfig) {
    this.config = config;
  }

  get spentVnd(): number {
    return this.attempts.reduce((total, a) => total + a.cost_vnd, 0);
  }

  get retriesUsed(): number {
    return Math.max(0, this.attempts.length - 1);
  }

  record(attempt: Omit<QcAttempt, "attempt">): QcAttempt {
    const row: QcAttempt = { attempt: this.attempts.length + 1, ...attempt };
    this.attempts.push(row);
    console.log("[VISION_QC][ATTEMPT]", JSON.stringify({ ...row, correction: Boolean(row.correction) }));
    return row;
  }

  /** The cost of one more attempt: a render plus the QC call that would check it. */
  static attemptCostVnd(): number {
    return VND_PER_RENDER + VND_PER_QC_CALL;
  }

  /**
   * Whether another attempt is allowed, and why not when it is not.
   *
   * Only a `fail` may be retried. `unverified` must not: a retry on the strength of our own
   * blindness charges the user for an outage, which is the same rule `VisionReview` enforces
   * for the typographic critique.
   */
  mayRetry(outcome: QcOutcome, correction: string | null): { allowed: boolean; because: string } {
    if (outcome !== "fail") {
      return { allowed: false, because: `nothing to retry: the verdict is ${outcome}` };
    }
    if (!correction) {
      return { allowed: false, because: "no single targeted correction follows from the fault, so a retry would be a guess" };
    }
    if (this.retriesUsed >= this.config.maxRetries) {
      return { allowed: false, because: `the retry limit of ${this.config.maxRetries} is used up` };
    }
    const next = this.spentVnd + QcBudget.attemptCostVnd();
    if (next > this.config.costCapVnd) {
      return {
        allowed: false,
        because: `another attempt would take this request to ${next} VND, over the ${this.config.costCapVnd} VND cap`,
      };
    }
    return { allowed: true, because: `retry ${this.retriesUsed + 1} of ${this.config.maxRetries}` };
  }
}

/** Counts, codes and the ledger. Never the client's copy, never image bytes. */
export function qcTelemetry(qc: VisionQc | null, outcome: QcOutcome, budget: QcBudget | null) {
  return {
    vision_qc: true,
    verdict: qc?.verdict ?? "unverified",
    outcome,
    auto_fails: (qc?.auto_fails ?? []).map((f) => f.code),
    scored: Boolean(qc?.scores),
    attempts: budget?.attempts.length ?? 0,
    retries_used: budget?.retriesUsed ?? 0,
    spent_vnd: budget?.spentVnd ?? 0,
    cap_vnd: budget?.config.costCapVnd ?? 0,
  };
}
