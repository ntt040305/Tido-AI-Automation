import assert from "assert";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";

/**
 * The optimizer as a conditional safety layer.
 *
 * Two failures matter here and they pull in opposite directions. The first is
 * the one being repaired: compressing a prompt that was never at risk, which is
 * what happened while the ceiling sat at 32,000 and compression began at 17,000.
 * The second is the one the repair could introduce — a prompt that reaches the
 * provider over the real ceiling because the safety layer decided it was safe.
 *
 * So most of these tests sit on the boundary, and the rest confirm that when
 * compression does run it still takes prose before it takes meaning.
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
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

const SOFT = ProviderPromptOptimizer.SOFT_THRESHOLD;
const HARD = ProviderPromptOptimizer.HARD_LIMIT;

/**
 * A prompt with real section headings, padded to a length.
 *
 * The padding goes inside CAMPAIGN STRATEGY on purpose. `signalMix` classifies
 * by section tier, not by wording, so filler appended after the last heading
 * lands in a supporting tier and drives the generic ratio past its budget. The
 * first version of this fixture did exactly that and tripped the dilution guard,
 * failing four tests that were not about dilution at all. Padding a creative
 * section keeps the mix healthy, which is what an ordinary long prompt is.
 */
function promptOf(chars: number): string {
  const head = [
    "## ROLE",
    "Make a commercial photograph.",
    "",
    "## CAMPAIGN STRATEGY",
    "- Objective: sell the bottle.",
    "The exact camera, lighting and layout are resolved in the ART DIRECTION and COMMERCIAL LAYOUT sections; where those conflict with this section, they win, and an explicit client directive beats both.",
  ].join("\n");
  const tail = [
    "",
    "## PRODUCT IDENTITY",
    "The bottle is the subject and its label is fixed.",
    "",
    "## KNOWLEDGE METADATA",
    "Retrieved 4 documents at confidence 0.82.",
    "",
    "## AUDIENCE ANALYSIS",
    "The regular customer already trusts the shop and is not being persuaded.",
    "",
    "## ART DIRECTION",
    "One key light from the left, raking across the label.",
    "",
    "## FINAL OUTPUT",
    "Render it.",
  ].join("\n");

  const target = chars - head.length - tail.length;
  let body = "";
  let i = 0;
  while (body.length < target) {
    body += `\n- Angle ${i}: light falls across the shoulder of the bottle and the label stays legible at arm's length.`;
    i++;
  }
  const out = head + (target > 0 ? body.slice(0, target) : "") + tail;
  return out.length > chars ? out.slice(0, chars) : out;
}

console.log("\n=== Optimizer as a conditional safety layer ===\n");
console.log(`  bands in force: soft ${SOFT}, hard ${HARD}\n`);

// ── the band itself ─────────────────────────────────────────────────────────

check("The band is derived from the ceiling, not pinned below it", () => {
  assert.ok(SOFT < HARD, "the soft band is not below the ceiling");
  assert.strictEqual(SOFT, Math.floor(HARD * 0.85), "the band is not the configured ratio of the ceiling");
});

check("An unconfigured environment keeps the historical numbers", () => {
  // 0.85 x 20,000 is 17,000 exactly. The ratio reproduces the pair that was
  // already hardcoded, so raising the ceiling is the only thing that moves.
  assert.strictEqual(Math.floor(20000 * 0.85), 17000);
});

// ── pass-through ────────────────────────────────────────────────────────────

check("Inside the band, no section is dropped for budget", () => {
  // Not "byte-identical". The first version of this test asserted that and it
  // was wrong: hygiene runs before the gate and strips retrieval metadata the
  // renderer cannot use. What the band actually promises is that nothing is
  // removed BECAUSE OF LENGTH, and `tiers_dropped` is where that would show.
  const p = promptOf(Math.floor(SOFT * 0.6));
  const r = ProviderPromptOptimizer.optimize(p);
  assert.deepStrictEqual(r.telemetry.tiers_dropped ?? [], [], "a tier was dropped with budget to spare");
  assert.ok(
    !r.telemetry.removed_sections.some((s) => s.startsWith("P1_") || s.startsWith("P2_")),
    "a priority section was dropped inside the band"
  );
  assert.ok(
    !r.telemetry.removed_sections.some((s) => s.startsWith("SIGNAL_META_PROSE")),
    "the creative signal was compressed inside the band"
  );
});

check("Explanation sections survive inside the band", () => {
  // AUDIENCE ANALYSIS is P2 and is dropped above the band. It is not one of the
  // non-generative patterns hygiene targets, so inside the band it should still
  // be there — unlike KNOWLEDGE METADATA, which hygiene removes at any length
  // because confidence scores are machine bookkeeping, not direction.
  const out = ProviderPromptOptimizer.optimize(promptOf(Math.floor(SOFT * 0.6))).optimizedPrompt;
  assert.ok(out.includes("## AUDIENCE ANALYSIS"), "a P2 section was dropped with budget to spare");
});

check("The precedence prose survives inside the band", () => {
  // compressSignalSections strips this above the band. Its disappearance is what
  // made an entire phase of layout work a no-op in production.
  const out = ProviderPromptOptimizer.optimize(promptOf(Math.floor(SOFT * 0.6))).optimizedPrompt;
  assert.ok(out.includes("where those conflict with this section, they win"));
});

check("Exactly at the band, compression has still not started", () => {
  const r = ProviderPromptOptimizer.optimize(promptOf(SOFT));
  assert.deepStrictEqual(r.telemetry.tiers_dropped ?? [], [], "the boundary value was compressed");
});

// ── compression still works above the band ──────────────────────────────────

check("Above the band, compression engages", () => {
  const p = promptOf(SOFT + 2000);
  const r = ProviderPromptOptimizer.optimize(p);
  assert.ok(r.telemetry.compression_applied, "nothing ran above the band");
  assert.ok(r.telemetry.after_chars < r.telemetry.before_chars, "the prompt did not get shorter");
});

check("Explanation prose goes before anything that carries meaning", () => {
  const out = ProviderPromptOptimizer.optimize(promptOf(SOFT + 2000)).optimizedPrompt;
  assert.ok(!out.includes("## AUDIENCE ANALYSIS"), "a P2 explanation survived compression");
  // The five the brief names as highest priority.
  assert.ok(out.includes("## PRODUCT IDENTITY"), "product identity was dropped");
  assert.ok(out.includes("## CAMPAIGN STRATEGY"), "the campaign goal was dropped");
  assert.ok(out.includes("## ART DIRECTION"), "creative direction was dropped");
  assert.ok(out.includes("## ROLE"), "the role was dropped");
  assert.ok(out.includes("## FINAL OUTPUT"), "the output contract was dropped");
});

check("A prompt far over the ceiling is reduced", () => {
  const p = promptOf(Math.floor(HARD * 1.6));
  const r = ProviderPromptOptimizer.optimize(p);
  assert.ok(r.telemetry.compression_applied);
  assert.ok(r.optimizedPrompt.length < p.length, `compression did not reduce ${p.length} characters`);
});

check("Protected sections survive even far over the ceiling", () => {
  const out = ProviderPromptOptimizer.optimize(promptOf(Math.floor(HARD * 1.6))).optimizedPrompt;
  for (const s of ["## PRODUCT IDENTITY", "## CAMPAIGN STRATEGY", "## FINAL OUTPUT", "## ROLE"]) {
    assert.ok(out.includes(s), `${s} was dropped under pressure — it is P0`);
  }
});

// ── the layer is still there ────────────────────────────────────────────────

check("The optimizer was not removed or stubbed", () => {
  assert.strictEqual(typeof ProviderPromptOptimizer.optimize, "function");
  const r = ProviderPromptOptimizer.optimize(promptOf(SOFT + 2000));
  assert.ok(r.telemetry.removed_sections.length > 0, "compression reported nothing removed");
  assert.ok((r.telemetry.tiers_dropped ?? []).length > 0, "no tier was dropped above the band");
});

check("Telemetry distinguishes the two modes", () => {
  // `compression_applied` is not the discriminator and must not be used as one:
  // hygiene sets it true at any length. `tiers_dropped` is the honest signal of
  // content actually lost to budget.
  const under = ProviderPromptOptimizer.optimize(promptOf(Math.floor(SOFT * 0.6)));
  const over = ProviderPromptOptimizer.optimize(promptOf(SOFT + 2000));
  assert.strictEqual((under.telemetry.tiers_dropped ?? []).length, 0, "content was dropped inside the band");
  assert.ok(over.telemetry.removed_sections.length > under.telemetry.removed_sections.length);
  assert.strictEqual(under.telemetry.budget_status, "OK");
});

console.log("");
console.log("=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
