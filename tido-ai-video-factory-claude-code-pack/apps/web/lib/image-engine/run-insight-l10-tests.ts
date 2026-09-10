import assert from "assert";
import { CulturalContextResolver } from "./reasoning/CulturalContextResolver";
import { DynamicHumanTensionDiscovery } from "./reasoning/DynamicHumanTensionDiscovery";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTruthReview } from "./reasoning/HumanTruthReview";
import { CULTURAL_LIBRARY, NO_CULTURE } from "./reasoning/cultural-context.types";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runInsightBenchmark } from "./run-insight-benchmark";

/**
 * CIOS Phase 4.0.3.5 verification.
 *
 * The three things this phase can get wrong, in order of how badly: asserting a
 * culture it has not established, discovering a "tension" that is the brief
 * restated, and scoring a malformed sentence as a good truth.
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
console.log("CIOS PHASE 4.0.3.5 — HUMAN INSIGHT INTELLIGENCE COMPLETION");
console.log("=".repeat(74));

const { cases } = loadConceptBenchmark();
const AGEING = {
  challenge: "Mature buyers reject correction language because it frames the face they have now as a defect to be undone.",
  audience: "Affluent women 45 plus",
  product: "Fermented rice cream",
  category: "beauty",
  objective: "Rebranding",
};

// ── 1. Discovery ──────────────────────────────────────────────────────────
section("1. DynamicHumanTensionDiscovery");

check("Every field the phase specifies is produced", () => {
  const d = DynamicHumanTensionDiscovery.discover(AGEING);
  assert.ok(d, "no tension discovered for a brief that describes a behaviour");
  for (const f of ["situation", "observable_behavior", "hidden_emotion", "psychological_need",
                   "social_force", "contradiction", "tension_statement"] as const) {
    assert.ok(typeof d![f] === "string", `${f} missing`);
  }
  assert.ok(d!.confidence > 0 && d!.confidence <= 1, `confidence ${d!.confidence}`);
});

check("Discovery runs before archetype matching and does not replace it", () => {
  // The phase's own constraint. Both layers must be present in the result.
  const i = HumanInsightGenerator.generate(AGEING);
  assert.ok(i.dynamic_tension, "discovery produced nothing");
  assert.notStrictEqual(i.archetype, "NO_ARCHETYPE");
  assert.notStrictEqual(i.archetype, "NONE");
});

check("A tension that paraphrases the brief is declined, not delivered", () => {
  // The failure that would raise every downstream number while nothing improved.
  const d = DynamicHumanTensionDiscovery.discover({
    challenge: "She delays the visit because she is afraid of both possible answers.",
    audience: "adults", product: "a clinic",
  });
  if (d && d.tension_statement) {
    assert.ok(d.restatement < 0.72, `restatement ${d.restatement} was delivered anyway`);
  }
  // And the guard itself fires when it should.
  const echo = DynamicHumanTensionDiscovery.discover({
    challenge: "People avoid checking because checking is what they avoid.",
    audience: "people", product: "a service",
  });
  if (echo && echo.restatement >= 0.72) assert.strictEqual(echo.tension_statement, "");
});

check("A sentence with no observable behaviour yields no discovery", () => {
  const d = DynamicHumanTensionDiscovery.discover({
    challenge: "Zzzq wibble frobnicate quux.", audience: "people", product: "a thing",
  });
  assert.strictEqual(d, null);
});

check("Ten motivation families, each distinct", () => {
  const needs = DynamicHumanTensionDiscovery.families();
  assert.strictEqual(needs.length, 10);
  assert.strictEqual(new Set(needs).size, 10);
});

check("An agent noun is not mistaken for a verb", () => {
  // /buy\w*/ matches "buyers", which produced the behaviour "buyer reject
  // correction language" and a truth built on nonsense.
  const d = DynamicHumanTensionDiscovery.discover(AGEING);
  assert.ok(!/^buyers?\b/i.test(d!.observable_behavior), `agent noun taken as verb: ${d!.observable_behavior}`);
});

check("A composed truth is a sentence or it is nothing", () => {
  // The review scores content, not grammar. Malformed truths have to be stopped
  // where they are made.
  let composed = 0;
  for (const c of cases) {
    const d = DynamicHumanTensionDiscovery.discover({
      challenge: c.creative_challenge, audience: c.brief.audience || "", product: c.brief.product || "",
    });
    if (!d) continue;
    const truth = DynamicHumanTensionDiscovery.composeTruth(d);
    if (!truth) continue;
    composed++;
    assert.ok(!/\b(?:because|which|that)\b[^.]{0,40}\bis usually\b/i.test(truth), `spliced across a clause: ${truth}`);
    assert.ok(!/\busually\b[^.]*\busually\b/i.test(truth), `doubled connective: ${truth}`);
    assert.ok(!/\b(\w+)\s+\1\b/i.test(truth), `doubled word: ${truth}`);
    const n = truth.split(/\s+/).length;
    assert.ok(n >= 6 && n <= 26, `${n} words: ${truth}`);
  }
  console.log(`      ${composed} composed truths, all well-formed`);
});

check("A composed truth stays universal", () => {
  // A truth naming the product is a product claim wearing a truth's clothes.
  for (const c of cases.slice(0, 40)) {
    const d = DynamicHumanTensionDiscovery.discover({
      challenge: c.creative_challenge, audience: c.brief.audience || "", product: c.brief.product || "",
    });
    if (!d) continue;
    const truth = DynamicHumanTensionDiscovery.composeTruth(d).toLowerCase();
    if (!truth) continue;
    // As a whole word. A substring test failed on the brand "Ro" appearing
    // inside "everyone", which is not a brand mention by any reading.
    const brand = String(c.brief.brand || "zzz").toLowerCase();
    assert.ok(
      !new RegExp(`\\b${brand.replace(/[^a-z0-9 ]/g, "")}\\b`, "i").test(truth),
      `names the brand: ${truth}`
    );
  }
});

// ── 2. Truth review ───────────────────────────────────────────────────────
section("2. HumanTruthReview");

check("All five questions are asked", () => {
  const r = HumanTruthReview.review("People forgo what they want rather than be seen wanting it.", {
    briefProblem: AGEING.challenge, audience: AGEING.audience, product: AGEING.product,
  });
  assert.deepStrictEqual(r.findings.map((f) => f.question), [
    "obvious", "hidden_motivation", "self_recognition", "competitor_could_say", "changes_strategy",
  ]);
});

check("A platitude fails the first question", () => {
  const r = HumanTruthReview.review("At the end of the day, everyone wants quality.", {
    briefProblem: AGEING.challenge, audience: "people", product: "a thing",
  });
  assert.ok(r.failed.includes("obvious"), JSON.stringify(r.failed));
  assert.strictEqual(r.verdict, "WEAK");
});

check("A restatement of the brief fails the first question", () => {
  const r = HumanTruthReview.review(AGEING.challenge, {
    briefProblem: AGEING.challenge, audience: AGEING.audience, product: AGEING.product,
  });
  assert.ok(r.failed.includes("obvious"), "the brief returned verbatim passed as a truth");
});

check("A malformed sentence cannot score as a good truth", () => {
  // This scored 94 of 100 before the review looked at whether it was a sentence.
  const r = HumanTruthReview.review(
    "What looks like people buyer reject correction language because it frames is usually recognising yourself in what you are offered being protected.",
    { briefProblem: AGEING.challenge, audience: AGEING.audience, product: AGEING.product }
  );
  assert.ok(r.failed.includes("self_recognition"), JSON.stringify(r.failed));
  assert.ok(r.score < 70, `malformed truth scored ${r.score}`);
});

check("Market vocabulary fails self-recognition", () => {
  const r = HumanTruthReview.review("Consumers in this category exhibit low brand equity attachment.", {
    briefProblem: AGEING.challenge, audience: "people", product: "a thing",
  });
  assert.ok(r.failed.includes("self_recognition"), JSON.stringify(r.failed));
});

check("An empty truth reviews as weak on every question", () => {
  const r = HumanTruthReview.review("", { briefProblem: "x", audience: "y", product: "z" });
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.failed.length, 5);
});

check("The report states what the five questions can and cannot establish", () => {
  const agg = HumanTruthReview.aggregate([
    HumanTruthReview.review("People forgo what they want rather than be seen wanting it.", {
      briefProblem: AGEING.challenge, audience: "people", product: "a thing",
    }),
  ]);
  const text = HumanTruthReview.format(agg);
  assert.ok(/better proxies, not a measurement/.test(text));
  assert.ok(/blind human benchmark remains the instrument of record/.test(text));
});

// ── 3. Culture ────────────────────────────────────────────────────────────
section("3. CulturalContext");

check("All seven fields are carried", () => {
  const vn = CULTURAL_LIBRARY.vn;
  for (const f of ["social_values", "current_tensions", "cultural_symbols",
                   "behavior_shifts", "language_patterns"] as const) {
    assert.ok(Array.isArray(vn[f]) && vn[f].length >= 4, `${f} is thin`);
  }
  assert.strictEqual(vn.country, "vn");
  assert.ok(vn.reviewed, "no review date");
  assert.strictEqual(vn.needs_local_review, true, "an authored cultural claim must be flagged for local review");
});

check("A brief with no market signal gets no culture", () => {
  // A resolver that always answers turns an absent signal into a confident claim.
  const r = CulturalContextResolver.resolve({ audience: "people", product: "a thing" });
  assert.strictEqual(r.resolved, false);
  assert.deepStrictEqual(r.context, NO_CULTURE);
  assert.ok(r.warnings.some((w) => /NO_CULTURAL_MARKET/.test(w)));
});

check("An identified market with no library entry declines", () => {
  // Substituting a neighbouring market's context would be worse than nothing.
  const r = CulturalContextResolver.resolve({ market: "fr", audience: "people", product: "a thing" });
  assert.strictEqual(r.resolved, false);
});

check("A stated market resolves, and generation comes from the audience only", () => {
  const r = CulturalContextResolver.resolve({
    market: "vn", audience: "Gen Z students", product: "a tutoring service",
  });
  assert.strictEqual(r.resolved, true);
  assert.strictEqual(r.context.generation, "gen_z");
  // The product must not decide the generation: a school's buyer is the parent.
  const parent = CulturalContextResolver.resolve({
    market: "vn", audience: "Parents choosing a school", product: "a primary school",
  });
  assert.notStrictEqual(parent.context.generation, "gen_z");
});

check("An irrelevant cultural force is not asserted", () => {
  // At a loose threshold this attached "the alley shop whose proprietor knows
  // the household" to an anti-ageing brief.
  const vn = CulturalContextResolver.resolve({ market: "vn", audience: "women", product: "a serum" }).context;
  assert.strictEqual(CulturalContextResolver.forceFor(vn, "quantum chromodynamics lattice gauge"), "");
  assert.strictEqual(CulturalContextResolver.symbolFor(vn, "quantum chromodynamics lattice gauge"), "");
});

check("Culture never enters the human truth itself", () => {
  // The truth stays universal; culture grounds the expression below it and the
  // social rung above it. A truth naming a market is a local observation.
  const i = HumanInsightGenerator.generate({ ...AGEING, market: "vn" });
  assert.ok(!/\b(?:vietnam|vietnamese|tet|hanoi|saigon)\b/i.test(i.human_truth), i.human_truth);
  if (i.cultural_grounding) assert.notStrictEqual(i.cultural_grounding, i.human_truth);
});

check("Culture can be switched off without breaking the insight", () => {
  const off = HumanInsightGenerator.generate({ ...AGEING, market: "vn", useCulture: false });
  assert.ok(off.human_truth, "no truth without culture");
  assert.strictEqual(off.cultural_grounding, undefined);
});

// ── 4. The combined flow ──────────────────────────────────────────────────
section("4. Psychology + culture → human truth");

check("Discovery lifts the truth ceiling the archetypes imposed", () => {
  // 41 archetypes could produce at most 41 distinct truths, and 93 briefs
  // produced 39. A truth composed from discovered material varies with the brief.
  const withDiscovery = new Set<string>();
  const withoutDiscovery = new Set<string>();
  for (const c of cases) {
    const base = {
      challenge: c.creative_challenge,
      audience: c.brief.audience || "",
      product: c.brief.product || "",
      category: c.industry,
      objective: c.brief.objective,
      market: "vn",
    };
    const a = HumanInsightGenerator.generate(base);
    const b = HumanInsightGenerator.generate({ ...base, useDiscovery: false });
    if (a.human_truth) withDiscovery.add(a.human_truth);
    if (b.human_truth) withoutDiscovery.add(b.human_truth);
  }
  assert.ok(
    withDiscovery.size > withoutDiscovery.size,
    `discovery ${withDiscovery.size} vs archetypes alone ${withoutDiscovery.size}`
  );
  console.log(`      distinct truths: ${withoutDiscovery.size} archetypes alone → ${withDiscovery.size} with discovery`);
});

check("The 4.0.3 path still runs when both new layers are off", () => {
  const i = HumanInsightGenerator.generate({ ...AGEING, useDiscovery: false, useCulture: false });
  assert.ok(i.human_truth);
  assert.strictEqual(i.ladder.length, 7);
  assert.strictEqual(i.dynamic_tension, null);
});

check("No brief produces a shallow insight", () => {
  let shallow = 0;
  for (const c of cases) {
    const i = HumanInsightGenerator.generate({
      challenge: c.creative_challenge, audience: c.brief.audience || "",
      product: c.brief.product || "", category: c.industry, objective: c.brief.objective, market: "vn",
    });
    if (HumanInsightGenerator.shallowHits(i).length) shallow++;
  }
  assert.strictEqual(shallow, 0, `${shallow} shallow insights`);
});

// ── 5. End to end ─────────────────────────────────────────────────────────
section("5. The hundred briefs");

const run = runInsightBenchmark(cases);

check("Every brief produces a result", () => {
  assert.strictEqual(run.rows.length, 100);
  assert.strictEqual(run.truthReviews.length, 100);
});

check("Delivered ideas remain distinct", () => {
  const ideas = run.rows.map((r) => r.big_idea).filter(Boolean);
  assert.strictEqual(new Set(ideas).size, ideas.length);
});

check("Truth review improves on the 4.0.3 baseline", () => {
  const agg = HumanTruthReview.aggregate(run.truthReviews);
  assert.ok(agg.mean_score > 55, `truth review ${agg.mean_score}`);
  assert.ok(agg.weak <= 15, `${agg.weak} weak truths`);
  console.log(`      truth review ${agg.mean_score.toFixed(1)}/100 · strong ${agg.strong} · weak ${agg.weak}`);
});

check("Culture is grounded only where it was established and relevant", () => {
  const grounded = run.rows.filter((r) => r.cultural_grounding).length;
  assert.ok(grounded > 0, "no brief was culturally grounded");
  assert.ok(grounded < run.rows.length, "every brief was grounded, which means relevance is not being checked");
  console.log(`      ${grounded}/100 culturally grounded`);
});

check("The metric control still out-scores every derived rung", () => {
  // The reason neither of this phase's numeric targets is aimed at directly.
  assert.ok(
    run.sensitivity.observed_reality > run.sensitivity.identity_conflict,
    "if the control no longer wins, re-check whether the tension has drifted toward restatement"
  );
  console.log(
    `      control ${run.sensitivity.observed_reality.toFixed(1)}/25 vs derived ${run.sensitivity.identity_conflict.toFixed(1)}/25`
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
