import { CreativeConstraintService } from "./service/CreativeConstraintService";
import { ProductPlanningService } from "./service/ProductPlanningService";
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

async function runCreativeQualityRegressionTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — CREATIVE QUALITY REGRESSION AUDIT");
  console.log("========================================================================");

  const constraintService = new CreativeConstraintService();
  const planner = new ProductPlanningService();
  const compiler = new MasterPromptCompilerService();

  // ------------------------------------------------------------------------
  // 1. CreativeConstraintService Unit Output Validation
  // ------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------------------");
  console.log("[TEST 1] CreativeConstraintService Schema & Rule Resolution");
  console.log("------------------------------------------------------------------------");

  const constraintsNoText = constraintService.resolveConstraints({
    copyItems: [],
    hasLogoAsset: true,
    productCount: 1,
  });

  console.log("Constraint Resolution Output (No User Copy):", JSON.stringify(constraintsNoText, null, 2));

  assert(constraintsNoText.product_lock === true, "product_lock is TRUE");
  assert(constraintsNoText.logo_generation === false, "logo_generation is FALSE (Never invent fake logos)");
  assert(constraintsNoText.text_generation === false, "text_generation is FALSE (No text authorized)");
  assert(constraintsNoText.typography_mode === "reserved_space_only", "typography_mode is 'reserved_space_only'");
  assert(
    JSON.stringify(constraintsNoText.commercial_priority) === JSON.stringify(["product", "material", "lighting", "composition"]),
    "commercial_priority order is correct ['product', 'material', 'lighting', 'composition']"
  );
  assert(constraintsNoText.strict_negative_constraints.length > 0, "strict_negative_constraints populated");

  // ------------------------------------------------------------------------
  // 2. Full Pipeline Compiler Regression Test (Coffee Product Poster)
  // ------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------------------");
  console.log("[TEST 2] End-to-End Coffee Product Poster Compiler Audit");
  console.log("------------------------------------------------------------------------");

  const routing: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "Commercial Coffee Cup Product Poster",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_COFFEE_CUP"],
        reference_relationship_confidence: 0.99,
        summary: "Ceramic Coffee Cup with Espresso Product",
        categories: [{ value: "beverage", confidence: 0.99, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "cafe_fnb", confidence: 0.99, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "beverage_container", confidence: 0.9, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Ceramic Gloss", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Espresso Coffee Liquid with Crema", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Smooth White Gloss", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylindrical Cup with Handle", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Single Container", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Embossed Brand Logo Mark", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [{ reference_id: "REF_COFFEE_CUP", role: "PRODUCT", confidence: 1.0 }],
    global_retrieval_queries: [],
  };

  const productManifest = planner.buildProductManifest(routing, 1);
  routing.reference_manifest = {
    relationship_type: productManifest.relationship_type,
    total_references: 1,
    detected_products_count: 1,
    detected_logos_count: 0,
    same_product_views_count: 0,
    identity_rules: [],
    product_identity_locks: [],
    logo_locks: [],
    product_manifest: productManifest,
  } as any;

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
    brief: "Commercial coffee product poster for ceramic espresso cup",
    aspectRatio: "3:4",
    productCount: 1,
    routingResult: routing,
    knowledgePackage: mockKnowledgePackage,
  });

  assert(compileRes.success === true, "Master Prompt compiled successfully");
  const finalPrompt = compileRes.package?.compiled_prompt || "";

  console.log(`Final Compiled Master Prompt Length: ${finalPrompt.length} chars`);
  assert(finalPrompt.length <= 15000, `No prompt overflow (${finalPrompt.length} chars) <= 15000 chars limit`);

  // Verification 1: Anti-Text & Anti-Fake Brand Rules
  assert(finalPrompt.includes("LOGO GENERATION: FORBIDDEN"), "Logo generation is explicitly FORBIDDEN");
  assert(finalPrompt.includes("TEXT GENERATION: FORBIDDEN"), "Text generation is explicitly FORBIDDEN");
  assert(finalPrompt.includes("reserve clean typography area only"), "Typography mode enforces 'reserve clean typography area only'");

  // Verification 2: Check for forbidden prompt directives that cause quality degradation
  const forbiddenPhrases = [
    "add luxury branding",
    "create elegant typography",
    "design headline text",
    "create beautiful typography",
  ];

  for (const phrase of forbiddenPhrases) {
    const lowerPrompt = finalPrompt.toLowerCase();
    assert(!lowerPrompt.includes(phrase), `Prompt DOES NOT contain forbidden phrase: "${phrase}"`);
  }

  // Verification 3: Priority order & strict negative constraints
  assert(finalPrompt.includes("DO NOT generate fake text"), "Anti-fake text negative constraint present");
  assert(finalPrompt.includes("DO NOT invent synthetic logos"), "Anti-synthetic logo negative constraint present");

  console.log("\n========================================================================");
  console.log("🎉 CREATIVE QUALITY REGRESSION AUDIT PASSED (100%)");
  console.log("========================================================================");
}

runCreativeQualityRegressionTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
