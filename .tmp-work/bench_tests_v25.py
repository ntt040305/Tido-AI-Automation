# -*- coding: utf-8 -*-
"""Phase 3.1.7 — benchmark tests for a real baseline and fifteen dimensions."""
import io, json

# ── Schema enum gains `material` ────────────────────────────────────────
p = "data/benchmarks/_schema/creative_benchmark_schema_v1.json"
schema = json.load(io.open(p, encoding="utf-8"))
enum = schema["definitions"]["case"]["properties"]["criteria"]["properties"]["weighted_dimensions"]["items"]["enum"]
if "material" not in enum:
    enum.insert(enum.index("color_direction") + 1, "material")
io.open(p, "w", encoding="utf-8").write(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")
print("schema: +material (%d dimensions)" % len(enum))

# ── Tests ───────────────────────────────────────────────────────────────
p = "lib/image-engine/run-creative-benchmark-tests.ts"
s = io.open(p, encoding="utf-8").read()

pairs = [
# 1. Dimension count
('''  check("Fourteen dimensions across the four required categories", () => {
    assert.strictEqual(BENCHMARK_DIMENSIONS.length, 14);
    const byCat: Record<string, number> = {};
    for (const d of BENCHMARK_DIMENSIONS) byCat[d.category] = (byCat[d.category] || 0) + 1;
    assert.deepStrictEqual(byCat, { concept: 4, strategy: 3, visual: 4, production: 3 });
    console.log("      concept=4 strategy=3 visual=4 production=3");
  });''',
'''  check("Fifteen dimensions across the four required categories", () => {
    // Phase 3.1.7 added `material` to the visual category. It was the one art
    // direction slot the benchmark never measured, while both pipelines produce
    // one — so it was a real capability neither side got credit or blame for.
    assert.strictEqual(BENCHMARK_DIMENSIONS.length, 15);
    const byCat: Record<string, number> = {};
    for (const d of BENCHMARK_DIMENSIONS) byCat[d.category] = (byCat[d.category] || 0) + 1;
    assert.deepStrictEqual(byCat, { concept: 4, strategy: 3, visual: 5, production: 3 });
    console.log("      concept=4 strategy=3 visual=5 production=3");
  });'''),

# 2. Outcome count
('''    assert.strictEqual(result.outcomes.length, 14);''',
 '''    assert.strictEqual(result.outcomes.length, 15);'''),

# 3. The offline-concept caveat is gone: the baseline now produces a concept.
('''  check("Offline mode warns on every case that the legacy concept is absent", () => {
    for (const r of results) {
      assert.ok(
        r.warnings.some((w) => w.startsWith("OFFLINE_MODE")),
        `${r.case_id}: offline caveat missing, so a reader could mistake the concept comparison for a real one`
      );
    }
  });''',
'''  check("The baseline produces a real concept on every case", () => {
    // This replaces the V1/V2 caveat test. Until Phase 3.1.7 the legacy side had
    // no concept at all and every concept dimension scored CIOS against zero;
    // the test asserted the warning that said so. There is now a baseline, so
    // what has to be asserted is that it actually produced something.
    for (const r of results) {
      assert.ok(r.legacy.concept.big_idea, `${r.case_id}: baseline produced no big idea`);
      assert.ok(r.legacy.concept.consumer_insight, `${r.case_id}: baseline produced no insight`);
      assert.ok(r.legacy.concept.differentiation, `${r.case_id}: baseline produced no differentiation`);
      assert.ok(!r.warnings.some((w) => w.startsWith("OFFLINE_MODE")), `${r.case_id}: stale offline caveat`);
    }
  });

  check("The template backend labels itself on every case it produces", () => {
    // The caveat that replaces it, and it is a narrower one: the deterministic
    // baseline was authored by the same hand as CIOS, so the taste dimensions
    // are not defensible even though the structural ones are.
    for (const r of results) {
      assert.strictEqual(r.legacy.legacy_backend, "template");
      assert.ok(
        r.warnings.some((w) => w.startsWith("TEMPLATE_BASELINE")),
        `${r.case_id}: template baseline must declare itself`
      );
    }
  });

  check("The baseline fills every art direction field", () => {
    // A baseline with holes manufactures a CIOS win on coverage that the
    // architecture did not earn.
    for (const r of results) {
      for (const [field, value] of Object.entries(r.legacy.direction)) {
        assert.ok(String(value).trim(), `${r.case_id}: baseline left ${field} empty`);
      }
    }
  });'''),

# 4/5. The blind packet is no longer one-sided.
('''  check("assertBlind catches the offline one-sided-concept tell", () => {
    const { packet } = BlindReviewPreparer.prepare(results, cases, { seed: 3 });
    const problems = BlindReviewPreparer.assertBlind(packet);
    // In offline mode only CIOS has a concept, which identifies it instantly.
    // The preparer must say so rather than hand over a packet that is blind in
    // name only.
    assert.ok(
      problems.some((p) => /exactly one submission has a concept/.test(p)),
      `expected the one-sided-concept finding, got: ${problems.join(" | ") || "(none)"}`
    );
  });''',
'''  check("The blind packet is now genuinely blind", () => {
    // The inverse of the V1/V2 assertion. Both sides now carry a concept and a
    // full direction, so the structural tell that made the packet unusable for
    // concept review is gone and a reviewer can be handed it.
    const { packet } = BlindReviewPreparer.prepare(results, cases, { seed: 3 });
    const problems = BlindReviewPreparer.assertBlind(packet);
    assert.deepStrictEqual(problems, [], `packet is not blind: ${problems.join(" | ")}`);
  });'''),

('''  check("A direction-only packet from offline data is genuinely blind", () => {
    const { packet } = BlindReviewPreparer.prepare(results, cases, {
      seed: 3,
      dimensions: ["composition", "typography", "photography", "color_direction", "clarity"],
    });
    // Restricting the questions does not fix the payload, so the concept fields
    // are what has to be checked — this asserts the guard is about the data, not
    // about which questions were asked.
    const problems = BlindReviewPreparer.assertBlind(packet);
    assert.ok(problems.length > 0, "the concept asymmetry is still present and must still be reported");
    assert.ok(packet.cases.every((c) => c.questions.length === 5));
  });''',
'''  check("Restricting the questions does not change whether the payload is blind", () => {
    const { packet } = BlindReviewPreparer.prepare(results, cases, {
      seed: 3,
      dimensions: ["composition", "typography", "photography", "color_direction", "clarity"],
    });
    // The guard is about the data, not about which questions were asked: both
    // submissions carry the same fields either way.
    assert.deepStrictEqual(BlindReviewPreparer.assertBlind(packet), []);
    assert.ok(packet.cases.every((c) => c.questions.length === 5));
  });'''),

# 6. Report dimension count
('''    assert.strictEqual(report.by_dimension.length, 14);''',
 '''    assert.strictEqual(report.by_dimension.length, 15);'''),

# 7. Blocking weakness is no longer the offline caveat.
('''    assert.ok(
      blocking.some((w) => /offline mode/i.test(w.summary)),
      "the offline concept caveat must be reported as blocking"
    );''',
'''    // The offline concept caveat was the standing BLOCKING finding through V1 and
    // V2. Phase 3.1.7 removed its cause, so what remains blocking must be a real
    // finding about a pipeline rather than about the harness.
    assert.ok(
      !blocking.some((w) => /offline mode/i.test(w.summary)),
      "the offline concept caveat should no longer fire — a real baseline now runs"
    );'''),
]

for old, new in pairs:
    assert old in s, "anchor missing: " + old[:70].replace("\n", " ")
    s = s.replace(old, new)

io.open(p, "w", encoding="utf-8").write(s)
print("benchmark tests updated for V2.5")
