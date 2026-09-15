import { SimpleImageGenerationResultV1, SimpleInputRequestV1 } from "../types";
import { ImgStudioImageGenerationProvider } from "../provider/ImgStudioImageGenerationProvider";
import type { ImageGenerationProvider, ProviderImageGenerationInput } from "../provider/ImageGenerationProvider";
import { StablePipeline } from "./StablePipeline";
import type { RoutingDecision } from "./PipelineRouter";
import { PromptBudgetManagerService } from "../service/PromptBudgetManagerService";
import { PromptBudgetValidator } from "../compiler/PromptBudgetValidator";
import { ProviderPromptOptimizer } from "../compiler/ProviderPromptOptimizer";
import { CreativeDirectorV1, CreativeJudgment, DirectorBriefInput } from "./experiment/CreativeDirectorV1";
import {
  buildContext,
  contextTelemetry,
  toDirectorBrief,
} from "./experiment/CreativeDecisionContext";
import { VisualDNA, VisualDNAAnalyzer, visualDNATelemetry } from "./experiment/VisualDNAAnalyzer";
import { NanoBananaPromptComposer, TypographyFixes } from "./experiment/NanoBananaPromptComposer";
import { AUTO } from "../director/visual-controls.types";
import { applyCreativeDecision, decisionTelemetry, toCreativeDecision } from "./experiment/CreativeDecision";
import { assetContextBrief, assetContextFor, shuffleRoutes } from "./experiment/AssetContext";

/**
 * Distinct products attached, counted the way the decision context counts them.
 *
 * Duplicated here in three lines rather than reached for through the context,
 * because the count is needed before the context is built and on the path where
 * the context flag is off.
 */
function countAttachedProducts(request: SimpleInputRequestV1): number {
  const isProduct = (role?: string) =>
    !role || ["PRODUCT", "PRODUCT_REFERENCE"].includes(String(role).toUpperCase());
  const a = (request.images || []).filter((i) => isProduct(i?.role)).length;
  const b = (request.referenceImages || []).filter((r) => isProduct(r?.role)).length;
  return Math.max(a, b);
}

/**
 * Analyses already paid for, keyed by the images they describe.
 *
 * The analyzer has always compared hashes and skipped the call when they match,
 * but the pipeline handed it `existingDNA: null` every time, so the comparison
 * had nothing to compare against and the cache never hit once. A brand that
 * renders five assets from the same product photograph paid for five identical
 * vision calls.
 *
 * In-process and unbounded in lifetime but not in size: a render server holds a
 * few dozen products at a time, and a Map that forgets the oldest once past a
 * few hundred entries costs less than one avoided call. It is not a store —
 * nothing here survives a restart, and nothing needs to.
 */
const VISUAL_DNA_CACHE = new Map<string, VisualDNA>();
const VISUAL_DNA_CACHE_MAX = 200;

function cacheKeyFor(images: { role?: string; buffer?: Buffer }[]): string {
  return images
    .filter((i) => i?.buffer?.length)
    .map((i) => `${String(i.role || "").toUpperCase()}:${VisualDNAAnalyzer.hash(i.buffer!)}`)
    .join("|");
}

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
    /**
     * The judgment, or a promise for one that is still being produced.
     *
     * Accepting a promise is what lets the director run beside the stable
     * pipeline instead of in front of it. Nothing downstream changes: the value
     * is awaited here, at the one point that consumes it, which is after the
     * compiler has finished and immediately before the prompt is sent.
     */
    judgmentSource: CreativeJudgment | null | Promise<CreativeJudgment | null>,
    controlled = false,
    fixesFor?: (judgment: CreativeJudgment | null) => TypographyFixes | undefined
  ): ImageGenerationProvider {
    return {
      async generateImage(input: ProviderImageGenerationInput) {
        const waitStart = Date.now();
        const judgment = await judgmentSource;
        const directorWaitMs = Date.now() - waitStart;
        const fixes = fixesFor ? fixesFor(judgment) : undefined;
        const composed = NanoBananaPromptComposer.compose(input.prompt, judgment, controlled, fixes);
        if (composed !== input.prompt) {
          console.log("[EXPERIMENT][NANO_BANANA_PROMPT]", {
            stable_chars: input.prompt.length,
            experiment_chars: composed.length,
            // What was left of the director's call once the stable pipeline had
            // finished. Zero means it finished first and cost the render nothing.
            director_wait_ms: directorWaitMs,
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

    // Resolved before the judgment flags are assembled, because it is one of
    // them.
    //
    // It used to be computed after the early return below, and initialised to
    // false above it. `anyJudgment` therefore read false on a run where staging
    // was the only feature enabled, the pipeline exited to stable, and the
    // assignment was never reached — so the flag looked on, changed nothing, and
    // the log line that would have said so was itself past the return. Two or
    // more attached products is still the condition; only the moment it is known
    // has moved.
    const productCount = countAttachedProducts(request);
    const stagingOn = Boolean(f.multi_product_staging_v1) && productCount >= 2;
    if (Boolean(f.multi_product_staging_v1) && !stagingOn) {
      console.log("[EXPERIMENT][STAGING] single-product brief — staging not applied", {
        product_count: productCount,
      });
    }

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
      // Requires the routes AssetIntent V2 supplies, so it is resolved below,
      // where the asset context is known — but above `anyJudgment`, which reads
      // it. Assigned after the early return, this was the staging bug again:
      // the flag looked on, the pipeline exited to stable, and the assignment
      // was never reached.
      strategySelection: false,
      // Two or more attached products is the condition, not the flag alone: a
      // single-product brief has no relationship to reason about, and asking for
      // one invites the director to invent it.
      multiProductStaging: stagingOn,
    };
    const controlled = Boolean(f.creative_director_control_v1);
    const assetAware = Boolean(f.asset_type_intelligence_v1);
    const bridge = Boolean(f.creative_bridge_v1);
    const rolesFix = Boolean(f.typography_roles_v1);
    const loopFix = Boolean(f.typography_control_priority_v1);
    const contextV1 = Boolean(f.creative_decision_context_v1);
    // Rides on the context flag: the analysis lives on the context, so enabling
    // it alone would pay for a vision call nothing reads.
    const visualDNAOn = contextV1 && Boolean(f.visual_dna_v1);
    // Null when the asset type is unrecognised, which leaves the director where
    // it was rather than handing it poster thinking for a format nobody mapped.
    // V2 corrects three entries that stated an answer instead of a problem, and
    // adds the routes and failure modes the director reasons with. It rides on
    // the asset flag rather than replacing it: without asset awareness there is
    // no context to improve, and turning V2 on alone would be a switch with
    // nothing behind it.
    //
    // Moved above `anyJudgment` because strategy selection is resolved from it.
    // `assetContextFor` is a table lookup with no I/O, so reading it earlier
    // costs a run that exits to stable nothing.
    const intentV2 = assetAware && Boolean(f.asset_intent_v2);
    const assetCtx = assetAware ? assetContextFor(request.useCase, intentV2) : null;

    // The routes this format offers, in an order the pipeline owns. Shuffled so
    // that position in the list cannot become a recommendation, and logged so the
    // distribution of what gets chosen is measurable rather than felt.
    const strategyOn = Boolean(f.creative_strategy_selection_v1) && Boolean(assetCtx?.possible_strategies?.length);
    const routes = strategyOn ? shuffleRoutes(assetCtx!.possible_strategies!) : undefined;
    judgmentFlags.strategySelection = strategyOn;
    if (Boolean(f.creative_strategy_selection_v1) && !strategyOn) {
      console.warn("[EXPERIMENT][STRATEGY] no routes for this format — selection not applied", {
        use_case: request.useCase,
        asset_intent_v2: Boolean(f.asset_intent_v2),
      });
    }

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
        "asset_intent_v2", "creative_decision_context_v1", "visual_dna_v1",
        "creative_strategy_selection_v1", "multi_product_staging_v1",
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
    const assetBrief = assetCtx
      ? assetContextBrief(assetCtx, { includeStrategies: intentV2 })
      : undefined;

    // Two ways to build one object, kept side by side for a release.
    //
    // The context path must produce a brief that is `deepStrictEqual` to the
    // literal below — that is the whole claim, and a test asserts it across a
    // matrix of requests. The literal stays until that has held in production,
    // because a refactor whose old path has already been deleted cannot be
    // compared against anything.
    // Reads the client's attachments before any decision is made, or returns
    // null and leaves the director exactly where it was.
    let visualDNA: VisualDNA | null = null;
    if (visualDNAOn) {
      const attachments = [...(request.images || []), ...(request.referenceImages || [])];
      const cacheKey = cacheKeyFor(attachments as any);
      const cached = cacheKey ? VISUAL_DNA_CACHE.get(cacheKey) : undefined;
      const dnaStart = Date.now();
      visualDNA = await new VisualDNAAnalyzer().analyze({
        images: attachments as any,
        // The analyzer compares hashes and skips the call when they still match.
        // Handing it null, as this did, guaranteed a miss on every render.
        existingDNA: cached ?? null,
      });
      if (visualDNA && cacheKey && !cached) {
        if (VISUAL_DNA_CACHE.size >= VISUAL_DNA_CACHE_MAX) {
          VISUAL_DNA_CACHE.delete(VISUAL_DNA_CACHE.keys().next().value as string);
        }
        VISUAL_DNA_CACHE.set(cacheKey, visualDNA);
      }
      console.log("[EXPERIMENT][VISUAL_DNA_PASS]", {
        ...visualDNATelemetry(visualDNA),
        cache_hit: Boolean(cached),
        elapsed_ms: Date.now() - dnaStart,
      });
    }

    let brief: DirectorBriefInput;
    if (contextV1) {
      const context = buildContext({
        request,
        assetIntent: assetCtx,
        assetIntentBrief: assetBrief,
        visualDNA,
      });
      brief = {
        ...toDirectorBrief(context),
        ...(routes ? { routes } : {}),
        ...(stagingOn ? { productCount } : {}),
      };
      console.log("[EXPERIMENT][DECISION_CONTEXT]", contextTelemetry(context));
    } else {
      brief = {
        assetContext: assetCtx ? assetBrief : undefined,
        concept: request.concept,
        contentMessage: request.contentMessage,
        brandName: request.brandName,
        useCase: request.useCase,
        aspectRatio: request.aspectRatio,
        industry: mc?.industry,
        objective: mc?.objective,
        audience: mc?.target_audience,
        ...(routes ? { routes } : {}),
        ...(stagingOn ? { productCount } : {}),
      };
    }

    // What the user pinned themselves. A click outranks a decision —
    // `VisualDirectionResolver` already says so, and the loop fix must not
    // quietly invert that for the one case where the preset is legitimate.
    //
    // Built as a function of the judgment rather than from a judgment already in
    // hand, because on the concurrent path there is no judgment yet when the
    // provider is wrapped.
    const pinned = request.creativeDirection?.visual_controls?.typography;
    const fixesFor = (j: CreativeJudgment | null): TypographyFixes | undefined =>
      j
        ? {
            copyRoles: rolesFix ? j.copy_roles || null : null,
            // Taken from the judgment rather than the decision, so the loop is
            // broken in uncontrolled runs too: the concept can carry "hiện đại"
            // or "sang trọng" because the user wrote it, and the detector fires
            // on that just as readily as on anything the director wrote.
            typographyDirection:
              loopFix && j.reasoning?.typography?.choice
                ? {
                    choice: j.reasoning.typography.choice,
                    reason: j.reasoning.typography.reason || "",
                  }
                : null,
            typographyUserPinned: Boolean(pinned && pinned !== AUTO),
          }
        : undefined;

    const judgeStart = Date.now();

    // ── The concurrent path ────────────────────────────────────────────────
    //
    // Outside control mode the judgment has exactly one consumer: the composer,
    // inside the wrapped provider, which runs after the compiler has finished.
    // Nothing between here and there reads it. Awaiting it before starting the
    // stable pipeline therefore bought nothing and cost the whole call —
    // measured at roughly 34 seconds of a 147-second three-product render.
    //
    // In control mode the judgment is an INPUT to the pipeline: it rewrites the
    // concept and the hard requirements before the Marketing Brain reads them.
    // That dependency is real and this path leaves it alone.
    if (!controlled) {
      const judgmentPromise = new CreativeDirectorV1()
        .judge(brief, judgmentFlags)
        .then((j) => {
          console.log("[EXPERIMENT][JUDGMENT_LATENCY]", {
            elapsed_ms: Date.now() - judgeStart,
            produced: Boolean(j),
            product_count: productCount,
            concurrent: true,
          });
          return j;
        })
        .catch((err: any) => {
          // `judge` resolves null on every failure it knows about; this is for
          // the ones it does not. An unhandled rejection here would surface as a
          // process warning long after the render it belonged to had finished.
          console.warn("[EVOLUTION][EXPERIMENT] judgment rejected — composing without it", {
            error: err?.message || String(err),
          });
          return null;
        });

      const innerConcurrent = options?.generationProvider || new ImgStudioImageGenerationProvider();
      try {
        return await StablePipeline.run(request, {
          ...options,
          generationProvider: this.wrapProvider(innerConcurrent, judgmentPromise, false, fixesFor),
        });
      } catch (err: any) {
        console.error("[EVOLUTION][EXPERIMENT] generation failed", {
          error: err?.message || String(err),
        });
        throw err;
      }
    }

    const judgment = await new CreativeDirectorV1().judge(brief, judgmentFlags);
    console.log("[EXPERIMENT][JUDGMENT_LATENCY]", {
      elapsed_ms: Date.now() - judgeStart,
      produced: Boolean(judgment),
      product_count: productCount,
      concurrent: false,
    });

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
        if (judgment.staging) {
          console.log("[EXPERIMENT][STAGING]", {
            product_count: productCount,
            relationship: judgment.staging.relationship?.relationship_type,
            hierarchy: judgment.staging.hierarchy?.slice(0, 60),
            lines: decision.staging_requirements.length,
          });
        }
        if (judgment.strategy) {
          console.log("[EXPERIMENT][STRATEGY]", {
            offered: routes,
            developed: judgment.strategy.candidates?.map((c) => c?.route) ?? [],
            selected: judgment.strategy.selected,
            runner_up: judgment.strategy.runner_up,
          });
        }
      } else {
        // A judgment with no scene cannot take control of anything. Saying so
        // beats silently running in a mode the operator believes is active.
        console.warn("[EXPERIMENT][DIRECTOR_CONTROL] no scene in the judgment — control not applied");
      }
    }


    try {
      return await StablePipeline.run(effectiveRequest, {
        ...options,
        generationProvider: this.wrapProvider(inner, judgment, controlled, fixesFor),
      });
    } catch (err: any) {
      console.error("[EVOLUTION][EXPERIMENT] generation failed", {
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}
