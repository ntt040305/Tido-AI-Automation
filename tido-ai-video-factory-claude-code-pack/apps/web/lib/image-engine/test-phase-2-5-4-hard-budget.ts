import { ProductPlanningService } from "./service/ProductPlanningService";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { PromptBudgetManagerService } from "./service/PromptBudgetManagerService";
import { RoutingResultSchema, KnowledgePackageV1, ProductRoutingEntry } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function generateMockProducts(count: number): ProductRoutingEntry[] {
  const list: ProductRoutingEntry[] = [];
  for (let i = 1; i <= count; i++) {
    const pId = `PRODUCT_${String(i).padStart(3, "0")}`;
    list.push({
      product_id: pId,
      reference_ids: [`REF_${pId}`],
      reference_relationship_confidence: 0.98,
      summary: `Commercial Product Asset ${i}`,
      categories: [{ value: "retail", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "" }],
      industry_domains: [{ value: "consumer_goods", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "" }],
      likely_functions: [{ value: "commercial_display", confidence: 0.9, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
      materials: [{ value: "Glossy Refractive Finish", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      contents: [{ value: "Product Liquid / Core", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      surface_properties: [{ value: "Specular Refractive Surface", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      geometry_traits: [{ value: "Cylindrical Bottle Packaging", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      packaging_types: [{ value: "Box Container Packaging", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      branding_features: [{ value: "Official Logo Typography", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      visual_challenges: [],
      unknowns: [],
      retrieval_queries: [],
    });
  }
  return list;
}

async function runPhase254HardBudgetAcceptanceTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 2.5.4 HARD PROMPT BUDGET SYSTEM AUDIT");
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

  const testCounts = [1, 10, 50, 100];

  for (const count of testCounts) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`[ACCEPTANCE SCENARIO] Testing Product Count: ${count}`);
    console.log(`------------------------------------------------------------------------`);

    const products = generateMockProducts(count);
    const routing: RoutingResultSchema = {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: false,
      routing_summary: `Lineup of ${count} TIDO Commercial Products`,
      products,
      asset_roles: products.map((p) => ({ reference_id: `REF_${p.product_id}`, role: "PRODUCT", confidence: 1.0 })),
      global_retrieval_queries: [],
    };

    const productManifest = planner.buildProductManifest(routing, count);

    // Verify dynamic product scaling modes per requirement 3
    if (count === 1) {
      assert(productManifest.compression_mode === "HIGH", "1 product scaled to HIGH mode");
    } else if (count <= 10) {
      assert(productManifest.compression_mode === "MEDIUM", `${count} products scaled to MEDIUM mode`);
    } else {
      assert(productManifest.compression_mode === "CATALOG", `${count} products scaled to CATALOG mode`);
    }

    routing.reference_manifest = {
      relationship_type: productManifest.relationship_type,
      total_references: count,
      detected_products_count: count,
      detected_logos_count: 0,
      same_product_views_count: 0,
      identity_rules: [],
      product_identity_locks: [],
      logo_locks: [],
      product_manifest: productManifest,
    } as any;

    const compileRes = await compiler.compile({
      useCase: "Poster",
      brief: `Luxury commercial advertisement showcase for ${count} product items`,
      aspectRatio: "16:9",
      productCount: count,
      routingResult: routing,
      knowledgePackage: mockKnowledgePackage,
    });

    assert(compileRes.success === true, `Compiled successfully for ${count} product(s) without PROMPT_BUDGET_EXCEEDED error`);

    const finalPrompt = compileRes.package?.compiled_prompt || "";
    console.log(`Final Provider Prompt Length (${count} products): ${finalPrompt.length} chars`);

    assert(finalPrompt.length <= 15000, `Final prompt length (${finalPrompt.length} chars) <= 15000 emergency limit`);
    assert(finalPrompt.length <= 20000, `Final prompt length (${finalPrompt.length} chars) <= 20000 hard maximum`);

    // Verify Identity Preservation
    assert(finalPrompt.includes("LOCK [PRODUCT_001]"), `Identity Lock Guarantee: PRODUCT_001 lock present for ${count} products`);
    if (count > 1) {
      const lastId = `PRODUCT_${String(count).padStart(3, "0")}`;
      assert(finalPrompt.includes(`LOCK [${lastId}]`), `Identity Lock Guarantee: ${lastId} lock present for ${count} products`);
    }
  }

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 2.5.4 HARD PROMPT BUDGET SYSTEM TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPhase254HardBudgetAcceptanceTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
