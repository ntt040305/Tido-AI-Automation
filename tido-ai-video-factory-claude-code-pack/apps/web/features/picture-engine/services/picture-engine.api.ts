import { CreativeBrief, GeneratedAsset, AIStrategy } from "../types/picture-engine.types";
import { usePictureEngineStore } from "../stores/picture-engine.store";
import { IMAGE_ENGINE_CONFIG } from "../../../lib/image-engine/config";

/**
 * Service Layer Abstraction for Picture Engine API
 * Real End-to-End Execution connecting to Backend Image Engine (/api/image/generate-simple)
 */
export async function createPictureAsset(
  brief: CreativeBrief
): Promise<GeneratedAsset> {
  const store = usePictureEngineStore.getState();

  // Console Diagnostic: GENERATE_START
  console.log("[GENERATE_START]", {
    timestamp: new Date().toISOString(),
    assetType: brief.asset_type,
    brandName: brief.brand_identity?.brand_name,
    productName: brief.sales_context.product_name,
  });

  // Requirement 1: Clear previous error before every generation
  store.setError(null);

  const jobId = `job_pic_${Date.now()}`;

  // Step 1: Initializing & Interpreting Context
  store.setGenerationJob({
    job_id: jobId,
    status: "interpreting",
    progress_percent: 15,
    current_step_label: "Visual Intelligence Layer: Phân tích Brief & Ngành...",
    error: undefined,
  });

  try {
    // Step 2: Compiling Context & Knowledge
    store.setGenerationJob({
      job_id: jobId,
      status: "compiling",
      progress_percent: 40,
      current_step_label: "Master Prompt Compiler: Áp dụng Technique Cards & Kho tri thức...",
    });

    // The concept is what the user typed, and nothing else.
    //
    // This used to prepend product name, visual style, benefit and offer — all of
    // which were store defaults nobody had entered. Downstream the whole string is
    // treated as locked, non-negotiable user intent, so those placeholders became
    // creative constraints and drowned the real brief. Optional fields are now
    // passed as separate, clearly-labelled context and only when actually filled in.
    const concept = (brief.creative_concept || brief.user_notes || "").trim();
    const useCase = brief.asset_type || "Poster";
    const aspectRatio = brief.creative_direction.aspect_ratio || "1:1";
    const brandName = brief.brand_identity?.brand_name?.trim() || undefined;

    // Only text the user explicitly authored may become visible typography.
    const copyItems = [
      brief.sales_context.product_name,
      brief.sales_context.offer_text,
      brief.sales_context.cta_text,
    ]
      .map((t) => (t || "").trim())
      .filter((t) => t.length > 0);

    // Drop empty optional context objects entirely rather than shipping blank
    // fields the backend would render as dangling "Target Audience:" headers.
    const compact = <T extends Record<string, unknown>>(obj: T | undefined) => {
      if (!obj) return undefined;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" ? v.trim() : v) out[k] = v;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };

    const marketingContext = compact(brief.marketing_context as any);
    const creativeDirection = compact({
      visual_style: brief.creative_direction?.visual_style,
      emotional_tone: brief.creative_direction?.emotional_tone,
      composition_layout: brief.creative_direction?.composition_layout,
    });
    const salesContext = compact(brief.sales_context as any);

    // Step 3: Trigger Provider Render
    store.setGenerationJob({
      job_id: jobId,
      status: "rendering",
      progress_percent: 70,
      current_step_label: "Provider Adapter: Đang render 2K Commercial Visual qua Provider API...",
    });

    const productAssets = brief.brand_identity?.product_assets || [];
    const logoAsset = brief.brand_identity?.logo_asset;
    const inspirationAssets = brief.brand_identity?.reference_assets || [];
    const hasProductAssets =
      productAssets.length > 0 || Boolean(logoAsset) || inspirationAssets.length > 0;

    // Single global client timeout per request, configurable from config.ts
    const clientTimeoutMs = IMAGE_ENGINE_CONFIG?.CLIENT_TIMEOUT_MS || 250000;
    const requestStartTime = Date.now();
    const startDateIso = new Date().toISOString();

    let responseReceived = false;
    let cleanupExecuted = false;
    let abortTriggerSource: string = "NONE";
    let wasAborted = false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      abortTriggerSource = "CLIENT_TIMEOUT_EXCEEDED";
      controller.abort(`CLIENT_TIMEOUT_EXCEEDED (${clientTimeoutMs}ms)`);
    }, clientTimeoutMs);

    const cleanup = () => {
      if (!cleanupExecuted) {
        clearTimeout(timeoutId);
        cleanupExecuted = true;
      }
    };

    let res: Response;
    let data: any;

    try {
      if (hasProductAssets) {
        const formData = new FormData();
        formData.append("concept", concept);
        formData.append("useCase", useCase);
        formData.append("aspectRatio", aspectRatio);
        if (brandName) formData.append("brandName", brandName);
        formData.append("requestId", jobId);
        // Authorized visible copy was previously appended only on the JSON branch,
        // so uploading any image silently dropped every copy item and the compiler
        // then instructed the model to render no text at all.
        if (copyItems.length > 0) {
          formData.append("copyItems", JSON.stringify(copyItems));
        }
        if (marketingContext) formData.append("marketingContext", JSON.stringify(marketingContext));
        if (creativeDirection) formData.append("creativeDirection", JSON.stringify(creativeDirection));
        if (salesContext) formData.append("salesContext", JSON.stringify(salesContext));

        for (const asset of productAssets) {
          if (asset.file) {
            formData.append("images", asset.file, asset.filename || "product.png");
          } else if (asset.file_url && asset.file_url.startsWith("blob:")) {
            try {
              const blobRes = await fetch(asset.file_url);
              const blob = await blobRes.blob();
              formData.append("images", blob, asset.filename || "product.png");
            } catch (e) {
              console.warn("[picture-engine.api] Could not fetch blob URL:", asset.file_url);
            }
          }
        }

        if (logoAsset) {
          if (logoAsset.file) {
            formData.append("images", logoAsset.file, logoAsset.filename || "logo.png");
          } else if (logoAsset.file_url && logoAsset.file_url.startsWith("blob:")) {
            try {
              const blobRes = await fetch(logoAsset.file_url);
              const blob = await blobRes.blob();
              formData.append("images", blob, logoAsset.filename || "logo.png");
            } catch (e) { }
          }
        }

        // Inspiration / style references are transported under a DISTINCT FormData key.
        // They must never be appended to "images", because the backend defaults every
        // entry of that list to role PRODUCT and would treat the style reference as a
        // second product identity.
        for (const asset of inspirationAssets) {
          if (asset.file) {
            formData.append("inspirationImages", asset.file, asset.filename || "inspiration.png");
          } else if (asset.file_url && asset.file_url.startsWith("blob:")) {
            try {
              const blobRes = await fetch(asset.file_url);
              const blob = await blobRes.blob();
              formData.append("inspirationImages", blob, asset.filename || "inspiration.png");
            } catch (e) {
              console.warn("[picture-engine.api] Could not fetch inspiration blob URL:", asset.file_url);
            }
          }
        }

        console.log("[INSPIRATION_TRANSPORT][CLIENT]", {
          product_count: formData.getAll("images").length,
          inspiration_count: formData.getAll("inspirationImages").length,
          inspiration_filenames: formData
            .getAll("inspirationImages")
            .map((f) => (f instanceof File ? f.name : "blob")),
        });

        res = await fetch("/api/image/generate-simple", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      } else {
        res = await fetch("/api/image/generate-simple", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            concept,
            useCase,
            aspectRatio,
            brandName,
            copyItems,
            requestId: jobId,
            marketingContext,
            creativeDirection,
            salesContext,
          }),
          signal: controller.signal,
        });
      }

      // Requirement 5: Ensure timeout cleanup runs IMMEDIATELY after fetch receives HTTP response
      cleanup();
      responseReceived = true;

      // Safely parse JSON body
      data = await res.json();
    } catch (fetchErr: any) {
      cleanup();
      wasAborted = controller.signal.aborted || fetchErr.name === "AbortError";
      if (wasAborted && abortTriggerSource === "NONE") {
        abortTriggerSource = controller.signal.reason
          ? String(controller.signal.reason)
          : fetchErr.message || "EXTERNAL_ABORT_SIGNAL";
      }

      const elapsedTime = Date.now() - requestStartTime;
      console.log("[REQUEST_ABORT_DEBUG]", {
        timeout_value: clientTimeoutMs,
        elapsed_time: elapsedTime,
        abort_trigger_source: abortTriggerSource,
        response_received: responseReceived,
        cleanup_executed: cleanupExecuted,
      });

      console.log("[CLIENT_REQUEST_TIMING]", {
        start: startDateIso,
        end: new Date().toISOString(),
        duration: elapsedTime,
        aborted: wasAborted,
        abort_reason: abortTriggerSource !== "NONE" ? abortTriggerSource : null,
      });

      throw fetchErr;
    }

    const elapsedTime = Date.now() - requestStartTime;
    console.log("[REQUEST_ABORT_DEBUG]", {
      timeout_value: clientTimeoutMs,
      elapsed_time: elapsedTime,
      abort_trigger_source: abortTriggerSource,
      response_received: responseReceived,
      cleanup_executed: cleanupExecuted,
    });

    console.log("[CLIENT_REQUEST_TIMING]", {
      start: startDateIso,
      end: new Date().toISOString(),
      duration: elapsedTime,
      aborted: false,
      abort_reason: null,
    });

    if (!res.ok || !data.success) {
      const errorMsg = data.error?.message || "Render visual thất bại từ AI Provider.";
      const errorObj = {
        code: data.error?.code || "GENERATION_FAILED",
        message: errorMsg,
        source: "provider" as const,
      };
      store.setError(errorObj);
      store.setGenerationJob({
        job_id: jobId,
        status: "failed",
        progress_percent: 0,
        current_step_label: "Xảy ra lỗi trong quá trình khởi tạo visual",
        error: errorObj,
      });

      // Console Diagnostic: GENERATE_FAILED
      console.log("[GENERATE_FAILED]", {
        timestamp: new Date().toISOString(),
        jobId,
        error: errorMsg,
        code: errorObj.code,
      });

      throw new Error(errorMsg);
    }

    // Step 4: Asset Registration & QC Scorecard Assembly
    store.setGenerationJob({
      job_id: jobId,
      status: "qc_evaluating",
      progress_percent: 90,
      current_step_label: "Commercial Quality Control & Đăng ký Asset Registry...",
    });

    const assetId = data.contractAsset?.asset_id || data.project?.output_asset_ids?.[0] || `asset_${data.generationId}`;
    const imageUrl = data.imageUrl || (data.generationId ? `/api/image/generated/${data.generationId}` : "");

    // Reported, not invented. Every field below comes from the backend run.
    const backendDiagnostics = data.strategy?.run_diagnostics;
    const resultAsset: GeneratedAsset = {
      asset_id: assetId,
      image_url: imageUrl,
      aspect_ratio: brief.creative_direction.aspect_ratio,
      diagnostics: backendDiagnostics || {
        knowledge_blocks_applied: [],
        prompt_chars: data.diagnostics?.promptChars || 0,
        references_analyzed: data.diagnostics?.referenceCount || 0,
        products_detected: data.diagnostics?.productCount || 0,
        logos_detected: data.diagnostics?.logoCount || 0,
        inspiration_references: data.diagnostics?.supportReferenceCount || 0,
        generation_parameters: {
          model: "unknown",
          aspect_ratio: data.aspectRatio || brief.creative_direction.aspect_ratio,
          resolution: "unknown",
          references_attached: data.diagnostics?.referenceCount || 0,
        },
        pipeline_warnings: [],
      },
      creative_angle: data.strategy?.creative_angle || "",
      created_at: new Date().toISOString(),
    };

    // Update AI Strategy in Store if available
    if (data.strategy) {
      const strategyOutput: AIStrategy = {
        creative_angle: data.strategy.creative_angle,
        applied_knowledge_nodes: data.strategy.applied_knowledge_nodes || [],
        applied_technique_cards: data.strategy.applied_technique_cards || [],
        compiled_prompt: data.strategy.compiled_prompt,
        negative_prompt: data.strategy.negative_prompt,
      };
      store.setAIStrategy(strategyOutput);
    }

    // Requirement 2: Clear error after successful API response
    store.setError(null);

    store.setGenerationJob({
      job_id: jobId,
      status: "completed",
      progress_percent: 100,
      current_step_label: "Hoàn tất tạo Commercial Visual 2K",
      error: undefined,
    });

    store.setCurrentAsset(resultAsset);

    // Console Diagnostic: GENERATE_SUCCESS
    console.log("[GENERATE_SUCCESS]", {
      timestamp: new Date().toISOString(),
      jobId,
      assetId: resultAsset.asset_id,
      imageUrl: resultAsset.image_url,
    });

    return resultAsset;
  } catch (err: any) {
    const errorMsg = err.message || "Xảy ra lỗi kết nối với máy chủ Render";
    const errorObj = {
      code: "EXECUTION_ERROR",
      message: errorMsg,
      source: "system" as const,
    };
    store.setError(errorObj);
    store.setGenerationJob({
      job_id: jobId,
      status: "failed",
      progress_percent: 0,
      current_step_label: "Tạo visual thất bại",
      error: errorObj,
    });

    // Console Diagnostic: GENERATE_FAILED
    console.log("[GENERATE_FAILED]", {
      timestamp: new Date().toISOString(),
      jobId,
      error: errorMsg,
    });

    throw err;
  }
}

/**
 * Service Layer Function to download the original high-quality 2K generated asset directly.
 * Triggers an automatic file download without opening a new browser tab.
 */
export async function downloadPictureAsset(
  imageUrl: string,
  brandName?: string,
  productName?: string
): Promise<void> {
  if (!imageUrl) {
    throw new Error("Không tìm thấy đường dẫn ảnh để tải về.");
  }

  // Sanitize brand & product names for meaningful filename
  const cleanBrand = (brandName || "TIDO")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const cleanProduct = (productName || "Commercial_Image")
    .trim()
    .replace(/[^A-Z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const filename = `${cleanBrand}_${cleanProduct}_Commercial_Image_2K.png`;

  let fetchUrl = imageUrl;
  if (fetchUrl.startsWith("/api/image/generated/")) {
    const separator = fetchUrl.includes("?") ? "&" : "?";
    fetchUrl = `${fetchUrl}${separator}download=1&filename=${encodeURIComponent(filename)}`;
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Tải ảnh thất bại: HTTP status ${response.status}`);
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
  }, 1000);
}

