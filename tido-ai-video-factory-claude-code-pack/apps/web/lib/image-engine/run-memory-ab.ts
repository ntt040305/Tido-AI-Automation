import fs from "fs";
import path from "path";
import { BrandDNAOwnership } from "./reasoning/BrandDNAOwnership";
import { CreativeDirectorDecisionEngine } from "./reasoning/CreativeDirectorDecisionEngine";
import { CreativeOriginalityMatrix } from "./reasoning/CreativeOriginalityMatrix";
import { MemoryPatternEvaluator } from "./reasoning/MemoryPatternEvaluator";
import { PatternExtractor } from "./reasoning/PatternExtractor";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * Phase 4.0.5 — the same hundred briefs, with and without taste memory.
 *
 *   npx tsx lib/image-engine/run-memory-ab.ts [--out DIR]
 *
 * Both arms run the identical pipeline. The only difference is whether guidance
 * retrieved from decisions already made is allowed to reorder ideas whose scores
 * are within `GUIDANCE_BAND` of each other. Decisions are captured in both arms,
 * so the comparison is of *using* memory rather than of keeping it.
 *
 * What a small delta would mean
 * ----------------------------
 * The guidance is deliberately weak — a tie-break inside a four-point band, with
 * a novelty reserve and saturation suppression on top. If the four measures move
 * by very little, that is the design working rather than failing: a memory
 * constrained not to become a formula cannot also transform a run. A large
 * movement in these conditions would be the more worrying result, because the
 * only way to get one is for the constraints to be leaking.
 */

interface ArmMetrics {
  arm: string;
  recommended: number;
  brand_ownership_rate: number;
  mean_ownership: number;
  originality: number;
  breakthrough: number;
  memorability: number;
  approval_rate: number;
  pursue: number;
  modify: number;
  reject: number;
  distinct_structures: number;
  structureless: number;
  guidance_applied: number;
  guidance_eligible: number;
  guidance_reordered: number;
}

function measure(arm: string, run: ReturnType<typeof runTasteBenchmark>): ArmMetrics {
  const ownership = BrandDNAOwnership.aggregate(run.ownership);
  const originality = CreativeOriginalityMatrix.aggregate(run.originality);
  const memory = MemoryPatternEvaluator.aggregate(run.memoryPatterns);
  const decisions = CreativeDirectorDecisionEngine.aggregate(run.decisions);
  const structures = PatternExtractor.aggregate(run.structures);
  const decided = run.decisions.length || 1;

  return {
    arm,
    recommended: run.rankings.filter((r) => r.recommended).length,
    brand_ownership_rate: ownership.ownership_rate,
    mean_ownership: ownership.mean_ownership,
    originality: originality.mean_score,
    breakthrough: originality.by_type.BREAKTHROUGH,
    memorability: memory.mean_total,
    // "Approval" is PURSUE or MODIFY: work a director would take forward, as
    // distinct from work they would make unchanged.
    approval_rate: Number(((decisions.pursue + decisions.modify) / decided).toFixed(3)),
    pursue: decisions.pursue,
    modify: decisions.modify,
    reject: decisions.reject,
    distinct_structures: Object.values(structures.by_structure).filter((n) => n > 0).length,
    structureless: structures.structureless,
    guidance_applied: run.guidanceApplied,
    guidance_eligible: run.guidanceEligible,
    guidance_reordered: run.guidanceReordered,
  };
}

function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".memory-ab";
  const { dataset_id, cases } = loadConceptBenchmark();

  console.log(`A/B on ${cases.length} briefs — ${dataset_id}\n`);

  const without = measure("without memory", runTasteBenchmark(cases, { useTasteMemory: false }));
  const with_ = measure("with memory", runTasteBenchmark(cases, { useTasteMemory: true }));

  const bar = "=".repeat(74);
  console.log(bar);
  console.log("TASTE MEMORY A/B");
  console.log(bar);

  const rows: [string, keyof ArmMetrics, (v: number) => string][] = [
    ["recommended ideas", "recommended", (v) => `${v}/100`],
    ["brand ownership rate", "brand_ownership_rate", (v) => `${(v * 100).toFixed(1)}%`],
    ["mean ownership", "mean_ownership", (v) => v.toFixed(3)],
    ["originality", "originality", (v) => v.toFixed(1)],
    ["  breakthrough ideas", "breakthrough", (v) => String(v)],
    ["memorability", "memorability", (v) => v.toFixed(1)],
    ["director approval rate", "approval_rate", (v) => `${(v * 100).toFixed(1)}%`],
    ["  pursue", "pursue", (v) => String(v)],
    ["  modify", "modify", (v) => String(v)],
    ["  reject", "reject", (v) => String(v)],
    ["distinct structures used", "distinct_structures", (v) => `${v}/5`],
    ["ideas using no device", "structureless", (v) => String(v)],
    ["briefs guidance reached", "guidance_applied", (v) => String(v)],
    ["  of those, eligible", "guidance_eligible", (v) => String(v)],
    ["  of those, reordered", "guidance_reordered", (v) => String(v)],
  ];

  console.log(`\n  ${"metric".padEnd(26)} ${"without".padStart(10)} ${"with".padStart(10)}   delta`);
  for (const [label, key, fmt] of rows) {
    const a = Number(without[key]);
    const b = Number(with_[key]);
    const d = b - a;
    const arrow = Math.abs(d) < 1e-9 ? "—" : d > 0 ? `+${fmt(d)}` : `-${fmt(Math.abs(d))}`;
    console.log(`  ${label.padEnd(26)} ${fmt(a).padStart(10)} ${fmt(b).padStart(10)}   ${arrow}`);
  }

  console.log(
    `\n  Guidance can only act where two viable candidates sit within the band. That is` +
      ` ${with_.guidance_eligible} of ${cases.length} briefs, because the stress tests leave most` +
      ` cases with exactly one candidate.`
  );
  console.log("\n  note: guidance is a tie-break inside a four-point band, with a novelty reserve");
  console.log("        and saturation suppression on top. A small delta is the design working: a");
  console.log("        memory constrained not to become a formula cannot also transform a run.");
  console.log("        A large movement here would mean a constraint is leaking.");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify({ dataset_id, without, with: with_ }, null, 2)
  );
  console.log(`\nWrote report.json to ${outDir}/`);
}

if (require.main === module) main();
