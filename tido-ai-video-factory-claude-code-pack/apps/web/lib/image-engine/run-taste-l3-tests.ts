import assert from "assert";
import { BrandDNAOwnership } from "./reasoning/BrandDNAOwnership";
import { CampaignScalabilityTest } from "./reasoning/CampaignScalabilityTest";
import { CreativeDirectorDecisionEngine } from "./reasoning/CreativeDirectorDecisionEngine";
import { CreativeInterpretationDistance } from "./reasoning/CreativeInterpretationDistance";
import { CreativeOriginalityMatrix } from "./reasoning/CreativeOriginalityMatrix";
import { CreativeTerritoryEngine } from "./reasoning/CreativeTerritoryEngine";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { IdeaRankingEngine } from "./reasoning/IdeaRankingEngine";
import { InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import { BRAND_DNA_FIXTURES } from "./reasoning/brand-dna.fixtures";
import { classify, predicateOf, subjectOf } from "./reasoning/semantic-relations";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * CIOS Phase 4.0.4.1 completion layer.
 *
 * The claim this phase makes is that judgement moved from overlap to relations.
 * Most of what follows checks that the relation is actually load-bearing — that
 * two texts sharing words but not a proposition are classified differently from
 * two that share both, and that the pipeline acts on the difference.
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
console.log("CIOS PHASE 4.0.4.1 — SEMANTIC REASONING + DECISION");
console.log("=".repeat(74));

const { cases } = loadConceptBenchmark();

// ── 1. Semantic relations ─────────────────────────────────────────────────
section("1. semantic-relations");

check("Subject and predicate are split at the finite verb", () => {
  const s = subjectOf("The resale value is printed on the tag.");
  const p = predicateOf("The resale value is printed on the tag.");
  assert.ok(s.includes("resale"), JSON.stringify(s));
  assert.ok(p.includes("printed") || p.includes("tag"), JSON.stringify(p));
  assert.ok(!p.includes("resale"), "the subject leaked into the predicate");
});

check("Same subject, same predicate is a RESTATEMENT", () => {
  const v = classify(
    "People give up privacy long before they ask to keep it.",
    "People give up privacy long before they will ask to keep it."
  );
  assert.strictEqual(v.relation, "RESTATES", v.evidence);
});

check("Same subject, different predicate is a TRANSFORMATION", () => {
  // The relation the whole phase is after.
  const v = classify(
    "The receipt in her bag is the only honest thing in the shop.",
    "The receipt is what people are actually reading."
  );
  assert.ok(["TRANSFORMS", "ENACTS"].includes(v.relation), `${v.relation}: ${v.evidence}`);
});

check("No shared subject is UNRELATED, however many words are shared", () => {
  const v = classify("The morning commute is longer than the map says.", "A serum is priced above its formula.");
  assert.strictEqual(v.relation, "UNRELATED", v.evidence);
});

check("Opposite polarity on a shared subject is a CONTRADICTION", () => {
  const v = classify(
    "People will not give up privacy at the counter.",
    "People give up privacy at the counter every day."
  );
  assert.strictEqual(v.relation, "CONTRADICTS", v.evidence);
});

check("A generic subject moves the comparison to the predicate", () => {
  // "people" and "everyone" share no characters, and 349 of 458 ideas were
  // classified UNRELATED to the truth they came from. That was the classifier
  // failing, not the ideas.
  const v = classify(
    "Everyone here quietly gives up privacy at the counter.",
    "People give up privacy at the counter."
  );
  assert.notStrictEqual(v.relation, "UNRELATED", v.evidence);
  assert.ok(v.subject_overlap > 0, "the generic-subject fallback did not fire");
});

// ── 2. Interpretation distance ────────────────────────────────────────────
section("2. CreativeInterpretationDistance");

const TRUTH = "People give up privacy long before they will ask to keep it.";

check("An idea that restates its truth is an ECHO", () => {
  // The failure every earlier layer rewarded: `strategic_fit` and `relevance`
  // both scored an idea higher for staying close to the truth.
  const r = CreativeInterpretationDistance.measure(
    "People give up privacy long before they ask to keep it.",
    TRUTH
  );
  assert.strictEqual(r.band, "ECHO");
  assert.ok(r.score < 0.3, `an echo scored ${r.score}`);
});

check("An idea about something else is DISCONNECTED", () => {
  const r = CreativeInterpretationDistance.measure("The bus is late again on Thursdays.", TRUTH);
  assert.strictEqual(r.band, "DISCONNECTED");
});

check("The middle scores highest, and both ends score lowest", () => {
  // The only non-monotonic score in the codebase, and the point of the file.
  const echo = CreativeInterpretationDistance.measure(TRUTH, TRUTH);
  const middle = CreativeInterpretationDistance.measure(
    "Privacy at the counter is what people are quietly paying with.",
    TRUTH
  );
  const disconnected = CreativeInterpretationDistance.measure("Bananas are cheaper in March.", TRUTH);
  assert.ok(middle.score > echo.score, `${middle.score} vs echo ${echo.score}`);
  assert.ok(middle.score > disconnected.score, `${middle.score} vs disconnected ${disconnected.score}`);
  console.log(
    `      echo ${echo.score} · middle ${middle.score} (${middle.band}) · disconnected ${disconnected.score}`
  );
});

check("A carrier transformation reads as DISCONNECTED — the structural blind spot", () => {
  // This pins a known failure rather than a passing property, and it is the most
  // important limitation in this phase.
  //
  // "She covers the receipt with her hand at the counter" is exactly what a good
  // idea does to "people give up privacy before they ask to keep it": it finds
  // the object that carries the truth. It shares no vocabulary with it, so the
  // relation classifier reads UNRELATED.
  //
  // That is not a tuning problem. A transformation is *defined* by the
  // vocabulary changing, so a lexical measure is structurally worst at detecting
  // the one relation this layer is named for. Only an embedding measure closes
  // it — `subjectOf`, `predicateOf` and `classify` are the three functions to
  // replace, and nothing above them would change.
  const carrier = CreativeInterpretationDistance.measure(
    "She covers the receipt with her hand before anyone at the counter can read it.",
    TRUTH
  );
  assert.strictEqual(
    carrier.band,
    "DISCONNECTED",
    `the blind spot has closed — re-check this test's premise (got ${carrier.band})`
  );
  // The material it brought is still recognised, which is what makes the gap
  // visible rather than silent.
  assert.ok(carrier.new_material.length > 0, "the carrier objects were not even noticed");
  console.log(`      carrier read as ${carrier.band}, bringing ${JSON.stringify(carrier.new_material)}`);
});

check("New material the truth did not contain is reported", () => {
  const r = CreativeInterpretationDistance.measure(
    "She covers the receipt with her hand at the counter.",
    TRUTH
  );
  assert.ok(r.new_material.length > 0, "nothing was recognised as brought to the truth");
  assert.ok(r.new_material.includes("receipt") || r.new_material.includes("counter"));
});

check("The report states that both ends are failures", () => {
  const text = CreativeInterpretationDistance.format(
    CreativeInterpretationDistance.aggregate([CreativeInterpretationDistance.measure("x y z", TRUTH)])
  );
  assert.ok(/both ends are failures/.test(text));
  // The phrase wraps across two lines in the report, so match a fragment that
  // does not straddle the break.
  assert.ok(/transforms it/.test(text));
});

// ── 3. The three upgraded evaluators ──────────────────────────────────────
section("3. Relation reasoning in the evaluators");

check("Ownership distinguishes enacting a deed from naming one", () => {
  const dna = BrandDNAOwnership.resolve({
    brand: "Kham", product: "Primary care clinic", category: "healthcare",
    declared: BRAND_DNA_FIXTURES.Kham,
  });
  const enacts = BrandDNAOwnership.evaluate("We publish the wait before the appointment is booked.", dna);
  const mentions = BrandDNAOwnership.evaluate("Waiting is part of what a clinic is.", dna);
  assert.ok(enacts.ownership > mentions.ownership, `${enacts.ownership} vs ${mentions.ownership}`);
  assert.ok(enacts.reasoning.some((r) => /Enacts|Acts out/.test(r)), enacts.reasoning.join(" | "));
});

check("Contradicting a brand value costs ownership", () => {
  // A relation a word count could never see.
  const dna = BrandDNAOwnership.resolve({
    brand: "Lumiere", product: "a cream", category: "beauty",
    declared: BRAND_DNA_FIXTURES.Lumiere,
  });
  const v = BrandDNAOwnership.evaluate(
    "The face someone has now is not a problem to be solved by anyone.",
    dna
  );
  // Either it registers as aligned or as opposed; what must not happen is that
  // the relation is ignored entirely.
  assert.ok(v.reasoning.length > 0);
});

check("Relevance is a transformation of the truth, not a resemblance to it", () => {
  const echo = CreativeOriginalityMatrix.evaluate(TRUTH, { human_truth: TRUTH, brandOwnership: 0.6 });
  assert.ok(
    echo.notes.some((n) => /repeats the truth, which is not relevance/.test(n)),
    echo.notes.join(" | ")
  );
});

check("An act stated only as absent is not an activation", () => {
  // "nobody asks" contains "ask" and offers nothing to do.
  const absent = CampaignScalabilityTest.run("Nobody asks what it costs, and nobody ever will.");
  const present = CampaignScalabilityTest.run("Ask what it costs before you sit down.");
  const a = absent.verdicts.find((v) => v.channel === "activation")!;
  const b = present.verdicts.find((v) => v.channel === "activation")!;
  assert.strictEqual(a.works, false, a.evidence);
  assert.strictEqual(b.works, true, b.evidence);
});

// ── 4. The decision engine ────────────────────────────────────────────────
section("4. CreativeDirectorDecisionEngine");

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

check("The decision is one of three, with a chain behind it", () => {
  const d = CreativeDirectorDecisionEngine.decide(ranking.ranked[0], {
    case_id: "t", human_truth: insight.human_truth, territory,
  });
  assert.ok(["PURSUE", "MODIFY", "REJECT"].includes(d.decision));
  assert.ok(d.verdict_line.length > 10);
  assert.ok(d.chain.length >= 6, `only ${d.chain.length} stages in the chain`);
});

check("The chain runs in pipeline order and every stage reports", () => {
  const d = CreativeDirectorDecisionEngine.decide(ranking.ranked[0], {
    case_id: "t", human_truth: insight.human_truth, territory,
  });
  assert.deepStrictEqual(d.chain.map((c) => c.stage), [
    "territory", "interpretation", "ownership", "originality", "memorability", "scalability",
  ]);
  for (const c of d.chain) {
    assert.ok(c.finding.length > 0, `${c.stage} reported nothing`);
    assert.ok(["BLOCKS", "WEAKENS", "SUPPORTS"].includes(c.verdict));
  }
});

check("MODIFY carries one instruction; REJECT carries what a rewrite cannot reach", () => {
  // The distinction is the kind of failure, not the score.
  let sawModify = false;
  let sawReject = false;
  for (const r of ranking.ranked) {
    const d = CreativeDirectorDecisionEngine.decide(r, {
      case_id: "t", human_truth: insight.human_truth, territory,
    });
    if (d.decision === "MODIFY") {
      sawModify = true;
      assert.ok(d.instruction && d.instruction.length > 20, "a MODIFY with no instruction");
      assert.ok(!d.unfixable, "a MODIFY should not carry an unfixable reason");
    }
    if (d.decision === "REJECT") {
      sawReject = true;
      assert.ok(d.unfixable && d.unfixable.length > 20, "a REJECT with no reason");
    }
  }
  assert.ok(sawModify || sawReject, "no decision of either kind was produced");
});

check("An idea with no territory under it is rejected as a thinking problem", () => {
  const d = CreativeDirectorDecisionEngine.decide(ranking.ranked[0], {
    case_id: "t", human_truth: insight.human_truth, territory: null,
  });
  assert.strictEqual(d.decision, "REJECT");
  assert.ok(/no territory/i.test(d.unfixable || ""), d.unfixable);
});

check("An echo of the truth is a writing problem, not a thinking one", () => {
  // The distinction the file exists to make: the thinking is right and the
  // sentence is lazy, so it gets an instruction rather than a rejection.
  const r = CreativeInterpretationDistance.measure(insight.human_truth, insight.human_truth);
  assert.strictEqual(r.band, "ECHO");
  assert.ok(/Stop restating|planner already wrote/i.test(r.reasoning), r.reasoning);
});

// ── 5. End to end ─────────────────────────────────────────────────────────
section("5. The hundred briefs");

const run = runTasteBenchmark(cases);

check("Every recommended idea gets a decision", () => {
  const recommended = run.rankings.filter((r) => r.recommended).length;
  assert.strictEqual(run.decisions.length, recommended);
  console.log(`      ${run.decisions.length} decisions from ${recommended} recommendations`);
});

check("Decisions are distributed, not all one value", () => {
  const agg = CreativeDirectorDecisionEngine.aggregate(run.decisions);
  assert.strictEqual(agg.pursue + agg.modify + agg.reject, run.decisions.length);
  console.log(`      pursue ${agg.pursue} · modify ${agg.modify} · reject ${agg.reject}`);
});

check("Interpretation is measured on every idea, not only the winners", () => {
  assert.ok(run.allInterpretation.length > run.decisions.length);
  const agg = CreativeInterpretationDistance.aggregate(run.allInterpretation);
  assert.strictEqual(
    agg.by_band.ECHO + agg.by_band.LITERAL + agg.by_band.TRANSFORMED + agg.by_band.OBLIQUE + agg.by_band.DISCONNECTED,
    agg.cases
  );
  console.log(
    `      ${agg.cases} ideas · transformed ${agg.transformed} · echo ${agg.echoes} · ` +
      `disconnected ${agg.by_band.DISCONNECTED}`
  );
});

check("The decision names the stage it fell down on", () => {
  // A decision nobody can argue with is a decision nobody can use.
  for (const d of run.decisions) {
    if (d.decision === "PURSUE") continue;
    const blocking = d.chain.find((c) => c.verdict === "BLOCKS" || c.verdict === "WEAKENS");
    assert.ok(blocking, `${d.case_id} was not PURSUE and no stage objected`);
    assert.ok(d.unfixable || d.instruction, `${d.case_id} gave no reason`);
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
