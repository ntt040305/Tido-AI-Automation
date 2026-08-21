import fs from "fs";
import path from "path";
import crypto from "crypto";
import { IMAGE_ENGINE_CONFIG } from "./config";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { GeminiImageGenerationProvider } from "./provider/GeminiImageGenerationProvider";
import { ImageGenerationProvider, ProviderImageGenerationInput, ProviderImageGenerationOutput } from "./provider/ImageGenerationProvider";
import { ImageGenerationService } from "./service/ImageGenerationService";
import { LocalGeneratedImageStorage } from "./storage/LocalGeneratedImageStorage";
import {
  CompiledGenerationPackageV1,
  KnowledgePackageV1,
  MasterPromptCompilerInput,
  RoutingResultSchema,
} from "./types";

/**
 * Mock Provider for deterministic local unit tests (No API key required)
 */
class MockImageGenerationProvider implements ImageGenerationProvider {
  public shouldFail: boolean = false;
  public failureCode: any = "GENERATION_FAILED";

  async generateImage(input: ProviderImageGenerationInput): Promise<ProviderImageGenerationOutput> {
    if (this.shouldFail) {
      return {
        success: false,
        error: {
          code: this.failureCode,
          message: "Mock provider simulated failure",
        },
      };
    }

    // 1x1 PNG dummy image buffer
    const dummyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const imageBuffer = Buffer.from(dummyPngBase64, "base64");

    return {
      success: true,
      imageBuffer,
      mimeType: "image/png",
    };
  }
}

async function runStage5Tests() {
  console.log("==================================================");
  console.log("TIDO IMAGE ENGINE — STAGE 5 INTEGRATION REGRESSION TESTS");
  console.log("==================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  }

  // Setup temp directory for storage testing
  const testStorageDir = path.resolve(process.cwd(), "data/generated/test_stage5_renders");
  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true });
  }

  // Setup Mock Data
  const sampleRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 1.0,
        summary: "Product test summary",
        categories: [],
        industry_domains: [],
        likely_functions: [],
        materials: [{ value: "Glass", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Glass bottle observed" }],
        contents: [],
        surface_properties: [],
        geometry_traits: [],
        packaging_types: [],
        branding_features: [],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
    routing_summary: "Single product glass bottle visual",
  };

  const sampleKnowledgePackage: KnowledgePackageV1 = {
    package_version: "1.0",
    routing_version: "1.0",
    retrieval_mode: "HYBRID",
    requires_universal_core: true,
    universal_blocks: [
      {
        id: "universal.commercial_visual_hierarchy",
        version: "1.0.1",
        title: "Commercial Visual Hierarchy",
        knowledge_type: "UNIVERSAL",
        selection_tier: "UNIVERSAL",
        matched_signals: [],
        estimated_tokens: 150,
        scores: { metadata: 1.0, semantic: 1.0, signal_confidence: 1.0, information_value: 1.0, priority: 1.0, query_importance: 1.0, redundancy_penalty: 0 },
        final_score: 1.0,
        selection_reasons: ["Universal core block"],
      },
    ],
    selected_blocks: [],
    rejected_candidates: [],
    warnings: [],
    stats: {
      repository_blocks: 10,
      metadata_candidates: 5,
      semantic_candidates: 2,
      fused_candidates: 6,
      selected_blocks: 1,
      estimated_tokens: 150,
      duration_ms: 5,
    },
  };

  const compiler = new MasterPromptCompilerService();
  const compilerInput: MasterPromptCompilerInput = {
    brief: "A summer refresh iced tea product shot in natural sunlight.",
    productCount: 1,
    brandName: "Summer Cool",
    brandInfo: "Premium artisan cold brew tea",
    copyItems: ["Headline: Refreshing Taste"],
    hardRequirements: ["Product bottle label must remain legible"],
    useCase: "Social Post",
    aspectRatio: "4:5",
    productReferences: [
      { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0 },
    ],
    routingResult: sampleRouting,
    knowledgePackage: sampleKnowledgePackage,
  };

  const compileRes = await compiler.compile(compilerInput);
  assert(compileRes.success && !!compileRes.package, "Compiler compiles Master Prompt and produces compiled_prompt_hash");

  const samplePackage = compileRes.package!;
  assert(typeof samplePackage.compiled_prompt_hash === "string" && samplePackage.compiled_prompt_hash.length > 0, "compiled_prompt_hash is non-empty string");

  const dummyImageBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

  // ----------------------------------------------------------------
  // TEST SECTION 1: STORAGE ABSTRACTION & SECURITY
  // ----------------------------------------------------------------
  console.log("\n--- Section 1: Local Storage Abstraction & Path Security ---");

  const localStorage = new LocalGeneratedImageStorage(testStorageDir);
  const genId = "test_gen_001";

  const saveRes = await localStorage.saveAsset({
    generation_id: genId,
    imageBuffer: dummyImageBuffer,
    mimeType: "image/png",
    masterPrompt: samplePackage.compiled_prompt,
    metadata: {
      generation_id: genId,
      GEMINI_API_KEY: "secret_api_key_should_not_be_saved",
      provider: { name: "mock-provider", model: "gemini-3.1-flash-image" },
    },
  });

  assert(saveRes.url === `/api/image/generated/${genId}`, "Storage returns valid asset URL route");
  assert(fs.existsSync(saveRes.assetPath), "Image file saved on local filesystem");

  const savedMeta = localStorage.getMetadata(genId);
  assert(savedMeta !== null && savedMeta.GEMINI_API_KEY === undefined, "Storage sanitizes sensitive metadata (no GEMINI_API_KEY)");

  const savedPrompt = localStorage.getMasterPrompt(genId);
  assert(savedPrompt === samplePackage.compiled_prompt, "Storage saves master_prompt.md snapshot correctly");

  const pathTraversalTest = localStorage.getAssetPath("../../../etc/passwd");
  assert(pathTraversalTest === null, "Storage rejects path traversal security attacks");

  // ----------------------------------------------------------------
  // TEST SECTION 2: PROVIDER ABSTRACTION VALIDATION
  // ----------------------------------------------------------------
  console.log("\n--- Section 2: Gemini Image Generation Provider Validation ---");

  const geminiProvider = new GeminiImageGenerationProvider();

  const invalidRatioRes = await geminiProvider.generateImage({
    model: "gemini-3.1-flash-image",
    prompt: "test",
    references: [],
    aspectRatio: "99:99",
    imageSize: "2K",
    mimeType: "image/png",
  });
  assert(!invalidRatioRes.success && invalidRatioRes.error?.code === "UNSUPPORTED_ASPECT_RATIO", "Provider rejects unsupported aspect ratio (99:99)");

  const tooManyRefs = Array.from({ length: 12 }, (_, i) => ({
    reference_id: `REF_${i + 1}`,
    product_id: "PRODUCT_01",
    mimeType: "image/png",
    buffer: dummyImageBuffer,
  }));

  const limitExceededRes = await geminiProvider.generateImage({
    model: "gemini-3.1-flash-image",
    prompt: "test",
    references: tooManyRefs,
    aspectRatio: "4:5",
    imageSize: "2K",
    mimeType: "image/png",
  });
  assert(!limitExceededRes.success && limitExceededRes.error?.code === "REFERENCE_LIMIT_EXCEEDED", "Provider rejects reference count > 10");

  // ----------------------------------------------------------------
  // TEST SECTION 3: IMAGE GENERATION SERVICE CORE FLOW
  // ----------------------------------------------------------------
  console.log("\n--- Section 3: Image Generation Service End-to-End ---");

  const mockProvider = new MockImageGenerationProvider();
  const service = new ImageGenerationService(mockProvider, localStorage, compiler);

  const genResult = await service.generateImage({
    requestId: "req_test_01",
    productReferences: [
      { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0, mimeType: "image/png", buffer: dummyImageBuffer },
    ],
    routingResult: sampleRouting,
    knowledgePackage: sampleKnowledgePackage,
    masterPromptPackage: samplePackage,
    compilerInput,
  });

  assert(genResult.status === "SUCCEEDED", "Service generates image successfully with status SUCCEEDED");
  assert(genResult.provider.model === IMAGE_ENGINE_CONFIG.TIDO_IMAGE_MODEL, "Result contract contains correct provider model");
  assert(Boolean(genResult.asset?.url && genResult.asset.url.startsWith("/api/image/generated/imggen_")), "Result asset contains valid generation route");
  assert(genResult.trace.compiled_prompt_hash === samplePackage.compiled_prompt_hash, "Trace metadata contains exact compiled_prompt_hash");
  assert(Boolean(genResult.trace.reference_hashes["REF_01"] !== undefined), "Trace metadata contains reference SHA-256 hash");

  // ----------------------------------------------------------------
  // TEST SECTION 4: SERVER-SIDE STALENESS VERIFICATION
  // ----------------------------------------------------------------
  console.log("\n--- Section 4: Server-Side Master Prompt Staleness Verification ---");

  // Modify compiler input brief slightly (simulating user changed brief without recompiling prompt)
  const staleCompilerInput: MasterPromptCompilerInput = {
    ...compilerInput,
    brief: "DIFFERENT BRIEF: Winter warm tea shot in studio lighting.",
  };

  const staleResult = await service.generateImage({
    requestId: "req_test_02",
    productReferences: [
      { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0, mimeType: "image/png", buffer: dummyImageBuffer },
    ],
    routingResult: sampleRouting,
    knowledgePackage: sampleKnowledgePackage,
    masterPromptPackage: samplePackage, // Old package
    compilerInput: staleCompilerInput, // Modified input
  });

  assert(staleResult.status === "FAILED" && staleResult.error?.code === "MASTER_PROMPT_STALE", "Service detects Master Prompt staleness when form input changes");

  // Cleanup test folder
  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true });
  }

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("==================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runStage5Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
