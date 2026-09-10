import assert from "assert";
import { DynamicHumanTensionDiscovery } from "./reasoning/DynamicHumanTensionDiscovery";
import { EmotionalPowerEvaluator, EMOTIONAL_WEIGHTS } from "./reasoning/EmotionalPowerEvaluator";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { INSIGHT_LADDER } from "./reasoning/human-insight.types";
import { LATENT_PATTERNS, MOTIVATION_FAMILIES } from "./reasoning/human-motivation.types";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runInsightBenchmark } from "./run-insight-benchmark";

/**
 * CIOS Phase 4.0.3.6 verification.
 *
 * The three things this phase can get wrong: presenting a reconstruction as a
 * reading, lifting a behaviour out of the clause that negated it, and letting a
 * five-layer stack imply five layers of evidence.
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
console.log("CIOS PHASE 4.0.3.6 — HUMAN DEPTH UPGRADE");
console.log("=".repeat(74));

const { cases } = loadConceptBenchmark();
const EXPLICIT = {
  challenge: "She calculates resale value at the moment of purchase and no brand will acknowledge it.",
  audience: "Women 30 to 45",
  product: "A wool coat",
  category: "fashion",
};
const CONDITION = {
  challenge: "Every competitor uses steam, pour and bean close-ups, so the whole category looks like one brand.",
  audience: "Urban coffee drinkers",
  product: "A speciality roast",
  category: "food_beverage",
};

// ── 1. Latent reconstruction ──────────────────────────────────────────────
section("1. LatentHumanSituation reconstruction");

check("All eight fields the phase specifies are produced", () => {
  const l = DynamicHumanTensionDiscovery.reconstructLatent(CONDITION.challenge);
  assert.ok(l, "no reconstruction for a brief that states a condition");
  for (const f of ["surface_statement", "missing_behavior", "daily_context", "moment_of_tension",
                   "trigger_event", "avoidance_behavior", "desired_state"] as const) {
    assert.ok(String(l![f] || "").trim(), `${f} is empty`);
  }
  assert.ok(l!.confidence > 0 && l!.confidence <= 1);
});

check("The surface statement is the brief, unchanged", () => {
  const l = DynamicHumanTensionDiscovery.reconstructLatent(CONDITION.challenge);
  assert.strictEqual(l!.surface_statement, CONDITION.challenge);
});

check("Explicit behaviour is read first; reconstruction is the fallback", () => {
  // The order is the whole of Task 1. A brief that says what someone does must
  // never be reconstructed instead of read.
  const explicit = DynamicHumanTensionDiscovery.discover(EXPLICIT);
  assert.strictEqual(explicit!.source, "EXPLICIT");
  assert.strictEqual(explicit!.latent, undefined);

  const latent = DynamicHumanTensionDiscovery.discover(CONDITION);
  assert.strictEqual(latent!.source, "LATENT");
  assert.ok(latent!.latent, "a reconstructed tension must carry what was assumed");
});

check("A reconstruction is never as confident as a reading", () => {
  // A reconstruction presented as a reading is a claim about a person the brief
  // never made. The cap is applied last, so nothing can lift it.
  const explicit = DynamicHumanTensionDiscovery.discover(EXPLICIT)!;
  const latent = DynamicHumanTensionDiscovery.discover(CONDITION)!;
  assert.ok(latent.confidence <= 0.62, `latent confidence ${latent.confidence}`);
  assert.ok(explicit.confidence > latent.confidence, `${explicit.confidence} vs ${latent.confidence}`);
});

check("A production constraint is reconstructed in order to be declined", () => {
  const l = DynamicHumanTensionDiscovery.reconstructLatent(
    "A required warning and a full ingredient list compete with the message for the same small panel."
  );
  assert.ok(l, "the constraint was not recognised at all");
  assert.strictEqual(l!.missing_behavior, "", "a panel size was given a human behaviour");
  const d = DynamicHumanTensionDiscovery.discover({
    challenge: "A required warning and a full ingredient list compete with the message for the same small panel.",
    audience: "shoppers", product: "a serum",
  });
  assert.strictEqual(d, null);
});

check("An unrecognised condition reconstructs nothing", () => {
  assert.strictEqual(DynamicHumanTensionDiscovery.reconstructLatent("Zzzq wibble frobnicate quux."), null);
});

check("Every latent pattern is complete or deliberately empty", () => {
  for (const p of LATENT_PATTERNS) {
    const fields = [p.missing_behavior, p.daily_context, p.moment_of_tension,
                    p.trigger_event, p.avoidance_behavior, p.desired_state];
    const filled = fields.filter((f) => String(f || "").trim()).length;
    assert.ok(filled === 0 || filled === 6, `${p.id} is half-filled (${filled}/6)`);
  }
  console.log(`      ${LATENT_PATTERNS.length} condition shapes`);
});

check("Discovery coverage clears the phase target", () => {
  const covered = cases.filter((c) =>
    DynamicHumanTensionDiscovery.discover({
      challenge: c.creative_challenge, audience: c.brief.audience || "", product: c.brief.product || "",
    })
  ).length;
  assert.ok(covered >= 75, `coverage ${covered}/100, target was 75`);
  console.log(`      ${covered}/100 (4.0.3.5 was 45)`);
});

// ── 2. The motivation stack ───────────────────────────────────────────────
section("2. HumanMotivationStack");

check("All five layers plus a depth score", () => {
  const d = DynamicHumanTensionDiscovery.discover(EXPLICIT)!;
  for (const f of ["functional_need", "emotional_need", "identity_need",
                   "social_consequence", "existential_tension"] as const) {
    assert.ok(String(d.motivation[f] || "").trim(), `${f} is empty`);
  }
  assert.ok(d.motivation.depth_score > 0 && d.motivation.depth_score <= 1);
  assert.ok(d.motivation.family, "the stack does not say where it came from");
});

check("Ten families, each with every layer and a short form", () => {
  assert.strictEqual(MOTIVATION_FAMILIES.length, 10);
  assert.strictEqual(new Set(MOTIVATION_FAMILIES.map((f) => f.id)).size, 10);
  for (const f of MOTIVATION_FAMILIES) {
    for (const k of ["functional_need", "emotional_need", "identity_need", "social_consequence",
                     "existential_tension", "stake", "short_want", "short_identity"] as const) {
      assert.ok(String(f[k] || "").trim(), `${f.id}.${k} is empty`);
    }
    // The short forms exist because the descriptions do not fit inside a
    // sentence. If one grows into a clause it has stopped doing its job.
    assert.ok(f.short_want.split(/\s+/).length <= 7, `${f.id}.short_want is a clause`);
    assert.ok(f.short_identity.split(/\s+/).length <= 7, `${f.id}.short_identity is a clause`);
  }
});

check("depth_score reports evidence, not the number of layers", () => {
  // Five layers always come back. The score has to say how many were established
  // from this brief rather than inherited whole from the family, or a lookup
  // reads as a finding.
  const inherited = DynamicHumanTensionDiscovery.buildStack(MOTIVATION_FAMILIES[0], {
    behaviour: "", situation: "", latent: null,
  });
  const evidenced = DynamicHumanTensionDiscovery.buildStack(MOTIVATION_FAMILIES[0], {
    behaviour: "calculates resale value",
    situation: "at the moment of purchase",
    latent: { moment_of_tension: "the moment of purchase", desired_state: "a price they can predict" } as any,
  });
  assert.ok(evidenced.depth_score > inherited.depth_score, `${evidenced.depth_score} vs ${inherited.depth_score}`);
});

check("A behaviour inside a negated clause is not lifted out of it", () => {
  // "At two in the morning she does not want the best food" yielded the
  // behaviour "want the best food", and the truth composed from it said the
  // opposite of the brief while reading as a platitude.
  const d = DynamicHumanTensionDiscovery.discover({
    challenge: "At two in the morning she does not want the best food, she wants food that exists.",
    audience: "shift workers", product: "a delivery service",
  });
  if (d) {
    assert.ok(!/^want the best/i.test(d.observable_behavior), `negation dropped: ${d.observable_behavior}`);
  }
});

check("No brief in the corpus produces a shallow insight", () => {
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

// ── 3. Emotional power ────────────────────────────────────────────────────
section("3. EmotionalPowerEvaluator");

check("Five dimensions, weighted to the rubric slot they report beside", () => {
  assert.strictEqual(Object.values(EMOTIONAL_WEIGHTS).reduce((a, b) => a + b, 0), 20);
  const r = EmotionalPowerEvaluator.evaluate("People forgo what they want rather than be seen wanting it.");
  assert.deepStrictEqual(r.findings.map((f) => f.dimension), [
    "recognition", "emotional_friction", "personal_relevance", "memory_trigger", "shareability",
  ]);
});

check("A sentence that only asserts scores no friction", () => {
  const flat = EmotionalPowerEvaluator.evaluate("This brand makes a very good product for its customers.");
  const friction = flat.findings.find((f) => f.dimension === "emotional_friction")!;
  assert.strictEqual(friction.score, 0, friction.evidence);
});

check("A sentence that holds two things apart scores friction", () => {
  const held = EmotionalPowerEvaluator.evaluate(
    "People give up privacy at the counter rather than admit they need the thing they came for."
  );
  const friction = held.findings.find((f) => f.dimension === "emotional_friction")!;
  assert.ok(friction.score >= 0.6, friction.evidence);
});

check("Market vocabulary costs personal relevance", () => {
  const r = EmotionalPowerEvaluator.evaluate("The brand's conversion funnel underperforms across the segment.");
  const rel = r.findings.find((f) => f.dimension === "personal_relevance")!;
  assert.ok(rel.score < 0.4, rel.evidence);
});

check("An empty idea scores zero on every dimension", () => {
  const r = EmotionalPowerEvaluator.evaluate("");
  assert.strictEqual(r.score, 0);
  assert.ok(r.findings.every((f) => f.score === 0));
});

check("The evaluator names its weakest dimension, so a run can be diagnosed", () => {
  // The reason five numbers replaced one: the old `emotional_power` scored 6.3
  // of 20 and could not say which of five things was missing.
  const r = EmotionalPowerEvaluator.evaluate("Quality is our commitment to the customer experience.");
  assert.ok(r.weakest, "no weakest dimension reported");
  assert.ok(/proxies, not a measurement/.test(
    EmotionalPowerEvaluator.format(EmotionalPowerEvaluator.aggregate([r]))
  ));
});

// ── 4. The upgraded ladder ────────────────────────────────────────────────
section("4. The seven-rung ladder");

check("The rungs are the ones Task 4 specifies, in order", () => {
  assert.deepStrictEqual([...INSIGHT_LADDER], [
    "observed_reality", "behavior", "hidden_emotion", "identity_conflict",
    "social_fear", "human_truth", "creative_opportunity",
  ]);
});

check("Identity conflict and social fear are separate rungs", () => {
  // Fused in 4.0.3, and separating them is what lets a truth be about who
  // someone is rather than only about what they risk.
  const i = HumanInsightGenerator.generate({ ...EXPLICIT, market: "vn" });
  const identity = i.ladder.find((r) => r.step === "identity_conflict")?.statement || "";
  const social = i.ladder.find((r) => r.step === "social_fear")?.statement || "";
  assert.ok(identity && social, "one of the two rungs is missing");
  assert.notStrictEqual(identity, social);
});

check("Creative opportunity is a rung, not an inference made twice", () => {
  const i = HumanInsightGenerator.generate({ ...EXPLICIT, market: "vn" });
  const opp = i.ladder.find((r) => r.step === "creative_opportunity")?.statement || "";
  assert.ok(opp.length > 30, "no creative opportunity was stated");
  assert.ok(/brand could/i.test(opp), opp);
});

// ── 5. End to end ─────────────────────────────────────────────────────────
section("5. The hundred briefs");

const run = runInsightBenchmark(cases);

check("Every brief produces a result", () => {
  assert.strictEqual(run.rows.length, 100);
  assert.strictEqual(run.emotionalPower.length, 100);
});

check("Delivered ideas stay distinct", () => {
  const ideas = run.rows.map((r) => r.big_idea).filter(Boolean);
  assert.strictEqual(new Set(ideas).size, ideas.length);
  console.log(`      ${ideas.length} ideas, all distinct`);
});

check("Reconstructed tensions are a minority of the coverage", () => {
  // If most of the gain came from reconstruction rather than from reading, the
  // coverage number is softer than it looks and the report should say so.
  const explicit = run.rows.filter((r) => r.discovery_source === "EXPLICIT").length;
  const latent = run.rows.filter((r) => r.discovery_source === "LATENT").length;
  assert.ok(explicit > latent, `read ${explicit} vs reconstructed ${latent}`);
  console.log(`      read ${explicit} · reconstructed ${latent}`);
});

check("Emotional friction improved on the 4.0.3.5 baseline", () => {
  const agg = EmotionalPowerEvaluator.aggregate(run.emotionalPower);
  // 4.0.3.5's lenses asserted rather than opposed; friction was 0.3 of 5.
  assert.ok(agg.by_dimension.emotional_friction * 5 > 1.0,
    `friction ${(agg.by_dimension.emotional_friction * 5).toFixed(1)}/5`);
  console.log(`      emotional power ${agg.mean_score.toFixed(1)}/20, weakest ${agg.weakest}`);
});

check("The metric control still out-scores every derived rung", () => {
  assert.ok(run.sensitivity.observed_reality > run.sensitivity.identity_conflict,
    "if the control no longer wins, check whether the tension has drifted toward restatement");
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
