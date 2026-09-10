import { CreativeDirection } from "../service/CreativeKnowledgeService";
import { CreativeConceptTrace, ConceptEvaluation, CreativeConcept } from "./creative-concept.types";
import { CreativeDecisionTrace } from "./creative-decision.types";
import { ReasoningRetrievalQuery } from "./reasoning-knowledge.types";

/**
 * CIOS Phase 3.1 — shadow mode types.
 *
 * Shadow mode runs the CIOS reasoning stack alongside the production pipeline and
 * reports what it *would* have decided. Nothing here reaches a prompt, a render or
 * the resolver: this is an observation record, and every field on it exists so a
 * reviewer can answer "would switching the pipeline over have changed anything,
 * and would it have been better?" before Phase 3.2 makes the switch.
 *
 * The comparison is deliberately three-way rather than two:
 *
 *   1. `legacy_direction`  — what CreativeKnowledgeService (Layer 1) produces
 *                            today, which is what actually fills the resolver's
 *                            `knowledgeDirection` socket.
 *   2. `cios_direction`    — what CreativeDecisionEngine would put in that socket.
 *   3. `resolved`          — what the resolver actually chose for the shipped
 *                            asset, at whatever tier won.
 *
 * (1) vs (2) says whether CIOS proposes something different. (2) vs (3) says
 * whether it would have mattered — a CIOS camera decision is irrelevant if a USER
 * lock already owns that dimension. Reporting only (1) vs (2) would overstate the
 * impact of the switch, which is the mistake this shape exists to prevent.
 */

/** The five dimensions `CreativeDirection` carries into the resolver. */
export type ShadowDimension = "camera" | "lighting" | "composition" | "colour" | "atmosphere";

export const SHADOW_DIMENSIONS: ShadowDimension[] = [
  "camera",
  "lighting",
  "composition",
  "colour",
  "atmosphere",
];

/**
 * How the two paths relate on one dimension.
 *
 * `CIOS_ONLY` is the interesting case in both directions: it means CIOS filled a
 * dimension the legacy path left empty (a gain), or it means CIOS is about to
 * overwrite something legacy was confident about (a risk). The label alone is not
 * a verdict, which is why the values travel with it.
 */
export type DimensionAgreement =
  /** Neither path produced anything for this dimension. */
  | "BOTH_EMPTY"
  /** Only CIOS produced a value. */
  | "CIOS_ONLY"
  /** Only the legacy Layer 1 path produced a value. */
  | "LEGACY_ONLY"
  /** Both produced values that share substantive vocabulary. */
  | "ALIGNED"
  /** Both produced values with no substantive overlap. */
  | "DIVERGENT";

export interface DimensionComparison {
  dimension: ShadowDimension;
  cios_value: string;
  legacy_value: string;
  agreement: DimensionAgreement;
  /** Content words present in both values. Empty for DIVERGENT. */
  shared_terms: string[];
  /**
   * What the resolver actually chose for this dimension on the shipped assets,
   * and at which tier. Absent when no asset resolved the dimension.
   */
  resolved_value?: string;
  resolved_source?: string;
  /**
   * True when the CIOS value would have been outranked anyway — the dimension is
   * already owned by a tier above KNOWLEDGE. These are the dimensions where
   * switching the pipeline changes nothing at all.
   */
  outranked_by_higher_tier?: boolean;
}

/** Concept-level comparison against the marketing brain's strategy output. */
export interface ConceptComparison {
  cios_big_idea: string;
  cios_concept_name: string;
  cios_core_message: string;
  legacy_big_idea: string;
  legacy_core_message: string;
  legacy_consumer_insight: string;
  /** MARKETING_BRAIN or DETERMINISTIC_FALLBACK — how the legacy concept was made. */
  legacy_strategy_source: string;
  /** Whether the CIOS concept passed its own evaluation gate. */
  cios_accepted: boolean;
  cios_score: number;
  cios_rejection_reasons: string[];
  cios_cliches: string[];
}

/**
 * Governance §1 audit.
 *
 * Layer 2 reasoning material must never reach a render prompt. Shadow mode is the
 * first time the two layers run against the same brief, so it is the right place
 * to prove the membrane holds rather than assume it. A non-empty `leaked_fields`
 * is a blocking finding for Phase 3.2.
 */
export interface LayerSeparationAudit {
  clean: boolean;
  /** Reasoning-only field names whose content appeared in the emitted direction. */
  leaked_fields: string[];
  /** The offending excerpt, so the finding can be acted on rather than re-derived. */
  evidence: string[];
}

export interface CiosShadowResult {
  enabled: true;
  /** The eight-axis query the brief resolved to. */
  query: ReasoningRetrievalQuery;
  context_coverage: { resolved: string[]; unresolved: string[] };

  /** knowledge_id values retrieved, highest scoring first. */
  retrieved_knowledge_ids: string[];
  candidates_evaluated: number;

  concept: CreativeConcept;
  concept_evaluation: ConceptEvaluation;

  /** What the decision engine would hand the resolver. */
  cios_direction: CreativeDirection;
  /** What Layer 1 hands it today. */
  legacy_direction: CreativeDirection;

  comparison: DimensionComparison[];
  concept_comparison: ConceptComparison;
  layer_separation: LayerSeparationAudit;

  /** Counts a reviewer wants before reading any of the above. */
  summary: {
    retrieved: number;
    art_direction_decisions: number;
    strategy_decisions: number;
    advisory_decisions: number;
    superseded: number;
    unmapped: number;
    dimensions_cios_only: number;
    dimensions_divergent: number;
    dimensions_that_would_change_output: number;
  };

  /** Full Phase 1.5 and Phase 1 traces, unabridged. */
  concept_trace: CreativeConceptTrace;
  decision_trace: CreativeDecisionTrace;

  warnings: string[];
  duration_ms: number;
}

/**
 * Shadow mode did not produce a result.
 *
 * Split from `CiosShadowResult` rather than made a nullable variant of it so the
 * orchestrator can always attach *something* explaining why — a silently absent
 * trace is indistinguishable from a flag that was never read.
 */
export interface CiosShadowSkipped {
  enabled: false;
  reason: "FLAG_DISABLED" | "ERROR";
  message?: string;
  duration_ms: number;
}

export type CiosShadowReport = CiosShadowResult | CiosShadowSkipped;
