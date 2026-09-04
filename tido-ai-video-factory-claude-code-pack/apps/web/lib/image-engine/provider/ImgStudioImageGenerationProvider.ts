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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generates or edits an image using ImgStudio REST API (/api/v1/images/edit)
   * Model / Provider ID: flow-nano-banana-2
   * Includes 90,000ms timeout, network error retries (3 attempts total), and detailed telemetry.
   */
  async generateImage(input: ProviderImageGenerationInput): Promise<ImgStudioProviderOutput> {
    const baseUrl = (process.env.IMGSTUDIO_BASE_URL || "https://imgstudio.site").replace(/\/+$/, "");
    const apiKey = process.env.IMGSTUDIO_API_KEY;
    const providerId = process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2";
    const resolution = process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || input.imageSize || "1K";
    const quality = process.env.TIDO_IMAGE_OUTPUT_QUALITY || "standard";
    const timeoutMs = parseInt(process.env.IMG_PROVIDER_TIMEOUT_MS || "160000", 10) || IMAGE_ENGINE_CONFIG.GENERATION_TIMEOUT_MS || 160000;

    // 1. API Key Check (Non-retryable)
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

    // 2. Pre-call Aspect Ratio Validation (Non-retryable)
    const supportedRatios = IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS || [
      "1:1", "4:5", "3:4", "9:16", "16:9",
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

    const baseIdempotencyKey = input.idempotencyKey || `tido-${input.generationId || Date.now()}`;

    // ImgStudio rejects a retry that reuses the key of a request it already resolved as
    // failed ("vui lòng thử lại với Idempotency-Key mới" / HTTP 409), and it refunds the
    // failed attempt. So a key may only be reused when we never received a response and
    // the upstream may still be holding the original request. Once the server has
    // definitively answered with an error, the next attempt must carry a fresh key or it
    // is guaranteed to fail.
    let idempotencyKey = baseIdempotencyKey;
    let rotateKeyBeforeNextAttempt = false;

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

    // Detailed Request Summary
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
      timeout_ms: timeoutMs,
      aspectRatio: input.aspectRatio,
      idempotencyKey,
    });

    const maxRetries = 2; // 3 total attempts

    // The API route abandons the whole pipeline at SERVER_ROUTE_TIMEOUT_MS. Retrying past
    // that point cannot deliver an image to the caller: it only keeps burning provider
    // calls after the user has already been shown an error. Give the retry loop a
    // deadline inside the route budget so it fails fast and reports the real provider
    // error instead of a generic pipeline timeout.
    const routeBudgetMs = IMAGE_ENGINE_CONFIG.SERVER_ROUTE_TIMEOUT_MS || 180000;
    const MIN_ATTEMPT_BUDGET_MS = 15000;
    const providerStartedAt = Date.now();
    const deadlineAt = providerStartedAt + Math.max(routeBudgetMs - 10000, MIN_ATTEMPT_BUDGET_MS);
    let lastErrorType = "UNKNOWN_ERROR";
    let lastErrorMessage = "";

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const attemptStartTime = Date.now();

      if (rotateKeyBeforeNextAttempt) {
        idempotencyKey = `${baseIdempotencyKey}-r${attempt}`;
        rotateKeyBeforeNextAttempt = false;
        console.log("[ImgStudioProvider][IDEMPOTENCY_ROTATE]", {
          attempt,
          reason: "previous attempt was definitively rejected by the server",
          idempotencyKey,
        });
      }

      // Build fresh request payload per attempt to avoid consumed FormData stream issues
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
        const duration_ms = Date.now() - attemptStartTime;

        if (!res.ok) {
          let errBody = "";
          try {
            errBody = await res.text();
          } catch (_) {}

          console.error(`[ImgStudioProvider][API_ERROR] Attempt ${attempt} HTTP ${res.status}:`, errBody);

          // Non-retryable HTTP client errors (400, 401, 403)
          if (res.status === 400 || res.status === 401 || res.status === 403) {
            lastErrorType = `HTTP_${res.status}`;
            console.log("[IMG_PROVIDER_NETWORK]", {
              attempt,
              timeout_ms: timeoutMs,
              duration_ms,
              error_type: lastErrorType,
            });

            return {
              success: false,
              error: {
                code: res.status === 401 || res.status === 403 ? "PROVIDER_NOT_CONFIGURED" : "PROVIDER_RESPONSE_INVALID",
                message: `ImgStudio API error (HTTP ${res.status}): ${errBody || res.statusText}`,
                details: { status: res.status, responseBody: errBody },
              },
            };
          }

          // Retryable server errors (429, 500, 502, 503, 504)
          lastErrorType = res.status === 429 ? "PROVIDER_RATE_LIMIT" : `HTTP_${res.status}`;
          lastErrorMessage = `HTTP ${res.status}: ${errBody || res.statusText}`;

          console.log("[IMG_PROVIDER_NETWORK]", {
            attempt,
            timeout_ms: timeoutMs,
            duration_ms,
            error_type: lastErrorType,
          });

          // The server answered, so this attempt is settled (and refunded). Any retry
          // must use a new key or ImgStudio replies 409 and the retry is wasted.
          rotateKeyBeforeNextAttempt = true;

          if (attempt <= maxRetries) {
            const backoffMs = attempt === 1 ? 1000 : 2000;
            const remainingBudgetMs = deadlineAt - Date.now() - backoffMs;
            if (remainingBudgetMs <= MIN_ATTEMPT_BUDGET_MS) {
              console.warn("[ImgStudioProvider][RETRY_ABORTED]", {
                attempt,
                remaining_budget_ms: remainingBudgetMs,
                reason: "not enough time left in the request budget for another attempt",
              });
            } else {
              console.warn(`[ImgStudioProvider][RETRY] Network/server failure on attempt ${attempt}. Waiting ${backoffMs}ms before retry...`);
              await this.delay(backoffMs);
              continue;
            }
          }

          return {
            success: false,
            error: {
              code: "PROVIDER_NETWORK_ERROR",
              message: `ImgStudio network/server error after 3 attempts (${timeoutMs}ms timeout): ${lastErrorMessage}`,
              details: { status: res.status, responseBody: errBody },
            },
          };
        }

        const json = await res.json();

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

        // Download Generated Image File
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
          } catch (_) {}

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
          attempt,
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
        const duration_ms = Date.now() - attemptStartTime;
        lastErrorType = err.message === "PROVIDER_TIMEOUT" ? "ConnectTimeoutError" : (err.name || "FetchError");
        lastErrorMessage = err.message || String(err);

        console.log("[IMG_PROVIDER_NETWORK]", {
          attempt,
          timeout_ms: timeoutMs,
          duration_ms,
          error_type: lastErrorType,
        });

        // No response arrived, so the upstream may still be holding the original
        // request. The key is deliberately NOT rotated here: reusing it lets ImgStudio
        // deduplicate rather than start (and bill) a second render.
        if (attempt <= maxRetries) {
          const backoffMs = attempt === 1 ? 1000 : 2000;
          const remainingBudgetMs = deadlineAt - Date.now() - backoffMs;
          if (remainingBudgetMs <= MIN_ATTEMPT_BUDGET_MS) {
            console.warn("[ImgStudioProvider][RETRY_ABORTED]", {
              attempt,
              remaining_budget_ms: remainingBudgetMs,
              reason: "not enough time left in the request budget for another attempt",
            });
          } else {
            console.warn(`[ImgStudioProvider][RETRY] Network connection failed on attempt ${attempt} (${lastErrorType}). Retrying in ${backoffMs}ms...`);
            await this.delay(backoffMs);
            continue;
          }
        }

        return {
          success: false,
          error: {
            code: "PROVIDER_NETWORK_ERROR",
            message: `ImgStudio provider network connection failed after 3 attempts (${timeoutMs}ms timeout): ${lastErrorMessage}`,
            details: String(err),
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: "PROVIDER_NETWORK_ERROR",
        message: `ImgStudio provider network failed after 3 attempts: ${lastErrorMessage}`,
      },
    };
  }
}
