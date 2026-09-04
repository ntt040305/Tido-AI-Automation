import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";
import { RoutingResultSchema, KnowledgePackageV1 } from "./types";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runPromptOptimizerAcceptanceTest() {
  console.log("==========================================================");
  console.log("TIDO PICTURE ENGINE V1 — PROMPT OPTIMIZER ACCEPTANCE TEST");
  console.log("==========================================================");

  // 1. Setup Mock Heavy Inputs (Simulating >20k raw prompt output)
  const refIntel = new ReferenceIntelligenceService();
  const routingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "Commercial advertisement poster for TIDO Cold Brew with official logo",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_PROD"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Cold Brew Glass Bottle",
        categories: [{ value: "beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Coffee" }],
        industry_domains: [{ value: "f_and_b", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "F&B" }],
        likely_functions: [{ value: "refreshment", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Refreshment" }],
        materials: [{ value: "Amber Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Glass Bottle" }],
        contents: [{ value: "Cold Brew Coffee", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Coffee" }],
        surface_properties: [{ value: "Glossy Refractive Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Glossy" }],
        geometry_traits: [{ value: "Cylindrical Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Cylindrical" }],
        packaging_types: [{ value: "Glass Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Bottle" }],
        branding_features: [{ value: "Tido Official Logo", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Logo" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01_PROD", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_02_LOGO", role: "LOGO", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const manifest = refIntel.generateManifest(routingResult);
  routingResult.reference_manifest = manifest;

  const heavyKnowledgePackage: KnowledgePackageV1 = {
    package_version: "1.0",
    routing_version: "1.0",
    retrieval_mode: "HYBRID",
    requires_universal_core: false,
    universal_blocks: [],
    selected_blocks: [],
    rejected_candidates: [],
    warnings: [],
    stats: {
      repository_blocks: 10,
      metadata_candidates: 2,
      semantic_candidates: 2,
      fused_candidates: 2,
      selected_blocks: 0,
      estimated_tokens: 400,
      duration_ms: 5,
    },
  };

  // 2. Execute Master Prompt Compiler
  console.log("\n[STEP 1] Executing Master Prompt Compiler with Provider Prompt Optimizer...");
  const compiler = new MasterPromptCompilerService();
  const compileResult = await compiler.compile({
    useCase: "Poster",
    brief: "Create an ultra-luxurious commercial poster for TIDO Cold Brew placed on dark marble counter with golden ambient lighting and soft volumetric rim highlights.",
    aspectRatio: "4:5",
    routingResult,
    knowledgePackage: heavyKnowledgePackage,
  });

  if (!compileResult.success) {
    console.error("Compiler Error:", compileResult.error);
  }
  assert(compileResult.success === true, "Compiler succeeded without exceeding budget caps");

  const optimizedPrompt = compileResult.package?.compiled_prompt || "";
  const promptLength = optimizedPrompt.length;

  console.log(`\n[STEP 2] Output Prompt Length Analysis: ${promptLength} characters`);

  // 3. Validation Criteria
  assert(promptLength < ProviderPromptOptimizer.WARN_THRESHOLD, `Optimized prompt is strictly < 18,000 characters (${promptLength} chars)`);
  assert(promptLength < ProviderPromptOptimizer.HARD_LIMIT, `Optimized prompt is strictly < 20,000 characters hard limit`);

  // 4. Verify Essential Identity Locks Preserved
  console.log("\n[STEP 3] Verifying Identity Preservations...");
  assert(optimizedPrompt.includes("PRODUCT_LOCK") || optimizedPrompt.includes("PRODUCT IDENTITY LOCKS") || optimizedPrompt.includes("PRODUCT PLANNING MANIFEST"), "Preserved [PRODUCT_LOCK]");
  assert(optimizedPrompt.includes("LOGO_PRESERVATION") || optimizedPrompt.includes("LOGO PRESERVATION LOCKS"), "Preserved [LOGO_PRESERVATION]");
  assert(optimizedPrompt.includes("REFERENCE MANIFEST RELATIONSHIP TYPE"), "Preserved [REFERENCE IMAGE RULES]");

  // 5. Verify Internal Explanations Removed
  console.log("\n[STEP 4] Verifying Removal of Internal Explanations...");
  assert(!optimizedPrompt.includes("## KNOWLEDGE IS NON-EXHAUSTIVE"), "Removed 'KNOWLEDGE IS NON-EXHAUSTIVE'");
  assert(!optimizedPrompt.includes("## OPEN-WORLD PRODUCT REASONING"), "Removed 'OPEN-WORLD PRODUCT REASONING'");
  assert(!optimizedPrompt.includes("## FULL CREATIVE AUTHORITY"), "Removed 'FULL CREATIVE AUTHORITY'");
  assert(!optimizedPrompt.includes("## INTERNAL FINAL CHECK"), "Removed 'INTERNAL FINAL CHECK'");

  console.log("\n==========================================================");
  console.log("🎉 ALL PROMPT OPTIMIZER ACCEPTANCE TESTS PASSED (100%)");
  console.log("==========================================================");
}

runPromptOptimizerAcceptanceTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
