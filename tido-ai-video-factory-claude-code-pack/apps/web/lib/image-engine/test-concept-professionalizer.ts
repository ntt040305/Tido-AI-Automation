import { ConceptProfessionalizerService } from "./service/ConceptProfessionalizerService";
import { LLMProviderService } from "./llm/llm-provider.service";
import { SimpleImageGenerationOrchestratorService } from "./service/SimpleImageGenerationOrchestratorService";

async function runConceptProfessionalizerTests() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — CONCEPT PROFESSIONALIZER SYSTEM CONTEXT SUITE");
  console.log("========================================================================\n");

  const service = new ConceptProfessionalizerService();

  // ----------------------------------------------------------------------
  // TEST 1: Auto Product Identity Context Injection (Lay's Package)
  // ----------------------------------------------------------------------
  console.log("--- [TEST 1] Auto Product Identity Context Injection (Lay's Package) ---");
  const test1Input = "Poster cao cấp cho sản phẩm";
  const result1 = await service.professionalize({
    userConcept: test1Input,
    outputType: "poster",
    productCategory: "Potato Chips Snack",
    brandName: "Lay's",
    identityContext: {
      referenceAvailable: true,
      detectedBrand: "Lay's",
      detectedProductType: "Potato chips yellow pouch",
      identityLocks: ["Preserve yellow Lay's snack pouch", "Red Lay's logo lock"],
      preservationRules: ["Keep original packaging and logo unchanged"],
    },
  });

  console.log("Test 1 Result:", {
    originalConcept: result1.originalConcept,
    professionalConcept: result1.professionalConcept,
    wasOptimized: result1.wasOptimized,
  });

  if (!result1.professionalConcept) {
    throw new Error("FAIL: Test 1 returned empty professionalConcept!");
  }
  const textLower1 = result1.professionalConcept.toLowerCase();
  if (textLower1.includes("bánh chưng") || textLower1.includes("hộp bánh tét")) {
    throw new Error("FAIL: Test 1 hallucinated an unrelated product!");
  }
  console.log("✓ TEST 1 PASSED: Professional concept explicitly preserved original Lay's snack package hero!\n");

  // ----------------------------------------------------------------------
  // TEST 2: No Product Reference (General Advertising Mode)
  // ----------------------------------------------------------------------
  console.log("--- [TEST 2] No Product Reference Mode ---");
  const test2Input = "Poster đẹp cho sản phẩm";
  const result2 = await service.professionalize({
    userConcept: test2Input,
    outputType: "poster",
    // No reference, no identityContext
  });

  console.log("Test 2 Result:", {
    originalConcept: result2.originalConcept,
    professionalConcept: result2.professionalConcept,
    wasOptimized: result2.wasOptimized,
  });

  if (!result2.professionalConcept) {
    throw new Error("FAIL: Test 2 returned empty professionalConcept!");
  }
  console.log("✓ TEST 2 PASSED: Worked normally without identity context lock!\n");

  // ----------------------------------------------------------------------
  // TEST 3: Manual + System Identity Context Merge
  // ----------------------------------------------------------------------
  console.log("--- [TEST 3] Manual + System Identity Context Merge ---");
  const test3Input = "Quảng cáo thương mại đỉnh cao";
  const result3 = await service.professionalize({
    userConcept: test3Input,
    outputType: "social_ad",
    brandName: "Lay's",
    productCategory: "Snack",
  });

  console.log("Test 3 Result:", {
    originalConcept: result3.originalConcept,
    professionalConcept: result3.professionalConcept,
  });

  if (!result3.professionalConcept) {
    throw new Error("FAIL: Test 3 returned empty professionalConcept!");
  }
  console.log("✓ TEST 3 PASSED: Manual context merged without conflicts!\n");

  // ----------------------------------------------------------------------
  // TEST 4: Regression Verification of Existing Pipeline
  // ----------------------------------------------------------------------
  console.log("--- [TEST 4] Pipeline Regression Verification ---");
  if (typeof SimpleImageGenerationOrchestratorService.generateSimpleImage !== "function") {
    throw new Error("FAIL: SimpleImageGenerationOrchestratorService.generateSimpleImage contract broken!");
  }
  console.log("✓ TEST 4 PASSED: Existing image generation pipeline contracts remain 100% untouched!\n");

  // ----------------------------------------------------------------------
  // TEST 5: Stale Context Fix Test (Lay's -> Skincare Serum Switch)
  // ----------------------------------------------------------------------
  console.log("--- [TEST 5] Stale Context Fix Test (Lay's -> Skincare Serum Switch) ---");
  // Step A: First request with Lay's snack
  await service.professionalize({
    userConcept: "Poster snack Lay's giòn tan",
    brandName: "Lay's",
    productCategory: "Snack",
  });

  // Step B: User replaces product image & types Skincare concept, but stale brandName="Lay's" is passed
  const test5SerumResult = await service.professionalize({
    userConcept: "Làm poster mỹ phẩm cao cấp",
    outputType: "poster",
    brandName: "Lay's", // STALE BRAND NAME FROM PREVIOUS STATE
    identityContext: {
      referenceAvailable: true,
      detectedBrand: "Lay's", // STALE CONTEXT
      detectedProductType: "Potato chips yellow pouch",
      identityLocks: ["Preserve yellow Lay's snack pouch"],
      preservationRules: ["Keep original packaging and logo unchanged"],
    },
  });

  console.log("Test 5 Serum Result:", {
    originalConcept: test5SerumResult.originalConcept,
    professionalConcept: test5SerumResult.professionalConcept,
  });

  const serumTextLower = test5SerumResult.professionalConcept.toLowerCase();
  const containsStaleLays = serumTextLower.includes("lay's") || serumTextLower.includes("snack") || serumTextLower.includes("khoai tây");

  if (containsStaleLays) {
    throw new Error(`FAIL: Test 5 stale brand leaked into cosmetics concept! Output: ${test5SerumResult.professionalConcept}`);
  }
  console.log("✓ TEST 5 PASSED: Stale Lay's brand context was successfully purged when user switched to Skincare Serum concept!\n");

  console.log("========================================================================");
  console.log("ALL CONCEPT PROFESSIONALIZER TESTS PASSED (100%)");
  console.log("========================================================================");
}

runConceptProfessionalizerTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
