import { ProductIdentityResolver } from "./compiler/ProductIdentityResolver";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { RoutingResultSchema, KnowledgePackageV1 } from "./types";

console.log("==========================================================");
console.log("TIDO IMAGE ENGINE — DECOUPLED PRODUCT IDENTITY TEST SUITE");
console.log("==========================================================\n");

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASSED: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAILED: ${testName}`);
    failedCount++;
  }
}

const mockUniversalBlocks = [
  { id: "universal.commercial_visual_hierarchy", version: "1.0.1", title: "Visual Hierarchy", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 232 },
  { id: "universal.camera_perspective_coherence", version: "1.0.1", title: "Perspective Coherence", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 240 },
  { id: "universal.lighting_material_readability", version: "1.0.1", title: "Lighting & Material Readability", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 247 },
  { id: "universal.typography_graphic_integration", version: "1.0.1", title: "Typography Integration", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 235 },
  { id: "universal.physical_scene_coherence", version: "1.0.1", title: "Physical Scene Coherence", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 248 },
];

const mockKnowledgePackage: any = {
  package_version: "1.0",
  routing_version: "1.0",
  retrieval_mode: "HYBRID",
  requires_universal_core: true,
  universal_blocks: mockUniversalBlocks,
  selected_blocks: [],
  retrieved_at: new Date().toISOString(),
};

async function runTests() {
  console.log("🔹 1. Section 9 Regression Matrix Tests");

  // MATRIX A: 1 visible instance, 2 refs, STRONG SAME_IDENTITY -> 1 identity / 2 refs
  {
    const routing: RoutingResultSchema = {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: true,
      products: [
        {
          product_id: "PRODUCT_01",
          reference_ids: ["REF_01", "REF_02"],
          reference_relationship_confidence: 0.95,
          summary: "Front and back of same product bottle",
          categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [],
        },
      ],
      global_retrieval_queries: [],
      routing_summary: "Strong same identity test",
    };

    const pkg = ProductIdentityResolver.resolve(routing, ["REF_01", "REF_02"]);
    assert(pkg.distinctProductCount === 1, "Matrix A: 1 visible instance + 2 refs (STRONG SAME_IDENTITY) -> 1 identity");
    assert(pkg.groups[0].reference_ids.length === 2, "Matrix A: Both references bound under PRODUCT_01");
    assert(pkg.isSameIdentityMergeAllowed === true, "Matrix A: isSameIdentityMergeAllowed === true");
  }

  // MATRIX B: 1 visible instance, 2 refs, DISTINCT_IDENTITY -> 2 identities, NEVER merge
  {
    const routing: RoutingResultSchema = {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: true,
      products: [
        { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "Tea A", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
        { product_id: "PRODUCT_02", reference_ids: ["REF_02"], reference_relationship_confidence: 1.0, summary: "Tea B", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
      ],
      global_retrieval_queries: [],
      routing_summary: "Distinct identity test",
    };

    const pkg = ProductIdentityResolver.resolve(routing, ["REF_01", "REF_02"]);
    assert(pkg.distinctProductCount === 2, "Matrix B: 1 visible instance + 2 refs (DISTINCT_IDENTITY) -> 2 identities (NEVER merge)");
    assert(pkg.groups[0].product_id === "PRODUCT_01" && pkg.groups[1].product_id === "PRODUCT_02", "Matrix B: Preserves PRODUCT_01 & PRODUCT_02 separation");

    // Compiler verification: requestedProductCount = 1 vs distinctProductCount = 2 returns conflict
    const compiler = new MasterPromptCompilerService();
    const result = await compiler.compile({
      routingResult: routing,
      knowledgePackage: mockKnowledgePackage,
      productReferences: ["REF_01", "REF_02"],
      productCount: 1, // productCount = 1 requested, but 2 distinct identities exist!
    });

    assert(result.success === false, "Matrix B: Compiler refuses to falsely merge distinct identities to satisfy productCount = 1");
    assert(result.error?.code === "PRODUCT_INSTANCE_CONFLICT", "Matrix B: Correctly returns PRODUCT_INSTANCE_CONFLICT error");
  }

  // MATRIX C: 1 visible instance, 2 refs, AMBIGUOUS -> conservative separation -> NEVER merge from productCount
  {
    const routing: RoutingResultSchema = {
      routing_version: "1.0",
      routing_mode: "PARTIAL_CONFIDENCE",
      requires_universal_core: true,
      products: [
        {
          product_id: "PRODUCT_01",
          reference_ids: ["REF_01", "REF_02"],
          reference_relationship_confidence: 0.50, // Ambiguous / Weak merge
          summary: "Ambiguous products",
          categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [],
        },
      ],
      global_retrieval_queries: [],
      routing_summary: "Ambiguous test",
    };

    // Note: productCount = 1 is requested, but resolver DOES NOT merge!
    const pkg = ProductIdentityResolver.resolve(routing, ["REF_01", "REF_02"]);
    assert(pkg.distinctProductCount === 2, "Matrix C: 1 visible instance + 2 refs (AMBIGUOUS) -> Conservative separation into 2 identities");
    assert(!pkg.isSameIdentityMergeAllowed, "Matrix C: isSameIdentityMergeAllowed === false (NEVER merge from productCount)");
  }

  // MATRIX D: 2 visible instances, 2 refs, DISTINCT_IDENTITY -> PRODUCT_01 -> REF_01, PRODUCT_02 -> REF_02
  {
    const routing: RoutingResultSchema = {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: true,
      products: [
        { product_id: "PRODUCT_01", reference_ids: ["REF_01"], reference_relationship_confidence: 1.0, summary: "Product A", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
        { product_id: "PRODUCT_02", reference_ids: ["REF_02"], reference_relationship_confidence: 1.0, summary: "Product B", categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [] },
      ],
      global_retrieval_queries: [],
      routing_summary: "2P / 2R distinct test",
    };

    const pkg = ProductIdentityResolver.resolve(routing, ["REF_01", "REF_02"]);
    assert(pkg.distinctProductCount === 2, "Matrix D: 2 visible instances + 2 refs (DISTINCT_IDENTITY) -> 2 distinct identities");
    assert(pkg.groups[0].product_id === "PRODUCT_01" && pkg.groups[0].reference_ids[0] === "REF_01", "Matrix D: PRODUCT_01 -> REF_01");
    assert(pkg.groups[1].product_id === "PRODUCT_02" && pkg.groups[1].reference_ids[0] === "REF_02", "Matrix D: PRODUCT_02 -> REF_02");
  }

  // MATRIX E: 2 visible instances, 2 refs, STRONG SAME_IDENTITY -> 1 identity, 2 visible instances of same product is valid
  {
    const routing: RoutingResultSchema = {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: true,
      products: [
        {
          product_id: "PRODUCT_01",
          reference_ids: ["REF_01", "REF_02"],
          reference_relationship_confidence: 0.95, // STRONG EVIDENCE
          summary: "Front and back of same beverage bottle",
          categories: [], industry_domains: [], likely_functions: [], materials: [], contents: [], surface_properties: [], geometry_traits: [], packaging_types: [], branding_features: [], visual_challenges: [], unknowns: [], retrieval_queries: [],
        },
      ],
      global_retrieval_queries: [],
      routing_summary: "Same product 2 instances test",
    };

    const compiler = new MasterPromptCompilerService();
    const result = await compiler.compile({
      routingResult: routing,
      knowledgePackage: mockKnowledgePackage,
      productReferences: ["REF_01", "REF_02"],
      productCount: 2, // 2 visible instances requested of 1 proven product identity
    });

    assert(result.success === true, "Matrix E: Compilation succeeds for 2 visible instances of 1 proven identity");
    assert(
      result.package?.compiled_prompt?.includes("2 product instances of the SAME product identity (PRODUCT_01)") ?? false,
      "Matrix E: Emits '2 product instances of the SAME product identity (PRODUCT_01)'"
    );
  }

  console.log(`\nResults: ${passedCount} PASSED, ${failedCount} FAILED.`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();
