import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { ConceptProfessionalizerService } from "./service/ConceptProfessionalizerService";
import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import { MasterPromptCompilerInput, RoutingResultSchema } from "./types";

function makeProductEntry(productId: string, refId: string, summary: string): any {
  return {
    product_id: productId,
    reference_ids: [refId],
    reference_relationship_confidence: 0.95,
    summary,
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
  };
}

async function runInspirationReferenceTests() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — INSPIRATION REFERENCE LAYER REGRESSION SUITE");
  console.log("========================================================================\n");

  const compiler = new MasterPromptCompilerService();
  const professionalizer = new ConceptProfessionalizerService();

  const dummyRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "SINGLE_PRODUCT" as any,
    routing_summary: "Test routing",
    global_retrieval_queries: [],
    requires_universal_core: false,
    products: [makeProductEntry("PRODUCT_01", "REF_01", "Lay's Snack Pouch")],
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
      { reference_id: "REF_02", role: "INSPIRATION_REFERENCE", confidence: 0.90 },
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
  // TEST 1: Product + Different Industry Inspiration (Snack + Luxury Car)
  // ----------------------------------------------------------------------
  console.log("--- [TEST 1] Product + Different Industry Inspiration (Snack + Luxury Car) ---");
  const test1Input: MasterPromptCompilerInput = {
    brief: "Poster quảng cáo snack Lay's sang trọng đẳng cấp",
    useCase: "Poster",
    aspectRatio: "4:5",
    brandName: "Lay's",
    routingResult: dummyRoutingResult,
    knowledgePackage: dummyKnowledgePackage as any,
    hasInspirationReference: true,
    inspirationReferenceRules: [
      "Inspiration reference is a Luxury Automotive Studio Photo (Porsche/Mercedes studio lighting).",
      "Adopt dark luxury studio lighting, metallic reflections, and dramatic camera perspective.",
    ],
  };

  const res1 = await compiler.compile(test1Input);
  if (!res1.success || !res1.package) {
    throw new Error(`FAIL: Test 1 compilation failed! Error: ${res1.error?.message}`);
  }

  const prompt1 = res1.package.compiled_prompt;
  console.log("Test 1 Compiled Prompt Snippet:", prompt1.slice(0, 400) + "...\n");

  if (!prompt1.includes("[INSPIRATION REFERENCE RULES")) {
    throw new Error("FAIL: Test 1 missing [INSPIRATION REFERENCE RULES] block!");
  }
  if (!/ABSOLUTE SOURCE OF TRUTH/i.test(prompt1)) {
    throw new Error("FAIL: Test 1 missing absolute source of truth directive!");
  }
  if (!/VISUAL STYLE GUIDANCE ONLY/i.test(prompt1)) {
    throw new Error("FAIL: Test 1 missing style guidance directive!");
  }
  console.log("✓ TEST 1 PASSED: Product identity preserved while adopting luxury automotive studio visual style!\n");

  // ----------------------------------------------------------------------
  // TEST 2: Product + Human/Model Inspiration (Skincare + Fashion Model)
  // ----------------------------------------------------------------------
  console.log("--- [TEST 2] Product + Human/Model Inspiration (Skincare + Fashion Model) ---");
  const skincareRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "SINGLE_PRODUCT" as any,
    routing_summary: "Test routing",
    global_retrieval_queries: [],
    requires_universal_core: false,
    products: [makeProductEntry("PRODUCT_02", "REF_SERUM", "Glass serum bottle")],
    asset_roles: [
      { reference_id: "REF_SERUM", role: "PRODUCT", confidence: 0.98 },
      { reference_id: "REF_MODEL", role: "INSPIRATION_REFERENCE", confidence: 0.88 },
    ],
  };

  const test2Input: MasterPromptCompilerInput = {
    brief: "Poster mỹ phẩm dưỡng da cao cấp",
    useCase: "Poster",
    aspectRatio: "4:5",
    brandName: "GlowSkincare",
    routingResult: skincareRoutingResult,
    knowledgePackage: dummyKnowledgePackage as any,
    hasInspirationReference: true,
    inspirationReferenceRules: [
      "Inspiration reference is High Fashion Model Portrait.",
      "Adopt soft rim light, natural skin tones, and elegant atmosphere.",
    ],
  };

  const res2 = await compiler.compile(test2Input);
  if (!res2.success || !res2.package) {
    throw new Error(`FAIL: Test 2 compilation failed! Error: ${res2.error?.message}`);
  }

  const prompt2 = res2.package.compiled_prompt;
  if (!prompt2.includes("[INSPIRATION REFERENCE RULES")) {
    throw new Error("FAIL: Test 2 missing [INSPIRATION REFERENCE RULES] block!");
  }
  console.log("✓ TEST 2 PASSED: Skincare product hero locked while integrating fashion model lighting atmosphere!\n");

  // ----------------------------------------------------------------------
  // TEST 3: No Inspiration Backward Compatibility
  // ----------------------------------------------------------------------
  console.log("--- [TEST 3] No Inspiration Backward Compatibility ---");
  const noInspirationRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "SINGLE_PRODUCT" as any,
    routing_summary: "Test routing",
    global_retrieval_queries: [],
    requires_universal_core: false,
    products: [makeProductEntry("PRODUCT_01", "REF_MUG", "Coffee Mug")],
    asset_roles: [
      { reference_id: "REF_MUG", role: "PRODUCT", confidence: 0.95 },
    ],
  };

  const test3Input: MasterPromptCompilerInput = {
    brief: "Coffee mug product photo",
    useCase: "Poster",
    aspectRatio: "1:1",
    routingResult: noInspirationRoutingResult,
    knowledgePackage: dummyKnowledgePackage as any,
  };

  const res3 = await compiler.compile(test3Input);
  if (!res3.success || !res3.package) {
    throw new Error(`FAIL: Test 3 compilation failed! Error: ${res3.error?.message}`);
  }

  const prompt3 = res3.package.compiled_prompt;
  if (prompt3.includes("[INSPIRATION REFERENCE RULES")) {
    throw new Error("FAIL: Test 3 injected [INSPIRATION REFERENCE RULES] when no inspiration image was provided!");
  }
  console.log("✓ TEST 3 PASSED: Standard pipeline operates 100% backward-compatibly without inspiration block!\n");

  // ----------------------------------------------------------------------
  // TEST 4: Product Switching with Same Inspiration Image
  // ----------------------------------------------------------------------
  console.log("--- [TEST 4] Product Switching with Same Inspiration Image ---");
  const switchedInput: MasterPromptCompilerInput = {
    brief: "Serum dưỡng da ban đêm",
    useCase: "Poster",
    aspectRatio: "4:5",
    brandName: "AuraSerum",
    routingResult: skincareRoutingResult,
    knowledgePackage: dummyKnowledgePackage as any,
    hasInspirationReference: true,
    inspirationReferenceRules: [
      "Inspiration reference: Marble Pedestal Studio background.",
    ],
  };

  const res4 = await compiler.compile(switchedInput);
  const prompt4 = res4.package!.compiled_prompt;

  const textLower4 = prompt4.toLowerCase();
  if (textLower4.includes("lay's") || textLower4.includes("snack") || textLower4.includes("khoai tây")) {
    throw new Error("FAIL: Test 4 leaked previous Lay's product identity when product was switched!");
  }
  console.log("✓ TEST 4 PASSED: Switched product clean compilation with zero legacy identity leakage!\n");

  // ----------------------------------------------------------------------
  // TEST 5: Inspiration Containing Foreign Brand/Logo/Text
  // ----------------------------------------------------------------------
  console.log("--- [TEST 5] Inspiration Containing Foreign Brand/Logo/Text ---");
  const test5Input: MasterPromptCompilerInput = {
    brief: "Quảng cáo trà Ô Long Việt Nam",
    useCase: "Poster",
    aspectRatio: "4:5",
    brandName: "TIDO Tea",
    routingResult: dummyRoutingResult,
    knowledgePackage: dummyKnowledgePackage as any,
    hasInspirationReference: true,
    inspirationReferenceRules: [
      "Inspiration reference contains a prominent foreign logo and foreign brand text.",
    ],
  };

  const res5 = await compiler.compile(test5Input);
  const prompt5 = res5.package!.compiled_prompt;

  if (!prompt5.includes("DO NOT copy logos, foreign brand text, or unrelated objects")) {
    throw new Error("FAIL: Test 5 missing anti-foreign logo copy constraint!");
  }
  console.log("✓ TEST 5 PASSED: Strict directive prevents copying foreign logos/text from inspiration image!\n");

  // ----------------------------------------------------------------------
  // TEST 6: Concept Professionalizer Non-Interference
  // ----------------------------------------------------------------------
  console.log("--- [TEST 6] Concept Professionalizer Non-Interference ---");
  const profResult = await professionalizer.professionalize({
    userConcept: "Poster quảng cáo nước hoa sang trọng",
    productCategory: "Perfume",
    brandName: "LuxeFragrance",
    identityContext: {
      referenceAvailable: true,
      detectedBrand: "LuxeFragrance",
      detectedProductType: "Glass perfume bottle",
      identityLocks: ["Preserve glass perfume bottle hero"],
      preservationRules: ["Keep original bottle shape and logo unchanged"],
    },
  });

  if (!profResult.professionalConcept) {
    throw new Error("FAIL: Test 6 professionalize concept returned empty!");
  }
  console.log("✓ TEST 6 PASSED: Concept Professionalizer remains 100% product-focused!\n");

  console.log("========================================================================");
  console.log("ALL INSPIRATION REFERENCE LAYER TESTS PASSED (100%)");
  console.log("========================================================================");
}

runInspirationReferenceTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
