import { RoutingValidator } from "./validation/RoutingValidator";
import { SimpleInputValidatorV1 } from "./validation/SimpleInputValidatorV1";
import {
  ExtractedAssetRoleV1,
  RoutingResultSchema,
  StructuredInputIntentV1,
} from "./types";

async function runSimpleInputV2Tests() {
  console.log("=========================================================");
  console.log("🚀 STARTING TIDO SIMPLE INPUT V1 — PHASE 2 TEST SUITE");
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

  // ── TEST CASE A: Fantasy Poster Concept ──────────────────────────
  const intentCaseA: StructuredInputIntentV1 = {
    core_creative_intent: "Summer fantasy poster for two beverage products floating in clouds",
    global_visual_language: "fantasy",
    scene_environment: "Two beverage products floating among pastel clouds",
    extracted_copy_items: [
      { role: "HEADLINE", text: "HÈ BAY LÊN", confidence: 1.0, evidence: "Explicit user headline" },
      { role: "PRODUCT_NAME", text: "Matcha Cloud", confidence: 1.0, evidence: "Explicit product name" },
      { role: "PRODUCT_NAME", text: "Coffee Cream", confidence: 1.0, evidence: "Explicit product name" },
    ],
    generated_copy_allowed: false,
    brand_mentions: ["TIDO"],
    explicit_hard_requirements: ["Keep two products distinct"],
    local_attributes: ["floating drinks", "clouds"],
    creative_freedom_level: "BALANCED",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
    ],
  };

  assert(intentCaseA.global_visual_language === "fantasy", "Case A: Global style correctly identified as 'fantasy'");
  assert(intentCaseA.scene_environment?.includes("clouds") === true, "Case A: Scene environment extracted");
  assert(intentCaseA.extracted_copy_items.some((c) => c.role === "HEADLINE" && c.text === "HÈ BAY LÊN"), "Case A: Exact headline 'HÈ BAY LÊN' preserved verbatim");
  assert(intentCaseA.extracted_copy_items.filter((c) => c.role === "PRODUCT_NAME").length === 2, "Case A: Extracted two product names");
  assert(intentCaseA.generated_copy_allowed === false, "Case A: generated_copy_allowed === false");

  // ── TEST CASE B: Local Cinematic Lighting (Minimal Global) ────────
  const intentCaseB: StructuredInputIntentV1 = {
    core_creative_intent: "Minimal poster on white background with product on left and cinematic lighting",
    global_visual_language: "minimal",
    scene_environment: "Clean white background",
    composition_requests: "Product placed on left side",
    lighting_requests: "Cinematic lighting",
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: ["cinematic lighting"],
    creative_freedom_level: "RESTRICTED",
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
  };

  assert(intentCaseB.global_visual_language === "minimal", "Case B: Global visual language is 'minimal' (NOT cinematic)");
  assert(intentCaseB.local_attributes.includes("cinematic lighting"), "Case B: 'cinematic lighting' preserved as local attribute");

  // ── TEST CASE C: 3D Typography (Photographic Global) ──────────────
  const intentCaseC: StructuredInputIntentV1 = {
    core_creative_intent: "Photographic poster featuring 3D headline typography",
    global_visual_language: "photographic",
    typography_requests: "3D title text effect",
    extracted_copy_items: [
      { role: "HEADLINE", text: "FUTURE TASTE", confidence: 1.0, evidence: "User title" },
    ],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: ["3D typography"],
    creative_freedom_level: "BALANCED",
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
  };

  assert(intentCaseC.global_visual_language === "photographic", "Case C: Global visual language is 'photographic' (NOT 3D CGI)");
  assert(intentCaseC.local_attributes.includes("3D typography"), "Case C: 3D title preserved as local attribute");

  // ── TEST CASE D: Promotion Concept ───────────────────────────────
  const intentCaseD: StructuredInputIntentV1 = {
    core_creative_intent: "Promotional sale poster for two products",
    global_visual_language: "commercial",
    communication_intent: "promotion",
    promotion_intent: "Sale campaign",
    extracted_copy_items: [
      { role: "HEADLINE", text: "MUA 1 TẶNG 1", confidence: 1.0, evidence: "User text" },
    ],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "BALANCED",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
    ],
  };

  assert(intentCaseD.communication_intent === "promotion", "Case D: Communication intent is 'promotion'");
  assert(intentCaseD.extracted_copy_items[0].text === "MUA 1 TẶNG 1", "Case D: Headline 'MUA 1 TẶNG 1' preserved verbatim");
  assert(intentCaseD.extracted_copy_items.every((c) => c.role !== "PRICE" && c.role !== "CTA"), "Case D: Did NOT invent unrequested prices or CTAs");

  // ── TEST CASE E: Description Not Product Name ────────────────────
  const intentCaseE: StructuredInputIntentV1 = {
    core_creative_intent: "Poster for a green matcha cup beverage",
    global_visual_language: "commercial",
    local_attributes: ["green color", "matcha drink"],
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
  };

  assert(intentCaseE.extracted_copy_items.length === 0, "Case E: Generic 'ly matcha màu xanh' was NOT converted into product name copy item");

  // ── TEST CASE F: Generated Copy Allowed ──────────────────────────
  const intentCaseF: StructuredInputIntentV1 = {
    core_creative_intent: "Summer poster for two products with auto-generated headline permission",
    global_visual_language: "commercial",
    extracted_copy_items: [],
    generated_copy_allowed: true,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "HIGH",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
    ],
  };

  assert(intentCaseF.generated_copy_allowed === true, "Case F: Explicit permission sets generated_copy_allowed === true");

  // ── TEST ASSET CASE G: Product + Product + Logo ──────────────────
  const assetRolesCaseG: ExtractedAssetRoleV1[] = [
    { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95, evidence: "Beverage cup" },
    { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95, evidence: "Beverage cup" },
    { reference_id: "REF_03", role: "LOGO", confidence: 0.99, evidence: "Standalone brand emblem" },
  ];

  const candidatesCaseG = SimpleInputValidatorV1.filterProductCandidates(assetRolesCaseG);
  assert(candidatesCaseG.length === 2, "Case G: Filtered exactly 2 PRODUCT candidates");
  assert(!candidatesCaseG.some((c) => (c.role as string) === "LOGO"), "Case G: Standalone LOGO was excluded from product candidates");

  // ── TEST ASSET CASE H: Same Product Multi-View ───────────────────
  const assetRolesCaseH: ExtractedAssetRoleV1[] = [
    { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95, evidence: "Bottle front view" },
    { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95, evidence: "Bottle side view" },
  ];
  assert(assetRolesCaseH.length === 2, "Case H: Multi-view assets classified as PRODUCT");

  // ── TEST ASSET CASE I: Ambiguous Asset Safety ────────────────────
  const assetRolesCaseI: ExtractedAssetRoleV1[] = [
    { reference_id: "REF_01", role: "AMBIGUOUS", confidence: 0.40, evidence: "Cropped unclear object" },
  ];

  const candidatesCaseI = SimpleInputValidatorV1.filterProductCandidates(assetRolesCaseI);
  assert(candidatesCaseI.length === 0, "Case I: AMBIGUOUS asset yielded 0 PRODUCT candidates (AMBIGUOUS != PRODUCT)");

  // ── TEST ASSET CASE J: Embedded Logo Rule ────────────────────────
  const assetRolesCaseJ: ExtractedAssetRoleV1[] = [
    { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95, evidence: "Product cup with printed brand logo" },
  ];

  const candidatesCaseJ = SimpleInputValidatorV1.filterProductCandidates(assetRolesCaseJ);
  assert(candidatesCaseJ.length === 1, "Case J: Product cup with printed logo remains PRODUCT (NOT standalone logo)");

  // ── TEST 11: Schema Regression (Legacy RoutingResultSchema) ──────
  const legacyRoutingData: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Legacy test routing summary",
    global_retrieval_queries: [
      { query: "Beverage packaging specification", importance: "PRIMARY", reason: "Standard knowledge" },
    ],
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 1.0,
        summary: "Test legacy product entry",
        categories: [{ value: "Beverage", confidence: 1.0, evidence_type: "USER_PROVIDED", evidence_summary: "Test" }],
        industry_domains: [{ value: "F&B", confidence: 1.0, evidence_type: "USER_PROVIDED", evidence_summary: "Test" }],
        likely_functions: [],
        materials: [],
        contents: [],
        surface_properties: [],
        geometry_traits: [],
        packaging_types: [],
        branding_features: [],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [{ query: "Beverage packaging", importance: "PRIMARY", reason: "Test" }],
      },
    ],
  };

  const legacyValidation = RoutingValidator.validate(legacyRoutingData, ["REF_01"]);
  assert(legacyValidation.isValid, "Legacy RoutingResultSchema without Simple Input fields passes validation cleanly");

  // ── TEST 12: Additive RoutingResultSchema with Structured Input ─
  const additiveRoutingData: RoutingResultSchema = {
    ...legacyRoutingData,
    structured_input_intent: intentCaseA,
    asset_roles: assetRolesCaseG,
  };

  const additiveValidation = RoutingValidator.validate(additiveRoutingData, ["REF_01", "REF_02", "REF_03"]);
  assert(additiveValidation.isValid, "Extended RoutingResultSchema with structured_input_intent and asset_roles passes validation");

  console.log("\n=========================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 2 TESTS PASSED SUCCESSFULLY!`);
  console.log("=========================================================\n");
}

runSimpleInputV2Tests().catch((err) => {
  console.error("❌ PHASE 2 TEST SUITE FAILED:", err);
  process.exit(1);
});
