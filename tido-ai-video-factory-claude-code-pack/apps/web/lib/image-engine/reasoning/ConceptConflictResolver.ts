import { ReasoningRetrievalQuery } from "./reasoning-knowledge.types";
import {
  CONFLICT_PRIORITY,
  ConceptCandidate,
  ConceptChainStepId,
  ConceptRelevanceScore,
  ConflictPriority,
  ConflictResolution,
} from "./concept-generation.types";

/**
 * Decides between two concept candidates that would lead a step differently.
 *
 * Raw score already ranks candidates, so why arbitrate at all? Because two
 * objects routinely score within a hair of each other and produce completely
 * different campaigns — a price-guilt tension and a time-scarcity tension both
 * fit a premium skincare brief, and picking on a fourth decimal place makes the
 * campaign's central thought an artefact of rounding.
 *
 * The priority order is stated once, in `CONFLICT_PRIORITY`, and applied here in
 * sequence. The first level on which the two candidates genuinely differ decides
 * it, and that level is recorded — so a surprising concept can be explained by
 * naming the criterion that chose it rather than by re-deriving the arithmetic.
 */

/** Below this the two candidates are not really in contention. */
const CONTENTION_THRESHOLD = 0.12;

export class ConceptConflictResolver {
  /**
   * Returns the winner and, when a genuine conflict existed, how it was settled.
   *
   * `undefined` resolution means the leader won outright — there was no contest
   * to record, and recording one would suggest a judgement that was not made.
   */
  public static resolve(
    step: ConceptChainStepId,
    ranked: { candidate: ConceptCandidate; score: ConceptRelevanceScore }[],
    query: ReasoningRetrievalQuery
  ): { winner: { candidate: ConceptCandidate; score: ConceptRelevanceScore }; resolution?: ConflictResolution } {
    if (ranked.length === 0) throw new Error("resolve called with no candidates");
    const [first, second] = ranked;
    if (!second || first.score.total - second.score.total > CONTENTION_THRESHOLD) {
      return { winner: first };
    }

    for (const level of CONFLICT_PRIORITY) {
      const a = this.levelScore(level, first, query);
      const b = this.levelScore(level, second, query);
      if (a === b) continue;

      const winner = a > b ? first : second;
      const loser = a > b ? second : first;
      return {
        winner,
        resolution: {
          step,
          winner: winner.score.knowledge_id,
          loser: loser.score.knowledge_id,
          decided_by: level,
          rationale: this.rationale(level, winner, loser),
        },
      };
    }

    // Indistinguishable on every priority level. The higher raw score wins and
    // the tie is recorded as such rather than dressed up as a judgement.
    return {
      winner: first,
      resolution: {
        step,
        winner: first.score.knowledge_id,
        loser: second.score.knowledge_id,
        decided_by: "EMOTIONAL_STRENGTH",
        rationale:
          "Indistinguishable on audience truth, positioning and differentiation; settled on the higher overall score.",
      },
    };
  }

  /**
   * How well a candidate satisfies one priority level.
   *
   * Each level reads a different signal, which is the point: two candidates that
   * tie on the composite can differ sharply on audience truth alone.
   */
  private static levelScore(
    level: ConflictPriority,
    entry: { candidate: ConceptCandidate; score: ConceptRelevanceScore },
    query: ReasoningRetrievalQuery
  ): number {
    const { score, candidate } = entry;
    switch (level) {
      case "AUDIENCE_TRUTH":
        // Audience match plus how well the tension matches the brief's own
        // problem: both are claims about the person rather than about the brand.
        return Number((score.signals.audience * 0.5 + score.signals.human_problem * 0.5).toFixed(4));
      case "BRAND_POSITIONING":
        return score.signals.brand_position;
      case "DIFFERENTIATION": {
        // An object that names what the category does wrong is more
        // differentiating than one that does not.
        const antiPatterns = (candidate.object.anti_patterns || []).length;
        const hasTerritory = Boolean(
          (candidate.object.domain_profile as { campaign_territory?: string } | undefined)?.campaign_territory
        );
        return Number((Math.min(1, antiPatterns) * 0.6 + (hasTerritory ? 0.4 : 0)).toFixed(4));
      }
      case "EMOTIONAL_STRENGTH":
        return score.signals.emotional;
    }
  }

  private static rationale(
    level: ConflictPriority,
    winner: { score: ConceptRelevanceScore },
    loser: { score: ConceptRelevanceScore }
  ): string {
    const w = winner.score.knowledge_id;
    const l = loser.score.knowledge_id;
    switch (level) {
      case "AUDIENCE_TRUTH":
        return `${w} names a tension closer to this audience's stated problem than ${l} does.`;
      case "BRAND_POSITIONING":
        return `${w} was authored for this brand position; ${l} is positioned differently.`;
      case "DIFFERENTIATION":
        return `${w} names what the category already does, so it can argue against it; ${l} cannot.`;
      case "EMOTIONAL_STRENGTH":
        return `${w} matches the brief's emotional register more closely than ${l}.`;
    }
  }
}
