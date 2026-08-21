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
          message: "Tỷ lệ ảnh này hiện chưa được hỗ trợ. Vui lòng chọn tỷ lệ khác.",
        },
      };
    }

    // 3. Determine Endpoint & Idempotency Key
    // TIDO depends on product reference images -> POST /api/v1/images/edit
    const endpoint = `${baseUrl}/api/v1/images/edit`;
    const idempotencyKey =
      input.idempotencyKey || `tido-${input.generationId || Date.now()}`;

    // 3. Construct Multipart Form Data
    const formData = new FormData();
    formData.append("prompt", input.prompt);
    formData.append("provider_id", providerId);
    formData.append("aspect_ratio", input.aspectRatio || "1:1");
    formData.append("resolution", resolution);
    formData.append("quality", quality);

    // 4. Attach Reference Images in repeated "images" multipart field
    if (input.references && input.references.length > 0) {
      for (let i = 0; i < input.references.length; i++) {
        const ref = input.references[i];
        const blob = new Blob([new Uint8Array(ref.buffer)], {
          type: ref.mimeType || "image/png",
        });
        const filename = ref.filename || `${ref.reference_id || `ref_${i + 1}`}.png`;
        formData.append("images", blob, filename);
      }
    }

    const timeoutMs = IMAGE_ENGINE_CONFIG.GENERATION_TIMEOUT_MS || 90000;

    console.log("[SIMPLE RATIO][PROVIDER]", {
      aspectRatio: input.aspectRatio,
      providerId,
      referenceCount: input.references ? input.references.length : 0,
      endpoint,
    });

    console.log("[SIMPLE RATIO][IMGSTUDIO PAYLOAD]", {
      endpoint,
      provider_id: providerId,
      aspect_ratio: input.aspectRatio || "1:1",
      length: (input.aspectRatio || "1:1").length,
      charCodes: [...(input.aspectRatio || "1:1")].map((c) => c.charCodeAt(0)),
      referenceCount: input.references ? input.references.length : 0,
      formDataKeys: Array.from(formData.keys()),
    });

    // 5. Call ImgStudio API
    try {
      const fetchPromise = fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: formData,
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
            message: `ImgStudio API returned status ${res.status}: ${errBody}`,
          },
        };
      }

      const json = await res.json();

      // 6. Validate Response Status
      if (json.status !== "completed") {
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
        return {
          success: false,
          error: {
            code: "PROVIDER_TIMEOUT",
            message: `ImgStudio provider call timed out after ${timeoutMs / 1000}s.`,
          },
        };
      }

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
