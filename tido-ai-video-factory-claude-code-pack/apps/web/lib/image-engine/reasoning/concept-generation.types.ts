import { ReasoningRetrievalQuery, ScoredReasoningKnowledge } from "./reasoning-knowledge.types";

/**
 * CIOS Phase 4.0.1 — concept generation types.
 *
 * Phase 4.0 authored 101 concept objects and the layer started producing ideas.
 * What it did not do is *use* them as a chain: `pickLead` chose one object and
 * every step — tension, insight, territory, idea — was derived from that same
 * object. The trace recorded four steps; the reasoning had one.
 *
 * That shows up as sameness. All thirty benchmark briefs led from
 * `human_tension`, and within an industry the same tension led several, which
 * the blindness audit reported as a repetition tell. One object cannot supply
 * four different kinds of thinking.
 *
 * These types describe a chain where each step is selected on its own terms:
 *
 *   Human Tension      what the person is caught between
 *   Consumer Insight   the observation that names it
 *   Campaign Territory the ownable space it opens
 *   Big Idea           what the brand says because of all three
 */

/** The four steps, in the order a planner walks them. */
export type ConceptChainStepId = "human_tension" | "consumer_insight" | "campaign_territory" | "big_idea";

export const CONCEPT_CHAIN_STEPS: ConceptChainStepId[] = [
  "human_tension",
  "consumer_insight",
  "campaign_territory",
  "big_idea",
];

/**
 * The five signals a concept object is scored on.
 *
 * Deliberately different from the eight retrieval axes. Those ask "does this
 * knowledge apply to this brief"; these ask "is this the right human material
 * for this brief", which is a different question and the reason a strategy rule
 * and a human tension can score identically on context and very differently
 * here.
 */
export interface ConceptRelevanceSignals {
  /** Does the tension the object names appear in the brief's own problem? */
  human_problem: number;
  /** Does it address this audience specifically rather than anyone? */
  audience: number;
  /** Does it suit this brand's price and market position? */
  brand_position: number;
  /** Was it authored for this industry? */
  industry: number;
  /** Does its emotional register match the brief's stated tone? */
  emotional: number;
}

export interface ConceptRelevanceScore {
  knowledge_id: string;
  domain: string;
  signals: ConceptRelevanceSignals;
  /** Weighted 0-1. */
  total: number;
  /** Which signals actually fired, for the trace. */
  matched: string[];
}

/** One selected step, with the object behind it and why it won. */
export interface ConceptChainStep {
  step: ConceptChainStepId;
  value: string;
  source: string | null;
  source_domain: string | null;
  /** 0-1 concept relevance of the selected object. */
  score: number;
  /** Why this object rather than the runner-up. */
  rationale: string;
  /** Objects considered but not selected, highest first. */
  considered: { knowledge_id: string; score: number }[];
}

/**
 * The restricted concept output.
 *
 * Exactly the five fields Phase 4.0.1 permits. Execution fields are absent by
 * construction rather than by validation — a generator that cannot emit a camera
 * instruction cannot leak one, which is a stronger guarantee than a gate that
 * catches it afterwards.
 */
export interface ConceptCore {
  big_idea: string;
  consumer_insight: string;
  emotional_trigger: string;
  belief_shift: string;
  campaign_territory: string;
}

export const CONCEPT_CORE_FIELDS: (keyof ConceptCore)[] = [
  "big_idea",
  "consumer_insight",
  "emotional_trigger",
  "belief_shift",
  "campaign_territory",
];

/** Fields the generator must never emit, asserted by test. */
export const CONCEPT_FORBIDDEN_FIELDS = ["camera", "layout", "typography", "composition", "lighting", "material", "colour"];

// ── Conflict resolution ───────────────────────────────────────────────────

/**
 * What a conflict is between.
 *
 * Two candidate objects conflict when they would lead the same step in
 * incompatible directions — a tension about price guilt and a tension about
 * time scarcity produce different campaigns, and picking by raw score alone
 * makes the choice arbitrary.
 */
export type ConflictPriority = "AUDIENCE_TRUTH" | "BRAND_POSITIONING" | "DIFFERENTIATION" | "EMOTIONAL_STRENGTH";

/**
 * Priority order, highest first.
 *
 * Audience truth outranks everything because a concept that is wrong about the
 * person is wrong regardless of how well it fits the brand. Emotional strength
 * sits last not because it matters least but because it is the least verifiable
 * — settling a tie on the least checkable criterion is how a chain becomes
 * unexplainable.
 */
export const CONFLICT_PRIORITY: ConflictPriority[] = [
  "AUDIENCE_TRUTH",
  "BRAND_POSITIONING",
  "DIFFERENTIATION",
  "EMOTIONAL_STRENGTH",
];

export interface ConflictResolution {
  step: ConceptChainStepId;
  winner: string;
  loser: string;
  /** The first priority level on which the two differed. */
  decided_by: ConflictPriority;
  rationale: string;
}

export interface ConceptGenerationTrace {
  query: ReasoningRetrievalQuery;
  chain: ConceptChainStep[];
  conflicts: ConflictResolution[];
  scores: ConceptRelevanceScore[];
  warnings: string[];
}

export interface ConceptGenerationOutput {
  concept: ConceptCore;
  /**
   * Phase 4.0.1.5 — the composed idea and its reasoning.
   *
   * Absent when the material supported no composition, in which case `concept`
   * falls back to the retrieved decision and says so in the trace warnings.
   */
  synthesis?: import("./creative-synthesis.types").CreativeSynthesisOutput;
  originality?: import("./creative-synthesis.types").OriginalityAssessment;
  trace: ConceptGenerationTrace;
  /** True when every step found an object. */
  complete: boolean;
}

/** Candidates available to the generator, already retrieved and admitted. */
export type ConceptCandidate = ScoredReasoningKnowledge;
