import fs from "fs";
import path from "path";
import { CreativeDirectorAttentionEngine } from "./reasoning/CreativeDirectorAttentionEngine";
import { CreativeDirectorDecisionEngine } from "./reasoning/CreativeDirectorDecisionEngine";
import { CreativeOriginalityMatrix } from "./reasoning/CreativeOriginalityMatrix";
import { MemoryPatternEvaluator } from "./reasoning/MemoryPatternEvaluator";
import { RankedIdea } from "./reasoning/creative-taste.types";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * Phase 4.0.6 — score ranking alone, against score plus taste intelligence.
 *
 *   npx tsx lib/image-engine/run-attention-ab.ts [--out DIR]
 *
 * Both arms are the *same run*. The attention engine changes no score and
 * overrides no metric, so a second execution would produce byte-identical
 * rankings — the comparison is not between two pipelines but between two ways of
 * reading one.
 *
 *   before  the director sees rank 1, and nothing else
 *   after   the director sees rank 1, plus whatever attention flagged
 *
 * How each metric is defined, and what it can carry
 * ------------------------------------------------
 *   director agreement   Of the ideas surfaced, the share the decision engine
 *                        did not reject. For the "before" arm this is the
 *                        approval rate of rank 1.
 *   memorable discovery  Ideas scoring in the top decile on `MemoryPatternEvaluator`
 *                        that rank 1 was not, and attention surfaced.
 *   breakthrough detect  Ideas the originality matrix calls BREAKTHROUGH that
 *                        rank 1 was not, and attention surfaced.
 *   false positive       Flagged, and the decision engine rejected it.
 *
 * The honest caveat, stated once and meant
 * ---------------------------------------
 * "Director agreement" is agreement with `CreativeDirectorDecisionEngine`, which
 * is a model built in Phase 4.0.4.1 out of the same proxies. Attention and the
 * decision engine share upstream inputs, so a high agreement number is partly
 * two instruments agreeing with themselves. It is worth reporting because
 * *disagreement* is still informative — an idea attention rates and the decision
 * engine rejects is a genuine tension between two readings — and it is not worth
 * reading as a measurement of taste.
 */

interface ArmMetrics {
  arm: string;
  surfaced: number;
  agreed: number;
  agreement_rate: number;
  memorable_discovered: number;
  breakthrough_discovered: number;
  false_positives: number;
  false_positive_rate: number;
}

/** Top-decile memorability across every idea generated in the run. */
function memorabilityCut(all: RankedIdea[]): number {
  const scores = all.map((r) => r.memory?.total ?? 0).sort((a, b) => b - a);
  if (!scores.length) return Infinity;
  return scores[Math.max(0, Math.floor(scores.length * 0.1) - 1)];
}

function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".attention-ab";
  const { dataset_id, cases } = loadConceptBenchmark();

  console.log(`Attention A/B on ${cases.length} briefs — ${dataset_id}\n`);
  const run = runTasteBenchmark(cases, { useTasteMemory: true });

  const allIdeas = run.rankings.flatMap((r) => r.ranked);
  const cut = memorabilityCut(allIdeas);

  // The decision engine's verdict on any idea, computed once per idea it is
  // asked about. Attention surfaces ideas the run never decided on, so the
  // comparison needs a verdict for those too.
  const verdictCache = new Map<string, string>();
  const verdictFor = (idea: RankedIdea, caseId: string, truth: string, territory: any): string => {
    const key = `${caseId}::${idea.idea}`;
    const hit = verdictCache.get(key);
    if (hit) return hit;
    const d = CreativeDirectorDecisionEngine.decide(idea, {
      case_id: caseId,
      human_truth: truth,
      territory,
    });
    verdictCache.set(key, d.decision);
    return d.decision;
  };

  const before: ArmMetrics = {
    arm: "score ranking only",
    surfaced: 0,
    agreed: 0,
    agreement_rate: 0,
    memorable_discovered: 0,
    breakthrough_discovered: 0,
    false_positives: 0,
    false_positive_rate: 0,
  };
  const after: ArmMetrics = { ...before, arm: "score + taste intelligence" };

  run.rankings.forEach((ranking, i) => {
    if (!ranking.ranked.length) return;
    const row = run.rows[i];
    const truth = row?.human_truth || "";
    const territory = row?.territory ?? null;
    const report = run.attention[i];
    // What a director is actually shown is the *recommended* idea — the highest
    // ranked one that survived the stress tests — not rank 1, which is often
    // disqualified. Comparing against rank 1 would flatter the attention layer
    // by giving the baseline an idea nobody would have been offered.
    const top = ranking.recommended ?? ranking.ranked[0];

    // ── before: rank 1 only ────────────────────────────────────────────
    before.surfaced++;
    const topVerdict = verdictFor(top, ranking.case_id, truth, territory);
    if (topVerdict !== "REJECT") before.agreed++;
    else before.false_positives++;

    // ── after: rank 1, plus whatever attention flagged ──────────────────
    after.surfaced++;
    if (topVerdict !== "REJECT") after.agreed++;
    else after.false_positives++;

    const flaggedIdeas = new Set((report?.flags || []).map((f) => f.idea));
    for (const idea of ranking.ranked) {
      if (!flaggedIdeas.has(idea.idea) || idea.idea === top.idea) continue;
      // A flagged idea that the ranking already disqualified is not a discovery;
      // it is a rejected idea being shown twice.
      if (idea.disqualified_by) continue;
      after.surfaced++;
      const v = verdictFor(idea, ranking.case_id, truth, territory);
      if (v !== "REJECT") after.agreed++;
      else after.false_positives++;

      // Discovery is only discovery if rank 1 did not already have it.
      const mem = idea.memory?.total ?? 0;
      if (mem >= cut && (top.memory?.total ?? 0) < cut) after.memorable_discovered++;
      if (
        idea.originality?.originality_type === "BREAKTHROUGH" &&
        top.originality?.originality_type !== "BREAKTHROUGH"
      ) {
        after.breakthrough_discovered++;
      }
    }
  });

  for (const arm of [before, after]) {
    arm.agreement_rate = Number((arm.agreed / (arm.surfaced || 1)).toFixed(3));
    arm.false_positive_rate = Number((arm.false_positives / (arm.surfaced || 1)).toFixed(3));
  }

  const bar = "=".repeat(74);
  console.log(bar);
  console.log("TASTE INTELLIGENCE A/B");
  console.log(bar);

  const rows: [string, keyof ArmMetrics, (v: number) => string][] = [
    ["ideas surfaced", "surfaced", (v) => String(v)],
    ["director agreement", "agreement_rate", (v) => `${(v * 100).toFixed(1)}%`],
    ["  agreed", "agreed", (v) => String(v)],
    ["memorable discovered", "memorable_discovered", (v) => String(v)],
    ["breakthrough discovered", "breakthrough_discovered", (v) => String(v)],
    ["false positive rate", "false_positive_rate", (v) => `${(v * 100).toFixed(1)}%`],
    ["  false positives", "false_positives", (v) => String(v)],
  ];

  console.log(`\n  ${"metric".padEnd(26)} ${"before".padStart(10)} ${"after".padStart(10)}   delta`);
  for (const [label, key, fmt] of rows) {
    const a = Number(before[key]);
    const b = Number(after[key]);
    const d = b - a;
    const arrow = Math.abs(d) < 1e-9 ? "—" : d > 0 ? `+${fmt(d)}` : `-${fmt(Math.abs(d))}`;
    console.log(`  ${label.padEnd(26)} ${fmt(a).padStart(10)} ${fmt(b).padStart(10)}   ${arrow}`);
  }

  console.log("\n" + CreativeDirectorAttentionEngine.format(CreativeDirectorAttentionEngine.aggregate(run.attention)));
  console.log("\n" + run.graph.format());

  console.log("\n  note: 'director agreement' is agreement with CreativeDirectorDecisionEngine, which");
  console.log("        is a model built from the same proxies. A high number is partly two");
  console.log("        instruments agreeing with themselves; the disagreements are the informative");
  console.log("        part. Rankings are byte-identical in both arms — attention changes no score.");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(
      {
        dataset_id,
        before,
        after,
        attention: CreativeDirectorAttentionEngine.aggregate(run.attention),
        graph: run.graph.aggregate(),
        memorability_cut: cut,
      },
      null,
      2
    )
  );
  console.log(`\nWrote report.json to ${outDir}/`);
}

if (require.main === module) main();
