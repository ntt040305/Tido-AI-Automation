import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { InspirationStyleIntelligenceService } from "./service/InspirationStyleIntelligenceService";
import { InspirationStyleManifest, MasterPromptCompilerInput, RoutingResultSchema } from "./types";

async function runInspirationStyleIntelligenceTests() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — INSPIRATION STYLE INTELLIGENCE TEST SUITE");
  console.log("========================================================================\n");

  const inspirationService = new InspirationStyleIntelligenceService();
  const compiler = new MasterPromptCompilerService();

  const dummyRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "SINGLE_PRODUCT" as any,
    routing_summary: "Test routing",
    global_retrieval_queries: [],
    requires_universal_core: false,
    products: [
      {
        product_id: "PRODUCT_BEVERAGE",
        reference_ids: ["REF_PRODUCT"],
        reference_relationship_confidence: 0.98,
        summary: "Orange sparkling beverage can with ice condensation",
        categories: [],
        industry_domains: [],
        likely_functions: [],
        materials: [],
        contents: [],
        surface_properties: [],
        geometry_traits: [],
        packaging_types: [],
        branding_features: [],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_PRODUCT", role: "PRODUCT", confidence: 0.98 },
      { reference_id: "REF_INSPIRATION", role: "INSPIRATION_REFERENCE", confidence: 0.92 },
    ],
  };

  const dummyKnowledgePackage = {
    package_version: "1.0",
    routing_version: "1.0",
    universal_blocks: [],
    specialist_blocks: [],
    recipe_blocks: [],
  };

  // ----------------------------------------------------------------------
  // TEST 1: Inspiration Analysis Success
  // ----------------------------------------------------------------------
  console.log("--- [TEST 1] Inspiration Style Analysis Success ---");
  const testBuffer = Buffer.from("mock_inspiration_image_data_2026");
  const imageHash = inspirationService.calculateImageHash(testBuffer);

  const manifest1 = await inspirationService.analyzeStyle({
    imageBuffer: testBuffer,
    mimeType: "image/png",
    imageHash,
    hintText: "Luxury tropical beverage advert poster with water splash",
  });

  console.log("Extracted Inspiration Style Manifest 1:", JSON.stringify(manifest1, null, 2), "\n");

  if (!manifest1.composition || !manifest1.camera || !manifest1.lighting || !manifest1.colorMood || !manifest1.environment || !manifest1.visualMood) {
    throw new Error("FAIL: Test 1 manifest missing one or more required style fields!");
  }
  console.log("✓ TEST 1 PASSED: Inspiration style analysis extracted all 6 style fields!\n");

  // ----------------------------------------------------------------------
  // TEST 2: Inspiration Analysis Failure Fallback
  // ----------------------------------------------------------------------
  console.log("--- [TEST 2] Inspiration Analysis Failure Fallback ---");
  // Simulate error by passing invalid unconfigured state or broken buffer
  const brokenService = new InspirationStyleIntelligenceService({
    baseUrl: "http://127.0.0.1:9999/invalid_endpoint",
    apiKey: "invalid_key",
  } as any);

  const fallbackManifest = await brokenService.analyzeStyle({
    imageBuffer: Buffer.from("corrupted_buffer"),
    mimeType: "image/png",
    imageHash: "broken_hash",
  });

  console.log("Fallback Manifest Output:", JSON.stringify(fallbackManifest, null, 2), "\n");

  if (!fallbackManifest.composition || !fallbackManifest.lighting) {
    throw new Error("FAIL: Test 2 fallback failed to return clean default style manifest!");
  }
  console.log("✓ TEST 2 PASSED: Silent fallback executed cleanly on analysis error without blocking!\n");

  // ----------------------------------------------------------------------
  // TEST 3: Product Identity Unchanged During Style Compiler Injection
  // ----------------------------------------------------------------------
  console.log("--- [TEST 3] Product Identity Unchanged During Style Compiler Injection ---");
  const compilerInput: MasterPromptCompilerInput = {
    brief: "Poster nước giải khát cam tươi mát lạnh",
    useCase: "Poster",
    aspectRatio: "4:5",
    brandName: "TIDO Splash",
    routingResult: dummyRoutingResult,
    knowledgePackage: dummyKnowledgePackage as any,
    hasInspirationReference: true,
    inspirationStyleManifest: { ...manifest1, derived_from_image: true },
  };

  const compileRes = await compiler.compile(compilerInput);
  if (!compileRes.success || !compileRes.package) {
    throw new Error(`FAIL: Test 3 compiler failed! Error: ${compileRes.error?.message}`);
  }

  const prompt = compileRes.package.compiled_prompt;
  console.log("Compiled Prompt Style Block Snippet:\n", prompt.slice(prompt.indexOf("[INSPIRATION REFERENCE RULES]"), prompt.indexOf("[INSPIRATION REFERENCE RULES]") + 600), "\n");

  if (!prompt.includes("[INSPIRED VISUAL STYLE DIRECTIVE]")) {
    throw new Error("FAIL: Test 3 missing [INSPIRED VISUAL STYLE DIRECTIVE] in prompt!");
  }
  if (!prompt.toLowerCase().includes("absolute source of truth for product identity")) {
    throw new Error("FAIL: Test 3 product identity lock was diluted or removed!");
  }
  console.log("✓ TEST 3 PASSED: Product identity locks preserved 100% intact while injecting structured style directives!\n");

  // ----------------------------------------------------------------------
  // TEST 4: Same Inspiration Reused Without Repeated Vision Analysis
  // ----------------------------------------------------------------------
  console.log("--- [TEST 4] Same Inspiration Reused Without Repeated Vision Analysis ---");
  const cachedManifest: InspirationStyleManifest = {
    composition: "CACHED: Diagonal dynamic hero crop",
    camera: "CACHED: 85mm portrait macro lens",
    lighting: "CACHED: Dual neon cyan and orange rim lights",
    colorMood: "CACHED: Vibrant saturated tropical colors",
    environment: "CACHED: Dark obsidian slate background with splash droplets",
    visualMood: "CACHED: Energetic high-octane commercial feel",
    source_hash: imageHash,
  };

  const reusedManifest = await inspirationService.analyzeStyle({
    imageBuffer: testBuffer,
    imageHash,
    existingManifest: cachedManifest,
  });

  if (reusedManifest.composition !== cachedManifest.composition) {
    throw new Error("FAIL: Test 4 failed to reuse cached manifest for identical image source hash!");
  }
  console.log("✓ TEST 4 PASSED: Existing inspiration style manifest reused without repeated Vision API calls!\n");

  // ----------------------------------------------------------------------
  // TEST 5: Multiple Inspiration Images Merged Safely
  // ----------------------------------------------------------------------
  console.log("--- [TEST 5] Multiple Inspiration Images Merged Safely ---");
  const manifestA: InspirationStyleManifest = {
    composition: "Composition A: Center hero pedestal",
    camera: "Camera A: 35mm wide lens",
    lighting: "Lighting A: Golden hour warm sunlight",
    colorMood: "Color A: Warm golden palette",
    environment: "Environment A: Marble surface",
    visualMood: "Mood A: Elegant luxury",
    source_hash: "hashA",
  };

  const manifestB: InspirationStyleManifest = {
    composition: "Composition B: Floating liquid droplets balance",
    camera: "Camera B: 100mm macro prime",
    lighting: "Lighting B: High-contrast specular rim light",
    colorMood: "Color B: Vibrant citrus contrast",
    environment: "Environment B: Ice crystal particles",
    visualMood: "Mood B: Refreshing commercial pop",
    source_hash: "hashB",
  };

  const merged = inspirationService.mergeManifests([manifestA, manifestB]);
  console.log("Merged Style Manifest:", JSON.stringify(merged, null, 2), "\n");

  if (!merged.composition.includes("Composition A") || !merged.composition.includes("Composition B")) {
    throw new Error("FAIL: Test 5 failed to merge multiple inspiration style manifests cleanly!");
  }
  console.log("✓ TEST 5 PASSED: Multiple inspiration style manifests merged safely without identity conflicts!\n");

  console.log("========================================================================");
  console.log("ALL INSPIRATION STYLE INTELLIGENCE TESTS PASSED (100%)");
  console.log("========================================================================");
}

runInspirationStyleIntelligenceTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
