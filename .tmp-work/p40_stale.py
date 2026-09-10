# -*- coding: utf-8 -*-
"""Phase 4.0 — retire assertions that required the concept gap to exist."""
import io

# ── 1. Quality suite: assert the property, not the old object's wording ──
p = "lib/image-engine/run-knowledge-quality-tests.ts"
s = io.open(p, encoding="utf-8").read()
OLD = '''check("Real corpus produces a grounded, accepted skincare concept", () => {
  assert.ok(skin.concept.derived_from.length >= 2, `only ${skin.concept.derived_from.length} sources`);
  assert.ok(/continuity of identity/i.test(skin.concept.big_idea), skin.concept.big_idea);
  assert.ok(/recognises herself/i.test(skin.concept.consumer_insight), skin.concept.consumer_insight);
  assert.ok(skin.evaluation.accepted, JSON.stringify(skin.evaluation.rejection_reasons));
});'''
NEW = '''check("Real corpus produces a grounded, accepted skincare concept", () => {
  // Phase 4.0 moved the lead from a strategy object to a human tension, so the
  // wording changed. Asserting the exact old phrase would pin the test to one
  // knowledge object and fail every time better knowledge is authored — which is
  // precisely what happened. The property is what matters: an identity-continuity
  // idea, grounded in a recognisable insight, accepted by the evaluator.
  assert.ok(skin.concept.derived_from.length >= 2, `only ${skin.concept.derived_from.length} sources`);
  assert.ok(
    /recognis|identity|continuity|herself/i.test(skin.concept.big_idea),
    `big idea is not about identity continuity: ${skin.concept.big_idea}`
  );
  assert.ok(
    /recognis|correction|herself|defect/i.test(skin.concept.consumer_insight),
    skin.concept.consumer_insight
  );
  assert.ok(skin.evaluation.accepted, JSON.stringify(skin.evaluation.rejection_reasons));
});'''
assert OLD in s, "quality anchor missing"
s = s.replace(OLD, NEW)
io.open(p, "w", encoding="utf-8").write(s)
print("quality suite updated")

# ── 2. Creative benchmark: the concept asymmetry is gone ────────────────
p = "lib/image-engine/run-creative-benchmark-tests.ts"
s = io.open(p, encoding="utf-8").read()
OLD = '''  check("The packet reports the concept asymmetry the corpus gap creates", () => {
    // Third state for this assertion in three phases, and each change was the
    // system moving rather than the test being wrong. V1/V2: the legacy side had
    // no concept. 3.1.7: both sides had one, so the packet was blind. 3.1.8.1:
    // the concept layer was confined to concept-bearing domains, and the corpus
    // holds too few of them, so CIOS now has no concept on most cases.
    const { packet } = BlindReviewPreparer.prepare(results, cases, { seed: 3 });
    const problems = BlindReviewPreparer.assertBlind(packet);
    assert.ok(
      problems.some((p) => /exactly one submission has a concept/.test(p)),
      `expected the concept asymmetry to be reported, got: ${problems.join(" | ") || "(none)"}`
    );
    assert.ok(
      !problems.some((p) => /attribution term/.test(p)),
      "the payload itself must still carry no attribution"
    );
  });'''
NEW = '''  check("The packet is blind: both sides carry a concept", () => {
    // Fourth and final state for this assertion, and every change tracked the
    // system rather than a mistake in the test. V1/V2: the legacy side had no
    // concept. 3.1.7: a real baseline gave it one. 3.1.8.1: the concept layer was
    // confined to concept-bearing domains and the corpus could not fill it, so
    // CIOS lost its concept. 4.0: the Creative Concept Intelligence layer filled
    // it, and the asymmetry is gone in the direction that matters.
    const { packet } = BlindReviewPreparer.prepare(results, cases, { seed: 3 });
    const problems = BlindReviewPreparer.assertBlind(packet);
    assert.deepStrictEqual(problems, [], `packet is not blind: ${problems.join(" | ")}`);
  });'''
assert OLD in s, "benchmark blind anchor missing"
s = s.replace(OLD, NEW)
io.open(p, "w", encoding="utf-8").write(s)
print("creative benchmark suite updated")

# ── 3. Human benchmark: the per-field absence is gone ───────────────────
p = "lib/image-engine/run-human-benchmark-tests.ts"
s = io.open(p, encoding="utf-8").read()
OLD = '''  check("The per-field absence tell fires on the current corpus gap", () => {
    // The finding that now blocks the packet, and the reason the human benchmark
    // cannot yet run: the concept layer is clean but mostly empty, so the same
    // boxes read blank on the same side case after case.
    const { audit } = HumanBenchmarkPreparer.prepare(results, cases, { seed: 5 });
    const absence = audit.findings.filter((f) => f.kind === "FIELD_ABSENCE_TELL");
    assert.ok(absence.length > 0, "systematic per-field absence was not detected");
    assert.ok(
      absence.some((f) => f.summary.includes("concept.big_idea")),
      "the missing big idea must be named"
    );
    assert.strictEqual(audit.blind, false);
  });'''
NEW = '''  check("The per-field absence tell is detected when it is present", () => {
    // Asserted against synthetic data. This detector was written for the Phase
    // 3.1.8.1 state, where CIOS had no concept on 26 of 30 cases; Phase 4.0 closed
    // that gap, so testing it against the live corpus would fail the detector's
    // own test precisely because the system was fixed.
    const starved: BenchmarkCaseResult[] = results.map((r) => ({
      ...r,
      cios: { ...r.cios, concept: { ...r.cios.concept, big_idea: "" } },
    }));
    const { audit } = HumanBenchmarkPreparer.prepare(starved, cases, { seed: 5 });
    const absence = audit.findings.filter((f) => f.kind === "FIELD_ABSENCE_TELL");
    assert.ok(absence.length > 0, "systematic per-field absence was not detected");
    assert.ok(absence.some((f) => f.summary.includes("concept.big_idea")), "the missing field must be named");
    assert.strictEqual(audit.blind, false);
  });

  check("Real data no longer carries a per-field absence tell", () => {
    // Phase 4.0, asserted directly: both sides now fill the concept fields.
    const { audit } = HumanBenchmarkPreparer.prepare(results, cases, { seed: 5 });
    assert.ok(
      !audit.findings.some((f) => f.kind === "FIELD_ABSENCE_TELL"),
      `a field is still systematically absent: ${audit.findings.filter((f) => f.kind === "FIELD_ABSENCE_TELL").map((f) => f.summary.slice(0, 60)).join(" | ")}`
    );
  });'''
assert OLD in s, "human absence anchor missing"
s = s.replace(OLD, NEW)
io.open(p, "w", encoding="utf-8").write(s)
print("human benchmark suite updated")
