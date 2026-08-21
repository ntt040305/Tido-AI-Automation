import crypto from "crypto";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { EditPromptCompilerService } from "../compiler/EditPromptCompilerService";
import { resolveActiveProvider } from "./ImageGenerationService";
import { ImageGenerationProvider } from "../provider/ImageGenerationProvider";
import { GeneratedImageStorage } from "../storage/GeneratedImageStorage";
import { LocalGeneratedImageStorage } from "../storage/LocalGeneratedImageStorage";
import {
  EditResultV1,
  ImageEditRequestInput,
  ReferenceImageInput,
} from "../types";

export class ImageEditService {
  private provider: ImageGenerationProvider;
  private providerName: string;
  private providerModel: string;
  private storage: GeneratedImageStorage;
  private editCompiler: EditPromptCompilerService;
  private inFlightRequests: Set<string> = new Set();

  constructor(
    provider?: ImageGenerationProvider,
    storage?: GeneratedImageStorage,
    editCompiler?: EditPromptCompilerService
  ) {
    const resolved = resolveActiveProvider(provider);
    this.provider = resolved.provider;
    this.providerName = resolved.name;
    this.providerModel = resolved.model;
    this.storage = storage || new LocalGeneratedImageStorage();
    this.editCompiler = editCompiler || new EditPromptCompilerService();
  }

  public async editImage(input: ImageEditRequestInput): Promise<EditResultV1> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // 0. Duplicate In-Flight Protection
    const requestId = input.requestId || input.compiledEditPackage?.edit_fingerprint || `req_edit_${Date.now()}`;
    if (this.inFlightRequests.has(requestId)) {
      return {
        edit_version: "1.0",
        edit_id: `edit_duplicate_${Date.now()}`,
        parent_image_id: input.parentImageId || "unknown",
        root_generation_id: input.rootGenerationId || input.parentImageId || "unknown",
        status: "FAILED",
        provider: {
          name: this.providerName,
          model: this.providerModel,
        },
        trace: {
          template_version: "1.0.0",
          template_hash: "",
          edit_prompt_hash: "",
          edit_fingerprint: "",
          supporting_reference_hashes: {},
        },
        timing: { edit_duration_ms: Date.now() - startTime },
        warnings: ["DUPLICATE_IN_FLIGHT_REQUEST"],
        error: {
          code: "GENERATION_FAILED",
          message: "An edit request with the same request ID or fingerprint is already in flight.",
        },
      };
    }

    this.inFlightRequests.add(requestId);

    try {
      // 1. Basic Structure Validation
      if (!input.parentImageId || !input.parentImageBuffer || input.parentImageBuffer.length === 0) {
        return this.buildErrorResult(
          "INVALID_REFERENCE_IMAGE",
          "Parent generated image buffer and parentImageId are required for image editing.",
          input,
          startTime
        );
      }

      if (!input.editInstruction || !input.editInstruction.trim()) {
        return this.buildErrorResult(
          "INVALID_COMPILER_INPUT",
          "An edit instruction is required.",
          input,
          startTime
        );
      }

      // 2. Compile Edit Prompt
      let editPackage = input.compiledEditPackage;
      if (!editPackage) {
        const compilerInput = input.editCompilerInput || {
          parentImageId: input.parentImageId,
          editInstruction: input.editInstruction,
          editCategory: input.editCategory,
          supportingReferences: input.supportingReferences,
          copyItems: input.copyItems,
          brandName: input.brandName,
          brandInfo: input.brandInfo,
        };

        const compileRes = await this.editCompiler.compile(compilerInput);
        if (!compileRes.success || !compileRes.package) {
          return this.buildErrorResult(
            compileRes.error?.code || "PROMPT_COMPILATION_FAILED",
            `Edit prompt compilation failed: ${compileRes.error?.message}`,
            input,
            startTime
          );
        }
        editPackage = compileRes.package;
      }

      // 3. Assemble Reference Order (IMAGE 0 = PARENT IMAGE, Following = Supporting References)
      const parentSha256 = crypto.createHash("sha256").update(input.parentImageBuffer).digest("hex");
      const supportingHashes: Record<string, string> = {
        PARENT_IMAGE: parentSha256,
      };

      const providerReferences: {
        reference_id: string;
        product_id: string;
        mimeType: string;
        buffer: Buffer;
        filename?: string;
      }[] = [];

      // Image 0: Parent Generated Image
      providerReferences.push({
        reference_id: "PARENT_IMAGE",
        product_id: "PARENT_IMAGE",
        mimeType: input.parentMimeType || "image/png",
        buffer: input.parentImageBuffer,
        filename: "parent_generated_image.png",
      });

      // Supporting References (if present)
      const rawSupporting = input.supportingReferences || [];
      for (let i = 0; i < rawSupporting.length; i++) {
        const ref = rawSupporting[i];
        const refId = ref.reference_id || `REF_${String(i + 1).padStart(2, "0")}`;
        const prodId = ref.product_id || `PRODUCT_${String(i + 1).padStart(2, "0")}`;
        const sha256 = crypto.createHash("sha256").update(ref.buffer).digest("hex");

        supportingHashes[refId] = sha256;
        providerReferences.push({
          reference_id: refId,
          product_id: prodId,
          mimeType: ref.mimeType || "image/png",
          buffer: ref.buffer,
          filename: ref.filename || `${refId}.png`,
        });
      }

      // 4. Call Provider
      const editId = `edit_${crypto.randomBytes(8).toString("hex")}`;
      const rootGenId = input.rootGenerationId || input.parentImageId;
      const idempotencyKey = `tido-edit-${editId}`;
      const requestedAspectRatio = input.aspectRatio || "4:5";
      const providerOutputSize = process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || IMAGE_ENGINE_CONFIG.TIDO_IMAGE_OUTPUT_SIZE || "1K";
      const providerMimeType = IMAGE_ENGINE_CONFIG.TIDO_IMAGE_OUTPUT_MIME || "image/png";

      const providerResult = await this.provider.generateImage({
        model: this.providerModel,
        prompt: editPackage.compiled_edit_prompt,
        references: providerReferences,
        aspectRatio: requestedAspectRatio,
        imageSize: providerOutputSize,
        mimeType: providerMimeType,
        generationId: editId,
        idempotencyKey,
      });

      if (!providerResult.success || !providerResult.imageBuffer) {
        return this.buildErrorResult(
          providerResult.error?.code || "GENERATION_FAILED",
          providerResult.error?.message || "Provider image edit failed.",
          input,
          startTime,
          providerResult.error?.details
        );
      }

      // 5. Save Asset & Version Metadata
      const dimensions = (providerResult as any).dimensions;
      const remoteDetails = (providerResult as any).remoteDetails;

      const safeMetadata = {
        edit_id: editId,
        parent_image_id: input.parentImageId,
        root_generation_id: rootGenId,
        operation_type: "EDIT",
        created_at: new Date().toISOString(),
        edit_instruction: editPackage.edit_instruction,
        edit_category: editPackage.edit_category,
        provider: {
          name: this.providerName,
          model: this.providerModel,
        },
        output: {
          aspect_ratio: requestedAspectRatio,
          image_size: providerOutputSize,
          mime_type: providerResult.mimeType || providerMimeType,
          width: dimensions?.width,
          height: dimensions?.height,
        },
        remote_details: remoteDetails,
        cost_vnd: remoteDetails?.cost_vnd,
        balance_vnd: remoteDetails?.balance_vnd,
        trace: {
          template_id: editPackage.template.id,
          template_version: editPackage.template.version,
          template_hash: editPackage.template.hash,
          edit_prompt_hash: editPackage.compiled_edit_prompt_hash,
          edit_fingerprint: editPackage.edit_fingerprint,
          supporting_reference_hashes: supportingHashes,
          idempotency_key: idempotencyKey,
        },
        timing: { edit_duration_ms: Date.now() - startTime },
        warnings,
      };

      const storageResult = await this.storage.saveAsset({
        generation_id: editId,
        imageBuffer: providerResult.imageBuffer,
        mimeType: providerResult.mimeType || providerMimeType,
        masterPrompt: editPackage.compiled_edit_prompt,
        metadata: safeMetadata,
      });

      const durationMs = Date.now() - startTime;

      return {
        edit_version: "1.0",
        edit_id: editId,
        parent_image_id: input.parentImageId,
        root_generation_id: rootGenId,
        status: "SUCCEEDED",
        provider: {
          name: this.providerName,
          model: this.providerModel,
        },
        asset: {
          asset_id: `asset_${editId}`,
          url: storageResult.url,
          mime_type: providerResult.mimeType || providerMimeType,
        },
        output: {
          aspect_ratio: requestedAspectRatio,
          image_size: providerOutputSize,
          width: dimensions?.width,
          height: dimensions?.height,
        },
        remote_details: remoteDetails,
        cost_vnd: remoteDetails?.cost_vnd,
        balance_vnd: remoteDetails?.balance_vnd,
        trace: {
          template_id: editPackage.template.id,
          template_version: editPackage.template.version,
          template_hash: editPackage.template.hash,
          edit_prompt_hash: editPackage.compiled_edit_prompt_hash,
          edit_fingerprint: editPackage.edit_fingerprint,
          supporting_reference_hashes: supportingHashes,
          idempotency_key: idempotencyKey,
        },
        timing: {
          edit_duration_ms: durationMs,
        },
        warnings,
      };
    } catch (err: any) {
      return this.buildErrorResult(
        "GENERATION_FAILED",
        `Unexpected error during image edit: ${err.message || String(err)}`,
        input,
        startTime
      );
    } finally {
      this.inFlightRequests.delete(requestId);
    }
  }

  private buildErrorResult(
    code: any,
    message: string,
    input: ImageEditRequestInput,
    startTime: number,
    details?: any
  ): EditResultV1 {
    return {
      edit_version: "1.0",
      edit_id: `edit_err_${Date.now()}`,
      parent_image_id: input.parentImageId || "unknown",
      root_generation_id: input.rootGenerationId || input.parentImageId || "unknown",
      status: "FAILED",
      provider: {
        name: this.providerName,
        model: this.providerModel,
      },
      trace: {
        template_version: "1.0.0",
        template_hash: "",
        edit_prompt_hash: "",
        edit_fingerprint: "",
        supporting_reference_hashes: {},
      },
      timing: {
        edit_duration_ms: Date.now() - startTime,
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

export const defaultImageEditService = new ImageEditService();
