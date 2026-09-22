import type { SimpleImageGenerationResultV1, SimpleInputRequestV1 } from "../types";
import type { RoutingDecision } from "./PipelineRouter";

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
export async function reviewRender(
  result: SimpleImageGenerationResultV1,
  request: SimpleInputRequestV1,
  decision: RoutingDecision,
  rerender: (instruction: string) => Promise<SimpleImageGenerationResultV1>,
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

    const analyzer = new VisionAnalyzerService();
    const expectedCopy = (request.copyItems || [])
      .map((i: any) => (typeof i === "string" ? i : i?.text))
      .filter(Boolean);

    const analysis = await analyzer.analyze({
      image: result.imageBuffer,
      expectedCopy,
      productDescription: request.concept,
    });

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

    const instruction = renderDesignDecisions(decisions);
    if (!analysis.analyzed_image || !instruction) {
      return {
        ...result,
        visionAnalysis: analysis,
        visionReview: telemetry,
        designDecisions: decisions,
      };
    }

    // Something real was found and it translated into structured changes. This
    // is the only branch that spends a second render.
    let second: SimpleImageGenerationResultV1 | null = null;
    try {
      second = await rerender(instruction);
    } catch (e: any) {
      console.warn("[VISION_REVIEW] second render failed:", e?.message || String(e));
    }

    if (!second?.success || !second.imageUrl || !second.imageBuffer) {
      return {
        ...result,
        visionAnalysis: analysis,
        visionReview: telemetry,
        renderComparison: {
          first: result.imageUrl || "",
          second: "",
          recommendation: "the first render was kept; the corrected render did not complete",
        },
      };
    }
    telemetry.second_render_created = true;

    // The second render is reviewed on the same terms as the first. Assuming a
    // correction pass improved something is how a loop ships regressions: a
    // second render genuinely can come back worse, and on live data it already
    // has.
    let secondAnalysis = null as Awaited<ReturnType<typeof analyzer.analyze>> | null;
    try {
      secondAnalysis = await analyzer.analyze({
        image: second.imageBuffer,
        expectedCopy,
        productDescription: request.concept,
      });
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

    console.log("[VISION_REVIEW][OUTCOME]", telemetry);

    const chosen = secondWins ? second : result;
    return {
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
    };
  } catch (err: any) {
    // A commentary on a picture is never worth the picture.
    console.warn("[VISION_REVIEW] skipped:", err?.message || String(err));
    return result;
  }
}
