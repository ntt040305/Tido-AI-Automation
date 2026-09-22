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
import { productTruthTelemetry } from "./experiment/ProductTruth";
import { briefTelemetry } from "./experiment/CreativeBrief";
import { buildMarketingInsight, marketingInsightTelemetry, MarketingInsight } from "./experiment/MarketingInsight";
import { buildProductMeaning, productMeaningTelemetry, ProductMeaning } from "./experiment/ProductMeaning";
import { ProfessionalCreativeBrain } from "./experiment/ProfessionalCreativeBrain";
import { HumanTensionAnalyzer } from "../reasoning/HumanTensionAnalyzer";
import { buildDesignSystem, designSystemTelemetry, renderDesignSystem } from "./experiment/DesignSystem";
import { buildComposition, compositionTelemetry, renderComposition } from "./experiment/VisualComposition";
import { planAssets, assetTelemetry, renderAssets } from "./experiment/AssetIntelligence";
import { buildAssetDNA, renderAssetDNA, assetDNATelemetry } from "./experiment/AssetDNA";
import { chooseStructure, structureTelemetry } from "./experiment/CampaignStructure";
import { adaptFormats, adaptationTelemetry } from "./experiment/FormatAdaptation";
import { buildDesignProject, projectTelemetry } from "./experiment/DesignProject";
import { buildGeometry, geometryTelemetry, renderGeometry } from "./experiment/LayoutGeometry";
import { buildTypographySystem, typographyTelemetry, renderTypography } from "./experiment/TypographySystem";
import { buildCreativeDocument, documentTelemetry } from "./experiment/CreativeDocument";
import { critiqueRender, criticTelemetry } from "../benchmark/CommercialRenderCritic";
import { buildCreativeIntelligence, intelligenceTelemetry, CreativeIntelligence } from "./experiment/CreativeIntelligenceView";
import { diagnose } from "../benchmark/CreativeDiagnosis";
import { RenderQualityJudge } from "../benchmark/RenderQualityJudge";
import { compareConcepts } from "../benchmark/ConceptEvaluator";
import { buildProductionContext, validateContext, productionTelemetry } from "./experiment/ProductionPipeline";
import { buildTextLayers, NO_TEXT_DIRECTIVE, typographyRenderTelemetry } from "./experiment/TypographyRenderer";
import { exportSvg, exportCanva, exportPsdModel, exportTelemetry } from "./experiment/ExportLayer";
import { blueprintTelemetry } from "./experiment/CreativeBlueprint";
import { CreativeRefinementLoop } from "./experiment/CreativeRefinementLoop";
import { MarketingBrainService } from "../llm/marketing-brain.service";
import type { MarketingBrainStrategy } from "../llm/prompt-strategy.schema";
import { NanoBananaPromptComposer, TypographyFixes } from "./experiment/NanoBananaPromptComposer";
import { AUTO } from "../director/visual-controls.types";
import { applyCreativeDecision, decisionTelemetry, toCreativeDecision } from "./experiment/CreativeDecision";
import { assetContextBrief, assetContextFor, shuffleRoutes } from "./experiment/AssetContext";
import type { AssetContext } from "./experiment/AssetContext";
import { directionTelemetry, resolveSelectedDirection } from "./experiment/CreativeDirectionResolver";
import {
  buildLayoutContext,
  layoutContextTelemetry,
  renderLayoutContext,
} from "./experiment/LayoutContextBridge";

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
/**
 * CREATIVE_STRATEGY_TRACE — one line per render saying what the intelligence
 * layers actually decided.
 *
 * Phase 1 turns on eight layers that have never run in production. The audit
 * that preceded it found 115 logged renders carrying only ever one enabled
 * feature, which means every claim about what these layers do is still a claim
 * about code rather than about output. This line is what makes the difference
 * checkable: it reports the decision, not the flag, so a layer that is switched
 * on but produces nothing reads as empty here instead of reading as success in
 * `features_enabled`.
 *
 * On `risk`: the brief asks for a risk field and no such field exists anywhere
 * in the judgment. Rather than invent a score, this reports the two real signals
 * closest to it — the failure modes the format is known for (asset context V2)
 * and the tradeoff the director knowingly accepted when it passed over the
 * runner-up route. Both are things someone can act on; a fabricated number is
 * not.
 *
 * Values are truncated. This goes to a server log on every render, and the
 * fields it carries are free text from a model that has no length contract.
 */
/**
 * Records which routes were put in front of the director.
 *
 * `CreativeStrategy.routes_offered` is declared on the interface and read at the
 * judgment-telemetry call site, and nothing has ever written to it: the director
 * is not asked for it and the pipeline never filled it in. So `strategy_offered`
 * has logged 0 on every run, and the shuffle whose stated purpose is that
 * "distribution is measurable" has never been measurable.
 *
 * The pipeline is the right place to fix that rather than the director prompt.
 * It is the pipeline that chose and shuffled the list, so it knows what was
 * offered with certainty; asking the model to repeat the list back would be
 * asking it to recall an input, which is a worse source than the input.
 *
 * Only fills what is missing. A director that does start returning the field
 * keeps its own answer.
 */
function recordRoutesOffered(
  judgment: CreativeJudgment | null,
  routes?: string[]
): CreativeJudgment | null {
  if (!judgment?.strategy || !routes?.length) return judgment;
  if (judgment.strategy.routes_offered?.length) return judgment;
  judgment.strategy.routes_offered = [...routes];
  return judgment;
}

const TRACE_MAX = 160;
function clip(v?: string | null): string | undefined {
  if (!v) return undefined;
  const t = String(v).replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > TRACE_MAX ? `${t.slice(0, TRACE_MAX)}…` : t;
}

function logCreativeStrategyTrace(args: {
  judgment: CreativeJudgment | null;
  assetCtx: AssetContext | null;
  objective?: string;
  flagsOn: string[];
}): void {
  const j = args.judgment;
  const a = args.assetCtx;
  const direction = resolveSelectedDirection(j);
  console.log("[EXPERIMENT][CREATIVE_STRATEGY_TRACE]", {
    // Did creative intelligence reach the prompt? These come from the resolver
    // the composer reads, so `composer_used_direction` is a statement about the
    // prompt rather than a hope about it.
    ...directionTelemetry(direction),
    composer_received_direction: Boolean(j),
    composer_used_direction: Boolean(direction),
    // What the format is, and what the layers were asked to do about it.
    asset_type: a?.asset_type,
    campaign_goal: clip(args.objective) || clip(a?.communication_goal),

    // The decisions themselves.
    selected_strategy: clip(j?.strategy?.selected),
    // Read through the same resolver the composer uses, so the trace cannot
    // disagree with the prompt. Reading `j.selected` directly is what made this
    // field report `undefined` on every strategy-selection run while a direction
    // had in fact been chosen — a log that hid the defect instead of showing it.
    visual_direction: clip(direction?.name),
    emotion: clip(j?.brand?.emotional_territory) || clip(j?.consumer?.first_feeling),
    composition_reasoning: clip(j?.reasoning?.composition?.choice),

    // Standing in for a `risk` field the schema does not have.
    format_failure_modes: a?.failure_modes?.length || 0,
    tradeoff_accepted: clip(j?.strategy?.why_not_runner_up),

    // Format Challenge V1. The measurement that says whether the rebalance took.
    //
    // `risk_taken` empty while the flag is on means the director answered the
    // challenge by avoiding every failure mode, which is the behaviour being
    // corrected wearing a new field — so this reads as a null result rather than
    // as a success, which is the distinction the trace exists to make.
    risk_taken: clip(
      j?.strategy?.candidates?.find((c) => c?.route === j?.strategy?.selected)?.risks
    ),
    risk_earned_by: clip(
      j?.strategy?.candidates?.find((c) => c?.route === j?.strategy?.selected)?.earns_it
    ),

    // Whether each layer produced anything at all. A true here with an empty
    // value above is the failure this trace exists to surface.
    produced: {
      strategy: Boolean(j?.strategy),
      brand: Boolean(j?.brand),
      consumer: Boolean(j?.consumer),
      reasoning: Boolean(j?.reasoning),
      staging: Boolean(j?.staging),
      asset_context: Boolean(a),
      routes_offered: j?.strategy?.routes_offered?.length || 0,
    },
    flags_on: args.flagsOn,
  });
}

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
    fixesFor?: (judgment: CreativeJudgment | null) => TypographyFixes | undefined,
    /**
     * Layout Context Bridge V1. Built from the judgment for the same reason
     * `fixesFor` is: on the concurrent path there is no judgment yet when the
     * provider is wrapped.
     */
    layoutContextFor?: (judgment: CreativeJudgment | null) => string | undefined,
    alignLayoutPriority = false,
    creativeConstraint?: { productCount: number },
    carryNonSceneReasoning = false,
    /**
     * Phase 5. The Creative Blueprint, rendered for the prompt.
     *
     * Built from the judgment for the same reason `fixesFor` is: on the
     * concurrent path there is no judgment yet when the provider is wrapped.
     *
     * Appended AFTER the composer rather than inside it. The composer has a
     * settled contract and 163 tests reading it; widening that signature to
     * carry a block it does not interpret would be churn for nothing. Last
     * position is also the right one — the blueprint says which line wins when
     * two conflict, and recency is how a renderer reads that.
     */
    blueprintFor?: (
      judgment: CreativeJudgment | null,
      headroom: number,
      composedPrompt: string
    ) => string | undefined
  ): ImageGenerationProvider {
    return {
      async generateImage(input: ProviderImageGenerationInput) {
        const waitStart = Date.now();
        const judgment = await judgmentSource;
        const directorWaitMs = Date.now() - waitStart;
        const fixes = fixesFor ? fixesFor(judgment) : undefined;
        const layoutContext = layoutContextFor ? layoutContextFor(judgment) : undefined;
        const composed = NanoBananaPromptComposer.compose(
          input.prompt,
          judgment,
          controlled,
          fixes,
          layoutContext,
          alignLayoutPriority,
          creativeConstraint,
          carryNonSceneReasoning
        );
        // Headroom against the budget the compiler itself enforces. The
        // blueprint is appended after compilation, so without this it escapes
        // the discipline every other section is held to: measured live, the
        // prompt reached 30,402 characters against a 24,000 hard maximum.
        const headroom = PromptBudgetManagerService.HARD_MAXIMUM - composed.length - 2;
        const blueprintText = blueprintFor ? blueprintFor(judgment, headroom, composed) : undefined;
        const finalPrompt = blueprintText ? `${composed}

${blueprintText}` : composed;
        if (blueprintText) {
          console.log("[EXPERIMENT][CREATIVE_BLUEPRINT_TRANSMITTED]", {
            blueprint_chars: blueprintText.length,
            prompt_chars_before: composed.length,
            prompt_chars_after: finalPrompt.length,
          });
        }
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
        return inner.generateImage({ ...input, prompt: finalPrompt });
      },
    };
  }

  /**
   * Attaches the structures this render was built from, when there were any.
   *
   * Non-enumerable on purpose. These are internal design objects, not part of
   * the API contract: the review layer reads them in-process and they must not
   * ride along into a JSON response, a log line or a database row. Making them
   * non-enumerable means `JSON.stringify` and every spread that builds the HTTP
   * payload skip them without anyone having to remember to strip them.
   */
  private static attachDesignContext(
    result: SimpleImageGenerationResultV1,
    blueprint: unknown,
    typography: unknown,
    geometry: unknown,
  ): SimpleImageGenerationResultV1 {
    if (!blueprint && !typography && !geometry) return result;
    for (const [key, value] of [
      ["creativeBlueprint", blueprint],
      ["typographySystem", typography],
      ["layoutGeometry", geometry],
    ] as const) {
      if (!value) continue;
      Object.defineProperty(result, key, { value, enumerable: false, configurable: true });
    }
    return result;
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
      // Declared here so the object's inferred type includes it; the value
      // is resolved below, once the routes AssetIntent V2 supplies are known.
      formatChallenge: false,
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
    // `bridge` is read in exactly one place: inside `if (controlled)` below. On a
    // run without `creative_director_control_v1` it changes nothing, and the
    // router still reports it in `features_enabled` — a flag that looks enabled
    // and does nothing, which is how three separate defects in this project
    // survived a full phase each.
    if (bridge && !Boolean(f.creative_director_control_v1)) {
      console.warn(
        "[EXPERIMENT][CREATIVE_BRIDGE] enabled without creative_director_control_v1 — inert on this run",
        { reason: "the bridge only applies where the decision rewrites the brief, which is control mode" }
      );
    }
    const rolesFix = Boolean(f.typography_roles_v1);
    const loopFix = Boolean(f.typography_control_priority_v1);
    const contextV1 = Boolean(f.creative_decision_context_v1);
    // Rides on the context flag: the analysis lives on the context, so enabling
    // it alone would pay for a vision call nothing reads.
    const visualDNAOn = contextV1 && Boolean(f.visual_dna_v1);
    // Product Truth V1. Rides on the context for the same reason VisualDNA does
    // — the object it produces hangs off the context — and is warned about when
    // enabled without it, because a flag that is on and does nothing is how
    // three separate defects in this project survived a full phase each.
    const productTruthOn = contextV1 && Boolean(f.product_truth_v1);
    // A brief reads the truth object, so it cannot run without one. Stated as a
    // dependency here rather than assumed in the builder, so the one place that
    // resolves flags is the one place that knows what depends on what.
    const creativeBriefOn = productTruthOn && Boolean(f.creative_brief_v1);
    // Both read the truth object, so neither runs without one. Stated here
    // rather than assumed downstream, so the one place that resolves flags is
    // the one place that knows what depends on what.
    const marketingInsightOn = productTruthOn && Boolean(f.marketing_insight_v1);
    const brainOn = productTruthOn && Boolean(f.professional_creative_brain_v1);
    const strategyFirstOn = Boolean(f.strategy_first_v1);
    const tensionOn = brainOn && Boolean(f.reasoning_tension_v1);
    const productionOn = brainOn && Boolean(f.design_production_v1);
    const executionOn = brainOn && Boolean(f.execution_layer_v1);
    const productionPipelineOn = executionOn && Boolean(f.production_pipeline_v2);
    const realTypographyOn = executionOn && Boolean(f.real_typography_v1);
    const exportOn = executionOn && Boolean(f.export_layer_v1);

    // Phase 1.1D — Creative Director authority over inferred art direction.
    //
    // Resolved here because this is the layer that reads flags, and handed to
    // the orchestrator as an option so the compiler never has to. `lockedIntent`
    // is an LLM reading of the brief; the visual direction panel is the client.
    // Only the second is a lock.
    const cdAuthorityOn = Boolean(f.creative_director_authority_v1);
    const vc = request.creativeDirection?.visual_controls || {};
    const userLockedDimensions: Record<string, boolean> = {};
    for (const [dimension, value] of Object.entries(vc)) {
      // `auto` and an absent key both mean the control was left on Tự chọn,
      // which is the user declining to choose rather than choosing.
      if (value && String(value).toLowerCase() !== AUTO) userLockedDimensions[dimension] = true;
    }
    if (cdAuthorityOn) {
      console.log("[EXPERIMENT][CD_AUTHORITY]", {
        applied: true,
        user_locked: Object.keys(userLockedDimensions),
        director_controls: ["camera", "lighting", "composition", "materials", "environment"].filter(
          (d) => !userLockedDimensions[d]
        ),
      });
    }
    const cdAuthorityOptions = cdAuthorityOn
      ? { creativeDirectorAuthority: true, userLockedDimensions }
      : {};
    if (Boolean(f.product_truth_v1) && !productTruthOn) {
      console.warn("[EXPERIMENT][PRODUCT_TRUTH] enabled without creative_decision_context_v1 — inert on this run", {
        reason: "the truth object hangs off the decision context, and there is no context to hang it on",
      });
    }
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

    // Format Challenge V1. Gated on route selection actually running, for the
    // same reason the bridge is gated on control mode: a flag that is enabled and
    // does nothing is how three separate defects in this project survived a full
    // phase each. Warned about rather than silently ignored.
    const challengeOn = strategyOn && Boolean(f.format_challenge_v1);
    judgmentFlags.formatChallenge = challengeOn;
    if (Boolean(f.format_challenge_v1) && !challengeOn) {
      console.warn("[EXPERIMENT][FORMAT_CHALLENGE] enabled without route selection — inert on this run", {
        reason: "the challenge is a requirement on a candidate, and there are no candidates without routes",
        creative_strategy_selection_v1: Boolean(f.creative_strategy_selection_v1),
        use_case: request.useCase,
      });
    }
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
        "format_challenge_v1", "product_truth_v1", "creative_brief_v1",
        "marketing_insight_v1", "professional_creative_brain_v1", "strategy_first_v1",
        "reasoning_tension_v1", "design_production_v1", "execution_layer_v1",
        "production_pipeline_v2", "vision_iteration_v1", "real_typography_v1", "export_layer_v1",
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
      ? assetContextBrief(assetCtx, { includeStrategies: intentV2, includeChallenges: challengeOn })
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
    // Held outside the context branch so the blueprint closure below can read
    // them. Null on the legacy path, which is what keeps that path unchanged.
    // Phase 5. The same single marketing-brain call the stable pipeline would
    // have made, made HERE so the director and the insight layer can read it.
    // It is handed down through `precomputedStrategy` so nothing repeats it.
    //
    // Failure is survivable on purpose: a strategy that does not arrive leaves
    // the run exactly where it was before this flag existed, and a creative
    // upgrade is not worth an outage.
    let earlyStrategy: MarketingBrainStrategy | null = null;
    if (strategyFirstOn) {
      const stratStart = Date.now();
      try {
        earlyStrategy = await new MarketingBrainService().generateStrategy({
          concept: request.concept,
          useCase: request.useCase,
          aspectRatio: request.aspectRatio,
          brandName: request.brandName,
          brandInfo: request.brandInfo,
          copyItems: (request.copyItems || []).map((i: any) => (typeof i === "string" ? i : i.text)),
          targetAudience: mc?.target_audience,
          marketingGoal: mc?.objective,
          productName: (request as any).salesContext?.product_name,
        });
        console.log("[EXPERIMENT][STRATEGY_FIRST]", {
          produced: true,
          creative_angle: earlyStrategy?.creative_angle,
          has_consumer_insight: Boolean(earlyStrategy?.consumer_insight),
          elapsed_ms: Date.now() - stratStart,
        });
      } catch (err: any) {
        console.warn("[EXPERIMENT][STRATEGY_FIRST] failed, continuing without it", {
          error: err?.message || String(err),
        });
      }
    }
    let marketingInsight: MarketingInsight | null = null;
    let productMeaning: ProductMeaning | null = null;
    // Hoisted for the same reason `productTruthForBrain` is: the blueprint
    // closure below sits outside the context branch, and a binding declared
    // inside it is not in scope there. That exact mistake cost 12 renders.
    let hasLogoForBrain = false;
    // Written by the blueprint closure during generation and read after the
    // render returns. The closure runs deep inside the stable pipeline, so this
    // is the only place both sides can see.
    let capturedIntelligence: CreativeIntelligence | null = null;
    // The design structures this render was actually built from.
    //
    // Captured for the same reason the intelligence is: they exist, they
    // describe what was decided, and nothing downstream could see them. The
    // vision review needs them specifically -- without the real TextSpec and
    // Zone it can say "raise the headline" but not "from 2.5 to 3.3", and a
    // correction with no starting value cannot be checked against the result.
    let capturedTypography: any = null;
    let capturedGeometry: any = null;
    let capturedBlueprint: any = null;
    let productTruthForBrain: import("./experiment/ProductTruth").ProductTruth | null = null;
    if (contextV1) {
      const context = buildContext({
        request,
        assetIntent: assetCtx,
        assetIntentBrief: assetBrief,
        visualDNA,
        productTruth: productTruthOn,
        creativeBrief: creativeBriefOn,
      });
      // Assembly only in this phase. `toDirectorBrief` is untouched, so the
      // director receives exactly what it received before — the truth object
      // hangs off the context and is reported, and nothing reads it yet.
      if (productTruthOn) {
        console.log("[EXPERIMENT][PRODUCT_TRUTH]", productTruthTelemetry(context.product_truth));
      }
      if (creativeBriefOn) {
        console.log("[EXPERIMENT][CREATIVE_BRIEF]", briefTelemetry(context.creative_brief));
      }
      // Strategy is deliberately not passed: `MasterPromptCompilerService`
      // produces it AFTER the director judges, so at this point it does not
      // exist. The insight reports the fields that depend on it as missing,
      // which is the honest reading of the pipeline as it actually runs.
      if (marketingInsightOn || brainOn) {
        // ProductTruth's DERIVED tier, built first because the insight below
        // and the brain both read it. Measured on run_20260919_003: without it
        // only 3 of 26 blueprint decisions rested on the product.
        productMeaning = buildProductMeaning({
          productTruth: context.product_truth,
          visualDNA,
        });
        console.log("[EXPERIMENT][PRODUCT_MEANING]", productMeaningTelemetry(productMeaning));
        marketingInsight = buildMarketingInsight({
          productTruth: context.product_truth,
          productMeaning,
          strategy: earlyStrategy,
          audience: mc?.target_audience,
          objective: mc?.objective,
        });
        if (marketingInsightOn) {
          console.log("[EXPERIMENT][MARKETING_INSIGHT]", marketingInsightTelemetry(marketingInsight));
        }
      }
      productTruthForBrain = context.product_truth ?? null;
      hasLogoForBrain = Boolean(context.evidence?.has_logo);
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

    // Layout Context Bridge V1.
    //
    // Deliberately NOT part of `judgmentFlags`, and therefore not part of
    // `anyJudgment`. The bridge asks the director for nothing — it carries
    // decisions other flags already produced — so a run with this flag alone has
    // nothing to carry and correctly exits to stable. That is the opposite of
    // the staging and strategy wiring defects, where a flag that DID change what
    // the director was asked was resolved after the exit.
    const layoutBridgeOn = Boolean(f.layout_context_bridge_v1);
    // Rides on the bridge for the same reason the composer gates on the block:
    // the replacement clause names LAYOUT CONTEXT, so enabling it without one
    // would point the renderer at a section that is not there.
    const layoutPriorityOn = layoutBridgeOn && Boolean(f.layout_priority_alignment_v1);
    // Independent of the bridge: the over-decoration this calibrates comes from
    // any creative intent reaching the renderer, and the judgment block carries
    // plenty of it on its own.
    const creativeConstraint = Boolean(f.creative_constraint_calibration_v1)
      ? { productCount }
      : undefined;
    if (Boolean(f.layout_priority_alignment_v1) && !layoutBridgeOn) {
      console.warn("[EXPERIMENT][LAYOUT_PRIORITY] enabled without layout_context_bridge_v1 — not applied");
    }
    const layoutContextFor = layoutBridgeOn
      ? (j: CreativeJudgment | null): string | undefined => {
          const ctx = buildLayoutContext({
            judgment: j,
            productCount,
            assetIntent: assetCtx,
          });
          const block = renderLayoutContext(ctx);
          console.log("[EXPERIMENT][LAYOUT_CONTEXT]", layoutContextTelemetry(ctx, block.length));
          return block || undefined;
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
    /**
     * Phase 5. The blueprint, resolved from whatever the director produced.
     *
     * Undefined when the flag is off, which is what keeps the composed prompt
     * byte-identical. Built here rather than in the wrapper so the wrapper stays
     * a transport and the reasoning stays in one place.
     */
    const blueprintFor = brainOn
      ? (j: CreativeJudgment | null, headroom: number, composedPrompt: string) => {
          const dec = j ? toCreativeDecision(j) : null;
          // The first call from the render path into `reasoning/`. Pure and
          // static, so it costs nothing and cannot fail a render; the analyzer
          // truncates its own ladder rather than guessing past its evidence.
          let tension: { statement: string; step: string; matched: boolean; archetype: string } | null = null;
          const challenge = (assetCtx?.challenges || [])[0] || (assetCtx?.failure_modes || [])[0] || "";
          if (tensionOn && challenge) {
            try {
              const t = HumanTensionAnalyzer.analyze({
                challenge,
                audience: mc?.target_audience || "",
                product: request.concept || "",
                objective: mc?.objective,
              });
              const deepest = t.ladder[t.ladder.length - 1] as any;
              if (deepest?.statement) {
                tension = {
                  statement: String(deepest.statement),
                  step: String(deepest.step || "unknown"),
                  matched: t.matched,
                  archetype: t.archetype_label || t.archetype,
                };
              }
              console.log("[EXPERIMENT][REASONING_TENSION]", {
                archetype: t.archetype,
                matched: t.matched,
                rungs: t.ladder.length,
                truncated_at: t.truncated_at,
                warnings: t.warnings.length,
              });
            } catch (err: any) {
              console.warn("[EXPERIMENT][REASONING_TENSION] failed, continuing without it", {
                error: err?.message || String(err),
              });
            }
          }
          const bp = ProfessionalCreativeBrain.assemble({
            tension,
            productTruth: productTruthForBrain,
            productMeaning,
            marketingInsight,
            strategy: earlyStrategy,
            assetContext: assetCtx,
            copyItems: request.copyItems,
            productCount,
            hasLogo: hasLogoForBrain,
            visualDNA,
            decision: dec,
            judgment: j,
          });
          console.log("[EXPERIMENT][CREATIVE_BLUEPRINT]", blueprintTelemetry(bp));
          // Translate for the interface. Free: every input is already in memory.
          {
            const critique = critiqueRender({ blueprint: bp, prompt: composedPrompt });
            // `diagnose` reads the judge's report; the critic is a different
            // object with a different shape and is carried separately.
            const report = RenderQualityJudge.evaluate({ blueprint: bp, prompt: composedPrompt });
            const concepts = compareConcepts(j?.strategy);
            // Captured here rather than with the geometry below, because that
            // block is gated on `execution_layer_v1`. With that flag off the
            // blueprint was never recorded, so the vision review could not name
            // a single protected element -- it reported "protected: none" over a
            // render whose concept and colour story were fully decided.
            // Protection must not depend on an unrelated feature being on.
            capturedBlueprint = bp;
            capturedIntelligence = buildCreativeIntelligence({
              blueprint: bp,
              decision: dec,
              productMeaning,
              marketingInsight,
              critic: critique,
              diagnosis: diagnose(bp, report, concepts),
              concepts,
            });
            console.log("[EXPERIMENT][CREATIVE_INTELLIGENCE]", intelligenceTelemetry(capturedIntelligence));
          }
          // Phase 2-4. Six layers, all deterministic, all reading the blueprint
          // that already exists. Appended to the same budget as everything else.
          // Execution layer: geometry first, because typography places against
          // it and the document is built from both.
          let executionText = "";
          if (executionOn) {
            const roles = (dec?.copy_roles || []).map((r: any) => String(r?.role || "")).filter(Boolean);
            const geometry = buildGeometry({
              ratio: request.aspectRatio, assetContext: assetCtx, blueprint: bp,
              copyRoles: roles, productCount, hasLogo: hasLogoForBrain,
            });
            const typography = buildTypographySystem({
              blueprint: bp, productMeaning, marketingInsight,
              assetContext: assetCtx, geometry, copyRoles: roles,
            });
            capturedGeometry = geometry;
            capturedTypography = typography;
            const composition = buildComposition({ blueprint: bp, decision: dec, visualDNA });
            const doc = buildCreativeDocument({ geometry, typography, composition, blueprint: bp });
            const critique = critiqueRender({ blueprint: bp, geometry, typography, prompt: composedPrompt });
            executionText = [renderGeometry(geometry), renderTypography(typography)]
              .filter(Boolean)
              .join("\n\n");
            // Phase 1: one context, validated before a render is paid for.
            if (productionPipelineOn) {
              const ctx = buildProductionContext({
                creativeBlueprint: bp, layoutGeometry: geometry, typographySystem: typography,
                composition, creativeDocument: doc, criticResult: critique,
                ratio: request.aspectRatio, assetType: assetCtx?.asset_type,
                productCount, startedAt: 0,
              });
              const valid = validateContext(ctx);
              console.log("[PRODUCTION_PIPELINE]", productionTelemetry(ctx, valid));
              if (!valid.ok) console.warn("[PRODUCTION_PIPELINE] " + valid.explanation);
            }
            // Phase 3: our type, not the model's. The picture is rendered
            // without words and the type is composited by the caller.
            if (realTypographyOn) {
              const copy = (dec?.copy_roles || []).map((r: any) => ({ role: String(r?.role || ""), text: String(r?.text || "") }));
              const textLayers = buildTextLayers({ geometry, typography, copy });
              console.log("[EXPERIMENT][REAL_TYPOGRAPHY]", {
                ...typographyRenderTelemetry({ layers: textLayers, svg: "" }),
                no_text_directive_added: textLayers.length > 0,
              });
              if (textLayers.length) executionText = [executionText, NO_TEXT_DIRECTIVE].filter(Boolean).join("\n\n");
              if (exportOn) {
                console.log("[EXPERIMENT][EXPORT_LAYER]", exportTelemetry({
                  svg: exportSvg(doc, textLayers),
                  canva: exportCanva(doc, textLayers),
                  psd: exportPsdModel(doc, textLayers),
                }));
              }
            }
            console.log("[EXPERIMENT][EXECUTION_LAYER]", {
              ...geometryTelemetry(geometry),
              ...typographyTelemetry(typography),
              ...documentTelemetry(doc),
              ...criticTelemetry(critique),
            });
          }
          let productionText = "";
          if (productionOn) {
            const ds = buildDesignSystem({ visualDNA, productMeaning, assetContext: assetCtx, decision: dec });
            const comp = buildComposition({ blueprint: bp, decision: dec, visualDNA });
            const assets = planAssets({ decision: dec, visualDNA, productMeaning });
            const structure = chooseStructure({
              assetContext: assetCtx, marketingInsight, decision: dec,
              objective: mc?.objective, productCount, copyItems: request.copyItems,
            });
            const formats = adaptFormats(bp);
            const project = buildDesignProject(comp, bp);
            // Budgeted like everything else. Sections are added whole, in
            // priority order, while they fit: a half-printed composition is
            // worse than an absent one, because a renderer reads a truncated
            // layer list as a complete one.
            // What the uploaded product actually is, read from the analyzer
            // that already looked at it. First in the list on purpose: these
            // are OBSERVED facts about the customer's object, and the standing
            // order of authority in this engine puts what was seen above what
            // was reasoned. When the budget is tight the derived sections are
            // the ones that should fall away, not the product's real surface.
            const assetDna = buildAssetDNA({
              visualDNA,
              supportingRoles: assets.assets.map((a) => a.asset),
            });
            // Standing preferences, supplied by the caller. This layer does not
            // know or ask whose they are -- it receives sentences.
            //
            // Last in the section list on purpose: a preference assists, so
            // when the budget is tight it is the first thing to fall away,
            // never the product's observed surface or the director's decisions
            // for the brief actually in front of it.
            const prefs = decision.standingPreferences || [];
            const prefText = prefs.length
              ? [
                  "STANDING CREATIVE PREFERENCES",
                  "Apply these only where the brief above does not already say otherwise.",
                  ...prefs.map((p) => `- ${p}`),
                ].join("\n")
              : undefined;

            const sections = [
              renderAssetDNA(assetDna),
              renderDesignSystem(ds),
              renderComposition(comp),
              renderAssets(assets),
              prefText,
            ].filter(Boolean) as string[];
            const kept: string[] = [];
            let used = 0;
            for (const section of sections) {
              if (used + section.length + 2 > headroom - executionText.length) break;
              kept.push(section);
              used += section.length + 2;
            }
            productionText = kept.join("\n\n");
            console.log("[EXPERIMENT][DESIGN_PRODUCTION]", {
              ...designSystemTelemetry(ds),
              ...compositionTelemetry(comp),
              ...assetTelemetry(assets),
              ...assetDNATelemetry(assetDna),
              standing_preferences: prefs.length,
              ...structureTelemetry(structure),
              ...adaptationTelemetry(formats),
              ...projectTelemetry(project),
            });
          }
          const text = ProfessionalCreativeBrain.render(bp, {
            maxChars: Math.max(0, headroom - productionText.length - executionText.length),
          });
          // The evaluation layer, finally reading something. It was built,
          // tested and imported by nothing, so every render so far was scored
          // by no one. Free, deterministic and offline, so it costs the render
          // nothing to know how much was actually decided.
          const loop = CreativeRefinementLoop.run({
            productTruth: productTruthForBrain,
            productMeaning,
            marketingInsight,
            visualDNA,
            decision: dec,
            judgment: j,
            assetContext: assetCtx,
            productCount,
            hasLogo: hasLogoForBrain,
            prompt: `${composedPrompt}

${text || ""}`,
          });
          console.log("[EXPERIMENT][CREATIVE_QUALITY]", {
            // Both numbers. Logging only `before` made the loop invisible: the
            // live log said "copy hierarchy MISSING" on a run where the
            // correction had already filled it.
            readiness: loop.after.mean,
            readiness_before_correction: loop.before.mean,
            corrections_applied: Object.keys(loop.corrections).length,
            scores: Object.fromEntries(loop.before.scores.map((x) => [x.dimension, x.score])),
            undecided: loop.critique.ungrounded.length,
            director_only: loop.critique.director_only.length,
            problems: loop.critique.problems.slice(0, 3),
          });
          console.log("[EXPERIMENT][BLUEPRINT_BUDGET]", {
            headroom,
            emitted: text ? text.length : 0,
            trimmed: text ? text.length < ProfessionalCreativeBrain.render(bp)!.length : false,
          });
          const tail = [productionText, executionText].filter(Boolean).join("\n\n");
          return tail ? [text, tail].filter(Boolean).join("\n\n") : text;
        }
      : undefined;

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
          recordRoutesOffered(j, routes);
          logCreativeStrategyTrace({
            judgment: j,
            assetCtx,
            objective: mc?.objective,
            flagsOn: decision.features_enabled,
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
        const generated = await StablePipeline.run(request, {
          ...options,
          ...cdAuthorityOptions,
          ...(earlyStrategy ? { precomputedStrategy: earlyStrategy } : {}),
          generationProvider: this.wrapProvider(
            innerConcurrent,
            judgmentPromise,
            false,
            fixesFor,
            layoutContextFor,
            layoutPriorityOn,
            creativeConstraint,
            // Uncontrolled: the whole judgment is appended anyway.
            false,
            blueprintFor
          ),
        });

        // The intelligence the closure captured during generation, handed to
        // the interface. Spread conditionally so a run that produced none
        // returns exactly the object it always returned.
        //
        // The vision review deliberately does NOT happen here. It used to, and
        // wiring it at each render site meant remembering every branch -- which
        // failed immediately, leaving the loop enabled and unreachable on the
        // common path. It now runs once in PipelineRouter, above both
        // pipelines, where there is exactly one place to forget.
        return ExperimentPipeline.attachDesignContext(
          capturedIntelligence ? { ...generated, creativeIntelligence: capturedIntelligence } : generated,
          capturedBlueprint,
          capturedTypography,
          capturedGeometry,
        );
      } catch (err: any) {
        console.error("[EVOLUTION][EXPERIMENT] generation failed", {
          error: err?.message || String(err),
        });
        throw err;
      }
    }

    const judgment = await new CreativeDirectorV1().judge(brief, judgmentFlags);
    recordRoutesOffered(judgment, routes);
    logCreativeStrategyTrace({
      judgment,
      assetCtx,
      objective: mc?.objective,
      flagsOn: decision.features_enabled,
    });
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
        // `false`, and deliberately.
        //
        // The bridge's original job was to push four one-line summaries of the
        // brand, the audience, the element meanings and the rejected direction
        // into hardRequirements, because control mode had deleted the sections
        // that carried them. The composer now carries those same four as full
        // sections instead, so passing `bridge` here too would state each of
        // them twice — once as a sentence and once as a block. One carrier.
        effectiveRequest = applyCreativeDecision(request, decision, false);
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
        // Phase 1.1D. What the director actually decided, in one line, so a
        // reader can see the decision rather than infer it from the flag list.
        // Truncated: these are free text from a model with no length contract.
        console.log("[CREATIVE_DIRECTOR_DECISION]", {
          concept: clip(decision.selected_direction) || clip(decision.strategy_route) || null,
          scene: clip(decision.scene_definition),
          camera: clip(decision.camera_decision),
          lighting: clip(decision.lighting_decision),
          composition: clip(decision.composition_decision),
          composition_reasoning: clip(judgment.reasoning?.composition?.reason),
          typography: clip(decision.typography_decision),
          typography_reasoning: clip(judgment.reasoning?.typography?.reason),
          environment: clip(decision.environment_decision),
          // Empty here while `creative_director_authority_v1` is unwired: these
          // reach the renderer at USER tier as somebody else's directive.
          authority: "see ART_DIRECTION provenance",
        });
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
      const generated = await StablePipeline.run(effectiveRequest, {
        ...options,
        ...cdAuthorityOptions,
        ...(earlyStrategy ? { precomputedStrategy: earlyStrategy } : {}),
        generationProvider: this.wrapProvider(
          inner,
          judgment,
          controlled,
          fixesFor,
          layoutContextFor,
          layoutPriorityOn,
          creativeConstraint,
          bridge,
          blueprintFor
        ),
      });

      // The intelligence the closure captured during generation, handed to the
      // interface. Spread conditionally so a run that produced none returns
      // exactly the object it always returned.
      //
      // The vision review runs above this, in PipelineRouter. See the note at
      // the concurrent branch for why it is not here.
      return ExperimentPipeline.attachDesignContext(
        capturedIntelligence ? { ...generated, creativeIntelligence: capturedIntelligence } : generated,
        capturedBlueprint,
        capturedTypography,
        capturedGeometry,
      );
    } catch (err: any) {
      console.error("[EVOLUTION][EXPERIMENT] generation failed", {
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}
