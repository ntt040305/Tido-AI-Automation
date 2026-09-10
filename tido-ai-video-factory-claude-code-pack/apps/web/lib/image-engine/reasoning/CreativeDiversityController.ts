import { similarity } from "./OriginalityEvaluator";
import { CampaignAngle, DiversityDecision, DiversityState } from "./creative-synthesis.types";

/**
 * Stops a run from producing the same campaign repeatedly.
 *
 * Held across cases, not within one. The repetition the benchmark found was
 * *between* briefs — the same tension leading five beauty campaigns, sixteen
 * distinct ideas across thirty cases. A per-case controller cannot see that and
 * would have reported perfect diversity every time.
 *
 * It penalises rather than forbids. A hard ban on a reused territory would force
 * a worse-matched one onto a brief that genuinely needs it, which trades a
 * diversity number for a worse campaign. The penalty makes repetition expensive
 * and lets a strong candidate pay it.
 */

const REPEAT_PENALTY = 0.35;
const ANGLE_SATURATION = 0.25;

export class CreativeDiversityController {
  private readonly state: DiversityState = {
    used_territories: new Set(),
    used_angles: new Map(),
    used_tensions: new Set(),
    used_ideas: [],
  };

  /** Total ideas recorded so far. */
  public size(): number {
    return this.state.used_ideas.length;
  }

  public ideas(): string[] {
    return [...this.state.used_ideas];
  }

  /**
   * How heavily a candidate should be penalised for repeating this run.
   *
   * Three independent kinds of repetition, because they fail differently: a
   * reused territory makes two campaigns claim the same ground, a saturated
   * angle makes every campaign argue the same way, and a reused tension makes
   * them about the same person.
   */
  public assess(candidate: {
    angle: CampaignAngle;
    territory?: string | null;
    tension?: string | null;
    big_idea: string;
  }): DiversityDecision {
    const reasons: string[] = [];
    let penalty = 0;

    if (candidate.territory && this.state.used_territories.has(candidate.territory)) {
      penalty += REPEAT_PENALTY;
      reasons.push("territory already claimed in this run");
    }
    if (candidate.tension && this.state.used_tensions.has(candidate.tension)) {
      penalty += REPEAT_PENALTY;
      reasons.push("tension already used in this run");
    }

    // An angle is saturated once it has led more than a quarter of the ideas so
    // far. Measured as a share rather than a count, so the rule behaves the same
    // on a six-case run as on a thirty-case one.
    const total = Math.max(1, this.state.used_ideas.length);
    const angleShare = (this.state.used_angles.get(candidate.angle) ?? 0) / total;
    if (this.state.used_ideas.length >= 4 && angleShare > ANGLE_SATURATION) {
      penalty += REPEAT_PENALTY * 0.6;
      reasons.push(`the ${candidate.angle} angle already leads ${Math.round(angleShare * 100)}% of this run`);
    }

    // A near-duplicate of an idea already produced is suppressed outright: two
    // campaigns with the same idea is not a diversity penalty, it is a mistake.
    const nearest = this.state.used_ideas.reduce(
      (worst, prior) => Math.max(worst, similarity(candidate.big_idea, prior)),
      0
    );
    if (nearest >= 0.8) {
      return {
        allowed: false,
        reason: `near-duplicate of an idea already produced (${nearest.toFixed(2)})`,
        repetition_penalty: 1,
      };
    }

    return {
      allowed: true,
      reason: reasons.length ? reasons.join("; ") : undefined,
      repetition_penalty: Number(Math.min(1, penalty).toFixed(3)),
    };
  }

  /** Records what was actually used, after selection. */
  public record(entry: {
    angle: CampaignAngle;
    territory?: string | null;
    tension?: string | null;
    big_idea: string;
  }): void {
    if (entry.territory) this.state.used_territories.add(entry.territory);
    if (entry.tension) this.state.used_tensions.add(entry.tension);
    this.state.used_angles.set(entry.angle, (this.state.used_angles.get(entry.angle) ?? 0) + 1);
    this.state.used_ideas.push(entry.big_idea);
  }

  /** Diversity of the run so far, for reporting. */
  public metrics(): {
    ideas: number;
    distinct_ideas: number;
    distinct_territories: number;
    distinct_tensions: number;
    angle_distribution: Record<string, number>;
    /** 0-1. Share of ideas that are distinct from every other. */
    diversity_ratio: number;
  } {
    const distinct = new Set(this.state.used_ideas).size;
    return {
      ideas: this.state.used_ideas.length,
      distinct_ideas: distinct,
      distinct_territories: this.state.used_territories.size,
      distinct_tensions: this.state.used_tensions.size,
      angle_distribution: Object.fromEntries(this.state.used_angles),
      diversity_ratio: this.state.used_ideas.length
        ? Number((distinct / this.state.used_ideas.length).toFixed(3))
        : 0,
    };
  }

  public reset(): void {
    this.state.used_territories.clear();
    this.state.used_tensions.clear();
    this.state.used_angles.clear();
    this.state.used_ideas.length = 0;
  }
}
