import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import {
  RoutingResultSchema,
  SimpleInputRequestV1,
  StructuredInputIntentV1,
} from "./types";

async function runSimpleInputV36Tests() {
  console.log("=========================================================");
  console.log("🚀 STARTING TIDO SIMPLE INPUT V1 — PHASE 3.6 TEST SUITE");
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

  // ── TEST FIXTURE A: 2 Products + Logo ─────────────────────────────
  const reqA: SimpleInputRequestV1 = {
    concept: "Poster 2 sản phẩm Matcha & Coffee kèm logo brand",
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

  assert(resA.resolvedProductCount === 2, "Fixture A: productCount === 2");
  assert(resA.compilerBrief.includes("Image 1 (REF_01): PRODUCT_01 identity reference"), "Fixture A: Image 1 bound to PRODUCT_01");
  assert(resA.compilerBrief.includes("Image 2 (REF_02): PRODUCT_02 identity reference"), "Fixture A: Image 2 bound to PRODUCT_02");
  assert(resA.compilerBrief.includes("Image 3 (REF_03): Standalone brand logo visual reference"), "Fixture A: Image 3 bound to Standalone brand logo");

  // ── TEST FIXTURE B: 1 Product + Support Reference ──────────────────
  const reqB: SimpleInputRequestV1 = {
    concept: "Poster lon soda mát lạnh theo phong cách mùa hè hình 2",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }],
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
      { reference_id: "REF_02", role: "SUPPORT_REFERENCE", confidence: 0.90 },
    ],
  };

  const resB = SimpleInputAdapterService.adapt(reqB, createFixtureRouting([], intentB));
  assert(resB.resolvedProductCount === 1, "Fixture B: productCount === 1");
  assert(resB.compilerBrief.includes("Image 1 (REF_01): PRODUCT_01 identity reference"), "Fixture B: Image 1 bound to PRODUCT_01");
  assert(resB.compilerBrief.includes("Image 2 (REF_02): Supporting visual reference"), "Fixture B: Image 2 bound to Supporting visual reference");

  // ── TEST FIXTURE C: Product Multiview + Logo ──────────────────────
  const reqC: SimpleInputRequestV1 = {
    concept: "Poster chai nước hoa mặt trước & mặt sau và logo",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }, { reference_id: "REF_03" }],
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
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_03", role: "LOGO", confidence: 0.99 },
    ],
  };

  const resC = SimpleInputAdapterService.adapt(reqC, createFixtureRouting([
    { product_id: "PRODUCT_01", reference_ids: ["REF_01", "REF_02"], reference_relationship_confidence: 0.95, summary: "P1 multiview", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
  ], intentC));

  assert(resC.resolvedProductCount === 1, "Fixture C: productCount === 1 for multi-view product");
  assert(resC.compilerBrief.includes("Image 1 (REF_01): PRODUCT_01 identity reference"), "Fixture C: Image 1 bound to PRODUCT_01");
  assert(resC.compilerBrief.includes("Image 2 (REF_02): PRODUCT_01 identity reference"), "Fixture C: Image 2 ALSO bound to PRODUCT_01 (NOT PRODUCT_02)");
  assert(resC.compilerBrief.includes("Image 3 (REF_03): Standalone brand logo visual reference"), "Fixture C: Image 3 bound to Standalone brand logo");

  // ── TEST FIXTURE D: 2 Products + Logo + Support ────────────────────
  const reqD: SimpleInputRequestV1 = {
    concept: "Poster 2 chai serum kèm logo và hình style mùa hè",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }, { reference_id: "REF_03" }, { reference_id: "REF_04" }],
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
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_03", role: "LOGO", confidence: 0.99 },
      { reference_id: "REF_04", role: "SUPPORT_REFERENCE", confidence: 0.90 },
    ],
  };

  const resD = SimpleInputAdapterService.adapt(reqD, createFixtureRouting([
    { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "P1", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
    { product_id: "PRODUCT_02", reference_ids: ["REF_02"], reference_relationship_confidence: 1.0, summary: "P2", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
  ], intentD));

  assert(resD.resolvedProductCount === 2, "Fixture D: productCount === 2");
  assert(resD.generationReferences.length === 4, "Fixture D: 4 images in generationReferences array");
  assert(resD.compilerBrief.includes("Image 1 (REF_01): PRODUCT_01 identity reference"), "Fixture D: Image 1 PRODUCT_01");
  assert(resD.compilerBrief.includes("Image 2 (REF_02): PRODUCT_02 identity reference"), "Fixture D: Image 2 PRODUCT_02");
  assert(resD.compilerBrief.includes("Image 3 (REF_03): Standalone brand logo visual reference"), "Fixture D: Image 3 LOGO");
  assert(resD.compilerBrief.includes("Image 4 (REF_04): Supporting visual reference"), "Fixture D: Image 4 SUPPORT_REFERENCE");

  // ── TEST E: Prompt Budget Impact Audit ─────────────────────────────
  const baseBriefChars = resD.generationIntentBrief.char_count;
  const fullBriefChars = resD.compilerBrief.length;
  const netRoleMapImpact = fullBriefChars - baseBriefChars;

  console.log(` 📊 Prompt Budget Audit (Fixture D):`);
  console.log(`   - Base Intent Brief chars: ${baseBriefChars}`);
  console.log(`   - Full Brief chars (with model-visible role map): ${fullBriefChars}`);
  console.log(`   - Net Role Map Impact: +${netRoleMapImpact} chars`);

  assert(netRoleMapImpact < 500, "Prompt Budget Audit: Net role map impact < 500 characters");
  assert(netRoleMapImpact > 100, "Prompt Budget Audit: Model-visible role map was appended successfully");

  console.log("\n=========================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 3.6 TESTS PASSED SUCCESSFULLY!`);
  console.log("=========================================================\n");
}

runSimpleInputV36Tests().catch((err) => {
  console.error("❌ PHASE 3.6 TEST SUITE FAILED:", err);
  process.exit(1);
});
