import assert from "assert";
import { BrandDNAOwnership } from "./reasoning/BrandDNAOwnership";
import { CreativeDirectorDecisionEngine } from "./reasoning/CreativeDirectorDecisionEngine";
import { CreativeTerritoryEngine } from "./reasoning/CreativeTerritoryEngine";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { IdeaRankingEngine, GUIDANCE_BAND } from "./reasoning/IdeaRankingEngine";
import { InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import { PatternExtractor } from "./reasoning/PatternExtractor";
import { TasteMemoryRetriever } from "./reasoning/TasteMemoryRetriever";
import { BRAND_DNA_FIXTURES } from "./reasoning/brand-dna.fixtures";
import {
  CREATIVE_STRUCTURES,
  MAX_GUIDED_SHARE,
  MIN_CONTEXT_OBSERVATIONS,
  SATURATION_SHARE,
} from "./reasoning/creative-patterns.types";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * CIOS Phase 4.0.5 verification.
 *
 * The requirement with teeth is the fifth: memory must guide creativity without
 * becoming a formula. Most of what follows checks the three constraints that
 * enforce that — a novelty reserve, saturation suppression, and never touching a
 * score — because each is the kind of thing that is easy to intend and easy to
 * lose.
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
console.log("CIOS PHASE 4.0.5 — CREATIVE TASTE MEMORY");
console.log("=".repeat(74));

const { cases } = loadConceptBenchmark();

// ── 1. PatternExtractor ───────────────────────────────────────────────────
section("1. PatternExtractor");

check("The five structures the phase names", () => {
  assert.deepStrictEqual([...CREATIVE_STRUCTURES], [
    "emotional_reversal", "object_carrying_truth", "human_ritual",
    "identity_transformation", "unexpected_perspective",
  ]);
});

check("Each structure is detected from an idea that plainly uses it", () => {
  const samples: [string, string][] = [
    ["emotional_reversal", "The failure was never women; it is a category that made this cost them."],
    ["object_carrying_truth", "The receipt in her bag is the only honest thing in the shop."],
    ["human_ritual", "Every morning she tidies the flat before the cleaner arrives."],
    ["identity_transformation", "To get it they would have to stop being someone who never asks."],
    ["unexpected_perspective", "Here is what nobody puts in the brief."],
  ];
  for (const [expected, idea] of samples) {
    const found = PatternExtractor.extract(idea).map((d) => d.structure);
    assert.ok(found.includes(expected as any), `${expected} not found in "${idea}" (got ${found.join(", ")})`);
  }
});

check("A flat declarative uses no device, and that is recorded", () => {
  // Rounding an idea up to the nearest structure would make the memory's
  // evidence meaningless.
  const found = PatternExtractor.extract("Quality matters to our customers.");
  assert.deepStrictEqual(found, []);
  assert.strictEqual(PatternExtractor.dominant("Quality matters to our customers."), null);
});

check("An idea can carry more than one device", () => {
  const found = PatternExtractor.extract(
    "Every morning she covers the receipt with her hand, because she would have to stop being someone who never explains."
  );
  assert.ok(found.length >= 2, `only ${found.length} device(s) found`);
  assert.ok(found[0].strength >= found[found.length - 1].strength, "not sorted by strength");
});

check("A structure is not the template that produced it", () => {
  // Two different frames producing the same device is the case that matters:
  // the device is what transfers between briefs, the template is not.
  const a = PatternExtractor.dominant("The receipt is where the real price is paid.");
  const b = PatternExtractor.dominant("Nobody thinks the receipt matters. It is the only thing that does.");
  assert.strictEqual(a, "object_carrying_truth");
  assert.strictEqual(b, "object_carrying_truth");
});

// ── 2. Capture ────────────────────────────────────────────────────────────
section("2. TasteMemoryRetriever — capture");

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

function seed(memory: TasteMemoryRetriever, n: number, industry = "fashion"): void {
  for (let i = 0; i < n; i++) {
    const r = ranking.ranked[i % ranking.ranked.length];
    const decision = CreativeDirectorDecisionEngine.decide(r, {
      case_id: `seed-${i}`, human_truth: insight.human_truth, territory,
    });
    memory.capture(decision, r, {
      industry, brand: "Ao", family: "PRICE_EXPOSURE", human_truth: insight.human_truth,
    });
  }
}

check("A captured record holds why it worked and why it failed", () => {
  const m = new TasteMemoryRetriever();
  seed(m, 1);
  const [rec] = m.all();
  assert.ok(rec.why_worked.length + rec.why_failed.length >= 6, "the decision chain was not recorded");
  assert.ok(["PURSUE", "MODIFY", "REJECT"].includes(rec.decision));
  assert.ok(rec.context.industry && rec.context.family, "no context to retrieve on");
  assert.ok(rec.interpretation_band, "the interpretation band was not carried");
});

check("The reasons come from the decision, so memory cannot disagree with it", () => {
  const m = new TasteMemoryRetriever();
  seed(m, 1);
  const [rec] = m.all();
  const decision = CreativeDirectorDecisionEngine.decide(ranking.ranked[0], {
    case_id: "seed-0", human_truth: insight.human_truth, territory,
  });
  const supports = decision.chain.filter((c) => c.verdict === "SUPPORTS").length;
  assert.strictEqual(rec.why_worked.length, supports);
});

// ── 3. Retrieval, and the three constraints ───────────────────────────────
section("3. TasteMemoryRetriever — guidance, not formula");

check("Below the evidence floor it declines to guide at all", () => {
  const m = new TasteMemoryRetriever();
  seed(m, MIN_CONTEXT_OBSERVATIONS - 1);
  const g = m.retrieve({ industry: "fashion" });
  assert.strictEqual(g.confident, false);
  assert.deepStrictEqual(g.suggested, []);
  assert.strictEqual(g.novelty_reserve, 1, "an unconfident retrieval must leave everything unguided");
  assert.ok(g.notes.some((n) => /guiding on noise/.test(n)), g.notes.join(" | "));
});

check("A novelty reserve always survives, however much evidence accumulates", () => {
  // The single constraint that stops a memory closing the search space it was
  // meant to inform.
  const m = new TasteMemoryRetriever();
  seed(m, 400);
  const g = m.retrieve({ industry: "fashion" });
  assert.ok(g.confident);
  assert.ok(
    g.novelty_reserve >= 1 - MAX_GUIDED_SHARE - 1e-9,
    `the reserve fell to ${g.novelty_reserve}, below the floor of ${1 - MAX_GUIDED_SHARE}`
  );
  assert.ok(g.novelty_reserve > 0, "the reserve reached zero");
});

check("A succeeding structure is still suppressed once it saturates the run", () => {
  // Success is exactly when a structure is most likely to take over a run, so
  // that is when the brake has to be strongest.
  const m = new TasteMemoryRetriever();
  seed(m, 20);
  const runSoFar = new Array(10).fill("object_carrying_truth") as any[];
  const g = m.retrieve({ industry: "fashion" }, runSoFar);
  const sat = g.saturated.find((s) => s.structure === "object_carrying_truth");
  assert.ok(sat, `not flagged saturated at ${SATURATION_SHARE * 100}% share`);
  assert.ok(sat!.share > SATURATION_SHARE);
  // And the order must actually demote it.
  const order = TasteMemoryRetriever.order(g);
  assert.ok(
    order.indexOf("object_carrying_truth") > 0,
    "a saturated structure was still ordered first"
  );
});

check("Untried structures are returned, not filtered out", () => {
  // A memory that only returns winners narrows every run it touches.
  const m = new TasteMemoryRetriever();
  seed(m, 20);
  const g = m.retrieve({ industry: "fashion" });
  assert.ok(g.untried.length > 0, "no untried structure was surfaced");
  const order = TasteMemoryRetriever.order(g);
  assert.strictEqual(order.length, CREATIVE_STRUCTURES.length, "the order dropped a structure");
  assert.strictEqual(new Set(order).size, CREATIVE_STRUCTURES.length, "the order duplicated one");
});

check("An untried structure outranks a saturated one", () => {
  const m = new TasteMemoryRetriever();
  seed(m, 20);
  const g = m.retrieve({ industry: "fashion" }, new Array(10).fill("object_carrying_truth") as any[]);
  const order = TasteMemoryRetriever.order(g);
  if (g.untried.length) {
    assert.ok(
      order.indexOf(g.untried[0]) < order.indexOf("object_carrying_truth"),
      "a saturated structure outranked one nobody has tried"
    );
  }
});

// ── 4. Guidance touches order, never value ────────────────────────────────
section("4. The line: order, not score");

check("Guidance never changes a score", () => {
  const withGuidance = IdeaRankingEngine.rank(ideas, territory, {
    case_id: "t", brand: "Ao", product: BRIEF.product, human_truth: insight.human_truth,
    brandDNA: dna, structureRank: () => 0,
  });
  const without = IdeaRankingEngine.rank(ideas, territory, {
    case_id: "t", brand: "Ao", product: BRIEF.product, human_truth: insight.human_truth,
    brandDNA: dna,
  });
  const byIdea = new Map(without.ranked.map((r) => [r.idea, r.score]));
  for (const r of withGuidance.ranked) {
    assert.strictEqual(r.score, byIdea.get(r.idea), `the score of "${r.idea}" moved`);
  }
});

check("Guidance cannot reorder ideas outside the band", () => {
  // An idea that scores materially higher wins however unfashionable its
  // structure. Reversing the rank must not change a wide-gap ordering.
  const reversed = IdeaRankingEngine.rank(ideas, territory, {
    case_id: "t", brand: "Ao", product: BRIEF.product, human_truth: insight.human_truth,
    brandDNA: dna, structureRank: (idea) => -idea.length,
  });
  for (let i = 1; i < reversed.ranked.length; i++) {
    const gap = reversed.ranked[i - 1].score - reversed.ranked[i].score;
    assert.ok(gap >= -GUIDANCE_BAND, `an ordering inverted by ${-gap} points, beyond the band`);
  }
});

check("The reported band is small enough to be a tie-break", () => {
  assert.ok(GUIDANCE_BAND > 0 && GUIDANCE_BAND <= 10, `a band of ${GUIDANCE_BAND} is not a tie-break`);
});

check("No rubric is imported by the memory layer", () => {
  const fs = require("fs");
  for (const f of ["TasteMemoryRetriever", "PatternExtractor"]) {
    const src = fs.readFileSync(`lib/image-engine/reasoning/${f}.ts`, "utf-8");
    for (const rubric of ["TASTE_WEIGHTS", "DIRECTOR_WEIGHTS", "RANKING_WEIGHTS", "MEMORY_WEIGHTS"]) {
      assert.ok(!src.includes(rubric), `${f} touches ${rubric}`);
    }
  }
});

// ── 5. End to end, and the A/B ────────────────────────────────────────────
section("5. The hundred briefs");

const off = runTasteBenchmark(cases, { useTasteMemory: false });
const on = runTasteBenchmark(cases, { useTasteMemory: true });

check("Every decision is captured in both arms", () => {
  // Capture is bookkeeping; the A/B compares *using* memory, not keeping it.
  assert.strictEqual(off.tasteMemory.size(), off.decisions.length);
  assert.strictEqual(on.tasteMemory.size(), on.decisions.length);
  assert.ok(on.tasteMemory.size() > 0);
  console.log(`      ${on.tasteMemory.size()} decisions captured`);
});

check("Guidance reaches briefs only after the evidence floor is met", () => {
  assert.strictEqual(off.guidanceApplied, 0, "guidance ran in the control arm");
  assert.ok(on.guidanceApplied > 0, "guidance never ran in the treatment arm");
  console.log(`      guidance reached ${on.guidanceApplied}/100 briefs`);
});

check("The reorder mechanism fires — it is starved, not inert", () => {
  // A zero delta could mean a well-restrained memory or a broken one. This is
  // the check that tells them apart.
  assert.ok(on.guidanceReordered > 0, "guidance never reordered anything");
  console.log(
    `      reordered on ${on.guidanceReordered} briefs · only ${on.guidanceEligible} had two ` +
      "viable candidates within the band"
  );
});

check("Structures are extracted across the run and reported honestly", () => {
  const agg = PatternExtractor.aggregate(on.structures);
  assert.strictEqual(agg.ideas, on.structures.length);
  const used = Object.values(agg.by_structure).filter((n) => n > 0).length;
  assert.ok(used >= 2, `only ${used} structure(s) ever produced`);
  console.log(
    `      ${used}/5 structures produced · ${agg.structureless} ideas used no device` +
      (agg.never_produced.length ? ` · never produced: ${agg.never_produced.join(", ")}` : "")
  );
});

check("Memory does not narrow the run", () => {
  // The formula failure would show here first: fewer distinct structures, or
  // more ideas collapsing onto one device.
  const a = PatternExtractor.aggregate(off.structures);
  const b = PatternExtractor.aggregate(on.structures);
  const usedA = Object.values(a.by_structure).filter((n) => n > 0).length;
  const usedB = Object.values(b.by_structure).filter((n) => n > 0).length;
  assert.ok(usedB >= usedA, `structures used fell from ${usedA} to ${usedB} with memory on`);
  const topA = Math.max(...Object.values(a.by_structure));
  const topB = Math.max(...Object.values(b.by_structure));
  assert.ok(topB <= topA * 1.25 + 2, `the leading structure grew from ${topA} to ${topB}`);
});

check("Ideas remain distinct with memory on", () => {
  const delivered = on.rows.map((r) => r.recommended).filter(Boolean) as string[];
  assert.strictEqual(new Set(delivered).size, delivered.length);
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
