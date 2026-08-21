import { MasterPromptCompilerService } from "../compiler/MasterPromptCompilerService";
import { PromptBudgetValidator } from "../compiler/PromptBudgetValidator";
import {
  ImageGenerationProvider,
  ProviderImageGenerationInput,
  ProviderReferenceImage,
} from "../provider/ImageGenerationProvider";
import { ImgStudioImageGenerationProvider } from "../provider/ImgStudioImageGenerationProvider";
import { SmartKnowledgeRetriever } from "../retrieval/SmartKnowledgeRetriever";
import {
  MasterPromptCompilerInput,
  RouterInput,
  RoutingResultSchema,
  SimpleImageGenerationResultV1,
  SimpleInputRequestV1,
} from "../types";
import { SimpleInputValidatorV1 } from "../validation/SimpleInputValidatorV1";
import { KnowledgeRouterService } from "./KnowledgeRouterService";
import { SimpleInputAdapterService } from "./SimpleInputAdapterService";
import { LocalGeneratedImageStorage } from "../storage/LocalGeneratedImageStorage";

export class SimpleImageGenerationOrchestratorService {
  /**
   * One-click server-side orchestrator executing the complete TIDO Image Engine pipeline
   * for Simple Input V1 requests.
   * 
   * SimpleInputRequestV1 -> Router (Stage 2) -> Adapter -> Knowledge (Stage 3) -> Compiler (Stage 4B) -> Provider (Stage 5)
   * 
   * Strict pre-provider guards enforce 0 provider calls on any validation/budget/invariant failure.
   */
  public static async generateSimpleImage(
    request: SimpleInputRequestV1,
    options?: {
      routerService?: KnowledgeRouterService;
      generationProvider?: ImageGenerationProvider;
      compilerService?: MasterPromptCompilerService;
      mockRoutingResult?: RoutingResultSchema;
    }
  ): Promise<SimpleImageGenerationResultV1> {
    const totalStart = Date.now();
    const generationId = request.requestId || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let geminiCallCount = 0;
    let providerCallCount = 0;

    let routerDurationMs = 0;
    let adapterDurationMs = 0;
    let retrievalDurationMs = 0;
    let compilerDurationMs = 0;
    let providerDurationMs = 0;

    try {
      // 1. Validation Before Gemini Call
      console.log("[SIMPLE][01 VALIDATION] START");
      const validation = SimpleInputValidatorV1.validateRequest(request);
      if (!validation.isValid) {
        console.error("[SIMPLE][FAIL] stage=VALIDATION");
        console.error("[SIMPLE][ERROR]", {
          stage: "VALIDATION",
          code: "VALIDATION_FAILED",
          message: validation.errors.join("; "),
          status: "VALIDATION_FAILED",
        });
        return {
          success: false,
          generationId,
          status: "VALIDATION_FAILED",
          useCase: request.useCase || "Poster",
          aspectRatio: request.aspectRatio || "4:5",
          diagnostics: {
            routerDurationMs: 0,
            adapterDurationMs: 0,
            retrievalDurationMs: 0,
            compilerDurationMs: 0,
            providerDurationMs: 0,
            totalDurationMs: Date.now() - totalStart,
            promptChars: 0,
            referenceCount: (request.images || []).length,
            productCount: 0,
            logoCount: 0,
            supportReferenceCount: 0,
            geminiCallCount: 0,
            providerCallCount: 0,
          },
          error: {
            code: "VALIDATION_FAILED",
            message: validation.errors.join("; "),
          },
        };
      }
      console.log("[SIMPLE][01 VALIDATION] PASS");

      // 2. Stage 2 Gemini Pass (Exactly 1 Gemini call or mock override)
      console.log("[SIMPLE][02 ROUTER] START");
      let routingResult: RoutingResultSchema;
      const routerStart = Date.now();

      if (options?.mockRoutingResult) {
        routingResult = options.mockRoutingResult;
        routerDurationMs = Date.now() - routerStart;
      } else {
        const routerService = options?.routerService || new KnowledgeRouterService();
        const routerInputImages = (request.images || []).map((img, i) => ({
          reference_id: img.reference_id || `REF_${String(i + 1).padStart(2, "0")}`,
          buffer: img.buffer || Buffer.from(""),
          mimeType: img.mimeType || "image/png",
          filename: img.filename || `ref_${i + 1}.png`,
        }));

        const routerInput: RouterInput = {
          images: routerInputImages,
          concept: request.concept,
          useCase: request.useCase,
          aspectRatio: request.aspectRatio,
        };

        geminiCallCount = 1;
        const routerRes = await routerService.analyzeProductReferences(routerInput);
        routerDurationMs = Date.now() - routerStart;

        if (!routerRes.success || !routerRes.routing) {
          console.error("[SIMPLE][FAIL] stage=ROUTER");
          console.error("[SIMPLE][ERROR]", {
            stage: "ROUTER",
            code: routerRes.error?.code || "INTERPRETATION_FAILED",
            message: routerRes.error?.message || "Gemini multimodal concept interpretation failed.",
            status: "INTERPRETATION_FAILED",
            cause: routerRes.error?.details,
          });
          return {
            success: false,
            generationId,
            status: "INTERPRETATION_FAILED",
            useCase: request.useCase || "Poster",
            aspectRatio: request.aspectRatio || "4:5",
            diagnostics: {
              routerDurationMs,
              adapterDurationMs: 0,
              retrievalDurationMs: 0,
              compilerDurationMs: 0,
              providerDurationMs: 0,
              totalDurationMs: Date.now() - totalStart,
              promptChars: 0,
              referenceCount: routerInputImages.length,
              productCount: 0,
              logoCount: 0,
              supportReferenceCount: 0,
              geminiCallCount,
              providerCallCount: 0,
            },
            error: {
              code: routerRes.error?.code || "INTERPRETATION_FAILED",
              message: routerRes.error?.message || "Gemini multimodal concept interpretation failed.",
            },
          };
        }
        routingResult = routerRes.routing;
      }
      console.log("[SIMPLE][02 ROUTER] PASS");

      // 3. Adapter Pass
      console.log("[SIMPLE][03 ADAPTER] START");
      const adapterStart = Date.now();
      const adapted = SimpleInputAdapterService.adapt(request, routingResult);
      adapterDurationMs = Date.now() - adapterStart;

      if (!adapted.success || adapted.status === "INVALID_REQUEST") {
        console.error("[SIMPLE][FAIL] stage=ADAPTER");
        console.error("[SIMPLE][ERROR]", {
          stage: "ADAPTER",
          code: "INVALID_ADAPTER_PAYLOAD",
          message: adapted.error || "Simple Input Adapter failed.",
          status: "VALIDATION_FAILED",
        });
        return {
          success: false,
          generationId,
          status: "VALIDATION_FAILED",
          useCase: adapted.useCase || request.useCase || "Poster",
          aspectRatio: adapted.aspectRatio || request.aspectRatio || "4:5",
          diagnostics: {
            routerDurationMs,
            adapterDurationMs,
            retrievalDurationMs: 0,
            compilerDurationMs: 0,
            providerDurationMs: 0,
            totalDurationMs: Date.now() - totalStart,
            promptChars: 0,
            referenceCount: (request.images || []).length,
            productCount: adapted.resolvedProductCount,
            logoCount: adapted.brandAssets.length,
            supportReferenceCount: adapted.supportReferences.length,
            geminiCallCount,
            providerCallCount: 0,
          },
          error: {
            code: "INVALID_ADAPTER_PAYLOAD",
            message: adapted.error || "Simple Input Adapter failed.",
          },
        };
      }

      if (adapted.status === "NO_PRODUCT_REFERENCE" && adapted.resolvedProductCount === 0) {
        console.error("[SIMPLE][FAIL] stage=ADAPTER");
        console.error("[SIMPLE][ERROR]", {
          stage: "ADAPTER",
          code: "NO_PRODUCT_REFERENCE",
          message: "No product identity reference candidate was confirmed in the upload.",
          status: "NO_PRODUCT_REFERENCE",
        });
        return {
          success: false,
          generationId,
          status: "NO_PRODUCT_REFERENCE",
          useCase: adapted.useCase || "Poster",
          aspectRatio: adapted.aspectRatio || "4:5",
          diagnostics: {
            routerDurationMs,
            adapterDurationMs,
            retrievalDurationMs: 0,
            compilerDurationMs: 0,
            providerDurationMs: 0,
            totalDurationMs: Date.now() - totalStart,
            promptChars: 0,
            referenceCount: (request.images || []).length,
            productCount: 0,
            logoCount: adapted.brandAssets.length,
            supportReferenceCount: adapted.supportReferences.length,
            geminiCallCount,
            providerCallCount: 0,
          },
          error: {
            code: "NO_PRODUCT_REFERENCE",
            message: "No product identity reference candidate was confirmed in the upload.",
          },
        };
      }
      console.log("[SIMPLE][03 ADAPTER] PASS");

      // 4. Stage 3 Knowledge Retrieval Pass
      console.log("[SIMPLE][04 RETRIEVAL] START");
      const retrievalStart = Date.now();
      const retrievalRes = await SmartKnowledgeRetriever.retrieve(
        adapted.resolvedRoutingResult,
        adapted.productCandidates.map((p) => p.reference_id),
        null,
        {
          useCase: adapted.useCase,
          brief: adapted.compilerBrief,
          brandName: adapted.brandName,
          brandInfo: adapted.brandInfo,
          copyItems: adapted.copyItems,
          hardRequirements: adapted.hardRequirements,
        }
      );
      retrievalDurationMs = Date.now() - retrievalStart;

      if (!retrievalRes.package) {
        console.error("[SIMPLE][FAIL] stage=RETRIEVAL");
        console.error("[SIMPLE][ERROR]", {
          stage: "RETRIEVAL",
          code: "KNOWLEDGE_RETRIEVAL_FAILED",
          message: "Smart Knowledge Retrieval failed to produce a valid knowledge package.",
          status: "COMPILATION_FAILED",
          cause: retrievalRes.error?.message,
        });
        return {
          success: false,
          generationId,
          status: "COMPILATION_FAILED",
          useCase: adapted.useCase || "Poster",
          aspectRatio: adapted.aspectRatio || "4:5",
          diagnostics: {
            routerDurationMs,
            adapterDurationMs,
            retrievalDurationMs,
            compilerDurationMs: 0,
            providerDurationMs: 0,
            totalDurationMs: Date.now() - totalStart,
            promptChars: 0,
            referenceCount: (request.images || []).length,
            productCount: adapted.resolvedProductCount,
            logoCount: adapted.brandAssets.length,
            supportReferenceCount: adapted.supportReferences.length,
            geminiCallCount,
            providerCallCount: 0,
          },
          error: {
            code: "KNOWLEDGE_RETRIEVAL_FAILED",
            message: "Smart Knowledge Retrieval failed to produce a valid knowledge package.",
          },
        };
      }
      console.log("[SIMPLE][04 RETRIEVAL] PASS");

      // 5. Stage 4B Master Prompt Compiler Pass
      console.log("[SIMPLE][05 COMPILER] START");
      const compilerStart = Date.now();
      const compilerService = options?.compilerService || new MasterPromptCompilerService();

      const fullCompilerInput: MasterPromptCompilerInput = {
        ...(adapted.compilerInput as MasterPromptCompilerInput),
        routingResult: adapted.resolvedRoutingResult,
        knowledgePackage: retrievalRes.package,
      };

      const compilerRes = await compilerService.compile(fullCompilerInput);
      compilerDurationMs = Date.now() - compilerStart;

      if (!compilerRes.success || !compilerRes.package) {
        console.error("[SIMPLE][FAIL] stage=COMPILER");
        console.error("[SIMPLE][ERROR]", {
          stage: "COMPILER",
          code: compilerRes.error?.code || "COMPILATION_FAILED",
          message: compilerRes.error?.message || "Master Prompt Compiler failed.",
          status: "COMPILATION_FAILED",
        });
        return {
          success: false,
          generationId,
          status: "COMPILATION_FAILED",
          useCase: adapted.useCase || "Poster",
          aspectRatio: adapted.aspectRatio || "4:5",
          diagnostics: {
            routerDurationMs,
            adapterDurationMs,
            retrievalDurationMs,
            compilerDurationMs,
            providerDurationMs: 0,
            totalDurationMs: Date.now() - totalStart,
            promptChars: 0,
            referenceCount: (request.images || []).length,
            productCount: adapted.resolvedProductCount,
            logoCount: adapted.brandAssets.length,
            supportReferenceCount: adapted.supportReferences.length,
            geminiCallCount,
            providerCallCount: 0,
          },
          error: {
            code: compilerRes.error?.code || "COMPILATION_FAILED",
            message: compilerRes.error?.message || "Master Prompt Compiler failed.",
          },
        };
      }
      console.log("[SIMPLE][05 COMPILER] PASS");

      const masterPrompt = compilerRes.package.compiled_prompt;

      // 6. Pre-Provider Validation Guards
      // Guard A: Exact Copy Integrity Check
      if (compilerRes.package.compiler_warnings?.includes("EXACT_COPY_MISSING_PRODUCT_NAME" as any)) {
        console.error("[SIMPLE][FAIL] stage=PRE_PROVIDER_GUARD");
        console.error("[SIMPLE][ERROR]", {
          stage: "PRE_PROVIDER_GUARD",
          code: "EXACT_COPY_FAILED",
          message: "Exact copy integrity verification failed.",
          status: "EXACT_COPY_FAILED",
          promptChars: masterPrompt.length,
        });
        return {
          success: false,
          generationId,
          status: "EXACT_COPY_FAILED",
          useCase: adapted.useCase || "Poster",
          aspectRatio: adapted.aspectRatio || "4:5",
          diagnostics: {
            routerDurationMs,
            adapterDurationMs,
            retrievalDurationMs,
            compilerDurationMs,
            providerDurationMs: 0,
            totalDurationMs: Date.now() - totalStart,
            promptChars: masterPrompt.length,
            referenceCount: (request.images || []).length,
            productCount: adapted.resolvedProductCount,
            logoCount: adapted.brandAssets.length,
            supportReferenceCount: adapted.supportReferences.length,
            geminiCallCount,
            providerCallCount: 0,
          },
          error: {
            code: "EXACT_COPY_FAILED",
            message: "Exact copy integrity verification failed.",
          },
        };
      }

      // Guard B: Prompt Budget Hard Limit Check
      const budgetRes = PromptBudgetValidator.validate(masterPrompt, {
        userBrief: adapted.compilerBrief,
        userHardConstraints: adapted.hardRequirements,
        brandInfo: adapted.brandInfo,
        copyItems: adapted.copyItems,
      });

      if (budgetRes.is_blocked || masterPrompt.length > budgetRes.provider_hard_limit) {
        console.error("[SIMPLE][FAIL] stage=PRE_PROVIDER_GUARD");
        console.error("[SIMPLE][ERROR]", {
          stage: "PRE_PROVIDER_GUARD",
          code: "PROMPT_BUDGET_EXCEEDED",
          message: `Compiled prompt length (${masterPrompt.length} chars) exceeds hard ceiling (${budgetRes.provider_hard_limit} chars). Provider call blocked for cost & stability safety.`,
          status: "PROMPT_BUDGET_EXCEEDED",
          promptChars: masterPrompt.length,
        });
        return {
          success: false,
          generationId,
          status: "PROMPT_BUDGET_EXCEEDED",
          useCase: adapted.useCase || "Poster",
          aspectRatio: adapted.aspectRatio || "4:5",
          diagnostics: {
            routerDurationMs,
            adapterDurationMs,
            retrievalDurationMs,
            compilerDurationMs,
            providerDurationMs: 0,
            totalDurationMs: Date.now() - totalStart,
            promptChars: masterPrompt.length,
            referenceCount: (request.images || []).length,
            productCount: adapted.resolvedProductCount,
            logoCount: adapted.brandAssets.length,
            supportReferenceCount: adapted.supportReferences.length,
            geminiCallCount,
            providerCallCount: 0,
          },
          error: {
            code: "PROMPT_BUDGET_EXCEEDED",
            message: `Compiled prompt length (${masterPrompt.length} chars) exceeds hard ceiling (${budgetRes.provider_hard_limit} chars). Provider call blocked for cost & stability safety.`,
          },
        };
      }

      // Guard C: Materialize Provider References & Verify Attachment-Order Invariant
      const requestImagesMap = new Map<string, { buffer?: Buffer; mimeType?: string; filename?: string }>();
      (request.images || []).forEach((img, i) => {
        const refId = img.reference_id || `REF_${String(i + 1).padStart(2, "0")}`;
        requestImagesMap.set(refId, img);
      });

      const providerReferences: ProviderReferenceImage[] = [];
      for (const genRef of adapted.generationReferences) {
        const sourceImg = requestImagesMap.get(genRef.reference_id);
        providerReferences.push({
          reference_id: genRef.reference_id,
          product_id: genRef.product_id,
          role: genRef.role as any,
          mimeType: genRef.mimeType || sourceImg?.mimeType || "image/png",
          buffer: genRef.buffer || sourceImg?.buffer || Buffer.from(""),
          filename: genRef.filename || sourceImg?.filename || `${genRef.reference_id}.png`,
        });
      }

      // Attachment-Order Invariant Check: Compare generationReferences vs providerReferences sequence
      let orderMismatch = false;
      if (adapted.generationReferences.length !== providerReferences.length) {
        orderMismatch = true;
      } else {
        for (let i = 0; i < adapted.generationReferences.length; i++) {
          if (adapted.generationReferences[i].reference_id !== providerReferences[i].reference_id) {
            orderMismatch = true;
            break;
          }
        }
      }

      if (orderMismatch) {
        console.error("[SIMPLE][FAIL] stage=PRE_PROVIDER_GUARD");
        console.error("[SIMPLE][ERROR]", {
          stage: "PRE_PROVIDER_GUARD",
          code: "REFERENCE_ORDER_MISMATCH",
          message: "Pre-provider invariant failed: Generation reference attachment sequence does not match provider upload order.",
          status: "REFERENCE_ORDER_MISMATCH",
        });
        return {
          success: false,
          generationId,
          status: "REFERENCE_ORDER_MISMATCH",
          useCase: adapted.useCase || "Poster",
          aspectRatio: adapted.aspectRatio || "4:5",
          diagnostics: {
            routerDurationMs,
            adapterDurationMs,
            retrievalDurationMs,
            compilerDurationMs,
            providerDurationMs: 0,
            totalDurationMs: Date.now() - totalStart,
            promptChars: masterPrompt.length,
            referenceCount: (request.images || []).length,
            productCount: adapted.resolvedProductCount,
            logoCount: adapted.brandAssets.length,
            supportReferenceCount: adapted.supportReferences.length,
            geminiCallCount,
            providerCallCount: 0,
          },
          error: {
            code: "REFERENCE_ORDER_MISMATCH",
            message: "Pre-provider invariant failed: Generation reference attachment sequence does not match provider upload order.",
          },
        };
      }

      // 7. Stage 5 Provider Generation Pass (Exactly 1 provider call made)
      console.log("[SIMPLE][06 PROVIDER] START");
      const providerStart = Date.now();
      const generationProvider = options?.generationProvider || new ImgStudioImageGenerationProvider();

      const providerInput: ProviderImageGenerationInput = {
        model: "flow-nano-banana-2",
        prompt: masterPrompt,
        references: providerReferences,
        aspectRatio: adapted.aspectRatio || "4:5",
        imageSize: "1K",
        mimeType: "image/png",
        generationId,
        idempotencyKey: request.requestId || `idemp_${generationId}`,
      };

      console.log("[SIMPLE RATIO][ORCHESTRATOR]", {
        aspectRatio: providerInput.aspectRatio,
        length: providerInput.aspectRatio ? providerInput.aspectRatio.length : 0,
        charCodes: providerInput.aspectRatio ? [...providerInput.aspectRatio].map((c) => c.charCodeAt(0)) : [],
      });

      providerCallCount = 1;
      console.log("[SIMPLE][06 PROVIDER] INPUT", {
        aspectRatio: providerInput.aspectRatio,
        referenceCount: providerInput.references.length,
        promptChars: providerInput.prompt.length,
      });
      const providerRes = await generationProvider.generateImage(providerInput);
      providerDurationMs = Date.now() - providerStart;

      if (!providerRes.success) {
        let status: SimpleImageGenerationResultV1["status"] = "GENERATION_FAILED";
        if (providerRes.error?.code === "PROVIDER_TIMEOUT") {
          status = "PROVIDER_TIMEOUT";
        } else if (providerRes.error?.code === "UNSUPPORTED_ASPECT_RATIO") {
          status = "UNSUPPORTED_ASPECT_RATIO";
        } else if (providerRes.error?.code === "PROVIDER_UPSTREAM_ERROR" || providerRes.error?.code === "PROVIDER_RATE_LIMIT") {
          status = "PROVIDER_UPSTREAM_ERROR";
        }

        console.error("[SIMPLE][FAIL] stage=PROVIDER");
        console.error("[SIMPLE][ERROR]", {
          stage: "PROVIDER",
          code: providerRes.error?.code || "GENERATION_FAILED",
          message: providerRes.error?.message || "Generation provider request failed.",
          status,
          cause: providerRes.error?.details,
        });

        return {
          success: false,
          generationId,
          status,
          useCase: adapted.useCase || "Poster",
          aspectRatio: adapted.aspectRatio || "1:1",
          error: {
            code: providerRes.error?.code || status,
            message: providerRes.error?.message || "Generation provider request failed.",
          },
          diagnostics: {
            routerDurationMs,
            adapterDurationMs,
            retrievalDurationMs,
            compilerDurationMs,
            providerDurationMs,
            totalDurationMs: Date.now() - totalStart,
            promptChars: masterPrompt.length,
            referenceCount: providerReferences.length,
            productCount: adapted.resolvedProductCount,
            logoCount: adapted.brandAssets.length,
            supportReferenceCount: adapted.supportReferences.length,
            geminiCallCount,
            providerCallCount,
          },
        };
      }

      let resolvedImageUrl = providerRes.imageUrl || providerRes.remoteDetails?.url;

      if (providerRes.imageBuffer) {
        try {
          const localStorage = new LocalGeneratedImageStorage();
          const savedAsset = await localStorage.saveAsset({
            generation_id: generationId,
            imageBuffer: providerRes.imageBuffer,
            mimeType: providerRes.mimeType || "image/png",
            masterPrompt,
            metadata: {
              generation_id: generationId,
              provider: providerRes.remoteDetails?.provider_name || "imgstudio",
              model: providerRes.remoteDetails?.model || "flow-nano-banana-2",
              aspect_ratio: adapted.aspectRatio || "1:1",
              remote_details: providerRes.remoteDetails,
            },
          });
          resolvedImageUrl = savedAsset.url;
        } catch (storageErr: any) {
          console.warn("[SIMPLE][STORAGE WARN] Failed to save asset locally:", storageErr?.message || storageErr);
        }
      }

      console.log("[SIMPLE][06 PROVIDER] PASS", {
        hasImageUrl: Boolean(resolvedImageUrl),
        imageUrl: resolvedImageUrl,
        resultKeys: Object.keys(providerRes ?? {}),
        imageUrlType: typeof resolvedImageUrl,
      });

      return {
        success: true,
        generationId,
        status: "COMPLETED",
        imageUrl: resolvedImageUrl,
        imageBuffer: providerRes.imageBuffer,
        useCase: adapted.useCase || "Poster",
        aspectRatio: adapted.aspectRatio || "1:1",
        diagnostics: {
          routerDurationMs,
          adapterDurationMs,
          retrievalDurationMs,
          compilerDurationMs,
          providerDurationMs,
          totalDurationMs: Date.now() - totalStart,
          promptChars: masterPrompt.length,
          referenceCount: providerReferences.length,
          productCount: adapted.resolvedProductCount,
          logoCount: adapted.brandAssets.length,
          supportReferenceCount: adapted.supportReferences.length,
          geminiCallCount,
          providerCallCount,
        },
      };
    } catch (err: any) {
      console.error("[SIMPLE][FAIL] stage=UNHANDLED_EXCEPTION");
      console.error("[SIMPLE][ERROR]", {
        stage: "UNHANDLED_EXCEPTION",
        code: "UNHANDLED_EXCEPTION",
        message: err.message || String(err),
        name: err.name,
        stack: err.stack,
      });
      throw err;
    }
  }
}
