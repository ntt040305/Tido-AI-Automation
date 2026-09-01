import { PromptCompressionService } from "./compiler/PromptCompressionService";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";
import { PromptBudgetValidator } from "./compiler/PromptBudgetValidator";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function runPhase253PromptBudgetTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 2.5.3 PROMPT BUDGET & COMPRESSION AUDIT");
  console.log("========================================================================");

  // 1. Verify limit constants
  assert(PromptBudgetValidator.DEFAULT_PROVIDER_HARD_LIMIT === 20000, "PromptBudgetValidator hard limit restored to 20000");
  assert(ProviderPromptOptimizer.HARD_LIMIT === 20000, "ProviderPromptOptimizer hard limit restored to 20000");
  assert(PromptCompressionService.MAX_PROMPT_LENGTH === 20000, "PromptCompressionService MAX_PROMPT_LENGTH is 20000");
  assert(PromptCompressionService.COMPRESSION_THRESHOLD === 19500, "PromptCompressionService COMPRESSION_THRESHOLD is 19500");

  // 2. Construct simulated oversize prompt (21,161 chars) with critical identity blocks + verbose cards
  const productIdentityLock = `[PRODUCT IDENTITY LOCK] Product ID [PRODUCT_01] (TIDO Cold Brew Bottle): Preserve [Glass Silhouette, Label Typography]. Key Features: Amber Refractive Glass.`;
  const logoPreservation = `[LOGO PRESERVATION] Vector Logo Reference REF_02_LOGO: Maintain original geometry and font kerning.`;
  const referenceControl = `[REF CONTROL] Prio: REF_02_LOGO(LOGO:1), REF_01_PROD(PRODUCT:0.9) | Lock: Vector Logo Geometry, Brand Typography | Allow: Background, Lighting | Forbid: Redraw Logo`;
  const productManifestSummary = `PRODUCT PLANNING MANIFEST (Target Count: 1, Detected: 1): LOCK [PRODUCT_01] (TIDO Cold Brew Bottle)`;

  const verboseMarketingExplanation = `INTERNAL STRATEGY EXPLANATION:\n` + "This marketing campaign focuses on high-end lifestyle refreshment with luxury reflections.\n".repeat(50);
  const openWorldReasoning = `## OPEN-WORLD PRODUCT REASONING\n` + "Analyzing surface material properties, refraction indices, and ambient occlusion parameters.\n".repeat(60);
  const techniqueCards = `## TECHNIQUE CARDS\n` + "Use rim lighting with 45 degree key light to highlight bottle shoulders.\n".repeat(80);
  const knowledgeCards = `## RETRIEVED KNOWLEDGE CARDS\n` + "Refractive glass requires high specular highlights and soft shadow falloff.\n".repeat(80);

  const rawOversizePrompt = [
    productIdentityLock,
    logoPreservation,
    referenceControl,
    productManifestSummary,
    verboseMarketingExplanation,
    openWorldReasoning,
    techniqueCards,
    knowledgeCards,
  ].join("\n\n");

  const before_length = rawOversizePrompt.length;
  console.log(`\nBefore Compression Prompt Length: ${before_length} chars`);
  assert(before_length > 19500, `Simulated prompt (${before_length} chars) > 19500 threshold (e.g. 21,161 chars)`);

  // 3. Execute PromptCompressionService
  const compressionResult = PromptCompressionService.compress(rawOversizePrompt);
  const after_length = compressionResult.after_chars;

  console.log(`After Compression Prompt Length:  ${after_length} chars`);
  console.log(`Removed Sections:`, compressionResult.removed_sections);

  // 4. Assert Invariants
  assert(after_length <= 20000, `Compressed prompt length (${after_length} chars) <= 20,000 hard limit`);
  assert(compressionResult.compressed_prompt.includes(productIdentityLock), "NEVER REMOVED: PRODUCT IDENTITY LOCK preserved");
  assert(compressionResult.compressed_prompt.includes(logoPreservation), "NEVER REMOVED: LOGO PRESERVATION preserved");
  assert(compressionResult.compressed_prompt.includes(referenceControl), "NEVER REMOVED: REFERENCE CONTROL preserved");
  assert(compressionResult.compressed_prompt.includes(productManifestSummary), "NEVER REMOVED: PRODUCT MANIFEST SUMMARY preserved");

  assert(compressionResult.removed_sections.includes("INTERNAL_STRATEGY_EXPLANATION"), "COMPRESSED FIRST: Internal strategy explanation removed");
  assert(compressionResult.removed_sections.includes("OPEN_WORLD_PRODUCT_REASONING"), "COMPRESSED FIRST: Open world product reasoning removed");

  console.log("\n========================================================================");
  console.log("🎉 ALL PHASE 2.5.3 PROMPT BUDGET COMPRESSION TESTS PASSED (100%)");
  console.log("========================================================================");
}

runPhase253PromptBudgetTest();
