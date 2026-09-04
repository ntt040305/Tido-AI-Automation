import { CreativeInterpretationService } from "./service/CreativeInterpretationService";
import { AssetType } from "../../features/picture-engine/types/picture-engine.types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function runCreativeInterpretationTests() {
  console.log("========================================================================");
  console.log("TIDO LAYER 1 — CREATIVE INTERPRETATION KNOWLEDGE FUSION TEST");
  console.log("========================================================================");

  // Test Case 1: USER EXAMPLE — "Luxury perfume bottle in snowy mountain sunrise"
  console.log("\n[TEST CASE 1] VERIFYING USER EXAMPLE CONCEPT & KNOWLEDGE FUSION:");
  const exampleConcept = "Luxury perfume bottle in snowy mountain sunrise";
  const exampleKnowledge = ["Emphasize glass reflections and liquid translucency", "High-contrast rim lighting for luxury bottles"];

  const exampleResult = CreativeInterpretationService.interpret({
    concept: exampleConcept,
    assetType: "product_hero",
    knowledgeCards: exampleKnowledge,
  });

  assert(
    exampleResult.locked_intent.subject[0].toLowerCase().includes("perfume bottle"),
    `Locked subject preserved: "${exampleResult.locked_intent.subject.join(", ")}"`
  );
  assert(
    exampleResult.locked_intent.environment[0].toLowerCase().includes("mountain sunrise"),
    `Locked environment preserved: "${exampleResult.locked_intent.environment.join(", ")}"`
  );
  assert(
    exampleResult.ai_enhancement.lighting_improvement.includes("Emphasize glass reflections"),
    `Lighting enhanced with specialist knowledge: "${exampleResult.ai_enhancement.lighting_improvement}"`
  );
  assert(
    exampleResult.ai_enhancement.commercial_reasoning.includes("mountain sunrise"),
    `Commercial reasoning preserves environment: "${exampleResult.ai_enhancement.commercial_reasoning}"`
  );

  // Test Case 2: SAME CONCEPT + DIFFERENT KNOWLEDGE CARDS -> DIFFERENT ENHANCEMENT
  console.log("\n[TEST CASE 2] SAME CONCEPT + DIFFERENT KNOWLEDGE -> DIFFERENT ENHANCEMENT:");
  const knowledgeA = ["Food macro lighting, gloss sheen, and appetizing warmth"];
  const knowledgeB = ["Jewelry reflection, ultra-sharp metallic contrast, and high-key luxury"];

  const interpA = CreativeInterpretationService.interpret({
    concept: exampleConcept,
    assetType: "product_hero",
    knowledgeCards: knowledgeA,
  });

  const interpB = CreativeInterpretationService.interpret({
    concept: exampleConcept,
    assetType: "product_hero",
    knowledgeCards: knowledgeB,
  });

  assert(
    interpA.ai_enhancement.lighting_improvement !== interpB.ai_enhancement.lighting_improvement,
    "Lighting enhancement for Knowledge A is DIFFERENT from Knowledge B"
  );
  assert(
    interpA.ai_enhancement.creative_objective !== interpB.ai_enhancement.creative_objective,
    "Creative objective for Knowledge A is DIFFERENT from Knowledge B"
  );

  // Test Case 3: SAME CONCEPT + DIFFERENT ASSET TYPE -> DIFFERENT COMMERCIAL REASONING
  console.log("\n[TEST CASE 3] SAME CONCEPT + DIFFERENT ASSET TYPE -> DIFFERENT COMMERCIAL REASONING:");
  const assetTypes: AssetType[] = ["product_hero", "social_ad", "poster", "banner", "ugc_thumbnail"];

  const assetResults = assetTypes.map((t) =>
    CreativeInterpretationService.interpret({
      concept: exampleConcept,
      assetType: t,
      knowledgeCards: exampleKnowledge,
    })
  );

  for (let i = 0; i < assetResults.length; i++) {
    for (let j = i + 1; j < assetResults.length; j++) {
      const a = assetResults[i];
      const b = assetResults[j];
      assert(
        a.ai_enhancement.commercial_reasoning !== b.ai_enhancement.commercial_reasoning,
        `Commercial reasoning for '${a.asset_type}' is DIFFERENT from '${b.asset_type}'`
      );
      assert(
        a.ai_enhancement.composition_decision !== b.ai_enhancement.composition_decision,
        `Composition decision for '${a.asset_type}' is DIFFERENT from '${b.asset_type}'`
      );
    }
  }

  // Test Case 4: REFERENCE ANALYSIS & BRAND CONTEXT FUSION
  console.log("\n[TEST CASE 4] REFERENCE ANALYSIS & BRAND CONTEXT FUSION:");
  const brandInput = CreativeInterpretationService.interpret({
    concept: exampleConcept,
    assetType: "product_hero",
    referenceAnalysis: { packaging_material: "frosted crystal glass" },
    brandContext: { brandName: "AuraLuxe Parfums" },
  });

  assert(
    brandInput.locked_intent.non_negotiable_constraints.some((c) => c.includes("AuraLuxe Parfums")),
    "Non-negotiables incorporate Brand Name constraint"
  );
  assert(
    brandInput.ai_enhancement.composition_decision.includes("frosted crystal glass"),
    "Composition decision incorporates Reference Packaging Material"
  );

  console.log("\n========================================================================");
  console.log("🎉 ALL KNOWLEDGE FUSION & REASONING TESTS PASSED (100%)");
  console.log("========================================================================");
}

runCreativeInterpretationTests();
