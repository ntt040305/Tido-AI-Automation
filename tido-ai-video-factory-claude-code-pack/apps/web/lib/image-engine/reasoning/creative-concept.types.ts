import { CreativeConceptValidation } from "./concept-validation.types";
import { ReasoningRetrievalQuery } from "./reasoning-knowledge.types";

/**
 * CIOS Phase 1.5 — the Creative Concept.
 *
 * A concept sits between retrieved knowledge and visual decisions, and it exists
 * because those two things answer different questions. Knowledge says "for this
 * situation, choose X". A concept says "this campaign is ABOUT something" — and
 * without one, five assets can each be individually correct and still add up to
 * no idea at all.
 *
 * Deliberately free of technical instruction. There is no camera, lens, lighting
 * ratio or prompt fragment anywhere in this structure: those are decisions, and
 * decisions are downstream. A concept that specifies a focal length has stopped
 * being a concept and started being a shot list.
 *
 * Governance §1 still holds — nothing here reaches the image model directly. The
 * concept shapes which decisions are taken, and the decisions travel through the
 * art direction flow that already exists.
 */

export interface CreativeConcept {
  /** The organising thought. One sentence a creative director would defend. */
  big_idea: string;
  /** Short, memorable handle for the idea. */
  concept_name: string;
  /** What the audience should take away. */
  core_message: string;
  /** How the work should make them feel. */
  emotional_goal: string;
  /** The unresolved friction the campaign speaks to. */
  audience_tension: string;
  /** What is true about the buyer that the category ignores. */
  consumer_insight: string;
  /** What the brand does for the person — protagonist, guide, enabler. */
  brand_role: string;
  /** The narrative stance the work takes. */
  story_angle: string;
  /** The world the work lives in, described emotionally, not technically. */
  visual_world: string;
  /** The device that earns attention. */
  creative_hook: string;
  /** What makes this unlike the category default. */
  differentiation: string;

  /** Direction-level guidance. Never camera/light/prompt syntax. */
  execution_direction: string[];
  /** Territory the campaign must not enter — drawn from anti-patterns. */
  avoid_direction: string[];

  /** knowledge_id values this concept was synthesised from. */
  derived_from: string[];
  /** 0-1, inherited from source knowledge reliability. */
  confidence: number;
  /** 0-1 ranking score. */
  score: number;
}

export type ConceptCriterion = "genericness" | "differentiation" | "emotional_depth" | "brand_fit";

export interface ConceptCriterionScore {
  criterion: ConceptCriterion;
  /** 0-10. For genericness, HIGHER IS WORSE — it measures how generic the idea is. */
  score: number;
  /** Plain statement of what produced the score. */
  finding: string;
  /** What would raise it. Present only when the score is below target. */
  improvement?: string;
}

export interface ConceptEvaluation {
  scores: ConceptCriterionScore[];
  /** 0-10 overall, with genericness inverted before contributing. */
  overall: number;
  /**
   * False when the concept fails a hard gate. Governance Module 18 requires the
   * system to be able to reject weak ideas, not merely annotate them.
   */
  accepted: boolean;
  rejection_reasons: string[];
  /** Category clichés detected inside the concept text itself. */
  cliches_detected: string[];
}

export interface ConceptGenerationResult {
  concept: CreativeConcept;
  evaluation: ConceptEvaluation;
  /**
   * Phase 3.1.8.1 — whether the concept stayed inside its own layer.
   *
   * Separate from `evaluation`, which asks whether the idea is any good. A
   * concept can be evaluated as strong and still be an art direction decision
   * wearing the wrong label, which is exactly what was happening on twenty of
   * thirty benchmark cases.
   */
  separation?: CreativeConceptValidation;
  warnings: string[];
}

/** Full Phase 1.5 diagnostic chain. */
/**
 * Phase 4.0 — the four steps a planner walks, each with its source.
 *
 * Recorded so a weak concept can be traced to the step that failed. Before this
 * existed the only diagnostic was the finished concept, which made "the idea is
 * poor" and "no tension was retrieved" indistinguishable.
 */
export interface ConceptReasoningChain {
  human_tension: { value: string; source: string | null };
  consumer_insight: { value: string; source: string | null };
  campaign_territory: { value: string; source: string | null };
  big_idea: { value: string; source: string | null };
}

export interface CreativeConceptTrace {
  brief_query: ReasoningRetrievalQuery;
  /** Phase 4.0 — tension → insight → territory → big idea. */
  reasoning_chain?: ConceptReasoningChain;
  retrieved: { knowledge_id: string; domain: string; score: number; context_relevance: number }[];
  concept_sources: {
    field: keyof CreativeConcept;
    knowledge_id: string | null;
    derivation: string;
  }[];
  concept: CreativeConcept;
  evaluation: ConceptEvaluation;
  warnings: string[];
}

/**
 * Language that signals an idea has not been had yet.
 *
 * These are the phrases a brief produces when it restates itself: they describe a
 * desirable quality without committing to anything a viewer could recognise. Used
 * to score genericness on the concept's own text.
 */
export const GENERIC_MARKERS = [
  "high quality",
  "premium quality",
  "best choice",
  "top quality",
  "beautiful product",
  "eye-catching",
  "stunning visual",
  "modern and clean",
  "professional look",
  "attractive design",
  "stand out from the crowd",
  "capture attention",
  "unique and different",
  "perfect for everyone",
  "world class",
  "cutting edge",
];

/** Words that carry emotional specificity rather than category filler. */
export const EMOTIONAL_DEPTH_MARKERS = [
  "tension",
  "fear",
  "pride",
  "belong",
  "identity",
  "control",
  "confidence",
  "recognit",
  "ritual",
  "memory",
  "shame",
  "relief",
  "anxiet",
  "self",
  "respect",
  "freedom",
  "nostalg",
  "intimacy",
];

/**
 * Technical vocabulary that must never appear in a concept.
 *
 * A concept describing an f-stop has skipped the decision layer, which means the
 * art direction resolver never gets to weigh it against a client instruction.
 * Enforced by test.
 */
export const TECHNICAL_LEAK_MARKERS = [
  /\bf\/\d/i,
  /\b\d{2,3}\s?mm\b/i,
  /\bISO\s?\d/i,
  /\bshutter\b/i,
  /\baperture\b/i,
  /\bfocal length\b/i,
  /\bkey light\b/i,
  /\bsoftbox\b/i,
  /\bdepth of field\b/i,
  /\bwhite balance\b/i,
  /\bkelvin\b/i,
  /\baspect ratio\b/i,
];
