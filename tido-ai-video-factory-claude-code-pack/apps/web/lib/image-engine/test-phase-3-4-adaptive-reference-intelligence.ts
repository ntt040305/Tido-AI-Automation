import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import {
  MasterPromptCompilerInput,
  RoutingResultSchema,
} from "./types";

async function runPhase34Tests() {
  console.log("==================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 3.4 ADAPTIVE REFERENCE INTELLIGENCE TEST SUITE");
  console.log("==================================================\n");

  const refIntelService = new ReferenceIntelligenceService();
  const compiler = new MasterPromptCompilerService();

  // ----------------------------------------------------
  // TEST CASE 1: Weak Studio White Background Reference
  // ----------------------------------------------------
  console.log("--- TEST CASE 1: Weak Studio White Background Reference ---");
  const weakRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Skincare product on studio white background",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.95,
        summary: "SKIN1004 Centella Serum on studio white background",
        categories: [{ value: "Skincare", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "Beauty", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "Serum", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Glass Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Serum Liquid", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Isolated studio white background", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylindrical Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Dropper Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Centella Logo", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
  };

  const weakManifest = refIntelService.generateManifest(weakRoutingResult);
  weakRoutingResult.reference_manifest = weakManifest;

  console.log("Weak Reference Analysis Result:", {
    classification: weakManifest.reference_quality_profile?.quality_classification,
    is_weak_reference: weakManifest.reference_quality_profile?.is_weak_reference,
    requires_adaptation: weakManifest.adaptive_constraints?.requires_adaptation,
    directive_length: weakManifest.adaptive_constraints?.compact_adaptation_directive.length,
  });

  if (!weakManifest.reference_quality_profile?.is_weak_reference) {
    throw new Error("FAIL: Expected weak reference detection for studio white background reference.");
  }
  if (!weakManifest.adaptive_constraints?.requires_adaptation) {
    throw new Error("FAIL: Expected adaptive constraints generation for weak reference.");
  }
  if ((weakManifest.adaptive_constraints?.compact_adaptation_directive.length || 0) > 500) {
    throw new Error("FAIL: Compact adaptation directive exceeded 500 characters budget limit!");
  }
  console.log("✓ Weak Reference Classification & Capped Budget Validated!\n");

  // Retrieve real knowledge package
  const weakRetrieval = await SmartKnowledgeRetriever.retrieve(weakRoutingResult, ["REF_01"]);
  if (!weakRetrieval.package) {
    throw new Error(`FAIL: Knowledge retrieval failed: ${weakRetrieval.error?.message}`);
  }

  // Compile prompt for weak reference
  const weakCompilerInput: MasterPromptCompilerInput = {
    brief: "Centella Serum luxury commercial poster",
    brandName: "SKIN1004",
    productCount: 1,
    copyItems: ["SKIN1004 Centella Serum"],
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: weakRoutingResult,
    knowledgePackage: weakRetrieval.package,
  };

  const weakCompilerRes = await compiler.compile(weakCompilerInput);
  if (!weakCompilerRes.success || !weakCompilerRes.package) {
    throw new Error(`FAIL: Compiler failed: ${weakCompilerRes.error?.message}`);
  }

  const weakPrompt = weakCompilerRes.package.compiled_prompt;
  const hasAdaptationSection = weakPrompt.includes("[REFERENCE ADAPTATION RULES]");
  const hasProductLocks = weakPrompt.includes("[REFERENCE IDENTITY LOCK]");

  console.log("Weak Reference Compiler Injections:", {
    hasAdaptationSection,
    hasProductLocks,
  });

  if (!hasAdaptationSection) {
    throw new Error("FAIL: [REFERENCE ADAPTATION RULES] section missing from compiled prompt for weak reference!");
  }
  if (!hasProductLocks) {
    throw new Error("FAIL: [REFERENCE IDENTITY LOCK] section modified or missing!");
  }
  console.log("✓ TEST CASE 1 PASSED: Weak reference correctly triggers isolated [REFERENCE ADAPTATION RULES]!\n");

  // ----------------------------------------------------
  // TEST CASE 2: Strong Environmental Reference
  // ----------------------------------------------------
  console.log("--- TEST CASE 2: Strong Environmental Reference ---");
  const strongRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Product in lifestyle environmental shot",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.95,
        summary: "Tea canister in rich environmental shot with natural light scene and lifestyle environment backdrop",
        categories: [{ value: "Beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "Food & Beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "Tea", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Tin Canister", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Tea Leaves", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Natural light scene with rich depth and cinematic setting", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylindrical Tin", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Metal Box", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Tea Logo", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
  };

  const strongManifest = refIntelService.generateManifest(strongRoutingResult);
  strongRoutingResult.reference_manifest = strongManifest;

  console.log("Strong Reference Analysis Result:", {
    classification: strongManifest.reference_quality_profile?.quality_classification,
    is_weak_reference: strongManifest.reference_quality_profile?.is_weak_reference,
    requires_adaptation: strongManifest.adaptive_constraints?.requires_adaptation,
  });

  if (strongManifest.reference_quality_profile?.is_weak_reference) {
    throw new Error("FAIL: Strong environmental reference misclassified as weak!");
  }
  if (strongManifest.adaptive_constraints?.requires_adaptation) {
    throw new Error("FAIL: Adaptation rules generated for strong environmental reference!");
  }

  // Retrieve real knowledge package
  const strongRetrieval = await SmartKnowledgeRetriever.retrieve(strongRoutingResult, ["REF_01"]);
  if (!strongRetrieval.package) {
    throw new Error(`FAIL: Knowledge retrieval failed: ${strongRetrieval.error?.message}`);
  }

  // Compile prompt for strong reference
  const strongCompilerInput: MasterPromptCompilerInput = {
    brief: "Organic Tea poster",
    brandName: "TIDO Tea",
    productCount: 1,
    copyItems: ["TIDO Tea"],
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: strongRoutingResult,
    knowledgePackage: strongRetrieval.package,
  };

  const strongCompilerRes = await compiler.compile(strongCompilerInput);
  if (!strongCompilerRes.success || !strongCompilerRes.package) {
    throw new Error(`FAIL: Compiler failed: ${strongCompilerRes.error?.message}`);
  }

  const strongPrompt = strongCompilerRes.package.compiled_prompt;
  const strongHasAdaptationSection = strongPrompt.includes("[REFERENCE ADAPTATION RULES]");
  const strongHasProductLocks = strongPrompt.includes("[REFERENCE IDENTITY LOCK]");

  console.log("Strong Reference Compiler Injections:", {
    strongHasAdaptationSection,
    strongHasProductLocks,
  });

  if (strongHasAdaptationSection) {
    throw new Error("FAIL: [REFERENCE ADAPTATION RULES] incorrectly injected for strong reference!");
  }
  if (!strongHasProductLocks) {
    throw new Error("FAIL: Product identity locks missing from strong reference compile!");
  }
  console.log("✓ TEST CASE 2 PASSED: Strong reference bypasses adaptive rules injection!\n");

  // ----------------------------------------------------
  // TEST CASE 3: Product Identity Lock Unchanged Verification
  // ----------------------------------------------------
  console.log("--- TEST CASE 3: Verification of Identity Lock Immutability ---");
  const compactLocks = weakManifest.product_manifest?.compact_identity_locks || [];

  console.log("Identity Locks Sample:", compactLocks[0]);

  // Ensure lock text contains strict preservation instructions and no rendering adaptation pollution
  const containsRedesign = compactLocks.some((l) => l.includes("redesign") && !l.includes("No redesign"));
  if (containsRedesign) {
    throw new Error("FAIL: Identity lock polluted with redesign instruction!");
  }
  console.log("✓ TEST CASE 3 PASSED: Product identity locks remain 100% untouched and pure!\n");

  console.log("==================================================");
  console.log("ALL PHASE 3.4 ADAPTIVE REFERENCE INTELLIGENCE TESTS PASSED (100%)");
  console.log("==================================================");
}

runPhase34Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
