import { ExactCopyIntegrityValidator } from "./compiler/ExactCopyIntegrityValidator";
import { InputFingerprint } from "./compiler/InputFingerprint";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { MasterPromptTemplateValidator } from "./compiler/MasterPromptTemplateValidator";
import { PromptBudgetValidator } from "./compiler/PromptBudgetValidator";
import { LocalKnowledgeRepository } from "./repository/LocalKnowledgeRepository";
import {
  KnowledgePackageV1,
  MasterPromptCompilerInput,
  RoutingResultSchema,
  SelectedBlockEntry,
} from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ PASSED: ${message}`);
  }
}

// ── SAMPLE MOCK DATA FOR TESTS ────────────────────────────────────
const mockRoutingResult: RoutingResultSchema = {
  routing_version: "1.0",
  routing_mode: "HIGH_CONFIDENCE",
  requires_universal_core: true,
  products: [
    {
      product_id: "PRODUCT_01",
      reference_ids: ["REF_01", "REF_02"],
      reference_relationship_confidence: 0.95,
      summary: "Glass beverage bottle containing cold brew coffee",
      categories: [
        { value: "Beverages", confidence: 0.98, evidence_type: "OBSERVED", evidence_summary: "Bottle label" },
      ],
      industry_domains: [
        { value: "Food & Beverage", confidence: 0.98, evidence_type: "OBSERVED", evidence_summary: "Beverage packaging" },
      ],
      likely_functions: [],
      materials: [
        { value: "Glass", confidence: 0.96, evidence_type: "OBSERVED", evidence_summary: "Transparent bottle" },
      ],
      contents: [
        { value: "Liquid", confidence: 0.92, evidence_type: "OBSERVED", evidence_summary: "Dark coffee liquid" },
      ],
      surface_properties: [
        { value: "Smooth", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Glass surface" },
      ],
      geometry_traits: [],
      packaging_types: [
        { value: "Bottle", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Glass bottle" },
      ],
      branding_features: [],
      visual_challenges: [
        { id: "glass_refraction", description: "Complex light transmission through dark liquid", confidence: 0.9 },
      ],
      unknowns: [
        { subject: "Rear label content", reason: "Rear surface not visible in reference photos", importance: "HIGH" },
      ],
      retrieval_queries: [
        { query: "glass transparency refraction", importance: "PRIMARY", reason: "Glass bottle rendering" },
      ],
    },
  ],
  global_retrieval_queries: [],
  routing_summary: "Single beverage product in glass bottle.",
};

const mockUniversalBlocks: SelectedBlockEntry[] = [
  { id: "universal.commercial_visual_hierarchy", version: "1.0.1", title: "Visual Hierarchy", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 232 },
  { id: "universal.camera_perspective_coherence", version: "1.0.1", title: "Perspective Coherence", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 240 },
  { id: "universal.lighting_material_readability", version: "1.0.1", title: "Lighting & Material Readability", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 247 },
  { id: "universal.typography_graphic_integration", version: "1.0.1", title: "Typography Integration", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 235 },
  { id: "universal.physical_scene_coherence", version: "1.0.1", title: "Physical Scene Coherence", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: [], estimated_tokens: 248 },
];

const mockSpecialistBlocks: SelectedBlockEntry[] = [
  { id: "material.glass", version: "1.0.0", title: "Glass Optics", knowledge_type: "MATERIAL", selection_tier: "PRIMARY", final_score: 0.88, scores: { metadata: 0.9, semantic: 0.85, signal_confidence: 0.9, information_value: 0.9, priority: 0.8, query_importance: 0.9, redundancy_penalty: 0 }, matched_signals: ["materials:Glass"], selection_reasons: ["Strong metadata match"], estimated_tokens: 210 },
];

const mockKnowledgePackage: KnowledgePackageV1 = {
  package_version: "1.0",
  routing_version: "1.0",
  retrieval_mode: "HYBRID",
  requires_universal_core: true,
  universal_blocks: mockUniversalBlocks,
  selected_blocks: mockSpecialistBlocks,
  rejected_candidates: [
    { id: "property.transparent", final_score: 0.72, reason_code: "COVERED_BY_SELECTED_BLOCK", reason: "Covered by material.glass" },
  ],
  warnings: [],
  stats: { repository_blocks: 7, metadata_candidates: 2, semantic_candidates: 2, fused_candidates: 2, selected_blocks: 6, estimated_tokens: 1412, duration_ms: 12 },
};

export async function runStage4BTests() {
  process.exitCode = 0;
  console.log("\n=================================================");
  console.log("⚡ STAGE 4B — MASTER PROMPT COMPILER V2 TEST SUITE");
  console.log("=================================================\n");

  const compiler = new MasterPromptCompilerService();

  // ── 1. Master Prompt V2 Template Loading & Validation ─────────
  console.log("🔹 1. Master Prompt V2 Template Validation Tests");
  const templateVal = MasterPromptTemplateValidator.loadAndValidateTemplate();
  assert(templateVal.isValid, "Master Prompt V2 template file loads and validates successfully");
  assert(templateVal.templateId === "master_prompt_v2", "Template ID is 'master_prompt_v2'");
  assert(templateVal.templateVersion === "2.0.9", "Template version is '2.0.9'");
  assert(templateVal.templateHash.length > 0, `Template hash generated: ${templateVal.templateHash}`);

  // Test detection of unresolved placeholders
  const unresolvedTest = MasterPromptTemplateValidator.findUnresolvedPlaceholders("Hello {{USER_BRIEF}} and {{UNKNOWN_KEY}}");
  assert(unresolvedTest.includes("{{USER_BRIEF}}") && unresolvedTest.includes("{{UNKNOWN_KEY}}"), "Template validator correctly detects unresolved placeholders");

  // ── 2. Determinism & Traceability Test ─────────────────────────
  console.log("\n🔹 2. Determinism & Traceability Tests");
  const sampleInput: MasterPromptCompilerInput = {
    productReferences: [{ reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0 }],
    brief: "Cold brew coffee campaign for summer social post.",
    productCount: 1,
    copyItems: [
      { text: "Bộ đôi Signature", type: "headline" },
      { text: "49.000đ", type: "price" },
      { text: "Thử ngay hôm nay!", type: "cta" },
    ],
    brandName: "Cafe Florian",
    brandInfo: "Premium coffee brand with heritage positioning.",
    hardRequirements: ["Do not alter bottle shape", "Keep logo clear"],
    useCase: "Social Post",
    aspectRatio: "4:5",
    routingResult: mockRoutingResult,
    knowledgePackage: mockKnowledgePackage,
  };

  const res1 = await compiler.compile(sampleInput);
  const res2 = await compiler.compile(sampleInput);

  assert(res1.success, "Compilation 1 succeeded");
  assert(res2.success, "Compilation 2 succeeded");

  if (res1.success && res2.success && res1.package && res2.package) {
    assert(res1.package.compiled_prompt === res2.package.compiled_prompt, "Compiled prompt is 100% identical across independent runs (Deterministic)");
    assert(res1.package.template.hash === res2.package.template.hash, "Template hash is identical across runs");
    assert(res1.package.input_fingerprint === res2.package.input_fingerprint, "Input fingerprint is identical for identical inputs");
    assert(res1.package.knowledge.universal_block_ids.length === 5, "Includes all 5 Universal Core block IDs");
    assert(res1.package.knowledge.specialist_block_ids.includes("material.glass"), "Includes selected specialist block ID 'material.glass'");
    assert(Object.keys(res1.package.knowledge.knowledge_versions).length >= 6, "Knowledge versions object is fully traceable for every injected block");
  }

  // ── 3. Exact Copy Integrity & Vietnamese Unicode Test ─────────
  console.log("\n🔹 3. Exact Copy Integrity & Vietnamese Unicode Tests");
  const copyValidatorPass = ExactCopyIntegrityValidator.validate(
    [{ text: "Bộ đôi Signature" }, { text: "49.000đ" }, { text: "Thử ngay hôm nay!" }],
    res1.package?.compiled_prompt || ""
  );
  assert(copyValidatorPass.isValid, "Exact Copy Validator confirms exact text copy strings exist in compiled prompt");

  const copyValidatorFail = ExactCopyIntegrityValidator.validate(
    [{ text: "Nonexistent Text Copy Item" }],
    res1.package?.compiled_prompt || ""
  );
  assert(!copyValidatorFail.isValid && copyValidatorFail.missingItems.includes("Nonexistent Text Copy Item"), "Exact Copy Validator correctly detects missing text copy items");

  // ── 4. Knowledge Boundary & Injection Safety Test ──────────────
  console.log("\n🔹 4. Knowledge Boundary & Injection Safety Tests");
  const compiledText = res1.package?.compiled_prompt || "";

  // Universal blocks included
  assert(compiledText.includes("universal.commercial_visual_hierarchy"), "Includes Universal Block 'commercial_visual_hierarchy'");
  assert(compiledText.includes("universal.physical_scene_coherence"), "Includes Universal Block 'physical_scene_coherence'");

  // Specialist block included
  assert(compiledText.includes("material.glass"), "Includes Specialist Block 'material.glass'");

  // Rejected block excluded
  assert(!compiledText.includes("property.transparent"), "Excludes rejected candidate 'property.transparent'");

  // No retrieval scores inside prompt text
  assert(!compiledText.includes("final_score"), "Does not pollute prompt with internal retrieval score fields");
  assert(!compiledText.includes("COVERED_BY_SELECTED_BLOCK"), "Does not pollute prompt with internal rejection reason codes");

  // ── 5. Product Instance & Quantity Semantics Tests ─────────────
  console.log("\n🔹 5. Product Instance Semantics & Conflict Tests");

  // Conflict case: 2 routed products, but requested productCount = 1
  const multiProductRouting: RoutingResultSchema = {
    ...mockRoutingResult,
    products: [
      { ...mockRoutingResult.products[0], product_id: "PRODUCT_01", reference_ids: ["REF_01"] },
      { ...mockRoutingResult.products[0], product_id: "PRODUCT_02", reference_ids: ["REF_02"] },
    ],
  };

  const conflictInput: MasterPromptCompilerInput = {
    ...sampleInput,
    productCount: 1, // Conflict! 2 routed products require at least 2 instances
    routingResult: multiProductRouting,
  };

  const conflictRes = await compiler.compile(conflictInput);
  assert(!conflictRes.success, "Compiler correctly rejects product count conflict (requested 1 instance for 2 routed products)");
  assert(conflictRes.error?.code === "PRODUCT_INSTANCE_CONFLICT", `Error code is 'PRODUCT_INSTANCE_CONFLICT' (found '${conflictRes.error?.code}')`);

  // Valid multi-product case: 2 routed products, productCount = 2
  const validMultiInput: MasterPromptCompilerInput = {
    ...sampleInput,
    productCount: 2,
    routingResult: multiProductRouting,
  };

  const validMultiRes = await compiler.compile(validMultiInput);
  assert(validMultiRes.success, "Compiler successfully processes multi-product request when productCount matches routed identities");
  assert(Boolean(validMultiRes.package?.compiled_prompt.includes("PRODUCT_01") && validMultiRes.package?.compiled_prompt.includes("PRODUCT_02")), "Compiled prompt contains separate mapping for PRODUCT_01 and PRODUCT_02");

  // ── 6. DRAFT Knowledge Rejection Governance Test ─────────────
  console.log("\n🔹 6. Governance & Draft Knowledge Rejection Tests");
  const draftPackage: KnowledgePackageV1 = {
    ...mockKnowledgePackage,
    selected_blocks: [
      { ...mockSpecialistBlocks[0], id: "nonexistent.draft_block" },
    ],
  };

  const draftInput: MasterPromptCompilerInput = {
    ...sampleInput,
    knowledgePackage: draftPackage,
  };

  const draftRes = await compiler.compile(draftInput);
  assert(!draftRes.success, "Compiler correctly rejects unindexed/draft Knowledge blocks for production compilation");

  // ── 7. Creative Leak & Safety Net Test ──────────
  console.log("\n🔹 7. Creative Leak & Compiler Safety Net Tests");
  const compiledLower = compiledText.toLowerCase();

  // Check forbidden TIDO-invented recipes unless user supplied them
  const forbiddenInventedPhrases = ["50mm lens", "softbox", "golden hour", "olive background"];
  for (const phrase of forbiddenInventedPhrases) {
    assert(!compiledLower.includes(phrase), `Compiler did NOT invent creative decision '${phrase}'`);
  }

  // ── 8. Input Staleness Fingerprint Test ──────────────
  console.log("\n🔹 8. Input Staleness Fingerprint Tests");
  const fp1 = InputFingerprint.compute(sampleInput);
  const modifiedInput = { ...sampleInput, brief: "Modified campaign brief string" };
  const fp2 = InputFingerprint.compute(modifiedInput);

  assert(fp1 !== fp2, "InputFingerprint detects changes in input fields and returns different fingerprint hash");

  // ── 9. Human Quality Guardrails & Master Prompt Hardening (Stage 4B.1) ──
  console.log("\n🔹 9. Human Quality Guardrails & Master Prompt Hardening (Stage 4B.1)");

  // Check version discipline
  assert(res1.package?.knowledge?.knowledge_versions?.["universal.typography_graphic_integration"] === "1.0.1", "Knowledge traceability reports version 1.0.1 for typography_graphic_integration");

  // Check no stale typography recipe phrases
  assert(!compiledLower.includes("clean negative space backing"), "Compiled prompt contains NO stale typography phrase 'clean negative space backing'");
  assert(!compiledLower.includes("align systematically with composition anchors"), "Compiled prompt contains NO stale typography phrase 'align systematically with composition anchors'");

  // Check no forced aesthetic defaults in Master Prompt template controls
  assert(!compiledLower.includes("8k commercial resolution"), "Master Prompt contains NO hardcoded '8K commercial resolution'");
  assert(!compiledLower.includes("medium-format camera quality"), "Master Prompt contains NO hardcoded 'medium-format camera quality'");
  assert(!compiledLower.includes("multi-million dollar"), "Master Prompt contains NO hardcoded 'multi-million dollar'");
  assert(!compiledLower.includes("hyper-realistic commercial image generation model"), "Role contains NO forced 'hyper-realistic' aesthetic requirement");
  assert(!compiledLower.includes("appetizing/appealing presentation"), "Commercial principles contain NO forced 'appetizing' requirement");

  // Check open-world phrasing non-overstated
  // ── 10. Stage 5.5 & 5.6 Scene-Native & Reference Semantics Verification ──
  console.log("\n🔹 10. Stage 5.5 & 5.6 Scene-Native & Reference Semantics Verification");

  assert(compiledText.includes("## SCENE-NATIVE PRODUCT INTEGRATION"), "Master Prompt contains '## SCENE-NATIVE PRODUCT INTEGRATION' section");
  assert(compiledText.includes("## REFERENCE SEMANTICS"), "Master Prompt contains '## REFERENCE SEMANTICS' section");
  assert(compiledText.includes("Ensure all scene elements share coherent photographic conditions"), "Scene-Native Integration section includes Global Image-Formation Coherence requirements");
  assert(!compiledLower.includes("50mm lens") && !compiledLower.includes("studio softbox"), "No fixed camera, lens, or lighting setup was introduced");
  assert(compiledText.includes("1. **Real Product Identity & Reference-Supported Identity Evidence** (Highest priority"), "Product Identity priority hierarchy is refined to Reference-Supported Identity Evidence (Highest priority)");
  assert(compiledText.includes("## TYPOGRAPHY & READABLE COPY"), "Typography & Readable Copy section present");
  assert(compiledText.includes("## FULL CREATIVE AUTHORITY"), "Creative Authority section remains unchanged");
  assert(compiledText.includes("Does each referenced product look physically photographed inside the final environment rather than pasted from source references?"), "Internal final check includes physical integration verification item");

  // ── 11. Stage 5.6 Reference Semantics Invariant Tests ──
  console.log("\n🔹 11. Stage 5.6 Reference Semantics Invariant Tests");
  assert(compiledText.includes("Reference images are evidence of PRODUCT IDENTITY, not source canvases"), "Reference Semantics explicitly defines reference as identity evidence, not source canvas");
  assert(compiledText.includes("Do not treat source-image pixels, crop boundaries, background, studio illumination"), "Reference Semantics explicitly excludes source-photo artifacts from protected identity");
  assert(compiledText.includes("PROTECTED (What the product is)"), "Product Identity explicitly defines PROTECTED (What the product is)");
  assert(compiledText.includes("RE-SYNTHESIZED (How the product is photographed"), "Product Identity explicitly defines RE-SYNTHESIZED (How the product is photographed)");
  assert(compiledText.includes("excludes reference background, source lighting"), "Conflict Priority #1 explicitly excludes photographic scene artifacts");

  // ── 12. Stage 5.7 Viewpoint Decoupling Invariant Tests ──
  console.log("\n🔹 12. Stage 5.7 Viewpoint Decoupling Invariant Tests");
  assert(compiledText.includes("## VIEWPOINT DECOUPLING"), "Master Prompt contains '## VIEWPOINT DECOUPLING' section");
  assert(compiledText.includes("Reference images define physical product identity, not required camera viewpoint."), "Viewpoint Decoupling explicitly defines reference as product identity, not camera requirement");
  assert(compiledText.includes("Do not preserve the source photograph's camera geometry or shot distance by default."), "Viewpoint Decoupling excludes source camera geometry by default");
  assert(compiledText.includes("Camera angle, viewpoint height, framing, crop, perspective, hero scale"), "Product Identity explicitly places camera/framing under RE-SYNTHESIZED");
  assert(compiledText.includes("The downstream model retains full authority over camera geometry and reframing unless explicitly locked by user constraints"), "Creative Authority explicitly protects reframing freedom");
  assert(compiledText.includes("excludes reference background, source lighting, source camera angle"), "Conflict Priority resolves viewpoint tension in favor of identity evidence");
  // ── 13. Stage 5.8 Prompt Compression Invariant & Size Tests ──
  console.log("\n🔹 13. Stage 5.8 Semantic-Preserving Prompt Compression Invariants");
  assert(compiledText.length < 19000, `Compiled prompt length (${compiledText.length} chars) is strictly below hard max 19,000 chars`);
  assert(compiledText.includes("PROTECTED (What the product is)"), "Preserves Product Identity protection");
  assert(compiledText.includes("Reference images are evidence of PRODUCT IDENTITY, not source canvases"), "Preserves Identity vs Source Photo distinction");
  assert(compiledText.includes("## SCENE-NATIVE PRODUCT INTEGRATION"), "Preserves Scene-Native Integration section");
  assert(compiledText.includes("## VIEWPOINT DECOUPLING"), "Preserves Viewpoint Decoupling section");
  assert(compiledText.includes("Unseen product surfaces must be reconstructed conservatively"), "Preserves Conservative Unseen-Surface Inference");
  assert(compiledText.includes("## TYPOGRAPHY & READABLE COPY"), "Preserves Typography & Readable Copy section");
  assert(compiledText.includes("## BRAND KNOWLEDGE"), "Preserves Brand Knowledge section");
  assert(compiledText.includes("UNKNOWN PRODUCT != UNSUPPORTED PRODUCT") || compiledText.includes("An unknown product is not an unsupported product") || compiledText.includes("Unknown product != unsupported product"), "Preserves Open-World Reasoning");
  assert(compiledText.includes("YOU HAVE FULL CREATIVE AUTHORITY"), "Preserves Full Creative Authority section");
  assert(compiledText.includes("## PROFESSIONAL KNOWLEDGE"), "Preserves Professional Knowledge section");
  assert(compiledText.includes("1. **Real Product Identity"), "Preserves Conflict Priority hierarchy");
  assert(compiledText.includes("## INTERNAL FINAL CHECK"), "Preserves Internal Final Check section");

  // ── 14. Stage 5.8.1 Multi-Product Identity Regression & Dynamic Mapping Tests ──
  console.log("\n🔹 14. Stage 5.8.1 Multi-Product Identity Invariant Tests");

  // CASE A: 1 product + 1 reference
  const caseAInput = {
    ...sampleInput,
    productCount: 1,
    routingResult: {
      ...sampleInput.routingResult,
      products: [
        { ...mockRoutingResult.products[0], product_id: "PRODUCT_01", reference_ids: ["REF_01"], summary: "Single product item" },
      ],
    },
  };
  const caseARes = await compiler.compile(caseAInput);
  assert(Boolean(caseARes.success && caseARes.package), "Case A compilation succeeded");
  const caseAText = caseARes.package!.compiled_prompt;
  assert(caseAText.includes("1 hero product instance (PRODUCT_01)"), "Case A: 1 product identity correctly specified");
  assert(caseAText.includes("Reference image(s) [REF_01]"), "Case A: 1 reference correctly bound");
  assert(!caseAText.includes("across 2 distinct product identities"), "Case A: Clean single-product request without multi-product pollution");

  // CASE B: 1 product + multiple references
  const caseBInput = {
    ...sampleInput,
    productCount: 1,
    routingResult: {
      ...sampleInput.routingResult,
      products: [
        { ...mockRoutingResult.products[0], product_id: "PRODUCT_01", reference_ids: ["REF_01", "REF_02", "REF_03"], summary: "Single product with multi-angle views" },
      ],
    },
  };
  const caseBRes = await compiler.compile(caseBInput);
  assert(Boolean(caseBRes.success && caseBRes.package), "Case B compilation succeeded");
  const caseBText = caseBRes.package!.compiled_prompt;
  assert(caseBText.includes("Reference image(s) [REF_01, REF_02, REF_03]"), "Case B: Multiple references bound to single product");
  assert(caseBText.includes("complementary evidence for this SINGLE product identity"), "Case B: Multiple references correctly identified as complementary evidence for ONE identity");

  // CASE C: 2 distinct products + 2 references
  const caseCInput = {
    ...sampleInput,
    productCount: 2,
    routingResult: {
      ...sampleInput.routingResult,
      products: [
        { ...mockRoutingResult.products[0], product_id: "PRODUCT_01", reference_ids: ["REF_01"], summary: "First distinct product" },
        { ...mockRoutingResult.products[0], product_id: "PRODUCT_02", reference_ids: ["REF_02"], summary: "Second distinct product" },
      ],
    },
  };
  const caseCRes = await compiler.compile(caseCInput);
  assert(Boolean(caseCRes.success && caseCRes.package), "Case C compilation succeeded");
  const caseCText = caseCRes.package!.compiled_prompt;
  assert(caseCText.includes("PRODUCT_01: Bound strictly to reference image(s) [REF_01]"), "Case C: PRODUCT_01 strictly bound to REF_01");
  assert(caseCText.includes("PRODUCT_02: Bound strictly to reference image(s) [REF_02]"), "Case C: PRODUCT_02 strictly bound to REF_02");
  assert(caseCText.includes("DISTINCT PRODUCT IDENTITY ISOLATION"), "Case C: Explicit distinct identity isolation contract present");
  assert(caseCText.includes("Do NOT clone one product identity to satisfy another"), "Case C: Explicit anti-cloning prohibition present");
  assert(caseCText.includes("do NOT average identities into a hybrid"), "Case C: Explicit anti-averaging prohibition present");
  assert(caseCText.includes("do NOT transfer product-specific features across distinct identities"), "Case C: Explicit anti-cross-transfer prohibition present");

  // CASE D: 3 distinct products + 3 references
  const caseDInput = {
    ...sampleInput,
    productCount: 3,
    routingResult: {
      ...sampleInput.routingResult,
      products: [
        { ...mockRoutingResult.products[0], product_id: "PRODUCT_01", reference_ids: ["REF_01"], summary: "Product A" },
        { ...mockRoutingResult.products[0], product_id: "PRODUCT_02", reference_ids: ["REF_02"], summary: "Product B" },
        { ...mockRoutingResult.products[0], product_id: "PRODUCT_03", reference_ids: ["REF_03"], summary: "Product C" },
      ],
    },
  };
  const caseDRes = await compiler.compile(caseDInput);
  assert(Boolean(caseDRes.success && caseDRes.package), "Case D compilation succeeded");
  const caseDText = caseDRes.package!.compiled_prompt;
  assert(caseDText.includes("3 product instances across 3 distinct product identities"), "Case D: 3 distinct identities correctly specified");
  assert(caseDText.includes("PRODUCT_03: Bound strictly to reference image(s) [REF_03]"), "Case D: PRODUCT_03 strictly bound to REF_03");

  // CASE E: 2 products from same brand family / similar container
  const caseEInput = {
    ...sampleInput,
    productCount: 2,
    brandName: "TIDO Premium Line",
    routingResult: {
      ...sampleInput.routingResult,
      products: [
        { ...mockRoutingResult.products[0], product_id: "PRODUCT_01", reference_ids: ["REF_01"], summary: "Brand line bottle variant A" },
        { ...mockRoutingResult.products[0], product_id: "PRODUCT_02", reference_ids: ["REF_02"], summary: "Brand line bottle variant B" },
      ],
    },
  };
  const caseERes = await compiler.compile(caseEInput);
  assert(Boolean(caseERes.success && caseERes.package), "Case E compilation succeeded");
  const caseEText = caseERes.package!.compiled_prompt;
  assert(caseEText.includes("Preserve each product's reference-supported characteristics and distinct differences"), "Case E: Distinct differences mandatory despite shared brand family");
  assert(caseEText.includes("## MULTI-PRODUCT IDENTITY ISOLATION"), "Case E: Master Prompt includes static multi-product identity isolation contract");

  // ── 15. Stage 5.9.2 Exact Copy Hard Firewall Invariant Tests ─────────
  console.log("\n🔹 15. Stage 5.9.2 Exact Copy Hard Firewall Invariant Tests");

  // CASE A: HEADLINE role
  const copyAInput = {
    ...sampleInput,
    copyItems: [{ type: "headline" as const, text: "Mùa thu đến" }],
  };
  const copyARes = await compiler.compile(copyAInput);
  assert(Boolean(copyARes.success && copyARes.package), "Copy Case A compilation succeeded");
  const copyAText = copyARes.package!.compiled_prompt;
  assert(copyAText.includes('"Mùa thu đến"'), "Copy Case A: Exact visible string present");
  assert(!copyAText.includes('[HEADLINE]'), "Copy Case A: No bracketed [HEADLINE]");
  assert(!copyAText.includes('Headline:'), "Copy Case A: No label 'Headline:'");
  assert(!copyAText.includes('Role: headline'), "Copy Case A: No label 'Role: headline'");
  assert(!copyAText.includes('(Role: headline)'), "Copy Case A: No parenthetical '(Role: headline)'");

  // CASE B: PRODUCT_NAME role
  const copyBInput = {
    ...sampleInput,
    copyItems: [{ type: "product_name" as const, text: "Trà sữa Caramel" }],
  };
  const copyBRes = await compiler.compile(copyBInput);
  assert(Boolean(copyBRes.success && copyBRes.package), "Copy Case B compilation succeeded");
  const copyBText = copyBRes.package!.compiled_prompt;
  assert(copyBText.includes('"Trà sữa Caramel"'), "Copy Case B: Product name authorized string present");
  assert(!copyBText.includes('Product Name:'), "Copy Case B: No label 'Product Name:'");
  assert(!copyBText.includes('[PRODUCT_NAME]:'), "Copy Case B: No bracketed '[PRODUCT_NAME]:'");
  assert(!copyBText.includes('Tên sản phẩm:'), "Copy Case B: No Vietnamese label 'Tên sản phẩm:'");
  assert(!copyBText.includes('Role: product_name'), "Copy Case B: No system metadata 'Role: product_name'");

  // CASE C: CTA role
  const copyCInput = {
    ...sampleInput,
    copyItems: [{ type: "cta" as const, text: "Mua ngay" }],
  };
  const copyCRes = await compiler.compile(copyCInput);
  assert(Boolean(copyCRes.success && copyCRes.package), "Copy Case C compilation succeeded");
  const copyCText = copyCRes.package!.compiled_prompt;
  assert(copyCText.includes('"Mua ngay"'), "Copy Case C: CTA visible string present");
  assert(!copyCText.includes('CTA:'), "Copy Case C: No label 'CTA:'");
  assert(!copyCText.includes('Role: cta'), "Copy Case C: No system metadata 'Role: cta'");

  // CASE D: User intentionally typed "Headline: Siêu sale"
  const copyDInput = {
    ...sampleInput,
    copyItems: [{ type: "headline" as const, text: "Headline: Siêu sale" }],
  };
  const copyDRes = await compiler.compile(copyDInput);
  assert(Boolean(copyDRes.success && copyDRes.package), "Copy Case D compilation succeeded");
  const copyDText = copyDRes.package!.compiled_prompt;
  assert(copyDText.includes('"Headline: Siêu sale"'), "Copy Case D: User-supplied text 'Headline: Siêu sale' preserved exactly 100%");

  // CASE E: Multiple copy items & Single-Occurrence Whitelist Verification
  const copyEInput = {
    ...sampleInput,
    copyItems: [
      { type: "headline" as const, text: "Mùa thu đến" },
      { type: "subheadline" as const, text: "Trải nghiệm món mới" },
      { type: "product_name" as const, text: "Trà sữa Caramel" },
      { type: "price" as const, text: "49.000đ" },
      { type: "cta" as const, text: "Mua ngay" },
    ],
  };
  const copyERes = await compiler.compile(copyEInput);
  assert(Boolean(copyERes.success && copyERes.package), "Copy Case E compilation succeeded");
  const copyEText = copyERes.package!.compiled_prompt;

  // Count occurrences of quoted visible strings in prompt
  const countOccurrences = (str: string, target: string) => (str.split(target).length - 1);
  assert(countOccurrences(copyEText, '"Mùa thu đến"') === 1, "Copy Case E: String 'Mùa thu đến' appears exactly ONCE in compiled prompt");
  assert(countOccurrences(copyEText, '"Trải nghiệm món mới"') === 1, "Copy Case E: String 'Trải nghiệm món mới' appears exactly ONCE in compiled prompt");
  assert(countOccurrences(copyEText, '"Trà sữa Caramel"') === 1, "Copy Case E: String 'Trà sữa Caramel' appears exactly ONCE in compiled prompt");
  assert(countOccurrences(copyEText, '"49.000đ"') === 1, "Copy Case E: String '49.000đ' appears exactly ONCE in compiled prompt");
  assert(countOccurrences(copyEText, '"Mua ngay"') === 1, "Copy Case E: String 'Mua ngay' appears exactly ONCE in compiled prompt");

  // Verify system-generated role words do not accompany strings
  assert(!copyEText.includes('Role:'), "Copy Case E: Zero 'Role:' system metadata in prompt");
  assert(!copyEText.includes('[HEADLINE]'), "Copy Case E: Zero '[HEADLINE]' system metadata in prompt");
  assert(!copyEText.includes('[SUBHEADLINE]'), "Copy Case E: Zero '[SUBHEADLINE]' system metadata in prompt");
  assert(!copyEText.includes('[PRODUCT_NAME]'), "Copy Case E: Zero '[PRODUCT_NAME]' system metadata in prompt");

  // ── 16. PROMPT BUDGET VALIDATOR & BYTE-EQUIVALENCE TESTS ──────────
  console.log("\n--- 16. Prompt Budget Validator & Byte-Equivalence Tests ---");

  // Test status classifications and hard limit boundary
  const dummyPrompt17500 = "x".repeat(17500);
  const val17500 = PromptBudgetValidator.validate(dummyPrompt17500, {});
  assert(val17500.status === "COMFORTABLE" && !val17500.is_blocked, "17,500 chars classified as COMFORTABLE");

  const dummyPrompt18500 = "x".repeat(18500);
  const val18500 = PromptBudgetValidator.validate(dummyPrompt18500, {});
  assert(val18500.status === "NORMAL" && !val18500.is_blocked, "18,500 chars classified as NORMAL");

  const dummyPrompt19000 = "x".repeat(19000);
  const val19000 = PromptBudgetValidator.validate(dummyPrompt19000, {});
  assert(val19000.status === "HIGH" && !val19000.is_blocked, "19,000 chars classified as HIGH");

  const dummyPrompt20000 = "x".repeat(20000);
  const val20000 = PromptBudgetValidator.validate(dummyPrompt20000, {});
  assert(val20000.status === "CRITICAL" && !val20000.is_blocked, "20,000 chars classified as CRITICAL");

  const dummyPrompt20001 = "x".repeat(20001);
  const val20001 = PromptBudgetValidator.validate(dummyPrompt20001, {});
  assert(val20001.status === "BLOCKED" && val20001.is_blocked, "20,001 chars classified as BLOCKED");
  assert(Boolean(val20001.error && val20001.error.includes("PROMPT_BUDGET_EXCEEDED")), "BLOCKED validator returns PROMPT_BUDGET_EXCEEDED error");

  // Knowledge & User Data Byte-Equivalence Proof
  const eqRes = await compiler.compile(sampleInput);
  assert(Boolean(eqRes.success && eqRes.package), "Equivalence test compilation succeeded");
  const eqPrompt = eqRes.package!.compiled_prompt;

  assert(eqPrompt.includes(sampleInput.brief!), "User Brief is 100% byte-identical in compiled prompt");
  assert(eqPrompt.includes(sampleInput.brandName!), "Brand Name is 100% byte-identical in compiled prompt");
  assert(eqPrompt.includes(sampleInput.brandInfo!), "Brand Info is 100% byte-identical in compiled prompt");
  assert(eqPrompt.includes(sampleInput.hardRequirements![0]), "User Hard Constraint #1 is 100% byte-identical");
  assert(eqPrompt.includes(sampleInput.hardRequirements![1]), "User Hard Constraint #2 is 100% byte-identical");
  assert(eqPrompt.includes(typeof sampleInput.copyItems![0] === "string" ? sampleInput.copyItems![0] : sampleInput.copyItems![0].text), "Exact Copy item is 100% byte-identical");

  console.log("\n=================================================");
  if (process.exitCode === 1) {
    console.log("❌ STAGE 4B MASTER PROMPT COMPILER TESTS FAILED");
  } else {
    console.log("🎉 ALL STAGE 4B MASTER PROMPT COMPILER TESTS PASSED!");
  }
  console.log("=================================================\n");
}

if (require.main === module) {
  runStage4BTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
