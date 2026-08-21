import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import {
  RoutingResultSchema,
  SimpleInputRequestV1,
  StructuredInputIntentV1,
} from "./types";

async function runSimpleInputV35Tests() {
  console.log("=========================================================");
  console.log("🚀 STARTING TIDO SIMPLE INPUT V1 — PHASE 3.5 TEST SUITE");
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
      global_retrieval_queries: [],
      products,
      structured_input_intent: intent,
      asset_roles: intent.asset_roles,
    };
  }

  // ── TEST CASE A: 2 Products + 1 Logo ─────────────────────────────
  const reqA: SimpleInputRequestV1 = {
    concept: "Poster 2 sản phẩm và logo",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }, { reference_id: "REF_03" }],
  };

  const intentA: StructuredInputIntentV1 = {
    core_creative_intent: reqA.concept,
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

  const resA = SimpleInputAdapterService.adapt(reqA, createFixtureRouting([
    { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "P1", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
    { product_id: "PRODUCT_02", reference_ids: ["REF_02"], reference_relationship_confidence: 1.0, summary: "P2", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
  ], intentA));

  assert(resA.resolvedProductCount === 2, "Case A: productCount === 2");
  assert(resA.generationReferences.length === 3, "Case A: generationReferences contains all 3 assets");
  assert(resA.generationReferences.find((r) => r.reference_id === "REF_03")?.role === "LOGO", "Case A: REF_03 has role LOGO in generationReferences");
  assert(resA.generationReferences.find((r) => r.reference_id === "REF_03")?.product_id === undefined, "Case A: REF_03 has NO product_id (no PRODUCT_03 produced)");

  // ── TEST CASE B: Multiview + Logo ─────────────────────────────────
  const reqB: SimpleInputRequestV1 = {
    concept: "Poster sản phẩm 2 góc chụp và logo",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }, { reference_id: "REF_03" }],
  };

  const intentB: StructuredInputIntentV1 = {
    core_creative_intent: reqB.concept,
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

  const resB = SimpleInputAdapterService.adapt(reqB, createFixtureRouting([
    { product_id: "PRODUCT_01", reference_ids: ["REF_01", "REF_02"], reference_relationship_confidence: 0.95, summary: "P1 multiview", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
  ], intentB));

  assert(resB.resolvedProductCount === 1, "Case B: productCount === 1 for multi-view product");
  assert(resB.generationReferences.length === 3, "Case B: All 3 images present in generationReferences");
  assert(resB.generationReferences.find((r) => r.reference_id === "REF_01")?.product_id === "PRODUCT_01", "Case B: REF_01 bound to PRODUCT_01");
  assert(resB.generationReferences.find((r) => r.reference_id === "REF_02")?.product_id === "PRODUCT_01", "Case B: REF_02 bound to PRODUCT_01");
  assert(resB.generationReferences.find((r) => r.reference_id === "REF_03")?.role === "LOGO", "Case B: REF_03 retains role LOGO");

  // ── TEST CASE C: Product + Support Reference ─────────────────────
  const reqC: SimpleInputRequestV1 = {
    concept: "Poster sản phẩm và hình tham khảo phong cách",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }],
  };

  const intentC: StructuredInputIntentV1 = {
    core_creative_intent: reqC.concept,
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

  const resC = SimpleInputAdapterService.adapt(reqC, createFixtureRouting([], intentC));
  assert(resC.resolvedProductCount === 1, "Case C: productCount === 1");
  assert(resC.generationReferences.length === 2, "Case C: generationReferences contains both product and support reference");
  assert(resC.generationReferences[1].role === "SUPPORT_REFERENCE", "Case C: REF_02 assigned role SUPPORT_REFERENCE");
  assert(resC.generationReferences[1].product_id === undefined, "Case C: SUPPORT_REFERENCE has NO product_id");

  // ── TEST CASE D: Product + Ambiguous Reference ────────────────────
  const reqD: SimpleInputRequestV1 = {
    concept: "Poster sản phẩm và hình mờ",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }],
  };

  const intentD: StructuredInputIntentV1 = {
    core_creative_intent: reqD.concept,
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

  const resD = SimpleInputAdapterService.adapt(reqD, createFixtureRouting([], intentD));
  assert(resD.resolvedProductCount === 1, "Case D: productCount === 1");
  assert(resD.generationReferences.length === 1, "Case D: generationReferences contains ONLY confirmed PRODUCT reference (AMBIGUOUS excluded from generation)");
  assert(resD.ambiguousAssets.length === 1 && resD.ambiguousAssets[0].reference_id === "REF_02", "Case D: AMBIGUOUS reference preserved in diagnostics collection");

  // ── TEST CASE E: Product + Logo + Support Reference ───────────────
  const reqE: SimpleInputRequestV1 = {
    concept: "Poster sản phẩm, logo brand và hình tham khảo campaign",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }, { reference_id: "REF_03" }],
  };

  const intentE: StructuredInputIntentV1 = {
    core_creative_intent: reqE.concept,
    global_visual_language: "commercial",
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "BALANCED",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "LOGO", confidence: 0.99 },
      { reference_id: "REF_03", role: "SUPPORT_REFERENCE", confidence: 0.90 },
    ],
  };

  const resE = SimpleInputAdapterService.adapt(reqE, createFixtureRouting([], intentE));
  assert(resE.resolvedProductCount === 1, "Case E: productCount === 1");
  assert(resE.generationReferences.length === 3, "Case E: generationReferences contains all 3 assets with distinct roles");
  assert(resE.generationReferences[0].role === "PRODUCT", "Case E: First reference is PRODUCT");
  assert(resE.generationReferences[1].role === "LOGO", "Case E: Second reference is LOGO");
  assert(resE.generationReferences[2].role === "SUPPORT_REFERENCE", "Case E: Third reference is SUPPORT_REFERENCE");
  assert(resE.compilerBrief.includes("ATTACHED REFERENCE ROLES (ORDER MATCHES MULTIPART IMAGES):"), "Case E: Model-visible reference role map appended to compilerBrief");

  console.log("\n=========================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 3.5 TESTS PASSED SUCCESSFULLY!`);
  console.log("=========================================================\n");
}

runSimpleInputV35Tests().catch((err) => {
  console.error("❌ PHASE 3.5 TEST SUITE FAILED:", err);
  process.exit(1);
});
