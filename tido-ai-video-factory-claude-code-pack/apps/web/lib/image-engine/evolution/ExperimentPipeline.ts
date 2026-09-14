import { SimpleImageGenerationResultV1, SimpleInputRequestV1 } from "../types";
import { ImgStudioImageGenerationProvider } from "../provider/ImgStudioImageGenerationProvider";
import type { ImageGenerationProvider, ProviderImageGenerationInput } from "../provider/ImageGenerationProvider";
import { StablePipeline } from "./StablePipeline";
import type { RoutingDecision } from "./PipelineRouter";
import { PromptBudgetManagerService } from "../service/PromptBudgetManagerService";
import { PromptBudgetValidator } from "../compiler/PromptBudgetValidator";
import { ProviderPromptOptimizer } from "../compiler/ProviderPromptOptimizer";
import { CreativeDirectorV1, CreativeJudgment } from "./experiment/CreativeDirectorV1";
import { NanoBananaPromptComposer, TypographyFixes } from "./experiment/NanoBananaPromptComposer";
import { AUTO } from "../director/visual-controls.types";
import { applyCreativeDecision, decisionTelemetry, toCreativeDecision } from "./experiment/CreativeDecision";
import { assetContextBrief, assetContextFor } from "./experiment/AssetContext";

/**
 * V4.0.5_EXPERIMENT — Creative Judgment V1.
 *
 * How this changes a render without changing a stable file
 * -------------------------------------------------------
 * Two seams that already existed:
 *
 *   1. `CreativeDirectorV1` runs BEFORE the orchestrator and produces a document
 *      about the brief. It reads nothing the pipeline owns and writes nothing.
 *
 *   2. The orchestrator takes a `generationProvider` in its options and calls it
 *      once, with the finished prompt. Wrapping that provider gives the
 *      experiment the final prompt after the compiler, the optimizer, the
 *      knowledge system and the art-direction resolver have all run exactly as
 *      they do on stable.
 *
 * So the compiler is not forked, the brain is not branched, and no file outside
 * `evolution/` is touched. The stable path is byte-identical because it is
 * literally the same code with a different provider instance at the end.
 *
 * Why the wrapper and not a compiler subclass
 * -------------------------------------------
 * A subclass would have to re-enter `compile()`, a single long method, and every
 * future stable change to it would silently become an experiment change too. The
 * wrapper's contract is one function and one string, which is a seam that can be
 * reasoned about a year from now.
 *
 * Cost, stated plainly: one additional LLM call per experiment render, and a
 * longer prompt. Neither applies to stable, and both stop the moment a flag is
 * turned off.
 */
export class ExperimentPipeline {
  public static readonly VERSION = "V4.0.5_EXPERIMENT";

  /**
   * Wraps a provider so the experiment can shape the prompt it receives.
   *
   * The wrapper delegates everything else untouched: same references, same
   * aspect ratio, same model, same manifest. Only `prompt` differs, and only
   * when a judgment was produced.
   */
  private static wrapProvider(
    inner: ImageGenerationProvider,
    judgment: CreativeJudgment | null,
    controlled = false,
    fixes?: TypographyFixes
  ): ImageGenerationProvider {
    return {
      async generateImage(input: ProviderImageGenerationInput) {
        const composed = NanoBananaPromptComposer.compose(input.prompt, judgment, controlled, fixes);
        if (composed !== input.prompt) {
          console.log("[EXPERIMENT][NANO_BANANA_PROMPT]", {
            stable_chars: input.prompt.length,
            experiment_chars: composed.length,
            delta: composed.length - input.prompt.length,
            // The thresholds this prompt had to survive, in the order they are
            // applied. Three of them are separate numbers in three files, and a
            // prompt that lands between any two of them behaves differently from
            // one that does not — which is invisible unless they are printed
            // next to the length they are being compared against.
            thresholds: {
              optimizer_hard_limit: ProviderPromptOptimizer.HARD_LIMIT,
              budget_reduction_starts_above: PromptBudgetManagerService.EMERGENCY_TARGET,
              budget_truncates_above: PromptBudgetManagerService.HARD_MAXIMUM,
              render_blocked_above: PromptBudgetValidator.DEFAULT_PROVIDER_HARD_LIMIT,
            },
            // Stated rather than implied: a reader should not have to compare
            // four numbers by eye to know whether this render was reduced.
            budget_reduction_expected:
              input.prompt.length > PromptBudgetManagerService.EMERGENCY_TARGET,
          });
        }
        return inner.generateImage({ ...input, prompt: composed });
      },
    };
  }

  public static async run(
    request: SimpleInputRequestV1,
    options: Parameters<typeof StablePipeline.run>[1],
    decision: RoutingDecision
  ): Promise<SimpleImageGenerationResultV1> {
    const f = decision.flags.features;
    const judgmentFlags = {
      exploration: Boolean(f.creative_exploration_v1),
      reasoning: Boolean(f.creative_reasoning_v1),
      antiGeneric: Boolean(f.anti_generic_check_v1),
      // V2. Independent of the three above and of each other, so a run can carry
      // brand reasoning without exploration, or review without semantics.
      strategy: Boolean(f.creative_strategy_intelligence_v1),
      consumer: Boolean(f.consumer_psychology_v1),
      brand: Boolean(f.brand_positioning_v1),
      semantics: Boolean(f.visual_semantics_v1),
      review: Boolean(f.creative_review_v1),
      // Typography Foundation Cleanup V1. Enabling this alone is a valid run:
      // the director is asked for nothing but the copy roles.
      copyRoles: Boolean(f.typography_roles_v1),
    };
    const controlled = Boolean(f.creative_director_control_v1);
    const assetAware = Boolean(f.asset_type_intelligence_v1);
    const bridge = Boolean(f.creative_bridge_v1);
    const rolesFix = Boolean(f.typography_roles_v1);
    const loopFix = Boolean(f.typography_control_priority_v1);
    const anyJudgment = Object.values(judgmentFlags).some(Boolean);

    if (!anyJudgment) {
      // Identical to stable, on purpose. Routing a request here is one decision;
      // changing what happens to it is another, and keeping them separate is
      // what makes the pipeline switch itself safe to verify in production.
      const IMPLEMENTED = [
        "creative_exploration_v1", "creative_reasoning_v1", "anti_generic_check_v1",
        "creative_strategy_intelligence_v1", "consumer_psychology_v1",
        "brand_positioning_v1", "visual_semantics_v1", "creative_review_v1",
        "creative_director_control_v1", "asset_type_intelligence_v1",
        "creative_bridge_v1", "typography_roles_v1", "typography_control_priority_v1",
      ];
      const otherFlags = decision.features_enabled.filter((n) => !IMPLEMENTED.includes(n));
      if (otherFlags.length) {
        console.warn("[EVOLUTION][EXPERIMENT] flags enabled with no implementation yet — running stable behaviour", {
          flags: otherFlags,
        });
      } else {
        console.log("[EVOLUTION][EXPERIMENT] no features enabled — running stable behaviour");
      }
      return StablePipeline.run(request, options);
    }

    const mc = request.marketingContext;
    // Null when the asset type is unrecognised, which leaves the director where
    // it was rather than handing it poster thinking for a format nobody mapped.
    const assetCtx = assetAware ? assetContextFor(request.useCase) : null;
    const judgment = await new CreativeDirectorV1().judge(
      {
        assetContext: assetCtx ? assetContextBrief(assetCtx) : undefined,
        concept: request.concept,
        contentMessage: request.contentMessage,
        brandName: request.brandName,
        useCase: request.useCase,
        aspectRatio: request.aspectRatio,
        industry: mc?.industry,
        objective: mc?.objective,
        audience: mc?.target_audience,
      },
      judgmentFlags
    );

    if (!judgment) {
      // The director declined or failed. Running stable is the honest response:
      // a reordered prompt with nothing new in it is a change with no upside,
      // and pretending the experiment ran would poison the comparison log.
      console.warn("[EVOLUTION][EXPERIMENT] no judgment produced — running stable behaviour");
      return StablePipeline.run(request, options);
    }

    // The orchestrator would construct this itself if options carried no
    // provider; constructing the same default here and wrapping it keeps the
    // provider choice identical to stable.
    const inner = options?.generationProvider || new ImgStudioImageGenerationProvider();

    // Control mode: the decision is written into the brief BEFORE the pipeline
    // runs, so the Marketing Brain elaborates it instead of competing with it.
    //
    // Ordering is the whole point. The director already ran; its output now goes
    // in at the front rather than being appended at the back, which is the
    // difference between one source of truth and two.
    let effectiveRequest = request;
    if (controlled) {
      const decision = toCreativeDecision(judgment);
      if (decision) {
        effectiveRequest = applyCreativeDecision(request, decision, bridge);
        // The communication goal travels as a hard requirement, not in the
        // concept: the concept is budget-constrained, and the brain does not
        // need to turn a goal into a scene — it needs to know what the scene it
        // already has must achieve.
        if (assetCtx) {
          effectiveRequest = {
            ...effectiveRequest,
            hardRequirements: [
              ...(effectiveRequest.hardRequirements || []),
              `This is a ${assetCtx.asset_type.replace(/_/g, " ")}. ${assetCtx.communication_goal} ${assetCtx.viewer_behavior}`,
            ],
          };
        }
        console.log("[EXPERIMENT][DIRECTOR_CONTROL]", decisionTelemetry(decision, effectiveRequest.concept));
      } else {
        // A judgment with no scene cannot take control of anything. Saying so
        // beats silently running in a mode the operator believes is active.
        console.warn("[EXPERIMENT][DIRECTOR_CONTROL] no scene in the judgment — control not applied");
      }
    }

    // What the user pinned themselves. A click outranks a decision \u2014
    // `VisualDirectionResolver` already says so, and the loop fix must not
    // quietly invert that for the one case where the preset is legitimate.
    const pinned = request.creativeDirection?.visual_controls?.typography;
    const fixes: TypographyFixes = {
      copyRoles: rolesFix ? judgment.copy_roles || null : null,
      // Taken from the judgment rather than the decision, so the loop is broken
      // in uncontrolled runs too: the concept can carry "hi\u1ec7n \u0111\u1ea1i" or "sang
      // tr\u1ecdng" because the user wrote it, and the detector fires on that just
      // as readily as on anything the director wrote.
      typographyDirection:
        loopFix && judgment.reasoning?.typography?.choice
          ? {
              choice: judgment.reasoning.typography.choice,
              reason: judgment.reasoning.typography.reason || "",
            }
          : null,
      typographyUserPinned: Boolean(pinned && pinned !== AUTO),
    };

    try {
      return await StablePipeline.run(effectiveRequest, {
        ...options,
        generationProvider: this.wrapProvider(inner, judgment, controlled, fixes),
      });
    } catch (err: any) {
      console.error("[EVOLUTION][EXPERIMENT] generation failed", {
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}
