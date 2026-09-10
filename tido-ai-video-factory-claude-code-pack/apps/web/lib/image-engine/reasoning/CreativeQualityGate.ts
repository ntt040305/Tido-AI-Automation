import { CreativeCombinationEngine } from "./CreativeCombinationEngine";
import { CreativeQualityBenchmark } from "./CreativeQualityBenchmark";
import { OriginalityEvaluator, similarity } from "./OriginalityEvaluator";
import {
  CreativeQualityDimension,
  CreativeQualityScore,
  CreativeSynthesisInput,
  CreativeSynthesisOutput,
} from "./creative-synthesis.types";

/**
 * Holds a concept back from art direction until it is good enough to execute.
 *
 * The threshold is deliberately not a single number on the 100-point total. Three
 * of the five rubric dimensions are proxies, and a concept can reach 60 on proxy
 * strength alone while failing both measured dimensions — which is precisely the
 * shape of the Phase 4.0.1.5 result: 38.7 total, of which 36.6 came from the
 * proxied half and 2.2 from the measured one. A gate keyed on the total would
 * have passed work that is about the wrong problem.
 *
 * So the gate has two conditions, and both must hold:
 *
 *   1. `human_truth` at or above its own floor. A concept that does not address
 *      the brief's stated problem is not a weak concept, it is the wrong one.
 *   2. The weighted total at or above the overall floor.
 *
 * Refinement, and its honest limit
 * --------------------------------
 * When a concept fails, the gate re-composes from the same material using a
 * different rhetorical angle. That helps where the failure was the construction
 * — a territory-led ELEVATION on a brief whose problem is a tension. It cannot
 * help where the failure was the *material*: if the chain retrieved a tension
 * about price for a brief about trust, every angle over that tension is about
 * price. The gate reports which of the two it was, because they need different
 * fixes and only one of them is a concept problem.
 */

export interface CreativeQualityThresholds {
  /** Weighted total out of 100. */
  total: number;
  /** `human_truth` as a 0-1 dimension score, before weighting. */
  human_truth: number;
}

export const DEFAULT_THRESHOLDS: CreativeQualityThresholds = {
  total: 45,
  // Low in absolute terms, and deliberately so: on the current corpus almost
  // nothing clears a high bar, and a gate that rejects everything tells you
  // nothing about which concepts are worse than the others. It rises as the
  // corpus improves.
  human_truth: 0.15,
};

export type GateVerdict = "PASS" | "REFINED" | "REJECTED";

/**
 * Above this a refinement is the previous case's idea, not an improvement.
 *
 * Refinement ranks by score alone, and score has no view of the run. On the
 * hundred-brief benchmark that put the same REFUSAL sentence on nine separate
 * briefs, each one scoring perfectly well in isolation. The gate is handed
 * `priorIdeas` precisely so it can see this; it was passing them to the scorer
 * and not looking at them itself.
 */
const REFINEMENT_DUPLICATE_THRESHOLD = 0.72;

export interface CreativeGateResult {
  verdict: GateVerdict;
  concept: CreativeSynthesisOutput;
  score: CreativeQualityScore;
  /** Set when refinement ran. */
  attempts?: number;
  /** Which failure this was, when it failed. */
  failure?: "MATERIAL" | "CONSTRUCTION";
  reasons: string[];
}

export class CreativeQualityGate {
  /**
   * Scores a concept and, if it fails, tries to rebuild it from the same
   * material before giving up.
   *
   * `priorIdeas` is passed through so refinement cannot "improve" a concept into
   * a duplicate of one already produced in the run.
   */
  public static evaluate(
    caseId: string,
    concept: CreativeSynthesisOutput,
    input: CreativeSynthesisInput,
    briefProblem: string,
    priorIdeas: string[] = [],
    thresholds: CreativeQualityThresholds = DEFAULT_THRESHOLDS
  ): CreativeGateResult {
    const score = CreativeQualityBenchmark.score(caseId, concept, input, briefProblem, priorIdeas);
    const reasons: string[] = [];

    // An empty idea is not a weak concept, it is the absence of one, and putting
    // it through the rubric produces a number that reads like a concept scored
    // badly. Seven healthcare briefs reached the gate this way. Refinement is
    // still worth attempting — the material may support a construction the
    // generator did not reach — but it is never a PASS on the empty text.
    const emptyConcept = !String(concept.big_idea || "").trim();
    if (emptyConcept) {
      reasons.push("No concept was produced: the chain yielded no idea to score.");
    }

    const passes = (s: CreativeQualityScore) =>
      s.total >= thresholds.total && s.dimensions.human_truth >= thresholds.human_truth;

    if (!emptyConcept && passes(score)) return { verdict: "PASS", concept, score, reasons };

    if (!emptyConcept && score.dimensions.human_truth < thresholds.human_truth) {
      reasons.push(
        `human_truth ${score.dimensions.human_truth.toFixed(2)} is below ${thresholds.human_truth}: ` +
          "the concept does not address the problem the brief states."
      );
    }
    if (!emptyConcept && score.total < thresholds.total) {
      reasons.push(`total ${score.total.toFixed(1)} is below ${thresholds.total}.`);
    }

    // ── Refinement: same material, different rhetorical move ───────────
    const alternatives = CreativeCombinationEngine.combine(input).filter(
      (c) => c.big_idea !== concept.big_idea
    );
    let best: { out: CreativeSynthesisOutput; score: CreativeQualityScore } | null = null;
    let suppressed = 0;

    for (const alt of alternatives) {
      // A refinement that reproduces an idea the run has already delivered is a
      // repetition dressed as an improvement.
      if (priorIdeas.some((p) => similarity(alt.big_idea, p) >= REFINEMENT_DUPLICATE_THRESHOLD)) {
        suppressed++;
        continue;
      }
      const candidate: CreativeSynthesisOutput = {
        big_idea: alt.big_idea,
        why_it_works: alt.why_it_works,
        emotional_hook: alt.emotional_hook,
        strategic_reason: alt.strategic_reason,
        angle: alt.angle,
        derived_from: concept.derived_from,
        originality_score: OriginalityEvaluator.assess(
          alt.big_idea,
          [input.human_tension, input.consumer_insight, input.campaign_territory].filter(Boolean),
          priorIdeas,
          input.avoid
        ).score,
      };
      const s = CreativeQualityBenchmark.score(caseId, candidate, input, briefProblem, priorIdeas);
      if (!best || s.total > best.score.total) best = { out: candidate, score: s };
    }

    if (suppressed) {
      reasons.push(
        `${suppressed} refinement(s) were suppressed as near-duplicates of ideas already produced in this run.`
      );
    }

    if (best && passes(best.score)) {
      return {
        verdict: "REFINED",
        concept: best.out,
        score: best.score,
        attempts: alternatives.length + 1,
        reasons: [
          ...reasons,
          `Refined from ${concept.angle} to ${best.out.angle}, raising the total to ${best.score.total.toFixed(1)}.`,
        ],
      };
    }

    // Nothing over this material passes. Which failure it was matters, because
    // the two need different fixes and only one of them is a concept problem.
    const bestHumanTruth = Math.max(
      score.dimensions.human_truth,
      best?.score.dimensions.human_truth ?? 0
    );
    const failure: "MATERIAL" | "CONSTRUCTION" =
      emptyConcept && !best
        ? "MATERIAL"
        : bestHumanTruth < thresholds.human_truth
          ? "MATERIAL"
          : "CONSTRUCTION";

    reasons.push(
      failure === "MATERIAL"
        ? "No construction over this material addresses the brief's problem — the retrieved tension is about something else."
        : "The material fits, but no available construction reaches the quality floor."
    );

    return {
      verdict: "REJECTED",
      concept: best && best.score.total > score.total ? best.out : concept,
      score: best && best.score.total > score.total ? best.score : score,
      attempts: alternatives.length + 1,
      failure,
      reasons,
    };
  }

  /** Run-level summary. */
  public static summarise(results: CreativeGateResult[]): {
    total: number;
    passed: number;
    refined: number;
    rejected: number;
    material_failures: number;
    construction_failures: number;
    pass_rate: number;
    mean_before: number;
    mean_after: number;
    weakest_dimension: CreativeQualityDimension;
  } {
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const dims = ["human_truth", "strategic_fit", "differentiation", "emotional_power", "memorability"] as CreativeQualityDimension[];
    const dimMeans = dims.map((d) => ({ d, v: mean(results.map((r) => r.score.dimensions[d])) }));
    dimMeans.sort((a, b) => a.v - b.v);

    return {
      total: results.length,
      passed: results.filter((r) => r.verdict === "PASS").length,
      refined: results.filter((r) => r.verdict === "REFINED").length,
      rejected: results.filter((r) => r.verdict === "REJECTED").length,
      material_failures: results.filter((r) => r.failure === "MATERIAL").length,
      construction_failures: results.filter((r) => r.failure === "CONSTRUCTION").length,
      pass_rate: results.length
        ? Number(
            ((results.filter((r) => r.verdict !== "REJECTED").length / results.length)).toFixed(3)
          )
        : 0,
      mean_before: Number(mean(results.map((r) => r.score.total)).toFixed(2)),
      mean_after: Number(mean(results.map((r) => r.score.total)).toFixed(2)),
      weakest_dimension: dimMeans[0].d,
    };
  }
}
