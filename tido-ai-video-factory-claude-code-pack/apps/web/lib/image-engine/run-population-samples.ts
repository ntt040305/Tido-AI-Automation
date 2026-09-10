import { CreativeInterpretationDistance } from "./reasoning/CreativeInterpretationDistance";
import { loadConceptBenchmark } from "./run-concept-benchmark";
import { runTasteBenchmark } from "./run-taste-benchmark";

/**
 * Phase 4.0.7 — the same briefs, both populations, side by side.
 *
 *   npx tsx lib/image-engine/run-population-samples.ts [N]
 *
 * Read-only. Aggregates are how a phase is judged and examples are how a claim
 * about them is checked, so this prints the sentences themselves: what the old
 * six modes produced for a brief, what the searched pool produced for the same
 * brief, and where each sits relative to the truth it was built from.
 */

const n = Number(process.argv[2] || 4);
const { cases } = loadConceptBenchmark();
const subset = cases.slice(0, Math.max(1, n));

const before = runTasteBenchmark(subset, { useTasteMemory: false, legacyGeneration: true });
const after = runTasteBenchmark(subset, { useTasteMemory: false });

const bar = "=".repeat(88);
subset.forEach((c, i) => {
  const truth = after.rows[i]?.human_truth || "";
  console.log(bar);
  console.log(`${c.case_id} — ${c.brief.brand} · ${c.brief.product}`);
  console.log(bar);
  console.log(`CHALLENGE  ${c.creative_challenge}`);
  console.log(`TRUTH      ${truth}`);

  const band = (idea: string) => CreativeInterpretationDistance.measure(idea, truth).band;

  console.log("\nBEFORE — six expression modes, one territory");
  const b = before.rankings[i];
  if (!b?.ranked.length) console.log("  (nothing generated)");
  for (const x of b?.ranked || []) {
    console.log(`  [${band(x.idea).padEnd(12)}] ${x.idea}`);
    console.log(`   ${" ".repeat(14)} mode=${x.mode}  score=${x.score}${x.disqualified_by ? `  DQ:${x.disqualified_by.join(",")}` : ""}`);
  }

  console.log("\nAFTER — planned search");
  const pop = after.populations[i];
  const a = after.rankings[i];
  if (!a?.ranked.length) console.log("  (nothing generated)");
  for (const x of a?.ranked || []) {
    console.log(`  [${band(x.idea).padEnd(12)}] ${x.idea}`);
    console.log(`   ${" ".repeat(14)} ${x.mode}  ${x.territory}  score=${x.score}${x.disqualified_by ? `  DQ:${x.disqualified_by.join(",")}` : ""}`);
  }
  if (pop) {
    console.log(
      `\n  pool: ${pop.diagnosis.candidates} candidates · ${pop.diagnosis.structures} structures · ` +
        `${pop.diagnosis.mechanisms} mechanisms · ${pop.diagnosis.territories} territories · ` +
        `unguided ${(pop.diagnosis.unguided_share * 100).toFixed(0)}% · healthy=${pop.diagnosis.healthy}`
    );
    console.log(
      `  cold read: ${pop.containment.contained}/${pop.containment.checked} first time · ` +
        `${pop.containment.retried} retried · ${pop.containment.recovered} recovered · ${pop.containment.dropped} dropped`
    );
    if (pop.notes.length) console.log(`  notes: ${pop.notes.join(" | ")}`);
  }
  console.log("");
});
