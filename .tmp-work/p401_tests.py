# -*- coding: utf-8 -*-
"""Phase 4.0.1 — regression tests for the concept reasoning chain."""
import io

p = "lib/image-engine/run-cios-shadow-tests.ts"
s = io.open(p, encoding="utf-8").read()

ANCHOR = '\nconsole.log("\\n" + "=".repeat(72));\nconsole.log(`${passed} passed, ${failed} failed`);'

SECTION = '''
// ── 9. Concept reasoning chain (Phase 4.0.1) ─────────────────────────────
section("9. Concept reasoning chain");

const FASHION: CampaignBriefInput = {
  brand: "Khô",
  product: "Oversized linen shirting collection",
  audience: "Women 25-35 who buy considered basics",
  objective: "Collection launch",
  channel: "Instagram",
  tone: "Understated, tactile, unbranded",
  industry: "Fashion",
  concept: "Clothes that get better wrong",
  assetTypes: ["poster"],
};

// Task 6 — the three named industries, asserted on the same three properties.
for (const [label, brief] of [["Beauty", SKINCARE], ["Food", COFFEE], ["Fashion", FASHION]] as const) {
  check(`${label}: concept exists, contamination is zero, trace is present`, () => {
    const r = asResult(brief);

    // 1. A concept exists.
    assert.ok(r.concept.big_idea, `${label}: no big idea`);
    assert.ok(r.concept.consumer_insight, `${label}: no consumer insight`);

    // 2. Contamination is zero.
    const v = ConceptQualityGate.validate(r.concept, undefined, true);
    const contamination = v.violations.filter(
      (x) => !["MISSING_BIG_IDEA", "INCOMPLETE_CONCEPT"].includes(x.kind)
    );
    assert.deepStrictEqual(
      contamination.map((x) => `${x.kind}:${x.field}:${x.evidence}`),
      [],
      `${label}: concept contaminated by execution language`
    );

    // 3. A reasoning trace exists, with all four steps sourced.
    const chain = r.concept_trace.reasoning_chain;
    assert.ok(chain, `${label}: no reasoning chain`);
    for (const step of ["human_tension", "consumer_insight", "campaign_territory", "big_idea"] as const) {
      assert.ok(chain![step].value, `${label}: chain step ${step} has no value`);
      assert.ok(chain![step].source, `${label}: chain step ${step} has no source`);
    }
    const sources = new Set(
      [chain!.human_tension.source, chain!.consumer_insight.source, chain!.campaign_territory.source, chain!.big_idea.source]
    );
    console.log(`      ${label.padEnd(8)} ${sources.size} distinct source(s) · ${chain!.big_idea.value.slice(0, 56)}`);
  });
}

check("The chain draws on more than one object", () => {
  // The defect this phase repaired: every step used to derive from a single
  // `pickLead` object, so a four-step trace described a one-step derivation.
  let multi = 0;
  for (const brief of [SKINCARE, COFFEE, FASHION]) {
    const chain = asResult(brief).concept_trace.reasoning_chain!;
    const sources = new Set(
      [chain.human_tension.source, chain.consumer_insight.source, chain.campaign_territory.source, chain.big_idea.source].filter(Boolean)
    );
    if (sources.size >= 2) multi++;
  }
  assert.strictEqual(multi, 3, "at least one brief still derives its whole chain from one object");
});

check("Concept relevance scores on five independent signals", () => {
  // Task 3. Asserted per signal rather than on the composite, because a composite
  // can look healthy while one signal is dead — which is how a scorer starts
  // ranking on noise without anyone noticing.
  const repoObjects = repo.getAll().filter((o) => String(o.domain) === "human_tension");
  assert.ok(repoObjects.length > 0, "no tension objects to score");
  const query = { industry: "beauty", audience: "women_35_50", brand_position: "premium" };
  const scored = repoObjects.map((o) =>
    ConceptRetrievalScorer.score(o, query as any, "She is afraid of no longer recognising herself, premium clinical skincare")
  );
  for (const key of ["human_problem", "audience", "brand_position", "industry", "emotional"] as const) {
    assert.ok(
      scored.some((s) => s.signals[key] > 0),
      `signal "${key}" never fired across ${scored.length} objects`
    );
  }
  const best = scored.sort((a, b) => b.total - a.total)[0];
  assert.ok(best.total > 0, "no object scored above zero");
  assert.ok(best.matched.length > 0, "the winner matched no named signal");
});

check("An industry-matched object outranks a universal one", () => {
  const beauty = repo.getAll().find(
    (o) => String(o.domain) === "human_tension" && String(o.context?.industry) === "beauty"
  );
  const universal = repo.getAll().find(
    (o) => String(o.domain) === "human_tension" && String(o.context?.industry) === "*"
  );
  if (!beauty || !universal) {
    console.log("      (no comparable pair in the corpus; skipped)");
    return;
  }
  const q = { industry: "beauty" } as any;
  const a = ConceptRetrievalScorer.score(beauty, q, "beauty brief");
  const b = ConceptRetrievalScorer.score(universal, q, "beauty brief");
  assert.ok(a.signals.industry > b.signals.industry, "industry signal did not discriminate");
});

check("The conflict resolver settles close candidates by priority, not rounding", () => {
  // Task 5. Two candidates within the contention threshold must be decided by a
  // named criterion; picking on a fourth decimal place makes the campaign's
  // central thought an artefact of arithmetic.
  const tensions = repo.getAll().filter((o) => String(o.domain) === "human_tension").slice(0, 6);
  const candidates = tensions.map((o) => ({ object: o, context_relevance: 1, score: 0.5, matches: [] })) as any[];
  const query = { industry: "beauty", audience: "women_35_50", brand_position: "premium" } as any;
  const ranked = ConceptRetrievalScorer.rank(candidates, query, "premium clinical skincare for women who distrust claims");
  const { winner, resolution } = ConceptConflictResolver.resolve("big_idea", ranked, query);
  assert.ok(winner, "no winner selected");
  if (resolution) {
    assert.ok(
      ["AUDIENCE_TRUTH", "BRAND_POSITIONING", "DIFFERENTIATION", "EMOTIONAL_STRENGTH"].includes(resolution.decided_by),
      `unknown priority level ${resolution.decided_by}`
    );
    assert.ok(resolution.rationale.length > 20, "a resolution must explain itself");
    assert.notStrictEqual(resolution.winner, resolution.loser);
    console.log(`      settled by ${resolution.decided_by}`);
  } else {
    console.log("      leader won outright; no conflict to settle");
  }
});

check("The generator can only emit the five permitted fields", () => {
  // Task 4, asserted structurally. Execution fields are absent by construction
  // rather than by validation — a generator with nowhere to put a camera
  // instruction cannot leak one, which is what the Phase 3.1.8.1 contamination
  // proved a gate alone does not guarantee.
  const query = { industry: "beauty" } as any;
  const candidates = repo
    .getAll()
    .filter((o) => CONCEPT_LEAD_DOMAINS.has(String(o.domain)))
    .slice(0, 12)
    .map((o) => ({ object: o, context_relevance: 1, score: 0.5, matches: [] })) as any[];
  const out = CreativeConceptGenerator.generate(candidates, query, "premium skincare, clinical, sceptical audience");
  assert.deepStrictEqual(
    Object.keys(out.concept).sort(),
    ["belief_shift", "big_idea", "campaign_territory", "consumer_insight", "emotional_trigger"]
  );
  for (const forbidden of CONCEPT_FORBIDDEN_FIELDS) {
    assert.ok(!(forbidden in out.concept), `the generator emitted a "${forbidden}" field`);
  }
  // And nothing it emits may read as an instruction.
  const asConcept = {
    big_idea: out.concept.big_idea,
    consumer_insight: out.concept.consumer_insight,
    core_message: "",
    differentiation: "",
  } as any;
  const bad = ConceptQualityGate.validate(asConcept).violations.filter((x) => x.kind !== "MISSING_BIG_IDEA");
  assert.deepStrictEqual(bad.map((x) => x.kind), [], "generator output carries execution language");
});

check("Art direction candidates cannot reach the generator's output", () => {
  // The candidate set is filtered before selection rather than after, so a layout
  // object in the pool cannot become a big idea even by accident.
  const layoutObjects = repo
    .getAll()
    .filter((o) => String(o.domain) === "layout")
    .slice(0, 8)
    .map((o) => ({ object: o, context_relevance: 1, score: 0.9, matches: [] })) as any[];
  const out = CreativeConceptGenerator.generate(layoutObjects, { industry: "beauty" } as any, "a beauty brief");
  assert.strictEqual(out.complete, false, "a layout-only pool must not produce a complete concept");
  assert.strictEqual(out.concept.big_idea, "", "a layout object became a big idea");
  assert.ok(out.trace.warnings.some((w) => w.startsWith("NO_CONCEPT_MATERIAL")));
});
'''

assert ANCHOR in s, "summary anchor missing"
s = s.replace(ANCHOR, SECTION + ANCHOR)
s = s.replace('import { CONCEPT_GROUP, retrievalGroup } from "./reasoning/reasoning-knowledge.types";',
              'import { CONCEPT_GROUP, retrievalGroup } from "./reasoning/reasoning-knowledge.types";\n'
              'import { ConceptRetrievalScorer } from "./reasoning/ConceptRetrievalScorer";\n'
              'import { ConceptConflictResolver } from "./reasoning/ConceptConflictResolver";\n'
              'import { CreativeConceptGenerator } from "./reasoning/CreativeConceptGenerator";\n'
              'import { CONCEPT_FORBIDDEN_FIELDS } from "./reasoning/concept-generation.types";')
io.open(p, "w", encoding="utf-8").write(s)
print("Phase 4.0.1 regression section added")
