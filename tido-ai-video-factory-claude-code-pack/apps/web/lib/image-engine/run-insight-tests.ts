import assert from "assert";
import { CreativeExpressionLayer } from "./reasoning/CreativeExpressionLayer";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanInsightQualityGate, DEFAULT_INSIGHT_THRESHOLDS } from "./reasoning/HumanInsightQualityGate";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { InsightDiversityController } from "./reasoning/InsightDiversityController";
import { ARCHETYPES } from "./reasoning/human-insight.archetypes";
import {
  CREATIVE_LENSES,
  INSIGHT_LADDER,
  INSIGHT_QUALITY_METHOD,
  INSIGHT_QUALITY_WEIGHTS,
  HumanInsight,
} from "./reasoning/human-insight.types";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runInsightBenchmark } from "./run-insight-benchmark";

/**
 * CIOS Phase 4.0.3 verification.
 *
 * Weighted towards the two ways this layer can lie: by inventing a rung it could
 * not derive, and by scoring itself on a metric that rewards returning the brief.
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
console.log("CIOS PHASE 4.0.3 — HUMAN INSIGHT DEPTH UPGRADE (ladder per 4.0.3.6)");
console.log("=".repeat(74));

const { cases } = loadConceptBenchmark();

const AGEING = {
  challenge: "Mature buyers reject correction language because it frames the face they have now as a defect to be undone.",
  audience: "Affluent women 45 plus",
  product: "Fermented rice cream",
  category: "beauty",
  objective: "Rebranding",
};

// ── 1. The ladder ─────────────────────────────────────────────────────────
section("1. HumanTensionAnalyzer — the seven-rung ladder");

check("Seven rungs, in the order Phase 4.0.3.6 specifies", () => {
  assert.deepStrictEqual(
    [...INSIGHT_LADDER],
    ["observed_reality", "behavior", "hidden_emotion", "identity_conflict",
     "social_fear", "human_truth", "creative_opportunity"]
  );
  const a = HumanTensionAnalyzer.analyze(AGEING);
  assert.deepStrictEqual(a.ladder.map((r) => r.step), [...INSIGHT_LADDER]);
});

check("Rung one is the brief's own words, unchanged", () => {
  // The anchor. Phase 4.0.2 retrieved a tension and got one about a different
  // problem on 77 of 100 briefs; a ladder that starts from the brief cannot.
  const a = HumanTensionAnalyzer.analyze(AGEING);
  assert.strictEqual(a.ladder[0].statement, AGEING.challenge);
});

check("Each rung transforms rather than restates the one above", () => {
  const a = HumanTensionAnalyzer.analyze(AGEING);
  for (let i = 1; i < a.ladder.length; i++) {
    assert.notStrictEqual(a.ladder[i].statement, a.ladder[i - 1].statement, `rung ${i} repeats rung ${i - 1}`);
  }
});

check("An unclassifiable brief truncates instead of inventing rungs", () => {
  // The failure mode this phase exists to remove: confident output over material
  // that does not support it.
  const a = HumanTensionAnalyzer.analyze({
    challenge: "Zzzq wibble frobnicate quux.",
    audience: "people", product: "a thing",
  });
  assert.strictEqual(a.matched, false);
  assert.ok(a.truncated_at, "an unmatched brief must report where it stopped");
  assert.ok(a.ladder.length < INSIGHT_LADDER.length, "an unmatched brief must not reach every rung");
  assert.ok(a.warnings.some((w) => /NO_ARCHETYPE/.test(w)), a.warnings.join(" | "));
});

check("An empty challenge yields no ladder at all", () => {
  const a = HumanTensionAnalyzer.analyze({ challenge: "", audience: "people", product: "a thing" });
  assert.deepStrictEqual(a.ladder, []);
  assert.ok(a.warnings.some((w) => /NO_CHALLENGE/.test(w)));
});

check("Classification declines rather than forcing the nearest fit", () => {
  assert.strictEqual(HumanTensionAnalyzer.classify("Zzzq wibble frobnicate quux."), null);
  assert.ok(HumanTensionAnalyzer.classify(AGEING.challenge));
});

check("Archetype ids are unique and every field is populated", () => {
  const ids = new Set(ARCHETYPES.map((a) => a.id));
  assert.strictEqual(ids.size, ARCHETYPES.length, "duplicate archetype id");
  const t = HumanTensionAnalyzer.terms(AGEING);
  for (const a of ARCHETYPES) {
    if (a.id === "EXECUTIONAL_CONSTRAINT") continue; // deliberately supplies no truth
    for (const f of ["functional", "emotional", "hidden", "social", "desire", "truth", "mechanism"] as const) {
      assert.ok(String(a[f](t) || "").trim(), `${a.id}.${f} is empty`);
    }
    const c = a.conflict(t);
    assert.ok(c.wants && c.but, `${a.id}.conflict has an empty pole`);
  }
  console.log(`      ${ARCHETYPES.length} archetypes`);
});

check("A production constraint is classified in order to be declined", () => {
  // "A required warning and a full ingredient list compete with the message for
  // the same small panel" is a real problem and not a human tension. Inventing a
  // feeling about panel size is exactly the output this phase removes.
  const a = HumanTensionAnalyzer.analyze({
    challenge: "A required warning and a full ingredient list compete with the message for the same small panel.",
    audience: "shoppers", product: "a serum",
  });
  assert.strictEqual(a.archetype, "EXECUTIONAL_CONSTRAINT");
  assert.strictEqual(a.truncated_at, "human_truth", "it must stop at the truth, not produce one");
});

// ── 2. The insight ────────────────────────────────────────────────────────
section("2. HumanInsightGenerator — the four outputs");

check("All four fields are produced for a classified brief", () => {
  const i = HumanInsightGenerator.generate(AGEING);
  for (const f of ["human_truth", "consumer_insight", "why_people_feel_this", "why_now"] as const) {
    assert.ok(String(i[f] || "").trim(), `${f} is empty`);
  }
});

check("The truth and the consumer insight are not the same sentence", () => {
  // The truth generalises; the insight brings this brief back in. Where the two
  // are identical one of them is doing no work.
  const i = HumanInsightGenerator.generate(AGEING);
  assert.notStrictEqual(i.human_truth, i.consumer_insight);
  assert.ok(i.consumer_insight.length > 30);
});

check("why_people_feel_this states a mechanism, not a restatement", () => {
  const i = HumanInsightGenerator.generate(AGEING);
  assert.notStrictEqual(i.why_people_feel_this, i.human_truth);
  assert.ok(i.why_people_feel_this.length > 40);
});

check("why_now says the truth is standing rather than inventing an occasion", () => {
  // The field most likely to be filled with a fabricated trend, because anything
  // reads better there than nothing.
  const i = HumanInsightGenerator.generate({
    challenge: "She has been promised the same result by nine brands and cannot verify any of them.",
    audience: "women", product: "a serum", objective: "",
  });
  assert.ok(/standing|business decision/i.test(i.why_now), i.why_now);
  assert.ok(i.warnings.some((w) => /NO_TRIGGER/.test(w)), i.warnings.join(" | "));
});

check("A reported change in the brief is what makes why_now live", () => {
  const i = HumanInsightGenerator.generate({
    challenge: "Her size has changed and every brand she trusted now feels like it is for someone else.",
    audience: "women", product: "a dress",
  });
  assert.ok(/live for this audience now/i.test(i.why_now), i.why_now);
});

check("Shallow propositions are detected, not scored", () => {
  // "customers want quality" is rejected because the sentence survives replacing
  // its audience and its category, not because "quality" is a banned word.
  const shallow: HumanInsight = {
    human_truth: "Customers want quality and people need convenience.",
    consumer_insight: "x", why_people_feel_this: "y", why_now: "z",
    ladder: [], archetype: "NONE", warnings: [],
  };
  const hits = HumanInsightGenerator.shallowHits(shallow);
  assert.ok(hits.length >= 2, `expected both propositions, got ${JSON.stringify(hits)}`);
  assert.strictEqual(HumanInsightGenerator.isUsable(shallow), false);
});

check("Not one of the hundred briefs produces a shallow insight", () => {
  let shallow = 0;
  for (const c of cases) {
    const i = HumanInsightGenerator.generate({
      challenge: c.creative_challenge,
      audience: c.brief.audience || "",
      product: c.brief.product || "",
      category: c.industry,
      objective: c.brief.objective,
    });
    if (HumanInsightGenerator.shallowHits(i).length) shallow++;
  }
  assert.strictEqual(shallow, 0, `${shallow} shallow insights`);
});

check("Subject and verb agree", () => {
  // "Women 30 to 45" reduced to "Women to", which then took a verb: "Women to
  // wants a reason to prefer one option over another".
  for (const audience of ["Women 30 to 45 who buy premium skincare", "Affluent women 45 plus", "Men new to skincare", "Adults delaying a visit"]) {
    const i = HumanInsightGenerator.generate({ ...AGEING, audience });
    const conflict = HumanTensionAnalyzer.at(i.ladder, "identity_conflict")?.statement || "";
    assert.ok(!/\b(?:to|plus|and|over|under)\s+(?:wants|has|is|does)\b/i.test(conflict), `debris took a verb: ${conflict}`);
    assert.ok(!/\b(?:women|men|buyers|adults|people)\s+(?:wants|has|is|does)\b/i.test(conflict), `plural subject, singular verb: ${conflict}`);
  }
});

// ── 3. The quality gate ───────────────────────────────────────────────────
section("3. HumanInsightQualityGate");

check("The rubric weights to 100 across the five required dimensions", () => {
  assert.deepStrictEqual(INSIGHT_QUALITY_WEIGHTS, {
    depth: 25, tension: 25, universality: 20, specificity: 15, strategic_relevance: 15,
  });
  assert.strictEqual(Object.values(INSIGHT_QUALITY_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

check("Every dimension is declared a proxy", () => {
  // A change of posture from 4.0.1.5, which called two lexical-overlap measures
  // MEASURED. Nothing here establishes that an insight is true.
  for (const v of Object.values(INSIGHT_QUALITY_METHOD)) assert.strictEqual(v, "PROXY");
  const agg = HumanInsightQualityGate.aggregate([
    HumanInsightQualityGate.score("t", HumanInsightGenerator.generate(AGEING), AGEING),
  ]);
  assert.ok(/every dimension above is a proxy/.test(HumanInsightQualityGate.format(agg)));
});

check("A shallow insight is REJECTED regardless of its total", () => {
  const shallow: HumanInsight = {
    human_truth: "Customers want quality.",
    consumer_insight: "People need convenience in their journey.",
    why_people_feel_this: "Because they do.", why_now: "Now.",
    ladder: [], archetype: "NONE", warnings: [],
  };
  const r = HumanInsightQualityGate.evaluate("t", shallow, AGEING);
  assert.strictEqual(r.verdict, "REJECTED");
  assert.ok(r.reasons.some((x) => /Shallow/.test(x)), r.reasons.join(" | "));
});

check("A truth that names the brand's own product loses universality", () => {
  // A truth that only holds for this product is a product claim wearing a
  // truth's clothes.
  const claim: HumanInsight = {
    human_truth: "Fermented rice cream buyers deserve fermented rice cream that respects them.",
    consumer_insight: "x", why_people_feel_this: "y", why_now: "z",
    ladder: [], archetype: "NONE", warnings: [],
  };
  const s = HumanInsightQualityGate.score("t", claim, AGEING);
  assert.ok(s.dimensions.universality < 0.8, `universality ${s.dimensions.universality}`);
  assert.ok(s.notes.some((n) => /claim rather than a truth/.test(n)), s.notes.join(" | "));
});

check("A real insight scores above the floor on universality and depth", () => {
  const s = HumanInsightQualityGate.score("t", HumanInsightGenerator.generate(AGEING), AGEING);
  assert.ok(s.dimensions.universality >= DEFAULT_INSIGHT_THRESHOLDS.universality, `universality ${s.dimensions.universality}`);
  assert.ok(s.dimensions.depth >= DEFAULT_INSIGHT_THRESHOLDS.depth, `depth ${s.dimensions.depth}`);
});

check("A truncated ladder cannot pass on total alone", () => {
  const stub = HumanInsightGenerator.generate({
    challenge: "Zzzq wibble frobnicate quux.", audience: "people", product: "a thing",
  });
  const r = HumanInsightQualityGate.evaluate("t", stub, { audience: "people", product: "a thing" });
  assert.strictEqual(r.verdict, "REJECTED");
  assert.ok(r.reasons.some((x) => /depth/.test(x)), r.reasons.join(" | "));
});

// ── 4. Expression ─────────────────────────────────────────────────────────
section("4. CreativeExpressionLayer — six lenses over one insight");

check("All six lenses are defined and distinct", () => {
  assert.strictEqual(new Set(CREATIVE_LENSES).size, 6);
  assert.deepStrictEqual([...CREATIVE_LENSES], [
    "emotional_reversal", "cultural_observation", "unexpected_truth",
    "human_confession", "symbolic_metaphor", "provocative_statement",
  ]);
});

check("One insight yields several distinct expressions of the same truth", () => {
  const i = HumanInsightGenerator.generate(AGEING);
  const t = HumanTensionAnalyzer.terms(AGEING);
  const e = CreativeExpressionLayer.express(i, t);
  assert.ok(e.length >= 4, `only ${e.length} lenses available`);
  assert.strictEqual(new Set(e.map((x) => x.big_idea)).size, e.length, "two lenses produced the same sentence");
  // The insight is unchanged by how it is expressed. That is the separation.
  for (const x of e) assert.strictEqual(x.human_truth, i.human_truth);
  console.log(`      ${e.length} lenses: ${e.map((x) => x.lens).join(", ")}`);
});

check("The expression layer cannot alter the insight", () => {
  const i = HumanInsightGenerator.generate(AGEING);
  const before = JSON.stringify(i);
  CreativeExpressionLayer.express(i, HumanTensionAnalyzer.terms(AGEING));
  assert.strictEqual(JSON.stringify(i), before, "express() mutated the insight");
});

check("No expression is produced without a truth to express", () => {
  const stub = HumanInsightGenerator.generate({
    challenge: "Zzzq wibble frobnicate quux.", audience: "people", product: "a thing",
  });
  assert.deepStrictEqual(CreativeExpressionLayer.express(stub, HumanTensionAnalyzer.terms(AGEING)), []);
});

check("A lens whose material is missing is skipped, not filled", () => {
  const noKey = HumanTensionAnalyzer.terms({ ...AGEING, challenge: "She cannot decide." });
  const i = HumanInsightGenerator.generate(AGEING);
  const lenses = CreativeExpressionLayer.express(i, { ...noKey, key: "" }).map((e) => e.lens);
  assert.ok(!lenses.includes("symbolic_metaphor"), "a metaphor was produced with nothing concrete to carry it");
});

check("The idea never states its own business objective", () => {
  // A big idea that names the objective is a brief. The connection belongs on
  // the strategic reason, which is where it is scored.
  const i = HumanInsightGenerator.generate(AGEING);
  const t = HumanTensionAnalyzer.terms(AGEING);
  for (const e of CreativeExpressionLayer.express(i, t)) {
    assert.ok(!/in service of/i.test(e.big_idea), `objective leaked into the idea: ${e.big_idea}`);
    assert.ok(/in service of/i.test(e.strategic_reason), `strategic reason states no objective: ${e.strategic_reason}`);
  }
});

check("An expression is briefable: neither a fragment nor a paragraph", () => {
  const i = HumanInsightGenerator.generate(AGEING);
  for (const e of CreativeExpressionLayer.express(i, HumanTensionAnalyzer.terms(AGEING))) {
    const n = e.big_idea.split(/\s+/).length;
    assert.ok(n >= 6 && n <= 30, `${n} words: ${e.big_idea}`);
  }
});

// ── 5. Insight diversity ──────────────────────────────────────────────────
section("5. InsightDiversityController");

const mkInsight = (truth: string, conflict: string, pressure: string, archetype = "A"): HumanInsight => ({
  human_truth: truth,
  consumer_insight: "x", why_people_feel_this: "y", why_now: "z",
  archetype,
  ladder: [
    { step: "identity_conflict", statement: conflict, derivation: "", evidence: [], specificity: 0.5 },
    { step: "social_fear", statement: pressure, derivation: "", evidence: [], specificity: 0.5 },
  ],
  warnings: [],
});

check("Truths, conflicts and social pressures are tracked separately", () => {
  const d = new InsightDiversityController();
  d.record(mkInsight("People forgo what they want rather than be seen wanting it", "C1", "P1"));
  d.record(mkInsight("People blame themselves for a poor fit before blaming the fit", "C2", "P2"));
  const m = d.metrics();
  assert.strictEqual(m.distinct_truths, 2);
  assert.strictEqual(m.distinct_conflicts, 2);
  assert.strictEqual(m.distinct_pressures, 2);
});

check("A repeated human truth is suppressed outright", () => {
  // Two campaigns resting on the same truth are one campaign run twice — which
  // idea-level diversity cannot see, because the lenses dress it six ways.
  const d = new InsightDiversityController();
  const truth = "People forgo what they want rather than be seen wanting it";
  d.record(mkInsight(truth, "C1", "P1"));
  const again = d.assess(mkInsight(truth, "C2", "P2"));
  assert.strictEqual(again.allowed, false);
  assert.strictEqual(again.repetition_penalty, 1);
  assert.ok(again.duplicate_of);
});

check("A repeated conflict is penalised rather than forbidden", () => {
  // Forbidding it would force a worse-fitting archetype onto a brief that
  // genuinely matches — trading a diversity number for a wrong insight.
  const d = new InsightDiversityController();
  d.record(mkInsight("Truth one about people and what they do", "Shared conflict", "P1"));
  const r = d.assess(mkInsight("A wholly different statement about how people behave", "Shared conflict", "P2"));
  assert.strictEqual(r.allowed, true);
  assert.ok(r.repetition_penalty > 0, "a repeat must cost something");
  assert.ok(/conflict/.test(r.reason || ""), r.reason);
});

check("A saturated archetype is penalised", () => {
  const d = new InsightDiversityController();
  for (let i = 0; i < 6; i++) d.record(mkInsight(`Distinct truth number ${i} about people`, `C${i}`, `P${i}`, "SAME"));
  const r = d.assess(mkInsight("Yet another distinct statement about people", "Cx", "Px", "SAME"));
  assert.ok(r.repetition_penalty > 0, "archetype saturation was not penalised");
  assert.ok(/SAME/.test(r.reason || ""), r.reason);
});

// ── 6. End to end ─────────────────────────────────────────────────────────
section("6. The hundred briefs");

const run = runInsightBenchmark(cases);

check("Every brief produces a result and none crashes", () => {
  assert.strictEqual(run.rows.length, 100);
});

check("Most briefs classify, and the rest say so", () => {
  const matched = run.rows.filter((r) => r.matched_archetype).length;
  assert.ok(matched >= 90, `only ${matched}/100 classified`);
  for (const r of run.rows) {
    if (!r.matched_archetype) assert.ok(r.truncated_at, `${r.case_id} neither matched nor reported a truncation`);
  }
  console.log(`      ${matched}/100 classified`);
});

check("A brief that produced no truth produced no idea either", () => {
  // The failure this whole phase is aimed at: confident output over material
  // that does not support it.
  for (const r of run.rows) {
    if (!r.human_truth) assert.strictEqual(r.big_idea, "", `${r.case_id} produced an idea with no truth behind it`);
  }
});

check("Delivered ideas are distinct", () => {
  const ideas = run.rows.map((r) => r.big_idea).filter(Boolean);
  assert.strictEqual(new Set(ideas).size, ideas.length, "a delivered idea was repeated");
  console.log(`      ${ideas.length} ideas, all distinct`);
});

check("The old combination engine never rewrites a lens expression", () => {
  // `CreativeQualityGate.evaluate` refines through `CreativeCombinationEngine`,
  // and allowing it to substitute produced splices like "Make people will forgo
  // something they want rather than be seen wanting it the whole point rather
  // than a detail" on 43 of 100 cases.
  const TELLS = /the whole point rather than a detail|and say so knowing this|Refuse .+, and offer .+ instead|Make this the reason to choose/i;
  const spliced = run.rows.filter((r) => TELLS.test(r.big_idea));
  assert.deepStrictEqual(spliced.map((r) => r.case_id), [], "old-engine templates reached the delivered idea");
});

check("Insight quality clears the gate on most briefs", () => {
  const agg = HumanInsightQualityGate.aggregate(run.insightScores.map((s) => s.score));
  assert.ok(agg.mean_total > 65, `insight mean ${agg.mean_total}`);
  assert.strictEqual(agg.shallow_cases, 0);
  console.log(`      insight quality ${agg.mean_total.toFixed(1)}/100, ${run.insightScores.filter((s) => s.verdict === "PASS").length} passing`);
});

check("WRONG_SUBJECT has largely gone", () => {
  // 4.0.2 measured 78 of 100. A ladder that starts from the brief cannot be
  // about a different problem, and this is the check that it stays that way.
  const wrong = run.rows.filter((r) => r.adversarial.attacks.some((a) => a.kind === "WRONG_SUBJECT")).length;
  assert.ok(wrong <= 20, `WRONG_SUBJECT on ${wrong}/100 (4.0.2 baseline was 78)`);
  console.log(`      WRONG_SUBJECT ${wrong}/100, was 78`);
});

check("The reported metric is not the one selection optimises", () => {
  // Picking the highest-scoring lens collapsed 50 of 93 cases onto one lens and
  // halved emotional_power. Selection is by originality and diversity; the
  // rubric only reports.
  const src = require("fs").readFileSync("lib/image-engine/run-insight-benchmark.ts", "utf-8");
  const selectionBlock = src.slice(src.indexOf("const expression ="), src.indexOf("const synthInput"));
  assert.ok(!/CreativeQualityBenchmark\.score/.test(selectionBlock), "selection reads the rubric it is scored by");
});

check("The metric-sensitivity control is reported", () => {
  // Feeding the brief's own problem back as the tension scores highest of all
  // and is not an insight. Any target on this metric is reachable by regressing
  // toward that row, so the row is printed on every run.
  assert.ok(run.sensitivity.observed_reality > run.sensitivity.identity_conflict,
    "the control should out-score every derived rung; if not, re-check the premise");
  console.log(
    `      control (brief fed back) ${run.sensitivity.observed_reality.toFixed(1)}/25 ` +
      `vs derived ${run.sensitivity.identity_conflict.toFixed(1)}/25`
  );
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
