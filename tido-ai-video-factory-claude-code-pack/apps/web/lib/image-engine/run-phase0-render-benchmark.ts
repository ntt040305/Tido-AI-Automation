import crypto from "crypto";
import fs from "fs";
import path from "path";
import { detectDuplicates, RenderHashRow } from "./benchmark/render-run-integrity";

/**
 * Phase 0.4 stage 2 — render validation against the real pipeline.
 *
 *   npx tsx lib/image-engine/run-phase0-render-benchmark.ts            (dry run)
 *   npx tsx lib/image-engine/run-phase0-render-benchmark.ts --live     (renders)
 *   npx tsx lib/image-engine/run-phase0-render-benchmark.ts --live --only=A_product_hero
 *
 * Dry run by default, and that is not timidity: a live run makes real calls to a
 * real image provider and costs real credits. `--live` is the switch that says
 * somebody meant it.
 *
 * What this does NOT do
 * ---------------------
 * It does not score the images. Six of the seven dimensions are judgements about
 * a picture, and the seventh — `ai_artifact_level` — has no automated proxy at
 * all. This produces the renders and the run sheet; a human produces the scores.
 * A script that emitted seven numbers per image would be grading its own
 * vocabulary, which is the failure `Phase0TransmissionScorer` was careful to
 * avoid at the prompt stage and would be worse here.
 *
 * How the arms are set
 * --------------------
 * `TIDO_FLAGS_PATH` is pointed at a scratch file this script owns and rewrites
 * between arms. The production `data/evolution/feature-flags.json` is never
 * touched, never read, and never restored-from-backup, because it is never
 * modified in the first place.
 *
 * `FLAGS_PATH` inside feature-flags.ts is resolved at module load, so the env var
 * is set BEFORE the dynamic imports below. That ordering is the whole reason this
 * file uses `await import` instead of static imports.
 */

// `.env.local`, loaded the same way `run-stage5-imgstudio-live-render.ts` does.
// Next injects it in the app; a standalone script has to do it itself, and
// without it the provider has no API key and every render fails on auth.
const envPath = path.resolve(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const ARGS = process.argv.slice(2);
const LIVE = ARGS.includes("--live");
/** Comma-separated, so a partial re-run does not have to re-render what worked. */
const ONLY = ARGS.find((a) => a.startsWith("--only="))
  ?.split("=")[1]
  ?.split(",")
  .map((x) => x.trim())
  .filter(Boolean);

/**
 * Run isolation, added after a reliability failure worth recording.
 *
 * Two consecutive runs wrote to one fixed set of filenames and produced twelve
 * byte-identical images, while the provider was separately proven stochastic —
 * identical prompts give different pictures. Because each run overwrote the
 * last, there was no way to tell a genuine null result from a harness that had
 * not really re-rendered, and no way to diagnose it afterwards because the
 * evidence was gone.
 *
 * Every run now gets its own directory and writes a hash for every artefact it
 * touches. Nothing about generation changes; this only makes what happened
 * visible after the fact.
 */
const BENCH_ROOT = path.join(process.cwd(), "data", "benchmarks", "phase1.1d");

/** `run_YYYYMMDD_NNN`, where NNN is the next free sequence for that day. */
function nextRunId(): string {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  fs.mkdirSync(BENCH_ROOT, { recursive: true });
  const taken = fs
    .readdirSync(BENCH_ROOT)
    .map((n) => new RegExp(`^run_${day}_([0-9]+)$`).exec(n)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = (taken.length ? Math.max(...taken) : 0) + 1;
  return `run_${day}_${String(next).padStart(3, "0")}`;
}

const RUN_ID = nextRunId();
const RUN_DIR = path.join(BENCH_ROOT, RUN_ID);
const OUT_DIR = path.join(RUN_DIR, "renders");
const PROMPT_DIR = path.join(RUN_DIR, "prompts");
const FLAGS_SCRATCH = path.join(RUN_DIR, ".arm-flags.json");
const REFERENCE = path.join(process.cwd(), "test-assets", "real_product_bottle.png");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(PROMPT_DIR, { recursive: true });

const md5 = (v: Buffer | string): string =>
  crypto.createHash("md5").update(v as any).digest("hex");

const HASHES: RenderHashRow[] = [];

process.env.TIDO_FLAGS_PATH = FLAGS_SCRATCH;

// Written once so the path exists before anything reads it.
fs.writeFileSync(FLAGS_SCRATCH, JSON.stringify({ active_pipeline: "experiment", features: {} }, null, 2));

// `require` rather than `import`, because this package compiles to CJS and the
// env var above must be set before feature-flags.ts resolves FLAGS_PATH at load.
// Static imports would be hoisted above the assignment and read the wrong file.
/* eslint-disable @typescript-eslint/no-var-requires */
const { PHASE0_SCENARIOS } = require("./benchmark/phase0-render-dataset");
const { PHASE0_DIMENSIONS } = require("./benchmark/phase0-benchmark.types");
const { PipelineRouter } = require("./evolution/PipelineRouter");
const { VisualDNAAnalyzer, visualDNATelemetry } = require("./evolution/experiment/VisualDNAAnalyzer");
const { LLMProviderService } = require("./llm/llm-provider.service");
type Scenario = (typeof import("./benchmark/phase0-render-dataset"))["PHASE0_SCENARIOS"][number];

const L = (s = "") => console.log(s);
const bar = "=".repeat(78);

/**
 * The flag set for one arm, written whole.
 *
 * `creative_director_control_v1` is forced ON in BOTH arms, and that is the
 * single most important line in this file. `creative_bridge_v1` is read only
 * inside `if (controlled)` in ExperimentPipeline — so with control off, moving
 * the bridge changes nothing and the whole benchmark would return a null result
 * that looked like evidence.
 *
 * Note this differs from the production flags file, which sets
 * `creative_bridge_v1: true` and leaves `creative_director_control_v1` absent
 * (so: false). Production is currently running the bridge inert.
 */
function armFlags(s: Scenario, arm: "OFF" | "ON") {
  const f = arm === "OFF" ? s.flags.off : s.flags.on;
  return {
    active_pipeline: "experiment",
    rollout_mode: "internal_only",
    ab_percentage: 0,
    internal_testers: ["internal-01"],
    features: {
      // The arm under test.
      creative_director_control_v1: f.creative_director_control_v1,
      creative_bridge_v1: f.creative_bridge_v1,
      creative_exploration_v1: f.creative_exploration_v1,
      creative_strategy_selection_v1: f.creative_strategy_selection_v1,
      multi_product_staging_v1: f.multi_product_staging_v1,
      // Held constant across both arms. These produce the judgment the bridge
      // carries; without them there is nothing for either arm to transmit.
      creative_strategy_intelligence_v1: true,
      consumer_psychology_v1: true,
      brand_positioning_v1: true,
      visual_semantics_v1: true,
      anti_generic_check_v1: true,
      creative_reasoning_v1: true,
      asset_type_intelligence_v1: true,
      asset_intent_v2: true,
      creative_decision_context_v1: true,
      // Phase 1.1A. Held constant across BOTH arms so the bridge comparison is
      // unchanged, and set from the environment so the same dataset can produce
      // a with/without-challenge pair without editing this file.
      format_challenge_v1: process.env.PHASE11A_CHALLENGE === "1",
      // Phase 1.0 — Activate Existing Intelligence.
      //
      // `VisualDNAAnalyzer` reads the ATTACHED product photograph and reports
      // form, materials, palette, finish, surface detail, scale cues and
      // condition. It has been built, wired and cached since before Phase 0,
      // and it has never been enabled in a single benchmark render: the Phase
      // 0.4 trace recorded `visual_dna: null` on all twelve.
      //
      // Rides on `creative_decision_context_v1` (set above) because the
      // analysis lives on the context — enabling it alone pays for a vision
      // call nothing reads. Held constant across BOTH arms, so the bridge
      // comparison is unchanged and this is the only variable that moved.
      visual_dna_v1: process.env.PHASE10_VISUAL_DNA === "1",
      // Phase 1.1E. Benchmark arm only — `data/evolution/feature-flags.json` is
      // never written by this script. Demotes inferred camera/lighting/
      // composition/materials/environment from USER to CREATIVE_DIRECTOR;
      // anything the client locked in the visual direction panel stays USER.
      creative_director_authority_v1: process.env.PHASE11E_CD_AUTHORITY === "1",
      // Phase 1.1B validation. Rides on creative_decision_context_v1 (set
      // above). Held constant across BOTH arms, so the bridge comparison is
      // unchanged and this stays the only variable that moved.
      product_truth_v1: process.env.PHASE11_PRODUCT_TRUTH === "1",
      // Phases 1-5. Both depend on product truth, which the pipeline enforces;
      // setting them without it is a no-op rather than an error.
      marketing_insight_v1: process.env.PHASE_MARKETING_INSIGHT === "1",
      professional_creative_brain_v1: process.env.PHASE_CREATIVE_BRAIN === "1",
    },
    components: { prompt_compiler: false, creative_engine: false, knowledge_base: false, evaluation: false },
  };
}

/** One render. Returns what happened, never throws. */
async function render(s: Scenario, arm: "OFF" | "ON") {
  fs.writeFileSync(FLAGS_SCRATCH, JSON.stringify(armFlags(s, arm), null, 2));

  const buffer = fs.readFileSync(REFERENCE);
  // Sniffed, not assumed. `real_product_bottle.png` is actually a JPEG
  // (it starts ff d8 ff), and declaring image/png made VisualDNAAnalyzer log
  // "declared type does not match the bytes" on every render. Harmless while
  // the analyzer was switched off; a real defect the moment Phase 1.0 turned
  // it on, which is how it was found.
  const mimeType =
    buffer[0] === 0xff && buffer[1] === 0xd8 ? "image/jpeg"
    : buffer[0] === 0x89 && buffer[1] === 0x50 ? "image/png"
    : "application/octet-stream";
  const request = {
    images: [{ buffer, mimeType, filename: "real_product_bottle.png", role: "PRODUCT" as const }],
    concept: s.baseConcept,
    contentMessage: s.constraints.copyItems.join("\n"),
    useCase: s.brief.useCase,
    aspectRatio: s.brief.aspectRatio,
    brandName: s.brief.brandName,
    copyItems: s.constraints.copyItems.map((text) => ({ text })),
    hardRequirements: [...s.baseHardRequirements],
    // Run-scoped, and this is not cosmetic.
    //
    // `requestId` becomes `generationId`, which becomes the provider's
    // idempotency key: `ImgStudioImageGenerationProvider:109` falls back to
    // `tido-${generationId}`. A key that was stable across runs meant ImgStudio
    // correctly returned the SAME cached asset every time, so two runs with
    // demonstrably different compiled prompts produced byte-identical images.
    // The provider was right; the benchmark was asking it to repeat itself.
    //
    // Measured before the fix: run_20260918_004 and _005 sent
    // `idempotencyKey: phase0-A_product_hero-OFF` and both received
    // remoteImageId ae168c14-c547-4fbc-87ed-96a519b6b415.
    requestId: `${RUN_ID}-${s.id}-${arm}`,
  } as any;

  const started = Date.now();
  try {
    const result = await PipelineRouter.run(request, undefined, { testerId: "internal-01" });
    const ms = Date.now() - started;
    let imagePath: string | null = null;
    if (result.imageBuffer?.length) {
      imagePath = path.join(OUT_DIR, `${s.id}__${arm}.png`);
      fs.writeFileSync(imagePath, result.imageBuffer);
    }

    // ── what actually happened, recorded so it can be checked later ────────
    //
    // Four hashes because they fail independently. The image can repeat while
    // the compiled prompt differs — that is the anomaly this exists to catch —
    // and a run that never re-rendered looks identical to a genuine null result
    // unless each stage is hashed separately.
    const compiledPath = path.join(
      process.cwd(), "data", "generated", "image-renders", String(result.generationId), "master_prompt.md"
    );
    let compiledHash: string | null = null;
    if (fs.existsSync(compiledPath)) {
      const compiled = fs.readFileSync(compiledPath);
      compiledHash = md5(compiled);
      // Copied into the run so the prompt survives the next run overwriting the
      // shared generation folder, which is how the last comparison lost its
      // evidence.
      fs.writeFileSync(path.join(PROMPT_DIR, `${s.id}__${arm}.md`), compiled);
    }
    HASHES.push({
      scenario_id: s.id,
      arm,
      timestamp: new Date().toISOString(),
      prompt_hash: md5([request.concept, ...(request.hardRequirements || [])].join("\n")),
      compiled_prompt_hash: compiledHash,
      provider_response_hash: md5(
        JSON.stringify({
          url: result.imageUrl ?? null,
          status: result.status,
          bytes: result.imageBuffer?.length ?? 0,
        })
      ),
      image_md5: result.imageBuffer?.length ? md5(result.imageBuffer) : null,
    });

    return {
      scenario_id: s.id,
      arm,
      ok: result.success,
      status: result.status,
      generation_id: result.generationId,
      provider_used: (result as any).provider || (result.diagnostics as any)?.provider || process.env.TIDO_IMAGE_PROVIDER || null,
      prompt_chars: result.diagnostics?.promptChars ?? null,
      reference_count: result.diagnostics?.referenceCount ?? null,
      duration_ms: ms,
      image_path: imagePath,
      image_url: result.imageUrl ?? null,
      error: null as string | null,
    };
  } catch (err: any) {
    return {
      scenario_id: s.id,
      arm,
      ok: false,
      status: "THREW",
      generation_id: null,
      provider_used: null,
      prompt_chars: null,
      reference_count: null,
      duration_ms: Date.now() - started,
      image_path: null,
      image_url: null,
      error: err?.message || String(err),
    };
  }
}

// ── plan ──────────────────────────────────────────────────────────────────

const scenarios: Scenario[] = ONLY?.length
  ? PHASE0_SCENARIOS.filter((s: Scenario) => ONLY.includes(s.id))
  : PHASE0_SCENARIOS;
if (ONLY?.length && scenarios.length !== ONLY.length) {
  const known = PHASE0_SCENARIOS.map((s: Scenario) => s.id);
  L(`unknown scenario id in --only: ${ONLY.filter((id) => !known.includes(id)).join(", ")}`);
  L(`known: ${known.join(", ")}`);
  process.exit(1);
}

L(bar);
L(`Phase 0.4 — Render Validation (stage 2)${LIVE ? "" : "   [DRY RUN]"}`);
L(bar);
L(`  scenarios : ${scenarios.length}`);
L(`  renders   : ${scenarios.length * 2}  (each scenario twice, bridge OFF then ON)`);
L(`  provider  : ${process.env.TIDO_IMAGE_PROVIDER || "(unset — pipeline default)"}`);
L(`  reference : ${path.basename(REFERENCE)}${fs.existsSync(REFERENCE) ? "" : "   MISSING"}`);
L(`  flags     : ${FLAGS_SCRATCH}`);
L(`              production data/evolution/feature-flags.json is NOT touched`);
L(`  output    : ${OUT_DIR}`);
L("");

// ── known limits, stated before the run rather than after ─────────────────

const limits: string[] = [];
const multi = scenarios.filter((s: Scenario) => s.products.count > 1);
if (multi.length) {
  limits.push(
    `${multi.map((s: Scenario) => `${s.id} (${s.products.count})`).join(", ")} ask for several DISTINCT products and only one ` +
      `reference image exists (test-assets/real_product_bottle.png). Identity preservation across a range CANNOT be judged ` +
      `from this run. Attaching the same bottle N times would produce exactly the cloning the prompt forbids, so it is ` +
      `attached once and these scenarios are marked DEGRADED.`
  );
}
limits.push(
  "ImgStudio exposes no seed parameter, so 'same seed' is not achievable. The pair shares the brief, the reference " +
    "and the aspect ratio; it does not share a seed. Any single visual difference between OFF and ON may therefore be " +
    "sampling noise, which is why the criteria ask what is PRESENT or ABSENT rather than which is better."
);
limits.push(
  "The director runs live, so the judgment differs between the two arms in ways beyond the flag. This is a whole-system " +
    "comparison, not an isolated one — the isolated one is stage 1."
);

L("-".repeat(78));
L("KNOWN LIMITS OF THIS RUN");
L("-".repeat(78));
for (const l of limits) L(`  - ${l}`);
L("");

if (!LIVE) {
  L("-".repeat(78));
  L("DRY RUN — nothing was rendered and nothing was spent");
  L("-".repeat(78));
  for (const s of scenarios) {
    const changed = (Object.keys(s.flags.on) as (keyof typeof s.flags.on)[]).filter((k) => s.flags.on[k] !== s.flags.off[k]);
    L(`  ${s.id.padEnd(18)}${s.brief.useCase.padEnd(14)}${s.brief.aspectRatio.padEnd(6)}${s.products.count} product(s)   moves: ${changed.join(", ")}`);
  }
  L("");
  L(`  Re-run with --live to render ${scenarios.length * 2} images.`);
  L(bar);
  process.exit(0);
}

// ── live ──────────────────────────────────────────────────────────────────

L("-".repeat(78));
L("RENDERING");
L("-".repeat(78));

/**
 * Refuses to spend on renders the run cannot interpret.
 *
 * Phase 1.0's first attempt launched twelve renders while the LLM proxy was
 * down. Every render still reported `ok` and wrote a plausible image, because
 * the pipeline degrades gracefully — but the director produced
 * `selected_direction: null` and VisualDNA reported `analyzed: false`. Twelve
 * pictures with no creative intelligence in them, indistinguishable at a glance
 * from a valid null result. That is the run this function exists to prevent.
 *
 * It probes the two things a run needs and, when `visual_dna_v1` is on, runs the
 * ACTUAL analyzer against the ACTUAL reference — because a text probe passes
 * while vision fails, which is the specific gap that produced the invalid run.
 */
async function preflight(): Promise<void> {
  L("-".repeat(78));
  L("PREFLIGHT");
  L("-".repeat(78));

  const probe = await new LLMProviderService().probe(20000);
  L(`  LLM gateway    ${probe.reachable ? "reachable" : "UNREACHABLE"}  ${probe.status}  ${probe.baseUrl}`);
  if (!probe.reachable) {
    L("");
    L("  ABORTED. With the gateway down the director produces no judgment and every");
    L("  render is the bare stable pipeline. That is a blocked run, not a null result.");
    process.exit(2);
  }

  if (process.env.PHASE10_VISUAL_DNA === "1") {
    const buffer = fs.readFileSync(REFERENCE);
    const mime = buffer[0] === 0xff && buffer[1] === 0xd8 ? "image/jpeg" : "image/png";
    const dna = await new VisualDNAAnalyzer().analyze({
      images: [{ role: "PRODUCT", buffer, mimeType: mime }],
      existingDNA: null,
    });
    const tel: any = visualDNATelemetry(dna);
    L(`  VisualDNA      analyzed=${tel.analyzed}${tel.analyzed ? `  branches=${tel.branches?.join(",")}  inferences=${tel.inferences}` : ""}`);
    if (!tel.analyzed) {
      L("");
      L("  ABORTED. visual_dna_v1 is on and the analyzer returned nothing, so the arm");
      L("  under test would not run. A Phase 1.0 whose subject never executed must");
      L("  report BLOCKED, not NO EFFECT — those lead to opposite decisions.");
      process.exit(3);
    }
    if (dna?.observed?.product) {
      L(`  observed       ${JSON.stringify(dna.observed.product).slice(0, 200)}`);
    }
  }

  if (process.env.PHASE11_PRODUCT_TRUTH === "1") {
    // States what this run can and cannot conclude, before it spends anything.
    // The scenarios carry no `salesContext`, so `functional_truth` is ABSENT on
    // every one of them and the DECLARED half of Phase 1.1B is NOT exercised.
    // What IS exercised is the not-established block: roughly +550 characters of
    // anti-invention instruction on every render. That is a real change and it
    // can go either way — Phase 1.1A added instruction and made things worse.
    const withSales = PHASE0_SCENARIOS.filter((s: Scenario) => (s as any).salesContext).length;
    L(`  ProductTruth   scenarios carrying salesContext: ${withSales}/${PHASE0_SCENARIOS.length}`);
    L("                 DECLARED half NOT exercised by this dataset.");
    L("                 This run measures the NOT-ESTABLISHED block only.");
  }
  L("");
}

async function main() {
  await preflight();
  const records: Awaited<ReturnType<typeof render>>[] = [];
  for (const s of scenarios) {
    for (const arm of ["OFF", "ON"] as const) {
      process.stdout.write(`  ${s.id} ${arm} ... `);
      const r = await render(s, arm);
      records.push(r);
      L(
        r.ok
          ? `ok  ${r.duration_ms}ms  ${r.prompt_chars} chars  -> ${r.image_path ? path.basename(r.image_path) : "no image"}`
          : `FAILED  ${r.status}  ${r.error || ""}`
      );
    }
  }

  L("");
  L("-".repeat(78));
  L("RESULT");
  L("-".repeat(78));
  const ok = records.filter((r) => r.ok && r.image_path);
  L(`  ${ok.length}/${records.length} renders produced an image`);
  for (const r of records.filter((x) => !x.ok)) L(`  FAILED  ${r.scenario_id} ${r.arm}: ${r.status} ${r.error || ""}`);
  L("");

  // ── duplicate detection across runs ─────────────────────────────────────
  //
  // The check that would have caught the last failure on the spot rather than
  // three investigations later. Every previous run's hashes.json is read and
  // every image hash compared. A repeat is not proof of a broken harness — a
  // provider could legitimately return a cached asset — but it is never
  // something to discover by accident.
  const integrity = detectDuplicates(HASHES, BENCH_ROOT, RUN_ID);
  const { duplicates } = integrity;
  const uniqueImages = integrity.unique_images;
  for (const d of duplicates) {
    console.warn("[DUPLICATE_RENDER_DETECTED]", {
      previous_run: d.previous_run,
      current_run: RUN_ID,
      image_hash: d.image_hash,
      scenario: d.scenario + " " + d.arm,
    });
  }

  fs.writeFileSync(
    path.join(RUN_DIR, "hashes.json"),
    JSON.stringify({ run_id: RUN_ID, images: HASHES }, null, 2) + "\n",
    "utf-8"
  );

  L("-".repeat(78));
  L("RUN INFORMATION");
  L("-".repeat(78));
  L("  run_id     : " + RUN_ID);
  L("  timestamp  : " + new Date().toISOString());
  L(
    "  flag state : visual_dna_v1=" + (process.env.PHASE10_VISUAL_DNA === "1") +
    "  product_truth_v1=" + (process.env.PHASE11_PRODUCT_TRUTH === "1") +
    "  marketing_insight_v1=" + (process.env.PHASE_MARKETING_INSIGHT === "1") +
    "  professional_creative_brain_v1=" + (process.env.PHASE_CREATIVE_BRAIN === "1") +
    "  format_challenge_v1=" + (process.env.PHASE11A_CHALLENGE === "1")
  );
  L("               arm flags are per scenario; production feature-flags.json is untouched");
  L("");
  L("-".repeat(78));
  L("RENDER VARIATION");
  L("-".repeat(78));
  L("  unique_images    : " + uniqueImages + "/" + HASHES.length);
  L("  duplicate_images : " + duplicates.length);
  for (const d of duplicates) {
    L("     " + d.scenario + " " + d.arm + " matches " + d.previous_run + "  (" + d.image_hash.slice(0, 12) + ")");
  }
  if (duplicates.length) {
    L("");
    L("  A repeat across runs is worth explaining before any A/B is read from this");
    L("  run. The provider has been measured as stochastic — identical prompts give");
    L("  different images — so a repeat is not something it does on its own.");
  }
  L("");

  const report = {
    run_id: RUN_ID,
    unique_images: uniqueImages,
    duplicate_images: duplicates.length,
    duplicates,
    hashes: HASHES,
    report_id: `phase0-render-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    generated_at: new Date().toISOString(),
    stage: "RENDER",
    live: true,
    provider: process.env.TIDO_IMAGE_PROVIDER || null,
    reference_image: path.basename(REFERENCE),
    limits,
    degraded_scenarios: multi.map((s: Scenario) => s.id),
    records,
    scoring: {
      instruction:
        "Score each image 1-10 on the seven dimensions. These are judgements about a picture; none of them is produced by this script.",
      dimensions: PHASE0_DIMENSIONS.map((d: any) => ({ id: d.id, question: d.question, inverted: Boolean(d.inverted) })),
    },
  };
  const out = path.join(RUN_DIR, "metadata.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf-8");
  L(`report written: ${out}`);
  L(`images in    : ${OUT_DIR}`);
  L(bar);
}

main().catch((err) => {
  console.error("render benchmark failed:", err?.message || err);
  process.exit(1);
});
