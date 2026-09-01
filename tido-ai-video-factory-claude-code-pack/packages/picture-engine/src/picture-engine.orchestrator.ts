/**
 * Picture Engine V1 Pro Orchestrator Facade
 *
 * Main facade transforming ProductionScenePackages into rendering operations,
 * supporting Mode 1 (Reference Asset) and Mode 2 (Commercial Creative) generation.
 */

import { PictureEngineRequest, PictureEngineResponse } from "@tido/contracts";
import { BrandDNA, KnowledgeNode, TechniqueCard } from "@tido/knowledge-base";
import { ProductionScenePackage } from "@tido/creative-director";
import { IPictureEngineProviderAdapter } from "./adapters/picture-provider.interface";
import { NanoBanana2Adapter } from "./adapters/nano-banana-2.adapter";
import { VisualPromptCompiler } from "./compiler/visual-prompt-compiler";
import { ReferenceAssetGenerator } from "./generators/reference-asset.generator";
import { CommercialCreativeGenerator } from "./generators/commercial-creative.generator";
import { ImageQualityChecker } from "./qc/image-qc";
import {
  CommercialCreativeOptions,
  PictureEngineGenerationMetadata,
  ReferenceAssetMetadata,
} from "./interfaces/picture-engine-v1-pro.interface";

export interface PictureEngineProExecutionResult {
  response: PictureEngineResponse & {
    generation_metadata?: PictureEngineGenerationMetadata;
  };
  reference_metadata?: ReferenceAssetMetadata;
}

export class PictureEngineOrchestrator {
  private compiler = new VisualPromptCompiler();
  private refGenerator = new ReferenceAssetGenerator();
  private creativeGenerator = new CommercialCreativeGenerator();
  private qcChecker = new ImageQualityChecker();
  private providerAdapter: IPictureEngineProviderAdapter;

  constructor(providerAdapter?: IPictureEngineProviderAdapter) {
    this.providerAdapter = providerAdapter || new NanoBanana2Adapter();
  }

  /**
   * Mode 1: Generate AI Reference Assets for Video AI
   */
  public async generateReferenceAsset(
    scenePackage: ProductionScenePackage,
    type: "character_reference" | "product_reference" | "environment_reference",
    nodes: KnowledgeNode[] = [],
    techniqueCards: TechniqueCard[] = [],
    brandDna?: BrandDNA
  ): Promise<PictureEngineProExecutionResult> {
    const { metadata, requests } = this.refGenerator.generateReferenceAssetRequests(
      scenePackage,
      type,
      nodes,
      techniqueCards,
      brandDna
    );

    const mainRequest = requests[0] || {
      prompt: scenePackage.visual_direction.prompt,
      aspect_ratio: scenePackage.visual_direction.aspect_ratio,
      model: "flow-nano-banana-2",
    };

    return this.executeProviderAndQC(
      mainRequest,
      "reference_asset",
      nodes,
      techniqueCards,
      metadata
    );
  }

  /**
   * Mode 2: Generate Extensible Commercial Creative Marketing Assets
   */
  public async generateCommercialCreative(
    scenePackage: ProductionScenePackage,
    options: CommercialCreativeOptions,
    nodes: KnowledgeNode[] = [],
    techniqueCards: TechniqueCard[] = [],
    brandDna?: BrandDNA
  ): Promise<PictureEngineProExecutionResult> {
    // 1. Compile visual prompt using VisualPromptCompiler
    const compiled = this.compiler.compileVisualPrompt(
      scenePackage,
      nodes,
      techniqueCards,
      brandDna
    );

    // 2. Generate specialized creative request
    const creativeRes = this.creativeGenerator.generateCommercialCreativeRequest(
      scenePackage,
      options,
      nodes,
      techniqueCards,
      brandDna
    );

    const finalRequest: PictureEngineRequest = {
      ...compiled.compiled_request,
      aspect_ratio: creativeRes.request.aspect_ratio,
      prompt: `${creativeRes.request.prompt}. ${compiled.final_prompt}`,
    };

    return this.executeProviderAndQC(
      finalRequest,
      "commercial_creative",
      nodes,
      techniqueCards
    );
  }

  private async executeProviderAndQC(
    request: PictureEngineRequest,
    mode: "reference_asset" | "commercial_creative",
    nodes: KnowledgeNode[] = [],
    techniqueCards: TechniqueCard[] = [],
    referenceMetadata?: ReferenceAssetMetadata
  ): Promise<PictureEngineProExecutionResult> {
    // Check provider capabilities and validate
    this.providerAdapter.validateRequest(request);
    this.providerAdapter.checkCapabilities(request);

    // Render image via Provider Adapter
    const rawResponse = await this.providerAdapter.generateImage(request);

    // Perform Quality Control Evaluation
    const qcResult = this.qcChecker.evaluateQuality(rawResponse, request);

    // Build Generation Metadata for trace & Asset Management mapping
    const generationMetadata: PictureEngineGenerationMetadata = {
      generation_id: `gen_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      engine_version: "V1_PRO",
      mode: mode,
      provider_name: this.providerAdapter.provider_name,
      model_name: this.providerAdapter.model_name,
      compiled_prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      applied_knowledge_node_ids: nodes.map((n) => n.node_id),
      applied_technique_card_ids: techniqueCards.map((c) => c.card_id),
      qc_result: qcResult,
      generated_at: new Date().toISOString(),
    };

    return {
      response: {
        ...rawResponse,
        generation_metadata: generationMetadata,
      },
      reference_metadata: referenceMetadata,
    };
  }
}
