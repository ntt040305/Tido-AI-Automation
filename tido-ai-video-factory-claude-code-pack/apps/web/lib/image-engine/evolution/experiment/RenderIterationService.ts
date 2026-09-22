import {
  VisionAnalysisResult,
  VisionAction,
  sanitizeActions,
  hasActionableFindings,
  emptyVisionAnalysis,
  visionAnalysisTelemetry,
} from "./VisionAnalysisResult";
import type { VisionAnalyzerService } from "./VisionAnalyzerService";

/**
 * Render, look, fix, render again, keep the better one.
 *
 * This is the orchestration only. The two hard parts already existed and are
 * reused rather than rebuilt: `VisionAnalyzerService` does the looking, and
 * `RenderIterationEngine.select` does the choosing -- a pure comparator that
 * was written, tested and then never called by anything but its own tests.
 *
 * What this service adds is the part that was genuinely missing: the step that
 * turns observations into an instruction and spends a second render on it.
 *
 * Three rules it enforces, each guarding a specific way this goes wrong
 * ---------------------------------------------------------------------
 * IT NEVER RUNS UNINVITED. The caller passes the analyzer and the rerender
 * function. With either absent the service returns the first render untouched.
 * A loop that costs a model call and a second image must be switched on
 * deliberately, which is what `vision_iteration_v1` is for.
 *
 * IT NEVER ACTS ON AN UNSEEN VERDICT. `hasActionableFindings` requires
 * `analyzed_image`, so a failed or absent analysis produces no second render
 * rather than a confident one built on nothing.
 *
 * IT NEVER REWRITES THE DIRECTION. Only actions inside CORRECTABLE_SCOPES reach
 * the instruction, and the instruction is explicitly framed as a correction to
 * apply while holding everything else constant. A vision model shown one frame
 * has no idea why the director chose a sparse, off-centre, high-contrast
 * treatment, and given latitude it will regress every interesting decision
 * toward the average poster. The loop fixes mistakes; it does not get a vote on
 * the idea.
 */

export interface RenderComparisonResult {
  /** A reference to the first render -- a URL or id, whatever the caller uses. */
  first: string;
  /** The second, when one was taken. Empty when it was not. */
  second: string;
  /** Which to keep, and why, in plain language. */
  recommendation: string;
}

export interface RenderIterationOutcome {
  /** The render to show. The first unless the second genuinely beat it. */
  chosen: RenderAttempt;
  first: RenderAttempt;
  second?: RenderAttempt;
  analysis: VisionAnalysisResult;
  comparison: RenderComparisonResult;
  /** The correction block sent to the second render, when one was sent. */
  improvement_instruction?: string;
  /** Actions the model proposed that fell outside what the loop may change. */
  rejected_actions: VisionAction[];
}

export interface RenderAttempt {
  version: number;
  /** Whatever identifies the image to the caller. */
  imageUrl: string;
  imageBuffer?: Buffer;
}

export interface RenderIterationInput {
  first: RenderAttempt;
  /** Absent means no second render is possible; the loop degrades to analysis. */
  rerender?: (instruction: string) => Promise<RenderAttempt | null>;
  analyzer?: VisionAnalyzerService | null;
  expectedCopy?: string[];
  productDescription?: string;
}

/**
 * Builds the correction block for the second render.
 *
 * Framed as an amendment rather than a brief. The renderer is told what to hold
 * constant first, because an instruction that opens with a list of problems
 * invites a from-scratch reinterpretation, which is precisely the failure the
 * scope allowlist exists to prevent.
 */
export function buildImprovementInstruction(actions: VisionAction[]): string | undefined {
  const { kept } = sanitizeActions(actions);
  if (!kept.length) return undefined;

  const lines = kept.map((a) => `- ${a.action}${a.because ? ` (${a.because})` : ""}`);
  return [
    "CORRECTIONS TO THE PREVIOUS RENDER",
    "",
    "Keep the creative direction, composition, palette, lighting and mood exactly as they are.",
    "This is a correction pass, not a reinterpretation. Change only what is listed:",
    "",
    ...lines,
  ].join("\n");
}

export class RenderIterationService {
  /**
   * Runs the loop. Never throws: any failure degrades to the first render,
   * which is always a valid answer.
   */
  public async run(input: RenderIterationInput): Promise<RenderIterationOutcome> {
    const first = input.first;

    const noSecond = (
      analysis: VisionAnalysisResult,
      recommendation: string,
      instruction?: string,
      rejected: VisionAction[] = [],
    ): RenderIterationOutcome => ({
      chosen: first,
      first,
      analysis,
      comparison: { first: first.imageUrl, second: "", recommendation },
      ...(instruction ? { improvement_instruction: instruction } : {}),
      rejected_actions: rejected,
    });

    if (!input.analyzer) {
      return noSecond(
        emptyVisionAnalysis("vision analysis was not enabled for this render"),
        "the first render was kept; nothing looked at it",
      );
    }

    let analysis: VisionAnalysisResult;
    try {
      analysis = await input.analyzer.analyze({
        image: first.imageBuffer as Buffer,
        expectedCopy: input.expectedCopy,
        productDescription: input.productDescription,
      });
    } catch (e: any) {
      analysis = emptyVisionAnalysis(`the vision pass failed: ${e?.message || String(e)}`);
    }

    console.log("[VISION_LOOP]", visionAnalysisTelemetry(analysis));

    const { kept, dropped } = sanitizeActions(analysis.improvement_actions);

    if (!hasActionableFindings(analysis)) {
      return noSecond(
        analysis,
        analysis.analyzed_image
          ? "the first render was kept; the review found nothing that needed changing"
          : "the first render was kept; the image could not be reviewed",
        undefined,
        dropped,
      );
    }

    const instruction = buildImprovementInstruction(kept);
    if (!instruction || !input.rerender) {
      return noSecond(
        analysis,
        "the first render was kept; corrections were found but a second render was not available",
        instruction,
        dropped,
      );
    }

    let second: RenderAttempt | null = null;
    try {
      second = await input.rerender(instruction);
    } catch (e: any) {
      console.warn("[VISION_LOOP] second render failed:", e?.message || String(e));
    }

    if (!second?.imageUrl) {
      return noSecond(
        analysis,
        "the first render was kept; the corrected render did not complete",
        instruction,
        dropped,
      );
    }

    // Both renders exist. Which one ships is decided by looking at the second,
    // not by assuming a correction pass improved anything -- a second render
    // can and does come back worse.
    let secondAnalysis: VisionAnalysisResult | null = null;
    try {
      secondAnalysis = await input.analyzer.analyze({
        image: second.imageBuffer as Buffer,
        expectedCopy: input.expectedCopy,
        productDescription: input.productDescription,
      });
    } catch {
      secondAnalysis = null;
    }

    const firstProblems = countProblems(analysis);
    const secondProblems = secondAnalysis?.analyzed_image ? countProblems(secondAnalysis) : null;

    // Conservative on ties and on ignorance: the second render has to be
    // demonstrably better to justify replacing a result the user has already
    // been shown. This mirrors RenderIterationEngine.select, which refuses to
    // promote a version that merely matched.
    const secondWins = secondProblems !== null && secondProblems < firstProblems;

    const recommendation =
      secondProblems === null
        ? `the first render was kept; the corrected version could not be reviewed, so there was no basis to prefer it`
        : secondWins
          ? `the corrected render was kept; it resolved ${firstProblems - secondProblems} of ${firstProblems} observed problems`
          : `the first render was kept; the corrected version did not reduce the ${firstProblems} observed problems`;

    return {
      chosen: secondWins ? second : first,
      first,
      second,
      analysis,
      comparison: { first: first.imageUrl, second: second.imageUrl, recommendation },
      improvement_instruction: instruction,
      rejected_actions: dropped,
    };
  }
}

/** How much is wrong with a render, counted rather than scored. */
function countProblems(r: VisionAnalysisResult): number {
  return (
    r.issues.length +
    r.typography_problems.length +
    r.layout_problems.length +
    r.product_accuracy.length
  );
}

/** Counts only -- never the findings, which describe customer content. */
export function iterationServiceTelemetry(o: RenderIterationOutcome | null | undefined) {
  if (!o) return { vision_loop: false };
  return {
    vision_loop: true,
    analyzed_image: o.analysis.analyzed_image,
    second_render: Boolean(o.second),
    chose_second: Boolean(o.second && o.chosen.version === o.second.version),
    rejected_actions: o.rejected_actions.length,
  };
}
