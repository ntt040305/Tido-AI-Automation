import assert from "assert";
import { DynamicHumanTensionDiscovery } from "./reasoning/DynamicHumanTensionDiscovery";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { HumanTruthOriginalityEvaluator, ORIGINALITY_WEIGHTS } from "./reasoning/HumanTruthOriginalityEvaluator";
import { CONTRADICTION_FLOOR, InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import { EXPRESSION_MODES, InsightExpressionModes } from "./reasoning/InsightExpressionModes";
import { EXPANSION_TEMPLATES } from "./reasoning/human-situation-expansion.types";
import { MOTIVATION_FAMILIES } from "./reasoning/human-motivation.types";
import { HumanInsight } from "./reasoning/human-insight.types";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runInsightBenchmark } from "./run-insight-benchmark";

/**
 * CIOS Phase 4.0.3.7 verification.
 *
 * The failure this phase can introduce is expansion: a third route to a
 * behaviour is a third opportunity to present an assembly as a finding. Most of
 * what follows guards that boundary.
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
console.log("CIOS PHASE 4.0.3.7 — HUMAN INSIGHT CLOSURE");
console.log("=".repeat(74));

const { cases } = loadConceptBenchmark();
const EXPANDED = {
  challenge: "Her skin has reacted badly before, and the memory of that outweighs any improvement a new product could promise.",
  audience: "Women 30 to 45",
  product: "A barrier repair cream",
  category: "beauty",
};
const EXPLICIT = {
  challenge: "She calculates resale value at the moment of purchase and no brand will acknowledge it.",
  audience: "Women 30 to 45",
  product: "A wool coat",
  category: "fashion",
};

// ── 1. Situation expansion ────────────────────────────────────────────────
section("1. Human Situation Expansion Layer");

check("Every field the phase specifies is produced", () => {
  const family = MOTIVATION_FAMILIES.find((f) => f.id === "HARM_MEMORY")!;
  const e = DynamicHumanTensionDiscovery.expandSituation(EXPANDED.challenge, family, EXPANDED);
  assert.ok(e, "no expansion for a family that has a template");
  for (const f of ["surface_statement", "constructed_situation", "implied_behavior",
                   "occasion", "what_is_weighed"] as const) {
    assert.ok(String(e![f] || "").trim(), `${f} is empty`);
  }
  assert.ok(e!.built_from.length > 0, "the expansion does not say what it was built from");
});

check("Expansion is the third stage, never the first", () => {
  // A brief that says what someone does must be read, not assembled.
  assert.strictEqual(DynamicHumanTensionDiscovery.discover(EXPLICIT)!.source, "EXPLICIT");
  const expanded = DynamicHumanTensionDiscovery.discover(EXPANDED);
  assert.strictEqual(expanded!.source, "EXPANDED");
  assert.ok(expanded!.expanded, "an expanded tension must carry what was assembled");
});

check("Three routes, three confidence ceilings, in order", () => {
  // An assembly presented as a reading is a claim the brief never made.
  const explicit = DynamicHumanTensionDiscovery.discover(EXPLICIT)!;
  const expanded = DynamicHumanTensionDiscovery.discover(EXPANDED)!;
  assert.ok(expanded.confidence <= 0.45, `expanded confidence ${expanded.confidence}`);
  assert.ok(explicit.confidence > expanded.confidence);
});

check("Expansion invents no emotion", () => {
  // The rule that governs the whole layer. Every emotional term in an expanded
  // situation belongs to the family, and the family matched on words that are
  // actually in the brief.
  const FEELING = /\b(?:afraid|fear|anxious|ashamed|shame|guilt|angry|sad|worried|hurt|proud|excited|frustrat)\w*/i;
  for (const [id, t] of Object.entries(EXPANSION_TEMPLATES)) {
    assert.ok(!FEELING.test(t.implied_behavior), `${id}.implied_behavior names a feeling: ${t.implied_behavior}`);
    assert.ok(!FEELING.test(t.occasion), `${id}.occasion names a feeling: ${t.occasion}`);
  }
});

check("A family without a template expands to nothing", () => {
  const fake = { ...MOTIVATION_FAMILIES[0], id: "NO_SUCH_FAMILY" };
  assert.strictEqual(DynamicHumanTensionDiscovery.expandSituation("x", fake, {}), null);
});

check("Expansion adds structure without adding depth", () => {
  // Five layers always come back. An assembled stack must not score as an
  // evidenced one.
  const family = MOTIVATION_FAMILIES[0];
  const read = DynamicHumanTensionDiscovery.buildStack(family, { behaviour: "checks the label twice", situation: "x" });
  const assembled = DynamicHumanTensionDiscovery.buildStack(family, {
    behaviour: "checks the label twice",
    situation: "x",
    expanded: { occasion: "a moment", what_is_weighed: "a thing" } as any,
  });
  assert.ok(assembled.depth_score < read.depth_score, `${assembled.depth_score} vs ${read.depth_score}`);
});

check("Discovery coverage clears the phase target", () => {
  const covered = cases.filter((c) =>
    DynamicHumanTensionDiscovery.discover({
      challenge: c.creative_challenge, audience: c.brief.audience || "", product: c.brief.product || "",
    })
  ).length;
  assert.ok(covered >= 80, `coverage ${covered}/100, target was 80`);
  console.log(`      ${covered}/100 (4.0.3.6 was 87, 4.0.3.5 was 45)`);
});

// ── 2. Contradiction ──────────────────────────────────────────────────────
section("2. InsightContradictionEngine");

check("All five parts the phase specifies", () => {
  const i = HumanInsightGenerator.generate({ ...EXPLICIT, market: "vn" });
  const c = InsightContradictionEngine.evaluate(i);
  for (const f of ["desire", "fear", "tradeoff", "tension"] as const) {
    assert.ok(String(c[f] || "").trim(), `${f} is empty`);
  }
  assert.ok(typeof c.contradiction_strength === "number");
});

check("An insight with no contradiction is rejected, not scored down", () => {
  // "People want to be treated well" is true and nothing follows from it.
  const empty: HumanInsight = {
    human_truth: "People want to be treated well.",
    consumer_insight: "x", why_people_feel_this: "y", why_now: "z",
    ladder: [], archetype: "NONE", warnings: [],
  };
  const c = InsightContradictionEngine.evaluate(empty);
  assert.strictEqual(c.passed, false);
  assert.strictEqual(c.contradiction_strength, 0);
  assert.ok(c.reasons.some((r) => /No desire|No fear|No tradeoff|No tension/.test(r)), c.reasons.join(" | "));
});

check("A desire opposed to its own restatement is not a contradiction", () => {
  // The failure this engine exists to catch: all four parts present, nothing
  // actually opposed.
  const i = HumanInsightGenerator.generate({ ...EXPLICIT, market: "vn" });
  const c = InsightContradictionEngine.evaluate(i);
  // Same string in both slots must not pass.
  const degenerate = InsightContradictionEngine.evaluate({
    ...i,
    dynamic_tension: {
      ...i.dynamic_tension!,
      motivation: {
        ...i.dynamic_tension!.motivation,
        functional_need: "to be able to check the price",
        social_consequence: "to be able to check the price",
      },
    },
  } as HumanInsight);
  assert.ok(
    degenerate.contradiction_strength < c.contradiction_strength,
    `${degenerate.contradiction_strength} vs ${c.contradiction_strength}`
  );
});

check("The floor is stated, not hidden", () => {
  assert.ok(CONTRADICTION_FLOOR > 0 && CONTRADICTION_FLOOR < 1);
});

check("A rejected insight is never expressed", () => {
  // The gate exists to stop that concept being built. If expression proceeded
  // anyway the gate would be decoration.
  const src = require("fs").readFileSync("lib/image-engine/run-insight-benchmark.ts", "utf-8");
  assert.ok(/contradiction\.passed\s*\n?\s*\?\s*InsightExpressionModes\.express/.test(src.replace(/\s+/g, " ").replace(/ /g, " ")) ||
    /contradiction\.passed/.test(src), "the runner does not gate expression on the contradiction");
  const gated = src.slice(src.indexOf("const modeExpressions"), src.indexOf("const lensesAvailable"));
  assert.ok(/contradiction\.passed/.test(gated), gated.slice(0, 200));
});

// ── 3. Truth originality ──────────────────────────────────────────────────
section("3. HumanTruthOriginalityEvaluator");

check("All four questions, weighted to 100", () => {
  assert.strictEqual(Object.values(ORIGINALITY_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const r = HumanTruthOriginalityEvaluator.evaluate("People give up privacy long before they will ask to keep it.");
  assert.deepStrictEqual(r.findings.map((f) => f.question), [
    "familiarity", "perspective_shift", "strategic_implication", "emotional_surprise",
  ]);
});

check("A stock line scores zero on familiarity", () => {
  const r = HumanTruthOriginalityEvaluator.evaluate("People don't buy the product, they buy the feeling.");
  const fam = r.findings.find((f) => f.question === "familiarity")!;
  assert.strictEqual(fam.score, 0, fam.evidence);
  assert.strictEqual(r.verdict, "STOCK");
});

check("A truth repeated within a run loses familiarity", () => {
  // Unoriginal in the only sense the client experiences it.
  const truth = "People give up being able to justify the decision later long before they will ask to keep it.";
  const first = HumanTruthOriginalityEvaluator.evaluate(truth, { priorTruths: [] });
  const again = HumanTruthOriginalityEvaluator.evaluate(truth, { priorTruths: [truth] });
  assert.ok(again.score < first.score, `${again.score} vs ${first.score}`);
});

check("Deck vocabulary costs emotional surprise", () => {
  const r = HumanTruthOriginalityEvaluator.evaluate(
    "The consumer journey reveals a gap in the brand's value proposition."
  );
  const surprise = r.findings.find((f) => f.question === "emotional_surprise")!;
  assert.strictEqual(surprise.score, 0, surprise.evidence);
});

check("An empty truth is STOCK on every question", () => {
  const r = HumanTruthOriginalityEvaluator.evaluate("");
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.verdict, "STOCK");
});

check("The report states what the evaluator can and cannot do", () => {
  const text = HumanTruthOriginalityEvaluator.format(
    HumanTruthOriginalityEvaluator.aggregate([HumanTruthOriginalityEvaluator.evaluate("A truth about people.")])
  );
  assert.ok(/cannot certify that one is/.test(text));
  assert.ok(/floor, not a grade/.test(text));
});

// ── 4. Expression modes ───────────────────────────────────────────────────
section("4. Insight Expression Modes");

check("The six modes the phase names, and no others", () => {
  assert.deepStrictEqual([...EXPRESSION_MODES], [
    "psychological_reversal", "hidden_cost", "identity_paradox",
    "social_pressure", "human_confession", "unexpected_connection",
  ]);
});

check("One insight yields several distinct expressions", () => {
  const i = HumanInsightGenerator.generate({ ...EXPLICIT, market: "vn" });
  const terms = HumanTensionAnalyzer.terms(EXPLICIT);
  const c = InsightContradictionEngine.evaluate(i);
  const e = InsightExpressionModes.express(i, terms, c);
  assert.ok(e.length >= 4, `only ${e.length} modes available`);
  assert.strictEqual(new Set(e.map((x) => x.big_idea)).size, e.length, "two modes produced the same sentence");
  for (const x of e) assert.strictEqual(x.human_truth, i.human_truth, "a mode altered the insight");
  console.log(`      ${e.length} modes: ${e.map((x) => x.mode).join(", ")}`);
});

check("A mode carries more than one frame, so two briefs need not match", () => {
  // The point of Task 4. In 4.0.3.6 a mode had one shape and two briefs reaching
  // it produced the same sentence with two nouns swapped.
  const shapes = new Set<string>();
  for (const c of cases.slice(0, 40)) {
    const i = HumanInsightGenerator.generate({
      challenge: c.creative_challenge, audience: c.brief.audience || "",
      product: c.brief.product || "", category: c.industry, objective: c.brief.objective, market: "vn",
    });
    if (!i.human_truth) continue;
    const terms = HumanTensionAnalyzer.terms({
      challenge: c.creative_challenge, audience: c.brief.audience || "", product: c.brief.product || "", category: c.industry,
    });
    const contradiction = InsightContradictionEngine.evaluate(i);
    if (!contradiction.passed) continue;
    for (const e of InsightExpressionModes.express(i, terms, contradiction)) {
      if (e.mode !== "hidden_cost") continue;
      // Reduce to the frame's skeleton by removing the material.
      shapes.add(e.big_idea.replace(/[a-z]{4,}/gi, "·").slice(0, 40));
    }
  }
  assert.ok(shapes.size >= 2, `hidden_cost produced ${shapes.size} distinct shape(s)`);
  console.log(`      hidden_cost used ${shapes.size} of its 3 frames`);
});

check("An expression is briefable: neither a fragment nor a paragraph", () => {
  const i = HumanInsightGenerator.generate({ ...EXPLICIT, market: "vn" });
  const terms = HumanTensionAnalyzer.terms(EXPLICIT);
  const c = InsightContradictionEngine.evaluate(i);
  for (const e of InsightExpressionModes.express(i, terms, c)) {
    const n = e.big_idea.split(/\s+/).length;
    assert.ok(n >= 6 && n <= 28, `${n} words: ${e.big_idea}`);
    assert.ok(!/\b(\w+)\s+\1\b/i.test(e.big_idea), `doubled word: ${e.big_idea}`);
    assert.ok(!/in service of/i.test(e.big_idea), `objective leaked into the idea: ${e.big_idea}`);
  }
});

check("No expression without a truth to express", () => {
  const stub: HumanInsight = {
    human_truth: "", consumer_insight: "", why_people_feel_this: "", why_now: "",
    ladder: [], archetype: "NONE", warnings: [],
  };
  const c = InsightContradictionEngine.evaluate(stub);
  assert.deepStrictEqual(InsightExpressionModes.express(stub, {} as any, c), []);
});

// ── 5. End to end ─────────────────────────────────────────────────────────
section("5. The hundred briefs");

const run = runInsightBenchmark(cases);

check("Every brief produces a result", () => {
  assert.strictEqual(run.rows.length, 100);
  assert.strictEqual(run.contradictions.length, 100);
  assert.strictEqual(run.originalities.length, 100);
});

check("Contradiction pass rate clears the phase target", () => {
  const agg = InsightContradictionEngine.aggregate(run.contradictions);
  assert.ok(agg.pass_rate >= 0.7, `pass rate ${(agg.pass_rate * 100).toFixed(0)}%, target was 70%`);
  console.log(`      ${agg.passed}/100 pass, mean strength ${agg.mean_strength.toFixed(2)}`);
});

check("Delivered ideas stay distinct", () => {
  const ideas = run.rows.map((r) => r.big_idea).filter(Boolean);
  assert.strictEqual(new Set(ideas).size, ideas.length);
  console.log(`      ${ideas.length} ideas, all distinct`);
});

check("Every delivered idea came through a mode", () => {
  for (const r of run.rows) {
    if (r.big_idea) assert.ok(r.mode, `${r.case_id} delivered an idea with no mode`);
  }
});

check("Expanded situations remain a minority of the coverage", () => {
  // If most of the coverage came from assembly rather than reading, the number
  // is softer than it looks and the report has to say so.
  const explicit = run.rows.filter((r) => r.discovery_source === "EXPLICIT").length;
  const expanded = run.rows.filter((r) => r.discovery_source === "EXPANDED").length;
  assert.ok(explicit > expanded * 2, `read ${explicit} vs assembled ${expanded}`);
  console.log(
    `      read ${explicit} · reconstructed ${run.rows.filter((r) => r.discovery_source === "LATENT").length}` +
      ` · assembled ${expanded}`
  );
});

check("Truth diversity improved on the 4.0.3.6 baseline", () => {
  const truths = run.rows.map((r) => r.human_truth).filter(Boolean);
  const distinct = new Set(truths).size;
  assert.ok(distinct > 42, `${distinct} distinct truths, 4.0.3.6 had 42`);
  console.log(`      ${distinct}/${truths.length} distinct truths`);
});

check("The metric control still out-scores every derived rung", () => {
  assert.ok(run.sensitivity.observed_reality > run.sensitivity.identity_conflict);
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
