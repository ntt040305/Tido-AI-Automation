import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";
import { ReferenceControlService } from "./service/ReferenceControlService";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";
import { RoutingResultSchema, KnowledgePackageV1 } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runPhase253ReferenceControlTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 2.5.3 REFERENCE CONTROL ENGINE AUDIT");
  console.log("========================================================================");

  const refIntel = new ReferenceIntelligenceService();
  const controlService = new ReferenceControlService();
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

  // ------------------------------------------------------------------
  // TEST CASE 1: Product + Logo Reference
  // ------------------------------------------------------------------
  console.log("\n[TEST CASE 1] Product + Logo Reference");
  const routingCase1: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Coffee Bottle with Official Logo",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_PROD"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Cold Brew Bottle",
        categories: [{ value: "beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "f_and_b", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "refreshment", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Amber Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Cold Brew Coffee", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Glossy Refractive Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylindrical Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Glass Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "TIDO Brand Label", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
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

  const metadataCase1 = controlService.generateControlMetadata(routingCase1);
  console.log("Case 1 Compact Directive:", metadataCase1.compact_directive);
  console.log(`Directive Length: ${metadataCase1.compact_directive.length} chars`);

  assert(metadataCase1.compact_directive.length < 500, "Case 1 Compact Directive is UNDER 500 characters");
  assert(metadataCase1.identity_confidence_score === 0.98, "Case 1 Identity Confidence Score is 0.98");
  assert(metadataCase1.reference_priority[0].role === "LOGO", "Case 1 Rank 1 Priority is LOGO");

  // ------------------------------------------------------------------
  // TEST CASE 2: Front / Back Same Product
  // ------------------------------------------------------------------
  console.log("\n[TEST CASE 2] Front / Back Same Product (Multi-View)");
  const routingCase2: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Vitamin Bottle Front and Back View",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_FRONT", "REF_02_BACK"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Vitamin Supplement Container",
        categories: [{ value: "healthcare", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "wellness", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "supplement", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Matte White HDPE Plastic", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Capsules", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Matte Finish", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Cylindrical Pill Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Pill Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Front Label & Back Nutrition Label", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01_FRONT", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_02_BACK", role: "PRODUCT", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const metadataCase2 = controlService.generateControlMetadata(routingCase2);
  assert(metadataCase2.compact_directive.length < 500, "Case 2 Compact Directive is UNDER 500 characters");
  assert(metadataCase2.preserve_features.includes("Product Silhouette & Geometry") === true, "Case 2 preserves Product Silhouette");

  // ------------------------------------------------------------------
  // TEST CASE 3: Multi Product
  // ------------------------------------------------------------------
  console.log("\n[TEST CASE 3] Multi Product");
  const routingCase3: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Skincare Serum + Cream Duo Set",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_SERUM"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Glow Serum Bottle",
        categories: [{ value: "beauty", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "skincare", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "hydration", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "Frosted Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Clear Serum", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Frosted Texture", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Dropper Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Dropper Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Glow Serum Label", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
      {
        product_id: "PRODUCT_02",
        reference_ids: ["REF_02_CREAM"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Night Cream Jar",
        categories: [{ value: "beauty", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        industry_domains: [{ value: "skincare", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        likely_functions: [{ value: "moisturizer", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "" }],
        materials: [{ value: "White Ceramic Jar", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        contents: [{ value: "Rich Cream", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        surface_properties: [{ value: "Smooth Ceramic", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        geometry_traits: [{ value: "Round Jar", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        packaging_types: [{ value: "Cream Jar", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        branding_features: [{ value: "Night Cream Label", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01_SERUM", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_02_CREAM", role: "PRODUCT", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const metadataCase3 = controlService.generateControlMetadata(routingCase3);
  assert(metadataCase3.compact_directive.length < 500, "Case 3 Compact Directive is UNDER 500 characters");
  assert(metadataCase3.reference_priority.length === 2, "Case 3 Reference Priority has 2 product entries");

  // ------------------------------------------------------------------
  // TEST CASE 4: Product + Style Reference
  // ------------------------------------------------------------------
  console.log("\n[TEST CASE 4] Product + Style Reference");
  const routingCase4: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "TIDO Product with Ambient Style Mood",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_PROD"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Product Bottle",
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
    asset_roles: [
      { reference_id: "REF_01_PROD", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_02_STYLE", role: "SUPPORT_REFERENCE", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const metadataCase4 = controlService.generateControlMetadata(routingCase4);
  assert(metadataCase4.compact_directive.length < 500, "Case 4 Compact Directive is UNDER 500 characters");
  const styleEntry = metadataCase4.reference_priority.find((rp) => rp.reference_id === "REF_02_STYLE");
  assert(styleEntry?.role_weight === 0.6, "Style reference role_weight is 0.6");

  // ------------------------------------------------------------------
  // PROMPT COMPILATION & BUDGET PROTECTION VERIFICATION
  // ------------------------------------------------------------------
  console.log("\n[PROMPT BUDGET PROTECTION VERIFICATION]");
  const manifestCase1 = refIntel.generateManifest(routingCase1);
  routingCase1.reference_manifest = manifestCase1;

  const compileRes = await compiler.compile({
    useCase: "Poster",
    brief: "Luxury commercial campaign visual poster for TIDO Cold Brew",
    aspectRatio: "1:1",
    routingResult: routingCase1,
    knowledgePackage: mockKnowledgePackage,
  });

  assert(compileRes.success === true, "Prompt Compiler executed successfully");
  const rawPrompt = compileRes.package?.compiled_prompt || "";
  const optResult = ProviderPromptOptimizer.optimize(rawPrompt);

  console.log(`Raw Compiled Prompt Length: ${rawPrompt.length} chars`);
  console.log(`Optimized Provider Prompt Length: ${optResult.optimizedPrompt.length} chars`);
  console.log(`Prompt Budget Hard Limit: ${ProviderPromptOptimizer.HARD_LIMIT} chars`);

  assert(optResult.optimizedPrompt.length <= ProviderPromptOptimizer.HARD_LIMIT, `Optimized prompt length (${optResult.optimizedPrompt.length} chars) <= MAX 18000 budget ceiling`);
  assert(optResult.optimizedPrompt.includes("[REF CONTROL]"), "Optimized prompt contains [REF CONTROL] compact directive");

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 2.5.3 REFERENCE CONTROL ENGINE TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPhase253ReferenceControlTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
