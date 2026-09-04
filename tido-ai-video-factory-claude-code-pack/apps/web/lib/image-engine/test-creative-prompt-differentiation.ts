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

async function runCreativePromptDifferentiationTest() {
  console.log("========================================================================");
  console.log("TIDO LAYER 1 — CREATIVE EXECUTION PLANNER PROMPT DIFFERENTIATION TEST");
  console.log("========================================================================");

  const mockProvider = new MockImageGenerationProvider();
  const sharedConcept = "SKIN1004 Centella skincare set in Japanese zen garden";

  const mockRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "SKIN1004 Centella Skincare Set Routing",
    global_retrieval_queries: [
      { query: "skincare set", importance: "PRIMARY", reason: "category search" }
    ],
    structured_input_intent: {
      core_creative_intent: sharedConcept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: ["SKIN1004"],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [
        { reference_id: "REF_SKIN1004", role: "PRODUCT", confidence: 0.98 }
      ],
    },
    asset_roles: [
      { reference_id: "REF_SKIN1004", role: "PRODUCT", confidence: 0.98 }
    ],
    products: [
      {
        product_id: "PRODUCT_SKIN1004",
        reference_ids: ["REF_SKIN1004"],
        reference_relationship_confidence: 0.98,
        summary: "SKIN1004 Centella Skincare Set",
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
    reference_id: "REF_SKIN1004",
    role: "PRODUCT" as const,
    mimeType: "image/png",
    buffer: Buffer.from("mock_skin1004_png"),
    filename: "skin1004_set.png",
  };

  // 1. Generate for PRODUCT_HERO
  console.log("\n[TEST 1] GENERATING FOR ASSET = product_hero:");
  const resHero = await SimpleImageGenerationOrchestratorService.generateSimpleImage(
    { concept: sharedConcept, useCase: "product_hero", aspectRatio: "1:1", images: [mockImage] },
    { generationProvider: mockProvider, mockRoutingResult: mockRouting }
  );

  assert(Boolean(resHero.success), "Product hero generation completed successfully");
  const promptHero = resHero.strategy?.compiled_prompt || "";
  const execHero = resHero.strategy?.creative_interpretation?.execution_directives;
  assert(Boolean(execHero), "Product hero contains execution_directives");
  assert(
    Boolean(execHero?.camera_execution.includes("90mm macro")),
    `Product hero lens execution uses macro prime: "${execHero?.camera_execution}"`
  );
  assert(
    Boolean(execHero?.subject_scale_ratio.includes("80%")),
    `Product hero scale ratio reflects 80% product dominance: "${execHero?.subject_scale_ratio}"`
  );
  assert(
    Boolean(execHero?.negative_composition_constraints.some((c) => c.includes("FORBID wide environmental framing"))),
    "Product hero includes negative constraint forbidding wide environmental framing"
  );

  // 2. Generate for SOCIAL_AD
  console.log("\n[TEST 2] GENERATING FOR ASSET = social_ad:");
  const resSocial = await SimpleImageGenerationOrchestratorService.generateSimpleImage(
    { concept: sharedConcept, useCase: "social_ad", aspectRatio: "9:16", images: [mockImage] },
    { generationProvider: mockProvider, mockRoutingResult: mockRouting }
  );

  assert(Boolean(resSocial.success), "Social ad generation completed successfully");
  const promptSocial = resSocial.strategy?.compiled_prompt || "";
  const execSocial = resSocial.strategy?.creative_interpretation?.execution_directives;
  assert(Boolean(execSocial), "Social ad contains execution_directives");
  assert(
    Boolean(execSocial?.camera_execution.includes("35mm")),
    `Social ad lens execution uses 35mm dynamic lens: "${execSocial?.camera_execution}"`
  );
  assert(
    Boolean(execSocial?.subject_scale_ratio.includes("65%")),
    `Social ad scale ratio reflects 65% mobile feed framing: "${execSocial?.subject_scale_ratio}"`
  );
  assert(
    Boolean(execSocial?.text_clearance.includes("upper third") || execSocial?.text_clearance.includes("upper_third")),
    `Social ad preserves upper third text clearance: "${execSocial?.text_clearance}"`
  );

  // 3. Generate for POSTER
  console.log("\n[TEST 3] GENERATING FOR ASSET = poster:");
  const resPoster = await SimpleImageGenerationOrchestratorService.generateSimpleImage(
    { concept: sharedConcept, useCase: "poster", aspectRatio: "4:5", images: [mockImage] },
    { generationProvider: mockProvider, mockRoutingResult: mockRouting }
  );

  assert(Boolean(resPoster.success), "Poster generation completed successfully");
  const promptPoster = resPoster.strategy?.compiled_prompt || "";
  const execPoster = resPoster.strategy?.creative_interpretation?.execution_directives;
  assert(Boolean(execPoster), "Poster contains execution_directives");
  assert(
    Boolean(execPoster?.camera_execution.includes("50mm editorial")),
    `Poster lens execution uses 50mm editorial lens: "${execPoster?.camera_execution}"`
  );
  assert(
    Boolean(execPoster?.subject_scale_ratio.includes("55%")),
    `Poster scale ratio leaves 45% for zen garden environment storytelling: "${execPoster?.subject_scale_ratio}"`
  );
  assert(
    Boolean(execPoster?.negative_composition_constraints.some((c) => c.includes("FORBID extreme macro close-up"))),
    "Poster includes negative constraint forbidding extreme macro close-up hiding zen garden"
  );

  // 4. PROMPT VARIANCE & DIFFERENTIATION VERIFICATION
  console.log("\n[TEST 4] COMPILING PROMPT VARIANCE ANALYSIS:");
  assert(promptHero !== promptSocial, "Product hero prompt differs significantly from Social ad prompt");
  assert(promptHero !== promptPoster, "Product hero prompt differs significantly from Poster prompt");
  assert(promptSocial !== promptPoster, "Social ad prompt differs significantly from Poster prompt");

  console.log("\n--- EXECUTABLE DIRECTIVE COMPARISON FOR SAME CONCEPT ('SKIN1004 Centella in Zen Garden') ---");
  console.log(`[PRODUCT_HERO] Camera: ${execHero?.camera_execution}`);
  console.log(`               Scale: ${execHero?.subject_scale_ratio}`);
  console.log(`               Role:  ${execHero?.environment_role}`);
  console.log(`               Exclusions: [${execHero?.negative_composition_constraints.slice(0, 2).join("; ")}]`);
  console.log("");
  console.log(`[SOCIAL_AD]    Camera: ${execSocial?.camera_execution}`);
  console.log(`               Scale: ${execSocial?.subject_scale_ratio}`);
  console.log(`               Role:  ${execSocial?.environment_role}`);
  console.log(`               Exclusions: [${execSocial?.negative_composition_constraints.slice(0, 2).join("; ")}]`);
  console.log("");
  console.log(`[POSTER]       Camera: ${execPoster?.camera_execution}`);
  console.log(`               Scale: ${execPoster?.subject_scale_ratio}`);
  console.log(`               Role:  ${execPoster?.environment_role}`);
  console.log(`               Exclusions: [${execPoster?.negative_composition_constraints.slice(0, 2).join("; ")}]`);

  console.log("\n========================================================================");
  console.log("🎉 CREATIVE EXECUTION PLANNER PROMPT DIFFERENTIATION TEST PASSED (100%)");
  console.log("========================================================================");
}

runCreativePromptDifferentiationTest().catch((err) => {
  console.error("❌ Differentiation test failed with error:", err);
  process.exit(1);
});
