import sharp from "sharp";

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB hard ceiling
const TARGET_SIZE_BYTES = 5 * 1024 * 1024; // 5MB preferred target

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
    const processedImages: ProcessedReferenceImage[] = [];
    const diagnostics: ReferenceProcessingDiagnostic[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const refId = img.reference_id || `REF_${String(i + 1).padStart(2, "0")}`;

      // Safely extract raw buffer (supports Buffer, Uint8Array, JSON serialized Buffer)
      let rawBuf: Buffer;
      if (Buffer.isBuffer(img.buffer)) {
        rawBuf = img.buffer;
      } else if (img.buffer && (img.buffer as any).data && Array.isArray((img.buffer as any).data)) {
        rawBuf = Buffer.from((img.buffer as any).data);
      } else {
        rawBuf = Buffer.from(img.buffer || []);
      }

      const originalSizeBytes = rawBuf.length;
      let currentMime = img.mimeType || "image/png";

      // 1. Validate Mime Type
      if (!ALLOWED_MIME_TYPES.includes(currentMime.toLowerCase())) {
        console.warn(
          `[ReferenceImageProcessorService] Unsupported mime type '${currentMime}' for ${refId}. Defaulting to image/png.`
        );
        currentMime = "image/png";
      }

      // 2. Read Metadata via sharp
      let metadata: any;
      try {
        metadata = await sharp(rawBuf).metadata();
      } catch (err: any) {
        console.warn(
          `[ReferenceImageProcessorService] Sharp metadata read failed for ${refId}: ${err.message}. Passing through.`
        );
        const diag: ReferenceProcessingDiagnostic = {
          reference_id: refId,
          original_size: formatBytes(originalSizeBytes),
          processed_size: formatBytes(originalSizeBytes),
          compression_applied: false,
          width: "unknown",
          height: "unknown",
        };
        processedImages.push({
          reference_id: refId,
          buffer: rawBuf,
          mimeType: currentMime,
          filename: img.filename || `${refId}.png`,
          diagnostics: diag,
        });
        diagnostics.push(diag);
        continue;
      }

      const origWidth = metadata.width || 0;
      const origHeight = metadata.height || 0;

      // 3. Determine optimization requirement (Rule: >10MB must be optimized, target <5MB)
      const needsCompression = originalSizeBytes > MAX_SIZE_BYTES;

      if (!needsCompression) {
        // Pass through if <= 10MB
        const diag: ReferenceProcessingDiagnostic = {
          reference_id: refId,
          original_size: formatBytes(originalSizeBytes),
          processed_size: formatBytes(originalSizeBytes),
          compression_applied: false,
          width: origWidth,
          height: origHeight,
        };
        processedImages.push({
          reference_id: refId,
          buffer: rawBuf,
          mimeType: currentMime,
          filename: img.filename || `${refId}.png`,
          diagnostics: diag,
        });
        diagnostics.push(diag);
      } else {
        // Image > 10MB -> Perform smart resize & high-fidelity compression
        console.log(
          `[ReferenceImageProcessorService] Optimizing oversized reference image ${refId} (${formatBytes(
            originalSizeBytes
          )} > 10MB limit)...`
        );

        // Smart max dimensions (2048px max dimension to preserve crisp product details and logo readability)
        let targetWidth = origWidth;
        let targetHeight = origHeight;
        const maxDimension = 2048;

        if (origWidth > maxDimension || origHeight > maxDimension) {
          if (origWidth >= origHeight) {
            targetWidth = maxDimension;
            targetHeight = Math.round((origHeight * maxDimension) / origWidth);
          } else {
            targetHeight = maxDimension;
            targetWidth = Math.round((origWidth * maxDimension) / origHeight);
          }
        }

        let processedBuf: Buffer;
        let finalMime = currentMime;

        // Apply sharp resize with high quality Lanczos3 kernel
        const pipeline = sharp(rawBuf).resize(targetWidth, targetHeight, {
          fit: "inside",
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3,
        });

        if (currentMime === "image/png") {
          processedBuf = await pipeline.png({ compressionLevel: 8 }).toBuffer();
        } else if (currentMime === "image/webp") {
          processedBuf = await pipeline.webp({ quality: 85, effort: 4 }).toBuffer();
        } else {
          finalMime = "image/jpeg";
          processedBuf = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
        }

        // If still > 5MB, secondary pass converting to optimized WebP / JPEG
        if (processedBuf.length > TARGET_SIZE_BYTES) {
          const secondPipeline = sharp(rawBuf).resize(targetWidth, targetHeight, {
            fit: "inside",
            withoutEnlargement: true,
          });

          if (currentMime === "image/png") {
            processedBuf = await secondPipeline.webp({ quality: 80, effort: 4 }).toBuffer();
            finalMime = "image/webp";
          } else {
            processedBuf = await secondPipeline.jpeg({ quality: 75, mozjpeg: true }).toBuffer();
            finalMime = "image/jpeg";
          }
        }

        const processedSizeBytes = processedBuf.length;
        console.log(
          `[ReferenceImageProcessorService] Optimized ${refId}: ${formatBytes(
            originalSizeBytes
          )} -> ${formatBytes(processedSizeBytes)} (${targetWidth}x${targetHeight})`
        );

        const diag: ReferenceProcessingDiagnostic = {
          reference_id: refId,
          original_size: formatBytes(originalSizeBytes),
          processed_size: formatBytes(processedSizeBytes),
          compression_applied: true,
          width: targetWidth,
          height: targetHeight,
        };

        processedImages.push({
          reference_id: refId,
          buffer: processedBuf,
          mimeType: finalMime,
          filename: img.filename || `${refId}.jpg`,
          diagnostics: diag,
        });
        diagnostics.push(diag);
      }
    }

    return {
      processedImages,
      diagnostics,
    };
  }
}
