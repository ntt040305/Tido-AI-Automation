import { BenchmarkIndustry, BenchmarkPipeline } from "./creative-benchmark.types";

/**
 * CIOS Phase 3.1.8 — human creative benchmark.
 *
 * The automated benchmark measures properties of text: is an instruction
 * concrete, is a field filled, do two instructions contradict. Those are real
 * and they are not creative judgement. `emotional_strength` has sat unscored
 * through every run because no honest automated proxy exists for it, and four
 * more criteria here have the same problem.
 *
 * This schema is the other half: a blind A/B review by people, scored on
 * fifteen criteria across four categories plus an overall A/B preference.
 *
 * What this schema is defending against
 * -------------------------------------
 * A blind test is worthless the moment a reviewer can tell which side is which,
 * and it fails silently — the data still arrives, still averages, still looks
 * like a result. So blindness is treated here as something to be *proved before
 * the packet is sent*, not assumed:
 *
 *   - no pipeline name, source string or knowledge id in the payload
 *   - presentation order randomised per case from a seed
 *   - a register check: if one side's concept fields are systematically written
 *     as technical instruction and the other's as prose, the packet identifies
 *     itself regardless of what is redacted
 *   - a repetition check: a side that repeats the same text across unrelated
 *     cases is recognisable by its sameness
 *
 * The last two exist because they fired on the first real packet built from
 * V2.5 data, and a reviewer's time is not something to spend on an invalid test.
 */

// ── 1. Criteria ───────────────────────────────────────────────────────────

export type HumanCategory = "creative_concept" | "brand_strategy" | "art_direction" | "production_readiness";

export type HumanCriterionId =
  // creative concept
  | "big_idea"
  | "insight"
  | "differentiation"
  | "memorability"
  // brand strategy
  | "brand_fit"
  | "audience_understanding"
  | "message_clarity"
  // art direction
  | "composition"
  | "camera"
  | "lighting"
  | "typography"
  | "material"
  // production readiness
  | "actionable"
  | "usable_by_designer"
  | "usable_by_photographer";

export interface HumanCriterionDefinition {
  id: HumanCriterionId;
  category: HumanCategory;
  /** The question as the reviewer reads it. Written to be answerable. */
  question: string;
  /** What a 0 and a 10 mean, so two reviewers anchor the same way. */
  anchors: { low: string; high: string };
  /** Which part of the submission to look at. */
  looks_at: "concept" | "direction" | "both";
}

/**
 * The fifteen scored criteria. Overall preference is captured separately on
 * each case rather than as a criterion, because "which would you take to the
 * client" is a choice between two things, not a rating of one.
 *
 * Every one has explicit anchors. Unanchored 0-10 scales measure reviewer
 * temperament as much as the work — one person's 7 is another's 4 — and with the
 * reviewer counts this framework will realistically get, that variance would
 * swamp the effect being measured.
 */
export const HUMAN_CRITERIA: HumanCriterionDefinition[] = [
  {
    id: "big_idea",
    category: "creative_concept",
    question: "Is there an actual idea here, rather than a description of the product or a rule about layout?",
    anchors: { low: "Restates the brief, or states a production rule", high: "An idea a team could build a campaign on" },
    looks_at: "concept",
  },
  {
    id: "insight",
    category: "creative_concept",
    question: "Does the insight name a real tension this audience has, that they would recognise?",
    anchors: { low: "Generic, or a restatement of the audience descriptor", high: "A specific tension you could quote back to them" },
    looks_at: "concept",
  },
  {
    id: "differentiation",
    category: "creative_concept",
    question: "Could a direct competitor claim exactly this?",
    anchors: { low: "Any competitor could say it", high: "Only this brand could say it" },
    looks_at: "concept",
  },
  {
    id: "memorability",
    category: "creative_concept",
    question: "Would you remember this tomorrow?",
    anchors: { low: "Gone by the end of the page", high: "You could repeat it a day later" },
    looks_at: "concept",
  },
  {
    id: "brand_fit",
    category: "brand_strategy",
    question: "Does this feel like this brand, given its stated tone and position?",
    anchors: { low: "Could be any brand in the category", high: "Unmistakably this brand" },
    looks_at: "both",
  },
  {
    id: "audience_understanding",
    category: "brand_strategy",
    question: "Does the work show it understands who it is talking to?",
    anchors: { low: "Audience is decoration", high: "The audience shaped the decisions" },
    looks_at: "both",
  },
  {
    id: "message_clarity",
    category: "brand_strategy",
    question: "After one read, can you say what the campaign is claiming?",
    anchors: { low: "You would have to read it twice", high: "One line, unambiguous" },
    looks_at: "concept",
  },
  {
    id: "composition",
    category: "art_direction",
    question: "Is the composition direction one you could lay out without asking a question?",
    anchors: { low: "A quality, not an instruction", high: "You could draw the frame from it" },
    looks_at: "direction",
  },
  {
    id: "camera",
    category: "art_direction",
    question: "Is the camera direction specific enough to set up?",
    anchors: { low: "No lens, angle or distance", high: "Lens, height and framing are all decided" },
    looks_at: "direction",
  },
  {
    id: "lighting",
    category: "art_direction",
    question: "Could a gaffer light this from the direction given?",
    anchors: { low: "A mood word", high: "Source, size, position and ratio are decided" },
    looks_at: "direction",
  },
  {
    id: "typography",
    category: "art_direction",
    question: "Is the typographic direction one a designer could set from?",
    anchors: { low: "Names a feeling", high: "Levels, weights and spacing are decided" },
    looks_at: "direction",
  },
  {
    id: "material",
    category: "art_direction",
    question: "Is it clear how surfaces and materials should render?",
    anchors: { low: "Unstated, or a generic adjective", high: "Specific surface behaviour you could retouch to" },
    looks_at: "direction",
  },
  {
    id: "actionable",
    category: "production_readiness",
    question: "Overall, how much of this could be executed without a follow-up conversation?",
    anchors: { low: "Almost none of it", high: "Effectively all of it" },
    looks_at: "both",
  },
  {
    id: "usable_by_designer",
    category: "production_readiness",
    question: "If you handed this to a designer, could they start?",
    anchors: { low: "They would come back with questions first", high: "They could open a file and begin" },
    looks_at: "both",
  },
  {
    id: "usable_by_photographer",
    category: "production_readiness",
    question: "If you handed this to a photographer, could they shoot it?",
    anchors: { low: "Not enough to plan a set-up", high: "They could build a shot list from it" },
    looks_at: "direction",
  },
];

// ── 2. Packet ─────────────────────────────────────────────────────────────

export interface HumanSubmission {
  label: "A" | "B";
  concept: { big_idea: string; core_message: string; consumer_insight: string; differentiation: string };
  direction: {
    camera: string;
    lighting: string;
    composition: string;
    colour: string;
    atmosphere: string;
    typography: string;
    material: string;
  };
}

export interface HumanReviewCase {
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
  submissions: [HumanSubmission, HumanSubmission];
}

export interface HumanBenchmarkPacket {
  packet_id: string;
  seed: number;
  created_at: string;
  criteria: HumanCriterionDefinition[];
  cases: HumanReviewCase[];
  instructions: string[];
  /** Minimum reviewers for the aggregation to report a conclusion. */
  min_reviewers: number;
}

/** Kept apart from the packet, always. */
export interface HumanBenchmarkKey {
  packet_id: string;
  seed: number;
  /** case_id → which pipeline was shown as submission A. */
  assignment: Record<string, BenchmarkPipeline>;
}

// ── 3. Responses ──────────────────────────────────────────────────────────

export interface HumanCaseResponse {
  case_id: string;
  /** 0-10 per criterion, per submission label. */
  scores: { label: "A" | "B"; criterion: HumanCriterionId; score: number }[];
  /** Which submission the reviewer would take into a client meeting. */
  overall_preference: "A" | "B" | "NO_PREFERENCE";
  comment?: string;
}

export interface HumanBenchmarkResponse {
  packet_id: string;
  reviewer_id: string;
  /** Free-text: years in the industry, discipline. Context for weighting, not identity. */
  reviewer_background?: string;
  submitted_at?: string;
  cases: HumanCaseResponse[];
}

// ── 4. Aggregation ────────────────────────────────────────────────────────

export interface CriterionAggregate {
  criterion: HumanCriterionId;
  category: HumanCategory;
  cios_mean: number;
  legacy_mean: number;
  delta: number;
  /** Case-level wins after attribution, ties within `tie_threshold` excluded. */
  cios_wins: number;
  legacy_wins: number;
  ties: number;
  /** Ratings contributing to this criterion. n = reviewers × cases. */
  n: number;
  /**
   * Standard deviation of the per-rating delta.
   *
   * Reported beside every mean because a +0.4 mean with an SD of 3 is noise, and
   * a reader looking only at the delta column cannot tell the two apart.
   */
  delta_sd: number;
}

export interface ReviewerAgreement {
  /** Reviewer pairs who chose the same overall winner, as a share of comparisons. */
  pairwise_preference_agreement: number;
  /** Pairs compared. Zero with a single reviewer, which is why one is not enough. */
  comparisons: number;
  /** Per-reviewer overall preference counts, so an outlier is visible. */
  by_reviewer: { reviewer_id: string; cios: number; legacy: number; none: number }[];
}

export interface HumanBenchmarkReport {
  packet_id: string;
  generated_at: string;
  reviewers: number;
  cases: number;
  ratings: number;

  /** False when fewer than `min_reviewers` responded. Gates every conclusion. */
  conclusive: boolean;
  /** Why, in one line, when it is not. */
  inconclusive_reason?: string;

  overall: {
    cios_mean: number;
    legacy_mean: number;
    delta: number;
    cios_preferred: number;
    legacy_preferred: number;
    no_preference: number;
    /** Share of expressed preferences, ties excluded from the base. */
    cios_preference_rate: number;
  };

  by_criterion: CriterionAggregate[];
  by_category: { category: HumanCategory; cios_mean: number; legacy_mean: number; delta: number }[];
  by_industry: { industry: BenchmarkIndustry; cios_mean: number; legacy_mean: number; delta: number }[];

  agreement: ReviewerAgreement;
  /** Verbatim reviewer comments, attributed to a pipeline after unblinding. */
  comments: { case_id: string; pipeline_preferred: BenchmarkPipeline | "NO_PREFERENCE"; comment: string }[];
  warnings: string[];
}

// ── 5. Blindness audit ────────────────────────────────────────────────────

export type BlindnessFailureKind =
  /** A pipeline name, source string or knowledge id in the payload. */
  | "ATTRIBUTION_LEAK"
  /** One side systematically empty where the other is filled. */
  | "COVERAGE_TELL"
  /**
   * One specific field empty on one side in most cases and filled on the other.
   *
   * Separate from COVERAGE_TELL because the coarse check compares total filled
   * counts, and a side missing exactly one field on 26 of 30 cases barely moves
   * that total while being the most obvious tell a reviewer could have: the same
   * box reads "(not provided)" on the same side, case after case.
   */
  | "FIELD_ABSENCE_TELL"
  /** One side writes concepts as technical instruction, the other as prose. */
  | "REGISTER_TELL"
  /** One side repeats the same text across unrelated cases. */
  | "REPETITION_TELL";

export interface BlindnessFinding {
  kind: BlindnessFailureKind;
  severity: "BLOCKING" | "WARNING";
  summary: string;
  evidence: string[];
  affected_cases: string[];
}

export interface BlindnessAudit {
  blind: boolean;
  findings: BlindnessFinding[];
}
