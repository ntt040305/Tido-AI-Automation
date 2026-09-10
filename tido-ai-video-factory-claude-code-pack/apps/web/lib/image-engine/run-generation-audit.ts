import { EmotionalMechanismExtractor } from "./reasoning/EmotionalMechanismExtractor";
import { PatternExtractor } from "./reasoning/PatternExtractor";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * Phase 4.0.7 Task 1 — where the candidates actually come from.
 *
 *   npx tsx lib/image-engine/run-generation-audit.ts
 *
 * Read-only. Nothing here changes generation; it exists to establish the facts
 * the rest of the phase is designed against, because every previous phase that
 * started from a guess about the generator ended up fixing the wrong thing.
 */

const { cases } = loadConceptBenchmark();
const run = runTasteBenchmark(cases, { useTasteMemory: false });

const bar = "=".repeat(74);
console.log(bar);
console.log("GENERATION AUDIT — Phase 4.0.7 Task 1");
console.log(bar);

// ── Ideas per brief, and per territory ────────────────────────────────────
const perBrief = run.rankings.map((r) => r.ranked.length);
const withTerritory = run.rows.filter((r) => r.territory).length;
const total = perBrief.reduce((a, b) => a + b, 0);
console.log("\nPOPULATION");
console.log(`  briefs                     : ${run.rows.length}`);
console.log(`  ideas generated            : ${total}`);
console.log(`  ideas per brief            : ${(total / run.rows.length).toFixed(2)}`);
console.log(`  briefs with a territory    : ${withTerritory}`);
console.log(`  territories per brief      : ${(withTerritory / run.rows.length).toFixed(2)}`);
console.log(`  ideas per territory        : ${(total / (withTerritory || 1)).toFixed(2)}`);
const dist: Record<number, number> = {};
for (const n of perBrief) dist[n] = (dist[n] || 0) + 1;
console.log(`  ideas-per-brief histogram  : ${JSON.stringify(dist)}`);

// ── Expression mode distribution ──────────────────────────────────────────
const modes: Record<string, number> = {};
for (const r of run.rankings) for (const x of r.ranked) modes[x.mode] = (modes[x.mode] || 0) + 1;
console.log("\nEXPRESSION MODES (all generated ideas)");
for (const [m, n] of Object.entries(modes).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${m.padEnd(26)} ${String(n).padStart(4)}  ${((n / total) * 100).toFixed(1)}%`);
}

// ── Structures and mechanisms ─────────────────────────────────────────────
const structureAgg = PatternExtractor.aggregate(run.structures);
console.log("\nCREATIVE STRUCTURES");
for (const [s, n] of Object.entries(structureAgg.by_structure).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(26)} ${String(n).padStart(4)}  ${((n / total) * 100).toFixed(1)}%`);
}
console.log(`  no device at all           ${String(structureAgg.structureless).padStart(4)}`);

const mechAgg = EmotionalMechanismExtractor.aggregate(run.mechanisms);
console.log("\nEMOTIONAL MECHANISMS");
for (const [m, n] of Object.entries(mechAgg.by_mechanism).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${m.padEnd(26)} ${String(n).padStart(4)}  ${((n / total) * 100).toFixed(1)}%`);
}
console.log(`  mean confidence            ${mechAgg.mean_confidence.toFixed(3)}`);
console.log(`  components the idea supplied itself: ${JSON.stringify(mechAgg.self_supplied)}`);

// ── Where recognition comes from ──────────────────────────────────────────
// The phase names this specifically: recognition is overproduced and survives
// worst, so the question is which mode is manufacturing it.
console.log("\nRECOGNITION, BY THE MODE THAT PRODUCED IT");
const recogByMode: Record<string, number> = {};
const modeTotals: Record<string, number> = {};
let i = 0;
for (const r of run.rankings) {
  for (const x of r.ranked) {
    const mech = run.mechanisms[i++];
    modeTotals[x.mode] = (modeTotals[x.mode] || 0) + 1;
    if (mech?.mechanism === "recognition") recogByMode[x.mode] = (recogByMode[x.mode] || 0) + 1;
  }
}
for (const [m, n] of Object.entries(recogByMode).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${m.padEnd(26)} ${String(n).padStart(4)} of ${String(modeTotals[m]).padStart(3)}  ${((n / modeTotals[m]) * 100).toFixed(0)}% of that mode`);
}

// ── Rejected generation patterns ──────────────────────────────────────────
console.log("\nMOST COMMON REASONS AN IDEA IS DISQUALIFIED");
const dq: Record<string, number> = {};
let disqualified = 0;
for (const r of run.rankings) {
  for (const x of r.ranked) {
    if (!x.disqualified_by) continue;
    disqualified++;
    for (const f of x.disqualified_by) dq[f] = (dq[f] || 0) + 1;
  }
}
console.log(`  disqualified               : ${disqualified} of ${total} (${((disqualified / total) * 100).toFixed(0)}%)`);
for (const [k, n] of Object.entries(dq).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(26)} ${String(n).padStart(4)}`);
}

console.log("\nSTRESS TESTS, ACROSS EVERY GENERATED IDEA");
const stressFail: Record<string, number> = {};
for (const s of run.allStress) for (const f of s.failures) stressFail[f] = (stressFail[f] || 0) + 1;
for (const [k, n] of Object.entries(stressFail).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(26)} ${String(n).padStart(4)}  ${((n / total) * 100).toFixed(0)}% fail`);
}

// ── Duplication ───────────────────────────────────────────────────────────
console.log("\nDUPLICATION");
const seen = new Map<string, number>();
for (const r of run.rankings) for (const x of r.ranked) seen.set(x.idea, (seen.get(x.idea) || 0) + 1);
const dupes = [...seen.values()].filter((n) => n > 1).length;
console.log(`  distinct idea strings      : ${seen.size} of ${total}`);
console.log(`  strings appearing twice+   : ${dupes}`);

// Frame-level duplication: how many ideas reduce to the same skeleton.
const frames = new Map<string, number>();
for (const r of run.rankings) {
  for (const x of r.ranked) {
    const frame = x.idea
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .map((w) => (w.length <= 3 ? w : "·"))
      .join(" ")
      .slice(0, 60);
    frames.set(frame, (frames.get(frame) || 0) + 1);
  }
}
const topFrames = [...frames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`  distinct frames            : ${frames.size}`);
console.log("  most reused frames:");
for (const [f, n] of topFrames) console.log(`    ${String(n).padStart(3)}×  ${f.slice(0, 52)}`);

console.log("\n" + bar);
