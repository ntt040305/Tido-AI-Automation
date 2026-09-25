/**
 * What keeps working, and what a brief could have been.
 *
 * Mirrors migrations 0009 and 0010. Two subjects, kept in one file because
 * they are two halves of the same idea: a concept is one decision with its
 * reasoning, and a pattern is what many of those decisions turned out to have
 * in common.
 *
 * THE RULE THAT GOVERNS BOTH
 * ---------------------------
 * Neither is an instruction. A pattern is an observation with its evidence
 * attached, and a concept is a record of a choice already made. Nothing in
 * either type can outrank the brief in front of the system, and every shape
 * below carries the counts that make its own weakness visible -- because a
 * pattern seen twice and a pattern seen two hundred times are different claims
 * and must not be presentable as the same one.
 */

/** Which part of a design a pattern describes. Matches the check in 0009. */
export type PatternDimension =
  | "direction"
  | "composition"
  | "typography"
  | "layout"
  | "lighting"
  | "structure"
  | "combination";

export const PATTERN_DIMENSIONS: readonly PatternDimension[] = [
  "direction",
  "composition",
  "typography",
  "layout",
  "lighting",
  "structure",
  "combination",
] as const;

/**
 * How many runs a pattern needs before it may be shown to the creative layer.
 *
 * Three, matching the occurrence threshold `UserKit` applies to an observed
 * preference -- deliberately the same number, because it is the same judgement:
 * one render is an event, and treating it as a pattern is how a system starts
 * chasing its own noise.
 *
 * Not encoded in SQL. 0009 indexes on the counts but does not decide with them;
 * a threshold in two places is two thresholds, and they will disagree.
 */
export const MIN_PATTERN_SUPPORT = 3;

export interface CreativePatternRow {
  id: number;
  /** Exactly one of these is set. Ownership mirrors `creative_runs`. */
  org_id: string | null;
  user_id: string | null;
  dimension: PatternDimension;
  value: string;
  value_key: string;
  /** Runs that exhibited this. */
  support_count: number;
  /** Of those, the ones a human kept. The number that is hardest to earn. */
  approved_count: number;
  /** Vision problems across those runs. A high count is a warning, not guidance. */
  problem_count: number;
  evidence_runs: string[];
  /** Runs already credited to `approved_count`. Keeps promotion idempotent. */
  approved_runs: string[];
  /**
   * Runs a person explicitly rejected, or regenerated without keeping (0012).
   * The negative counterpart of `approved_count`, idempotent per run.
   */
  rejected_count?: number;
  rejected_runs?: string[];
  embedding_model: string | null;
  source_text: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

/** One observation offered for learning. */
export interface ObservedPattern {
  dimension: PatternDimension;
  value: string;
  runId: string;
  /** True when a human kept the render this was observed in. */
  approved?: boolean;
  /** Vision problems counted in that render. */
  problems?: number;
}

export interface LearnPatternsResult {
  created: number;
  reinforced: number;
  skipped: number;
}

/** A pattern retrieved by meaning, with the evidence for trusting it. */
export interface SimilarPattern {
  id: number;
  dimension: PatternDimension;
  value: string;
  score: number;
  support_count: number;
  approved_count: number;
  problem_count: number;
  source_text: string | null;
}

export interface PatternQuery {
  /** Search by meaning. Requires the model that produced the vector. */
  embedding?: number[];
  model?: string;
  dimension?: PatternDimension;
  limit?: number;
  minScore?: number;
  /** Patterns below this many supporting runs are not returned. */
  minSupport?: number;
}

/**
 * Whether a pattern has earned the right to be shown.
 *
 * Kept as a function rather than a comparison at each call site so the rule
 * lives once. Two conditions, and the second is the one that matters: a
 * pattern accumulating more vision problems than approvals is evidence of
 * something that keeps going wrong, and presenting it as guidance would teach
 * the system to repeat it.
 */
export function patternQualifies(p: {
  support_count: number;
  approved_count: number;
  problem_count: number;
  rejected_count?: number;
}): boolean {
  if (p.support_count < MIN_PATTERN_SUPPORT) return false;
  if (p.approved_count === 0 && p.problem_count > 0) return false;
  // A pattern people keep turning down is not guidance. Held to the same
  // threshold as support, so one bad afternoon cannot bury a direction.
  const rejected = p.rejected_count ?? 0;
  if (rejected >= MIN_PATTERN_SUPPORT && rejected > p.approved_count) return false;
  return true;
}

/**
 * How far a person's own history supports a pattern, in [-1, 1], or null when
 * there is not yet enough history to say.
 *
 * The confidence threshold of Phase 4: nothing is concluded from fewer than
 * MIN_PATTERN_SUPPORT renders, so a single download or a single rejection moves
 * no decision. Above it, approvals and rejections are weighed against how often
 * the pattern was actually made.
 */
export function patternConfidence(p: {
  support_count: number;
  approved_count: number;
  rejected_count?: number;
}): number | null {
  if (!p || p.support_count < MIN_PATTERN_SUPPORT) return null;
  const net = p.approved_count - (p.rejected_count ?? 0);
  return Math.max(-1, Math.min(1, net / p.support_count));
}

// ── concepts ────────────────────────────────────────────────────────────────

/** Where a route came from. A direction the director wrote is a stronger signal. */
export type ConceptOrigin = "offered" | "authored";

export interface CreativeConceptRow {
  id: number;
  run_id: string;
  route: string;
  core_idea: string | null;
  visual_language: string | null;
  why_this_route: string | null;
  selected: boolean;
  /** Only ever set on a route that was not selected. */
  rejected_reason: string | null;
  origin: ConceptOrigin;
  /** The director's craft decisions and assessment for this route (0012). */
  details: Record<string, unknown> | null;
  /** The evaluator's reading: strengths, weaknesses, risk, signals (0012). */
  evaluation: Record<string, unknown> | null;
  score: number | null;
  created_at: string;
}

/** One direction a brief could have gone. */
export interface ConceptInput {
  route: string;
  coreIdea?: string | null;
  visualLanguage?: string | null;
  whyThisRoute?: string | null;
  selected?: boolean;
  rejectedReason?: string | null;
  origin?: ConceptOrigin;
  /** Composition, typography, lighting and the director's assessment. */
  details?: Record<string, unknown> | null;
  /** Score, strengths, weaknesses, risk and the signals behind them. */
  evaluation?: Record<string, unknown> | null;
  /** 0..1, when the route was evaluated. */
  score?: number | null;
}

export interface RecordConceptsResult {
  stored: number;
  skipped: number;
  /** True when exactly one route was marked as the one that ran. */
  hasSelection: boolean;
}
