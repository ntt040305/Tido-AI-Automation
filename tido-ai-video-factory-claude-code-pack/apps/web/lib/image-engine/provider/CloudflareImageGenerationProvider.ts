import sharp from "sharp";
import { IMAGE_ENGINE_CONFIG } from "../config";
import {
  ImageGenerationProvider,
  ProviderImageGenerationInput,
  ProviderImageGenerationOutput,
} from "./ImageGenerationProvider";

export interface CloudflareProviderOutput extends ProviderImageGenerationOutput {
  dimensions?: {
    width: number;
    height: number;
  };
}

export class CloudflareImageGenerationProvider implements ImageGenerationProvider {
  /**
   * Generates an image using Cloudflare Workers AI REST API (@cf/black-forest-labs/flux-2-klein-4b)
   */
  async generateImage(input: ProviderImageGenerationInput): Promise<CloudflareProviderOutput> {
    // 1. Validate Aspect Ratio against supported set
    const supportedRatios = IMAGE_ENGINE_CONFIG.SUPPORTED_ASPECT_RATIOS || [
      "1:1", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9",
    ];

    if (!input.aspectRatio || !supportedRatios.includes(input.aspectRatio)) {
      return {
        success: false,
        error: {
          code: "UNSUPPORTED_ASPECT_RATIO",
          message: `Aspect ratio '${input.aspectRatio}' is not supported by provider. Supported: ${supportedRatios.join(", ")}`,
        },
      };
    }

    // 2. Validate Reference Count limit for Cloudflare FLUX (max 4 reference images)
    if (input.references && input.references.length > 4) {
      return {
        success: false,
        error: {
          code: "CLOUDFLARE_REFERENCE_LIMIT_EXCEEDED",
          message: `Cloudflare FLUX supports maximum 4 reference images (received ${input.references.length}).`,
        },
      };
    }

    // 3. API Token and Account ID Check
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || accountId.trim() === "" || !apiToken || apiToken.trim() === "") {
      return {
        success: false,
        error: {
          code: "PROVIDER_NOT_CONFIGURED",
          message: "CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is not configured on the server.",
        },
      };
    }

    const modelName =
      input.model ||
      process.env.TIDO_CLOUDFLARE_IMAGE_MODEL ||
      "@cf/black-forest-labs/flux-2-klein-4b";

    // 4. Map TIDO Aspect Ratio to Cloudflare FLUX Width/Height (1K-class dimensions, max <= 1920)
    const { width, height } = this.mapAspectRatioToDimensions(input.aspectRatio);

    // 5. Construct Multipart Form Data Payload
    const formData = new FormData();
    formData.append("prompt", input.prompt);
    formData.append("width", String(width));
    formData.append("height", String(height));

    // 6. Process and attach Reference Images
    // Cloudflare requires reference images smaller than 512x512.
    // Create temporary transport copies without modifying original reference buffers.
    if (input.references && input.references.length > 0) {
      for (let i = 0; i < input.references.length; i++) {
        const ref = input.references[i];
        const fieldName = `input_image_${i}`;

        let resizedBuffer: Buffer;
        try {
          resizedBuffer = await sharp(ref.buffer)
            .resize(500, 500, { fit: "inside", withoutEnlargement: false })
            .png()
            .toBuffer();
        } catch (err: any) {
          return {
            success: false,
            error: {
              code: "PROVIDER_RESPONSE_INVALID",
              message: `Failed to create provider-specific transport copy for reference image ${ref.reference_id}: ${err.message}`,
            },
          };
        }

        const blob = new Blob([new Uint8Array(resizedBuffer)], { type: "image/png" });
        formData.append(fieldName, blob, `ref_${i}.png`);
      }
    }

    // 7. Execute Request to Cloudflare Workers AI REST API
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelName}`;
    const timeoutMs = IMAGE_ENGINE_CONFIG.GENERATION_TIMEOUT_MS || 90000;

    try {
      const fetchPromise = fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
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
        } catch (_) {}

        if (res.status === 429) {
          return {
            success: false,
            error: {
              code: "PROVIDER_RATE_LIMIT",
              message: `Cloudflare API rate limit exceeded (HTTP 429): ${errBody}`,
            },
          };
        }

        return {
          success: false,
          error: {
            code: "PROVIDER_RESPONSE_INVALID",
            message: `Cloudflare API returned status ${res.status}: ${errBody}`,
          },
        };
      }

      const json = await res.json();

      // 8. Verify Response Contract & Extract Base64 Image
      if (!json.success || !json.result || !json.result.image) {
        return {
          success: false,
          error: {
            code: "PROVIDER_NO_IMAGE",
            message: "Cloudflare API response succeeded HTTP check, but no result.image payload was returned.",
            details: json.errors || json.messages,
          },
        };
      }

      const base64Str = json.result.image;
      if (typeof base64Str !== "string" || base64Str.trim() === "") {
        return {
          success: false,
          error: {
            code: "PROVIDER_RESPONSE_INVALID",
            message: "Cloudflare result.image payload is not a valid non-empty string.",
          },
        };
      }

      // 9. Base64 Decoding & Byte Check
      let imageBuffer: Buffer;
      try {
        imageBuffer = Buffer.from(base64Str, "base64");
      } catch (err: any) {
        return {
          success: false,
          error: {
            code: "PROVIDER_RESPONSE_INVALID",
            message: `Failed to decode Base64 image payload: ${err.message}`,
          },
        };
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        return {
          success: false,
          error: {
            code: "PROVIDER_RESPONSE_INVALID",
            message: "Decoded Cloudflare image buffer has zero bytes.",
          },
        };
      }

      return {
        success: true,
        imageBuffer,
        mimeType: "image/png",
        dimensions: {
          width,
          height,
        },
      };
    } catch (err: any) {
      if (err.message === "PROVIDER_TIMEOUT") {
        return {
          success: false,
          error: {
            code: "PROVIDER_TIMEOUT",
            message: `Cloudflare provider call timed out after ${timeoutMs / 1000}s.`,
          },
        };
      }

      return {
        success: false,
        error: {
          code: "PROVIDER_RESPONSE_INVALID",
          message: `Cloudflare provider execution error: ${err.message || String(err)}`,
          details: String(err),
        },
      };
    }
  }

  /**
   * Helper: Map TIDO Aspect Ratio to 1K-class Output Dimensions (width x height <= 1920)
   */
  public mapAspectRatioToDimensions(aspectRatio: string): { width: number; height: number } {
    switch (aspectRatio) {
      case "1:1":
        return { width: 1024, height: 1024 };
      case "4:5":
        return { width: 896, height: 1120 };
      case "9:16":
        return { width: 756, height: 1344 };
      case "16:9":
        return { width: 1344, height: 756 };
      case "3:4":
        return { width: 864, height: 1152 };
      case "5:4":
        return { width: 1120, height: 896 };
      case "4:3":
        return { width: 1152, height: 864 };
      default:
        return { width: 1024, height: 1024 };
    }
  }
}
