import sharp from "sharp";
import { IMAGE_ENGINE_CONFIG } from "../config";
import {
  ImageGenerationProvider,
  ProviderImageGenerationInput,
  ProviderImageGenerationOutput,
} from "./ImageGenerationProvider";

export interface ImgStudioRemoteDetails {
  remote_image_id?: string;
  cost_vnd?: number;
  balance_vnd?: number;
  provider_name?: string;
  model?: string;
  url?: string;
}

export interface ImgStudioProviderOutput extends ProviderImageGenerationOutput {
  remoteDetails?: ImgStudioRemoteDetails;
}

export class ImgStudioImageGenerationProvider implements ImageGenerationProvider {
  /**
   * Endpoint Selector Decision Layer for ImgStudio Adapter
   */
  private selectEndpoint(baseUrl: string, hasRealReferences: boolean): string {
    if (hasRealReferences) {
      // Commercial image generation with product/logo reference images uses ImgStudio edit pipeline
      return `${baseUrl}/api/v1/images/edit`;
    }
    // Text-only generation without reference images uses ImgStudio generate pipeline
    return `${baseUrl}/api/v1/images/generate`;
  }

  /**
   * Generates or edits an image using ImgStudio REST API (/api/v1/images/edit)
   * Model / Provider ID: flow-nano-banana-2
   */
  async generateImage(input: ProviderImageGenerationInput): Promise<ImgStudioProviderOutput> {
    const baseUrl = (process.env.IMGSTUDIO_BASE_URL || "https://imgstudio.site").replace(/\/+$/, "");
    const apiKey = process.env.IMGSTUDIO_API_KEY;
    const providerId = process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2";
    const resolution = process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || input.imageSize || "1K";
    const quality = process.env.TIDO_IMAGE_OUTPUT_QUALITY || "standard";

    // 1. API Key Check
    if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_IMGSTUDIO_API_KEY") {
      console.error("[ImgStudioProvider][CONFIG_ERROR] IMGSTUDIO_API_KEY is not configured.");
      return {
        success: false,
        error: {
          code: "PROVIDER_NOT_CONFIGURED",
          message: "IMGSTUDIO_API_KEY is not configured on the server. Please set IMGSTUDIO_API_KEY in .env.local.",
        },
      };
    }

    // 2. Pre-call Aspect Ratio Validation against ImgStudio supported capabilities
    const supportedRatios = IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS || [
      "1:1", "4:5", "3:4", "9:16",
    ];

    if (!input.aspectRatio || !supportedRatios.includes(input.aspectRatio)) {
      return {
        success: false,
        error: {
          code: "UNSUPPORTED_ASPECT_RATIO",
          message: `Tỷ lệ ảnh ${input.aspectRatio} hiện chưa được hỗ trợ. Vui lòng chọn tỷ lệ khác.`,
        },
      };
    }

    // 3. Determine Endpoint, Payload & Headers based on reference images presence
    const idempotencyKey =
      input.idempotencyKey || `tido-${input.generationId || Date.now()}`;
    const timeoutMs = IMAGE_ENGINE_CONFIG.GENERATION_TIMEOUT_MS || 90000;

    const realReferences = (input.references || []).filter((ref) => {
      if (!ref) return false;
      if (ref.reference_id?.includes("CONCEPT_REF")) return false;
      let bufLen = 0;
      if (Buffer.isBuffer(ref.buffer)) {
        bufLen = ref.buffer.length;
      } else if (ref.buffer && (ref.buffer as any).data && Array.isArray((ref.buffer as any).data)) {
        bufLen = (ref.buffer as any).data.length;
      } else if (ref.buffer && typeof (ref.buffer as any).length === "number") {
        bufLen = (ref.buffer as any).length;
      }
      return bufLen > 0;
    });
    const hasRealReferences = realReferences.length > 0;

    const endpoint = this.selectEndpoint(baseUrl, hasRealReferences);

    let requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": idempotencyKey,
    };
    let requestBody: any;
    const multipartKeys: string[] = [];

    if (hasRealReferences) {
      const formData = new FormData();
      formData.append("prompt", input.prompt);
      multipartKeys.push("prompt");
      
      formData.append("provider_id", providerId);
      multipartKeys.push("provider_id");

      formData.append("aspect_ratio", input.aspectRatio || "1:1");
      multipartKeys.push("aspect_ratio");

      formData.append("resolution", resolution);
      multipartKeys.push("resolution");

      formData.append("quality", quality);
      multipartKeys.push("quality");

      for (let i = 0; i < realReferences.length; i++) {
        const ref = realReferences[i];
        const rawBuf = Buffer.isBuffer(ref.buffer)
          ? ref.buffer
          : (ref.buffer as any)?.data
          ? Buffer.from((ref.buffer as any).data)
          : Buffer.from(ref.buffer || []);
        
        const filename = ref.filename || `${ref.reference_id || `ref_${i + 1}`}.png`;
        const mimeType = ref.mimeType || "image/png";

        // Create standard Blob/File object for multipart upload
        const fileObj = typeof File !== "undefined"
          ? new File([rawBuf], filename, { type: mimeType })
          : new Blob([rawBuf], { type: mimeType });

        formData.append("images", fileObj, filename);
        multipartKeys.push(`images[${i}:${ref.reference_id || `ref_${i + 1}`}]`);
      }
      requestBody = formData;
    } else {
      requestHeaders["Content-Type"] = "application/json";
      requestBody = JSON.stringify({
        prompt: input.prompt,
        provider_id: providerId,
        aspect_ratio: input.aspectRatio || "1:1",
        resolution,
        quality,
      });
      multipartKeys.push("json_body");
    }

    // Detailed ImgStudio Request Logging with image dimensions
    const imagesSummary = await Promise.all(
      realReferences.map(async (ref, idx) => {
        const rawBuf = Buffer.isBuffer(ref.buffer)
          ? ref.buffer
          : (ref.buffer as any)?.data
          ? Buffer.from((ref.buffer as any).data)
          : Buffer.from(ref.buffer || []);
        const bufLen = rawBuf.length;
        let dimensions = "unknown";
        try {
          const meta = await sharp(rawBuf).metadata();
          if (meta.width && meta.height) {
            dimensions = `${meta.width}x${meta.height}`;
          }
        } catch (_) {}

        return {
          index: idx + 1,
          reference_id: ref.reference_id || `REF_${idx + 1}`,
          product_id: ref.product_id,
          role: ref.role || "UNKNOWN",
          mimeType: ref.mimeType || "image/png",
          sizeBytes: bufLen,
          sizeKB: (bufLen / 1024).toFixed(2) + " KB",
          dimensions,
          filename: ref.filename || `${ref.reference_id || `ref_${idx + 1}`}.png`,
        };
      })
    );

    console.log("[ImgStudioProvider][REQUEST_LOG]", {
      endpoint,
      provider_id: providerId,
      imageCount: realReferences.length,
      imagesSummary,
      multipartKeys,
      aspectRatio: input.aspectRatio,
      resolution,
      quality,
      idempotencyKey,
    });

    // 5. Call ImgStudio API
    try {
      const fetchPromise = fetch(endpoint, {
        method: "POST",
        headers: requestHeaders,
        body: requestBody,
      });

      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error("PROVIDER_TIMEOUT")), timeoutMs);
      });

      const res = await Promise.race([fetchPromise, timeoutPromise]);

      if (!res.ok) {
        let errBody = "";
        try {
          errBody = await res.text();
        } catch (_) { }

        // Detailed API Error Logging
        console.error(`[ImgStudioProvider][API_ERROR] HTTP ${res.status}:`, {
          endpoint,
          provider_id: providerId,
          status: res.status,
          statusText: res.statusText,
          responseBody: errBody,
        });

        if (res.status === 429) {
          return {
            success: false,
            error: {
              code: "PROVIDER_RATE_LIMIT",
              message: `ImgStudio rate limit exceeded (HTTP 429): ${errBody}`,
            },
          };
        }

        return {
          success: false,
          error: {
            code: "PROVIDER_RESPONSE_INVALID",
            message: `ImgStudio API error (HTTP ${res.status}): ${errBody || res.statusText}`,
            details: {
              status: res.status,
              responseBody: errBody,
            },
          },
        };
      }

      const json = await res.json();

      // 6. Validate Response Status
      if (json.status !== "completed") {
        console.error("[ImgStudioProvider][REJECTED]", json);
        return {
          success: false,
          error: {
            code: "PROVIDER_REJECTED",
            message: `ImgStudio generation status is '${json.status || "unknown"}' (expected 'completed').`,
            details: json,
          },
        };
      }

      if (!json.url) {
        return {
          success: false,
          error: {
            code: "PROVIDER_NO_IMAGE",
            message: "ImgStudio response status is completed, but no image URL was returned.",
            details: json,
          },
        };
      }

      // 7. Download Real Image Bytes via Authorized GET Request
      const fileUrl = json.url.startsWith("http") ? json.url : `${baseUrl}${json.url}`;

      const imageDownloadRes = await fetch(fileUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!imageDownloadRes.ok) {
        let dlErrText = "";
        try {
          dlErrText = await imageDownloadRes.text();
        } catch (_) { }

        console.error(`[ImgStudioProvider][DOWNLOAD_ERROR] HTTP ${imageDownloadRes.status}:`, dlErrText);

        return {
          success: false,
          error: {
            code: "PROVIDER_RESPONSE_INVALID",
            message: `Failed to download generated image file from ImgStudio (HTTP ${imageDownloadRes.status}): ${dlErrText}`,
          },
        };
      }

      const arrayBuffer = await imageDownloadRes.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      if (!imageBuffer || imageBuffer.length === 0) {
        return {
          success: false,
          error: {
            code: "PROVIDER_RESPONSE_INVALID",
            message: "Downloaded ImgStudio image file has zero bytes.",
          },
        };
      }

      const contentType = imageDownloadRes.headers.get("content-type") || input.mimeType || "image/webp";

      console.log("[ImgStudioProvider][SUCCESS]", {
        generationId: input.generationId,
        remoteImageId: json.id,
        imageUrl: fileUrl,
        bufferSize: imageBuffer.length,
      });

      return {
        success: true,
        imageUrl: fileUrl,
        imageBuffer,
        mimeType: contentType,
        remoteDetails: {
          remote_image_id: json.id,
          cost_vnd: json.cost_vnd,
          balance_vnd: json.balance_vnd,
          provider_name: json.provider_name || "Flow",
          model: json.model || providerId,
          url: json.url,
        },
      };
    } catch (err: any) {
      if (err.message === "PROVIDER_TIMEOUT") {
        console.error(`[ImgStudioProvider][TIMEOUT] Timed out after ${timeoutMs / 1000}s`);
        return {
          success: false,
          error: {
            code: "PROVIDER_TIMEOUT",
            message: `ImgStudio provider call timed out after ${timeoutMs / 1000}s.`,
          },
        };
      }

      console.error("[ImgStudioProvider][EXECUTION_ERROR]", err);

      return {
        success: false,
        error: {
          code: "GENERATION_FAILED",
          message: `ImgStudio provider execution error: ${err.message || String(err)}`,
          details: String(err),
        },
      };
    }
  }
}
