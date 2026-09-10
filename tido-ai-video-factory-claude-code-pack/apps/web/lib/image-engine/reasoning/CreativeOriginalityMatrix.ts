import { similarity } from "./OriginalityEvaluator";
import { HumanTruthOriginalityEvaluator } from "./HumanTruthOriginalityEvaluator";
import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { CreativeInterpretationDistance } from "./CreativeInterpretationDistance";
import { classify } from "./semantic-relations";

/**
 * CIOS Phase 4.0.4.1 — novelty is not creativity.
 *
 * The confusion this removes
 * -------------------------
 * `HumanTruthOriginalityEvaluator` scored one number, and a single originality
 * number cannot distinguish the two ways an idea can be unusual. An idea nobody
 * has had because nobody needed it scores the same as an idea nobody has had
 * because nobody dared. The first is arbitrary and the second is the job.
 *
 * So this is a matrix rather than a score. Two axes:
 *
 *   novelty     — how far from what has been said before
 *   relevance   — how tightly it sits on the brief's actual problem
 *
 * and two qualifiers that decide whether the position is usable:
 *
 *   familiarity — inverse of novelty, reported separately because a familiar
 *                 idea is not automatically bad; a familiar idea that is
 *                 *right* is a convention, and conventions work.
 *   brand_fit   — whether the brand is permitted to be the one saying it.
 *
 * The five positions
 * ------------------
 *   BREAKTHROUGH  novel and relevant — the only quadrant worth aiming at
 *   CONVENTIONAL  familiar and relevant — works, owns nothing
 *   ARBITRARY     novel and irrelevant — different for its own sake
 *   STALE         familiar and irrelevant — the category's own noise
 *   MISFIT        any position the brand cannot credibly occupy
 *
 * `MISFIT` overrides the others because it is a different kind of failure: a
 * breakthrough the brand has no permission for is not a good idea with a problem,
 * it is somebody else's idea.
 */

export type OriginalityType = "BREAKTHROUGH" | "CONVENTIONAL" | "ARBITRARY" | "STALE" | "MISFIT";

export interface OriginalityMatrixResult {
  idea: string;
  /** 0-1 each. */
  familiarity: number;
  novelty: number;
  relevance: number;
  brand_fit: number;
  originality_type: OriginalityType;
  /** 0-100, and it is *not* novelty — see `scoreFor`. */
  score: number;
  reasoning: string;
  notes: string[];
}

/** Novel but weightless: different with nothing behind it. */
const ARBITRARY_MARKERS =
  /\b(?:imagine if|what if we|reinvent|disrupt|unleash|redefine|reimagin\w*|revolution)\b/i;

export class CreativeOriginalityMatrix {
  public static evaluate(
    idea: string,
    context: {
      briefProblem?: string;
      human_truth?: string;
      priorIdeas?: string[];
      priorTruths?: string[];
      tension?: DynamicHumanTension | null;
      /** 0-1 from `BrandDNAOwnership`, where it was established. */
      brandOwnership?: number;
      /** True where the idea claims something the category forbids. */
      breachesPermission?: boolean;
    } = {}
  ): OriginalityMatrixResult {
    const t = String(idea || "").trim();
    const notes: string[] = [];

    if (!t) {
      return {
        idea: t,
        familiarity: 1,
        novelty: 0,
        relevance: 0,
        brand_fit: 0,
        originality_type: "STALE",
        score: 0,
        reasoning: "No idea to place.",
        notes: ["No idea to place."],
      };
    }

    // ── Familiarity and novelty ────────────────────────────────────────
    // Carried from the evaluator that owns the question, then inverted. One
    // evaluator per property: the two must not be able to disagree.
    const owned = HumanTruthOriginalityEvaluator.evaluate(context.human_truth || t, {
      briefProblem: context.briefProblem,
      priorTruths: context.priorTruths,
      tension: context.tension,
    });
    const familiarityFinding = owned.findings.find((f) => f.question === "familiarity")!;
    let familiarity = 1 - familiarityFinding.score;

    // Repetition within the run is familiarity too, and it is the kind a client
    // actually experiences.
    let nearestIdea = 0;
    for (const p of context.priorIdeas || []) nearestIdea = Math.max(nearestIdea, similarity(t, p));
    familiarity = clamp(Math.max(familiarity, nearestIdea));
    const novelty = clamp(1 - familiarity);

    // ── Relevance ──────────────────────────────────────────────────────
    //
    // Phase 4.0.4.1: relevance is the *relation* to the truth, and the target is
    // a transformation rather than a resemblance. The earlier version rewarded
    // overlap, which meant the most relevant possible idea was the truth itself
    // — the exact confusion `CreativeInterpretationDistance` exists to remove.
    const behaviour = context.tension?.observable_behavior || "";
    const behaviourRelation = behaviour ? classify(t, behaviour) : null;
    const onBehaviour = behaviourRelation
      ? ["ENACTS", "TRANSFORMS", "INVOKES"].includes(behaviourRelation.relation)
      : false;

    const interpretation = context.human_truth
      ? CreativeInterpretationDistance.measure(t, context.human_truth)
      : null;
    const arbitrary = ARBITRARY_MARKERS.test(t);

    const relevance = clamp(
      (onBehaviour ? 0.4 : 0) +
        (interpretation ? interpretation.score * 0.5 : 0) +
        (context.tension ? 0.1 : 0) -
        (arbitrary ? 0.4 : 0)
    );
    if (arbitrary) notes.push(`Novelty for its own sake: "${t.match(ARBITRARY_MARKERS)?.[0]}".`);
    if (interpretation?.band === "ECHO") {
      notes.push("Relevant only because it repeats the truth, which is not relevance.");
    }

    // ── Brand fit ──────────────────────────────────────────────────────
    const brand_fit = context.breachesPermission ? 0 : clamp(context.brandOwnership ?? 0.5);

    // ── Position ───────────────────────────────────────────────────────
    const type = this.classify(novelty, relevance, brand_fit, Boolean(context.breachesPermission));

    return {
      idea: t,
      familiarity: round(familiarity),
      novelty: round(novelty),
      relevance: round(relevance),
      brand_fit: round(brand_fit),
      originality_type: type,
      score: this.scoreFor(type, novelty, relevance, brand_fit),
      reasoning: REASONS[type],
      notes,
    };
  }

  private static classify(
    novelty: number,
    relevance: number,
    brandFit: number,
    breach: boolean
  ): OriginalityType {
    // A permission breach is a different kind of failure and it overrides the
    // quadrant: a breakthrough the brand cannot say is somebody else's idea.
    if (breach || brandFit < 0.15) return "MISFIT";
    if (novelty >= 0.5 && relevance >= 0.5) return "BREAKTHROUGH";
    if (novelty < 0.5 && relevance >= 0.5) return "CONVENTIONAL";
    if (novelty >= 0.5 && relevance < 0.5) return "ARBITRARY";
    return "STALE";
  }

  /**
   * The score is not novelty.
   *
   * A conventional idea that is right scores above an arbitrary one that is new,
   * because the first can run and the second cannot. That ordering is the whole
   * point of the matrix, and a scale that put novelty on top would reintroduce
   * exactly the confusion this file removes.
   */
  private static scoreFor(
    type: OriginalityType,
    novelty: number,
    relevance: number,
    brandFit: number
  ): number {
    const base: Record<OriginalityType, number> = {
      BREAKTHROUGH: 80,
      CONVENTIONAL: 55,
      ARBITRARY: 30,
      STALE: 15,
      MISFIT: 10,
    };
    const bonus = type === "BREAKTHROUGH" ? novelty * 10 + brandFit * 10 : relevance * 10 + brandFit * 5;
    return Number(Math.min(100, base[type] + bonus).toFixed(2));
  }

  public static aggregate(results: OriginalityMatrixResult[]): {
    cases: number;
    mean_score: number;
    by_type: Record<OriginalityType, number>;
    mean_novelty: number;
    mean_relevance: number;
    /** Novel and irrelevant — the failure a single novelty score would reward. */
    arbitrary: number;
  } {
    const by_type = {
      BREAKTHROUGH: 0,
      CONVENTIONAL: 0,
      ARBITRARY: 0,
      STALE: 0,
      MISFIT: 0,
    } as Record<OriginalityType, number>;
    for (const r of results) by_type[r.originality_type]++;
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      cases: results.length,
      mean_score: Number(mean(results.map((r) => r.score)).toFixed(2)),
      by_type,
      mean_novelty: Number(mean(results.map((r) => r.novelty)).toFixed(3)),
      mean_relevance: Number(mean(results.map((r) => r.relevance)).toFixed(3)),
      arbitrary: by_type.ARBITRARY,
    };
  }

  public static format(agg: ReturnType<typeof CreativeOriginalityMatrix.aggregate>): string {
    return [
      `ORIGINALITY MATRIX — ${agg.cases} ideas · mean ${agg.mean_score.toFixed(1)} / 100`,
      `  breakthrough (novel + relevant) : ${agg.by_type.BREAKTHROUGH}`,
      `  conventional (familiar + right) : ${agg.by_type.CONVENTIONAL}`,
      `  arbitrary    (novel + off-brief): ${agg.by_type.ARBITRARY}`,
      `  stale        (familiar + off)   : ${agg.by_type.STALE}`,
      `  misfit       (brand cannot say) : ${agg.by_type.MISFIT}`,
      `  mean novelty ${agg.mean_novelty.toFixed(2)} · mean relevance ${agg.mean_relevance.toFixed(2)}`,
      "",
      "  note: the score is not novelty. A conventional idea that is right outranks an",
      "        arbitrary one that is new, because the first can run. A single originality",
      "        number could not tell those apart, which is why this is a matrix.",
    ].join("\n");
  }
}

const REASONS: Record<OriginalityType, string> = {
  BREAKTHROUGH: "New, and about the thing the brief is actually about.",
  CONVENTIONAL: "Familiar, and right. It will work and it will not be remembered as yours.",
  ARBITRARY: "New, and about something else. Different for its own sake.",
  STALE: "Familiar, and off the brief. This is the category's own noise.",
  MISFIT: "Whatever else it is, this brand has no standing to say it.",
};

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round(n: number): number {
  return Number(clamp(n).toFixed(4));
}
