# -*- coding: utf-8 -*-
"""Phase 4.0 — regression tests for the Creative Concept Intelligence layer."""
import io

p = "lib/image-engine/run-cios-shadow-tests.ts"
s = io.open(p, encoding="utf-8").read()

ANCHOR = '\nconsole.log("\\n" + "=".repeat(72));\nconsole.log(`${passed} passed, ${failed} failed`);'

SECTION = '''
// ── 8. Creative Concept Intelligence (Phase 4.0) ─────────────────────────
section("8. Creative Concept Intelligence");

check("The concept layer has knowledge to lead from", () => {
  // Phase 3.1.8.1 measured 11 usable concept-bearing objects across 368, which
  // is why the layer produced nothing. This asserts the gap was actually closed.
  const conceptDomains = ["human_tension", "consumer_insight", "campaign_territory", "idea_pattern"];
  const objects = repo.getAll().filter((o) => conceptDomains.includes(String(o.domain)));
  assert.ok(objects.length >= 100, `expected at least 100 concept objects, found ${objects.length}`);
  const leadable = objects.filter((o) => String(o.knowledge_type) === "decision_rule");
  assert.strictEqual(leadable.length, objects.length, "every concept object must be able to lead");
  const industries = new Set(objects.flatMap((o) => (o.domain_profile as any)?.industries || []));
  assert.ok(industries.size >= 6, `concept knowledge spans only ${industries.size} industries`);
  console.log(`      ${objects.length} objects · ${new Set(objects.map((o) => o.domain)).size} domains · ${industries.size} industries`);
});

check("Every concept object carries the full pattern profile", () => {
  const required = ["human_tension", "consumer_insight", "emotional_trigger", "belief_shift", "campaign_territory"];
  const objects = repo.getAll().filter(
    (o) => (o.domain_profile as any)?.kind === "creative_concept_pattern"
  );
  assert.ok(objects.length >= 100, `expected at least 100 pattern profiles, found ${objects.length}`);
  for (const o of objects) {
    const prof = o.domain_profile as any;
    for (const f of required) {
      assert.ok(prof[f] && String(prof[f]).length > 25, `${o.knowledge_id}: thin or missing ${f}`);
    }
  }
});

check("No concept object carries execution language in its decision", () => {
  // The decision becomes a big idea verbatim, so it must clear the concept gate.
  // Authoring-time and runtime rejection have to agree or objects pass one and
  // fail the other.
  const objects = repo.getAll().filter(
    (o) => (o.domain_profile as any)?.kind === "creative_concept_pattern"
  );
  for (const o of objects) {
    const asIdea = { big_idea: o.decision, consumer_insight: "", core_message: "", differentiation: "" } as any;
    const bad = ConceptQualityGate.validate(asIdea).violations.filter((v) => v.kind !== "MISSING_BIG_IDEA");
    assert.deepStrictEqual(
      bad.map((v) => `${v.kind}:${v.evidence}`),
      [],
      `${o.knowledge_id} would produce a contaminated big idea`
    );
  }
});

check("A real brief now produces a big idea from a concept domain", () => {
  const conceptDomains = ["human_tension", "consumer_insight", "campaign_territory", "idea_pattern"];
  for (const brief of [SKINCARE, COFFEE]) {
    const r = asResult(brief);
    assert.ok(r.concept.big_idea, `${brief.brand}: still no big idea`);
    const source = r.concept_trace.concept_sources.find((s) => s.field === "big_idea");
    const domain = String(source?.knowledge_id || "").split(".")[0];
    assert.ok(
      conceptDomains.includes(domain),
      `${brief.brand}: big idea led by "${domain}" rather than a concept domain`
    );
  }
});

check("The reasoning chain records tension, insight, territory and idea", () => {
  // Task 4. Recorded so a weak concept can be traced to the step that failed
  // rather than blamed on synthesis.
  const r = asResult(SKINCARE);
  const chain = r.concept_trace.reasoning_chain;
  assert.ok(chain, "no reasoning chain recorded");
  for (const step of ["human_tension", "consumer_insight", "campaign_territory", "big_idea"] as const) {
    assert.ok(chain![step], `chain is missing ${step}`);
    assert.strictEqual(typeof chain![step].value, "string");
  }
  assert.ok(chain!.human_tension.value, "the chain records no tension");
  assert.ok(chain!.big_idea.source, "the big idea has no recorded source");
  console.log(`      ${chain!.human_tension.source} → ${chain!.big_idea.source}`);
});

check("The human layer is drawn from the pattern, not reverse-engineered", () => {
  // Before Phase 4.0 the insight came from `why_this_works`, which is why it read
  // as a rationale rather than as an observation about a person.
  const r = asResult(SKINCARE);
  const source = r.concept_trace.concept_sources.find((s) => s.field === "consumer_insight");
  assert.strictEqual(
    source?.derivation,
    "concept_pattern.consumer_insight",
    `insight derived from "${source?.derivation}" rather than the concept pattern`
  );
});

check("The completeness gate requires all four elements", () => {
  // Task 5, asserted in both directions so the gate is not merely permissive.
  const complete = {
    big_idea: "The step you skip that costs the most",
    audience_tension: "She knows what she should do and has no time in which to do it.",
    consumer_insight: "The competitor is the decision to skip it entirely.",
    emotional_goal: "Relief at permission to do less.",
    differentiation: "The only one that argues for less.",
    core_message: "Less, done properly.",
  } as any;
  assert.strictEqual(ConceptQualityGate.validate(complete, "human_tension", true).valid, true);

  for (const missing of ["audience_tension", "consumer_insight", "emotional_goal", "differentiation"]) {
    const partial = { ...complete, [missing]: "" };
    const v = ConceptQualityGate.validate(partial, "human_tension", true);
    assert.strictEqual(v.valid, false, `a concept with no ${missing} must be rejected`);
    assert.ok(v.violations.some((x) => x.kind === "INCOMPLETE_CONCEPT" && x.field === missing));
  }
  // And the requirement is opt-in, so existing callers are unaffected.
  assert.strictEqual(ConceptQualityGate.validate({ ...complete, emotional_goal: "" } as any, "human_tension").valid, true);
});

check("Concept domains have their own retrieval group", () => {
  // Task 3. Before this they shared `non_visual` with channel and production, and
  // the single quota slot went elsewhere on 26 of 30 briefs.
  assert.strictEqual(retrievalGroup("human_tension"), CONCEPT_GROUP);
  assert.strictEqual(retrievalGroup("campaign_territory"), CONCEPT_GROUP);
  assert.strictEqual(retrievalGroup("strategy"), CONCEPT_GROUP);
  assert.strictEqual(retrievalGroup("layout"), "composition_strategy");
  assert.notStrictEqual(retrievalGroup("channel"), CONCEPT_GROUP);
});

check("Two briefs in different categories get different tensions", () => {
  const a = asResult(SKINCARE);
  const b = asResult(COFFEE);
  assert.notStrictEqual(
    a.concept_trace.reasoning_chain?.human_tension.source,
    b.concept_trace.reasoning_chain?.human_tension.source,
    "a beauty brief and a coffee brief drew the same tension"
  );
});
'''

assert ANCHOR in s, "summary anchor missing"
s = s.replace(ANCHOR, SECTION + ANCHOR)
s = s.replace('import { CONCEPT_LEAD_DOMAINS } from "./reasoning/concept-validation.types";',
              'import { CONCEPT_LEAD_DOMAINS } from "./reasoning/concept-validation.types";\n'
              'import { CONCEPT_GROUP, retrievalGroup } from "./reasoning/reasoning-knowledge.types";')
io.open(p, "w", encoding="utf-8").write(s)
print("Phase 4.0 regression section added")
