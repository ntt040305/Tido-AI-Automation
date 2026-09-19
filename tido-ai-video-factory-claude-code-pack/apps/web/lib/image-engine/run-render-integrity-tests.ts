import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { detectDuplicates, RenderHashRow } from "./benchmark/render-run-integrity";

/**
 * Phase 1.1D — the run-integrity mechanism.
 *
 *   npx tsx lib/image-engine/run-render-integrity-tests.ts
 *
 * No gateway, no provider, no spend. That is deliberate: the failure this
 * mechanism exists to catch is a benchmark run that did not genuinely
 * re-render, and a detector that could only be exercised by a live render
 * would share exactly that blind spot.
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

const row = (over: Partial<RenderHashRow> = {}): RenderHashRow => ({
  scenario_id: "A_product_hero",
  arm: "ON",
  timestamp: new Date().toISOString(),
  prompt_hash: "p".repeat(32),
  compiled_prompt_hash: "c".repeat(32),
  provider_response_hash: "r".repeat(32),
  image_md5: "1".repeat(32),
  ...over,
});

/** A throwaway benchmark root with the given prior runs written into it. */
function fixture(runs: Record<string, RenderHashRow[] | string>): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "tido-integrity-"));
  for (const [runId, images] of Object.entries(runs)) {
    const dir = path.join(rootDir, runId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "hashes.json"),
      typeof images === "string" ? images : JSON.stringify({ run_id: runId, images }, null, 2)
    );
  }
  return rootDir;
}

console.log("\n=== Phase 1.1D — render run integrity ===\n");

// ── the happy path: two independent runs ──────────────────────────────────

check("Two runs with different images report no duplicates", () => {
  const root = fixture({ run_20260918_001: [row({ image_md5: "a".repeat(32) })] });
  const r = detectDuplicates([row({ image_md5: "b".repeat(32) })], root, "run_20260918_002");
  assert.deepStrictEqual(r.duplicates, [], "a distinct image was reported as a repeat");
  assert.strictEqual(r.unique_images, 1);
  assert.deepStrictEqual(r.compared_against, ["run_20260918_001"], "the previous run was not read");
});

check("The first run ever compares against nothing and does not fail", () => {
  const root = fixture({});
  const r = detectDuplicates([row()], root, "run_20260918_001");
  assert.deepStrictEqual(r.duplicates, []);
  assert.deepStrictEqual(r.compared_against, []);
});

check("A missing benchmark root is survived, not thrown on", () => {
  const r = detectDuplicates([row()], path.join(os.tmpdir(), "tido-does-not-exist-" + Date.now()), "run_1");
  assert.deepStrictEqual(r.duplicates, []);
});

// ── the failure it was built for ──────────────────────────────────────────

check("A repeated image across runs IS detected, and names the earlier run", () => {
  const shared = "d".repeat(32);
  const root = fixture({ run_20260918_001: [row({ image_md5: shared })] });
  const r = detectDuplicates([row({ image_md5: shared })], root, "run_20260918_002");
  assert.strictEqual(r.duplicates.length, 1, "the repeat was missed");
  assert.strictEqual(r.duplicates[0].previous_run, "run_20260918_001");
  assert.strictEqual(r.duplicates[0].image_hash, shared);
  assert.strictEqual(r.duplicates[0].scenario, "A_product_hero");
});

check("SAME image with a DIFFERENT compiled prompt is flagged as such", () => {
  // The exact shape of the original defect, and the one a stochastic provider
  // cannot produce on its own.
  const shared = "e".repeat(32);
  const root = fixture({
    run_20260918_001: [row({ image_md5: shared, compiled_prompt_hash: "aaa" })],
  });
  const r = detectDuplicates(
    [row({ image_md5: shared, compiled_prompt_hash: "bbb" })],
    root,
    "run_20260918_002"
  );
  assert.strictEqual(r.duplicates.length, 1);
  assert.strictEqual(
    r.duplicates[0].same_compiled_prompt,
    false,
    "a different prompt producing the same image was reported as an ordinary cache hit"
  );
});

check("SAME image with the SAME compiled prompt reads as an ordinary cache hit", () => {
  const shared = "f".repeat(32);
  const root = fixture({
    run_20260918_001: [row({ image_md5: shared, compiled_prompt_hash: "same" })],
  });
  const r = detectDuplicates(
    [row({ image_md5: shared, compiled_prompt_hash: "same" })],
    root,
    "run_20260918_002"
  );
  assert.strictEqual(r.duplicates[0].same_compiled_prompt, true);
});

check("The earliest run is named when an image repeats three times", () => {
  const shared = "9".repeat(32);
  const root = fixture({
    run_20260918_001: [row({ image_md5: shared })],
    run_20260918_002: [row({ image_md5: shared })],
  });
  const r = detectDuplicates([row({ image_md5: shared })], root, "run_20260918_003");
  assert.strictEqual(r.duplicates[0].previous_run, "run_20260918_001", "a later run was blamed");
});

// ── counting ──────────────────────────────────────────────────────────────

check("unique_images counts distinct hashes, not rows", () => {
  const root = fixture({});
  const r = detectDuplicates(
    [
      row({ arm: "OFF", image_md5: "1".repeat(32) }),
      row({ arm: "ON", image_md5: "1".repeat(32) }),
      row({ scenario_id: "B_ugc", image_md5: "2".repeat(32) }),
    ],
    root,
    "run_x"
  );
  assert.strictEqual(r.unique_images, 2, "identical images within one run were counted twice");
  assert.strictEqual(r.total_images, 3);
});

check("A render that produced no image is ignored, not counted as unique", () => {
  const root = fixture({});
  const r = detectDuplicates([row({ image_md5: null }), row({ image_md5: "7".repeat(32) })], root, "run_x");
  assert.strictEqual(r.unique_images, 1);
  assert.strictEqual(r.total_images, 1, "a failed render was counted as an image");
});

// ── robustness ────────────────────────────────────────────────────────────

check("A corrupt previous hashes.json is skipped, and the rest still compare", () => {
  const shared = "c".repeat(32);
  const root = fixture({
    run_20260918_001: "{ not json at all",
    run_20260918_002: [row({ image_md5: shared })],
  });
  const r = detectDuplicates([row({ image_md5: shared })], root, "run_20260918_003");
  assert.strictEqual(r.duplicates.length, 1, "one bad file suppressed the whole comparison");
  assert.deepStrictEqual(r.compared_against, ["run_20260918_002"], "the corrupt run was counted as read");
});

check("A previous run directory with no hashes.json is skipped", () => {
  const root = fixture({ run_20260918_001: [row()] });
  fs.mkdirSync(path.join(root, "run_20260918_002"), { recursive: true });
  const r = detectDuplicates([row({ image_md5: "z".repeat(32) })], root, "run_20260918_003");
  assert.deepStrictEqual(r.compared_against, ["run_20260918_001"]);
});

check("The current run never compares against itself", () => {
  const shared = "8".repeat(32);
  const root = fixture({ run_20260918_007: [row({ image_md5: shared })] });
  const r = detectDuplicates([row({ image_md5: shared })], root, "run_20260918_007");
  assert.deepStrictEqual(r.duplicates, [], "a run found itself and reported a duplicate");
});

// ── the module boundary ───────────────────────────────────────────────────

check("The detector imports nothing from the benchmark, so it costs nothing to test", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "benchmark", "render-run-integrity.ts"),
    "utf-8"
  );
  assert.ok(!/run-phase0-render-benchmark|PipelineRouter|Provider/.test(src), "the detector pulls in the pipeline");
  assert.ok(!/process\.env/.test(src), "the detector reads the environment");
});

check("The benchmark writes hashes.json and archives prompts per run", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "run-phase0-render-benchmark.ts"),
    "utf-8"
  );
  assert.ok(/path\.join\(RUN_DIR, "hashes\.json"\)/.test(src), "hashes.json is not written into the run");
  assert.ok(/path\.join\(PROMPT_DIR, /.test(src), "prompts are not archived into the run");
  assert.ok(/RUN INFORMATION/.test(src) && /RENDER VARIATION/.test(src), "the report sections are missing");
  assert.ok(/\[DUPLICATE_RENDER_DETECTED\]/.test(src), "the duplicate log is missing");
  // Generation logic untouched: the benchmark still calls the pipeline once.
  assert.ok(/PipelineRouter\.run\(request, undefined,/.test(src), "the generation call changed");
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
