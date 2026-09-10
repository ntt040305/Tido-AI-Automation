import { similarity } from "./OriginalityEvaluator";
import { CreativeLens, HumanInsight } from "./human-insight.types";
import { HumanTensionAnalyzer } from "./HumanTensionAnalyzer";

/**
 * Stops a run from discovering the same human truth over and over.
 *
 * `CreativeDiversityController` already tracks the *expression* — ideas, angles,
 * territories. That is not the repetition this phase is exposed to. An archetype
 * library will happily assign the same archetype to twenty briefs and produce
 * twenty ladders with the same rung eight, and the expression layer will then
 * dress each one six different ways. Measured on ideas alone that looks like
 * excellent diversity; measured on truths it is one insight sold twenty times.
 *
 * So this tracks the three things that would be genuinely repeated: the truth
 * itself, the internal conflict, and the social pressure. They are separated
 * because they fail differently — two campaigns can honestly share a social
 * pressure while resting on different truths, but two campaigns sharing a truth
 * are the same campaign.
 *
 * It penalises rather than forbids, except for a near-duplicate truth. A hard ban
 * on a reused archetype would force a worse-fitting one onto a brief that
 * genuinely matches it, which trades a diversity number for a wrong insight —
 * exactly the trade Phase 4.0.2 was built to stop making.
 */

const REPEAT_PENALTY = 0.3;
const ARCHETYPE_SATURATION = 0.2;
/** Above this, two truths are the same truth differently worded. */
export const TRUTH_DUPLICATE_THRESHOLD = 0.7;

export interface InsightDiversityDecision {
  allowed: boolean;
  reason?: string;
  /** 0-1. How heavily this insight should be penalised for repeating the run. */
  repetition_penalty: number;
  /** The prior truth this one duplicates, when it does. */
  duplicate_of?: string;
}

export class InsightDiversityController {
  private readonly truths: string[] = [];
  private readonly conflicts = new Set<string>();
  private readonly pressures = new Set<string>();
  private readonly archetypes = new Map<string, number>();
  private readonly lenses = new Map<CreativeLens, number>();

  public size(): number {
    return this.truths.length;
  }

  public knownTruths(): string[] {
    return [...this.truths];
  }

  private static parts(insight: HumanInsight): { truth: string; conflict: string; pressure: string } {
    return {
      truth: norm(insight.human_truth),
      conflict: norm(HumanTensionAnalyzer.at(insight.ladder, "identity_conflict")?.statement || ""),
      pressure: norm(HumanTensionAnalyzer.at(insight.ladder, "social_fear")?.statement || ""),
    };
  }

  public assess(insight: HumanInsight): InsightDiversityDecision {
    const { truth, conflict, pressure } = InsightDiversityController.parts(insight);
    const reasons: string[] = [];
    let penalty = 0;

    // A near-duplicate truth is suppressed outright. Two campaigns resting on the
    // same truth are one campaign run twice.
    let nearest = 0;
    let closest = "";
    for (const prior of this.truths) {
      const s = similarity(truth, prior);
      if (s > nearest) {
        nearest = s;
        closest = prior;
      }
    }
    if (truth && nearest >= TRUTH_DUPLICATE_THRESHOLD) {
      return {
        allowed: false,
        reason: `the same human truth has already been used in this run (${nearest.toFixed(2)})`,
        repetition_penalty: 1,
        duplicate_of: closest,
      };
    }

    if (conflict && this.conflicts.has(conflict)) {
      penalty += REPEAT_PENALTY;
      reasons.push("the same internal conflict has already led a campaign in this run");
    }
    if (pressure && this.pressures.has(pressure)) {
      penalty += REPEAT_PENALTY;
      reasons.push("the same social pressure has already been used");
    }

    // Archetype saturation, measured as a share so the rule behaves the same on a
    // ten-case run as on a hundred-case one.
    const total = Math.max(1, this.truths.length);
    const share = (this.archetypes.get(insight.archetype) ?? 0) / total;
    if (this.truths.length >= 5 && share > ARCHETYPE_SATURATION) {
      penalty += REPEAT_PENALTY * 0.5;
      reasons.push(
        `${insight.archetype} already accounts for ${Math.round(share * 100)}% of this run's insights`
      );
    }

    return {
      allowed: true,
      reason: reasons.length ? reasons.join("; ") : undefined,
      repetition_penalty: Number(Math.min(1, penalty).toFixed(3)),
    };
  }

  public record(insight: HumanInsight, lens?: CreativeLens): void {
    const { truth, conflict, pressure } = InsightDiversityController.parts(insight);
    if (truth) this.truths.push(truth);
    if (conflict) this.conflicts.add(conflict);
    if (pressure) this.pressures.add(pressure);
    this.archetypes.set(insight.archetype, (this.archetypes.get(insight.archetype) ?? 0) + 1);
    if (lens) this.lenses.set(lens, (this.lenses.get(lens) ?? 0) + 1);
  }

  public metrics(): {
    insights: number;
    distinct_truths: number;
    distinct_conflicts: number;
    distinct_pressures: number;
    archetype_distribution: Record<string, number>;
    lens_distribution: Record<string, number>;
    /** 0-1. Share of truths distinct from every other. */
    truth_diversity: number;
    /** The archetype that led the most cases, and how many. */
    most_used_archetype?: { archetype: string; count: number };
  } {
    const distinct = new Set(this.truths).size;
    const top = [...this.archetypes.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      insights: this.truths.length,
      distinct_truths: distinct,
      distinct_conflicts: this.conflicts.size,
      distinct_pressures: this.pressures.size,
      archetype_distribution: Object.fromEntries(this.archetypes),
      lens_distribution: Object.fromEntries(this.lenses),
      truth_diversity: this.truths.length ? Number((distinct / this.truths.length).toFixed(3)) : 0,
      most_used_archetype: top ? { archetype: top[0], count: top[1] } : undefined,
    };
  }

  public reset(): void {
    this.truths.length = 0;
    this.conflicts.clear();
    this.pressures.clear();
    this.archetypes.clear();
    this.lenses.clear();
  }
}

function norm(text: string): string {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
