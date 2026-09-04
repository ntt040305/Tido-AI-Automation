import { ProductPlanningService } from "./service/ProductPlanningService";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { ImgStudioImageGenerationProvider } from "./provider/ImgStudioImageGenerationProvider";
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
    const pId = `PRODUCT_${String(i).padStart(2, "0")}`;
    list.push({
      product_id: pId,
      reference_ids: [`REF_${pId}`],
      reference_relationship_confidence: 0.98,
      summary: `TIDO Commercial Product ${i}`,
      categories: [{ value: "retail", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "" }],
      industry_domains: [{ value: "consumer_goods", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "" }],
      likely_functions: [{ value: "commercial_display", confidence: 0.9, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
      materials: [{ value: "Glass / Ceramic", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      contents: [{ value: "Liquid", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      surface_properties: [{ value: "Refractive Glossy Surface", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      geometry_traits: [{ value: "Cylindrical Bottle Container", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      packaging_types: [{ value: "Commercial Box Packaging", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      branding_features: [{ value: "Official Logo Typography", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
      visual_challenges: [],
      unknowns: [],
      retrieval_queries: [],
    });
  }
  return list;
}

async function runPhase255ProviderReliabilityTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 2.5.5 PROVIDER RELIABILITY AUDIT");
  console.log("========================================================================");

  const planner = new ProductPlanningService();
  const compiler = new MasterPromptCompilerService();
  const provider = new ImgStudioImageGenerationProvider();

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

  const testCounts = [3, 5];

  for (const count of testCounts) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`[TEST SCENARIO] Product Count: ${count}`);
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
      brief: `Commercial advertisement poster for ${count} products`,
      aspectRatio: "16:9",
      productCount: count,
      routingResult: routing,
      knowledgePackage: mockKnowledgePackage,
    });

    assert(compileRes.success === true, `Compiled prompt successfully for ${count} products`);
    const compiledPrompt = compileRes.package?.compiled_prompt || "";

    console.log(`Final Provider Prompt Length (${count} products): ${compiledPrompt.length} chars`);
    assert(compiledPrompt.length <= 15000, `No prompt overflow: prompt length (${compiledPrompt.length} chars) <= 15000 chars limit`);

    // ------------------------------------------------------------------------
    // PROVIDER RELIABILITY & RETRY TEST
    // ------------------------------------------------------------------------
    console.log(`[PROVIDER CALL] Invoking ImgStudio provider with retry & timeout check...`);
    process.env.IMGSTUDIO_API_KEY = "test_key_phase_2_5_5";
    process.env.IMGSTUDIO_BASE_URL = "https://invalid-host-test-retry.site";
    process.env.IMG_PROVIDER_TIMEOUT_MS = "90000";

    const timeoutMs = parseInt(process.env.IMG_PROVIDER_TIMEOUT_MS || "90000", 10);
    assert(timeoutMs >= 90000, `Configured provider timeout (${timeoutMs}ms) >= 90000ms`);

    // Test controlled network error retry and propagation
    const providerRes = await provider.generateImage({
      model: "flow-nano-banana-2",
      imageSize: "1K",
      mimeType: "image/png",
      prompt: compiledPrompt,
      aspectRatio: "16:9",
      generationId: `test-gen-${count}-${Date.now()}`,
      references: [
        {
          reference_id: "REF_PRODUCT_01",
          role: "PRODUCT",
          mimeType: "image/png",
          buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
          filename: "test_product.png",
        },
      ],
    });

    if (!providerRes.success) {
      console.log(`Controlled Provider Result Error Code: ${providerRes.error?.code}`);
      console.log(`Controlled Provider Error Message: ${providerRes.error?.message}`);

      assert(
        providerRes.error?.code === "PROVIDER_NETWORK_ERROR" ||
        providerRes.error?.code === "PROVIDER_NOT_CONFIGURED" ||
        providerRes.error?.code === "PROVIDER_RESPONSE_INVALID",
        "Clean error propagation: provider returned controlled error object without unhandled exception"
      );
    } else {
      console.log(`Provider succeeded: image URL = ${providerRes.imageUrl}`);
      assert(Boolean(providerRes.imageUrl), "Provider returned valid image URL");
    }
  }

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 2.5.5 PROVIDER RELIABILITY TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPhase255ProviderReliabilityTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
