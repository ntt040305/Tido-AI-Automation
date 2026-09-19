import assert from "assert";
import fs from "fs";
import path from "path";
import { NanoBananaPromptComposer } from "./evolution/experiment/NanoBananaPromptComposer";
import { toCreativeDecision, applyCreativeDecision } from "./evolution/experiment/CreativeDecision";
import { resolveSelectedDirection } from "./evolution/experiment/CreativeDirectionResolver";
import {
  PHASE0_SCENARIOS,
  PHASE0_CROSS_CHECK,
  PHASE0_UNIVERSAL_CHECKS,
  compileFixture,
} from "./benchmark/phase0-render-dataset";
import { Phase0TransmissionScorer } from "./benchmark/Phase0TransmissionScorer";
import { PHASE0_DIMENSIONS, ASSET_SCENARIO_KINDS } from "./benchmark/phase0-benchmark.types";
import type { Phase0Record, Phase0Scenario, Phase0Flags } from "./benchmark/phase0-benchmark.types";

/**
 * Phase 0.4 — tests for the benchmark itself.
 *
 * A benchmark is a measuring instrument, and an uncalibrated instrument produces
 * confident numbers about nothing. The first run of this one scored
 * `creative_concept_strength` at 1/10 across all twelve compositions and reported
 * it as a BLOCKING system defect. The cause was in the harness: control mode
 * carries the decision by rewriting the REQUEST, and the harness had skipped that
 * step, so it was scoring a prompt the pipeline never emits.
 *
 * These tests exist so that failure mode cannot return silently. Several of them
 * assert the harness reproduces the pipeline's own call, rather than asserting
 * anything about creative quality.
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

/** The harness under test, kept identical to `run-phase0-benchmark.ts`. */
function composeArm(s: Phase0Scenario, flags: Phase0Flags): { prompt: string; concept: string; hard: string[] } {
  const controlled = Boolean(flags.creative_director_control_v1);
  const carry = Boolean(flags.creative_bridge_v1);
  let concept = s.baseConcept;
  let hard = [...s.baseHardRequirements];
  if (controlled) {
    const d = toCreativeDecision(s.judgment);
    if (d) {
      const r = applyCreativeDecision(
        { concept, useCase: s.brief.useCase, aspectRatio: s.brief.aspectRatio, hardRequirements: hard } as any,
        d,
        false
      );
      concept = r.concept;
      hard = r.hardRequirements || [];
    }
  }
  const compiled = compileFixture(s.template, concept, hard);
  return {
    prompt: NanoBananaPromptComposer.compose(compiled, s.judgment, controlled, undefined, undefined, false, undefined, carry),
    concept,
    hard,
  };
}

console.log("\n=== Phase 0.4 — benchmark instrument tests ===\n");

// ── dataset shape ─────────────────────────────────────────────────────────

check("All six asset kinds are covered exactly once", () => {
  const kinds = PHASE0_SCENARIOS.map((s) => s.kind).sort();
  assert.deepStrictEqual(kinds, [...ASSET_SCENARIO_KINDS].sort(), "the six scenarios do not cover the six kinds");
});

check("Scenario ids are unique", () => {
  const ids = PHASE0_SCENARIOS.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length, "duplicate scenario id");
});

check("Every scenario states criteria and regressions", () => {
  for (const s of PHASE0_SCENARIOS) {
    assert.ok(s.renderCriteria.length >= 2, `${s.id} has too few render criteria`);
    assert.ok(s.regressions.length >= 2, `${s.id} has too few regressions`);
  }
});

check("Every scenario uses an aspect ratio the provider can actually render", () => {
  // Found the expensive way: the first live run failed both renders with
  // UNSUPPORTED_ASPECT_RATIO because four scenarios asked for 4:5, which
  // `CreativeFormatPlanner` offers as a poster default and ImgStudio rejects.
  // Reading the supported list rather than restating it, so a provider change
  // moves this test with it.
  const { IMAGE_ENGINE_CONFIG } = require("./config");
  const supported: string[] =
    IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS || IMAGE_ENGINE_CONFIG.SUPPORTED_ASPECT_RATIOS;
  assert.ok(supported?.length, "the provider declares no supported ratios");
  for (const s of PHASE0_SCENARIOS) {
    assert.ok(
      supported.includes(s.brief.aspectRatio),
      `${s.id}: ${s.brief.aspectRatio} is not renderable (supported: ${supported.join(", ")})`
    );
  }
});

check("The multi-product scenario really has four products", () => {
  const f = PHASE0_SCENARIOS.find((s) => s.kind === "multi_product")!;
  assert.strictEqual(f.products.count, 4, "Phase 0.4 asks for a four-product composition");
  assert.strictEqual(f.products.items.length, 4, "four products must be itemised");
});

check("Only the bridge flag moves between the arms", () => {
  for (const s of PHASE0_SCENARIOS) {
    const changed = (Object.keys(s.flags.on) as (keyof Phase0Flags)[]).filter((k) => s.flags.on[k] !== s.flags.off[k]);
    assert.deepStrictEqual(changed, ["creative_bridge_v1"], `${s.id} moves more than the bridge: ${changed.join(", ")}`);
  }
});

check("Both arms are control mode, or the bridge is inert by construction", () => {
  // `creative_bridge_v1` is read only inside `if (controlled)`. An arm pair that
  // forgot control mode would produce a zero delta and look like a null result.
  for (const s of PHASE0_SCENARIOS) {
    assert.ok(s.flags.off.creative_director_control_v1, `${s.id} OFF arm is not control mode`);
    assert.ok(s.flags.on.creative_director_control_v1, `${s.id} ON arm is not control mode`);
  }
});

check("Both director branches are represented", () => {
  const sources = PHASE0_SCENARIOS.map((s) => resolveSelectedDirection(s.judgment)?.source);
  assert.ok(sources.includes("strategy"), "no strategy-branch scenario");
  assert.ok(sources.includes("exploration"), "no exploration-branch scenario");
});

// ── the harness reproduces the pipeline ───────────────────────────────────

check("The harness mirrors ExperimentPipeline's composer call", () => {
  // The guard against the harness drifting from the thing it measures.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/applyCreativeDecision\(request, decision,\s*false\)/.test(src), "the pipeline no longer passes false");
  assert.ok(/carryNonSceneReasoning\s*$/m.test(src) || /bridge\s*\n\s*\),/.test(src), "the pipeline no longer passes the bridge last");
  const runner = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "run-phase0-benchmark.ts"),
    "utf-8"
  );
  assert.ok(/applyCreativeDecision\(/.test(runner), "the harness skips the control-mode request rewrite");
  assert.ok(/compileFixture\(/.test(runner), "the harness does not recompile after the rewrite");
});

check("Control mode rewrites the request rather than appending a block", () => {
  const s = PHASE0_SCENARIOS[0];
  const { prompt, concept } = composeArm(s, s.flags.off);
  assert.notStrictEqual(concept, s.baseConcept, "the concept was not rewritten");
  assert.ok(/SCENE: \S/.test(concept), "the rewritten concept carries no scene");
  assert.ok(!prompt.includes("## CREATIVE DIRECTION"), "control mode appended a direction block as well");
});

check("An uncontrolled arm appends the block instead — the other carrier still works", () => {
  const s = PHASE0_SCENARIOS[0];
  const uncontrolled: Phase0Flags = { ...s.flags.off, creative_director_control_v1: false };
  const { prompt } = composeArm(s, uncontrolled);
  assert.ok(prompt.includes("## CREATIVE DIRECTION"), "uncontrolled mode did not append the direction");
});

// ── the delta is real ─────────────────────────────────────────────────────

check("The bridge changes the prompt on every scenario", () => {
  for (const s of PHASE0_SCENARIOS) {
    const off = composeArm(s, s.flags.off).prompt;
    const on = composeArm(s, s.flags.on).prompt;
    assert.notStrictEqual(off, on, `${s.id}: the bridge was inert`);
    assert.ok(on.length > off.length, `${s.id}: the bridge removed content instead of carrying it`);
  }
});

check("The bridge carries brand, audience and semantics, and only in the ON arm", () => {
  const s = PHASE0_SCENARIOS[0];
  const off = composeArm(s, s.flags.off).prompt;
  const on = composeArm(s, s.flags.on).prompt;
  for (const block of ["## BRAND POSITIONING", "## AUDIENCE", "## WHY THESE ELEMENTS"]) {
    assert.ok(!off.includes(block), `${block} leaked into the OFF arm`);
    assert.ok(on.includes(block), `${block} is missing from the ON arm`);
  }
});

check("The bridge does not restate the scene — no duplicate SCENE carrier", () => {
  // Phase 0.3's whole point. If the bridge re-stated the scene the renderer
  // would read one scene twice, which reads as two scenes.
  const s = PHASE0_SCENARIOS[0];
  const on = composeArm(s, s.flags.on).prompt;
  assert.ok(!on.includes("## CREATIVE DIRECTION"), "the scene is stated twice in control mode");
  assert.ok(!on.includes("## THE ROUTE THIS BRIEF IS ANSWERED BY"), "the route is stated twice in control mode");
});

// ── scorer honesty ────────────────────────────────────────────────────────

function recordFor(s: Phase0Scenario, flags: Phase0Flags): Phase0Record {
  const { prompt, concept, hard } = composeArm(s, flags);
  return {
    scenario_id: s.id,
    kind: s.kind,
    arm: "ON",
    input: { brief: s.brief, asset_type: s.kind, products: s.products, constraints: s.constraints, flags },
    creative: {
      selected_direction: resolveSelectedDirection(s.judgment)?.name ?? null,
      direction_source: resolveSelectedDirection(s.judgment)?.source ?? null,
      visual_language: resolveSelectedDirection(s.judgment)?.appearance ?? [],
      reasoning: "",
      rejected_reasons: [],
      layout_strategy: null,
      carrier: "control_rewrite",
      effective_concept: concept,
      effective_hard_requirements: hard,
    },
    final: { generated_prompt: prompt, prompt_chars: prompt.length, delta_chars: 0, provider_used: null, rendered_image_path: null },
  };
}

check("ai_artifact_level is never given a number at the prompt stage", () => {
  for (const s of PHASE0_SCENARIOS) {
    const sc = Phase0TransmissionScorer.score(recordFor(s, s.flags.on), s);
    const d = sc.dimensions.find((x) => x.dimension === "ai_artifact_level")!;
    assert.strictEqual(d.score, null, `${s.id}: an artifact score was invented from text`);
    assert.ok(sc.unscored.includes("ai_artifact_level"), "it is not reported as unscored");
  }
});

check("Unscored dimensions are excluded from the mean, not counted as zero", () => {
  const s = PHASE0_SCENARIOS[0];
  const sc = Phase0TransmissionScorer.score(recordFor(s, s.flags.on), s);
  const scored = sc.dimensions.filter((d) => d.score !== null);
  assert.strictEqual(sc.scored_count, scored.length, "scored_count disagrees with the dimensions");
  const mean = scored.reduce((a, d) => a + (d.score as number), 0) / scored.length;
  assert.ok(Math.abs(sc.transmission_overall - mean) < 0.011, "the mean includes an unscored dimension");
  assert.ok(sc.transmission_overall > 0, "a zero mean means the unscored one was counted");
});

check("Every score is 1-10, never 0", () => {
  for (const s of PHASE0_SCENARIOS) {
    for (const arm of [s.flags.off, s.flags.on]) {
      for (const d of Phase0TransmissionScorer.score(recordFor(s, arm), s).dimensions) {
        if (d.score === null) continue;
        assert.ok(d.score >= 1 && d.score <= 10, `${s.id}/${d.dimension}: ${d.score} is outside 1-10`);
      }
    }
  }
});

check("Every scored dimension reports its evidence", () => {
  const s = PHASE0_SCENARIOS[0];
  for (const d of Phase0TransmissionScorer.score(recordFor(s, s.flags.on), s).dimensions) {
    if (d.score === null) continue;
    assert.ok(d.evidence.length > 0, `${d.dimension} produced a score with no evidence`);
    assert.ok(d.finding.length > 20, `${d.dimension} has no readable finding`);
  }
});

check("The scorer accepts either carrier for the same question", () => {
  // The bug this guards: a scorer that knew only the appended block reported
  // every controlled render as a total failure.
  const s = PHASE0_SCENARIOS[0];
  const controlled = Phase0TransmissionScorer.score(recordFor(s, s.flags.on), s);
  const uncontrolledFlags: Phase0Flags = { ...s.flags.on, creative_director_control_v1: false };
  const uncontrolled = Phase0TransmissionScorer.score(recordFor(s, uncontrolledFlags), s);
  const get = (x: typeof controlled) => x.dimensions.find((d) => d.dimension === "creative_concept_strength")!.score!;
  assert.ok(get(controlled) >= 5, `control mode scored ${get(controlled)} — the scorer is blind to its carrier`);
  assert.ok(get(uncontrolled) >= 5, `uncontrolled scored ${get(uncontrolled)} — the scorer is blind to its carrier`);
});

// ── the finding this benchmark exists to make ─────────────────────────────

/**
 * Phase 0.5 regression tests.
 *
 * These replace a test that asserted the DEFECT, written so the gap could not be
 * closed silently. It has been closed; these hold it closed.
 *
 * The defect: `toCreativeDecision` set `environment_decision` from
 * `chosen?.visual_language` — the exploration field — so a strategy-branch run in
 * control mode never emitted `Render it as:`. And the "answers the brief as"
 * line was gated on `strategy_route`, which only the strategy branch fills, so an
 * exploration run never named its direction. Both are the same defect class:
 * reading the field the OTHER branch fills.
 */

/** The fields that describe how the picture is EXECUTED, as opposed to logged. */
const EXECUTION_FIELDS = [
  "scene_definition",
  "environment_decision",
  "camera_decision",
  "lighting_decision",
  "composition_decision",
  "typography_decision",
] as const;

check("STRATEGY BRANCH — visual_language reaches environment_decision", () => {
  const strategyScenarios = PHASE0_SCENARIOS.filter(
    (s) => resolveSelectedDirection(s.judgment)?.source === "strategy"
  );
  assert.ok(strategyScenarios.length > 0, "no strategy-branch scenario to check");
  for (const s of strategyScenarios) {
    const resolved = resolveSelectedDirection(s.judgment)!;
    assert.strictEqual(resolved.appearance.length, 2, `${s.id}: the fixture itself lacks a visual_language`);
    const d = toCreativeDecision(s.judgment)!;
    assert.notStrictEqual(d.environment_decision, "", `${s.id}: environment_decision is empty on the strategy branch`);
    // The value must be the WINNER's, not something picked up elsewhere.
    const winner = s.judgment.strategy!.candidates.find((c) => c.route === s.judgment.strategy!.selected)!;
    assert.strictEqual(d.environment_decision, winner.visual_language, `${s.id}: environment_decision is not the winning candidate's`);
  }
});

check("STRATEGY BRANCH — 'Render it as:' reaches the prompt", () => {
  for (const s of PHASE0_SCENARIOS) {
    if (resolveSelectedDirection(s.judgment)?.source !== "strategy") continue;
    const { prompt } = composeArm(s, s.flags.on);
    assert.ok(/Render it as: \S/.test(prompt), `${s.id}: 'Render it as:' still missing from the prompt`);
    const winner = s.judgment.strategy!.candidates.find((c) => c.route === s.judgment.strategy!.selected)!;
    assert.ok(prompt.includes(`Render it as: ${winner.visual_language}`), `${s.id}: the rendering instruction is not the winner's`);
  }
});

check("EXPLORATION BRANCH — unchanged by the repair", () => {
  // The fix adds a fallback ahead of the exploration read. If that read were
  // displaced rather than preceded, this is where it would show.
  for (const s of PHASE0_SCENARIOS) {
    if (resolveSelectedDirection(s.judgment)?.source !== "exploration") continue;
    const d = toCreativeDecision(s.judgment)!;
    assert.strictEqual(d.environment_decision, s.judgment.directions[0].visual_language, `${s.id}: exploration's visual_language was displaced`);
    const { prompt } = composeArm(s, s.flags.on);
    assert.ok(/Render it as: \S/.test(prompt), `${s.id}: exploration lost its rendering instruction`);
  }
});

check("STRATEGY BRANCH — the route is named to the renderer", () => {
  const strategy = PHASE0_SCENARIOS.find((s) => resolveSelectedDirection(s.judgment)?.source === "strategy")!;
  const d = toCreativeDecision(strategy.judgment)!;
  const { prompt } = composeArm(strategy, strategy.flags.on);
  assert.ok(prompt.includes(`This image answers the brief as: ${d.strategy_route}`), "the route is not named");
});

check("EXPLORATION BRANCH — the direction is named, in direction vocabulary not route vocabulary", () => {
  // Closed in Phase 0.4. The gap was that `selected_direction` and
  // `creative_goal` were computed from both branches and read only by telemetry,
  // so an exploration run in control mode reached the renderer with a scene and
  // no statement of what that scene IS.
  //
  // The repair emits its own sentence rather than widening the route line,
  // because `run-evolution-tests.ts:2030` asserts a legacy judgment must not grow
  // a STRATEGY line — and it is right to: a direction is not a route.
  for (const s of PHASE0_SCENARIOS) {
    if (resolveSelectedDirection(s.judgment)?.source !== "exploration") continue;
    const { prompt } = composeArm(s, s.flags.on);
    assert.ok(
      /The creative direction chosen for this image: \S/.test(prompt),
      `${s.id}: the exploration branch does not name its direction`
    );
    assert.ok(
      !/This image answers the brief as: \S/.test(prompt),
      `${s.id}: an exploration run grew a strategy line — the 2030 contract is broken`
    );
    assert.ok(/\nSCENE: \S/.test(prompt), `${s.id}: exploration lost its scene`);
    assert.ok(/Render it as: \S/.test(prompt), `${s.id}: exploration lost its rendering instruction`);
  }
});

check("EQUIVALENCE — both branches produce a complete execution payload", () => {
  // The requirement in plain terms: a renderer must not be able to tell which
  // branch of the director it was, from what it was asked to execute.
  const byBranch: Record<string, string[]> = { strategy: [], exploration: [] };
  for (const s of PHASE0_SCENARIOS) {
    const source = resolveSelectedDirection(s.judgment)?.source;
    if (!source) continue;
    const d = toCreativeDecision(s.judgment)! as unknown as Record<string, string>;
    const missing = EXECUTION_FIELDS.filter((f) => !d[f]);
    if (missing.length) byBranch[source].push(`${s.id}: missing ${missing.join(", ")}`);
  }
  assert.deepStrictEqual(byBranch.strategy, [], `strategy branch payload incomplete:\n  ${byBranch.strategy.join("\n  ")}`);
  assert.deepStrictEqual(byBranch.exploration, [], `exploration branch payload incomplete:\n  ${byBranch.exploration.join("\n  ")}`);
});

check("EQUIVALENCE — the same judgment on either branch yields the same execution payload", () => {
  // The sharpest form of the test: one set of creative values, expressed once as
  // a strategy candidate and once as an explored direction. The execution payload
  // must be identical. Before the repair, `environment_decision` differed.
  const shared = {
    core_idea: "chai trên mặt gỗ, hạt rang rải quanh chân chai",
    visual_language: "ánh sáng xiên một phía, nhãn nửa trong bóng, mặt gỗ mòn sát ống kính",
    why: "khách quen đã tin quán; thứ họ chưa thấy là quy trình",
  };
  const reasoning = {
    camera: { choice: "85mm, chest height", reason: "r" },
    lighting: { choice: "one key, one bounce", reason: "r" },
    composition: { choice: "lệch trái một phần ba", reason: "r" },
    typography: { choice: "no drawn type", reason: "r" },
    colour: { choice: "product palette leads", reason: "r" },
  };

  const asStrategy = {
    directions: [],
    selected: "",
    selection_reason: "",
    strategy: {
      candidates: [{ route: "process evidence", core_idea: shared.core_idea, visual_language: shared.visual_language, why_this_route: shared.why, assessment: {} }],
      selected: "process evidence",
      selection_reason: shared.why,
      runner_up: "",
      why_not_runner_up: "",
      routes_offered: [],
      routes_developed: [],
    },
    reasoning,
  } as any;

  const asExploration = {
    directions: [{ name: "process evidence", core_idea: shared.core_idea, visual_language: shared.visual_language, why_it_fits: shared.why }],
    selected: "process evidence",
    selection_reason: shared.why,
    reasoning,
  } as any;

  const a = toCreativeDecision(asStrategy)! as unknown as Record<string, string>;
  const b = toCreativeDecision(asExploration)! as unknown as Record<string, string>;
  for (const f of EXECUTION_FIELDS) {
    assert.strictEqual(a[f], b[f], `${f} differs between the branches: strategy="${a[f]}" exploration="${b[f]}"`);
  }
  assert.strictEqual(a.selected_direction, b.selected_direction, "selected_direction differs between the branches");

  // And the same must hold of the prompt, not only the object.
  //
  // Scoped to the EXECUTION lines. The "answers the brief as" line is excluded
  // because it is strategy-only by an explicit contract (see the OPEN GAP test),
  // and folding it in here would make this test fail for a reason that has
  // nothing to do with execution.
  const req = { concept: "c", useCase: "poster", aspectRatio: "4:5" } as any;
  const execLines = (d: Record<string, string>) =>
    (applyCreativeDecision(req, d as any, false).hardRequirements || []).filter((h: string) => /^Render it as:/.test(h));
  assert.deepStrictEqual(
    execLines(a),
    execLines(b),
    `the emitted execution lines differ:\n  strategy=${JSON.stringify(execLines(a))}\n  exploration=${JSON.stringify(execLines(b))}`
  );
  assert.strictEqual(execLines(a).length, 1, "the rendering instruction is missing from both branches");

  // The concept block must match too — that is where SCENE and CAMERA travel.
  const conceptOf = (d: Record<string, string>) => applyCreativeDecision(req, d as any, false).concept;
  assert.strictEqual(conceptOf(a), conceptOf(b), "the rewritten concept differs between the branches");
});

check("A judgment with no visual_language still produces no invented one", () => {
  // The repair must not manufacture a value where the director gave none.
  const bare = {
    directions: [],
    selected: "",
    selection_reason: "",
    strategy: {
      candidates: [{ route: "r", core_idea: "a shelf", why_this_route: "w", assessment: {} }],
      selected: "r",
      selection_reason: "",
      runner_up: "",
      why_not_runner_up: "",
      routes_offered: [],
      routes_developed: [],
    },
  } as any;
  const d = toCreativeDecision(bare)!;
  assert.strictEqual(d.environment_decision, "", "a rendering instruction was invented");
  const req = applyCreativeDecision({ concept: "c" } as any, d, false);
  assert.ok(!(req.hardRequirements || []).some((h: string) => h.startsWith("Render it as:")), "an empty 'Render it as:' was emitted");
});

// ── stage 2 is declared, not run ──────────────────────────────────────────

check("The render checklist covers every scenario and every dimension", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "run-phase0-render-checklist.ts"),
    "utf-8"
  );
  assert.ok(/PHASE0_SCENARIOS/.test(src), "the checklist does not read the dataset");
  assert.ok(/PHASE0_DIMENSIONS/.test(src), "the checklist does not print the scorecard");
  assert.ok(!/generateImage|fetch\(/.test(src), "the checklist renders something — it must not");
});

check("The cross-check and the universal checks are stated", () => {
  assert.ok(PHASE0_CROSS_CHECK.steps.length >= 3, "the cross-check has no procedure");
  assert.ok(PHASE0_CROSS_CHECK.pass && PHASE0_CROSS_CHECK.fail, "the cross-check has no pass mark");
  assert.ok(PHASE0_UNIVERSAL_CHECKS.length >= 5, "too few universal checks");
});

check("Stable files were not touched", () => {
  // Phase 0.4 builds a benchmark. It may not modify the system it measures.
  const stable: string[][] = [
    ["evolution", "experiment", "CreativeDecision.ts"],
    ["evolution", "experiment", "CreativeDirectionResolver.ts"],
    ["evolution", "experiment", "NanoBananaPromptComposer.ts"],
    ["evolution", "ExperimentPipeline.ts"],
    ["compiler", "MasterPromptCompilerService.ts"],
  ];
  for (const rel of stable) {
    const p = path.join(process.cwd(), "lib", "image-engine", ...rel);
    assert.ok(fs.existsSync(p), `${rel.join("/")} is missing`);
    const src = fs.readFileSync(p, "utf-8");
    assert.ok(!/phase0-benchmark|Phase0Transmission|phase0-render-dataset/.test(src), `${rel.join("/")} imports the benchmark — the measurement is wired into the thing measured`);
  }
});

check("Every dimension has a question and an honest method label", () => {
  assert.strictEqual(PHASE0_DIMENSIONS.length, 7, "Phase 0.4 asks for seven dimensions");
  for (const d of PHASE0_DIMENSIONS) {
    assert.ok(d.question.length > 20, `${d.id} has no readable question`);
    assert.ok(["AUTOMATED", "PROXY", "NOT_MEASURABLE"].includes(d.prompt_method), `${d.id} has no method`);
    if (d.prompt_method === "PROXY") assert.ok(d.proxy_note, `${d.id} is a PROXY with no note saying what it counts`);
  }
  assert.strictEqual(
    PHASE0_DIMENSIONS.filter((d) => d.inverted).map((d) => d.id).join(),
    "ai_artifact_level",
    "the inverted dimension changed — every aggregate has to invert it"
  );
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
