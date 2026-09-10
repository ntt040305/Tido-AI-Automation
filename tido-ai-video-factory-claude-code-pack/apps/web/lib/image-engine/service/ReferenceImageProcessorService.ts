import { ImageNormalizationService, formatBytes } from "./ImageNormalizationService";

export interface InputReferenceImage {
  reference_id?: string;
  buffer?: Buffer | any;
  mimeType?: string;
  filename?: string;
}

export interface ReferenceProcessingDiagnostic {
  reference_id: string;
  original_size: string;
  processed_size: string;
  compression_applied: boolean;
  width: number | string;
  height: number | string;
}

export interface ProcessedReferenceImage {
  reference_id: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
  diagnostics: ReferenceProcessingDiagnostic;
}

export interface ReferenceProcessorResult {
  processedImages: ProcessedReferenceImage[];
  diagnostics: ReferenceProcessingDiagnostic[];
}

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
];

export class ReferenceImageProcessorService {
  /**
   * Preprocessing Layer: Validates, resizes, and optimizes oversized reference images
   * ensuring Provider Adapter NEVER receives raw upload buffers exceeding 10MB limits.
   */
  async processReferenceImages(
    images: InputReferenceImage[]
  ): Promise<ReferenceProcessorResult> {
    // Phase 4.0.7.1. This method used to hold its own resize logic behind a
    // single test: compress only if one image exceeds 10MB. The provider rejects
    // on the *total* multipart body at 9.5MB, so three 3.5MB references cleared
    // every check here, logged `compression_applied: false`, and 413'd on the
    // wire. The rule was not too lenient — it was measuring the wrong quantity.
    //
    // Normalization and the payload budget now live in one place, so there is a
    // single answer to "will this upload fit". This method keeps its signature
    // and its diagnostic shape; every existing caller is unaffected.
    const result = await ImageNormalizationService.normalizePayload(
      images.map((img, i) => ({
        reference_id: img.reference_id || `REF_${String(i + 1).padStart(2, "0")}`,
        buffer: img.buffer as never,
        mimeType: ALLOWED_MIME_TYPES.includes(String(img.mimeType || "").toLowerCase())
          ? img.mimeType
          : "image/png",
        filename: img.filename,
      }))
    );

    const processedImages: ProcessedReferenceImage[] = [];
    const diagnostics: ReferenceProcessingDiagnostic[] = [];

    for (const image of result.images) {
      const diag: ReferenceProcessingDiagnostic = {
        reference_id: image.reference_id,
        original_size: formatBytes(image.before_size),
        processed_size: formatBytes(image.after_size),
        compression_applied: image.compression_applied,
        width: image.after_dimensions.split("x")[0] || "unknown",
        height: image.after_dimensions.split("x")[1] || "unknown",
      };
      processedImages.push({
        reference_id: image.reference_id,
        buffer: image.buffer,
        mimeType: image.mimeType,
        filename: image.filename,
        diagnostics: diag,
      });
      diagnostics.push(diag);
    }

    if (result.guard.status === "BLOCKED") {
      // Not thrown: the provider owns the decision to abandon a request, and it
      // runs the same guard immediately before building the body. Surfacing it
      // here as well means the orchestrator log says why before the call is made.
      console.error("[ReferenceImageProcessorService][UPLOAD_GUARD_BLOCKED]", result.guard);
    }

    return {
      processedImages,
      diagnostics,
    };
  }
}
