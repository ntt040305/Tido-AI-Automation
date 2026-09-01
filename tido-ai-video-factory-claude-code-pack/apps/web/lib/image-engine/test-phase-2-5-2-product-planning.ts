import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";
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

async function runPhase252ProductPlanningTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 2.5.2 PRODUCT PLANNING LAYER AUDIT");
  console.log("========================================================================");

  const refIntel = new ReferenceIntelligenceService();
  const planner = new ProductPlanningService();
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

  // ------------------------------------------------------------------
  // TEST CASE 1: Single Product + Logo (product_with_logo)
  // ------------------------------------------------------------------
  console.log("\n[TEST CASE 1] Single Product + Logo Reference");
  const routingCase1: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Coffee Bottle with Logo",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_PROD"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Cold Brew Bottle",
        categories: [{ value: "beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "f_and_b", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "refreshment", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Amber Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Cold Brew Coffee", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Glossy Refractive Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylindrical Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Glass Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "TIDO Brand Label", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01_PROD", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_02_LOGO", role: "LOGO", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const manifestCase1 = refIntel.generateManifest(routingCase1, 1);
  assert(manifestCase1.relationship_type === "product_with_logo", "Case 1 Relationship: product_with_logo");
  assert(manifestCase1.product_manifest !== undefined, "Case 1 ProductManifest generated");
  assert(manifestCase1.product_manifest?.products.length === 1, "Case 1: 1 Product in ProductManifest");
  assert(manifestCase1.product_manifest?.compact_identity_locks.length === 1, "Case 1: 1 Compact Identity Lock generated");
  assert(manifestCase1.product_manifest?.compact_identity_locks[0].includes("LOCK [PRODUCT_01]") === true, "Compact lock contains LOCK [PRODUCT_01]");

  // ------------------------------------------------------------------
  // TEST CASE 2: Front/Back Same Product (same_product_multi_view)
  // ------------------------------------------------------------------
  console.log("\n[TEST CASE 2] Front / Back Same Product (Multi-View)");
  const routingCase2: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Vitamin Bottle Front and Back View",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_FRONT", "REF_02_BACK"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Vitamin Supplement Container",
        categories: [{ value: "healthcare", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "wellness", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "supplement", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Matte White HDPE Plastic", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Capsules", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Matte Finish", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylindrical Pill Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Pill Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Front Label & Back Nutrition Label", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01_FRONT", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_02_BACK", role: "PRODUCT", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const manifestCase2 = refIntel.generateManifest(routingCase2, 1);
  assert(manifestCase2.relationship_type === "same_product_multi_view", "Case 2 Relationship: same_product_multi_view");
  assert(manifestCase2.product_manifest?.validation.target_count_requested === 1, "Case 2 Target Requested: 1");
  assert(manifestCase2.product_manifest?.validation.detected_product_count === 1, "Case 2 Detected Products: 1");

  // ------------------------------------------------------------------
  // TEST CASE 3: Multiple Products (multi_product)
  // ------------------------------------------------------------------
  console.log("\n[TEST CASE 3] Multiple Distinct Products");
  const routingCase3: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Skincare Serum + Cream Duo Set",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_SERUM"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Glow Serum Bottle",
        categories: [{ value: "beauty", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "skincare", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "hydration", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Frosted Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Clear Serum", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Frosted Texture", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Dropper Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Dropper Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Glow Serum Label", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
      {
        product_id: "PRODUCT_02",
        reference_ids: ["REF_02_CREAM"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Night Cream Jar",
        categories: [{ value: "beauty", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "skincare", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "moisturizer", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "White Ceramic Jar", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Rich Cream", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Smooth Ceramic", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Round Jar", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Cream Jar", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Night Cream Label", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01_SERUM", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_02_CREAM", role: "PRODUCT", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const manifestCase3 = refIntel.generateManifest(routingCase3, 2);
  assert(manifestCase3.relationship_type === "multi_product", "Case 3 Relationship: multi_product");
  assert(manifestCase3.product_manifest?.products.length === 2, "Case 3: 2 Products in ProductManifest");
  assert(manifestCase3.product_manifest?.compact_identity_locks.length === 2, "Case 3: 2 Compact Identity Locks generated");

  // ------------------------------------------------------------------
  // TEST CASE 4: Logo Only (brand_only)
  // ------------------------------------------------------------------
  console.log("\n[TEST CASE 4] Brand / Logo Asset Only");
  const routingCase4: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Official Brand Logo Visual",
    products: [],
    asset_roles: [
      { reference_id: "REF_01_LOGO", role: "LOGO", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const manifestCase4 = refIntel.generateManifest(routingCase4, 1);
  assert(manifestCase4.relationship_type === "brand_only", "Case 4 Relationship: brand_only");
  assert(manifestCase4.product_manifest?.compact_identity_locks[0].includes("LOCK BRAND LOGO") === true, "Case 4 Lock: LOCK BRAND LOGO");

  // ------------------------------------------------------------------
  // PROMPT COMPILER INTEGRATION VERIFICATION
  // ------------------------------------------------------------------
  console.log("\n[PROMPT COMPILER INTEGRATION]");
  routingCase1.reference_manifest = manifestCase1;
  const compileRes = await compiler.compile({
    useCase: "Poster",
    brief: "High-end product hero visual for TIDO Cold Brew",
    aspectRatio: "1:1",
    routingResult: routingCase1,
    knowledgePackage: mockKnowledgePackage,
  });

  assert(compileRes.success === true, "Compiler executed successfully");
  const prompt = compileRes.package?.compiled_prompt || "";
  assert(prompt.includes("PRODUCT PLANNING MANIFEST"), "Compiled prompt contains PRODUCT PLANNING MANIFEST");
  assert(prompt.includes("LOCK [PRODUCT_01]"), "Compiled prompt contains compact lock string");

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 2.5.2 PRODUCT PLANNING LAYER TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPhase252ProductPlanningTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
