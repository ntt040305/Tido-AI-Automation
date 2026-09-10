import { BenchmarkCaseResult, BenchmarkIndustry, BenchmarkPipeline } from "./creative-benchmark.types";
import {
  CriterionAggregate,
  HUMAN_CRITERIA,
  HumanBenchmarkKey,
  HumanBenchmarkPacket,
  HumanBenchmarkReport,
  HumanBenchmarkResponse,
  HumanCategory,
  HumanCriterionId,
  ReviewerAgreement,
} from "./human-benchmark.types";

/**
 * Turns reviewer responses into a report.
 *
 * The statistics here are deliberately modest, and the modesty is the point. A
 * realistic run of this framework has three to six reviewers over thirty cases.
 * That is enough to see a large effect and nowhere near enough to resolve a
 * small one, so the report is built to make a thin result look thin:
 *
 *   - every mean is reported beside the standard deviation of its delta, because
 *     a +0.4 mean with an SD of 3 is noise and the delta column alone cannot say so
 *   - `conclusive` is false below the packet's own reviewer floor, and it gates
 *     the conclusion rather than annotating it
 *   - pairwise agreement is reported, because reviewers who disagree with each
 *     other have not measured a property of the work
 *
 * A framework that produced a confident number from two reviewers would be
 * laundering opinion into evidence.
 */

const round = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return round(Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)));
}

/** A single attributed rating: one reviewer, one case, one criterion, one side. */
interface Rating {
  reviewer_id: string;
  case_id: string;
  industry: BenchmarkIndustry;
  criterion: HumanCriterionId;
  pipeline: BenchmarkPipeline;
  score: number;
}

export class HumanBenchmarkAggregator {
  /**
   * Un-blinds responses using the key and aggregates them.
   *
   * `caseResults` supplies each case's industry. Passed in rather than looked up
   * from the packet so the aggregator never needs the packet's own contents,
   * which keeps un-blinding a single explicit step.
   */
  public static aggregate(
    packet: HumanBenchmarkPacket,
    key: HumanBenchmarkKey,
    responses: HumanBenchmarkResponse[],
    caseResults: BenchmarkCaseResult[]
  ): HumanBenchmarkReport {
    const warnings: string[] = [];
    if (packet.packet_id !== key.packet_id) {
      throw new Error(`Key ${key.packet_id} does not match packet ${packet.packet_id}.`);
    }

    const industryOf = new Map(caseResults.map((r) => [r.case_id, r.industry]));
    const mismatched = responses.filter((r) => r.packet_id !== packet.packet_id);
    if (mismatched.length) {
      throw new Error(
        `${mismatched.length} response(s) belong to another packet: ${mismatched.map((r) => r.packet_id).join(", ")}`
      );
    }

    const attribute = (caseId: string, label: "A" | "B"): BenchmarkPipeline | null => {
      const aIs = key.assignment[caseId];
      if (!aIs) return null;
      return label === "A" ? aIs : aIs === "CIOS" ? "LEGACY" : "CIOS";
    };

    // ── Flatten to attributed ratings ─────────────────────────────────────
    const ratings: Rating[] = [];
    const preferences: { reviewer_id: string; case_id: string; pipeline: BenchmarkPipeline | "NO_PREFERENCE" }[] = [];
    const comments: HumanBenchmarkReport["comments"] = [];

    for (const response of responses) {
      for (const c of response.cases) {
        const industry = industryOf.get(c.case_id);
        if (!industry) {
          warnings.push(`Response for unknown case ${c.case_id} was ignored.`);
          continue;
        }
        for (const s of c.scores) {
          const pipeline = attribute(c.case_id, s.label);
          if (!pipeline) continue;
          if (s.score < 0 || s.score > 10) {
            warnings.push(`${response.reviewer_id}/${c.case_id}/${s.criterion}: score ${s.score} out of range, ignored.`);
            continue;
          }
          ratings.push({
            reviewer_id: response.reviewer_id,
            case_id: c.case_id,
            industry,
            criterion: s.criterion,
            pipeline,
            score: s.score,
          });
        }

        const preferred =
          c.overall_preference === "NO_PREFERENCE"
            ? "NO_PREFERENCE"
            : attribute(c.case_id, c.overall_preference) || "NO_PREFERENCE";
        preferences.push({ reviewer_id: response.reviewer_id, case_id: c.case_id, pipeline: preferred });
        if (c.comment?.trim()) {
          comments.push({ case_id: c.case_id, pipeline_preferred: preferred, comment: c.comment.trim() });
        }
      }
    }

    const reviewers = new Set(responses.map((r) => r.reviewer_id)).size;
    const casesCovered = new Set(ratings.map((r) => r.case_id)).size;

    // ── Per-criterion ─────────────────────────────────────────────────────
    const byCriterion: CriterionAggregate[] = HUMAN_CRITERIA.map((def) => {
      const forCriterion = ratings.filter((r) => r.criterion === def.id);
      const cios = forCriterion.filter((r) => r.pipeline === "CIOS").map((r) => r.score);
      const legacy = forCriterion.filter((r) => r.pipeline === "LEGACY").map((r) => r.score);

      // Deltas are paired per reviewer and case, which removes the reviewer's own
      // scale from the comparison. An unpaired difference of means would mostly
      // measure how generous each reviewer is.
      const deltas: number[] = [];
      let cw = 0;
      let lw = 0;
      let ties = 0;
      const pairKeys = new Set(forCriterion.map((r) => `${r.reviewer_id}|${r.case_id}`));
      for (const pk of pairKeys) {
        const [reviewer_id, case_id] = pk.split("|");
        const c = forCriterion.find((r) => r.reviewer_id === reviewer_id && r.case_id === case_id && r.pipeline === "CIOS");
        const l = forCriterion.find((r) => r.reviewer_id === reviewer_id && r.case_id === case_id && r.pipeline === "LEGACY");
        if (!c || !l) continue;
        const d = c.score - l.score;
        deltas.push(d);
        if (Math.abs(d) < 1) ties++;
        else if (d > 0) cw++;
        else lw++;
      }

      return {
        criterion: def.id,
        category: def.category,
        cios_mean: mean(cios),
        legacy_mean: mean(legacy),
        delta: round(mean(cios) - mean(legacy)),
        cios_wins: cw,
        legacy_wins: lw,
        ties,
        n: forCriterion.length,
        delta_sd: sd(deltas),
      };
    });

    // ── Per category and industry ─────────────────────────────────────────
    const byCategory = (
      ["creative_concept", "brand_strategy", "art_direction", "production_readiness"] as HumanCategory[]
    ).map((category) => {
      const ids = HUMAN_CRITERIA.filter((d) => d.category === category).map((d) => d.id);
      const inCat = ratings.filter((r) => ids.includes(r.criterion));
      const c = mean(inCat.filter((r) => r.pipeline === "CIOS").map((r) => r.score));
      const l = mean(inCat.filter((r) => r.pipeline === "LEGACY").map((r) => r.score));
      return { category, cios_mean: c, legacy_mean: l, delta: round(c - l) };
    });

    const industries = [...new Set(ratings.map((r) => r.industry))];
    const byIndustry = industries.map((industry) => {
      const inInd = ratings.filter((r) => r.industry === industry);
      const c = mean(inInd.filter((r) => r.pipeline === "CIOS").map((r) => r.score));
      const l = mean(inInd.filter((r) => r.pipeline === "LEGACY").map((r) => r.score));
      return { industry, cios_mean: c, legacy_mean: l, delta: round(c - l) };
    });

    // ── Preferences and agreement ─────────────────────────────────────────
    const ciosPreferred = preferences.filter((p) => p.pipeline === "CIOS").length;
    const legacyPreferred = preferences.filter((p) => p.pipeline === "LEGACY").length;
    const noPreference = preferences.filter((p) => p.pipeline === "NO_PREFERENCE").length;
    const expressed = ciosPreferred + legacyPreferred;

    const conclusive = reviewers >= packet.min_reviewers && ratings.length > 0;
    if (!conclusive && reviewers > 0) {
      warnings.push(
        `Only ${reviewers} reviewer(s) responded; ${packet.min_reviewers} are required before this report states a conclusion.`
      );
    }

    const allCios = ratings.filter((r) => r.pipeline === "CIOS").map((r) => r.score);
    const allLegacy = ratings.filter((r) => r.pipeline === "LEGACY").map((r) => r.score);

    return {
      packet_id: packet.packet_id,
      generated_at: new Date().toISOString(),
      reviewers,
      cases: casesCovered,
      ratings: ratings.length,
      conclusive,
      inconclusive_reason: conclusive
        ? undefined
        : reviewers === 0
          ? "No responses were supplied."
          : `${reviewers} of ${packet.min_reviewers} required reviewers responded. Agreement cannot be measured below that floor.`,
      overall: {
        cios_mean: mean(allCios),
        legacy_mean: mean(allLegacy),
        delta: round(mean(allCios) - mean(allLegacy)),
        cios_preferred: ciosPreferred,
        legacy_preferred: legacyPreferred,
        no_preference: noPreference,
        cios_preference_rate: expressed ? round(ciosPreferred / expressed) : 0,
      },
      by_criterion: byCriterion,
      by_category: byCategory,
      by_industry: byIndustry,
      agreement: this.agreement(preferences),
      comments,
      warnings: Array.from(new Set(warnings)),
    };
  }

  /**
   * How often two reviewers picked the same winner on the same case.
   *
   * Plain pairwise percent agreement rather than a chance-corrected coefficient.
   * With three reviewers and a three-way outcome, kappa's chance correction is
   * more unstable than the statistic it corrects, and a number nobody can sanity
   * check is worse than a simple one they can.
   */
  private static agreement(
    preferences: { reviewer_id: string; case_id: string; pipeline: BenchmarkPipeline | "NO_PREFERENCE" }[]
  ): ReviewerAgreement {
    const byCase = new Map<string, { reviewer_id: string; pipeline: string }[]>();
    for (const p of preferences) {
      const list = byCase.get(p.case_id) || [];
      list.push({ reviewer_id: p.reviewer_id, pipeline: p.pipeline });
      byCase.set(p.case_id, list);
    }

    let agree = 0;
    let comparisons = 0;
    for (const list of byCase.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          comparisons++;
          if (list[i].pipeline === list[j].pipeline) agree++;
        }
      }
    }

    const reviewerIds = [...new Set(preferences.map((p) => p.reviewer_id))];
    return {
      pairwise_preference_agreement: comparisons ? round(agree / comparisons) : 0,
      comparisons,
      by_reviewer: reviewerIds.map((id) => {
        const mine = preferences.filter((p) => p.reviewer_id === id);
        return {
          reviewer_id: id,
          cios: mine.filter((p) => p.pipeline === "CIOS").length,
          legacy: mine.filter((p) => p.pipeline === "LEGACY").length,
          none: mine.filter((p) => p.pipeline === "NO_PREFERENCE").length,
        };
      }),
    };
  }

  /** Terminal-readable report. */
  public static format(report: HumanBenchmarkReport): string {
    const L: string[] = [];
    const bar = "=".repeat(72);
    L.push(bar);
    L.push(`HUMAN CREATIVE BENCHMARK — ${report.packet_id}`);
    L.push(`${report.reviewers} reviewer(s) · ${report.cases} case(s) · ${report.ratings} ratings`);
    L.push(bar);

    if (!report.conclusive) {
      L.push("");
      L.push("INCONCLUSIVE — no conclusion is stated below.");
      L.push(`  ${report.inconclusive_reason}`);
    }

    L.push("");
    L.push("OVERALL");
    L.push(`  CIOS   ${report.overall.cios_mean.toFixed(2)} / 10`);
    L.push(`  Other  ${report.overall.legacy_mean.toFixed(2)} / 10`);
    L.push(`  Delta  ${(report.overall.delta >= 0 ? "+" : "") + report.overall.delta.toFixed(2)}`);
    L.push(
      `  Preference: ${report.overall.cios_preferred} CIOS · ${report.overall.legacy_preferred} other · ` +
        `${report.overall.no_preference} none  (${(report.overall.cios_preference_rate * 100).toFixed(0)}% of expressed)`
    );

    L.push("");
    L.push("BY CRITERION");
    L.push(`  ${"criterion".padEnd(26)} ${"CIOS".padStart(6)} ${"OTHER".padStart(6)} ${"Δ".padStart(7)} ${"SD".padStart(6)}  W/L/T`);
    for (const c of report.by_criterion) {
      L.push(
        `  ${c.criterion.padEnd(26)} ${c.cios_mean.toFixed(2).padStart(6)} ${c.legacy_mean.toFixed(2).padStart(6)} ` +
          `${((c.delta >= 0 ? "+" : "") + c.delta.toFixed(2)).padStart(7)} ${c.delta_sd.toFixed(2).padStart(6)}  ` +
          `${c.cios_wins}/${c.legacy_wins}/${c.ties}` +
          // Stated inline, because a reader scanning the delta column is exactly
          // the reader who would otherwise take a noisy number for a result.
          (c.delta_sd > 0 && Math.abs(c.delta) < c.delta_sd ? "  (within noise)" : "")
      );
    }

    L.push("");
    L.push("BY CATEGORY");
    for (const c of report.by_category) {
      L.push(
        `  ${c.category.padEnd(24)} CIOS ${c.cios_mean.toFixed(2)}  other ${c.legacy_mean.toFixed(2)}  ` +
          `Δ ${(c.delta >= 0 ? "+" : "") + c.delta.toFixed(2)}`
      );
    }

    L.push("");
    L.push("REVIEWER AGREEMENT");
    L.push(
      `  Pairwise preference agreement: ${(report.agreement.pairwise_preference_agreement * 100).toFixed(0)}% ` +
        `over ${report.agreement.comparisons} pair(s)`
    );
    for (const r of report.agreement.by_reviewer) {
      L.push(`    ${r.reviewer_id.padEnd(18)} CIOS ${r.cios} · other ${r.legacy} · none ${r.none}`);
    }

    if (report.warnings.length) {
      L.push("");
      L.push("WARNINGS");
      report.warnings.forEach((w) => L.push(`  - ${w}`));
    }
    L.push(bar);
    return L.join("\n");
  }
}
