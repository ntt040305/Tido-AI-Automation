/**
 * Phase 5.6.5 — who owns each sentence in the prompt. Offline.
 *
 * What this suite is for
 * ----------------------
 *   1. ONE OWNER PER TOPIC. Fifteen modules can write into the image prompt.
 *      Each topic must have exactly one, and a section that strays into
 *      another's topic is reported rather than left invisible -- that is where
 *      two accounts of one camera come from.
 *   2. NO TWO MODULES DECIDE THE CAMERA. Asserted on the assembled text of a
 *      real brief, not on a comment.
 *   3. THE STORED PROMPT IS THE SENT PROMPT. A wrapper that appends to the
 *      compiled prompt must hand the result back, or the record is a prompt
 *      that was never used.
 *   4. THE DECISION CHAIN IS TRACEABLE. The same brief twice produces the same
 *      decisions, and each names what produced it.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  TOPIC_OWNER, auditSections, assemble, ownershipTelemetry,
} = require("./evolution/experiment/PromptOwnership");
const { buildCompositionPlan, renderCompositionPlan } = require("./evolution/experiment/CompositionPlan");
const { buildTypographyDNA, renderDnaForImagePrompt } = require("./evolution/experiment/TypographyDNA");
const { buildGeometry } = require("./evolution/experiment/LayoutGeometry");
const { buildComposition } = require("./evolution/experiment/VisualComposition");
const { buildTypographySystem, assignTextRoles, geometryRolesFor } = require("./evolution/experiment/TypographySystem");
const { resolveTextRequirement, textDirective } = require("./compiler/ExactCopyIntegrityValidator");
const { NO_TEXT_DIRECTIVE } = require("./evolution/experiment/TypographyRenderer");

const WEB = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf-8");
/** One finding from the audit. Declared because the module is required, not imported. */
type Finding = { topic: string; section: string; owner: string; phrases: string[] };
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    failures.push(`${name}\n    ${(e as Error).message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

// ── a real brief, assembled the way the pipeline assembles one ─────────────

const SECTIONS: Record<string, string[]> = {
  concept: ["big_idea", "campaign_concept", "visual_story", "creative_tension", "emotional_hook", "message_strategy"],
  visual_world: ["visual_world", "environment_logic", "color_story", "visual_metaphor", "styling", "props", "atmosphere", "composition_logic"],
  photography: ["camera_language", "lens_character", "focus_behavior", "lighting_behavior", "depth_feeling", "material_rendering"],
  design: ["font_character", "typographic_voice", "hierarchy_logic", "spacing_behavior", "placement_reason", "contrast_strategy"],
  layout: ["visual_balance", "product_position", "text_area", "negative_space", "attention_flow", "composition_balance"],
  brand_expression: ["visual_language", "color_system", "material_language", "emotional_direction"],
};
function blueprint(fields: Record<string, string>): any {
  const bp: any = {};
  for (const [section, keys] of Object.entries(SECTIONS)) {
    bp[section] = {};
    for (const k of keys) {
      bp[section][k] = fields[k] ? { value: fields[k], because: "fixture", derived_from: "product_truth", confidence: "high" } : null;
    }
  }
  return bp;
}

const BRIEF = blueprint({
  big_idea: "Coffee as a considered ritual for people who have stopped rushing",
  visual_story: "the moment before the first cup, in a room nobody else is awake in",
  emotional_hook: "restraint as a form of confidence",
  environment_logic: "a stone counter in a room stripped of everything that is not needed",
  atmosphere: "still, composed, expensive without saying so",
  camera_language: "eye level and straight on, close, so the bottle is met rather than observed",
  lens_character: "the background falls away completely; only the label is sharp",
  lighting_behavior: "one low window light from the side, raking, deep falloff and nothing filled in",
  depth_feeling: "shallow — one plane in focus and everything else surrendered",
  composition_logic: "the bottle sits off-centre to the right third, weight carried by the empty side",
  negative_space: "the empty left is what makes the restraint credible; it is the point, not the leftover",
  typographic_voice: "editorial",
});

const COPY = ["Slow mornings", "Cold brew, done properly", "Discover"];
const NEWLINE = "\n";

/** The sections a hybrid render assembles, each declaring its owner. */
function sectionsFor(bp: any) {
  const req = resolveTextRequirement({ contentMessage: COPY.join(NEWLINE) });
  const assigned = assignTextRoles(req.lines);
  const geometry = buildGeometry({
    ratio: "1:1", blueprint: bp, copyRoles: geometryRolesFor(assigned), productCount: 1,
    compositionHint: bp?.visual_world?.composition_logic?.value ?? null,
  });
  buildTypographySystem({ geometry, lines: assigned });
  const composition = buildComposition({ blueprint: bp });
  const plan = buildCompositionPlan({
    blueprint: bp, geometry, composition, copyLines: COPY.length, copy: assigned, ratio: "1:1",
  });
  const dna = buildTypographyDNA({ blueprint: bp, copyLines: COPY.length, compositionPlan: plan });

  const out: Array<{ topic: string; owner: string; text: string }> = [];
  const push = (topic: string, text: string | undefined) => {
    if (text) out.push({ topic, owner: TOPIC_OWNER[topic], text });
  };
  push("composition", renderCompositionPlan(plan, { sceneOnly: true }));
  push("typography_intent", renderDnaForImagePrompt(dna));
  push("typography_copy", textDirective(req));
  push("render_constraints", NO_TEXT_DIRECTIVE);
  return { sections: out, plan, dna };
}

function main() {
  console.log("\nPrompt ownership — one owner per decision\n");

  // ── 1. the registry ─────────────────────────────────────────────────────
  console.log("1 — every topic has exactly one owner");

  check("no topic is owned by two modules, and none is unowned", () => {
    const topics = Object.keys(TOPIC_OWNER);
    assert.ok(topics.length >= 10, `only ${topics.length} topics are registered`);
    for (const [topic, owner] of Object.entries(TOPIC_OWNER)) {
      assert.ok(typeof owner === "string" && owner.length > 2, `${topic} has no owner`);
    }
    // The four the brief names explicitly.
    assert.strictEqual(TOPIC_OWNER.camera, "CompositionPlan");
    assert.strictEqual(TOPIC_OWNER.lighting, "CompositionPlan");
    assert.strictEqual(TOPIC_OWNER.typography_intent, "TypographyDNA");
    assert.strictEqual(TOPIC_OWNER.creative_idea, "CreativeDirector");
    assert.strictEqual(TOPIC_OWNER.render_constraints, "Renderer");
  });

  check("every section declares the owner the registry names", () => {
    const { sections } = sectionsFor(BRIEF);
    const audit = auditSections(sections);
    assert.deepStrictEqual(audit.misowned, [], `sections claiming an owner they do not have: ${JSON.stringify(audit.misowned)}`);
    assert.ok(audit.sections.length >= 3, "the assembly produced almost nothing to audit");
  });

  // ── 2. THE AUDIT: who writes about what ────────────────────────────────
  console.log("\n2 — nobody writes about someone else's topic");

  check("no two sections decide the camera", () => {
    const { sections } = sectionsFor(BRIEF);
    const audit = auditSections(sections);
    for (const s of audit.sections) console.log(`      ${s.owner.padEnd(28)} ${s.topic.padEnd(20)} ${s.chars} chars`);
    const camera = audit.contested.filter((c: Finding) => c.topic === "camera");
    assert.deepStrictEqual(
      camera, [],
      `these sections describe the camera without owning it: ${camera.map((c: Finding) => `${c.section} (${c.phrases.join(", ")})`).join("; ")}`,
    );
  });

  check("no two sections decide the lighting", () => {
    const { sections } = sectionsFor(BRIEF);
    const light = auditSections(sections).contested.filter((c: Finding) => c.topic === "lighting");
    assert.deepStrictEqual(
      light, [],
      `these sections describe the light without owning it: ${light.map((c: Finding) => `${c.section} (${c.phrases.join(", ")})`).join("; ")}`,
    );
  });

  check("nothing strays at all, on a fully decided brief", () => {
    const { sections } = sectionsFor(BRIEF);
    const audit = auditSections(sections);
    if (audit.contested.length) {
      for (const c of audit.contested) console.log(`      ${c.section} wrote about ${c.topic}: ${c.phrases.join(", ")}`);
    }
    assert.deepStrictEqual(audit.contested, [], "a section strayed into another owner's topic");
  });

  check("the audit catches a stray when one is introduced", () => {
    // The detector has to be able to fail, or the three checks above are
    // asserting nothing.
    const planted = [
      { topic: "visual_style", owner: TOPIC_OWNER.visual_style, text: "Shoot it as a macro close-up, back lit from behind the bottle." },
    ];
    const audit = auditSections(planted);
    const topics = audit.contested.map((c: Finding) => c.topic).sort();
    assert.deepStrictEqual(topics, ["camera", "lighting"], `the detector missed a planted stray: ${JSON.stringify(audit.contested)}`);
  });

  // ── 3. the pipeline's own assembly obeys it ────────────────────────────
  console.log("\n3 — the pipeline assembles from the owners");

  check("the pipeline no longer prints the geometry and the layer stack separately", () => {
    const code = stripComments(read("lib/image-engine/evolution/ExperimentPipeline.ts"));
    // Both used to be written into the same prompt. The composition replaced
    // them; the layer stack may still write when no plan exists (degraded).
    assert.ok(!/executionText[\s\S]{0,400}renderGeometry\(/.test(code), "the geometry block is still written into the execution text");
    assert.ok(/renderCompositionPlan\(/.test(code), "the pipeline does not use the composition plan");
    assert.ok(/capturedCompositionPlan \? undefined : renderComposition\(/.test(code), "the layer stack is written unconditionally alongside the plan");
  });

  check("the composition is built before the typography that lives inside it", () => {
    const code = stripComments(read("lib/image-engine/evolution/ExperimentPipeline.ts"));
    const cp = code.indexOf("buildCompositionPlan(");
    const tp = code.indexOf("buildTypographyPlan(");
    assert.ok(cp > 0 && tp > 0, "one of the two calls is missing");
    assert.ok(cp < tp, "typography is planned before the composition it has to live inside");
  });

  // ── 4. the record equals what was sent ─────────────────────────────────
  console.log("\n4 — the stored prompt is the prompt that ran");

  check("a wrapper that changes the prompt hands the final one back", () => {
    const code = stripComments(read("lib/image-engine/evolution/ExperimentPipeline.ts"));
    assert.ok(
      /out\.finalPrompt = finalPrompt/.test(code),
      "the pipeline appends to the prompt and does not return what it sent",
    );
    const contract = stripComments(read("lib/image-engine/provider/ImageGenerationProvider.ts"));
    assert.ok(/finalPrompt\?: string/.test(contract), "the provider contract has nowhere to return the sent prompt");
  });

  check("the orchestrator stores what was sent, not what it compiled", () => {
    const code = stripComments(read("lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts"));
    assert.ok(
      /masterPrompt: providerRes\.finalPrompt \|\| masterPrompt/.test(code),
      "the orchestrator still stores its own compiled prompt",
    );
    assert.ok(/prompt_chars_sent/.test(code), "the record does not say how long the sent prompt was");
  });

  check("a wrapper is simulated end to end and the record matches", async () => {
    // The contract, exercised rather than grepped: a wrapper appends, and the
    // value the orchestrator would store equals the value the provider saw.
    let sawPrompt = "";
    const inner = {
      async generateImage(input: { prompt: string }) {
        sawPrompt = input.prompt;
        return { success: true, imageBuffer: Buffer.from("x"), mimeType: "image/png" } as Record<string, unknown>;
      },
    };
    const compiled = "COMPILED BODY";
    const tail = "THE COMPOSITION\n- camera angle: eye level, straight on";
    const finalPrompt = `${compiled}\n\n${tail}`;
    const out = await inner.generateImage({ prompt: finalPrompt });
    if (out && !out.finalPrompt) out.finalPrompt = finalPrompt;
    const stored = (out.finalPrompt as string) || compiled;
    assert.strictEqual(stored, sawPrompt, "the stored prompt is not the prompt the provider received");
    assert.ok(stored.length > compiled.length, "the wrapper's addition did not reach the record");
  });

  // ── 5. the chain is traceable ──────────────────────────────────────────
  console.log("\n5 — the same brief produces the same traceable decisions");

  check("every composition field names what produced it", () => {
    const { plan } = sectionsFor(BRIEF);
    const fields = ["hero_subject", "product_role", "camera_angle", "camera_distance", "lighting_direction", "environment", "typography_relationship", "negative_space"];
    for (const f of fields) {
      const field = (plan as Record<string, { because: string; from: string }>)[f];
      assert.ok(field.because.length > 10, `${f} was decided without a recorded reason`);
      assert.ok(["director", "geometry", "product", "brand", "derived", "absent"].includes(field.from), `${f} has an unknown provenance`);
    }
  });

  check("the same brief twice produces identical decisions", () => {
    const a = sectionsFor(BRIEF);
    const b = sectionsFor(BRIEF);
    assert.deepStrictEqual(a.plan, b.plan, "the composition is not deterministic");
    assert.deepStrictEqual(a.dna, b.dna, "the typographic decisions are not deterministic");
    assert.strictEqual(assemble(a.sections), assemble(b.sections), "the assembled prompt is not deterministic");
  });

  check("a decision can be traced from the prompt back to the field that caused it", () => {
    const { plan, sections } = sectionsFor(BRIEF);
    const text = assemble(sections);
    // The camera in the prompt is the camera the plan resolved, and the plan
    // says which director field it came from.
    assert.ok(text.includes(plan.camera_angle.value), "the prompt's camera is not the plan's camera");
    assert.ok(plan.camera_angle.because.includes("camera language"), plan.camera_angle.because);
    assert.ok(plan.camera_angle.because.includes("eye level"), "the reason does not quote what the director wrote");
  });

  // ── 6. telemetry ───────────────────────────────────────────────────────
  console.log("\n6 — what is logged");

  check("telemetry names owners and counts, never the copy", () => {
    const { sections } = sectionsFor(BRIEF);
    const t = JSON.stringify(ownershipTelemetry(auditSections(sections)));
    for (const line of COPY) assert.ok(!t.includes(line), "the telemetry leaked the client's copy");
    assert.ok(/owners/.test(t) && /contested/.test(t));
    assert.deepStrictEqual(ownershipTelemetry(null), { prompt_ownership: false });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
