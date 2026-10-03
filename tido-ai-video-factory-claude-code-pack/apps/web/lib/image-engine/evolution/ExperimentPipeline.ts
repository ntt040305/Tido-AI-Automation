import { SimpleImageGenerationResultV1, SimpleInputRequestV1 } from "../types";
import { ImgStudioImageGenerationProvider } from "../provider/ImgStudioImageGenerationProvider";
import type { ImageGenerationProvider, ProviderImageGenerationInput } from "../provider/ImageGenerationProvider";
// Phase 5.5.5: the render core, called directly. It was reached through a
// 29-line `StablePipeline` pass-through that made one pipeline look like two.
import { SimpleImageGenerationOrchestratorService as RenderCore } from "../service/SimpleImageGenerationOrchestratorService";
import type { RoutingDecision } from "./PipelineRouter";
import { PromptBudgetManagerService } from "../service/PromptBudgetManagerService";
import { PromptBudgetValidator } from "../compiler/PromptBudgetValidator";
import { ProviderPromptOptimizer } from "../compiler/ProviderPromptOptimizer";
import { CreativeDirectorV1, CreativeJudgment, DirectorBriefInput, memoryContextBrief } from "./experiment/CreativeDirectorV1";
import { applyEvaluation, evaluateDirections, evaluationTelemetry, renderRouteEvidence } from "./experiment/DirectionEvaluator";
import { enforceTextRequirement } from "./experiment/CreativeDirectorV1";
import { resolveTextRequirement, textDirective } from "../compiler/ExactCopyIntegrityValidator";
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
import {
  buildCompositionPlan, compositionPlanTelemetry, renderCompositionPlan,
  type CompositionPlan,
} from "./experiment/CompositionPlan";
import {
  TOPIC_OWNER, assemble, auditSections, ownershipTelemetry,
  type PromptSection, type PromptTopic,
} from "./experiment/PromptOwnership";
import { planAssets, assetTelemetry, renderAssets } from "./experiment/AssetIntelligence";
import { buildAssetDNA, renderAssetDNA, assetDNATelemetry } from "./experiment/AssetDNA";
import { chooseStructure, structureTelemetry } from "./experiment/CampaignStructure";
import { adaptFormats, adaptationTelemetry } from "./experiment/FormatAdaptation";
import { buildDesignProject, projectTelemetry } from "./experiment/DesignProject";
import { buildGeometry, geometryTelemetry, renderGeometry } from "./experiment/LayoutGeometry";
import { buildTypographySystem, typographyTelemetry, renderTypography, assignTextRoles, geometryRolesFor } from "./experiment/TypographySystem";
import { brandKitBrief, brandKitDirective, brandKitTelemetry } from "./experiment/BrandKit";
import { buildCreativeDocument, documentTelemetry } from "./experiment/CreativeDocument";
import { critiqueRender, criticTelemetry } from "../benchmark/CommercialRenderCritic";
import { buildCreativeIntelligence, intelligenceTelemetry, CreativeIntelligence } from "./experiment/CreativeIntelligenceView";
import {
  resolveIndustryLandscape,
  renderIndustryLandscapeForDirector,
  type IndustryLandscape,
} from "./experiment/IndustryContextIntelligence";
import {
  buildCreativeOpportunity,
  renderCreativeOpportunityForDirector,
  type CreativeOpportunity,
} from "./experiment/CreativeOpportunity";
import { diagnose } from "../benchmark/CreativeDiagnosis";
import { RenderQualityJudge } from "../benchmark/RenderQualityJudge";
import { compareConcepts } from "../benchmark/ConceptEvaluator";
import { buildProductionContext, validateContext, productionTelemetry } from "./experiment/ProductionPipeline";
import { buildTextLayers, NO_TEXT_DIRECTIVE, typographyRenderTelemetry } from "./experiment/TypographyRenderer";
import {
  buildTypographyPlan,
  renderPlanForImagePrompt,
  typographyPlanTelemetry,
  type TypographyPlan,
} from "./experiment/TypographyPlan";
import { composeEditable, editableTelemetry, type ComposeResult } from "./experiment/EditableDesign";
import { buildTypographyDNA, categoryHint, renderDnaForImagePrompt } from "./experiment/TypographyDNA";
import { TYPOGRAPHY_REQUIREMENTS, compileOnePassPrompt, opticalTelemetry, type OnePassScript } from "./experiment/OpticalCompiler";
import { buildTextLedgers, ledgerTelemetry } from "./experiment/TextLedgerSystem";
import { finishTelemetry, renderFinishForPrompt, resolveFinish } from "./experiment/FinishLayer";
import { ideaTelemetry, renderIdeaForPrompt, resolveIdea } from "./experiment/IdeaLayer";
import { copyFitsChannel, profileFor, profileTelemetry } from "./experiment/AssetProfile";
import { copyPolicyMode, directorModel, includeLabelText, isV2, templateReload } from "../prompt-v2/engine-selector";
import { buildSimplePrompt, simpleTelemetry, type SimpleResult } from "../prompt-v2/build-simple";
import type { AspectRatio } from "../prompt-v2/templates";
import {
  cinematographyTelemetry,
  projectToSetup,
  renderEnvironmentForPrompt,
  renderLensForPrompt,
  renderLightForPrompt,
  renderSurfaceForPrompt,
  resolveOpticalAxes,
} from "./experiment/CinematographyLayer";
import { gradePrompt, promptGradeTelemetry } from "../benchmark/PromptGrader";
import { TypographyDesignContractService } from "./experiment/TypographyDesignContract";
import type { CreativeDocument } from "./experiment/CreativeDocument";
import type { BrandKit } from "./experiment/BrandKit";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { RoutingResultSchema } from "../types";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { blueprintTelemetry, intentTelemetry, type CreativeBlueprint } from "./experiment/CreativeBlueprint";
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
import { RenderTracer } from "../observability/RenderTracer";

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
const VISUAL_DNA_DISK_CACHE_DIR = path.join(process.cwd(), "data", "cache", "visual-dna");

function cacheKeyFor(images: { role?: string; buffer?: Buffer }[]): string {
  return images
    .filter((i) => i?.buffer?.length)
    .map((i) => `${String(i.role || "").toUpperCase()}:${VisualDNAAnalyzer.hash(i.buffer!)}`)
    .join("|");
}

function readVisualDNACache(cacheKey: string): VisualDNA | null {
  if (!cacheKey) return null;
  const inMem = VISUAL_DNA_CACHE.get(cacheKey);
  if (inMem) return inMem;

  try {
    const keyHash = crypto.createHash("sha256").update(cacheKey).digest("hex").slice(0, 24);
    const diskPath = path.join(VISUAL_DNA_DISK_CACHE_DIR, `${keyHash}.json`);
    if (fs.existsSync(diskPath)) {
      const content = fs.readFileSync(diskPath, "utf-8");
      const parsed = JSON.parse(content) as VisualDNA;
      if (parsed?.provenance?.derived_from_image && parsed?.observed) {
        if (VISUAL_DNA_CACHE.size >= VISUAL_DNA_CACHE_MAX) {
          VISUAL_DNA_CACHE.delete(VISUAL_DNA_CACHE.keys().next().value as string);
        }
        VISUAL_DNA_CACHE.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch (_) {}
  return null;
}

function writeVisualDNACache(cacheKey: string, dna: VisualDNA): void {
  if (!cacheKey || !dna?.provenance?.derived_from_image) return;
  if (VISUAL_DNA_CACHE.size >= VISUAL_DNA_CACHE_MAX) {
    VISUAL_DNA_CACHE.delete(VISUAL_DNA_CACHE.keys().next().value as string);
  }
  VISUAL_DNA_CACHE.set(cacheKey, dna);

  try {
    const keyHash = crypto.createHash("sha256").update(cacheKey).digest("hex").slice(0, 24);
    if (!fs.existsSync(VISUAL_DNA_DISK_CACHE_DIR)) {
      fs.mkdirSync(VISUAL_DNA_DISK_CACHE_DIR, { recursive: true });
    }
    const diskPath = path.join(VISUAL_DNA_DISK_CACHE_DIR, `${keyHash}.json`);
    fs.writeFileSync(diskPath, JSON.stringify(dna), "utf-8");
  } catch (_) {}
}

function strategyFromJudgment(
  j: CreativeJudgment,
  brief: DirectorBriefInput,
  assetCtx?: any
): MarketingBrainStrategy {
  const dec = toCreativeDecision(j);
  const route = j.strategy?.selected || j.selected || "Commercial Hero";
  const reason = j.strategy?.selection_reason || j.selection_reason || brief.concept || "";
  const consumer = j.consumer;
  const brand = j.brand;
  const reasoning = j.reasoning;

  return {
    creative_angle: route,
    commercial_goal: brief.objective || "Commercial product display",
    target_customer_psychology: consumer?.viewer || consumer?.desire_driver || "Target consumer",
    prompt_guidance: dec?.scene_definition || reason || route,
    consumer_insight: consumer?.first_feeling || consumer?.trust_driver || reason,
    emotional_response: brand?.emotional_territory || consumer?.first_feeling || "poised commercial confidence",
    creative_message: reason || route,
    asset_reasoning: assetCtx?.communication_goal || undefined,
    communication_objective: brief.objective || undefined,
    creative_route: route,
    brand_personality: brand?.personality || undefined,
    visual_translation: {
      scene_moment: dec?.scene_definition || "Product presented in tailored commercial environment",
      human_presence: consumer?.viewer ? `Authentic reflection of ${consumer.viewer}` : undefined,
      camera_intent: reasoning?.camera?.choice || dec?.camera_decision,
      typography_intent: reasoning?.typography?.choice || dec?.typography_decision,
      subject_representation: route,
      atmosphere: dec?.environment_decision || "focused commercial setting",
      lighting_character: reasoning?.lighting?.choice || dec?.lighting_decision || "controlled directional studio lighting",
      material_treatment: (dec as any)?.materials_decision || "authentic product texture",
      composition_principle: reasoning?.composition?.choice || dec?.composition_decision || "balanced hierarchy",
      colour_direction: reasoning?.colour?.choice || "harmonious palette",
    },
  };
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
  /**
   * The v2 record, on the result the API returns.
   *
   * Additive and additive only: the response keeps every field it had, and gains
   * `promptV2` when the v2 engine ran. The vision review reads `copy_final` from
   * here, because under `adapt` the words the renderer was asked to draw are not
   * the words the client typed -- and a gate that compares the wrong list would
   * report a correct render as wrong.
   */
  private static attachV2<T extends object>(result: T, v2: SimpleResult | null): T {
    if (!v2) return result;
    Object.assign(result as Record<string, unknown>, {
      promptV2: {
        ...simpleTelemetry(v2),
        copy_original: v2.copy_original,
        copy_final: v2.copy_final,
        warnings: v2.warnings,
        // What the director filled in that the client never said, and the plan it
        // worked to. On the job because they are the two outputs a human may want to
        // overrule, and neither is visible in the image.
        assumptions: v2.assumptions,
        plan: v2.plan,
        template_version: v2.templates?.version,
        copy_policy_source: copyPolicyMode().source,
        reference_roles: v2.referenceRoles,
        // Empty under the simplified engine, and deliberately so: the model returns
        // four tags and none of them is a per-product label list. The post-render
        // label check (`V2_LABEL_CHECK`, default off) reads this, and with an empty
        // list it simply has nothing to compare -- it does not report a false
        // mismatch. Recovering it would mean a fifth tag; CHANGELOG_V2 records the
        // trade rather than hiding it.
        labels: [] as string[],
      },
    });
    return result;
  }

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
    ) => string | undefined,
    /**
     * The render prompt's last word on text: "use exactly the provided text"
     * or "do not add any typography or text". Appended after everything else,
     * because every earlier section may mention type and recency is how a
     * renderer resolves a conflict.
     */
    textDirectiveText?: string | (() => string),
    /**
     * Phase 5.5. Editable mode. The provider renders the scene only; the
     * layers the design document places -- exact text, CTA plate, the brand's
     * own logo -- are composited over it here, their assets stored beside the
     * render, and the composite returned as the image. Absent, nothing changes.
     */
    editable?: {
      document: () => CreativeDocument | null;
      brandKit: BrandKit | null;
      logo: Buffer | null;
      /** The typography plan, resolved at composition time. */
      plan?: () => TypographyPlan | null;
      /** The blueprint, resolved at composition time. Phase 5.6.3. */
      blueprint?: () => CreativeBlueprint | null;
      /** The composition decided before the render. Phase 5.6.4. */
      compositionPlan?: () => CompositionPlan | null;
      onComposed: (result: ComposeResult) => void;
    },
    /**
     * One-pass. The eight-block render script, built from the analysis layer's
     * own output once the composer and the blueprint have run.
     *
     * Lazy for the same reason the directive is: the composition plan and the
     * typography plan are built inside the execution block, which runs while this
     * provider is being awaited rather than before it was wrapped.
     *
     * When it returns a script, THAT script is the prompt. Blocks 1-7 carry the
     * routed analysis sections, BLOCK 8 carries the ledgers, and everything BLOCK
     * 8 supersedes -- the compiler's copy section, the typography art direction,
     * the blueprint's typography and layout directions, the old text directive --
     * is dropped by the router instead of being appended here.
     */
    opticalScriptFor?: (composed: string, blueprintText?: string) => OnePassScript | null,
    /**
     * The v2 engine, when `PROMPT_ENGINE=v2`.
     *
     * Async because it makes a model call, and awaited here rather than at the
     * call site because this is where the prompt is decided. Returning null -- for
     * a timeout, a reply with no `<image_prompt>`, or a check the one repair did not
     * fix -- leaves v1 to produce the prompt, which is the whole point of keeping
     * v1.
     */
    v2For?: () => Promise<SimpleResult | null>
  ): ImageGenerationProvider {
    return {
      async generateImage(input: ProviderImageGenerationInput) {
        if (RenderTracer.isTraceEnabled()) {
          RenderTracer.recordCheckpoint("B", "Input entering wrapProvider()", input.prompt, { generationId: input.generationId });
        }
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
        if (RenderTracer.isTraceEnabled()) {
          RenderTracer.recordCheckpoint("C", "Output after NanoBananaPromptComposer", composed, { generationId: input.generationId });
        }
        // Headroom against the budget the compiler itself enforces. The
        // blueprint is appended after compilation, so without this it escapes
        // the discipline every other section is held to: measured live, the
        // prompt reached 30,402 characters against a 24,000 hard maximum.
        // Resolved here rather than at the call site: in Editable mode the
        // directive carries the typography plan, which does not exist until the
        // execution block has run -- which happens while this provider is being
        // awaited, not before it was wrapped.
        const directive = typeof textDirectiveText === "function" ? textDirectiveText() : textDirectiveText;
        const headroom =
          PromptBudgetManagerService.HARD_MAXIMUM - composed.length - 2 - (directive ? directive.length + 2 : 0);
        const blueprintText = blueprintFor ? blueprintFor(judgment, headroom, composed) : undefined;
        const withBlueprint = blueprintText ? `${composed}\n\n${blueprintText}` : composed;
        // One-pass: the eight-block script IS the prompt. The legacy assembly
        // below it survives only as the path a failed compile falls back to, which
        // is also the editable path -- nothing else reaches the provider.
        const v2 = v2For ? await v2For() : null;
        const optical = opticalScriptFor ? opticalScriptFor(composed, blueprintText) : null;
        const finalPrompt = v2?.ok && v2.prompt
          ? v2.prompt
          : optical
          ? optical.prompt
          : directive
            ? `${withBlueprint}\n\n${directive}`
            : withBlueprint;
        if (v2) {
          // Logged as ONE STRING, not an object.
          //
          // Next 16's dev-server log file writes every object argument as `{}`, so
          // the object form of this line told a reader only that v2 ran -- not
          // whether it reached the model, which check rejected it, or why it fell
          // back. That is the whole diagnostic value of the line. A measured case:
          // `[PROMPT_V2] {}` / `[PROMPT_V2] falling back to v1 {}` was the entire
          // record of a failed build.
          // Which files produced this image. The first question a bad render raises, and
          // a content hash answers it even when somebody edited a template in place
          // without bumping the version.
          if (v2.templates) {
            const digest = (text: string) => crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
            console.log(
              `[PROMPT_V2][version] system=system.${v2.templates.version}.md@${digest(v2.templates.system)} ` +
                `request=request.${v2.templates.version}.md@${digest(v2.templates.request)} ` +
                `playbook=${v2.templates.playbookName}@${input.aspectRatio || "?"} ` +
                `gold=${v2.templates.goldExample.trim() ? `${v2.templates.playbookName}.md` : "none"} ` +
                `copy_policy=${v2.copyPolicy}(${copyPolicyMode().source}) ` +
                `refs_sent_to_director=[${(v2.referenceRoles || []).join(",")}]`,
            );
          }
          // What the director assumed and planned. Abridged, because the point is that a
          // human can glance at it, and the full text is on the job.
          for (const line of v2.assumptions.slice(0, 8)) console.log(`[PROMPT_V2][assumption] ${line.slice(0, 160)}`);
          if (v2.plan) {
            for (const line of v2.plan.split(/\r?\n/).filter(Boolean).slice(0, 8)) {
              console.log(`[PROMPT_V2][plan] ${line.slice(0, 160)}`);
            }
          }
          const t = simpleTelemetry(v2);
          console.log(
            `[PROMPT_V2] ok=${t.ok} calls=${t.llm_calls} tpl=${t.template_version} playbook=${t.playbook} ` +
              `policy=${t.copy_policy} words=${t.prompt_words} copy=${t.copy_strings} adapted=${t.copy_adapted} ` +
              `checks=[${(t.check_codes || []).join(",")}] missing_tags=[${(t.missing_tags || []).join(",")}] ` +
              `warnings=${t.warnings} chars_sent=${finalPrompt.length}`,
          );
          // The warnings, printed. These are the things a human has to know and
          // cannot see in the image: copy that was shortened, a claim that may need
          // review, a label the model could not read. Measured case: a render came
          // back with `adapted=true` and the only record of WHICH words were changed
          // was a warning nobody printed.
          for (const w of v2.warnings) console.warn(`[PROMPT_V2][warning] ${w}`);
          if (v2.copyPolicy === "adapt" && v2.copy_original.join("\u0001") !== v2.copy_final.join("\u0001")) {
            console.warn(`[PROMPT_V2][copy] the client typed: ${JSON.stringify(v2.copy_original)}`);
            console.warn(`[PROMPT_V2][copy] the render was asked for: ${JSON.stringify(v2.copy_final)}`);
          }
          if (!v2.ok) {
            console.warn(`[PROMPT_V2] falling back to v1 — ${v2.reason || "no reason given"}`);
            // Every failure message, each on its own line, so the fix is readable
            // rather than inferred from a code.
            for (const f of v2.checks?.failures || []) console.warn(`[PROMPT_V2][${f.code}] ${f.message}`);
            if (v2.reply?.stray) console.warn(`[PROMPT_V2][stray] ${v2.reply.stray.slice(0, 300)}`);
          }
        }
        if (optical) {
          console.log("[OPTICAL][SCRIPT]", {
            ...opticalTelemetry(optical),
            dropped: optical.route.dropped,
            unrouted: optical.route.unrouted,
            knowledge_cards: optical.route.knowledgeCards,
            deduped_lines: optical.deduped.lines,
            deduped_chars: optical.deduped.chars,
            chars_legacy_assembly: withBlueprint.length + (directive ? directive.length + 2 : 0),
            chars_sent: finalPrompt.length,
          });
          // How specific the script actually is, measured on the string being
          // sent. Deterministic and free, so it rides on every render instead of
          // waiting for a vision judge that costs 100 VND and cannot separate
          // small differences. It grades DECISIVENESS, never quality.
          console.log("[OPTICAL][GRADE]", promptGradeTelemetry(gradePrompt(finalPrompt)));
          if (!optical.ok) {
            console.warn("[OPTICAL][SCRIPT] invariant failed", {
              failed: optical.invariants.filter((x) => !x.ok).map((x) => `${x.id}: ${x.because}`),
            });
          }
        }
        if (RenderTracer.isTraceEnabled()) {
          RenderTracer.recordCheckpoint("F", "FINAL ProviderImageGenerationInput.prompt immediately before ImgStudio HTTP dispatch", finalPrompt, { generationId: input.generationId });
        }
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
        if (RenderTracer.isTraceEnabled()) {
          RenderTracer.stage({
            stageNum: "13",
            name: "PROMPT COMPOSER & BLUEPRINT SYNTHESIS",
            file: "apps/web/lib/image-engine/evolution/ExperimentPipeline.ts",
            func: "wrapProvider",
            input: {
              compiledPromptChars: input.prompt.length,
              hasJudgment: Boolean(judgment),
              controlled,
              fixesApplied: Boolean(fixes),
              hasBlueprint: Boolean(blueprintText),
              hasDirective: Boolean(directive),
            },
            decision: {
              composedPromptChars: composed.length,
              blueprintChars: blueprintText?.length ?? 0,
              finalPromptChars: finalPrompt.length,
              headroom,
            },
            output: {
              finalPrompt,
            },
            nextStage: "inner.generateImage",
          });

          RenderTracer.stage({
            stageNum: "14",
            name: "IMAGE PROVIDER REQUEST & GENERATION",
            file: "apps/web/lib/image-engine/evolution/ExperimentPipeline.ts",
            func: "wrapProvider -> inner.generateImage",
            input: {
              model: input.model || "flow-nano-banana-2",
              aspectRatio: input.aspectRatio,
              referenceCount: input.references?.length ?? 0,
              promptChars: finalPrompt.length,
            },
            decision: {
              provider: "ImgStudioImageGenerationProvider",
              model: "flow-nano-banana-2",
              endpoint: (input.references?.length ?? 0) > 0 ? "/api/v1/images/edit" : "/api/v1/images/generate",
            },
            output: "calling provider...",
            nextStage: "ImgStudio API Response",
          });
          RenderTracer.recordImageRender();
        }

        const out = await inner.generateImage({ ...input, prompt: finalPrompt });
        if (out && !out.finalPrompt) out.finalPrompt = finalPrompt;

        if (RenderTracer.isTraceEnabled()) {
          RenderTracer.stage({
            stageNum: "14.1",
            name: "IMAGE PROVIDER RESPONSE RECEIVED",
            file: "apps/web/lib/image-engine/evolution/ExperimentPipeline.ts",
            func: "wrapProvider",
            input: { success: out.success, error: out.error?.code },
            decision: {
              imageBufferBytes: out.imageBuffer?.length ?? 0,
              imageUrl: out.imageUrl,
              cost_vnd: out.remoteDetails?.cost_vnd,
            },
            output: out,
            nextStage: "attachDesignContext",
          });
        }
        if (!editable || !out.success || !out.imageBuffer) return out;
        const editablePostRenderActive = Boolean(process.env.TIDO_ENABLE_EDITABLE_POST_RENDER === "true");
        if (!editablePostRenderActive) {
          // Production Flat Render: Nano Banana 2 renders typography directly inside the artwork.
          // Return pure flat raster image buffer without post-render compositing modifications.
          return out;
        }
        const doc = editable.document();
        if (!doc) {
          console.warn("[EXPERIMENT][EDITABLE] no design document was built; serving the scene as rendered");
          return out;
        }
        try {
          const composed = await composeEditable({
            document: doc,
            brandKit: editable.brandKit,
            scene: out.imageBuffer,
            logo: editable.logo,
            plan: editable.plan?.() ?? null,
            // Phase 5.6.3: the director's decisions reach the compositor, which
            // is what lets the type be art-directed rather than only placed.
            blueprint: editable.blueprint?.() ?? null,
            // Phase 5.6.4: the frame the render was composed for, so the
            // typography engine places into a composition rather than reasoning
            // about the brief a second time.
            compositionPlan: editable.compositionPlan?.() ?? null,
          });
          ExperimentPipeline.storeLayerFiles(input.generationId, composed.files);
          editable.onComposed(composed);
          console.log("[EXPERIMENT][EDITABLE]", editableTelemetry(composed.design));
          return { ...out, imageBuffer: composed.composite, mimeType: "image/png" };
        } catch (err: any) {
          // The scene alone carries none of the client's words, so this is
          // said loudly; the vision review's text check will see it too.
          console.error("[EXPERIMENT][EDITABLE] compositing failed; serving the scene without its layers", {
            error: err?.message || String(err),
          });
          return out;
        }
      },
    };
  }

  /**
   * Phase 5.5. Layer assets beside the render they belong to, under the same
   * traversal guard the image storage uses.
   */
  private static storeLayerFiles(generationId: string | undefined, files: Record<string, Buffer>): void {
    if (!generationId || /[\\/]|\.\./.test(generationId)) throw new Error("no safe generation id for layer assets");
    const base = path.resolve(IMAGE_ENGINE_CONFIG.GENERATED_DIR);
    const dir = path.resolve(base, generationId);
    if (!dir.startsWith(base + path.sep)) throw new Error("layer asset path escapes the generated directory");
    for (const [rel, buf] of Object.entries(files)) {
      const target = path.resolve(dir, rel);
      if (!target.startsWith(dir + path.sep)) throw new Error(`layer asset path escapes its directory: ${rel}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
    }
  }

  /**
   * Attaches the structures this render was built from, when there were any.
   *
   * Non-enumerable on purpose. These are internal design objects, not part of
   * the API contract: the review layer reads them in-process and they must not
   * ride along into a JSON response, a log line or a database row. Making them
   * non-enumerable means `JSON.stringify` and every spread that builds the HTTP
   * payload skip them without anyone having to remember to strip them.
   *
   * `visualDna` is the last of them and the one that leaves the process: it is
   * what a model actually SAW in the uploaded images, as opposed to what was
   * reasoned from it, and asset memory is keyed by those bytes. The engine has
   * no account and no database and must keep it that way, so the observation
   * travels out to the caller rather than the store travelling in here.
   */
  private static attachDesignContext(
    result: SimpleImageGenerationResultV1,
    blueprint: unknown,
    typography: unknown,
    geometry: unknown,
    composition?: unknown,
    assetDna?: unknown,
    prompt?: string | null,
    strategy?: unknown,
    visualDna?: unknown,
    judgment?: unknown,
    designDocument?: unknown,
    compositionPlan?: unknown,
    typographyDna?: unknown,
    industryLandscape?: unknown,
    creativeOpportunity?: unknown,
  ): SimpleImageGenerationResultV1 {
    if (!blueprint && !typography && !geometry && !composition && !assetDna && !prompt && !strategy && !visualDna && !judgment && !designDocument && !compositionPlan && !typographyDna && !industryLandscape && !creativeOpportunity) {
      return result;
    }
    for (const [key, value] of [
      ["creativeBlueprint", blueprint],
      ["typographySystem", typography],
      ["layoutGeometry", geometry],
      ["visualComposition", composition],
      ["assetDna", assetDna],
      ["compiledPrompt", prompt],
      ["marketingStrategy", strategy],
      ["visualDna", visualDna],
      ["creativeJudgment", judgment],
      // Phase 5.1: the editable design document the render was made from.
      ["designDocument", designDocument],
      // Phase 7: the decisions the vision review compares the render against.
      // Without them the loop can say what it saw and not whether it was what
      // was asked for.
      ["compositionPlan", compositionPlan],
      ["typographyDna", typographyDna],
      ["industryLandscape", industryLandscape],
      ["creativeOpportunity", creativeOpportunity],
    ] as const) {
      if (!value) continue;
      Object.defineProperty(result, key, { value, enumerable: false, configurable: true });
    }
    return result;
  }

  public static async run(
    request: SimpleInputRequestV1,
    options: Parameters<typeof RenderCore.generateSimpleImage>[1],
    decision: RoutingDecision
  ): Promise<SimpleImageGenerationResultV1> {
    const f = decision.flags.features;
    // Which words may appear in this image: exactly the lines the person typed,
    // or none. Resolved once here and read by the director, the blueprint and
    // the final prompt, so no layer can hold a different answer.
    const textRequirement = resolveTextRequirement(request);

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
    // Typography Composition Hardening V1. Rides on the execution layer: the
    // plan reads the geometry and the typography system, which are built there.
    const typographyPlanOn = executionOn && Boolean(f.typography_plan_v1);
    // Phase 5.6.2 — HYBRID TYPOGRAPHY. Not a mode, and not a user choice:
    // this is how the system sets type.
    //
    //   the image model renders the SCENE -- product, light, atmosphere, and
    //   the empty space the copy will occupy -- and no words at all;
    //   the typography engine then sets the client's exact text and places the
    //   brand's own mark.
    //
    // It used to be opt-in through a routing flag, which meant the default
    // render asked an image model to spell -- the thing it is measurably worst
    // at, and the thing locked rule 8 forbids for logo, price, CTA and subtitle.
    // It engages whenever there is something to place; a brief with no text and
    // no logo has nothing to compose, so the scene IS the finished picture.
    const hasTextToSet = textRequirement.lines.length > 0;
    const hasMarkToPlace =
      (request.images || []).some((i) => (i as { role?: string }).role === "LOGO") ||
      Boolean(decision.brandKit?.has_logo);
    const editableOn = executionOn && (hasTextToSet || hasMarkToPlace);
    // Safest minimal runtime guard: Editable post-render compositing is bypassed for production flat render.
    // Set TIDO_ENABLE_EDITABLE_POST_RENDER=true to re-enable post-render SVG compositing.
    const editableActive = editableOn && Boolean(process.env.TIDO_ENABLE_EDITABLE_POST_RENDER === "true");

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
      // Reached only under the kill switch: core features cannot otherwise be
      // turned off (Phase 5.5.5). The render goes through the core without the
      // director -- a degraded render, so an outage in the LLM layer degrades
      // quality instead of failing the request.
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
        console.warn("[EVOLUTION][EXPERIMENT] flags enabled with no implementation yet — rendering without the director", {
          flags: otherFlags,
        });
      } else {
        console.warn("[EVOLUTION][EXPERIMENT] kill switch: no features enabled — rendering without the director");
      }
      return RenderCore.generateSimpleImage(request, options);
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
    // Start KnowledgeRouter in parallel with VisualDNA and Creative Director
    const attachments = [...(request.images || []), ...(request.referenceImages || [])];
    const routerPromise: Promise<RoutingResultSchema | null> = (async () => {
      try {
        const { KnowledgeRouterService } = await import("../service/KnowledgeRouterService");
        const routerService = new KnowledgeRouterService();
        const res = await routerService.analyzeProductReferences({
          images: attachments.map((a: any, idx: number) => ({
            reference_id: a.reference_id || `REF_${String(idx + 1).padStart(2, "0")}`,
            buffer: a.buffer,
            mimeType: a.mimeType || "image/png",
            filename: a.filename || `ref_${idx + 1}.png`,
          })),
          concept: request.concept,
          useCase: request.useCase,
          aspectRatio: request.aspectRatio,
        });
        return res.success && res.routing ? res.routing : null;
      } catch (e: any) {
        console.warn("[EXPERIMENT][ROUTER_PARALLEL] non-fatal router pre-fetch error:", e?.message || e);
        return null;
      }
    })();

    let visualDNA: VisualDNA | null = null;
    if (visualDNAOn) {
      const cacheKey = cacheKeyFor(attachments as any);
      const cached = readVisualDNACache(cacheKey);
      const dnaStart = Date.now();
      visualDNA = await new VisualDNAAnalyzer().analyze({
        images: attachments as any,
        // The analyzer compares hashes and skips the call when they still match.
        // Handing it null, as this did, guaranteed a miss on every render.
        existingDNA: cached ?? null,
      });
      if (visualDNA && cacheKey && !cached) {
        writeVisualDNACache(cacheKey, visualDNA);
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
    /**
     * The director's own judgment: every direction it considered, the one it
     * chose, why, and the strongest one it turned down.
     *
     * Captured for the same reason the intelligence is -- it already exists and
     * is otherwise discarded when the response is written. Only
     * `selected_direction` survived before, which records what was decided
     * while losing what it was decided OVER.
     */
    let capturedJudgment: CreativeJudgment | null = null;
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
    // The rest of what a render decides. Captured for the same reason as the
    // three above: each already exists, each is thrown away when the response
    // is written, and none of them can be recovered afterwards.
    let capturedComposition: any = null;
    /**
     * Phase 5.6.4. The composition, decided before the render and the only
     * account of the frame: where the product is, how it is framed and lit,
     * what stays quiet and what that means for the words. Captured for the same
     * reason the geometry is -- the critic checks the render against it, and
     * the record has to show what was asked for.
     */
    let capturedCompositionPlan: CompositionPlan | null = null;
    let capturedAssetDna: any = null;
    let capturedPrompt: string | null = null;
    // The v2 build, when the flag selected it. Null on the v1 path, which is the
    // default: nothing here runs unless PROMPT_ENGINE=v2.
    let capturedV2: SimpleResult | null = null;
    // Phase 5.1: the editable design document, when the execution layer built one.
    let capturedDocument: any = null;
    // The typography plan. Captured for the same reason the geometry is: the
    // compositor reads it, the vision critic checks the render against it, and
    // neither could see it if it lived only inside the execution block.
    let capturedPlan: TypographyPlan | null = null;
    // Phase 5.5: Editable mode. The render request carries no words and no
    // logo -- the scene only -- while `textRequirement` above keeps the
    // client's lines for the director, the typography and the document. The
    // logo is held back to be placed as its own layer, unaltered.
    const editableLogo = editableActive
      ? ((request.images || []).find((i) => (i as { role?: string }).role === "LOGO") as { buffer?: Buffer } | undefined)?.buffer ?? null
      : null;
    const renderSource = (r: SimpleInputRequestV1): SimpleInputRequestV1 =>
      editableActive
        ? {
            ...r,
            contentMessage: "",
            copyItems: [],
            images: (r.images || []).filter((i) => (i as { role?: string }).role !== "LOGO"),
          }
        : r;
    // Editable mode: the model is told what SPACE the type needs and that it
    // renders none of it. The plan is resolved lazily because it is built
    // inside the execution block below, after the blueprint exists, and this
    // string is assembled before the provider is wrapped.
    const finalDirective = editableActive
      ? () =>
          [
            brandKitDirective(decision.brandKit, "none", { logo: false }),
            typographyPlanOn ? renderPlanForImagePrompt(capturedPlan) : undefined,
            // Phase 5.6.3: what the reserved area must BE for the planned
            // typographic treatment to read on it. Silent for a plain
            // treatment, which is most of them, so the prompt does not grow
            // for a render that asks nothing extra of the frame.
            renderDnaForImagePrompt(
              buildTypographyDNA({
                blueprint: capturedBlueprint,
                personality: capturedPlan?.style?.personality ?? null,
                category: categoryHint(capturedBlueprint),
                brandKit: decision.brandKit ?? null,
                // How much copy there is changes what typography is FOR: one
                // line against a stated idea is a hero statement, five lines
                // are information to be ordered.
                copyLines: textRequirement.lines.length,
              }),
            ),
            NO_TEXT_DIRECTIVE,
          ]
            .filter(Boolean)
            .join("\n\n")
      : [brandKitDirective(decision.brandKit, textRequirement.mode), textDirective(textRequirement)].filter(Boolean).join("\n\n");
    const editableHooks = editableActive
      ? {
          document: () => capturedDocument as CreativeDocument | null,
          brandKit: decision.brandKit ?? null,
          logo: editableLogo,
          plan: () => capturedPlan,
          blueprint: () => capturedBlueprint,
          compositionPlan: () => capturedCompositionPlan,
          onComposed: (r: ComposeResult) => {
            capturedDocument = { ...(capturedDocument || {}), version: 3, editable_mode: true, editable: r.design };
          },
        }
      : undefined;
    if (editableActive) {
      console.log("[EXPERIMENT][EDITABLE] mode on", { text_lines: textRequirement.lines.length, logo_layer: Boolean(editableLogo) });
    }
    // One-pass: the eight-block script.
    //
    // Everything the analysis layer decided reaches the renderer through this and
    // nothing else. Built lazily: the composition plan, the typography plan and the
    // typography DNA are produced inside the execution block, which runs while the
    // provider is being awaited.
    //
    // Null in editable mode, where the model renders the scene only, and null on a
    // failed compile -- in both cases the legacy assembly still runs, so a bug here
    // cannot cost a render.
    // v2: one LLM call that writes the prompt itself. Off unless PROMPT_ENGINE=v2.
    //
    // Built here because this is where the request, the asset context and the
    // product buffers are all in scope. It never throws: `buildSimplePrompt` turns
    // every failure into `ok: false`, and this returns null on anything else so
    // the v1 assembly below still runs.
    const v2For = !isV2()
      ? undefined
      : async (): Promise<SimpleResult | null> => {
          try {
            const { LLMProviderService } = await import("../llm/llm-provider.service");
            const llm = new LLMProviderService();
            // EVERY reference, in the order the provider appends them -- not just the
            // products. A supplied LOGO used to reach the renderer as an attached image
            // while the prompt said "no extra logos or brand marks", so the only
            // instruction that mentioned it told the model to leave it out. The director
            // now sees each photo and what it IS.
            const allReferences = (request.images || []).map((img, i) => ({
              img,
              index: i + 1,
              role: String((img as { role?: string }).role || "").toUpperCase() || "PRODUCT",
              filename: (img as { filename?: string }).filename,
            }));
            const ratio = (["1:1", "9:16", "16:9"].includes(String(request.aspectRatio))
              ? String(request.aspectRatio)
              : "1:1") as AspectRatio;
            const built = await buildSimplePrompt(
              {
                assetType: assetCtx?.asset_type || request.useCase || "Poster",
                aspectRatio: ratio,
                concept: request.concept || "",
                brand: request.brandName || "",
                productLine: (request as { productLine?: string }).productLine,
                copy: textRequirement.lines,
                products: allReferences.map((ref) => {
                  const buf = (ref.img as { buffer?: Buffer }).buffer;
                  const mime = (ref.img as { mimeType?: string }).mimeType || "image/png";
                  return {
                    ref_index: ref.index,
                    role: ref.role,
                    filename: ref.filename,
                    description: (ref.img as { description?: string }).description,
                    ...(buf ? { imageUrl: `data:${mime};base64,${buf.toString("base64")}` } : {}),
                  };
                }),
                includeLabelText: includeLabelText(),
                // Everything the client chose in the visual direction panel. v1 has
                // consumed these since the panel shipped; v2 was ignoring them, so a
                // client who picked "Góc thấp" got whatever angle the director liked.
                visualControls: request.creativeDirection?.visual_controls ?? null,
                visualStyle: request.creativeDirection?.visual_style ?? null,
                emotionalTone: request.creativeDirection?.emotional_tone ?? null,
                compositionLayout: request.creativeDirection?.composition_layout ?? null,
                hardRequirements: (request as { hardRequirements?: string[] }).hardRequirements ?? null,
              },
              {
                chat: (messages, purpose) =>
                  llm.generateChatCompletion(messages as never, purpose, {
                    temperature: 0.7,
                    max_tokens: 8000,
                    timeoutMs: 120000,
                    // A model chosen for THIS call only. Undefined leaves the provider
                    // on its default, which is the behaviour before this option existed.
                    ...(directorModel() ? { model: directorModel() } : {}),
                  }),
              },
            );
            capturedV2 = built;
            return built;
          } catch (err: any) {
            console.warn(`[PROMPT_V2] build threw; v1 will produce the prompt — ${err?.message || err}`);
            return null;
          }
        };

    const opticalScriptFor = editableActive
      ? undefined
      : (composedPrompt: string, blueprintText?: string): OnePassScript | null => {
          try {
            const ledgers = buildTextLedgers({
              requirement: textRequirement,
              roles: (capturedPlan?.blocks || []).map((b) => ({ text: b.content, role: b.text_role })),
              hasProductReference: countAttachedProducts(request) > 0,
            });
            const dna = buildTypographyDNA({
              blueprint: capturedBlueprint,
              personality: capturedPlan?.style?.personality ?? null,
              category: categoryHint(capturedBlueprint),
              brandKit: decision.brandKit ?? null,
              copyLines: textRequirement.lines.length,
            });
            // What kind of photograph this is. Nothing decided this before: the
            // `finish` domain measured 0 of 12 on the benchmark, and it is where a
            // render gives itself away.
            const finish = resolveFinish({
              assetType: assetCtx?.asset_type || request.useCase || null,
              category: categoryHint(capturedBlueprint),
              personality: capturedPlan?.style?.personality ?? null,
              evidence: [
                capturedCompositionPlan?.atmosphere?.value,
                capturedCompositionPlan?.lighting_quality?.value,
                capturedCompositionPlan?.environment?.value,
                capturedCompositionPlan?.storytelling_intent?.value,
                request.concept,
                (decision.brandKit?.style?.preferred || []).join(" "),
              ],
              copyLines: textRequirement.lines.length,
            });
            // The setup that produces the picture. This is the layer that owns
            // camera, lighting and the scene environment: the composition's prose
            // about those three is read here as evidence and does not reach the
            // renderer twice.
            const axes = resolveOpticalAxes({
              assetType: assetCtx?.asset_type || request.useCase || null,
              brand: [
                decision.brandKit?.name ? (decision.brandKit.style?.preferred || []).join(" ") : null,
                capturedPlan?.style?.personality ?? null,
              ],
              evidence: [
                request.concept,
                capturedCompositionPlan?.atmosphere?.value,
                capturedCompositionPlan?.lighting_quality?.value,
                capturedCompositionPlan?.lighting_direction?.value,
                capturedCompositionPlan?.environment?.value,
                capturedCompositionPlan?.storytelling_intent?.value,
                capturedCompositionPlan?.camera_lens_behavior?.value,
                categoryHint(capturedBlueprint),
              ],
            });
            const setup = projectToSetup(axes.values, {
              product_share: capturedCompositionPlan?.product_scale?.value?.share ?? null,
              requires: TYPOGRAPHY_REQUIREMENTS,
              drawing_type: textRequirement.lines.length > 0,
            });
            // The one line the rest of the script serves. It states the idea once,
            // names the directions it beat, and reports when the brief supplied a
            // mood instead of an idea -- the measured cause of the judge's weakest
            // dimension, `creative_concept` at 4.6.
            const idea = resolveIdea({
              concept: (capturedBlueprint as { concept?: Parameters<typeof resolveIdea>[0]["concept"] } | null)?.concept ?? null,
              judgment,
              brief: request.concept,
            });
            const assetType = assetCtx?.asset_type || request.useCase || null;
            const profile = profileFor(assetType);
            const fit = copyFitsChannel(profile, textRequirement.lines.length);
            if (!fit.fits) console.warn("[OPTICAL][CHANNEL] copy exceeds what this channel carries", { note: fit.note });
            const script = compileOnePassPrompt({
              assetType,
              compiled: composedPrompt,
              blueprint: blueprintText ?? null,
              idea: renderIdeaForPrompt(idea),
              plan: capturedCompositionPlan,
              brand: brandKitDirective(decision.brandKit, textRequirement.mode),
              finish: renderFinishForPrompt(finish),
              optics: {
                light: renderLightForPrompt(setup),
                lens: renderLensForPrompt(setup),
                environment: renderEnvironmentForPrompt(setup),
                surface: renderSurfaceForPrompt(setup),
              },
              ledgers,
              treatment: dna.treatment,
              avoidRules: dna.avoid_rules,
              accentInk: Boolean(dna.accent),
            });
            console.log("[OPTICAL][LEDGERS]", ledgerTelemetry(ledgers));
            console.log("[OPTICAL][IDEA]", ideaTelemetry(idea));
            console.log("[OPTICAL][CHANNEL]", profileTelemetry(profile, textRequirement.lines.length));
            console.log("[OPTICAL][FINISH]", finishTelemetry(finish));
            console.log("[OPTICAL][SETUP]", cinematographyTelemetry(setup));
            console.log("[OPTICAL][AXES]", { reconciled: axes.reconciled, low_confidence: Object.entries(axes.confidence).filter(([, c]) => c < 0.25).map(([k]) => k) });
            return script;
          } catch (err: any) {
            console.warn("[OPTICAL][SCRIPT] compile failed; the legacy assembly was sent instead", {
              error: err?.message,
            });
            return null;
          }
        };
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

    // Memory reaches the DIRECTOR, for every experiment render.
    //
    // It used to be read only inside `if (productionOn)` -- gated on
    // `design_production_v1`, which is off -- and even then only appended to
    // the renderer's prompt, after the creative decision had already been made.
    // So recall ran, cost its database reads, and changed nothing. Here it is
    // context for the one component that decides the direction, added after
    // both brief paths so the context/literal equivalence above still holds.
    // Absent memory leaves the brief byte-identical.
    // The text requirement, explicit in the director's brief: exactly these
    // lines, or no text at all. Added after both brief paths, like memory.
    brief = { ...brief, textRequirement };
    // Phase 5.4: the brand's standing identity, for the director.
    const brandBrief = brandKitBrief(decision.brandKit, textRequirement.mode);
    if (brandBrief) {
      brief = { ...brief, brandKit: brandBrief };
      console.log("[EXPERIMENT][BRAND_KIT]", brandKitTelemetry(decision.brandKit));
    }
    console.log("[EXPERIMENT][TEXT_REQUIREMENT]", { mode: textRequirement.mode, lines: textRequirement.lines.length });

    const memoryContext = memoryContextBrief(decision.standingPreferences, decision.creativeMemory);
    // Phase 4.2. How each offered route has gone for this account, read by the
    // director BEFORE it chooses. Absent history leaves the brief unchanged.
    const routeEvidence = renderRouteEvidence(routes, decision.routeEvidence);
    if (routeEvidence) {
      brief = { ...brief, routeEvidence };
      console.log("[EXPERIMENT][ROUTE_EVIDENCE]", {
        routes_with_history: routeEvidence.split(/\r?\n/).filter((l) => l.startsWith("  - ")).length,
      });
    }
    if (memoryContext) {
      brief = { ...brief, memoryContext };
      console.log("[EXPERIMENT][MEMORY_CONTEXT]", {
        preferences: decision.standingPreferences?.length ?? 0,
        observations: decision.creativeMemory?.length ?? 0,
        chars: memoryContext.length,
      });
    }

    // Phase 6 / New Product Principle: Commercial Industry Context & Creative Opportunity
    const rawIndustry = request.marketingContext?.industry || (request as any).industry;
    let industryLandscape: IndustryLandscape | null = null;
    let creativeOpportunity: CreativeOpportunity | null = null;
    if (rawIndustry) {
      industryLandscape = resolveIndustryLandscape(rawIndustry, { userSupplied: rawIndustry });
      const renderedLandscape = renderIndustryLandscapeForDirector(industryLandscape);
      if (renderedLandscape) {
        brief = { ...brief, industryLandscape: renderedLandscape };
      }

      creativeOpportunity = buildCreativeOpportunity({
        landscape: industryLandscape,
        productTruth: productTruthForBrain,
        productMeaning,
        marketingInsight,
        userConcept: request.concept,
        brandKit: decision.brandKit,
      });
      const renderedOpportunity = renderCreativeOpportunityForDirector(creativeOpportunity);
      if (renderedOpportunity) {
        brief = { ...brief, creativeOpportunity: renderedOpportunity };
      }
      console.log("[EXPERIMENT][INDUSTRY_INTELLIGENCE]", {
        industry: industryLandscape.industry_name,
        provenance: industryLandscape.provenance,
        core_opportunity: creativeOpportunity?.core_opportunity ? creativeOpportunity.core_opportunity.slice(0, 60) : null,
        human_tension: creativeOpportunity?.human_tension ? creativeOpportunity.human_tension.slice(0, 60) : null,
      });
    }

    if (RenderTracer.isTraceEnabled()) {
      RenderTracer.stage({
        stageNum: "02",
        name: "CREATIVE CONTEXT & MEMORY ASSEMBLY",
        file: "apps/web/lib/image-engine/evolution/ExperimentPipeline.ts",
        func: "ExperimentPipeline.run",
        input: {
          concept: request.concept,
          useCase: request.useCase,
          aspectRatio: request.aspectRatio,
          productCount,
          flags: judgmentFlags,
        },
        decision: {
          visualDNA: visualDNA ? "analyzed" : "skipped",
          earlyStrategy: earlyStrategy ? "precomputed" : "none",
          industryLandscape: industryLandscape?.industry_name || "none",
          creativeOpportunity: creativeOpportunity?.core_opportunity || "none",
          textRequirement,
          brandBrief: brandBrief ? "attached" : "none",
          memoryContext: memoryContext ? "attached" : "none",
          routeEvidence: routeEvidence ? "attached" : "none",
        },
        output: brief,
        nextStage: "CreativeDirectorV1.judge",
      });
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
            // The authorized text only -- the content field and explicit copy --
            // so the blueprint can never plan type for words nobody supplied.
            //
            // Phase 5.5: in Editable mode the blueprint is written for the SCENE,
            // which carries neither. The words and the mark are composited as
            // their own layers afterwards, and a blueprint that named them would
            // reach the renderer as copy to draw -- directly contradicting the
            // "render no text" instruction in the same prompt. The design
            // document still gets both, from the text requirement and the kit.
            copyItems: editableActive ? [] : textRequirement.lines,
            productCount,
            hasLogo: editableActive ? false : hasLogoForBrain,
            visualDNA,
            decision: dec,
            judgment: j,
          });
          // The explicit text state, on the blueprint itself, so the record of
          // what was planned says whether text was required and which.
          Object.assign(bp as object, { text_requirement: textRequirement });
          console.log("[EXPERIMENT][CREATIVE_BLUEPRINT]", blueprintTelemetry(bp));
          // Phase 6: what the work is FOR, and how many of the five creative
          // questions the brief actually answered. Logged separately because a
          // render that decided the whole picture and none of its purpose is a
          // specific, fixable failure, and the blueprint's own count hides it.
          console.log("[EXPERIMENT][CREATIVE_INTENT]", intentTelemetry(bp));
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
            // The compiled prompt, as sent. Without it no render is
            // reproducible and no regression is attributable to anything.
            capturedPrompt = composedPrompt;
            capturedIntelligence = buildCreativeIntelligence({
              blueprint: bp,
              decision: dec,
              productMeaning,
              marketingInsight,
              critic: critique,
              diagnosis: diagnose(bp, report, concepts),
              concepts,
              industryLandscape,
              creativeOpportunity,
            });
            console.log("[EXPERIMENT][CREATIVE_INTELLIGENCE]", intelligenceTelemetry(capturedIntelligence));
          }
          // Phase 2-4. Six layers, all deterministic, all reading the blueprint
          // that already exists. Appended to the same budget as everything else.
          // Execution layer: geometry first, because typography places against
          // it and the document is built from both.
          let executionText = "";
          if (executionOn) {
            // Phase 5.2: the client's exact lines, each with the role it plays.
            // Roles come from the director where it labelled a line as given;
            // the words themselves are never produced here. No text supplied,
            // no lines: the layout plans no text zone and typography is off.
            const textLines = assignTextRoles(textRequirement.lines, dec?.copy_roles);
            const roles = geometryRolesFor(textLines);
            const geometry = buildGeometry({
              ratio: request.aspectRatio, assetContext: assetCtx, blueprint: bp,
              copyRoles: roles, productCount, hasLogo: hasLogoForBrain || Boolean(decision.brandKit?.has_logo),
              // Phase 5.3: the layout follows the director's composition.
              compositionHint: dec?.composition_decision,
              brandKit: decision.brandKit,
            });
            const typography = buildTypographySystem({
              blueprint: bp, productMeaning, marketingInsight,
              assetContext: assetCtx, geometry, copyRoles: roles,
              lines: textLines,
              brandKit: decision.brandKit,
            });
            capturedGeometry = geometry;
            capturedTypography = typography;
            // Phase 5.6.4/5.6.5: the composition, built here because it OWNS
            // the reserved copy area and everything after it reads that area
            // rather than deriving a second one. Creative direction, then
            // composition, then typography, then rendering.
            const composition = buildComposition({ blueprint: bp, decision: dec, visualDNA });
            capturedCompositionPlan = buildCompositionPlan({
              blueprint: bp, geometry, composition, visualDNA,
              assetContext: assetCtx, copyLines: textLines.length,
              copy: textLines, brandKit: decision.brandKit, ratio: request.aspectRatio,
            });
            console.log("[EXPERIMENT][COMPOSITION_PLAN]", compositionPlanTelemetry(capturedCompositionPlan));
            // The typography plan. Built AFTER the typography system so it can
            // reuse the personality that system already resolved, AFTER the
            // composition whose reserved area it lays blocks into, and BEFORE
            // the document so the document carries it.
            const plan = typographyPlanOn
              ? buildTypographyPlan({
                  mode: textRequirement.mode,
                  lines: textLines,
                  blueprint: bp,
                  assetContext: assetCtx,
                  brandKit: decision.brandKit,
                  geometry,
                  typography,
                  ratio: request.aspectRatio,
                  compositionPlan: capturedCompositionPlan,
                })
              : null;
            capturedPlan = plan;
            if (plan) console.log("[EXPERIMENT][TYPOGRAPHY_PLAN]", typographyPlanTelemetry(plan));
            // Phase 5.1: the editable design document. Built from the same
            // geometry and typography the prompt below is written from, so what
            // the renderer is told and what is stored are one structure.
            const doc = buildCreativeDocument({
              geometry, typography, composition, blueprint: bp,
              brandKit: decision.brandKit, canvasLongEdge: 2048, plan,
            });
            capturedDocument = doc;
            const critique = critiqueRender({ blueprint: bp, geometry, typography, prompt: composedPrompt });
            // Editable mode: the renderer is told where the copy WILL go, so it
            // composes around it, but never given the words to draw.
            // Editable mode: the renderer is told what the frame must LEAVE,
            // never what the words are. With the plan on, the copy zones are
            // transmitted as areas to keep clear rather than under typographic
            // names -- a block headed "headline" is typography vocabulary
            // handed to a model told in the same prompt to render none.
            // Phase 5.6.5: each section declares who OWNS what it says, and the
            // assembly is audited before it is sent. Two modules describing the
            // same camera differently is how a renderer ends up following
            // whichever it read last; this makes that visible in a log line
            // rather than invisible in 23,000 characters.
            //
            // Phase 5.6.4: one composition section in place of the geometry
            // block. It carries what the geometry carried plus the camera, the
            // light and the reason the quiet area is quiet, and is SHORTER than
            // the geometry block and the layer stack together, which it also
            // replaces below.
            const executionSections: PromptSection[] = [];
            const own = (topic: PromptTopic, text: string | undefined) => {
              if (text) executionSections.push({ topic, owner: TOPIC_OWNER[topic], text });
            };
            // `omitOptics`: the camera, the light and the environment are stated as
            // parameters by `CinematographyLayer`, which read this plan as its
            // evidence. The plan's prose about them would be the same decision a
            // second time, in the vaguer vocabulary.
            own("composition", renderCompositionPlan(capturedCompositionPlan, { sceneOnly: editableActive && typographyPlanOn, omitOptics: true }));
            if (editableActive) {
              own("render_constraints", NO_TEXT_DIRECTIVE);
            } else {
              const contract = TypographyDesignContractService.buildContract({
                lines: textLines,
                blueprint: bp,
                compositionPlan: capturedCompositionPlan,
                brandKit: decision.brandKit,
                typographySystem: typography,
                ratio: request.aspectRatio,
                personality: capturedPlan?.style?.personality ?? null,
              });
              own("typography_intent", TypographyDesignContractService.renderAgencyTypographyArtDirection(contract));
            }
            const ownership = auditSections(executionSections);
            console.log("[EXPERIMENT][PROMPT_OWNERSHIP]", ownershipTelemetry(ownership));
            for (const c of ownership.contested) {
              console.warn("[EXPERIMENT][PROMPT_OWNERSHIP] contested", {
                section: c.section, wrote_about: c.topic, owned_by: TOPIC_OWNER[c.topic], phrases: c.phrases,
              });
            }
            executionText = assemble(executionSections);
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
            capturedComposition = comp;
            const assets = planAssets({ decision: dec, visualDNA, productMeaning });
            const structure = chooseStructure({
              assetContext: assetCtx, marketingInsight, decision: dec,
              objective: mc?.objective, productCount, copyItems: textRequirement.lines,
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
            capturedAssetDna = assetDna;
            // Standing preferences, supplied by the caller. This layer does not
            // know or ask whose they are -- it receives sentences.
            //
            // Last in the section list on purpose: a preference assists, so
            // when the budget is tight it is the first thing to fall away,
            // never the product's observed surface or the director's decisions
            // for the brief actually in front of it.
            // Not repeated when the director already received them as context:
            // one observation stated in two places is the duplicate-carrier
            // defect, and the director's decisions already carry its use of it.
            const prefs = memoryContext ? [] : decision.standingPreferences || [];
            const prefText = prefs.length
              ? [
                  "STANDING CREATIVE PREFERENCES",
                  "Apply these only where the brief above does not already say otherwise.",
                  ...prefs.map((p) => `- ${p}`),
                ].join("\n")
              : undefined;

            // Phase 3.5. What this workspace's own kept work suggests.
            //
            // Its own block rather than folded into the preferences, and worded
            // as evidence rather than as direction: these are statistical
            // observations over a body of work, and a pattern seen three times
            // must not read like something the client asked for.
            //
            // Last in the list, below even the preferences, so it is the first
            // thing dropped when the budget is tight. Memory assists; the
            // product's observed surface and the director's decisions for THIS
            // brief do not yield to it.
            const recalled = memoryContext ? [] : decision.creativeMemory || [];
            const memoryText = recalled.length
              ? [
                  "WHAT THIS WORKSPACE'S OWN WORK SUGGESTS",
                  "Observations from previous kept renders, not instructions.",
                  "Ignore any of these that the brief above contradicts, and do not let them",
                  "make this render resemble the last one.",
                  ...recalled.map((m) => `- ${m}`),
                ].join("\n")
              : undefined;

            const sections = [
              renderAssetDNA(assetDna),
              renderDesignSystem(ds),
              // The layer stack only writes its own block when no composition
              // plan was built -- with one, it is already inside that section,
              // and printing both would be the two-accounts-of-one-frame
              // problem this phase exists to remove.
              capturedCompositionPlan ? undefined : renderComposition(comp),
              renderAssets(assets),
              prefText,
              memoryText,
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
              recalled_memory: recalled.length,
              ...structureTelemetry(structure),
              ...adaptationTelemetry(formats),
              ...projectTelemetry(project),
            });
          }
          // Phase 5.6.5 — a BOUNDED creative budget.
          //
          // This was `headroom - everything else`, so the blueprint expanded to
          // fill whatever was left: measured at 6,250 characters on one render
          // and 5,492 on another from the same system, purely because the
          // headroom differed. A section that grows to fit the space is not
          // making a decision about how much it has to say.
          //
          // The allowance is fixed and generous: the sections it still owns
          // measured about 3,400 characters with the composition present, so
          // 4,500 leaves room to say more where there is more to say, and
          // stops it consuming a budget that belongs to nobody.
          const BLUEPRINT_ALLOWANCE = 4500;
          const remaining = Math.max(0, headroom - productionText.length - executionText.length);
          const text = ProfessionalCreativeBrain.render(bp, {
            maxChars: Math.min(BLUEPRINT_ALLOWANCE, remaining),
            // The composition and typography layers speak for their own topics
            // in this prompt, so the blueprint does not repeat them. Only true
            // when the composition actually ran.
            omitOwnedElsewhere: Boolean(capturedCompositionPlan),
          });
          if (RenderTracer.isTraceEnabled()) {
            RenderTracer.recordCheckpoint("D", "Output after ProfessionalCreativeBrain / blueprint injection", text || "");
          }
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
            allowance: BLUEPRINT_ALLOWANCE,
            emitted: text ? text.length : 0,
            // What it would have written unbounded and unfiltered, so the
            // saving is visible rather than inferred.
            unbounded: ProfessionalCreativeBrain.render(bp)!.length,
            omitted_owned_elsewhere: Boolean(capturedCompositionPlan),
            trimmed: text ? text.length < ProfessionalCreativeBrain.render(bp)!.length : false,
          });
          const tail = [productionText, executionText].filter(Boolean).join("\n\n");
          const blueprintText = tail ? [text, tail].filter(Boolean).join("\n\n") : text;
          if (RenderTracer.isTraceEnabled()) {
            RenderTracer.recordCheckpoint("E", "Output after CompositionPlan / THE COMPOSITION injection", blueprintText ? `${composedPrompt}\n\n${blueprintText}` : composedPrompt);
          }
          return blueprintText;
        }
      : undefined;

    // Phase 4.2 / 4.3. Every developed direction evaluated, and the selection
    // rule applied, before the judgment reaches anything that renders. A
    // pinned judgment (the vision correction pass) was evaluated when it was
    // first made, and is reused exactly.
    const productObserved = Boolean(
      visualDNA && Object.keys(((visualDNA as unknown as { observed?: { product?: object } }).observed?.product) || {}).length,
    );
    const direct = (j: CreativeJudgment | null, directorMs?: number): CreativeJudgment | null => {
      if (!j || decision.pinnedJudgment) return j;
      try {
        // Evaluated on what the director actually wrote, so a route that
        // invented text is marked down and the record says so; then held to
        // the requirement before anything renders.
        const evaluation = evaluateDirections(j, {
          evidence: decision.routeEvidence,
          productObserved,
          directorMs,
          textRequirement,
          brandKit: decision.brandKit,
          industryLandscape,
          creativeOpportunity,
        });
        console.log("[EXPERIMENT][DIRECTOR_EVALUATION]", evaluationTelemetry(evaluation));
        const enforced = enforceTextRequirement(applyEvaluation(j, evaluation), textRequirement);
        if (enforced.removed.length) {
          console.warn("[EXPERIMENT][TEXT_REQUIREMENT] director text removed", {
            mode: textRequirement.mode,
            removed: enforced.removed.length,
          });
        }
        if (RenderTracer.isTraceEnabled()) {
          RenderTracer.stage({
            stageNum: "04",
            name: "DIRECTOR EVALUATION & TEXT ENFORCEMENT",
            file: "apps/web/lib/image-engine/evolution/ExperimentPipeline.ts",
            func: "direct",
            input: { rawJudgment: j },
            decision: {
              evaluation: evaluationTelemetry(evaluation),
              textRemovedCount: enforced.removed.length,
              removed: enforced.removed,
            },
            output: enforced.judgment,
            nextStage: "toCreativeDecision",
          });
        }
        return enforced.judgment;
      } catch (err: any) {
        // An evaluation is an assist to the director, never a reason to lose its judgment.
        console.warn("[EXPERIMENT][DIRECTOR_EVALUATION] skipped", { error: err?.message || String(err) });
        return j;
      }
    };
    if (decision.pinnedJudgment) {
      console.log("[EXPERIMENT][DIRECTOR_PINNED]", {
        reason: "vision correction pass: refining the chosen direction, not choosing again",
        selected: decision.pinnedJudgment.strategy?.selected || decision.pinnedJudgment.selected || null,
      });
    }

    if (!controlled) {
      const judgmentPromise = (
        decision.pinnedJudgment
          ? Promise.resolve(decision.pinnedJudgment)
          : new CreativeDirectorV1().judge(brief, judgmentFlags)
      )
        // Concurrent path: the director ran alongside the stable stages, so its
        // time is not saved by pinning -- no `directorMs` is claimed for it.
        .then((raw) => direct(raw))
        .then((j) => {
          console.log("[EXPERIMENT][JUDGMENT_LATENCY]", {
            elapsed_ms: Date.now() - judgeStart,
            produced: Boolean(j),
            product_count: productCount,
            concurrent: true,
          });
          recordRoutesOffered(j, routes);
          capturedJudgment = j;
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
        const precomputedRouting = await routerPromise;
        const generated = await RenderCore.generateSimpleImage(renderSource(request), {
          ...options,
          ...cdAuthorityOptions,
          ...(precomputedRouting ? { mockRoutingResult: precomputedRouting } : {}),
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
            blueprintFor,
            finalDirective,
            editableHooks,
            opticalScriptFor,
            v2For
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
        return ExperimentPipeline.attachV2(
          ExperimentPipeline.attachDesignContext(
          capturedIntelligence ? { ...generated, creativeIntelligence: capturedIntelligence } : generated,
          capturedBlueprint,
          capturedTypography,
          capturedGeometry,
          capturedComposition,
          capturedAssetDna,
          capturedPrompt,
          earlyStrategy,
          visualDNA,
          capturedJudgment,
          capturedDocument,
          capturedCompositionPlan,
          capturedDocument?.editable?.typography_dna ?? null,
          industryLandscape,
          creativeOpportunity,
          ),
          capturedV2,
        );
      } catch (err: any) {
        console.error("[EVOLUTION][EXPERIMENT] generation failed", {
          error: err?.message || String(err),
        });
        throw err;
      }
    }

    const rawJudgment = decision.pinnedJudgment
      ? decision.pinnedJudgment
      : await new CreativeDirectorV1().judge(brief, judgmentFlags);
    if (RenderTracer.isTraceEnabled()) {
      RenderTracer.stage({
        stageNum: "03",
        name: "CREATIVE DIRECTOR EXECUTION",
        file: "apps/web/lib/image-engine/evolution/ExperimentPipeline.ts",
        func: "ExperimentPipeline.run",
        input: { brief, judgmentFlags },
        decision: {
          produced: Boolean(rawJudgment),
          selected: rawJudgment?.strategy?.selected || rawJudgment?.selected || "none",
          directionsCount: rawJudgment?.directions?.length || 0,
        },
        output: rawJudgment,
        nextStage: "direct",
      });
    }
    const judgment = decision.pinnedJudgment
      ? decision.pinnedJudgment
      : direct(rawJudgment, Date.now() - judgeStart);
    recordRoutesOffered(judgment, routes);
    capturedJudgment = judgment;
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
      // The director declined or failed. Rendering through the core without it
      // is the honest response: a reordered prompt with nothing new in it is a
      // change with no upside, and pretending the direction ran would poison
      // the record. Degraded, not failed.
      console.warn("[EVOLUTION][EXPERIMENT] no judgment produced — degraded render without the director");
      return RenderCore.generateSimpleImage(request, options);
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
        if (RenderTracer.isTraceEnabled()) {
          RenderTracer.stage({
            stageNum: "05",
            name: "CREATIVE DECISION TO BRIEF MUTATION",
            file: "apps/web/lib/image-engine/evolution/ExperimentPipeline.ts",
            func: "ExperimentPipeline.run",
            input: { originalConcept: request.concept, decision },
            decision: {
              controlled: true,
              selected_direction: decision.selected_direction,
              scene_definition: decision.scene_definition,
              camera: decision.camera_decision,
              lighting: decision.lighting_decision,
              composition: decision.composition_decision,
              typography: decision.typography_decision,
            },
            output: {
              effectiveConcept: effectiveRequest.concept,
              hardRequirements: effectiveRequest.hardRequirements,
            },
            nextStage: "RenderCore.generateSimpleImage",
          });
        }
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
      const precomputedRouting = await routerPromise;
      const effectiveStrategy = earlyStrategy || (judgment ? strategyFromJudgment(judgment, brief, assetCtx) : undefined);
      const generated = await RenderCore.generateSimpleImage(renderSource(effectiveRequest), {
        ...options,
        ...cdAuthorityOptions,
        ...(precomputedRouting ? { mockRoutingResult: precomputedRouting } : {}),
        ...(effectiveStrategy ? { precomputedStrategy: effectiveStrategy } : {}),
        generationProvider: this.wrapProvider(
          inner,
          judgment,
          controlled,
          fixesFor,
          layoutContextFor,
          layoutPriorityOn,
          creativeConstraint,
          bridge,
          blueprintFor,
          finalDirective,
          editableHooks,
          opticalScriptFor,
          v2For
        ),
      });

      // The intelligence the closure captured during generation, handed to the
      // interface. Spread conditionally so a run that produced none returns
      // exactly the object it always returned.
      //
      // The vision review runs above this, in PipelineRouter. See the note at
      // the concurrent branch for why it is not here.
      const attached = ExperimentPipeline.attachDesignContext(
        capturedIntelligence ? { ...generated, creativeIntelligence: capturedIntelligence } : generated,
        capturedBlueprint,
        capturedTypography,
        capturedGeometry,
        capturedComposition,
        capturedAssetDna,
        capturedPrompt,
        earlyStrategy || effectiveStrategy,
        visualDNA,
        capturedJudgment,
        capturedDocument,
        capturedCompositionPlan,
        capturedDocument?.editable?.typography_dna ?? null,
        industryLandscape,
        creativeOpportunity,
      );
      if (RenderTracer.isTraceEnabled()) {
        RenderTracer.stage({
          stageNum: "15",
          name: "DESIGN CONTEXT ATTACHMENT",
          file: "apps/web/lib/image-engine/evolution/ExperimentPipeline.ts",
          func: "ExperimentPipeline.run",
          input: { generationId: generated.generationId },
          decision: {
            blueprintAttached: Boolean(capturedBlueprint),
            typographySystemAttached: Boolean(capturedTypography),
            geometryAttached: Boolean(capturedGeometry),
            compositionPlanAttached: Boolean(capturedCompositionPlan),
            creativeIntelligenceAttached: Boolean(capturedIntelligence),
          },
          output: {
            hasImageBuffer: Boolean(attached.imageBuffer),
            imageUrl: attached.imageUrl,
          },
          nextStage: "VisionReviewLayer.reviewRender",
        });
      }
      return ExperimentPipeline.attachV2(attached, capturedV2);
    } catch (err: any) {
      console.error("[EVOLUTION][EXPERIMENT] generation failed", {
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}
