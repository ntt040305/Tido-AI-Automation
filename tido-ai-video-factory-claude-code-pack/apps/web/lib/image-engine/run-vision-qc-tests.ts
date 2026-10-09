/**
 * The post-render QC pass and its retry budget. MOCKED everything, no cost.
 *
 * WHAT THIS PROVES
 * ----------------
 * The three things that make a retry loop safe rather than expensive:
 *
 *   1. **It cannot loop.** `unverified` never retries, the count is capped at a hard
 *      maximum whatever the config says, and the VND ceiling is checked BEFORE each
 *      attempt rather than after it.
 *   2. **The correction is targeted.** One sentence, derived from the fault that was
 *      actually found, appended to the prompt that was mostly right. Every auto-fail code
 *      has its own, and a code with no honest single-sentence fix produces no retry.
 *   3. **Flag OFF changes nothing.** Asserted against the engine selector's default.
 *
 * WHAT IT CANNOT PROVE
 * --------------------
 * Whether a real QC model reads a real render correctly — above all whether it is HONEST
 * about `unverified`. A model that claims it can read small text it cannot is how a
 * correct render gets retried and a wrong one gets shipped. That needs a paid render and a
 * pair of eyes, and no script in this repo runs one.
 *
 * No network, no model call, no provider call, no cost.
 */
import assert from "assert";
import fs from "fs";
import path from "path";

import { fixtureById, sheetFor } from "./prompt-v2/gpt-brief-fixtures";
import { gptVisionQc } from "./prompt-v2/engine-selector";
import {
  AUTO_FAIL_CODES,
  HARD_MAX_RETRIES,
  QcBudget,
  correctionFor,
  correctionForVerdict,
  parseVisionQc,
  qcConfig,
  qcMessages,
  qcOutcome,
  qcPrompt,
  qcTelemetry,
  runVisionQc,
  type AutoFailCode,
  type QcConfig,
  type VisionQc,
} from "./prompt-v2/art-direction/vision-qc";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    const first = (e as Error).message.split("\n").slice(0, 2).join("\n    ");
    failures.push(`${name}\n    ${first}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${first}`);
  }
}

const SHEET = sheetFor(fixtureById("05_five_drinks_prices_florian"));
const IMAGE = { buffer: Buffer.from("fake-render-bytes"), mimeType: "image/png" };
const CONFIG: QcConfig = { threshold: 8.5, maxRetries: 1, costCapVnd: 600 };

const GOOD_SCORES = {
  hierarchy: 9,
  realism: 9,
  light_consistency: 9,
  label_fidelity: 9,
  legibility_at_phone_size: 8,
  colour_harmony: 9,
};
const WEAK_SCORES = { ...GOOD_SCORES, realism: 5, legibility_at_phone_size: 5 };

function qc(over: Partial<VisionQc> = {}): VisionQc {
  return { verdict: "verified", auto_fails: [], scores: GOOD_SCORES, notes: "", ...over };
}

async function main() {
  console.log("\nVision QC tests (mocked)\n");

  // ── 1. The question compares against the SHEET ─────────────────────────
  console.log("the question");
  await check("the prompt carries the manifest, the count, the hero and the exclusions", () => {
    const text = qcPrompt(SHEET);
    for (const entry of SHEET.text_manifest) {
      assert.ok(text.includes(entry.exact_string), `the manifest string "${entry.exact_string}" is not in the question`);
    }
    assert.ok(text.includes(String(SHEET.products.length)), "the product count is not in the question");
    assert.ok(/clearly largest and nearest/i.test(text), "the hero rule is not stated");
    assert.ok(/SAFE MARGIN/i.test(text), "the safe margin is not stated");
    for (const code of AUTO_FAIL_CODES) {
      assert.ok(text.includes(code), `the auto-fail code ${code} is not offered to the model`);
    }
  });
  await check("the question makes 'I could not read it' the easy answer", () => {
    const text = qcPrompt(SHEET);
    assert.ok(/cannot READ the small text/i.test(text), "the unverified escape hatch is not explained");
    assert.ok(/Do not guess/i.test(text), "nothing forbids guessing");
    assert.ok(/correct and useful answer/i.test(text), "unverified is not presented as acceptable");
    // Stated BEFORE the auto-fail list, so a model that cannot see stops early.
    assert.ok(
      text.indexOf("unverified") < text.indexOf("text_not_verbatim"),
      "the verdict instruction comes after the fault list",
    );
  });
  await check("the render is attached as one image", () => {
    const content = qcMessages(SHEET, IMAGE)[1].content as Array<{ type: string }>;
    assert.strictEqual(content.filter((c) => c.type === "image_url").length, 1);
  });

  // ── 2. The verdict ─────────────────────────────────────────────────────
  console.log("\nthe verdict");
  await check("a clean verified render with good scores passes", () => {
    const r = qcOutcome(qc(), CONFIG);
    assert.strictEqual(r.outcome, "pass");
    assert.ok(/mean/.test(r.because), r.because);
  });
  await check("an auto-fail outranks every score", () => {
    const r = qcOutcome(qc({ auto_fails: [{ code: "text_missing", what: "the price line is absent" }] }), CONFIG);
    assert.strictEqual(r.outcome, "fail", "a perfect-scoring render with a missing string passed");
    assert.ok(/text_missing/.test(r.because));
  });
  await check("the mean decides when nothing is broken", () => {
    assert.strictEqual(qcOutcome(qc({ scores: WEAK_SCORES }), CONFIG).outcome, "fail");
    // Exactly at the threshold is a pass: it is a floor, not a target to beat.
    const atThreshold = { ...GOOD_SCORES, hierarchy: 8, realism: 9, light_consistency: 9, label_fidelity: 8, legibility_at_phone_size: 8, colour_harmony: 9 };
    const mean = Object.values(atThreshold).reduce((a, b) => a + b, 0) / 6;
    assert.strictEqual(Math.round(mean * 10) / 10, 8.5, "the fixture is not actually at the threshold");
    assert.strictEqual(qcOutcome(qc({ scores: atThreshold }), CONFIG).outcome, "pass");
  });
  await check("the threshold is config, not a constant", () => {
    const strict: QcConfig = { ...CONFIG, threshold: 9.5 };
    assert.strictEqual(qcOutcome(qc(), CONFIG).outcome, "pass");
    assert.strictEqual(qcOutcome(qc(), strict).outcome, "fail", "the threshold had no effect");
  });

  // ── 3. Fail-closed, the TypographyCritique way ─────────────────────────
  console.log("\nfail-closed");
  await check("an unverified verdict is neither pass nor fail", () => {
    const r = qcOutcome(qc({ verdict: "unverified", scores: null, notes: "the price lines are too small to read" }), CONFIG);
    assert.strictEqual(r.outcome, "unverified");
    assert.ok(/too small to read/.test(r.because), "the model's own reason was discarded");
  });
  await check("no answer at all is unverified, not a fail", () => {
    assert.strictEqual(qcOutcome(null, CONFIG).outcome, "unverified");
  });
  await check("verified with no scores is unverified, not a pass by default", () => {
    // Nothing broken and nothing measured is a render nobody scored. Treating it as a pass
    // would make a model that omits `scores` the easiest way to approve anything.
    const r = qcOutcome(qc({ scores: null }), CONFIG);
    assert.strictEqual(r.outcome, "unverified");
    assert.ok(/no scores/.test(r.because));
  });
  await check("an unverified verdict NEVER retries", () => {
    const budget = new QcBudget(CONFIG);
    const r = budget.mayRetry("unverified", "some correction");
    assert.strictEqual(r.allowed, false, "our own blindness triggered a paid retry");
    assert.ok(/unverified/.test(r.because));
    assert.strictEqual(budget.mayRetry("pass", "some correction").allowed, false);
  });

  // ── 4. The targeted correction ─────────────────────────────────────────
  console.log("\nthe correction");
  await check("every auto-fail code has a correction, and each is distinct", () => {
    const seen = new Map<string, AutoFailCode>();
    for (const code of AUTO_FAIL_CODES) {
      const sentence = correctionFor(code, SHEET);
      assert.ok(sentence, `${code} has no correction`);
      const existing = seen.get(sentence!);
      assert.ok(!existing, `${code} and ${existing} produce the same correction, so a retry cannot be attributed`);
      seen.set(sentence!, code);
    }
  });
  await check("the text correction carries the client's exact strings", () => {
    const sentence = correctionFor("text_not_verbatim", SHEET)!;
    for (const entry of SHEET.text_manifest) {
      assert.ok(sentence.includes(entry.exact_string), `"${entry.exact_string}" is missing from the correction`);
    }
    assert.ok(/character for character/i.test(sentence));
    assert.ok(/diacritic/i.test(sentence));
  });
  await check("a brief with no copy corrects towards no text at all", () => {
    const sentence = correctionFor("text_missing", sheetFor(fixtureById("11_no_copy")))!;
    assert.ok(/no text of any kind/i.test(sentence), sentence);
  });
  await check("the count correction names the real number", () => {
    assert.ok(/5 products/.test(correctionFor("product_count_mismatch", SHEET)!));
    assert.ok(/one product/.test(correctionFor("product_count_mismatch", sheetFor(fixtureById("01_one_product_square")))!));
  });
  await check("the logo correction cannot contradict the print rule", () => {
    const sentence = correctionFor("invented_logo_or_label", SHEET)!;
    // The print rule for this brief is "keep what is photographed". A correction saying
    // "draw no logo" full stop would contradict it, which is the live defect all over again.
    assert.ok(/not already printed on the supplied product photographs/i.test(sentence), sentence);
    assert.ok(!/^Draw no logo\.?$/i.test(sentence.trim()), "the correction is a blanket ban");
  });
  await check("the correction says nothing about QC, models or attempts", () => {
    for (const code of AUTO_FAIL_CODES) {
      const sentence = correctionFor(code, SHEET)!;
      for (const leak of ["QC", "retry", "attempt", "model", "previous", "again"]) {
        assert.ok(
          !new RegExp(`\\b${leak}\\b`, "i").test(sentence),
          `the ${code} correction leaks "${leak}": ${sentence}`,
        );
      }
    }
  });
  await check("the first auto-fail with a correction is the one used", () => {
    const sentence = correctionForVerdict(
      qc({ auto_fails: [{ code: "hero_not_dominant", what: "" }, { code: "text_missing", what: "" }] }),
      SHEET,
    );
    assert.ok(/largest and nearest/i.test(sentence!), `expected the hero correction, got: ${sentence}`);
    assert.strictEqual(correctionForVerdict(qc(), SHEET), null, "a clean verdict produced a correction");
    assert.strictEqual(correctionForVerdict(null, SHEET), null);
  });

  // ── 5. The budget: it cannot loop and it cannot overspend ──────────────
  console.log("\nthe budget");
  await check("one retry by default, and never more than the hard maximum", () => {
    assert.strictEqual(qcConfig({}).maxRetries, 1);
    assert.strictEqual(qcConfig({ GPT_VISION_QC_MAX_RETRIES: "9" }).maxRetries, HARD_MAX_RETRIES);
    assert.strictEqual(qcConfig({ GPT_VISION_QC_MAX_RETRIES: "-3" }).maxRetries, 0);
    assert.strictEqual(qcConfig({ GPT_VISION_QC_MAX_RETRIES: "nonsense" }).maxRetries, 1);
    assert.strictEqual(qcConfig({}).threshold, 8.5);
    assert.strictEqual(qcConfig({ GPT_VISION_QC_THRESHOLD: "99" }).threshold, 8.5, "an impossible threshold was accepted");
  });
  await check("the retry count is enforced", () => {
    const budget = new QcBudget({ ...CONFIG, maxRetries: 1, costCapVnd: 100000 });
    budget.record({ correction: null, outcome: "fail", because: "first", cost_vnd: 300 });
    assert.strictEqual(budget.mayRetry("fail", "fix it").allowed, true, "the first retry was refused");
    budget.record({ correction: "fix it", outcome: "fail", because: "second", cost_vnd: 300 });
    const second = budget.mayRetry("fail", "fix it");
    assert.strictEqual(second.allowed, false, "a second retry was allowed past the limit");
    assert.ok(/retry limit/.test(second.because));
  });
  await check("the cost cap stops an attempt the count would have allowed", () => {
    // Two retries permitted, but the cap only affords one. The cap must win.
    const budget = new QcBudget({ ...CONFIG, maxRetries: 2, costCapVnd: 600 });
    budget.record({ correction: null, outcome: "fail", because: "first", cost_vnd: 300 });
    assert.strictEqual(budget.mayRetry("fail", "fix it").allowed, true);
    budget.record({ correction: "fix it", outcome: "fail", because: "second", cost_vnd: 300 });
    const third = budget.mayRetry("fail", "fix it");
    assert.strictEqual(third.allowed, false, "the cap did not stop a third attempt");
    assert.ok(/over the 600 VND cap/.test(third.because), third.because);
  });
  await check("the cap is checked BEFORE the attempt, not after", () => {
    const budget = new QcBudget({ ...CONFIG, maxRetries: 2, costCapVnd: 310 });
    budget.record({ correction: null, outcome: "fail", because: "first", cost_vnd: 300 });
    // 300 spent, one more attempt costs 300 → 600 > 310. Refused with nothing spent.
    const r = budget.mayRetry("fail", "fix it");
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(budget.spentVnd, 300, "a refused attempt still charged");
  });
  await check("a fault with no honest correction does not retry", () => {
    const budget = new QcBudget(CONFIG);
    budget.record({ correction: null, outcome: "fail", because: "first", cost_vnd: 300 });
    const r = budget.mayRetry("fail", null);
    assert.strictEqual(r.allowed, false);
    assert.ok(/would be a guess/.test(r.because), r.because);
  });
  await check("the ledger records every attempt with its delta, cost and verdict", () => {
    const budget = new QcBudget(CONFIG);
    budget.record({ correction: null, outcome: "fail", because: "the headline is missing", cost_vnd: 300 });
    budget.record({ correction: "Set exactly these strings…", outcome: "pass", because: "mean 9", cost_vnd: 300 });
    assert.strictEqual(budget.attempts.length, 2);
    assert.deepStrictEqual(budget.attempts.map((a) => a.attempt), [1, 2]);
    assert.strictEqual(budget.attempts[0].correction, null, "the first attempt had a correction");
    assert.ok(budget.attempts[1].correction, "the retry recorded no prompt delta");
    assert.strictEqual(budget.spentVnd, 600);
    assert.strictEqual(budget.retriesUsed, 1);
  });

  // ── 6. The call never throws ───────────────────────────────────────────
  console.log("\nthe call");
  await check("a valid reply is parsed", async () => {
    const r = await runVisionQc(SHEET, IMAGE, { chat: async () => JSON.stringify(qc()) });
    assert.strictEqual(r.qc?.verdict, "verified");
  });
  await check("invalid JSON, a throw and a hang are all unverified", async () => {
    const bad = await runVisionQc(SHEET, IMAGE, { chat: async () => "no." });
    assert.strictEqual(bad.qc, null);
    assert.ok(bad.reason);

    const threw = await runVisionQc(SHEET, IMAGE, {
      chat: async () => {
        throw new Error("upstream 500");
      },
    });
    assert.strictEqual(threw.qc, null);
    assert.ok(/500/.test(threw.reason || ""));

    const hung = await runVisionQc(SHEET, IMAGE, { chat: () => new Promise<string>(() => {}), timeoutMs: 40 });
    assert.strictEqual(hung.qc, null);
    assert.ok(/timed out/i.test(hung.reason || ""));

    // And each of those becomes "unverified", which never retries.
    for (const result of [bad, threw, hung]) {
      assert.strictEqual(qcOutcome(result.qc, CONFIG).outcome, "unverified");
    }
  });
  await check("no image is unverified, and no call is made", async () => {
    const r = await runVisionQc(SHEET, null, {
      chat: async () => {
        throw new Error("must not be called");
      },
    });
    assert.strictEqual(r.qc, null);
    assert.ok(/no rendered image/.test(r.reason || ""));
  });
  await check("a score outside one to ten is rejected by the schema", () => {
    assert.strictEqual(parseVisionQc(JSON.stringify(qc({ scores: { ...GOOD_SCORES, realism: 11 } }))), null);
    assert.strictEqual(parseVisionQc('{"verdict":"maybe","auto_fails":[]}'), null, "an unknown verdict was accepted");
    assert.strictEqual(parseVisionQc('{"verdict":"verified","auto_fails":[{"code":"invented_fault"}]}'), null);
  });

  // ── 7. The flag is OFF, and that is the default ────────────────────────
  console.log("\nthe flag");
  await check("GPT_VISION_QC is off unless asked for", () => {
    assert.strictEqual(gptVisionQc({}), false);
    assert.strictEqual(gptVisionQc({ GPT_VISION_QC: "" }), false);
    assert.strictEqual(gptVisionQc({ GPT_VISION_QC: "1" }), false, "a truthy-looking value turned it on");
    assert.strictEqual(gptVisionQc({ GPT_VISION_QC: "TRUE" }), true);
  });
  await check("telemetry carries no copy and no image bytes", () => {
    const budget = new QcBudget(CONFIG);
    budget.record({ correction: "Set exactly these strings…", outcome: "fail", because: "x", cost_vnd: 300 });
    const json = JSON.stringify(
      qcTelemetry(qc({ auto_fails: [{ code: "text_missing", what: "Chỉ từ 30K is absent" }] }), "fail", budget),
    );
    assert.ok(!/Chỉ từ 30K/.test(json), "telemetry carried the client's copy");
    assert.ok(!/fake-render-bytes|base64/.test(json), "telemetry carried image data");
    assert.ok(/text_missing/.test(json), "the fault code was not reported");
    assert.ok(/spent_vnd/.test(json), "the spend was not reported");
  });

  // -- 8. The wiring, asserted at source --------------------------------
  //
  // Source-level, because the alternative is standing up the whole ExperimentPipeline with
  // a mocked provider, a mocked judgment, a mocked composer and a mocked LLM — a test whose
  // own scaffolding is larger than the thing it checks, and which would break on any
  // unrelated pipeline change. What needs pinning here is small and structural: the loop
  // exists, it is bounded independently of the gate, and the gate reaches BOTH wrapProvider
  // call sites. Forgetting the second is the measured failure mode in this file's history —
  // the vision review was wired at one render site and was unreachable on the common path
  // for a whole phase.
  console.log("\nthe wiring");
  const PIPELINE = fs.readFileSync(path.join(__dirname, "evolution", "ExperimentPipeline.ts"), "utf8");

  await check("the retry loop is bounded independently of the gate", () => {
    assert.ok(
      PIPELINE.includes("attempt < QC_HARD_MAX_RETRIES"),
      "the retry loop is not bounded by its own counter, so a buggy gate could spend in a circle",
    );
    assert.ok(PIPELINE.includes("if (!next) break;"), "the loop does not stop when the gate declines");
  });
  await check("the gate reaches BOTH wrapProvider call sites", () => {
    const wired = PIPELINE.split("qcGate").length - 1;
    // One declaration, one parameter on wrapProvider, one use inside it, two call sites.
    assert.ok(wired >= 5, `qcGate appears ${wired} times; it is not wired at both call sites`);
    const callSites = (PIPELINE.match(/v2For,\s*\n\s*qcGate/g) || []).length;
    assert.strictEqual(
      callSites,
      2,
      `qcGate reaches ${callSites} of the 2 wrapProvider call sites — a gate wired at one site is unreachable on the other path`,
    );
  });
  await check("a QC failure can never cost the render that already succeeded", () => {
    assert.ok(
      PIPELINE.includes("the gate threw; delivering the render as it is"),
      "a thrown gate is not caught",
    );
    assert.ok(
      PIPELINE.includes("the retry did not return an image; keeping the first render"),
      "a failed retry does not fall back to the first render",
    );
  });
  await check("the gate is built only when the flag is on", () => {
    assert.ok(PIPELINE.includes("const qcGate = gptVisionQc()"), "the gate is not flag-gated");
    assert.ok(PIPELINE.includes("      : undefined;"), "the flag-off branch does not produce undefined");
  });
  await check("an unverified verdict returns null rather than a corrected prompt", () => {
    const gate = PIPELINE.slice(PIPELINE.indexOf("const qcGate = gptVisionQc()"));
    const unverifiedAt = gate.indexOf('verdict.outcome === "unverified"');
    const retryAt = gate.indexOf("qcBudget.mayRetry(");
    assert.ok(unverifiedAt > 0 && retryAt > 0, "the gate no longer has both branches");
    assert.ok(
      unverifiedAt < retryAt,
      "the unverified short-circuit comes AFTER the retry decision, so our own blindness could trigger a paid retry",
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
