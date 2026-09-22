import assert from "assert";
import fs from "fs";
import path from "path";

/**
 * Creative intelligence reaching real users.
 *
 * Two properties are under test and they pull against each other.
 *
 * The first is REACH: an ordinary user, with no tester header and no experiment
 * routing, should see why their picture looks the way it does. That was the gap
 * -- every one of these decisions existed and none of them ever left the
 * backend.
 *
 * The second is HONESTY, and it is the one that constrains the first. The
 * stable path has no Creative Director, so it cannot know which routes were
 * considered or what a critic thought. The tempting fix is to approximate those
 * fields from what stable does have. These tests exist to make that
 * approximation fail loudly, because a plausible invented reason is worse than
 * a missing one: a user can act on the first without ever learning it was
 * guessed.
 */

const {
  buildCreativeIntelligence,
  intelligenceTelemetry,
} = require("./evolution/experiment/CreativeIntelligenceView");
const {
  emptyVisionFeedback,
  visionFeedbackFromIntelligence,
  visionTelemetry,
} = require("./evolution/experiment/VisionFeedback");

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

/** A strategy shaped like what the stable pipeline genuinely produces. */
const STRATEGY = {
  creative_angle: "the ritual, not the object",
  commercial_goal: "trial",
  target_customer_psychology: "buys small luxuries to mark the start of the day",
  prompt_guidance: "keep the vessel intact",
  creative_route: "morning ritual",
  consumer_insight: "the first cup is the only unhurried moment they get",
  creative_message: "a morning worth getting up for",
  communication_objective: "make the ritual feel attainable",
  visual_translation: {
    subject_representation: "the cup held mid-air, steam still rising",
    atmosphere: "low warm light before the day starts",
    lighting_character: "single window source, long shadow",
    material_treatment: "matte ceramic against soft linen",
    composition_principle: "off-centre, weight to the lower left",
    colour_direction: "warm neutrals",
    camera_intent: "close, slightly above",
    typography_intent: "quiet, set small, never competing with the steam",
  },
};

console.log("\nCreative intelligence on the stable path");

check("A stable render carries reasoning without a director", () => {
  const v = buildCreativeIntelligence({ strategy: STRATEGY });
  assert.ok(Object.keys(v).length > 0, "stable produced no intelligence at all");
  assert.ok(v.selected_direction, "no direction");
  assert.ok(v.audience_insight?.what, "no audience");
  assert.ok(v.creative_summary, "no summary");
});

check("It reads the strategy rather than restating the request", () => {
  const v = buildCreativeIntelligence({ strategy: STRATEGY });
  assert.strictEqual(v.selected_direction, "morning ritual");
  assert.ok(/unhurried/.test(v.audience_insight.what), "audience was not the real insight");
  assert.ok(/steam/.test(v.creative_summary), "summary was not the real subject reading");
});

check("Craft reasoning comes through on stable", () => {
  const v = buildCreativeIntelligence({ strategy: STRATEGY });
  assert.ok(/never competing/.test(v.typography_reasoning.what), "typography intent lost");
  assert.ok(v.composition_reasoning?.what, "composition intent lost");
  assert.ok(v.layout_reasoning?.what, "layout intent lost");
  assert.ok(v.visual_strategy?.what, "visual world lost");
});

check("Director-only fields stay absent on stable", () => {
  const v = buildCreativeIntelligence({ strategy: STRATEGY });
  // Nothing on this path compared routes or judged a render. Filling these
  // would be the exact fabrication this layer refuses.
  assert.strictEqual(v.concepts, undefined, "concepts were invented without a director");
  assert.strictEqual(v.critic_feedback, undefined, "critic findings were invented");
  assert.strictEqual(v.improvement_suggestions, undefined, "suggestions were invented");
});

check("Confidence on strategy-derived reasoning is never high", () => {
  const v = buildCreativeIntelligence({ strategy: STRATEGY });
  for (const k of ["audience_insight", "visual_strategy", "typography_reasoning", "layout_reasoning"]) {
    const r = (v as any)[k];
    if (r?.confidence) {
      assert.notStrictEqual(r.confidence, "high", `${k} claimed high confidence from an inference`);
    }
  }
});

check("A sparse strategy yields sparse intelligence, not filler", () => {
  const v = buildCreativeIntelligence({
    strategy: { creative_angle: "", commercial_goal: "", target_customer_psychology: "", prompt_guidance: "" },
  });
  assert.strictEqual(Object.keys(v).length, 0, `empty strategy produced ${JSON.stringify(v)}`);
});

check("No input at all produces nothing", () => {
  assert.deepStrictEqual(buildCreativeIntelligence({}), {});
  assert.deepStrictEqual(buildCreativeIntelligence({ strategy: null }), {});
});

check("The blueprint still outranks the strategy when both exist", () => {
  // Stable reasoning is a floor, not a replacement. When the director has
  // actually decided, the director's words are what a user should read.
  const v = buildCreativeIntelligence({
    strategy: STRATEGY,
    blueprint: {
      concept: {
        big_idea: {
          value: "the object itself is the idea",
          because: "the packaging is the story",
          confidence: "high",
        },
      },
    },
  });
  assert.strictEqual(v.selected_direction, "the object itself is the idea");
  assert.strictEqual(v.reasoning, "the packaging is the story");
});

console.log("\nThe stable pipeline stays stable");

const ORCH = fs.readFileSync(
  path.join(__dirname, "service/SimpleImageGenerationOrchestratorService.ts"),
  "utf8",
);

check("Intelligence is built after the image, never before", () => {
  const build = ORCH.indexOf("buildCreativeIntelligence({");
  const provider = ORCH.lastIndexOf("providerDurationMs =");
  assert.ok(build > 0, "the stable path does not build intelligence");
  assert.ok(build > provider, "intelligence is computed before the render, so it could influence it");
});

check("It cannot fail a render", () => {
  const i = ORCH.indexOf("buildCreativeIntelligence({");
  const window = ORCH.slice(Math.max(0, i - 400), i);
  assert.ok(/try\s*\{/.test(window), "the intelligence build is not inside a try");
});

check("Nothing was added to what the renderer is given", () => {
  // The guarantee the user asked for: only `creativeIntelligence` is added.
  const i = ORCH.indexOf("buildCreativeIntelligence({");
  assert.ok(
    !/compilerInput|masterPrompt\s*=|providerReq/.test(ORCH.slice(i, i + 900)),
    "the intelligence block touches renderer input",
  );
});

check("Stable still reads no feature flags", () => {
  // The architectural boundary: evolution/ reads flags, service/ never does.
  // The view is imported into service/, so it must stay a pure translation.
  const view = fs.readFileSync(
    path.join(__dirname, "evolution/experiment/CreativeIntelligenceView.ts"),
    "utf8",
  );
  const code = view.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/feature-flags|readFlags|isEnabled/.test(code), "the view reads flags");
  // Every import it makes must be type-only, or stable gains a runtime edge
  // into the experiment layer.
  for (const m of code.matchAll(/^import\s+(?!type)/gm)) {
    assert.fail(`the view has a runtime import: ${code.slice(m.index!, m.index! + 70)}`);
  }
});

check("No internal vocabulary can reach a user", () => {
  const v = buildCreativeIntelligence({ strategy: STRATEGY });
  const shown = JSON.stringify(v).toLowerCase();
  for (const word of ["blueprint", "prompt compiler", "layout geometry", "derived_from", "groq"]) {
    assert.ok(!shown.includes(word), `the user would read "${word}"`);
  }
});

console.log("\nVision feedback tells the truth about what it saw");

check("The empty object claims nothing", () => {
  const v = emptyVisionFeedback();
  assert.deepStrictEqual(v.issues, []);
  assert.deepStrictEqual(v.strengths, []);
  assert.deepStrictEqual(v.suggested_changes, []);
  assert.strictEqual(v.confidence, "");
  assert.strictEqual(v.analyzed_image, false);
});

check("Reasoning-derived feedback is never marked as seen", () => {
  // The whole point of the discriminator. Nothing has looked at a pixel yet,
  // and the type must say so rather than implying sight.
  const v = visionFeedbackFromIntelligence({
    critic_feedback: ["the offer competes with the product for attention"],
    improvement_suggestions: ["set the offer smaller and move it below the fold"],
  });
  assert.strictEqual(v.analyzed_image, false, "unseen feedback claimed to be render analysis");
  assert.strictEqual(v.source, "pre_render_reasoning");
});

check("It carries real findings rather than inventing its own", () => {
  const v = visionFeedbackFromIntelligence({
    critic_feedback: ["the offer competes with the product"],
    improvement_suggestions: ["set the offer smaller"],
  });
  assert.strictEqual(v.issues.length, 1);
  assert.ok(/competes/.test(v.issues[0].what));
  assert.strictEqual(v.suggested_changes.length, 1);
  assert.ok(/smaller/.test(v.suggested_changes[0].change));
});

check("Praise is not manufactured to balance criticism", () => {
  const v = visionFeedbackFromIntelligence({ critic_feedback: ["type is cramped"] });
  assert.deepStrictEqual(v.strengths, [], "strengths were invented");
});

check("Confidence stays low while the image is unseen", () => {
  const v = visionFeedbackFromIntelligence({ critic_feedback: ["type is cramped"] });
  assert.strictEqual(v.confidence, "low");
});

check("Nothing found means no confidence, not clean", () => {
  const v = visionFeedbackFromIntelligence({});
  assert.strictEqual(v.confidence, "", "absence of findings was reported as a verdict");
});

check("Null intelligence does not throw", () => {
  assert.strictEqual(visionFeedbackFromIntelligence(null).analyzed_image, false);
  assert.strictEqual(visionFeedbackFromIntelligence(undefined).confidence, "");
});

check("The interface carries no score", () => {
  // A number over an unexamined image is the hardcoded-94/100 failure again.
  const src = fs.readFileSync(path.join(__dirname, "evolution/experiment/VisionFeedback.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(
    !/\bscore\b\s*[?:]|\brating\b\s*[?:]|:\s*number/.test(code),
    "a numeric score entered the vision contract",
  );
});

check("Telemetry counts without leaking the findings", () => {
  const t = visionTelemetry(visionFeedbackFromIntelligence({ critic_feedback: ["type is cramped"] }));
  assert.strictEqual(t.issues, 1);
  assert.ok(!JSON.stringify(t).includes("cramped"), "telemetry leaked finding text");
  const t2 = intelligenceTelemetry(buildCreativeIntelligence({ strategy: STRATEGY }));
  assert.strictEqual(t2.creative_intelligence, true);
  assert.ok(!JSON.stringify(t2).includes("unhurried"), "telemetry leaked reasoning text");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
