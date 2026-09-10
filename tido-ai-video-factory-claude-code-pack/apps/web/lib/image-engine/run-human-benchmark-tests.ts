import assert from "assert";
import fs from "fs";
import { BenchmarkComparisonEngine } from "./benchmark/BenchmarkComparisonEngine";
import { BenchmarkDatasetRepository } from "./benchmark/BenchmarkDatasetRepository";
import { HumanBenchmarkAggregator } from "./benchmark/HumanBenchmarkAggregator";
import { HumanBenchmarkPreparer } from "./benchmark/HumanBenchmarkPreparer";
import {
  HUMAN_CRITERIA,
  HumanBenchmarkPacket,
  HumanBenchmarkResponse,
  HumanCategory,
} from "./benchmark/human-benchmark.types";
import { BenchmarkCaseResult } from "./benchmark/creative-benchmark.types";

/**
 * CIOS Phase 3.1.8 verification — human creative benchmark.
 *
 * The suite is weighted towards the blindness audit and the statistical guards,
 * because those are the two places this framework can produce a confident number
 * that means nothing. Everything else is plumbing.
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
async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
const section = (t: string) => console.log(`\n🔹 ${t}`);

console.log("=".repeat(72));
console.log("CIOS PHASE 3.1.8 — HUMAN CREATIVE BENCHMARK");
console.log("=".repeat(72));

const repo = new BenchmarkDatasetRepository();
const cases = repo.getCases();

async function main() {
  const results = await BenchmarkComparisonEngine.runAll(cases, { mode: "offline" });

  // ── 1. Schema ───────────────────────────────────────────────────────────
  section("1. HumanCreativeBenchmark schema");

  check("Fifteen requested criteria across the four categories, plus a separate A/B preference", () => {
    const byCat: Record<string, number> = {};
    for (const c of HUMAN_CRITERIA) byCat[c.category] = (byCat[c.category] || 0) + 1;
    assert.deepStrictEqual(byCat, {
      creative_concept: 4,
      brand_strategy: 3,
      art_direction: 5,
      production_readiness: 3,
    });
    const ids = HUMAN_CRITERIA.map((c) => c.id);
    for (const required of [
      "big_idea", "insight", "differentiation", "memorability",
      "brand_fit", "audience_understanding", "message_clarity",
      "composition", "camera", "lighting", "typography", "material",
      "actionable", "usable_by_designer", "usable_by_photographer",
    ]) {
      assert.ok(ids.includes(required as any), `missing criterion ${required}`);
    }
    console.log(`      ${HUMAN_CRITERIA.length} criteria · concept=4 strategy=3 art_direction=5 production=3`);
  });

  check("Every criterion is anchored at both ends", () => {
    // An unanchored 0-10 scale measures reviewer temperament as much as the work,
    // and at three reviewers that variance swamps the effect being measured.
    for (const c of HUMAN_CRITERIA) {
      assert.ok(c.question.endsWith("?"), `${c.id}: question must be a question`);
      assert.ok(c.anchors.low.length > 8 && c.anchors.high.length > 8, `${c.id}: anchors too thin to align two reviewers`);
      assert.ok(["concept", "direction", "both"].includes(c.looks_at), `${c.id}: bad looks_at`);
    }
  });

  // ── 2. Blind packet ─────────────────────────────────────────────────────
  section("2. Blind review format");

  let packet: HumanBenchmarkPacket;
  let key: ReturnType<typeof HumanBenchmarkPreparer.prepare>["key"];

  check("Packet carries no pipeline name, source or knowledge id", () => {
    const prepared = HumanBenchmarkPreparer.prepare(results, cases, { seed: 5 });
    packet = prepared.packet;
    key = prepared.key;
    const serialised = JSON.stringify(packet).toLowerCase();
    for (const tell of ["cios", "legacycreativeprovider", "shadowservice", "creativeknowledgeservice"]) {
      assert.ok(!new RegExp(`\\b${tell}\\b`).test(serialised), `packet leaks "${tell}"`);
    }
    assert.ok(!/knowledge_used|knowledge_id/.test(serialised), "packet leaks knowledge ids");
    assert.ok(!/"pipeline"|"source"|legacy_backend/.test(serialised), "packet leaks an attribution field");
  });

  check("Submissions expose only concept and direction", () => {
    for (const c of packet.cases) {
      for (const s of c.submissions) {
        assert.deepStrictEqual(Object.keys(s).sort(), ["concept", "direction", "label"]);
      }
    }
  });

  check("Presentation order is randomised, not fixed to one side", () => {
    const values = Object.values(key.assignment);
    const first = values.filter((v) => v === "CIOS").length;
    assert.ok(first > 2 && first < values.length - 2, `degenerate assignment: ${first}/${values.length}`);
    console.log(`      one system shown as A in ${first} of ${values.length} cases`);
  });

  check("The same seed reproduces the same packet and key", () => {
    const a = HumanBenchmarkPreparer.prepare(results, cases, { seed: 99 });
    const b = HumanBenchmarkPreparer.prepare(results, cases, { seed: 99 });
    assert.deepStrictEqual(a.key.assignment, b.key.assignment);
    assert.deepStrictEqual(a.packet.cases, b.packet.cases);
    const c = HumanBenchmarkPreparer.prepare(results, cases, { seed: 100 });
    assert.notDeepStrictEqual(a.key.assignment, c.key.assignment);
  });

  check("A case subset produces a shorter packet with a matching key", () => {
    const ids = results.slice(0, 4).map((r) => r.case_id);
    const { packet: p, key: k } = HumanBenchmarkPreparer.prepare(results, cases, { seed: 5, caseIds: ids });
    assert.strictEqual(p.cases.length, 4);
    assert.deepStrictEqual(Object.keys(k.assignment).sort(), [...ids].sort());
  });

  // ── 3. Blindness audit ──────────────────────────────────────────────────
  section("3. Blindness audit");

  check("The register tell is detected when it is present", () => {
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

  check("The per-field absence tell is detected when it is present", () => {
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
  });

  check("The audit detects an attribution leak", () => {
    const leaky = HumanBenchmarkPreparer.prepare(results, cases, { seed: 5 });
    leaky.packet.cases[0].submissions[0].concept.big_idea = "Produced by the CIOS reasoning stack.";
    const audit = HumanBenchmarkPreparer.audit(leaky.packet, leaky.key.assignment);
    assert.ok(audit.findings.some((f) => f.kind === "ATTRIBUTION_LEAK" && f.severity === "BLOCKING"));
    assert.strictEqual(audit.blind, false);
  });

  check("The audit detects a coverage tell", () => {
    const starved = HumanBenchmarkPreparer.prepare(results, cases, { seed: 5 });
    for (const c of starved.packet.cases) {
      c.submissions[1].concept = { big_idea: "", core_message: "", consumer_insight: "", differentiation: "" };
      c.submissions[1].direction = {
        camera: "", lighting: "", composition: "", colour: "", atmosphere: "", typography: "", material: "",
      };
    }
    const audit = HumanBenchmarkPreparer.audit(starved.packet, starved.key.assignment);
    assert.ok(audit.findings.some((f) => f.kind === "COVERAGE_TELL" && f.severity === "BLOCKING"));
  });

  check("A genuinely balanced packet passes the audit", () => {
    // The guard must not fire on everything, or it says nothing. Both sides are
    // given prose big ideas of similar register and no repeats.
    // Every concept field is filled on both sides, not just the big idea. The
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
    }));
    const { audit } = HumanBenchmarkPreparer.prepare(balanced, cases, { seed: 5 });
    assert.strictEqual(
      audit.blind,
      true,
      `balanced packet reported as not blind: ${audit.findings.map((f) => f.kind).join(", ")}`
    );
  });

  // ── 4. Aggregation ──────────────────────────────────────────────────────
  section("4. Scoring aggregation");

  /** Simulated reviewers, for testing the maths only. Not evidence about CIOS. */
  const simulate = (reviewerId: string, biasTowards: "CIOS" | "LEGACY" | "NONE", noise: number): HumanBenchmarkResponse => {
    let seed = reviewerId.length * 7919;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    return {
      packet_id: packet.packet_id,
      reviewer_id: reviewerId,
      cases: packet.cases.map((c) => {
        const aIs = key.assignment[c.case_id];
        const scores = HUMAN_CRITERIA.flatMap((cr) =>
          (["A", "B"] as const).map((label) => {
            const pipeline = label === "A" ? aIs : aIs === "CIOS" ? "LEGACY" : "CIOS";
            const base = 5 + (biasTowards !== "NONE" && pipeline === biasTowards ? 2 : 0);
            const score = Math.max(0, Math.min(10, Math.round(base + (rnd() - 0.5) * noise)));
            return { label, criterion: cr.id, score };
          })
        );
        const favoured = biasTowards === "NONE" ? (rnd() < 0.5 ? "CIOS" : "LEGACY") : biasTowards;
        const pref = aIs === favoured ? "A" : "B";
        return { case_id: c.case_id, scores, overall_preference: pref as "A" | "B" };
      }),
    };
  };

  check("Responses are attributed back through the key, not by label", () => {
    const r = simulate("reviewer_1", "CIOS", 0);
    const report = HumanBenchmarkAggregator.aggregate(packet, key, [r], results);
    // The simulated reviewer scored CIOS two points higher on every criterion, so
    // a correct un-blinding recovers exactly that. Reading labels instead of the
    // key would average the bias to zero, which is the failure this catches.
    assert.ok(report.overall.delta > 1.5, `expected a recovered +2 bias, got ${report.overall.delta}`);
    assert.strictEqual(report.overall.legacy_preferred, 0);
    assert.strictEqual(report.overall.cios_preferred, packet.cases.length);
  });

  check("A legacy-biased reviewer is recovered with the opposite sign", () => {
    const report = HumanBenchmarkAggregator.aggregate(packet, key, [simulate("reviewer_2", "LEGACY", 0)], results);
    assert.ok(report.overall.delta < -1.5, `expected a recovered −2 bias, got ${report.overall.delta}`);
  });

  check("A single reviewer is reported as INCONCLUSIVE", () => {
    // The guard that stops one person's taste being presented as a result.
    const report = HumanBenchmarkAggregator.aggregate(packet, key, [simulate("reviewer_1", "CIOS", 0)], results);
    assert.strictEqual(report.conclusive, false);
    assert.ok(/1 of 3 required reviewers/.test(report.inconclusive_reason || ""));
    assert.strictEqual(report.agreement.comparisons, 0, "one reviewer has no agreement to measure");
  });

  check("Three reviewers make the report conclusive", () => {
    const report = HumanBenchmarkAggregator.aggregate(
      packet,
      key,
      [simulate("r1", "CIOS", 0), simulate("r2", "CIOS", 0), simulate("r3", "CIOS", 0)],
      results
    );
    assert.strictEqual(report.conclusive, true);
    assert.strictEqual(report.reviewers, 3);
    assert.ok(report.agreement.comparisons > 0);
    assert.strictEqual(report.agreement.pairwise_preference_agreement, 1, "identical reviewers must agree fully");
  });

  check("Disagreeing reviewers produce low agreement, not a confident mean", () => {
    const report = HumanBenchmarkAggregator.aggregate(
      packet,
      key,
      [simulate("r1", "CIOS", 0), simulate("r2", "LEGACY", 0), simulate("r3", "NONE", 6)],
      results
    );
    assert.ok(
      report.agreement.pairwise_preference_agreement < 0.7,
      `expected low agreement, got ${report.agreement.pairwise_preference_agreement}`
    );
    // Opposed biases cancel, so the headline delta lands near zero — and the SD
    // is what tells the reader that is a disagreement rather than a tie.
    assert.ok(Math.abs(report.overall.delta) < 1.5, `expected cancellation, got ${report.overall.delta}`);
    const noisy = report.by_criterion.filter((c) => c.delta_sd > Math.abs(c.delta));
    assert.ok(noisy.length > 10, "most criteria should be flagged as within noise");
  });

  check("Every criterion reports n and a delta standard deviation", () => {
    const report = HumanBenchmarkAggregator.aggregate(
      packet,
      key,
      [simulate("r1", "CIOS", 3), simulate("r2", "CIOS", 3), simulate("r3", "CIOS", 3)],
      results
    );
    assert.strictEqual(report.by_criterion.length, HUMAN_CRITERIA.length);
    for (const c of report.by_criterion) {
      assert.ok(c.n > 0, `${c.criterion}: no ratings counted`);
      assert.strictEqual(c.n, packet.cases.length * 3 * 2, `${c.criterion}: n should be cases × reviewers × sides`);
      assert.ok(c.delta_sd >= 0);
      assert.strictEqual(c.cios_wins + c.legacy_wins + c.ties, packet.cases.length * 3);
    }
  });

  check("Out-of-range and unknown-case responses are rejected, not silently averaged", () => {
    const bad = simulate("r_bad", "NONE", 0);
    bad.cases[0].scores[0].score = 99;
    bad.cases.push({ ...bad.cases[0], case_id: "bench.nope.nope.999" });
    const report = HumanBenchmarkAggregator.aggregate(packet, key, [bad], results);
    assert.ok(report.warnings.some((w) => /out of range/.test(w)), "out-of-range score not reported");
    assert.ok(report.warnings.some((w) => /unknown case/.test(w)), "unknown case not reported");
  });

  check("A response from another packet is refused", () => {
    const foreign = { ...simulate("r_x", "NONE", 0), packet_id: "some_other_packet" };
    assert.throws(() => HumanBenchmarkAggregator.aggregate(packet, key, [foreign], results), /another packet/);
    assert.throws(
      () => HumanBenchmarkAggregator.aggregate(packet, { ...key, packet_id: "mismatch" }, [], results),
      /does not match packet/
    );
  });

  // ── 5. Report ───────────────────────────────────────────────────────────
  section("5. Report generation");

  check("Report renders and states its own limits", () => {
    const report = HumanBenchmarkAggregator.aggregate(
      packet,
      key,
      [simulate("r1", "CIOS", 4), simulate("r2", "NONE", 4)],
      results
    );
    const text = HumanBenchmarkAggregator.format(report);
    assert.ok(text.includes("INCONCLUSIVE"), "a two-reviewer report must say it is inconclusive");
    assert.ok(text.includes("BY CRITERION"));
    assert.ok(text.includes("REVIEWER AGREEMENT"));
    assert.ok(text.includes("within noise"), "noisy criteria must be marked inline");
    const cats: HumanCategory[] = ["creative_concept", "brand_strategy", "art_direction", "production_readiness"];
    for (const c of cats) assert.ok(text.includes(c), `report omits category ${c}`);
  });

  check("An empty response set produces a report rather than a crash", () => {
    const report = HumanBenchmarkAggregator.aggregate(packet, key, [], results);
    assert.strictEqual(report.conclusive, false);
    assert.strictEqual(report.reviewers, 0);
    assert.ok(/No responses/.test(report.inconclusive_reason || ""));
    assert.ok(HumanBenchmarkAggregator.format(report).includes("OVERALL"));
  });

  check("The review form is self-contained and carries no attribution", () => {
    const formPath = ".human-benchmark/review_form.html";
    if (!fs.existsSync(formPath)) {
      console.log("      (form not built in this run; skipping content check)");
      return;
    }
    const html = fs.readFileSync(formPath, "utf-8");
    assert.ok(!/\bcios\b/i.test(html), "the form names CIOS");
    assert.ok(!/knowledge_id/i.test(html), "the form leaks knowledge ids");
    assert.ok(!/<script src=|https?:\/\//.test(html), "the form must not load anything over the network");
    assert.ok(html.includes("exportJson"), "the form must be able to export a response file");
  });

  console.log("\n" + "=".repeat(72));
  console.log(`${passed} passed, ${failed} failed`);
  console.log("=".repeat(72));
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
