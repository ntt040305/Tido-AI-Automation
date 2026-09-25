import {
  SimpleImageGenerationResultV1,
  SimpleInputRequestV1,
} from "../types";
import type { SimpleImageGenerationOrchestratorService } from "../service/SimpleImageGenerationOrchestratorService";
import { CORE_FEATURES, FeatureFlags, readFlags } from "./feature-flags";
import { PIPELINE_VERSIONS, PipelineId, resolveComponentVersions } from "./pipeline-versions";
import { ExperimentPipeline } from "./ExperimentPipeline";
import { logGeneration } from "./ExperimentLogger";
import { reviewRender, correctedRequest } from "./VisionReviewLayer";
import type { RouteEvidence } from "./experiment/DirectionEvaluator";
import type { CreativeJudgment } from "./experiment/CreativeDirectorV1";
// Aliased: the context below is guarded against anything that identifies a
// PERSON, and brand identity is data about a brand, never about who is asking.
import type { BrandKit as BrandIdentity } from "./experiment/BrandKit";

/**
 * The entry point of the one creative pipeline.
 *
 * Phase 5.5.5 — Experience consolidation. This used to choose between two
 * pipelines by rollout mode, tester id and A/B bucket, which meant everybody
 * outside one tester id was served the bare render core with every creative
 * layer off. There is now one pipeline and nothing to choose: every request
 * gets the Experience architecture. What remains here is the part that was
 * always worth keeping --
 *
 *   - the decision (flags in force, versions, why) computed before generation
 *     and logged with the result, so an output can be attributed
 *   - the vision review, run once above the pipeline
 *   - routing metadata attached for persistence
 *
 * Reliability did not live in the old stable/experiment choice, and does not
 * need it: when the director fails or the kill switch is set, the pipeline
 * itself renders through the core without it.
 *
 * What it deliberately does NOT do: touch accounts, uploads, products, billing,
 * history or permissions. It receives a generation request and returns a
 * generation result. Data safety here is structural rather than enforced by
 * review.
 */

export interface RoutingContext {
  /**
   * When the caller will give up on this request, as a wall-clock timestamp.
   *
   * Supplied so the vision review can tell whether there is time for a
   * correction render before the route aborts. Absent means unbounded, which
   * is right for a benchmark and wrong for a web request.
   */
  deadlineAt?: number;
  /**
   * Standing creative preferences to apply where the brief is silent.
   *
   * Plain sentences, and deliberately nothing more. Whoever these belong to,
   * and where they were looked up, is resolved entirely outside this layer --
   * which is why the name says nothing about a person. This engine takes a
   * request and returns a picture; it has no identifier for anyone and no path
   * to an account, and a mistake here therefore cannot reach anyone's data.
   *
   * Everything that arrives has already passed the caller's own threshold, so
   * none of it is a single render mistaken for a taste. None of it outranks
   * the current brief.
   */
  standingPreferences?: string[];
  /**
   * What this workspace's own work suggests, where the brief is silent.
   *
   * Phase 3.5. Plain sentences again, and resolved entirely outside this layer
   * for the same reason preferences are: the engine has no account, no store
   * and no way to look anything up, so a mistake here cannot reach anyone's
   * data.
   *
   * Separate from `standingPreferences` because the two have different
   * authority and different failure modes. A preference is about a PERSON and
   * they stated or repeated it; this is about a body of WORK and is a
   * statistical observation over it. Merging them would let a pattern seen
   * three times present itself with the weight of something a customer asked
   * for.
   *
   * Everything here has already passed the caller's own support threshold, and
   * none of it outranks the brief.
   */
  creativeMemory?: string[];
  /**
   * Phase 4.2. How each route has gone for this account: renders, keeps,
   * rejections, vision problems, thresholded preference. Numbers and route
   * names only -- resolved above the boundary like the two fields above, and
   * read by the evaluator and the director's brief.
   */
  routeEvidence?: RouteEvidence[];
  /**
   * Phase 5.4. The brand identity the caller resolved for this render:
   * colours, fonts, style rules, whether a logo is attached. Plain data about
   * a brand -- loaded and authorised above the boundary, like every other
   * memory input -- and nothing about who asked for it.
   */
  brand?: BrandIdentity | null;
  /**
   * Phase 5.5. Render in Editable mode: the scene without text or logo, every
   * other layer placed from the design document. A property of the request,
   * never of a person.
   */
  editable?: boolean;
}

export interface RoutingDecision {
  pipeline: PipelineId;
  /** Carried from the context so the experiment path can consult it. */
  standingPreferences?: string[];
  creativeMemory?: string[];
  routeEvidence?: RouteEvidence[];
  brandKit?: BrandIdentity | null;
  /** Phase 5.5. See `RoutingContext.editable`. */
  editableLayers?: boolean;
  /**
   * Phase 4.5. Set only on the vision correction pass: the judgment the first
   * render was made from. The correction improves the CHOSEN direction; it does
   * not send the director back to choose a new one, which is what re-running
   * the whole pipeline used to do.
   */
  pinnedJudgment?: CreativeJudgment | null;
  pipeline_version: string;
  reason: string;
  flags: FeatureFlags;
  component_versions: Record<string, string>;
  features_enabled: string[];
}

export class PipelineRouter {
  /** The decision for this request: flags in force, versions, and why. */
  public static decide(
    _request: Pick<SimpleInputRequestV1, "requestId">,
    context: RoutingContext = {}
  ): RoutingDecision {
    const flags = readFlags();
    // One pipeline. The id stays "experiment" so every run recorded before and
    // after consolidation is comparable in the same column.
    const pipeline: PipelineId = "experiment";
    const coreOn = CORE_FEATURES.every((f) => flags.features[f]);
    const reason = coreOn ? "experience pipeline" : "kill switch: core features off, rendering without the director";

    const features_enabled = (Object.keys(flags.features) as (keyof FeatureFlags["features"])[]).filter((f) => flags.features[f]);

    return {
      pipeline,
      ...(context.standingPreferences?.length ? { standingPreferences: context.standingPreferences } : {}),
      ...(context.creativeMemory?.length ? { creativeMemory: context.creativeMemory } : {}),
      ...(context.routeEvidence?.length ? { routeEvidence: context.routeEvidence } : {}),
      ...(context.brand ? { brandKit: context.brand } : {}),
      ...(context.editable ? { editableLayers: true } : {}),
      pipeline_version: PIPELINE_VERSIONS[pipeline],
      reason,
      flags,
      component_versions: resolveComponentVersions(pipeline, flags.components),
      features_enabled: features_enabled as string[],
    };
  }

  /**
   * Decides, runs, reviews.
   *
   * The single entry point the API route calls. Its contract is identical to
   * `SimpleImageGenerationOrchestratorService.generateSimpleImage`.
   */
  public static async run(
    request: SimpleInputRequestV1,
    options?: Parameters<typeof SimpleImageGenerationOrchestratorService.generateSimpleImage>[1],
    context: RoutingContext = {}
  ): Promise<SimpleImageGenerationResultV1> {
    const decision = this.decide(request, context);
    const startedAt = Date.now();

    console.log("[EVOLUTION][ROUTE]", {
      pipeline: decision.pipeline,
      version: decision.pipeline_version,
      reason: decision.reason,
      features: decision.features_enabled,
    });

    const result: SimpleImageGenerationResultV1 = await ExperimentPipeline.run(request, options, decision);

    // The image now exists. Everything past this line is review, and review is
    // not allowed to change whether the render succeeded.
    //
    // This is the right altitude for it: one insertion point, above the
    // pipeline, and `evolution/` is where reading a flag is allowed, so nothing
    // in `service/` or `compiler/` learns that this feature exists.
    // How long the render actually took, measured rather than assumed. The
    // review uses it to estimate a second one, since that is the same pipeline
    // doing the same work under the same provider load.
    const firstRenderMs = Date.now() - startedAt;

    const reviewed = await reviewRender(
      result,
      request,
      decision,
      (instruction) =>
        ExperimentPipeline.run(correctedRequest(request, instruction), options, {
          ...decision,
          // The direction the first render was made from. Pinned so the
          // correction refines it instead of the director starting over.
          pinnedJudgment: ((result as unknown as Record<string, unknown>).creativeJudgment as CreativeJudgment) ?? null,
        }),
      context.deadlineAt
        ? {
            firstRenderMs,
            deadlineAt: context.deadlineAt,
            // Time the correction pass will NOT spend, because its judgment is
            // pinned. Without this the estimate charged the second render for a
            // director call it never makes, and refused nearly every correction.
            directorMs:
              ((result as unknown as Record<string, unknown>).creativeJudgment as CreativeJudgment | undefined)
                ?.evaluation?.director_ms ?? 0,
          }
        : undefined,
    );

    logGeneration(decision, reviewed, Date.now() - startedAt);

    // Which pipeline actually served this, attached for the persistence layer
    // above. Non-enumerable for the same reason the design context is: it is
    // routing metadata, not part of the API contract, and must not ride into a
    // JSON response. Without it a recorded run cannot say which path produced
    // it, which is the one thing attribution needs.
    Object.defineProperty(reviewed, "routingDecision", {
      value: {
        pipeline: decision.pipeline,
        pipeline_version: decision.pipeline_version,
        features_enabled: decision.features_enabled,
      },
      enumerable: false,
      configurable: true,
    });

    return reviewed;
  }
}
