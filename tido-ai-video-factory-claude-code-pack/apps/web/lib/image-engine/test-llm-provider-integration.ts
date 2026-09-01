import { LLMProviderService } from "./llm/llm-provider.service";
import { MarketingBrainService } from "./llm/marketing-brain.service";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";
import { KnowledgePackageV1, RoutingResultSchema } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runLLMProviderIntegrationTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — LLM PROVIDER MIGRATION & STRATEGY AUDIT");
  console.log("========================================================================");

  // 1. Connection & Config Test
  console.log("\n[TEST 1] LLM Provider Connection & Configuration");
  const llmProvider = new LLMProviderService({
    baseUrl: process.env.LLM_BASE_URL || "http://127.0.0.1:8317/v1",
    apiKey: process.env.LLM_API_KEY || "marketing-test-key-2026",
    model: process.env.LLM_MODEL || "claude-sonnet-4-6",
  });

  assert(llmProvider.isConfigured() === true, "LLMProviderService configured successfully");
  assert(llmProvider.getModelName() === (process.env.LLM_MODEL || "claude-sonnet-4-6"), "Model matches environment setting");
  assert(llmProvider.getBaseUrl() === (process.env.LLM_BASE_URL || "http://127.0.0.1:8317/v1"), "Base URL matches environment setting");

  // 2. MarketingBrainService Strategy Generation Test
  console.log("\n[TEST 2] Marketing Brain Strategy Generation");
  const brain = new MarketingBrainService(llmProvider);

  const mockRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Premium Energy Beverage Commercial",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_CAN"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Energy Slim Can",
        categories: [{ value: "beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "f_and_b", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "energy", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Brushed Aluminum", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Energy Drink", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Metallic Finish", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Slim Can Contour", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Aluminum Can", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "TIDO Energy Branding", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01_CAN", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_02_LOGO", role: "LOGO", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const refIntel = new ReferenceIntelligenceService();
  const manifest = refIntel.generateManifest(mockRoutingResult, 1);
  mockRoutingResult.reference_manifest = manifest;

  const strategy = await brain.generateStrategy({
    concept: "Cold refreshing splash explosion for TIDO Energy",
    useCase: "Poster",
    aspectRatio: "9:16",
    brandName: "TIDO Energy",
    brandInfo: "Premium high-performance energy drink",
    targetAudience: "Active professionals and athletes",
    marketingGoal: "Conversion",
    productManifest: manifest.product_manifest,
    identityControlMetadata: manifest.identity_control_metadata,
    productCompositionMode: "single",
    productIdentityStrength: "strict",
  });

  assert(Boolean(strategy.creative_angle), "Strategy includes creative_angle");
  assert(Boolean(strategy.visual_strategy), "Strategy includes visual_strategy");
  assert(Boolean(strategy.commercial_goal), "Strategy includes commercial_goal");
  assert(Boolean(strategy.target_customer_psychology), "Strategy includes target_customer_psychology");
  assert(Boolean(strategy.composition_strategy), "Strategy includes composition_strategy");
  assert(Boolean(strategy.prompt_guidance), "Strategy includes prompt_guidance");

  // 3. Master Prompt Compiler Integration & Budget Test
  console.log("\n[TEST 3] Master Prompt Compiler Integration & Budget Protection");
  const compiler = new MasterPromptCompilerService();
  const mockKnowledgePackage: KnowledgePackageV1 = {
    package_version: "1.0",
    routing_version: "1.0",
    retrieval_mode: "HYBRID",
    requires_universal_core: false,
    universal_blocks: [],
    selected_blocks: [],
    rejected_candidates: [],
    warnings: [],
    stats: {
      repository_blocks: 5,
      metadata_candidates: 1,
      semantic_candidates: 1,
      fused_candidates: 1,
      selected_blocks: 0,
      estimated_tokens: 100,
      duration_ms: 2,
    },
  };

  const compileRes = await compiler.compile({
    useCase: "Poster",
    brief: strategy.prompt_guidance || "Cold refreshing splash explosion for TIDO Energy",
    aspectRatio: "9:16",
    routingResult: mockRoutingResult,
    knowledgePackage: mockKnowledgePackage,
  });

  assert(compileRes.success === true, "Compiler executed successfully");
  const prompt = compileRes.package?.compiled_prompt || "";

  console.log(`Compiled Prompt Length: ${prompt.length} chars`);
  assert(prompt.length <= 20000, "Compiled prompt length is <= 20000 characters");

  // 4. Product Identity Constraints Test
  console.log("\n[TEST 4] Product Identity Constraints Verification");
  assert(prompt.includes("REFERENCE IDENTITY LOCK") === true, "Prompt contains [REFERENCE IDENTITY LOCK]");
  assert(prompt.includes("PRODUCT PLANNING MANIFEST") === true, "Prompt contains PRODUCT PLANNING MANIFEST");
  assert(prompt.includes("REF CONTROL") === true, "Prompt contains [REF CONTROL] directive");
  assert(prompt.includes("LOCK [PRODUCT_01]") === true, "Prompt contains LOCK [PRODUCT_01]");

  console.log("\n========================================================================");
  console.log("🎉 ALL LLM PROVIDER MIGRATION & STRATEGY INTEGRATION TESTS PASSED (100%)");
  console.log("========================================================================");
}

runLLMProviderIntegrationTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
