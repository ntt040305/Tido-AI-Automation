import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { RoutingResultSchema, KnowledgePackageV1 } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runPhase24IdentityPreservationTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 2.4 REFERENCE IDENTITY PRESERVATION AUDIT");
  console.log("========================================================================");

  // 1. Setup Inputs (Product + Logo)
  console.log("\n[STEP 1] Initializing Product + Logo Asset Inputs...");
  const refIntel = new ReferenceIntelligenceService();
  const routingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "Luxury advertising campaign visual for TIDO Cold Brew Bottle with Official Logo",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_PROD"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Cold Brew Glass Bottle Photograph",
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

  // 2. Generate Manifest with Reference Intelligence Classification
  console.log("\n[STEP 2] Executing Reference Intelligence Manifest Generation...");
  const manifest = refIntel.generateManifest(routingResult);
  routingResult.reference_manifest = manifest;

  console.log("------------------ REFERENCE CLASSIFICATIONS ------------------");
  console.log(JSON.stringify(manifest.classifications, null, 2));

  assert(!!manifest.classifications && manifest.classifications.length === 2, "Generated 2 asset classifications");
  const prodClass = manifest.classifications?.find((c) => c.reference_id === "REF_01_PROD");
  const logoClass = manifest.classifications?.find((c) => c.reference_id === "REF_02_LOGO");

  assert(prodClass?.classification === "IDENTITY_REFERENCE", "Product asset classified as IDENTITY_REFERENCE");
  assert(logoClass?.classification === "IDENTITY_REFERENCE", "Logo asset classified as IDENTITY_REFERENCE");

  // 3. Verify Identity Rules Generator
  console.log("\n------------------ IDENTITY RULES GENERATOR ------------------");
  const prodRule = manifest.identity_rules.find((r) => r.type === "product_lock");
  const logoRule = manifest.identity_rules.find((r) => r.type === "logo_preservation");

  console.log("Product Lock Rule:", prodRule);
  console.log("Logo Lock Rule:", logoRule);

  assert(prodRule?.strength === "hard", "product_lock has strength: 'hard'");
  assert(prodRule?.rules?.includes("preserve silhouette") === true, "product_lock includes 'preserve silhouette'");
  assert(prodRule?.rules?.includes("preserve geometry") === true, "product_lock includes 'preserve geometry'");
  assert(prodRule?.rules?.includes("preserve packaging") === true, "product_lock includes 'preserve packaging'");
  assert(prodRule?.rules?.includes("preserve colors") === true, "product_lock includes 'preserve colors'");

  assert(logoRule?.strength === "absolute", "logo_preservation has strength: 'absolute'");
  assert(logoRule?.rules?.includes("use original logo") === true, "logo_preservation includes 'use original logo'");
  assert(logoRule?.rules?.includes("do not redraw") === true, "logo_preservation includes 'do not redraw'");
  assert(logoRule?.rules?.includes("do not modify typography") === true, "logo_preservation includes 'do not modify typography'");
  assert(logoRule?.rules?.includes("do not change proportions") === true, "logo_preservation includes 'do not change proportions'");

  // 4. Verify Diagnostics Report
  console.log("\n------------------ REFERENCE IDENTITY REPORT ------------------");
  const report = manifest.reference_identity_report;
  console.log(JSON.stringify(report, null, 2));

  assert(report?.product_lock === true, "reference_identity_report product_lock is true");
  assert(report?.logo_lock === true, "reference_identity_report logo_lock is true");
  assert((report?.identity_score ?? 0) >= 90, "reference_identity_report identity_score >= 90");
  assert(report?.transformation_allowed === true, "reference_identity_report transformation_allowed is true");

  // 5. Execute Prompt Compiler
  console.log("\n[STEP 3] Executing Master Prompt Compiler with [REFERENCE IDENTITY LOCK] Injection...");
  const compiler = new MasterPromptCompilerService();
  const mockKnowledgePackage: KnowledgePackageV1 = {
    package_version: "1.0",
    routing_version: "1.0",
    retrieval_mode: "HYBRID",
    requires_universal_core: false,
    universal_blocks: [],
    selected_blocks: [],
    rejected_candidates: [],
    warnings: [],
    stats: {
      repository_blocks: 5,
      metadata_candidates: 1,
      semantic_candidates: 1,
      fused_candidates: 1,
      selected_blocks: 0,
      estimated_tokens: 100,
      duration_ms: 2,
    },
  };

  const compileRes = await compiler.compile({
    useCase: "Poster",
    brief: "Place product in a high-end dark luxury marble setting with volumetric warm cinematic lighting.",
    aspectRatio: "4:5",
    routingResult,
    knowledgePackage: mockKnowledgePackage,
  });

  assert(compileRes.success === true, "Compiler executed successfully");
  const compiledPrompt = compileRes.package?.compiled_prompt || "";

  console.log("\n------------------ COMPILED MASTER PROMPT (EXTRACT) ------------------");
  console.log(compiledPrompt.slice(0, 1500));

  assert(compiledPrompt.includes("[REFERENCE IDENTITY LOCK]"), "Compiled prompt contains [REFERENCE IDENTITY LOCK]");
  assert(compiledPrompt.includes("Preserve:"), "Compiled prompt contains 'Preserve:' section");
  assert(compiledPrompt.includes("Allowed:"), "Compiled prompt contains 'Allowed:' section");
  assert(compiledPrompt.includes("Forbidden:"), "Compiled prompt contains 'Forbidden:' section");
  assert(compiledPrompt.includes("exact product appearance"), "Compiled prompt requires exact product appearance");
  assert(compiledPrompt.includes("exact packaging"), "Compiled prompt requires exact packaging");
  assert(compiledPrompt.includes("exact logo"), "Compiled prompt requires exact logo");
  assert(compiledPrompt.includes("new environment"), "Compiled prompt allows new environment synthesis");
  assert(compiledPrompt.includes("cinematic camera"), "Compiled prompt allows cinematic camera");

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 2.4 REFERENCE IDENTITY PRESERVATION TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPhase24IdentityPreservationTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
