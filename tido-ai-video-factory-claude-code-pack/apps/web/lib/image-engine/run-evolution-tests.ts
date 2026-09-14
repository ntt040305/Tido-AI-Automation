import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Safe evolution architecture.
 *
 * The property this whole layer is judged on is that production did not change,
 * so most of what follows tries to catch the ways a routing layer silently
 * becomes a behaviour change: defaults that are not safe, a flag file that fails
 * open, a router that can throw, an experiment that reaches someone it should
 * not, and a log that quietly accumulates customer content.
 *
 * The flag file is redirected to a temp path before anything is imported, so a
 * run of this suite can never read or write the real one.
 */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "tido-evo-"));
process.env.TIDO_FLAGS_PATH = path.join(TMP, "flags.json");
process.env.TIDO_EVOLUTION_LOG_PATH = path.join(TMP, "log.jsonl");
delete process.env.TIDO_PIPELINE_KILL_SWITCH;

/* eslint-disable @typescript-eslint/no-var-requires */
const { DEFAULT_FLAGS, normalize, readFlags, writeFlags } = require("./evolution/feature-flags");
const { PipelineRouter } = require("./evolution/PipelineRouter");
const { StablePipeline } = require("./evolution/StablePipeline");
const { resolveComponentVersions, PIPELINE_VERSIONS } = require("./evolution/pipeline-versions");
const { logGeneration, readLog, comparePipelines } = require("./evolution/ExperimentLogger");

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

console.log("\nSafe evolution architecture\n");

// ── Defaults are the safe values ──────────────────────────────────────────

check("With no flag file at all, everything resolves to stable", () => {
  if (fs.existsSync(process.env.TIDO_FLAGS_PATH!)) fs.unlinkSync(process.env.TIDO_FLAGS_PATH!);
  const flags = readFlags();
  assert.strictEqual(flags.active_pipeline, "stable");
  assert.strictEqual(flags.rollout_mode, "internal_only");
  assert.ok(Object.values(flags.features).every((v) => v === false), "a feature defaulted to on");
  assert.ok(Object.values(flags.components).every((v) => v === false), "a component defaulted to experiment");
  assert.strictEqual(PipelineRouter.decide({ requestId: "r1" }).pipeline, "stable");
});

check("A corrupt flag file fails closed, not open", () => {
  fs.writeFileSync(process.env.TIDO_FLAGS_PATH!, "{ this is not json", "utf-8");
  const flags = readFlags();
  assert.strictEqual(flags.active_pipeline, "stable", "corrupt file did not fall back to stable");
  assert.strictEqual(PipelineRouter.decide({ requestId: "r2" }).pipeline, "stable");
  fs.unlinkSync(process.env.TIDO_FLAGS_PATH!);
});

check("Unknown keys and wrong types cannot enable anything", () => {
  const flags = normalize({
    active_pipeline: "EXPERIMENT",        // wrong case — not the literal
    rollout_mode: "everyone",             // not a valid mode
    ab_percentage: "50",                  // string, not number
    features: { creative_exploration: "true", invented_feature: true },
    components: { prompt_compiler: 1 },
    something_else: { nested: true },
  });
  assert.strictEqual(flags.active_pipeline, "stable");
  assert.strictEqual(flags.rollout_mode, "internal_only");
  assert.strictEqual(flags.ab_percentage, 0);
  assert.strictEqual(flags.features.creative_exploration, false, '"true" as a string enabled a feature');
  assert.strictEqual((flags.features as any).invented_feature, undefined, "an unknown feature was accepted");
  assert.strictEqual(flags.components.prompt_compiler, false, "1 enabled a component");
});

check("A partial features object keeps every other flag off, not undefined", () => {
  // `{...defaults, ...stored}` would replace the whole features object and leave
  // the unlisted keys undefined, which is falsy but not false — and a call site
  // reading `flags.features.x` would get undefined rather than a decision.
  const flags = normalize({ features: { creative_exploration: true } });
  assert.strictEqual(flags.features.creative_exploration, true);
  assert.strictEqual(flags.features.visual_self_review, false, "an unlisted feature became undefined");
  assert.strictEqual(typeof flags.features.adaptive_prompt_length, "boolean");
});

// ── Rollback ──────────────────────────────────────────────────────────────

check("The kill switch overrides the file, the mode and every flag", () => {
  writeFlags({
    active_pipeline: "experiment",
    rollout_mode: "production",
    features: { creative_exploration: true, visual_self_review: true },
  });
  assert.strictEqual(readFlags().active_pipeline, "experiment", "setup failed");

  process.env.TIDO_PIPELINE_KILL_SWITCH = "true";
  const killed = readFlags();
  assert.strictEqual(killed.active_pipeline, "stable", "kill switch did not force stable");
  assert.ok(Object.values(killed.features).every((v) => v === false), "kill switch left a feature on");
  assert.strictEqual(PipelineRouter.decide({ requestId: "r3" }).pipeline, "stable");
  delete process.env.TIDO_PIPELINE_KILL_SWITCH;
});

check("Rollback needs one write and no deploy", () => {
  writeFlags({ active_pipeline: "experiment", rollout_mode: "production" });
  assert.strictEqual(PipelineRouter.decide({ requestId: "r4" }).pipeline, "experiment");
  writeFlags(DEFAULT_FLAGS);
  assert.strictEqual(PipelineRouter.decide({ requestId: "r4" }).pipeline, "stable", "rollback did not take effect");
});

check("Flags are re-read per request, so rollback is immediate", () => {
  // A cache here would make "instant rollback" mean "instant once the TTL
  // expires", which is not the same promise.
  writeFlags({ active_pipeline: "experiment", rollout_mode: "production" });
  const a = PipelineRouter.decide({ requestId: "r5" }).pipeline;
  writeFlags(DEFAULT_FLAGS);
  const b = PipelineRouter.decide({ requestId: "r5" }).pipeline;
  assert.strictEqual(a, "experiment");
  assert.strictEqual(b, "stable", "a second decision in the same process used a cached value");
});

// ── Routing modes ─────────────────────────────────────────────────────────

check("Internal-only reaches testers and nobody else", () => {
  writeFlags({
    active_pipeline: "experiment",
    rollout_mode: "internal_only",
    internal_testers: ["tester-alpha"],
  });
  assert.strictEqual(PipelineRouter.decide({ requestId: "x" }, { testerId: "tester-alpha" }).pipeline, "experiment");
  assert.strictEqual(PipelineRouter.decide({ requestId: "x" }, { testerId: "someone-else" }).pipeline, "stable");
  assert.strictEqual(PipelineRouter.decide({ requestId: "x" }).pipeline, "stable", "a request with no tester id got the experiment");
});

check("A/B splits by request id and is stable across retries", () => {
  writeFlags({ active_pipeline: "experiment", rollout_mode: "ab_testing", ab_percentage: 50 });
  const first = PipelineRouter.decide({ requestId: "gen_abc" }).pipeline;
  for (let i = 0; i < 20; i++) {
    assert.strictEqual(
      PipelineRouter.decide({ requestId: "gen_abc" }).pipeline,
      first,
      "the same request id resolved differently on a retry"
    );
  }
  // And the split is actually a split rather than a constant.
  const sample = Array.from({ length: 400 }, (_, i) => PipelineRouter.decide({ requestId: `gen_${i}` }).pipeline);
  const share = sample.filter((p) => p === "experiment").length / sample.length;
  assert.ok(share > 0.3 && share < 0.7, `50% split produced ${(share * 100).toFixed(0)}% on experiment`);
});

check("A/B with no request id goes to stable rather than guessing", () => {
  writeFlags({ active_pipeline: "experiment", rollout_mode: "ab_testing", ab_percentage: 100 });
  assert.strictEqual(PipelineRouter.decide({ requestId: undefined as any }).pipeline, "stable");
});

check("0% and 100% are honoured exactly", () => {
  writeFlags({ active_pipeline: "experiment", rollout_mode: "ab_testing", ab_percentage: 0 });
  const none = Array.from({ length: 200 }, (_, i) => PipelineRouter.decide({ requestId: `z${i}` }).pipeline);
  assert.ok(none.every((p) => p === "stable"), "0% still routed some traffic to the experiment");

  writeFlags({ active_pipeline: "experiment", rollout_mode: "ab_testing", ab_percentage: 100 });
  const all = Array.from({ length: 200 }, (_, i) => PipelineRouter.decide({ requestId: `z${i}` }).pipeline);
  assert.ok(all.every((p) => p === "experiment"), "100% left traffic on stable");
  writeFlags(DEFAULT_FLAGS);
});

// ── The stable path is untouched ──────────────────────────────────────────

check("StablePipeline is a pass-through with no logic of its own", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", "evolution", "StablePipeline.ts"), "utf-8");
  const body = src.slice(src.indexOf("export class StablePipeline"));
  // One statement: return the orchestrator call. Anything else here runs in
  // production and is therefore a change to production.
  assert.ok(
    /return SimpleImageGenerationOrchestratorService\.generateSimpleImage\(request, options\);/.test(body),
    "the stable adapter no longer forwards its arguments unchanged"
  );
  assert.ok(!/\bif\b|\btry\b|\bawait\b|console\./.test(body), "the stable adapter grew logic of its own");
});

check("The API route delegates and does not reimplement", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "image", "generate-simple", "route.ts"),
    "utf-8"
  );
  assert.ok(/PipelineRouter\.run\(simpleRequest/.test(src), "the route no longer calls the router");
  assert.ok(
    !/SimpleImageGenerationOrchestratorService/.test(src),
    "the route still calls the orchestrator directly as well"
  );
  assert.ok(/x-tido-tester-id/.test(src), "the tester id is not read from a header");
});

check("Experiment with no features enabled is stable behaviour", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  // Asserted as a property rather than as a literal expression: what matters is
  // that the no-feature path returns the stable call, not how the condition is
  // spelled. An earlier version of this test pinned `enabled.length === 0` and
  // failed the moment the condition was renamed, which is a test measuring
  // syntax rather than behaviour.
  assert.ok(/if \(!anyJudgment\)/.test(src), "the no-features case is not handled");
  assert.ok(/return StablePipeline\.run\(request, options\);/.test(src), "it does not fall through to stable");
  // And a failed or declined judgment must also fall back rather than reorder
  // the prompt for no reason.
  assert.ok(/if \(!judgment\)/.test(src), "a missing judgment does not fall back to stable");
  // Switching the pipeline over must be verifiable without output moving.
  writeFlags({ active_pipeline: "experiment", rollout_mode: "production" });
  const d = PipelineRouter.decide({ requestId: "n1" });
  assert.strictEqual(d.pipeline, "experiment");
  assert.deepStrictEqual(d.features_enabled, [], "a feature was on by default on the experiment pipeline");
  writeFlags(DEFAULT_FLAGS);
});

// ── Versions and logging ──────────────────────────────────────────────────

check("A component reports its experiment build only when its own flag is on", () => {
  const off = resolveComponentVersions("experiment", {});
  assert.strictEqual(off.prompt_compiler, "prompt_compiler_v4_stable", "experiment routing alone claimed the v5 build");
  const on = resolveComponentVersions("experiment", { prompt_compiler: true });
  assert.strictEqual(on.prompt_compiler, "prompt_compiler_v5_experiment");
  assert.strictEqual(on.creative_engine, "creative_engine_v4", "one flag moved an unrelated component");
  const stable = resolveComponentVersions("stable", { prompt_compiler: true });
  assert.strictEqual(stable.prompt_compiler, "prompt_compiler_v4_stable", "a stable run reported an experiment build");
});

check("Every generation records pipeline, versions, flags and outcome", () => {
  if (fs.existsSync(process.env.TIDO_EVOLUTION_LOG_PATH!)) fs.unlinkSync(process.env.TIDO_EVOLUTION_LOG_PATH!);
  const decision = PipelineRouter.decide({ requestId: "log-1" });
  const entry = logGeneration(
    decision,
    { success: true, generationId: "gen_1", status: "COMPLETED", diagnostics: { promptChars: 18000, referenceCount: 1 } } as any,
    1234
  );
  assert.ok(entry, "nothing was logged");
  const rows = readLog();
  assert.strictEqual(rows.length, 1);
  for (const field of ["pipeline", "pipeline_version", "component_versions", "features_enabled", "status", "duration_ms"]) {
    assert.ok(field in rows[0], `the log has no ${field}`);
  }
  assert.strictEqual(rows[0].pipeline_version, PIPELINE_VERSIONS.stable);
});

check("The log carries no brief, prompt or uploaded content", () => {
  // It accumulates for months and is read by whoever is debugging. Customer
  // content does not belong in it, and the cheapest way to keep that true is to
  // assert the shape rather than to remember.
  const decision = PipelineRouter.decide({ requestId: "log-2" });
  const entry = logGeneration(
    decision,
    {
      success: true,
      generationId: "gen_2",
      status: "COMPLETED",
      // Fields a future refactor might be tempted to log wholesale.
      compiledPrompt: "SECRET BRIEF TEXT",
      diagnostics: { promptChars: 100, referenceCount: 0, compiledPrompt: "SECRET BRIEF TEXT" },
    } as any,
    10
  );
  const serialized = JSON.stringify(entry);
  assert.ok(!/SECRET BRIEF TEXT/.test(serialized), "the log captured prompt text");
  const allowed = new Set([
    "ts", "generation_id", "pipeline", "pipeline_version", "routing_reason", "component_versions",
    "features_enabled", "rollout_mode", "status", "success", "duration_ms", "prompt_chars",
    "reference_count", "error_code",
  ]);
  for (const k of Object.keys(entry!)) {
    assert.ok(allowed.has(k), `unexpected field in the generation log: ${k}`);
  }
});

check("Comparison reports both pipelines and admits what it cannot see", () => {
  const cmp = comparePipelines(readLog());
  assert.ok("stable" in cmp && "experiment" in cmp);
  assert.ok(/quality is not in this file/i.test(cmp.note), "the comparison does not state its own limits");
});

// ── Data safety ───────────────────────────────────────────────────────────

check("The evolution layer touches nothing but generation", () => {
  const dir = path.join(process.cwd(), "lib", "image-engine", "evolution");
  const FORBIDDEN = /\b(?:user|account|billing|invoice|payment|permission|session|auth[a-z]*Token|history)\b/i;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf-8");
    // Comments say "accounts", "billing" and so on precisely to record that they
    // are out of scope; the check is on what the code does.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const hit = code.split("\n").find((l) => FORBIDDEN.test(l));
    assert.ok(!hit, `${f} references out-of-scope data: ${(hit || "").trim()}`);
  }
});

check("Routing failure falls back to stable instead of failing the request", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", "evolution", "PipelineRouter.ts"), "utf-8");
  assert.ok(/catch \(err: any\) \{[\s\S]{0,400}pipeline = "stable"/.test(src), "a router error does not fall back to stable");
});

// ── Internal tester access, and why it cannot reach production ─────────

check("The tester header is dev-only by construction, not by convention", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "features", "picture-engine", "services", "picture-engine.api.ts"),
    "utf-8"
  );

  // NODE_ENV is inlined by the bundler, so this comparison becomes a constant
  // false in a production build and the whole branch is eliminated. Production
  // safety should not depend on an operator remembering not to set a variable.
  assert.ok(
    /process\.env\.NODE_ENV === "production"\) return \{\}/.test(src),
    "the tester header is not gated on NODE_ENV"
  );

  // This file runs in the browser. Next.js only exposes NEXT_PUBLIC_-prefixed
  // variables to the client bundle, so a bare TIDO_TESTER_ID would read as
  // undefined here and the header would silently never be sent.
  assert.ok(/NEXT_PUBLIC_TIDO_TESTER_ID/.test(src), "the env var is not client-readable");
  assert.ok(
    !/process\.env\.TIDO_TESTER_ID\b/.test(src),
    "a server-only env var is being read from client code"
  );

  // An absent value must produce no header at all rather than the string
  // "undefined", which the router would treat as a tester id that is simply not
  // on the allow-list — harmless today, but it would put a junk value in logs.
  assert.ok(
    /testerId \? \{ "x-tido-tester-id": testerId \} : \{\}/.test(src),
    "an unset tester id does not omit the header cleanly"
  );
});

check("Both generation calls carry the header, and multipart keeps its boundary", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "features", "picture-engine", "services", "picture-engine.api.ts"),
    "utf-8"
  );
  const calls = src.split('fetch("/api/image/generate-simple"').slice(1);
  assert.strictEqual(calls.length, 2, `expected 2 generation calls, found ${calls.length}`);
  for (const [i, call] of calls.entries()) {
    assert.ok(
      /internalTesterHeaders\(\)/.test(call.slice(0, 400)),
      `generation call ${i + 1} does not send the tester header`
    );
  }
  // The multipart call must not set Content-Type by hand: the browser generates
  // the boundary, and overriding it corrupts the upload.
  const multipart = calls.find((c) => /body: formData/.test(c.slice(0, 400)))!;
  assert.ok(multipart, "the multipart call disappeared");
  assert.ok(
    !/"Content-Type"/.test(multipart.slice(0, 400)),
    "the multipart call now sets Content-Type and will break uploads"
  );
});

check("Routing is decided by the header, never by an account", () => {
  // The tester identity is caller-supplied and opaque on purpose. Reading it
  // from a user record would give the evolution layer a reason to touch account
  // data, which the data-safety rule forbids.
  const router = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "PipelineRouter.ts"),
    "utf-8"
  );
  const route = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "image", "generate-simple", "route.ts"),
    "utf-8"
  );
  assert.ok(/req\.headers\.get\("x-tido-tester-id"\)/.test(route), "the route no longer reads the header");
  assert.ok(/testerId\?: string/.test(router), "the router no longer accepts a tester id");
  assert.ok(
    !/getUser|currentUser|session\./i.test(router),
    "the router resolves identity from somewhere other than the request"
  );
});

// ── Creative Judgment V1 ───────────────────────────────────────

const { NanoBananaPromptComposer } = require("./evolution/experiment/NanoBananaPromptComposer");

const JUDGMENT = {
  directions: [
    { name: "Commercial Safe", core_idea: "a", visual_language: "b", why_it_fits: "c" },
    { name: "Premium Brand", core_idea: "hands around a cup", visual_language: "one-sided light", why_it_fits: "the brand name means home" },
    { name: "Creative Exploration", core_idea: "e", visual_language: "f", why_it_fits: "g" },
  ],
  selected: "Premium Brand",
  selection_reason: "it makes the brand name do visual work",
  rejected_reason: "Creative Exploration: a new cafe cannot afford to be mysterious",
  reasoning: {
    camera: { choice: "close, slightly above", reason: "overhead turns the cup into a diagram" },
    lighting: { choice: "single warm source from the left", reason: "shadow does the work a candle would" },
    composition: { choice: "central 60%", reason: "the square format is domestic" },
    typography: { choice: "quiet serif", reason: "type that competes suggests the brand distrusts its image" },
    colour: { choice: "deep umber", reason: "the colours already in the materials" },
  },
  generic_check: { flagged: ["steam"], justification: "cropped out at this framing", revised: false },
};

check("The three V1 flags exist and default to off", () => {
  for (const f of ["creative_exploration_v1", "creative_reasoning_v1", "anti_generic_check_v1"]) {
    assert.strictEqual((DEFAULT_FLAGS.features as any)[f], false, `${f} is not off by default`);
    const flags = normalize({ features: { [f]: true } });
    assert.strictEqual((flags.features as any)[f], true, `${f} cannot be enabled`);
    // And enabling one must not enable the others: they fail differently and
    // have to be diagnosable apart.
    const others = ["creative_exploration_v1", "creative_reasoning_v1", "anti_generic_check_v1"].filter((x) => x !== f);
    for (const o of others) {
      assert.strictEqual((flags.features as any)[o], false, `enabling ${f} also enabled ${o}`);
    }
  }
});

check("The three directions are described neutrally enough to all be winnable", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  // Measured defect: across 17 judgments on the first framing, "Commercial Safe"
  // was chosen 0 times. The options were not described neutrally — the safe one
  // read as "what most brands would arrive at" (an insult) against "takes a real
  // risk to be remembered" (the obvious answer). A selector that cannot pick one
  // of its three options is performing a ritual, not selecting.
  assert.ok(/clarity first/i.test(src), "the safe direction has no case made for it");
  assert.ok(/the safe one wins more often than creative people/i.test(src), "nothing counters the bias toward boldness");
  assert.ok(/Do not pick the boldest\s+direction as a habit/i.test(src), "habitual boldness is not warned against");
});

check("With no judgment the prompt is returned untouched", () => {
  // A reorder with nothing new to say is a change with no upside, so a failed
  // director call must produce the stable prompt rather than a reshuffled one.
  const prompt = "## ROLE\nr\n## FINAL OUTPUT\nf\n## CREATIVE INTENT\nc";
  assert.strictEqual(NanoBananaPromptComposer.compose(prompt, null), prompt);
});

check("Creative intent is lifted ahead of execution detail", () => {
  const prompt = [
    "## FINAL OUTPUT", "render one image",
    "## CONFLICT PRIORITY", "identity wins",
    "## CREATIVE INTENT", "a cafe opening",
    "## ROLE", "you are a renderer",
  ].join("\n");
  const out = NanoBananaPromptComposer.compose(prompt, JUDGMENT as any);
  const order = (out.match(/^## [A-Z].*$/gm) || []).map((h: string) => h.replace(/^## /, ""));
  const idx = (name: string) => order.findIndex((h: string) => h.includes(name));
  assert.ok(idx("ROLE") < idx("CREATIVE INTENT"), "ROLE did not lead");
  assert.ok(idx("CREATIVE INTENT") < idx("CONFLICT PRIORITY"), "intent did not precede execution rules");
  assert.ok(idx("CONFLICT PRIORITY") < idx("FINAL OUTPUT"), "FINAL OUTPUT did not come last");
});

check("Unranked sections keep the order the compiler chose", () => {
  // Guessing where an unknown section belongs is worse than leaving it put: a
  // new section is more likely to be a requirement than a rationale.
  const prompt = ["## ROLE", "r", "## ZEBRA", "z", "## AARDVARK", "a"].join("\n");
  const out = NanoBananaPromptComposer.compose(prompt, JUDGMENT as any);
  const order = (out.match(/^## [A-Z]+$/gm) || []);
  assert.ok(order.indexOf("## ZEBRA") < order.indexOf("## AARDVARK"), "unranked sections were reordered");
});

check("The judgment reaches the prompt as decisions with reasons", () => {
  const out = NanoBananaPromptComposer.compose("## ROLE\nr", JUDGMENT as any);
  assert.ok(/## CREATIVE DIRECTION — THE ONE CHOSEN/.test(out), "the chosen direction is absent");
  assert.ok(/CHOSEN DIRECTION: Premium Brand/.test(out));
  assert.ok(/hands around a cup/.test(out), "the chosen direction's idea is absent");
  // The rejected direction is carried on purpose: a renderer that knows an image
  // is deliberately quiet will not drift it back toward the safe version.
  assert.ok(/DELIBERATELY NOT DOING:/.test(out), "the rejected direction is absent");
  assert.ok(/## VISUAL DECISIONS — EACH WITH ITS REASON/.test(out));
  assert.strictEqual((out.match(/^  WHY: /gm) || []).length, 5, "not every decision carries a reason");
  assert.ok(/## WHY THIS IS NOT THE CATEGORY DEFAULT/.test(out));
});

check("A partial judgment emits only the sections it has", () => {
  const explorationOnly = { directions: JUDGMENT.directions, selected: "Premium Brand", selection_reason: "x" };
  const out = NanoBananaPromptComposer.compose("## ROLE\nr", explorationOnly as any);
  assert.ok(/## CREATIVE DIRECTION/.test(out), "exploration was dropped");
  assert.ok(!/## VISUAL DECISIONS/.test(out), "an empty reasoning section was emitted");
  assert.ok(!/## WHY THIS IS NOT/.test(out), "an empty generic-check section was emitted");
});

check("The experiment never reaches stable files", () => {
  // The whole safety claim: creative behaviour changed and no stable file moved.
  const dir = path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment");
  for (const f of fs.readdirSync(dir).filter((n: string) => n.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf-8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // It may import types and the shared LLM client; it must not import the
    // compiler, the brain or the orchestrator, which would couple the
    // experiment to code the stable pipeline owns.
    for (const forbidden of ["MasterPromptCompilerService", "marketing-brain", "SimpleImageGenerationOrchestratorService"]) {
      assert.ok(!code.includes(forbidden), `${f} imports ${forbidden}`);
    }
  }
});

// ── Creative Director Intelligence V2 ─────────────────────────────

const V2_JUDGMENT = {
  ...JUDGMENT,
  directions: JUDGMENT.directions.map((d: any) => ({
    ...d,
    emotional_objective: "quiet certainty",
    audience_reaction: "she recognises herself",
  })),
  brand: {
    personality: "precise without being cold",
    positioning: "the serum for people who already read ingredient lists",
    emotional_territory: "earned competence",
    audience_perception: "unknown, which is the problem",
    inferred: "positioning and perception were inferred; the brief named neither",
  },
  consumer: {
    viewer: "a woman who has bought four serums and believed two of them",
    first_feeling: "recognition, not aspiration",
    trust_driver: "skin texture left visible",
    desire_driver: "the sense that this one is not performing",
    intended_action: "remember the name",
    attention: { first_second: "her hand at her jaw", then: "the bottle she is holding", finally: "the name, small" },
  },
  semantics: [
    { element: "matte stone", communicates: "made to a tolerance", why_this_brand: "the claim is consistency, not opulence" },
    { element: "visible pores", communicates: "this is a real face", why_this_brand: "the audience distrusts retouching" },
  ],
  review: {
    strategically_justified: "yes",
    survives_logo_removal: "yes — the gesture carries it",
    differentiated_from_generic_ai: "no marble, no petals, no smile at nothing",
    solves_communication_goal: "yes",
    agency_would_approve: "yes",
    scores: { originality: 7, brand_fit: 8, audience_relevance: 8, commercial_strength: 7, ai_generic_risk: 3 },
    refined: true,
    what_changed: "dropped the silk backdrop",
  },
};

check("The five V2 flags exist, default off, and switch independently", () => {
  const V2 = [
    "creative_strategy_intelligence_v1",
    "consumer_psychology_v1",
    "brand_positioning_v1",
    "visual_semantics_v1",
    "creative_review_v1",
  ];
  for (const f of V2) {
    assert.strictEqual((DEFAULT_FLAGS.features as any)[f], false, `${f} is not off by default`);
    const flags = normalize({ features: { [f]: true } });
    assert.strictEqual((flags.features as any)[f], true, `${f} cannot be enabled`);
    for (const other of V2.filter((x) => x !== f)) {
      assert.strictEqual((flags.features as any)[other], false, `enabling ${f} also enabled ${other}`);
    }
    // And independent of the V1 three, so strategy can run without exploration.
    assert.strictEqual(flags.features.creative_exploration_v1, false, `${f} switched on a V1 flag`);
  }
});

check("Brand and audience are emitted before the visual decisions", () => {
  // Part 8's order: concept, product identity, brand positioning, then
  // composition/camera/lighting/typography. Brand precedes the elements because
  // it is the reason they were chosen.
  const out = NanoBananaPromptComposer.compose("## ROLE\nr", V2_JUDGMENT as any);
  const at = (name: string) => out.indexOf(name);
  assert.ok(at("## CREATIVE DIRECTION") >= 0, "the direction is absent");
  assert.ok(at("## BRAND POSITIONING") > at("## CREATIVE DIRECTION"), "brand did not follow the concept");
  assert.ok(at("## AUDIENCE") > at("## BRAND POSITIONING"), "audience did not follow brand");
  assert.ok(at("## VISUAL DECISIONS") > at("## AUDIENCE"), "the elements came before the reason for them");
  assert.ok(at("## WHY THESE ELEMENTS") > at("## VISUAL DECISIONS"), "semantics came before the decisions");
});

check("Inferred brand facts are labelled as inferred", () => {
  // A renderer cannot tell a claim from a guess, but a person reviewing the
  // prompt can, and a brand heritage nobody claimed has to be visible.
  const out = NanoBananaPromptComposer.compose("## ROLE\nr", V2_JUDGMENT as any);
  assert.ok(/INFERRED RATHER THAN GIVEN:/.test(out), "inference is presented as fact");
});

check("The reading order is emitted as three distinct beats", () => {
  const out = NanoBananaPromptComposer.compose("## ROLE\nr", V2_JUDGMENT as any);
  assert.ok(/FIRST SECOND: her hand at her jaw/.test(out));
  assert.ok(/THEN: the bottle/.test(out));
  assert.ok(/FINALLY: the name/.test(out));
});

check("Semantics say what an element means, not that it is popular", () => {
  const out = NanoBananaPromptComposer.compose("## ROLE\nr", V2_JUDGMENT as any);
  assert.ok(/MATTE STONE/.test(out), "the element is absent");
  assert.ok(/SAYS: made to a tolerance/.test(out), "the meaning is absent");
  assert.ok(/RIGHT HERE BECAUSE: the claim is consistency/.test(out), "the justification is absent");
  assert.ok(/Render the meaning, not the motif/.test(out), "the instruction to read it as meaning is absent");
});

check("The review scores are NOT emitted into the render prompt", () => {
  // They are a judgement about the work, not an instruction for making it. A
  // renderer handed "originality 7/10" has a number it cannot act on, and a
  // metric that leaks into the thing it measures gets aimed at.
  const out = NanoBananaPromptComposer.compose("## ROLE\nr", V2_JUDGMENT as any);
  assert.ok(!/originality/i.test(out), "a review score reached the prompt");
  assert.ok(!/ai_generic_risk/i.test(out), "a review score reached the prompt");
  assert.ok(!/agency_would_approve/i.test(out), "a review answer reached the prompt");
  // What DID survive is the revised direction the review produced.
  assert.ok(/## CREATIVE DIRECTION/.test(out), "the reviewed direction is absent");
});

check("A V2-only judgment still composes", () => {
  // Flags are independent, so brand reasoning must work with no exploration.
  const brandOnly = { directions: [], selected: "", selection_reason: "", brand: V2_JUDGMENT.brand };
  const out = NanoBananaPromptComposer.compose("## ROLE\nr", brandOnly as any);
  assert.ok(/## BRAND POSITIONING/.test(out), "a brand-only judgment produced nothing");
  assert.ok(!/## CREATIVE DIRECTION/.test(out), "an empty direction section was emitted");
  assert.ok(!/## VISUAL DECISIONS/.test(out), "an empty decisions section was emitted");
});

check("The director asks for a revision when a score is weak", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  // A score that triggers nothing is decoration. The threshold has to be stated
  // and the revision has to be required, not suggested.
  assert.ok(/below 6/.test(src), "no threshold is given for a weak score");
  assert.ok(/REVISE the\s+direction before answering/.test(src), "a weak score does not require a revision");
  assert.ok(
    /not to decorate it/.test(src),
    "nothing stops the model reporting a weak score and leaving the work alone"
  );
});

check("Industry is explicitly not allowed to determine style", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  assert.ok(/Industry does not determine style/.test(src), "the anti-template rule for brands is missing");
  assert.ok(/one house style/.test(src), "nothing warns against a per-category look");
  // And inference must be declared rather than dressed up as fact.
  assert.ok(/Do not invent a heritage/.test(src), "the model may invent brand history");
});

// ── Creative Director Control ──────────────────────────────────

const { toCreativeDecision, applyCreativeDecision, decisionTelemetry } = require("./evolution/experiment/CreativeDecision");

check("The control flag exists, defaults off, and is separate from the judgment flags", () => {
  assert.strictEqual(DEFAULT_FLAGS.features.creative_director_control_v1, false);
  const on = normalize({ features: { creative_director_control_v1: true } });
  assert.strictEqual(on.features.creative_director_control_v1, true);
  // Taking authority is a different risk from adding reasoning, so it must not
  // ride along with the judgment flags.
  assert.strictEqual(on.features.creative_exploration_v1, false, "control switched on a judgment flag");
  assert.strictEqual(on.features.creative_review_v1, false, "control switched on a judgment flag");
});

check("A judgment becomes a decision, and a judgment without a scene does not", () => {
  const d = toCreativeDecision(V2_JUDGMENT as any);
  assert.ok(d, "no decision produced from a complete judgment");
  assert.strictEqual(d.selected_direction, "Premium Brand");
  assert.strictEqual(d.scene_definition, "hands around a cup");
  assert.strictEqual(d.camera_decision, "close, slightly above");
  assert.ok(d.important_visual_elements.includes("matte stone"));

  // Without a scene there is nothing to take control WITH: a decision carrying
  // only a camera angle would override the brain's scene with nothing.
  const noScene = { ...V2_JUDGMENT, directions: [{ name: "x", core_idea: "", visual_language: "", why_it_fits: "" }], selected: "x" };
  assert.strictEqual(toCreativeDecision(noScene as any), null, "a sceneless judgment took control");
});

check("The decision is written into the brief, not appended after it", () => {
  const d = toCreativeDecision(V2_JUDGMENT as any)!;
  const req = applyCreativeDecision({ concept: "quán cà phê mới", useCase: "poster", aspectRatio: "1:1" } as any, d);
  // The client's own words survive at the top: brand names, product specifics
  // and untranslatable requirements live there.
  assert.ok(req.concept.startsWith("quán cà phê mới"), "the original concept was lost");
  assert.ok(/ART DIRECTION HAS BEEN DECIDED/.test(req.concept), "the direction did not reach the brief");
  assert.ok(/SCENE: hands around a cup/.test(req.concept));
  assert.ok(/CAMERA: close, slightly above/.test(req.concept));
  // And nothing else about the request moved.
  assert.strictEqual(req.useCase, "poster");
  assert.strictEqual(req.aspectRatio, "1:1");
});

check("An avoid-list may not remove product identity", () => {
  // A creative decision governs what the picture SHOWS. It has no authority over
  // what the product IS, and "avoid logo" would fight the identity lock the
  // whole engine exists to protect.
  const judgment = {
    ...V2_JUDGMENT,
    generic_check: { flagged: ["scattered petals", "the product logo", "marble"], justification: "x", revised: true },
  };
  const d = toCreativeDecision(judgment as any)!;
  const req = applyCreativeDecision({ concept: "c" } as any, d);
  // The avoid list lives in hardRequirements, not the concept: the concept has
  // a 1,000-character ceiling the stable validator enforces, and the avoid list
  // is the part that reads the same from either place.
  const hard = (req.hardRequirements || []).join(" | ");
  assert.ok(/scattered petals/.test(hard), `a legitimate avoid was dropped: ${hard}`);
  assert.ok(!/logo/i.test(hard), "the logo was added to the avoid list");
  assert.ok(
    !(req.hardRequirements || []).some((h: string) => /logo/i.test(h)),
    "a hard requirement tried to remove the logo"
  );
  assert.deepStrictEqual(decisionTelemetry(d).avoid_refused_as_identity, ["the product logo"]);
});

check("A survived generic check produces no avoid-list", () => {
  // An element that was flagged and then judged right for this brief must not
  // then be forbidden — that would contradict the judgment that kept it.
  const judgment = { ...V2_JUDGMENT, generic_check: { flagged: ["steam"], justification: "earned", revised: false } };
  const d = toCreativeDecision(judgment as any)!;
  assert.deepStrictEqual(d.avoid_elements, [], "a surviving element was added to the avoid list");
});

check("Control mode appends nothing, because the direction is already inside", () => {
  // The duplication the audit measured: the same scene stated twice reads as two
  // scenes to a renderer that cannot know they are the same one.
  const prompt = "## ROLE\nr\n## FINAL OUTPUT\nrender one image";
  const appended = NanoBananaPromptComposer.compose(prompt, V2_JUDGMENT as any, false);
  const controlled = NanoBananaPromptComposer.compose(prompt, V2_JUDGMENT as any, true);
  assert.ok(/## CREATIVE DIRECTION/.test(appended), "append mode stopped appending");
  assert.ok(!/## CREATIVE DIRECTION/.test(controlled), "control mode still appends the direction");
  assert.ok(!/## VISUAL DECISIONS/.test(controlled), "control mode still appends the decisions");
  // Reordering still happens; it is the duplication that stops.
  assert.ok(/## ROLE/.test(controlled) && /## FINAL OUTPUT/.test(controlled), "control mode dropped stable sections");
});

check("Control is wired so the rewritten request reaches the pipeline", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  // The ordering is the whole point: the director already ran, and its output
  // now goes in at the front instead of being appended at the back.
  // Matched on the assignment rather than the exact argument list: the call
  // gained a bridge parameter, and a test that pins an argument count fails on
  // every future parameter without anything having broken.
  assert.ok(/effectiveRequest = applyCreativeDecision\(request, decision/.test(src), "the decision is not applied");
  assert.ok(/StablePipeline\.run\(effectiveRequest,/.test(src), "the rewritten request never reaches the pipeline");
  // Matched on the prefix for the reason the comment above already gives: this
  // assertion pinned the closing paren and duly failed when a fourth parameter
  // was added, with nothing broken.
  assert.ok(/wrapProvider\(inner, judgment, controlled/.test(src), "control is not passed to the composer");
  // And a judgment that cannot produce a decision says so rather than pretending.
  assert.ok(/no scene in the judgment/.test(src), "a sceneless judgment silently does nothing");
});

// ── Asset Type Intelligence ──────────────────────────────────

const { assetContextFor, assetContextBrief } = require("./evolution/experiment/AssetContext");

const ASSET_TYPES = ["poster", "social_ad", "product_hero", "banner", "ugc_thumbnail"];

check("The asset flag exists, defaults off, and switches independently", () => {
  assert.strictEqual(DEFAULT_FLAGS.features.asset_type_intelligence_v1, false);
  const on = normalize({ features: { asset_type_intelligence_v1: true } });
  assert.strictEqual(on.features.asset_type_intelligence_v1, true);
  assert.strictEqual(on.features.creative_director_control_v1, false, "it switched on control");
  assert.strictEqual(on.features.creative_exploration_v1, false, "it switched on a judgment flag");
});

check("Every asset type has its own communication problem", () => {
  const seen = new Map<string, string>();
  for (const t of ASSET_TYPES) {
    const ctx = assetContextFor(t);
    assert.ok(ctx, `${t} has no context`);
    for (const field of ["communication_goal", "viewer_behavior", "visual_priority", "information_density", "typography_role", "layout_intent"]) {
      const v = (ctx as any)[field];
      assert.ok(typeof v === "string" && v.length > 30, `${t}.${field} is too thin`);
      const key = `${field}:${v}`;
      // Two formats sharing a field verbatim would mean the context is not
      // actually distinguishing them on that dimension.
      assert.ok(!seen.has(key), `${t} shares ${field} verbatim with ${seen.get(key)}`);
      seen.set(key, t);
    }
  }
});

check("An unrecognised asset type declines rather than defaulting to poster", () => {
  // Silently handing poster thinking to an unmapped format is how every
  // unhandled path in this engine ends up looking like a poster.
  assert.strictEqual(assetContextFor("mystery"), null);
  assert.strictEqual(assetContextFor(""), null);
  assert.strictEqual(assetContextFor(undefined), null);
  // Aliases still resolve.
  assert.strictEqual(assetContextFor("website_banner")!.asset_type, "banner");
  assert.strictEqual(assetContextFor("Product Hero")!.asset_type, "product_hero");
});

check("The context states a problem, never a layout", () => {
  // The failure this file exists to avoid: a poster entry reading "large
  // headline, centred hero, negative space" is a template with a label on it.
  const LAYOUT = /\b(?:top|bottom|left|right|upper|lower|centre|center)\s+(?:third|half|quarter)|\b\d+\s?%|\b\d+\s?(?:pt|px|mm)\b|\bserif\b|\bsans[- ]serif\b/i;
  for (const t of ASSET_TYPES) {
    const brief = assetContextBrief(assetContextFor(t)!);
    assert.ok(!LAYOUT.test(brief), `${t} prescribes geometry or a typeface: ${brief.match(LAYOUT)}`);
  }
});

check("The context says the format is the problem, not the answer", () => {
  // Without this line the model reads the block as a specification and produces
  // the same poster every time.
  const brief = assetContextBrief(assetContextFor("poster")!);
  assert.ok(/This is the communication problem, not the answer/.test(brief));
  assert.ok(/Several very different images solve it/.test(brief));
  assert.ok(/this product, this audience, this brand and this objective/.test(brief));
});

check("Typography role is a role, not a size", () => {
  // "can become part of the visual identity" is a possibility a designer may
  // refuse; "36pt bold" is not.
  for (const t of ASSET_TYPES) {
    const role = assetContextFor(t)!.typography_role;
    assert.ok(!/\b\d+\s?(?:pt|px)\b/i.test(role), `${t} prescribes a size`);
    assert.ok(!/\bserif\b|\bsans\b/i.test(role), `${t} prescribes a typeface`);
  }
  // And two formats that genuinely differ on text must not read alike.
  assert.notStrictEqual(
    assetContextFor("product_hero")!.typography_role,
    assetContextFor("banner")!.typography_role
  );
});

check("The context reaches the director instead of the bare label", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  // Measured before this change: zero references to any format name anywhere in
  // the director's instructions, with the format arriving as `FORMAT: poster`.
  assert.ok(/assetContext\?: string/.test(src), "the director cannot receive a context");
  assert.ok(
    /brief\.assetContext \? brief\.assetContext : brief\.useCase/.test(src),
    "the context does not replace the bare label"
  );
  assert.ok(/decide against THAT, not/.test(src), "nothing tells the director to decide against the format");
});

check("Typography joins the decision and travels by the only route it has", () => {
  const d = toCreativeDecision({
    ...V2_JUDGMENT,
    reasoning: { ...V2_JUDGMENT.reasoning, typography: { choice: "three words, set heavy", reason: "it is read small" } },
  } as any)!;
  assert.strictEqual(d.typography_decision, "three words, set heavy");
  const req = applyCreativeDecision({ concept: "c" } as any, d);
  // In the concept, not hardRequirements: CreativeInterpretationService has no
  // typography channel, so the only path to art direction runs through the
  // Marketing Brain, which reads the concept.
  assert.ok(/TYPOGRAPHY: three words, set heavy/.test(req.concept), "typography never reaches the brain");
});

check("The concept still fits the validator's ceiling with four decisions", () => {
  // 1,000 characters, enforced before generation starts. Four decisions at the
  // old widths crossed it.
  const long = "x".repeat(900);
  const d = toCreativeDecision({
    ...V2_JUDGMENT,
    directions: [{ name: "n", core_idea: long, visual_language: long, why_it_fits: long }],
    selected: "n",
    reasoning: {
      camera: { choice: long, reason: "" }, lighting: { choice: long, reason: "" },
      composition: { choice: long, reason: "" }, typography: { choice: long, reason: "" },
      colour: { choice: long, reason: "" },
    },
  } as any)!;
  const req = applyCreativeDecision({ concept: "a real brief with some length to it" } as any, d);
  assert.ok(req.concept.length <= 1000, `concept is ${req.concept.length} chars and will fail validation`);
});

// ── Creative Decision Bridge ─────────────────────────────────

check("The bridge flag exists, defaults off, and is separate from control", () => {
  assert.strictEqual(DEFAULT_FLAGS.features.creative_bridge_v1, false);
  const on = normalize({ features: { creative_bridge_v1: true } });
  assert.strictEqual(on.features.creative_bridge_v1, true);
  // Control decides WHICH scene is rendered; the bridge decides how much of the
  // reasoning behind it the renderer sees. They fail independently.
  assert.strictEqual(on.features.creative_director_control_v1, false, "the bridge switched on control");
});

check("Intelligence the director already produced now reaches the request", () => {
  // Measured before this existed: has_brand true, has_consumer true, semantics 5
  // on every run, and zero of them in the prompt.
  const d = toCreativeDecision(V2_JUDGMENT as any)!;
  assert.ok(d.brand_context, "brand was not carried");
  assert.ok(d.audience_context, "audience was not carried");
  assert.ok(d.element_meanings.length, "semantics were not carried");
  assert.ok(d.deliberately_avoided, "the rejected direction was not carried");

  const off = applyCreativeDecision({ concept: "c" } as any, d, false);
  const on = applyCreativeDecision({ concept: "c" } as any, d, true);
  const hardOff = (off.hardRequirements || []).join(" | ");
  const hardOn = (on.hardRequirements || []).join(" | ");

  assert.ok(!/behaves like/.test(hardOff), "the bridge fired while disabled");
  assert.ok(/behaves like precise without being cold/.test(hardOn), "brand did not reach the request");
  assert.ok(/The viewer: a woman who has bought four serums/.test(hardOn), "audience did not reach the request");
  assert.ok(/matte stone — made to a tolerance/.test(hardOn), "element meaning did not reach the request");
  assert.ok(/Deliberately not doing:/.test(hardOn), "the rejected direction did not reach the request");
});

check("The bridge carries no second scene", () => {
  // The defect that control mode exists to prevent: two descriptions of what the
  // picture shows. Nothing the bridge adds describes the frame.
  const d = toCreativeDecision(V2_JUDGMENT as any)!;
  const on = applyCreativeDecision({ concept: "c" } as any, d, true);
  const bridged = (on.hardRequirements || []).filter((h: string) =>
    /behaves like|Who this has to work on|present for what they mean|Deliberately not doing/.test(h)
  );
  assert.ok(bridged.length >= 3, "the bridge added nothing");
  for (const line of bridged) {
    assert.ok(!/^SCENE:|WHAT HAPPENS IN THE FRAME/.test(line), `the bridge carried a scene: ${line}`);
  }
  // And the scene statement count in the concept is unchanged.
  const off = applyCreativeDecision({ concept: "c" } as any, d, false);
  assert.strictEqual(on.concept, off.concept, "the bridge changed the concept");
});

check("Inference stays marked as inference across the bridge", () => {
  // A renderer cannot tell a stated fact from a guess; a person reviewing the
  // prompt can, and a brand history nobody claimed has to stay visible.
  const d = toCreativeDecision(V2_JUDGMENT as any)!;
  assert.ok(/inferred, not stated by the client/.test(d.brand_context), d.brand_context);
});

check("The bridge uses the channel that survives the optimizer", () => {
  // USER HARD REQUIREMENTS is P0 and was present in 5 of 5 measured prompts.
  // BRAND KNOWLEDGE is P1 and was present in 0 of 5, so routing brand there
  // would have looked correct and delivered nothing.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "compiler", "ProviderPromptOptimizer.ts"),
    "utf-8"
  );
  const p0 = src.slice(src.indexOf("P0_SECTIONS"), src.indexOf("P2_SECTIONS"));
  assert.ok(/"USER HARD REQUIREMENTS"/.test(p0), "the bridge's channel is no longer P0");
  assert.ok(!/"BRAND KNOWLEDGE"/.test(p0), "BRAND KNOWLEDGE became P0 and is now the better channel");
});

check("A judgment with no V2 intelligence bridges nothing rather than empty lines", () => {
  const bare = {
    directions: [{ name: "n", core_idea: "a hand around a cup", visual_language: "", why_it_fits: "" }],
    selected: "n", selection_reason: "",
  };
  const d = toCreativeDecision(bare as any)!;
  const on = applyCreativeDecision({ concept: "c" } as any, d, true);
  const hard = (on.hardRequirements || []).join(" | ");
  assert.ok(!/behaves like|Who this has to work on|present for what they mean/.test(hard),
    `empty bridge lines were emitted: ${hard}`);
});


// ── TYPOGRAPHY FOUNDATION CLEANUP V1 ──────────────────────────────────
//
// Two repairs, and a guard against the way the previous three prompt changes
// went wrong. Every prompt below is a fixture rather than a real render, so what
// these prove is that the rewrite does what it claims to a prompt of that shape
// \u2014 not that any particular brief produces that shape. The shape itself is
// asserted against the stable compiler source in the integrity test.

const { reconcileCopyRoles } = require("./evolution/experiment/CreativeDecision");

const TF_PRESET =
  "elegant high-contrast serif typography, refined proportions, premium editorial typesetting";

const TF_PROMPT = [
  "## ROLE",
  "You are rendering a commercial image.",
  "",
  "## USER HARD REQUIREMENTS",
  "1. Render it as: a quiet bathroom shelf at first light",
  "2. Thanh l\u1ecbch: " + TF_PRESET,
  "3. Do not include scattered petals in the image.",
  "",
  "## ART DIRECTION",
  "- CAMERA: eye level, close",
  "",
  "## TYPOGRAPHY & READABLE COPY",
  "The strings below are the only words that may appear in the image.",
  "",
  '"Ra m\u1eaft"  \u2014 supplied as: headline',
  '"Gi\u1ea3m 20%"  \u2014 supplied as: headline',
  "",
  "The roles above are what the client called each string, not an instruction about size or position.",
  "",
  "## CONFLICT PRIORITY",
  "User hard requirements outrank art direction.",
].join("\n");

const TF_JUDGMENT = {
  directions: [{ name: "n", core_idea: "a tube resting on stone", visual_language: "", why_it_fits: "" }],
  selected: "n",
  selection_reason: "",
  reasoning: {
    typography: {
      choice: "one line carrying the announcement, the figure set smaller beneath it",
      reason: "this format is read while deciding whether to buy, so the offer confirms a decision rather than making one",
    },
  },
  copy_roles: [
    { text: "Ra m\u1eaft", role: "HEADLINE", reason: "the launch is the news; the discount is not why this asset exists" },
    { text: "Gi\u1ea3m 20%", role: "OFFER", reason: "it removes the last objection once the product has been wanted" },
  ],
};

const tfFixes = (over: any = {}) => ({
  copyRoles: TF_JUDGMENT.copy_roles,
  typographyDirection: {
    choice: TF_JUDGMENT.reasoning.typography.choice,
    reason: TF_JUDGMENT.reasoning.typography.reason,
  },
  typographyUserPinned: false,
  ...over,
});

const tfHeadings = (p: string) =>
  p.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.trim());

check("Both typography cleanup flags default to off", () => {
  assert.strictEqual(DEFAULT_FLAGS.features.typography_roles_v1, false);
  assert.strictEqual(DEFAULT_FLAGS.features.typography_control_priority_v1, false);
});

check("With no fixes supplied the composer output is byte-identical to before", () => {
  const withoutArg = NanoBananaPromptComposer.compose(TF_PROMPT, TF_JUDGMENT, true);
  const withUndefined = NanoBananaPromptComposer.compose(TF_PROMPT, TF_JUDGMENT, true, undefined);
  assert.strictEqual(withoutArg, withUndefined);
  assert.ok(withoutArg.includes(TF_PRESET), "rollback did not restore the preset line");
  assert.ok(/supplied as: headline/.test(withoutArg), "rollback did not restore the stable roles");
});

check("Each string gets a distinct role, and the reason travels with it", () => {
  const out = NanoBananaPromptComposer.compose(TF_PROMPT, TF_JUDGMENT, true, tfFixes());
  assert.ok(/"Ra m\u1eaft"\s+\u2014 HEADLINE\./.test(out), "headline role missing");
  assert.ok(/"Gi\u1ea3m 20%"\s+\u2014 OFFER\./.test(out), "offer role missing");
  assert.ok(!/supplied as: headline/.test(out), "the stable role claim survived");
  assert.ok(out.includes("the last objection"), "the reason did not travel with the role");
  assert.ok(!out.includes("what the client called each string"),
    "the disclaimer contradicting the new roles was left in place");
});

check("A role attaches only to a string the prompt already authorized", () => {
  const invented = [
    { text: "Ra mat", role: "HEADLINE", reason: "diacritics dropped \u2014 this is new copy" },
    { text: "Mua ngay", role: "CTA", reason: "nobody authorized this string" },
  ];
  const out = NanoBananaPromptComposer.compose(TF_PROMPT, TF_JUDGMENT, true, tfFixes({ copyRoles: invented, typographyDirection: null }));
  assert.ok(!out.includes("Mua ngay"), "the director invented visible copy and it reached the prompt");
  assert.strictEqual(out, NanoBananaPromptComposer.compose(TF_PROMPT, TF_JUDGMENT, true),
    "nothing matched, so the prompt should have been left exactly as it was");
});

check("Two HEADLINEs cannot both survive \u2014 the second loses its role", () => {
  const both = [
    { text: "Ra m\u1eaft", role: "HEADLINE", reason: "first" },
    { text: "Gi\u1ea3m 20%", role: "HEADLINE", reason: "second" },
  ];
  const r = reconcileCopyRoles(both, ["Ra m\u1eaft", "Gi\u1ea3m 20%"]);
  assert.strictEqual(r.applied.size, 1);
  assert.deepStrictEqual(r.extra_headlines, ["Gi\u1ea3m 20%"]);
  const out = NanoBananaPromptComposer.compose(TF_PROMPT, TF_JUDGMENT, true, tfFixes({ copyRoles: both }));
  assert.strictEqual((out.match(/\u2014 HEADLINE/g) || []).length, 1,
    "the defect this phase fixes was reproduced by the fix");
});

check("A role outside the six is refused rather than printed", () => {
  const r = reconcileCopyRoles([{ text: "Ra m\u1eaft", role: "PRICE", reason: "x" }], ["Ra m\u1eaft"]);
  assert.strictEqual(r.applied.size, 0);
  assert.strictEqual(r.invalid_roles.length, 1);
});

check("All six roles are reachable", () => {
  const texts = ["a", "b", "c", "d", "e", "f"];
  const roles = ["HEADLINE", "SUBHEADLINE", "CTA", "OFFER", "PRODUCT_NAME", "SUPPORTING_TEXT"];
  const r = reconcileCopyRoles(texts.map((t, i) => ({ text: t, role: roles[i], reason: "r" })), texts);
  assert.deepStrictEqual([...r.applied.values()].map((a: any) => a.role), roles);
});

check("The preset the decision triggered is replaced by the decision", () => {
  const out = NanoBananaPromptComposer.compose(TF_PROMPT, TF_JUDGMENT, true, tfFixes());
  assert.ok(!out.includes(TF_PRESET), "the hard-coded serif instruction survived");
  assert.ok(out.includes("2. TYPOGRAPHY \u2014 decided for this brief:"),
    "the replacement did not land at the same position in the numbered list");
  assert.ok(out.includes("read while deciding whether to buy"),
    "the reasoning was dropped, which is the half of the loop that mattered");
  assert.ok(/^1\. Render it as/m.test(out) && /^3\. Do not include/m.test(out),
    "the surrounding hard requirements were disturbed");
});

check("A typography control the user pinned still beats the director", () => {
  const out = NanoBananaPromptComposer.compose(
    TF_PROMPT, TF_JUDGMENT, true, tfFixes({ typographyUserPinned: true })
  );
  assert.ok(out.includes(TF_PRESET), "a user's own click was overridden by a machine decision");
});

check("The repairs remove no section and add no section", () => {
  const before = NanoBananaPromptComposer.compose(TF_PROMPT, TF_JUDGMENT, true);
  const after = NanoBananaPromptComposer.compose(TF_PROMPT, TF_JUDGMENT, true, tfFixes());
  // The guard that was missing three times: a prompt change that passed its own
  // tests while the budget silently dropped a different section. Nothing here
  // can reach the budget \u2014 it runs later \u2014 but the assertion is cheap and the
  // absence of it is what let the last three regressions ship.
  assert.deepStrictEqual(tfHeadings(after), tfHeadings(before));
  assert.ok(after.includes("a quiet bathroom shelf"), "an unrelated hard requirement was lost");
  assert.ok(after.includes("- CAMERA: eye level"), "art direction was disturbed");
});

check("The copy line shape asserted here is the shape the stable compiler emits", () => {
  // If stable ever stops printing `"text"  \u2014 supplied as: role`, these repairs
  // silently stop matching and quietly do nothing. This fails loudly instead.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "compiler", "MasterPromptCompilerService.ts"),
    "utf-8"
  );
  assert.ok(src.includes("supplied as: ${role}"), "the compiler's copy-line format changed");
  assert.ok(src.includes("The roles above are what the client called each string"),
    "the compiler's role disclaimer changed");
  assert.ok(/## TYPOGRAPHY & READABLE COPY|TYPOGRAPHY & READABLE COPY/.test(src),
    "the copy section heading changed");
});

check("The typography presets are read from stable, not copied into the experiment", () => {
  const composer = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "NanoBananaPromptComposer.ts"),
    "utf-8"
  );
  assert.ok(/specFor\("typography"\)/.test(composer), "the preset list is no longer read from the spec");
  assert.ok(!composer.includes("high-contrast serif typography"),
    "a preset string was hard-coded into the experiment, so the two can drift apart");
});


console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch {}
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
