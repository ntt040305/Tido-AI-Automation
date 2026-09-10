import { CampaignBriefInput } from "../campaign/campaign.types";

/**
 * CIOS Phase 3.1.5 — Creative Benchmark System.
 *
 * Shadow mode (Phase 3.1) answers "does CIOS decide something different?". This
 * phase answers the question that actually gates Phase 3.2: "is it better?".
 *
 * The honest position this schema is built around
 * ------------------------------------------------
 * Most of what makes creative work good cannot be scored by a program. A machine
 * can tell you a direction names a measurable quantity; it cannot tell you the
 * idea is worth having. So every dimension declares its `method`:
 *
 *   AUTOMATED       — genuinely measurable from the text (coverage, specificity,
 *                     actionability, contradiction). Trustworthy on its own.
 *   PROXY           — a measurable stand-in for something that is not directly
 *                     measurable (cliché density as a proxy for originality).
 *                     Directional evidence, never a verdict.
 *   HUMAN_REQUIRED  — no useful automated proxy exists. Scored 0 and excluded
 *                     from automated averages; it comes from blind review.
 *
 * A benchmark that emitted one confident number for "emotional strength" would be
 * measuring its own heuristics and calling the result creative judgement. The
 * split above is what keeps the automated layer useful and the human layer
 * necessary, and it is why `BenchmarkReport` reports the two separately rather
 * than blending them into a single score.
 */

// ── 1. Dataset ────────────────────────────────────────────────────────────

export type BenchmarkIndustry =
  | "beauty"
  | "food_beverage"
  | "fashion"
  | "hospitality"
  | "technology"
  | "real_estate";

export const BENCHMARK_INDUSTRIES: BenchmarkIndustry[] = [
  "beauty",
  "food_beverage",
  "fashion",
  "hospitality",
  "technology",
  "real_estate",
];

/**
 * What the case is designed to test.
 *
 * Cases are not sampled at random. Each one isolates a situation where the two
 * pipelines have a reason to differ, so a tie is informative rather than an
 * artefact of an under-specified brief.
 */
export type CreativeChallengeKind =
  /** The category has a dominant visual cliché the work must avoid. */
  | "CATEGORY_CLICHE"
  /** The product is functionally identical to its competitors. */
  | "PARITY_PRODUCT"
  /** The audience actively distrusts the category's usual claims. */
  | "CLAIM_FATIGUE"
  /** A premium price has to be justified before it is stated. */
  | "PRICE_JUSTIFICATION"
  /** The message must survive a hostile viewing context (feed, thumbnail). */
  | "ATTENTION_HOSTILE"
  /** Local market expectations conflict with the global brand system. */
  | "LOCAL_ADAPTATION"
  /** Regulated content competes with the creative for the same area. */
  | "REGULATED_CLAIM";

export interface BenchmarkEvaluationCriteria {
  /**
   * What a strong answer must do. Written per case so a reviewer is judging
   * against the brief's actual problem rather than a generic quality bar.
   */
  must_address: string[];
  /** Category defaults a strong answer avoids. Used to score originality. */
  must_avoid: string[];
  /**
   * The dimensions this case is designed to discriminate on. A case about a
   * regulated claim is not evidence about photography, and averaging it in as
   * though it were dilutes the signal.
   */
  weighted_dimensions: BenchmarkDimensionId[];
}

export interface BenchmarkCase {
  case_id: string;
  industry: BenchmarkIndustry;
  challenge: CreativeChallengeKind;
  /** One line naming the creative problem, in the terms an agency would use. */
  creative_challenge: string;
  brief: CampaignBriefInput;
  criteria: BenchmarkEvaluationCriteria;
  /** Free-text context a reviewer needs and the brief does not carry. */
  notes?: string;
}

export interface BenchmarkDataset {
  dataset_id: string;
  version: string;
  cases: BenchmarkCase[];
}

// ── 2. Evaluation schema ──────────────────────────────────────────────────

export type BenchmarkCategory = "concept" | "strategy" | "visual" | "production";

export type BenchmarkDimensionId =
  // concept
  | "originality"
  | "differentiation"
  | "emotional_strength"
  | "brand_fit"
  // strategy
  | "audience_understanding"
  | "business_alignment"
  | "positioning"
  // visual
  | "composition"
  | "typography"
  | "photography"
  | "color_direction"
  | "material"
  // production
  | "clarity"
  | "consistency"
  | "feasibility";

export type ScoringMethod = "AUTOMATED" | "PROXY" | "HUMAN_REQUIRED";

export interface BenchmarkDimensionDefinition {
  id: BenchmarkDimensionId;
  category: BenchmarkCategory;
  method: ScoringMethod;
  /** What the score means, in one line. Printed in the blind review packet. */
  question: string;
  /** For PROXY dimensions: what is actually being counted, stated plainly. */
  proxy_note?: string;
}

/**
 * The fourteen dimensions, with an explicit honesty label on each.
 *
 * Visual and production dimensions are genuinely automatable because they ask
 * whether a direction is present, concrete and non-contradictory — all of which
 * are properties of the text. Concept and strategy dimensions mostly are not,
 * which is why five of the seven there are PROXY or HUMAN_REQUIRED.
 */
export const BENCHMARK_DIMENSIONS: BenchmarkDimensionDefinition[] = [
  {
    id: "originality",
    category: "concept",
    method: "PROXY",
    question: "Is the idea something other than what the category always says?",
    proxy_note: "Counts generic markers and the case's own must_avoid phrases. Absence of cliché is not presence of an idea.",
  },
  {
    id: "differentiation",
    category: "concept",
    method: "PROXY",
    question: "Does the work claim a position a competitor could not equally claim?",
    proxy_note: "Checks whether a differentiation statement exists and names something specific rather than a quality adjective.",
  },
  {
    id: "emotional_strength",
    category: "concept",
    method: "HUMAN_REQUIRED",
    question: "Does the idea produce a feeling rather than describe one?",
  },
  {
    id: "brand_fit",
    category: "concept",
    method: "PROXY",
    question: "Could this only be this brand, given its stated tone and position?",
    proxy_note: "Vocabulary overlap with the brief's tone and positioning. Detects mismatch, cannot confirm fit.",
  },
  {
    id: "audience_understanding",
    category: "strategy",
    method: "PROXY",
    question: "Does it name a tension this audience actually has?",
    proxy_note: "Checks the insight is specific and not a restatement of the audience descriptor.",
  },
  {
    id: "business_alignment",
    category: "strategy",
    method: "AUTOMATED",
    question: "Does the work serve the stated objective?",
  },
  {
    id: "positioning",
    category: "strategy",
    method: "PROXY",
    question: "Is the brand's price and market position legible in the work?",
    proxy_note: "Checks the direction carries position-consistent instruction (restraint for premium, salience for value).",
  },
  {
    id: "composition",
    category: "visual",
    method: "AUTOMATED",
    question: "Is there a concrete, executable composition instruction?",
  },
  {
    id: "typography",
    category: "visual",
    method: "AUTOMATED",
    question: "Is there a concrete typographic instruction?",
  },
  {
    id: "photography",
    category: "visual",
    method: "AUTOMATED",
    question: "Are camera and lighting specified concretely?",
  },
  {
    id: "color_direction",
    category: "visual",
    method: "AUTOMATED",
    question: "Is there a concrete colour instruction?",
  },
  {
    id: "material",
    category: "visual",
    method: "AUTOMATED",
    question: "Is there a concrete instruction for how surfaces and materials render?",
  },
  {
    id: "clarity",
    category: "production",
    method: "AUTOMATED",
    question: "Could a photographer execute this without asking a question?",
  },
  {
    id: "consistency",
    category: "production",
    method: "AUTOMATED",
    question: "Do the dimensions agree with each other and with the concept?",
  },
  {
    id: "feasibility",
    category: "production",
    method: "AUTOMATED",
    question: "Is every instruction physically producible and within budget?",
  },
];

export interface BenchmarkDimensionScore {
  dimension: BenchmarkDimensionId;
  category: BenchmarkCategory;
  method: ScoringMethod;
  /** 0-10. Always 0 for HUMAN_REQUIRED — see `scored`. */
  score: number;
  /** False for HUMAN_REQUIRED, and for a dimension with nothing to measure. */
  scored: boolean;
  /** What produced the score, in one line a reviewer can check. */
  finding: string;
  /** Concrete text the score was derived from. */
  evidence: string[];
}

/**
 * One pipeline's result on one case.
 *
 * `automated_overall` deliberately excludes unscored dimensions rather than
 * treating them as zero: a system that cannot be measured on emotional strength
 * should not be penalised for it, and averaging in a constant zero would flatten
 * the difference between the two pipelines everywhere else.
 */
export interface CreativeBenchmarkScore {
  case_id: string;
  pipeline: BenchmarkPipeline;
  dimensions: BenchmarkDimensionScore[];
  /** Mean of scored dimensions only. */
  automated_overall: number;
  /** Mean per category, scored dimensions only. Absent when none were scored. */
  by_category: Partial<Record<BenchmarkCategory, number>>;
  /** Mean over the case's `weighted_dimensions`, when any of them were scored. */
  weighted_overall?: number;
  scored_count: number;
  unscored_dimensions: BenchmarkDimensionId[];
}

export type BenchmarkPipeline = "LEGACY" | "CIOS";

// ── 3. Comparison ─────────────────────────────────────────────────────────

/** The creative output of one pipeline, normalised so the two are comparable. */
export interface BenchmarkOutput {
  pipeline: BenchmarkPipeline;
  concept: {
    big_idea: string;
    core_message: string;
    consumer_insight: string;
    differentiation: string;
  };
  direction: {
    camera: string;
    lighting: string;
    composition: string;
    colour: string;
    atmosphere: string;
    typography: string;
    /** Phase 3.1.7 — surfaces and finish, now measured on both sides. */
    material: string;
  };
  /** knowledge_id values used. Empty for the legacy path, which cites nothing. */
  knowledge_used: string[];
  /** How this output was produced, for the record. */
  source: string;
  /**
   * Phase 3.1.7 — which baseline backend produced a LEGACY output.
   *
   * Carried onto the result rather than the run header because a single run can
   * mix them: the llm backend degrades to template per case when a call fails,
   * and a report that averaged the two without saying so would be comparing CIOS
   * against two different baselines at once.
   */
  legacy_backend?: "llm" | "template";
  legacy_degraded_reason?: string;
}

export type ComparisonVerdict = "CIOS" | "LEGACY" | "TIE";

export interface DimensionOutcome {
  dimension: BenchmarkDimensionId;
  cios_score: number;
  legacy_score: number;
  /** Positive means CIOS scored higher. */
  delta: number;
  winner: ComparisonVerdict;
  /** True when neither side could be scored on this dimension. */
  both_unscored: boolean;
}

export interface KnowledgeUsageComparison {
  cios_knowledge_count: number;
  legacy_knowledge_count: number;
  /** Domains CIOS drew on, with counts. */
  cios_domains: Record<string, number>;
  /**
   * Art direction dimensions CIOS left empty. The single most decision-relevant
   * number in the whole benchmark: a dimension CIOS cannot fill is a dimension
   * Phase 3.2 would delete from production.
   */
  cios_empty_dimensions: string[];
  legacy_empty_dimensions: string[];
}

export interface BenchmarkCaseResult {
  case_id: string;
  industry: BenchmarkIndustry;
  challenge: CreativeChallengeKind;
  cios: BenchmarkOutput;
  legacy: BenchmarkOutput;
  cios_score: CreativeBenchmarkScore;
  legacy_score: CreativeBenchmarkScore;
  outcomes: DimensionOutcome[];
  knowledge_usage: KnowledgeUsageComparison;
  /** Overall automated verdict for this case. */
  verdict: ComparisonVerdict;
  /** Margin on the case's weighted dimensions, when available. */
  weighted_delta?: number;
  /**
   * How CIOS reached its answer on this case.
   *
   * A score says a dimension came out empty; the trace says which object was
   * retrieved and where it was routed instead. Without it every finding in the
   * report has to be re-derived by hand from a fresh shadow run, and a benchmark
   * whose findings cannot be traced back is a benchmark nobody can act on.
   */
  reasoning_trace?: CaseReasoningTrace;
  warnings: string[];
}

/** Compact reasoning record per case. Summarised, not the full trace object. */
export interface CaseReasoningTrace {
  /** The eight-axis query the brief resolved to. */
  query: Record<string, string | undefined>;
  resolved_axes: string[];
  unresolved_axes: string[];
  candidates_evaluated: number;
  retrieved: {
    knowledge_id: string;
    domain: string;
    score: number;
    context_relevance: number;
    /** ART_DIRECTION, STRATEGY or ADVISORY. */
    routed_to: string;
    /** Set only when routed to ART_DIRECTION. */
    dimension?: string;
    rule: string;
  }[];
  decisions: {
    art_direction: number;
    strategy: number;
    advisory: number;
    superseded: number;
    unmapped: number;
  };
  /** Decisions that lost their dimension to a higher-scoring one. */
  superseded: { dimension?: string; decision: string; superseded_by: string }[];
  /** Decisions with no route into the resolver at the KNOWLEDGE tier. */
  unmapped: { intended_dimension?: string; reason: string }[];
  concept_evaluation: {
    overall: number;
    accepted: boolean;
    rejection_reasons: string[];
    cliches_detected: string[];
  };
  layer_separation_clean: boolean;
  duration_ms: number;
}

// ── 4. Blind review ───────────────────────────────────────────────────────

/**
 * A reviewer packet with the attribution removed.
 *
 * `submission_a` / `submission_b` assignment is randomised per case from a seed,
 * so the same seed reproduces the same packet and a reviewer cannot learn the
 * pattern from case order. The mapping lives in `BlindReviewKey`, which is a
 * separate object precisely so the packet can be handed over without it.
 */
export interface BlindReviewSubmission {
  label: "A" | "B";
  concept: BenchmarkOutput["concept"];
  direction: BenchmarkOutput["direction"];
}

export interface BlindReviewCase {
  case_id: string;
  industry: BenchmarkIndustry;
  creative_challenge: string;
  brief_summary: {
    brand: string;
    product: string;
    audience: string;
    objective: string;
    channel: string;
    tone: string;
  };
  must_address: string[];
  submissions: [BlindReviewSubmission, BlindReviewSubmission];
  /** The questions to answer, taken from the dimension definitions. */
  questions: { dimension: BenchmarkDimensionId; question: string }[];
}

export interface BlindReviewPacket {
  packet_id: string;
  seed: number;
  /** Deliberately carries no pipeline names anywhere in its payload. */
  cases: BlindReviewCase[];
  instructions: string[];
}

export interface BlindReviewKey {
  packet_id: string;
  seed: number;
  /** case_id → which pipeline was shown as A. */
  assignment: Record<string, BenchmarkPipeline>;
}

/** What a reviewer sends back. Scored the same way as the automated layer. */
export interface BlindReviewResponse {
  packet_id: string;
  reviewer_id: string;
  scores: {
    case_id: string;
    label: "A" | "B";
    dimension: BenchmarkDimensionId;
    score: number;
    comment?: string;
  }[];
}

// ── 5. Report ─────────────────────────────────────────────────────────────

export interface DimensionAggregate {
  dimension: BenchmarkDimensionId;
  category: BenchmarkCategory;
  method: ScoringMethod;
  cios_mean: number;
  legacy_mean: number;
  delta: number;
  cios_wins: number;
  legacy_wins: number;
  ties: number;
  /** Cases where neither pipeline could be scored on this dimension. */
  unscored_cases: number;
}

/**
 * A named weakness, with the evidence attached.
 *
 * Written as findings rather than as a score table because the purpose of the
 * benchmark is a go / no-go on Phase 3.2, and that decision is made from the
 * specific things that are broken, not from an average.
 */
export interface BenchmarkWeakness {
  severity: "BLOCKING" | "MAJOR" | "MINOR";
  pipeline: BenchmarkPipeline;
  dimension?: BenchmarkDimensionId;
  summary: string;
  affected_cases: string[];
  evidence: string[];
}

export interface BenchmarkReport {
  report_id: string;
  dataset_id: string;
  generated_at: string;
  case_count: number;
  /** How the legacy side was produced — offline or with live LLM calls. */
  mode: BenchmarkMode;

  results: BenchmarkCaseResult[];

  summary: {
    cios_mean: number;
    legacy_mean: number;
    cios_wins: number;
    legacy_wins: number;
    ties: number;
    /** CIOS wins as a share of decided cases (ties excluded from the base). */
    cios_win_rate: number;
  };

  by_dimension: DimensionAggregate[];
  by_industry: {
    industry: BenchmarkIndustry;
    cases: number;
    cios_mean: number;
    legacy_mean: number;
    delta: number;
  }[];
  by_category: {
    category: BenchmarkCategory;
    cios_mean: number;
    legacy_mean: number;
    delta: number;
  }[];

  weaknesses: BenchmarkWeakness[];
  /**
   * Dimensions no automated method scored. Reported at the top level so a reader
   * cannot mistake the automated result for the whole picture.
   */
  requires_human_review: BenchmarkDimensionId[];
  warnings: string[];
}

/**
 * Offline is the default and the CI mode: no LLM calls, so the legacy concept is
 * absent and only its deterministic Layer 1 direction is compared. Live adds the
 * marketing brain call per case, which is what makes the concept comparison real
 * — and costs 30 LLM calls per run, which is why it is not the default.
 */
export type BenchmarkMode = "offline" | "live";
