import assert from "assert";
import fs from "fs";
import { BenchmarkComparisonEngine } from "./benchmark/BenchmarkComparisonEngine";
import { BenchmarkDatasetRepository } from "./benchmark/BenchmarkDatasetRepository";
import { BenchmarkReportGenerator } from "./benchmark/BenchmarkReportGenerator";
import { BlindReviewPreparer } from "./benchmark/BlindReviewPreparer";
import { CreativeBenchmarkScorer, concreteness } from "./benchmark/CreativeBenchmarkScorer";
import {
  BENCHMARK_DIMENSIONS,
  BENCHMARK_INDUSTRIES,
  BenchmarkCase,
  BenchmarkCaseResult,
  BenchmarkOutput,
} from "./benchmark/creative-benchmark.types";
import { IMAGE_ENGINE_CONFIG } from "./config";
import { ReasoningKnowledgeRepository } from "./reasoning/ReasoningKnowledgeRepository";

/**
 * CIOS Phase 3.1.5 verification — Creative Benchmark System.
 *
 * The properties that matter most here are not "does it produce a number" but
 * "is the number honest": unscorable dimensions must stay out of the averages,
 * an absent instruction must score zero rather than be skipped, and the blind
 * packet must actually be blind. A benchmark that fails those is worse than no
 * benchmark, because its output would be trusted.
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
async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
const section = (t: string) => console.log(`\n🔹 ${t}`);

console.log("=".repeat(72));
console.log("CIOS PHASE 3.1.5 — CREATIVE BENCHMARK SYSTEM");
console.log("=".repeat(72));

const repo = new BenchmarkDatasetRepository();
const knowledge = new ReasoningKnowledgeRepository();
const cases = repo.getCases();

async function main() {
  // ── 1. Dataset ──────────────────────────────────────────────────────────
  section("1. Benchmark dataset");

  check("Dataset loads, validates and holds 30 cases", () => {
    assert.strictEqual(cases.length, 30, `expected 30 cases, found ${cases.length}`);
    assert.deepStrictEqual(BenchmarkDatasetRepository.validate(repo.load()), []);
    const s = repo.stats();
    console.log(`      ${s.total} cases · ${Object.keys(s.byIndustry).length} industries · ${Object.keys(s.byChallenge).length} challenge kinds`);
  });

  check("All six industries carry five cases each", () => {
    const s = repo.stats();
    for (const industry of BENCHMARK_INDUSTRIES) {
      assert.strictEqual(s.byIndustry[industry], 5, `${industry} has ${s.byIndustry[industry] ?? 0} cases, expected 5`);
    }
    console.log("      " + BENCHMARK_INDUSTRIES.map((i) => `${i}=5`).join(" "));
  });

  check("Every case states a brief, a challenge and its evaluation criteria", () => {
    for (const c of cases) {
      for (const f of ["brand", "product", "audience", "objective", "channel", "tone"] as const) {
        assert.ok(c.brief[f], `${c.case_id}: brief.${f} missing`);
      }
      assert.ok(c.creative_challenge.length >= 20, `${c.case_id}: challenge too thin`);
      assert.ok(c.criteria.must_address.length >= 2, `${c.case_id}: must_address too short`);
      assert.ok(c.criteria.must_avoid.length >= 2, `${c.case_id}: must_avoid too short`);
      assert.ok(c.criteria.weighted_dimensions.length >= 2, `${c.case_id}: weighted_dimensions too short`);
    }
  });

  check("The dataset matches its JSON schema file", () => {
    const schemaPath = IMAGE_ENGINE_CONFIG.CREATIVE_BENCHMARK_SCHEMA_PATH;
    assert.ok(fs.existsSync(schemaPath), `schema not found at ${schemaPath}`);
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const industryEnum: string[] = schema.definitions.case.properties.industry.enum;
    const dimEnum: string[] = schema.definitions.case.properties.criteria.properties.weighted_dimensions.items.enum;
    // The schema and the TypeScript union are two statements of the same thing,
    // so they are checked against each other rather than each against the data.
    assert.deepStrictEqual([...industryEnum].sort(), [...BENCHMARK_INDUSTRIES].sort());
    assert.deepStrictEqual([...dimEnum].sort(), BENCHMARK_DIMENSIONS.map((d) => d.id).sort());
  });

  check("Validation rejects a malformed case rather than loading it", () => {
    const broken = {
      dataset_id: "x",
      version: "v1",
      cases: [{ ...cases[0], case_id: "not-a-valid-id", criteria: { ...cases[0].criteria, must_avoid: [] } }],
    } as any;
    const issues = BenchmarkDatasetRepository.validate(broken);
    assert.ok(issues.length >= 2, `expected multiple issues, got ${issues.length}`);
    assert.ok(issues.some((i) => i.includes("case_id")), "id problem not reported");
    assert.ok(issues.some((i) => i.includes("must_avoid")), "criteria problem not reported");
  });

  // ── 2. Evaluation schema ────────────────────────────────────────────────
  section("2. Evaluation schema");

  check("Fifteen dimensions across the four required categories", () => {
    // Phase 3.1.7 added `material` to the visual category. It was the one art
    // direction slot the benchmark never measured, while both pipelines produce
    // one — so it was a real capability neither side got credit or blame for.
    assert.strictEqual(BENCHMARK_DIMENSIONS.length, 15);
    const byCat: Record<string, number> = {};
    for (const d of BENCHMARK_DIMENSIONS) byCat[d.category] = (byCat[d.category] || 0) + 1;
    assert.deepStrictEqual(byCat, { concept: 4, strategy: 3, visual: 5, production: 3 });
    console.log("      concept=4 strategy=3 visual=5 production=3");
  });

  check("Every dimension declares an honest scoring method", () => {
    for (const d of BENCHMARK_DIMENSIONS) {
      assert.ok(["AUTOMATED", "PROXY", "HUMAN_REQUIRED"].includes(d.method), `${d.id}: bad method`);
      assert.ok(d.question.length > 15, `${d.id}: question too thin for a reviewer`);
      // A proxy that does not say what it actually counts is indistinguishable
      // from a claim to measure the real thing.
      if (d.method === "PROXY") assert.ok(d.proxy_note, `${d.id} is a PROXY with no proxy_note`);
    }
    const counts = BENCHMARK_DIMENSIONS.reduce((a, d) => ({ ...a, [d.method]: (a as any)[d.method] + 1 || 1 }), {} as any);
    console.log(`      ${JSON.stringify(counts)}`);
  });

  check("concreteness rewards measurable instruction over quality adjectives", () => {
    const specific = concreteness("Hold at least a four-to-one luminance ratio between subject and background.");
    const vague = concreteness("Beautiful premium lighting with an elegant, sophisticated feel.");
    assert.ok(specific >= 7, `specific instruction scored only ${specific}`);
    assert.ok(vague <= 3, `vague instruction scored ${vague}, too high`);
    assert.strictEqual(concreteness(""), 0);
    assert.ok(specific > vague + 4, "the measure does not separate the two cases sharply enough");
  });

  check("HUMAN_REQUIRED dimensions are excluded from automated averages", () => {
    const output: BenchmarkOutput = {
      pipeline: "CIOS",
      concept: { big_idea: "A", core_message: "B", consumer_insight: "C", differentiation: "D" },
      direction: { camera: "Use a 50mm at eye level", lighting: "", composition: "", colour: "", atmosphere: "", typography: "", material: "" },
      knowledge_used: [],
      source: "test",
    };
    const score = CreativeBenchmarkScorer.score(output, cases[0]);
    const human = score.dimensions.find((d) => d.dimension === "emotional_strength")!;
    assert.strictEqual(human.scored, false, "emotional_strength must not be auto-scored");
    assert.strictEqual(human.score, 0);
    assert.ok(score.unscored_dimensions.includes("emotional_strength"));
    // The load-bearing assertion: a zero on an unscored dimension must not drag
    // the average down, or every pipeline is penalised for the scorer's limits.
    const scored = score.dimensions.filter((d) => d.scored);
    const expected = Math.round((scored.reduce((s, d) => s + d.score, 0) / scored.length) * 100) / 100;
    assert.strictEqual(score.automated_overall, expected);
  });

  check("A missing instruction scores zero and stays in the average", () => {
    const empty: BenchmarkOutput = {
      pipeline: "CIOS",
      concept: { big_idea: "", core_message: "", consumer_insight: "", differentiation: "" },
      direction: { camera: "", lighting: "", composition: "", colour: "", atmosphere: "", typography: "", material: "" },
      knowledge_used: [],
      source: "test",
    };
    const score = CreativeBenchmarkScorer.score(empty, cases[0]);
    const composition = score.dimensions.find((d) => d.dimension === "composition")!;
    assert.strictEqual(composition.scored, true, "an absent instruction must be scored, not skipped");
    assert.strictEqual(composition.score, 0);
    assert.ok(/no composition instruction/i.test(composition.finding));
  });

  check("Photography caps when only half the shot is specified", () => {
    const half: BenchmarkOutput = {
      pipeline: "CIOS",
      concept: { big_idea: "", core_message: "", consumer_insight: "", differentiation: "" },
      direction: {
        camera: "Set a 50mm lens at eye level with the product at 40 percent of frame height",
        lighting: "",
        composition: "",
        colour: "",
        atmosphere: "",
        typography: "",
        material: "",
      },
      knowledge_used: [],
      source: "test",
    };
    const score = CreativeBenchmarkScorer.score(half, cases[0]);
    const photo = score.dimensions.find((d) => d.dimension === "photography")!;
    assert.ok(photo.score <= 4, `half a shot scored ${photo.score}; must be capped at 4`);
    assert.ok(/only camera/i.test(photo.finding));
  });

  // ── 3. Comparison engine ────────────────────────────────────────────────
  section("3. Comparison engine");

  const sample = cases.slice(0, 6);
  let results: BenchmarkCaseResult[] = [];

  await checkAsync("Runs both pipelines on a case and compares every dimension", async () => {
    const result = await BenchmarkComparisonEngine.runCase(cases[0], { repository: knowledge });
    assert.strictEqual(result.cios.pipeline, "CIOS");
    assert.strictEqual(result.legacy.pipeline, "LEGACY");
    assert.strictEqual(result.outcomes.length, 15);
    assert.ok(["CIOS", "LEGACY", "TIE"].includes(result.verdict));
    assert.ok(result.cios.knowledge_used.length > 0, "CIOS cited no knowledge");
    assert.strictEqual(result.legacy.knowledge_used.length, 0, "the legacy path cites nothing by design");
  });

  await checkAsync("Runs the full six-case sample and records knowledge usage", async () => {
    results = await BenchmarkComparisonEngine.runAll(sample, { repository: knowledge });
    assert.strictEqual(results.length, sample.length);
    for (const r of results) {
      assert.ok(r.knowledge_usage.cios_knowledge_count > 0, `${r.case_id}: no knowledge retrieved`);
      assert.ok(Object.keys(r.knowledge_usage.cios_domains).length > 0);
    }
    const domains = new Set(results.flatMap((r) => Object.keys(r.knowledge_usage.cios_domains)));
    console.log(`      ${results.length} cases · domains used: ${[...domains].sort().join(", ")}`);
  });

  check("The baseline produces a real concept on every case", () => {
    // This replaces the V1/V2 caveat test. Until Phase 3.1.7 the legacy side had
    // no concept at all and every concept dimension scored CIOS against zero;
    // the test asserted the warning that said so. There is now a baseline, so
    // what has to be asserted is that it actually produced something.
    for (const r of results) {
      assert.ok(r.legacy.concept.big_idea, `${r.case_id}: baseline produced no big idea`);
      assert.ok(r.legacy.concept.consumer_insight, `${r.case_id}: baseline produced no insight`);
      assert.ok(r.legacy.concept.differentiation, `${r.case_id}: baseline produced no differentiation`);
      assert.ok(!r.warnings.some((w) => w.startsWith("OFFLINE_MODE")), `${r.case_id}: stale offline caveat`);
    }
  });

  check("The template backend labels itself on every case it produces", () => {
    // The caveat that replaces it, and it is a narrower one: the deterministic
    // baseline was authored by the same hand as CIOS, so the taste dimensions
    // are not defensible even though the structural ones are.
    for (const r of results) {
      assert.strictEqual(r.legacy.legacy_backend, "template");
      assert.ok(
        r.warnings.some((w) => w.startsWith("TEMPLATE_BASELINE")),
        `${r.case_id}: template baseline must declare itself`
      );
    }
  });

  check("The baseline fills every art direction field", () => {
    // A baseline with holes manufactures a CIOS win on coverage that the
    // architecture did not earn.
    for (const r of results) {
      for (const [field, value] of Object.entries(r.legacy.direction)) {
        assert.ok(String(value).trim(), `${r.case_id}: baseline left ${field} empty`);
      }
    }
  });

  check("Empty art direction dimensions are recorded per case", () => {
    for (const r of results) {
      assert.ok(Array.isArray(r.knowledge_usage.cios_empty_dimensions));
      assert.ok(Array.isArray(r.knowledge_usage.legacy_empty_dimensions));
    }
    const alwaysEmpty = ["camera", "lighting", "composition", "colour", "atmosphere", "typography"].filter((d) =>
      results.every((r) => r.knowledge_usage.cios_empty_dimensions.includes(d))
    );
    console.log(`      CIOS never filled: ${alwaysEmpty.join(", ") || "(none)"}`);
  });

  check("A near-identical pair is called a tie rather than a win", () => {
    for (const r of results) {
      const delta = r.cios_score.automated_overall - r.legacy_score.automated_overall;
      if (Math.abs(delta) < 0.5) assert.strictEqual(r.verdict, "TIE", `${r.case_id}: delta ${delta} should tie`);
      else assert.notStrictEqual(r.verdict, "TIE", `${r.case_id}: delta ${delta} should not tie`);
    }
  });

  // ── 4. Blind review ─────────────────────────────────────────────────────
  section("4. Blind review preparation");

  check("The packet carries no attribution anywhere in its payload", () => {
    const { packet } = BlindReviewPreparer.prepare(results, cases, { seed: 1 });
    const serialised = JSON.stringify(packet).toLowerCase();
    // Whole-word attribution terms only. "shadow" belongs to lighting vocabulary
    // ("soft gradient shadows") and matching it as a substring failed on a packet
    // that was in fact perfectly blind.
    for (const tell of ["cios", "legacy", "marketingbrain", "shadowservice"]) {
      assert.ok(!new RegExp(`\b${tell}\b`).test(serialised), `packet leaks the term "${tell}"`);
    }
    assert.deepStrictEqual(BlindReviewPreparer.assertBlind(packet).filter((p) => /attribution term/.test(p)), []);
    assert.strictEqual(packet.cases.length, results.length);
    for (const c of packet.cases) {
      assert.strictEqual(c.submissions.length, 2);
      assert.deepStrictEqual(c.submissions.map((s) => s.label), ["A", "B"]);
    }
  });

  check("Assignment is randomised, not fixed to one side", () => {
    const { key } = BlindReviewPreparer.prepare(
      // Needs more than the six-case sample to be meaningful, so all 30 are used.
      cases.map((c) => ({ ...results[0], case_id: c.case_id, industry: c.industry })) as BenchmarkCaseResult[],
      cases,
      { seed: 7 }
    );
    const values = Object.values(key.assignment);
    const ciosFirst = values.filter((v) => v === "CIOS").length;
    assert.ok(
      ciosFirst > 0 && ciosFirst < values.length,
      `assignment is degenerate: ${ciosFirst}/${values.length} cases put CIOS first`
    );
    console.log(`      CIOS shown as A in ${ciosFirst} of ${values.length} cases`);
  });

  check("The same seed reproduces the same packet", () => {
    const a = BlindReviewPreparer.prepare(results, cases, { seed: 42 });
    const b = BlindReviewPreparer.prepare(results, cases, { seed: 42 });
    assert.deepStrictEqual(a.key.assignment, b.key.assignment);
    assert.deepStrictEqual(a.packet, b.packet);
    const c = BlindReviewPreparer.prepare(results, cases, { seed: 43 });
    assert.notDeepStrictEqual(a.key.assignment, c.key.assignment, "different seeds produced the same assignment");
  });

  check("The packet is blind: both sides carry a concept", () => {
    // Fourth and final state for this assertion, and every change tracked the
    // system rather than a mistake in the test. V1/V2: the legacy side had no
    // concept. 3.1.7: a real baseline gave it one. 3.1.8.1: the concept layer was
    // confined to concept-bearing domains and the corpus could not fill it, so
    // CIOS lost its concept. 4.0: the Creative Concept Intelligence layer filled
    // it, and the asymmetry is gone in the direction that matters.
    const { packet } = BlindReviewPreparer.prepare(results, cases, { seed: 3 });
    const problems = BlindReviewPreparer.assertBlind(packet);
    assert.deepStrictEqual(problems, [], `packet is not blind: ${problems.join(" | ")}`);
  });

  check("Restricting the questions does not change whether the payload is blind", () => {
    const { packet } = BlindReviewPreparer.prepare(results, cases, {
      seed: 3,
      dimensions: ["composition", "typography", "photography", "color_direction", "clarity"],
    });
    // The guard is about the data, not about which questions were asked: the same
    // findings appear either way, because restricting the questions does not
    // change what is in the payload.
    const full = BlindReviewPreparer.assertBlind(
      BlindReviewPreparer.prepare(results, cases, { seed: 3 }).packet
    );
    assert.deepStrictEqual(BlindReviewPreparer.assertBlind(packet), full);
    assert.ok(packet.cases.every((c) => c.questions.length === 5));
  });

  check("Reviewer answers re-attribute correctly through the key", () => {
    const { packet, key } = BlindReviewPreparer.prepare(results, cases, { seed: 11 });
    const first = packet.cases[0];
    const response = {
      packet_id: packet.packet_id,
      reviewer_id: "reviewer_1",
      scores: [
        { case_id: first.case_id, label: "A" as const, dimension: "composition" as const, score: 8 },
        { case_id: first.case_id, label: "B" as const, dimension: "composition" as const, score: 5 },
      ],
    };
    const attributed = BlindReviewPreparer.attribute(response, key);
    assert.strictEqual(attributed.length, 2);
    assert.strictEqual(attributed[0].pipeline, key.assignment[first.case_id]);
    assert.notStrictEqual(attributed[0].pipeline, attributed[1].pipeline);
    assert.throws(
      () => BlindReviewPreparer.attribute({ ...response, packet_id: "wrong" }, key),
      /does not match key/
    );
  });

  // ── 5. Report ───────────────────────────────────────────────────────────
  section("5. Report generation");

  check("Report aggregates by dimension, category and industry", () => {
    const report = BenchmarkReportGenerator.generate(results, { datasetId: "test", mode: "offline" });
    assert.strictEqual(report.case_count, results.length);
    assert.strictEqual(report.by_dimension.length, 15);
    assert.strictEqual(report.by_category.length, 4);
    assert.ok(report.by_industry.length > 0);
    assert.strictEqual(
      report.summary.cios_wins + report.summary.legacy_wins + report.summary.ties,
      results.length,
      "verdict counts do not sum to the case count"
    );
  });

  check("Win rate excludes ties from its base", () => {
    const report = BenchmarkReportGenerator.generate(results, { datasetId: "test", mode: "offline" });
    const decided = report.summary.cios_wins + report.summary.legacy_wins;
    const expected = decided ? Math.round((report.summary.cios_wins / decided) * 100) / 100 : 0;
    assert.strictEqual(report.summary.cios_win_rate, expected);
  });

  check("An always-empty dimension would still be reported as BLOCKING", () => {
    // Asserted against synthetic results rather than the real run. Through V1 and
    // V2 a real blocking finding always existed, so `blocking.length > 0` tested
    // the mechanism by accident; after 3.1.6.6 and 3.1.7 there are none left, and
    // an assertion that a defect exists starts failing precisely when the system
    // gets fixed. The mechanism still has to work, so it is forced here.
    const starved = results.map((r) => ({
      ...r,
      knowledge_usage: { ...r.knowledge_usage, cios_empty_dimensions: ["lighting"] },
    }));
    const report = BenchmarkReportGenerator.generate(starved, { datasetId: "test", mode: "offline" });
    const blocking = report.weaknesses.filter((w) => w.severity === "BLOCKING");
    assert.ok(
      blocking.some((w) => w.pipeline === "CIOS" && /no lighting direction in \d+ of \d+ cases \(100%\)/.test(w.summary)),
      `a dimension empty on every case must be BLOCKING; got: ${blocking.map((w) => w.summary.slice(0, 70)).join(" | ") || "(none)"}`
    );
  });

  check("The real run has no blocking weakness left", () => {
    const report = BenchmarkReportGenerator.generate(results, { datasetId: "test", mode: "offline" });
    const blocking = report.weaknesses.filter((w) => w.severity === "BLOCKING");
    // The offline concept caveat was the standing BLOCKING finding through V1 and
    // V2. Phase 3.1.7 removed its cause by giving the benchmark a real baseline.
    assert.deepStrictEqual(
      blocking.map((w) => `${w.pipeline}: ${w.summary.slice(0, 60)}`),
      [],
      "an unexpected blocking finding appeared"
    );
    console.log(`      ${report.weaknesses.length} weaknesses · 0 blocking`);
  });

  check("Human-only dimensions are surfaced at the top level", () => {
    const report = BenchmarkReportGenerator.generate(results, { datasetId: "test", mode: "offline" });
    assert.ok(report.requires_human_review.includes("emotional_strength"));
    const rendered = BenchmarkReportGenerator.format(report);
    assert.ok(rendered.includes("NOT MEASURED AUTOMATICALLY"));
    assert.ok(rendered.includes("not the whole answer"));
  });

  check("An empty result set produces a report rather than a crash", () => {
    const report = BenchmarkReportGenerator.generate([], { datasetId: "test", mode: "offline" });
    assert.strictEqual(report.case_count, 0);
    assert.strictEqual(report.summary.cios_win_rate, 0);
    assert.ok(BenchmarkReportGenerator.format(report).includes("SUMMARY"));
  });

  // ── 6. Isolation from production ────────────────────────────────────────
  section("6. Isolation from production");

  check("No production module imports the benchmark", () => {
    // The benchmark must stay test infrastructure. If a render path ever imports
    // it, the dataset becomes a runtime dependency and a fixture edit becomes a
    // production incident.
    const roots = ["app", "lib/image-engine/campaign", "lib/image-engine/compiler", "lib/image-engine/provider"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = fs.readFileSync(full, "utf-8");
          if (/from ["'].*benchmark\//.test(src)) offenders.push(full);
        }
      }
    };
    roots.forEach(walk);
    assert.deepStrictEqual(offenders, [], `benchmark imported by production code: ${offenders.join(", ")}`);
  });

  check("The baseline never touches the system under test", () => {
    // Requirement 3, enforced by reading the file rather than by intention. A
    // baseline that imported CreativeDecisionEngine or the reasoning retriever
    // would be partly the thing it is measuring, and every number in the report
    // would be worth nothing.
    const src = fs.readFileSync("lib/image-engine/benchmark/LegacyCreativeProvider.ts", "utf-8");
    const imports = src.match(/^import .*$/gm) || [];
    const forbidden = [
      "CreativeDecisionEngine",
      "CreativeConceptEngine",
      "ReasoningKnowledgeRetriever",
      "ReasoningKnowledgeRepository",
      "CreativeContextExtractor",
      "CiosReasoningShadowService",
      "CreativeKnowledgeService",
      "CreativeDirection",
      "SlotPropagationValidator",
      "reasoning-knowledge.types",
      "creative-decision.types",
    ];
    for (const name of forbidden) {
      assert.ok(
        !imports.some((line) => line.includes(name)),
        `the baseline imports ${name}; it must not use any part of the CIOS architecture`
      );
    }
    // And it must reach nothing from the reasoning layer by path either.
    assert.ok(!/from "\.\.\/reasoning\//.test(src), "the baseline imports from the reasoning layer");
  });

  check("The baseline output is structurally comparable to the CIOS output", () => {
    // Both sides must carry the same fields, or a dimension silently measures
    // presence-of-field rather than quality-of-answer.
    const ciosFields = Object.keys(results[0].cios.direction).sort();
    const legacyFields = Object.keys(results[0].legacy.direction).sort();
    assert.deepStrictEqual(legacyFields, ciosFields, "the two sides expose different direction fields");
    assert.deepStrictEqual(
      Object.keys(results[0].legacy.concept).sort(),
      Object.keys(results[0].cios.concept).sort(),
      "the two sides expose different concept fields"
    );
  });

  check("The benchmark makes no provider or LLM call in offline mode", () => {
    const src = fs.readFileSync("lib/image-engine/benchmark/BenchmarkComparisonEngine.ts", "utf-8");
    // Imports, not mentions. The engine names MarketingBrainService in a string
    // that records how a live-mode result was produced, which is provenance
    // rather than a call — an earlier version of this assertion could not tell
    // the two apart and failed on a correct file.
    const imports = src.match(/^import .*$/gm) || [];
    for (const forbidden of ["MarketingBrainService", "LLMProviderService", "ImageGenerationProvider"]) {
      assert.ok(
        !imports.some((line) => line.includes(forbidden)),
        `the comparison engine imports ${forbidden}; live mode must go through the injected provider`
      );
    }
    assert.ok(/legacyConceptProvider/.test(src), "live mode must go through an injected provider");
  });

  console.log("\n" + "=".repeat(72));
  console.log(`${passed} passed, ${failed} failed`);
  console.log("=".repeat(72));
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
