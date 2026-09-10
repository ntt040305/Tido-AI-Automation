/**
 * CIOS Phase 4.0.4 — the Creative Taste Engine.
 *
 * What changes at this layer
 * -------------------------
 * Everything before this phase asked *is this insight sound* — does it address
 * the brief, does it hold a contradiction, is it a stock line. Those are
 * questions about correctness, and a system can get every one of them right and
 * still produce work no creative director would put their name to.
 *
 * A director asks a different set of questions, and they are mostly about
 * *ownership* and *survival*: could anyone else run this, will it still work in
 * two years, does it need explaining, what happens when you take the logo off.
 * This phase implements those.
 *
 * The one claim this file will not make
 * ------------------------------------
 * Taste is not being measured here. What is being measured is a set of properties
 * that correlate with work a director rejects — genericness, dependence on
 * explanation, brand-interchangeability, a shelf life shorter than the campaign.
 * Those correlate imperfectly, and the direction of the error matters: this can
 * reliably identify work that is *bad*, and it cannot identify work that is
 * *good*. A high score means nothing obvious is wrong.
 *
 * That asymmetry is why the ranking engine ranks rather than approves, why the
 * stress tests reject rather than score, and why every aggregate printed by this
 * layer repeats the limit rather than assuming the reader remembers it.
 *
 * Two scales, and they are not the same scale
 * ------------------------------------------
 * The 4.0.1.5 `CreativeQualityBenchmark` still runs and still reports around 55.
 * The taste score below is a *new* rubric asking different questions, so a taste
 * score of 80 is not the old number improving — it is a different measurement of
 * a different property. Both are reported, always, side by side, because
 * replacing a low number with a high one from a rubric you just wrote is the
 * easiest way to appear to have made progress without making any.
 */

// ── Taste (Task 1) ────────────────────────────────────────────────────────

/** The eight a director reads an idea against. Weighted to 100. */
export const TASTE_WEIGHTS = {
  originality: 15,
  human_resonance: 15,
  emotional_power: 15,
  cultural_resonance: 10,
  simplicity: 12,
  memorability: 13,
  execution_potential: 10,
  strategic_fit: 10,
} as const;

export type TasteDimension = keyof typeof TASTE_WEIGHTS;

/**
 * How each dimension is arrived at.
 *
 * `DERIVED` means it is read from an upstream evaluator that already scored the
 * property — the number is carried, not recomputed, so the two cannot disagree.
 * `PROXY` means this file computes it from surface features of the text.
 * Nothing here is `MEASURED`; see the file header.
 */
export const TASTE_METHOD: Record<TasteDimension, "DERIVED" | "PROXY"> = {
  originality: "DERIVED",
  human_resonance: "DERIVED",
  emotional_power: "DERIVED",
  cultural_resonance: "PROXY",
  simplicity: "PROXY",
  memorability: "PROXY",
  execution_potential: "PROXY",
  strategic_fit: "PROXY",
};

export interface TasteScore {
  idea: string;
  /** 0-1 per dimension, before weighting. */
  dimensions: Record<TasteDimension, number>;
  /** Weighted total out of 100. */
  total: number;
  method: Record<TasteDimension, "DERIVED" | "PROXY">;
  notes: string[];
}

// ── Director's read (Task 2) ──────────────────────────────────────────────

/**
 * The four a director asks that the taste rubric does not.
 *
 * Separate from `TASTE_WEIGHTS` on purpose: these are about the idea's position
 * in a market and over time, not about the sentence. An idea can be beautiful and
 * fail all four.
 */
export const DIRECTOR_WEIGHTS = {
  brand_ownership: 30,
  longevity: 25,
  category_differentiation: 25,
  emotional_impact: 20,
} as const;

export type DirectorDimension = keyof typeof DIRECTOR_WEIGHTS;

export interface DirectorScore {
  idea: string;
  dimensions: Record<DirectorDimension, number>;
  /** Weighted total out of 100. */
  total: number;
  /** The single sentence a director would say about it. */
  verdict_line: string;
  notes: string[];
}

// ── Stress tests (Task 3) ─────────────────────────────────────────────────

export type StressTestName =
  /** Swap the brand for a competitor. Does the idea still work? */
  | "REPLACE_BRAND"
  /** Is it understood on first read, or does it need a second? */
  | "FIRST_REACTION"
  /** Does it need explaining before it lands? */
  | "EXPLANATION"
  /** Could a competitor run it tomorrow with nothing changed? */
  | "COPY";

export interface StressTestResult {
  test: StressTestName;
  /** True when the idea survives. */
  survived: boolean;
  /** What in the idea decided it. */
  evidence: string;
  /** Why this matters, in a director's terms. */
  consequence: string;
}

export interface StressTestReport {
  idea: string;
  results: StressTestResult[];
  /** An idea failing this many is not fixable by rewriting. */
  failures: StressTestName[];
  survived: boolean;
  notes: string[];
}

// ── Territory (Task 4) ────────────────────────────────────────────────────

/**
 * The space a campaign occupies, between the truth and the ideas.
 *
 * Phases 4.0.3.x went straight from a human truth to a big idea, which meant one
 * truth produced one idea and the idea *was* the strategy. A territory is the
 * intermediate a director actually works in: it names the ground, and several
 * ideas then compete inside it. That is what makes ranking meaningful — ranking
 * one idea against nothing is not ranking.
 */
export interface CreativeTerritory {
  /** Two or three words a team would say in a meeting. */
  name: string;
  /** The opposition the territory is built on, from the insight's contradiction. */
  central_tension: string;
  /** What the brand does here — not what it says. */
  brand_role: string;
  /** The feeling the work lives in. */
  emotional_space: string;
  /** What it looks like. Deliberately a direction, not an art brief. */
  visual_world: string;
  /** What the campaign is about over time, rather than in one execution. */
  story_direction: string;
  /** knowledge the territory was built from, for provenance. */
  derived_from: string[];
}

// ── Ranking (Task 5) ──────────────────────────────────────────────────────

/** The six the phase specifies. Weighted to 100. */
export const RANKING_WEIGHTS = {
  originality: 20,
  human_impact: 20,
  brand_ownership: 20,
  memorability: 15,
  execution: 15,
  longevity: 10,
} as const;

export type RankingDimension = keyof typeof RANKING_WEIGHTS;

export interface RankedIdea {
  idea: string;
  mode: string;
  territory: string;
  dimensions: Record<RankingDimension, number>;
  /** Weighted total out of 100. */
  score: number;
  /** 1 is best. */
  rank: number;
  /** Set when the idea failed a stress test; it is ranked but not recommended. */
  disqualified_by?: StressTestName[];
  taste: TasteScore;
  director: DirectorScore;
  stress: StressTestReport;
  /** Phase 4.0.4.1. Ownership as a relation to brand DNA, not a token overlap. */
  ownership?: import("./brand-dna.types").OwnershipVerdict;
  /** Phase 4.0.4.1. Why it would be remembered, rather than how short it is. */
  memory?: import("./MemoryPatternEvaluator").MemoryPatternScore;
  /** Phase 4.0.4.1. Where it sits on novelty × relevance, and what that means. */
  originality?: import("./CreativeOriginalityMatrix").OriginalityMatrixResult;
  /** Phase 4.0.4.1. Whether it survives being made six ways. */
  scalability?: import("./CampaignScalabilityTest").ScalabilityResult;
}

// ── Memory (Task 6) ───────────────────────────────────────────────────────

export interface TasteMemoryEntry {
  idea: string;
  case_id: string;
  territory: string;
  mode: string;
  score: number;
  approved: boolean;
  /** Named failures, from the stress tests and the director's read. */
  failure_reasons: string[];
  /** The surface pattern this idea's construction reduces to. */
  pattern: string;
}

export interface TastePattern {
  pattern: string;
  approved: number;
  failed: number;
  /** 0-1. Share of appearances that were approved. */
  success_rate: number;
  /** The most common reason this pattern failed, when it did. */
  common_failure?: string;
}
