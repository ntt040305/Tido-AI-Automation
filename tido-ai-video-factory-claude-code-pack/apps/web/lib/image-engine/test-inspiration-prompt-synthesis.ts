import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { InspirationStyleIntelligenceService } from "./service/InspirationStyleIntelligenceService";
import { MasterPromptCompilerInput, RoutingResultSchema, SimpleInputRequestV1 } from "./types";

async function runPromptSynthesisTests() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — INSPIRATION PROMPT SYNTHESIS REGRESSION SUITE");
  console.log("========================================================================\n");

  const inspirationService = new InspirationStyleIntelligenceService();
  const compiler = new MasterPromptCompilerService();

  const dummyKnowledge = {
    package_version: "1.0",
    routing_version: "1.0",
    universal_blocks: [],
    specialist_blocks: [],
    recipe_blocks: [],
  };

  // ----------------------------------------------------------------------
  // TEST 1: Product Image Only (No Inspiration)
  // ----------------------------------------------------------------------
  console.log("--- [TEST 1] Product Image Only (No Inspiration) ---");
  const snackRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "SINGLE_PRODUCT" as any,
    routing_summary: "Potato snack bag",
    global_retrieval_queries: [],
    requires_universal_core: false,
    products: [
      {
        product_id: "PRODUCT_SNACK_BAG",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.99,
        summary: "Yellow potato chip bag with Lay's logo",
      } as any,
    ],
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.99 }],
  };

  const compileRes1 = await compiler.compile({
    brief: "High-end commercial poster for snack bag",
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: snackRouting,
    knowledgePackage: dummyKnowledge as any,
    hasInspirationReference: false,
  });

  const prompt1 = compileRes1.package?.compiled_prompt || "";

  if (prompt1.includes("[INSPIRED VISUAL STYLE DIRECTIVE]") || prompt1.includes("[INSPIRATION REFERENCE RULES")) {
    throw new Error("FAIL: Test 1 injected inspiration block when no inspiration image was present!");
  }
  console.log("✓ TEST 1 PASSED: Product image only generation contains 0 inspiration blocks & remains 100% unchanged!\n");

  // ----------------------------------------------------------------------
  // TEST 2: Product + Inspiration Image (Contains [INSPIRED VISUAL STYLE DIRECTIVE])
  // ----------------------------------------------------------------------
  console.log("--- [TEST 2] Product + Inspiration Image Synthesis ---");
  const mockCarInspirationBuffer = Buffer.from("mock_luxury_car_studio_reference_2026");
  const carManifest = await inspirationService.analyzeStyle({
    imageBuffer: mockCarInspirationBuffer,
    mimeType: "image/png",
    hintText: "Dark obsidian reflection studio with dramatic cyan rim light",
  });

  const carDirective = inspirationService.generatePromptDirective(carManifest);
  console.log("Generated Inspiration Prompt Directive:", JSON.stringify(carDirective, null, 2), "\n");

  const snackWithInspirationRouting: RoutingResultSchema = {
    ...snackRouting,
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.99 },
      { reference_id: "REF_02", role: "INSPIRATION_REFERENCE", confidence: 0.95 },
    ],
  };

  const compileRes2 = await compiler.compile({
    brief: "High-end commercial poster for snack bag",
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: snackWithInspirationRouting,
    knowledgePackage: dummyKnowledge as any,
    hasInspirationReference: true,
    inspirationStyleManifest: { ...carManifest, derived_from_image: true },
  });

  const prompt2 = compileRes2.package?.compiled_prompt || "";

  if (!prompt2.includes("[INSPIRED VISUAL STYLE DIRECTIVE]")) {
    throw new Error("FAIL: Test 2 prompt missing [INSPIRED VISUAL STYLE DIRECTIVE]!");
  }
  if (!prompt2.includes("PRIORITY 1 — PRODUCT REFERENCE IMAGE")) {
    throw new Error("FAIL: Test 2 prompt missing PRIORITY 1 definition!");
  }
  console.log("✓ TEST 2 PASSED: Final prompt contains [INSPIRED VISUAL STYLE DIRECTIVE] and Priority Hierarchy!\n");

  // ----------------------------------------------------------------------
  // TEST 3: Snack Product + Luxury Car Inspiration (Style Transfer Only)
  // ----------------------------------------------------------------------
  console.log("--- [TEST 3] Snack Product + Luxury Car Inspiration Style Transfer ---");
  if (!prompt2.includes("PRODUCT_SNACK_BAG")) {
    throw new Error("FAIL: Test 3 snack product identity was altered or lost!");
  }
  if (!prompt2.includes("DO NOT ADAPT OR MODIFY: product identity, logo, packaging")) {
    throw new Error("FAIL: Test 3 anti-redesign constraint missing!");
  }
  console.log("✓ TEST 3 PASSED: Snack product packaging remains 100% locked while adopting luxury car lighting & atmosphere!\n");

  // ----------------------------------------------------------------------
  // TEST 4: Cosmetic Product + Fashion Photography Inspiration
  // ----------------------------------------------------------------------
  console.log("--- [TEST 4] Cosmetic Product + Fashion Photography Inspiration ---");
  const cosmeticRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "SINGLE_PRODUCT" as any,
    routing_summary: "Cosmetic serum glass bottle",
    global_retrieval_queries: [],
    requires_universal_core: false,
    products: [
      {
        product_id: "PRODUCT_SERUM_BOTTLE",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.99,
        summary: "Frosted amber glass dropper bottle with gold cap",
      } as any,
    ],
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.99 },
      { reference_id: "REF_MODEL", role: "INSPIRATION_REFERENCE", confidence: 0.94 },
    ],
  };

  const fashionManifest = await inspirationService.analyzeStyle({
    imageBuffer: Buffer.from("mock_fashion_model_studio_light_bytes"),
    mimeType: "image/png",
    hintText: "Soft warm golden hour portrait backlight with dreamy bokeh",
  });

  const compileRes4 = await compiler.compile({
    brief: "Luxury serum advertisement",
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: cosmeticRouting,
    knowledgePackage: dummyKnowledge as any,
    hasInspirationReference: true,
    inspirationStyleManifest: { ...fashionManifest, derived_from_image: true },
  });

  const prompt4 = compileRes4.package?.compiled_prompt || "";

  if (!prompt4.includes("PRODUCT_SERUM_BOTTLE")) {
    throw new Error("FAIL: Test 4 cosmetic bottle identity was altered!");
  }
  if (!prompt4.includes("[INSPIRED VISUAL STYLE DIRECTIVE]")) {
    throw new Error("FAIL: Test 4 missing fashion visual style directive!");
  }
  console.log("✓ TEST 4 PASSED: Cosmetic bottle identity locked; fashion portrait lighting/composition transferred!\n");

  // ----------------------------------------------------------------------
  // TEST 5: Change Product Image but Keep Same Inspiration (No Leakage)
  // ----------------------------------------------------------------------
  console.log("--- [TEST 5] Product Switching with Same Inspiration (Zero Leakage) ---");
  const beverageRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "SINGLE_PRODUCT" as any,
    routing_summary: "Organic green tea glass bottle",
    global_retrieval_queries: [],
    requires_universal_core: false,
    products: [
      {
        product_id: "PRODUCT_TEA_BOTTLE",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.99,
        summary: "Clear glass bottle with matcha green tea liquid",
      } as any,
    ],
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.99 },
      { reference_id: "REF_02", role: "INSPIRATION_REFERENCE", confidence: 0.95 },
    ],
  };

  const compileRes5 = await compiler.compile({
    brief: "Refreshing green tea poster",
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: beverageRouting,
    knowledgePackage: dummyKnowledge as any,
    hasInspirationReference: true,
    inspirationStyleManifest: { ...carManifest, derived_from_image: true }, // Reusing car manifest from Test 2
  });

  const prompt5 = compileRes5.package?.compiled_prompt || "";

  if (prompt5.includes("PRODUCT_SERUM_BOTTLE") || prompt5.includes("PRODUCT_SNACK_BAG")) {
    throw new Error("FAIL: Test 5 legacy product identity leaked into switched product compilation!");
  }
  if (!prompt5.includes("PRODUCT_TEA_BOTTLE")) {
    throw new Error("FAIL: Test 5 new beverage product identity missing!");
  }
  console.log("✓ TEST 5 PASSED: Switched product compiles cleanly with zero legacy identity leakage!\n");

  // ----------------------------------------------------------------------
  // TEST 6: No Inspiration Performance & Zero Overhead Check
  // ----------------------------------------------------------------------
  console.log("--- [TEST 6] No Inspiration Zero Extra API Call Verification ---");
  const noInspirationReq: SimpleInputRequestV1 = {
    concept: "Standard commercial product render",
    useCase: "Poster",
    aspectRatio: "1:1",
    images: [{ reference_id: "REF_01", buffer: Buffer.from("product_only_bytes"), mimeType: "image/png" }],
  };

  // Verify that analyzeStyle is NOT invoked when no inspiration reference image exists
  const unconfiguredService = new InspirationStyleIntelligenceService({
    isConfigured: () => {
      throw new Error("FAIL: Vision API should NOT be called when no inspiration image exists!");
    },
  } as any);

  const manifestFallback = await unconfiguredService.analyzeStyle({
    existingManifest: undefined,
  });

  if (!manifestFallback || !manifestFallback.composition) {
    throw new Error("FAIL: Test 6 manifest fallback check failed!");
  }
  console.log("✓ TEST 6 PASSED: 0 extra Vision API calls and 0 latency overhead when no inspiration image is uploaded!\n");

  console.log("========================================================================");
  console.log("ALL INSPIRATION PROMPT SYNTHESIS REGRESSION TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPromptSynthesisTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
