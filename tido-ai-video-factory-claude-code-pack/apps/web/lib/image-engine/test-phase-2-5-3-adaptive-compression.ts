import { ProductPlanningService } from "./service/ProductPlanningService";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";
import { PromptCompressionService } from "./compiler/PromptCompressionService";
import { RoutingResultSchema, KnowledgePackageV1, ProductRoutingEntry } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function makeMockProduct(id: string, name: string): ProductRoutingEntry {
  return {
    product_id: id,
    reference_ids: [`REF_${id}`],
    reference_relationship_confidence: 0.98,
    summary: name,
    categories: [{ value: "commercial", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Packaging label observed" }],
    industry_domains: [{ value: "retail", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Retail box observed" }],
    likely_functions: [{ value: "use", confidence: 0.9, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
    materials: [{ value: "Glass / Plastic", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
    contents: [{ value: "Liquid", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
    surface_properties: [{ value: "Glossy Refractive Surface", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
    geometry_traits: [{ value: "Cylindrical Bottle Container", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
    packaging_types: [{ value: "Commercial Box Packaging", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
    branding_features: [{ value: "Official Logo Typography", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
    visual_challenges: [],
    unknowns: [],
    retrieval_queries: [],
  };
}

async function runAdaptiveCompressionAcceptanceTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 2.5.3 ADAPTIVE IDENTITY COMPRESSION AUDIT");
  console.log("========================================================================");

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
  // 1. SINGLE PRODUCT MODE (Target Product Count = 1) -> HIGH DETAIL
  // ------------------------------------------------------------------
  console.log("\n[TEST 1] Single Product Mode (HIGH Identity Detail)");
  const singleRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "Single TIDO Coffee Product",
    products: [makeMockProduct("PRODUCT_01", "TIDO Cold Brew Bottle")],
    asset_roles: [{ reference_id: "REF_PRODUCT_01", role: "PRODUCT", confidence: 1.0 }],
    global_retrieval_queries: [],
  };

  const singleManifest = planner.buildProductManifest(singleRouting, 1);
  assert(singleManifest.compression_mode === "HIGH", "Single product mode selected HIGH compression_mode");
  assert(singleManifest.compact_identity_locks[0].includes("Shape:"), "HIGH detail contains multi-line attribute breakdown");

  // ------------------------------------------------------------------
  // 2. MULTI PRODUCT MODE (Target Product Count = 2-3) -> MEDIUM COMPACT
  // ------------------------------------------------------------------
  console.log("\n[TEST 2] Multi Product Mode (MEDIUM Compact Identity)");
  const multiRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Skincare Trio Set",
    products: [
      makeMockProduct("PRODUCT_01", "Glow Serum"),
      makeMockProduct("PRODUCT_02", "Day Lotion"),
      makeMockProduct("PRODUCT_03", "Night Cream"),
    ],
    asset_roles: [
      { reference_id: "REF_PRODUCT_01", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_PRODUCT_02", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_PRODUCT_03", role: "PRODUCT", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const multiManifest = planner.buildProductManifest(multiRouting, 3);
  assert(multiManifest.compression_mode === "MEDIUM", "Multi product (3 items) selected MEDIUM compression_mode");
  assert(multiManifest.compact_identity_locks.length === 3, "Contains 3 compact identity locks");

  // ------------------------------------------------------------------
  // 3. CATALOG MODE (Target Product Count > 10) -> CATALOG COMPACT
  // ------------------------------------------------------------------
  console.log("\n[TEST 3] Catalog Mode (CATALOG Ultra-Compact Identity)");
  const catalogProducts = [];
  for (let i = 1; i <= 12; i++) {
    catalogProducts.push(makeMockProduct(`PRODUCT_${String(i).padStart(2, "0")}`, `Item ${i}`));
  }

  const catalogRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO 12-Item Catalog Lineup",
    products: catalogProducts,
    asset_roles: catalogProducts.map((p) => ({ reference_id: `REF_${p.product_id}`, role: "PRODUCT", confidence: 1.0 })),
    global_retrieval_queries: [],
  };

  const catalogManifest = planner.buildProductManifest(catalogRouting, 12);
  assert(catalogManifest.compression_mode === "CATALOG", "Catalog mode (12 items) selected CATALOG compression_mode");
  assert(catalogManifest.compact_identity_locks[0].includes("Preserve silhouette"), "CATALOG lock is ultra-compact 1-line lock");

  // ------------------------------------------------------------------
  // 4. METADATA FILTERING & PROMPT BUDGET VERIFICATION
  // ------------------------------------------------------------------
  console.log("\n[TEST 4] Master Prompt Budget & Metadata Filtering");
  catalogRouting.reference_manifest = {
    relationship_type: catalogManifest.relationship_type,
    total_references: 12,
    detected_products_count: 12,
    detected_logos_count: 0,
    same_product_views_count: 0,
    identity_rules: [],
    product_identity_locks: [],
    logo_locks: [],
    product_manifest: catalogManifest,
  } as any;

  const compileRes = await compiler.compile({
    useCase: "Poster",
    brief: "Commercial catalog visual arrangement of all 12 TIDO product lines",
    aspectRatio: "16:9",
    productCount: 12,
    routingResult: catalogRouting,
    knowledgePackage: mockKnowledgePackage,
  });

  assert(compileRes.success === true, "Compiler executed successfully for 5-product catalog");
  const compiledPrompt = compileRes.package?.compiled_prompt || "";

  console.log(`Final Provider Prompt Length: ${compiledPrompt.length} chars`);
  assert(compiledPrompt.length <= 18000, `Final provider prompt length (${compiledPrompt.length} chars) <= 18000 normal budget ceiling`);
  assert(compiledPrompt.length <= 20000, `Final provider prompt length (${compiledPrompt.length} chars) <= 20000 absolute hard limit`);

  // Verify Metadata Filtering
  assert(!compiledPrompt.includes("evidence_type"), "Filter check: evidence_type is NOT in provider prompt");
  assert(!compiledPrompt.includes("confidence:"), "Filter check: confidence scores are NOT in provider prompt");
  assert(!compiledPrompt.includes("INTERNAL STRATEGY EXPLANATION"), "Filter check: internal marketing explanation is NOT in provider prompt");
  assert(!compiledPrompt.includes("## INTERNAL FINAL CHECK"), "Filter check: internal AI checklist is NOT in provider prompt");

  // Verify Identity Lock Guarantee
  assert(compiledPrompt.includes("LOCK [PRODUCT_01]"), "Identity Lock Guarantee: PRODUCT_01 lock is present");
  assert(compiledPrompt.includes("LOCK [PRODUCT_12]"), "Identity Lock Guarantee: PRODUCT_12 lock is present");

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 2.5.3 ADAPTIVE COMPRESSION ACCEPTANCE TESTS PASSED (100%)");
  console.log("========================================================================");
}

runAdaptiveCompressionAcceptanceTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
