import fs from "fs";
import path from "path";
import { IMAGE_ENGINE_CONFIG } from "./config";
import { LocalKnowledgeRepository } from "./repository/LocalKnowledgeRepository";
import { KnowledgeService } from "./service/KnowledgeService";

async function runStage1Tests() {
  console.log("=================================================");
  console.log("🚀 STARTING TIDO IMAGE ENGINE STAGE 1 TEST SUITE");
  console.log("=================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(` ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(` ❌ FAIL: ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // ── TEST 1: Canonical Prompt Files Exist ────────────────────────
  assert(
    fs.existsSync(IMAGE_ENGINE_CONFIG.MASTER_PROMPT_V2_PATH),
    "Master Prompt V2 file exists"
  );
  assert(
    fs.existsSync(IMAGE_ENGINE_CONFIG.KNOWLEDGE_ROUTER_V1_PATH),
    "Knowledge Router Prompt V1 file exists"
  );

  const masterPromptContent = fs.readFileSync(
    IMAGE_ENGINE_CONFIG.MASTER_PROMPT_V2_PATH,
    "utf-8"
  );
  assert(
    masterPromptContent.includes("{{USER_BRIEF}}") &&
      masterPromptContent.includes("{{RELEVANT_KNOWLEDGE}}") &&
      masterPromptContent.includes("FULL CREATIVE AUTHORITY"),
    "Master Prompt V2 contains required placeholders & creative authority rules"
  );

  // ── TEST 2: Canonical Schemas Exist & Load ─────────────────────
  assert(
    fs.existsSync(IMAGE_ENGINE_CONFIG.KNOWLEDGE_BLOCK_SCHEMA_V1_PATH),
    "Knowledge Block Schema V1 JSON exists"
  );
  assert(
    fs.existsSync(IMAGE_ENGINE_CONFIG.ROUTING_SCHEMA_V1_PATH),
    "Routing Schema V1 JSON exists"
  );

  const routingSchemaJson = JSON.parse(
    fs.readFileSync(IMAGE_ENGINE_CONFIG.ROUTING_SCHEMA_V1_PATH, "utf-8")
  );
  assert(
    routingSchemaJson.properties.routing_version !== undefined &&
      routingSchemaJson.properties.products !== undefined,
    "Routing Schema V1 is valid JSON schema"
  );

  // ── TEST 3: Repository Discovery & Listing ────────────────────
  const repo = new LocalKnowledgeRepository();
  const blocks = await repo.listKnowledgeBlocks();
  assert(
    blocks.length >= 2,
    `Discovered sample knowledge blocks (found ${blocks.length})`
  );

  // ── TEST 4: Get Knowledge Block (material.glass) ──────────────
  const glassBlock = await repo.getKnowledgeBlock("material.glass");
  assert(glassBlock !== null, "Loaded 'material.glass' block");
  assert(
    glassBlock?.metadata.id === "material.glass",
    "'material.glass' metadata matches ID"
  );
  assert(
    glassBlock?.metadata.creative_recipe === false,
    "'material.glass' has creative_recipe === false"
  );
  assert(
    glassBlock?.content.includes("REFRACTION") === true,
    "'material.glass' content loaded correctly"
  );

  // ── TEST 5: Repository Validation ─────────────────────────────
  const validation = await repo.validateRepository();
  assert(validation.isValid, "Local knowledge repository validation passed");
  assert(validation.errors.length === 0, "Zero validation errors in clean repository");

  // ── TEST 6: Manifest Building ──────────────────────────────────
  const manifest = await repo.buildManifest();
  assert(
    fs.existsSync(IMAGE_ENGINE_CONFIG.MANIFEST_PATH),
    "manifest.json built & saved to indexes directory"
  );
  assert(
    manifest.total_blocks >= 2,
    "manifest contains registered knowledge blocks"
  );

  // ── TEST 7: Negative Validation Tests (Duplicate ID, Creative Recipe Violation) ──
  console.log("\n🧪 Running Negative / Error Rule Detection Tests...");
  
  // Temporary invalid block testing
  const tempDir = path.join(IMAGE_ENGINE_CONFIG.KNOWLEDGE_DIR, "materials/_temp_invalid");
  fs.mkdirSync(tempDir, { recursive: true });

  const invalidMeta = {
    schema_version: "1.0",
    id: "material.glass", // Duplicate ID!
    version: "1.0.0",
    status: "ACTIVE",
    knowledge_type: "MATERIAL",
    title: "Invalid Block",
    summary: "Testing validation",
    scope: "GENERIC",
    keywords: [],
    aliases: [],
    semantic_tags: [],
    routing_dimensions: {},
    match_rules: [],
    related_blocks: [],
    dependencies: [],
    covers: [],
    priority: 50,
    information_value: 0.5,
    genericity: 0.5,
    creative_recipe: true, // Violation!
    content_file: "non_existent.md", // Missing content!
    language: "en",
    validation: { review_status: "UNREVIEWED", tested_jobs: [], notes: "" },
  };

  fs.writeFileSync(path.join(tempDir, "metadata.json"), JSON.stringify(invalidMeta, null, 2));

  const invalidRepo = new LocalKnowledgeRepository();
  const invalidReport = await invalidRepo.validateRepository();

  // Cleanup temp invalid folder
  fs.rmSync(tempDir, { recursive: true, force: true });

  assert(!invalidReport.isValid, "Validator correctly rejected invalid repository");
  assert(
    invalidReport.errors.some((e) => e.code === "DUPLICATE_ID"),
    "Detected DUPLICATE_ID error"
  );
  assert(
    invalidReport.errors.some((e) => e.code === "CREATIVE_RECIPE_VIOLATION"),
    "Detected CREATIVE_RECIPE_VIOLATION error"
  );
  assert(
    invalidReport.errors.some((e) => e.code === "MISSING_CONTENT"),
    "Detected MISSING_CONTENT error"
  );

  // ── TEST 8: Knowledge Service Integration ─────────────────────
  console.log("\n🧪 Running Knowledge Service Layer Tests...");
  const service = new KnowledgeService();
  const status = await service.getRepositoryStatus();
  assert(status.status === "ok", "KnowledgeService status is 'ok'");
  assert(status.totalBlocks >= 2, "KnowledgeService counts blocks accurately");

  console.log("\n=================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log("=================================================\n");
}

runStage1Tests().catch((err) => {
  console.error("❌ TEST SUITE RUN FAILED:", err);
  process.exit(1);
});
