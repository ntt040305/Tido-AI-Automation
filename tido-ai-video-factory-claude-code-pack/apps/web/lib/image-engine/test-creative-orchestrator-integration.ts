import { SimpleImageGenerationOrchestratorService } from "./service/SimpleImageGenerationOrchestratorService";
import { CreativeInterpretationService } from "./service/CreativeInterpretationService";
import { ImageGenerationProvider, ProviderImageGenerationInput, ProviderImageGenerationOutput } from "./provider/ImageGenerationProvider";
import { RoutingResultSchema, SimpleInputRequestV1 } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

class MockImageGenerationProvider implements ImageGenerationProvider {
  public provider_name = "mock_provider";
  public async generateImage(input: ProviderImageGenerationInput): Promise<ProviderImageGenerationOutput> {
    return {
      success: true,
      imageUrl: "https://mock.cdn/test-output.png",
      imageBuffer: Buffer.from("mock_image_binary_data"),
      remoteDetails: {
        provider_name: "mock_provider",
        model: "flow-nano-banana-2",
        remote_image_id: "mock_remote_123",
      },
    };
  }
}

async function runCreativeOrchestratorIntegrationTests() {
  console.log("========================================================================");
  console.log("TIDO LAYER 1 — CREATIVE INTERPRETATION ORCHESTRATOR INTEGRATION TEST");
  console.log("========================================================================");

  const mockProvider = new MockImageGenerationProvider();

  const mockRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Automated test product routing",
    global_retrieval_queries: [
      { query: "perfume", importance: "PRIMARY", reason: "category search" }
    ],
    structured_input_intent: {
      core_creative_intent: "Luxury perfume bottle in snowy mountain sunrise",
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }
      ],
    },
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }
    ],
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.95,
        summary: "White Perfume Bottle",
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
  };

  const sharedConcept = "Luxury perfume bottle in snowy mountain sunrise";
  const mockImage = {
    reference_id: "REF_01",
    role: "PRODUCT" as const,
    mimeType: "image/png",
    buffer: Buffer.from("mock_perfume_png"),
    filename: "perfume.png",
  };

  // CASE 1: Asset = product_hero (Expected: product dominance reasoning)
  console.log("\n[CASE 1] TESTING ASSET = product_hero (PRODUCT DOMINANCE REASONING):");
  const reqHero: SimpleInputRequestV1 = {
    concept: sharedConcept,
    useCase: "product_hero",
    aspectRatio: "1:1",
    images: [mockImage],
  };

  const resHero = await SimpleImageGenerationOrchestratorService.generateSimpleImage(reqHero, {
    generationProvider: mockProvider,
    mockRoutingResult: mockRouting,
  });

  assert(Boolean(resHero.success), "Orchestrator generation succeeded for product_hero");
  assert(
    Boolean(resHero.strategy?.creative_interpretation),
    "Diagnostics strategy contains creative_interpretation output"
  );
  assert(
    Boolean(resHero.strategy?.creative_interpretation?.execution_directives),
    "Diagnostics strategy contains execution_directives from CreativeExecutionPlannerService"
  );
  assert(
    Boolean(
      resHero.strategy?.creative_interpretation?.ai_enhancement.commercial_reasoning.includes("product_hero") ||
      resHero.strategy?.creative_interpretation?.ai_enhancement.commercial_reasoning.includes("hero")
    ),
    `Commercial reasoning reflects product dominance: "${resHero.strategy?.creative_interpretation?.ai_enhancement.commercial_reasoning}"`
  );
  assert(
    Boolean(resHero.strategy?.compiled_prompt.includes("[VISUAL EXECUTION DIRECTIVES & MODEL CONSTRAINTS]")),
    "Compiled master prompt contains injected dynamic Visual Execution Directives block"
  );
  assert(
    Boolean(resHero.strategy?.negative_prompt.includes("FORBID wide environmental framing")),
    "Diagnostics strategy negative prompt contains visual execution negative constraints"
  );

  // CASE 2: Asset = social_ad (Expected: conversion / mobile-first reasoning)
  console.log("\n[CASE 2] TESTING ASSET = social_ad (CONVERSION / MOBILE REASONING):");
  const reqSocial: SimpleInputRequestV1 = {
    concept: sharedConcept,
    useCase: "social_ad",
    aspectRatio: "9:16",
    images: [mockImage],
  };

  const resSocial = await SimpleImageGenerationOrchestratorService.generateSimpleImage(reqSocial, {
    generationProvider: mockProvider,
    mockRoutingResult: mockRouting,
  });

  assert(Boolean(resSocial.success), "Orchestrator generation succeeded for social_ad");
  assert(
    Boolean(
      resSocial.strategy?.creative_interpretation?.ai_enhancement.commercial_reasoning.includes("social_ad") ||
      resSocial.strategy?.creative_interpretation?.ai_enhancement.commercial_reasoning.includes("mobile_conversion")
    ),
    `Commercial reasoning reflects social ad conversion: "${resSocial.strategy?.creative_interpretation?.ai_enhancement.commercial_reasoning}"`
  );

  // CASE 3: Asset = poster (Expected: editorial / storytelling reasoning)
  console.log("\n[CASE 3] TESTING ASSET = poster (EDITORIAL STORYTELLING REASONING):");
  const reqPoster: SimpleInputRequestV1 = {
    concept: sharedConcept,
    useCase: "poster",
    aspectRatio: "4:5",
    images: [mockImage],
  };

  const resPoster = await SimpleImageGenerationOrchestratorService.generateSimpleImage(reqPoster, {
    generationProvider: mockProvider,
    mockRoutingResult: mockRouting,
  });

  assert(Boolean(resPoster.success), "Orchestrator generation succeeded for poster");
  assert(
    Boolean(
      resPoster.strategy?.creative_interpretation?.ai_enhancement.commercial_reasoning.includes("poster") ||
      resPoster.strategy?.creative_interpretation?.ai_enhancement.commercial_reasoning.includes("editorial")
    ),
    `Commercial reasoning reflects editorial poster story: "${resPoster.strategy?.creative_interpretation?.ai_enhancement.commercial_reasoning}"`
  );

  // CASE 4: Same Concept + Different Knowledge Cards (Expected: different enhancement)
  console.log("\n[CASE 4] TESTING DIFFERENT KNOWLEDGE CARDS -> DIFFERENT ENHANCEMENT:");
  const interpKnowledge1 = CreativeInterpretationService.interpret({
    concept: sharedConcept,
    assetType: "product_hero",
    knowledgeCards: ["Food macro lighting & moisture sheen"],
  });

  const interpKnowledge2 = CreativeInterpretationService.interpret({
    concept: sharedConcept,
    assetType: "product_hero",
    knowledgeCards: ["Jewelry reflection & high-key rim contrast"],
  });

  assert(
    interpKnowledge1.ai_enhancement.lighting_improvement !== interpKnowledge2.ai_enhancement.lighting_improvement,
    "Lighting enhancement differs cleanly based on retrieved knowledge cards"
  );

  // CASE 5: Reference Identity Lock (Reference: White Perfume Bottle vs Concept: Black Perfume Bottle)
  console.log("\n[CASE 5] TESTING REFERENCE IDENTITY LOCK PRIORITY:");
  const conflictConcept = "Black perfume bottle in snowy mountain sunrise";
  const refProductIdentity = {
    product_id: "PRODUCT_01",
    canonical_name: "White Perfume Bottle",
    color: "white",
  };

  const conflictInterp = CreativeInterpretationService.interpret({
    concept: conflictConcept,
    assetType: "product_hero",
    productIdentity: refProductIdentity,
  });

  assert(
    conflictInterp.locked_intent.non_negotiable_constraints.some((c) =>
      c.includes("Reference Identity Lock") || c.includes("White Perfume Bottle") || c.includes("white")
    ),
    `Non-negotiable constraints enforce Reference Identity Lock over concept conflict: [${conflictInterp.locked_intent.non_negotiable_constraints.join("; ")}]`
  );

  console.log("\n========================================================================");
  console.log("🎉 ALL 5 CREATIVE ORCHESTRATOR INTEGRATION CASES PASSED (100%)");
  console.log("========================================================================");
}

runCreativeOrchestratorIntegrationTests().catch((err) => {
  console.error("❌ Integration test failed with error:", err);
  process.exit(1);
});
