import { ArtDirectionDimension } from "../service/ArtDirectionResolverService";
import { CreativeStage, DirectionSlot, ReasoningRetrievalQuery, ScoredReasoningKnowledge } from "./reasoning-knowledge.types";

/**
 * CIOS Phase 1 — the Creative Decision.
 *
 * A Creative Decision is what a reasoning knowledge object becomes once it has
 * been matched to a specific brief. Knowledge says "in this situation, choose X
 * because Y". A decision says "for THIS campaign, we are choosing X, here is the
 * knowledge it came from, and here is what we expect it to achieve".
 *
 * This distinction is the whole point of Governance §1: reasoning knowledge never
 * reaches the image model, but the decision it produced does. The decision is the
 * membrane between the two layers, so it carries exactly the fields the render
 * pipeline is allowed to see — and deliberately not `problem`, `reasoning`,
 * `why_this_works`, `human_insight` or `anti_patterns`, which are reasoning-time
 * material only.
 *
 * Traceability follows Core Architecture §15: Decision → Reason → Knowledge
 * Source → Expected Impact.
 */

/** Where a decision is allowed to travel. */
export type DecisionTarget =
  /** Becomes a KNOWLEDGE-tier art direction candidate. */
  | "ART_DIRECTION"
  /** Informs campaign strategy; reaches the render only through the strategy tier. */
  | "STRATEGY"
  /** Reasoning-time only. Never enters any prompt. */
  | "ADVISORY";

export interface CreativeDecision {
  decision_id: string;
  /** Governance §6 — the stage this decision belongs to. */
  stage: CreativeStage;
  target: DecisionTarget;
  /**
   * Set only when target is ART_DIRECTION. `undefined` means the decision is real
   * but has no route into the resolver at this tier — recorded, not silently lost.
   */
  art_direction_dimension?: ArtDirectionDimension;
  /**
   * The CreativeDirection field this decision fills.
   *
   * Usually implied by the dimension. Present as its own field because typography
   * has a destination field and no resolver dimension, so dimension alone cannot
   * express where every decision lands.
   */
  direction_slot?: DirectionSlot;

  /** What to do. This is the ONLY field permitted to reach a prompt. */
  decision: string;
  /** Why it is correct. Diagnostics and future traceability; never prompt-bound. */
  reasoning: string;
  /** Expected result (Governance §7 / Core §15). */
  expected_impact: string;

  /** knowledge_id values this decision was derived from. */
  derived_from: string[];
  /** How well the source knowledge matched this brief (0-1). */
  context_relevance: number;
  /** Reliability of the source knowledge (0-1). */
  confidence: number;
  /** Ranking score carried from retrieval. */
  score: number;

  /** From avoid_when and anti_patterns. Reasoning-time guardrails. */
  avoid: string[];
  trade_off?: string;
  alternatives: string[];

  /** Score multiplier applied by the campaign concept (1 = neutral). */
  concept_alignment?: number;
  /** Why the concept reinforced, ignored or vetoed this decision. */
  concept_note?: string;
}

/** A decision that lost to a higher-scoring one on the same dimension. */
export interface SupersededDecision {
  decision_id: string;
  art_direction_dimension?: ArtDirectionDimension;
  decision: string;
  derived_from: string[];
  score: number;
  reason: "OUTRANKED_ON_DIMENSION";
  superseded_by: string;
}

/** A decision with no route into the resolver at the KNOWLEDGE tier. */
export interface UnmappedDecision {
  decision_id: string;
  decision: string;
  derived_from: string[];
  intended_dimension?: ArtDirectionDimension;
  reason: string;
}

export interface CreativeDecisionSet {
  /** Decisions that will become art direction candidates. */
  art_direction: CreativeDecision[];
  /** Decisions that inform strategy rather than visual execution. */
  strategy: CreativeDecision[];
  /** Reasoning-time only — evaluation rules, channel notes, production notes. */
  advisory: CreativeDecision[];

  superseded: SupersededDecision[];
  unmapped: UnmappedDecision[];
  warnings: string[];
}

/**
 * Full diagnostic trace: retrieved knowledge → reasoning applied → decisions →
 * art direction. Built so a surprising render can be read backwards to the
 * knowledge object that caused it.
 */
export interface CreativeDecisionTrace {
  /** 1 — what the brief resolved to. */
  query: ReasoningRetrievalQuery;
  /** 2 — what was retrieved, and how well it matched. */
  retrieved: {
    knowledge_id: string;
    name: string;
    domain: string;
    knowledge_type: string;
    context_relevance: number;
    score: number;
    matched_axes: string[];
  }[];
  candidates_evaluated: number;
  /** 3 — how each object was transformed. */
  reasoning_applied: {
    knowledge_id: string;
    domain: string;
    routed_to: DecisionTarget;
    art_direction_dimension?: ArtDirectionDimension;
    rule: string;
  }[];
  /** 4 — the decisions produced. */
  decisions: CreativeDecisionSet;
  /** 5 — what the resolver was handed (KNOWLEDGE tier only). */
  art_direction_input?: Record<string, string | string[]>;
  /** 6 — what the resolver decided, if it was run. */
  art_direction_output?: {
    dimension: string;
    value: string;
    source: string;
    score: number;
  }[];
  warnings: string[];
}

/** Fields a decision may expose downstream. Used to assert layer separation. */
export const PROMPT_SAFE_DECISION_FIELDS = ["decision"] as const;

/**
 * Fields that must NEVER leave the reasoning layer.
 *
 * Enforced by test rather than left to review: these carry the internal argument
 * for a decision, and an image model handed an argument instead of an instruction
 * produces literal illustrations of the argument.
 */
export const REASONING_ONLY_KNOWLEDGE_FIELDS = [
  "problem",
  "reasoning",
  "why_this_works",
  "human_insight",
  "anti_patterns",
  "use_when",
  "avoid_when",
] as const;

export type RetrievedForDecision = ScoredReasoningKnowledge;
