import crypto from "crypto";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { MasterPromptCompilerService } from "../compiler/MasterPromptCompilerService";
import { GeminiImageGenerationProvider } from "../provider/GeminiImageGenerationProvider";
import { CloudflareImageGenerationProvider } from "../provider/CloudflareImageGenerationProvider";
import { ImageGenerationProvider } from "../provider/ImageGenerationProvider";
import { GeneratedImageStorage } from "../storage/GeneratedImageStorage";
import { LocalGeneratedImageStorage } from "../storage/LocalGeneratedImageStorage";
import {
  GenerationRequestInput,
  GenerationResultV1,
} from "../types";

import { ImgStudioImageGenerationProvider } from "../provider/ImgStudioImageGenerationProvider";

export interface ResolvedProviderInfo {
  provider: ImageGenerationProvider;
  name: string;
  model: string;
}

export function resolveActiveProvider(customProvider?: ImageGenerationProvider): ResolvedProviderInfo {
  if (customProvider) {
    const isImgStudio = customProvider instanceof ImgStudioImageGenerationProvider;
    const isCloudflare = customProvider instanceof CloudflareImageGenerationProvider;
    return {
      provider: customProvider,
      name: isImgStudio ? "imgstudio" : isCloudflare ? "cloudflare-workers-ai" : "google-gemini",
      model: isImgStudio
        ? (process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2")
        : isCloudflare
          ? (process.env.TIDO_CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b")
          : (process.env.TIDO_GEMINI_IMAGE_MODEL || process.env.TIDO_IMAGE_MODEL || "gemini-3.1-flash-image"),
    };
  }

  const providerEnv = (process.env.TIDO_IMAGE_PROVIDER || "imgstudio").toLowerCase();
  if (providerEnv === "imgstudio") {
    const model = process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2";
    return {
      provider: new ImgStudioImageGenerationProvider(),
      name: "imgstudio",
      model,
    };
  }

  if (providerEnv === "cloudflare") {
    const model = process.env.TIDO_CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b";
    return {
      provider: new CloudflareImageGenerationProvider(),
      name: "cloudflare-workers-ai",
      model,
    };
  }

  const model = process.env.TIDO_GEMINI_IMAGE_MODEL || process.env.TIDO_IMAGE_MODEL || "gemini-3.1-flash-image";
  return {
    provider: new GeminiImageGenerationProvider(),
    name: "google-gemini",
    model,
  };
}

export class ImageGenerationService {
  private provider: ImageGenerationProvider;
  private providerName: string;
  private providerModel: string;
  private storage: GeneratedImageStorage;
  private compiler: MasterPromptCompilerService;
  private inFlightRequests: Set<string> = new Set();

  constructor(
    provider?: ImageGenerationProvider,
    storage?: GeneratedImageStorage,
    compiler?: MasterPromptCompilerService
  ) {
    const resolved = resolveActiveProvider(provider);
    this.provider = resolved.provider;
    this.providerName = resolved.name;
    this.providerModel = resolved.model;
    this.storage = storage || new LocalGeneratedImageStorage();
    this.compiler = compiler || new MasterPromptCompilerService();
  }

  public async generateImage(input: GenerationRequestInput): Promise<GenerationResultV1> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // 0. Double-click / Duplicate In-Flight Protection
    const requestId = input.requestId || input.masterPromptPackage?.input_fingerprint || `req_${Date.now()}`;
    if (this.inFlightRequests.has(requestId)) {
      return {
        generation_version: "1.0",
        generation_id: `imggen_duplicate_${Date.now()}`,
        status: "FAILED",
        provider: {
          name: this.providerName,
          model: this.providerModel,
        },
        trace: {
          template_version: input.masterPromptPackage?.template?.version || "2.0.0",
          template_hash: input.masterPromptPackage?.template?.hash || "",
          compiled_prompt_hash: input.masterPromptPackage?.compiled_prompt_hash || "",
          input_fingerprint: input.masterPromptPackage?.input_fingerprint || "",
          knowledge_versions: input.masterPromptPackage?.knowledge?.knowledge_versions || {},
          reference_hashes: {},
        },
        timing: { generation_duration_ms: Date.now() - startTime },
        warnings: ["DUPLICATE_IN_FLIGHT_REQUEST"],
        error: {
          code: "GENERATION_FAILED",
          message: "A generation request with the same request ID or fingerprint is already in flight.",
        },
      };
    }

    this.inFlightRequests.add(requestId);

    try {
      // 1. Basic Structure Validation
      if (!input.masterPromptPackage || !input.routingResult || !input.knowledgePackage) {
        return this.buildErrorResult(
          "MASTER_PROMPT_STALE",
          "Missing required inputs: masterPromptPackage, routingResult, and knowledgePackage are required.",
          startTime
        );
      }

      // 2. Reference Validation & SHA-256 Hashing
      const rawRefs = input.productReferences || [];
      if (rawRefs.length === 0) {
        return this.buildErrorResult(
          "REFERENCE_MISSING",
          "At least one product reference image is required for image generation.",
          startTime
        );
      }

      if (rawRefs.length > IMAGE_ENGINE_CONFIG.MAX_PRODUCT_REFERENCES) {
        return this.buildErrorResult(
          "REFERENCE_LIMIT_EXCEEDED",
          `Reference image count (${rawRefs.length}) exceeds maximum allowed limit (${IMAGE_ENGINE_CONFIG.MAX_PRODUCT_REFERENCES}).`,
          startTime
        );
      }

      const referenceHashes: Record<string, string> = {};
      const providerReferences: {
        reference_id: string;
        product_id: string;
        role?: "PRODUCT" | "LOGO" | "SUPPORT_REFERENCE" | "INSPIRATION_REFERENCE" | "AMBIGUOUS" | "UNKNOWN";
        mimeType: string;
        buffer: Buffer;
      }[] = [];

      for (let i = 0; i < rawRefs.length; i++) {
        const ref = rawRefs[i];
        const refId = ref.reference_id || `REF_${String(i + 1).padStart(2, "0")}`;
        const prodId = ref.product_id || "PRODUCT_01";
        const sha256 = crypto.createHash("sha256").update(ref.buffer).digest("hex");

        const rawRole = (ref as any).role;
        const role = rawRole || (refId.includes("INSPIRATION") || refId.includes("STYLE") ? "INSPIRATION_REFERENCE" : "PRODUCT");

        referenceHashes[refId] = sha256;
        providerReferences.push({
          reference_id: refId,
          product_id: prodId,
          role,
          mimeType: ref.mimeType || "image/png",
          buffer: ref.buffer,
        });
      }

      // 3. Server-side Recompilation & Staleness Verification
      let recompiledPackage = input.masterPromptPackage;

      if (input.compilerInput) {
        const recompileRes = await this.compiler.compile(input.compilerInput);
        if (!recompileRes.success || !recompileRes.package) {
          return this.buildErrorResult(
            "MASTER_PROMPT_STALE",
            `Server-side prompt recompilation failed: ${recompileRes.error?.message}`,
            startTime
          );
        }

        recompiledPackage = recompileRes.package;

        // Verify Staleness / Deterministic Snapshot Match
        const expected = input.masterPromptPackage;
        const actual = recompiledPackage;

        const isFingerprintMatch = expected.input_fingerprint === actual.input_fingerprint;
        const isTemplateVersionMatch = expected.template.version === actual.template.version;
        const isTemplateHashMatch = expected.template.hash === actual.template.hash;
        const isPromptHashMatch = expected.compiled_prompt_hash === actual.compiled_prompt_hash;

        // Compare knowledge versions
        const expectedKv = JSON.stringify(expected.knowledge.knowledge_versions);
        const actualKv = JSON.stringify(actual.knowledge.knowledge_versions);
        const isKnowledgeVersionsMatch = expectedKv === actualKv;

        if (!isFingerprintMatch || !isTemplateVersionMatch || !isTemplateHashMatch || !isPromptHashMatch || !isKnowledgeVersionsMatch) {
          return this.buildErrorResult(
            "MASTER_PROMPT_STALE",
            "Master Prompt snapshot is stale. Form inputs or underlying Knowledge Base changed since the Master Prompt was inspected. Please recompile Master Prompt before rendering.",
            startTime,
            {
              isFingerprintMatch,
              isTemplateVersionMatch,
              isTemplateHashMatch,
              isPromptHashMatch,
              isKnowledgeVersionsMatch,
            }
          );
        }
      }

      // 4. Validate Aspect Ratio
      const requestedAspectRatio = input.masterPromptPackage.output_config?.aspect_ratio || "4:5";
      const supportedRatios = IMAGE_ENGINE_CONFIG.SUPPORTED_ASPECT_RATIOS || [
        "1:1", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9",
      ];

      if (!supportedRatios.includes(requestedAspectRatio)) {
        return this.buildErrorResult(
          "UNSUPPORTED_ASPECT_RATIO",
          `Requested aspect ratio '${requestedAspectRatio}' is not supported. Supported: ${supportedRatios.join(", ")}`,
          startTime
        );
      }

      // 5. Call Provider
      const generationId = `imggen_${crypto.randomBytes(8).toString("hex")}`;
      const idempotencyKey = `tido-${generationId}`;
      const providerModel = this.providerModel;
      const providerOutputSize = process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || IMAGE_ENGINE_CONFIG.TIDO_IMAGE_OUTPUT_SIZE || "1K";
      const providerMimeType = IMAGE_ENGINE_CONFIG.TIDO_IMAGE_OUTPUT_MIME || "image/png";

      const providerResult = await this.provider.generateImage({
        model: providerModel,
        prompt: recompiledPackage.compiled_prompt,
        references: providerReferences,
        aspectRatio: requestedAspectRatio,
        imageSize: providerOutputSize,
        mimeType: providerMimeType,
        generationId,
        idempotencyKey,
      });

      if (!providerResult.success || !providerResult.imageBuffer) {
        return this.buildErrorResult(
          providerResult.error?.code || "GENERATION_FAILED",
          providerResult.error?.message || "Provider image generation failed.",
          startTime,
          providerResult.error?.details
        );
      }

      // 6. Save Output & Metadata (Strict Security: Never store API token)
      const dimensions = (providerResult as any).dimensions;
      const remoteDetails = (providerResult as any).remoteDetails;

      const safeMetadata = {
        generation_id: generationId,
        created_at: new Date().toISOString(),
        provider: {
          name: this.providerName,
          model: providerModel,
        },
        output: {
          aspect_ratio: requestedAspectRatio,
          image_size: providerOutputSize,
          resolution: process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || providerOutputSize,
          quality: process.env.TIDO_IMAGE_OUTPUT_QUALITY || "standard",
          mime_type: providerResult.mimeType || providerMimeType,
          width: dimensions?.width,
          height: dimensions?.height,
        },
        remote_details: remoteDetails,
        cost_vnd: remoteDetails?.cost_vnd,
        balance_vnd: remoteDetails?.balance_vnd,
        trace: {
          template_id: recompiledPackage.template.id,
          template_version: recompiledPackage.template.version,
          template_hash: recompiledPackage.template.hash,
          compiled_prompt_hash: recompiledPackage.compiled_prompt_hash,
          input_fingerprint: recompiledPackage.input_fingerprint,
          routing_version: input.routingResult.routing_version,
          routing_mode: input.routingResult.routing_mode,
          knowledge_versions: recompiledPackage.knowledge.knowledge_versions,
          reference_hashes: referenceHashes,
          idempotency_key: idempotencyKey,
        },
        warnings: [...(recompiledPackage.compiler_warnings || []), ...warnings],
        generation_duration_ms: Date.now() - startTime,
      };

      const storageResult = await this.storage.saveAsset({
        generation_id: generationId,
        imageBuffer: providerResult.imageBuffer,
        mimeType: providerResult.mimeType || providerMimeType,
        masterPrompt: recompiledPackage.compiled_prompt,
        metadata: safeMetadata,
      });

      const durationMs = Date.now() - startTime;

      // Structured Server Log
      console.log(
        JSON.stringify({
          event: "IMAGE_GENERATION_SUCCESS",
          generation_id: generationId,
          provider: this.providerName,
          model: providerModel,
          referenceCount: providerReferences.length,
          aspectRatio: requestedAspectRatio,
          imageSize: providerOutputSize,
          dimensions: dimensions ? `${dimensions.width}x${dimensions.height}` : undefined,
          compiledPromptHash: recompiledPackage.compiled_prompt_hash,
          cost_vnd: remoteDetails?.cost_vnd,
          balance_vnd: remoteDetails?.balance_vnd,
          durationMs,
        })
      );

      return {
        generation_version: "1.0",
        generation_id: generationId,
        status: "SUCCEEDED",
        provider: {
          name: this.providerName,
          model: providerModel,
        },
        asset: {
          asset_id: `asset_${generationId}`,
          url: storageResult.url,
          mime_type: providerResult.mimeType || providerMimeType,
        },
        output: {
          aspect_ratio: requestedAspectRatio,
          image_size: providerOutputSize,
          resolution: process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || providerOutputSize,
          quality: process.env.TIDO_IMAGE_OUTPUT_QUALITY || "standard",
          width: dimensions?.width,
          height: dimensions?.height,
        },
        remote_details: remoteDetails,
        cost_vnd: remoteDetails?.cost_vnd,
        balance_vnd: remoteDetails?.balance_vnd,
        trace: {
          template_id: recompiledPackage.template.id,
          template_version: recompiledPackage.template.version,
          template_hash: recompiledPackage.template.hash,
          compiled_prompt_hash: recompiledPackage.compiled_prompt_hash,
          input_fingerprint: recompiledPackage.input_fingerprint,
          knowledge_versions: recompiledPackage.knowledge.knowledge_versions,
          reference_hashes: referenceHashes,
          idempotency_key: idempotencyKey,
        },
        timing: {
          generation_duration_ms: durationMs,
        },
        warnings: [...(recompiledPackage.compiler_warnings || []), ...warnings],
      };
    } catch (err: any) {
      return this.buildErrorResult(
        "GENERATION_FAILED",
        `Unexpected error during image generation: ${err.message || String(err)}`,
        startTime
      );
    } finally {
      this.inFlightRequests.delete(requestId);
    }
  }

  private buildErrorResult(
    code: any,
    message: string,
    startTime: number,
    details?: any
  ): GenerationResultV1 {
    return {
      generation_version: "1.0",
      generation_id: `imggen_err_${Date.now()}`,
      status: "FAILED",
      provider: {
        name: this.providerName,
        model: this.providerModel,
      },
      trace: {
        template_version: "2.0.0",
        template_hash: "",
        compiled_prompt_hash: "",
        input_fingerprint: "",
        knowledge_versions: {},
        reference_hashes: {},
      },
      timing: {
        generation_duration_ms: Date.now() - startTime,
      },
      warnings: [],
      error: {
        code,
        message,
        details,
      },
    };
  }
}

export const defaultImageGenerationService = new ImageGenerationService();
