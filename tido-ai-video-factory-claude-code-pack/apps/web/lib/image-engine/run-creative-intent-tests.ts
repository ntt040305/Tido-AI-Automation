/**
 * Phase 6 — creative intent as the parent decision layer. Offline.
 *
 * What this suite is for
 * ----------------------
 *   1. THE CHAIN MOVES TOGETHER. One coffee bottle, one set of copy, four
 *      different creative directions. The intent must differ, and the
 *      composition, the typography and the prompt must differ BECAUSE it does.
 *      A change that stops at the blueprint is a decision nothing acts on.
 *   2. NOTHING IS INFERRED FROM A CATEGORY. A brief stuffed with the words a
 *      stereotype would trigger, but with no decisions behind them, produces an
 *      intent section that says so rather than one that sounds plausible.
 *   3. THE FIVE QUESTIONS ARE ANSWERED FROM DECISIONS. Each answer quotes a
 *      field, and an undecided field answers "not decided".
 *
 * The four directions differ the way real briefs differ: in what the director
 * decided about the audience, the brand, the objective and the difference --
 * not in adjectives. The product never changes.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { ProfessionalCreativeBrain } = require("./evolution/experiment/ProfessionalCreativeBrain");
const { creativeQuestions, intentTelemetry, SECTION_FIELDS, BLUEPRINT_SECTIONS } = require("./evolution/experiment/CreativeBlueprint");
const { buildCompositionPlan, renderCompositionPlan } = require("./evolution/experiment/CompositionPlan");
const { buildTypographyDNA, renderDnaForImagePrompt } = require("./evolution/experiment/TypographyDNA");
const { buildGeometry } = require("./evolution/experiment/LayoutGeometry");
const { buildComposition } = require("./evolution/experiment/VisualComposition");
const { assignTextRoles, geometryRolesFor } = require("./evolution/experiment/TypographySystem");
const { resolveTextRequirement } = require("./compiler/ExactCopyIntegrityValidator");

const WEB = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf-8");
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

// ── one product, four creative directions ─────────────────────────────────
//
// The director's decisions are what differ. Written the way the director
// writes them: sentences about the situation, not adjectives about a mood.

interface Direction {
  audience_context: string;
  brand_context: string;
  creative_goal: string;
  deliberately_avoided: string;
  strategy_reason: string;
  strategy_route: string;
  visual_story: string;
  camera_decision: string;
  lighting_decision: string;
  composition_decision: string;
  environment_decision: string;
  selected_direction: string;
}

const DIRECTIONS: Record<string, Direction> = {
  heritage: {
    audience_context: "people who already own enough things and are buying the ritual, not the caffeine",
    brand_context: "a house that has roasted the same way for three generations and says so quietly",
    creative_goal: "make the restraint read as confidence rather than as absence",
    deliberately_avoided: "the abundance shot, which would have made it one more premium coffee",
    strategy_reason: "the only thing a newer brand cannot copy is the length of time this one has been doing it",
    strategy_route: "coffee as a considered ritual",
    visual_story: "the moment before the first cup, in a room nobody else is awake in",
    camera_decision: "eye level and straight on, close, so the bottle is met rather than observed",
    lighting_decision: "one low window light from the side, raking, deep falloff and nothing filled in",
    composition_decision: "the bottle sits off-centre to the right third, weight carried by the empty side",
    environment_decision: "a stone counter in a room stripped of everything that is not needed",
    selected_direction: "restraint",
  },
  energetic: {
    audience_context: "people in their twenties buying it on the way somewhere, who decide in two seconds",
    brand_context: "a young brand that behaves like the people who drink it and does not stand on ceremony",
    creative_goal: "be the thing somebody screenshots on a hot afternoon",
    deliberately_avoided: "the calm morning shot, which every coffee brand already owns",
    strategy_reason: "this audience does not want to be told the coffee is serious; they want the afternoon back",
    strategy_route: "the cold one you drink with your feet in a canal",
    visual_story: "a hand lifting the bottle out of a tub of ice, water everywhere",
    camera_decision: "a wide establishing shot from a high angle, looking down at the whole table",
    lighting_decision: "hard midday sun from above, saturated and cheerful",
    composition_decision: "the bottle sits to the left third with the day happening around it",
    environment_decision: "an outdoor table in full sun",
    selected_direction: "summer, loud and unserious",
  },
  engineered: {
    audience_context: "people who read the specification before they buy and distrust anything described as artisanal",
    brand_context: "a brand that publishes its numbers and treats brewing as a process with tolerances",
    creative_goal: "make consistency the thing worth paying for",
    deliberately_avoided: "the hand-of-the-roaster shot, which claims exactly what this brand is not",
    strategy_reason: "every competitor claims craft, and none of them will publish a tolerance",
    strategy_route: "coffee engineered to a specification",
    visual_story: "the bottle on an instrument bench, its readout beside it",
    camera_decision: "macro, extreme close on the seal, filling the frame",
    lighting_decision: "even light from behind the bottle, a luminous rim along its edge",
    composition_decision: "centred and symmetrical, the way a measurement is presented",
    environment_decision: "a laboratory bench, everything on it there for a reason",
    selected_direction: "calibrated",
  },
  grown: {
    audience_context: "people who want to know whose hands touched it and will pay more to be told",
    brand_context: "a co-operative that puts the growers' names on the sack and is not a marketing device about it",
    creative_goal: "make the people behind it visible without turning them into a story",
    deliberately_avoided: "the anonymous studio shot, which is the thing this brand exists in opposition to",
    strategy_reason: "the supply chain is the product here, and nobody else can show one that is actually theirs",
    strategy_route: "grown by people whose names are on the sack",
    visual_story: "hands setting the bottle down on a table they built",
    camera_decision: "a medium shot from a high angle, looking down across the table",
    lighting_decision: "morning light from a window to the left, diffused by the room",
    composition_decision: "the bottle sits to the left third, hands entering from the right",
    environment_decision: "a working farmhouse kitchen in the middle of a morning",
    selected_direction: "made by someone",
  },
};

const NAMES = ["heritage", "energetic", "engineered", "grown"] as const;
const COPY = ["Slow mornings", "Cold brew, done properly", "Discover"];
const NEWLINE = "\n";

/** The whole chain, from the director's decisions to the prompt. */
function chainFor(d: Partial<Direction>) {
  const decision = {
    // Everything a director contract carries; the four above differ only in
    // what was DECIDED, never in the product.
    typography_decision: "", important_visual_elements: [], avoid_elements: [],
    element_meanings: [], copy_roles: [], staging_requirements: [],
    ...d,
  };
  const blueprint = ProfessionalCreativeBrain.assemble({ decision });
  const req = resolveTextRequirement({ contentMessage: COPY.join(NEWLINE) });
  const assigned = assignTextRoles(req.lines);
  const geometry = buildGeometry({
    ratio: "1:1", blueprint, copyRoles: geometryRolesFor(assigned), productCount: 1,
    compositionHint: d.composition_decision ?? null,
  });
  const composition = buildComposition({ blueprint });
  const plan = buildCompositionPlan({
    blueprint, geometry, composition, copyLines: COPY.length, copy: assigned, ratio: "1:1",
  });
  const dna = buildTypographyDNA({ blueprint, copyLines: COPY.length, compositionPlan: plan });
  const prompt = [renderCompositionPlan(plan, { sceneOnly: true }), renderDnaForImagePrompt(dna)]
    .filter(Boolean).join("\n\n");
  return { blueprint, plan, dna, prompt };
}

function main() {
  console.log("\nCreative intent — the layer everything else is downstream of\n");

  // ── 1. the section exists and is sourced ────────────────────────────────
  console.log("1 — intent is a blueprint section, sourced like every other");

  check("intent is the first section, with five fields", () => {
    assert.strictEqual(BLUEPRINT_SECTIONS[0], "intent");
    assert.deepStrictEqual([...SECTION_FIELDS.intent], [
      "audience_perception", "brand_position", "campaign_purpose",
      "differentiation_reason", "creative_angle",
    ]);
  });

  check("every intent field rests on something upstream said", () => {
    const { blueprint } = chainFor(DIRECTIONS.heritage);
    for (const f of SECTION_FIELDS.intent) {
      const d = blueprint.intent[f];
      assert.ok(d, `${f} was not decided from a fully fed director contract`);
      assert.ok(d.because.length > 12, `${f} was decided without a recorded reason`);
      assert.ok(["director", "strategy", "product_truth", "visual_dna"].includes(d.derived_from), `${f} has basis ${d.derived_from}`);
      assert.notStrictEqual(d.value.toLowerCase(), d.because.toLowerCase(), `${f} restates itself as its own reason`);
    }
  });

  check("the intent section is NOT printed into the image prompt", () => {
    // A renderer cannot act on a campaign objective, and the prompt has about
    // a hundred characters of headroom. A section the model cannot use would
    // cost a render to say nothing.
    const src = stripComments(read("lib/image-engine/evolution/experiment/ProfessionalCreativeBrain.ts"));
    const labels = src.slice(src.indexOf("const LABELS"), src.indexOf("const LABELS") + 400);
    assert.ok(!/intent:/.test(labels), "the intent section was added to the prompt's label map");
    const { blueprint } = chainFor(DIRECTIONS.heritage);
    const rendered = ProfessionalCreativeBrain.render(blueprint) || "";
    // Asserted on the SECTION, not on its strings: `audience_context` also
    // feeds `brand_expression.emotional_direction`, which has printed since
    // long before this phase and legitimately still does. What must not appear
    // is a second, intent-labelled account of the same reasoning.
    assert.ok(!/INTENT/i.test(rendered), "an intent heading reached the image prompt");
    for (const f of SECTION_FIELDS.intent) {
      assert.ok(
        !rendered.includes(f.replace(/_/g, " ")),
        `the prompt carries the intent field "${f}", which a renderer cannot act on`,
      );
    }
  });

  // ── 2. THE ACCEPTANCE CASE ──────────────────────────────────────────────
  console.log("\n2 — one product, four directions, the whole chain moves");

  check("the intent differs across all four", () => {
    const chains = NAMES.map((n) => chainFor(DIRECTIONS[n]));
    for (let i = 0; i < NAMES.length; i++) {
      const t = intentTelemetry(chains[i].blueprint);
      console.log(`      ${NAMES[i].padEnd(11)} intent ${t.decided}/${t.of} · questions ${t.questions_answered}/5`);
    }
    for (const f of SECTION_FIELDS.intent) {
      const values = chains.map((c) => c.blueprint.intent[f]?.value ?? "");
      assert.strictEqual(new Set(values).size, 4, `${f} is the same for at least two of the four directions`);
    }
  });

  check("the composition differs BECAUSE the intent differs", () => {
    const chains = NAMES.map((n) => chainFor(DIRECTIONS[n]));
    for (let i = 0; i < NAMES.length; i++) {
      const p = chains[i].plan;
      console.log(
        `      ${NAMES[i].padEnd(11)} ${p.product_role.value.padEnd(11)} ` +
          `cam[${p.camera_angle.value || "—"} / ${p.camera_distance.value || "—"}] light[${p.lighting_direction.value || "—"}]`,
      );
    }
    const distinct = (pick: (c: { plan: Record<string, { value: string }> }) => string) =>
      new Set(chains.map(pick)).size;
    assert.ok(distinct((c) => c.plan.camera_distance.value) >= 3, "the camera distance barely moves across four directions");
    assert.ok(distinct((c) => c.plan.lighting_direction.value) >= 3, "the light comes from the same place in all four");
    assert.strictEqual(distinct((c) => c.plan.environment.value), 4, "two directions share an environment");
  });

  check("the typography differs across the four", () => {
    const chains = NAMES.map((n) => chainFor(DIRECTIONS[n]));
    const shapes = chains.map((c) => JSON.stringify(c.dna.treatment));
    const roles = chains.map((c) => c.dna.typography_role);
    for (let i = 0; i < NAMES.length; i++) {
      const t = chains[i].dna.treatment;
      const on = Object.keys(t).filter((k) => typeof t[k] === "number" && t[k] >= 0.12 && k !== "weight" && k !== "tracking");
      console.log(`      ${NAMES[i].padEnd(11)} ${(on.join(", ") || "solid ink").padEnd(34)} ${t.weight}/${t.tracking}`);
    }
    assert.ok(new Set(shapes).size >= 3, `only ${new Set(shapes).size} distinct typographic treatments across four directions`);
    assert.ok(new Set(roles).size >= 2, "typography has the same job in all four");
  });

  check("the prompt differs across the four", () => {
    const chains = NAMES.map((n) => chainFor(DIRECTIONS[n]));
    const prompts = chains.map((c) => c.prompt);
    assert.strictEqual(new Set(prompts).size, 4, "two directions produced the same prompt");
    for (let i = 0; i < prompts.length; i++) {
      assert.ok(prompts[i].length > 200, `${NAMES[i]} produced almost no prompt`);
    }
  });

  check("the chain is driven by decisions, not by the brief's adjectives", () => {
    // The same four ROUTES with the camera, light and environment decisions
    // removed: the composition should collapse to almost nothing, because
    // adjectives in a strategy route are not decisions about a picture.
    const stripped = NAMES.map((n) => {
      const d = { ...DIRECTIONS[n] };
      d.camera_decision = "";
      d.lighting_decision = "";
      d.environment_decision = "";
      return chainFor(d);
    });
    for (const s of stripped) {
      assert.strictEqual(s.plan.camera_angle.value, "", "a camera was invented from the route's wording");
      assert.strictEqual(s.plan.camera_distance.value, "", "a distance was invented from the route's wording");
      assert.strictEqual(s.plan.lighting_direction.value, "", "a light direction was invented from the route's wording");
    }
    // And the intent survives, because intent does not depend on the camera.
    for (const s of stripped) {
      assert.ok(s.blueprint.intent.audience_perception, "the audience reasoning was lost with the camera");
    }
  });

  // ── 3. no stereotypes ───────────────────────────────────────────────────
  console.log("\n3 — nothing is inferred from a category");

  check("a brief full of trigger words but no decisions invents nothing", () => {
    // Everything a stereotype would need: the category, the tier, the mood.
    // Nothing a director actually decided.
    const { blueprint, plan } = chainFor({
      strategy_route: "the most premium luxury exclusive artisanal organic coffee",
      visual_story: "",
    });
    for (const f of SECTION_FIELDS.intent) {
      assert.strictEqual(blueprint.intent[f], null, `${f} was invented from category words: ${JSON.stringify(blueprint.intent[f])}`);
    }
    assert.strictEqual(plan.camera_angle.value, "");
    assert.strictEqual(plan.lighting_direction.value, "");
  });

  check("the module holds no category-to-emotion table", () => {
    const src = stripComments(read("lib/image-engine/evolution/experiment/ProfessionalCreativeBrain.ts"));
    const intentBlock = src.slice(src.indexOf("const intent:"), src.indexOf("const concept:"));
    for (const word of ["luxury", "premium", "food", "technology", "beauty", "fmcg", "fashion"]) {
      assert.ok(!new RegExp(`["'\`]${word}`, "i").test(intentBlock), `the intent section branches on "${word}"`);
    }
    // Every rung has to read a named upstream field.
    const rungs = (intentBlock.match(/rung\(/g) || []).length;
    assert.ok(rungs >= 10, `only ${rungs} sourced rungs across five fields`);
  });

  // ── 4. the five questions ───────────────────────────────────────────────
  console.log("\n4 — the five questions, answered from decisions");

  check("all five are answered on a fed brief, and differ between directions", () => {
    const a = creativeQuestions(chainFor(DIRECTIONS.heritage).blueprint);
    const b = creativeQuestions(chainFor(DIRECTIONS.engineered).blueprint);
    assert.strictEqual(a.answered, 5, `only ${a.answered}/5 answered: ${JSON.stringify(a)}`);
    const keys = ["single_idea", "audience_should_feel", "remembered", "why_it_exists", "not_generic"] as const;
    const same = keys.filter((k) => a[k] === b[k]);
    assert.deepStrictEqual(same, [], `two directions answered identically on: ${same.join(", ")}`);
  });

  check("an undecided brief answers 'not decided' rather than guessing", () => {
    const q = creativeQuestions(ProfessionalCreativeBrain.assemble({}));
    assert.strictEqual(q.answered, 0);
    for (const k of ["single_idea", "audience_should_feel", "remembered", "why_it_exists", "not_generic"] as const) {
      assert.strictEqual(q[k], "not decided", `${k} was answered from nothing`);
    }
    assert.deepStrictEqual(creativeQuestions(null).answered, 0);
  });

  check("the answers quote decisions rather than paraphrasing them", () => {
    const { blueprint } = chainFor(DIRECTIONS.grown);
    const q = creativeQuestions(blueprint);
    assert.strictEqual(q.not_generic, blueprint.intent.differentiation_reason.value);
    assert.strictEqual(q.why_it_exists, blueprint.intent.campaign_purpose.value);
    assert.strictEqual(q.remembered, blueprint.concept.visual_story.value);
  });

  // ── 5. telemetry ────────────────────────────────────────────────────────
  console.log("\n5 — what is logged");

  check("telemetry counts decisions and never the copy", () => {
    const { blueprint } = chainFor(DIRECTIONS.energetic);
    const t = JSON.stringify(intentTelemetry(blueprint));
    for (const line of COPY) assert.ok(!t.includes(line), "the telemetry leaked the client's copy");
    assert.ok(!t.includes(DIRECTIONS.energetic.audience_context), "the telemetry leaked a decision's text");
    assert.ok(/decided/.test(t) && /questions_answered/.test(t));
    assert.deepStrictEqual(intentTelemetry(null), { creative_intent: false });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
