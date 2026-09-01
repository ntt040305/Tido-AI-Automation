import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";
import { RoutingResultSchema } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runAcceptanceTests() {
  console.log("==========================================");
  console.log("TIDO PHASE 2.2 REFERENCE INTELLIGENCE & IDENTITY LOCK ACCEPTANCE TESTS");
  console.log("==========================================");

  const refIntel = new ReferenceIntelligenceService();

  // --------------------------------------------------------------------------
  // TEST 1: single_product
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Scenario: single_product");
  const singleProductRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "PARTIAL_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Single product hero poster",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.95,
        summary: "TIDO Cold Brew Coffee Bottle",
        categories: [{ value: "beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Coffee" }],
        industry_domains: [{ value: "f_and_b", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "F&B" }],
        likely_functions: [{ value: "refreshment", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Refreshment" }],
        materials: [{ value: "Glass", confidence: 0.9, evidence_type: "STRONG_INFERENCE", evidence_summary: "Glass Bottle" }],
        contents: [{ value: "Cold Brew Coffee", confidence: 0.9, evidence_type: "STRONG_INFERENCE", evidence_summary: "Coffee" }],
        surface_properties: [{ value: "Glossy", confidence: 0.9, evidence_type: "STRONG_INFERENCE", evidence_summary: "Glossy" }],
        geometry_traits: [{ value: "Cylindrical Bottle", confidence: 0.9, evidence_type: "STRONG_INFERENCE", evidence_summary: "Bottle" }],
        packaging_types: [{ value: "Glass Bottle", confidence: 0.9, evidence_type: "STRONG_INFERENCE", evidence_summary: "Bottle" }],
        branding_features: [{ value: "TIDO Coffee Logo", confidence: 0.95, evidence_type: "USER_PROVIDED", evidence_summary: "Logo" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    global_retrieval_queries: [],
  };

  const manifest1 = refIntel.generateManifest(singleProductRouting);
  singleProductRouting.reference_manifest = manifest1;

  assert(manifest1.relationship_type === "single_product", "Relationship classified as 'single_product'");
  assert(manifest1.detected_products_count === 1, "Detected products count is 1");
  assert(manifest1.identity_rules.some((r) => r.type === "product_lock"), "Contains product_lock identity rule");
  assert(manifest1.identity_rules.some((r) => r.type === "packaging_lock"), "Contains packaging_lock identity rule");

  // --------------------------------------------------------------------------
  // TEST 2: multi_product
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Scenario: multi_product");
  const multiProductRouting: RoutingResultSchema = {
    ...singleProductRouting,
    products: [
      singleProductRouting.products[0],
      {
        ...singleProductRouting.products[0],
        product_id: "PRODUCT_02",
        reference_ids: ["REF_02"],
        summary: "TIDO Matcha Latte Can",
      },
    ],
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
    ],
  };

  const manifest2 = refIntel.generateManifest(multiProductRouting);
  multiProductRouting.reference_manifest = manifest2;

  assert(manifest2.relationship_type === "multi_product", "Relationship classified as 'multi_product'");
  assert(manifest2.detected_products_count === 2, "Detected products count is 2");
  assert(manifest2.identity_rules.some((r) => r.type === "multi_product_arrangement"), "Contains multi_product_arrangement rule");

  // --------------------------------------------------------------------------
  // TEST 3: same_product_multi_view
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Scenario: same_product_multi_view");
  const multiViewRouting: RoutingResultSchema = {
    ...singleProductRouting,
    products: [
      {
        ...singleProductRouting.products[0],
        reference_ids: ["REF_01", "REF_02_ANGLE_BACK"],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02_ANGLE_BACK", role: "PRODUCT", confidence: 0.95 },
    ],
  };

  const manifest3 = refIntel.generateManifest(multiViewRouting);
  multiViewRouting.reference_manifest = manifest3;

  assert(manifest3.relationship_type === "same_product_multi_view", "Relationship classified as 'same_product_multi_view'");
  assert(manifest3.same_product_views_count === 2, "Detected same product multi-views count is 2");
  assert(manifest3.identity_rules.some((r) => r.type === "multi_view_consistency"), "Contains multi_view_consistency rule");

  // --------------------------------------------------------------------------
  // TEST 4: product_with_logo
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Scenario: product_with_logo");
  const productWithLogoRouting: RoutingResultSchema = {
    ...singleProductRouting,
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02_LOGO", role: "LOGO", confidence: 0.99 },
    ],
  };

  const manifest4 = refIntel.generateManifest(productWithLogoRouting);
  productWithLogoRouting.reference_manifest = manifest4;

  assert(manifest4.relationship_type === "product_with_logo", "Relationship classified as 'product_with_logo'");
  assert(manifest4.detected_logos_count === 1, "Detected logos count is 1");
  assert(manifest4.identity_rules.some((r) => r.type === "logo_preservation"), "Contains logo_preservation rule");

  console.log("\n================ ALL PHASE 2.2 ACCEPTANCE TESTS PASSED ================");
}

runAcceptanceTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
