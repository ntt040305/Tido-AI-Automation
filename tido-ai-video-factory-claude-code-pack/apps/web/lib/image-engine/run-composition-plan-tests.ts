/**
 * Phase 5.6.4 — the composition, decided before the render. Offline.
 *
 * What this suite is for
 * ----------------------
 *   1. THE COMPOSITION CHANGES BECAUSE THE MEANING CHANGES. The same coffee
 *      bottle under four creative ideas must produce four different
 *      compositions -- camera, light, hierarchy, negative space and the
 *      typographic relationship -- and must do so because the ideas differ.
 *      Section 2 is the acceptance case.
 *   2. NO TEMPLATES. There is no mapping from a category or a mood to a camera
 *      anywhere in the module, and a brief that decided nothing about the
 *      camera gets NO camera. Section 3 proves the absence is real by feeding
 *      briefs that would trip a stereotype and checking nothing appears.
 *   3. ONE SOURCE OF TRUTH. Every downstream module reads the plan instead of
 *      reaching for the geometry, the blueprint and the layer stack separately.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  buildCompositionPlan, renderCompositionPlan, compositionPlanTelemetry,
} = require("./evolution/experiment/CompositionPlan");
const { buildGeometry } = require("./evolution/experiment/LayoutGeometry");
const { buildComposition } = require("./evolution/experiment/VisualComposition");
const { assignTextRoles, geometryRolesFor } = require("./evolution/experiment/TypographySystem");
const { resolveTextRequirement } = require("./compiler/ExactCopyIntegrityValidator");

const WEB = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf-8");

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

// ── fixtures ────────────────────────────────────────────────────────────────

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
      bp[section][k] = fields[k]
        ? { value: fields[k], because: "fixture", derived_from: "product_truth", confidence: "high" }
        : null;
    }
  }
  return bp;
}

// ── ONE product, FOUR creative ideas ───────────────────────────────────────
//
// Written as a director writes them: whole decisions across the sections the
// director actually fills. The bottle of coffee never changes.

const COFFEE: Record<string, any> = {
  luxury: blueprint({
    big_idea: "Coffee as a considered ritual for people who have stopped rushing",
    visual_story: "the moment before the first cup, in a room nobody else is awake in",
    emotional_hook: "restraint as a form of confidence",
    visual_world: "a refined, almost empty interior",
    environment_logic: "a stone counter in a room stripped of everything that is not needed",
    atmosphere: "still, composed, expensive without saying so",
    camera_language: "eye level and straight on, close, so the bottle is met rather than observed",
    lens_character: "the background falls away completely; only the label is sharp",
    lighting_behavior: "one low window light from the side, raking, deep falloff and nothing filled in",
    depth_feeling: "shallow — one plane in focus and everything else surrendered",
    composition_logic: "the bottle sits off-centre to the right third, weight carried by the empty side",
    negative_space: "the empty left is what makes the restraint credible; it is the point, not the leftover",
    emotional_direction: "quiet authority",
  }),
  playful: blueprint({
    big_idea: "The cold one you drink with your feet in a canal",
    visual_story: "a hand lifting the bottle out of a tub of ice, water everywhere",
    emotional_hook: "the first cold mouthful on a day that is too hot",
    visual_world: "bright poolside colour, fruit and ice",
    environment_logic: "an outdoor table in full sun, the day happening around it",
    atmosphere: "playful, splashing, high energy",
    camera_language: "a wide establishing shot from a high angle, looking down at the whole table",
    lens_character: "everything sharp: the scene is the subject, not one object in it",
    lighting_behavior: "hard midday sun from above, saturated and cheerful",
    depth_feeling: "deep — the whole table is legible front to back",
    attention_flow: "the splash catches the eye first, then the bottle it came from",
  }),
  futuristic: blueprint({
    big_idea: "Coffee engineered to a specification, not brewed by feel",
    visual_story: "the bottle on an instrument bench, its readout beside it",
    emotional_hook: "the confidence of something calibrated",
    visual_world: "a clean technical environment, screens and instrumentation",
    environment_logic: "a laboratory bench, everything on it there for a reason",
    atmosphere: "precise, controlled, quietly futuristic",
    camera_language: "macro, extreme close on the seal, filling the frame",
    lens_character: "clinical sharpness across the whole subject",
    lighting_behavior: "even light from behind the bottle, a luminous rim along its edge",
    depth_feeling: "compressed — the background is a field of light, not a place",
    emotional_direction: "precision and performance",
  }),
  organic: blueprint({
    big_idea: "Grown by people whose names are on the sack",
    visual_story: "hands setting the bottle down on a table they built",
    emotional_hook: "made by someone, not by something",
    visual_world: "a wooden table, soil-dusted beans, harvest light",
    environment_logic: "a working farmhouse kitchen in the middle of a morning",
    atmosphere: "warm, natural, unhurried",
    camera_language: "a medium shot from a high angle, looking down across the table",
    lens_character: "soft falloff at the edges, the way a memory is remembered",
    lighting_behavior: "morning light from a window to the left, diffused by the room",
    depth_feeling: "layered — beans in front, the bottle in the middle, the room behind",
    product_position: "the bottle sits to the left third, hands entering from the right",
  }),
};

const COPY = ["Slow mornings", "Cold brew, done properly", "Discover"];

/** The chain as the pipeline runs it, up to the composition plan. */
function planFor(bp: any, opts: { ratio?: string; copy?: string[] } = {}) {
  const copy = opts.copy ?? COPY;
  const req = resolveTextRequirement({ contentMessage: copy.join("\n") });
  const assigned = assignTextRoles(req.lines);
  const geometry = buildGeometry({
    ratio: opts.ratio ?? "1:1",
    blueprint: bp,
    copyRoles: geometryRolesFor(assigned),
    productCount: 1,
    compositionHint: bp?.visual_world?.composition_logic?.value ?? null,
  });
  const composition = buildComposition({ blueprint: bp });
  return buildCompositionPlan({ blueprint: bp, geometry, composition, copyLines: copy.length });
}

const NAMES = ["luxury", "playful", "futuristic", "organic"] as const;

function main() {
  console.log("\nComposition Plan — the frame, decided before the render\n");

  // ── 1. no templates exist ───────────────────────────────────────────────
  console.log("1 — there is no template table, and there cannot be");

  check("the module holds no mapping from a category or a mood to a composition", () => {
    const src = read("lib/image-engine/evolution/experiment/CompositionPlan.ts");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // The stereotypes named in the brief, as they would have to appear.
    for (const word of ["luxury", "beauty", "fmcg", "fashion", "premium", "food", "beverage"]) {
      assert.ok(!new RegExp(`["'\`]${word}["'\`]`, "i").test(code), `the module branches on the category "${word}"`);
    }
    // Recognition tables are allowed -- they read the director's own words --
    // but they must map WORDS to WORDS, never a mood to a camera.
    assert.ok(/ANGLE_WORDS|DISTANCE_WORDS|LIGHT_DIRECTION_WORDS/.test(code), "the recognition tables are missing");
    assert.ok(!/close.?up.*(luxur|premium)|luxur.*close.?up/i.test(code), "a mood is mapped to a camera distance");
  });

  // ── 2. THE ACCEPTANCE CASE ──────────────────────────────────────────────
  console.log("\n2 — one product, four ideas, four compositions");

  check("all four differ in camera, light, hierarchy, space and typography", () => {
    const plans = NAMES.map((n) => planFor(COFFEE[n]));
    for (let i = 0; i < NAMES.length; i++) {
      const p = plans[i];
      console.log(
        `      ${NAMES[i].padEnd(11)} ${p.product_role.value.padEnd(11)} ` +
          `cam[${p.camera_angle.value || "—"} / ${p.camera_distance.value || "—"}] ` +
          `light[${p.lighting_direction.value || "—"}] ` +
          `space ${p.negative_space.value.share}% ` +
          `eye ${p.visual_hierarchy.map((h: any) => h.element).join("→")}`,
      );
    }
    const distinct = (pick: (p: any) => string) => new Set(plans.map(pick)).size;
    assert.ok(distinct((p) => p.camera_angle.value) >= 3, "the camera angle is the same across the four ideas");
    assert.ok(distinct((p) => p.camera_distance.value) >= 3, "the camera distance is the same across the four ideas");
    assert.ok(distinct((p) => p.lighting_direction.value) >= 3, "the light comes from the same place in all four");
    assert.ok(distinct((p) => p.environment.value) === 4, "the four ideas share an environment");
    assert.ok(distinct((p) => p.typography_relationship.value) >= 3, "typography has the same relationship to all four compositions");
    assert.ok(distinct((p) => JSON.stringify(p.visual_hierarchy.map((h: any) => h.element))) >= 2, "the eye takes the same path through all four");
  });

  check("each of the four reads the way an art director would describe it", () => {
    const [lux, play, tech, org] = NAMES.map((n) => planFor(COFFEE[n]));

    // Restraint: close, side-lit, and the empty side is the point.
    assert.ok(/close/.test(lux.camera_distance.value), `luxury distance: ${lux.camera_distance.value}`);
    assert.ok(/side/.test(lux.lighting_direction.value), `luxury light: ${lux.lighting_direction.value}`);
    assert.ok(/credible|point|restraint/.test(lux.negative_space.value.purpose), lux.negative_space.value.purpose);
    assert.strictEqual(lux.negative_space.from, "director", "the director said what the empty area is for and was not heard");

    // A scene about a moment: wide, from above, and the product is evidence.
    assert.ok(/wide/.test(play.camera_distance.value), `playful distance: ${play.camera_distance.value}`);
    assert.ok(/high/.test(play.camera_angle.value), `playful angle: ${play.camera_angle.value}`);

    // Calibration: macro and backlit.
    assert.ok(/macro/.test(tech.camera_distance.value), `futuristic distance: ${tech.camera_distance.value}`);
    assert.ok(/behind/.test(tech.lighting_direction.value), `futuristic light: ${tech.lighting_direction.value}`);
    assert.ok(/dominant|large/.test(tech.product_scale.value.label), `a macro shot produced ${tech.product_scale.value.label}`);

    // Made by hands: layered depth, light from a window on one side.
    assert.ok(org.depth_structure.length >= 2, "a layered brief produced fewer than two planes");
    assert.ok(/natural|side/.test(org.lighting_direction.value), `organic light: ${org.lighting_direction.value}`);
  });

  check("the product's role is reasoned, not assumed to be the hero", () => {
    // A brief whose subject is a moment, with the bottle small in it, should
    // read the product as evidence for the claim rather than the claim itself.
    const evidence = planFor(
      blueprint({
        visual_story: "a hand lifting the bottle out of a tub of ice on a hot morning",
        emotional_hook: "the relief of the first cold mouthful",
        camera_language: "a wide establishing shot of the whole table",
      }),
      { ratio: "9:16" },
    );
    const hero = planFor(
      blueprint({
        visual_story: "the bottle alone, filling the frame",
        camera_language: "macro, extreme close on the label",
      }),
      { copy: ["One bottle"] },
    );
    assert.notStrictEqual(evidence.product_role.value, hero.product_role.value, "both briefs gave the product the same role");
    assert.ok(evidence.product_role.because.includes("%"), "the role was decided without measuring anything");
  });

  check("a product that is only evidence is not the first thing the eye is sent to", () => {
    const p = planFor(
      blueprint({
        visual_story: "a hand lifting the bottle out of ice, the moment carrying the ad",
        emotional_hook: "the relief of the first cold mouthful",
      }),
      { ratio: "9:16" },
    );
    if (p.product_role.value === "evidence" && p.visual_hierarchy.length > 1) {
      assert.notStrictEqual(p.visual_hierarchy[0].element, "product", "the evidence was made the headline");
      assert.ok(/evidence|claim/.test(p.visual_hierarchy[0].because), p.visual_hierarchy[0].because);
    }
  });

  // ── 3. absence is real ──────────────────────────────────────────────────
  console.log("\n3 — what was not decided is not invented");

  check("a brief with no camera decision gets no camera", () => {
    // The stereotype trap: everything a template would need to guess "luxury,
    // so close-up on a dark background" is present, and the director said
    // nothing about the camera.
    const p = planFor(
      blueprint({
        big_idea: "The most exclusive, premium, luxury coffee in the country",
        emotional_hook: "prestige",
        atmosphere: "expensive and dark",
      }),
    );
    assert.strictEqual(p.camera_angle.value, "", `an angle was invented: ${p.camera_angle.value}`);
    assert.strictEqual(p.camera_distance.value, "", `a distance was invented: ${p.camera_distance.value}`);
    assert.strictEqual(p.camera_angle.from, "absent");
    assert.ok(/no camera language was decided/.test(p.camera_angle.because), p.camera_angle.because);
  });

  check("a camera decision that states no angle says so, and quotes what WAS said", () => {
    const p = planFor(blueprint({ camera_language: "the bottle is met without ceremony" }));
    assert.strictEqual(p.camera_angle.value, "");
    assert.ok(p.camera_angle.because.includes("met without ceremony"), p.camera_angle.because);
    assert.ok(/stated no angle/.test(p.camera_angle.because), p.camera_angle.because);
  });

  check("an empty brief produces an empty plan that says it is empty", () => {
    const p = planFor(blueprint({}));
    assert.ok(p.completeness < 0.5, `completeness ${p.completeness} for a brief that decided nothing`);
    assert.ok(p.provenance.absent >= 6, `only ${p.provenance.absent} fields admit to being undecided`);
    assert.strictEqual(renderCompositionPlan(blueprint({}) && buildCompositionPlan({})), undefined, "an empty plan still wrote a prompt section");
  });

  check("completeness counts decisions and never scores quality", () => {
    const rich = planFor(COFFEE.luxury);
    const bare = planFor(blueprint({ big_idea: "A good coffee" }));
    assert.ok(rich.completeness > bare.completeness, "a fully decided brief is not more complete than a bare one");
    assert.ok(rich.completeness <= 1 && bare.completeness >= 0);
    const counted = (Object.values(rich.provenance) as number[]).reduce((a, b) => a + b, 0);
    assert.strictEqual(counted, 16, `provenance counts ${counted} fields; the plan has 16 that carry one`);
  });

  // ── 4. negative space is reasoned ───────────────────────────────────────
  console.log("\n4 — the empty area has a reason to be empty");

  check("the director's reason for the empty space is carried, not replaced", () => {
    const p = planFor(COFFEE.luxury);
    assert.strictEqual(p.negative_space.from, "director");
    assert.ok(p.negative_space.value.purpose.includes("restraint"), p.negative_space.value.purpose);
  });

  check("without a stated reason, the purpose is reasoned from the frame and the copy", () => {
    const withCopy = planFor(blueprint({ big_idea: "A good coffee" }), { copy: COPY });
    const without = planFor(blueprint({ big_idea: "A good coffee" }), { copy: [] });
    assert.strictEqual(withCopy.negative_space.from, "derived");
    assert.notStrictEqual(withCopy.negative_space.value.purpose, without.negative_space.value.purpose);
    assert.ok(/nothing to read|product/.test(without.negative_space.value.purpose), without.negative_space.value.purpose);
    // The share is a measurement; the purpose is the decision it serves.
    assert.ok(withCopy.negative_space.value.purpose.length > 40, "the purpose is a label, not a reason");
  });

  // ── 5. typography receives meaning, not coordinates ─────────────────────
  console.log("\n5 — typography is told what it is protecting");

  check("the typographic relationship is a sentence about the composition", () => {
    const p = planFor(COFFEE.luxury);
    const r = p.typography_relationship.value;
    assert.ok(r.length > 40, `the relationship is a coordinate, not a reason: "${r}"`);
    assert.ok(!/^(top|bottom|left|right|centre|center)[-_ ]/i.test(r), `the relationship is a position: "${r}"`);
    // It has to reference the composition it came out of.
    assert.ok(/product|light|eye|frame/.test(r), r);
  });

  check("the director's placement reasoning wins when there is one", () => {
    const p = planFor(blueprint({ placement_reason: "the words sit in the shadow the bottle throws, so they belong to the light rather than to the page" }));
    assert.strictEqual(p.typography_relationship.from, "director");
    assert.ok(p.typography_relationship.value.includes("shadow the bottle throws"));
  });

  check("a frame with no copy says so rather than inventing a relationship", () => {
    const p = planFor(COFFEE.luxury, { copy: [] });
    assert.strictEqual(p.typography_relationship.value, "no typography in this frame");
    assert.ok(/no copy/.test(p.typography_relationship.because));
  });

  check("the typography layer reads the plan instead of reasoning again", () => {
    const { buildTypographyDNA } = require("./evolution/experiment/TypographyDNA");
    const plan = planFor(COFFEE.luxury);
    const withPlan = buildTypographyDNA({ blueprint: COFFEE.luxury, copyLines: 3, compositionPlan: plan });
    const without = buildTypographyDNA({ blueprint: COFFEE.luxury, copyLines: 3 });
    assert.ok(
      withPlan.relationship_to_scene.startsWith(plan.typography_relationship.value),
      `the typography layer did not carry the composition's account:\n      plan: ${plan.typography_relationship.value}\n      dna:  ${withPlan.relationship_to_scene}`,
    );
    assert.notStrictEqual(withPlan.relationship_to_scene, without.relationship_to_scene, "the plan changed nothing downstream");
  });

  check("the two modules that reserve a copy area do not contradict each other", () => {
    // `TypographyPlan.spaceFor` still derives its own copy column, and the plan
    // derives a typography zone from the same geometry. They agree today
    // because both follow the layout's alignment -- this catches the day one of
    // them stops. Consolidating them into one derivation is the remaining step
    // of this phase, and is deliberately not bundled with the prompt change.
    const { buildTypographyPlan } = require("./evolution/experiment/TypographyPlan");
    const { buildTypographySystem } = require("./evolution/experiment/TypographySystem");
    for (const name of NAMES) {
      const bp = COFFEE[name];
      const req = resolveTextRequirement({ contentMessage: COPY.join("\n") });
      const assigned = assignTextRoles(req.lines);
      const geometry = buildGeometry({
        ratio: "1:1", blueprint: bp, copyRoles: geometryRolesFor(assigned), productCount: 1,
        compositionHint: bp?.visual_world?.composition_logic?.value ?? null,
      });
      const typography = buildTypographySystem({ geometry, lines: assigned });
      const tp = buildTypographyPlan({ mode: req.mode, lines: assigned, geometry, typography, ratio: "1:1" });
      const cp = buildCompositionPlan({ blueprint: bp, geometry, copyLines: COPY.length });
      if (!tp.space || cp.typography_zone.from !== "geometry") continue;
      const planCentre = cp.typography_zone.value.x + cp.typography_zone.value.width / 2;
      const spaceCentre = tp.space.x + tp.space.width / 2;
      const sideOf = (c: number) => (c < 40 ? "left" : c > 60 ? "right" : "centre");
      assert.strictEqual(
        sideOf(planCentre), sideOf(spaceCentre),
        `${name}: the composition puts the copy ${sideOf(planCentre)} and the typography plan puts it ${sideOf(spaceCentre)}`,
      );
    }
  });

  // ── 6. the six questions ────────────────────────────────────────────────
  console.log("\n6 — the questions an art director answers first");

  check("all six are answered, and differ between two different ideas", () => {
    const a = planFor(COFFEE.luxury).questions;
    const b = planFor(COFFEE.playful).questions;
    for (const k of ["visual_hero", "noticed_first", "emotion", "typography_home", "environment_role", "kept_quiet"]) {
      assert.ok(String((a as any)[k]).length > 3, `${k} was not answered`);
    }
    const same = Object.keys(a).filter((k) => (a as any)[k] === (b as any)[k]);
    assert.ok(same.length <= 1, `two different ideas answered the same on: ${same.join(", ")}`);
  });

  check("an undecided brief answers 'not decided' rather than guessing", () => {
    const q = buildCompositionPlan({}).questions;
    assert.strictEqual(q.visual_hero, "not decided");
    assert.strictEqual(q.emotion, "not decided");
  });

  // ── 7. the prompt section ───────────────────────────────────────────────
  console.log("\n7 — one account of the frame for the renderer");

  check("the rendered section states only what was decided", () => {
    const rich = renderCompositionPlan(planFor(COFFEE.futuristic));
    assert.ok(rich, "a fully decided plan wrote nothing");
    assert.ok(/macro/.test(rich) && /behind/.test(rich), rich);
    const bare = renderCompositionPlan(planFor(blueprint({ big_idea: "A good coffee" })));
    // Nothing about a camera can appear when no camera was decided.
    assert.ok(!/camera angle|camera distance/.test(bare || ""), bare || "");
  });

  check("scene-only drops the words but keeps the area they need", () => {
    const p = planFor(COFFEE.luxury);
    const full = renderCompositionPlan(p) || "";
    const scene = renderCompositionPlan(p, { sceneOnly: true }) || "";
    assert.ok(/where the words go/.test(full), full);
    assert.ok(!/where the words go/.test(scene), scene);
    assert.ok(/keep clear/.test(scene), "the scene-only section does not reserve the copy area");
    for (const line of COPY) assert.ok(!scene.includes(line), "the composition section carries the client's copy");
  });

  check("the section never carries the client's copy", () => {
    for (const n of NAMES) {
      const s = renderCompositionPlan(planFor(COFFEE[n])) || "";
      for (const line of COPY) assert.ok(!s.includes(line), `${n}: the composition section quotes the copy`);
    }
  });

  check("the section is smaller than what it replaces", () => {
    // It stands in for the geometry block and the layer stack, which used to be
    // written separately into the same prompt. If it is not smaller, the single
    // source of truth cost prompt budget rather than saving it.
    const { renderGeometry } = require("./evolution/experiment/LayoutGeometry");
    const { renderComposition } = require("./evolution/experiment/VisualComposition");
    const bp = COFFEE.luxury;
    const req = resolveTextRequirement({ contentMessage: COPY.join("\n") });
    const assigned = assignTextRoles(req.lines);
    const geometry = buildGeometry({ ratio: "1:1", blueprint: bp, copyRoles: geometryRolesFor(assigned), productCount: 1 });
    const composition = buildComposition({ blueprint: bp });
    const before = [renderGeometry(geometry), renderComposition(composition)].filter(Boolean).join("\n\n").length;
    const after = (renderCompositionPlan(buildCompositionPlan({ blueprint: bp, geometry, composition, copyLines: 3 })) || "").length;
    console.log(`      geometry + layer stack ${before} chars → one composition ${after} chars`);
    assert.ok(after < before, `the plan writes ${after} chars where the two it replaces wrote ${before}`);
  });

  // ── 8. telemetry ────────────────────────────────────────────────────────
  console.log("\n8 — what is logged");

  check("telemetry names decisions and never the copy", () => {
    const t = JSON.stringify(compositionPlanTelemetry(planFor(COFFEE.organic)));
    for (const line of COPY) assert.ok(!t.includes(line), "the telemetry leaked the client's copy");
    assert.ok(/product_role/.test(t) && /hierarchy/.test(t) && /completeness/.test(t));
    assert.deepStrictEqual(compositionPlanTelemetry(null), { composition_plan: false });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
