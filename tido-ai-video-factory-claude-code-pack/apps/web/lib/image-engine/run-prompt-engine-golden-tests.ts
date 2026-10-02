/**
 * Golden tests for the prompt the engine actually sends. Offline, no API calls.
 *
 * WHY
 * ---
 * The v2 work changes the last step of the image pipeline. Nothing in the repo
 * pinned what that step currently produces, so "v1 is unchanged" was an opinion.
 * This suite turns it into a file comparison: three fixtures through the real
 * assembly, byte-for-byte against stored goldens.
 *
 * WHAT IT PINS
 * ------------
 * `compileOnePassPrompt` -- the eight-block script, which is the string the
 * provider receives (`ImgStudioImageGenerationProvider` appends only the packed
 * reference protocol). The upstream LLM layers are NOT pinned here: they are
 * model calls, they are not deterministic, and a golden over them would be a
 * flake generator. The deterministic tail is the part the v2 flag replaces, so it
 * is the part that has to be pinned.
 *
 * HOW TO UPDATE
 * -------------
 * `npx tsx lib/image-engine/run-prompt-engine-golden-tests.ts --update` rewrites
 * the goldens. Updating is a deliberate act and the diff belongs in the commit
 * message: a golden that changes silently is worse than no golden.
 */
import assert from "assert";
import fs from "fs";
import path from "path";

import { GOLDEN_FIXTURES, type GoldenFixture } from "./prompt-v2/golden-fixtures";
import { buildTextLedgers } from "./evolution/experiment/TextLedgerSystem";
import {
  TYPOGRAPHY_REQUIREMENTS,
  compileOnePassPrompt,
} from "./evolution/experiment/OpticalCompiler";
import {
  projectToSetup,
  renderEnvironmentForPrompt,
  renderLensForPrompt,
  renderLightForPrompt,
  renderSurfaceForPrompt,
  resolveOpticalAxes,
} from "./evolution/experiment/CinematographyLayer";
import { renderFinishForPrompt, resolveFinish } from "./evolution/experiment/FinishLayer";
import { renderIdeaForPrompt, resolveIdea } from "./evolution/experiment/IdeaLayer";
import { NEUTRAL_TREATMENT } from "./evolution/experiment/TypographyDNA";
import { resolveTextRequirement } from "./compiler/ExactCopyIntegrityValidator";

const UPDATE = process.argv.includes("--update");
// Inside the source tree, not `data/`: `apps/web/data` is gitignored, and a
// golden that is not committed is not a golden.
const GOLDEN_DIR = path.join(__dirname, "prompt-v2", "golden", "v1");

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
    failures.push(`${name}\n    ${(e as Error).message.split("\n")[0]}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message.split("\n")[0]}`);
  }
}

/**
 * A composition plan stand-in.
 *
 * The real plan is built from a blueprint an LLM wrote, so a golden cannot own
 * one. These are the fields the assembly reads, held constant so the golden
 * measures the ASSEMBLY rather than the director's mood on the day.
 */
const PLAN = {
  hero_subject: { value: "the product, alone, as the frame's reason" },
  product_role: { value: "hero" },
  product_position: { value: { x: 52, y: 30, width: 30, height: 55, label: "centre right" } },
  product_scale: { value: { share: 38, label: "large" } },
  negative_space: { value: { share: 0.48, purpose: "the calm beside it" } },
  storytelling_intent: { value: "an unhurried morning, before anything has started" },
  camera_angle: { value: "eye level with the staging surface" },
  camera_distance: { value: "close" },
  camera_lens_behavior: { value: "long lens, the surroundings compressed" },
  lighting_direction: { value: "from the side, raking across the surface" },
  lighting_quality: { value: "one source, a long soft shadow" },
  atmosphere: { value: "still air" },
  environment: { value: "one uninterrupted plane" },
  foreground_background_relationship: { value: "what is behind falls away unlit" },
  depth_structure: [{ plane: "midground" as const, holds: "the product and its base" }],
  supporting_elements: [],
  visual_hierarchy: [{ element: "the product", rank: 1 }],
  typography_zone: { value: { x: 26, y: 8, width: 48, height: 21 } },
};

/** The v1 assembly, exactly as `ExperimentPipeline.wrapProvider` calls it. */
export function buildV1Prompt(fx: GoldenFixture): string {
  const requirement = resolveTextRequirement({ contentMessage: fx.contentMessage });
  const ledgers = buildTextLedgers({ requirement, hasProductReference: fx.products.length > 0 });
  const axes = resolveOpticalAxes({
    assetType: fx.assetType,
    evidence: [fx.concept, PLAN.atmosphere.value, PLAN.lighting_quality.value],
  });
  const setup = projectToSetup(axes.values, {
    product_share: PLAN.product_scale.value.share,
    requires: TYPOGRAPHY_REQUIREMENTS,
    drawing_type: requirement.lines.length > 0,
  });
  const finish = resolveFinish({
    assetType: fx.assetType,
    evidence: [fx.concept],
    copyLines: requirement.lines.length,
  });
  const idea = resolveIdea({ concept: null, judgment: null, brief: fx.concept });
  return compileOnePassPrompt({
    assetType: fx.assetType,
    compiled: `## CREATIVE INTENT\nCREATIVE CONCEPT: ${fx.concept}\nBRAND NAME: ${fx.brandName}\n`,
    plan: PLAN,
    ledgers,
    treatment: { ...NEUTRAL_TREATMENT, contact: 0.6 },
    idea: renderIdeaForPrompt(idea),
    finish: renderFinishForPrompt(finish),
    optics: {
      light: renderLightForPrompt(setup),
      lens: renderLensForPrompt(setup),
      environment: renderEnvironmentForPrompt(setup),
      surface: renderSurfaceForPrompt(setup),
    },
  }).prompt;
}

function main(): void {
  console.log("\nPrompt engine — golden (v1 assembly, offline)\n");
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });

  for (const fx of GOLDEN_FIXTURES) {
    const file = path.join(GOLDEN_DIR, `${fx.id}.txt`);
    const actual = buildV1Prompt(fx);

    if (UPDATE || !fs.existsSync(file)) {
      fs.writeFileSync(file, actual, "utf8");
      console.log(`  ${UPDATE ? "updated" : "wrote"} ${file} (${actual.length} chars)`);
      continue;
    }
    check(`${fx.id} is byte-for-byte what it was`, () => {
      const expected = fs.readFileSync(file, "utf8");
      if (expected !== actual) {
        const at = [...expected].findIndex((c, i) => c !== actual[i]);
        throw new Error(
          `golden differs at char ${at}: expected ${JSON.stringify(expected.slice(at, at + 60))}, got ${JSON.stringify(actual.slice(at, at + 60))}`,
        );
      }
    });
  }

  // Two invariants the golden alone would not catch, because a golden records a
  // bug as faithfully as it records a decision.
  check("every fixture still produces a prompt inside the provider's ceiling", () => {
    const ceiling = Number(process.env.PROMPT_HARD_MAXIMUM_CHARS || 32000);
    for (const fx of GOLDEN_FIXTURES) {
      const chars = buildV1Prompt(fx).length;
      assert.ok(chars < ceiling, `${fx.id} is ${chars} chars against a ${ceiling} ceiling`);
    }
  });

  check("the client's copy reaches the prompt exactly once per line", () => {
    for (const fx of GOLDEN_FIXTURES) {
      const prompt = buildV1Prompt(fx);
      for (const line of resolveTextRequirement({ contentMessage: fx.contentMessage }).lines) {
        const count = prompt.split(line).length - 1;
        assert.strictEqual(count, 1, `${fx.id}: "${line.slice(0, 24)}…" appears ${count} times`);
      }
    }
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  if (failed) process.exit(1);
}

main();
