/**
 * CIOS Phase 4.0.1.5 — creative synthesis.
 *
 * Phase 4.0.1 built a four-step chain and the chain worked, but the big idea was
 * still a knowledge object's `decision` field with its full stop removed. Thirty
 * briefs produced sixteen distinct ideas, and every one of them already existed
 * in the corpus. That is selection with extra steps.
 *
 * This phase separates the two jobs. Knowledge supplies *material* — a tension, an
 * insight, a territory, a strategic direction. Synthesis composes an idea from
 * that material, and the composition is not in the corpus.
 *
 * What this honestly is, and is not
 * ---------------------------------
 * Deterministic combination produces novel *combinations*. Given eleven tensions,
 * nine territories and seven rhetorical angles, it can compose several hundred
 * distinct propositions from a corpus that contains none of them. That is a real
 * and measurable gain in diversity, and it is not the same thing as originality
 * in the sense a creative director means — which requires judgement this layer
 * does not have.
 *
 * So `originality_score` below is named for what it measures: distance from the
 * source material and from ideas already used in this run, minus a penalty for
 * category clichés. It is a diversity measure wearing an honest label. The seam
 * for genuine authored phrasing is `CreativeSynthesiser`, which an LLM can
 * implement without changing anything else here.
 */

export interface CreativeSynthesisInput {
  human_tension: string;
  consumer_insight: string;
  campaign_territory: string;
  brand_objective: string;
  differentiation: string;
  audience: string;
  /** Free context used for cliché detection and register matching. */
  brand?: string;
  industry?: string;
  brand_position?: string;
  /** Category defaults this brief must avoid, from the case criteria. */
  avoid?: string[];
}

/** The rhetorical move an idea makes. Diversity is enforced across these. */
export type CampaignAngle =
  /** Names what the category does and refuses it. */
  | "REFUSAL"
  /** Turns the accepted reading of the problem inside out. */
  | "REVERSAL"
  /** Treats the audience's private experience as the public subject. */
  | "RECOGNITION"
  /** Makes the ordinary thing the remarkable one. */
  | "ELEVATION"
  /** Admits something a competitor would hide. */
  | "ADMISSION"
  /** Sets two true things against each other. */
  | "TENSION"
  /** States the consequence of doing nothing. */
  | "CONSEQUENCE";

export const CAMPAIGN_ANGLES: CampaignAngle[] = [
  "REFUSAL",
  "REVERSAL",
  "RECOGNITION",
  "ELEVATION",
  "ADMISSION",
  "TENSION",
  "CONSEQUENCE",
];

export interface CreativeSynthesisOutput {
  big_idea: string;
  why_it_works: string;
  emotional_hook: string;
  strategic_reason: string;
  /** 0-10. See the file header for what this actually measures. */
  originality_score: number;
  /** The rhetorical move this idea makes. */
  angle: CampaignAngle;
  /** knowledge_ids the material came from. The idea itself is not from them. */
  derived_from: string[];
}

// ── Originality ───────────────────────────────────────────────────────────

/**
 * The four originality signals, and what each is worth trusting.
 *
 * `semantic_distance` and `cliche_penalty` are real measures of real properties.
 * `memorability` and `emotional_tension` are proxies for things no program can
 * assess, and they are weighted accordingly — a proxy weighted like a measure is
 * how a score starts describing its own heuristics.
 */
export interface OriginalitySignals {
  /** 0-1. How far the idea is from its own source material and from prior ideas. */
  semantic_distance: number;
  /** 0-1, higher is better. Inverted cliché count. */
  cliche_penalty: number;
  /** 0-1. Proxy: brevity, concreteness, absence of abstraction. */
  memorability: number;
  /** 0-1. Proxy: does the sentence hold two things in opposition. */
  emotional_tension: number;
}

export interface OriginalityAssessment {
  signals: OriginalitySignals;
  /** 0-10 weighted. */
  score: number;
  /** Ideas this one was compared against. */
  compared_against: number;
  /** Set when the idea is too close to one already used. */
  too_similar_to?: string;
  accepted: boolean;
  notes: string[];
}

// ── Diversity ─────────────────────────────────────────────────────────────

/**
 * What has already been used in this run.
 *
 * Held across cases rather than per case, because the repetition the benchmark
 * found was *between* briefs: the same tension leading five beauty campaigns.
 * A per-case controller cannot see that and would report perfect diversity.
 */
export interface DiversityState {
  used_territories: Set<string>;
  used_angles: Map<CampaignAngle, number>;
  used_tensions: Set<string>;
  used_ideas: string[];
}

export interface DiversityDecision {
  allowed: boolean;
  /** Why a candidate was suppressed, when it was. */
  reason?: string;
  /** How heavily this candidate was penalised for repetition, 0-1. */
  repetition_penalty: number;
}

// ── Creative quality benchmark ────────────────────────────────────────────

/** The rubric, weighted to 100. */
export const CREATIVE_QUALITY_WEIGHTS = {
  human_truth: 25,
  strategic_fit: 20,
  differentiation: 20,
  emotional_power: 20,
  memorability: 15,
} as const;

export type CreativeQualityDimension = keyof typeof CREATIVE_QUALITY_WEIGHTS;

export interface CreativeQualityScore {
  case_id: string;
  /** 0-1 per dimension, before weighting. */
  dimensions: Record<CreativeQualityDimension, number>;
  /** Weighted total out of 100. */
  total: number;
  /**
   * Which dimensions are measured versus proxied.
   *
   * Reported on every score because three of the five are proxies, and a total
   * that hides that is a total nobody should act on.
   */
  method: Record<CreativeQualityDimension, "MEASURED" | "PROXY">;
  notes: string[];
}

export const CREATIVE_QUALITY_METHOD: Record<CreativeQualityDimension, "MEASURED" | "PROXY"> = {
  // Measured: the tension is either present in the brief's own problem or not.
  human_truth: "MEASURED",
  // Measured: the idea either addresses the stated objective or does not.
  strategic_fit: "MEASURED",
  // Proxy: distance from category defaults, which is not the same as being
  // ownable by this brand and no other.
  differentiation: "PROXY",
  // Proxy: opposition structure and emotional vocabulary. A sentence can carry
  // both and still move nobody.
  emotional_power: "PROXY",
  // Proxy: brevity and concreteness correlate with recall, imperfectly.
  memorability: "PROXY",
};

/**
 * The seam for model-authored phrasing.
 *
 * A synthesiser receives the same material the deterministic engine does and
 * returns candidate ideas. Nothing else in the pipeline changes: originality
 * evaluation, diversity control and quality scoring all operate on the output
 * regardless of who wrote it. That is deliberate — the day an LLM is wired in,
 * its ideas face exactly the same measurement the deterministic ones do.
 */
export interface CreativeSynthesiser {
  synthesise(input: CreativeSynthesisInput, count: number): Promise<string[]> | string[];
}
