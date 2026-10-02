import type { SimpleImageGenerationResultV1, SimpleInputRequestV1 } from "../types";
import type { RoutingDecision } from "./PipelineRouter";
import type { VisionAnalysisResult } from "./experiment/VisionAnalysisResult";
import { RenderTracer } from "../observability/RenderTracer";

/**
 * The review that happens after the picture exists.
 *
 * Position is the whole design. This runs in `PipelineRouter`, above both
 * pipelines, after a render has already succeeded. Nothing here can influence
 * how a prompt is built, because by the time any of it executes the prompt has
 * been compiled, sent, and answered.
 *
 * That ordering is what makes the safety rules cheap to keep rather than
 * something to remember:
 *
 *   - Vision unavailable      -> the first render is returned, untouched.
 *   - Vision finds nothing    -> the first render is returned, untouched.
 *   - Vision finds real fault -> a correction is built and a second render tried.
 *   - Second render not better-> the first render is returned, untouched.
 *
 * In every branch the answer defaults to the image the user already has. There
 * is no path where a review failure becomes a generation failure, and the
 * module is written so that adding one would require deleting a try/catch
 * rather than forgetting to add one.
 *
 * Cost: one vision call per render, plus a second render when the loop acts.
 * That is why `vision_iteration_v1` is off, and why the flag is checked before
 * anything is imported.
 */

/** Time set aside for one vision call, matching the analyzer's own timeout. */
const VISION_CALL_BUDGET_MS = 60_000;

/** The shape the router logs and the API returns. */
export interface VisionReviewTelemetry {
  /** The loop was switched on and the render was eligible. */
  vision_called: boolean;
  /** A model actually received the bytes and answered. */
  analyzed_image: boolean;
  second_render_created: boolean;
  second_render_selected: boolean;
  /** Proposals outside what the loop is permitted to change. */
  rejected_actions: number;
  /** Findings the correction table had no rule for. */
  untranslated_findings: number;
}

export const NO_REVIEW: VisionReviewTelemetry = {
  vision_called: false,
  analyzed_image: false,
  second_render_created: false,
  second_render_selected: false,
  rejected_actions: 0,
  untranslated_findings: 0,
};

/**
 * The structures `ExperimentPipeline.attachDesignContext` hangs off a result.
 *
 * They are non-enumerable so they never ride into a JSON response -- which also
 * means every `{ ...result }` below silently drops them. Measured on live data:
 * both vision runs of 2026-09-23 reached the database with no blueprint, no
 * prompt and no concepts, because the review returned a spread copy. This is
 * the list that has to be carried across explicitly.
 */
export const DESIGN_CONTEXT_KEYS = [
  "creativeBlueprint",
  "typographySystem",
  "layoutGeometry",
  "visualComposition",
  "assetDna",
  "compiledPrompt",
  "marketingStrategy",
  "visualDna",
  "creativeJudgment",
  "designDocument",
  // Phase 7: the decisions the review compares the render against. Without
  // these the vision loop can say what it saw and not whether it was what was
  // asked for.
  "compositionPlan",
  "typographyDna",
] as const;

/**
 * Copies the non-enumerable design context from `sources` onto `target`, first
 * source wins. Kept non-enumerable, so the API response is unchanged.
 *
 * The served render's own context goes first: when the correction pass wins,
 * its blueprint and prompt are the ones that describe the picture the user got.
 * The first render fills anything the second did not produce.
 */
export function carryDesignContext<T extends object>(target: T, ...sources: (object | null | undefined)[]): T {
  for (const key of DESIGN_CONTEXT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(target, key)) continue;
    for (const source of sources) {
      const value = source ? (source as Record<string, unknown>)[key] : undefined;
      if (value === undefined || value === null) continue;
      Object.defineProperty(target, key, { value, enumerable: false, configurable: true });
      break;
    }
  }
  return target;
}

/** One reviewed render, as the persistence layer records it. */
export interface VisionTraceVersion {
  version: 1 | 2;
  imageUrl: string;
  /** The compiled prompt that produced this version, when the pipeline kept it. */
  prompt: string | null;
  /** What the analyzer saw in THIS version. Null when it could not look. */
  analysis: VisionAnalysisResult | null;
}

/**
 * Both sides of the loop, attached non-enumerably as `visionTrace`.
 *
 * The public result carries only the analysis of the image being served, which
 * is right for the response and wrong for the record: the V1 review that
 * justified a correction, and the instruction the correction sent, are the
 * evidence a later phase learns from.
 */
export interface VisionTrace {
  versions: VisionTraceVersion[];
  /** The correction block sent to the second render. Null when none was sent. */
  instruction: string | null;
  /** Which version was served. */
  selected: 1 | 2;
  /**
   * Phase 4.5. What the correction improved, worsened or left alone, as the
   * design comparison judged it. Present only when a second version was reviewed.
   */
  comparison?: unknown;
}

/**
 * Hangs the typographic critique off an analysis.
 *
 * The design the render was composed from lives on the result as
 * `designDocument.editable` -- present only in Editable mode, where this
 * system set the type itself. Without it the critique is still produced from
 * what the model read: duplicates, invented copy and misspellings are
 * observable in any render, whoever drew the letters.
 */
function attachCritique(
  analysis: VisionAnalysisResult,
  result: SimpleImageGenerationResultV1,
  critique: typeof import("./experiment/TypographyCritique").critiqueTypography,
): void {
  const doc = (result as unknown as Record<string, unknown>).designDocument as
    | { editable?: unknown; typography_plan?: unknown }
    | undefined;
  const design = (doc?.editable ?? null) as Parameters<typeof critique>[0]["design"];
  const map = design?.scene_content ? { product: design.scene_content.product } : null;
  analysis.typography_critique = critique({
    design,
    map,
    textCheck: analysis.text_check ?? null,
    visibleText: analysis.visible_text ?? null,
    plan: (doc?.typography_plan ?? null) as Parameters<typeof critique>[0]["plan"],
  });
}

function promptOf(result: SimpleImageGenerationResultV1 | null | undefined): string | null {
  const p = result ? (result as unknown as Record<string, unknown>).compiledPrompt : null;
  return typeof p === "string" ? p : null;
}

function withTrace<T extends object>(target: T, trace: VisionTrace): T {
  Object.defineProperty(target, "visionTrace", { value: trace, enumerable: false, configurable: true });
  return target;
}

/** Appends a correction to the brief without disturbing anything else in it. */
export function correctedRequest(
  request: SimpleInputRequestV1,
  instruction: string,
): SimpleInputRequestV1 {
  return { ...request, concept: `${request.concept}\n\n${instruction}` } as SimpleInputRequestV1;
}

/**
 * Reviews a finished render and, when warranted, replaces it with a better one.
 *
 * Returns the result to serve. On any failure that is the input, by identity.
 */
export interface ReviewBudget {
  /**
   * How long the first render actually took.
   *
   * Used to estimate the second, which is the same pipeline doing the same
   * work. A measured estimate beats a constant here: render times vary by an
   * order of magnitude with provider load, and a fixed guess is wrong in both
   * directions -- refusing corrections on a fast day and blowing the request
   * budget on a slow one.
   */
  firstRenderMs: number;
  /** Wall-clock deadline for the whole request. */
  deadlineAt: number;
  /**
   * Phase 4.5. Director time inside `firstRenderMs` that the correction pass
   * will not repeat, because its judgment is pinned. Zero when unknown.
   */
  directorMs?: number;
}

/**
 * Time to reserve for the second vision review.
 *
 * Measured from the first review rather than assumed at the analyzer's
 * worst-case timeout: the same model, on the same kind of image, moments later.
 * Half as much again for variance, never below 20s and never above the
 * timeout itself -- so the reservation can only ever be as generous as before.
 */
export function visionReserveMs(measuredMs: number): number {
  if (!Number.isFinite(measuredMs) || measuredMs <= 0) return VISION_CALL_BUDGET_MS;
  return Math.max(20_000, Math.min(VISION_CALL_BUDGET_MS, measuredMs * 1.5));
}

/** Resolves to the promise's value, or null once `ms` has passed. Never rejects. */
export async function withinMs<T>(work: Promise<T>, ms: number): Promise<T | null> {
  if (!Number.isFinite(ms)) return work.catch(() => null);
  if (ms <= 0) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work.catch(() => null), late]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Kept clear of the route's own deadline, so a finished picture is never lost to it. */
const DEADLINE_MARGIN_MS = 5_000;

/** The second render, estimated from the first minus what it will not repeat. */
export function correctionNeededMs(budget: ReviewBudget, measuredVisionMs: number): number {
  const second = Math.max(0, budget.firstRenderMs - Math.max(0, budget.directorMs ?? 0));
  return second * 1.25 + visionReserveMs(measuredVisionMs);
}

export async function reviewRender(
  result: SimpleImageGenerationResultV1,
  request: SimpleInputRequestV1,
  decision: RoutingDecision,
  rerender: (instruction: string) => Promise<SimpleImageGenerationResultV1>,
  budget?: ReviewBudget,
): Promise<SimpleImageGenerationResultV1> {
  // Checked before any import, so a disabled loop costs one property read and
  // loads none of the vision code.
  if (!decision.flags?.features?.vision_iteration_v1) return result;
  if (!result?.success || !result.imageBuffer) return result;

  try {
    const { VisionAnalyzerService } = await import("./experiment/VisionAnalyzerService");
    const {
      decideDesignChanges,
      renderDesignDecisions,
      compareDesignQuality,
      designDecisionTelemetry,
    } = await import("./experiment/VisionDesignDecisionEngine");
    const { sanitizeActions } = await import("./experiment/VisionAnalysisResult");
    const { critiqueTypography, typographyCritiqueTelemetry } = await import("./experiment/TypographyCritique");
    const { buildVisionReview, visionReviewTelemetry } = await import("./experiment/VisionReview");

    const analyzer = new VisionAnalyzerService();
    // What the image was required to say: exactly the lines the person typed,
    // or nothing. Read from the content field as well as explicit copy -- the
    // old list read `copyItems` only, so the content field's text was never
    // checked, and "no text" was never checked at all.
    const { resolveTextRequirement } = await import("../compiler/ExactCopyIntegrityValidator");
    // On the v2 path the renderer was asked to draw `copy_final`, which differs
    // from what the client typed whenever the copy had to be shortened to fit the
    // channel. Comparing the original list there would report a correct render as
    // wrong. Absent -- which is every v1 render -- this reads the request exactly
    // as it always did.
    const v2Copy = (result as unknown as { promptV2?: { copy_final?: unknown } }).promptV2?.copy_final;
    const textRequirement =
      Array.isArray(v2Copy) && v2Copy.length
        ? ({ mode: "exact", lines: v2Copy.map((l) => String(l)) } as ReturnType<typeof resolveTextRequirement>)
        : resolveTextRequirement(request);
    const expectedCopy = textRequirement.lines;

    const visionStart = Date.now();
    const analysis = await analyzer.analyze({
      image: result.imageBuffer,
      expectedCopy,
      textRequirement,
      productDescription: request.concept,
    });

    // The typographic critique.
    //
    // Run here rather than inside the analyzer because half of it is
    // arithmetic over the design this render was composed from -- boxes that
    // intersect, a headline set smaller than its subheadline, a line under its
    // contrast floor -- and the analyzer only has pixels. Joining the two here
    // is the only place both are in scope.
    //
    // Attached to the analysis so the record, the response and the correction
    // all read one object.
    attachCritique(analysis, result, critiqueTypography);
    // Counts, areas and scores only. The findings quote the client's copy, so
    // they travel on the result and never into a log line.
    console.log("[VISION_REVIEW][TYPOGRAPHY]", typographyCritiqueTelemetry(analysis.typography_critique));

    const { dropped } = sanitizeActions(analysis.improvement_actions);

    // The reasoning step between seeing a problem and changing a value. It
    // reads the systems the render was actually built from, so a decision
    // carries a real before and after rather than a direction.
    const decisions = decideDesignChanges({
      analysis,
      blueprint: (result as any).creativeBlueprint || null,
      typography: (result as any).typographySystem || null,
      layout: (result as any).layoutGeometry || null,
    });

    // Phase 7: the render judged against the decisions that produced it, and
    // every issue attributed to the layer that owns it.
    //
    // Separate from `decisions` above, which asks "what should change in the
    // design". This asks the prior question -- did the picture do what was
    // decided -- and answers it per dimension with an owner, so a fix goes to
    // the layer that failed rather than to whichever one is easiest to edit.
    const editable = (result as unknown as { designDocument?: { editable?: Record<string, unknown> } }).designDocument?.editable ?? null;
    const scene = editable?.scene_content as { product: unknown; focal: unknown } | undefined;
    const creativeReview = buildVisionReview({
      analysis,
      plan: (result as any).compositionPlan || null,
      dna: (result as any).typographyDna || null,
      blueprint: (result as any).creativeBlueprint || null,
      design: (editable as any) || null,
      // The composition map is not carried whole. What the design recorded of
      // it -- the product box and the focal point -- is what the placement
      // checks need, and the rest is left at zero rather than reconstructed.
      map: scene
        ? ({ size: 64, luminance: [], detail: [], product: scene.product, focal: scene.focal, mean_luminance: 0, mean_detail: 0 } as any)
        : null,
    });
    console.log("[VISION_REVIEW][CREATIVE]", visionReviewTelemetry(creativeReview));
    for (const issue of creativeReview.detected_issues) {
      console.log("[VISION_REVIEW][ISSUE]", { owner: issue.owner, severity: issue.severity, because: issue.because });
    }

    const telemetry: VisionReviewTelemetry = {
      vision_called: true,
      analyzed_image: analysis.analyzed_image,
      second_render_created: false,
      second_render_selected: false,
      rejected_actions: dropped.length,
      untranslated_findings: decisions.untranslated.length,
    };

    // Counts, confidences and action names only. No finding text, which
    // describes the customer's product and copy.
    console.log("[VISION_REVIEW]", { ...telemetry, ...designDecisionTelemetry(decisions) });

    if (RenderTracer.isTraceEnabled()) {
      RenderTracer.stage({
        stageNum: "16",
        name: "VISION REVIEW & MULTIMODAL ANALYSIS",
        file: "apps/web/lib/image-engine/evolution/VisionReviewLayer.ts",
        func: "reviewRender",
        input: {
          image_bytes: result.imageBuffer?.length ?? 0,
          expected_copy: expectedCopy,
          product_description: request.concept,
        },
        decision: {
          analyzed_image: analysis.analyzed_image,
          typography_critique: analysis.typography_critique ? "generated" : "none",
          creative_review_issues: creativeReview.detected_issues.length,
          design_decisions_count: (decisions as any).decisions?.length || (decisions as any).actions?.length || 0,
          untranslated_findings: decisions.untranslated.length,
        },
        output: {
          telemetry,
          analysis_data: (analysis as any).overall_quality || (analysis as any).text_check || null,
          improvement_actions: analysis.improvement_actions,
        },
        nextStage: "CORRECTION DECISION & BUDGET EVALUATION",
      });
    }

    // Is there time to act on what was found?
    //
    // This is the fix for the failure that blocked this loop for two phases.
    // The route aborts the whole request at 180s; a correction pass is a
    // SECOND full render through the same pipeline, and the analysis calls sit
    // on top. Measured: 56s for a render alone, 136s with one vision loop. Put
    // those together with a slower provider and the request dies -- taking the
    // already-finished picture with it.
    //
    // So the correction is the thing that yields. The analysis is already done
    // and gets persisted either way; what is skipped is only the second render,
    // which is an improvement rather than the product. A user waiting for a
    // poster would rather have the first one than an error.
    const remaining = budget ? budget.deadlineAt - Date.now() : Number.POSITIVE_INFINITY;
    // 1.25x the first render, plus room for the review of the second.
    const needed = budget ? correctionNeededMs(budget, Date.now() - visionStart) : 0;
    const haveTime = remaining > needed;

    const instruction = renderDesignDecisions(decisions);

    if (RenderTracer.isTraceEnabled()) {
      RenderTracer.stage({
        stageNum: "17",
        name: "CORRECTION DECISION & BUDGET EVALUATION",
        file: "apps/web/lib/image-engine/evolution/VisionReviewLayer.ts",
        func: "reviewRender",
        input: {
          remaining_ms: remaining,
          needed_ms: needed,
          haveTime,
          instruction_present: Boolean(instruction),
          analyzed_image: analysis.analyzed_image,
        },
        decision: {
          correction_triggered: Boolean(analysis.analyzed_image && instruction && haveTime),
          skip_reason: !analysis.analyzed_image
            ? "analyzed_image_false"
            : !instruction
            ? "no_actionable_instruction"
            : !haveTime
            ? "insufficient_time_budget"
            : "none",
          instruction_preview: instruction ? instruction.slice(0, 150) : "none",
        },
        output: {
          instruction: instruction || null,
          will_rerender: Boolean(analysis.analyzed_image && instruction && haveTime),
        },
        nextStage: Boolean(analysis.analyzed_image && instruction && haveTime) ? "second_render" : "response",
      });
    }
    if (!analysis.analyzed_image || !instruction || !haveTime) {
      if (instruction && !haveTime) {
        // Named explicitly so this is distinguishable in a log from "found
        // nothing" -- they are very different states and look identical in the
        // returned shape.
        console.log("[VISION_REVIEW] corrections found but skipped: insufficient time", {
          remaining_ms: Math.max(0, Math.round(remaining)),
          needed_ms: Math.round(needed),
        });
      }
      const kept = carryDesignContext(
        { ...result, visionAnalysis: analysis, visionReview: telemetry, designDecisions: decisions },
        result,
      );
      return withTrace(kept, {
        versions: [{ version: 1, imageUrl: result.imageUrl || "", prompt: promptOf(result), analysis }],
        instruction: null,
        selected: 1,
      });
    }

    // Something real was found and it translated into structured changes. This
    // is the only branch that spends a second render.
    // Bounded, not merely estimated. The estimate decides whether to start; this
    // guarantees the route's deadline is never what ends the request. A second
    // render still running when its share of the time is up is abandoned and
    // the first picture is served -- the loop's default in every other branch.
    const reserve = visionReserveMs(Date.now() - visionStart);
    const renderWindow = budget ? budget.deadlineAt - Date.now() - reserve - DEADLINE_MARGIN_MS : Number.POSITIVE_INFINITY;
    let second: SimpleImageGenerationResultV1 | null = null;
    try {
      second = await withinMs(rerender(instruction), renderWindow);
      if (!second) console.warn("[VISION_REVIEW] second render abandoned: it would have outrun the request deadline");
    } catch (e: any) {
      console.warn("[VISION_REVIEW] second render failed:", e?.message || String(e));
    }

    if (!second?.success || !second.imageUrl || !second.imageBuffer) {
      const kept = carryDesignContext(
        {
          ...result,
          visionAnalysis: analysis,
          visionReview: telemetry,
          // The decisions were made and a correction was attempted, so they are
          // part of the record even though no corrected picture came back.
          designDecisions: decisions,
          renderComparison: {
            first: result.imageUrl || "",
            second: "",
            recommendation: "the first render was kept; the corrected render did not complete",
          },
        },
        result,
      );
      return withTrace(kept, {
        versions: [{ version: 1, imageUrl: result.imageUrl || "", prompt: promptOf(result), analysis }],
        instruction,
        selected: 1,
      });
    }
    telemetry.second_render_created = true;

    // The second render is reviewed on the same terms as the first. Assuming a
    // correction pass improved something is how a loop ships regressions: a
    // second render genuinely can come back worse, and on live data it already
    // has.
    let secondAnalysis = null as Awaited<ReturnType<typeof analyzer.analyze>> | null;
    try {
      // Bounded the same way. No review in time means no evidence the second
      // is better, and the comparison is conservative on ignorance.
      secondAnalysis = await withinMs(
        analyzer.analyze({
          image: second.imageBuffer,
          expectedCopy,
      textRequirement,
          productDescription: request.concept,
        }),
        budget ? budget.deadlineAt - Date.now() - DEADLINE_MARGIN_MS : Number.POSITIVE_INFINITY,
      );
    } catch {
      secondAnalysis = null;
    }

    // Compared as a designer would compare them -- what got better, what got
    // worse, and what did not move -- rather than by a single problem count.
    // Conservative on ties and on ignorance: replacing a result the user is
    // about to see has to be earned, not assumed.
    const quality = compareDesignQuality(analysis, secondAnalysis);
    const secondWins = quality.recommendation === "second";
    telemetry.second_render_selected = secondWins;

    if (RenderTracer.isTraceEnabled()) {
      RenderTracer.stage({
        stageNum: "18",
        name: "CORRECTION RE-RENDER & WINNER SELECTION",
        file: "apps/web/lib/image-engine/evolution/VisionReviewLayer.ts",
        func: "reviewRender",
        input: {
          first_render_url: result.imageUrl,
          second_render_url: second.imageUrl,
          recommendation: quality.recommendation,
          overall_reasoning: quality.overall_reasoning,
        },
        decision: {
          winner: secondWins ? "second_render" : "first_render",
          recommendation: quality.recommendation,
          overall_reasoning: quality.overall_reasoning,
        },
        output: {
          selected_version: secondWins ? 2 : 1,
          selected_image_url: secondWins ? second.imageUrl : result.imageUrl,
        },
        nextStage: "response",
      });
    }

    console.log("[VISION_REVIEW][OUTCOME]", telemetry);

    const chosen = secondWins ? second : result;
    const served = carryDesignContext(
      {
        ...chosen,
        // The analysis shown is always the one for the image being returned.
        visionAnalysis: secondWins && secondAnalysis ? secondAnalysis : analysis,
        visionReview: telemetry,
        designDecisions: decisions,
        designComparison: quality,
        renderComparison: {
          first: result.imageUrl || "",
          second: second.imageUrl || "",
          recommendation: quality.overall_reasoning,
        },
      },
      chosen,
      secondWins ? result : second,
    );
    return withTrace(served, {
      versions: [
        { version: 1, imageUrl: result.imageUrl || "", prompt: promptOf(result), analysis },
        { version: 2, imageUrl: second.imageUrl || "", prompt: promptOf(second), analysis: secondAnalysis },
      ],
      instruction,
      selected: secondWins ? 2 : 1,
      comparison: quality,
    });
  } catch (err: any) {
    // A commentary on a picture is never worth the picture.
    console.warn("[VISION_REVIEW] skipped:", err?.message || String(err));
    return result;
  }
}
