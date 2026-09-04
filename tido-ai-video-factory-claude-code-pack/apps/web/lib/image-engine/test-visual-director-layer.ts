import { SimpleImageGenerationOrchestratorService } from "./service/SimpleImageGenerationOrchestratorService";
import { CreativeInterpretationService } from "./service/CreativeInterpretationService";
import { ImageGenerationProvider, ProviderImageGenerationInput, ProviderImageGenerationOutput } from "./provider/ImageGenerationProvider";
import { RoutingResultSchema } from "./types";

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

async function runVisualDirectorLayerTests() {
  console.log("========================================================================");
  console.log("TIDO LAYER 1 — VISUAL DIRECTOR LAYER COMPREHENSIVE TEST SUITE");
  console.log("========================================================================");

  const mockProvider = new MockImageGenerationProvider();

  const mockRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Visual Director Test Routing",
    global_retrieval_queries: [],
    structured_input_intent: {
      core_creative_intent: "Test product visual concept",
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    },
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.95,
        summary: "Commercial Product",
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

  const mockImage = {
    reference_id: "REF_01",
    role: "PRODUCT" as const,
    mimeType: "image/png",
    buffer: Buffer.from("mock_product_png"),
    filename: "product.png",
  };

  // =========================================================================
  // TEST A: DETAILED PHOTOGRAPHER INPUT PRESERVATION
  // =========================================================================
  console.log("\n[TEST A] DETAILED PHOTOGRAPHER INPUT PRESERVATION:");
  const photographerConcept = "Dutch angle with 85mm anamorphic lens, intense red neon backlight, macro focus on perfume bottle";
  
  const resA = await SimpleImageGenerationOrchestratorService.generateSimpleImage(
    { concept: photographerConcept, useCase: "product_hero", aspectRatio: "1:1", images: [mockImage] },
    { generationProvider: mockProvider, mockRoutingResult: mockRouting }
  );

  assert(Boolean(resA.success), "Generation completed for detailed photographer input");
  const execA = resA.strategy?.creative_interpretation?.execution_directives;
  const cadA = execA?.cinematic_art_direction;

  assert(Boolean(cadA?.user_photographer_lock), "User photographer lock is generated");
  assert(
    Boolean(cadA?.user_photographer_lock?.includes("Dutch angle")),
    `Photographer lock preserves explicit Dutch angle: "${cadA?.user_photographer_lock}"`
  );
  assert(
    Boolean(cadA?.user_photographer_lock?.includes("red neon backlight")),
    `Photographer lock preserves explicit red neon backlight: "${cadA?.user_photographer_lock}"`
  );
  assert(
    Boolean(resA.strategy?.compiled_prompt.includes("LOCKED USER PHOTOGRAPHER COMPLIANCE")),
    "Master prompt contains LOCKED USER PHOTOGRAPHER COMPLIANCE section"
  );

  // =========================================================================
  // TEST B: SIMPLE CONCEPT CREATIVE DIRECTION (ZERO TECHNICAL METADATA)
  // =========================================================================
  console.log("\n[TEST B] SIMPLE CONCEPT CREATIVE DIRECTION (ZERO TECHNICAL DETAILS):");
  const simpleConcept = "Luxury watch on dark obsidian";
  
  const resB = await SimpleImageGenerationOrchestratorService.generateSimpleImage(
    { concept: simpleConcept, useCase: "product_hero", aspectRatio: "1:1", images: [mockImage] },
    { generationProvider: mockProvider, mockRoutingResult: mockRouting }
  );

  assert(Boolean(resB.success), "Generation completed for simple non-technical concept");
  const cadB = resB.strategy?.creative_interpretation?.execution_directives?.cinematic_art_direction;
  assert(Boolean(cadB), "Visual Director generated cinematic art direction for simple concept");
  assert(
    Boolean(cadB?.cinematic_camera_direction && cadB.cinematic_camera_direction.length > 30),
    `Cinematic camera direction is richly generated: "${cadB?.cinematic_camera_direction}"`
  );
  assert(
    Boolean(cadB?.photographic_lighting_design && cadB.photographic_lighting_design.length > 30),
    `Photographic lighting design is richly generated: "${cadB?.photographic_lighting_design}"`
  );
  assert(
    Boolean(cadB?.visual_storytelling_composition && cadB.visual_storytelling_composition.length > 20),
    `Visual storytelling composition is richly generated: "${cadB?.visual_storytelling_composition}"`
  );

  // =========================================================================
  // TEST C: THREE ASSET TYPES PRODUCE GENUINELY DIFFERENT VISUAL DIRECTIONS
  // =========================================================================
  console.log("\n[TEST C] THREE ASSET TYPES PRODUCE GENUINELY DIFFERENT VISUAL DIRECTIONS:");
  const sharedConcept = "SKIN1004 Centella skincare set in Japanese zen garden";

  const resHero = await SimpleImageGenerationOrchestratorService.generateSimpleImage(
    { concept: sharedConcept, useCase: "product_hero", aspectRatio: "1:1", images: [mockImage] },
    { generationProvider: mockProvider, mockRoutingResult: mockRouting }
  );

  const resSocial = await SimpleImageGenerationOrchestratorService.generateSimpleImage(
    { concept: sharedConcept, useCase: "social_ad", aspectRatio: "9:16", images: [mockImage] },
    { generationProvider: mockProvider, mockRoutingResult: mockRouting }
  );

  const resPoster = await SimpleImageGenerationOrchestratorService.generateSimpleImage(
    { concept: sharedConcept, useCase: "poster", aspectRatio: "4:5", images: [mockImage] },
    { generationProvider: mockProvider, mockRoutingResult: mockRouting }
  );

  assert(Boolean(resHero.success && resSocial.success && resPoster.success), "All 3 asset type generations completed");

  const cadHero = resHero.strategy?.creative_interpretation?.execution_directives?.cinematic_art_direction;
  const cadSocial = resSocial.strategy?.creative_interpretation?.execution_directives?.cinematic_art_direction;
  const cadPoster = resPoster.strategy?.creative_interpretation?.execution_directives?.cinematic_art_direction;

  assert(
    cadHero?.cinematic_camera_direction !== cadSocial?.cinematic_camera_direction,
    "Product hero cinematic camera direction differs from Social ad"
  );
  assert(
    cadHero?.cinematic_camera_direction !== cadPoster?.cinematic_camera_direction,
    "Product hero cinematic camera direction differs from Poster"
  );
  assert(
    cadSocial?.cinematic_camera_direction !== cadPoster?.cinematic_camera_direction,
    "Social ad cinematic camera direction differs from Poster"
  );

  console.log("\n--- VISUAL DIRECTOR ART DIRECTION COMPARISON FOR SAME SCENE ('SKIN1004 in Zen Garden') ---");
  console.log(`[PRODUCT_HERO] Camera:       ${cadHero?.cinematic_camera_direction}`);
  console.log(`               Lighting:     ${cadHero?.photographic_lighting_design}`);
  console.log(`               Composition:  ${cadHero?.visual_storytelling_composition}`);
  console.log("");
  console.log(`[SOCIAL_AD]    Camera:       ${cadSocial?.cinematic_camera_direction}`);
  console.log(`               Lighting:     ${cadSocial?.photographic_lighting_design}`);
  console.log(`               Composition:  ${cadSocial?.visual_storytelling_composition}`);
  console.log("");
  console.log(`[POSTER]       Camera:       ${cadPoster?.cinematic_camera_direction}`);
  console.log(`               Lighting:     ${cadPoster?.photographic_lighting_design}`);
  console.log(`               Composition:  ${cadPoster?.visual_storytelling_composition}`);

  console.log("\n========================================================================");
  console.log("🎉 VISUAL DIRECTOR LAYER TEST SUITE PASSED (100%)");
  console.log("========================================================================");
}

runVisualDirectorLayerTests().catch((err) => {
  console.error("❌ Visual Director test failed with error:", err);
  process.exit(1);
});
