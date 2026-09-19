import fs from "fs";
import path from "path";
import {
  PHASE0_SCENARIOS,
  PHASE0_CROSS_CHECK,
  PHASE0_UNIVERSAL_CHECKS,
} from "./benchmark/phase0-render-dataset";
import { PHASE0_DIMENSIONS } from "./benchmark/phase0-benchmark.types";

/**
 * Phase 0.4 stage 2 — the render run sheet and the scoring packet.
 *
 * Renders nothing, calls nothing, costs nothing. It exists so the criteria and
 * the scorecard are on paper BEFORE any image is generated. A benchmark whose
 * pass mark is decided after the results are in is not a benchmark, and this
 * project has produced five phases that each looked successful on paper.
 *
 *   npx tsx lib/image-engine/run-phase0-render-checklist.ts
 *
 * What stage 2 costs
 * ------------------
 * 6 scenarios x 2 arms = 12 renders, plus one live director call per scenario if
 * the judgments are to come from the model rather than from the fixtures in
 * `phase0-render-dataset.ts`. Stage 1 measured transmission with fixtures; it
 * cannot tell you whether the director PRODUCES what the composer transmits, and
 * only a live run can.
 *
 * Score the seven dimensions 1-10 from the IMAGES. Six of them had a prompt-stage
 * proxy in stage 1 and those proxies are not scores of the picture; the seventh,
 * `ai_artifact_level`, had none at all and is scored here for the first time.
 */

const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};

const bar = "=".repeat(78);

say(bar);
say("Phase 0.4 — Render Validation Run Sheet (stage 2)");
say(bar);
say(`  ${PHASE0_SCENARIOS.length} scenarios, each rendered twice = ${PHASE0_SCENARIOS.length * 2} renders`);
say("");
say("  Every pair is the same brief with the same seed, the same references and the");
say("  same aspect ratio. ONLY `creative_bridge_v1` moves between OFF and ON. Change");
say("  anything else and the pair stops being a pair.");
say("");
say("  Flags live at data/evolution/feature-flags.json.");
say("");
say("  A pair that differs proves less than it looks: the image model is stochastic.");
say("  That is why every criterion below asks what is PRESENT or ABSENT in the frame");
say("  and never which one is prettier.");
say("");

for (const s of PHASE0_SCENARIOS) {
  say("-".repeat(78));
  say(s.title);
  say("-".repeat(78));
  say(`  scenario id : ${s.id}`);
  say(`  challenge   : ${s.challenge}`);
  say(`  why it is here: ${s.transmission_challenge}`);
  say("");
  say(`  concept     : ${s.brief.concept}`);
  say(`  brand       : ${s.brief.brandName} — ${s.brief.brandTone}`);
  say(`  format      : ${s.brief.useCase} at ${s.brief.aspectRatio}`);
  say(`  objective   : ${s.brief.objective}`);
  say(`  audience    : ${s.brief.audience}`);
  say(`  products    : ${s.products.count}`);
  for (const p of s.products.items) say(`                - ${p}`);
  say(`  identity    : ${s.products.identityAnchors.join("; ")}`);
  say(`  reserved    : ${s.constraints.reservedZones.join("; ")}`);
  say(`  composited  : ${s.constraints.copyItems.length ? s.constraints.copyItems.join(", ") : "none"}`);
  say(`  forbidden   : ${s.constraints.forbidden.join(", ")}`);
  const changed = (Object.keys(s.flags.on) as (keyof typeof s.flags.on)[]).filter(
    (k) => s.flags.on[k] !== s.flags.off[k]
  );
  say("");
  say(`  flags OFF   : ${Object.entries(s.flags.off).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  say(`  flags ON    : changed only -> ${changed.map((k) => `${k}=true`).join(", ") || "(nothing — this pair is inert)"}`);
  say("");
  say("  Look at the two images together and answer:");
  for (const q of s.renderCriteria) say(`    [ ] ${q}`);
  say("");
  say("  Mark the run FAILED, not merely unchanged, if any of these is true:");
  for (const r of s.regressions) say(`    [ ] ${r}`);
  say("");
  say("  Score each image 1-10:");
  say(`    ${"dimension".padEnd(32)}${"OFF".padEnd(7)}${"ON".padEnd(7)}note`);
  for (const d of PHASE0_DIMENSIONS) {
    say(`    ${(d.id + (d.inverted ? " (10=worst)" : "")).padEnd(32)}${"____".padEnd(7)}${"____".padEnd(7)}`);
  }
  say("");
}

say("-".repeat(78));
say(PHASE0_CROSS_CHECK.title);
say("-".repeat(78));
say("  This is the one that decides whether Phase 0.2 reached the picture, and it");
say("  is not a per-image judgement.");
say("");
for (const st of PHASE0_CROSS_CHECK.steps) say(`    ${st}`);
say("");
say(`  PASS: ${PHASE0_CROSS_CHECK.pass}`);
say(`  FAIL: ${PHASE0_CROSS_CHECK.fail}`);
say("");

say("-".repeat(78));
say("Every render, every scenario");
say("-".repeat(78));
for (const u of PHASE0_UNIVERSAL_CHECKS) say(`    [ ] ${u}`);
say("");

say("-".repeat(78));
say("The scoring questions, in full");
say("-".repeat(78));
for (const d of PHASE0_DIMENSIONS) {
  say(`  ${d.id}${d.inverted ? "  (10 = worst)" : ""}`);
  say(`      ${d.question}`);
  say(`      stage 1 method: ${d.prompt_method}`);
  if (d.proxy_note) say(`      what stage 1 actually counted: ${d.proxy_note}`);
  say("");
}

say("-".repeat(78));
say("Record per render");
say("-".repeat(78));
say("    generation_id, provider, prompt_chars, features_enabled, duration_ms  (from the log)");
say("    [EXPERIMENT][CREATIVE_STRATEGY_TRACE]  selected_direction, direction_source,");
say("                                           composer_used_direction, appearance_lines");
say("    [EXPERIMENT][DIRECTOR_CONTROL]         direction, strategy_route");
say("    [EXPERIMENT][NANO_BANANA_PROMPT]       stable_chars, experiment_chars, delta");
say("");
say("  `composer_used_direction: false` on a run where a direction was chosen is the");
say("  Phase 0.1 defect returning. `appearance_lines: 1` on a strategy-branch run is");
say("  the Phase 0.2 carrier gap stage 1 already found — expect it until that is fixed.");
say("");
say(bar);

const out = path.join(process.cwd(), "data", "benchmarks", "phase0-render-runsheet.txt");
try {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join("\n") + "\n", "utf-8");
  console.log(`run sheet written: ${out}`);
} catch (err: any) {
  console.log(`run sheet NOT written: ${err?.message || err}`);
}
