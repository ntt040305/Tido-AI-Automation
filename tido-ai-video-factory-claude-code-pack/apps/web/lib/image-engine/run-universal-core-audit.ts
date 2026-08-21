import fs from "fs";
import path from "path";
import { LocalKnowledgeRepository } from "./repository/LocalKnowledgeRepository";
import { KnowledgeBudgetManager } from "./retrieval/KnowledgeBudgetManager";
import { KnowledgeBlockMetadata } from "./types";

const EXPECTED_UNIVERSAL_BLOCK_IDS = [
  "universal.commercial_visual_hierarchy",
  "universal.camera_perspective_coherence",
  "universal.lighting_material_readability",
  "universal.typography_graphic_integration",
  "universal.physical_scene_coherence",
];

const FORBIDDEN_PROVIDER_TERMS = [
  "gemini",
  "nano banana",
  "midjourney",
  "stable diffusion",
  "dall-e",
  "dalle",
  "chatgpt",
  "prompting trick",
];

const FORBIDDEN_RECIPE_PHRASES = [
  "50mm lens",
  "softbox",
  "golden hour",
  "low-angle camera",
  "olive background",
  "center composition",
  "shallow depth of field",
  "serif font for luxury",
];

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ PASSED: ${message}`);
  }
}

export async function runUniversalCoreAudit() {
  process.exitCode = 0;
  console.log("\n=================================================");
  console.log("⚡ STAGE 4A — UNIVERSAL KNOWLEDGE CORE V1 AUDIT");
  console.log("=================================================\n");

  const repo = new LocalKnowledgeRepository();
  const validationReport = await repo.validateRepository();

  console.log("🔹 1. Repository Validation Check");
  assert(validationReport.isValid, "LocalKnowledgeRepository validation passed with zero structural errors");
  if (!validationReport.isValid) {
    console.error("Validation Errors:", validationReport.errors);
  }

  console.log("\n🔹 2. Universal Core Block Discovery & Contract Audit");
  const allMetadata = await repo.listKnowledgeBlocks();
  const metaMap = new Map<string, KnowledgeBlockMetadata>();
  allMetadata.forEach((m) => metaMap.set(m.id, m));

  // Check expected count
  const universalBlocks = allMetadata.filter((m) => m.knowledge_type === "UNIVERSAL");
  assert(
    universalBlocks.length === EXPECTED_UNIVERSAL_BLOCK_IDS.length,
    `Discovered exactly ${EXPECTED_UNIVERSAL_BLOCK_IDS.length} Universal Core blocks (found ${universalBlocks.length})`
  );

  let totalTokens = 0;

  for (const blockId of EXPECTED_UNIVERSAL_BLOCK_IDS) {
    console.log(`\n  --- Auditing Block: ${blockId} ---`);
    const meta = metaMap.get(blockId);
    assert(!!meta, `Block metadata exists for '${blockId}'`);

    if (!meta) continue;

    assert(meta.status === "ACTIVE" || meta.status === "DRAFT", `status is valid ACTIVE/DRAFT (found '${meta.status}')`);
    assert(meta.knowledge_type === "UNIVERSAL", `knowledge_type is 'UNIVERSAL' (found '${meta.knowledge_type}')`);
    assert(meta.scope === "GLOBAL", `scope is 'GLOBAL' (found '${meta.scope}')`);
    assert(meta.creative_recipe === false, "creative_recipe is strictly false");
    assert(meta.validation.review_status === "APPROVED" || meta.validation.review_status === "UNREVIEWED", `review_status is valid APPROVED/UNREVIEWED (found '${meta.validation.review_status}')`);

    // Verify covers[] integrity
    assert(Array.isArray(meta.covers), "covers[] is an array");
    for (const coveredId of meta.covers) {
      assert(metaMap.has(coveredId), `Covered block ID '${coveredId}' exists in repository`);
    }

    // Load content file
    const contentFileName = meta.content_file || "knowledge.md";
    const blockDir = path.resolve(process.cwd(), "data/knowledge", blockId.replace(".", "/"));
    const contentPath = path.join(blockDir, contentFileName);

    assert(fs.existsSync(contentPath), `Content file '${contentFileName}' exists at ${contentPath}`);

    const contentText = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, "utf-8") : "";
    const estimatedTokens = KnowledgeBudgetManager.estimateTokens(contentText);
    totalTokens += estimatedTokens;

    console.log(`     Estimated Tokens: ${estimatedTokens} tokens (Length: ${contentText.length} chars)`);
    assert(estimatedTokens <= 400, `Block token count (${estimatedTokens}) is below 400 ceiling`);

    // Check forbidden provider terms
    const fullTextLower = `${JSON.stringify(meta)} ${contentText}`.toLowerCase();
    for (const term of FORBIDDEN_PROVIDER_TERMS) {
      assert(!fullTextLower.includes(term), `Contains no AI provider term '${term}'`);
    }

    // Check forbidden recipe phrases
    for (const phrase of FORBIDDEN_RECIPE_PHRASES) {
      assert(!fullTextLower.includes(phrase), `Contains no prescriptive recipe phrase '${phrase}'`);
    }
  }

  console.log("\n🔹 3. Universal Core Total Budget & Safety Audit");
  console.log(`  Total Estimated Universal Core Tokens: ${totalTokens} tokens`);
  assert(totalTokens >= 1000 && totalTokens <= 2000, `Total Universal Core tokens (${totalTokens}) is within target 1000-2000 range`);
  assert(totalTokens <= 2000, `Total Universal Core tokens (${totalTokens}) is strictly <= 2000 hard ceiling`);

  console.log("\n=================================================");
  if (process.exitCode === 1) {
    console.log("❌ UNIVERSAL CORE AUDIT FAILED WITH ERRORS");
  } else {
    console.log("🎉 ALL UNIVERSAL CORE AUDIT CHECKS PASSED!");
  }
  console.log("=================================================\n");
}

if (require.main === module) {
  runUniversalCoreAudit().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
