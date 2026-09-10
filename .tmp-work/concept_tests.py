# -*- coding: utf-8 -*-
"""Phase 3.1.8.1 — tests for the new concept/art-direction contract."""
import io

# ── Shadow suite: a concept is present-and-clean or absent, never fabricated ──
p = "lib/image-engine/run-cios-shadow-tests.ts"
s = io.open(p, encoding="utf-8").read()

s = s.replace('''check("A premium skincare brief produces a complete shadow result", () => {
  const r = asResult(SKINCARE);
  assert.ok(r.retrieved_knowledge_ids.length > 0, "retrieved nothing");
  assert.ok(r.concept.big_idea.length > 0, "no big idea");
  assert.ok(r.summary.art_direction_decisions > 0, "no art direction decisions");''',
'''check("A premium skincare brief produces a complete shadow result", () => {
  const r = asResult(SKINCARE);
  assert.ok(r.retrieved_knowledge_ids.length > 0, "retrieved nothing");
  // Phase 3.1.8.1 changed what "complete" means here. This used to assert a big
  // idea existed, and it passed on a layout rule wearing the label. A big idea is
  // now either genuinely present or explicitly absent — what must never happen is
  // an art direction decision promoted into the concept layer.
  assert.ok(
    ConceptQualityGate.validate(r.concept).violations.every((v) => v.kind === "MISSING_BIG_IDEA"),
    "the concept carries execution language"
  );
  assert.ok(r.summary.art_direction_decisions > 0, "no art direction decisions");''')

s = s.replace('''  assert.notStrictEqual(a.concept.big_idea, b.concept.big_idea, "identical big idea for two categories");''',
'''  // Big ideas are compared only where both briefs produced one. With the concept
  // layer confined to concept-bearing domains, most briefs in this corpus produce
  // none — and two absent ideas being equal is not evidence of anything.
  if (a.concept.big_idea && b.concept.big_idea) {
    assert.notStrictEqual(a.concept.big_idea, b.concept.big_idea, "identical big idea for two categories");
  }''')

s = s.replace('''  assert.ok(r.concept_comparison.cios_big_idea.length > 0);
  assert.strictEqual(typeof r.concept_comparison.cios_accepted, "boolean");''',
'''  assert.strictEqual(typeof r.concept_comparison.cios_accepted, "boolean");''')

s = s.replace('''import { REASONING_ONLY_KNOWLEDGE_FIELDS } from "./reasoning/creative-decision.types";''',
'''import { ConceptQualityGate } from "./reasoning/ConceptQualityGate";
import { REASONING_ONLY_KNOWLEDGE_FIELDS } from "./reasoning/creative-decision.types";''')

# New regression section, appended before the summary.
ANCHOR = '\nconsole.log("\\n" + "=".repeat(72));\nconsole.log(`${passed} passed, ${failed} failed`);'
SECTION = '''
// ── 7. Concept / art direction separation (Phase 3.1.8.1) ────────────────
section("7. Concept / art direction separation");

check("No concept carries layout, camera, lighting or typography instruction", () => {
  // The defect this phase repaired: measured across the thirty benchmark cases,
  // twenty of thirty big ideas were layout rules and only four came from a
  // strategy object. The gate rejects that class of output outright.
  for (const brief of [SKINCARE, COFFEE, THIN]) {
    const r = asResult(brief);
    const v = ConceptQualityGate.validate(r.concept);
    const contamination = v.violations.filter((x) => x.kind !== "MISSING_BIG_IDEA");
    assert.deepStrictEqual(
      contamination.map((x) => `${x.kind}:${x.field}:${x.evidence}`),
      [],
      `${brief.brand}: concept contaminated by execution language`
    );
  }
});

check("A big idea, when present, comes from a concept-bearing domain", () => {
  for (const brief of [SKINCARE, COFFEE]) {
    const r = asResult(brief);
    if (!r.concept.big_idea) continue;
    const source = r.concept_trace.concept_sources.find((s) => s.field === "big_idea");
    const domain = String(source?.knowledge_id || "").split(".")[0];
    assert.ok(
      CONCEPT_LEAD_DOMAINS.has(domain),
      `${brief.brand}: big idea led by "${domain}", which describes execution rather than a reason to care`
    );
  }
});

check("An absent big idea is reported, not fabricated", () => {
  // A corpus gap must surface as a gap. Filling it from an art direction object
  // is what made the gap invisible for the whole of Phase 3.1.
  const r = asResult(SKINCARE);
  if (r.concept.big_idea) return;
  const v = ConceptQualityGate.validate(r.concept);
  assert.ok(v.violations.some((x) => x.kind === "MISSING_BIG_IDEA"), "an absent idea must be reported");
  assert.strictEqual(v.valid, false);
});

check("The gate rejects a contaminated concept and accepts a clean one", () => {
  const dirty = {
    big_idea: "The subject within the upper 65 percent and reserve the lower 35 percent for platform interface",
    consumer_insight: "Reserving the band means the composition survives playback.",
    core_message: "",
    differentiation: "",
  } as any;
  const dv = ConceptQualityGate.validate(dirty, "layout");
  assert.strictEqual(dv.valid, false);
  assert.ok(dv.violations.some((v) => v.kind === "LAYOUT_INSTRUCTION"));
  assert.ok(dv.violations.some((v) => v.kind === "ART_DIRECTION_SOURCE"));
  assert.ok(dv.separation_score <= 3, `contaminated concept scored ${dv.separation_score}`);

  const clean = {
    big_idea: "The step you skip that costs the most",
    consumer_insight: "She has stopped believing brightening claims after a decade of them.",
    core_message: "Proof you can see, in a form you want to hold.",
    differentiation: "The only one that shows its working.",
  } as any;
  const cv = ConceptQualityGate.validate(clean, "strategy");
  assert.strictEqual(cv.valid, true, ConceptQualityGate.format(cv));
  assert.strictEqual(cv.separation_score, 10);
});

check("The gate allows a number that is content, not a specification", () => {
  // The first version of this gate rejected any digit, which would have thrown
  // out "twelve courses" and "two units only" — facts about the offer, not
  // instructions about the frame.
  const okNumbers = {
    big_idea: "Twelve decisions, made for you",
    consumer_insight: "There are two units and everyone knows it.",
    core_message: "A four hundred dollar cream that explains itself.",
    differentiation: "",
  } as any;
  const v = ConceptQualityGate.validate(okNumbers, "strategy");
  assert.strictEqual(v.valid, true, ConceptQualityGate.format(v));
});

check("Every prohibited instruction class is detected", () => {
  const cases: [string, string][] = [
    ["LAYOUT_INSTRUCTION", "Hold the product on the centre axis at 40 percent of frame height"],
    ["CAMERA_INSTRUCTION", "Shoot at eye level on a 50mm lens"],
    ["LIGHTING_INSTRUCTION", "One large diffused key light at 45 degrees"],
    ["TYPOGRAPHY_INSTRUCTION", "Limit the asset to three type levels in a grotesque"],
    ["MATERIAL_INSTRUCTION", "Render the surface texture with a matte finish"],
  ];
  for (const [kind, text] of cases) {
    const v = ConceptQualityGate.validate(
      { big_idea: text, consumer_insight: "", core_message: "", differentiation: "" } as any
    );
    assert.ok(
      v.violations.some((x) => x.kind === kind || x.kind === "MEASUREMENT"),
      `"${text}" was not detected as ${kind}`
    );
  }
});
'''
assert ANCHOR in s, "shadow summary anchor missing"
s = s.replace(ANCHOR, SECTION + ANCHOR)
s = s.replace('import { ConceptQualityGate } from "./reasoning/ConceptQualityGate";',
              'import { ConceptQualityGate } from "./reasoning/ConceptQualityGate";\n'
              'import { CONCEPT_LEAD_DOMAINS } from "./reasoning/concept-validation.types";')
io.open(p, "w", encoding="utf-8").write(s)
print("shadow suite updated + separation section added")

# ── Expansion suite: concepts may be absent, must never be contaminated ──
p = "lib/image-engine/run-knowledge-expansion-tests.ts"
s = io.open(p, encoding="utf-8").read()
OLD = '''check("All three concepts are accepted and distinct", () => {'''
NEW = '''check("No concept is contaminated by art direction (Phase 3.1.8.1)", () => {
  // Replaces an acceptance assertion that passed while twenty of thirty big
  // ideas were layout rules. What matters is that the concept layer stays a
  // concept layer; whether the corpus can currently fill it is a separate,
  // openly reported gap.
  for (const c of [skincare, coffee, fashion]) {
    const v = ConceptQualityGate.validate(c.concept.concept);
    const contamination = v.violations.filter((x) => x.kind !== "MISSING_BIG_IDEA");
    assert.deepStrictEqual(contamination.map((x) => x.kind), [], ConceptQualityGate.format(v));
  }
});

check("All three concepts are accepted and distinct", () => {'''
assert OLD in s, "expansion anchor missing"
s = s.replace(OLD, NEW, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("expansion suite: separation check added")
