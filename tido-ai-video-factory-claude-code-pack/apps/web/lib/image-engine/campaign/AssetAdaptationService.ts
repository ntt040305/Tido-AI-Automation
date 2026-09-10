import { MasterPromptCompilerService } from "../compiler/MasterPromptCompilerService";
import { MarketingBrainStrategy } from "../llm/prompt-strategy.schema";
import { SmartKnowledgeRetriever } from "../retrieval/SmartKnowledgeRetriever";
import { CommercialLayoutService } from "../service/CommercialLayoutService";
import {
  CreativeInterpretation,
  CreativeInterpretationService,
} from "../service/CreativeInterpretationService";
import { MasterPromptCompilerInput, RoutingResultSchema, CopyItemInput } from "../types";
import { CampaignBuilderService } from "./CampaignBuilderService";
import {
  ASSET_DEFAULT_RATIO,
  ASSET_USE_CASE,
  AssetPlanResult,
  CampaignAssetType,
  CampaignBriefInput,
  CampaignConcept,
} from "./campaign.types";

/**
 * What each format is actually for.
 *
 * Written as commercial goals, not visual styles, because the visual style is the
 * campaign's job and must not change between assets. What changes is the job the
 * picture has to do in its placement.
 */
const ASSET_GOAL: Record<CampaignAssetType, string> = {
  poster:
    "Carry the campaign idea on its own. This is the asset the concept is judged by: it has room to be beautiful and is expected to hold branding and a headline without looking like an ad unit.",
  banner:
    "Convert inside a placement nobody came to look at. Readability and a clear action beat beauty here; the picture supports the message rather than the other way round.",
  social_ad:
    "Stop a thumb. It competes with the rest of a feed and gets under a second to earn attention, so the product must register before any text is read.",
  product_hero:
    "Answer 'what exactly am I buying'. Material truth and product clarity are the whole job; this asset is reused across the site, the marketplace listing and the deck.",
  thumbnail:
    "Be recognised at postage-stamp size and be worth clicking. Instant recognition over detail; anything that only reads at full size is wasted here.",
};

/**
 * How each format bends the campaign DNA without breaking it.
 *
 * Every line here is an adaptation instruction: the DNA states the rule, this
 * states how the rule is applied at this size and in this placement.
 */
const ASSET_ADAPTATION: Record<CampaignAssetType, string[]> = {
  poster: [
    "Give the campaign idea its fullest expression — this is the asset the others are derived from.",
    "Hold the product at a scale that rewards being looked at rather than scanned.",
    "Keep the headline area genuinely calm; a poster headline sits on the image, not beside it.",
  ],
  banner: [
    "Compress the same idea into a horizontal read. Product and message occupy separate halves so neither is lost when the placement crops from the edges.",
    "Raise contrast in the copy column relative to the poster; this is read in peripheral vision.",
    "Simplify the background further than the poster — detail that survives at poster size becomes noise here.",
  ],
  social_ad: [
    "Push the product larger and higher than the poster does; the frame is vertical and the first third decides everything.",
    "Keep the same colour and lighting logic but increase separation between product and background so it survives a busy feed.",
    "Leave the platform chrome bands empty — nothing that must be seen may sit in them.",
  ],
  product_hero: [
    "Strip the scene back to the product and its surface. The campaign mood survives in the light and the palette, not in props.",
    "Move closer than any other asset in the set: label text, material grain and edges must be legible.",
    "Remove headline and offer areas entirely; this asset carries no message of its own.",
  ],
  thumbnail: [
    "Reduce to one recognisable shape. Anything that needs more than a glance to parse is removed.",
    "Increase subject scale and tonal contrast beyond the social ad; this is judged at a fraction of the size.",
    "Keep the campaign palette, but favour its highest-contrast pairing so the frame reads at 120px wide.",
  ],
};

export interface AssetAdaptationContext {
  brief: CampaignBriefInput;
  campaign: CampaignConcept;
  strategy: MarketingBrainStrategy;
  routingResult: RoutingResultSchema;
  /**
   * The campaign's single reading of the client brief. Supplied once by the
   * orchestrator and re-planned per asset rather than re-read, so a client
   * directive is locked identically across the whole set.
   */
  baseInterpretation?: CreativeInterpretation;
  /** Pre-adapted per-asset compiler input from SimpleInputAdapterService. */
  baseCompilerInput: Partial<MasterPromptCompilerInput>;
  copyItems?: CopyItemInput[];
  brandName?: string;
  brandInfo?: string;
  hardRequirements?: string[];
  hasLogoAsset?: boolean;
  productCount?: number;
}

/**
 * Asset Adaptation Layer.
 *
 * Takes ONE campaign concept and produces a different, format-appropriate prompt
 * plan for each asset type. It exists because reusing a single prompt across five
 * formats produces five crops of the same picture, which is not a campaign — and
 * because generating five unrelated prompts produces five pictures that share a
 * product but nothing else, which is not a campaign either.
 *
 * The invariant it maintains: campaign DNA is constant across assets, commercial
 * adaptation varies. Everything below reuses machinery that already exists —
 * per-format layout from CommercialLayoutService, per-format art direction
 * defaults from the interpretation planner, and the resolver's precedence rules.
 */
export class AssetAdaptationService {
  private compiler: MasterPromptCompilerService;

  constructor(compiler?: MasterPromptCompilerService) {
    this.compiler = compiler || new MasterPromptCompilerService();
  }

  public async planAsset(
    assetType: CampaignAssetType,
    ctx: AssetAdaptationContext
  ): Promise<AssetPlanResult> {
    const useCase = ASSET_USE_CASE[assetType];
    const aspectRatio = ctx.brief.ratioOverrides?.[assetType] || ASSET_DEFAULT_RATIO[assetType];
    const warnings: string[] = [];

    // Knowledge is retrieved per asset because the specialist foundation block is
    // useCase-dependent: a banner and a product hero should not be reasoning from
    // the same professional material.
    const retrieval = await SmartKnowledgeRetriever.retrieve(
      ctx.routingResult,
      (ctx.routingResult.products || []).flatMap((p) => p.reference_ids || []),
      null,
      {
        useCase,
        brief: ctx.brief.concept,
        brandName: ctx.brandName,
        brandInfo: ctx.brandInfo,
        copyItems: ctx.copyItems,
        hardRequirements: ctx.hardRequirements,
      }
    );

    if (!retrieval.package) {
      return this.failed(assetType, useCase, aspectRatio, {
        code: "KNOWLEDGE_RETRIEVAL_FAILED",
        message: retrieval.error?.message || "Knowledge retrieval produced no package for this asset.",
      });
    }

    // Only the asset-profile defaults are recomputed here. The client's own
    // directives were read once for the whole campaign and are reused verbatim,
    // so a locked camera is locked identically on every asset in the set.
    const interpretationInput = {
      concept: ctx.brief.concept || ctx.campaign.big_idea,
      assetType: useCase as any,
      productCount: ctx.productCount ?? 1,
      aspectRatio,
      referenceAnalysis: ctx.routingResult,
      productIdentity: ctx.routingResult.products?.[0],
      retrievedKnowledge: (retrieval.package.selected_blocks || []).map((b) => b.title),
      brandContext: { brandName: ctx.brandName, brandInfo: ctx.brandInfo },
    };

    const interpretation = ctx.baseInterpretation
      ? CreativeInterpretationService.reinterpretForAssetType(ctx.baseInterpretation, interpretationInput)
      : await CreativeInterpretationService.interpretAsync(interpretationInput, {
          routerIntent: ctx.routingResult.structured_input_intent,
        });

    const layout = CommercialLayoutService.plan({
      assetType: useCase,
      aspectRatio,
      copyItems: this.copyForAsset(assetType, ctx.copyItems),
      hasLogoAsset: ctx.hasLogoAsset,
      objective: ctx.brief.objective,
      targetChannel: ctx.brief.channel,
    });

    const adaptationBlock = [
      `[ASSET ADAPTATION — ${assetType.toUpperCase().replace(/_/g, " ")}]`,
      `WHAT THIS ASSET IS FOR: ${ASSET_GOAL[assetType]}`,
      "HOW THE CAMPAIGN IS ADAPTED FOR THIS FORMAT — the campaign DNA above does not change; these are instructions about applying it here:",
      ...ASSET_ADAPTATION[assetType].map((a) => `- ${a}`),
    ].join("\n");

    const compilerInput: MasterPromptCompilerInput = {
      ...(ctx.baseCompilerInput as MasterPromptCompilerInput),
      // The adaptation rides in the brief so it sits inside CREATIVE INTENT,
      // above the art direction, where format-level intent belongs.
      brief: `${ctx.baseCompilerInput.brief || ctx.brief.concept || ""}\n\n${adaptationBlock}`.trim(),
      useCase,
      aspectRatio,
      copyItems: this.copyForAsset(assetType, ctx.copyItems),
      routingResult: ctx.routingResult,
      knowledgePackage: retrieval.package,
      creativeInterpretation: interpretation,
      marketingStrategy: ctx.strategy,
      campaignDna: CampaignBuilderService.renderDnaBlock(ctx.campaign),
      marketingContext: {
        industry: ctx.brief.industry,
        objective: ctx.brief.objective,
        target_channel: ctx.brief.channel,
        target_audience: ctx.brief.audience,
      },
      hasLogoAsset: ctx.hasLogoAsset,
      productCount: ctx.productCount ?? 1,
    };

    const compiled = await this.compiler.compile(compilerInput);
    if (!compiled.success || !compiled.package) {
      return this.failed(assetType, useCase, aspectRatio, {
        code: compiled.error?.code || "COMPILATION_FAILED",
        message: compiled.error?.message || "Prompt compilation failed for this asset.",
      });
    }

    const prov = (compiled.package.provenance || {}) as Record<string, any>;
    const artProv = prov.art_direction || {};
    warnings.push(...(compiled.package.compiler_warnings || []));

    return {
      asset_type: assetType,
      use_case: useCase,
      aspect_ratio: aspectRatio,
      asset_goal: ASSET_GOAL[assetType],
      layout_logic: {
        eye_flow: layout.eye_flow,
        negative_space_strategy: layout.negative_space_strategy,
        safe_margin_percent: layout.safeMarginPercent,
        zones: layout.zones.map((z) => ({ role: z.role, x: z.x, y: z.y, width: z.width, height: z.height })),
      },
      visual_priority: layout.visual_priority.map((p) => ({
        element: p.element,
        importance: p.importance,
        role: p.role,
      })),
      prompt_plan: {
        campaign_dna_applied: Object.keys(ctx.campaign.visual_dna),
        asset_adaptations: ASSET_ADAPTATION[assetType],
        art_direction_sources: artProv.resolved_from || {},
        art_direction_decisions: artProv.decisions || [],
        knowledge_blocks: [
          ...compiled.package.knowledge.universal_block_ids,
          ...compiled.package.knowledge.specialist_block_ids,
        ],
        client_locked_dimensions: (artProv.decisions || [])
          .filter((d: any) => d.client_locked)
          .map((d: any) => d.dimension),
      },
      final_prompt: compiled.package.compiled_prompt,
      prompt_chars: compiled.package.compiled_prompt.length,
      warnings,
    };
  }

  /**
   * A product hero carries no message, so it receives no copy even when the
   * campaign has authorised strings. Handing it a headline would put text on the
   * one asset whose entire job is showing the product.
   */
  private copyForAsset(assetType: CampaignAssetType, copyItems?: CopyItemInput[]): CopyItemInput[] {
    if (!copyItems || copyItems.length === 0) return [];
    if (assetType === "product_hero") return [];
    if (assetType === "thumbnail") {
      // A thumbnail can hold one short line at most; anything longer is unreadable
      // at the size this asset is actually seen.
      return copyItems.filter((c) => c.text.trim().length <= 24).slice(0, 1);
    }
    return copyItems;
  }

  private failed(
    assetType: CampaignAssetType,
    useCase: string,
    aspectRatio: string,
    error: { code: string; message: string }
  ): AssetPlanResult {
    console.error("[ASSET_ADAPTATION][FAIL]", { assetType, ...error });
    return {
      asset_type: assetType,
      use_case: useCase,
      aspect_ratio: aspectRatio,
      asset_goal: ASSET_GOAL[assetType],
      layout_logic: { eye_flow: "", negative_space_strategy: "", safe_margin_percent: 0, zones: [] },
      visual_priority: [],
      prompt_plan: {
        campaign_dna_applied: [],
        asset_adaptations: [],
        art_direction_sources: {},
        art_direction_decisions: [],
        knowledge_blocks: [],
        client_locked_dimensions: [],
      },
      final_prompt: "",
      prompt_chars: 0,
      warnings: [],
      error,
    };
  }
}
