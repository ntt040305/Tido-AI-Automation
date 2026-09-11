import assert from "assert";
import { CreativeDirectorPipeline } from "./director/CreativeDirectorPipeline";
import { VisualDirectionResolver } from "./director/VisualDirectionResolver";
import { DirectorBrief } from "./director/creative-director.types";
import {
  AUTO,
  AUTO_HELP,
  CONTROL_KEYS,
  ControlKey,
  VISUAL_CONTROLS,
} from "./director/visual-controls.types";

/**
 * CIOS Phase 4.1.5 verification.
 *
 * The property that carries the phase: a control must reach the renderer. A
 * settings panel whose values land in a log and never in the prompt looks
 * identical from the UI and does nothing, so most of what follows compares the
 * prompt text with and without a control set.
 *
 * The second property is that auto costs nothing — no block, no characters — so
 * users who want none of this pay for none of it.
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

const BRIEF: DirectorBrief = {
  brand: "Tido",
  product: "Kem dưỡng da",
  audience: "khách hàng nữ 25-40",
  category: "mỹ phẩm",
  brief_text: "",
  format: "poster",
  aspect_ratio: "4:5",
};
const PLAIN = "Ảnh sản phẩm kem dưỡng da trên nền sạch";

console.log("\nCIOS Phase 4.1.5 — visual direction controls\n");

// ── Schema ────────────────────────────────────────────────────────────────

check("All six controls exist with options and help text", () => {
  assert.strictEqual(VISUAL_CONTROLS.length, 6);
  assert.deepStrictEqual(
    VISUAL_CONTROLS.map((c) => c.key).sort(),
    [...CONTROL_KEYS].sort()
  );
  for (const c of VISUAL_CONTROLS) {
    assert.ok(c.label.length > 2, `${c.key} has no label`);
    assert.ok(c.help.length > 10, `${c.key} has no help text`);
    assert.ok(c.options.length >= 4, `${c.key} has only ${c.options.length} options`);
  }
});

check("Every option maps a plain label to a professional instruction", () => {
  for (const c of VISUAL_CONTROLS) {
    for (const o of c.options) {
      assert.ok(o.label.length > 2, `${c.key}.${o.id} has no label`);
      assert.ok(o.instruction.length > 25, `${c.key}.${o.id} instruction is too thin: "${o.instruction}"`);
      // The label is what a user reads; it must not be the instruction.
      assert.notStrictEqual(o.label, o.instruction, `${c.key}.${o.id} shows the raw instruction in the UI`);
    }
  }
});

check("The Tự chọn note is available for the UI", () => {
  assert.ok(AUTO_HELP.includes("Tự chọn"), AUTO_HELP);
  assert.ok(AUTO_HELP.includes("Concept"), AUTO_HELP);
});

check("The documented examples map as specified", () => {
  const camera = VISUAL_CONTROLS.find((c) => c.key === "camera")!.options.find((o) => o.id === "low_angle")!;
  // The instruction now carries the creative consequence as well as the
  // parameter: a control that only says "low angle" gives the renderer a
  // camera position and no reason for it.
  assert.ok(/low-angle/i.test(camera.instruction), camera.instruction);
  assert.ok(/important|aspirational|looks up/i.test(camera.instruction), `no creative meaning: ${camera.instruction}`);
  const light = VISUAL_CONTROLS.find((c) => c.key === "lighting")!.options.find((o) => o.id === "luxury_soft")!;
  assert.ok(/soft directional key light/i.test(light.instruction), light.instruction);
  assert.ok(/controlled highlights/i.test(light.instruction), light.instruction);
  assert.ok(/expensive-feeling|made carefully/i.test(light.instruction), `no creative meaning: ${light.instruction}`);
});

// ── Precedence ────────────────────────────────────────────────────────────

check("Precedence runs user > concept > reference > ai > default", () => {
  const order = ["user_selected", "concept_detected", "reference_image", "ai_decision", "default"] as const;
  for (let i = 1; i < order.length; i++) {
    assert.ok(
      VisualDirectionResolver.rank(order[i - 1]) < VisualDirectionResolver.rank(order[i]),
      `${order[i - 1]} does not outrank ${order[i]}`
    );
  }
});

check("A user selection beats a conflicting concept", () => {
  const r = VisualDirectionResolver.resolve({
    selected: { camera: "low_angle" },
    concept: "chụp từ trên xuống",
  });
  assert.strictEqual(r.controls.camera.source, "user_selected");
  assert.strictEqual(r.controls.camera.option, "low_angle");
  // The conflict is recorded rather than silently discarded.
  assert.ok(/also reads as/i.test(r.controls.camera.reason), r.controls.camera.reason);
});

check("A concept instruction beats a reference image", () => {
  const r = VisualDirectionResolver.resolve({
    concept: "chụp góc thấp",
    fromReference: { camera: "top_down" },
  });
  assert.strictEqual(r.controls.camera.source, "concept_detected");
  assert.strictEqual(r.controls.camera.option, "low_angle");
});

check("A reference image beats the director's own decision", () => {
  const r = VisualDirectionResolver.resolve({
    fromReference: { camera: "top_down" },
    aiDecision: { camera: "eye level, straight on" },
  });
  assert.strictEqual(r.controls.camera.source, "reference_image");
});

check("With nothing set, the director's decision is carried", () => {
  const r = VisualDirectionResolver.resolve({ aiDecision: { camera: "below eye level" } });
  assert.strictEqual(r.controls.camera.source, "ai_decision");
  assert.strictEqual(r.controls.camera.instruction, "below eye level");
  assert.strictEqual(r.controls.camera.label, "Tự chọn");
  assert.strictEqual(r.fully_auto, true);
});

check("With nothing at all, the control falls back to default", () => {
  const r = VisualDirectionResolver.resolve({});
  for (const key of CONTROL_KEYS) {
    assert.strictEqual(r.controls[key].source, "default", `${key}`);
    assert.strictEqual(r.controls[key].instruction, "");
  }
  assert.strictEqual(r.fully_auto, true);
});

check("An explicit auto is the same as leaving it unset", () => {
  const r = VisualDirectionResolver.resolve({
    selected: { camera: AUTO } as Record<ControlKey, string>,
    aiDecision: { camera: "below eye level" },
  });
  assert.strictEqual(r.controls.camera.source, "ai_decision");
});

// ── Concept detection ─────────────────────────────────────────────────────

check("Vietnamese control phrases are detected in a concept", () => {
  const r = VisualDirectionResolver.resolve({
    concept: "chụp góc thấp, ánh sáng mềm sang trọng, tông tối sang trọng, nhiều khoảng trống",
  });
  assert.strictEqual(r.controls.camera.option, "low_angle");
  assert.strictEqual(r.controls.lighting.option, "luxury_soft");
  assert.strictEqual(r.controls.color_mood.option, "dark_luxury");
  assert.strictEqual(r.controls.composition.option, "negative_space");
});

check("Detection survives diacritics at a word boundary", () => {
  // `\b` is ASCII-only and fails on any term ending in a Vietnamese vowel — the
  // bug that made "giảm giá" invisible in Phase 4.1.1.
  for (const [concept, key, expected] of [
    ["ảnh xoá phông", "lens", "shallow"],
    ["dùng ánh sáng tự nhiên", "lighting", "natural"],
    ["tông màu ấm áp", "color_mood", "warm"],
  ] as [string, ControlKey, string][]) {
    const r = VisualDirectionResolver.resolve({ concept });
    assert.strictEqual(r.controls[key].option, expected, `"${concept}" → ${key}`);
  }
});

// ── The controls actually reach the prompt ────────────────────────────────

check("A selected camera changes the camera line in the prompt", () => {
  const auto = CreativeDirectorPipeline.run({ ...BRIEF, concept: PLAIN });
  const set = CreativeDirectorPipeline.run({ ...BRIEF, concept: PLAIN, controls: { camera: "low_angle" } });
  assert.notStrictEqual(auto.visual.camera.angle, set.visual.camera.angle, "the angle did not change");
  assert.ok(/low-angle hero perspective/.test(set.assembled.prompt), "the instruction is absent from the prompt");
});

check("A selected lighting changes the lighting line in the prompt", () => {
  const set = CreativeDirectorPipeline.run({
    ...BRIEF,
    concept: PLAIN,
    controls: { lighting: "luxury_soft" },
  });
  assert.ok(/soft directional key light/.test(set.visual.lighting.source), set.visual.lighting.source);
  assert.ok(/expensive-feeling and calm, the light of something made carefully/.test(set.assembled.prompt));
});

check("A concept-detected control reaches the prompt too", () => {
  const pkg = CreativeDirectorPipeline.run({ ...BRIEF, concept: "ảnh sản phẩm chụp góc thấp" });
  assert.strictEqual(pkg.visual_controls.controls.camera.source, "concept_detected");
  assert.ok(/low-angle hero perspective/.test(pkg.assembled.prompt));
});

check("Binding controls are marked as client instructions", () => {
  const pkg = CreativeDirectorPipeline.run({ ...BRIEF, concept: PLAIN, controls: { camera: "low_angle" } });
  assert.ok(/\[CLIENT VISUAL DIRECTION — EXECUTE AS SPECIFIED\]/.test(pkg.assembled.prompt));
  assert.ok(pkg.assembled.included.includes("client_visual_direction"));
});

check("Không có chữ suppresses text everywhere, not just in style", () => {
  const pkg = CreativeDirectorPipeline.run({
    ...BRIEF,
    concept: PLAIN,
    controls: { typography: "none" },
  });
  assert.ok(/no rendered typography anywhere/.test(pkg.assembled.prompt));
  assert.strictEqual(pkg.visual.typography.hierarchy, "no rendered type at all");
  assert.strictEqual(pkg.visual.composition.text_area, "no text anywhere in the frame");
});

// ── Auto costs nothing ────────────────────────────────────────────────────

check("Auto mode emits no control block and no extra characters", () => {
  const auto = CreativeDirectorPipeline.run({ ...BRIEF, concept: PLAIN });
  assert.strictEqual(auto.visual_controls.fully_auto, true);
  assert.ok(!/\[CLIENT VISUAL DIRECTION/.test(auto.assembled.prompt), "auto mode emitted a control block");
  assert.ok(!auto.assembled.included.includes("client_visual_direction"));
  // And the resolver contributes no prompt lines.
  assert.strictEqual(VisualDirectionResolver.promptLines(auto.visual_controls).length, 0);
});

check("Setting controls costs only what the controls say", () => {
  const auto = CreativeDirectorPipeline.run({ ...BRIEF, concept: PLAIN });
  const one = CreativeDirectorPipeline.run({ ...BRIEF, concept: PLAIN, controls: { camera: "low_angle" } });
  const growth = one.assembled.chars - auto.assembled.chars;
  // One control, one heading, one line. A per-control block would cost far more.
  assert.ok(growth > 0 && growth < 600, `one control grew the prompt by ${growth} characters`);
});

check("The director still decides everything left on Tự chọn", () => {
  const pkg = CreativeDirectorPipeline.run({ ...BRIEF, concept: PLAIN, controls: { camera: "low_angle" } });
  assert.strictEqual(pkg.visual_controls.controls.camera.source, "user_selected");
  for (const key of ["lens", "lighting", "composition", "typography", "color_mood"] as ControlKey[]) {
    assert.strictEqual(pkg.visual_controls.controls[key].source, "ai_decision", `${key} was not left to the director`);
    assert.ok(pkg.visual_controls.controls[key].instruction.length > 0, `${key} decided nothing`);
  }
});

check("Controls compose with the commercial poster path", () => {
  const pkg = CreativeDirectorPipeline.run({
    ...BRIEF,
    concept: "Tạo ảnh poster, sale sản phẩm 50% và có các chữ CTA",
    controls: { camera: "low_angle", typography: "bold_impact" },
  });
  const p = pkg.assembled.prompt;
  assert.ok(/low-angle hero perspective/.test(p), "the camera control was lost");
  assert.ok(p.includes("50%"), "the discount was lost");
  assert.ok(/\[TEXT RENDERING — REQUIRED, NOT OPTIONAL\]/.test(p), "text enforcement was lost");
  assert.ok(/heavy condensed display typography/.test(p), "the typography control was lost");
});

check("Resolution is deterministic", () => {
  const a = CreativeDirectorPipeline.run({ ...BRIEF, concept: PLAIN, controls: { camera: "low_angle" } });
  const b = CreativeDirectorPipeline.run({ ...BRIEF, concept: PLAIN, controls: { camera: "low_angle" } });
  assert.strictEqual(a.assembled.prompt, b.assembled.prompt);
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
