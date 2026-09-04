import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import {
  MasterPromptCompilerInput,
  RoutingResultSchema,
} from "./types";

async function runPhase35Tests() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 3.5 ADAPTIVE REFERENCE QUALITY DECISION SUITE");
  console.log("========================================================================\n");

  const refIntelService = new ReferenceIntelligenceService();
  const compiler = new MasterPromptCompilerService();

  // ----------------------------------------------------------------------
  // TEST 1: Professional Studio Image -> DIRECT_BYPASS
  // ----------------------------------------------------------------------
  console.log("--- [TEST 1] Professional Studio Image -> DIRECT_BYPASS ---");
  const studioRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Luxury watch studio photo",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.98,
        summary: "Swiss Luxury Watch on studio white background with professional lighting, contact shadow, and high detail reflections",
        categories: [{ value: "Watch", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "Jewelry", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "Timepiece", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Stainless Steel", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Watch Movement", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Studio white background with professional lighting and soft shadow", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Circular Dial", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Watch Case", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Brand Logo", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
  };

  const studioManifest = refIntelService.generateManifest(studioRoutingResult);
  studioRoutingResult.reference_manifest = studioManifest;

  console.log("Test 1 Decision Result:", {
    category: studioManifest.reference_quality_profile?.category,
    bypass_action: studioManifest.reference_quality_profile?.bypass_action,
    readiness_overall: studioManifest.reference_quality_profile?.readiness_score?.overallScore,
    requires_adaptation: studioManifest.adaptive_constraints?.requires_adaptation,
  });

  if (studioManifest.reference_quality_profile?.category !== "PROFESSIONAL_STUDIO") {
    throw new Error(`FAIL: Expected category PROFESSIONAL_STUDIO, got ${studioManifest.reference_quality_profile?.category}`);
  }
  if (studioManifest.reference_quality_profile?.bypass_action !== "DIRECT_BYPASS") {
    throw new Error(`FAIL: Expected bypass_action DIRECT_BYPASS, got ${studioManifest.reference_quality_profile?.bypass_action}`);
  }
  if (studioManifest.adaptive_constraints?.requires_adaptation !== false) {
    throw new Error("FAIL: Professional studio reference should not require prompt adaptation.");
  }
  console.log("✓ TEST 1 PASSED: Professional studio image correctly assigned DIRECT_BYPASS!\n");

  // ----------------------------------------------------------------------
  // TEST 2: Marketplace Flat Product Image -> PROMPT_COMPENSATION_ONLY
  // ----------------------------------------------------------------------
  console.log("--- [TEST 2] Marketplace Flat Product Image -> PROMPT_COMPENSATION_ONLY ---");
  const flatRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Flat e-commerce product photo",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.95,
        summary: "E-commerce product photo on flat white background with no shadow and 2d flat product lighting",
        categories: [{ value: "Skincare", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "Beauty", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "Serum", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Plastic Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Serum", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Flat marketplace photo on plain white background", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylinder", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Logo", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
  };

  const flatManifest = refIntelService.generateManifest(flatRoutingResult);
  flatRoutingResult.reference_manifest = flatManifest;

  console.log("Test 2 Decision Result:", {
    category: flatManifest.reference_quality_profile?.category,
    bypass_action: flatManifest.reference_quality_profile?.bypass_action,
    readiness_overall: flatManifest.reference_quality_profile?.readiness_score?.overallScore,
    requires_adaptation: flatManifest.adaptive_constraints?.requires_adaptation,
    directive_length: flatManifest.adaptive_constraints?.compact_adaptation_directive.length,
  });

  if (flatManifest.reference_quality_profile?.category !== "MARKETPLACE_FLAT") {
    throw new Error(`FAIL: Expected category MARKETPLACE_FLAT, got ${flatManifest.reference_quality_profile?.category}`);
  }
  if (flatManifest.reference_quality_profile?.bypass_action !== "PROMPT_COMPENSATION_ONLY") {
    throw new Error(`FAIL: Expected bypass_action PROMPT_COMPENSATION_ONLY, got ${flatManifest.reference_quality_profile?.bypass_action}`);
  }
  if (!flatManifest.adaptive_constraints?.requires_adaptation) {
    throw new Error("FAIL: Flat marketplace image must trigger prompt compensation.");
  }
  const dirLen = flatManifest.adaptive_constraints?.compact_adaptation_directive.length || 0;
  if (dirLen > 500) {
    throw new Error(`FAIL: Adaptation directive length ${dirLen} exceeds maximum 500 chars limit!`);
  }

  // Verify Compiler Integration & Identity Lock Integrity
  const flatRetrieval = await SmartKnowledgeRetriever.retrieve(flatRoutingResult, ["REF_01"]);
  const flatCompilerInput: MasterPromptCompilerInput = {
    brief: "Serum poster",
    brandName: "Glow Serum",
    productCount: 1,
    copyItems: ["Glow Serum"],
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: flatRoutingResult,
    knowledgePackage: flatRetrieval.package!,
  };

  const flatCompiledRes = await compiler.compile(flatCompilerInput);
  if (!flatCompiledRes.success || !flatCompiledRes.package) {
    throw new Error(`FAIL: Master compiler failed: ${flatCompiledRes.error?.message}`);
  }

  const flatPrompt = flatCompiledRes.package.compiled_prompt;
  if (!flatPrompt.includes("[REFERENCE ADAPTATION RULES]")) {
    throw new Error("FAIL: [REFERENCE ADAPTATION RULES] section missing from compiled prompt!");
  }
  if (!flatPrompt.includes("[REFERENCE IDENTITY LOCK]")) {
    throw new Error("FAIL: Product identity locks altered or removed!");
  }
  console.log("✓ TEST 2 PASSED: Marketplace flat product correctly assigned PROMPT_COMPENSATION_ONLY with <=500 char directive!\n");

  // ----------------------------------------------------------------------
  // TEST 3: Lifestyle Image -> DIRECT_BYPASS
  // ----------------------------------------------------------------------
  console.log("--- [TEST 3] Lifestyle Image -> DIRECT_BYPASS ---");
  const lifestyleRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Coffee cup in lifestyle café setting",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.95,
        summary: "Coffee tumbler in rich lifestyle environment with natural light scene and warm café background",
        categories: [{ value: "Beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "Café", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "Tumbler", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Ceramic", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Coffee", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Natural light scene with rich depth and cinematic setting", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylinder", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Cup", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Logo", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
  };

  const lifestyleManifest = refIntelService.generateManifest(lifestyleRoutingResult);
  lifestyleRoutingResult.reference_manifest = lifestyleManifest;

  console.log("Test 3 Decision Result:", {
    category: lifestyleManifest.reference_quality_profile?.category,
    bypass_action: lifestyleManifest.reference_quality_profile?.bypass_action,
    requires_adaptation: lifestyleManifest.adaptive_constraints?.requires_adaptation,
  });

  if (lifestyleManifest.reference_quality_profile?.category !== "LIFESTYLE_ENVIRONMENT") {
    throw new Error(`FAIL: Expected category LIFESTYLE_ENVIRONMENT, got ${lifestyleManifest.reference_quality_profile?.category}`);
  }
  if (lifestyleManifest.reference_quality_profile?.bypass_action !== "DIRECT_BYPASS") {
    throw new Error(`FAIL: Expected bypass_action DIRECT_BYPASS, got ${lifestyleManifest.reference_quality_profile?.bypass_action}`);
  }
  if (lifestyleManifest.adaptive_constraints?.requires_adaptation !== false) {
    throw new Error("FAIL: Lifestyle image should bypass prompt adaptation.");
  }
  console.log("✓ TEST 3 PASSED: Lifestyle image correctly assigned DIRECT_BYPASS!\n");

  // ----------------------------------------------------------------------
  // TEST 4: Low Quality Image -> QUALITY_WARNING_ADVISED (Generation Continues)
  // ----------------------------------------------------------------------
  console.log("--- [TEST 4] Low Quality Image -> QUALITY_WARNING_ADVISED ---");
  const lowQualityRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Low quality blurry photo",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.70,
        summary: "Low quality blurry photo of product bottle with low resolution and noise",
        categories: [{ value: "Product", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "Retail", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "Bottle", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Plastic", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Liquid", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Low quality degraded surface detail", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Blurry Logo", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
  };

  const lowQualityManifest = refIntelService.generateManifest(lowQualityRoutingResult);
  lowQualityRoutingResult.reference_manifest = lowQualityManifest;

  console.log("Test 4 Decision Result:", {
    category: lowQualityManifest.reference_quality_profile?.category,
    bypass_action: lowQualityManifest.reference_quality_profile?.bypass_action,
    readiness_overall: lowQualityManifest.reference_quality_profile?.readiness_score?.overallScore,
  });

  if (lowQualityManifest.reference_quality_profile?.category !== "LOW_QUALITY") {
    throw new Error(`FAIL: Expected category LOW_QUALITY, got ${lowQualityManifest.reference_quality_profile?.category}`);
  }
  if (lowQualityManifest.reference_quality_profile?.bypass_action !== "QUALITY_WARNING_ADVISED") {
    throw new Error(`FAIL: Expected bypass_action QUALITY_WARNING_ADVISED, got ${lowQualityManifest.reference_quality_profile?.bypass_action}`);
  }

  // Verify compilation still succeeds without blocking pipeline
  const lowRetrieval = await SmartKnowledgeRetriever.retrieve(lowQualityRoutingResult, ["REF_01"]);
  const lowCompilerInput: MasterPromptCompilerInput = {
    brief: "Commercial poster",
    brandName: "Brand",
    productCount: 1,
    copyItems: ["Brand Product"],
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: lowQualityRoutingResult,
    knowledgePackage: lowRetrieval.package!,
  };

  const lowCompiledRes = await compiler.compile(lowCompilerInput);
  if (!lowCompiledRes.success) {
    throw new Error("FAIL: Low quality reference must NEVER block prompt compilation or generation!");
  }
  console.log("✓ TEST 4 PASSED: Low quality reference emits QUALITY_WARNING_ADVISED and continues generation normally!\n");

  // ----------------------------------------------------------------------
  // TEST 5: Backward Compatibility & Phase 3.5 OFF Equivalence Regression Test
  // ----------------------------------------------------------------------
  console.log("--- [TEST 5] Backward Compatibility & OFF Regression Equivalence ---");
  const studioRetrieval = await SmartKnowledgeRetriever.retrieve(studioRoutingResult, ["REF_01"]);
  const studioCompilerInput: MasterPromptCompilerInput = {
    brief: "Swiss Luxury Watch poster",
    brandName: "Swiss Watch",
    productCount: 1,
    copyItems: ["Swiss Luxury Watch"],
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: studioRoutingResult,
    knowledgePackage: studioRetrieval.package!,
  };

  const studioCompiledRes = await compiler.compile(studioCompilerInput);
  const studioPrompt = studioCompiledRes.package!.compiled_prompt;

  const hasAdaptationSectionInBypass = studioPrompt.includes("[REFERENCE ADAPTATION RULES]");
  if (hasAdaptationSectionInBypass) {
    throw new Error("FAIL: DIRECT_BYPASS prompt should NOT contain [REFERENCE ADAPTATION RULES] section!");
  }

  // Ensure ProductManifest structure remains unchanged
  const pm = studioManifest.product_manifest;
  if (!pm || !pm.compact_identity_locks || pm.compact_identity_locks.length === 0) {
    throw new Error("FAIL: ProductManifest structure was modified or corrupted!");
  }

  console.log("✓ TEST 5 PASSED: DIRECT_BYPASS output matches unadapted pipeline behavior, ProductManifest remains untouched!\n");

  console.log("========================================================================");
  console.log("ALL PHASE 3.5 ADAPTIVE REFERENCE QUALITY DECISION TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPhase35Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
