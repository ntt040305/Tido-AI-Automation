import { DeliveryPackageService } from "../delivery/DeliveryPackageService";
import { ImageGenerationProvider } from "../provider/ImageGenerationProvider";
import { ImgStudioImageGenerationProvider } from "../provider/ImgStudioImageGenerationProvider";
import { CiosReasoningShadowService } from "../reasoning/CiosReasoningShadowService";
import { KnowledgeRouterService } from "../service/KnowledgeRouterService";
import { ReferenceImageProcessorService } from "../service/ReferenceImageProcessorService";
import { CreativeInterpretationService } from "../service/CreativeInterpretationService";
import { SimpleInputAdapterService } from "../service/SimpleInputAdapterService";
import { LocalGeneratedImageStorage } from "../storage/LocalGeneratedImageStorage";
import { RouterInput, RoutingResultSchema, SimpleInputRequestV1, CopyItemInput } from "../types";
import { AssetAdaptationService } from "./AssetAdaptationService";
import { CampaignBuilderService } from "./CampaignBuilderService";
import { ASSET_DEFAULT_RATIO, AssetPlanResult, CampaignBriefInput, CampaignResult } from "./campaign.types";

export interface CampaignRunOptions {
  /**
   * Plan only: compile every asset prompt and build the package, but make no
   * provider calls. This is the default because a five-asset campaign is five
   * paid renders, and an agency wants to read the plan before spending that.
   */
  dryRun?: boolean;
  /** Skip writing the delivery folder (used by the benchmark harness). */
  skipDelivery?: boolean;
  routerService?: KnowledgeRouterService;
  generationProvider?: ImageGenerationProvider;
  mockRoutingResult?: RoutingResultSchema;
  /**
   * Phase 3.1 — force the parallel CIOS reasoning path on or off for this run,
   * overriding CIOS_REASONING_ENABLED. Lets a reviewer inspect one campaign
   * without changing process state.
   */
  ciosReasoning?: boolean;
}

/**
 * Campaign Orchestrator.
 *
 * One brief in, one campaign concept, N adapted assets and a delivery package
 * out. It is a coordinator, not a new engine: the router, the marketing brain,
 * the adapter, the retriever, the resolver and the compiler are all the existing
 * repaired pipeline, called in campaign order.
 *
 * Call budget for a five-asset campaign:
 *   1 Gemini router call   (references analysed once, shared by every asset)
 *   1 marketing brain call (one campaign concept, not one per asset)
 *   5 local compilations   (no network)
 *   0 or 5 provider calls  (dry run vs full render)
 *
 * Running the router or the brain per asset would quintuple cost and, worse,
 * produce five slightly different campaign concepts.
 */
export class CampaignOrchestratorService {
  public async run(brief: CampaignBriefInput, options: CampaignRunOptions = {}): Promise<CampaignResult> {
    const startedAt = Date.now();
    const warnings: string[] = [];
    const interpretationSources: string[] = [];
    let geminiCalls = 0;
    let llmCalls = 0;
    let providerCalls = 0;

    if (!brief.brand?.trim() || !brief.product?.trim()) {
      return this.failure(brief, startedAt, {
        code: "INVALID_CAMPAIGN_BRIEF",
        message: "A campaign brief requires at least a brand and a product.",
      });
    }

    // ── 1. References: analysed once for the whole campaign ────────────────
    const processor = new ReferenceImageProcessorService();
    const processed = await processor.processReferenceImages((brief.references || []) as any);

    let routingResult: RoutingResultSchema;
    let routerSource = "gemini-router";

    if (options.mockRoutingResult) {
      routingResult = options.mockRoutingResult;
      routerSource = "mock";
    } else {
      const router = options.routerService || new KnowledgeRouterService();
      const routerInput: RouterInput = {
        images: processed.processedImages.map((img) => ({
          reference_id: img.reference_id,
          buffer: img.buffer,
          mimeType: img.mimeType,
          filename: img.filename,
        })),
        concept: brief.concept || `${brief.product} campaign`,
        useCase: "poster",
        aspectRatio: ASSET_DEFAULT_RATIO.poster,
      };
      geminiCalls = 1;
      const routerRes = await router.analyzeProductReferences(routerInput);
      if (!routerRes.success || !routerRes.routing) {
        return this.failure(brief, startedAt, {
          code: routerRes.error?.code || "INTERPRETATION_FAILED",
          message: routerRes.error?.message || "Reference analysis failed for this campaign.",
        });
      }
      routingResult = routerRes.routing;
      routerSource = routerRes.meta?.model || "gemini-router";
    }

    // ── 2. Adapt once, to obtain reference roles, copy items and brand data ─
    const simpleRequest: SimpleInputRequestV1 = {
      images: processed.processedImages as any,
      concept: brief.concept || `${brief.product} campaign`,
      useCase: "poster",
      aspectRatio: ASSET_DEFAULT_RATIO.poster,
      brandName: brief.brand,
      brandInfo: brief.brandInfo,
      copyItems: brief.copyItems,
      hardRequirements: brief.hardRequirements,
    };
    const adapted = SimpleInputAdapterService.adapt(simpleRequest, routingResult);
    if (!adapted.success) {
      return this.failure(brief, startedAt, {
        code: "INVALID_ADAPTER_PAYLOAD",
        message: adapted.error || "Campaign reference adaptation failed.",
      });
    }

    // The adapter narrows the routing result to products it could confirm from an
    // uploaded reference. That is right when there are references, and wrong for a
    // text-only campaign: with no images to confirm anything it strips the product
    // list entirely, and the knowledge retriever then rejects the routing as empty.
    // Only the no-reference case falls back, so an upload whose product the adapter
    // deliberately rejected is never quietly reinstated.
    const hasReferences = (brief.references || []).length > 0;
    const planningRouting =
      hasReferences || (adapted.resolvedRoutingResult.products || []).length > 0
        ? adapted.resolvedRoutingResult
        : routingResult;

    if (!hasReferences) {
      warnings.push(
        "No reference images supplied: product identity comes from the brief text alone, so renders will not be identity-locked to a real product."
      );
    }

    // ── 3. Read the brief ONCE for the whole campaign ──────────────────────
    //
    // Interpreting per asset costs five LLM calls and is unstable: the model
    // paraphrases the same client instruction differently each time, and a
    // paraphrase can land on either side of the art-direction specificity
    // threshold. That produced a campaign where one client lighting directive was
    // locked on the poster and overridable on the banner. Intent belongs to the
    // brief, not the format.
    const baseInterpretation = await CreativeInterpretationService.interpretAsync(
      {
        concept: brief.concept || `${brief.product} campaign`,
        assetType: "poster",
        productCount: adapted.resolvedProductCount || 1,
        aspectRatio: ASSET_DEFAULT_RATIO.poster,
        referenceAnalysis: planningRouting,
        productIdentity: planningRouting.products?.[0],
        brandContext: { brandName: brief.brand, brandInfo: brief.brandInfo },
      },
      { routerIntent: planningRouting.structured_input_intent }
    );
    llmCalls += 1;
    interpretationSources.push(baseInterpretation.interpretation_source || "UNKNOWN");

    // ── 4. One campaign concept for the whole set ──────────────────────────
    const builder = new CampaignBuilderService();
    llmCalls += 1;
    const { campaign, strategy } = await builder.build(brief, { interpretation: baseInterpretation });

    // ── 5. Adapt the concept per asset type ────────────────────────────────
    const adaptation = new AssetAdaptationService();
    const assets: AssetPlanResult[] = [];

    for (const assetType of campaign.asset_plan) {
      const plan = await adaptation.planAsset(assetType, {
        brief,
        campaign,
        strategy,
        routingResult: planningRouting,
        baseInterpretation,
        baseCompilerInput: adapted.compilerInput || {},
        copyItems: adapted.copyItems as CopyItemInput[],
        brandName: adapted.brandName || brief.brand,
        brandInfo: adapted.brandInfo || brief.brandInfo,
        hardRequirements: adapted.hardRequirements,
        hasLogoAsset: adapted.brandAssets.length > 0,
        productCount: adapted.resolvedProductCount || 1,
      });
      if (plan.error) warnings.push(`${assetType}: ${plan.error.code}`);
      assets.push(plan);
    }

    // ── 6. Render, unless this is a planning run ───────────────────────────
    const renderedImages = new Map<string, { buffer: Buffer; mimeType: string }>();
    if (!options.dryRun) {
      const provider = options.generationProvider || new ImgStudioImageGenerationProvider();
      const storage = new LocalGeneratedImageStorage();

      const providerReferences = adapted.generationReferences.map((ref) => {
        const src = processed.processedImages.find((p) => p.reference_id === ref.reference_id);
        return {
          reference_id: ref.reference_id,
          product_id: ref.product_id,
          role: ref.role as any,
          mimeType: src?.mimeType || "image/png",
          buffer: src?.buffer || Buffer.from(""),
          filename: src?.filename || `${ref.reference_id}.png`,
        };
      });

      for (const asset of assets) {
        if (asset.error || !asset.final_prompt) continue;
        const generationId = `gen_${campaign.campaign_id}_${asset.asset_type}`;
        providerCalls++;
        const res = await provider.generateImage({
          model: process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2",
          prompt: asset.final_prompt,
          references: providerReferences,
          aspectRatio: asset.aspect_ratio,
          imageSize: process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || "2K",
          mimeType: "image/png",
          generationId,
          idempotencyKey: generationId,
          reference_manifest: planningRouting.reference_manifest,
        });

        if (!res.success) {
          asset.error = {
            code: res.error?.code || "GENERATION_FAILED",
            message: res.error?.message || "Provider render failed for this asset.",
          };
          warnings.push(`${asset.asset_type}: ${asset.error.code}`);
          continue;
        }

        asset.generation_id = generationId;
        if (res.imageBuffer) {
          renderedImages.set(generationId, {
            buffer: res.imageBuffer,
            mimeType: res.mimeType || "image/png",
          });
          try {
            const saved = await storage.saveAsset({
              generation_id: generationId,
              imageBuffer: res.imageBuffer,
              mimeType: res.mimeType || "image/png",
              masterPrompt: asset.final_prompt,
              metadata: {
                generation_id: generationId,
                campaign_id: campaign.campaign_id,
                asset_type: asset.asset_type,
                aspect_ratio: asset.aspect_ratio,
              },
            });
            asset.image_url = saved.url;
          } catch (err: any) {
            warnings.push(`${asset.asset_type}: local storage failed (${err?.message || err})`);
          }
        } else {
          asset.image_url = res.imageUrl;
        }
      }
    }

    // ── 6.5 CIOS reasoning, in shadow ──────────────────────────────────────
    //
    // Runs after the assets are planned, not before, so the comparison can see
    // what the resolver actually chose. Running it earlier would only tell us
    // that CIOS proposes something different, not whether that difference would
    // have survived a USER lock or a STRATEGY candidate — and it is the second
    // question that decides whether Phase 3.2 is worth doing.
    //
    // Local only: no network, no provider, no LLM. It cannot throw (the service
    // returns a skipped report instead), and nothing it produces is read by any
    // downstream step.
    // The enablement check is made here, not only inside the service, so that a
    // disabled run does not even build the input — "off" costs one boolean read.
    const ciosReasoning = CiosReasoningShadowService.isEnabled(options.ciosReasoning)
      ? CiosReasoningShadowService.run(
          {
            brief,
            strategy,
            strategySource: campaign.provenance.strategy_source,
            legacyBigIdea: campaign.big_idea,
            legacyCoreMessage: campaign.core_message,
            resolvedArtDirection: assets.flatMap((a) => a.prompt_plan.art_direction_decisions || []),
          },
          options.ciosReasoning
        )
      : ({ enabled: false, reason: "FLAG_DISABLED", duration_ms: 0 } as const);
    if (ciosReasoning.enabled) {
      console.log("[CIOS_SHADOW]\n" + CiosReasoningShadowService.formatSummary(ciosReasoning));
      // Surfaced as a campaign warning because a breach here blocks Phase 3.2 and
      // must not sit unread inside a trace object.
      if (!ciosReasoning.layer_separation.clean) {
        warnings.push(
          `CIOS shadow detected a Governance §1 layer separation breach: ${ciosReasoning.layer_separation.leaked_fields.join(", ")}`
        );
      }
    } else if (ciosReasoning.reason === "ERROR") {
      warnings.push(`CIOS shadow reasoning failed (production unaffected): ${ciosReasoning.message}`);
    }

    // ── 7. Delivery package ────────────────────────────────────────────────
    let delivery: CampaignResult["delivery"];
    if (!options.skipDelivery) {
      try {
        const packager = new DeliveryPackageService();
        const built = packager.build({ brief, campaign, assets, renderedImages });
        delivery = {
          package_root: built.package_root,
          manifest_path: built.manifest_path,
          summary_json_path: built.summary_json_path,
          summary_txt_path: built.summary_txt_path,
          file_count: built.file_count,
        };
      } catch (err: any) {
        warnings.push(`delivery: ${err?.message || err}`);
      }
    }

    assets.forEach((a) => {
      const src = (a.prompt_plan.art_direction_sources || {}) as Record<string, string>;
      if (Object.keys(src).length === 0) warnings.push(`${a.asset_type}: no art direction resolved`);
    });

    // A campaign that ran without its reasoning layer still produces five valid
    // prompts, so it reports success — which is exactly why it has to say so
    // loudly. Without the insight the concept is a restatement of the brief.
    if (campaign.provenance.strategy_source === "DETERMINISTIC_FALLBACK") {
      warnings.push(
        "Marketing reasoning was unavailable, so the campaign concept was derived deterministically from the brief: there is no consumer insight, emotional response or visual translation behind these assets."
      );
    }

    const result: CampaignResult = {
      success: assets.some((a) => !a.error),
      campaign,
      strategy,
      assets,
      delivery,
      diagnostics: {
        router_source: routerSource,
        strategy_source: campaign.provenance.strategy_source,
        interpretation_sources: interpretationSources,
        gemini_calls: geminiCalls,
        llm_calls: llmCalls,
        provider_calls: providerCalls,
        duration_ms: Date.now() - startedAt,
        warnings: Array.from(new Set(warnings)),
        cios_reasoning_enabled: ciosReasoning.enabled,
      },
      cios_reasoning: ciosReasoning,
    };

    console.log("[CAMPAIGN_RUN]", {
      campaign: campaign.campaign_name,
      assets: assets.map((a) => `${a.asset_type}:${a.error ? "FAILED" : `${a.prompt_chars}ch`}`),
      gemini_calls: geminiCalls,
      llm_calls: llmCalls,
      provider_calls: providerCalls,
      duration_ms: result.diagnostics.duration_ms,
    });

    return result;
  }

  private failure(
    brief: CampaignBriefInput,
    startedAt: number,
    error: { code: string; message: string }
  ): CampaignResult {
    console.error("[CAMPAIGN_RUN][FAIL]", error);
    return {
      success: false,
      campaign: {
        campaign_id: brief.campaignId || `camp_failed_${Date.now()}`,
        campaign_name: `${brief.brand || "Untitled"} — ${brief.product || "campaign"}`,
        big_idea: "",
        core_message: "",
        visual_dna: {
          mood: "",
          colour_logic: "",
          lighting_logic: "",
          composition_logic: "",
          typography_logic: "",
          product_presentation: "",
        },
        asset_plan: [],
        provenance: { strategy_source: "DETERMINISTIC_FALLBACK", derived_fields: [] },
      },
      assets: [],
      // A brief that never reached the pipeline never reached the shadow path
      // either. Stated rather than omitted so the field means the same thing on
      // every result.
      cios_reasoning: { enabled: false, reason: "FLAG_DISABLED", duration_ms: 0 },
      diagnostics: {
        router_source: "none",
        strategy_source: "none",
        interpretation_sources: [],
        cios_reasoning_enabled: false,
        gemini_calls: 0,
        llm_calls: 0,
        provider_calls: 0,
        duration_ms: Date.now() - startedAt,
        warnings: [error.code],
      },
      error,
    };
  }
}
