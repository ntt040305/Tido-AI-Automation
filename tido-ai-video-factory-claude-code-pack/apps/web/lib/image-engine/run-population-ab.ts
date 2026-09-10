import fs from "fs";
import path from "path";
import { CandidatePopulationBuilder } from "./reasoning/CandidatePopulationBuilder";
import { CandidateSelfContainment } from "./reasoning/CandidateSelfContainment";
import { EmotionalMechanismExtractor } from "./reasoning/EmotionalMechanismExtractor";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * Phase 4.0.7 Task 8 — the same judges, a different population.
 *
 *   npx tsx lib/image-engine/run-population-ab.ts [--out DIR]
 *
 * Both arms run the identical benchmark: the same hundred briefs, the same
 * insight layers, the same taste engine, director model, stress tests, ownership
 * verdicts, originality matrix and decision engine, at the same thresholds. The
 * only difference between them is where the candidates came from.
 *
 *   before — one territory, the six expression modes fired once each
 *   after  — a planned search across several territories, every structure and
 *            every mechanism as directions, a third of it undirected
 *
 * That is the whole design of this measurement. No rubric moved during the
 * phase, so a difference between the arms is a difference in the work being
 * judged rather than in the judging.
 *
 * One caveat that belongs next to the numbers rather than in a footnote: the
 * deterministic provider's constructions were written to two rules — rest on
 * something the brief supplied, and resolve in one short clause — that
 * REPLACE_BRAND and FIRST_REACTION also measure. Movement on those two tests is
 * therefore partly endogenous. Director approval, PURSUE rate and the mechanism
 * reading were not written against and are the numbers to trust.
 */

interface Arm {
  arm: string;
  briefs: number;
  ideas: number;
  ideas_per_brief: number;
  territories_per_brief: number;
  /**
   * Briefs the director did not reject: PURSUE or MODIFY on the recommended idea.
   *
   * This is the definition the phase's own baseline used — 4 of 100 before this
   * phase — and it is the one to report. An earlier draft of this script counted
   * briefs where *any* idea survived the stress tests, which reads 45% on the
   * before arm and measures something else entirely: whether a pool contained a
   * legal idea, not whether a director would take one forward.
   */
  approved: number;
  approval_rate: number;
  /** Briefs where at least one idea cleared the hard stress tests. Not approval. */
  survivable: number;
  /**
   * How far the recommended idea sits from the human truth, banded.
   *
   * The one non-monotonic reading in the codebase: TRANSFORMED is the target,
   * ECHO is a restatement and DISCONNECTED is a non-sequitur, and both ends are
   * failures. Reported per arm because a rebuild can move an idea off one end
   * and straight onto the other, which would show as progress on every other
   * measure here.
   */
  bands: Record<string, number>;
  pursue: number;
  modify: number;
  reject: number;
  pursue_rate: number;
  mean_mechanism_confidence: number;
  mechanismless: number;
  mechanismless_rate: number;
  /** Briefs where at least one idea landed in the BREAKTHROUGH quadrant. */
  breakthrough_briefs: number;
  distinct_ideas: number;
  duplicate_rate: number;
}

function measure(arm: string, run: ReturnType<typeof runTasteBenchmark>): Arm {
  const ideas = run.rankings.flatMap((r) => r.ranked);
  const mech = EmotionalMechanismExtractor.aggregate(run.mechanisms);

  const survivable = run.rankings.filter((r) => r.recommended && !r.recommended.disqualified_by).length;

  const decisions = run.decisions;
  const pursue = decisions.filter((d) => d.decision === "PURSUE").length;
  const modify = decisions.filter((d) => d.decision === "MODIFY").length;
  const reject = decisions.filter((d) => d.decision === "REJECT").length;
  // Not rejected, over all hundred briefs — including the briefs that produced no
  // decision at all, because a brief the director was never shown an idea for is
  // not a brief they approved.
  const approved = pursue + modify;

  // A breakthrough is counted per brief, not per idea: twelve breakthroughs on
  // one brief and none on the other ninety-nine is not ten briefs' worth of
  // discovery, and counting ideas would let a larger pool inflate it for free.
  const breakthroughBriefs = run.rankings.filter((r) =>
    r.ranked.some((x) => x.originality?.originality_type === "BREAKTHROUGH")
  ).length;

  const bands: Record<string, number> = {};
  for (const d of run.decisions) {
    const b = d.interpretation.band;
    bands[b] = (bands[b] || 0) + 1;
  }

  const distinct = new Set(ideas.map((x) => x.idea)).size;
  const territories = new Set<string>();
  for (const x of ideas) if (x.territory) territories.add(`${x.territory}`);

  const perBriefTerritories =
    run.rankings.reduce((t, r) => t + new Set(r.ranked.map((x) => x.territory).filter(Boolean)).size, 0) /
    (run.rankings.length || 1);

  return {
    arm,
    briefs: run.rows.length,
    ideas: ideas.length,
    ideas_per_brief: Number((ideas.length / (run.rows.length || 1)).toFixed(2)),
    territories_per_brief: Number(perBriefTerritories.toFixed(2)),
    approved,
    approval_rate: Number(((approved / (run.rows.length || 1)) * 100).toFixed(1)),
    survivable,
    pursue,
    modify,
    reject,
    pursue_rate: Number(((pursue / (decisions.length || 1)) * 100).toFixed(1)),
    mean_mechanism_confidence: mech.mean_confidence,
    mechanismless: mech.mechanismless,
    mechanismless_rate: Number(((mech.mechanismless / (run.mechanisms.length || 1)) * 100).toFixed(1)),
    breakthrough_briefs: breakthroughBriefs,
    bands,
    distinct_ideas: distinct,
    duplicate_rate: Number((1 - distinct / (ideas.length || 1)).toFixed(3)),
  };
}

const TARGETS: { label: string; key: keyof Arm; target: number; unit: string }[] = [
  { label: "director approval", key: "approval_rate", target: 25, unit: "%" },
  { label: "PURSUE rate", key: "pursue_rate", target: 10, unit: "%" },
  { label: "mean mechanism confidence", key: "mean_mechanism_confidence", target: 0.5, unit: "" },
  { label: "breakthrough briefs", key: "breakthrough_briefs", target: 10, unit: "/100" },
];

function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".population-ab";
  const { dataset_id, cases } = loadConceptBenchmark();

  console.log(`Population A/B on ${cases.length} briefs — ${dataset_id}`);
  console.log("Evaluators, rubrics and thresholds identical in both arms.\n");

  const before = measure(
    "before — six modes, one territory",
    runTasteBenchmark(cases, { useTasteMemory: false, legacyGeneration: true })
  );
  const after = measure(
    "after — planned search, several territories",
    runTasteBenchmark(cases, { useTasteMemory: false })
  );

  // Generation-side diagnostics, which exist only on the new path.
  const pooled = runTasteBenchmark(cases, { useTasteMemory: false });
  const pools = pooled.populations.filter(Boolean) as NonNullable<(typeof pooled.populations)[number]>[];
  const healthy = pools.filter((p) => p.diagnosis.healthy).length;
  const containment = {
    checked: pools.reduce((t, p) => t + p.containment.checked, 0),
    contained: pools.reduce((t, p) => t + p.containment.contained, 0),
    retried: pools.reduce((t, p) => t + p.containment.retried, 0),
    recovered: pools.reduce((t, p) => t + p.containment.recovered, 0),
    dropped: pools.reduce((t, p) => t + p.containment.dropped, 0),
  };

  const bar = "=".repeat(78);
  const row = (label: string, a: unknown, b: unknown) =>
    console.log(`  ${label.padEnd(30)} ${String(a).padStart(12)} ${String(b).padStart(12)}`);

  console.log(bar);
  console.log(`  ${"".padEnd(30)} ${"BEFORE".padStart(12)} ${"AFTER".padStart(12)}`);
  console.log(bar);
  row("ideas generated", before.ideas, after.ideas);
  row("ideas per brief", before.ideas_per_brief, after.ideas_per_brief);
  row("territories per brief", before.territories_per_brief, after.territories_per_brief);
  row("distinct idea strings", before.distinct_ideas, after.distinct_ideas);
  row("duplicate rate", before.duplicate_rate, after.duplicate_rate);
  console.log("");
  row("director approval", `${before.approval_rate}%`, `${after.approval_rate}%`);
  row("  (of which: any idea legal)", `${before.survivable}`, `${after.survivable}`);
  row("PURSUE", before.pursue, after.pursue);
  row("MODIFY", before.modify, after.modify);
  row("REJECT", before.reject, after.reject);
  row("PURSUE rate", `${before.pursue_rate}%`, `${after.pursue_rate}%`);
  console.log("");
  row("mean mechanism confidence", before.mean_mechanism_confidence, after.mean_mechanism_confidence);
  row("ideas carrying no mechanism", before.mechanismless, after.mechanismless);
  row("mechanismless rate", `${before.mechanismless_rate}%`, `${after.mechanismless_rate}%`);
  row("briefs with a breakthrough", before.breakthrough_briefs, after.breakthrough_briefs);
  console.log("");
  console.log("  distance from the human truth (recommended idea, of decisions made):");
  for (const band of ["ECHO", "LITERAL", "TRANSFORMED", "OBLIQUE", "DISCONNECTED"]) {
    row(`  ${band}`, before.bands[band] || 0, after.bands[band] || 0);
  }

  console.log("\n" + bar);
  console.log("TARGETS");
  console.log(bar);
  for (const t of TARGETS) {
    const v = after[t.key] as number;
    const b = before[t.key] as number;
    const met = v >= t.target;
    console.log(
      `  ${t.label.padEnd(30)} ${String(b).padStart(8)} → ${String(v).padStart(8)}${t.unit}   ` +
        `target ${t.target}${t.unit}  ${met ? "MET" : "NOT MET"}`
    );
  }
  const mlMet = after.mechanismless_rate < 15;
  console.log(
    `  ${"mechanismless".padEnd(30)} ${String(before.mechanismless_rate).padStart(8)} → ` +
      `${String(after.mechanismless_rate).padStart(8)}%   target <15%  ${mlMet ? "MET" : "NOT MET"}`
  );

  console.log("\n" + bar);
  console.log("GENERATION-SIDE DIAGNOSTICS (new path only — not scored, not ranked)");
  console.log(bar);
  console.log(`  pools built                    : ${pools.length}`);
  console.log(`  pools meeting POOL_TARGETS     : ${healthy}`);
  console.log(`  cold readings performed        : ${containment.checked}`);
  console.log(`  read cold on the first attempt : ${containment.contained}`);
  console.log(`  retried on another direction   : ${containment.retried}`);
  console.log(`  recovered by the retry         : ${containment.recovered}`);
  console.log(`  dropped before any evaluator   : ${containment.dropped}`);

  // ── Why PURSUE is zero ────────────────────────────────────────────────
  // PURSUE requires every one of the decision engine's six stages to return
  // SUPPORTS. Zero PURSUE across two populations that differ by every other
  // measure is a fact about the gate rather than about the ideas, and the only
  // way to tell which stage is holding it shut is to count them.
  const stageWeak: Record<string, number> = {};
  const stageBlock: Record<string, number> = {};
  const weakCount: Record<number, number> = {};
  for (const d of pooled.decisions) {
    let weak = 0;
    for (const s of d.chain) {
      if (s.verdict === "WEAKENS") {
        stageWeak[s.stage] = (stageWeak[s.stage] || 0) + 1;
        weak++;
      }
      if (s.verdict === "BLOCKS") stageBlock[s.stage] = (stageBlock[s.stage] || 0) + 1;
    }
    weakCount[weak] = (weakCount[weak] || 0) + 1;
  }

  console.log("\n" + bar);
  console.log("WHY PURSUE IS ZERO (after arm — the gate, stage by stage)");
  console.log(bar);
  console.log(`  decisions made                 : ${pooled.decisions.length}`);
  console.log("  stages returning WEAKENS:");
  for (const [k, n] of Object.entries(stageWeak).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(18)} ${String(n).padStart(4)} of ${pooled.decisions.length}`);
  }
  console.log("  stages returning BLOCKS:");
  for (const [k, n] of Object.entries(stageBlock).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(18)} ${String(n).padStart(4)}`);
  }
  console.log("  decisions by number of weak stages (0 weak and 0 blocks = PURSUE):");
  for (const [k, n] of Object.entries(weakCount).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`    ${k} weak${" ".repeat(12)} ${String(n).padStart(4)}`);
  }

  console.log("\n" + bar);
  console.log("HOW TO READ THIS");
  console.log(bar);
  console.log("  REPLACE_BRAND and FIRST_REACTION are partly endogenous: the deterministic");
  console.log("  provider was written to rest on brief-supplied material and to resolve in one");
  console.log("  short clause, which is what those two tests measure. Director approval, the");
  console.log("  PURSUE rate and the mechanism reading were not written against.");
  console.log("");
  console.log("  Every candidate in the AFTER arm came from the deterministic provider. The LLM");
  console.log("  provider is wired and tested against a stub, and its gateway has never been");
  console.log("  reachable in this environment, so it contributed nothing to these numbers.");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "population-ab.json"),
    JSON.stringify({ dataset_id, before, after, healthy_pools: healthy, containment }, null, 2)
  );
  console.log(`\nWritten to ${path.join(outDir, "population-ab.json")}`);
}

main();
