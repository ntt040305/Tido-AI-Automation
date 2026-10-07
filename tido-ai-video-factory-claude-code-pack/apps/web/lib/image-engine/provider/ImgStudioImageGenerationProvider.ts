import sharp from "sharp";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { activeProfile } from "../models/image-model-profiles";
import {
  ImageNormalizationService,
  NormalizedImage,
  PROVIDER_LIMIT_BYTES,
  UploadGuardReport,
  formatBytes,
} from "../service/ImageNormalizationService";
import { ProviderErrorClassifier, ProviderErrorVerdict } from "./ProviderErrorClassifier";
import { ReferencePackingService } from "./reference-packing/ReferencePackingService";
import {
  applyPackedReferenceProtocol,
  protocolTelemetry,
} from "./reference-packing/PackedReferenceProtocol";
import {
  ImageGenerationProvider,
  ProviderImageGenerationInput,
  ProviderImageGenerationOutput,
} from "./ImageGenerationProvider";
import { RenderTracer } from "../observability/RenderTracer";

export interface ImgStudioRemoteDetails {
  remote_image_id?: string;
  cost_vnd?: number;
  balance_vnd?: number;
  provider_name?: string;
  model?: string;
  url?: string;
  /**
   * Measurement only, added so the wait can be attributed rather than guessed.
   *
   * `provider_wait_ms` in the pipeline timing covers both the request and the
   * file download as one number, and this adapter neither queues nor polls: the
   * generation happens inside the POST. Splitting the two is the difference
   * between knowing the model is slow and assuming it.
   *
   * Nothing reads these to make a decision.
   */
  api_request_ms?: number;
  download_ms?: number;
  download_bytes?: number;
  attempts?: number;
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
   * Model / Provider ID: from the active row in `models/image-model-profiles.ts`.
   * Includes 90,000ms timeout, network error retries (3 attempts total), and detailed telemetry.
   */
  async generateImage(input: ProviderImageGenerationInput): Promise<ImgStudioProviderOutput> {
    const baseUrl = (process.env.IMGSTUDIO_BASE_URL || "https://imgstudio.site").replace(/\/+$/, "");
    const apiKey = process.env.IMGSTUDIO_API_KEY;
    // The model's own facts, from its one row in `models/image-model-profiles.ts`.
    //
    // These three used to be literals here, and the literals were wrong for the
    // model that is now active: the default provider id named Nano Banana 2, and
    // `quality` defaulted to "standard" where the ImgStudio web UI sends "high" for
    // Sunburst. An explicit environment override still wins, because a value set by
    // hand is a decision and this is not the place to overrule one.
    const profile = activeProfile();
    const providerId = process.env.IMGSTUDIO_PROVIDER_ID || profile.providerId;
    const resolution = process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || input.imageSize || profile.resolutionTier;
    const quality = process.env.TIDO_IMAGE_OUTPUT_QUALITY || profile.quality;
    // The hard per-call ceiling. `config.ts:172-175` declared 3 for every ImgStudio
    // model; Sunburst refuses a third (03 §2.2), so the number belongs to the row.
    const referenceLimit = Number(process.env.IMGSTUDIO_MAX_REFERENCE_IMAGES) > 0
      ? Number(process.env.IMGSTUDIO_MAX_REFERENCE_IMAGES)
      : profile.maxReferences;
    // Measurement only; neither value changes any decision below.
    let apiRequestMs = 0;
    let downloadMs = 0;
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
    // The active model's own list. `config.ts:157` held one list for every
    // ImgStudio model; a per-model row is what lets Sunburst refuse 4:5 while a
    // future model that accepts it does not have to.
    const supportedRatios = profile.ratios;

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

    const candidateReferences = (input.references || []).filter((ref) => {
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

    // 3. Pre-call Reference Capacity Handling (Non-retryable)
    //
    // Same seam as the aspect ratio check above and as the ceilings Gemini and
    // Cloudflare already declare: a fact about the provider, settled before the
    // wire rather than learned from a 400. The decision itself is not here —
    // this calls the packing module and acts on what it returns, so the ceiling
    // stays a provider fact and the handling stays testable without a provider.
    //
    // Three outcomes. It fits, so nothing happened. It fits once things that
    // carry no identity are shed. Or the products themselves outnumber the
    // slots, and they travel as one identity sheet plus the highest-resolution
    // originals that still fit beside it.
    const packing = await ReferencePackingService.pack({
      references: candidateReferences,
      manifest: input.reference_manifest,
      options: { limit: referenceLimit, maxCells: profile.maxPanelsPerSheet, sheetSize: profile.sheetSizePx },
    });

    if (packing.status === "IMPOSSIBLE") {
      console.error("[ImgStudioProvider][REFERENCE_CAPACITY_BLOCKED]", {
        status: packing.status,
        received: candidateReferences.length,
        limit: referenceLimit,
        products_in: packing.products_in.length,
        reason: packing.reason,
      });
      return {
        success: false,
        error: {
          code: "REFERENCE_LIMIT_EXCEEDED",
          message:
            `Nhà cung cấp chỉ nhận tối đa ${referenceLimit} ` +
            `ảnh tham chiếu, và ${packing.products_in.length} sản phẩm này không gộp được vào một ảnh. ` +
            `Hãy tách brief thành nhiều lần tạo.`,
          details: {
            error_code: "REFERENCE_LIMIT_EXCEEDED",
            stage: "PROVIDER_CAPABILITY_CHECK",
            provider_limit: referenceLimit,
            received: candidateReferences.length,
            distinct_products: packing.products_in,
            shed_without_loss: packing.dropped,
            reason: packing.reason,
            suggestion: "Split the brief into more than one generation",
          },
        },
      };
    }

    // A product that entered and did not come out is the one failure this whole
    // path exists to prevent. Checked here rather than trusted, because the
    // check costs nothing and the alternative is a render that looks finished
    // with a product quietly missing from it.
    const lostProducts = packing.products_in.filter((p) => !packing.products_out.includes(p));
    if (lostProducts.length) {
      console.error("[ImgStudioProvider][REFERENCE_PACKING_UNSOUND]", {
        products_in: packing.products_in.length,
        products_out: packing.products_out.length,
        lost: lostProducts,
      });
      return {
        success: false,
        error: {
          code: "REFERENCE_LIMIT_EXCEEDED",
          message:
            `Không thể chuyển đủ ${packing.products_in.length} sản phẩm tới nhà cung cấp ` +
            `mà không bỏ sót. Hãy tách brief thành nhiều lần tạo.`,
          details: {
            error_code: "REFERENCE_LIMIT_EXCEEDED",
            stage: "REFERENCE_PACKING",
            lost_products: lostProducts,
          },
        },
      };
    }

    // The sheet is now in the payload; this is where it acquires a meaning.
    //
    // The only point in the system where the compiled prompt and the packing map
    // both exist — packing happens here, and everything upstream finished its
    // work before there was a sheet to describe. Returns the same string when
    // nothing was packed, so every ordinary render is byte-identical.
    const effectivePrompt = applyPackedReferenceProtocol(input.prompt, packing);
    if (effectivePrompt !== input.prompt) {
      console.log(
        "[REFERENCE_PACKING][PROTOCOL]",
        protocolTelemetry(packing, effectivePrompt.length - input.prompt.length)
      );
    }
    if (RenderTracer.isTraceEnabled()) {
      RenderTracer.recordCheckpoint("F_HTTP", "Provider prompt immediately before HTTP dispatch", effectivePrompt, { generationId: input.generationId });
    }

    const realReferences = packing.references;
    const hasRealReferences = realReferences.length > 0;
    const endpoint = this.selectEndpoint(baseUrl, hasRealReferences);

    // ── Upload guard ───────────────────────────────────────────────────
    // Nothing leaves this method over the provider's ceiling. The old path had
    // no total-payload accounting at all: each image was checked against a 10MB
    // per-image rule while the provider rejects the whole multipart body at
    // 9.5MB, so three 3.5MB references passed every check and 413'd on the wire.
    let normalized: NormalizedImage[] = [];
    let guard: UploadGuardReport | null = null;
    if (hasRealReferences) {
      const result = await ImageNormalizationService.normalizePayload(
        realReferences.map((ref, idx) => ({
          reference_id: ref.reference_id || `REF_${idx + 1}`,
          buffer: ref.buffer as never,
          mimeType: ref.mimeType,
          filename: ref.filename,
        }))
      );
      normalized = result.images;
      guard = result.guard;

      if (guard.status === "BLOCKED") {
        // Sending it anyway would spend a provider call to be told what is
        // already known here.
        console.error("[ImgStudioProvider][UPLOAD_BLOCKED]", guard);
        return {
          success: false,
          error: {
            code: "IMAGE_PAYLOAD_TOO_LARGE",
            message:
              `Reference images total ${formatBytes(guard.final_total)} after normalization, ` +
              `over the ${formatBytes(guard.limit)} upload budget.`,
            details: {
              error_code: "IMAGE_PAYLOAD_TOO_LARGE",
              stage: "IMAGE_PREPROCESSOR",
              suggestion: "Images were compressed automatically but are still too large; use fewer or smaller references",
              guard,
            },
          },
        };
      }
    }

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
    // The 413 repair is worth exactly one use. A second 413 after the payload has
    // already been shrunk means the ceiling is not where we think it is, and
    // another round of compression would be guesswork at the user's expense.
    let payloadRepairSpent = false;
    let lastVerdict: ProviderErrorVerdict | null = null;

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
        formData.append("prompt", effectivePrompt);
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
          // The normalized buffer, always. Reading `ref.buffer` here again is
          // exactly what would quietly undo the upload guard above.
          const norm = normalized[i];
          const rawBuf = norm ? norm.buffer : Buffer.from([]);
          const filename = norm?.filename || ref.filename || `${ref.reference_id || `ref_${i + 1}`}.png`;
          const mimeType = norm?.mimeType || ref.mimeType || "image/png";

          // A Buffer from sharp is typed over ArrayBufferLike, which BlobPart does
          // not accept; this view is what makes it a valid multipart part without
          // widening the type anywhere else.
          const bytes = new Uint8Array(rawBuf);
          const fileObj = typeof File !== "undefined"
            ? new File([bytes], filename, { type: mimeType })
            : new Blob([bytes], { type: mimeType });

          formData.append("images", fileObj, filename);
          multipartKeys.push(`images[${i}:${ref.reference_id || `ref_${i + 1}`}]`);
        }
        requestBody = formData;
      } else {
        requestHeaders["Content-Type"] = "application/json";
        requestBody = JSON.stringify({
          prompt: effectivePrompt,
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
        // Measurement only. The generation happens inside this POST — this
        // adapter does not queue or poll — so this number is the render itself,
        // and separating it from the file download is the difference between
        // knowing the model is slow and guessing that it is.
        apiRequestMs = duration_ms;

        if (!res.ok) {
          let errBody = "";
          try {
            errBody = await res.text();
          } catch (_) {}

          console.error(`[ImgStudioProvider][API_ERROR] Attempt ${attempt} HTTP ${res.status}:`, errBody);

          // ── What kind of failure is this? ──────────────────────────
          // Replaces a two-bucket rule — 400/401/403 stop, everything else
          // retries — under which a 413 was retried three times with byte-
          // identical payloads and could not once have succeeded.
          const verdict = ProviderErrorClassifier.classify(res.status);
          lastVerdict = verdict;
          lastErrorType = verdict.classification;
          lastErrorMessage = `HTTP ${res.status}: ${errBody || res.statusText}`;

          console.log("[IMG_PROVIDER_NETWORK]", {
            attempt,
            timeout_ms: timeoutMs,
            duration_ms,
            error_type: lastErrorType,
            classification: verdict.classification,
            action: verdict.action,
            retryable: verdict.retryable,
          });

          // The server answered, so this attempt is settled (and refunded). Any retry
          // must use a new key or ImgStudio replies 409 and the retry is wasted.
          rotateKeyBeforeNextAttempt = true;

          if (verdict.action === "STOP") {
            return {
              success: false,
              error: {
                code: verdict.error_code,
                message: `ImgStudio API error (HTTP ${res.status}): ${errBody || res.statusText}`,
                details: {
                  error_code: verdict.error_code,
                  stage: verdict.stage,
                  suggestion: verdict.suggestion,
                  status: res.status,
                  responseBody: errBody,
                },
              },
            };
          }

          // ── 413: change the request, then retry exactly once ───────
          if (verdict.action === "NORMALIZE_AND_RETRY_ONCE") {
            if (payloadRepairSpent || !hasRealReferences) {
              return {
                success: false,
                error: {
                  code: verdict.error_code,
                  message: payloadRepairSpent
                    ? `ImgStudio rejected the upload as too large even after normalization (HTTP 413).`
                    : `ImgStudio rejected the request as too large (HTTP 413), and it carries no reference images to compress.`,
                  details: {
                    error_code: verdict.error_code,
                    stage: verdict.stage,
                    suggestion: verdict.suggestion,
                    status: res.status,
                    responseBody: errBody,
                    guard,
                  },
                },
              };
            }

            // The provider's real ceiling is evidently below our budget, so aim
            // well under it rather than shaving a little off and being refused
            // again.
            const tighter = Math.floor(PROVIDER_LIMIT_BYTES * 0.6);
            console.warn("[ImgStudioProvider][PAYLOAD_REPAIR]", {
              attempt,
              rejected_total: formatBytes(normalized.reduce((t, n) => t + n.after_size, 0)),
              new_budget: formatBytes(tighter),
            });
            const repaired = await ImageNormalizationService.normalizePayload(
              realReferences.map((ref, idx) => ({
                reference_id: ref.reference_id || `REF_${idx + 1}`,
                buffer: ref.buffer as never,
                mimeType: ref.mimeType,
                filename: ref.filename,
              })),
              { maxTotalBytes: tighter, maxImageBytes: Math.floor(tighter / Math.max(1, realReferences.length)) }
            );
            normalized = repaired.images;
            guard = repaired.guard;
            payloadRepairSpent = true;

            if (guard.status === "BLOCKED") {
              return {
                success: false,
                error: {
                  code: verdict.error_code,
                  message: `Reference images remain ${formatBytes(guard.final_total)} after a second normalization pass.`,
                  details: {
                    error_code: verdict.error_code,
                    stage: verdict.stage,
                    suggestion: verdict.suggestion,
                    guard,
                  },
                },
              };
            }
            continue;
          }

          // ── 429 / 5xx: the request was fine, the server was not ────
          if (ProviderErrorClassifier.mayRetry(verdict, attempt)) {
            const backoffMs = verdict.classification === "RATE_LIMIT" ? attempt * 2000 : attempt === 1 ? 1000 : 2000;
            const remainingBudgetMs = deadlineAt - Date.now() - backoffMs;
            if (remainingBudgetMs <= MIN_ATTEMPT_BUDGET_MS) {
              console.warn("[ImgStudioProvider][RETRY_ABORTED]", {
                attempt,
                remaining_budget_ms: remainingBudgetMs,
                reason: "not enough time left in the request budget for another attempt",
              });
            } else {
              console.warn(
                `[ImgStudioProvider][RETRY] ${verdict.classification} on attempt ${attempt}. Waiting ${backoffMs}ms before retry...`
              );
              await this.delay(backoffMs);
              continue;
            }
          }

          return {
            success: false,
            error: {
              code: verdict.error_code,
              message: `ImgStudio ${verdict.classification} after ${attempt} attempt(s): ${lastErrorMessage}`,
              details: {
                error_code: verdict.error_code,
                stage: verdict.stage,
                suggestion: verdict.suggestion,
                status: res.status,
                responseBody: errBody,
              },
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

        const downloadStart = Date.now();
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
        downloadMs = Date.now() - downloadStart;

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

        console.log("[ImgStudioProvider][TIMING]", {
          generationId: input.generationId,
          attempt,
          api_request_ms: apiRequestMs,
          download_ms: downloadMs,
          download_bytes: imageBuffer.length,
          note: "this adapter posts and waits; there is no queue or poll stage",
        });

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
            api_request_ms: apiRequestMs,
            download_ms: downloadMs,
            download_bytes: imageBuffer.length,
            attempts: attempt,
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
        //
        // The classifier decides whether a retry is allowed at all. This branch used to
        // retry every thrown error on its own, so a timeout went out three times even
        // though the classifier is the one place that knows a timeout is final.
        const thrownVerdict = ProviderErrorClassifier.classifyThrown(err);
        if (!thrownVerdict.retryable) {
          return {
            success: false,
            error: {
              code: thrownVerdict.error_code,
              message: `ImgStudio did not answer within ${timeoutMs}ms. Not retried: the provider may still be rendering, and charging for, this request.`,
              details: String(err),
            },
          };
        }
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
