import assert from "assert";
import { CreativeDirectorPipeline } from "./director/CreativeDirectorPipeline";
import { CreativeFormatPlanner } from "./director/CreativeFormatPlanner";
import { CreativeTerritoryGenerator } from "./director/CreativeTerritoryGenerator";
import { CreativeUnderstandingLayer } from "./director/CreativeUnderstandingLayer";
import { ProductIdentityLockBuilder } from "./director/ProductIdentityLockV2";
import { VisualDirectorEngine } from "./director/VisualDirectorEngine";
import {
  CREATIVE_FORMATS,
  DirectorBrief,
  V3_BUDGET,
} from "./director/creative-director.types";

/**
 * CIOS Phase 4.1 verification.
 *
 * Two properties carry the phase and both are tested directly: the director must
 * actually *decide* (not defer to a default), and it must never redesign the
 * product. Everything else here guards a specific mistake made while building
 * it — word-salad territory names, a product hero aliased to a landing hero, a
 * reference-relationship section dropped from the assembler.
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
  brand: "Tho",
  product: "Fermented rice cream",
  audience: "affluent women aged 35-55",
  category: "skincare",
  objective: "reposition as premium heritage craft",
  brief_text:
    "We make it by hand in small batches, but the category is crowded and everything looks the same.",
  format: "poster",
  aspect_ratio: "4:5",
  copy: ["Made slowly. On purpose."],
};

/** A brief with almost nothing in it, to test what happens when nothing is known. */
const THIN: DirectorBrief = {
  brand: "Acme",
  product: "Widget",
  audience: "people",
  category: "widgets",
  brief_text: "Make it premium.",
  format: "thumbnail",
};

console.log("\nCIOS Phase 4.1 — Creative Director Engine\n");

// ── Task 1: understanding ─────────────────────────────────────────────────

check("A brief becomes six named creative facts", () => {
  const u = CreativeUnderstandingLayer.understand(BRIEF);
  for (const field of [
    "core_message",
    "human_emotion",
    "desired_reaction",
    "brand_role",
    "visual_opportunity",
    "creative_challenge",
  ] as const) {
    assert.ok(u[field] && u[field].length > 10, `${field} is empty or trivial: "${u[field]}"`);
  }
});

check("A thin brief reports assumptions instead of inventing confidence", () => {
  const u = CreativeUnderstandingLayer.understand(THIN);
  assert.ok(u.assumptions.length >= 3, `only ${u.assumptions.length} assumptions named`);
  assert.ok(u.grounding < 0.5, `grounding ${u.grounding} is too confident for a five-word brief`);
  // The fields are still filled — a thin brief gets a usable answer, it just gets
  // an honestly labelled one.
  assert.ok(u.core_message.length > 10, "no core message was produced at all");
});

check("A rich brief scores higher grounding than a thin one", () => {
  const rich = CreativeUnderstandingLayer.understand(BRIEF);
  const thin = CreativeUnderstandingLayer.understand(THIN);
  assert.ok(rich.grounding > thin.grounding, `${rich.grounding} vs ${thin.grounding}`);
});

// ── Task 2: territories ───────────────────────────────────────────────────

check("Several territories are generated, not one", () => {
  const u = CreativeUnderstandingLayer.understand(BRIEF);
  const t = CreativeTerritoryGenerator.generate(BRIEF, u);
  assert.ok(t.length >= 3, `only ${t.length} territories`);
  assert.strictEqual(new Set(t.map((x) => x.name)).size, t.length, "two territories share a name");
});

check("Each territory carries all six required fields", () => {
  const u = CreativeUnderstandingLayer.understand(BRIEF);
  for (const t of CreativeTerritoryGenerator.generate(BRIEF, u)) {
    for (const field of [
      "name",
      "big_idea",
      "emotional_direction",
      "visual_metaphor",
      "story_world",
      "brand_connection",
    ] as const) {
      assert.ok(t[field] && String(t[field]).length > 5, `${t.name} has no ${field}`);
    }
  }
});

check("Territories are built from different parts of the understanding", () => {
  const u = CreativeUnderstandingLayer.understand(BRIEF);
  const t = CreativeTerritoryGenerator.generate(BRIEF, u);
  const sources = new Set(t.map((x) => x.derived_from));
  assert.strictEqual(sources.size, t.length, "two territories share a source, so they are one direction twice");
});

check("Territory names are sayable, not generated word salad", () => {
  // An earlier version composed names from content words and produced
  // "Wanting Deciding Want".
  const u = CreativeUnderstandingLayer.understand(BRIEF);
  for (const t of CreativeTerritoryGenerator.generate(BRIEF, u)) {
    const words = t.name.split(/\s+/);
    assert.ok(words.length >= 2 && words.length <= 4, `"${t.name}" is not a name`);
    // A duplicated stem is the tell of the old generator.
    const stems = words.map((w) => w.toLowerCase().replace(/(?:ing|ed|s)$/, ""));
    assert.strictEqual(new Set(stems).size, stems.length, `"${t.name}" repeats a word`);
  }
});

// ── Task 3: the visual director actually decides ──────────────────────────

check("Every visual dimension is decided, none left blank", () => {
  const pkg = CreativeDirectorPipeline.run(BRIEF);
  const v = pkg.visual;
  const required: [string, string][] = [
    ["camera.lens", v.camera.lens],
    ["camera.angle", v.camera.angle],
    ["camera.framing", v.camera.framing],
    ["camera.distance", v.camera.distance],
    ["lighting.source", v.lighting.source],
    ["lighting.direction", v.lighting.direction],
    ["lighting.quality", v.lighting.quality],
    ["lighting.contrast", v.lighting.contrast],
    ["composition.hero_object", v.composition.hero_object],
    ["composition.supporting_elements", v.composition.supporting_elements],
    ["composition.negative_space", v.composition.negative_space],
    ["composition.text_area", v.composition.text_area],
    ["color.palette", v.color.palette],
    ["color.mood", v.color.mood],
    ["typography.hierarchy", v.typography.hierarchy],
    ["typography.placement", v.typography.placement],
    ["typography.style", v.typography.style],
  ];
  for (const [name, value] of required) {
    assert.ok(value && value.trim().length > 3, `${name} was not decided: "${value}"`);
  }
});

check("The camera decision is specific enough to execute", () => {
  const pkg = CreativeDirectorPipeline.run(BRIEF);
  assert.ok(/\d+\s*(?:-|–)?\s*\d*mm equivalent/.test(pkg.visual.camera.lens), `vague lens: "${pkg.visual.camera.lens}"`);
});

check("Different formats produce different camera decisions", () => {
  // This is the whole point of the layer: a thumbnail and a poster must not get
  // the same direction. Before this phase they did, because both fell through to
  // the same asset default.
  const lenses = new Set<string>();
  for (const format of CREATIVE_FORMATS) {
    const pkg = CreativeDirectorPipeline.run({ ...BRIEF, format, aspect_ratio: undefined });
    lenses.add(pkg.visual.camera.lens);
  }
  assert.ok(lenses.size >= 4, `only ${lenses.size} distinct lens decisions across ${CREATIVE_FORMATS.length} formats`);
});

check("Different emotional readings produce different lighting", () => {
  const craft = CreativeDirectorPipeline.run(BRIEF);
  const gentle = CreativeDirectorPipeline.run({
    ...BRIEF,
    // The objective is overridden too. An earlier version of this test changed
    // only `brief_text` and left the original "premium heritage craft" objective
    // in place, which the emotional read is also fed — so both arms resolved to
    // the same register and the test failed for the wrong reason.
    objective: "reassure sensitive skin sufferers",
    brief_text: "A gentle, safe formula for sensitive skin that needs care.",
  });
  assert.notStrictEqual(
    craft.visual.lighting.source,
    gentle.visual.lighting.source,
    "lighting did not respond to a different emotional register"
  );
});

check("Director decisions are offered at STRATEGY tier, below the client", () => {
  // The integration contract: the existing resolver ranks USER and REFERENCE
  // above STRATEGY, so an explicit client instruction still wins.
  const pkg = CreativeDirectorPipeline.run(BRIEF);
  const candidates = VisualDirectorEngine.asCandidates(pkg.visual);
  assert.ok(candidates.length >= 5, `only ${candidates.length} candidates emitted`);
  for (const c of candidates) {
    assert.strictEqual(c.source, "STRATEGY", `${c.dimension} was emitted at ${c.source}`);
    assert.ok(c.confidence < 0.85, `${c.dimension} claims ${c.confidence}, at or above a reference read`);
    assert.ok(c.value.length > 20, `${c.dimension} candidate is too thin to arbitrate`);
  }
});

// ── Task 4: formats ───────────────────────────────────────────────────────

check("All six required formats are specified", () => {
  for (const format of CREATIVE_FORMATS) {
    const plan = CreativeFormatPlanner.plan(format);
    assert.ok(plan.composition.length > 60, `${format} composition is thin`);
    assert.ok(plan.camera.length > 60, `${format} camera is thin`);
    assert.ok(plan.typography.length > 40, `${format} typography is thin`);
    assert.ok(plan.hierarchy.length >= 2, `${format} has no hierarchy`);
  }
});

check("Each format's composition and typography are distinct", () => {
  const compositions = new Set(CREATIVE_FORMATS.map((f) => CreativeFormatPlanner.plan(f).composition));
  const typography = new Set(CREATIVE_FORMATS.map((f) => CreativeFormatPlanner.plan(f).typography));
  assert.strictEqual(compositions.size, CREATIVE_FORMATS.length, "two formats share a composition spec");
  assert.strictEqual(typography.size, CREATIVE_FORMATS.length, "two formats share a typography spec");
});

check("A product hero is not treated as a landing hero", () => {
  // These were aliased together, which reserved two thirds of a product shot for
  // copy that was never going to be placed.
  assert.notStrictEqual(CreativeFormatPlanner.normalize("product_hero"), "landing_hero");
});

check("Packaging renders no type of its own", () => {
  const plan = CreativeFormatPlanner.plan("packaging");
  assert.ok(/artwork/i.test(plan.typography), "packaging typography does not defer to the pack artwork");
  assert.ok(/none/i.test(plan.text_zones), "packaging reserves text zones it should not have");
});

// ── Task 5: identity lock ─────────────────────────────────────────────────

check("A lock names the protected attributes it has evidence for", () => {
  const lock = ProductIdentityLockBuilder.build({
    ...BRIEF,
    reference_attributes: {
      shape: "squat glass jar with a broad shoulder",
      color: "opaque cream in amber glass",
      logo_position: "centred on the lid",
      material: "frosted glass",
      texture: "matte paper label with visible fibre",
      unique_features: ["wax seal on the lid"],
    },
  });
  assert.strictEqual(lock.evidence, 1, `evidence ${lock.evidence} with every attribute supplied`);
  assert.strictEqual(lock.unknown.length, 0, `unknown: ${lock.unknown.join(", ")}`);
  for (const needle of ["squat glass jar", "centred on the lid", "wax seal"]) {
    assert.ok(lock.lock_statement.includes(needle), `lock statement lost "${needle}"`);
  }
});

check("Attributes with no evidence are declared unknown, not invented", () => {
  const lock = ProductIdentityLockBuilder.build(BRIEF);
  assert.ok(lock.unknown.length > 0, "a brief with no reference produced a fully specified lock");
  assert.ok(
    /UNSPECIFIED/.test(lock.lock_statement) && /reference image is the sole authority/i.test(lock.lock_statement),
    "the lock does not defer to the reference for what it does not know"
  );
  assert.ok(lock.evidence < 1, `claims evidence ${lock.evidence} with no reference attributes`);
});

check("The lock separates what is protected from what is directable", () => {
  const lock = ProductIdentityLockBuilder.build(BRIEF);
  assert.ok(/PROTECTED/.test(lock.lock_statement), "nothing is marked protected");
  assert.ok(/FREE/.test(lock.lock_statement), "nothing is marked directable");
  assert.ok(/never redesign/i.test(lock.lock_statement), "the no-redesign rule is missing");
});

// ── Task 6: priority assembly ─────────────────────────────────────────────

check("The assembled prompt stays inside the hard limit", () => {
  for (const format of CREATIVE_FORMATS) {
    const pkg = CreativeDirectorPipeline.run({ ...BRIEF, format });
    assert.ok(
      pkg.assembled.chars <= V3_BUDGET.hard_limit,
      `${format} assembled ${pkg.assembled.chars}, over ${V3_BUDGET.hard_limit}`
    );
  }
});

check("Every P0 section is present in the assembled prompt", () => {
  const pkg = CreativeDirectorPipeline.run(BRIEF);
  for (const id of [
    "product_identity",
    "reference_relationship",
    "camera",
    "lighting",
    "composition",
    "negative_constraints",
  ]) {
    assert.ok(pkg.assembled.included.includes(id), `P0 section "${id}" is missing`);
  }
  assert.strictEqual(
    pkg.assembled.omitted.filter((o) => o.priority === "P0").length,
    0,
    "a P0 section was omitted for budget"
  );
});

check("P0 survives even when P2 is enormous", () => {
  const huge = Array.from({ length: 400 }, (_, i) => `Craft note ${i}: ${"detail ".repeat(20)}`);
  const pkg = CreativeDirectorPipeline.run(BRIEF, huge);
  assert.ok(pkg.assembled.prompt.includes("[SUBJECT — PRODUCT IDENTITY]"), "identity was dropped");
  assert.ok(pkg.assembled.prompt.includes("[CAMERA]"), "camera was dropped");
  assert.ok(pkg.assembled.prompt.includes("[LIGHTING]"), "lighting was dropped");
  assert.ok(pkg.assembled.omitted.some((o) => o.priority === "P2"), "the oversized P2 tier was not omitted");
  assert.ok(pkg.assembled.chars <= V3_BUDGET.hard_limit, `assembled ${pkg.assembled.chars}`);
});

check("Assembly is deterministic", () => {
  const a = CreativeDirectorPipeline.run(BRIEF);
  const b = CreativeDirectorPipeline.run(BRIEF);
  assert.strictEqual(a.assembled.prompt, b.assembled.prompt, "two runs of one brief differed");
});

check("Exact copy reaches the prompt verbatim", () => {
  const pkg = CreativeDirectorPipeline.run(BRIEF);
  for (const line of BRIEF.copy || []) {
    assert.ok(pkg.assembled.prompt.includes(line), `copy lost: "${line}"`);
  }
});

check("Client hard constraints are carried as P0", () => {
  const pkg = CreativeDirectorPipeline.run({
    ...BRIEF,
    hard_constraints: ["Do not use the word anti-ageing anywhere in the image"],
  });
  assert.ok(pkg.assembled.included.includes("hard_constraints"), "hard constraints were not included");
  assert.ok(pkg.assembled.prompt.includes("anti-ageing"), "the constraint text was lost");
});

check("The prompt carries no pipeline metadata", () => {
  // The whole point of the V2 optimization phase: an image model gets nothing
  // from confidence scores or knowledge ids, and V3 must not reintroduce them.
  const pkg = CreativeDirectorPipeline.run(BRIEF, ["Keep contact shadows physically plausible."]);
  const p = pkg.assembled.prompt;
  for (const pattern of [/confidence:\s*0\./i, /final_score/i, /selection_tier/i, /\[universal\./i, /evidence_type/i]) {
    assert.ok(!pattern.test(p), `pipeline metadata leaked: ${pattern}`);
  }
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
