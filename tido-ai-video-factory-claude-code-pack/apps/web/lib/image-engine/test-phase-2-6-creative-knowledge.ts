import { CreativeKnowledgeService } from "./service/CreativeKnowledgeService";
import { ProductPlanningService } from "./service/ProductPlanningService";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { RoutingResultSchema, KnowledgePackageV1 } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runPhase26CreativeKnowledgeTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 2.6 CREATIVE KNOWLEDGE INTELLIGENCE AUDIT");
  console.log("========================================================================");

  const creativeService = new CreativeKnowledgeService();
  const planner = new ProductPlanningService();
  const compiler = new MasterPromptCompilerService();

  // 1. Direct CreativeKnowledgeService Test
  console.log("\n------------------------------------------------------------------------");
  console.log("[TEST 1] Resolving F&B Creative Direction for 'roast chicken' food poster");
  console.log("------------------------------------------------------------------------");

  const creativeResult = creativeService.resolveCreativeDirection({
    useCase: "Food Poster",
    brief: "Commercial food poster for delicious golden roast chicken",
    productCategory: "food",
  });

  const direction = creativeResult.creativeDirection;
  console.log("Resolved Creative Direction JSON:", JSON.stringify(direction, null, 2));

  assert(Boolean(direction.visual_style), "visual_style is populated");
  assert(Boolean(direction.camera_direction), "camera_direction is populated");
  assert(Boolean(direction.lighting_direction), "lighting_direction is populated");
  assert(Boolean(direction.composition_strategy), "composition_strategy is populated");
  assert(Boolean(direction.typography_strategy), "typography_strategy is populated");
  assert(Boolean(direction.color_strategy), "color_strategy is populated");
  assert(direction.quality_checks.length > 0, "quality_checks contains rules");

  // Verify Telemetry
  assert(creativeResult.telemetry.source_count === 3, "source_count is 3");
  assert(creativeResult.telemetry.selected_rules.includes("FOOD_MACRO_LIGHTING"), "selected_rules includes FOOD_MACRO_LIGHTING");
  assert(creativeResult.telemetry.output_chars <= 1500, `output_chars (${creativeResult.telemetry.output_chars}) <= 1500 max limit`);

  // 2. Full Compiler Integration Test
  console.log("\n------------------------------------------------------------------------");
  console.log("[TEST 2] Master Prompt Compiler Integration & Priority Order Verification");
  console.log("------------------------------------------------------------------------");

  const routing: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "Commercial Roast Chicken Food Poster",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_ROAST_CHICKEN"],
        reference_relationship_confidence: 0.99,
        summary: "Golden Roast Chicken",
        categories: [{ value: "food", confidence: 0.99, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "restaurant_fnb", confidence: 0.99, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "food_commercial", confidence: 0.9, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Crisp Roasted Skin", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Cooked Chicken Meat", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Glossy Glaze Sheen", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Whole Roast Poultry", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Plated Presentation", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Restaurant Logo", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [{ reference_id: "REF_ROAST_CHICKEN", role: "PRODUCT", confidence: 1.0 }],
    global_retrieval_queries: [],
  };

  const productManifest = planner.buildProductManifest(routing, 1);
  routing.reference_manifest = {
    relationship_type: productManifest.relationship_type,
    total_references: 1,
    detected_products_count: 1,
    detected_logos_count: 0,
    same_product_views_count: 0,
    identity_rules: [],
    product_identity_locks: [],
    logo_locks: [],
    product_manifest: productManifest,
  } as any;

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
    useCase: "Food Poster",
    brief: "Commercial food poster for delicious golden roast chicken",
    aspectRatio: "3:4",
    productCount: 1,
    routingResult: routing,
    knowledgePackage: mockKnowledgePackage,
  });

  assert(compileRes.success === true, "Master Prompt compiled successfully");
  const finalPrompt = compileRes.package?.compiled_prompt || "";

  console.log(`Final Provider Prompt Length: ${finalPrompt.length} chars`);
  assert(finalPrompt.length <= 15000, `No prompt overflow: prompt length (${finalPrompt.length} chars) <= 15000 chars limit`);

  // Verify Creative Guidance Block Content
  assert(finalPrompt.includes("[CREATIVE DIRECTION]"), "Prompt includes [CREATIVE DIRECTION] block");
  assert(finalPrompt.includes("1. PRODUCT IDENTITY"), "Priority Order 1: PRODUCT IDENTITY present");
  assert(finalPrompt.includes("2. LOGO PRESERVATION"), "Priority Order 2: LOGO PRESERVATION present");
  assert(finalPrompt.includes("3. COMMERCIAL COMPOSITION"), "Priority Order 3: COMMERCIAL COMPOSITION present");
  assert(finalPrompt.includes("4. TYPOGRAPHY AREA"), "Priority Order 4: TYPOGRAPHY AREA present");
  assert(finalPrompt.includes("5. CINEMATIC STYLE"), "Priority Order 5: CINEMATIC STYLE present");

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 2.6 CREATIVE KNOWLEDGE INTELLIGENCE TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPhase26CreativeKnowledgeTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
