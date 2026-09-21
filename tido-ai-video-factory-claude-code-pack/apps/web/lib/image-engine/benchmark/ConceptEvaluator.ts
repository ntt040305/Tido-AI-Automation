import type { StrategyCandidate, CreativeStrategy } from "../evolution/experiment/CreativeDirectorV1";
import { OriginalityEvaluator } from "../reasoning/OriginalityEvaluator";

/**
 * Concept evaluation — comparing the directions the director already produced.
 *
 * What this is NOT
 * ----------------
 * It is not a concept generator. The system already generates several: the
 * director's single call returns `CreativeStrategy.candidates`, each developed
 * against six assessments, with `routes_offered` and `routes_developed`
 * recorded. Adding another generator would mean a second LLM call producing
 * ideas the director never saw, which is the duplicate-authority defect this
 * project has refused at every phase. `reasoning/CreativeConceptGenerator` and
 * `CreativeConceptEngine` both exist and both make model calls, which is
 * exactly why neither is wired here.
 *
 * It is also NOT a second selector. The director chose, with a recorded reason,
 * having read the brief. A layer that overrides that choice is a second
 * selection authority arguing with the one that has the context.
 *
 * What it IS
 * ----------
 * The comparison the pipeline was throwing away. The candidates are developed,
 * assessed, and then all but one are discarded before anything downstream can
 * look at them. This scores every candidate on the five criteria, reports the
 * ranking, and flags the case that matters: the director's pick scoring
 * materially below one it rejected. That flag goes to the refinement loop's
 * diagnosis, where a human or a director revision can act on it.
 *
 * Deterministic, pure, no model call. Every score is computed from data the
 * candidate already carries.
 */

export interface ConceptScore {
  route: string;
  /** Avoids the category default. From `reasoning/OriginalityEvaluator`. */
  originality: number;
  /** Does it aim at a human reaction, or only describe a picture. */
  emotional_power: number;
  /** Do the commercial assessments support it. */
  commercial_relevance: number;
  /** Can it become an image — is there a visual language at all. */
  visual_potential: number;
  /** Does the brand assessment support it. */
  brand_alignment: number;
  /** Mean of the five. Never a verdict on its own. */
  total: number;
  /** What produced each number, so a reader can disagree specifically. */
  notes: string[];
}

export interface ConceptComparison {
  scores: ConceptScore[];
  /** The route the director actually chose. */
  selected: string;
  /** The highest-scoring route, which may be the same one. */
  strongest: string;
  /**
   * True when the director's pick scored materially below another candidate.
   *
   * "Materially" is a margin rather than any difference, because these scores
   * are built partly on proxies and a 0.2 gap is noise. The margin is stated in
   * `margin` so a reader can judge it rather than trust it.
   */
  selected_is_weaker: boolean;
  margin: number;
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");
const round = (n: number) => Math.round(n * 100) / 100;

/** Supporting verdicts count for, working_against counts against. */
function verdictScore(candidate: StrategyCandidate, keys: (keyof StrategyCandidate["assessment"])[]): number {
  const a = candidate.assessment;
  if (!a) return 5;
  let total = 0;
  let counted = 0;
  for (const k of keys) {
    const v = a[k];
    if (!v?.stance) continue;
    counted++;
    // An unverified verdict is worth less than a verified one: the director's
    // own discipline downgrades a verdict whose evidence appears nowhere.
    const weight = clean(v.evidence) ? 1 : 0.5;
    total += (v.stance === "supports" ? 10 : v.stance === "works_against" ? 0 : 5) * weight;
  }
  return counted ? total / counted : 5;
}

/**
 * Scores one candidate. Pure.
 *
 * `siblings` are the other routes, so originality can measure distance from
 * them as well as from the candidate's own source material.
 */
export function scoreConcept(c: StrategyCandidate, siblings: StrategyCandidate[] = []): ConceptScore {
  const notes: string[] = [];
  const idea = clean(c.core_idea) || clean(c.route);

  const assessed = OriginalityEvaluator.assess(
    idea,
    [clean(c.why_this_route)].filter(Boolean),
    siblings.filter((s) => s !== c).map((s) => clean(s.core_idea)).filter(Boolean)
  );
  if (assessed.notes.length) notes.push(...assessed.notes.slice(0, 2));

  // A concept aimed at a reaction outscores one that only describes a frame.
  // Both fields are optional on the contract, so absence is the common case and
  // is scored as absence rather than penalised as a fault.
  const hasObjective = Boolean(clean(c.emotional_objective));
  const hasReaction = Boolean(clean(c.audience_reaction));
  const emotional_power = (hasObjective ? 5 : 0) + (hasReaction ? 5 : 0);
  if (!hasObjective && !hasReaction) notes.push("No emotional objective or audience reaction stated.");

  const commercial_relevance = verdictScore(c, ["objective", "audience", "channel"]);
  const brand_alignment = verdictScore(c, ["brand", "product"]);

  // Phase 0.2 measured what happens without this field: a strategy run reached
  // the renderer with a subject and no photograph.
  const visual_potential = clean(c.visual_language) ? 10 : 3;
  if (!clean(c.visual_language)) notes.push("No visual language: the route says what happens, not how it looks.");

  const originality = assessed.score;
  const total = round(
    (originality + emotional_power + commercial_relevance + visual_potential + brand_alignment) / 5
  );

  return {
    route: clean(c.route),
    originality: round(originality),
    emotional_power,
    commercial_relevance: round(commercial_relevance),
    visual_potential,
    brand_alignment: round(brand_alignment),
    total,
    notes,
  };
}

/** A margin below which a difference is treated as noise rather than a finding. */
export const MATERIAL_MARGIN = 1.0;

/**
 * Compares every developed candidate. Pure and total.
 *
 * Returns null when there is nothing to compare — one candidate, or none. A
 * comparison of one is not a comparison, and reporting it as one would suggest
 * the system weighed alternatives it never had.
 */
export function compareConcepts(strategy: CreativeStrategy | null | undefined): ConceptComparison | null {
  const candidates = (strategy?.candidates || []).filter((c) => c && (clean(c.route) || clean(c.core_idea)));
  if (candidates.length < 2) return null;

  const scores = candidates.map((c) => scoreConcept(c, candidates)).sort((a, b) => b.total - a.total);
  const selected = clean(strategy?.selected);
  const strongest = scores[0].route;
  const selectedScore = scores.find((s) => s.route === selected);
  const margin = selectedScore ? round(scores[0].total - selectedScore.total) : 0;

  return {
    scores,
    selected,
    strongest,
    selected_is_weaker: Boolean(selectedScore) && margin >= MATERIAL_MARGIN,
    margin,
  };
}

/** Counts and routes only — never the candidate prose. */
export function conceptTelemetry(c: ConceptComparison | null) {
  if (!c) return { concepts_compared: 0 };
  return {
    concepts_compared: c.scores.length,
    selected: c.selected,
    strongest: c.strongest,
    selected_is_weaker: c.selected_is_weaker,
    margin: c.margin,
    totals: c.scores.map((s) => s.total),
  };
}
