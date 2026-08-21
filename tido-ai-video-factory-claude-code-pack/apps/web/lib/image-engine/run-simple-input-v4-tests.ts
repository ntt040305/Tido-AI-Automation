import {
  ImageGenerationProvider,
  ProviderImageGenerationInput,
  ProviderImageGenerationOutput,
} from "./provider/ImageGenerationProvider";
import { SimpleImageGenerationOrchestratorService } from "./service/SimpleImageGenerationOrchestratorService";
import {
  RoutingResultSchema,
  SimpleInputRequestV1,
  StructuredInputIntentV1,
} from "./types";

class MockImageGenerationProvider implements ImageGenerationProvider {
  public callCount = 0;
  public lastInput?: ProviderImageGenerationInput;
  public shouldFail = false;
  public shouldTimeout = false;

  async generateImage(input: ProviderImageGenerationInput): Promise<ProviderImageGenerationOutput> {
    this.callCount++;
    this.lastInput = input;

    if (this.shouldTimeout) {
      return {
        success: false,
        error: {
          code: "PROVIDER_TIMEOUT",
          message: "Mock provider timeout after 90s.",
        },
      };
    }

    if (this.shouldFail) {
      return {
        success: false,
        error: {
          code: "PROVIDER_UPSTREAM_ERROR",
          message: "Mock provider upstream error (500).",
        },
      };
    }

    return {
      success: true,
      imageUrl: "https://mock.imgstudio.site/output/gen_mock_123.png",
      imageBuffer: Buffer.from("mock-png-data"),
    };
  }
}

async function runSimpleInputV4Tests() {
  console.log("=========================================================");
  console.log("🚀 STARTING TIDO SIMPLE INPUT V1 — PHASE 4 TEST SUITE");
  console.log("=========================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(` ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(` ❌ FAIL: ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  function createFixtureRouting(
    products: RoutingResultSchema["products"],
    intent: StructuredInputIntentV1
  ): RoutingResultSchema {
    return {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: true,
      routing_summary: "Test routing result",
      global_retrieval_queries: [
        { query: "Beverage packaging", importance: "PRIMARY", reason: "Standard knowledge" } as any,
      ],
      products,
      structured_input_intent: intent,
      asset_roles: intent.asset_roles,
    };
  }

  // ── TEST 34: Two Products + Logo ──────────────────────────────────
  const mockProvider34 = new MockImageGenerationProvider();
  const req34: SimpleInputRequestV1 = {
    concept: "Poster fantasy mùa hè, hai sản phẩm bay giữa mây, title 'HÈ BAY LÊN'",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }, { reference_id: "REF_03" }],
  };

  const intent34: StructuredInputIntentV1 = {
    core_creative_intent: req34.concept,
    global_visual_language: "fantasy",
    extracted_copy_items: [{ role: "HEADLINE", text: "HÈ BAY LÊN", confidence: 0.99 }],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "BALANCED",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_03", role: "LOGO", confidence: 0.99 },
    ],
  };

  const routing34 = createFixtureRouting([
    { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "P1", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
    { product_id: "PRODUCT_02", reference_ids: ["REF_02"], reference_relationship_confidence: 1.0, summary: "P2", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
  ], intent34);

  const res34 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req34, {
    generationProvider: mockProvider34,
    mockRoutingResult: routing34,
  });

  assert(res34.success === true, "Test 34: Orchestration completed successfully");
  assert(res34.diagnostics?.productCount === 2, "Test 34: productCount === 2");
  assert(mockProvider34.callCount === 1, "Test 34: Exactly 1 provider call executed");
  assert(mockProvider34.lastInput?.references.length === 3, "Test 34: Provider received 3 references");
  assert(mockProvider34.lastInput?.references[2].role === "LOGO", "Test 34: Provider reference 3 has role LOGO");
  assert(mockProvider34.lastInput?.references[2].product_id === undefined, "Test 34: Provider reference 3 has NO product_id");

  // ── TEST 35: Product + Support Reference ──────────────────────────
  const mockProvider35 = new MockImageGenerationProvider();
  const req35: SimpleInputRequestV1 = {
    concept: "Poster lon soda mát lạnh theo mood tham khảo",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }],
  };

  const intent35: StructuredInputIntentV1 = {
    core_creative_intent: req35.concept,
    global_visual_language: "commercial",
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "BALANCED",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "SUPPORT_REFERENCE", confidence: 0.90 },
    ],
  };

  const routing35 = createFixtureRouting([
    { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "P1", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
  ], intent35);

  const res35 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req35, {
    generationProvider: mockProvider35,
    mockRoutingResult: routing35,
  });

  assert(res35.success === true, "Test 35: Completed successfully");
  assert(res35.diagnostics?.productCount === 1, "Test 35: productCount === 1");
  assert(mockProvider35.callCount === 1, "Test 35: Exactly 1 provider call");
  assert(mockProvider35.lastInput?.references[1].role === "SUPPORT_REFERENCE", "Test 35: Reference 2 is SUPPORT_REFERENCE");

  // ── TEST 36: Product + Ambiguous Reference ───────────────────────
  const mockProvider36 = new MockImageGenerationProvider();
  const req36: SimpleInputRequestV1 = {
    concept: "Poster chai nước và hình mờ",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }],
  };

  const intent36: StructuredInputIntentV1 = {
    core_creative_intent: req36.concept,
    global_visual_language: "commercial",
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "BALANCED",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "AMBIGUOUS", confidence: 0.40 },
    ],
  };

  const routing36 = createFixtureRouting([
    { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "P1", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
  ], intent36);

  const res36 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req36, {
    generationProvider: mockProvider36,
    mockRoutingResult: routing36,
  });

  assert(res36.success === true, "Test 36: Completed successfully");
  assert(res36.diagnostics?.productCount === 1, "Test 36: productCount === 1");
  assert(mockProvider36.lastInput?.references.length === 1, "Test 36: Only REF_01 sent to provider (AMBIGUOUS excluded)");

  // ── TEST 37: Product Multiview + Logo ─────────────────────────────
  const mockProvider37 = new MockImageGenerationProvider();
  const req37: SimpleInputRequestV1 = {
    concept: "Poster chai nước hoa 2 góc chụp và logo",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }, { reference_id: "REF_03" }],
  };

  const intent37: StructuredInputIntentV1 = {
    core_creative_intent: req37.concept,
    global_visual_language: "commercial",
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "BALANCED",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_03", role: "LOGO", confidence: 0.99 },
    ],
  };

  const res37 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req37, {
    generationProvider: mockProvider37,
    mockRoutingResult: createFixtureRouting([
      { product_id: "PRODUCT_01", reference_ids: ["REF_01", "REF_02"], reference_relationship_confidence: 0.95, summary: "P1 multiview", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
    ], intent37),
  });

  assert(res37.success === true, "Test 37: Completed successfully");
  assert(res37.diagnostics?.productCount === 1, "Test 37: productCount === 1");
  assert(mockProvider37.lastInput?.references[0].product_id === "PRODUCT_01", "Test 37: REF_01 bound to PRODUCT_01");
  assert(mockProvider37.lastInput?.references[1].product_id === "PRODUCT_01", "Test 37: REF_02 bound to PRODUCT_01");
  assert(mockProvider37.lastInput?.references[2].role === "LOGO", "Test 37: REF_03 is LOGO");

  // ── TEST 38: Invalid Concept Validation Failure ───────────────────
  const mockProvider38 = new MockImageGenerationProvider();
  const req38: SimpleInputRequestV1 = {
    concept: "A".repeat(1050),
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }],
  };

  const res38 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req38, {
    generationProvider: mockProvider38,
  });

  assert(res38.success === false, "Test 38: Request correctly rejected");
  assert(res38.status === "VALIDATION_FAILED", "Test 38: Status is VALIDATION_FAILED");
  assert(res38.diagnostics?.geminiCallCount === 0, "Test 38: 0 Gemini calls executed");
  assert(res38.diagnostics?.providerCallCount === 0, "Test 38: 0 Provider calls executed");
  assert(mockProvider38.callCount === 0, "Test 38: Mock provider NEVER called");

  // ── TEST 39: Prompt Over Budget Block ────────────────────────────
  const mockProvider39 = new MockImageGenerationProvider();
  const req39: SimpleInputRequestV1 = {
    concept: "Valid short concept",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }],
  };

  const mockOverbudgetCompiler: any = {
    compile: async () => ({
      success: true,
      package: {
        compiled_prompt: "PROMPT_OVER_CEILING ".repeat(1500),
      },
    }),
  };

  const res39 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req39, {
    generationProvider: mockProvider39,
    compilerService: mockOverbudgetCompiler,
    mockRoutingResult: createFixtureRouting([
      { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "P1", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
    ], {
      core_creative_intent: req39.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    }),
  });

  assert(res39.success === false, "Test 39: Over-budget generation blocked");
  assert(res39.status === "PROMPT_BUDGET_EXCEEDED", "Test 39: Status is PROMPT_BUDGET_EXCEEDED");
  assert(res39.diagnostics?.providerCallCount === 0, "Test 39: Provider call count = 0");
  assert(mockProvider39.callCount === 0, "Test 39: Mock provider NEVER called");

  // ── TEST 40: Router Failure ──────────────────────────────────────
  const mockProvider40 = new MockImageGenerationProvider();
  const failingRouterService: any = {
    analyzeProductReferences: async () => ({
      success: false,
      error: { code: "ROUTER_API_ERROR", message: "Gemini router network error." },
    }),
  };

  const req40: SimpleInputRequestV1 = {
    concept: "Valid concept",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }],
  };

  const res40 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req40, {
    generationProvider: mockProvider40,
    routerService: failingRouterService,
  });

  assert(res40.success === false, "Test 40: Router failure handled");
  assert(res40.status === "INTERPRETATION_FAILED", "Test 40: Status is INTERPRETATION_FAILED");
  assert(res40.diagnostics?.geminiCallCount === 1, "Test 40: 1 Gemini call recorded");
  assert(res40.diagnostics?.providerCallCount === 0, "Test 40: 0 Provider calls executed");

  // ── TEST 41: Provider Upstream Failure (No Retry) ────────────────
  const mockProvider41 = new MockImageGenerationProvider();
  mockProvider41.shouldFail = true;

  const req41: SimpleInputRequestV1 = {
    concept: "Valid concept for failure test",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }],
  };

  const res41 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req41, {
    generationProvider: mockProvider41,
    mockRoutingResult: createFixtureRouting([
      { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "P1", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
    ], {
      core_creative_intent: req41.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    }),
  });

  assert(res41.success === false, "Test 41: Failed cleanly");
  assert(res41.status === "PROVIDER_UPSTREAM_ERROR", "Test 41: Status is PROVIDER_UPSTREAM_ERROR");
  assert(mockProvider41.callCount === 1, "Test 41: Exactly 1 provider call (NO automatic retry)");

  // ── TEST 42: Provider Timeout (No Retry) ─────────────────────────
  const mockProvider42 = new MockImageGenerationProvider();
  mockProvider42.shouldTimeout = true;

  const res42 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req41, {
    generationProvider: mockProvider42,
    mockRoutingResult: createFixtureRouting([
      { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "P1", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
    ], {
      core_creative_intent: req41.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    }),
  });

  assert(res42.success === false, "Test 42: Timed out cleanly");
  assert(res42.status === "PROVIDER_TIMEOUT", "Test 42: Status is PROVIDER_TIMEOUT");
  assert(mockProvider42.callCount === 1, "Test 42: Exactly 1 provider call (NO automatic retry on timeout)");

  // ── TEST 43: Poster V2.1 Knowledge Routing Test ──────────────────
  const mockProvider43 = new MockImageGenerationProvider();
  const req43: SimpleInputRequestV1 = {
    concept: "Poster fantasy mùa hè cho hai ly bay giữa mây",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }],
  };

  const res43 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req43, {
    generationProvider: mockProvider43,
    mockRoutingResult: createFixtureRouting([
      { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "P1", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
    ], {
      core_creative_intent: req43.concept,
      global_visual_language: "fantasy",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    }),
  });

  assert(res43.success === true, "Test 43: Poster V2.1 concept completed successfully");
  assert(mockProvider43.callCount === 1, "Test 43: Provider call count = 1");

  console.log("\n=========================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 4 TESTS PASSED SUCCESSFULLY!`);
  console.log("=========================================================\n");
}

runSimpleInputV4Tests().catch((err) => {
  console.error("❌ PHASE 4 TEST SUITE FAILED:", err);
  process.exit(1);
});
