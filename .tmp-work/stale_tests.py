# -*- coding: utf-8 -*-
"""Phase 3.1.8.1 — retire assertions that required the defect to exist."""
import io

# ── Human benchmark suite ───────────────────────────────────────────────
p = "lib/image-engine/run-human-benchmark-tests.ts"
s = io.open(p, encoding="utf-8").read()

OLD_REG = '''  check("The audit detects the register tell on real V2.5 data", () => {
    // The finding this framework was built around. One side writes its big idea
    // as a production instruction and the other as prose, so redaction is beside
    // the point — a creative reviewer separates them in two cases.
    const { audit } = HumanBenchmarkPreparer.prepare(results, cases, { seed: 5 });
    const register = audit.findings.find((f) => f.kind === "REGISTER_TELL");
    assert.ok(register, "the register tell was not detected");
    assert.strictEqual(register!.severity, "BLOCKING");
    assert.strictEqual(audit.blind, false, "a packet with a blocking finding must not be marked blind");
    console.log(`      ${register!.summary.slice(0, 96)}…`);
  });

  check("The audit detects a repetition tell", () => {
    const { audit } = HumanBenchmarkPreparer.prepare(results, cases, { seed: 5 });
    const repetition = audit.findings.find((f) => f.kind === "REPETITION_TELL");
    assert.ok(repetition, "reused big ideas were not detected");
    assert.ok(repetition!.evidence.length > 0, "the finding must name the repeated text");
  });'''

NEW_REG = '''  check("The register tell is detected when it is present", () => {
    // Asserted against a synthetic packet, not real data. Phase 3.1.8.1 removed
    // the contamination this detector was written for, so testing it against the
    // live corpus would make the detector's own test fail the moment the system
    // got fixed. The detector still has to work.
    const contaminated: BenchmarkCaseResult[] = results.map((r) => ({
      ...r,
      cios: {
        ...r.cios,
        concept: { ...r.cios.concept, big_idea: "The subject within the upper 65 percent at 40 to 55 percent of frame height" },
      },
      legacy: { ...r.legacy, concept: { ...r.legacy.concept, big_idea: "The step you skip that costs the most" } },
    }));
    const { audit } = HumanBenchmarkPreparer.prepare(contaminated, cases, { seed: 5 });
    const register = audit.findings.find((f) => f.kind === "REGISTER_TELL");
    assert.ok(register, "the register tell was not detected on a contaminated packet");
    assert.strictEqual(register!.severity, "BLOCKING");
    assert.strictEqual(audit.blind, false);
  });

  check("Real data no longer carries the register tell", () => {
    // The repair, asserted directly: after 3.1.8.1 the concept layer no longer
    // states production instructions, so the two sides are written in the same
    // register and this finding is gone.
    const { audit } = HumanBenchmarkPreparer.prepare(results, cases, { seed: 5 });
    assert.ok(
      !audit.findings.some((f) => f.kind === "REGISTER_TELL"),
      "the concept layer is still writing art direction"
    );
  });

  check("The repetition tell is detected when it is present", () => {
    const repeated: BenchmarkCaseResult[] = results.map((r) => ({
      ...r,
      cios: { ...r.cios, concept: { ...r.cios.concept, big_idea: "One idea, reused everywhere" } },
      legacy: { ...r.legacy, concept: { ...r.legacy.concept, big_idea: `A distinct idea for ${r.case_id}` } },
    }));
    const { audit } = HumanBenchmarkPreparer.prepare(repeated, cases, { seed: 5 });
    const repetition = audit.findings.find((f) => f.kind === "REPETITION_TELL");
    assert.ok(repetition, "reused big ideas were not detected");
    assert.ok(repetition!.evidence.length > 0, "the finding must name the repeated text");
  });

  check("The per-field absence tell fires on the current corpus gap", () => {
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
assert OLD_REG in s, "register anchor missing"
s = s.replace(OLD_REG, NEW_REG)

OLD_BAL = '''    const balanced: BenchmarkCaseResult[] = results.map((r, i) => ({
      ...r,
      cios: { ...r.cios, concept: { ...r.cios.concept, big_idea: `A distinct idea about ${r.case_id} number ${i}` } },
      legacy: { ...r.legacy, concept: { ...r.legacy.concept, big_idea: `Another distinct idea for ${r.case_id} case ${i}` } },
    }));'''
NEW_BAL = '''    // Every concept field is filled on both sides, not just the big idea. The
    // first version of this fixture balanced one field and left the others
    // asymmetric, so it tripped the per-field absence check — a fixture that
    // does not actually meet the condition it claims to test.
    const fill = (o: BenchmarkCaseResult["cios"], tag: string, i: number) => ({
      ...o,
      concept: {
        big_idea: `${tag} idea ${i}`,
        core_message: `${tag} message ${i}`,
        consumer_insight: `${tag} insight ${i}`,
        differentiation: `${tag} difference ${i}`,
      },
      direction: {
        camera: "a camera note", lighting: "a lighting note", composition: "a composition note",
        colour: "a colour note", atmosphere: "an atmosphere note", typography: "a type note",
        material: "a material note",
      },
    });
    const balanced: BenchmarkCaseResult[] = results.map((r, i) => ({
      ...r,
      cios: fill(r.cios, "First", i),
      legacy: fill(r.legacy, "Second", i),
    }));'''
assert OLD_BAL in s, "balanced anchor missing"
s = s.replace(OLD_BAL, NEW_BAL)
io.open(p, "w", encoding="utf-8").write(s)
print("human benchmark suite updated")

# ── Creative benchmark suite: the blind packet is one-sided again ───────
p = "lib/image-engine/run-creative-benchmark-tests.ts"
s = io.open(p, encoding="utf-8").read()

OLD1 = '''  check("The blind packet is now genuinely blind", () => {
    // The inverse of the V1/V2 assertion. Both sides now carry a concept and a
    // full direction, so the structural tell that made the packet unusable for
    // concept review is gone and a reviewer can be handed it.
    const { packet } = BlindReviewPreparer.prepare(results, cases, { seed: 3 });
    const problems = BlindReviewPreparer.assertBlind(packet);
    assert.deepStrictEqual(problems, [], `packet is not blind: ${problems.join(" | ")}`);
  });'''
NEW1 = '''  check("The packet reports the concept asymmetry the corpus gap creates", () => {
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
assert OLD1 in s, "blind anchor missing"
s = s.replace(OLD1, NEW1)

OLD2 = '''    // The guard is about the data, not about which questions were asked: both
    // submissions carry the same fields either way.
    assert.deepStrictEqual(BlindReviewPreparer.assertBlind(packet), []);
    assert.ok(packet.cases.every((c) => c.questions.length === 5));'''
NEW2 = '''    // The guard is about the data, not about which questions were asked: the same
    // findings appear either way, because restricting the questions does not
    // change what is in the payload.
    const full = BlindReviewPreparer.assertBlind(
      BlindReviewPreparer.prepare(results, cases, { seed: 3 }).packet
    );
    assert.deepStrictEqual(BlindReviewPreparer.assertBlind(packet), full);
    assert.ok(packet.cases.every((c) => c.questions.length === 5));'''
assert OLD2 in s, "restricted anchor missing"
s = s.replace(OLD2, NEW2)
io.open(p, "w", encoding="utf-8").write(s)
print("creative benchmark suite updated")
