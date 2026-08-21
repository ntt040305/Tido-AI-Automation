import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import {
  RoutingResultSchema,
  SimpleInputRequestV1,
  StructuredInputIntentV1,
} from "./types";

async function runSimpleInputV3Tests() {
  console.log("=========================================================");
  console.log("🚀 STARTING TIDO SIMPLE INPUT V1 — PHASE 3 TEST SUITE");
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

  // Helper fixture builder
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
        { query: "Beverage packaging", importance: "PRIMARY", reason: "Standard knowledge" },
      ],
      products,
      structured_input_intent: intent,
      asset_roles: intent.asset_roles,
    };
  }

  // ── TEST CASE A: 2 Products + 1 Logo ─────────────────────────────
  const reqA: SimpleInputRequestV1 = {
    concept: "Poster fantasy mùa hè, 2 sản phẩm bay giữa mây",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }, { reference_id: "REF_03" }],
  };

  const intentA: StructuredInputIntentV1 = {
    core_creative_intent: reqA.concept,
    global_visual_language: "fantasy",
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: ["TIDO"],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "BALANCED",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_03", role: "LOGO", confidence: 0.99 },
    ],
  };

  const routingA = createFixtureRouting(
    [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 1.0,
        summary: "Product 1",
        categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [],
      },
      {
        product_id: "PRODUCT_02",
        reference_ids: ["REF_02"],
        reference_relationship_confidence: 1.0,
        summary: "Product 2",
        categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [],
      },
    ],
    intentA
  );

  const resA = SimpleInputAdapterService.adapt(reqA, routingA);
  assert(resA.success === true, "Case A: Adapter succeeds");
  assert(resA.resolvedProductCount === 2, "Case A: resolvedProductCount === 2");
  assert(resA.productCandidates.length === 2, "Case A: productCandidates.length === 2");
  assert(resA.brandAssets.length === 1 && resA.brandAssets[0].reference_id === "REF_03", "Case A: Standalone LOGO REF_03 assigned to brandAssets");
  assert(resA.brandInfo?.includes("REF_03") === true, "Case A: brandInfo safely notes logo reference");

  // ── TEST CASE B: 1 Product Multi-View + 1 Logo ───────────────────
  const reqB: SimpleInputRequestV1 = {
    concept: "Poster cho 1 sản phẩm 2 góc chụp và logo brand",
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

  const routingB = createFixtureRouting(
    [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01", "REF_02"],
        reference_relationship_confidence: 0.95, // STRONG SAME_IDENTITY evidence
        summary: "Product 1 multi-view",
        categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [],
      },
    ],
    intentB
  );

  const resB = SimpleInputAdapterService.adapt(reqB, routingB);
  assert(resB.resolvedProductCount === 1, "Case B: Multi-view merged safely into productCount === 1");
  assert(resB.brandAssets.length === 1, "Case B: Logo excluded from product identity grouping");

  // ── TEST CASE C: 1 Product + 1 Support Reference ────────────────
  const reqC: SimpleInputRequestV1 = {
    concept: "Poster sản phẩm theo phong cách tham khảo hình 2",
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
  assert(resC.supportReferences.length === 1 && resC.supportReferences[0].reference_id === "REF_02", "Case C: REF_02 categorized as supportReference");

  // ── TEST CASE D: Product + Ambiguous Reference ────────────────────
  const reqD: SimpleInputRequestV1 = {
    concept: "Poster cho sản phẩm",
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
  assert(resD.resolvedProductCount === 1, "Case D: AMBIGUOUS reference did NOT create product identity");
  assert(resD.ambiguousAssets.length === 1, "Case D: Preserved in ambiguousAssets collection");

  // ── TEST CASE E: Explicit Headline ───────────────────────────────
  const reqE: SimpleInputRequestV1 = {
    concept: "Poster với title 'HÈ BAY LÊN'",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01" }],
  };

  const intentE: StructuredInputIntentV1 = {
    core_creative_intent: reqE.concept,
    global_visual_language: "fantasy",
    extracted_copy_items: [
      { role: "HEADLINE", text: "HÈ BAY LÊN", confidence: 1.0, evidence: "User title" },
    ],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "BALANCED",
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
  };

  const resE = SimpleInputAdapterService.adapt(reqE, createFixtureRouting([], intentE));
  assert(resE.copyItems.some((c) => c.type === "headline" && c.text === "HÈ BAY LÊN"), "Case E: Headline 'HÈ BAY LÊN' mapped to copyItems");

  // ── TEST CASE F: Product Names Without Unsafe Binding ─────────────
  const intentF: StructuredInputIntentV1 = {
    core_creative_intent: "Poster hai sản phẩm Matcha Cloud và Coffee Cream",
    global_visual_language: "commercial",
    extracted_copy_items: [
      { role: "PRODUCT_NAME", text: "Matcha Cloud", confidence: 1.0, evidence: "User text" },
      { role: "PRODUCT_NAME", text: "Coffee Cream", confidence: 1.0, evidence: "User text" },
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

  const resF = SimpleInputAdapterService.adapt({ concept: "Poster hai sản phẩm", useCase: "Poster", aspectRatio: "4:5", images: [{ reference_id: "REF_01" }, { reference_id: "REF_02" }] }, createFixtureRouting([], intentF));
  assert(resF.copyItems.filter((c) => c.type === "product_name").length === 2, "Case F: Product names preserved as product_name copy items without unsafe binding");

  // ── TEST CASE G: Hard Requirements ────────────────────────────────
  const intentG: StructuredInputIntentV1 = {
    core_creative_intent: "Poster giữ nguyên màu chai",
    global_visual_language: "commercial",
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: ["Không đổi màu chai"],
    local_attributes: [],
    creative_freedom_level: "STRICT",
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
  };

  const resG = SimpleInputAdapterService.adapt({ concept: "Poster giữ nguyên màu chai", useCase: "Poster", aspectRatio: "4:5", images: [{ reference_id: "REF_01" }] }, createFixtureRouting([], intentG));
  assert(resG.hardRequirements.includes("Không đổi màu chai"), "Case G: Hard requirements mapped to hardRequirements array");

  // ── TEST CASE H: No Brand Evidence ────────────────────────────────
  const intentH: StructuredInputIntentV1 = {
    core_creative_intent: "Poster sản phẩm không nhãn hiệu",
    global_visual_language: "commercial",
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    creative_freedom_level: "BALANCED",
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
  };

  const resH = SimpleInputAdapterService.adapt({ concept: "Poster sản phẩm", useCase: "Poster", aspectRatio: "4:5", images: [{ reference_id: "REF_01" }] }, createFixtureRouting([], intentH));
  assert(resH.brandName === undefined, "Case H: brandName is undefined when no evidence");
  assert(resH.brandInfo === undefined, "Case H: brandInfo is undefined without hallucination");

  // ── TEST CASE I: 1000-char Valid Concept ─────────────────────────
  const valid1000Concept = "A".repeat(1000);
  const resI = SimpleInputAdapterService.adapt({ concept: valid1000Concept, useCase: "Poster", aspectRatio: "4:5", images: [{ reference_id: "REF_01" }] }, createFixtureRouting([], intentH));
  assert(resI.success === true, "Case I: 1000-character concept passes adaptation cleanly");
  assert(resI.diagnostics.rawConceptChars === 1000, "Case I: rawConceptChars === 1000 recorded in diagnostics");

  // ── TEST CASE J: >1000-char Invalid Concept ──────────────────────
  const invalid1050Concept = "B".repeat(1050);
  const resJ = SimpleInputAdapterService.adapt({ concept: invalid1050Concept, useCase: "Poster", aspectRatio: "4:5", images: [{ reference_id: "REF_01" }] }, createFixtureRouting([], intentH));
  assert(resJ.success === false, "Case J: >1000-character concept fails adaptation");
  assert(resJ.status === "INVALID_REQUEST", "Case J: Returns status 'INVALID_REQUEST'");

  // ── TEST K: Synthetic MasterPromptCompilerInput Integration ──────
  assert(resA.compilerInput !== undefined, "Synthetic Compiler Input: compilerInput generated");
  assert(resA.compilerInput?.productCount === 2, "Synthetic Compiler Input: productCount === 2");
  assert(resA.compilerInput?.brief === resA.compilerBrief, "Synthetic Compiler Input: brief populated from GenerationIntentBrief");
  assert(resA.compilerInput?.useCase === "Poster", "Synthetic Compiler Input: useCase === 'Poster'");
  assert(resA.compilerInput?.aspectRatio === "4:5", "Synthetic Compiler Input: aspectRatio === '4:5'");

  console.log("\n=========================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 3 TESTS PASSED SUCCESSFULLY!`);
  console.log("=========================================================\n");
}

runSimpleInputV3Tests().catch((err) => {
  console.error("❌ PHASE 3 TEST SUITE FAILED:", err);
  process.exit(1);
});
