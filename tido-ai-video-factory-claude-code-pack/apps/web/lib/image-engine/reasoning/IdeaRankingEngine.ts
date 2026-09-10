import { CulturalContext } from "./cultural-context.types";
import { CreativeDirectorEvaluationModel } from "./CreativeDirectorEvaluationModel";
import { CreativeStressTest } from "./CreativeStressTest";
import { CreativeTasteEngine } from "./CreativeTasteEngine";
import { BrandDNAOwnership } from "./BrandDNAOwnership";
import { CampaignScalabilityTest } from "./CampaignScalabilityTest";
import { CreativeOriginalityMatrix } from "./CreativeOriginalityMatrix";
import { MemoryPatternEvaluator } from "./MemoryPatternEvaluator";
import { BrandDNA, NO_BRAND_DNA } from "./brand-dna.types";
import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { RankableIdea } from "./creative-generation.types";
import { ModeExpression } from "./InsightExpressionModes";
import { CreativeTerritory, RANKING_WEIGHTS, RankedIdea, RankingDimension } from "./creative-taste.types";

/**
 * CIOS Phase 4.0.4 — generate several, then choose.
 *
 * Why ranking is the point of the phase
 * ------------------------------------
 * Every phase up to here produced one idea per brief and then measured it. That
 * is assessment, not direction. A director's actual work is comparative: six
 * things on the wall, and the judgement is which one, not whether.
 *
 * So the territory engine puts several ideas on the same ground and this ranks
 * them. The six dimensions are the ones the phase specifies, and each is carried
 * from the evaluator that owns it rather than recomputed — `originality` and
 * `memorability` from the taste engine, `brand_ownership` and `longevity` from
 * the director's model, `human_impact` from taste's human resonance,
 * `execution` from taste's execution potential.
 *
 * Nothing new is scored here. Ranking is a rearrangement of numbers that already
 * exist, which is what makes the ranking auditable: a reader can ask why an idea
 * came second and be shown the dimension it lost on.
 *
 * Disqualification is separate from ranking
 * ----------------------------------------
 * An idea that fails a hard stress test is still ranked, and is marked
 * `disqualified_by`. Removing it from the list would hide the comparison that
 * explains why the winner won — and a director looks at the rejected work, which
 * is how they know the shortlist was a choice rather than the only survivor.
 */

/**
 * How close two scores have to be before the taste memory may reorder them.
 *
 * Deliberately small. A wider band would let guidance override real differences
 * in quality, which is the point at which memory stops informing and starts
 * deciding.
 */
export const GUIDANCE_BAND = 4;

export interface RankingContext {
  case_id: string;
  brand?: string;
  product?: string;
  category?: string;
  audience?: string;
  objective?: string;
  briefProblem?: string;
  human_truth?: string;
  culture?: CulturalContext;
  tension?: DynamicHumanTension | null;
  /** The distinctive phrase from the brief's challenge, for the brand test. */
  keyPhrase?: string;
  /** Phase 4.0.4.1. What is known about the brand, which is usually little. */
  brandDNA?: BrandDNA;
  /** Selection weights from the memory engine. 1 is neutral. */
  weightFor?: (idea: string) => number;
  /**
   * Phase 4.0.5. Where an idea's creative structure sits in the order the taste
   * memory suggests trying them. Lower is earlier. Optional, and absent by
   * default: a run without memory behaves exactly as it did before.
   */
  structureRank?: (idea: string) => number;
  priorIdeas?: string[];
  priorTruths?: string[];
}

export interface RankingResult {
  case_id: string;
  /**
   * Phase 4.0.5. True where taste guidance actually changed the order.
   *
   * Distinguishes guidance that was *offered* from guidance that *acted*. The
   * first A/B run showed 63 briefs reached by guidance and a zero delta on every
   * measure, which could mean either a well-restrained memory or an inert one.
   * This is the field that tells the two apart.
   */
  guidance_reordered?: boolean;
  territory: CreativeTerritory | null;
  ranked: RankedIdea[];
  /** The highest-ranked idea that is not disqualified, if any. */
  recommended?: RankedIdea;
  notes: string[];
}

export class IdeaRankingEngine {
  public static rank(
    // Phase 4.0.7: widened from `ModeExpression[]`. Candidates now arrive from
    // the population builder, whose `mode` records the direction a candidate was
    // generated under rather than one of the six expression-mode labels. Only
    // `big_idea` and `mode` are read here, and `ModeExpression` still satisfies
    // the type, so every existing caller is unaffected.
    ideas: RankableIdea[],
    territory: CreativeTerritory | null,
    context: RankingContext
  ): RankingResult {
    const notes: string[] = [];
    if (!ideas.length) {
      return { case_id: context.case_id, territory, ranked: [], notes: ["No ideas to rank."] };
    }

    const scored: RankedIdea[] = ideas.map((idea) => {
      // Order matters: the stress tests feed both of the models below, so they
      // run first and their result is passed rather than recomputed.
      const stress = CreativeStressTest.run(idea.big_idea, {
        brand: context.brand,
        product: context.product,
        category: context.category,
        behaviour: context.tension?.observable_behavior,
        keyPhrase: context.keyPhrase,
        priorIdeas: context.priorIdeas,
      });

      // ── Phase 4.0.4.1: four dimensions now come from evaluators that
      // ── ask the question properly rather than from surface proxies.
      const ownership = BrandDNAOwnership.evaluate(idea.big_idea, context.brandDNA || NO_BRAND_DNA, {
        behaviour: context.tension?.observable_behavior,
        keyPhrase: context.keyPhrase,
        tension: context.tension,
      });
      const memory = MemoryPatternEvaluator.evaluate(idea.big_idea, { tension: context.tension });
      const originality = CreativeOriginalityMatrix.evaluate(idea.big_idea, {
        briefProblem: context.briefProblem,
        human_truth: context.human_truth,
        priorIdeas: context.priorIdeas,
        priorTruths: context.priorTruths,
        tension: context.tension,
        brandOwnership: ownership.ownership,
        breachesPermission: ownership.breaches_permission,
      });
      const scalability = CampaignScalabilityTest.run(idea.big_idea, {
        territory,
        human_truth: context.human_truth,
      });

      // An unestablished ownership is not a zero.
      //
      // `BrandDNAOwnership` answers properly when there is DNA to answer from,
      // and on a brief carrying only a name, a product and a tone it reports low
      // confidence — correctly. Scoring that as 0 would let a dimension nobody
      // has the evidence for decide a fifth of the ranking, which is worse than
      // the token test it replaced rather than better.
      //
      // So below the confidence floor the ranking falls back to the situational
      // evidence 4.0.4 used, and the full verdict still travels on the row so a
      // reader can see which of the two answered.
      const ownershipKnown = ownership.confidence >= 0.5;
      const situational = stress.results.find((r) => r.test === "REPLACE_BRAND")?.survived ? 0.6 : 0.15;
      const brandOwnershipScore = ownership.breaches_permission
        ? 0
        : ownershipKnown
          ? ownership.ownership
          : Math.max(ownership.ownership, situational);

      const taste = CreativeTasteEngine.evaluate(idea.big_idea, {
        human_truth: context.human_truth,
        briefProblem: context.briefProblem,
        objective: context.objective,
        audience: context.audience,
        product: context.product,
        culture: context.culture,
        tension: context.tension,
        priorIdeas: context.priorIdeas,
        priorTruths: context.priorTruths,
        stress,
      });

      const director = CreativeDirectorEvaluationModel.evaluate(idea.big_idea, {
        ownership: brandOwnershipScore,
        brand: context.brand,
        product: context.product,
        category: context.category,
        audience: context.audience,
        tension: context.tension,
        stress,
        priorIdeas: context.priorIdeas,
      });

      // Carried, never recomputed. Each now comes from the evaluator that asks
      // the question directly: ownership from brand DNA rather than from a token
      // match, memorability from why a thing is remembered rather than from its
      // length, originality from a position on novelty × relevance rather than
      // from novelty alone, execution from six channels rather than from one.
      const dimensions: Record<RankingDimension, number> = {
        originality: originality.score / 100,
        human_impact: taste.dimensions.human_resonance,
        brand_ownership: brandOwnershipScore,
        memorability: memory.total / 100,
        execution: scalability.scalability,
        longevity: director.dimensions.longevity,
      };

      let score = 0;
      for (const k of Object.keys(RANKING_WEIGHTS) as RankingDimension[]) {
        score += dimensions[k] * RANKING_WEIGHTS[k];
      }

      // Disqualification now includes a permission breach, which is not a weak
      // idea but one that cannot run at all.
      const hardFailures = stress.failures.filter((f) => f === "REPLACE_BRAND" || f === "COPY");
      if (ownership.breaches_permission && !hardFailures.includes("COPY")) hardFailures.push("COPY");

      // Learned weights move selection order only, and only within the cap the
      // memory engine enforces. They cannot change what counts as good.
      const weighted = context.weightFor ? score * context.weightFor(idea.big_idea) : score;

      return {
        idea: idea.big_idea,
        mode: idea.mode,
        // Phase 4.0.7: the candidate's own ground where it has one. A pool can
        // now span several territories, and labelling every idea with the
        // primary one would put a false provenance into taste memory.
        territory: idea.territory || territory?.name || "",
        dimensions,
        score: Number(weighted.toFixed(2)),
        rank: 0,
        disqualified_by: hardFailures.length ? hardFailures : undefined,
        taste,
        director,
        stress,
        ownership,
        memory,
        originality,
        scalability,
      };
    });

    // Sort by score, then by idea text so the order is stable across runs.
    scored.sort((a, b) => b.score - a.score || a.idea.localeCompare(b.idea));

    // ── Taste memory: a tie-break inside a band, never a score change ───
    //
    // Guidance from the memory reorders ideas whose scores are close enough to
    // be indistinguishable — within `GUIDANCE_BAND` of the group leader — and
    // has no effect at all outside that band. An idea that scores materially
    // higher still wins however unfashionable its structure.
    //
    // This is the only place memory touches selection, and it touches order
    // rather than value. The rubrics are untouched, which is the same line the
    // 4.0.4.1 learning loop drew: a memory allowed to move scores would tune the
    // work to the metrics' blind spots rather than to anything worth having.
    let reordered = false;
    if (context.structureRank) {
      const rank = context.structureRank;
      let i = 0;
      while (i < scored.length) {
        let j = i + 1;
        while (j < scored.length && scored[i].score - scored[j].score <= GUIDANCE_BAND) j++;
        if (j - i > 1) {
          const group = scored.slice(i, j);
          const before = group.map((g) => g.idea).join("|");
          group.sort((a, b) => rank(a.idea) - rank(b.idea) || b.score - a.score);
          if (group.map((g) => g.idea).join("|") !== before) reordered = true;
          scored.splice(i, j - i, ...group);
        }
        i = j;
      }
    }

    scored.forEach((r, i) => (r.rank = i + 1));

    const recommended = scored.find((r) => !r.disqualified_by);
    if (!recommended) {
      notes.push(
        "Every idea on this territory failed a hard stress test. The territory is sound and the " +
          "expressions of it are not — which is a different problem from a bad insight."
      );
    } else if (recommended.rank > 1) {
      notes.push(
        `The highest-scoring idea was disqualified by ${scored[0].disqualified_by!.join(" and ")}; ` +
          `rank ${recommended.rank} is recommended instead.`
      );
    }

    return {
      case_id: context.case_id,
      territory,
      ranked: scored,
      recommended,
      guidance_reordered: reordered,
      notes,
    };
  }

  public static aggregate(results: RankingResult[]): {
    cases: number;
    ideas_generated: number;
    mean_ideas_per_case: number;
    recommended: number;
    /** Cases where the top-scoring idea could not be recommended. */
    top_disqualified: number;
    mean_top_score: number;
    mean_spread: number;
    by_mode: Record<string, number>;
  } {
    const all = results.flatMap((r) => r.ranked);
    const withIdeas = results.filter((r) => r.ranked.length);
    const spreads = withIdeas
      .filter((r) => r.ranked.length > 1)
      .map((r) => r.ranked[0].score - r.ranked[r.ranked.length - 1].score);
    const by_mode: Record<string, number> = {};
    for (const r of results) if (r.recommended) by_mode[r.recommended.mode] = (by_mode[r.recommended.mode] || 0) + 1;

    return {
      cases: results.length,
      ideas_generated: all.length,
      mean_ideas_per_case: Number((all.length / (results.length || 1)).toFixed(2)),
      recommended: results.filter((r) => r.recommended).length,
      top_disqualified: results.filter((r) => r.ranked.length && r.recommended && r.recommended.rank > 1).length,
      mean_top_score: Number(
        (
          withIdeas.reduce((n, r) => n + (r.recommended?.score ?? r.ranked[0].score), 0) /
          (withIdeas.length || 1)
        ).toFixed(2)
      ),
      mean_spread: Number((spreads.reduce((a, b) => a + b, 0) / (spreads.length || 1)).toFixed(2)),
      by_mode,
    };
  }

  public static format(agg: ReturnType<typeof IdeaRankingEngine.aggregate>): string {
    return [
      `IDEA RANKING — ${agg.cases} cases · ${agg.ideas_generated} ideas (${agg.mean_ideas_per_case} per case)`,
      `  recommended            : ${agg.recommended} / ${agg.cases}`,
      `  top choice disqualified: ${agg.top_disqualified}`,
      `  mean recommended score : ${agg.mean_top_score.toFixed(1)} / 100`,
      `  mean spread within case: ${agg.mean_spread.toFixed(1)} points`,
      `  recommended by mode    : ${JSON.stringify(agg.by_mode)}`,
      "",
      "  note: ranking recomputes nothing. Every dimension is carried from the evaluator that",
      "        owns it, so an idea's position can be traced to the number that decided it. The",
      "        spread is worth watching: a small spread means the modes are not really competing.",
    ].join("\n");
  }
}
