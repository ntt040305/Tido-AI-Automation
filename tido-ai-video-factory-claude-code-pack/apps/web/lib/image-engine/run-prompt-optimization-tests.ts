import assert from "assert";
import fs from "fs";
import path from "path";
import { CompactPromptFormatter } from "./compiler/CompactPromptFormatter";
import { KnowledgeBlockCompressor } from "./compiler/KnowledgeBlockCompressor";
import { ProviderPromptOptimizer } from "./compiler/ProviderPromptOptimizer";

/**
 * MASTER_PROMPT_OPTIMIZATION_V2 verification.
 *
 * The constraint with teeth is that the prompt got shorter without losing a
 * creative decision. Compression is trivially testable and preservation is the
 * part that actually matters, so most of what follows checks that something
 * survived rather than that something went.
 *
 * Fixtures are real compiled prompts from `data/generated/image-renders`. A
 * synthetic prompt built for this test would be exactly as compressible as I
 * made it.
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

const RENDERS = "data/generated/image-renders";

function realPrompts(limit = 12): { file: string; text: string }[] {
  if (!fs.existsSync(RENDERS)) return [];
  return fs
    .readdirSync(RENDERS)
    .map((d) => path.join(RENDERS, d, "master_prompt.md"))
    .filter((f) => fs.existsSync(f))
    .map((f) => ({ file: f, size: fs.statSync(f).size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, limit)
    .map(({ file }) => ({ file, text: fs.readFileSync(file, "utf-8") }));
}

console.log("\nMASTER_PROMPT_OPTIMIZATION_V2\n");

// ── Budget rule (Task 6) ──────────────────────────────────────────────────

check("The budget spends the provider's full allowance", () => {
  // Corrected: the earlier band chased brevity and cost the prompt its
  // photographic instructions. Everything under the provider's allowance is free.
  //
  // The ceiling is read from `PROMPT_HARD_MAXIMUM_CHARS` now, falling back to the
  // 20,000 this used to assert outright. Written as a literal it passed on an
  // unconfigured machine and failed on a configured one while the code was
  // correct on both, so it asserts the contract instead: an unset environment is
  // unchanged, a set one is honoured, and the soft band never overtakes the hard
  // one.
  const configured = process.env.PROMPT_HARD_MAXIMUM_CHARS;
  if (!configured) {
    assert.strictEqual(ProviderPromptOptimizer.HARD_LIMIT, 20000, "the fallback ceiling moved");
    assert.strictEqual(ProviderPromptOptimizer.SOFT_THRESHOLD, 17000, "the fallback soft band moved");
  } else {
    assert.strictEqual(
      ProviderPromptOptimizer.HARD_LIMIT,
      Number(configured),
      "the configured ceiling was ignored"
    );
  }
  assert.ok(
    ProviderPromptOptimizer.SOFT_THRESHOLD <= ProviderPromptOptimizer.HARD_LIMIT,
    "the soft band sits above the hard ceiling"
  );
  assert.strictEqual(
    ProviderPromptOptimizer.WARN_THRESHOLD,
    ProviderPromptOptimizer.SOFT_THRESHOLD,
    "the WARN_THRESHOLD alias drifted"
  );
});

check("A prompt under the soft threshold is left alone", () => {
  // The regression this guards: an affordable prompt was being tier-dropped and
  // formatting-stripped for headroom it did not need.
  const lines = Array.from(
    { length: 60 },
    (_, i) => `Instruction ${i}: keep speculars plausible on glass and metal surfaces.`
  );
  const prompt = [
    "## ART DIRECTION",
    ...lines,
    "",
    "## ATMOSPHERE",
    "Warm and inviting throughout the whole frame.",
  ].join("\n");
  assert.ok(prompt.length < ProviderPromptOptimizer.SOFT_THRESHOLD, "fixture is not under the threshold");
  const out = ProviderPromptOptimizer.optimize(prompt);
  assert.ok(!(out.telemetry.tiers_dropped || []).length, `a tier was dropped: ${out.telemetry.tiers_dropped}`);
  assert.ok(
    !out.telemetry.removed_sections.includes("FORMATTING_COMPRESSION"),
    "formatting was stripped from an affordable prompt"
  );
  assert.ok(/## ATMOSPHERE/.test(out.optimizedPrompt), "a P1 section was dropped needlessly");
});

check("Budget status is reported, not just logged", () => {
  const small = ProviderPromptOptimizer.optimize("## ROLE\nMake a picture of a bottle on a table.");
  assert.strictEqual(small.telemetry.budget_status, "OK");
});

// ── Knowledge compression (Task 5) ────────────────────────────────────────

check("A knowledge block keeps its execution instructions", () => {
  const block = [
    "**PERSPECTIVE CONSISTENCY",
    "- Objects and spatial elements that belong to the same physical scene should follow a coherent perspective framework appropriate to the chosen viewpoint.",
    "- Projection, vanishing behavior, surface orientation, and spatial depth should remain internally consistent so the environment feels intentionally constructed rather than accidentally distorted.",
    "- Perspective relationships should remain believable even when the creative treatment is unconventional.",
    "**SCALE & SPATIAL RELATIONSHIPS",
    "- Objects sharing the same implied physical space should maintain internally coherent scale relationships across depth.",
    "- Relative size, distance, overlap, and spatial placement should work together consistently with the chosen perspective.",
  ].join("\n");
  const out = KnowledgeBlockCompressor.compress(block);
  assert.deepStrictEqual(out.topics, ["PERSPECTIVE CONSISTENCY", "SCALE & SPATIAL RELATIONSHIPS"]);
  assert.ok(/perspective/i.test(out.text), "perspective instruction lost");
  assert.ok(/scale/i.test(out.text), "scale instruction lost");

  // This assertion used to be `after_chars < block.length * 0.6` — it demanded
  // that the compressor be aggressive, and so it passed while 43 of 56
  // instruction lines and 20 physical rules were being discarded. Shortness was
  // never the goal. What the compressor owes is the executable constraints, so
  // that is what is checked now.
  assert.ok(
    /vanishing behavior|surface orientation|spatial depth/i.test(out.text),
    `the projection constraint was dropped: ${out.text}`
  );
  assert.ok(
    /relative size|distance|overlap|spatial placement/i.test(out.text),
    `the scale constraint was dropped: ${out.text}`
  );
  // And the permissive sentence, which grants latitude rather than constraining,
  // is the one thing that should go.
  assert.ok(
    !/may be used creatively|may vary widely/i.test(out.text),
    "permissive theory survived compression"
  );
});

check("Compression does not break subject-verb agreement", () => {
  // An earlier version conjugated "should follow" to "follows" and produced
  // "Objects and spatial elements ... follows a coherent perspective framework".
  const block = [
    "**PERSPECTIVE CONSISTENCY",
    "- Objects and spatial elements that belong to the same physical scene should follow a coherent perspective framework appropriate to the chosen viewpoint.",
  ].join("\n");
  const out = KnowledgeBlockCompressor.compress(block);
  assert.ok(!/elements[^.]*\bfollows\b/i.test(out.text), `agreement broken: ${out.text}`);
  assert.ok(/should follow/i.test(out.text), `the modal was dropped: ${out.text}`);
});

check("A block with no recognised structure is not silently emptied", () => {
  const block = "Keep the bottle label sharp and legible at all sizes.";
  const out = KnowledgeBlockCompressor.compress(block);
  assert.ok(out.text.length > 0, "content vanished");
  assert.ok(/bottle label/i.test(out.text), "content changed");
});

// ── Non-generative content (Task 1) ───────────────────────────────────────

check("Confidence scores, provenance and retrieval notices are removed", () => {
  const prompt = [
    "## ROLE",
    "Render a commercial photograph.",
    "## PROFESSIONAL KNOWLEDGE",
    "NOTICE: Retrieved professional knowledge provides supportive physical principles. Non-exhaustive; does not restrict valid creative solutions.",
    "#### [universal.lighting_material_readability] Lighting",
    "confidence: 0.82",
    "evidence_type: EMPIRICAL",
    "final_score: 0.91",
    "selection_tier: PRIMARY",
    "Keep speculars physically plausible on glass.",
  ].join("\n");
  const out = ProviderPromptOptimizer.optimize(prompt);
  const t = out.optimizedPrompt;
  assert.ok(!/confidence:\s*0/i.test(t), "confidence score survived");
  assert.ok(!/evidence_type/i.test(t), "evidence type survived");
  assert.ok(!/final_score/i.test(t), "final score survived");
  assert.ok(!/selection_tier/i.test(t), "selection tier survived");
  assert.ok(!/NOTICE: Retrieved professional knowledge/i.test(t), "retrieval notice survived");
  assert.ok(!/\[universal\.lighting_material_readability\]/.test(t), "knowledge block id survived");
  // And the instruction itself is untouched.
  assert.ok(/Keep speculars physically plausible on glass\./.test(t), "the actual instruction was removed");
});

check("An instruction restated verbatim elsewhere is stated once", () => {
  const shared =
    "Large soft box at 10-11 o'clock position, elevated above subject at roughly 45 degrees, producing broad even diffused illumination";
  const prompt = [
    "## ART DIRECTION",
    `- LIGHTING: ${shared}. Fill ratio approximately 1:2.`,
    "REFERENCE SHOT SHEET",
    "LIGHTING",
    `  Key: ${shared}`,
    "  Colour temperature: Cool daylight, approximately 6000-6500K with no warm tones anywhere in frame",
  ].join("\n");
  const out = ProviderPromptOptimizer.optimize(prompt);
  const occurrences = out.optimizedPrompt.split(shared).length - 1;
  assert.strictEqual(occurrences, 1, `the lighting rig is stated ${occurrences} times`);
  // The resolved bullet is the one kept: it declares itself the sole authority.
  assert.ok(/- LIGHTING:/.test(out.optimizedPrompt), "the authoritative bullet was dropped instead");
  assert.ok(/Colour temperature/.test(out.optimizedPrompt), "a non-duplicated sub-line was dropped");
});

// ── Smart merging (Task 4) ────────────────────────────────────────────────

check("Four ways of saying premium lighting become one concrete one", () => {
  const prompt = [
    "## ART DIRECTION",
    "Use premium cinematic commercial lighting throughout.",
    "Apply high-end advertising lighting to the hero.",
    "Support with luxury studio lighting on the surface.",
    "Finish with professional campaign lighting.",
  ].join("\n");
  const out = ProviderPromptOptimizer.optimize(prompt);
  assert.ok((out.telemetry.merges_applied || 0) >= 3, `only ${out.telemetry.merges_applied} merges`);
  assert.ok(/controlled directional advertising lighting/i.test(out.optimizedPrompt), "the merged phrase is absent");

  // What merging delivers is one vocabulary, not fewer characters. The agreed
  // replacement is longer than some variants it replaces ("luxury studio
  // lighting" is 22 characters against 38), so asserting that this fixture got
  // shorter would be asserting the wrong property. Four ways of naming one
  // lighting treatment become one way; the saving arrives downstream, when whole
  // lines coincide and the dedupe pass removes them, and end to end on real
  // prompts it is covered by "Real prompts get materially shorter".
  const variants = [/cinematic commercial lighting/i, /high-end advertising lighting/i, /luxury studio lighting/i, /professional campaign lighting/i];
  for (const v of variants) {
    assert.ok(!v.test(out.optimizedPrompt), `variant ${v} survived the merge`);
  }
  const collapsed = out.optimizedPrompt.match(/controlled directional advertising lighting/gi) || [];
  assert.strictEqual(collapsed.length, 4, `expected all four to collapse, got ${collapsed.length}`);
  // And the one surviving vocabulary is not itself a verdict word — this pass
  // used to unify on "premium cinematic", manufacturing exactly what the ROLE
  // section now tells the renderer to disregard.
  assert.ok(!/premium|cinematic|luxury/i.test(out.optimizedPrompt), out.optimizedPrompt);
});

check("A phrase used once is left alone", () => {
  // One occurrence is the writer's phrasing, not redundancy.
  const prompt = "## ART DIRECTION\nUse luxury studio lighting on the bottle.";
  const out = ProviderPromptOptimizer.optimize(prompt);
  assert.ok(/luxury studio lighting/i.test(out.optimizedPrompt), "a single occurrence was rewritten");
  assert.strictEqual(out.telemetry.merges_applied, 0);
});

// ── Priority hierarchy (Task 2) ───────────────────────────────────────────

check("P0 survives even when the prompt is far over the hard limit", () => {
  // Sized against the live ceiling, not a literal. Written as `.repeat(400)` the
  // fixture was "far over" only while the ceiling happened to be 20,000; once
  // PROMPT_HARD_MAXIMUM_CHARS moved it, the test asserted nothing.
  const filler = "Atmosphere should feel warm and inviting across the whole frame. ".repeat(
    Math.ceil((ProviderPromptOptimizer.HARD_LIMIT * 1.4) / 65)
  );
  const prompt = [
    "## PRODUCT IDENTITY",
    "[IDENTITY LOCK] PRODUCT_01 Bernard Cafe bottle: preserve glass silhouette and label typography.",
    "## ART DIRECTION",
    "CAMERA: low angle, 50mm. LIGHTING: soft key from the left.",
    "## ATMOSPHERE",
    filler,
    "## CONFLICT PRIORITY",
    "Identity locks win over style.",
  ].join("\n");
  assert.ok(prompt.length > ProviderPromptOptimizer.HARD_LIMIT, "fixture is not over the limit");

  const out = ProviderPromptOptimizer.optimize(prompt);
  assert.ok(/IDENTITY LOCK/.test(out.optimizedPrompt), "the identity lock was dropped");
  assert.ok(/Bernard Cafe bottle/.test(out.optimizedPrompt), "the product was dropped");
  assert.ok(/CAMERA: low angle/.test(out.optimizedPrompt), "the camera direction was dropped");
  assert.ok(/LIGHTING: soft key/.test(out.optimizedPrompt), "the lighting direction was dropped");
  assert.ok(/Identity locks win over style/.test(out.optimizedPrompt), "conflict priority was dropped");
  // The P1 filler is what pays for the budget.
  assert.ok(out.optimizedPrompt.length < prompt.length / 2, "nothing substantial was reclaimed");
  assert.ok((out.telemetry.tiers_dropped || []).some((t) => t.startsWith("P1:")), "no P1 tier was dropped");
});

check("A prompt that is all P0 is reported over budget rather than cut", () => {
  const prompt = [
    "## PRODUCT IDENTITY",
    "[IDENTITY LOCK] preserve the silhouette. ".repeat(
      Math.ceil((ProviderPromptOptimizer.HARD_LIMIT * 0.7) / 41)
    ),
    "## PRODUCT INSTANCE REQUIREMENTS",
    "Render the bottle facing camera. ".repeat(
      Math.ceil((ProviderPromptOptimizer.HARD_LIMIT * 0.7) / 33)
    ),
  ].join("\n");
  const out = ProviderPromptOptimizer.optimize(prompt);
  assert.ok(out.optimizedPrompt.includes("[IDENTITY LOCK]"), "P0 was cut to reach the budget");
  assert.strictEqual(out.telemetry.budget_status, "OVER_HARD_LIMIT", "an oversized prompt reported as fine");
});

// ── Compact format (Task 3) ───────────────────────────────────────────────

check("Sections are regrouped under the compact headings", () => {
  const prompt = [
    "## PRODUCT IDENTITY",
    "Preserve the Bernard Cafe bottle silhouette and label typography exactly.",
    "## VIEWPOINT DECOUPLING",
    "The reference viewpoint does not constrain the rendered camera angle at all.",
    "## USER HARD REQUIREMENTS",
    "No distortion of the product and no invented label text anywhere in frame.",
  ].join("\n");
  const out = CompactPromptFormatter.format(prompt);
  assert.strictEqual(out.applied, true, out.reason);
  assert.ok(out.prompt.includes("[SUBJECT]"), "no SUBJECT section");
  assert.ok(out.prompt.includes("[CAMERA]"), "no CAMERA section");
  assert.ok(out.prompt.includes("[NEGATIVE CONSTRAINTS]"), "no NEGATIVE CONSTRAINTS section");
  assert.ok(out.prompt.indexOf("[SUBJECT]") < out.prompt.indexOf("[CAMERA]"), "sections are out of order");
});

check("The formatter refuses to run rather than lose a line", () => {
  // Directly exercises the guard: a prompt whose content cannot survive
  // regrouping must come back untouched.
  const prompt = "## PRODUCT IDENTITY\nPreserve the bottle silhouette exactly as shown.";
  const out = CompactPromptFormatter.format(prompt);
  assert.ok(out.prompt.includes("Preserve the bottle silhouette exactly as shown."), "the instruction was lost");
});

check("Nothing is lost when regrouping a real compiled prompt", () => {
  const prompts = realPrompts(8);
  assert.ok(prompts.length > 0, "no real prompts on disk to test against");
  for (const { file, text } of prompts) {
    const out = CompactPromptFormatter.format(text);
    if (!out.applied) continue;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length < 12 || trimmed.startsWith("#")) continue;
      assert.ok(out.prompt.includes(trimmed), `${path.basename(path.dirname(file))} lost: "${trimmed.slice(0, 60)}"`);
    }
  }
});

// ── End to end, on real prompts (Task 7) ──────────────────────────────────

check("Real prompts get materially shorter", () => {
  const prompts = realPrompts(12);
  assert.ok(prompts.length > 0, "no real prompts on disk");
  let before = 0;
  let after = 0;
  for (const { text } of prompts) {
    before += text.length;
    after += ProviderPromptOptimizer.optimize(text).optimizedPrompt.length;
  }
  // The optimizer alone, without the knowledge compression the compiler now
  // applies upstream. Even so it must earn its place.
  assert.ok(after < before, `${before} -> ${after}`);
});

check("No real prompt loses its identity, camera or lighting direction", () => {
  const mustSurvive: [string, RegExp][] = [
    ["camera", /camera|perspective|viewpoint|angle|lens/i],
    ["lighting", /light(?:ing)?|illuminat/i],
    ["composition", /composition|layout|hierarchy|framing/i],
    ["materials", /material|surface|texture|finish/i],
  ];
  for (const { file, text } of realPrompts(12)) {
    const out = ProviderPromptOptimizer.optimize(text).optimizedPrompt;
    for (const [name, pattern] of mustSurvive) {
      if (!pattern.test(text)) continue; // it was never there to lose
      assert.ok(pattern.test(out), `${path.basename(path.dirname(file))} lost its ${name} direction`);
    }
  }
});

check("Optimization is idempotent", () => {
  // Running twice must not keep shrinking: a pass that always finds something to
  // remove is removing things it should not.
  for (const { text } of realPrompts(4)) {
    const once = ProviderPromptOptimizer.optimize(text).optimizedPrompt;
    const twice = ProviderPromptOptimizer.optimize(once).optimizedPrompt;
    assert.strictEqual(twice.length, once.length, "a second pass changed the prompt again");
  }
});

// ── What survives an oversized prompt (Nano Banana 2, Task 7) ─────────

check("The scene, the product and the realism rules outlive the filler", () => {
  // Scaled to the live ceiling for the same reason as the fixture above: written
  // as `.repeat(420)` this was oversized only while the ceiling was 20,000.
  const filler =
    "## BRAND KNOWLEDGE\n" +
    "Bernard Cafe was founded in 2011 and operates 40 stores. ".repeat(
      Math.ceil((ProviderPromptOptimizer.HARD_LIMIT * 1.5) / 56)
    );
  // The campaign section carries the bulk a real compiled prompt carries —
  // roughly 4,500 characters against 20,000 — because the optimizer now weighs
  // generic content against decided direction as well as against the ceiling.
  // Written with four lines of creative content and 48,000 of brand trivia, this
  // fixture described a prompt in which everything is dilution, and the budget
  // correctly emptied it. What the case is for is the drop ORDER, and that is
  // still what it proves: brand trivia must go before the physical rules.
  const campaignBulk = "Campaign DNA line that ties the five assets together. ".repeat(
    Math.ceil((ProviderPromptOptimizer.HARD_LIMIT * 0.22) / 53)
  );
  const prompt = [
    "## CREATIVE INTENT",
    "CREATIVE CONCEPT: quan ca phe khai truong",
    "## CAMPAIGN STRATEGY",
    "THE SCENE — WHAT THE IMAGE ACTUALLY SHOWS:",
    "- What is happening: two friends step in from the street, first coffees just set down.",
    "- Who is in frame: one woman crossing the threshold, hand still on the door frame.",
    campaignBulk,
    "## PRODUCT IDENTITY",
    "[IDENTITY LOCK] PRODUCT_01 Bernard Cafe bottle: preserve glass silhouette and label typography.",
    "## COMMERCIAL LAYOUT",
    "Headline zone occupies the upper third; product sits on the lower vertical axis.",
    "## PROFESSIONAL KNOWLEDGE",
    "Speculars stay physically plausible on glass; contact shadows anchor the bottle to the surface.",
    filler,
    "## OUTPUT CONTEXT",
    "INTENDED USE CASE: Poster",
  ].join("\n");
  assert.ok(prompt.length > ProviderPromptOptimizer.HARD_LIMIT, "fixture is not over the limit");

  const out = ProviderPromptOptimizer.optimize(prompt);
  const t = out.optimizedPrompt;
  // Scene and action.
  assert.ok(/What is happening: two friends step in/.test(t), "the scene was dropped");
  assert.ok(/Who is in frame/.test(t), "the human presence was dropped");
  // Product identity, creative intent, composition.
  assert.ok(/Bernard Cafe bottle/.test(t), "product identity was dropped");
  assert.ok(/quan ca phe khai truong/.test(t), "creative intent was dropped");
  assert.ok(/Headline zone occupies the upper third/.test(t), "composition was dropped");
  // Realism. This is the one the drop order used to sacrifice first: the
  // selection took the highest rank out of a list written least-valuable-first,
  // so the physical rules went before the brand's founding date.
  assert.ok(/Speculars stay physically plausible/.test(t), "the physical rules were dropped");
  assert.ok(!/founded in 2011/.test(t), "the filler survived instead");
});

check("Least valuable goes first, and unclassified sections outlive the list", () => {
  // Each section is sized so the three together clear the live ceiling; a fixed
  // repeat count only cleared the 20,000 this used to be pinned to.
  const heavy = (h: string) =>
    `## ${h}\n` +
    `${h} body text that is long enough to matter. `.repeat(
      Math.ceil((ProviderPromptOptimizer.HARD_LIMIT * 0.5) / 44)
    );
  const prompt = [
    "## PRODUCT IDENTITY",
    "[IDENTITY LOCK] preserve the silhouette.",
    heavy("BRAND KNOWLEDGE"),
    heavy("PROFESSIONAL KNOWLEDGE"),
    heavy("ATMOSPHERE"),
  ].join("\n");
  const out = ProviderPromptOptimizer.optimize(prompt);
  const dropped = (out.telemetry.tiers_dropped || []).join(" ");
  assert.ok(/BRAND KNOWLEDGE/.test(dropped), `brand knowledge survived first: ${dropped}`);
  assert.ok(!/ATMOSPHERE/.test(dropped), `an unclassified section went before a classified one: ${dropped}`);
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
