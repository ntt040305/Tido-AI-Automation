import { DeterministicLogoEngine } from "./finishing/DeterministicLogoEngine";
import { TypographyEngine } from "./finishing/TypographyEngine";
import { ReferenceAwareCreativeCriticAgent } from "./evaluator/ReferenceAwareCreativeCriticAgent";
import { RegenerationControlService } from "./service/RegenerationControlService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runPhase33ImplementationTests() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 3.3 SYSTEM IMPLEMENTATION ACCEPTANCE TEST");
  console.log("========================================================================");

  // ------------------------------------------------------------------------
  // TEST 1: DeterministicLogoEngine
  // ------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------------------");
  console.log("[TEST 1] DeterministicLogoEngine: Aspect Ratio Lock & Safe Zone Placement");
  console.log("------------------------------------------------------------------------");

  const logoEngine = new DeterministicLogoEngine();
  const logoRes = logoEngine.calculateLogoPlacement(
    { bufferBase64: "dummy_logo_base64", width: 400, height: 200, mimeType: "image/svg+xml" },
    {
      canvasWidth: 1080,
      canvasHeight: 1350,
      logoBoundingBox: { xPercent: 5, yPercent: 85, widthPercent: 20, heightPercent: 10 },
    }
  );

  console.log("Logo Placement Result:", logoRes);

  assert(logoRes.success === true, "Logo placement calculated successfully");
  assert(logoRes.logoPlaced === true, "Logo placed flag is true");
  assert(logoRes.logoDimensions.width > 0 && logoRes.logoDimensions.height > 0, "Valid width and height calculated");
  // Check aspect ratio (400:200 = 2:1)
  const aspect = logoRes.logoDimensions.width / logoRes.logoDimensions.height;
  assert(Math.abs(aspect - 2.0) < 0.05, `Aspect ratio preserved (Calculated: ${aspect.toFixed(2)}, Target: 2.00)`);
  assert(logoRes.overlayInstructions.includes("[DETERMINISTIC_LOGO_OVERLAY]"), "Instructions specify deterministic vector overlay");

  // ------------------------------------------------------------------------
  // TEST 2: TypographyEngine
  // ------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------------------");
  console.log("[TEST 2] TypographyEngine: Copy Rendering Decoupled from Logo");
  console.log("------------------------------------------------------------------------");

  const typographyEngine = new TypographyEngine();
  const typographyRes = typographyEngine.renderCopyElements(
    [
      { text: "ULTRA SOUND PRO", role: "HEADLINE" },
      { text: "Noise Cancelling Headphones", role: "SUBTITLE" },
      { text: "BUY NOW 20% OFF", role: "CTA" },
      { text: "$199.99", role: "PRICE" },
    ],
    { canvasWidth: 1080, canvasHeight: 1350, primaryTextColor: "#FFFFFF", accentBgColor: "#2563EB" }
  );

  console.log("Typography Render Summary:", typographyRes.overlaySummary);

  assert(typographyRes.success === true, "Typography elements rendered successfully");
  assert(typographyRes.renderedElementsCount === 4, "All 4 copy elements rendered");
  assert(typographyRes.renderedDirectives.some((d) => d.role === "HEADLINE"), "Headline directive present");
  assert(typographyRes.renderedDirectives.some((d) => d.role === "SUBTITLE"), "Subtitle directive present");
  assert(typographyRes.renderedDirectives.some((d) => d.role === "CTA"), "CTA directive present");
  assert(typographyRes.renderedDirectives.some((d) => d.role === "PRICE"), "Price directive present");

  // ------------------------------------------------------------------------
  // TEST 3: ReferenceAwareCreativeCriticAgent & Hard Identity Rules
  // ------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------------------");
  console.log("[TEST 3] ReferenceAwareCreativeCriticAgent & Hard Identity Rules");
  console.log("------------------------------------------------------------------------");

  const criticAgent = new ReferenceAwareCreativeCriticAgent();

  // Scenario 3A: High-Quality Commercial Image (PASS)
  const passResult = criticAgent.evaluate({
    scores: {
      productFidelity: 0.92,
      logoFidelity: 0.90,
      composition: 0.88,
      lighting: 0.86,
      typography: 0.94,
      commercialImpact: 0.90,
    },
    referenceSimilarity: {
      silhouette: 0.92,
      geometry: 0.90,
      color: 0.94,
      packaging: 0.92,
      logo_position: 0.90,
    },
  });

  console.log("Scenario 3A Evaluation Result:", passResult);

  assert(passResult.passed === true, "High-quality image PASSED all quality gates");
  assert(passResult.hardIdentityPassed === true, "Hard identity gate PASSED");
  assert(passResult.overallWeightedScore >= 0.85, `Overall weighted score (${passResult.overallWeightedScore}) >= 0.85`);

  // Scenario 3B: Identity Failure with High Other Scores (MUST HARD FAIL)
  const failResult = criticAgent.evaluate({
    scores: {
      productFidelity: 0.75, // FAIL (< 0.85 hard gate)
      logoFidelity: 0.95,
      composition: 1.0,
      lighting: 1.0,
      typography: 1.0,
      commercialImpact: 1.0,
    },
  });

  console.log("Scenario 3B (Identity Failure) Result:", failResult);

  assert(failResult.passed === false, "Image with Product Fidelity 0.75 HARD FAILS despite 1.0 in other scores");
  assert(failResult.hardIdentityPassed === false, "hardIdentityPassed is FALSE");
  assert(failResult.detectedDiscrepancies.includes("PRODUCT_SHAPE_ALTERED"), "Discrepancy 'PRODUCT_SHAPE_ALTERED' recorded");
  assert(failResult.hardFailureReasons.length > 0, "Hard failure reasons populated");

  // ------------------------------------------------------------------------
  // TEST 4: RegenerationControlService & Failure Mapping
  // ------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------------------");
  console.log("[TEST 4] RegenerationControlService: Failure Mapping & Max Attempts Limit");
  console.log("------------------------------------------------------------------------");

  const regenService = new RegenerationControlService();

  // Test Discrepancy Mapping
  const planShape = regenService.evaluateRegeneration(
    { ...failResult, detectedDiscrepancies: ["PRODUCT_SHAPE_ALTERED"] },
    1
  );
  assert(planShape.allowed === true, "Regeneration allowed on attempt 1");
  assert(planShape.target === "BASE_SCENE_FULL", "PRODUCT_SHAPE_ALTERED maps to BASE_SCENE_FULL");

  const planLogo = regenService.evaluateRegeneration(
    { ...failResult, detectedDiscrepancies: ["LOGO_DEFORMED"] },
    1
  );
  assert(planLogo.target === "BASE_SCENE_FULL", "LOGO_DEFORMED maps to BASE_SCENE_FULL");

  const planLighting = regenService.evaluateRegeneration(
    { ...failResult, detectedDiscrepancies: ["BAD_LIGHTING"] },
    1
  );
  assert(planLighting.target === "LIGHTING_ADJUST", "BAD_LIGHTING maps to LIGHTING_ADJUST");

  const planComposition = regenService.evaluateRegeneration(
    { ...failResult, detectedDiscrepancies: ["COMPOSITION_CLUTTER"] },
    1
  );
  assert(planComposition.target === "COMPOSITION_ADJUST", "COMPOSITION_CLUTTER maps to COMPOSITION_ADJUST");

  const planText = regenService.evaluateRegeneration(
    { ...failResult, detectedDiscrepancies: ["TEXT_UNREADABLE"] },
    1
  );
  assert(planText.target === "TYPOGRAPHY_ONLY", "TEXT_UNREADABLE maps to TYPOGRAPHY_ONLY");

  // Test Max 3 Attempts Cap
  const planMax = regenService.evaluateRegeneration(failResult, 3);
  console.log("Attempt 3 Plan (Max Reached):", planMax);

  assert(planMax.allowed === false, "Regeneration NOT allowed when currentAttempt === 3");
  assert(planMax.actionSummary.includes("Maximum regeneration attempt limit (3) reached"), "Action summary states max limit reached");

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 3.3 IMPLEMENTATION ACCEPTANCE TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPhase33ImplementationTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
