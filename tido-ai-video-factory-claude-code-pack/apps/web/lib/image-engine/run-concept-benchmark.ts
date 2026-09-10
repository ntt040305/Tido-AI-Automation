import fs from "fs";
import path from "path";
import { IMAGE_ENGINE_CONFIG } from "./config";
import { CampaignBriefInput } from "./campaign/campaign.types";
import { AdversarialConceptTester, AdversarialResult } from "./reasoning/AdversarialConceptTester";
import { CiosReasoningShadowService } from "./reasoning/CiosReasoningShadowService";
import { CreativeDiversityController } from "./reasoning/CreativeDiversityController";
import { CreativeQualityBenchmark } from "./reasoning/CreativeQualityBenchmark";
import { CreativeGateResult, CreativeQualityGate } from "./reasoning/CreativeQualityGate";
import { ConceptQualityGate } from "./reasoning/ConceptQualityGate";
import { CreativeQualityScore, CreativeSynthesisInput, CreativeSynthesisOutput } from "./reasoning/creative-synthesis.types";

/**
 * Phase 4.0.2 — the creative concept benchmark.
 *
 *   npx tsx lib/image-engine/run-concept-benchmark.ts [--out DIR] [--limit N]
 *
 * One hundred briefs, one diversity controller across all of them, and a quality
 * gate between the concept and art direction. Reports the measured and proxied
 * halves of the rubric separately throughout, because three of its five
 * dimensions are proxies and a blended total hides which sixty points those are.
 */

export interface ConceptBenchmarkCase {
  case_id: string;
  industry: string;
  creative_challenge: string;
  must_avoid: string[];
  brief: CampaignBriefInput;
}

export function loadConceptBenchmark(file?: string): { dataset_id: string; cases: ConceptBenchmarkCase[] } {
  const p = file || path.join(path.dirname(IMAGE_ENGINE_CONFIG.CREATIVE_BENCHMARK_PATH), "creative_concept_benchmark_v1.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  return { dataset_id: raw.dataset_id, cases: raw.cases };
}

/**
 * Diversity of what the run actually delivered.
 *
 * `CreativeDiversityController` measures the idea the *generator* chose, which is
 * the right thing for it to measure — it exists to suppress repetition during
 * generation. But the gate and the adversarial pass then replace that idea on
 * most cases, and their replacements rank by score with no view of the run. On
 * the first hundred-brief run the controller reported 79 distinct of 93 while the
 * delivered set held 52 distinct of 100. Reporting only the controller's figure
 * would have described a stage of the pipeline rather than its output.
 */
export function deliveredDiversity(rows: ConceptBenchmarkRow[]): {
  ideas: number;
  empty: number;
  distinct_ideas: number;
  diversity_ratio: number;
  angle_distribution: Record<string, number>;
  most_repeated?: { idea: string; count: number };
} {
  const nonEmpty = rows.map((r) => r.big_idea.trim()).filter(Boolean);
  const counts = new Map<string, number>();
  for (const i of nonEmpty) counts.set(i, (counts.get(i) || 0) + 1);
  const angles: Record<string, number> = {};
  for (const r of rows) if (r.big_idea.trim()) angles[r.angle] = (angles[r.angle] || 0) + 1;
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    ideas: nonEmpty.length,
    empty: rows.length - nonEmpty.length,
    distinct_ideas: counts.size,
    diversity_ratio: nonEmpty.length ? Number((counts.size / nonEmpty.length).toFixed(3)) : 0,
    angle_distribution: angles,
    most_repeated: top && top[1] > 1 ? { idea: top[0], count: top[1] } : undefined,
  };
}

export interface ConceptBenchmarkRow {
  case_id: string;
  industry: string;
  big_idea: string;
  angle: string;
  gate: CreativeGateResult;
  adversarial: AdversarialResult;
  contaminated: boolean;
}

export function runConceptBenchmark(cases: ConceptBenchmarkCase[]): {
  rows: ConceptBenchmarkRow[];
  diversity: CreativeDiversityController;
  scores: CreativeQualityScore[];
} {
  const diversity = new CreativeDiversityController();
  const rows: ConceptBenchmarkRow[] = [];
  const scores: CreativeQualityScore[] = [];
  const priorIdeas: string[] = [];

  for (const c of cases) {
    const r = CiosReasoningShadowService.run(
      { brief: c.brief, diversity, avoidPhrases: c.must_avoid },
      true
    );
    if (!r.enabled) continue;

    const chain = (r.concept_trace as { reasoning_chain?: Record<string, { value: string }> }).reasoning_chain;
    const input: CreativeSynthesisInput = {
      human_tension: chain?.human_tension?.value || r.concept.audience_tension,
      consumer_insight: chain?.consumer_insight?.value || r.concept.consumer_insight,
      campaign_territory: chain?.campaign_territory?.value || "",
      brand_objective: c.brief.objective || "",
      differentiation: r.concept.differentiation || "",
      audience: c.brief.audience || "",
      industry: c.industry,
      avoid: c.must_avoid,
    };
    const concept: CreativeSynthesisOutput = {
      big_idea: r.concept.big_idea,
      why_it_works: r.concept.story_angle || "",
      emotional_hook: r.concept.emotional_goal || "",
      strategic_reason: r.concept.brand_role || "",
      originality_score: 0,
      angle: "RECOGNITION",
      derived_from: r.concept.derived_from,
    };

    const gate = CreativeQualityGate.evaluate(c.case_id, concept, input, c.creative_challenge, priorIdeas);
    const adversarial = AdversarialConceptTester.run(
      c.case_id,
      gate.concept,
      input,
      c.creative_challenge,
      c.brief.product,
      priorIdeas
    );

    const final = adversarial.improved || gate.concept;
    priorIdeas.push(final.big_idea);
    scores.push(CreativeQualityBenchmark.score(c.case_id, final, input, c.creative_challenge, priorIdeas.slice(0, -1)));

    const v = ConceptQualityGate.validate(r.concept, undefined, true);
    rows.push({
      case_id: c.case_id,
      industry: c.industry,
      big_idea: final.big_idea,
      angle: final.angle,
      gate,
      adversarial,
      contaminated: v.violations.some((x) => !["MISSING_BIG_IDEA", "INCOMPLETE_CONCEPT"].includes(x.kind)),
    });
  }

  return { rows, diversity, scores };
}

function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".concept-benchmark";
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : undefined;

  const { dataset_id, cases } = loadConceptBenchmark();
  const selected = limit ? cases.slice(0, limit) : cases;
  console.log(`Running ${selected.length} briefs…\n`);

  const { rows, diversity, scores } = runConceptBenchmark(selected);
  const gateSummary = CreativeQualityGate.summarise(rows.map((r) => r.gate));
  const advSummary = AdversarialConceptTester.summarise(rows.map((r) => r.adversarial));
  const quality = CreativeQualityBenchmark.aggregate(scores);
  const div = diversity.metrics();

  const bar = "=".repeat(72);
  console.log(bar);
  console.log(`CREATIVE CONCEPT BENCHMARK — ${dataset_id} · ${rows.length} briefs`);
  console.log(bar);

  console.log("\n" + CreativeQualityBenchmark.format(quality));

  console.log("\nQUALITY GATE");
  console.log(`  pass ${gateSummary.passed} · refined ${gateSummary.refined} · rejected ${gateSummary.rejected}`);
  console.log(`  pass rate (pass or refined) : ${(gateSummary.pass_rate * 100).toFixed(0)}%`);
  console.log(`  material failures           : ${gateSummary.material_failures}`);
  console.log(`  construction failures       : ${gateSummary.construction_failures}`);
  console.log(`  weakest dimension           : ${gateSummary.weakest_dimension}`);

  const delivered = deliveredDiversity(rows);
  console.log("\nDIVERSITY — delivered (what the run output)");
  console.log(`  distinct ideas       : ${delivered.distinct_ideas} / ${delivered.ideas}  (ratio ${delivered.diversity_ratio})`);
  if (delivered.empty) console.log(`  briefs with no idea  : ${delivered.empty}`);
  console.log(`  angle distribution   : ${JSON.stringify(delivered.angle_distribution)}`);
  if (delivered.most_repeated) {
    console.log(`  most repeated (${delivered.most_repeated.count}x) : "${delivered.most_repeated.idea.slice(0, 68)}"`);
  }

  console.log("\nDIVERSITY — in generation (before the gate replaced ideas)");
  console.log(`  distinct ideas       : ${div.distinct_ideas} / ${div.ideas}  (ratio ${div.diversity_ratio})`);
  console.log(`  distinct territories : ${div.distinct_territories}`);
  console.log(`  distinct tensions    : ${div.distinct_tensions}`);
  console.log(`  angle distribution   : ${JSON.stringify(div.angle_distribution)}`);

  console.log("\nADVERSARIAL");
  console.log(`  survived      : ${advSummary.survived} / ${advSummary.cases}`);
  console.log(`  improved      : ${advSummary.improved}`);
  console.log(`  unrepairable  : ${advSummary.unrepairable}`);
  console.log(`  mean pressure : ${advSummary.mean_pressure}`);
  console.log(`  attacks       : ${JSON.stringify(advSummary.by_attack)}`);

  console.log("\nCONTAMINATION");
  console.log(`  concepts carrying execution language: ${rows.filter((r) => r.contaminated).length} / ${rows.length}`);

  const byIndustry: Record<string, number[]> = {};
  for (let i = 0; i < rows.length; i++) {
    (byIndustry[rows[i].industry] ||= []).push(scores[i].total);
  }
  console.log("\nBY INDUSTRY");
  for (const [ind, xs] of Object.entries(byIndustry).sort()) {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(`  ${ind.padEnd(16)} n=${String(xs.length).padStart(3)}  ${m.toFixed(1)} / 100`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(
      { dataset_id, quality, gate: gateSummary, adversarial: advSummary, diversity: div, delivered_diversity: delivered, rows },
      null,
      2
    )
  );
  console.log(`\nWrote report.json to ${outDir}/`);
}

if (require.main === module) main();
