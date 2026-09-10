import fs from "fs";
import path from "path";
import { CreativeDirectorEvaluationModel } from "./reasoning/CreativeDirectorEvaluationModel";
import { CreativeDirectorDecisionEngine, DirectorDecision } from "./reasoning/CreativeDirectorDecisionEngine";
import { CreativeInterpretationDistance } from "./reasoning/CreativeInterpretationDistance";
import { CreativeStressTest } from "./reasoning/CreativeStressTest";
import { CreativeDirectorAttentionEngine } from "./reasoning/CreativeDirectorAttentionEngine";
import { CreativeTasteGraph } from "./reasoning/CreativeTasteGraph";
import { EmotionalMechanismExtractor } from "./reasoning/EmotionalMechanismExtractor";
import { PatternExtractor } from "./reasoning/PatternExtractor";
import { TasteMemoryRetriever } from "./reasoning/TasteMemoryRetriever";
import { CREATIVE_STRUCTURES, CreativeStructure, TasteGuidance } from "./reasoning/creative-patterns.types";
import { CreativeTasteEngine } from "./reasoning/CreativeTasteEngine";
import { BrandDNAOwnership } from "./reasoning/BrandDNAOwnership";
import { BRAND_DNA_FIXTURES, hasFixture } from "./reasoning/brand-dna.fixtures";
import { CampaignScalabilityTest } from "./reasoning/CampaignScalabilityTest";
import { CreativeOriginalityMatrix } from "./reasoning/CreativeOriginalityMatrix";
import { CreativeTasteMemory } from "./reasoning/CreativeTasteMemory";
import { CreativeTasteMemoryEngine } from "./reasoning/CreativeTasteMemoryEngine";
import { MemoryPatternEvaluator } from "./reasoning/MemoryPatternEvaluator";
import { CandidatePopulationBuilder, PopulationResult } from "./reasoning/CandidatePopulationBuilder";
import { RankableIdea } from "./reasoning/creative-generation.types";
import { CreativeTerritoryEngine } from "./reasoning/CreativeTerritoryEngine";
import { CulturalContextResolver } from "./reasoning/CulturalContextResolver";
import { HumanInsightGenerator } from "./reasoning/HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./reasoning/HumanTensionAnalyzer";
import { IdeaRankingEngine, RankingResult } from "./reasoning/IdeaRankingEngine";
import { InsightContradictionEngine } from "./reasoning/InsightContradictionEngine";
import { CreativeQualityBenchmark } from "./reasoning/CreativeQualityBenchmark";
import { CreativeTerritory, DirectorScore, StressTestReport, TasteScore } from "./reasoning/creative-taste.types";
import { CreativeSynthesisInput, CreativeSynthesisOutput } from "./reasoning/creative-synthesis.types";
import { ConceptBenchmarkCase, loadConceptBenchmark } from "./run-concept-benchmark";

/**
 * Phase 4.0.4 — the taste benchmark.
 *
 *   npx tsx lib/image-engine/run-taste-benchmark.ts [--out DIR] [--limit N]
 *
 * Same hundred briefs as every phase since 4.0.2. The insight layers run
 * unchanged; what is new is everything after the truth — a territory, several
 * ideas on it, four stress tests, two evaluation models, a ranking, and a memory
 * of what was approved.
 *
 * Two scales are printed and neither is allowed to stand in for the other. The
 * 4.0.1.5 `CreativeQualityBenchmark` still runs on the recommended idea and still
 * reports around where it did; the taste score is a new rubric asking different
 * questions. A taste score of 80 is not the old number improving.
 */

export interface TasteBenchmarkRow {
  case_id: string;
  industry: string;
  human_truth: string;
  territory?: CreativeTerritory | null;
  ideas_generated: number;
  recommended?: string;
  recommended_mode?: string;
  recommended_score?: number;
  top_disqualified: boolean;
  taste?: TasteScore;
  director?: DirectorScore;
  stress?: StressTestReport;
  creative_quality?: number;
  verdict_line?: string;
}

/**
 * Phase 4.0.5. With `useTasteMemory`, decisions are captured as the run proceeds
 * and guidance from them reorders close-scoring ideas on later briefs.
 *
 * Off by default, so the A/B is a genuine comparison rather than a rerun of a
 * changed system against its own memory of itself.
 */
export interface TasteBenchmarkOptions {
  useTasteMemory?: boolean;
  /**
   * Phase 4.0.7. Generate the way everything up to 4.0.6 did: one territory, the
   * six expression modes fired once each.
   *
   * Kept so the before/after in this phase is a real comparison run through the
   * same unchanged evaluators, rather than a new number set beside a remembered
   * one. Nothing in production uses it.
   */
  legacyGeneration?: boolean;
  /**
   * Phase 4.0.7 Task 1. Run the self-critique pass after generation. Default on.
   *
   * Off exists so the benchmark can measure what the critique changes rather
   * than assert it.
   */
  critique?: boolean;
  /**
   * Phase 4.0.7 Task 3. Pools built elsewhere, keyed by case id.
   *
   * The LLM provider is asynchronous and this function is not. Rather than fork
   * the evaluation chain into an async copy — two paths that would drift, and the
   * phase's whole claim rests on the evaluation path not moving — a caller that
   * can await builds the pools first and hands them in here. Every evaluator
   * below then runs exactly as it does for every other arm.
   */
  prebuiltPools?: Map<string, PopulationResult>;
}

export function runTasteBenchmark(
  cases: ConceptBenchmarkCase[],
  options: TasteBenchmarkOptions = {}
): {
  rows: TasteBenchmarkRow[];
  rankings: RankingResult[];
  territories: (CreativeTerritory | null)[];
  memory: CreativeTasteMemory;
  tasteScores: TasteScore[];
  directorScores: DirectorScore[];
  stressReports: StressTestReport[];
  allStress: StressTestReport[];
  allTaste: TasteScore[];
  ownership: import("./reasoning/brand-dna.types").OwnershipVerdict[];
  memoryPatterns: import("./reasoning/MemoryPatternEvaluator").MemoryPatternScore[];
  originality: import("./reasoning/CreativeOriginalityMatrix").OriginalityMatrixResult[];
  scalability: import("./reasoning/CampaignScalabilityTest").ScalabilityResult[];
  allOwnership: import("./reasoning/brand-dna.types").OwnershipVerdict[];
  declaredOwnership: import("./reasoning/brand-dna.types").OwnershipVerdict[];
  allScalability: import("./reasoning/CampaignScalabilityTest").ScalabilityResult[];
  decisions: DirectorDecision[];
  allInterpretation: import("./reasoning/CreativeInterpretationDistance").InterpretationDistance[];
  learning: import("./reasoning/CreativeTasteMemoryEngine").LearningReport;
  engine: CreativeTasteMemoryEngine;
  creativeQuality: number[];
  tasteMemory: TasteMemoryRetriever;
  structures: import("./reasoning/creative-patterns.types").StructureDetection[][];
  guidanceApplied: number;
  guidanceReordered: number;
  guidanceEligible: number;
  graph: CreativeTasteGraph;
  mechanisms: import("./reasoning/emotional-mechanism.types").EmotionalMechanism[];
  attention: import("./reasoning/emotional-mechanism.types").AttentionReport[];
  /** Phase 4.0.7. Null on the legacy path, which builds no population. */
  populations: (PopulationResult | null)[];
} {
  const rows: TasteBenchmarkRow[] = [];
  const rankings: RankingResult[] = [];
  const territories: (CreativeTerritory | null)[] = [];
  const memory = new CreativeTasteMemory();
  const engine = new CreativeTasteMemoryEngine(memory);
  const tasteScores: TasteScore[] = [];
  const directorScores: DirectorScore[] = [];
  const stressReports: StressTestReport[] = [];
  // Every idea generated, not only the ones that won. A rejection rate
  // measured over survivors is vacuously zero, which is what the first run of
  // this benchmark reported.
  const allStress: StressTestReport[] = [];
  const allTaste: TasteScore[] = [];
  const ownership: import("./reasoning/brand-dna.types").OwnershipVerdict[] = [];
  const memoryPatterns: import("./reasoning/MemoryPatternEvaluator").MemoryPatternScore[] = [];
  const originality: import("./reasoning/CreativeOriginalityMatrix").OriginalityMatrixResult[] = [];
  const scalability: import("./reasoning/CampaignScalabilityTest").ScalabilityResult[] = [];
  const allOwnership: import("./reasoning/brand-dna.types").OwnershipVerdict[] = [];
  const declaredOwnership: import("./reasoning/brand-dna.types").OwnershipVerdict[] = [];
  const allScalability: import("./reasoning/CampaignScalabilityTest").ScalabilityResult[] = [];
  const decisions: DirectorDecision[] = [];
  const allInterpretation: import("./reasoning/CreativeInterpretationDistance").InterpretationDistance[] = [];
  const creativeQuality: number[] = [];
  const tasteMemory = new TasteMemoryRetriever();
  const structures: import("./reasoning/creative-patterns.types").StructureDetection[][] = [];
  const runStructures: CreativeStructure[] = [];
  const useMemory = options.useTasteMemory === true;
  let guidanceApplied = 0;
  let guidanceReordered = 0;
  let guidanceEligible = 0;
  const graph = new CreativeTasteGraph();
  const mechanisms: import("./reasoning/emotional-mechanism.types").EmotionalMechanism[] = [];
  const attention: import("./reasoning/emotional-mechanism.types").AttentionReport[] = [];
  const priorIdeas: string[] = [];
  const priorTruths: string[] = [];
  const populations: (PopulationResult | null)[] = [];

  for (const c of cases) {
    const brief = c.brief;

    // ── Insight, unchanged from 4.0.3.7 ────────────────────────────────
    const insight = HumanInsightGenerator.generate({
      challenge: c.creative_challenge || brief.creativeChallenge || "",
      audience: brief.audience || "",
      product: brief.product || "",
      category: c.industry,
      objective: brief.objective,
      objectiveKind: brief.objective,
      brand: brief.brand,
      market: "vn",
    });
    const terms = HumanTensionAnalyzer.terms({
      challenge: c.creative_challenge || "",
      audience: brief.audience || "",
      product: brief.product || "",
      category: c.industry,
      objective: brief.objective,
    });
    const culture = CulturalContextResolver.resolve({
      audience: brief.audience,
      product: brief.product,
      brand: brief.brand,
      challenge: c.creative_challenge,
      market: "vn",
    });
    const contradiction = InsightContradictionEngine.evaluate(insight);

    // What is actually known about this brand — which, for every brief in this
    // benchmark, is a name, a product and a tone. `completeness` says so, and the
    // ownership verdicts are scaled by it.
    const brandDNA = BrandDNAOwnership.resolve({
      brand: brief.brand,
      product: brief.product,
      category: c.industry,
      tone: brief.tone,
      // Declared DNA where a fixture exists. Four of the hundred, reported as
      // their own cohort: four briefs with DNA and ninety-six without are two
      // different measurements and averaging them would describe neither.
      declared: BRAND_DNA_FIXTURES[brief.brand || ""],
    });

    // ── Territories, then a searched population on them ────────────────
    // Phase 4.0.7. The old path built one territory and fired six expression
    // modes at it, which is the 4.98-ideas-per-brief the audit measured. The
    // builder plans a search across several grounds instead. Both paths hand the
    // ranker the same shape and every evaluator below is untouched.
    let territory: CreativeTerritory | null;
    let ideas: RankableIdea[];
    let population: PopulationResult | null = null;

    if (options.legacyGeneration) {
      territory = CreativeTerritoryEngine.build(insight, terms, contradiction);
      ideas = territory
        ? CreativeTerritoryEngine.ideasFor(territory, insight, terms, contradiction, brandDNA).ideas
        : [];
    } else {
      population = options.prebuiltPools?.get(c.case_id) || CandidatePopulationBuilder.buildSync({
        insight,
        terms,
        contradiction,
        brandDNA,
        brief: {
          brand: brief.brand || "",
          product: brief.product || "",
          audience: brief.audience || "",
          category: c.industry || "",
          objective: brief.objective,
          challenge: c.creative_challenge || brief.creativeChallenge || "",
          key_phrase: terms.key,
        },
      }, { critique: options.critique });
      // The primary territory stays the one `build()` returns, so the territory
      // aggregate reported by this benchmark measures the same thing it did
      // before. The others are carried on the candidates.
      territory = population.territories[0] || null;
      ideas = CandidatePopulationBuilder.toRankable(population.candidates, insight.human_truth);
    }
    territories.push(territory);
    populations.push(population);

    // ── Retrieve before generating ─────────────────────────────────────
    // Guidance is asked for per brief, against everything decided so far, and
    // declines on its own where the evidence is thin.
    let guidance: TasteGuidance | null = null;
    let structureRank: ((idea: string) => number) | undefined;
    if (useMemory) {
      guidance = tasteMemory.retrieve(
        {
          industry: c.industry,
          family: insight.dynamic_tension?.motivation.family,
          brand: brief.brand,
        },
        runStructures
      );
      if (guidance.confident) {
        const order = TasteMemoryRetriever.order(guidance);
        const position = new Map<CreativeStructure, number>();
        order.forEach((st, i) => position.set(st, i));
        structureRank = (idea: string) => {
          const dominant = PatternExtractor.dominant(idea, { human_truth: insight.human_truth });
          // An idea using no recognised device sits after every one that does,
          // rather than being ranked as though it used the first structure.
          return dominant ? (position.get(dominant) ?? CREATIVE_STRUCTURES.length) : CREATIVE_STRUCTURES.length;
        };
        guidanceApplied++;
      }
    }

    const ranking = IdeaRankingEngine.rank(ideas, territory, {
      case_id: c.case_id,
      brand: brief.brand,
      product: brief.product,
      category: c.industry,
      audience: brief.audience,
      objective: brief.objective,
      briefProblem: c.creative_challenge,
      human_truth: insight.human_truth,
      culture: culture.context,
      tension: insight.dynamic_tension,
      keyPhrase: terms.key,
      brandDNA,
      structureRank,
      priorIdeas,
      priorTruths,
    });
    rankings.push(ranking);

    // ── Attention: a second list beside the ranking ────────────────────
    // Reads the ranking and writes nothing to it. Run before the decision so a
    // flag is available at the moment a director would be looking.
    attention.push(
      CreativeDirectorAttentionEngine.review(ranking.ranked, graph, {
        case_id: c.case_id,
        human_truth: insight.human_truth,
        tension: insight.dynamic_tension,
      })
    );
    if (ranking.guidance_reordered) guidanceReordered++;
    // The population guidance could ever act on: two viable candidates close
    // enough in score for a tie-break to be legitimate.
    const viable = ranking.ranked.filter((x) => !x.disqualified_by);
    if (viable.length >= 2 && viable[0].score - viable[1].score <= 4) guidanceEligible++;

    // ── Memory: every idea's outcome, not only the winner ──────────────
    for (const r of ranking.ranked) {
      allStress.push(r.stress);
      allTaste.push(r.taste);
      if (r.ownership) allOwnership.push(r.ownership);
      if (r.ownership && hasFixture(brief.brand)) declaredOwnership.push(r.ownership);
      if (r.scalability) allScalability.push(r.scalability);
      allInterpretation.push(CreativeInterpretationDistance.measure(r.idea, insight.human_truth));
      const mech = EmotionalMechanismExtractor.extract(r.idea, {
        human_truth: insight.human_truth,
        tension: insight.dynamic_tension,
      });
      mechanisms.push(mech);
      graph.add({
        idea: r.idea,
        structure: PatternExtractor.dominant(r.idea, { human_truth: insight.human_truth }),
        mechanism: mech.mechanism,
        // Every generated idea has an outcome even before a decision: the ones
        // the ranking disqualified were dropped, and that is information.
        decision: r.disqualified_by ? "DISQUALIFIED" : r === ranking.recommended ? "RECOMMENDED" : "RANKED",
        outcome: !r.disqualified_by && r === ranking.recommended ? "kept" : "dropped",
      });
      engine.record({
        case_id: c.case_id,
        ranked: r,
        approved: !r.disqualified_by && r === ranking.recommended,
      });
    }

    // The decision is made on the recommended idea, which is the one a director
    // would actually be shown.
    const rec = ranking.recommended;
    if (rec) {
      const decision = CreativeDirectorDecisionEngine.decide(rec, {
        case_id: c.case_id,
        human_truth: insight.human_truth,
        territory,
      });
      decisions.push(decision);

      // Captured whether or not memory is being *used*, so the A/B compares
      // guidance rather than bookkeeping.
      tasteMemory.capture(decision, rec, {
        industry: c.industry,
        brand: brief.brand || "",
        family: insight.dynamic_tension?.motivation.family || "",
        human_truth: insight.human_truth,
      });

      const detected = PatternExtractor.extract(rec.idea, {
        human_truth: insight.human_truth,
        tension: insight.dynamic_tension,
      });
      structures.push(detected);
      if (detected.length) runStructures.push(detected[0].structure);
    }
    if (rec) {
      priorIdeas.push(rec.idea);
      tasteScores.push(rec.taste);
      directorScores.push(rec.director);
      stressReports.push(rec.stress);
      if (rec.ownership) ownership.push(rec.ownership);
      if (rec.memory) memoryPatterns.push(rec.memory);
      if (rec.originality) originality.push(rec.originality);
      if (rec.scalability) scalability.push(rec.scalability);
    }
    if (insight.human_truth) priorTruths.push(insight.human_truth);

    // ── The old rubric, on the recommended idea ────────────────────────
    // Reported alongside so a new scale cannot quietly replace the old one.
    let quality: number | undefined;
    if (rec) {
      const synthInput: CreativeSynthesisInput = {
        human_tension:
          HumanTensionAnalyzer.at(insight.ladder, "identity_conflict")?.statement || insight.human_truth,
        consumer_insight: insight.consumer_insight,
        campaign_territory: territory?.name || insight.human_truth,
        brand_objective: brief.objective || "",
        differentiation: "",
        audience: brief.audience || "",
        industry: c.industry,
        avoid: c.must_avoid,
      };
      const concept: CreativeSynthesisOutput = {
        big_idea: rec.idea,
        why_it_works: "",
        emotional_hook: "",
        strategic_reason: "",
        originality_score: 0,
        angle: "RECOGNITION",
        derived_from: [insight.archetype],
      };
      quality = CreativeQualityBenchmark.score(
        c.case_id,
        concept,
        synthInput,
        c.creative_challenge,
        priorIdeas.slice(0, -1)
      ).total;
      creativeQuality.push(quality);
    }

    rows.push({
      case_id: c.case_id,
      industry: c.industry,
      human_truth: insight.human_truth,
      territory,
      ideas_generated: ranking.ranked.length,
      recommended: rec?.idea,
      recommended_mode: rec?.mode,
      recommended_score: rec?.score,
      top_disqualified: Boolean(rec && rec.rank > 1),
      taste: rec?.taste,
      director: rec?.director,
      stress: rec?.stress,
      creative_quality: quality,
      verdict_line: rec?.director.verdict_line,
    });
  }

  return {
    rows,
    rankings,
    territories,
    memory,
    tasteScores,
    directorScores,
    stressReports,
    allStress,
    allTaste,
    ownership,
    memoryPatterns,
    originality,
    scalability,
    allOwnership,
    declaredOwnership,
    allScalability,
    // Learned after the run, never during it: weighting mid-run would make an
    // idea's treatment depend on how many briefs happened to precede it.
    decisions,
    allInterpretation,
    tasteMemory,
    structures,
    guidanceApplied,
    guidanceReordered,
    guidanceEligible,
    graph,
    mechanisms,
    attention,
    populations,
    learning: engine.learn(),
    engine,
    creativeQuality,
  };
}

function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".taste-benchmark";
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : undefined;

  const compare = args.includes("--compare");
  const { dataset_id, cases } = loadConceptBenchmark();
  const selected = limit ? cases.slice(0, limit) : cases;
  console.log(`Running ${selected.length} briefs through the taste engine…\n`);

  const run = runTasteBenchmark(selected, { useTasteMemory: !args.includes("--no-memory") });
  const bar = "=".repeat(74);
  console.log(bar);
  console.log(`CREATIVE TASTE BENCHMARK — ${dataset_id} · ${run.rows.length} briefs`);
  console.log(bar);

  console.log("\n" + CreativeTerritoryEngine.format(CreativeTerritoryEngine.aggregate(run.territories)));
  console.log("\n" + IdeaRankingEngine.format(IdeaRankingEngine.aggregate(run.rankings)));
  const allAgg = CreativeStressTest.aggregate(run.allStress);
  console.log("\n" + CreativeStressTest.format(allAgg));
  console.log("\n  (over all ideas generated, not only the ones recommended — a rejection rate");
  console.log("   measured over survivors is vacuously zero)");
  const tasteAll = CreativeTasteEngine.aggregate(run.allTaste);
  const tasteRec = CreativeTasteEngine.aggregate(run.tasteScores);
  console.log("\n" + CreativeTasteEngine.format(tasteRec));
  console.log(`\n  taste over all ${run.allTaste.length} ideas generated : ${tasteAll.mean_total.toFixed(1)} / 100`);
  console.log("  The line above is the shortlist; this one is everything the engine wrote.");
  console.log(
    "\n" + CreativeDirectorEvaluationModel.format(CreativeDirectorEvaluationModel.aggregate(run.directorScores))
  );
  console.log("\n" + BrandDNAOwnership.format(BrandDNAOwnership.aggregate(run.allOwnership)));
  console.log("\n" + MemoryPatternEvaluator.format(MemoryPatternEvaluator.aggregate(run.memoryPatterns)));
  console.log("\n" + CreativeOriginalityMatrix.format(CreativeOriginalityMatrix.aggregate(run.originality)));
  console.log(
    "\n" + CampaignScalabilityTest.format(CampaignScalabilityTest.aggregate(run.allScalability))
  );
  console.log("\n" + run.memory.format());
  console.log(
    "\n" +
      CreativeInterpretationDistance.format(CreativeInterpretationDistance.aggregate(run.allInterpretation))
  );
  console.log(
    "\n" + CreativeDirectorDecisionEngine.format(CreativeDirectorDecisionEngine.aggregate(run.decisions))
  );
  console.log("\n" + PatternExtractor.format(PatternExtractor.aggregate(run.structures)));
  console.log("\n" + run.tasteMemory.format());
  console.log("\n" + EmotionalMechanismExtractor.format(EmotionalMechanismExtractor.aggregate(run.mechanisms)));
  console.log("\n" + run.graph.format());
  console.log(
    "\n" + CreativeDirectorAttentionEngine.format(CreativeDirectorAttentionEngine.aggregate(run.attention))
  );
  console.log("\n" + run.engine.format(run.learning));

  // ── The old scale, side by side ──────────────────────────────────────
  const cq = run.creativeQuality;
  const meanCQ = cq.length ? cq.reduce((a, b) => a + b, 0) / cq.length : 0;
  const taste = tasteRec;
  console.log("\nTWO SCALES");
  console.log(`  CreativeQualityBenchmark (4.0.1.5) : ${meanCQ.toFixed(1)} / 100  on the recommended idea`);
  console.log(`  Creative taste (4.0.4)             : ${taste.mean_total.toFixed(1)} / 100`);
  console.log("  These ask different questions. The second does not replace the first, and a rise");
  console.log("  in it is not the first improving.");

  const byIndustry: Record<string, number[]> = {};
  for (const r of run.rows) {
    if (r.taste) (byIndustry[r.industry] ||= []).push(r.taste.total);
  }
  console.log("\nBY INDUSTRY (taste)");
  for (const [ind, xs] of Object.entries(byIndustry).sort()) {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(`  ${ind.padEnd(16)} n=${String(xs.length).padStart(3)}  ${m.toFixed(1)} / 100`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(
      {
        dataset_id,
        territories: CreativeTerritoryEngine.aggregate(run.territories),
        ranking: IdeaRankingEngine.aggregate(run.rankings),
        stress_all_ideas: allAgg,
        stress_recommended: CreativeStressTest.aggregate(run.stressReports),
        taste,
        taste_all_ideas: tasteAll,
        ownership: BrandDNAOwnership.aggregate(run.allOwnership),
        ownership_declared_dna: BrandDNAOwnership.aggregate(run.declaredOwnership),
        memory_pattern: MemoryPatternEvaluator.aggregate(run.memoryPatterns),
        originality_matrix: CreativeOriginalityMatrix.aggregate(run.originality),
        scalability: CampaignScalabilityTest.aggregate(run.allScalability),
        interpretation: CreativeInterpretationDistance.aggregate(run.allInterpretation),
        decisions: CreativeDirectorDecisionEngine.aggregate(run.decisions),
        decision_rows: run.decisions,
        structures: PatternExtractor.aggregate(run.structures),
        taste_memory: run.tasteMemory.aggregate(),
        mechanisms: EmotionalMechanismExtractor.aggregate(run.mechanisms),
        graph: run.graph.aggregate(),
        attention: CreativeDirectorAttentionEngine.aggregate(run.attention),
        guidance_applied: run.guidanceApplied,
        learning: run.learning,
        director: CreativeDirectorEvaluationModel.aggregate(run.directorScores),
        creative_quality_mean: Number(meanCQ.toFixed(2)),
        memory: {
          approved: run.memory.approved().length,
          failed: run.memory.failed().length,
          failure_reasons: run.memory.failureReasons().slice(0, 10),
          success_patterns: run.memory.successPatterns().slice(0, 10),
          failure_patterns: run.memory.failurePatterns().slice(0, 10),
        },
        rows: run.rows,
      },
      null,
      2
    )
  );
  console.log(`\nWrote report.json to ${outDir}/`);
}

if (require.main === module) main();
