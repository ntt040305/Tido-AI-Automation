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
/**
 * Cases that return a promise, awaited before the suite reports.
 *
 * This used to call `fn()` and catch synchronously, which meant an async case
 * that threw was counted as a pass: the rejection escaped the try block after
 * the counter had already been incremented, and Node reported an unhandled
 * rejection once the summary had been printed. Thirteen Visual DNA cases were
 * written that way and every one of them was green without being checked.
 */
const pending: Promise<void>[] = [];

function record(name: string, err: any) {
  failed++;
  failures.push(`${name}: ${err?.message || String(err)}`);
  console.log(`  ✗ ${name}`);
  console.log(`    ${err?.message || String(err)}`);
}

function check(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result && typeof (result as any).then === "function") {
      pending.push(
        (result as Promise<void>).then(
          () => {
            passed++;
            console.log(`  ✓ ${name}`);
          },
          (err) => record(name, err)
        )
      );
      return;
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    record(name, err);
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
    // Durations only. The policy at the top of the logger permits counts and
    // durations for exactly this purpose, and the numeric assertion below is
    // what keeps the permission from widening into free-form diagnostics.
    "pipeline_timing", "provider_timing",
  ]);
  // The two timing maps may contain numbers and nothing else. Without this, the
  // whitelist entry above would be a door into the log for anything that fits
  // under those two names.
  for (const bag of ["pipeline_timing", "provider_timing"] as const) {
    const v = (entry as any)[bag];
    if (v === undefined) continue;
    for (const [k, n] of Object.entries(v)) {
      assert.strictEqual(typeof n, "number", `${bag}.${k} is not a duration`);
    }
  }
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

/**
 * Prescribed geometry: where a thing sits, or how big it is.
 *
 * The original pattern required a side word to be followed by "third", "half" or
 * "quarter", and so it stayed green for two years while
 * `banner.layout_intent` said "the subject and the message on separate sides".
 * A guard that never goes red is not checking anything, so the side-and-arrangement
 * vocabulary is matched on its own now.
 */
const LAYOUT =
  /\b(?:top|bottom|left|right|upper|lower|centre|center)\s+(?:third|half|quarter)\b|\b\d+\s?%|\b\d+\s?(?:pt|px|mm)\b|\bserif\b|\bsans[- ]serif\b|\b(?:separate|opposite|either)\s+sides?\b|\bside[- ]by[- ]side\b|\bon\s+the\s+(?:left|right)\b|\b(?:above|below|beneath|underneath)\s+(?:it|the\s+\w+)\b|\b(?:centred|centered)\b|\bstacked\b/i;

/**
 * Prescribed subject matter: what has to be IN the picture.
 *
 * A format may say what the viewer must end up understanding. It may not say
 * what the photograph contains — that is the product's, the brand's and the
 * audience's decision, and a format that answers it has become a template.
 * `ugc_thumbnail.visual_priority` reading "Human reaction and the hook first"
 * passed every check in this file while forcing a person into every UGC frame.
 */
const SUBJECT = /\b(?:human|person|people|model|face|hand|smil\w+|woman|man|child)\b/i;

/**
 * The fields that describe the PICTURE, and so may not name its contents.
 *
 * `viewer_behavior` and `information_density` are deliberately excluded: the
 * first describes the world the image is encountered in — "in a grid, against
 * real people's real photographs" is an accurate statement about a feed, not an
 * instruction to photograph a person — and the second is about quantity.
 * Running the subject guard over them would forbid describing the audience's
 * environment, which is the one place this file is supposed to be specific.
 */
const PRESCRIPTIVE_FIELDS = [
  "communication_goal",
  "visual_priority",
  "typography_role",
  "layout_intent",
];
const PROSE_FIELDS = [...PRESCRIPTIVE_FIELDS, "viewer_behavior", "information_density"];

check("The context states a problem, never a layout", () => {
  // The failure this file exists to avoid: a poster entry reading "large
  // headline, centred hero, negative space" is a template with a label on it.
  for (const t of ASSET_TYPES) {
    const ctx = assetContextFor(t, true)!;
    for (const field of PROSE_FIELDS) {
      const v = String((ctx as any)[field]);
      assert.ok(!LAYOUT.test(v), `${t}.${field} prescribes geometry or a typeface: ${v.match(LAYOUT)}`);
    }
  }
});

check("The context states a problem, never a subject", () => {
  for (const t of ASSET_TYPES) {
    const ctx = assetContextFor(t, true)!;
    for (const field of PRESCRIPTIVE_FIELDS) {
      const v = String((ctx as any)[field]);
      assert.ok(!SUBJECT.test(v), `${t}.${field} prescribes what must be in frame: ${v.match(SUBJECT)}`);
    }
  }
});

// ── AssetIntent V2 ───────────────────────────────────────────

check("The V2 flag exists, defaults off, and switches independently", () => {
  assert.strictEqual(DEFAULT_FLAGS.features.asset_intent_v2, false);
  const on = normalize({ features: { asset_intent_v2: true } });
  assert.strictEqual(on.features.asset_intent_v2, true);
  assert.strictEqual(on.features.asset_type_intelligence_v1, false, "it switched on the asset flag");
  assert.strictEqual(on.features.creative_exploration_v1, false, "it switched on a judgment flag");
});

check("V2 OFF returns exactly what it returned before the flag existed", () => {
  // The only claim that makes the flag a switch rather than a label.
  for (const t of ASSET_TYPES) {
    const oneArg = assetContextFor(t);
    const explicitV1 = assetContextFor(t, false);
    assert.deepStrictEqual(oneArg, explicitV1, `${t} differs between the default and false`);
    assert.strictEqual(oneArg.possible_strategies, undefined, `${t} leaked strategies into V1`);
    assert.strictEqual(oneArg.failure_modes, undefined, `${t} leaked failure modes into V1`);
    assert.strictEqual(
      assetContextBrief(oneArg),
      assetContextBrief(oneArg, { includeStrategies: false }),
      `${t} brief differs between no options and an explicit false`
    );
  }
});

check("V2 corrects the three entries that stated an answer", () => {
  const bannerV1 = assetContextFor("banner", false)!;
  const bannerV2 = assetContextFor("banner", true)!;
  assert.notStrictEqual(bannerV2.layout_intent, bannerV1.layout_intent, "banner was not corrected");

  const ugcV1 = assetContextFor("ugc_thumbnail", false)!;
  const ugcV2 = assetContextFor("ugc_thumbnail", true)!;
  assert.notStrictEqual(ugcV2.visual_priority, ugcV1.visual_priority, "ugc priority was not corrected");
  assert.notStrictEqual(ugcV2.typography_role, ugcV1.typography_role, "ugc type role was not corrected");

  // And nothing else moved. An override map that quietly rewrote a fourth field
  // would be the direct replacement this approach exists to avoid.
  let changed = 0;
  for (const t of ASSET_TYPES) {
    const a = assetContextFor(t, false)!;
    const b = assetContextFor(t, true)!;
    for (const field of PROSE_FIELDS) {
      if ((a as any)[field] !== (b as any)[field]) changed++;
    }
  }
  assert.strictEqual(changed, 3, `${changed} fields differ between V1 and V2, expected exactly 3`);
});

check("Every override key names a format that exists", () => {
  // A typo in the map would silently correct nothing.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "AssetContext.ts"),
    "utf-8"
  );
  const block = src.slice(src.indexOf("const INTENT_V2_OVERRIDES"), src.indexOf("const INTENT_V2_STRATEGIES"));
  const keys = [...block.matchAll(/^  ([a-z_]+): \{/gm)].map((m) => m[1]);
  assert.ok(keys.length > 0, "no override keys were found");
  for (const k of keys) {
    assert.ok(ASSET_TYPES.includes(k), `${k} is not an asset type`);
  }
});

check("V2 offers routes rather than assigning one", () => {
  for (const t of ASSET_TYPES) {
    const ctx = assetContextFor(t, true)!;
    const routes = ctx.possible_strategies || [];
    assert.ok(routes.length >= 5, `${t} offers only ${routes.length} routes, which reads as a default`);
    assert.strictEqual(new Set(routes).size, routes.length, `${t} repeats a route`);
    for (const r of routes) {
      assert.ok(r.length > 20, `${t} route is too thin to choose against: ${r}`);
      assert.ok(!/\b\d+\s?(?:%|pt|px|mm)\b/i.test(r), `${t} route carries a measurement: ${r}`);
      assert.ok(!/\bserif\b|\bsans[- ]serif\b/i.test(r), `${t} route names a typeface: ${r}`);
    }
  }
});

check("No route, and no failure mode, names an industry", () => {
  // A list reading "skincare: soft focus" would be the same defect one level up.
  const INDUSTRY =
    /\b(?:skincare|cosmetic\w*|beauty|fashion|apparel|food|beverage|f&b|automotive|tech\w*|electronics|pharma\w*|finance|banking|retail|hospitality|real\s?estate)\b/i;
  for (const t of ASSET_TYPES) {
    const ctx = assetContextFor(t, true)!;
    for (const s of [...(ctx.possible_strategies || []), ...(ctx.failure_modes || [])]) {
      assert.ok(!INDUSTRY.test(s), `${t} names an industry: ${s}`);
    }
  }
});

check("The hard-coded route is now one option among several", () => {
  // The two templates V2 removes must survive as CHOICES, not vanish: split is a
  // real answer to a banner and a human reaction is a real answer to a
  // thumbnail. What changed is that neither is the only answer.
  const banner: string[] = assetContextFor("banner", true)!.possible_strategies!;
  assert.ok(banner.some((s) => /split/i.test(s)), "split disappeared instead of becoming an option");
  assert.ok(
    banner.filter((s) => !/split/i.test(s)).length >= 4,
    "banner has no real alternative to split"
  );

  const ugc: string[] = assetContextFor("ugc_thumbnail", true)!.possible_strategies!;
  assert.ok(ugc.some((s) => /human/i.test(s)), "the human route disappeared instead of becoming an option");
  assert.ok(
    ugc.filter((s) => !SUBJECT.test(s)).length >= 4,
    "ugc has no route that does not require a person"
  );
});

check("Failure modes are failures, not instructions", () => {
  // "Needs a second sentence before it lands" can be tested against. "Use one
  // short line" would be this file writing the copy.
  const IMPERATIVE = /^(?:use|make|keep|put|place|add|show|avoid|ensure|include|set)\b/i;
  for (const t of ASSET_TYPES) {
    const modes = assetContextFor(t, true)!.failure_modes || [];
    assert.ok(modes.length >= 3, `${t} has only ${modes.length} failure modes`);
    for (const m of modes) {
      assert.ok(!IMPERATIVE.test(m.trim()), `${t} failure mode is an instruction: ${m}`);
      assert.ok(m.length > 15, `${t} failure mode is too thin: ${m}`);
    }
  }
});

check("The V2 brief carries the routes, and the V1 brief does not", () => {
  for (const t of ASSET_TYPES) {
    const v2 = assetContextBrief(assetContextFor(t, true)!, { includeStrategies: true });
    const v1 = assetContextBrief(assetContextFor(t, false)!);
    assert.ok(/ROUTES THAT LEGITIMATELY SOLVE THIS FORMAT/.test(v2), `${t} V2 brief has no routes`);
    assert.ok(/HOW THIS FORMAT FAILS/.test(v2), `${t} V2 brief has no failure modes`);
    assert.ok(!/ROUTES THAT LEGITIMATELY SOLVE/.test(v1), `${t} V1 brief leaked the routes`);
    // The closing line is load-bearing in both: without it the model reads the
    // block as a specification.
    for (const brief of [v1, v2]) {
      assert.ok(/This is the communication problem, not the answer/.test(brief));
    }
    // And the routes must not be presented as ranked.
    assert.ok(/not a ranking, and the first is not the default/.test(v2), `${t} presents routes as a ranking`);
  }
});

// ── CreativeDecisionContext ──────────────────────────────────

const {
  buildContext,
  toDirectorBrief,
  contextTelemetry,
} = require("./evolution/experiment/CreativeDecisionContext");

/** The literal `ExperimentPipeline` built before the context existed. */
function inlineBrief(request: any, assetCtx: any, assetBrief?: string) {
  const mc = request.marketingContext;
  return {
    assetContext: assetCtx ? assetBrief : undefined,
    concept: request.concept,
    contentMessage: request.contentMessage,
    brandName: request.brandName,
    useCase: request.useCase,
    aspectRatio: request.aspectRatio,
    industry: mc?.industry,
    objective: mc?.objective,
    audience: mc?.target_audience,
  };
}

/** A matrix wide enough that an omitted field cannot pass by coincidence. */
const CONTEXT_REQUESTS: any[] = [
  { concept: "c", useCase: "poster", aspectRatio: "1:1" },
  {
    concept: "Ra mắt kem dưỡng Centella",
    contentMessage: "Ra mắt\nGiảm 20%",
    brandName: "Bernard",
    useCase: "banner",
    aspectRatio: "16:9",
    marketingContext: {
      industry: "skincare",
      objective: "conversion",
      target_audience: "phụ nữ 25-35",
      target_channel: "facebook",
    },
  },
  { concept: "c", useCase: "mystery_format", aspectRatio: "4:5" },
  {
    concept: "c",
    useCase: "ugc_thumbnail",
    aspectRatio: "9:16",
    marketingContext: { objective: "awareness" },
    images: [{ role: "LOGO" }, { role: "PRODUCT" }],
  },
  {
    concept: "c",
    useCase: "product_hero",
    aspectRatio: "1:1",
    referenceImages: [{ reference_id: "REF_01", input_index: 0, mimeType: "image/png", buffer: Buffer.from("") }],
  },
  {
    concept: "c",
    useCase: "social_ad",
    aspectRatio: "1:1",
    marketingContext: { industry: "", target_channel: "tiktok" },
    images: [{ role: "INSPIRATION_REFERENCE" }],
  },
];

check("The context flag exists, defaults off, and switches independently", () => {
  assert.strictEqual(DEFAULT_FLAGS.features.creative_decision_context_v1, false);
  const on = normalize({ features: { creative_decision_context_v1: true } });
  assert.strictEqual(on.features.creative_decision_context_v1, true);
  assert.strictEqual(on.features.asset_intent_v2, false, "it switched on AssetIntent V2");
  assert.strictEqual(on.features.asset_type_intelligence_v1, false, "it switched on the asset flag");
});

check("EQUIVALENCE: the context produces the brief the inline literal produced", () => {
  // The whole claim of this phase. Every request is run through both paths, at
  // both asset-intent settings, and the two briefs must be indistinguishable —
  // including which keys are present and which are merely undefined.
  let compared = 0;
  for (const request of CONTEXT_REQUESTS) {
    for (const v2 of [false, true]) {
      for (const assetAware of [false, true]) {
        const assetCtx = assetAware ? assetContextFor(request.useCase, v2) : null;
        const assetBrief = assetCtx
          ? assetContextBrief(assetCtx, { includeStrategies: v2 })
          : undefined;
        const viaContext = toDirectorBrief(
          buildContext({ request, assetIntent: assetCtx, assetIntentBrief: assetBrief })
        );
        const viaInline = inlineBrief(request, assetCtx, assetBrief);
        assert.deepStrictEqual(
          viaContext,
          viaInline,
          `${request.useCase} (v2=${v2}, assetAware=${assetAware}) diverged`
        );
        assert.deepStrictEqual(
          Object.keys(viaContext).sort(),
          Object.keys(viaInline).sort(),
          `${request.useCase} emits a different key set`
        );
        compared++;
      }
    }
  }
  assert.strictEqual(compared, CONTEXT_REQUESTS.length * 4, "the matrix did not run in full");
});

check("The director's contract is untouched", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  // The nine fields the brief has always had, still exactly those nine.
  const iface = src.slice(
    src.indexOf("export interface DirectorBriefInput"),
    src.indexOf("export interface JudgmentFlags")
  );
  for (const field of [
    "assetContext?: string",
    "concept: string",
    "contentMessage?: string",
    "brandName?: string",
    "useCase?: string",
    "aspectRatio?: string",
    "industry?: string",
    "objective?: string",
    "audience?: string",
  ]) {
    assert.ok(iface.includes(field), `DirectorBriefInput lost ${field}`);
  }
  assert.ok(
    /public async judge\(\s*brief: DirectorBriefInput,\s*flags: JudgmentFlags\s*\)/.test(src),
    "the judge() signature changed"
  );
});

check("buildContext is pure: no mutation, and the same input twice agrees", () => {
  const request = JSON.parse(JSON.stringify(CONTEXT_REQUESTS[1]));
  const before = JSON.stringify(request);
  const a = buildContext({ request, assetIntent: null });
  const b = buildContext({ request, assetIntent: null });
  assert.deepStrictEqual(a, b, "two identical calls disagreed");
  assert.strictEqual(JSON.stringify(request), before, "the request was mutated");
});

check("The context copies user input rather than interpreting it", () => {
  const request = CONTEXT_REQUESTS[1];
  const ctx = buildContext({ request, assetIntent: null });
  assert.strictEqual(ctx.user.concept, request.concept);
  assert.strictEqual(ctx.user.content_message, request.contentMessage);
  assert.strictEqual(ctx.user.brand_name, request.brandName);
  assert.strictEqual(ctx.user.campaign_goal, request.marketingContext.objective);
  assert.strictEqual(ctx.user.audience, request.marketingContext.target_audience);
  assert.strictEqual(ctx.user.channel, request.marketingContext.target_channel);
  assert.strictEqual(ctx.user.use_case, request.useCase);
  assert.strictEqual(ctx.user.aspect_ratio, request.aspectRatio);
  // Nothing is defaulted when the client said nothing.
  const bare = buildContext({ request: CONTEXT_REQUESTS[0], assetIntent: null });
  for (const k of ["content_message", "brand_name", "campaign_goal", "audience", "channel", "industry"]) {
    assert.strictEqual((bare.user as any)[k], undefined, `${k} was invented`);
  }
});

check("Evidence reports the request, and infers nothing creative", () => {
  const withBoth = buildContext({ request: CONTEXT_REQUESTS[3], assetIntent: null });
  assert.strictEqual(withBoth.evidence.has_logo, true, "an explicit LOGO was missed");
  assert.strictEqual(withBoth.evidence.has_product_image, true, "an explicit PRODUCT was missed");
  assert.strictEqual(withBoth.evidence.asset_type_known, true);

  // An unroled attachment counts as product, because the adapter's documented
  // fallback will make it one. A logo has no such fallback.
  const unroled = buildContext({ request: CONTEXT_REQUESTS[4], assetIntent: null });
  assert.strictEqual(unroled.evidence.has_product_image, true, "the PRODUCT fallback was not reflected");
  assert.strictEqual(unroled.evidence.has_logo, false, "a logo was inferred from a roleless image");

  // An inspiration reference is neither.
  const inspiration = buildContext({ request: CONTEXT_REQUESTS[5], assetIntent: null });
  assert.strictEqual(inspiration.evidence.has_logo, false);
  assert.strictEqual(inspiration.evidence.has_product_image, false, "an inspiration image became the product");

  const none = buildContext({ request: CONTEXT_REQUESTS[0], assetIntent: null });
  assert.strictEqual(none.evidence.has_product_image, false);
  assert.strictEqual(none.evidence.has_logo, false);
});

check("asset_type_known is a fact about the request, not about the flags", () => {
  // Reported the same whether or not asset awareness is on, because the question
  // is whether this engine recognises the format.
  const known = buildContext({ request: CONTEXT_REQUESTS[1], assetIntent: null });
  assert.strictEqual(known.evidence.asset_type_known, true, "a known format read as unknown with the flag off");
  const unknown = buildContext({ request: CONTEXT_REQUESTS[2], assetIntent: null });
  assert.strictEqual(unknown.evidence.asset_type_known, false);
  assert.strictEqual(unknown.asset_intent, null);
});

check("industry is recorded as provenance and never branched on", () => {
  const stated = buildContext({ request: CONTEXT_REQUESTS[1], assetIntent: null });
  assert.strictEqual(stated.evidence.industry_supplied, true);
  assert.strictEqual(stated.user.industry, "skincare");

  // An empty string is not a stated industry.
  const empty = buildContext({ request: CONTEXT_REQUESTS[5], assetIntent: null });
  assert.strictEqual(empty.evidence.industry_supplied, false, "an empty industry counted as supplied");

  // And the file contains no industry vocabulary at all.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDecisionContext.ts"),
    "utf-8"
  );
  const body = src.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(
    !/\b(?:skincare|cosmetic\w*|beauty|fashion|food|beverage|automotive|pharma\w*|finance|retail)\b/i.test(body),
    "the context names an industry outside its comments"
  );
});

check("visual_dna is declared and always null in this phase", () => {
  for (const request of CONTEXT_REQUESTS) {
    const ctx = buildContext({ request, assetIntent: null });
    assert.ok("visual_dna" in ctx, "the field is not declared");
    assert.strictEqual(ctx.visual_dna, null, "something filled visual_dna early");
  }
});

check("The channel is carried but does not reach the director", () => {
  const request = CONTEXT_REQUESTS[1];
  const ctx = buildContext({ request, assetIntent: null });
  assert.strictEqual(ctx.user.channel, "facebook");
  const brief = toDirectorBrief(ctx);
  assert.ok(!("channel" in brief), "the channel leaked into the brief and changed what the director sees");
  assert.ok(!Object.values(brief).includes("facebook"), "the channel reached the director through another field");
});

check("Telemetry reports what was known without quoting the brief", () => {
  const assetCtx = assetContextFor("banner", true);
  const t = contextTelemetry(
    buildContext({
      request: CONTEXT_REQUESTS[1],
      assetIntent: assetCtx,
      assetIntentBrief: assetContextBrief(assetCtx!, { includeStrategies: true }),
    })
  );
  assert.strictEqual(t.asset_type, "banner");
  assert.strictEqual(t.routes_offered, 5);
  assert.deepStrictEqual(t.supplied, ["copy", "brand", "objective", "audience", "channel"]);
  // The client's own words must not be in the log.
  const serialised = JSON.stringify(t);
  assert.ok(!serialised.includes("Centella"), "the concept was logged");
  assert.ok(!serialised.includes("Giảm 20%"), "the copy was logged");
});

check("The pipeline keeps both paths and routes between them on the flag", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/const contextV1 = Boolean\(f\.creative_decision_context_v1\)/.test(src), "the flag is not read");
  assert.ok(/if \(contextV1\)/.test(src), "the flag does not route anything");
  assert.ok(
    /buildContext\(\{[\s\S]{0,140}assetIntent: assetCtx/.test(src),
    "the context path is not wired"
  );
  // The literal is still there to compare against.
  assert.ok(/audience: mc\?\.target_audience,/.test(src), "the inline path was deleted before it was proven");
});

// ── Visual DNA ───────────────────────────────────────────────

const {
  VisualDNAAnalyzer,
  summarizeVisualDNA,
  visualDNATelemetry,
} = require("./evolution/experiment/VisualDNAAnalyzer");

/** A provider that answers with whatever the test hands it, and records the call. */
function mockLLM(reply: string | (() => string)) {
  const calls: any[] = [];
  return {
    calls,
    provider: {
      async generateChatCompletion(messages: any[]) {
        calls.push(messages);
        return typeof reply === "function" ? reply() : reply;
      },
    },
  };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x09, 0x09]);

const GOOD_REPLY = JSON.stringify({
  observed: {
    product: {
      form: "a short cylinder with a flat shoulder and a screw cap of the same diameter",
      materials: ["a matte coated surface that scatters light rather than reflecting it"],
      palette: ["off-white", "pale sage"],
      finish: "matte, no specular highlight anywhere on the body",
      surface_detail: "a fine even grain, no visible seams",
      scale_cues: "fits within a closed hand",
      condition: "unopened, seal intact",
    },
    logo: {
      letterform: "narrow uprights with squared terminals and no tapering",
      weight: "light",
      geometry: "strictly rectilinear",
      colour: ["deep grey"],
      spacing: "wide, letters sit apart",
    },
  },
  inferred: [
    {
      claim: "the brand behaves quietly and expects to be examined rather than noticed",
      basis: "observed.product.finish",
      basis_quote: "matte, no specular highlight anywhere on the body",
      confidence: "medium",
    },
  ],
});

check("The Visual DNA flag exists, defaults off, and requires the context flag", () => {
  assert.strictEqual(DEFAULT_FLAGS.features.visual_dna_v1, false);
  const on = normalize({ features: { visual_dna_v1: true } });
  assert.strictEqual(on.features.visual_dna_v1, true);
  assert.strictEqual(on.features.creative_decision_context_v1, false, "it switched on the context flag");
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    /const visualDNAOn = contextV1 && Boolean\(f\.visual_dna_v1\)/.test(src),
    "the dependency on the context flag is not enforced"
  );
});

check("A usable answer becomes a Visual DNA with both branches separated", async () => {
  const m = mockLLM(GOOD_REPLY);
  const dna = await new VisualDNAAnalyzer(m.provider).analyze({
    images: [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }],
  });
  assert.ok(dna, "a good answer produced nothing");
  assert.ok(dna.observed.product?.finish, "the observed branch is empty");
  assert.strictEqual(dna.inferred.length, 1, "the grounded inference was dropped");
  assert.strictEqual(dna.provenance.derived_from_image, true);
  assert.strictEqual(dna.provenance.model_calls, 1);
  assert.strictEqual(dna.provenance.source_hashes.length, 1);
  assert.strictEqual(m.calls.length, 1, "more than one call was made");
});

check("FAILURE RETURNS NULL: every failure path, and never a default", async () => {
  const analyzer = (reply: any) =>
    new VisualDNAAnalyzer(
      typeof reply === "string"
        ? mockLLM(reply).provider
        : { async generateChatCompletion() { throw new Error("gateway down"); } }
    );
  const img = [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }];

  assert.strictEqual(await analyzer("not json at all").analyze({ images: img }), null, "garbage produced something");
  assert.strictEqual(await analyzer("{}").analyze({ images: img }), null, "an empty object produced something");
  assert.strictEqual(
    await analyzer(JSON.stringify({ inferred: [{ claim: "x" }] })).analyze({ images: img }),
    null,
    "inference with no observation produced something"
  );
  assert.strictEqual(await analyzer(null).analyze({ images: img }), null, "a thrown error produced something");
});

check("No image means no call and no result", async () => {
  const m = mockLLM(GOOD_REPLY);
  const a = new VisualDNAAnalyzer(m.provider);
  assert.strictEqual(await a.analyze({ images: [] }), null);
  assert.strictEqual(await a.analyze({ images: [{ role: "PRODUCT" }] }), null, "a roled image with no buffer was analysed");
  assert.strictEqual(await a.analyze({ images: [{ buffer: PNG, mimeType: "image/png" }] }), null, "an unroled image was analysed");
  assert.strictEqual(m.calls.length, 0, "the model was called with nothing to look at");
});

check("The analyzer holds no style table and no industry vocabulary", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "VisualDNAAnalyzer.ts"),
    "utf-8"
  );
  // Comments and the two rejection lists are where these words legitimately
  // appear; the executable body must not map a category to a look.
  const body = src
    .replace(/\/\*\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/const INDUSTRY_TERMS =[\s\S]*?;/, "")
    .replace(/const VERDICT_TERMS =[\s\S]*?;/, "")
    .replace(/const SYSTEM_PROMPT = `[\s\S]*?`;/, "");
  assert.ok(!/\b(?:skincare|cosmetic|beauty|fashion|automotive|pharma)\b/i.test(body), "an industry is named");
  assert.ok(!/\b(?:premium|luxury|minimalist|cinematic)\s*[:=]/i.test(body), "a style is mapped");
  assert.ok(!/defaultFallback|fallbackManifest/i.test(src), "a generic fallback was reintroduced");
});

check("An industry name is stripped from an observation", async () => {
  const reply = JSON.stringify({
    observed: {
      product: {
        form: "a short cylinder with a flat shoulder and a screw cap of the same diameter",
        finish: "a skincare aesthetic with soft edges",
      },
    },
    inferred: [],
  });
  const dna = await new VisualDNAAnalyzer(mockLLM(reply).provider).analyze({
    images: [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }],
  });
  assert.ok(dna, "the whole result was discarded when one field was bad");
  assert.ok(dna.observed.product.form, "the clean field was dropped too");
  assert.strictEqual(dna.observed.product.finish, undefined, "the industry name survived");
});

check("A verdict word is stripped from an observation", async () => {
  const reply = JSON.stringify({
    observed: {
      product: {
        form: "a short cylinder with a flat shoulder and a screw cap of the same diameter",
        finish: "a premium high-end feel",
        surface_detail: "a fine even grain, no visible seams",
      },
    },
    inferred: [],
  });
  const dna = await new VisualDNAAnalyzer(mockLLM(reply).provider).analyze({
    images: [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }],
  });
  assert.strictEqual(dna.observed.product.finish, undefined, "a verdict survived");
  assert.ok(dna.observed.product.surface_detail, "a clean field was dropped");
});

check("An identity instruction is refused", async () => {
  const reply = JSON.stringify({
    observed: {
      product: {
        form: "a short cylinder with a flat shoulder and a screw cap of the same diameter",
        condition: "the logo should be larger and the label must be moved",
      },
    },
    inferred: [],
  });
  const dna = await new VisualDNAAnalyzer(mockLLM(reply).provider).analyze({
    images: [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }],
  });
  assert.strictEqual(dna.observed.product.condition, undefined, "an identity instruction reached the result");
});

check("An inference that cites nothing observed is dropped", async () => {
  const reply = JSON.stringify({
    observed: {
      product: { form: "a short cylinder with a flat shoulder and a screw cap of the same diameter" },
    },
    inferred: [
      {
        claim: "the brand is decades old and family owned",
        basis: "observed.product.heritage",
        basis_quote: "a hand-finished bevel inherited from the founder",
        confidence: "high",
      },
      {
        claim: "the object is made to be held",
        basis: "observed.product.form",
        basis_quote: "a short cylinder with a flat shoulder",
        confidence: "medium",
      },
    ],
  });
  const dna = await new VisualDNAAnalyzer(mockLLM(reply).provider).analyze({
    images: [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }],
  });
  assert.strictEqual(dna.inferred.length, 1, "the ungrounded inference survived");
  assert.strictEqual(dna.inferred[0].claim, "the object is made to be held");
});

check("An inference resting on a field that was just stripped is also dropped", async () => {
  // The quote is checked against what SURVIVED filtering, not what was returned.
  const reply = JSON.stringify({
    observed: {
      product: {
        form: "a short cylinder with a flat shoulder and a screw cap of the same diameter",
        finish: "a luxury lacquered shell",
      },
    },
    inferred: [
      {
        claim: "the brand signals expense",
        basis: "observed.product.finish",
        basis_quote: "a luxury lacquered shell",
        confidence: "high",
      },
    ],
  });
  const dna = await new VisualDNAAnalyzer(mockLLM(reply).provider).analyze({
    images: [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }],
  });
  assert.strictEqual(dna.observed.product.finish, undefined);
  assert.strictEqual(dna.inferred.length, 0, "an inference outlived the observation it rested on");
});

check("Unchanged images are not re-analysed", async () => {
  const m = mockLLM(GOOD_REPLY);
  const a = new VisualDNAAnalyzer(m.provider);
  const images = [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }];
  const first = await a.analyze({ images });
  const second = await a.analyze({ images, existingDNA: first });
  assert.strictEqual(m.calls.length, 1, "the model was called again for the same image");
  assert.strictEqual(second, first, "the cached analysis was not returned");
  // A different image is a different question.
  await a.analyze({ images: [{ role: "PRODUCT", buffer: PNG2, mimeType: "image/png" }], existingDNA: first });
  assert.strictEqual(m.calls.length, 2, "a changed image reused a stale analysis");
});

check("The images are sent, as data URLs, and no more than three", async () => {
  const m = mockLLM(GOOD_REPLY);
  const many = [
    { role: "PRODUCT", buffer: PNG, mimeType: "image/png" },
    { role: "PRODUCT", buffer: PNG2, mimeType: "image/png" },
    { role: "LOGO", buffer: PNG, mimeType: "image/png" },
    { role: "LOGO", buffer: PNG2, mimeType: "image/png" },
    { role: "INSPIRATION_REFERENCE", buffer: PNG, mimeType: "image/png" },
    { role: "INSPIRATION_REFERENCE", buffer: PNG2, mimeType: "image/png" },
    { role: "STYLE", buffer: PNG, mimeType: "image/png" },
  ];
  await new VisualDNAAnalyzer(m.provider).analyze({ images: many });
  const user = m.calls[0][1];
  assert.ok(Array.isArray(user.content), "the call was text-only, so no image was read");
  const parts = user.content.filter((p: any) => p.type === "image_url");
  assert.strictEqual(parts.length, 3, `expected at most three images, sent ${parts.length}`);
  for (const p of parts) {
    assert.ok(/^data:image\/png;base64,/.test(p.image_url.url), "an image was not sent as a data URL");
    assert.strictEqual(p.image_url.detail, "high");
  }
});

check("The director summary is bounded, separated, and returns authority", async () => {
  const dna = await new VisualDNAAnalyzer(mockLLM(GOOD_REPLY).provider).analyze({
    images: [
      { role: "PRODUCT", buffer: PNG, mimeType: "image/png" },
      { role: "LOGO", buffer: PNG2, mimeType: "image/png" },
    ],
  });
  const summary = summarizeVisualDNA(dna);
  assert.ok(summary, "a valid analysis produced no summary");
  assert.ok(summary.length <= 900, `the summary is ${summary.length} characters`);
  assert.ok(/OBSERVED IN THE CLIENT'S OWN ATTACHMENTS/.test(summary), "observations are not labelled");
  assert.ok(/INFERRED FROM THOSE OBSERVATIONS/.test(summary), "inferences are not labelled");
  assert.ok(/a reading, not a fact/.test(summary), "inference is not marked as interpretation");
  assert.ok(
    /They do not say what the picture should be — that is still yours to decide/.test(summary),
    "the summary does not return authority to the director"
  );
  // A huge analysis still fits.
  const big = JSON.parse(JSON.stringify(dna));
  big.observed.product.form = "x".repeat(4000);
  const trimmed = summarizeVisualDNA(big);
  assert.ok(trimmed.length <= 900, `an oversized analysis produced ${trimmed.length} characters`);
  assert.ok(/still yours to decide/.test(trimmed), "trimming removed the closing line");
});

check("A discarded analysis produces no summary", () => {
  assert.strictEqual(summarizeVisualDNA(null), undefined);
  assert.strictEqual(
    summarizeVisualDNA({ observed: {}, inferred: [], provenance: { derived_from_image: false } } as any),
    undefined,
    "a manifest not derived from an image was summarised anyway"
  );
});

check("Telemetry reports what was read, never the analysis itself", async () => {
  const dna = await new VisualDNAAnalyzer(mockLLM(GOOD_REPLY).provider).analyze({
    images: [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }],
  });
  const t = visualDNATelemetry(dna);
  assert.strictEqual(t.analyzed, true);
  // Branches are what the model described; roles are what it was shown. They are
  // not the same list and the telemetry keeps them apart: a logo printed on the
  // product is visible in the product photograph, so a logo branch from a single
  // product image is a real reading rather than an invented one.
  assert.deepStrictEqual(t.branches, ["product", "logo"]);
  assert.deepStrictEqual(t.roles, ["PRODUCT"], "the roles claimed more than was sent");
  assert.strictEqual(t.inferences, 1);
  const s = JSON.stringify(t);
  assert.ok(!s.includes("matte"), "an observation was logged");
  assert.ok(!s.includes("quietly"), "an inference was logged");
  assert.deepStrictEqual(visualDNATelemetry(null), { analyzed: false });
});

check("FLAG OFF: the brief still has exactly the nine keys it had", async () => {
  // The equivalence Phase 2 established, re-asserted with Visual DNA in the file.
  for (const request of CONTEXT_REQUESTS) {
    const noDNA = toDirectorBrief(buildContext({ request, assetIntent: null }));
    assert.ok(!("visualDNA" in noDNA), "the key appeared with no analysis");
    assert.deepStrictEqual(Object.keys(noDNA).sort(), Object.keys(inlineBrief(request, null)).sort());
  }
  // And with an analysis present, the nine are untouched and one is added.
  const dna = await new VisualDNAAnalyzer(mockLLM(GOOD_REPLY).provider).analyze({
    images: [{ role: "PRODUCT", buffer: PNG, mimeType: "image/png" }],
  });
  const withDNA = toDirectorBrief(buildContext({ request: CONTEXT_REQUESTS[1], assetIntent: null, visualDNA: dna }));
  const without = inlineBrief(CONTEXT_REQUESTS[1], null);
  assert.ok(typeof withDNA.visualDNA === "string" && withDNA.visualDNA.length > 0);
  for (const k of Object.keys(without)) {
    assert.deepStrictEqual((withDNA as any)[k], (without as any)[k], `${k} changed when Visual DNA was added`);
  }
  assert.strictEqual(Object.keys(withDNA).length, Object.keys(without).length + 1);
});

check("The director accepts the field and prints it last", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  assert.ok(/visualDNA\?: string;/.test(src), "the director cannot receive an analysis");
  assert.ok(/brief\.visualDNA \?/.test(src), "the analysis is never printed into the brief");
  const lines = src.slice(src.indexOf("const briefLines = ["), src.indexOf("].filter(Boolean)"));
  assert.ok(
    lines.indexOf("brief.aspectRatio") < lines.indexOf("brief.visualDNA"),
    "the analysis is printed before the brief it informs"
  );
});

// ── Phase 3.1 · visual input reliability ─────────────────────

const { sniffImageMime } = require("./evolution/experiment/VisualDNAAnalyzer");

/** Real files from this repository's own renders, used as fixtures. */
const RENDERS = path.join(process.cwd(), "data", "generated", "image-renders");
const MISLABELLED_PNG = path.join(RENDERS, "imggen_3bf993771d1c0318", "output.png");
const REAL_WEBP = path.join(RENDERS, "e2e_with_header", "output.webp");

/** Captures what actually went on the wire. */
function capturingLLM(reply: string) {
  const sent: any[] = [];
  return {
    sent,
    provider: {
      async generateChatCompletion(messages: any[]) {
        sent.push(messages);
        return reply;
      },
    },
  };
}

function imageParts(sent: any[]) {
  return (sent[0]?.[1]?.content || []).filter((p: any) => p.type === "image_url");
}

check("The sniffer reads the format out of the bytes", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
  const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(6)]);
  const bmp = Buffer.concat([Buffer.from("BM"), Buffer.alloc(10)]);
  assert.strictEqual(sniffImageMime(jpeg), "image/jpeg");
  assert.strictEqual(sniffImageMime(png), "image/png");
  assert.strictEqual(sniffImageMime(webp), "image/webp");
  assert.strictEqual(sniffImageMime(gif), "image/gif");
  assert.strictEqual(sniffImageMime(bmp), "image/bmp");
  // Unknown bytes keep whatever the caller said: guessing twice is worse.
  assert.strictEqual(sniffImageMime(Buffer.alloc(32)), null);
  assert.strictEqual(sniffImageMime(Buffer.from([1, 2, 3])), null, "a runt buffer was classified");
  assert.strictEqual(sniffImageMime(null as any), null);
});

check("MALFORMED EXTENSION: a JPEG declared as PNG is corrected before it is sent", async () => {
  if (!fs.existsSync(MISLABELLED_PNG)) {
    // The fixture is repository output; its absence must not read as a pass.
    assert.fail(`fixture missing: ${MISLABELLED_PNG}`);
  }
  const buffer = fs.readFileSync(MISLABELLED_PNG);
  assert.strictEqual(buffer.toString("hex", 0, 3), "ffd8ff", "the fixture is no longer a mislabelled JPEG");

  const m = capturingLLM(GOOD_REPLY);
  await new VisualDNAAnalyzer(m.provider).analyze({
    images: [{ role: "PRODUCT", buffer, mimeType: "image/png" }],
  });
  const url = imageParts(m.sent)[0].image_url.url;
  assert.ok(!/^data:image\/png;/.test(url), "the wrong declared type was sent anyway");
  assert.ok(/^data:image\/jpe?g;/.test(url), `expected a JPEG data URL, got ${url.slice(0, 30)}`);
});

check("MALFORMED EXTENSION: correction survives when the file is too small to re-encode", async () => {
  // The gap normalisation alone leaves. `normalizeOne` returns
  // `input.mimeType || image/<format>` for anything already inside the budget,
  // so a small mislabelled file keeps its wrong label unless the sniff ran.
  const tinyJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
    Buffer.alloc(200, 0x20),
    Buffer.from([0xff, 0xd9]),
  ]);
  const m = capturingLLM(GOOD_REPLY);
  await new VisualDNAAnalyzer(m.provider).analyze({
    images: [{ role: "PRODUCT", buffer: tinyJpeg, mimeType: "image/png" }],
  });
  const url = imageParts(m.sent)[0].image_url.url;
  assert.ok(/^data:image\/jpe?g;/.test(url), `a small mislabelled file kept its label: ${url.slice(0, 30)}`);
});

check("A correctly declared image keeps its type", async () => {
  const buffer = fs.readFileSync(REAL_WEBP);
  const m = capturingLLM(GOOD_REPLY);
  await new VisualDNAAnalyzer(m.provider).analyze({
    images: [{ role: "PRODUCT", buffer, mimeType: "image/webp" }],
  });
  assert.ok(/^data:image\/webp;/.test(imageParts(m.sent)[0].image_url.url), "a correct type was changed");
});

check("PAYLOAD: a large attachment is shrunk before it is sent", async () => {
  const buffer = fs.readFileSync(MISLABELLED_PNG);
  const m = capturingLLM(GOOD_REPLY);
  await new VisualDNAAnalyzer(m.provider).analyze({
    images: [{ role: "PRODUCT", buffer, mimeType: "image/png" }],
  });
  const url = imageParts(m.sent)[0].image_url.url;
  const sentBytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64").length;
  assert.ok(
    sentBytes < buffer.length / 4,
    `sent ${sentBytes} of ${buffer.length} bytes — the normaliser was bypassed`
  );
  // And the whole request stays well under the 830 KB a raw attachment produced.
  assert.ok(url.length < 300000, `the data URL is ${url.length} characters`);
});

check("PAYLOAD: an image already inside the budget is not re-encoded", async () => {
  const buffer = fs.readFileSync(REAL_WEBP);
  const m = capturingLLM(GOOD_REPLY);
  await new VisualDNAAnalyzer(m.provider).analyze({
    images: [{ role: "PRODUCT", buffer, mimeType: "image/webp" }],
  });
  const url = imageParts(m.sent)[0].image_url.url;
  const sentBytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64").length;
  assert.strictEqual(sentBytes, buffer.length, "a file inside the budget was needlessly re-encoded");
});

check("An unnormalisable buffer is still sent rather than dropped", async () => {
  // Refusing to look at a photograph because it could not be shrunk turns a
  // working render into a silent one.
  const junk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64, 0x41)]);
  const m = capturingLLM(GOOD_REPLY);
  const dna = await new VisualDNAAnalyzer(m.provider).analyze({
    images: [{ role: "PRODUCT", buffer: junk, mimeType: "image/png" }],
  });
  assert.strictEqual(m.sent.length, 1, "the call was abandoned");
  assert.ok(imageParts(m.sent).length === 1, "the image was dropped");
  assert.ok(dna, "a usable answer was discarded because of the attachment");
});

check("The cache key describes what was sent, not what arrived", async () => {
  // Hashing the original would report a hit for two uploads that differ only in
  // a way normalisation removes, and a miss for the same image re-encoded.
  const buffer = fs.readFileSync(MISLABELLED_PNG);
  const m = capturingLLM(GOOD_REPLY);
  const a = new VisualDNAAnalyzer(m.provider);
  const images = [{ role: "PRODUCT", buffer, mimeType: "image/png" }];
  const first = await a.analyze({ images });
  const url = imageParts(m.sent)[0].image_url.url;
  const sent = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  assert.strictEqual(
    first.provenance.source_hashes[0],
    VisualDNAAnalyzer.hash(sent),
    "the hash describes the original rather than the prepared image"
  );
  const second = await a.analyze({ images, existingDNA: first });
  assert.strictEqual(m.sent.length, 1, "preparation is not deterministic, so the cache never hits");
  assert.strictEqual(second, first);
});

check("Stable is used, not copied: normalisation comes from the engine's own service", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "VisualDNAAnalyzer.ts"),
    "utf-8"
  );
  assert.ok(
    /import \{ ImageNormalizationService \} from "\.\.\/\.\.\/service\/ImageNormalizationService"/.test(src),
    "the analyzer no longer uses the engine's normaliser"
  );
  assert.ok(/ImageNormalizationService\.normalizeOne\(/.test(src), "normalizeOne is never called");
  assert.ok(!/require\("sharp"\)|from "sharp"/.test(src), "a second image pipeline was introduced");
});

// ── Phase 4 · strategy selection ─────────────────────────────

const { CreativeDirectorV1 } = require("./evolution/experiment/CreativeDirectorV1");
const { shuffleRoutes } = require("./evolution/experiment/AssetContext");
// `toCreativeDecision` and `applyCreativeDecision` are already bound above, where
// the control-mode cases use them.

const TRIAD = ["Commercial Safe", "Premium Brand", "Creative Exploration"];

/** Captures the system + user messages the director actually builds. */
function directorSpy(reply: string) {
  const sent: any[] = [];
  return {
    sent,
    provider: {
      async generateChatCompletion(messages: any[]) {
        sent.push(messages);
        return reply;
      },
    },
  };
}

const BANNER_ROUTES: string[] = assetContextFor("banner", true)!.possible_strategies!;

function strategyReply(route: string, opts: { evidence?: string; reason?: string } = {}) {
  const verdict = (stance: string) => ({
    stance,
    because: "short reason",
    evidence: opts.evidence ?? "phụ nữ 25-35 đang so sánh giá",
  });
  return JSON.stringify({
    strategy: {
      candidates: [
        {
          route,
          core_idea: "the tube stands on a shelf edge with the offer beside it",
          why_this_route: "the campaign has to be acted on, not remembered",
          assessment: {
            product: verdict("supports"),
            audience: verdict("supports"),
            objective: verdict("neutral"),
            brand: verdict("neutral"),
            channel: verdict("neutral"),
            feasibility: verdict("supports"),
          },
        },
      ],
      selected: route,
      selection_reason: opts.reason ?? "this tube is bought on price by phụ nữ 25-35 comparing options",
      runner_up: BANNER_ROUTES[1],
      why_not_runner_up: "it asks for a second look this placement never gets",
      routes_offered: BANNER_ROUTES,
      routes_developed: [route],
    },
  });
}

check("The strategy flag exists, defaults off, and requires AssetIntent V2", () => {
  assert.strictEqual(DEFAULT_FLAGS.features.creative_strategy_selection_v1, false);
  const on = normalize({ features: { creative_strategy_selection_v1: true } });
  assert.strictEqual(on.features.creative_strategy_selection_v1, true);
  assert.strictEqual(on.features.asset_intent_v2, false, "it switched on AssetIntent V2");
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    /assetCtx\?\.possible_strategies\?\.length/.test(src),
    "the flag does not depend on routes actually existing"
  );
  assert.ok(/no routes for this format — selection not applied/.test(src), "a routeless run is silent");
});

check("FLAG OFF: the director still asks for the three fixed directions", async () => {
  const m = directorSpy(JSON.stringify({ directions: [{ name: "Commercial Safe", core_idea: "x" }], selected: "Commercial Safe" }));
  await new CreativeDirectorV1(m.provider).judge(
    { concept: "c", useCase: "banner", routes: BANNER_ROUTES },
    { exploration: true, reasoning: false, antiGeneric: false }
  );
  const system = m.sent[0][0].content;
  for (const name of TRIAD) {
    assert.ok(system.includes(name), `${name} disappeared with the flag off`);
  }
  assert.ok(!/"strategy": \{/.test(system), "the strategy shape leaked with the flag off");
});

check("FLAG ON: the hardcoded strategy names are gone from the contract", async () => {
  const m = directorSpy(strategyReply(BANNER_ROUTES[0]));
  await new CreativeDirectorV1(m.provider).judge(
    { concept: "c", useCase: "banner", routes: BANNER_ROUTES },
    { exploration: true, reasoning: false, antiGeneric: false, strategySelection: true }
  );
  const system = m.sent[0][0].content;
  for (const name of TRIAD) {
    assert.ok(!system.includes(name), `${name} is still being emitted`);
  }
  assert.ok(/CHOOSE THE ROUTE, THEN COMMIT TO IT/.test(system), "the selection block was not used");
  assert.ok(/"strategy": \{/.test(system), "the strategy shape was not requested");
  assert.ok(!/PART 1 — EXPLORE BEFORE YOU COMMIT/.test(system), "both systems ran at once");
});

check("FLAG ON but no routes: the fixed directions are still used", async () => {
  // A format nobody mapped has nothing to choose between.
  const m = directorSpy(JSON.stringify({ directions: [{ name: "Commercial Safe", core_idea: "x" }] }));
  await new CreativeDirectorV1(m.provider).judge(
    { concept: "c", useCase: "mystery" },
    { exploration: true, reasoning: false, antiGeneric: false, strategySelection: true }
  );
  assert.ok(m.sent[0][0].content.includes("Commercial Safe"), "a routeless run lost its directions");
});

check("The routes are offered in a shuffled order the caller owns", () => {
  let n = 0;
  const rng = () => [0.99, 0.01, 0.5, 0.2, 0.8][n++ % 5];
  const shuffled = shuffleRoutes(BANNER_ROUTES, rng);
  assert.strictEqual(shuffled.length, BANNER_ROUTES.length, "a route was lost");
  assert.deepStrictEqual([...shuffled].sort(), [...BANNER_ROUTES].sort(), "a route was invented");
  assert.notDeepStrictEqual(shuffled, BANNER_ROUTES, "the order never changed");
  // The source list is untouched.
  assert.deepStrictEqual(assetContextFor("banner", true)!.possible_strategies, BANNER_ROUTES);
});

check("STRATEGY CHANGES with the brief: a different objective selects differently", async () => {
  // The director is asked twice with different briefs and answers differently.
  // What this proves is the plumbing, not the model's judgement: the selected
  // route reaches the decision unchanged, so two briefs cannot collapse to one.
  const a = toCreativeDecision(JSON.parse(strategyReply(BANNER_ROUTES[0])));
  const b = toCreativeDecision(JSON.parse(strategyReply(BANNER_ROUTES[3])));
  assert.notStrictEqual(a.strategy_route, b.strategy_route, "two selections collapsed to one");
  assert.strictEqual(a.strategy_route, BANNER_ROUTES[0]);
  assert.strictEqual(b.strategy_route, BANNER_ROUTES[3]);
  // And the scene follows the winner, not a fixed first direction.
  assert.ok(a.scene_definition.length > 0, "the winning candidate carried no scene");
});

check("SELECTION REASON must be specific, not reusable for another product", () => {
  const specific = toCreativeDecision(JSON.parse(strategyReply(BANNER_ROUTES[0])));
  const generic = toCreativeDecision(
    JSON.parse(strategyReply(BANNER_ROUTES[0], { reason: "clarity first, the message reads immediately" }))
  );
  // The check that has teeth: a reason naming nothing from the brief reads the
  // same for any product in the same format.
  const NAMES_THE_BRIEF = /tube|phụ nữ|25-35|price|Centella/i;
  assert.ok(NAMES_THE_BRIEF.test(specific.creative_goal), "the specific reason names nothing from the brief");
  assert.ok(!NAMES_THE_BRIEF.test(generic.creative_goal), "the generic fixture was not generic");
  assert.notStrictEqual(specific.creative_goal, generic.creative_goal);
});

check("EVIDENCE must exist in what the director was given", async () => {
  // Quoted from the brief: kept. Invented: downgraded to neutral and marked.
  const grounded = directorSpy(strategyReply(BANNER_ROUTES[0], { evidence: "phụ nữ 25-35 đang so sánh giá" }));
  const jg = await new CreativeDirectorV1(grounded.provider).judge(
    { concept: "phụ nữ 25-35 đang so sánh giá", useCase: "banner", routes: BANNER_ROUTES },
    { exploration: false, reasoning: false, antiGeneric: false, strategySelection: true }
  );
  assert.strictEqual(jg.strategy.candidates[0].assessment.product.stance, "supports", "quoted evidence was rejected");

  const invented = directorSpy(
    strategyReply(BANNER_ROUTES[0], { evidence: "the client said they want a heritage feel" })
  );
  const ji = await new CreativeDirectorV1(invented.provider).judge(
    { concept: "phụ nữ 25-35 đang so sánh giá", useCase: "banner", routes: BANNER_ROUTES },
    { exploration: false, reasoning: false, antiGeneric: false, strategySelection: true }
  );
  const p = ji.strategy.candidates[0].assessment.product;
  assert.strictEqual(p.stance, "neutral", "unquotable evidence kept its stance");
  assert.ok(/^unverified:/.test(p.evidence), "the downgrade was not marked");
  // A weak dimension must not discard the whole candidate.
  assert.strictEqual(ji.strategy.candidates.length, 1, "the candidate was thrown away");
  assert.strictEqual(ji.strategy.selected, BANNER_ROUTES[0], "the selection was lost");
});

check("A neutral verdict is left alone, and 'not supplied' is accepted", async () => {
  const m = directorSpy(strategyReply(BANNER_ROUTES[0], { evidence: "not supplied" }));
  const j = await new CreativeDirectorV1(m.provider).judge(
    { concept: "c", useCase: "banner", routes: BANNER_ROUTES },
    { exploration: false, reasoning: false, antiGeneric: false, strategySelection: true }
  );
  const a = j.strategy.candidates[0].assessment;
  assert.strictEqual(a.product.stance, "supports", "an honest 'not supplied' was punished");
  assert.strictEqual(a.objective.stance, "neutral", "a neutral verdict was altered");
});

check("PROMPT: only the chosen route, its idea and its reason travel", () => {
  const decision = toCreativeDecision(JSON.parse(strategyReply(BANNER_ROUTES[0])));
  const out = applyCreativeDecision({ concept: "c", useCase: "banner", aspectRatio: "1:1" } as any, decision, false);
  const all = [out.concept, ...(out.hardRequirements || [])].join("\n");
  assert.ok(all.includes(BANNER_ROUTES[0]), "the chosen route never reached the prompt");
  assert.ok(/answers the brief as:/.test(all), "the route is not stated as a decision");
  assert.ok(all.includes("this tube is bought on price"), "the selection reason did not travel");
  // And nothing the renderer has no use for.
  assert.ok(!all.includes("runner_up"), "a telemetry field leaked");
  assert.ok(!all.includes("works_against"), "an assessment leaked");
  assert.ok(!all.includes("routes_offered"), "the offered list leaked");
  for (const other of BANNER_ROUTES.filter((r) => r !== BANNER_ROUTES[0] && r !== BANNER_ROUTES[1])) {
    assert.ok(!all.includes(other), `an unchosen candidate leaked: ${other}`);
  }
});

check("Runs without strategy selection produce the decision they always did", () => {
  const legacy = toCreativeDecision({
    directions: [{ name: "Premium Brand", core_idea: "a quiet shelf", why_it_fits: "restraint", visual_language: "soft" }],
    selected: "Premium Brand",
    selection_reason: "it suits the brand",
  } as any);
  assert.strictEqual(legacy.selected_direction, "Premium Brand");
  assert.strictEqual(legacy.scene_definition, "a quiet shelf");
  assert.strictEqual(legacy.strategy_route, "", "a legacy judgment grew a strategy");
  const out = applyCreativeDecision({ concept: "c" } as any, legacy, false);
  assert.ok(
    !(out.hardRequirements || []).some((h: string) => /answers the brief as:/.test(h)),
    "a legacy run gained a strategy line"
  );
});

// ── Phase B · multi-product staging ──────────────────────────

const STAGING_REPLY = JSON.stringify({
  staging: {
    relationship: {
      relationship_type: "one order, three people sharing a table",
      strategic_reason: "the campaign sells the visit, not the drink, and this audience arrives in groups",
      visual_implication: "the frame has to look like a moment, not a product page",
      hierarchy_implication: "the newest drink leads; the other two place it in a real order",
    },
    hierarchy: "the cold brew leads, the other two sit back and slightly turned",
    grouping: "gathered close enough that the glasses overlap at the edges",
    shared_ground: "one wet counter receding to the upper right",
    light_direction: "a single window key from the left, cooling as it falls away",
    depth_order: "cold brew nearest, the fruit tea half behind it, the third furthest",
    interaction: "each glass sits in its own ring of condensation; two of them touch",
    reason: "a shared order has to look shared, and three equal glasses in a row never do",
  },
});

check("The staging flag exists, defaults off, and needs two products", () => {
  assert.strictEqual(DEFAULT_FLAGS.features.multi_product_staging_v1, false);
  const on = normalize({ features: { multi_product_staging_v1: true } });
  assert.strictEqual(on.features.multi_product_staging_v1, true);
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/productCount >= 2/.test(src), "the flag does not require a group");
  assert.ok(/single-product brief — staging not applied/.test(src), "a single-product run is silent");
});

// ── latency: the director beside the pipeline ────────────────

const PIPELINE_SRC = fs.readFileSync(
  path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
  "utf-8"
);

check("CONCURRENCY: outside control mode the director is not awaited first", () => {
  // Its only consumer is the composer, inside the wrapped provider, which runs
  // after the compiler has finished. Awaiting it before starting the pipeline
  // bought nothing and cost the whole call.
  const branch = PIPELINE_SRC.indexOf("if (!controlled) {");
  const seqAwait = PIPELINE_SRC.indexOf("const judgment = await new CreativeDirectorV1()");
  assert.ok(branch > 0, "the concurrent branch is gone");
  assert.ok(branch < seqAwait, "the sequential await now runs before the branch that avoids it");
  const concurrent = PIPELINE_SRC.slice(branch, seqAwait);
  assert.ok(/\.judge\(brief, judgmentFlags\)\s*\n\s*\.then\(/.test(concurrent), "the judgment is not started as a promise");
  assert.ok(!/await new CreativeDirectorV1\(\)/.test(concurrent), "the concurrent path still awaits the director");
  assert.ok(/StablePipeline\.run\(request, \{/.test(concurrent), "the pipeline is not started on the concurrent path");
});

check("CONCURRENCY: control mode stays sequential, because the dependency is real", () => {
  // In control mode the judgment rewrites the concept and the hard requirements
  // before the Marketing Brain reads them. That ordering is the feature.
  const seqAwait = PIPELINE_SRC.indexOf("const judgment = await new CreativeDirectorV1()");
  const apply = PIPELINE_SRC.indexOf("applyCreativeDecision(request, decision, bridge)");
  const stable = PIPELINE_SRC.indexOf("return await StablePipeline.run(effectiveRequest");
  assert.ok(seqAwait > 0 && apply > 0 && stable > 0, "the control path was restructured");
  assert.ok(seqAwait < apply, "the decision is applied before the judgment exists");
  assert.ok(apply < stable, "the pipeline starts before the request is rewritten");
});

check("CONCURRENCY: the composer still receives the judgment", () => {
  // The constraint that makes this an optimisation rather than a removal.
  assert.ok(
    /judgmentSource: CreativeJudgment \| null \| Promise<CreativeJudgment \| null>/.test(PIPELINE_SRC),
    "the wrapper no longer accepts a pending judgment"
  );
  assert.ok(/const judgment = await judgmentSource;/.test(PIPELINE_SRC), "the wrapper does not await it");
  const wrap = PIPELINE_SRC.slice(
    PIPELINE_SRC.indexOf("async generateImage(input: ProviderImageGenerationInput)"),
    PIPELINE_SRC.indexOf("return inner.generateImage(")
  );
  assert.ok(wrap.indexOf("await judgmentSource") < wrap.indexOf("NanoBananaPromptComposer.compose"), "the prompt is composed before the judgment arrives");
  assert.ok(/director_wait_ms/.test(PIPELINE_SRC), "what the wait cost is not reported");
});

check("CONCURRENCY: a rejected judgment cannot fail the render", async () => {
  // `judge` resolves null on every failure it knows about, and the concurrent
  // path catches the ones it does not. Either way the composer gets null and
  // returns the compiled prompt untouched.
  const { NanoBananaPromptComposer } = require("./evolution/experiment/NanoBananaPromptComposer");
  const prompt = "## ROLE\nMake a picture.\n## FINAL OUTPUT\nRender it.";
  assert.strictEqual(
    NanoBananaPromptComposer.compose(prompt, null, false, undefined),
    prompt,
    "a null judgment changed the prompt, so the early return was not equivalent"
  );
  const branch = PIPELINE_SRC.slice(
    PIPELINE_SRC.indexOf("if (!controlled) {"),
    PIPELINE_SRC.indexOf("const judgment = await new CreativeDirectorV1()")
  );
  assert.ok(/\.catch\(/.test(branch), "a rejection would surface as an unhandled promise");
});

check("CONCURRENCY: typography fixes are derived after the judgment lands", () => {
  // They were built from a judgment already in hand. On the concurrent path
  // there is none yet when the provider is wrapped.
  assert.ok(/const fixesFor = \(j: CreativeJudgment \| null\)/.test(PIPELINE_SRC), "fixes are not a function of the judgment");
  assert.ok(!/const fixes: TypographyFixes = \{/.test(PIPELINE_SRC), "the eager fixes object is back");
  assert.ok(/typographyUserPinned: Boolean\(pinned && pinned !== AUTO\)/.test(PIPELINE_SRC), "the user's pinned control stopped winning");
});

// ── latency: budget and fail-fast ────────────────────────────

check("LATENCY: a failure that a repeat cannot fix is not repeated", async () => {
  // A dead gateway used to cost the full timeout twice before falling back to
  // the prompt it would have produced immediately.
  for (const message of [
    "Marketing brain unavailable: fetch failed",
    "connect ECONNREFUSED 127.0.0.1:8317",
    "Request failed with status 429 rate limit exceeded",
    "401 unauthorized",
    "insufficient quota",
  ]) {
    let calls = 0;
    const provider = {
      async generateChatCompletion() {
        calls++;
        throw new Error(message);
      },
    };
    const j = await new CreativeDirectorV1(provider).judge(
      { concept: "c", useCase: "poster" },
      { exploration: true, reasoning: false, antiGeneric: false }
    );
    assert.strictEqual(j, null, `${message} produced a judgment`);
    assert.strictEqual(calls, 1, `${message} was retried ${calls} times`);
  }
});

check("LATENCY: a failure a repeat CAN fix is still repeated", async () => {
  // The retry exists for a measured reason and must survive: unparseable
  // responses and timeouts under load land on the second ask.
  let calls = 0;
  const unparseable = {
    async generateChatCompletion() {
      calls++;
      return "not json at all";
    },
  };
  await new CreativeDirectorV1(unparseable).judge(
    { concept: "c", useCase: "poster" },
    { exploration: true, reasoning: false, antiGeneric: false }
  );
  assert.strictEqual(calls, 2, `an unparseable answer was asked ${calls} times, expected 2`);

  let timeoutCalls = 0;
  const timedOut = {
    async generateChatCompletion() {
      timeoutCalls++;
      throw new Error("The operation was aborted due to timeout");
    },
  };
  await new CreativeDirectorV1(timedOut).judge(
    { concept: "c", useCase: "poster" },
    { exploration: true, reasoning: false, antiGeneric: false }
  );
  assert.strictEqual(timeoutCalls, 2, "a timeout stopped being retried");
});

check("LATENCY: the second ask still returns a judgment when it lands", async () => {
  let calls = 0;
  const flaky = {
    async generateChatCompletion() {
      calls++;
      if (calls === 1) return "```garbage```";
      return JSON.stringify({ directions: [{ name: "Commercial Safe", core_idea: "a shelf" }], selected: "Commercial Safe" });
    },
  };
  const j = await new CreativeDirectorV1(flaky).judge(
    { concept: "c", useCase: "poster" },
    { exploration: true, reasoning: false, antiGeneric: false }
  );
  assert.ok(j, "the recovered judgment was thrown away");
  assert.strictEqual(j.selected, "Commercial Safe");
});

check("LATENCY: the judgement timeout is a budget, not a literal", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  assert.ok(!/timeoutMs:\s*180000/.test(src), "the three-minute literal is back");
  assert.ok(/LLM_DIRECTOR_TIMEOUT_MS/.test(src), "the budget is not configurable");
  assert.ok(/timeoutMs: DIRECTOR_TIMEOUT_MS/.test(src), "the call does not use the budget");
});

check("LATENCY: the Visual DNA cache is actually consulted", () => {
  // It compared hashes from the first day and was handed null every time, so it
  // never hit once.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(!/existingDNA: null,\s*\}\);/.test(src), "the cache is still bypassed");
  assert.ok(/existingDNA: cached \?\? null/.test(src), "the cached analysis is not passed in");
  assert.ok(/VISUAL_DNA_CACHE\.set/.test(src), "nothing is ever stored");
  assert.ok(/VISUAL_DNA_CACHE_MAX/.test(src), "the cache has no bound");
});

check("ACTIVATION: the staging flag alone reaches the director", () => {
  // The path the other staging cases skip. They call `judge()` directly with
  // `multiProductStaging: true`, which proves the director behaves — and proves
  // nothing about whether the pipeline ever gets there. It did not: the flag was
  // resolved after the early return to stable, so a run with staging as its only
  // feature exited before the resolution and changed nothing.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  const resolved = src.indexOf("const stagingOn =");
  const assembled = src.indexOf("multiProductStaging: stagingOn");
  const evaluated = src.indexOf("const anyJudgment =");
  const earlyReturn = src.indexOf("return StablePipeline.run(request, options);");
  assert.ok(resolved > 0 && assembled > 0 && evaluated > 0 && earlyReturn > 0, "the wiring moved or was renamed");
  assert.ok(resolved < assembled, "staging is resolved after the flags are assembled");
  assert.ok(assembled < evaluated, "anyJudgment is evaluated before staging joins it");
  assert.ok(evaluated < earlyReturn, "the early return happens before anyJudgment");
  // And nothing may assign it back afterwards, which is how it was wrong before.
  assert.ok(
    !/judgmentFlags\.multiProductStaging\s*=/.test(src),
    "a late assignment is back, so the value read by anyJudgment is stale"
  );
});

check("ACTIVATION: the single-product notice is reachable", () => {
  // It sat after the early return too, so a flag that did nothing also said
  // nothing.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    src.indexOf("single-product brief — staging not applied") <
      src.indexOf("return StablePipeline.run(request, options);"),
    "the notice is unreachable on a stable exit"
  );
});

check("ACTIVATION: strategy selection joins anyJudgment before it is read", () => {
  // The same defect as staging, in the same function, found by the Phase 4.1
  // benchmark rather than by a render: the benchmark calls `judge()` directly,
  // so it proved the director selects and proved nothing about whether the
  // pipeline reaches it. Enabling `creative_strategy_selection_v1` alone exited
  // to stable before the assignment ran.
  //
  // Unlike staging this one keeps its assignment statement, because it reads the
  // asset context and the asset context reads the request. So the assertion is
  // about order, not about absence: the assignment has to happen, and it has to
  // happen above the line that reads it.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  const assetCtx = src.indexOf("const assetCtx =");
  const resolved = src.indexOf("const strategyOn =");
  const assigned = src.indexOf("judgmentFlags.strategySelection = strategyOn");
  const evaluated = src.indexOf("const anyJudgment =");
  const earlyReturn = src.indexOf("return StablePipeline.run(request, options);");
  assert.ok(
    assetCtx > 0 && resolved > 0 && assigned > 0 && evaluated > 0 && earlyReturn > 0,
    "the wiring moved or was renamed"
  );
  assert.ok(assetCtx < resolved, "strategyOn is resolved before the asset context it reads");
  assert.ok(resolved < assigned, "the flag is assigned before strategyOn exists");
  assert.ok(assigned < evaluated, "anyJudgment reads the flag before it is assigned");
  assert.ok(evaluated < earlyReturn, "the early return happens before anyJudgment");
  // Nothing may set it a second time further down, which is how it was wrong.
  assert.strictEqual(
    src.split("judgmentFlags.strategySelection =").length - 1,
    1,
    "assigned more than once, so which value anyJudgment saw is no longer decidable"
  );
});

check("ACTIVATION: the no-routes notice is reachable", () => {
  // It sat below the early return with the assignment, so a format with no
  // routes produced a silent no-op under a flag the operator believed was on.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    src.indexOf("no routes for this format — selection not applied") <
      src.indexOf("return StablePipeline.run(request, options);"),
    "the notice is unreachable on a stable exit"
  );
});

check("ACTIVATION: reading the asset context early cannot reach the network", () => {
  // Moving `assetContextFor` above the early return only stays free if it stays
  // a table lookup. If it ever starts awaiting something, every run that exits
  // to stable pays for it, including runs with no features on at all.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "AssetContext.ts"),
    "utf-8"
  );
  assert.ok(!/await/.test(src), "AssetContext now awaits something");
  assert.ok(!/fetch\s*\(/.test(src), "AssetContext now performs a request");
  assert.ok(
    /export function assetContextFor/.test(src),
    "assetContextFor is no longer a plain synchronous function"
  );
});

check("product_count reports attachments without double counting", () => {
  const one = buildContext({ request: { concept: "c", useCase: "poster", images: [{ role: "PRODUCT" }] } as any, assetIntent: null });
  assert.strictEqual(one.evidence.product_count, 1);
  const three = buildContext({
    request: { concept: "c", useCase: "poster", images: [{ role: "PRODUCT" }, { role: "PRODUCT" }, { role: "PRODUCT_REFERENCE" }] } as any,
    assetIntent: null,
  });
  assert.strictEqual(three.evidence.product_count, 3);
  // The two carriers hold one upload set, not two. Summing would report six.
  const adapted = buildContext({
    request: {
      concept: "c",
      useCase: "poster",
      images: [{ role: "PRODUCT" }, { role: "PRODUCT" }, { role: "PRODUCT" }],
      referenceImages: [{ role: "PRODUCT" }, { role: "PRODUCT" }, { role: "PRODUCT" }],
    } as any,
    assetIntent: null,
  });
  assert.strictEqual(adapted.evidence.product_count, 3, "the same uploads were counted twice");
  // A logo is never a product.
  const logoOnly = buildContext({ request: { concept: "c", useCase: "poster", images: [{ role: "LOGO" }] } as any, assetIntent: null });
  assert.strictEqual(logoOnly.evidence.product_count, 0);
});

check("A single-product brief is never asked about relationships", async () => {
  const m = directorSpy(STAGING_REPLY);
  await new CreativeDirectorV1(m.provider).judge(
    { concept: "c", useCase: "poster", productCount: 1 },
    { exploration: false, reasoning: false, antiGeneric: false, multiProductStaging: true }
  );
  const system = m.sent[0][0].content;
  assert.ok(!/THESE PRODUCTS ARE IN ONE PHOTOGRAPH TOGETHER/.test(system), "a lone product was asked why it is a group");
  assert.ok(!/"staging": \{/.test(system), "the staging shape was requested for one product");
});

check("Two or more products are asked why they belong together", async () => {
  const m = directorSpy(STAGING_REPLY);
  await new CreativeDirectorV1(m.provider).judge(
    { concept: "c", useCase: "social_ad", productCount: 3 },
    { exploration: false, reasoning: false, antiGeneric: false, multiProductStaging: true }
  );
  const system = m.sent[0][0].content;
  const user = m.sent[0][1].content;
  assert.ok(/THESE PRODUCTS ARE IN ONE PHOTOGRAPH TOGETHER/.test(system), "the question was not asked");
  assert.ok(/"relationship_type"/.test(system), "the relationship was not requested");
  assert.ok(/PRODUCTS ATTACHED: 3/.test(user), "the count never reached the director");
  // Every physical fact the failing render lacked.
  for (const f of ["shared_ground", "light_direction", "depth_order", "interaction", "hierarchy", "grouping"]) {
    assert.ok(system.includes(f), `${f} is not requested`);
  }
});

check("The relationship vocabulary is offered as examples, never as a list to pick from", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  const block = src.slice(src.indexOf("const STAGING_BLOCK"), src.indexOf("const COPY_ROLES_BLOCK"));
  assert.ok(/in your own words/.test(block), "the director is not asked for its own phrase");
  assert.ok(/not a list to pick from/.test(block), "the examples read as a menu");
  // And the shape must not enumerate them, which is how a menu gets returned.
  const shape = src.slice(src.indexOf('"staging": {'), src.indexOf('"reason": "<why this staging'));
  for (const word of ["collection", "hero_support", "comparison", "bundle", "lifestyle_scene"]) {
    assert.ok(!shape.includes(word), `${word} is enumerated in the contract`);
  }
});

check("Staging reaches the prompt as physical facts, beside the isolation rules", () => {
  const decision = toCreativeDecision(JSON.parse(STAGING_REPLY));
  assert.ok(decision.product_relationship.length > 0, "the relationship did not survive");
  assert.strictEqual(decision.staging_requirements.length, 6, "a physical fact was lost");
  const out = applyCreativeDecision({ concept: "c", useCase: "social_ad", aspectRatio: "1:1" } as any, decision, false);
  const all = (out.hardRequirements || []).join("\n");
  assert.ok(/ONE photograph together, not as separate cut-outs/.test(all), "the counterweight is not stated");
  assert.ok(/does not mean keeping them visually separate/.test(all), "isolation is not reconciled");
  for (const fact of ["Hierarchy:", "All of them stand on:", "One key light", "Depth:", "Contact:"]) {
    assert.ok(all.includes(fact), `${fact} never reached the prompt`);
  }
});

check("Staging does not weaken product identity", () => {
  // The counterweight must not become permission to blend. Nothing it emits may
  // read as an instruction to alter what a product is.
  const decision = toCreativeDecision(JSON.parse(STAGING_REPLY));
  const out = applyCreativeDecision({ concept: "c" } as any, decision, false);
  const all = (out.hardRequirements || []).join("\n").toLowerCase();
  for (const forbidden of ["merge", "blend the products", "combine into", "same product", "identical product"]) {
    assert.ok(!all.includes(forbidden), `staging suggested blending: ${forbidden}`);
  }
  assert.ok(/identity distinct/.test(all), "the line that preserves identity was dropped");
});

check("A run with no staging is unchanged", () => {
  const legacy = toCreativeDecision({
    directions: [{ name: "Premium Brand", core_idea: "a quiet shelf" }],
    selected: "Premium Brand",
  } as any);
  assert.strictEqual(legacy.product_relationship, "");
  assert.deepStrictEqual(legacy.staging_requirements, []);
  const out = applyCreativeDecision({ concept: "c" } as any, legacy, false);
  assert.ok(
    !(out.hardRequirements || []).some((h: string) => /ONE photograph together/.test(h)),
    "a single-product run gained staging"
  );
});

// ── the parallel path carries the decision too ───────────────

const COMPILED = [
  "## ROLE",
  "Make a commercial photograph.",
  "## PRODUCT INSTANCE REQUIREMENTS",
  "DISTINCT PRODUCT IDENTITY ISOLATION: each PRODUCT_xx is a separate physical identity.",
  "## FINAL OUTPUT",
  "Render it.",
].join("\n");

const FULL_JUDGMENT = {
  ...JSON.parse(STAGING_REPLY),
  ...JSON.parse(strategyReply(BANNER_ROUTES[2])),
  directions: [{ name: "Commercial Safe", core_idea: "a shelf edge", visual_language: "flat light", why_it_fits: "clarity" }],
  selected: "Commercial Safe",
};

check("PARALLEL PATH: staging reaches the prompt when control mode is off", () => {
  const out = NanoBananaPromptComposer.compose(COMPILED, FULL_JUDGMENT, false, undefined);
  assert.ok(/THESE PRODUCTS SHARE ONE PHOTOGRAPH/.test(out), "the counterweight never reached the prompt");
  assert.ok(/not separate cut-outs placed on a background/.test(out), "the cut-out failure is not addressed");
  assert.ok(/identity distinct does not mean keeping them visually separate/.test(out), "isolation is not reconciled");
  // The relationship, and every physical fact the failing render lacked.
  assert.ok(/THEY BELONG TOGETHER AS: one order, three people sharing a table/.test(out), "the relationship was dropped");
  for (const fact of ["HIERARCHY:", "THEY READ AS ONE GROUP BECAUSE:", "ALL OF THEM STAND ON:", "ONE KEY LIGHT FOR THE WHOLE GROUP:", "DEPTH:", "CONTACT:"]) {
    assert.ok(out.includes(fact), `${fact} never reached the prompt`);
  }
});

check("PARALLEL PATH: the chosen route reaches the prompt, the menu does not", () => {
  const out = NanoBananaPromptComposer.compose(COMPILED, FULL_JUDGMENT, false, undefined);
  assert.ok(/THE ROUTE THIS BRIEF IS ANSWERED BY/.test(out), "the strategy never reached the prompt");
  assert.ok(out.includes(BANNER_ROUTES[2]), "the chosen route is missing");
  // Same rule the control path follows: what was considered is reasoning, what
  // was decided is an instruction, and only the second goes to a renderer.
  assert.ok(!/works_against|supports/.test(out), "an assessment leaked");
  assert.ok(!/routes_offered|routes_developed|candidates/.test(out), "the offered list leaked");
  for (const other of BANNER_ROUTES.filter((r) => r !== BANNER_ROUTES[2] && r !== BANNER_ROUTES[1])) {
    assert.ok(!out.includes(other), `an unchosen route leaked: ${other}`);
  }
});

check("PARITY: both modes put the same decisions in front of the renderer", () => {
  // Control mode delivers them through the request; the parallel path delivers
  // them through the composer. A renderer must not be able to tell which ran.
  const viaComposer = NanoBananaPromptComposer.compose(COMPILED, FULL_JUDGMENT, false, undefined);
  const decision = toCreativeDecision(FULL_JUDGMENT);
  const viaRequest = applyCreativeDecision(
    { concept: "c", useCase: "social_ad", aspectRatio: "1:1" } as any,
    decision,
    false
  );
  const controlText = [viaRequest.concept, ...(viaRequest.hardRequirements || [])].join("\n");

  const carries = (text: string) => ({
    relationship: /one order, three people sharing a table/.test(text),
    route: text.includes(BANNER_ROUTES[2]),
    ground: /one wet counter receding to the upper right/.test(text),
    light: /a single window key from the left/.test(text),
    depth: /cold brew nearest/.test(text),
    contact: /each glass sits in its own ring of condensation/.test(text),
  });
  assert.deepStrictEqual(
    carries(viaComposer),
    carries(controlText),
    "the two modes deliver different decisions"
  );
  assert.deepStrictEqual(Object.values(carries(viaComposer)), [true, true, true, true, true, true]);
});

check("PARITY: control mode does not receive the block twice", () => {
  // In control mode the decision already went in through the request. Appending
  // it again would be the same scene stated twice, which reads as two scenes.
  const out = NanoBananaPromptComposer.compose(COMPILED, FULL_JUDGMENT, true, undefined);
  assert.ok(!/THESE PRODUCTS SHARE ONE PHOTOGRAPH/.test(out), "staging was appended on top of the request");
  assert.ok(!/THE ROUTE THIS BRIEF IS ANSWERED BY/.test(out), "the route was appended on top of the request");
});

check("A judgment without staging or strategy produces neither block", () => {
  const plain = {
    directions: [{ name: "Commercial Safe", core_idea: "a shelf", visual_language: "flat", why_it_fits: "clarity" }],
    selected: "Commercial Safe",
  };
  const out = NanoBananaPromptComposer.compose(COMPILED, plain as any, false, undefined);
  assert.ok(!/THESE PRODUCTS SHARE ONE PHOTOGRAPH/.test(out), "an empty staging produced a block");
  assert.ok(!/THE ROUTE THIS BRIEF IS ANSWERED BY/.test(out), "an absent strategy produced a block");
  assert.ok(/CREATIVE DIRECTION/.test(out), "the existing direction block was lost");
});

check("The isolation instructions the compiler wrote are left intact", () => {
  // The counterweight must not remove what it counterweights.
  const out = NanoBananaPromptComposer.compose(COMPILED, FULL_JUDGMENT, false, undefined);
  assert.ok(/DISTINCT PRODUCT IDENTITY ISOLATION/.test(out), "isolation was removed");
  assert.ok(/separate physical identity/.test(out), "the identity lock was weakened");
});

check("GUARD SELF-TEST: both guards catch the templates V2 removes", () => {
  // The point of this case is that the guards above are load-bearing. If the V1
  // entries ever stop tripping them, the guards have been weakened rather than
  // the data improved, and the next template will walk through the same door.
  const bannerV1 = assetContextFor("banner", false)!;
  const ugcV1 = assetContextFor("ugc_thumbnail", false)!;
  assert.ok(
    LAYOUT.test(bannerV1.layout_intent),
    `the layout guard no longer catches the V1 banner entry: ${bannerV1.layout_intent}`
  );
  assert.ok(
    SUBJECT.test(ugcV1.visual_priority),
    `the subject guard no longer catches the V1 ugc entry: ${ugcV1.visual_priority}`
  );
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


void (async () => {
  // Nothing is reported until every asynchronous case has settled.
  await Promise.all(pending);

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
})();
