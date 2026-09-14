import crypto from "crypto";
import {
  SimpleImageGenerationResultV1,
  SimpleInputRequestV1,
} from "../types";
import { FeatureFlags, readFlags } from "./feature-flags";
import { PIPELINE_VERSIONS, PipelineId, resolveComponentVersions } from "./pipeline-versions";
import { StablePipeline } from "./StablePipeline";
import { ExperimentPipeline } from "./ExperimentPipeline";
import { logGeneration } from "./ExperimentLogger";

/**
 * Chooses which pipeline serves a request, and never makes that choice
 * interesting.
 *
 * Everything here is arranged so that the default path is the shortest one. A
 * request with no flags set, no tester id and no overrides reaches
 * `StablePipeline.run` having been through one boolean check and a version
 * lookup. The routing layer is not allowed to be the thing that breaks
 * generation, so:
 *
 *   - any throw inside routing falls through to stable rather than propagating
 *   - the experiment pipeline runs the stable components until a feature flag
 *     says otherwise, so a routing mistake is not a behaviour change
 *   - the decision is computed before generation starts and logged with the
 *     result, so a surprising output can be attributed rather than guessed at
 *
 * What it deliberately does NOT do: touch accounts, uploads, products, billing,
 * history or permissions. It receives a generation request and returns a
 * generation result. Data safety here is structural rather than enforced by
 * review.
 */

export interface RoutingContext {
  /**
   * Opaque tester identifier, when the caller supplied one.
   *
   * Never an email or any other personal identifier: this value is written to
   * logs, and a log is the wrong home for one. The admin surface issues these.
   */
  testerId?: string;
  /**
   * Forces a pipeline for this request alone. Used by benchmarks that need to
   * compare the two directly. It cannot enable any feature flag, so a forced
   * experiment run with no features on is still stable behaviour.
   */
  forcePipeline?: PipelineId;
}

export interface RoutingDecision {
  pipeline: PipelineId;
  pipeline_version: string;
  reason: string;
  flags: FeatureFlags;
  component_versions: Record<string, string>;
  features_enabled: string[];
}

/**
 * Deterministic 0-99 bucket for A/B.
 *
 * Hashed rather than random so a retried request lands in the same bucket as its
 * first attempt. A coin flip per attempt would split one user's two tries across
 * both pipelines and make the comparison meaningless.
 */
function bucketOf(key: string): number {
  const digest = crypto.createHash("sha1").update(key).digest();
  return digest.readUInt16BE(0) % 100;
}

export class PipelineRouter {
  /** Resolves which pipeline should serve this request, and why. */
  public static decide(
    request: Pick<SimpleInputRequestV1, "requestId">,
    context: RoutingContext = {}
  ): RoutingDecision {
    let flags = readFlags();
    let pipeline: PipelineId = "stable";
    let reason = "default";

    try {
      if (context.forcePipeline) {
        pipeline = context.forcePipeline;
        reason = "forced by caller";
      } else if (flags.active_pipeline !== "experiment") {
        pipeline = "stable";
        reason = "active_pipeline is stable";
      } else {
        switch (flags.rollout_mode) {
          case "production":
            pipeline = "experiment";
            reason = "experiment active for all traffic";
            break;
          case "internal_only": {
            const allowed = Boolean(context.testerId) && flags.internal_testers.includes(context.testerId!);
            pipeline = allowed ? "experiment" : "stable";
            reason = allowed ? "internal tester" : "not an internal tester";
            break;
          }
          case "ab_testing": {
            // Bucketed on the request id so the same request always resolves the
            // same way. Absent an id there is nothing stable to hash, and an
            // unattributable sample is worse than a smaller one, so it goes to
            // stable rather than to a coin flip.
            const key = request.requestId || "";
            if (!key) {
              pipeline = "stable";
              reason = "ab_testing without a request id";
            } else {
              const bucket = bucketOf(key);
              pipeline = bucket < flags.ab_percentage ? "experiment" : "stable";
              reason = `ab_testing bucket ${bucket} of ${flags.ab_percentage}%`;
            }
            break;
          }
          default:
            pipeline = "stable";
            reason = "unrecognised rollout mode";
        }
      }
    } catch (err: any) {
      // Routing is not permitted to fail a generation. Falling back here rather
      // than rethrowing means the worst case of a broken flag file is that
      // production behaves exactly as it did before this layer existed.
      console.warn("[EVOLUTION][ROUTER] decision failed, falling back to stable", {
        error: err?.message || String(err),
      });
      pipeline = "stable";
      reason = "router error, fell back to stable";
    }

    const features_enabled =
      pipeline === "experiment"
        ? (Object.keys(flags.features) as (keyof FeatureFlags["features"])[]).filter((f) => flags.features[f])
        : [];

    return {
      pipeline,
      pipeline_version: PIPELINE_VERSIONS[pipeline],
      reason,
      flags,
      component_versions: resolveComponentVersions(pipeline, pipeline === "experiment" ? flags.components : {}),
      features_enabled: features_enabled as string[],
    };
  }

  /**
   * Routes and runs.
   *
   * The single entry point the API route calls. Its contract is identical to
   * `SimpleImageGenerationOrchestratorService.generateSimpleImage`, so the call
   * site changes by one identifier and nothing else.
   */
  public static async run(
    request: SimpleInputRequestV1,
    options?: Parameters<typeof StablePipeline.run>[1],
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

    let result: SimpleImageGenerationResultV1;
    if (decision.pipeline === "experiment") {
      result = await ExperimentPipeline.run(request, options, decision);
    } else {
      result = await StablePipeline.run(request, options);
    }

    logGeneration(decision, result, Date.now() - startedAt);
    return result;
  }
}
