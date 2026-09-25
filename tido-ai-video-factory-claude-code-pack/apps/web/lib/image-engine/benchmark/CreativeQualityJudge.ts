import fs from "fs";
import { LLMProviderService, type LLMChatMessage } from "../llm/llm-provider.service";
import { QUALITY_DIMENSIONS, type BenchmarkBrief } from "./creative-quality-dataset";

/**
 * Phase 5.6.1 — measuring what a render is worth.
 *
 * TWO KINDS OF NUMBER, NEVER AVERAGED TOGETHER
 * --------------------------------------------
 * MEASURED facts are computed from the run: did the client's words appear, did
 * type collide with the product, how large was the prompt, what did it cost.
 * Nobody's opinion is involved and nothing can flatter them. These are what
 * catch a prompt-reduction regression objectively.
 *
 * JUDGED scores are the six creative dimensions. A picture has to be looked at
 * to be scored, so a vision model looks at it against a fixed rubric. That is
 * an opinion, and this file never pretends otherwise.
 *
 * WHY A MODEL JUDGE AT ALL
 * ------------------------
 * Every earlier scorer in this repository refused to score pictures and scored
 * PROMPTS instead -- a defensible position then, and exactly the wrong tool now:
 * the change being measured IS a prompt change, so a prompt-derived score would
 * move because the text moved, not because the work got better. That is a
 * circular measurement. Scoring the rendered image is the only way the number
 * means anything after the PromptAssembler lands.
 *
 * WHAT THAT COSTS IN HONESTY
 * --------------------------
 * The judge is a model grading a system built from models, which is a known bias
 * and probably a generous one. It is therefore treated as an INDEX, not a truth:
 * useful for "did this change move the number", not for "is this good". The
 * runner also emits a blind human review packet, and the human scores are what
 * calibrate the index. Until a human has scored a run, every JUDGED number in a
 * report carries `calibrated: false`.
 */

export type ScoreKind = "MEASURED" | "JUDGED";

export interface MeasuredMetrics {
  /** Did the render succeed at all. */
  rendered: boolean;
  /** The client's exact lines all present, none invented. Null when no text was asked for. */
  text_exact: boolean | null;
  text_missing: number;
  text_incorrect: number;
  text_unwanted: number;
  /** Text layers whose box crosses the product, from the composition map. */
  type_product_collisions: number | null;
  /** Lowest text contrast ratio in the design, WCAG. Null when there is no text. */
  min_text_contrast: number | null;
  /** Did the Creative Director produce a judgment, or did the run degrade. */
  director_judged: boolean;
  /** Characters actually sent to the image model. */
  prompt_chars: number;
  /** How close that came to the hard ceiling. */
  prompt_headroom: number;
  vision_corrections: number;
  duration_ms: number;
  llm_calls: number;
  image_renders: number;
}

export interface JudgedScore {
  key: string;
  score: number;
  because: string;
}

export interface CaseResult {
  brief_id: string;
  category: string;
  generation_id: string | null;
  image_path: string | null;
  measured: MeasuredMetrics;
  judged: JudgedScore[] | null;
  judge_error?: string;
}

const HARD_CEILING = Number(process.env.PROMPT_HARD_MAXIMUM_CHARS || 32000);

/** Everything computable from a finished run. No opinions. */
export function measureRun(result: Record<string, any>, durationMs: number, llmCalls: number): MeasuredMetrics {
  const trace = result.visionTrace;
  const served = trace?.versions?.find((v: any) => v.version === trace?.selected)?.analysis ?? result.visionAnalysis ?? null;
  const check = served?.text_check ?? null;
  const design = result.designDocument?.editable ?? null;
  const layers: any[] = design?.layers ?? [];
  const texts = layers.filter((l) => l.kind === "text");
  const product = design?.composition?.product ?? null;

  // A text layer counts as colliding when its box overlaps the product box by
  // more than a fifth of its own area -- the same threshold the layout engine
  // uses to decide a column must move.
  let collisions: number | null = null;
  if (design && product) {
    collisions = texts.filter((t) => {
      const x = Math.max(0, Math.min(t.x + t.width, product.x + product.width) - Math.max(t.x, product.x));
      const y = Math.max(0, Math.min(t.y + t.height, product.y + product.height) - Math.max(t.y, product.y));
      return (x * y) / Math.max(1, t.width * t.height) > 0.2;
    }).length;
  }

  const contrasts = texts.map((t) => Number(t.contrast_ratio)).filter((n) => Number.isFinite(n));
  const promptChars = typeof result.compiledPrompt === "string" ? result.compiledPrompt.length : 0;

  return {
    rendered: Boolean(result.success),
    text_exact: check ? Boolean(check.compliant) : null,
    text_missing: check?.missing?.length ?? 0,
    text_incorrect: check?.incorrect?.length ?? 0,
    text_unwanted: check?.unwanted?.length ?? 0,
    type_product_collisions: collisions,
    min_text_contrast: contrasts.length ? Math.min(...contrasts) : null,
    director_judged: Boolean(result.creativeJudgment),
    prompt_chars: promptChars,
    prompt_headroom: HARD_CEILING - promptChars,
    vision_corrections: Math.max(0, (trace?.versions?.length ?? 1) - 1),
    duration_ms: durationMs,
    llm_calls: llmCalls,
    image_renders: trace?.versions?.length ?? 1,
  };
}

const RUBRIC = QUALITY_DIMENSIONS.map(
  (d) => `${d.key} — ${d.title}. ${d.question}\n   3 = ${d.anchors.low}\n   6 = ${d.anchors.mid}\n   9 = ${d.anchors.high}`,
).join("\n\n");

/**
 * Scores one rendered image against the fixed rubric.
 *
 * The brief is supplied because several dimensions are relative to it: an idea
 * is only original against what was asked for. The judge is told to score the
 * PICTURE and is given no access to the prompt, the blueprint or any of the
 * system's own reasoning -- otherwise it would be grading the plan again.
 */
export async function judgeRender(
  imagePath: string,
  brief: BenchmarkBrief,
  llm = new LLMProviderService(),
): Promise<JudgedScore[]> {
  const b64 = fs.readFileSync(imagePath).toString("base64");
  const system =
    "You are a senior creative director reviewing commercial advertising work for a client. " +
    "You are shown one finished image and the brief it answers. Score it on six dimensions, 1-10, " +
    "using the anchors given. Be strict: 6 is competent professional work, 9 is award-standard. " +
    "Most machine-generated advertising scores 4-6; say so when it does. " +
    'Reply with JSON only: {"scores":[{"key":"...","score":N,"because":"one sentence"}]}';
  const user: LLMChatMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text:
          `BRIEF\nCategory: ${brief.category}\nConcept: ${brief.concept}\n` +
          (brief.contentMessage ? `Text that had to appear: ${JSON.stringify(brief.contentMessage)}\n` : "No text was requested.\n") +
          `What matters most here: ${brief.emphasis.join(", ")}\n\nRUBRIC\n${RUBRIC}`,
      },
      { type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "high" } },
    ],
  };

  const raw = await llm.generateChatCompletion([{ role: "system", content: system }, user], "creative_quality_judge", {
    temperature: 0,
    max_tokens: 1200,
    timeoutMs: 90000,
  });

  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json) as { scores?: { key?: string; score?: number; because?: string }[] };
  const byKey = new Map((parsed.scores || []).map((s) => [String(s.key), s]));
  return QUALITY_DIMENSIONS.map((d) => {
    const s = byKey.get(d.key);
    const n = Number(s?.score);
    return {
      key: d.key,
      score: Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n * 10) / 10)) : 0,
      because: String(s?.because || "").slice(0, 240),
    };
  });
}

/** Mean of a set of scores, to one decimal. Null when there is nothing to average. */
export function mean(ns: number[]): number | null {
  const v = ns.filter((n) => Number.isFinite(n) && n > 0);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
