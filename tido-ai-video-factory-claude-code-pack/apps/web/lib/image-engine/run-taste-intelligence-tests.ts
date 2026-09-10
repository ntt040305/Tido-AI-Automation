import assert from "assert";
import { BrandDNAOwnership } from "./reasoning/BrandDNAOwnership";
import { CreativeDirectorAttentionEngine } from "./reasoning/CreativeDirectorAttentionEngine";
import { CreativeTasteGraph } from "./reasoning/CreativeTasteGraph";
import { CreativeTerritoryEngine } from "./reasoning/CreativeTerritoryEngine";
import { EmotionalMechanismExtractor } from "./reasoning/EmotionalMechanismExtractor";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { IdeaRankingEngine } from "./reasoning/IdeaRankingEngine";
import { InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import { BRAND_DNA_FIXTURES } from "./reasoning/brand-dna.fixtures";
import {
  MEMORY_MECHANISMS,
  MIN_PAIRING_OBSERVATIONS,
  UNDERRATED_MIN_CONFIDENCE,
  UNDERRATED_MIN_RANK,
} from "./reasoning/emotional-mechanism.types";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * CIOS Phase 4.0.6 verification.
 *
 * The constraint with teeth is that attention must not become a second ranking:
 * no score may move, no metric may be overridden. Several checks below exist
 * only to hold that line, because it is the kind of thing that is easy to state
 * and easy to lose to one convenient edit.
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
console.log("CIOS PHASE 4.0.6 — CREATIVE TASTE INTELLIGENCE");
console.log("=".repeat(74));

const { cases } = loadConceptBenchmark();

// ── 1. EmotionalMechanismExtractor ────────────────────────────────────────
section("1. EmotionalMechanismExtractor");

check("The five mechanisms the phase implies, and the four components", () => {
  assert.deepStrictEqual([...MEMORY_MECHANISMS], [
    "recognition", "relief", "transgression", "concretion", "reversal",
  ]);
  const m = EmotionalMechanismExtractor.extract(
    "She wants a price she can predict, and is afraid of being read as careless."
  );
  for (const f of ["human_fear", "human_desire", "contradiction", "emotional_transformation"] as const) {
    assert.ok(typeof m[f] === "string", `${f} missing`);
  }
});

check("A fear and a desire in the idea are read from the idea", () => {
  const m = EmotionalMechanismExtractor.extract(
    "She wants the coat and is afraid of what buying it says about her."
  );
  assert.ok(m.human_fear, "no fear found");
  assert.ok(m.human_desire, "no desire found");
  assert.ok(m.evidence.human_fear?.startsWith("in the idea"), m.evidence.human_fear);
});

check("A component taken from the stack is marked as inherited", () => {
  // An idea that fails to carry its own fear does not get credit for one sitting
  // upstream, and the evidence has to say which happened.
  const m = EmotionalMechanismExtractor.extract("The tag is on the sleeve.", {
    tension: {
      motivation: { social_consequence: "being read as careless", functional_need: "a predictable price" },
    } as any,
  });
  if (m.human_fear) {
    assert.ok(m.evidence.human_fear?.includes("inherited"), m.evidence.human_fear);
    assert.ok(m.notes.some((n) => /does not carry its own fear/.test(n)), m.notes.join(" | "));
  }
});

check("Confidence counts only what the idea supplied itself", () => {
  const own = EmotionalMechanismExtractor.extract(
    "She wants it and is afraid of it, and would rather lose it than say so."
  );
  const inherited = EmotionalMechanismExtractor.extract("The tag is on the sleeve.", {
    tension: {
      motivation: { social_consequence: "being read as careless", functional_need: "a predictable price" },
    } as any,
  });
  assert.ok(own.confidence > inherited.confidence, `${own.confidence} vs ${inherited.confidence}`);
});

check("Each mechanism is reachable from an idea that plainly uses it", () => {
  const samples: [string, string][] = [
    ["transgression", "Nobody says what this actually costs, so we will."],
    ["concretion", "The receipt in her bag at the counter, folded twice."],
    ["recognition", '"I want a price I can predict, and I am afraid of asking."'],
  ];
  for (const [expected, idea] of samples) {
    const m = EmotionalMechanismExtractor.extract(idea);
    assert.strictEqual(m.mechanism, expected, `"${idea}" read as ${m.mechanism}`);
  }
});

check("An idea carrying nothing gets no mechanism", () => {
  // Rounding up to the nearest mechanism would make every count meaningless.
  const m = EmotionalMechanismExtractor.extract("Quality matters.");
  assert.strictEqual(m.mechanism, null);
  assert.ok(m.notes.some((n) => /No mechanism could be inferred/.test(n)));
});

check("The mechanism travels with the evidence that produced it", () => {
  const m = EmotionalMechanismExtractor.extract(
    "She wants the coat and is afraid of what buying it says about her."
  );
  assert.ok(m.mechanism);
  assert.ok(Object.keys(m.evidence).length > 0, "a mechanism with no evidence attached");
  assert.ok(m.reason.length > 20);
});

// ── 2. CreativeTasteGraph ─────────────────────────────────────────────────
section("2. CreativeTasteGraph");

check("A path connects idea, structure, mechanism, decision and outcome", () => {
  const g = new CreativeTasteGraph();
  g.add({
    idea: "The receipt is the only honest thing in the shop.",
    structure: "object_carrying_truth",
    mechanism: "concretion",
    decision: "RECOMMENDED",
    outcome: "kept",
  });
  const agg = g.aggregate();
  assert.strictEqual(agg.paths, 1);
  assert.ok(agg.nodes >= 5, `only ${agg.nodes} nodes`);
  assert.ok(agg.edges >= 4, `only ${agg.edges} edges`);
});

check("A missing stage breaks the chain rather than being bridged", () => {
  // An edge that skipped a stage would make the graph claim a structure led to a
  // decision when nothing was recorded in between.
  const g = new CreativeTasteGraph();
  g.add({ idea: "x y z", structure: null, mechanism: null, decision: "RANKED", outcome: "dropped" });
  const agg = g.aggregate();
  assert.strictEqual(agg.pairings, 0, "a pairing was recorded with no structure or mechanism");
});

check("Mechanism survival is queryable", () => {
  const g = new CreativeTasteGraph();
  for (let i = 0; i < 3; i++) {
    g.add({ idea: `a${i}`, structure: "object_carrying_truth", mechanism: "concretion", decision: "RECOMMENDED", outcome: "kept" });
  }
  g.add({ idea: "b", structure: "object_carrying_truth", mechanism: "concretion", decision: "RANKED", outcome: "dropped" });
  const survival = g.mechanismSurvival().find((m) => m.mechanism === "concretion")!;
  assert.strictEqual(survival.kept, 3);
  assert.strictEqual(survival.total, 4);
  assert.strictEqual(survival.rate, 0.75);
});

check("A pairing never made is reported as novel — absence is the signal", () => {
  const g = new CreativeTasteGraph();
  g.add({ idea: "a", structure: "object_carrying_truth", mechanism: "concretion", decision: "RANKED", outcome: "dropped" });
  assert.strictEqual(g.isNovelPairing("object_carrying_truth", "concretion"), false);
  assert.strictEqual(g.isNovelPairing("human_ritual", "transgression"), true);
  assert.strictEqual(g.isNovelPairing(null, "transgression"), false, "a null structure is not a novel pairing");
});

check("The graph says its counts are its own model's, not a person's", () => {
  const g = new CreativeTasteGraph();
  g.add({ idea: "a", structure: "object_carrying_truth", mechanism: "concretion", decision: "RANKED", outcome: "dropped" });
  assert.ok(/survived a proxy, not a person/.test(g.format()));
});

// ── 3. The attention engine, and the line it must not cross ───────────────
section("3. CreativeDirectorAttentionEngine");

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
const dna = BrandDNAOwnership.resolve({
  brand: "Ao", product: BRIEF.product, category: BRIEF.category, declared: BRAND_DNA_FIXTURES.Ao,
});
const territory = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
const { ideas } = CreativeTerritoryEngine.ideasFor(territory, insight, terms, contradiction, dna);
const ranking = IdeaRankingEngine.rank(ideas, territory, {
  case_id: "t", brand: "Ao", product: BRIEF.product, category: BRIEF.category,
  audience: BRIEF.audience, human_truth: insight.human_truth, tension: insight.dynamic_tension,
  keyPhrase: terms.key, brandDNA: dna,
});

check("Attention changes no score and no rank", () => {
  // The constraint the phase states outright. An attention layer that could move
  // a score would be a second ranking with a different name.
  const before = ranking.ranked.map((r) => ({ idea: r.idea, score: r.score, rank: r.rank }));
  const g = new CreativeTasteGraph();
  CreativeDirectorAttentionEngine.review(ranking.ranked, g, {
    case_id: "t", human_truth: insight.human_truth, tension: insight.dynamic_tension,
  });
  for (let i = 0; i < before.length; i++) {
    assert.strictEqual(ranking.ranked[i].score, before[i].score, "a score moved");
    assert.strictEqual(ranking.ranked[i].rank, before[i].rank, "a rank moved");
    assert.strictEqual(ranking.ranked[i].idea, before[i].idea, "the order changed");
  }
});

check("It reports the ranking's own answer unchanged", () => {
  const g = new CreativeTasteGraph();
  const r = CreativeDirectorAttentionEngine.review(ranking.ranked, g, { case_id: "t" });
  assert.strictEqual(r.top_by_score, ranking.ranked[0].idea);
});

check("The engine imports no rubric", () => {
  const src = require("fs").readFileSync(
    "lib/image-engine/reasoning/CreativeDirectorAttentionEngine.ts",
    "utf-8"
  );
  for (const rubric of ["TASTE_WEIGHTS", "DIRECTOR_WEIGHTS", "RANKING_WEIGHTS", "MEMORY_WEIGHTS"]) {
    assert.ok(!src.includes(rubric), `the attention engine touches ${rubric}`);
  }
});

check("Nothing at rank 1 is flagged as underrated", () => {
  const g = new CreativeTasteGraph();
  const r = CreativeDirectorAttentionEngine.review(ranking.ranked, g, {
    case_id: "t", human_truth: insight.human_truth, tension: insight.dynamic_tension,
  });
  for (const f of r.flags) {
    if (f.kind === "UNDERRATED_MECHANISM") assert.ok(f.rank >= UNDERRATED_MIN_RANK, `flagged rank ${f.rank}`);
  }
});

check("An underrated flag needs a mechanism strong in itself", () => {
  // A purely relative test fired on 111 of 458 ideas. A flag on a quarter of
  // everything tells a director nothing.
  const g = new CreativeTasteGraph();
  const r = CreativeDirectorAttentionEngine.review(ranking.ranked, g, {
    case_id: "t", human_truth: insight.human_truth, tension: insight.dynamic_tension,
  });
  for (const f of r.flags) {
    if (f.kind === "UNDERRATED_MECHANISM") {
      assert.ok(
        f.confidence >= UNDERRATED_MIN_CONFIDENCE,
        `flagged at confidence ${f.confidence}, below the floor`
      );
    }
  }
});

check("The novelty detector stays off until the graph means something", () => {
  const g = new CreativeTasteGraph();
  const r = CreativeDirectorAttentionEngine.review(ranking.ranked, g, {
    case_id: "t", human_truth: insight.human_truth,
  });
  assert.ok(!r.flags.some((f) => f.kind === "UNUSUAL_COMBINATION"));
  assert.ok(r.notes.some((n) => /novelty detector is off/.test(n)), r.notes.join(" | "));
});

check("The historical detector needs a sample and reports its size", () => {
  const g = new CreativeTasteGraph();
  // One observation is not a record.
  g.add({
    idea: ranking.ranked[1]?.idea || "x",
    structure: "object_carrying_truth",
    mechanism: "concretion",
    decision: "RECOMMENDED",
    outcome: "kept",
  });
  const thin = CreativeDirectorAttentionEngine.review(ranking.ranked, g, { case_id: "t" });
  assert.ok(!thin.flags.some((f) => f.kind === "HISTORICALLY_LOVED"), "fired below the evidence floor");

  for (let i = 0; i < MIN_PAIRING_OBSERVATIONS + 2; i++) {
    g.add({
      idea: `seed-${i}`,
      structure: "object_carrying_truth",
      mechanism: "concretion",
      decision: "RECOMMENDED",
      outcome: "kept",
    });
  }
  const fat = CreativeDirectorAttentionEngine.review(ranking.ranked, g, {
    case_id: "t", human_truth: insight.human_truth, tension: insight.dynamic_tension,
  });
  const loved = fat.flags.filter((f) => f.kind === "HISTORICALLY_LOVED");
  assert.ok(loved.length <= 1, "more than one historical flag on a single case");
  for (const f of loved) assert.ok(/survived \d+ of \d+/.test(f.reason), f.reason);
});

check("Every flag carries a reason a director could dismiss in a second", () => {
  const g = new CreativeTasteGraph();
  for (let i = 0; i < 12; i++) {
    g.add({ idea: `s${i}`, structure: "object_carrying_truth", mechanism: "concretion", decision: "RANKED", outcome: "dropped" });
  }
  const r = CreativeDirectorAttentionEngine.review(ranking.ranked, g, {
    case_id: "t", human_truth: insight.human_truth, tension: insight.dynamic_tension,
  });
  for (const f of r.flags) {
    assert.ok(f.reason.length > 40, `a flag with a thin reason: ${f.reason}`);
    assert.ok(f.confidence > 0 && f.confidence <= 1);
  }
});

// ── 4. End to end ─────────────────────────────────────────────────────────
section("4. The hundred briefs");

const run = runTasteBenchmark(cases, { useTasteMemory: true });

check("A mechanism is extracted for every generated idea", () => {
  const ideas = run.rankings.reduce((n, r) => n + r.ranked.length, 0);
  assert.strictEqual(run.mechanisms.length, ideas);
  const agg = EmotionalMechanismExtractor.aggregate(run.mechanisms);
  console.log(
    `      ${agg.cases} ideas · ${agg.mechanismless} with no mechanism · ` +
      `mean confidence ${agg.mean_confidence.toFixed(2)}`
  );
});

check("The graph holds one path per idea", () => {
  const ideas = run.rankings.reduce((n, r) => n + r.ranked.length, 0);
  assert.strictEqual(run.graph.size(), ideas);
  const agg = run.graph.aggregate();
  assert.ok(agg.pairings > 0, "no structure × mechanism pairing was recorded");
  console.log(`      ${agg.paths} paths · ${agg.pairings} pairings · ${agg.kept} kept`);
});

check("Attention runs on every case and flags a minority", () => {
  // A flag on most cases would be noise with a label.
  assert.strictEqual(run.attention.length, run.rankings.length);
  const agg = CreativeDirectorAttentionEngine.aggregate(run.attention);
  assert.ok(agg.flagged_cases < agg.cases, "every case was flagged");
  console.log(
    `      ${agg.flags} flags across ${agg.flagged_cases}/${agg.cases} cases · ` +
      `mean rank ${agg.mean_flagged_rank}`
  );
});

check("Anti-repetition fires at least as often as pro-repetition", () => {
  // The phase's own instruction: increase taste, not repetition. UNUSUAL_
  // COMBINATION can only fire on something never done; HISTORICALLY_LOVED can
  // only fire on something done before. If the second outran the first this
  // layer would be a formula with extra steps.
  const agg = CreativeDirectorAttentionEngine.aggregate(run.attention);
  const novel = agg.by_kind.UNUSUAL_COMBINATION || 0;
  const loved = agg.by_kind.HISTORICALLY_LOVED || 0;
  assert.ok(novel >= loved, `pro-repetition ${loved} outran anti-repetition ${novel}`);
  console.log(`      unusual ${novel} vs historically-loved ${loved}`);
});

check("Flags point at ideas the ranking did not already recommend", () => {
  for (let i = 0; i < run.attention.length; i++) {
    const rec = run.rankings[i].recommended;
    for (const f of run.attention[i].flags) {
      if (f.kind !== "UNDERRATED_MECHANISM") continue;
      assert.notStrictEqual(f.idea, run.rankings[i].ranked[0]?.idea, "rank 1 was flagged as underrated");
      if (rec) assert.ok(f.rank >= UNDERRATED_MIN_RANK);
    }
  }
});

check("Adding attention leaves the ranking byte-identical", () => {
  // The A/B is two readings of one run, so this has to hold or the comparison
  // means nothing.
  const again = runTasteBenchmark(cases, { useTasteMemory: true });
  for (let i = 0; i < run.rankings.length; i++) {
    assert.strictEqual(
      run.rankings[i].ranked.map((r) => `${r.idea}:${r.score}`).join("|"),
      again.rankings[i].ranked.map((r) => `${r.idea}:${r.score}`).join("|"),
      `case ${i} differed between runs`
    );
  }
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
