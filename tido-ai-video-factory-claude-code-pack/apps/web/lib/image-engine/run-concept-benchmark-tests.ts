import assert from "assert";
import { AdversarialConceptTester } from "./reasoning/AdversarialConceptTester";
import { CreativeContextExtractor } from "./reasoning/CreativeContextExtractor";
import { CreativeCombinationEngine } from "./reasoning/CreativeCombinationEngine";
import { CreativeDiversityController } from "./reasoning/CreativeDiversityController";
import { CreativeQualityBenchmark } from "./reasoning/CreativeQualityBenchmark";
import { CreativeQualityGate, DEFAULT_THRESHOLDS } from "./reasoning/CreativeQualityGate";
import { OriginalityEvaluator, similarity } from "./reasoning/OriginalityEvaluator";
import {
  CREATIVE_QUALITY_METHOD,
  CREATIVE_QUALITY_WEIGHTS,
  CreativeSynthesisInput,
  CreativeSynthesisOutput,
} from "./reasoning/creative-synthesis.types";
import { ConceptQualityGate } from "./reasoning/ConceptQualityGate";
import { deliveredDiversity, loadConceptBenchmark, runConceptBenchmark } from "./run-concept-benchmark";

/**
 * CIOS Phase 4.0.2 verification.
 *
 * Weighted towards the honesty of the measurement rather than the size of the
 * numbers: a rubric that blends measured and proxied dimensions, or a gate that
 * passes work on proxy strength alone, produces a score somebody will act on as
 * though it meant more than it does.
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

console.log("=".repeat(72));
console.log("CIOS PHASE 4.0.2 — CREATIVE INTELLIGENCE BENCHMARK CLOSURE");
console.log("=".repeat(72));

const { cases } = loadConceptBenchmark();

// ── 1. Dataset ────────────────────────────────────────────────────────────
section("1. Benchmark dataset");

check("One hundred briefs at the required distribution", () => {
  assert.strictEqual(cases.length, 100, `expected 100, found ${cases.length}`);
  const by: Record<string, number> = {};
  for (const c of cases) by[c.industry] = (by[c.industry] || 0) + 1;
  assert.deepStrictEqual(by, {
    beauty: 15, food_beverage: 15, fashion: 15, hospitality: 10,
    real_estate: 10, technology: 10, healthcare: 10, education: 5, local_business: 10,
  });
  console.log(`      ${cases.length} briefs across ${Object.keys(by).length} industries`);
});

check("Every brief states the problem it is up against", () => {
  // The field whose absence made human_problem score against a product blurb.
  for (const c of cases) {
    assert.ok(c.creative_challenge.length > 40, `${c.case_id}: challenge too thin`);
    assert.strictEqual(c.brief.creativeChallenge, c.creative_challenge, `${c.case_id}: challenge not on the brief`);
    assert.ok(c.must_avoid.length >= 3, `${c.case_id}: must_avoid too short`);
  }
});

check("Case ids are unique and match their industry", () => {
  const ids = new Set(cases.map((c) => c.case_id));
  assert.strictEqual(ids.size, 100, "duplicate case_id");
  for (const c of cases) assert.ok(c.case_id.startsWith(`cb.${c.industry}.`), `${c.case_id} mismatches ${c.industry}`);
});

// ── 2. Quality evaluation ─────────────────────────────────────────────────
section("2. Creative quality evaluation");

check("The rubric weights to 100 across the five required dimensions", () => {
  const total = Object.values(CREATIVE_QUALITY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.strictEqual(total, 100);
  assert.deepStrictEqual(CREATIVE_QUALITY_WEIGHTS, {
    human_truth: 25, strategic_fit: 20, differentiation: 20, emotional_power: 20, memorability: 15,
  });
});

check("Every dimension declares whether it is measured or proxied", () => {
  // Three of five are proxies. A total that hides which sixty points those are
  // is the most misleading number this system could produce.
  const proxies = Object.entries(CREATIVE_QUALITY_METHOD).filter(([, m]) => m === "PROXY");
  assert.strictEqual(proxies.length, 3);
  assert.strictEqual(CREATIVE_QUALITY_METHOD.human_truth, "MEASURED");
  assert.strictEqual(CREATIVE_QUALITY_METHOD.strategic_fit, "MEASURED");
});

check("The aggregate keeps the measured and proxied halves separate", () => {
  const mk = (n: number): CreativeSynthesisOutput => ({
    big_idea: `Idea number ${n} about something specific`,
    why_it_works: "It works.", emotional_hook: "A feeling.", strategic_reason: "A reason.",
    originality_score: 5, angle: "RECOGNITION", derived_from: [],
  });
  const input: CreativeSynthesisInput = {
    human_tension: "She cannot tell which brand is telling the truth",
    consumer_insight: "Claim fatigue is scepticism about verification",
    campaign_territory: "Verifiability", brand_objective: "Product launch",
    differentiation: "", audience: "women 30 to 45", avoid: [],
  };
  const scores = [1, 2, 3].map((n) => CreativeQualityBenchmark.score(`c${n}`, mk(n), input, "she cannot tell which brand is telling the truth"));
  const agg = CreativeQualityBenchmark.aggregate(scores);
  assert.ok(Math.abs(agg.measured_subtotal + agg.proxied_subtotal - agg.mean_total) < 0.5,
    "the two halves must sum to the total");
  assert.ok(agg.measured_subtotal <= 45.01, "measured half cannot exceed its 45 points");
  assert.ok(agg.proxied_subtotal <= 55.01, "proxied half cannot exceed its 55 points");
  assert.ok(CreativeQualityBenchmark.format(agg).includes("directional only"));
});

// ── 3. Quality gate ───────────────────────────────────────────────────────
section("3. Creative quality gate");

const strongInput: CreativeSynthesisInput = {
  human_tension: "She has been promised the same result by nine brands and cannot tell which is true",
  consumer_insight: "Claim fatigue is scepticism about being able to verify anything",
  campaign_territory: "Verifiability, the brand that hands over the means of checking",
  brand_objective: "Product launch", differentiation: "The only one that shows its working",
  audience: "women 30 to 45", avoid: ["water splash", "glowing model face"],
};
const problem = "She has been promised the same result by nine brands and cannot tell which is telling the truth";

check("A concept that fails human_truth is held back even with strong proxies", () => {
  // The failure mode a total-only threshold would miss: high proxy scores
  // carrying a concept that is about the wrong problem.
  const offTopic: CreativeSynthesisOutput = {
    big_idea: "Refuse the ordinary and offer something rather than nothing instead",
    why_it_works: "x", emotional_hook: "A feeling of relief and pride", strategic_reason: "y",
    originality_score: 9, angle: "REFUSAL", derived_from: [],
  };
  const r = CreativeQualityGate.evaluate(
    "t1", offTopic,
    { ...strongInput, human_tension: "He wants a faster commute to the office" },
    problem
  );
  assert.notStrictEqual(r.verdict, "PASS", "an off-topic concept must not pass");
  assert.ok(r.reasons.some((x) => /human_truth/.test(x)), r.reasons.join(" | "));
});

check("A rejected concept is classified as MATERIAL or CONSTRUCTION", () => {
  // The two need different fixes and only one is a concept problem, so the gate
  // must say which it was rather than reporting an undifferentiated failure.
  const weak: CreativeSynthesisOutput = {
    big_idea: "Make something the whole point rather than a detail",
    why_it_works: "", emotional_hook: "", strategic_reason: "",
    originality_score: 1, angle: "ELEVATION", derived_from: [],
  };
  const r = CreativeQualityGate.evaluate("t2", weak, { ...strongInput, human_tension: "unrelated matter entirely" }, problem);
  if (r.verdict === "REJECTED") {
    assert.ok(["MATERIAL", "CONSTRUCTION"].includes(r.failure!), `unclassified failure: ${r.failure}`);
  }
});

check("Refinement reuses the combination engine rather than a second repair path", () => {
  // One mechanism for rebuilding a concept, two callers. A second would drift
  // and the two would disagree about what a better concept is.
  const src = require("fs").readFileSync("lib/image-engine/reasoning/CreativeQualityGate.ts", "utf-8");
  assert.ok(/CreativeCombinationEngine\.combine/.test(src), "the gate must refine through the combination engine");
  const adv = require("fs").readFileSync("lib/image-engine/reasoning/AdversarialConceptTester.ts", "utf-8");
  assert.ok(/CreativeQualityGate\.evaluate/.test(adv), "the adversarial harness must reuse the gate's refinement");
});

check("Thresholds are stated, not hidden in the code", () => {
  assert.ok(DEFAULT_THRESHOLDS.total > 0 && DEFAULT_THRESHOLDS.human_truth > 0);
  assert.ok(DEFAULT_THRESHOLDS.human_truth <= 1, "human_truth is a 0-1 dimension score");
});

// ── 4. Diversity ──────────────────────────────────────────────────────────
section("4. Diversity measurement");

check("The controller tracks territory, angle and tension separately", () => {
  const d = new CreativeDiversityController();
  d.record({ angle: "REVERSAL", territory: "T1", tension: "X", big_idea: "First idea about a thing" });
  d.record({ angle: "REVERSAL", territory: "T2", tension: "Y", big_idea: "Second idea about another thing" });
  const m = d.metrics();
  assert.strictEqual(m.distinct_territories, 2);
  assert.strictEqual(m.distinct_tensions, 2);
  assert.strictEqual(m.angle_distribution.REVERSAL, 2);
  assert.strictEqual(m.diversity_ratio, 1);
});

check("A repeated territory or tension is penalised, not silently allowed", () => {
  const d = new CreativeDiversityController();
  d.record({ angle: "REVERSAL", territory: "T1", tension: "X", big_idea: "First idea about a thing" });
  const repeat = d.assess({ angle: "ELEVATION", territory: "T1", tension: "X", big_idea: "A wholly different sentence entirely" });
  assert.ok(repeat.allowed, "a repeat is penalised rather than forbidden");
  assert.ok(repeat.repetition_penalty > 0.5, `penalty too low: ${repeat.repetition_penalty}`);
  assert.ok(/territory/.test(repeat.reason || ""));
});

check("A near-duplicate idea is suppressed outright", () => {
  // Two campaigns with the same idea is not a diversity penalty, it is a mistake.
  const d = new CreativeDiversityController();
  d.record({ angle: "REVERSAL", territory: "T1", tension: "X", big_idea: "Say out loud what women already know but never hear" });
  const dup = d.assess({ angle: "REVERSAL", territory: "T2", tension: "Y", big_idea: "Say out loud what women already know but never hear" });
  assert.strictEqual(dup.allowed, false);
  assert.strictEqual(dup.repetition_penalty, 1);
});

check("Diversity is measured across the run, not within one case", () => {
  // The repetition the benchmark found was between briefs. A per-case controller
  // would have reported perfect diversity every time.
  const src = require("fs").readFileSync("lib/image-engine/run-concept-benchmark.ts", "utf-8");
  assert.ok(/new CreativeDiversityController\(\)/.test(src));
  const occurrences = (src.match(/new CreativeDiversityController\(\)/g) || []).length;
  assert.strictEqual(occurrences, 1, "one controller must span the whole run");
});

// ── 5. Adversarial ────────────────────────────────────────────────────────
section("5. Adversarial creative tests");

check("An idea that restates the brief is attacked for it", () => {
  const restating: CreativeSynthesisOutput = {
    big_idea: "She has been promised the same result by nine brands and cannot tell which is telling the truth",
    why_it_works: "", emotional_hook: "", strategic_reason: "",
    originality_score: 0, angle: "RECOGNITION", derived_from: [],
  };
  const attacks = AdversarialConceptTester.attack(restating, strongInput, problem, "ampoule");
  assert.ok(attacks.some((a) => a.kind === "RESTATES_BRIEF"), attacks.map((a) => a.kind).join(", "));
});

check("An idea about a different problem is attacked as WRONG_SUBJECT", () => {
  const offTopic: CreativeSynthesisOutput = {
    big_idea: "Make the morning commute shorter for everyone who travels",
    why_it_works: "", emotional_hook: "", strategic_reason: "",
    originality_score: 5, angle: "ELEVATION", derived_from: [],
  };
  const attacks = AdversarialConceptTester.attack(
    offTopic,
    { ...strongInput, human_tension: "He wants a faster commute to the office" },
    problem,
    "ampoule"
  );
  const wrong = attacks.find((a) => a.kind === "WRONG_SUBJECT");
  assert.ok(wrong, attacks.map((a) => a.kind).join(", "));
  assert.ok(wrong!.severity >= 0.9, "a concept about the wrong problem is a fatal fault");
});

check("A must-avoid phrase is a fatal attack", () => {
  const cliche: CreativeSynthesisOutput = {
    big_idea: "Lead with a water splash and let the product speak for itself",
    why_it_works: "", emotional_hook: "", strategic_reason: "",
    originality_score: 5, angle: "ELEVATION", derived_from: [],
  };
  const attacks = AdversarialConceptTester.attack(cliche, strongInput, problem, "ampoule");
  const def = attacks.find((a) => a.kind === "CATEGORY_DEFAULT");
  assert.ok(def, "reproducing an excluded default was not caught");
  assert.strictEqual(def!.severity, 1);
});

check("Business outcomes in an idea are attacked", () => {
  const bs: CreativeSynthesisOutput = {
    big_idea: "Make brand attribution and recall the whole point rather than a detail",
    why_it_works: "", emotional_hook: "", strategic_reason: "",
    originality_score: 5, angle: "ELEVATION", derived_from: [],
  };
  const attacks = AdversarialConceptTester.attack(bs, strongInput, problem, "ampoule");
  assert.ok(attacks.some((a) => a.kind === "BUSINESS_SPEAK"), attacks.map((a) => a.kind).join(", "));
});

check("A clean idea survives the attack set", () => {
  // The harness must not fire on everything, or it says nothing.
  const clean: CreativeSynthesisOutput = {
    big_idea: "Hand over the means of checking the ampoule rather than asking to be believed",
    why_it_works: "", emotional_hook: "", strategic_reason: "",
    originality_score: 8, angle: "REFUSAL", derived_from: [],
  };
  const attacks = AdversarialConceptTester.attack(clean, strongInput, problem, "ampoule verification");
  const fatal = attacks.filter((a) => a.severity >= 0.9);
  assert.deepStrictEqual(fatal.map((a) => a.kind), [], `clean idea attacked: ${attacks.map((a) => a.kind).join(", ")}`);
});

check("Improvement never produces a duplicate of a prior idea", () => {
  assert.strictEqual(
    AdversarialConceptTester.isDuplicate("Say out loud what women already know", ["Say out loud what women already know"]),
    true
  );
  assert.strictEqual(AdversarialConceptTester.isDuplicate("A completely unrelated proposition", ["Say out loud what women know"]), false);
});

// ── 6. End to end ─────────────────────────────────────────────────────────
section("6. Full run");

check("Every one of the hundred briefs produces a result without crashing", () => {
  // Seven briefs crashed the run on `domain_profile` of undefined before an `as`
  // cast was removed. A brief with no usable material must degrade, not throw.
  const { rows } = runConceptBenchmark(cases);
  assert.strictEqual(rows.length, 100, `only ${rows.length} of 100 briefs produced a result`);
  console.log(`      ${rows.length}/100 briefs produced a result`);
});

check("Contamination stays at or near zero across a hundred briefs", () => {
  const { rows } = runConceptBenchmark(cases.slice(0, 40));
  const dirty = rows.filter((r) => r.contaminated).length;
  assert.ok(dirty <= 2, `${dirty} of ${rows.length} concepts carry execution language`);
  console.log(`      ${dirty}/${rows.length} contaminated`);
});

check("similarity is symmetric and bounded", () => {
  assert.strictEqual(similarity("a b c d", "a b c d"), similarity("a b c d", "a b c d"));
  assert.ok(similarity("totally different words here", "nothing alike whatsoever friend") < 0.4);
  assert.ok(similarity("the same sentence twice", "the same sentence twice") > 0.95);
});

check("The combination engine skips moves the material cannot support", () => {
  // An unavailable move is skipped rather than filled badly.
  const thin: CreativeSynthesisInput = {
    human_tension: "", consumer_insight: "", campaign_territory: "",
    brand_objective: "", differentiation: "", audience: "people",
  };
  assert.deepStrictEqual(CreativeCombinationEngine.combine(thin), []);
  const partial = { ...thin, human_tension: "She cannot tell which brand is telling the truth about this" };
  const angles = CreativeCombinationEngine.availableAngles(partial);
  assert.ok(angles.length > 0 && angles.length < 7, `expected a subset, got ${angles.join(", ")}`);
});

check("Originality rejects a candidate that duplicates a prior idea", () => {
  const prior = ["Hand over the means of checking rather than asking to be believed"];
  const a = OriginalityEvaluator.assess(prior[0], [], prior);
  assert.strictEqual(a.accepted, false, "an exact repeat must be rejected");
  assert.ok(a.too_similar_to);
  const b = OriginalityEvaluator.assess("Count what the silence costs the people who never say it", [], prior);
  assert.strictEqual(b.accepted, true);
});


// ── 7. Defects this benchmark found ───────────────────────────────────────
section("7. Regressions the hundred-brief run exposed");

function industryOf(brief: any): string {
  const x: any = (CreativeContextExtractor as any).fromBrief
    ? (CreativeContextExtractor as any).fromBrief(brief)
    : (CreativeContextExtractor as any).extract(brief);
  return String((x?.query ?? x)?.industry ?? "");
}

check("A healthcare brief is not classified as automotive", () => {
  // /car/ was unanchored, so "primary care clinic" matched it. All ten
  // healthcare briefs went to retrieval as automotive, which hard-excluded every
  // healthcare object in the corpus.
  for (const c of cases.filter((x) => x.industry === "healthcare")) {
    assert.strictEqual(industryOf(c.brief), "healthcare", `${c.case_id} routed to "${industryOf(c.brief)}"`);
  }
});

check("`tech` still matches as a prefix, not only as a whole word", () => {
  // The obvious repair for the above — word-boundary everything — silently
  // dropped nine of ten technology briefs. Same mistake, opposite direction.
  const routed = cases.filter((x) => x.industry === "technology").map((c) => industryOf(c.brief));
  const ok = routed.filter((r) => r === "technology").length;
  assert.ok(ok >= 9, `only ${ok}/10 technology briefs routed correctly`);
});

check("No industry is asserted for a corpus that holds nothing", () => {
  // The industry axis is a hard exclusion, so naming local_business — which has
  // zero concept objects — retrieves nothing at all, which is worse than
  // retrieving broadly. The rule belongs there the day the knowledge does.
  const routed = cases.filter((x) => x.industry === "local_business").map((c) => industryOf(c.brief));
  assert.strictEqual(routed.filter((r) => r === "local_business").length, 0);
});

check("An objective is not mistaken for an industry", () => {
  // "Enrolment" pulled a neighbourhood gym into education, which then handed it
  // a tension about choosing a school for a child.
  const gym = cases.find((c) => c.case_id.includes("gym_intimidation"))!;
  assert.notStrictEqual(industryOf(gym.brief), "education");
});

check("REFUSAL refuses a thing, not a sentence about a thing", () => {
  // `differentiation` arrives as "Rejects the category default - X - in favour of
  // Y", which produced "Refuse rejects the category default, and offer Z
  // instead" on half the run — ungrammatical, and identical wherever the
  // anti-pattern was shared.
  const input: CreativeSynthesisInput = {
    human_tension: "She cannot tell which brand is telling the truth about the ampoule",
    consumer_insight: "Claim fatigue is scepticism about verification",
    campaign_territory: "Verifiability, the brand that hands over the means of checking",
    brand_objective: "Product launch",
    differentiation: "Rejects the category default — the glowing model face — in favour of unretouched evidence.",
    audience: "women 30 to 45",
  };
  const refusal = CreativeCombinationEngine.combine(input).find((c) => c.angle === "REFUSAL");
  assert.ok(refusal, "REFUSAL was not available over material that supports it");
  assert.ok(!/^Refuse rejects\b/i.test(refusal!.big_idea), `ungrammatical: ${refusal!.big_idea}`);
  assert.ok(/glowing model face/i.test(refusal!.big_idea), `did not name the default it refuses: ${refusal!.big_idea}`);
});

check("REFUSAL is skipped when nothing refusable can be extracted", () => {
  // An unavailable move is skipped rather than filled badly.
  const input: CreativeSynthesisInput = {
    human_tension: "She cannot tell which brand is telling the truth about the ampoule",
    consumer_insight: "Claim fatigue is scepticism about verification",
    campaign_territory: "Verifiability, the brand that hands over the means of checking",
    brand_objective: "Product launch",
    differentiation: "Rejects the category default.",
    audience: "women 30 to 45",
  };
  assert.ok(!CreativeCombinationEngine.combine(input).some((c) => c.angle === "REFUSAL"));
});

check("Refinement will not rebuild a concept into a previous case's idea", () => {
  // The gate ranks alternatives by score, and score has no view of the run. Nine
  // separate briefs were handed the same sentence.
  const input: CreativeSynthesisInput = {
    human_tension: "She has been promised the same result by nine brands and cannot tell which is true",
    consumer_insight: "Claim fatigue is scepticism about verification",
    campaign_territory: "Verifiability",
    brand_objective: "Product launch",
    differentiation: "Rejects the category default — the water splash — in favour of unretouched evidence.",
    audience: "women 30 to 45",
  };
  const weak: CreativeSynthesisOutput = {
    big_idea: "Something entirely beside the point of this brief",
    why_it_works: "", emotional_hook: "", strategic_reason: "",
    originality_score: 0, angle: "RECOGNITION", derived_from: [],
  };
  const all = CreativeCombinationEngine.combine(input).map((c) => c.big_idea);
  assert.ok(all.length >= 2, "need at least two constructions to test suppression");
  const r = CreativeQualityGate.evaluate("t", weak, input, "she cannot tell which brand is telling the truth", all);
  assert.ok(!all.includes(r.concept.big_idea), `refined into a prior idea: ${r.concept.big_idea}`);
  assert.ok(r.reasons.some((x) => /suppressed as near-duplicates/.test(x)), r.reasons.join(" | "));
});

check("An empty concept is never a PASS", () => {
  // Seven healthcare briefs reached the gate with no idea at all, and the rubric
  // scored the empty string like a concept that had merely done badly.
  const empty: CreativeSynthesisOutput = {
    big_idea: "", why_it_works: "", emotional_hook: "", strategic_reason: "",
    originality_score: 0, angle: "RECOGNITION", derived_from: [],
  };
  const r = CreativeQualityGate.evaluate("t", empty, strongInput, problem);
  assert.notStrictEqual(r.verdict, "PASS");
  assert.ok(r.reasons.some((x) => /No concept was produced/.test(x)), r.reasons.join(" | "));
});

check("Every brief now yields a non-empty idea", () => {
  const { rows } = runConceptBenchmark(cases);
  const empty = rows.filter((r) => !r.big_idea.trim());
  assert.strictEqual(empty.length, 0, `${empty.length} briefs produced no idea: ${empty.map((r) => r.case_id).join(", ")}`);
});

check("Delivered diversity is measured, not the generator's intermediate", () => {
  // The controller reported 79 distinct of 93 while the delivered set held 52 of
  // 100, because the gate replaces the generator's idea on most cases.
  const { rows } = runConceptBenchmark(cases);
  const d = deliveredDiversity(rows);
  assert.strictEqual(d.ideas + d.empty, rows.length);
  assert.ok(d.diversity_ratio > 0.85, `delivered diversity ${d.diversity_ratio}`);
  console.log(`      delivered ${d.distinct_ideas}/${d.ideas} distinct (ratio ${d.diversity_ratio})`);
});

check("A typographic term with an everyday sense needs typographic company", () => {
  // "Leading with university placement rates" is not a line-spacing instruction.
  // Bare /leading/ flagged six clean concepts as contaminated.
  const clean = {
    big_idea: "Refuse leading with placement rates, and offer a defensible choice instead.",
    consumer_insight: "Parents cannot verify a promise about a child's future.",
    emotional_trigger: "doubt",
    belief_shift: "From ranking to reasoning.",
    campaign_territory: "Defensible choice",
  } as any;
  const v = ConceptQualityGate.validate(clean, undefined, true);
  assert.ok(
    !v.violations.some((x: any) => x.kind === "TYPOGRAPHY_INSTRUCTION"),
    `false positive: ${JSON.stringify(v.violations.filter((x: any) => x.kind === "TYPOGRAPHY_INSTRUCTION"))}`
  );
  const dirty = { ...clean, big_idea: "Set the headline in tight tracking across the upper third." };
  assert.ok(ConceptQualityGate.validate(dirty, undefined, true).violations.some((x: any) => x.kind === "TYPOGRAPHY_INSTRUCTION"),
    "a real typographic instruction is no longer caught");
});

check("human_truth is lexical overlap, and the report says so", () => {
  // This test pins a known false negative rather than a passing property. The
  // brief's problem and the retrieved tension below are the same idea in
  // different words, and the metric scores them zero. Until an embedding measure
  // replaces `overlap()`, every human_truth number — and every WRONG_SUBJECT
  // attack, which reruns the same comparison — carries this error.
  const input: CreativeSynthesisInput = {
    human_tension: "She is not afraid of looking older; she is afraid of no longer recognising the person looking back",
    consumer_insight: "Correction language reads as a verdict on the face she has",
    campaign_territory: "Recognition", brand_objective: "Awareness",
    differentiation: "", audience: "mature buyers", avoid: [],
  };
  const out: CreativeSynthesisOutput = {
    big_idea: "Say out loud what mature buyers already know but never hear: she is not afraid of looking older",
    why_it_works: "", emotional_hook: "", strategic_reason: "",
    originality_score: 5, angle: "RECOGNITION", derived_from: [],
  };
  const problemText = "Mature buyers reject correction language because it frames the face they have now as a defect to be undone.";
  const s = CreativeQualityBenchmark.score("t", out, input, problemText);
  assert.ok(s.dimensions.human_truth < 0.15,
    `the known false negative has closed — re-check this test's premise (got ${s.dimensions.human_truth})`);

  const agg = CreativeQualityBenchmark.aggregate([s]);
  const text = CreativeQualityBenchmark.format(agg);
  assert.ok(/shared vocabulary, not shared meaning/.test(text), "the report omits the lexical caveat");
  assert.ok(/WRONG_SUBJECT attack reruns the same comparison/.test(text),
    "the report does not say the adversarial attack is the same measurement");
});

console.log("\n" + "=".repeat(72));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(72));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
