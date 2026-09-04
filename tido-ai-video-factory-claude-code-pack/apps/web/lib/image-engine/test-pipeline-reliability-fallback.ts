import { KnowledgeRouterService } from "./service/KnowledgeRouterService";
import { MarketingBrainService } from "./llm/marketing-brain.service";
import { SimpleImageGenerationOrchestratorService } from "./service/SimpleImageGenerationOrchestratorService";
import { SimpleInputRequestV1 } from "./types";

async function runReliabilityTests() {
  console.log("==================================================");
  console.log("TIDO PICTURE ENGINE — PIPELINE RELIABILITY AUDIT & VERIFICATION");
  console.log("==================================================\n");

  // ----------------------------------------------------
  // TEST 1: KnowledgeRouterService Non-Blocking Fallback Test
  // ----------------------------------------------------
  console.log("1. Testing KnowledgeRouterService Graceful Fallback...");

  const mockRouterInput = {
    images: [],
    concept: "SKIN1004 Centella Ampoule soothing skincare serum",
    useCase: "poster",
    aspectRatio: "9:16",
    brandName: "SKIN1004",
  };

  const routerService = new KnowledgeRouterService();
  const routerResult = await routerService.analyzeProductReferences(mockRouterInput);

  console.log("   -> KnowledgeRouter Result Success:", routerResult.success);
  console.log("   -> Retrieval Status:", routerResult.routing?.retrieval_status);
  console.log("   -> Error Reason:", routerResult.routing?.error_reason);
  console.log("   -> Knowledge Cards:", routerResult.routing?.knowledge_cards);

  if (!routerResult.success || !routerResult.routing) {
    throw new Error("FAIL: KnowledgeRouterService did not return routing result!");
  }

  if (routerResult.routing.retrieval_status !== "fallback") {
    console.warn("   [NOTE] Router returned active routing. (If Gemini key is active)");
  } else {
    console.log("   ✓ Non-blocking fallback routing confirmed.");
  }

  // ----------------------------------------------------
  // TEST 2: MarketingBrainService Fallback Audit
  // ----------------------------------------------------
  console.log("\n2. Testing MarketingBrainService Fallback Strategy...");
  const marketingBrain = new MarketingBrainService();

  const fallbackStrategy = marketingBrain.createFallbackStrategy({
    concept: "SKIN1004 Centella soothing serum",
    useCase: "product_hero",
    brandName: "SKIN1004",
  });

  console.log("   -> Creative Angle:", fallbackStrategy.creative_angle);
  console.log("   -> Visual Strategy:", fallbackStrategy.visual_strategy);
  console.log("   -> Prompt Guidance:", fallbackStrategy.prompt_guidance);

  if (fallbackStrategy.creative_angle.includes("TIDO Premium Tea") || fallbackStrategy.creative_angle.includes("TIDO Brand")) {
    throw new Error("FAIL: MarketingBrain fallback contains stale TIDO Tea / Brand hardcoded string!");
  }
  console.log("   ✓ Fallback strategy dynamically formatted without stale hardcoded defaults.");

  // ----------------------------------------------------
  // TEST 3: Full Orchestrator End-to-End Fallback Pipeline Execution
  // ----------------------------------------------------
  console.log("\n3. Testing SimpleImageGenerationOrchestrator End-to-End Execution with Fallbacks...");

  // Mock a 1x1 100-byte PNG image buffer for SKIN1004 product reference
  const dummyBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  const request: SimpleInputRequestV1 = {
    concept: "SKIN1004 Centella Ampoule soothing skincare serum on natural moss and wet stone",
    useCase: "poster",
    aspectRatio: "9:16",
    brandName: "SKIN1004",
    images: [
      {
        reference_id: "REF_01",
        buffer: dummyBuffer,
        mimeType: "image/png",
        filename: "skin1004_ampoule.png",
      },
    ],
  };

  const mockProvider = {
    generateImage: async () => ({
      success: true,
      imageUrl: "https://example.com/generated_skin1004.png",
      remoteDetails: { provider_name: "mock-provider", model: "mock-model" },
    }),
  };

  const startTime = Date.now();
  const orchestratorResult = await SimpleImageGenerationOrchestratorService.generateSimpleImage(request, {
    generationProvider: mockProvider as any,
  });
  const elapsed = Date.now() - startTime;

  console.log(`   -> Generation Finished in ${elapsed}ms`);
  console.log("   -> Success:", orchestratorResult.success);
  console.log("   -> Status:", orchestratorResult.status);
  console.log("   -> Master Prompt Length:", orchestratorResult.strategy?.compiled_prompt.length || 0);

  if (!orchestratorResult.success) {
    console.error("   -> Generation Error:", orchestratorResult.error);
    throw new Error(`FAIL: Orchestrator failed with status ${orchestratorResult.status}: ${orchestratorResult.error?.message}`);
  }

  const prompt = orchestratorResult.strategy?.compiled_prompt || "";
  console.log("\n--- COMPILED MASTER PROMPT PREVIEW ---");
  console.log(prompt.substring(0, 400) + "...\n");

  if (prompt.includes("TIDO Premium Tea")) {
    throw new Error("FAIL: Compiled prompt contains stale 'TIDO Premium Tea' hallucination!");
  }

  console.log("==================================================");
  console.log("ALL PIPELINE RELIABILITY & FALLBACK TESTS PASSED!");
  console.log("==================================================");
}

runReliabilityTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
