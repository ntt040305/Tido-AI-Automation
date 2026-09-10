import { CreativeConcept, ConceptEvaluation } from "./creative-concept.types";
import { CreativeDecision } from "./creative-decision.types";
import { ReasoningRetrievalQuery } from "./reasoning-knowledge.types";

/**
 * Knowledge Evolution — SCHEMA ONLY.
 *
 * Phase 2.1 defines the shape of the learning loop and deliberately does not
 * implement it. The reason is sequencing: a loop that updates knowledge from
 * outcomes is only safe once there is enough knowledge for an update to be a
 * refinement rather than a rewrite, and once outcomes are measured rather than
 * assumed. Building the mechanism first would produce confident adjustments from
 * a handful of samples.
 *
 * Defining it now still earns its place — it fixes what a generation must record
 * at the moment it happens. Outcome data that was not captured cannot be
 * reconstructed later, so the recording contract has to exist before the first
 * campaign anyone wants to learn from.
 *
 * Nothing in this file is imported by the image generation pipeline, the
 * retriever, or either engine. It is a contract awaiting an implementation.
 */

// ── 1. Generation result ────────────────────────────────────────────────

/** What was produced, and from which knowledge. */
export interface GenerationRecord {
  generation_id: string;
  campaign_id: string;
  recorded_at: string;

  /** The resolved retrieval context for this campaign. */
  query: ReasoningRetrievalQuery;
  /** Knowledge that reached the concept, in retrieval order. */
  knowledge_used: { knowledge_id: string; context_relevance: number; score: number }[];

  concept: CreativeConcept;
  concept_evaluation: ConceptEvaluation;
  decisions: CreativeDecision[];

  /** What the art direction resolver settled on, per dimension. */
  art_direction: { dimension: string; value: string; source: string; score: number }[];

  /** Rendered output, when the campaign proceeded past planning. */
  render?: {
    asset_type: string;
    aspect_ratio: string;
    image_url?: string;
    prompt_chars: number;
  }[];
}

// ── 2. Evaluation ───────────────────────────────────────────────────────

export type OutcomeSource = "HUMAN_REVIEW" | "CLIENT_DECISION" | "PERFORMANCE_DATA" | "AUTOMATED_CRITIC";

/**
 * What actually happened.
 *
 * Deliberately separates opinion from evidence. A creative director's rating and
 * a click-through rate are both signals, but conflating them would let taste
 * masquerade as performance in the learning step.
 */
export interface OutcomeRecord {
  generation_id: string;
  evaluated_at: string;
  source: OutcomeSource;

  /** Was the work used? The most honest single signal available. */
  disposition: "APPROVED" | "REVISED" | "REJECTED" | "SHIPPED" | "UNKNOWN";

  /** Subjective assessment, 1-10, when a human reviewed it. */
  human_scores?: {
    strategic_fit?: number;
    differentiation?: number;
    craft?: number;
    brand_fit?: number;
  };

  /** Measured performance, when the asset ran. Absent is not zero. */
  performance?: {
    impressions?: number;
    engagement_rate?: number;
    click_through_rate?: number;
    conversion_rate?: number;
    /** Comparable baseline, without which a rate means nothing. */
    benchmark?: number;
  };

  /** What a reviewer changed, in their own words. The richest signal and the hardest to parse. */
  revision_notes?: string;
}

// ── 3. Learning extraction ──────────────────────────────────────────────

export type LearningSignal =
  /** Knowledge was retrieved and the work succeeded. */
  | "CONFIRMED"
  /** Knowledge was retrieved and the work was rejected on grounds it governs. */
  | "CONTRADICTED"
  /** Knowledge was retrieved but had no bearing on the outcome. */
  | "IRRELEVANT"
  /** A gap: the reviewer's fix corresponds to no knowledge in the corpus. */
  | "MISSING";

/**
 * One attributable lesson.
 *
 * Attribution is the hard part and the reason this stays unimplemented. A
 * campaign uses six knowledge objects and succeeds; crediting all six equally is
 * wrong, and crediting the highest-scoring one is a guess. `attribution_basis`
 * exists to force that reasoning to be recorded rather than assumed.
 */
export interface LearningExtraction {
  extraction_id: string;
  generation_id: string;
  extracted_at: string;

  knowledge_id: string | null;
  signal: LearningSignal;

  /** How this object was connected to the outcome. Never left implicit. */
  attribution_basis: "DIRECT_REVISION_NOTE" | "DECISION_TRACE" | "PERFORMANCE_CORRELATION" | "REVIEWER_ASSERTION";
  /** 0-1. Correlation over a handful of campaigns should stay low. */
  attribution_confidence: number;

  /** Proposed change. A proposal only — never applied automatically. */
  proposed_change?: {
    field: "confidence" | "priority" | "impact_score" | "context" | "avoid_when" | "anti_patterns";
    current: unknown;
    proposed: unknown;
    rationale: string;
  };

  /** For MISSING: the knowledge that should exist but does not. */
  proposed_new_knowledge?: {
    domain: string;
    sub_domain: string;
    problem: string;
    observed_decision: string;
    evidence: string;
  };

  /** Human approval is required before any change lands. */
  review_status: "PROPOSED" | "ACCEPTED" | "REJECTED";
}

// ── 4. Loop contract ────────────────────────────────────────────────────

/**
 * The interface a future implementation must satisfy.
 *
 * Three properties are non-negotiable and are the reason this is written down
 * before anything implements it:
 *
 *   1. Proposals, never writes. Knowledge changes pass through human review.
 *   2. Attribution is explicit. Every lesson records how it was connected.
 *   3. Versioned, never overwritten (Governance §18) — a revised object becomes
 *      .v2, so the reasoning that produced past work stays inspectable.
 */
export interface KnowledgeEvolutionLoop {
  record(generation: GenerationRecord): Promise<void>;
  recordOutcome(outcome: OutcomeRecord): Promise<void>;
  extract(generationId: string): Promise<LearningExtraction[]>;
  /** Returns proposals. Applying them is a separate, human-gated action. */
  propose(minConfidence: number): Promise<LearningExtraction[]>;
}

/** Minimum sample before any performance-based proposal is trustworthy. */
export const MIN_SAMPLES_FOR_PERFORMANCE_SIGNAL = 30;

/** Minimum attribution confidence before a proposal is surfaced for review. */
export const MIN_ATTRIBUTION_CONFIDENCE = 0.6;
