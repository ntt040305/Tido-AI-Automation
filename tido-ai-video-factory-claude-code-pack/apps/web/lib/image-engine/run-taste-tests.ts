import assert from "assert";
import { CreativeDirectorEvaluationModel } from "./reasoning/CreativeDirectorEvaluationModel";
import { CreativeStressTest } from "./reasoning/CreativeStressTest";
import { CreativeTasteEngine } from "./reasoning/CreativeTasteEngine";
import { CreativeTasteMemory } from "./reasoning/CreativeTasteMemory";
import { CreativeTerritoryEngine } from "./reasoning/CreativeTerritoryEngine";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { IdeaRankingEngine } from "./reasoning/IdeaRankingEngine";
import { InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import {
  DIRECTOR_WEIGHTS,
  RANKING_WEIGHTS,
  TASTE_METHOD,
  TASTE_WEIGHTS,
  TasteDimension,
} from "./reasoning/creative-taste.types";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * CIOS Phase 4.0.4 verification.
 *
 * The thing this phase can most easily get wrong is measuring itself over the
 * wrong denominator — a rejection rate computed across survivors is vacuously
 * zero, and the first run of this benchmark reported exactly that. Several
 * checks below exist only to keep that from coming back.
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
const section = (t: string) => console.log(`\n🔹 ${t}`);

console.log("=".repeat(74));
console.log("CIOS PHASE 4.0.4 — CREATIVE TASTE ENGINE");
console.log("=".repeat(74));

const { cases } = loadConceptBenchmark();
const BRIEF = {
  challenge: "She calculates resale value at the moment of purchase and no brand will acknowledge it.",
  audience: "Women 30 to 45",
  product: "A wool coat",
  category: "fashion",
  objective: "Conversion",
  market: "vn",
};

const insight = HumanInsightGenerator.generate(BRIEF);
const terms = HumanTensionAnalyzer.terms(BRIEF);
const contradiction = InsightContradictionEngine.evaluate(insight);

// ── 1. Taste ──────────────────────────────────────────────────────────────
section("1. CreativeTasteEngine");

check("The eight dimensions the phase names, weighted to 100", () => {
  assert.strictEqual(Object.values(TASTE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.deepStrictEqual(Object.keys(TASTE_WEIGHTS), [
    "originality", "human_resonance", "emotional_power", "cultural_resonance",
    "simplicity", "memorability", "execution_potential", "strategic_fit",
  ]);
});

check("Three dimensions are carried, not recomputed", () => {
  // Two evaluators asking the same question in different words will disagree,
  // and there is no principled way to choose between them when they do.
  const derived = (Object.keys(TASTE_METHOD) as TasteDimension[]).filter((d) => TASTE_METHOD[d] === "DERIVED");
  assert.deepStrictEqual(derived, ["originality", "human_resonance", "emotional_power"]);
  const src = require("fs").readFileSync("lib/image-engine/reasoning/CreativeTasteEngine.ts", "utf-8");
  for (const owner of ["HumanTruthOriginalityEvaluator", "HumanTruthReview", "EmotionalPowerEvaluator"]) {
    assert.ok(src.includes(`${owner}.`), `${owner} is not consulted; the dimension would be recomputed`);
  }
});

check("An unfilmable idea loses execution potential", () => {
  const bad = CreativeTasteEngine.evaluate("Leverage the brand's holistic positioning framework across the ecosystem.");
  const good = CreativeTasteEngine.evaluate("The receipt in her bag is the only honest thing in the shop.");
  assert.ok(bad.dimensions.execution_potential < good.dimensions.execution_potential);
  assert.ok(bad.notes.some((n) => /nothing can be shot of/.test(n)), bad.notes.join(" | "));
});

check("An empty idea scores zero across the board", () => {
  const r = CreativeTasteEngine.evaluate("");
  assert.strictEqual(r.total, 0);
});

check("The report says how much of the total it did not compute", () => {
  const text = CreativeTasteEngine.format(
    CreativeTasteEngine.aggregate([CreativeTasteEngine.evaluate("A short, concrete idea about a receipt.")])
  );
  assert.ok(/carried from evaluators/.test(text));
  assert.ok(/floor, not a judgement/.test(text));
  assert.ok(/does not replace it/.test(text), "the report must say it is a different scale");
});

// ── 2. Director's read ────────────────────────────────────────────────────
section("2. CreativeDirectorEvaluationModel");

check("The four dimensions the phase names, weighted to 100", () => {
  assert.strictEqual(Object.values(DIRECTOR_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.deepStrictEqual(Object.keys(DIRECTOR_WEIGHTS), [
    "brand_ownership", "longevity", "category_differentiation", "emotional_impact",
  ]);
});

check("Time-pinned language costs longevity", () => {
  const pinned = CreativeDirectorEvaluationModel.evaluate("This season, everyone is talking about it right now.");
  const standing = CreativeDirectorEvaluationModel.evaluate(
    "People have always paid for this in a currency nobody counts."
  );
  assert.ok(pinned.dimensions.longevity < standing.dimensions.longevity);
  assert.ok(pinned.notes.some((n) => /Pinned to a moment/.test(n)));
});

check("A category-aligned claim does not differentiate", () => {
  const aligned = CreativeDirectorEvaluationModel.evaluate("The leading premium choice you can trust.");
  assert.ok(aligned.dimensions.category_differentiation < 0.5, `${aligned.dimensions.category_differentiation}`);
  assert.ok(aligned.notes.some((n) => /alongside the category/.test(n)));
});

check("The verdict is a sentence a director would say, from the weakest dimension", () => {
  const weak = CreativeDirectorEvaluationModel.evaluate("The leading premium choice you can trust.");
  assert.ok(weak.verdict_line.length > 20);
  assert.ok(!/\d/.test(weak.verdict_line), `the verdict quotes a number: ${weak.verdict_line}`);
});

// ── 3. Stress tests ───────────────────────────────────────────────────────
section("3. CreativeStressTest");

check("All four tests run and report evidence", () => {
  const r = CreativeStressTest.run("She checks the resale value before she checks the fit.", {
    brand: "Ao", product: "A wool coat", behaviour: "calculates resale value", keyPhrase: "resale value",
  });
  assert.deepStrictEqual(r.results.map((x) => x.test), [
    "REPLACE_BRAND", "FIRST_REACTION", "EXPLANATION", "COPY",
  ]);
  for (const x of r.results) assert.ok(x.evidence && x.consequence, `${x.test} reports nothing`);
});

check("An idea resting on nothing the brief supplied fails REPLACE_BRAND", () => {
  const r = CreativeStressTest.run("People want to feel understood.", { brand: "Ao", product: "A wool coat" });
  assert.ok(r.failures.includes("REPLACE_BRAND"));
  assert.strictEqual(r.survived, false);
});

check("An idea resting on the brief's behaviour survives it", () => {
  // The first version of this test demanded the idea name the brand, which
  // failed 527 of 533 ideas. A good big idea almost never says the brand's name.
  const r = CreativeStressTest.run("She calculates the resale value before she has left the shop.", {
    brand: "Ao", product: "A wool coat", behaviour: "calculates resale value at the moment",
  });
  const rb = r.results.find((x) => x.test === "REPLACE_BRAND")!;
  assert.strictEqual(rb.survived, true, rb.evidence);
});

check("A generic claim fails COPY", () => {
  const r = CreativeStressTest.run("The leading choice for quality you can trust every day.", {
    brand: "Ao", product: "A wool coat", behaviour: "calculates resale value",
  });
  assert.ok(r.failures.includes("COPY"), JSON.stringify(r.failures));
});

check("FIRST_REACTION does not veto on its own", () => {
  // The weakest of the four. A proxy this weak should not be able to kill work.
  const long = CreativeStressTest.run(
    "She calculates the resale value before she has left the shop, which is the one number nobody prints.",
    { brand: "Ao", product: "A wool coat", behaviour: "calculates resale value at the moment" }
  );
  if (long.failures.includes("FIRST_REACTION") && !long.failures.includes("REPLACE_BRAND")
      && !long.failures.includes("COPY")) {
    assert.strictEqual(long.survived, true, "a first-reaction failure alone killed the idea");
  }
});

// ── 4. Territory ──────────────────────────────────────────────────────────
section("4. CreativeTerritoryEngine");

check("Every field the schema specifies", () => {
  const t = CreativeTerritoryEngine.build(insight, terms, contradiction);
  assert.ok(t, "no territory from an insight that passed its contradiction");
  for (const f of ["name", "central_tension", "brand_role", "emotional_space",
                   "visual_world", "story_direction"] as const) {
    assert.ok(String(t![f] || "").trim(), `${f} is empty`);
  }
  assert.ok(t!.name.split(/\s+/).length <= 4, `name is not short: ${t!.name}`);
});

check("No territory without a contradiction at its centre", () => {
  // A territory with no tension is a mood, and a mood is not ground.
  const noContradiction = { ...contradiction, passed: false };
  assert.strictEqual(CreativeTerritoryEngine.build(insight, terms, noContradiction), null);
});

check("A visual world with nothing behind it says so", () => {
  const abstract = HumanInsightGenerator.generate({
    challenge: "The audience distrusts marketing language and this is a marketing asset.",
    audience: "buyers", product: "a platform", category: "technology", market: "vn",
  });
  const t = CreativeTerritoryEngine.build(
    abstract,
    HumanTensionAnalyzer.terms({ challenge: "x", audience: "buyers", product: "a platform" }),
    InsightContradictionEngine.evaluate(abstract)
  );
  if (t) {
    const stated = !/^Not established/.test(t.visual_world);
    if (stated) {
      // If a world was stated it must rest on something concrete, not a mood.
      assert.ok(/Ordinary places/.test(t.visual_world), t.visual_world);
    }
  }
});

check("Several ideas compete on one territory", () => {
  const t = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(t, insight, terms, contradiction);
  assert.ok(ideas.length >= 3, `only ${ideas.length} idea(s) on the territory`);
  assert.strictEqual(new Set(ideas.map((i) => i.big_idea)).size, ideas.length);
  console.log(`      ${ideas.length} ideas on "${t.name}"`);
});

// ── 5. Ranking ────────────────────────────────────────────────────────────
section("5. IdeaRankingEngine");

check("The six dimensions the phase names, weighted to 100", () => {
  assert.strictEqual(Object.values(RANKING_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.deepStrictEqual(Object.keys(RANKING_WEIGHTS), [
    "originality", "human_impact", "brand_ownership", "memorability", "execution", "longevity",
  ]);
});

check("Ranking recomputes nothing", () => {
  // Every dimension is carried from the evaluator that owns it, so a position
  // can be traced to the number that decided it.
  //
  // Phase 4.0.4.1 moved three of the six to better owners — originality to the
  // matrix, memorability to the memory-pattern evaluator, execution to the
  // scalability test — so this asserts the *property* rather than the 4.0.4
  // sources it originally pinned.
  const t = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(t, insight, terms, contradiction);
  const r = IdeaRankingEngine.rank(ideas, t, {
    case_id: "t", brand: "Ao", product: "A wool coat", category: "fashion",
    audience: BRIEF.audience, human_truth: insight.human_truth, tension: insight.dynamic_tension,
    keyPhrase: terms.key,
  });
  for (const idea of r.ranked) {
    assert.strictEqual(idea.dimensions.longevity, idea.director.dimensions.longevity);
    assert.strictEqual(idea.dimensions.human_impact, idea.taste.dimensions.human_resonance);
    assert.strictEqual(idea.dimensions.brand_ownership, idea.director.dimensions.brand_ownership);
    // The three that moved in 4.0.4.1.
    assert.strictEqual(idea.dimensions.originality, (idea.originality?.score ?? 0) / 100);
    assert.strictEqual(idea.dimensions.memorability, (idea.memory?.total ?? 0) / 100);
    assert.strictEqual(idea.dimensions.execution, idea.scalability?.scalability ?? 0);
  }
});

check("Ranks are contiguous and ordered by score", () => {
  const t = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(t, insight, terms, contradiction);
  const r = IdeaRankingEngine.rank(ideas, t, { case_id: "t", human_truth: insight.human_truth });
  r.ranked.forEach((x, i) => assert.strictEqual(x.rank, i + 1));
  for (let i = 1; i < r.ranked.length; i++) {
    assert.ok(r.ranked[i - 1].score >= r.ranked[i].score, "ranked out of order");
  }
});

check("A disqualified idea is ranked, not deleted", () => {
  // Removing it would hide the comparison that explains why the winner won.
  const t = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(t, insight, terms, contradiction);
  const r = IdeaRankingEngine.rank(ideas, t, {
    case_id: "t", brand: "Ao", product: "A wool coat", human_truth: insight.human_truth,
  });
  assert.strictEqual(r.ranked.length, ideas.length, "an idea was dropped from the ranking");
  if (r.recommended) assert.strictEqual(r.recommended.disqualified_by, undefined);
});

// ── 6. Memory ─────────────────────────────────────────────────────────────
section("6. CreativeTasteMemory");

check("Two ideas from one construction reduce to one pattern", () => {
  const a = CreativeTasteMemory.patternOf("The failure was never women; it is a category where privacy costs you.");
  const b = CreativeTasteMemory.patternOf("The failure was never men; it is a category where standing costs you.");
  assert.strictEqual(a, b, `${a} !== ${b}`);
});

check("Approved and failed are tracked with reasons", () => {
  const m = new CreativeTasteMemory();
  const t = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(t, insight, terms, contradiction);
  const r = IdeaRankingEngine.rank(ideas, t, {
    case_id: "t", brand: "Ao", product: "A wool coat", human_truth: insight.human_truth,
  });
  for (const x of r.ranked) m.record({ case_id: "t", ranked: x, approved: x === r.recommended });
  assert.strictEqual(m.size(), r.ranked.length);
  assert.ok(m.failed().length === 0 || m.failed().every((e) => e.failure_reasons.length > 0),
    "a failed idea was recorded with no reason");
});

check("A pattern seen once is not reported", () => {
  // A single appearance has a success rate of 0 or 1 and neither means anything.
  const m = new CreativeTasteMemory();
  const t = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(t, insight, terms, contradiction);
  const r = IdeaRankingEngine.rank(ideas, t, { case_id: "t", human_truth: insight.human_truth });
  m.record({ case_id: "t", ranked: r.ranked[0], approved: true });
  assert.deepStrictEqual(m.patterns(), []);
});

check("The memory says it is not a learning loop", () => {
  const m = new CreativeTasteMemory();
  assert.ok(/not a learning loop/.test(m.format()));
  assert.ok(/evidence for a person/.test(m.format()));
});

// ── 7. End to end ─────────────────────────────────────────────────────────
section("7. The hundred briefs");

const run = runTasteBenchmark(cases);

check("Every brief produces a row", () => {
  assert.strictEqual(run.rows.length, 100);
  assert.strictEqual(run.rankings.length, 100);
});

check("Several ideas are generated per brief, not one", () => {
  // The point of the phase. Ranking one idea against nothing is not ranking.
  const agg = IdeaRankingEngine.aggregate(run.rankings);
  assert.ok(agg.mean_ideas_per_case >= 3, `${agg.mean_ideas_per_case} ideas per case`);
  console.log(`      ${agg.ideas_generated} ideas across 100 briefs (${agg.mean_ideas_per_case}/case)`);
});

check("Rejection is measured over everything generated, not over survivors", () => {
  // A rate computed across survivors is vacuously perfect, which is what the
  // first run of this benchmark reported.
  assert.ok(run.allStress.length > run.stressReports.length,
    "the all-ideas denominator is not larger than the survivors one");
  const all = CreativeStressTest.aggregate(run.allStress);
  const survivors = CreativeStressTest.aggregate(run.stressReports);
  assert.strictEqual(survivors.survival_rate, 1, "survivors should trivially all survive");
  assert.ok(all.survival_rate < 1, "the all-ideas rate should not be perfect");
  console.log(
    `      ${all.cases} generated · ${all.survived} survive (${(all.survival_rate * 100).toFixed(0)}%) · ` +
      `${all.brand_owned} brand-owned (${(all.brand_ownership_rate * 100).toFixed(0)}%)`
  );
});

check("Every recommended idea passes both hard stress tests", () => {
  for (const r of run.rankings) {
    if (!r.recommended) continue;
    assert.ok(!r.recommended.stress.failures.includes("REPLACE_BRAND"), r.recommended.idea);
    assert.ok(!r.recommended.stress.failures.includes("COPY"), r.recommended.idea);
  }
  console.log(`      ${run.rankings.filter((r) => r.recommended).length}/100 briefs have a recommendation`);
});

check("Recommended ideas are distinct", () => {
  const ideas = run.rows.map((r) => r.recommended).filter(Boolean) as string[];
  assert.strictEqual(new Set(ideas).size, ideas.length);
});

check("Both scales are reported and neither replaces the other", () => {
  const src = require("fs").readFileSync("lib/image-engine/run-taste-benchmark.ts", "utf-8");
  assert.ok(/TWO SCALES/.test(src));
  assert.ok(/does not replace the first/.test(src));
  const cq = run.creativeQuality;
  assert.ok(cq.length > 0, "the old rubric was not run");
  const meanCQ = cq.reduce((a, b) => a + b, 0) / cq.length;
  const taste = CreativeTasteEngine.aggregate(run.tasteScores).mean_total;
  console.log(`      old rubric ${meanCQ.toFixed(1)} · taste ${taste.toFixed(1)} — different scales`);
});

check("The memory records every idea, not only the winners", () => {
  const agg = IdeaRankingEngine.aggregate(run.rankings);
  assert.strictEqual(run.memory.size(), agg.ideas_generated);
  assert.ok(run.memory.failed().length > run.memory.approved().length,
    "most generated ideas should not be approved; a shortlist is a choice");
  console.log(`      ${run.memory.approved().length} approved · ${run.memory.failed().length} not`);
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
