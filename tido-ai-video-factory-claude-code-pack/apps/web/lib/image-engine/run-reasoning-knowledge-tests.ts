import assert from "assert";
import fs from "fs";
import path from "path";
import { IMAGE_ENGINE_CONFIG } from "./config";
import { CreativeContextExtractor } from "./reasoning/CreativeContextExtractor";
import { ReasoningKnowledgeRepository } from "./reasoning/ReasoningKnowledgeRepository";
import { ReasoningKnowledgeRetriever } from "./reasoning/ReasoningKnowledgeRetriever";
import { ReasoningKnowledgeValidator } from "./reasoning/ReasoningKnowledgeValidator";
import { ReasoningKnowledgeObject } from "./reasoning/reasoning-knowledge.types";

/**
 * Phase 0 verification for the CIOS Layer 2 substrate.
 *
 * Fixtures live in memory. No knowledge content is authored to disk — Phase 0
 * builds the machinery, not the corpus.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function section(title: string) {
  console.log(`\n🔹 ${title}`);
}

/** A complete, governance-compliant object used as the positive fixture. */
function validObject(overrides: Partial<ReasoningKnowledgeObject> = {}): ReasoningKnowledgeObject {
  return {
    knowledge_id: "beauty.identity_preservation.confidence_storytelling.001",
    name: "Identity-preservation storytelling for mature skincare",
    domain: "strategy",
    sub_domain: "identity_preservation",
    knowledge_type: "decision_rule",
    creative_stage: ["strategy", "concept"],
    context: {
      industry: "beauty",
      category: "skincare",
      audience: "women_35_50",
      objective: "product_launch",
      channel: "*",
      asset_type: "*",
      brand_position: ["premium", "luxury"],
    },
    problem: "Category communication defaults to fear of ageing, which mature buyers reject.",
    human_insight: {
      functional_need: "Visible improvement in skin tone and texture",
      emotional_need: "Continue to recognise herself",
      social_need: "Be seen as self-possessed rather than anxious",
    },
    decision: "Use identity-preservation storytelling instead of correction or reversal messaging.",
    reasoning:
      "Buyers in this segment are motivated by continuity of self-image, not by repair of a defect. Framing the product as correction implies the person is broken.",
    why_this_works: "Continuity language removes the implied criticism that suppresses purchase intent.",
    use_when: ["Audience is 35+", "Brand position is premium or luxury"],
    avoid_when: ["Discount-led promotion", "Clinical or dermatological positioning requiring efficacy proof"],
    trade_off: {
      advantage: "Higher emotional relevance and premium perception",
      limitation: "Slower, less direct product benefit communication",
      suitable_conditions: "Brand awareness and launch campaigns",
      unsuitable_conditions: "Flash sales requiring immediate information",
    },
    alternatives: ["Clinical efficacy proof", "Ingredient-led scientific luxury"],
    anti_patterns: [
      {
        problem: "Generic beauty model holding the serum against a white background",
        why_it_fails: "Identical to every competitor; carries no differentiating meaning",
        replacement: "Identity-based storytelling with a specific, earned moment",
      },
    ],
    examples: [
      {
        problem: "Anti-ageing launch in a saturated category",
        creative_decision: "Lead with continuity of self rather than reversal of time",
        transferable_rule: "In categories that sell improvement, sell continuity to mature audiences.",
      },
    ],
    impact: "Increases emotional relevance and premium perception.",
    impact_score: 8,
    priority: 9,
    confidence: 0.9,
    related_knowledge: [],
    source: "Phase 0 fixture",
    ...overrides,
  };
}

console.log("=".repeat(58));
console.log("CIOS PHASE 0 — REASONING KNOWLEDGE SUBSTRATE");
console.log("=".repeat(58));

// ── 1. Layer separation ───────────────────────────────────────────────
section("1. Layer separation (Governance §1)");

check("Layer 1 and Layer 2 directories are distinct", () => {
  assert.notStrictEqual(IMAGE_ENGINE_CONFIG.KNOWLEDGE_DIR, IMAGE_ENGINE_CONFIG.REASONING_KNOWLEDGE_DIR);
  assert.ok(IMAGE_ENGINE_CONFIG.REASONING_KNOWLEDGE_DIR.includes("cios-knowledge"));
});

check("Layer 1 corpus is untouched (20 blocks still present)", () => {
  const dir = IMAGE_ENGINE_CONFIG.KNOWLEDGE_DIR;
  let count = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name === "knowledge.md") count++;
    }
  };
  walk(dir);
  assert.strictEqual(count, 20, `Expected 20 Layer 1 blocks, found ${count}`);
});

check("Layer 2 has its own schema, separate from v1", () => {
  const l2 = path.join(IMAGE_ENGINE_CONFIG.REASONING_KNOWLEDGE_DIR, "_schema/reasoning_knowledge_schema_v2.json");
  assert.ok(fs.existsSync(l2), "Layer 2 schema missing");
  const schema = JSON.parse(fs.readFileSync(l2, "utf-8"));
  assert.ok(schema.required.includes("decision"), "V2 schema must require `decision`");
  assert.ok(schema.required.includes("avoid_when"), "V2 schema must require `avoid_when`");
});

check("Layer 2 fields would be REJECTED by the Layer 1 schema", () => {
  // Proves the corpora cannot be merged, which is why they stay apart.
  const v1 = JSON.parse(fs.readFileSync("data/schemas/knowledge_block_schema_v1.json", "utf-8"));
  assert.strictEqual(v1.additionalProperties, false, "v1 should forbid extra properties");
  const v1Props = Object.keys(v1.properties || {});
  for (const field of ["decision", "reasoning", "human_insight", "anti_patterns", "avoid_when"]) {
    assert.ok(!v1Props.includes(field), `v1 unexpectedly allows "${field}"`);
  }
});

check("Reasoning budget is separate from the image prompt budget", () => {
  assert.ok(IMAGE_ENGINE_CONFIG.REASONING_CONTEXT_BUDGET_CHARS > 0);
  assert.notStrictEqual(
    IMAGE_ENGINE_CONFIG.REASONING_CONTEXT_BUDGET_CHARS,
    IMAGE_ENGINE_CONFIG.MAX_PRODUCT_REFERENCES
  );
});

// ── 2. Repository ─────────────────────────────────────────────────────
section("2. Repository");

check("Corpus loads cleanly from disk", () => {
  // Phase 0 asserted this corpus was empty, which was true until Phase 2 seeded
  // the Core Creative Brain. What Phase 0 was really testing is that the loader
  // reads the real directory without error, so that is what it now asserts.
  const repo = new ReasoningKnowledgeRepository();
  const all = repo.getAll();
  assert.ok(Array.isArray(all), "getAll must return an array");
  assert.strictEqual(repo.getLoadErrors().length, 0, JSON.stringify(repo.getLoadErrors()));
  for (const o of all) assert.ok(o.knowledge_id, "every loaded object must carry a knowledge_id");
});

check("_schema directory is not treated as knowledge", () => {
  const repo = new ReasoningKnowledgeRepository();
  assert.strictEqual(repo.getAll().filter((o) => o._file?.startsWith("_schema")).length, 0);
});

check("Repository reads YAML and JSON from a temp corpus", () => {
  const tmp = path.join(process.cwd(), ".tmp-reasoning-test");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, "strategy"), { recursive: true });

  fs.writeFileSync(path.join(tmp, "strategy", "a.json"), JSON.stringify(validObject()), "utf-8");
  fs.writeFileSync(
    path.join(tmp, "strategy", "b.yaml"),
    [
      "knowledge_id: layout.luxury_hero.negative_space.001",
      "name: Luxury negative space hero",
      "domain: layout",
      "sub_domain: luxury_hero",
      "knowledge_type: decision_rule",
      "creative_stage: visual_direction",
      "context:",
      "  industry: beauty",
      "  category: skincare",
      "  audience: premium_consumers",
      "  objective: awareness",
      "  channel: '*'",
      "  asset_type: poster",
      "  brand_position: luxury",
      "problem: Premium products lose perceived value in crowded layouts.",
      "decision: Use controlled negative space with a single dominant subject.",
      "reasoning: Restraint signals confidence, and confidence is what premium buyers read as quality.",
      "why_this_works: Reduced competition for attention raises perceived value of what remains.",
      "use_when: Brand awareness campaigns",
      "avoid_when: Flash sale requiring dense information",
      "impact: Raises premium perception.",
      "impact_score: 8",
      "priority: 9",
      "confidence: 0.88",
    ].join("\n"),
    "utf-8"
  );

  const repo = new ReasoningKnowledgeRepository(tmp);
  const all = repo.getAll();
  assert.strictEqual(repo.getLoadErrors().length, 0, JSON.stringify(repo.getLoadErrors()));
  assert.strictEqual(all.length, 2, `Expected 2 objects, got ${all.length}`);
  assert.ok(all.some((o) => o.domain === "layout"), "YAML object not parsed");
  fs.rmSync(tmp, { recursive: true, force: true });
});

check("Unparseable file is recorded, not fatal", () => {
  const tmp = path.join(process.cwd(), ".tmp-reasoning-bad");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, "strategy"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "strategy", "ok.json"), JSON.stringify(validObject()), "utf-8");
  fs.writeFileSync(path.join(tmp, "strategy", "broken.json"), "{ not valid json", "utf-8");

  const repo = new ReasoningKnowledgeRepository(tmp);
  assert.strictEqual(repo.getAll().length, 1, "valid object should still load");
  assert.strictEqual(repo.getLoadErrors().length, 1, "broken file must be reported");
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ── 3. Validation ─────────────────────────────────────────────────────
section("3. Structural validation (Governance §2-§7, §11)");

check("Compliant object passes with zero errors", () => {
  const issues = ReasoningKnowledgeValidator.validateStructure(validObject());
  assert.strictEqual(issues.length, 0, JSON.stringify(issues, null, 2));
});

check("Malformed knowledge_id is rejected", () => {
  const issues = ReasoningKnowledgeValidator.validateStructure(validObject({ knowledge_id: "beauty.bad-id" }));
  assert.ok(issues.some((i) => i.field === "knowledge_id"), "expected knowledge_id error");
});

check("Missing context axis is rejected (all 7 mandatory)", () => {
  const obj = validObject();
  delete (obj.context as any).channel;
  const issues = ReasoningKnowledgeValidator.validateStructure(obj);
  assert.ok(issues.some((i) => i.field === "context.channel"));
});

check("Invalid knowledge_type and creative_stage are rejected", () => {
  const a = ReasoningKnowledgeValidator.validateStructure(validObject({ knowledge_type: "tip" as any }));
  assert.ok(a.some((i) => i.field === "knowledge_type"));
  const b = ReasoningKnowledgeValidator.validateStructure(validObject({ creative_stage: "rendering" as any }));
  assert.ok(b.some((i) => i.field === "creative_stage"));
});

check("Out-of-range scores are rejected", () => {
  assert.ok(ReasoningKnowledgeValidator.validateStructure(validObject({ priority: 11 })).some((i) => i.field === "priority"));
  assert.ok(ReasoningKnowledgeValidator.validateStructure(validObject({ confidence: 1.5 })).some((i) => i.field === "confidence"));
  assert.ok(ReasoningKnowledgeValidator.validateStructure(validObject({ impact_score: 0 })).some((i) => i.field === "impact_score"));
});

check("Missing avoid_when is rejected (Limitation Test)", () => {
  const obj = validObject();
  delete (obj as any).avoid_when;
  assert.ok(ReasoningKnowledgeValidator.validateStructure(obj).some((i) => i.field === "avoid_when"));
});

section("4. Quality gate (Governance §14)");

check("Compliant object raises no quality warnings", () => {
  const issues = ReasoningKnowledgeValidator.runQualityGate(validObject());
  assert.strictEqual(issues.length, 0, JSON.stringify(issues, null, 2));
});

check("Hedged decision is caught — Layer 2 must decide, not survey", () => {
  const obj = validObject({
    decision: "Negative space may be used where appropriate according to the needs of the layout.",
  });
  const issues = ReasoningKnowledgeValidator.runQualityGate(obj);
  assert.ok(issues.some((i) => i.gate === "Decision Test"), "hedging not detected");
});

check("Wildcard-everywhere context is caught", () => {
  const obj = validObject({
    context: {
      industry: "*", category: "*", audience: "*", objective: "*",
      channel: "*", asset_type: "*", brand_position: "*",
    },
  });
  assert.ok(ReasoningKnowledgeValidator.runQualityGate(obj).some((i) => i.gate === "Context Test"));
});

check("Missing trade_off and anti_patterns are caught", () => {
  const obj = validObject();
  delete (obj as any).trade_off;
  delete (obj as any).anti_patterns;
  const issues = ReasoningKnowledgeValidator.runQualityGate(obj);
  assert.ok(issues.some((i) => i.gate === "Limitation Test"), "missing trade_off not caught");
  assert.ok(issues.some((i) => i.gate === "Expert Test"), "missing anti_patterns not caught");
});

check("Missing human_insight caught for strategy domain (Governance §8)", () => {
  const obj = validObject();
  delete (obj as any).human_insight;
  const issues = ReasoningKnowledgeValidator.runQualityGate(obj);
  assert.ok(issues.some((i) => i.gate === "Expert Test" && /human_insight/.test(i.message)));
});

check("Uncontrolled vocabulary is warned, not blocked (Governance §13)", () => {
  const obj = validObject({
    context: { ...validObject().context, audience: "millennial_dads", brand_position: "quirky" },
  });
  const quality = ReasoningKnowledgeValidator.runQualityGate(obj);
  assert.strictEqual(quality.filter((i) => i.gate === "Vocabulary").length, 2);
  assert.strictEqual(ReasoningKnowledgeValidator.validateStructure(obj).length, 0, "vocabulary must not be a hard error");
});

// ── 5. Context extraction ─────────────────────────────────────────────
section("5. Context extraction (Governance §12)");

check("Skin1004 brief resolves the commercial axes", () => {
  const q = CreativeContextExtractor.extract({
    brand: "Skin1004",
    product: "Tone Brightening Capsule Ampoule",
    industry: "beauty_skincare",
    audience: "Women 35-50",
    objective: "Premium skincare launch",
    channel: "instagram",
    tone: "Premium Korean skincare",
    assetType: "poster",
  });
  assert.strictEqual(q.industry, "beauty");
  assert.strictEqual(q.audience, "women_35_50");
  assert.strictEqual(q.objective, "product_launch");
  assert.strictEqual(q.channel, "instagram");
  assert.strictEqual(q.brand_position, "premium");
  assert.strictEqual(q.asset_type, "poster");
});

check("Vietnamese brief resolves the same axes", () => {
  const q = CreativeContextExtractor.extract({
    product: "Cà phê rang xay",
    audience: "Phụ nữ 25-35 tuổi",
    objective: "Khai trương quán",
    channel: "tiktok",
    tone: "Cao cấp, tối giản",
  });
  assert.strictEqual(q.industry, "food_beverage");
  assert.strictEqual(q.audience, "women_25_35");
  assert.strictEqual(q.objective, "product_launch");
  assert.strictEqual(q.channel, "tiktok");
  assert.strictEqual(q.brand_position, "premium");
});

check("Unresolvable axes stay undefined rather than guessed", () => {
  const q = CreativeContextExtractor.extract({ brand: "Acme", product: "Widget" });
  assert.strictEqual(q.audience, undefined);
  assert.strictEqual(q.objective, undefined);
  assert.strictEqual(q.brand_position, undefined);
  assert.ok(CreativeContextExtractor.coverage(q).unresolved.includes("audience"));
});

// ── 6. Retrieval ──────────────────────────────────────────────────────
section("6. Retrieval (Governance §11, §12)");

function fixtureRepo(objects: ReasoningKnowledgeObject[]): ReasoningKnowledgeRepository {
  const repo = new ReasoningKnowledgeRepository("/nonexistent-phase0");
  (repo as any).cache = objects;
  return repo;
}

const luxuryBeauty = validObject();
const budgetFood = validObject({
  knowledge_id: "food.value_messaging.price_led.001",
  domain: "strategy",
  sub_domain: "value_messaging",
  context: {
    industry: "food_beverage", category: "coffee", audience: "mass_market_consumers",
    objective: "conversion", channel: "*", asset_type: "*", brand_position: "budget",
  },
  priority: 6, impact_score: 5, confidence: 0.7,
});
const universalCritic = validObject({
  knowledge_id: "critic.generic_detection.category_sameness.001",
  domain: "critic",
  sub_domain: "generic_detection",
  knowledge_type: "evaluation_rule",
  creative_stage: "evaluation",
  context: {
    industry: "*", category: "*", audience: "*", objective: "*",
    channel: "*", asset_type: "*", brand_position: "*",
  },
  priority: 8, impact_score: 7, confidence: 0.8,
});

check("Mismatched context is EXCLUDED, not merely down-ranked", () => {
  const r = new ReasoningKnowledgeRetriever(fixtureRepo([luxuryBeauty, budgetFood]));
  const out = r.retrieve({ industry: "beauty", brand_position: "premium", audience: "women_35_50" });
  const ids = out.results.map((x) => x.object.knowledge_id);
  assert.ok(ids.includes(luxuryBeauty.knowledge_id), "beauty rule should match");
  assert.ok(!ids.includes(budgetFood.knowledge_id), "budget food rule must be excluded for a premium beauty brief");
});

check("Specific match outranks wildcard-everywhere knowledge", () => {
  const r = new ReasoningKnowledgeRetriever(fixtureRepo([universalCritic, luxuryBeauty]));
  const out = r.retrieve({ industry: "beauty", brand_position: "luxury", audience: "women_35_50" });
  assert.strictEqual(out.results[0].object.knowledge_id, luxuryBeauty.knowledge_id, "specific object must rank first");
  assert.ok(out.results[0].context_relevance > out.results[1].context_relevance);
});

check("creative_stage filters the pool", () => {
  const r = new ReasoningKnowledgeRetriever(fixtureRepo([luxuryBeauty, universalCritic]));
  const out = r.retrieve({ creative_stage: "evaluation" });
  assert.strictEqual(out.results.length, 1);
  assert.strictEqual(out.results[0].object.domain, "critic");
});

check("domains filter restricts retrieval", () => {
  const r = new ReasoningKnowledgeRetriever(fixtureRepo([luxuryBeauty, universalCritic]));
  assert.strictEqual(r.retrieve({ domains: ["critic"] }).results.length, 1);
});

check("Every result carries per-axis match provenance", () => {
  const r = new ReasoningKnowledgeRetriever(fixtureRepo([luxuryBeauty]));
  const top = r.retrieve({ industry: "beauty", audience: "women_35_50" }).results[0];
  assert.ok(top.matches.length >= 7, "expected a detail per context axis");
  const industry = top.matches.find((m) => m.axis === "industry");
  assert.ok(industry?.matched && !industry.wildcard, "industry should be a specific match");
});

check("Empty corpus warns instead of failing silently", () => {
  const out = new ReasoningKnowledgeRetriever(fixtureRepo([])).retrieve({ industry: "beauty" });
  assert.strictEqual(out.results.length, 0);
  assert.ok(out.warnings.some((w) => w.includes("REASONING_CORPUS_EMPTY")));
});

// ── 7. Context block ──────────────────────────────────────────────────
section("7. LLM context block");

check("Block preserves decision structure, not flattened prose", () => {
  const r = new ReasoningKnowledgeRetriever(fixtureRepo([luxuryBeauty]));
  const { text } = ReasoningKnowledgeRetriever.toContextBlock(r.retrieve({ industry: "beauty" }).results);
  for (const marker of ["DECISION:", "AVOID when:", "ANTI-PATTERN:", "trade-off:", "human insight:", "expected impact:"]) {
    assert.ok(text.includes(marker), `context block missing "${marker}"`);
  }
});

check("Block respects its own budget and reports truncation", () => {
  const r = new ReasoningKnowledgeRetriever(fixtureRepo([luxuryBeauty, universalCritic]));
  const res = r.retrieve({});
  const tiny = ReasoningKnowledgeRetriever.toContextBlock(res.results, 200);
  assert.ok(tiny.truncated, "should report truncation under a tiny budget");
  assert.ok(tiny.text.length <= 400, "budget not respected");
});

// ── 8. Non-interference ───────────────────────────────────────────────
section("8. Image pipeline non-interference (Governance §1)");

check("No preserved component imports the reasoning layer", () => {
  const preserved = [
    "campaign/CampaignBuilderService.ts",
    "campaign/AssetAdaptationService.ts",
    "service/ArtDirectionResolverService.ts",
    "compiler/MasterPromptCompilerService.ts",
    "service/PromptBudgetManagerService.ts",
    "delivery/DeliveryPackageService.ts",
    "provider/ImgStudioImageGenerationProvider.ts",
  ];
  for (const rel of preserved) {
    const src = fs.readFileSync(path.join("lib/image-engine", rel), "utf-8");
    assert.ok(
      !/reasoning\/|ReasoningKnowledge|CreativeContextExtractor/.test(src),
      `${rel} must not import the reasoning layer in Phase 0`
    );
  }
});

check("Layer 1 retrieval path has no reasoning-layer dependency", () => {
  const src = fs.readFileSync("lib/image-engine/retrieval/SmartKnowledgeRetriever.ts", "utf-8");
  assert.ok(!/ReasoningKnowledge|cios-knowledge/.test(src), "Layer 1 retriever must stay independent");
});

// ── Summary ───────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(58));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(58));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
