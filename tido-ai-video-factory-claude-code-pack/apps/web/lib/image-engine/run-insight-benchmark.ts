import fs from "fs";
import path from "path";
import { AdversarialConceptTester, AdversarialResult } from "./reasoning/AdversarialConceptTester";
import { CreativeDiversityController } from "./reasoning/CreativeDiversityController";
import { CreativeExpressionLayer } from "./reasoning/CreativeExpressionLayer";
import { CreativeQualityBenchmark } from "./reasoning/CreativeQualityBenchmark";
import { CreativeGateResult, CreativeQualityGate } from "./reasoning/CreativeQualityGate";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanInsightQualityGate, InsightGateResult } from "./reasoning/HumanInsightQualityGate";
import { EmotionalPowerEvaluator, EmotionalPowerResult } from "./reasoning/EmotionalPowerEvaluator";
import { HumanTruthOriginalityEvaluator, TruthOriginalityResult } from "./reasoning/HumanTruthOriginalityEvaluator";
import { HumanTruthReview, HumanTruthReviewResult } from "./reasoning/HumanTruthReview";
import { InsightContradiction, InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import { ExpressionMode, InsightExpressionModes } from "./reasoning/InsightExpressionModes";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { InsightDiversityController } from "./reasoning/InsightDiversityController";
import { OriginalityEvaluator } from "./reasoning/OriginalityEvaluator";
import { ConceptQualityGate } from "./reasoning/ConceptQualityGate";
import { CreativeLens, HumanInsight } from "./reasoning/human-insight.types";
import { CreativeQualityScore, CreativeSynthesisInput, CreativeSynthesisOutput } from "./reasoning/creative-synthesis.types";
import { ConceptBenchmarkCase, deliveredDiversity, loadConceptBenchmark } from "./run-concept-benchmark";

/**
 * Phase 4.0.3 — the insight benchmark.
 *
 *   npx tsx lib/image-engine/run-insight-benchmark.ts [--out DIR] [--limit N]
 *
 * Same hundred briefs as Phase 4.0.2, so the comparison is like for like, and the
 * same two downstream instruments — `CreativeQualityBenchmark` and
 * `AdversarialConceptTester` — so a movement in the numbers is a movement in the
 * work rather than in the measuring.
 *
 * One caveat is printed on every run and repeated here, because it is the single
 * thing most likely to be misread. `human_truth` in the 4.0.1.5 rubric is lexical
 * overlap between the tension and the brief's stated problem. The new ladder
 * takes the brief's stated problem as its first rung and derives downward, so its
 * tensions share vocabulary with the brief *by construction*. Some of any rise in
 * that number is therefore mechanical rather than earned. The run reports the
 * same score computed from three different rungs so the size of that effect is
 * visible instead of inferred.
 */

export interface InsightBenchmarkRow {
  case_id: string;
  industry: string;
  archetype: string;
  matched_archetype: boolean;
  truncated_at?: string;
  human_truth: string;
  consumer_insight: string;
  why_people_feel_this: string;
  why_now: string;
  lens?: CreativeLens;
  big_idea: string;
  insight_gate: InsightGateResult;
  truth_review: HumanTruthReviewResult;
  emotional_power: EmotionalPowerResult;
  contradiction: InsightContradiction;
  originality: TruthOriginalityResult;
  mode?: ExpressionMode;
  cultural_market?: string;
  cultural_grounding?: string;
  discovery_confidence: number;
  discovery_source?: "EXPLICIT" | "LATENT" | "EXPANDED";
  motivation_depth: number;
  discovery_restatement: number;
  creative_gate: CreativeGateResult;
  adversarial: AdversarialResult;
  contaminated: boolean;
  lenses_available: CreativeLens[];
}

/** Which rung feeds the 4.0.1.5 rubric's `human_tension` slot. */
export type TensionRung = "observed_reality" | "identity_conflict" | "hidden_emotion" | "human_truth";

function tensionFrom(insight: HumanInsight, rung: TensionRung): string {
  return HumanTensionAnalyzer.at(insight.ladder, rung)?.statement || insight.human_truth || "";
}

export function runInsightBenchmark(
  cases: ConceptBenchmarkCase[],
  opts: { tensionRung?: TensionRung } = {}
): {
  rows: InsightBenchmarkRow[];
  insightDiversity: InsightDiversityController;
  ideaDiversity: CreativeDiversityController;
  creativeScores: CreativeQualityScore[];
  insightScores: InsightGateResult[];
  truthReviews: HumanTruthReviewResult[];
  emotionalPower: EmotionalPowerResult[];
  contradictions: InsightContradiction[];
  originalities: TruthOriginalityResult[];
  /** The same creative score computed from each rung, to expose the metric's sensitivity. */
  sensitivity: Record<TensionRung, number>;
} {
  const rung: TensionRung = opts.tensionRung || "identity_conflict";
  const insightDiversity = new InsightDiversityController();
  const ideaDiversity = new CreativeDiversityController();
  const rows: InsightBenchmarkRow[] = [];
  const creativeScores: CreativeQualityScore[] = [];
  const insightScores: InsightGateResult[] = [];
  const truthReviews: HumanTruthReviewResult[] = [];
  const emotionalPower: EmotionalPowerResult[] = [];
  const contradictions: InsightContradiction[] = [];
  const originalities: TruthOriginalityResult[] = [];
  const priorTruths: string[] = [];
  const priorIdeas: string[] = [];
  const sensitivitySums: Record<TensionRung, number> = {
    observed_reality: 0,
    identity_conflict: 0,
    hidden_emotion: 0,
    human_truth: 0,
  };

  for (const c of cases) {
    const brief = c.brief;

    // ── Insight ────────────────────────────────────────────────────────
    const insight = HumanInsightGenerator.generate({
      challenge: c.creative_challenge || brief.creativeChallenge || "",
      audience: brief.audience || "",
      product: brief.product || "",
      category: c.industry,
      objective: brief.objective,
      objectiveKind: brief.objective,
      brand: brief.brand,
      // The dataset's market, declared once rather than inferred a hundred times.
      //
      // Inference found Vietnam in 4 of 100 briefs — the ones that happen to say
      // "Tet" or "Vietnamese" — while the other 96 are equally Vietnamese and say
      // so only through brand names like Kham, Giat and Day Them, which no
      // pattern should be asked to recognise. Declaring it is honest where
      // guessing it would not be: this benchmark is a Vietnam benchmark, and a
      // caller with a different market passes a different value.
      market: "vn",
    });
    const terms = HumanTensionAnalyzer.terms({
      challenge: c.creative_challenge || "",
      audience: brief.audience || "",
      product: brief.product || "",
      category: c.industry,
      objective: brief.objective,
    });

    const insightGate = HumanInsightQualityGate.evaluate(c.case_id, insight, {
      audience: brief.audience || "",
      product: brief.product || "",
      objective: brief.objective,
    });
    insightScores.push(insightGate);

    // The five questions, asked of the truth itself. Reported next to the
    // rubric's lexical human_truth rather than instead of it, so the two can be
    // compared on the same run.
    const truthReview = HumanTruthReview.review(insight.human_truth, {
      briefProblem: c.creative_challenge,
      audience: brief.audience || "",
      product: brief.product || "",
      objective: brief.objective,
      tension: insight.dynamic_tension,
    });
    truthReviews.push(truthReview);

    // Does the insight actually hold a contradiction? An insight without one is
    // an observation, and a concept built on it has nothing at its centre.
    const contradiction = InsightContradictionEngine.evaluate(insight);
    contradictions.push(contradiction);

    // Is the truth worth having found, as distinct from being sound?
    const originality = HumanTruthOriginalityEvaluator.evaluate(insight.human_truth, {
      briefProblem: c.creative_challenge,
      priorTruths,
      tension: insight.dynamic_tension,
    });
    originalities.push(originality);
    if (insight.human_truth) priorTruths.push(insight.human_truth);

    const repeat = insightDiversity.assess(insight);

    // ── Expression ─────────────────────────────────────────────────────
    // The insight is finished and unchangeable by this point. The lens only
    // decides how it is said.
    // Phase 4.0.3.7 expresses through the six modes. A mode carries three frames
    // and picks one by the material, so two briefs reaching the same mode no
    // longer produce the same sentence with two nouns swapped.
    //
    // An insight that failed the contradiction gate is not expressed at all: the
    // gate exists to stop exactly that concept being built.
    const modeExpressions = contradiction.passed
      ? InsightExpressionModes.express(insight, terms, contradiction)
      : [];
    const expressed = modeExpressions.map((m) => ({
      big_idea: m.big_idea,
      lens: MODE_TO_LENS[m.mode],
      mode: m.mode,
      human_truth: m.human_truth,
      why_it_works: m.why_it_works,
      emotional_hook: m.emotional_hook,
      strategic_reason: m.strategic_reason,
    }));
    const lensesAvailable = expressed.map((e) => e.lens);
    if (!contradiction.passed) {
      insight.warnings.push(
        `NO_CONTRADICTION: ${contradiction.reasons[0] || "the insight holds nothing in opposition"} ` +
          "No idea was expressed for this brief."
      );
    }

    const sourceMaterial = [insight.human_truth, insight.consumer_insight].filter(Boolean);
    const best = OriginalityEvaluator.selectBest(expressed, sourceMaterial, priorIdeas, c.must_avoid);

    const chosen = best?.chosen;

    // Refinement stays inside the expression layer, and selection stays out of
    // the rubric.
    //
    // Two mistakes were made here in sequence and both are worth recording.
    // First, `CreativeQualityGate.evaluate` was allowed to substitute its own
    // refinement, which re-composes through `CreativeCombinationEngine` — the
    // 4.0.1.5 engine — and did so on 43 of 100 cases, producing splices like
    // "Make people will forgo something they want rather than be seen wanting it
    // the whole point rather than a detail".
    //
    // Second, the obvious repair was to pick whichever lens scored highest on
    // `CreativeQualityBenchmark`. That is selecting on the metric being reported,
    // and it did what selecting on a metric always does: 50 of 93 cases collapsed
    // onto the one lens whose short output the rubric's brevity proxy liked, and
    // emotional_power fell by half.
    //
    // So selection is by originality and run-level diversity — properties of the
    // idea rather than of the score — and the rubric only ever reports.
    // A brief whose only available lens is `unexpected_truth` delivers the truth
    // itself, and two briefs that share an archetype truth then deliver the same
    // sentence. Where no lens over this insight is free of that collision, the
    // run delivers nothing for the brief rather than repeating an idea — the same
    // discipline the ladder applies when it cannot derive a rung.
    const fresh = chosen && !AdversarialConceptTester.isDuplicate(chosen.big_idea, priorIdeas)
      ? chosen
      : expressed.find((e) => !AdversarialConceptTester.isDuplicate(e.big_idea, priorIdeas));
    const expression = fresh;
    if (chosen && !fresh) {
      // Recorded rather than silently dropped: a brief the run could not serve
      // without repeating itself is a finding about the corpus, not a non-event.
      insight.warnings.push(
        "DUPLICATE_ONLY: every lens over this insight reproduced an idea already delivered in this " +
          "run, so no idea was delivered for this brief."
      );
    }

    const synthInput: CreativeSynthesisInput = {
      human_tension: tensionFrom(insight, rung),
      consumer_insight: insight.consumer_insight,
      campaign_territory: insight.human_truth,
      brand_objective: brief.objective || "",
      differentiation: "",
      audience: brief.audience || "",
      industry: c.industry,
      avoid: c.must_avoid,
    };

    const concept: CreativeSynthesisOutput = {
      big_idea: expression?.big_idea || "",
      why_it_works: expression?.why_it_works || "",
      emotional_hook: expression?.emotional_hook || "",
      strategic_reason: expression?.strategic_reason || "",
      originality_score: best?.assessment.score ?? 0,
      // The 4.0.1.5 rubric is keyed on CampaignAngle. A lens is not an angle, so
      // the nearest honest mapping is used and the lens is reported separately
      // rather than being silently renamed.
      angle: LENS_TO_ANGLE[expression?.lens || "unexpected_truth"],
      derived_from: [insight.archetype],
    };

    // ── Same downstream instruments as Phase 4.0.2 ─────────────────────
    const creativeGate = CreativeQualityGate.evaluate(
      c.case_id,
      concept,
      synthInput,
      c.creative_challenge,
      priorIdeas
    );
    const adversarial = AdversarialConceptTester.run(
      c.case_id,
      creativeGate.concept,
      synthInput,
      c.creative_challenge,
      brief.product,
      priorIdeas
    );

    // Measurement only: whatever the gate or the adversarial repair would have
    // substituted comes from the old engine, so the delivered idea stays the
    // expression layer's and their verdicts are reported against it.
    const final = concept;
    priorIdeas.push(final.big_idea);
    creativeScores.push(
      CreativeQualityBenchmark.score(c.case_id, final, synthInput, c.creative_challenge, priorIdeas.slice(0, -1))
    );

    // Metric sensitivity: the same case scored with each rung in the tension slot.
    for (const r of ["observed_reality", "identity_conflict", "hidden_emotion", "human_truth"] as TensionRung[]) {
      sensitivitySums[r] += CreativeQualityBenchmark.score(
        c.case_id,
        final,
        { ...synthInput, human_tension: tensionFrom(insight, r) },
        c.creative_challenge,
        priorIdeas.slice(0, -1)
      ).dimensions.human_truth;
    }

    // Recorded after the lens is known, so the lens distribution is not empty.
    insightDiversity.record(insight, expression?.lens);

    if (expression) {
      ideaDiversity.record({
        angle: concept.angle,
        territory: insight.human_truth || null,
        tension: tensionFrom(insight, "identity_conflict") || null,
        big_idea: final.big_idea,
      });
    }

    // Five questions about whether the delivered idea lands, reported next to
    // the rubric's single `emotional_power` number rather than instead of it.
    const power = EmotionalPowerEvaluator.evaluate(final.big_idea, {
      emotional_hook: final.emotional_hook,
      audience: brief.audience,
      priorIdeas,
      tension: insight.dynamic_tension,
    });
    emotionalPower.push(power);

    const v = ConceptQualityGate.validate(
      {
        big_idea: final.big_idea,
        consumer_insight: insight.consumer_insight,
        emotional_trigger: insight.why_people_feel_this,
        belief_shift: insight.human_truth,
        campaign_territory: insight.human_truth,
      } as any,
      undefined,
      true
    );

    rows.push({
      case_id: c.case_id,
      industry: c.industry,
      archetype: insight.archetype,
      matched_archetype: insight.archetype !== "NO_ARCHETYPE" && insight.archetype !== "NONE",
      truncated_at: insight.truncated_at,
      human_truth: insight.human_truth,
      consumer_insight: insight.consumer_insight,
      why_people_feel_this: insight.why_people_feel_this,
      why_now: insight.why_now,
      lens: expression?.lens,
      big_idea: final.big_idea,
      insight_gate: insightGate,
      truth_review: truthReview,
      emotional_power: power,
      contradiction,
      originality,
      mode: (expression as { mode?: ExpressionMode } | undefined)?.mode,
      cultural_market: insight.cultural_market,
      cultural_grounding: insight.cultural_grounding,
      discovery_confidence: insight.dynamic_tension?.confidence ?? 0,
      discovery_source: insight.dynamic_tension?.source,
      motivation_depth: insight.dynamic_tension?.motivation.depth_score ?? 0,
      discovery_restatement: insight.dynamic_tension?.restatement ?? 0,
      creative_gate: creativeGate,
      adversarial,
      contaminated: v.violations.some((x) => !["MISSING_BIG_IDEA", "INCOMPLETE_CONCEPT"].includes(x.kind)),
      lenses_available: lensesAvailable,
    });

    if (!repeat.allowed) {
      rows[rows.length - 1].insight_gate.reasons.push(`DIVERSITY: ${repeat.reason}`);
    }
  }

  const n = Math.max(1, rows.length);
  return {
    rows,
    insightDiversity,
    ideaDiversity,
    creativeScores,
    insightScores,
    truthReviews,
    emotionalPower,
    contradictions,
    originalities,
    sensitivity: {
      observed_reality: Number(((sensitivitySums.observed_reality / n) * 25).toFixed(2)),
      identity_conflict: Number(((sensitivitySums.identity_conflict / n) * 25).toFixed(2)),
      hidden_emotion: Number(((sensitivitySums.hidden_emotion / n) * 25).toFixed(2)),
      human_truth: Number(((sensitivitySums.human_truth / n) * 25).toFixed(2)),
    },
  };
}

/**
 * Lenses are not campaign angles, and this map does not pretend they are.
 *
 * The 4.0.1.5 rubric and the adversarial harness are both keyed on
 * `CampaignAngle`. Rather than widen those types — which would touch the
 * architecture this phase was told to leave alone — each lens is mapped to the
 * angle it most nearly is, and the lens itself is carried through the report
 * unchanged so nothing downstream has to infer it back.
 */
/**
 * The six 4.0.3.7 modes, mapped to the lens vocabulary the reporting types use.
 *
 * The mode is carried through the row unchanged; this map exists only so the
 * diversity controller and the angle mapping below keep working without being
 * widened. A mode is not a lens and the report never says it is.
 */
const MODE_TO_LENS: Record<ExpressionMode, CreativeLens> = {
  psychological_reversal: "emotional_reversal",
  hidden_cost: "provocative_statement",
  identity_paradox: "unexpected_truth",
  social_pressure: "cultural_observation",
  human_confession: "human_confession",
  unexpected_connection: "symbolic_metaphor",
};

const LENS_TO_ANGLE: Record<CreativeLens, CreativeSynthesisOutput["angle"]> = {
  emotional_reversal: "REVERSAL",
  cultural_observation: "RECOGNITION",
  unexpected_truth: "RECOGNITION",
  human_confession: "ADMISSION",
  symbolic_metaphor: "ELEVATION",
  provocative_statement: "REFUSAL",
};

function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".insight-benchmark";
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : undefined;

  const { dataset_id, cases } = loadConceptBenchmark();
  const selected = limit ? cases.slice(0, limit) : cases;
  console.log(`Running ${selected.length} briefs through the insight ladder…\n`);

  const {
    rows,
    insightDiversity,
    creativeScores,
    insightScores,
    truthReviews,
    emotionalPower,
    contradictions,
    originalities,
    sensitivity,
  } = runInsightBenchmark(selected);

  const bar = "=".repeat(74);
  console.log(bar);
  console.log(`INSIGHT BENCHMARK — ${dataset_id} · ${rows.length} briefs`);
  console.log(bar);

  // ── Insight quality ──────────────────────────────────────────────────
  const insightAgg = HumanInsightQualityGate.aggregate(insightScores.map((s) => s.score));
  console.log("\n" + HumanInsightQualityGate.format(insightAgg));

  console.log("\n" + HumanTruthReview.format(HumanTruthReview.aggregate(truthReviews)));

  console.log(
    "\n" + HumanTruthOriginalityEvaluator.format(HumanTruthOriginalityEvaluator.aggregate(originalities))
  );

  console.log("\n" + InsightContradictionEngine.format(InsightContradictionEngine.aggregate(contradictions)));

  console.log("\n" + EmotionalPowerEvaluator.format(EmotionalPowerEvaluator.aggregate(emotionalPower)));

  console.log("\nDISCOVERY (Phase 4.0.3.6)");
  const discovered = rows.filter((r) => r.discovery_confidence > 0);
  const meanConf = discovered.length
    ? discovered.reduce((n, r) => n + r.discovery_confidence, 0) / discovered.length
    : 0;
  const restated = rows.filter((r) => r.discovery_restatement >= 0.72).length;
  console.log(`  tensions discovered   : ${discovered.length} / ${rows.length}`);
  console.log(
    `  read / reconstructed / expanded : ${rows.filter((r) => r.discovery_source === "EXPLICIT").length}` +
      ` / ${rows.filter((r) => r.discovery_source === "LATENT").length}` +
      ` / ${rows.filter((r) => r.discovery_source === "EXPANDED").length}`
  );
  console.log(`  mean confidence       : ${meanConf.toFixed(2)}`);
  console.log(`  declined as paraphrase: ${restated}`);

  console.log("\nCULTURE");
  const byMarket: Record<string, number> = {};
  for (const r of rows) byMarket[r.cultural_market || "unspecified"] = (byMarket[r.cultural_market || "unspecified"] || 0) + 1;
  console.log(`  markets resolved  : ${JSON.stringify(byMarket)}`);
  console.log(`  culturally grounded: ${rows.filter((r) => r.cultural_grounding).length} / ${rows.length}`);

  console.log("\nINSIGHT GATE");
  const verdicts = { PASS: 0, WEAK: 0, REJECTED: 0 } as Record<string, number>;
  for (const s of insightScores) verdicts[s.verdict]++;
  console.log(`  pass ${verdicts.PASS} · weak ${verdicts.WEAK} · rejected ${verdicts.REJECTED}`);

  // ── Ladder ───────────────────────────────────────────────────────────
  const matched = rows.filter((r) => r.matched_archetype).length;
  const truncated = rows.filter((r) => r.truncated_at);
  console.log("\nLADDER");
  console.log(`  briefs classified to an archetype : ${matched} / ${rows.length}`);
  console.log(`  ladders reaching a human truth    : ${rows.filter((r) => r.human_truth).length} / ${rows.length}`);
  if (truncated.length) {
    const where: Record<string, number> = {};
    for (const r of truncated) where[r.truncated_at!] = (where[r.truncated_at!] || 0) + 1;
    console.log(`  truncated                         : ${truncated.length}  ${JSON.stringify(where)}`);
  }

  // ── Insight diversity ────────────────────────────────────────────────
  const idiv = insightDiversity.metrics();
  console.log("\nINSIGHT DIVERSITY");
  console.log(`  distinct human truths   : ${idiv.distinct_truths} / ${idiv.insights}  (ratio ${idiv.truth_diversity})`);
  console.log(`  distinct conflicts      : ${idiv.distinct_conflicts}`);
  console.log(`  distinct social pressures: ${idiv.distinct_pressures}`);
  if (idiv.most_used_archetype) {
    console.log(`  most used archetype     : ${idiv.most_used_archetype.archetype} (${idiv.most_used_archetype.count})`);
  }
  console.log(`  lenses used             : ${JSON.stringify(idiv.lens_distribution)}`);

  // ── Creative quality, same rubric as 4.0.2 ───────────────────────────
  const creativeAgg = CreativeQualityBenchmark.aggregate(creativeScores);
  console.log("\n" + CreativeQualityBenchmark.format(creativeAgg));

  console.log("\nMETRIC SENSITIVITY — human_truth by which rung fills the tension slot");
  console.log(`  observed_reality  : ${sensitivity.observed_reality.toFixed(1)} / 25   (control: the brief, fed back)`);
  console.log(`  identity_conflict : ${sensitivity.identity_conflict.toFixed(1)} / 25   (used above)`);
  console.log(`  hidden_emotion    : ${sensitivity.hidden_emotion.toFixed(1)} / 25`);
  console.log(`  human_truth       : ${sensitivity.human_truth.toFixed(1)} / 25`);
  console.log("  The control is the brief's own problem statement returned unchanged. It is the");
  console.log("  highest-scoring option available and it is not an insight — it is the input. Any");
  console.log("  target set on this metric is reachable by moving toward that row, which is why");
  console.log("  the run reports it rather than optimising against it.");

  const cgate = CreativeQualityGate.summarise(rows.map((r) => r.creative_gate));
  console.log("\nCREATIVE GATE");
  console.log(`  pass ${cgate.passed} · refined ${cgate.refined} · rejected ${cgate.rejected}`);
  console.log(`  material failures     : ${cgate.material_failures}`);
  console.log(`  construction failures : ${cgate.construction_failures}`);

  const adv = AdversarialConceptTester.summarise(rows.map((r) => r.adversarial));
  console.log("\nADVERSARIAL");
  console.log(`  survived      : ${adv.survived} / ${adv.cases}`);
  console.log(`  mean pressure : ${adv.mean_pressure}`);
  console.log(`  attacks       : ${JSON.stringify(adv.by_attack)}`);

  const delivered = deliveredDiversity(rows.map((r) => ({ big_idea: r.big_idea, angle: r.lens || "none" } as any)));
  console.log("\nIDEA DIVERSITY — delivered");
  console.log(`  distinct ideas : ${delivered.distinct_ideas} / ${delivered.ideas}  (ratio ${delivered.diversity_ratio})`);
  if (delivered.empty) console.log(`  briefs with no idea : ${delivered.empty}`);
  console.log(`  lens distribution   : ${JSON.stringify(delivered.angle_distribution)}`);

  console.log("\nCONTAMINATION");
  console.log(`  concepts carrying execution language: ${rows.filter((r) => r.contaminated).length} / ${rows.length}`);

  const byIndustry: Record<string, { creative: number[]; insight: number[] }> = {};
  for (let i = 0; i < rows.length; i++) {
    const b = (byIndustry[rows[i].industry] ||= { creative: [], insight: [] });
    b.creative.push(creativeScores[i].total);
    b.insight.push(insightScores[i].score.total);
  }
  console.log("\nBY INDUSTRY                creative     insight");
  for (const [ind, xs] of Object.entries(byIndustry).sort()) {
    const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    console.log(
      `  ${ind.padEnd(16)} n=${String(xs.creative.length).padStart(3)}   ` +
        `${m(xs.creative).toFixed(1).padStart(5)} / 100   ${m(xs.insight).toFixed(1).padStart(5)} / 100`
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(
      {
        dataset_id,
        insight: insightAgg,
        truth_review: HumanTruthReview.aggregate(truthReviews),
        emotional_power: EmotionalPowerEvaluator.aggregate(emotionalPower),
        contradiction: InsightContradictionEngine.aggregate(contradictions),
        originality: HumanTruthOriginalityEvaluator.aggregate(originalities),
        creative: creativeAgg,
        sensitivity,
        ladder_matched: matched,
        insight_diversity: idiv,
        rows,
      },
      null,
      2
    )
  );
  console.log(`\nWrote report.json to ${outDir}/`);
}

if (require.main === module) main();
