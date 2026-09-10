import {
  BENCHMARK_DIMENSIONS,
  BENCHMARK_INDUSTRIES,
  BenchmarkCaseResult,
  BenchmarkCategory,
  BenchmarkDimensionId,
  BenchmarkMode,
  BenchmarkReport,
  BenchmarkWeakness,
  DimensionAggregate,
} from "./creative-benchmark.types";

/**
 * Aggregates case results into a report.
 *
 * The report is written to support one decision — go or no-go on Phase 3.2 — and
 * that decision is not made from a mean. It is made from the specific things that
 * are broken, which is why `weaknesses` carries severities and affected case ids
 * and sits alongside the numbers rather than beneath them.
 *
 * Two reporting rules follow from that:
 *
 *   - A dimension where one pipeline produces nothing at all is a BLOCKING
 *     weakness regardless of how the averages come out, because Phase 3.2 would
 *     ship that absence to production.
 *   - `requires_human_review` is reported at the top level. A reader must not be
 *     able to take the automated summary for the whole answer.
 */

const round = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export class BenchmarkReportGenerator {
  public static generate(
    results: BenchmarkCaseResult[],
    options: { datasetId: string; mode: BenchmarkMode; reportId?: string }
  ): BenchmarkReport {
    const { datasetId, mode } = options;
    const warnings = Array.from(new Set(results.flatMap((r) => r.warnings)));

    const ciosWins = results.filter((r) => r.verdict === "CIOS").length;
    const legacyWins = results.filter((r) => r.verdict === "LEGACY").length;
    const ties = results.filter((r) => r.verdict === "TIE").length;
    const decided = ciosWins + legacyWins;

    const byDimension = this.aggregateDimensions(results);
    const byIndustry = BENCHMARK_INDUSTRIES.map((industry) => {
      const inIndustry = results.filter((r) => r.industry === industry);
      const c = mean(inIndustry.map((r) => r.cios_score.automated_overall));
      const l = mean(inIndustry.map((r) => r.legacy_score.automated_overall));
      return { industry, cases: inIndustry.length, cios_mean: c, legacy_mean: l, delta: round(c - l) };
    }).filter((row) => row.cases > 0);

    const byCategory = (["concept", "strategy", "visual", "production"] as BenchmarkCategory[]).map((category) => {
      const c = mean(results.map((r) => r.cios_score.by_category[category]).filter((v): v is number => v !== undefined));
      const l = mean(results.map((r) => r.legacy_score.by_category[category]).filter((v): v is number => v !== undefined));
      return { category, cios_mean: c, legacy_mean: l, delta: round(c - l) };
    });

    return {
      report_id: options.reportId || `bench_${Date.now()}`,
      dataset_id: datasetId,
      generated_at: new Date().toISOString(),
      case_count: results.length,
      mode,
      results,
      summary: {
        cios_mean: mean(results.map((r) => r.cios_score.automated_overall)),
        legacy_mean: mean(results.map((r) => r.legacy_score.automated_overall)),
        cios_wins: ciosWins,
        legacy_wins: legacyWins,
        ties,
        // Ties are excluded from the base rather than counted as half a win. A
        // 50 percent rate over two decided cases and over twenty means different
        // things, and the raw counts sit beside it so that stays visible.
        cios_win_rate: decided ? round(ciosWins / decided) : 0,
      },
      by_dimension: byDimension,
      by_industry: byIndustry,
      by_category: byCategory,
      weaknesses: this.findWeaknesses(results, byDimension, mode),
      requires_human_review: BENCHMARK_DIMENSIONS.filter((d) => d.method === "HUMAN_REQUIRED").map((d) => d.id),
      warnings,
    };
  }

  private static aggregateDimensions(results: BenchmarkCaseResult[]): DimensionAggregate[] {
    return BENCHMARK_DIMENSIONS.map((def) => {
      const outcomes = results.map((r) => r.outcomes.find((o) => o.dimension === def.id)!).filter(Boolean);
      const scoredOutcomes = outcomes.filter((o) => !o.both_unscored);
      const c = mean(scoredOutcomes.map((o) => o.cios_score));
      const l = mean(scoredOutcomes.map((o) => o.legacy_score));
      return {
        dimension: def.id,
        category: def.category,
        method: def.method,
        cios_mean: c,
        legacy_mean: l,
        delta: round(c - l),
        cios_wins: outcomes.filter((o) => o.winner === "CIOS").length,
        legacy_wins: outcomes.filter((o) => o.winner === "LEGACY").length,
        ties: outcomes.filter((o) => o.winner === "TIE" && !o.both_unscored).length,
        unscored_cases: outcomes.filter((o) => o.both_unscored).length,
      };
    });
  }

  private static findWeaknesses(
    results: BenchmarkCaseResult[],
    byDimension: DimensionAggregate[],
    mode: BenchmarkMode
  ): BenchmarkWeakness[] {
    const weaknesses: BenchmarkWeakness[] = [];
    if (!results.length) return weaknesses;

    // ── Empty art direction dimensions ────────────────────────────────────
    // The finding that decides Phase 3.2. A dimension CIOS never fills is a
    // dimension the switch would delete from production, whatever the means say.
    const dimensionKeys = ["camera", "lighting", "composition", "colour", "atmosphere", "typography"] as const;
    for (const key of dimensionKeys) {
      for (const pipeline of ["CIOS", "LEGACY"] as const) {
        const field = pipeline === "CIOS" ? "cios_empty_dimensions" : "legacy_empty_dimensions";
        const affected = results.filter((r) => r.knowledge_usage[field].includes(key));
        if (!affected.length) continue;
        const share = affected.length / results.length;
        weaknesses.push({
          severity: share >= 0.8 ? "BLOCKING" : share >= 0.4 ? "MAJOR" : "MINOR",
          pipeline,
          summary:
            `${pipeline} produced no ${key} direction in ${affected.length} of ${results.length} cases ` +
            `(${Math.round(share * 100)}%).` +
            (pipeline === "CIOS" && share >= 0.8
              ? " Switching the pipeline would remove this dimension from every render."
              : ""),
          affected_cases: affected.map((r) => r.case_id).slice(0, 10),
          evidence: [],
        });
      }
    }

    // ── Dimensions where a pipeline is systematically behind ──────────────
    for (const agg of byDimension) {
      if (agg.unscored_cases === results.length) continue;
      if (Math.abs(agg.delta) < 1.5) continue;
      const behind = agg.delta < 0 ? "CIOS" : "LEGACY";
      const affected = results
        .filter((r) => {
          const o = r.outcomes.find((x) => x.dimension === agg.dimension);
          return o && o.winner !== "TIE" && o.winner !== behind;
        })
        .map((r) => r.case_id);
      weaknesses.push({
        severity: Math.abs(agg.delta) >= 4 ? "MAJOR" : "MINOR",
        pipeline: behind,
        dimension: agg.dimension,
        summary:
          `${behind} trails by ${Math.abs(agg.delta).toFixed(2)} on ${agg.dimension} ` +
          `(${agg.cios_mean.toFixed(2)} CIOS vs ${agg.legacy_mean.toFixed(2)} legacy).` +
          (agg.method !== "AUTOMATED" ? ` Measured by a ${agg.method.toLowerCase()} method — directional only.` : ""),
        affected_cases: affected.slice(0, 10),
        evidence: [],
      });
    }

    // ── Knowledge concentration ───────────────────────────────────────────
    const domainTotals: Record<string, number> = {};
    let totalRetrieved = 0;
    for (const r of results) {
      for (const [domain, n] of Object.entries(r.knowledge_usage.cios_domains)) {
        domainTotals[domain] = (domainTotals[domain] || 0) + n;
        totalRetrieved += n;
      }
    }
    for (const [domain, n] of Object.entries(domainTotals)) {
      const share = totalRetrieved ? n / totalRetrieved : 0;
      if (share >= 0.4) {
        weaknesses.push({
          severity: share >= 0.55 ? "MAJOR" : "MINOR",
          pipeline: "CIOS",
          summary:
            `Retrieval is dominated by the "${domain}" domain: ${Math.round(share * 100)}% of all retrieved objects. ` +
            "At a fixed retrieval limit this crowds out the domains that fill the other dimensions.",
          affected_cases: results.map((r) => r.case_id).slice(0, 5),
          evidence: [`${n} of ${totalRetrieved} retrieved objects`],
        });
      }
    }

    // ── Baseline caveat ───────────────────────────────────────────────────
    // Through V1 and V2 this position held a BLOCKING finding: offline mode never
    // generated a legacy concept, so every concept dimension scored CIOS against
    // zero. Phase 3.1.7 gave the benchmark a real baseline, and the caveat that
    // replaces it is narrower and belongs to the deterministic backend only.
    const templateCases = results.filter((r) => r.legacy.legacy_backend === "template");
    if (templateCases.length) {
      weaknesses.push({
        severity: "MAJOR",
        pipeline: "LEGACY",
        summary:
          `The baseline was produced by the deterministic template backend on ${templateCases.length} of ${results.length} cases. ` +
          "It was authored by the same hand as CIOS, so structural dimensions (concreteness, coverage, consistency) " +
          "are meaningful and the taste dimensions (originality, differentiation, brand fit) are not. " +
          "Run with the llm backend for a defensible taste comparison.",
        affected_cases: templateCases.map((r) => r.case_id).slice(0, 5),
        evidence: [],
      });
    }

    const order = { BLOCKING: 0, MAJOR: 1, MINOR: 2 };
    return weaknesses.sort((a, b) => order[a.severity] - order[b.severity]);
  }

  /** Terminal-readable report. */
  public static format(report: BenchmarkReport): string {
    const L: string[] = [];
    const bar = "=".repeat(72);
    L.push(bar);
    L.push(`CIOS CREATIVE BENCHMARK — ${report.dataset_id} (${report.mode} mode)`);
    L.push(`${report.case_count} cases · ${report.generated_at}`);
    L.push(bar);

    L.push("");
    L.push("SUMMARY");
    L.push(`  CIOS mean   ${report.summary.cios_mean.toFixed(2)} / 10`);
    L.push(`  Legacy mean ${report.summary.legacy_mean.toFixed(2)} / 10`);
    L.push(
      `  Cases: ${report.summary.cios_wins} CIOS · ${report.summary.legacy_wins} legacy · ${report.summary.ties} tied`
    );
    L.push(`  CIOS win rate (decided cases): ${(report.summary.cios_win_rate * 100).toFixed(0)}%`);

    L.push("");
    L.push("BY DIMENSION" + "  (method)".padStart(20));
    L.push(`  ${"dimension".padEnd(24)} ${"CIOS".padStart(6)} ${"LEGACY".padStart(7)} ${"Δ".padStart(7)}  W/L/T`);
    for (const d of report.by_dimension) {
      const method = d.method === "AUTOMATED" ? "" : ` (${d.method.toLowerCase()})`;
      L.push(
        `  ${(d.dimension + method).padEnd(24)} ${d.cios_mean.toFixed(2).padStart(6)} ` +
          `${d.legacy_mean.toFixed(2).padStart(7)} ${(d.delta >= 0 ? "+" : "") + d.delta.toFixed(2)}`.padEnd(9) +
          `  ${d.cios_wins}/${d.legacy_wins}/${d.ties}` +
          (d.unscored_cases ? `  [${d.unscored_cases} unscored]` : "")
      );
    }

    L.push("");
    L.push("BY CATEGORY");
    for (const c of report.by_category) {
      L.push(
        `  ${c.category.padEnd(12)} CIOS ${c.cios_mean.toFixed(2)}  legacy ${c.legacy_mean.toFixed(2)}  ` +
          `Δ ${(c.delta >= 0 ? "+" : "") + c.delta.toFixed(2)}`
      );
    }

    L.push("");
    L.push("BY INDUSTRY");
    for (const i of report.by_industry) {
      L.push(
        `  ${i.industry.padEnd(16)} n=${i.cases}  CIOS ${i.cios_mean.toFixed(2)}  legacy ${i.legacy_mean.toFixed(2)}  ` +
          `Δ ${(i.delta >= 0 ? "+" : "") + i.delta.toFixed(2)}`
      );
    }

    L.push("");
    L.push(`WEAKNESSES (${report.weaknesses.length})`);
    for (const w of report.weaknesses) {
      L.push(`  [${w.severity}] ${w.pipeline}${w.dimension ? ` · ${w.dimension}` : ""}`);
      L.push(`      ${w.summary}`);
      if (w.affected_cases.length) L.push(`      cases: ${w.affected_cases.slice(0, 4).join(", ")}…`);
    }

    L.push("");
    L.push(`NOT MEASURED AUTOMATICALLY: ${report.requires_human_review.join(", ")}`);
    L.push("These require the blind review packet. The summary above is not the whole answer.");
    L.push(bar);
    return L.join("\n");
  }
}
