import fs from "fs";
import path from "path";
import {
  CALIBRATION_CASES,
  CROSS_CASE_CHECK,
  RENDER_CASES,
  UNIVERSAL_CHECKS,
} from "./benchmark/layout-render-dataset";

/**
 * Prints the Phase 5.1.5 render run sheet and writes it to disk.
 *
 * Renders nothing, calls nothing, costs nothing. It exists so the criteria are
 * on paper before any image is generated — a benchmark whose pass mark is
 * decided after the results are in is not a benchmark.
 *
 *   npx tsx lib/image-engine/run-layout-render-checklist.ts
 */

const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};

say("=".repeat(78));
say("Phase 5.1.5 — Render Validation Run Sheet");
say("=".repeat(78));
const ALL = [...RENDER_CASES, ...CALIBRATION_CASES];
say(`  ${ALL.length} cases, each rendered twice = ${ALL.length * 2} renders`);
say("  Cases A/B/C pair bridge OFF against bridge ON.");
say("  Cases K1-K3 keep the bridge ON in both halves and move only the constraint flag —");
say("  the failure being corrected was caused by the bridge working, so a no-bridge");
say("  comparison would answer a question nobody asked.");
say("  Nothing is rendered by this script. Flip the flags, run the renders, fill this in.");
say("");
say("  Flags live at data/evolution/feature-flags.json. Change ONLY the two bridge");
say("  flags between the OFF and ON render of a pair; everything else stays put, or");
say("  the pair stops being a pair.");
say("");

for (const c of [...RENDER_CASES, ...CALIBRATION_CASES]) {
  say("-".repeat(78));
  say(c.title);
  say("-".repeat(78));
  say(`  concept    : ${c.concept}`);
  say(`  brand      : ${c.brandName}`);
  say(`  format     : ${c.useCase} at ${c.aspectRatio}`);
  say(`  objective  : ${c.objective}`);
  say(`  audience   : ${c.audience}`);
  say(`  products   : ${c.productCount}`);
  const changed = Object.keys(c.flags.on).filter((k) => c.flags.on[k] !== c.flags.off[k]);
  say(`  flags OFF  : ${Object.entries(c.flags.off).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  say(`  flags ON   : changed only -> ${changed.map((k) => `${k}=true`).join(", ")}`);
  say("");
  say("  Look at the two images together and answer:");
  for (const q of c.criteria) say(`    [ ] ${q}`);
  say("");
  say("  Mark the run FAILED, not merely unchanged, if any of these is true:");
  for (const r of c.regressions) say(`    [ ] ${r}`);
  say("");
}

say("-".repeat(78));
say(CROSS_CASE_CHECK.title);
say("-".repeat(78));
for (const s of CROSS_CASE_CHECK.steps) say(`    ${s}`);
say("");
say(`  PASS: ${CROSS_CASE_CHECK.pass}`);
say(`  FAIL: ${CROSS_CASE_CHECK.fail}`);
say("");

say("-".repeat(78));
say("Every render, every case");
say("-".repeat(78));
for (const u of UNIVERSAL_CHECKS) say(`    [ ] ${u}`);
say("");

say("-".repeat(78));
say("Record per render");
say("-".repeat(78));
say("    generation_id, prompt_chars, features_enabled, duration_ms  (from the log)");
say("    [EXPERIMENT][LAYOUT_CONTEXT]  applied, product_count, has_relationship");
say("    [EXPERIMENT][LAYOUT_PRIORITY] mode (replaced | stated), delta");
say("");
say("  The LAYOUT_PRIORITY mode matters. 99 of the 100 renders logged so far exceed");
say("  the optimizer's soft threshold, and above it the precedence clause is already");
say("  stripped upstream — so 'stated' is the expected mode and 'replaced' would mean");
say("  this was an unusually short prompt. A run where neither line appears is a run");
say("  where the bridge never engaged, whatever the flags said.");
say("");
say("=".repeat(78));

const out = path.join(process.cwd(), "data", "benchmarks", "layout-render-runsheet.txt");
try {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join("\n") + "\n", "utf-8");
  console.log(`run sheet written: ${out}`);
} catch (err: any) {
  console.log(`run sheet NOT written: ${err?.message || err}`);
}
