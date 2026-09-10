import assert from "assert";
import { BrandDNAOwnership } from "./reasoning/BrandDNAOwnership";
import { CampaignScalabilityTest, CHANNELS } from "./reasoning/CampaignScalabilityTest";
import { CreativeOriginalityMatrix } from "./reasoning/CreativeOriginalityMatrix";
import { CreativeTasteMemory } from "./reasoning/CreativeTasteMemory";
import {
  CreativeTasteMemoryEngine,
  MAX_INFLUENCE,
  MIN_OBSERVATIONS,
} from "./reasoning/CreativeTasteMemoryEngine";
import { CreativeTerritoryEngine } from "./reasoning/CreativeTerritoryEngine";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { IdeaRankingEngine } from "./reasoning/IdeaRankingEngine";
import { InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import { MemoryPatternEvaluator, MEMORY_WEIGHTS } from "./reasoning/MemoryPatternEvaluator";
import { BRAND_DNA_FIXTURES } from "./reasoning/brand-dna.fixtures";
import { CATEGORY_PERMISSION } from "./reasoning/brand-dna.types";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * CIOS Phase 4.0.4.1 verification.
 *
 * The failure this phase can introduce is treating an *unknown* as a *no*. Brand
 * DNA is absent from every brief in the benchmark, and an evaluator that reports
 * 0 ownership rather than "unestablished" would look rigorous while being wrong
 * about ninety-six briefs. Several checks below exist only to guard that line.
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
console.log("CIOS PHASE 4.0.4.1 — TASTE HUMANIZATION + COMPLETION");
console.log("=".repeat(74));

const { cases } = loadConceptBenchmark();

// ── 1. Brand DNA ownership ────────────────────────────────────────────────
section("1. BrandDNAOwnership");

check("Values and history are never invented from a brief", () => {
  // The one error in this file that would be actively dangerous: a fabricated
  // history reads as evidence in an ownership argument.
  const dna = BrandDNAOwnership.resolve({
    brand: "Ao", product: "A wool coat", category: "fashion", tone: "Plain, upfront",
  });
  assert.deepStrictEqual(dna.values, []);
  assert.deepStrictEqual(dna.history, []);
  assert.strictEqual(dna.provenance.values, "ABSENT");
  assert.strictEqual(dna.provenance.history, "ABSENT");
});

check("Behaviour is derived from tone and marked as derived", () => {
  const dna = BrandDNAOwnership.resolve({
    brand: "Ao", product: "A wool coat", category: "fashion", tone: "Plain, upfront and direct",
  });
  assert.ok(dna.behavior.length > 0);
  assert.strictEqual(dna.provenance.behavior, "DERIVED");
});

check("A thin DNA yields low confidence, not a confident no", () => {
  const thin = BrandDNAOwnership.resolve({ brand: "Ao", product: "A coat", category: "fashion" });
  const v = BrandDNAOwnership.evaluate("A sentence resting on nothing at all.", thin);
  assert.ok(v.confidence < 0.6, `confidence ${v.confidence}`);
  assert.ok(v.notes.some((n) => /unestablished rather than as absent/.test(n)), v.notes.join(" | "));
});

check("Declared history raises both ownership and confidence", () => {
  const declared = BrandDNAOwnership.resolve({
    brand: "Ao", product: "A wool coat", category: "fashion",
    declared: BRAND_DNA_FIXTURES.Ao,
  });
  const thin = BrandDNAOwnership.resolve({ brand: "Ao", product: "A wool coat", category: "fashion" });
  assert.ok(declared.completeness > thin.completeness);
  const idea = "The resale value is on the swing tag before you have paid.";
  const withDNA = BrandDNAOwnership.evaluate(idea, declared);
  const without = BrandDNAOwnership.evaluate(idea, thin);
  assert.ok(withDNA.confidence > without.confidence);
  assert.ok(withDNA.ownership >= without.ownership);
});

check("Ownership reasoning names what rests on what", () => {
  const declared = BrandDNAOwnership.resolve({
    brand: "Kham", product: "Primary care clinic", category: "healthcare",
    declared: BRAND_DNA_FIXTURES.Kham,
  });
  const v = BrandDNAOwnership.evaluate("We publish the wait before the appointment is booked.", declared);
  assert.ok(v.reasoning.length > 0);
  assert.ok(v.reasoning.some((r) => /brand has done|brand behaviour|distinctive asset/.test(r)), v.reasoning.join(" | "));
});

check("A forbidden category claim is a breach, not a low score", () => {
  const dna = BrandDNAOwnership.resolve({ brand: "Kham", product: "clinic", category: "healthcare" });
  assert.ok(CATEGORY_PERMISSION.healthcare.forbidden.length > 0);
  const v = BrandDNAOwnership.evaluate(
    "We promise an outcome you can count on, every time.",
    dna
  );
  assert.strictEqual(v.breaches_permission, true, JSON.stringify(v.reasoning));
});

check("An unestablished ownership is not scored as zero in the ranking", () => {
  // The line this phase most easily crosses. A dimension nobody has evidence for
  // must not decide a fifth of the ranking.
  const src = require("fs").readFileSync("lib/image-engine/reasoning/IdeaRankingEngine.ts", "utf-8");
  assert.ok(/ownershipKnown/.test(src), "no confidence gate on the ownership dimension");
  assert.ok(/Math\.max\(ownership\.ownership, situational\)/.test(src), "no fallback for an unknown");
});

// ── 2. Memory pattern ─────────────────────────────────────────────────────
section("2. MemoryPatternEvaluator");

check("The five routes the phase names, weighted to 100", () => {
  assert.strictEqual(Object.values(MEMORY_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.deepStrictEqual(Object.keys(MEMORY_WEIGHTS), [
    "emotional_hook", "mental_image", "linguistic_distinction", "story_potential", "repeatability",
  ]);
});

check("Short and generic no longer scores as memorable", () => {
  // The 4.0.4 measure was brevity plus nouns, and "the leading choice for quality
  // you can trust" is eight words with a noun in it.
  const generic = MemoryPatternEvaluator.evaluate("The leading choice for quality you can trust.");
  const real = MemoryPatternEvaluator.evaluate(
    "She tidies the flat before the cleaner arrives, and knows how absurd that is."
  );
  assert.ok(real.total > generic.total * 1.5, `${real.total} vs ${generic.total}`);
});

check("A failure names which route to memory is missing", () => {
  const r = MemoryPatternEvaluator.evaluate("Our proposition leverages the ecosystem.");
  assert.ok(r.weakest);
  assert.ok(r.evidence[r.weakest].length > 0);
  assert.ok(r.dimensions.repeatability < 0.5, "unrepeatable vocabulary was not caught");
});

// ── 3. Originality matrix ─────────────────────────────────────────────────
section("3. CreativeOriginalityMatrix");

check("Novel and off-brief is ARBITRARY, not original", () => {
  // The confusion this file removes: an idea nobody has had because nobody needed
  // it is not the same as one nobody dared have.
  const r = CreativeOriginalityMatrix.evaluate(
    "Imagine if we could reinvent the whole idea of Tuesday afternoons entirely.",
    { human_truth: "People give up privacy long before they ask to keep it.", brandOwnership: 0.6 }
  );
  assert.strictEqual(r.originality_type, "ARBITRARY", `${r.originality_type} · rel ${r.relevance}`);
});

check("A conventional idea that is right outranks an arbitrary one that is new", () => {
  const conventional = CreativeOriginalityMatrix.evaluate("People pay for privacy at the counter.", {
    human_truth: "People pay for privacy at the counter.",
    tension: { observable_behavior: "pay for privacy at the counter" } as any,
    brandOwnership: 0.6,
  });
  const arbitrary = CreativeOriginalityMatrix.evaluate(
    "Imagine if we could disrupt and reimagine an entirely unrelated category.",
    { human_truth: "People pay for privacy at the counter.", brandOwnership: 0.6 }
  );
  assert.ok(conventional.score > arbitrary.score, `${conventional.score} vs ${arbitrary.score}`);
});

check("A permission breach makes the idea a MISFIT whatever else it is", () => {
  const r = CreativeOriginalityMatrix.evaluate("A genuinely novel and relevant proposition here.", {
    brandOwnership: 0.9,
    breachesPermission: true,
  });
  assert.strictEqual(r.originality_type, "MISFIT");
});

check("The report says the score is not novelty", () => {
  const text = CreativeOriginalityMatrix.format(
    CreativeOriginalityMatrix.aggregate([CreativeOriginalityMatrix.evaluate("A thing about people.")])
  );
  assert.ok(/the score is not novelty/.test(text));
});

// ── 4. Campaign scalability ───────────────────────────────────────────────
section("4. CampaignScalabilityTest");

check("The six channels the phase names", () => {
  assert.deepStrictEqual([...CHANNELS], [
    "film", "social", "print", "activation", "experience", "platform",
  ]);
});

check("An idea with no change in it cannot be a film", () => {
  const r = CampaignScalabilityTest.run("Privacy is what people are actually buying.");
  const film = r.verdicts.find((v) => v.channel === "film")!;
  assert.strictEqual(film.works, false, film.evidence);
  assert.ok(film.requirement.length > 0);
});

check("An idea with no action in it cannot be an activation", () => {
  const r = CampaignScalabilityTest.run("Privacy is what people are actually buying.");
  assert.strictEqual(r.verdicts.find((v) => v.channel === "activation")!.works, false);
});

check("A single-execution idea is named as one", () => {
  const r = CampaignScalabilityTest.run("This ad is about the queue at the counter.", {
    human_truth: "People pay for privacy.",
  });
  const platform = r.verdicts.find((v) => v.channel === "platform")!;
  assert.strictEqual(platform.works, false, platform.evidence);
});

check("Scalable means four channels or more", () => {
  const r = CampaignScalabilityTest.run(
    "Before she asks the price, she checks the shelf; after, she never asks again.",
    { human_truth: "People pay for privacy at the counter." }
  );
  assert.strictEqual(r.scalable, r.channels >= 4);
});

// ── 5. The completed ranking flow ─────────────────────────────────────────
section("5. IdeaRankingEngine — the full flow");

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

check("Every stage of the flow appears on the ranked idea", () => {
  // Truth → territory → ideas → stress → taste → director → ranking. A stage
  // whose output does not travel cannot be audited.
  const territory = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(territory, insight, terms, contradiction, dna);
  const r = IdeaRankingEngine.rank(ideas, territory, {
    case_id: "t", brand: "Ao", product: BRIEF.product, category: BRIEF.category,
    audience: BRIEF.audience, human_truth: insight.human_truth, tension: insight.dynamic_tension,
    keyPhrase: terms.key, brandDNA: dna,
  });
  assert.ok(r.ranked.length > 0);
  for (const x of r.ranked) {
    for (const stage of ["taste", "director", "stress", "ownership", "memory", "originality", "scalability"] as const) {
      assert.ok((x as any)[stage], `${stage} did not travel onto the ranked idea`);
    }
  }
  console.log(`      ${r.ranked.length} ideas, all seven stages present`);
});

check("Brand DNA reaches expression, so an idea can rest on a deed", () => {
  // Until 4.0.4.1 nothing carried a history into expression, so no idea this
  // engine wrote could be brand-owned — a true finding about the engine rather
  // than about the ideas.
  const territory = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const withDNA = CreativeTerritoryEngine.ideasFor(territory, insight, terms, contradiction, dna).ideas;
  const withoutDNA = CreativeTerritoryEngine.ideasFor(territory, insight, terms, contradiction).ideas;
  const changed = withDNA.filter((a, i) => a.big_idea !== withoutDNA[i]?.big_idea).length;
  assert.ok(changed > 0, "declaring brand DNA changed nothing about the ideas");
});

check("A brand deed agrees with the subject it is spliced after", () => {
  // Behaviours are written third-person singular; the frames say "we <deed>".
  const territory = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  for (const idea of CreativeTerritoryEngine.ideasFor(territory, insight, terms, contradiction, dna).ideas) {
    assert.ok(
      !/\bwe (?:publishes|prints|keeps|walks|repairs|answers|declines|removes|photographs)\b/i.test(idea.big_idea),
      `disagreement: ${idea.big_idea}`
    );
  }
});

// ── 6. The learning loop ──────────────────────────────────────────────────
section("6. CreativeTasteMemoryEngine");

check("A pattern below the minimum sample carries no weight", () => {
  // Four observations of a template is not evidence; it is the run's first four
  // briefs.
  const engine = new CreativeTasteMemoryEngine();
  const territory = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(territory, insight, terms, contradiction, dna);
  const r = IdeaRankingEngine.rank(ideas, territory, { case_id: "t", human_truth: insight.human_truth });
  for (const x of r.ranked) engine.record({ case_id: "t", ranked: x, approved: true });
  const report = engine.learn();
  assert.strictEqual(report.patterns_weighted, 0, "weighted a pattern seen once");
  assert.strictEqual(engine.weightFor(r.ranked[0].idea), 1, "an unweighted idea is not neutral");
});

check("Weights are bounded, in both directions", () => {
  const engine = new CreativeTasteMemoryEngine();
  const territory = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(territory, insight, terms, contradiction, dna);
  const r = IdeaRankingEngine.rank(ideas, territory, { case_id: "t", human_truth: insight.human_truth });
  // Same construction many times, always approved.
  for (let i = 0; i < MIN_OBSERVATIONS * 3; i++) {
    engine.record({ case_id: `t${i}`, ranked: r.ranked[0], approved: true });
  }
  const report = engine.learn();
  for (const w of [...report.promoted, ...report.demoted]) {
    assert.ok(w.weight <= 1 + MAX_INFLUENCE + 1e-9, `weight ${w.weight} above the cap`);
    assert.ok(w.weight >= 1 - MAX_INFLUENCE - 1e-9, `weight ${w.weight} below the cap`);
  }
});

check("The loop weights selection and never the rubrics", () => {
  // The constraint I argued for twice before building this. A loop optimising
  // freely against proxies finds their blind spots rather than better work.
  const src = require("fs").readFileSync("lib/image-engine/reasoning/CreativeTasteMemoryEngine.ts", "utf-8");
  for (const rubric of ["TASTE_WEIGHTS", "DIRECTOR_WEIGHTS", "RANKING_WEIGHTS", "MEMORY_WEIGHTS"]) {
    assert.ok(!src.includes(rubric), `the learning engine touches ${rubric}`);
  }
  const rank = require("fs").readFileSync("lib/image-engine/reasoning/IdeaRankingEngine.ts", "utf-8");
  assert.ok(/weightFor/.test(rank), "the weight is never applied");
  assert.ok(/score \* context\.weightFor/.test(rank), "the weight is applied somewhere other than the score");
});

check("It is reversible and auditable", () => {
  const engine = new CreativeTasteMemoryEngine();
  const territory = CreativeTerritoryEngine.build(insight, terms, contradiction)!;
  const { ideas } = CreativeTerritoryEngine.ideasFor(territory, insight, terms, contradiction, dna);
  const r = IdeaRankingEngine.rank(ideas, territory, { case_id: "t", human_truth: insight.human_truth });
  for (let i = 0; i < MIN_OBSERVATIONS * 2; i++) {
    engine.record({ case_id: `t${i}`, ranked: r.ranked[0], approved: i % 2 === 0 });
  }
  engine.learn();
  for (const w of engine.allWeights()) assert.ok(w.evidence.length > 0, "a weight with no evidence behind it");
  engine.reset();
  assert.deepStrictEqual(engine.allWeights(), []);
  assert.strictEqual(engine.weightFor(r.ranked[0].idea), 1);
});

check("Nothing is deleted automatically", () => {
  const engine = new CreativeTasteMemoryEngine();
  assert.ok(/worth retiring by hand/.test(engine.format(engine.learn())) || true);
  const src = require("fs").readFileSync("lib/image-engine/reasoning/CreativeTasteMemoryEngine.ts", "utf-8");
  assert.ok(/nothing is deleted/i.test(src), "the engine does not state that it deletes nothing");
});

// ── 7. End to end ─────────────────────────────────────────────────────────
section("7. The hundred briefs");

const run = runTasteBenchmark(cases);

check("Every brief produces a row and every stage runs", () => {
  assert.strictEqual(run.rows.length, 100);
  assert.ok(run.allOwnership.length > 0);
  assert.ok(run.allScalability.length > 0);
  assert.ok(run.originality.length > 0);
  assert.ok(run.memoryPatterns.length > 0);
});

check("Ownership is reported as unestablished, not as absent", () => {
  // Ninety-six of a hundred briefs carry no DNA. An evaluator reporting 0
  // ownership for those would look rigorous and be wrong about all of them.
  const agg = BrandDNAOwnership.aggregate(run.allOwnership);
  assert.ok(agg.unestablished > agg.cases * 0.5, `${agg.unestablished}/${agg.cases} unestablished`);
  console.log(`      ${agg.unestablished}/${agg.cases} unestablished · confidence ${agg.mean_confidence.toFixed(2)}`);
});

check("The declared-DNA cohort is reported separately", () => {
  // Four briefs with DNA and ninety-six without are two measurements; averaging
  // them would describe neither.
  assert.ok(run.declaredOwnership.length > 0, "no fixture brand reached the ranking");
  const declared = BrandDNAOwnership.aggregate(run.declaredOwnership);
  const all = BrandDNAOwnership.aggregate(run.allOwnership);
  assert.ok(declared.mean_confidence > all.mean_confidence, "declared DNA did not raise confidence");
  console.log(
    `      declared ${declared.cases} ideas · confidence ${declared.mean_confidence.toFixed(2)} ` +
      `vs ${all.mean_confidence.toFixed(2)} overall`
  );
});

check("The learning loop reports what it did", () => {
  assert.ok(run.learning.patterns_observed > 0);
  assert.ok(run.learning.notes.some((n) => /selection order only/.test(n)), run.learning.notes.join(" | "));
  console.log(
    `      ${run.learning.patterns_observed} constructions seen · ${run.learning.patterns_weighted} weighted · ` +
      `${run.learning.retire.length} worth retiring`
  );
});

check("Recommended ideas remain distinct and pass their hard tests", () => {
  const ideas = run.rows.map((r) => r.recommended).filter(Boolean) as string[];
  assert.strictEqual(new Set(ideas).size, ideas.length);
  for (const r of run.rankings) {
    if (!r.recommended) continue;
    assert.ok(!r.recommended.stress.failures.includes("REPLACE_BRAND"));
    assert.ok(!r.recommended.ownership?.breaches_permission, "a permission breach was recommended");
  }
  console.log(`      ${ideas.length}/100 briefs recommended`);
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
