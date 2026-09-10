import { CiosReasoningShadowService } from "../reasoning/CiosReasoningShadowService";
import { ReasoningKnowledgeRepository } from "../reasoning/ReasoningKnowledgeRepository";
import { LegacyBackend, LegacyCreativeProvider } from "./LegacyCreativeProvider";
import { CreativeBenchmarkScorer } from "./CreativeBenchmarkScorer";
import {
  BENCHMARK_DIMENSIONS,
  BenchmarkCase,
  BenchmarkCaseResult,
  BenchmarkMode,
  BenchmarkOutput,
  CaseReasoningTrace,
  ComparisonVerdict,
  DimensionOutcome,
  KnowledgeUsageComparison,
} from "./creative-benchmark.types";

/**
 * Runs both pipelines on one case and compares them.
 *
 * What "legacy" means here
 * -----------------------
 * In offline mode the legacy side is `CreativeKnowledgeService` — the Layer 1
 * service that actually fills the resolver's `knowledgeDirection` socket today.
 * That is the true comparison for the Phase 3.2 decision, because that socket is
 * exactly what Phase 3.2 would swap.
 *
 * It is NOT the whole legacy creative output: the marketing brain also
 * contributes a concept, and reaching it costs one LLM call per case. So offline
 * mode compares direction rigorously and concept partially, and says so in
 * `warnings` on every case rather than letting the gap pass unnoticed. Live mode
 * closes it at a cost of thirty LLM calls per run.
 *
 * A benchmark that quietly compared a full pipeline against half of another one
 * would produce a flattering number and an invalid decision.
 */

/** Ties below this margin. Two scores 0.3 apart are not a difference. */
const TIE_THRESHOLD = 0.5;

export interface ComparisonOptions {
  mode?: BenchmarkMode;
  repository?: ReasoningKnowledgeRepository;
  /**
   * The baseline. Defaults to the template backend, which needs no network.
   *
   * Phase 3.1.7 replaced the old `legacyConceptProvider` seam: it only supplied a
   * concept, leaving the legacy direction to CreativeKnowledgeService, so the two
   * halves of the baseline came from different systems. A baseline assembled from
   * parts is not a baseline.
   */
  legacyProvider?: LegacyCreativeProvider;
  legacyBackend?: LegacyBackend;
}

export class BenchmarkComparisonEngine {
  public static async runCase(
    benchmarkCase: BenchmarkCase,
    options: ComparisonOptions = {}
  ): Promise<BenchmarkCaseResult> {
    const mode: BenchmarkMode = options.mode || "offline";
    const warnings: string[] = [];

    const { output: cios, trace } = this.buildCiosOutput(benchmarkCase, options, warnings);
    const legacy = await this.buildLegacyOutput(benchmarkCase, mode, options, warnings);

    const ciosScore = CreativeBenchmarkScorer.score(cios, benchmarkCase);
    const legacyScore = CreativeBenchmarkScorer.score(legacy, benchmarkCase);

    const outcomes: DimensionOutcome[] = BENCHMARK_DIMENSIONS.map((def) => {
      const c = ciosScore.dimensions.find((d) => d.dimension === def.id)!;
      const l = legacyScore.dimensions.find((d) => d.dimension === def.id)!;
      const bothUnscored = !c.scored && !l.scored;
      const delta = Math.round((c.score - l.score) * 100) / 100;
      let winner: ComparisonVerdict = "TIE";
      if (!bothUnscored && Math.abs(delta) >= TIE_THRESHOLD) winner = delta > 0 ? "CIOS" : "LEGACY";
      return {
        dimension: def.id,
        cios_score: c.score,
        legacy_score: l.score,
        delta,
        winner,
        both_unscored: bothUnscored,
      };
    });

    const overallDelta = ciosScore.automated_overall - legacyScore.automated_overall;
    const verdict: ComparisonVerdict =
      Math.abs(overallDelta) < TIE_THRESHOLD ? "TIE" : overallDelta > 0 ? "CIOS" : "LEGACY";

    const weightedDelta =
      ciosScore.weighted_overall !== undefined && legacyScore.weighted_overall !== undefined
        ? Math.round((ciosScore.weighted_overall - legacyScore.weighted_overall) * 100) / 100
        : undefined;

    return {
      case_id: benchmarkCase.case_id,
      industry: benchmarkCase.industry,
      challenge: benchmarkCase.challenge,
      cios,
      legacy,
      cios_score: ciosScore,
      legacy_score: legacyScore,
      outcomes,
      knowledge_usage: this.compareKnowledgeUsage(cios, legacy, options),
      verdict,
      weighted_delta: weightedDelta,
      reasoning_trace: trace,
      warnings,
    };
  }

  public static async runAll(
    cases: BenchmarkCase[],
    options: ComparisonOptions = {}
  ): Promise<BenchmarkCaseResult[]> {
    // Sequential rather than parallel: in live mode this is thirty LLM calls, and
    // firing them at once is how a benchmark run becomes a rate-limit incident.
    const results: BenchmarkCaseResult[] = [];
    for (const c of cases) {
      results.push(await this.runCase(c, options));
    }
    return results;
  }

  // ── Pipeline adapters ───────────────────────────────────────────────────

  private static buildCiosOutput(
    benchmarkCase: BenchmarkCase,
    options: ComparisonOptions,
    warnings: string[]
  ): { output: BenchmarkOutput; trace?: CaseReasoningTrace } {
    const shadow = CiosReasoningShadowService.run(
      { brief: benchmarkCase.brief, repository: options.repository },
      true
    );

    if (!shadow.enabled) {
      warnings.push(`CIOS produced no output for ${benchmarkCase.case_id}: ${shadow.reason} ${shadow.message || ""}`);
      return { output: this.emptyOutput("CIOS", "shadow run failed") };
    }

    // Retrieval and routing are recorded together. Kept apart they answer
    // different halves of the same question and a reader has to join them by
    // knowledge_id, which is exactly the step that gets skipped.
    const routingById = new Map(
      shadow.decision_trace.reasoning_applied.map((r) => [r.knowledge_id, r])
    );
    const trace: CaseReasoningTrace = {
      query: shadow.query as Record<string, string | undefined>,
      resolved_axes: shadow.context_coverage.resolved,
      unresolved_axes: shadow.context_coverage.unresolved,
      candidates_evaluated: shadow.candidates_evaluated,
      retrieved: shadow.decision_trace.retrieved.map((r) => {
        const routing = routingById.get(r.knowledge_id);
        return {
          knowledge_id: r.knowledge_id,
          domain: r.domain,
          score: r.score,
          context_relevance: r.context_relevance,
          routed_to: String(routing?.routed_to ?? "UNKNOWN"),
          dimension: routing?.art_direction_dimension,
          rule: routing?.rule ?? "",
        };
      }),
      decisions: {
        art_direction: shadow.decision_trace.decisions.art_direction.length,
        strategy: shadow.decision_trace.decisions.strategy.length,
        advisory: shadow.decision_trace.decisions.advisory.length,
        superseded: shadow.decision_trace.decisions.superseded.length,
        unmapped: shadow.decision_trace.decisions.unmapped.length,
      },
      superseded: shadow.decision_trace.decisions.superseded.map((s) => ({
        dimension: s.art_direction_dimension,
        decision: s.decision.slice(0, 140),
        superseded_by: s.superseded_by,
      })),
      unmapped: shadow.decision_trace.decisions.unmapped.map((u) => ({
        intended_dimension: u.intended_dimension,
        reason: u.reason,
      })),
      concept_evaluation: {
        overall: shadow.concept_evaluation.overall,
        accepted: shadow.concept_evaluation.accepted,
        rejection_reasons: shadow.concept_evaluation.rejection_reasons,
        cliches_detected: shadow.concept_evaluation.cliches_detected,
      },
      layer_separation_clean: shadow.layer_separation.clean,
      duration_ms: shadow.duration_ms,
    };

    const output: BenchmarkOutput = {
      pipeline: "CIOS",
      concept: {
        big_idea: shadow.concept.big_idea,
        core_message: shadow.concept.core_message,
        consumer_insight: shadow.concept.consumer_insight,
        differentiation: shadow.concept.differentiation,
      },
      direction: {
        camera: shadow.cios_direction.camera_direction || "",
        lighting: shadow.cios_direction.lighting_direction || "",
        composition: shadow.cios_direction.composition_strategy || "",
        colour: shadow.cios_direction.color_strategy || "",
        atmosphere: shadow.cios_direction.visual_style || "",
        typography: shadow.cios_direction.typography_strategy || "",
        material: shadow.cios_direction.material_direction || "",
      },
      knowledge_used: shadow.retrieved_knowledge_ids,
      source: "CreativeContextExtractor → Retriever → ConceptEngine → DecisionEngine",
    };

    return { output, trace };
  }

  private static async buildLegacyOutput(
    benchmarkCase: BenchmarkCase,
    mode: BenchmarkMode,
    options: ComparisonOptions,
    warnings: string[]
  ): Promise<BenchmarkOutput> {
    const provider =
      options.legacyProvider ||
      new LegacyCreativeProvider({ backend: options.legacyBackend || (mode === "live" ? "llm" : "template") });

    const out = await provider.generate(benchmarkCase);

    if (out.degraded_reason) {
      warnings.push(`LEGACY_BACKEND_DEGRADED: ${benchmarkCase.case_id} — ${out.degraded_reason}`);
    }
    if (out.backend === "template") {
      // Stated on every case, because it is the one caveat that decides how much
      // the taste dimensions are worth. The structural dimensions survive it; the
      // originality and differentiation comparisons do not.
      warnings.push(
        "TEMPLATE_BASELINE: the legacy side was produced by the deterministic backend, authored by the same hand as CIOS. " +
          "Structural dimensions (concreteness, coverage, consistency) are meaningful; originality and differentiation are not. " +
          "Run with the llm backend for a defensible taste comparison."
      );
    }

    return {
      pipeline: "LEGACY",
      concept: out.concept,
      direction: out.direction,
      knowledge_used: [],
      source:
        out.backend === "llm"
          ? "LegacyCreativeProvider (llm) — brief → generic creative reasoning → direction"
          : "LegacyCreativeProvider (template) — brief → category convention → direction",
      legacy_backend: out.backend,
      legacy_degraded_reason: out.degraded_reason,
    };
  }

  private static emptyOutput(pipeline: BenchmarkOutput["pipeline"], source: string): BenchmarkOutput {
    return {
      pipeline,
      concept: { big_idea: "", core_message: "", consumer_insight: "", differentiation: "" },
      direction: { camera: "", lighting: "", composition: "", colour: "", atmosphere: "", typography: "", material: "" },
      knowledge_used: [],
      source,
    };
  }

  private static compareKnowledgeUsage(
    cios: BenchmarkOutput,
    legacy: BenchmarkOutput,
    options: ComparisonOptions
  ): KnowledgeUsageComparison {
    const repo = options.repository || new ReasoningKnowledgeRepository();
    const domains: Record<string, number> = {};
    for (const id of cios.knowledge_used) {
      const obj = repo.getById(id);
      const domain = String(obj?.domain || "unknown");
      domains[domain] = (domains[domain] || 0) + 1;
    }

    const empties = (o: BenchmarkOutput) =>
      Object.entries(o.direction)
        .filter(([, v]) => !v || !v.trim())
        .map(([k]) => k);

    return {
      cios_knowledge_count: cios.knowledge_used.length,
      legacy_knowledge_count: legacy.knowledge_used.length,
      cios_domains: domains,
      cios_empty_dimensions: empties(cios),
      legacy_empty_dimensions: empties(legacy),
    };
  }
}
