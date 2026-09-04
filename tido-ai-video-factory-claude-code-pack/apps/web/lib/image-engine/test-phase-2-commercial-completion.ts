import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import { RoutingResultSchema, SimpleInputRequestV1 } from "./types";
import { downloadPictureAsset } from "../../features/picture-engine/services/picture-engine.api";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runCommercialCompletionTests() {
  console.log("========================================================================");
  console.log("TIDO LAYER 1 — PHASE 2 COMMERCIAL INTELLIGENCE COMPLETION AUDIT & TEST");
  console.log("========================================================================");

  const creativeTypes = [
    { type: "poster", expectedBlock: "specialist.poster_foundation", expectedKeyword: "EDITORIAL COMMERCIAL POSTER" },
    { type: "social_ad", expectedBlock: "specialist.social_ad_foundation", expectedKeyword: "MOBILE-FIRST SOCIAL AD" },
    { type: "product_hero", expectedBlock: "specialist.product_hero_foundation", expectedKeyword: "MACRO PRODUCT HERO STUDIO" },
    { type: "website_banner", expectedBlock: "specialist.website_banner_foundation", expectedKeyword: "PANORAMIC WEBSITE BANNER" },
    { type: "ugc_thumbnail", expectedBlock: "specialist.ugc_thumbnail_foundation", expectedKeyword: "AUTHENTIC CREATOR UGC THUMBNAIL" },
  ];

  const dummyRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Commercial Matcha Tea Beverage",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.99,
        summary: "Matcha Tea Can",
        categories: [{ value: "beverage", confidence: 0.99, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "beverage_fnb", confidence: 0.99, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "beverage_commercial", confidence: 0.9, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Aluminum", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Liquid", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Matte Print", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylinder", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Can", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Logo", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 1.0 }],
    global_retrieval_queries: [],
  };

  const compiledPrompts: Record<string, string> = {};
  const retrievedBlocks: Record<string, string[]> = {};

  const compiler = new MasterPromptCompilerService();

  for (const item of creativeTypes) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`[TESTING CREATIVE TYPE] "${item.type}"`);
    console.log(`------------------------------------------------------------------------`);

    const request: SimpleInputRequestV1 = {
      concept: "Cold organic green tea drink with ice cubes and mint leaves",
      useCase: item.type,
      aspectRatio: item.type === "website_banner" ? "16:9" : "4:5",
      brandName: "TIDO MATCHA",
      copyItems: ["TIDO MATCHA TEA", "Cold Refreshment", "Buy 1 Get 1"],
      marketingContext: {
        industry: "F&B Beverage",
        objective: "Conversion Sales",
        target_channel: "Social Feed",
        target_audience: "Gen Z & Young Adults",
      },
      creativeDirection: {
        visual_style: "Commercial Premium",
        emotional_tone: "Refreshing & Energetic",
      },
    };

    // 1. Adapter Pass
    const adapted = SimpleInputAdapterService.adapt(request, dummyRouting);
    assert(adapted.success, `Adapter succeeded for useCase='${item.type}'`);

    // Verify Marketing & Creative Direction preserved in brief
    assert(
      adapted.compilerBrief.includes("F&B Beverage") && adapted.compilerBrief.includes("Refreshing & Energetic"),
      `Marketing context & creative direction preserved in adapted compilerBrief`
    );

    // 2. Knowledge Retrieval Pass
    const retrieval = await SmartKnowledgeRetriever.retrieve(
      adapted.resolvedRoutingResult,
      ["REF_01"],
      null,
      {
        useCase: adapted.useCase,
        brief: adapted.compilerBrief,
        brandName: adapted.brandName,
        copyItems: adapted.copyItems,
      }
    );

    assert(retrieval.success && Boolean(retrieval.package), `Knowledge retrieval succeeded for '${item.type}'`);

    const selectedBlockIds = (retrieval.package?.selected_blocks || []).map((b) => b.id);
    retrievedBlocks[item.type] = selectedBlockIds;

    assert(
      selectedBlockIds.includes(item.expectedBlock),
      `Retrieved expected specialist block '${item.expectedBlock}' for '${item.type}'`
    );

    // 3. Compiler Pass
    const compilerRes = await compiler.compile({
      ...(adapted.compilerInput as any),
      routingResult: adapted.resolvedRoutingResult,
      knowledgePackage: retrieval.package!,
      useCase: item.type,
    });

    assert(compilerRes.success && Boolean(compilerRes.package), `Compiler succeeded for '${item.type}'`);

    const prompt = compilerRes.package!.compiled_prompt;
    compiledPrompts[item.type] = prompt;

    assert(
      prompt.includes(item.expectedKeyword),
      `Compiled prompt contains unique strategy keyword '${item.expectedKeyword}'`
    );
  }

  // 4. Verify Prompts & Strategies are DIFFERENT across all 5 types
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`[VERIFYING CROSS-TYPE DIFFERENTIATION]`);
  console.log(`------------------------------------------------------------------------`);

  const typesList = creativeTypes.map((t) => t.type);

  for (let i = 0; i < typesList.length; i++) {
    for (let j = i + 1; j < typesList.length; j++) {
      const typeA = typesList[i];
      const typeB = typesList[j];

      const promptA = compiledPrompts[typeA];
      const promptB = compiledPrompts[typeB];

      assert(promptA !== promptB, `Compiled prompt for '${typeA}' is DIFFERENT from '${typeB}'`);

      const blockA = retrievedBlocks[typeA][0];
      const blockB = retrievedBlocks[typeB][0];

      assert(blockA !== blockB, `Specialist foundation block for '${typeA}' (${blockA}) is DIFFERENT from '${typeB}' (${blockB})`);
    }
  }

  // 5. Verify Download Button API Helper
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`[VERIFYING DOWNLOAD BUTTON HELPER INTEGRITY]`);
  console.log(`------------------------------------------------------------------------`);
  assert(typeof downloadPictureAsset === "function", "downloadPictureAsset function exported & ready for UI consumption");

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 2 COMMERCIAL INTELLIGENCE TESTS PASSED (100%)");
  console.log("========================================================================");
}

runCommercialCompletionTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
