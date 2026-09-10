/**
 * CIOS Layer 2 — Reasoning Knowledge types.
 *
 * Layer 1 (data/knowledge) tells the IMAGE MODEL how to execute. It is neutral by
 * design and governed by KNOWLEDGE_AUTHORING_STANDARD_V1.
 *
 * Layer 2 (data/cios-knowledge) tells the REASONING LLM what to decide. It is
 * prescriptive by design and governed by REASONING_KNOWLEDGE_STANDARD_V2 plus
 * CIOS_Level9_Reasoning_Knowledge_Governance_Rules_v1.
 *
 * The two layers never share a file, a schema, a repository or a budget. The
 * hard rule from Governance §1: Layer 2 must NEVER enter the image generation
 * prompt — only the decision it produced does, and that decision travels through
 * the art direction flow that already exists.
 *
 * Nothing in this file is imported by the image generation pipeline.
 */

// ── Controlled vocabularies (Governance §5, §6, §13) ────────────────────

/** Governance §5. */
export const KNOWLEDGE_TYPES = [
  "principle",
  "decision_rule",
  "framework",
  "pattern",
  "anti_pattern",
  "example",
  "evaluation_rule",
  "production_rule",
] as const;
export type ReasoningKnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

/** Governance §6. Every object must belong to at least one stage. */
export const CREATIVE_STAGES = [
  "strategy",
  "concept",
  "visual_direction",
  "design",
  "production",
  "evaluation",
] as const;
export type CreativeStage = (typeof CREATIVE_STAGES)[number];

/**
 * Governance §13 lists these as examples, not a closed set, so an unrecognised
 * value is reported as a warning rather than an error. Extending the list here is
 * the supported way to add one — that keeps the vocabulary controlled without
 * making it impossible to grow.
 */
export const AUDIENCE_VOCABULARY = [
  "women_25_35",
  "women_35_50",
  "gen_z",
  "premium_consumers",
  "mass_market_consumers",
] as const;

export const BRAND_POSITION_VOCABULARY = [
  "luxury",
  "premium",
  "mass",
  "budget",
  "innovative",
  "traditional",
] as const;

/**
 * Domain folders under data/cios-knowledge.
 *
 * Phase 2.1 splits three areas that were previously folded into a parent domain,
 * because retrieval could not distinguish them: `lighting` and `camera` both lived
 * inside `photography`, and `composition` inside `layout`. A brief that needs a
 * lens decision should not have to sift lighting knowledge to find it.
 *
 * `industry` is added for knowledge about how a whole industry communicates.
 * `category` predates it and is retained so existing objects stay valid; new
 * industry-level knowledge should use `industry`.
 *
 * Adding values to this list is backward compatible — every object authored
 * against the earlier list remains valid.
 */
export const REASONING_DOMAINS = [
  // Strategic
  "strategy",
  "audience",
  "industry",
  "category",
  "concept",
  "differentiation",
  // Phase 4.0 — the Creative Concept Intelligence layer.
  //
  // Phase 3.1.8.1 confined the concept layer to concept-bearing domains and found
  // the corpus held 11 usable objects across 368: CIOS could reject a wrong idea
  // and could not produce a right one. These four domains are what a concept is
  // actually built from, kept separate because they answer different questions
  // and a brief matches them on different axes — a tension is human and largely
  // industry-independent, a territory is brand-owned and category-specific.
  "human_tension",
  "consumer_insight",
  "campaign_territory",
  "idea_pattern",
  // Visual direction
  "visual_direction",
  "composition",
  "layout",
  "typography",
  "color",
  // Production craft
  "photography",
  "camera",
  "lighting",
  "material",
  // Delivery
  "channel",
  "production",
  // Meta
  "critic",
  "examples",
] as const;
export type ReasoningDomain = (typeof REASONING_DOMAINS)[number];

/**
 * Domain-specific detail.
 *
 * Phase 2.1 needs fields the core schema does not carry — a layout object needs
 * eye movement and a failure pattern; a lighting object needs its emotional
 * reading. Rather than fork the schema per domain, all of it hangs off one
 * optional `domain_profile`. The core 24 fields are untouched, every object
 * written before this existed stays valid, and the retriever needs no change
 * because it selects on `context`, never on profile detail.
 */
export interface LayoutProfile {
  /** What this layout is FOR, in one line. */
  purpose: string;
  /** How the frame is divided. */
  structure: string;
  /** Ranked reading order of elements. */
  visual_hierarchy: string[];
  /** Where the eye travels, in order. */
  eye_movement: string;
  /** How this layout fails when misapplied. */
  failure_pattern: string;
}

export interface PhotographyProfile {
  /** What a focal length choice says, beyond how much fits in frame. */
  lens_psychology?: string;
  /** What the crop implies about the viewer's relationship to the subject. */
  framing_psychology?: string;
  /** What the camera height and tilt assert about power and intimacy. */
  camera_angle?: string;
  /** Depth of field as a narrative instrument rather than an exposure setting. */
  depth_of_field?: string;
}

export interface LightingProfile {
  /** What this light makes a viewer feel before they read anything. */
  emotional_perception: string;
  /** Where this lighting is standard practice commercially. */
  commercial_usage: string;
  /** Quality, direction and ratio in plain terms. */
  technical_character?: string;
}

export interface ColorProfile {
  /** What this palette asserts about the brand. */
  brand_perception: string;
  /** The feeling it produces before meaning is decoded. */
  emotional_association: string;
  /** Meaning that changes by market — Vietnam and SEA differ from the West. */
  cultural_note?: string;
}

export interface CompositionProfile {
  /** The organising geometry. */
  structure: string;
  /** What the arrangement does to attention. */
  attention_effect: string;
  failure_pattern?: string;
}

/**
 * Phase 4.0 — a creative concept pattern.
 *
 * Every other profile describes how something should look. This one describes
 * why anyone should care, and its fields are the chain a planner actually walks:
 * a tension a real person carries, the insight that names it, the feeling the
 * work is trying to cause, and the territory that opens up for the brand.
 *
 * Deliberately carries no measurement, no frame reference and no craft
 * vocabulary. An object whose text reads as an instruction would be rejected by
 * ConceptQualityGate the moment it became a big idea — which is the failure this
 * whole phase exists to remove, so it must not be reintroduced in the knowledge.
 */
export interface CreativeConceptPatternProfile {
  /** What the person is caught between, before any brand speaks. */
  human_tension: string;
  /** The observation that names the tension in the audience's own terms. */
  consumer_insight: string;
  /** The feeling the work is trying to produce, not describe. */
  emotional_trigger: string;
  /** What the audience should believe afterwards that they did not before. */
  belief_shift: string;
  /** The ownable space this opens up for the brand. */
  campaign_territory: string;
  /** Concrete ways it could be expressed. */
  example_applications?: string[];
  /** Executions that would collapse the idea back into category default. */
  avoid_patterns?: string[];
  /** Industries the pattern transfers to. */
  industries?: string[];
}

export interface TypographyProfile {
  /** What the letterforms say about the brand before the words are read. */
  personality: string;
  /** Pairing and hierarchy guidance. */
  hierarchy?: string;
  /** Vietnamese diacritics need vertical room most Latin faces do not reserve. */
  vietnamese_note?: string;

  // ── Batch 4 additions ──
  // Typography carries more decision surface than the other craft domains: a
  // single choice sets tone, rank and rhythm at once. These fields separate the
  // three so a retrieval can ask about rank without also inheriting tone.
  /** What this typographic choice is FOR. */
  purpose?: string;
  /** What it does to the page optically. */
  visual_effect?: string;
  /** What the reader infers about the brand before decoding a word. */
  psychological_signal?: string;
  /** How rank is established between levels. */
  hierarchy_rule?: string;
  /** Leading, tracking and margin behaviour this choice requires. */
  spacing_rule?: string;
  /** How this choice fails when misapplied. */
  failure_pattern?: string;
}

export type DomainProfile =
  | ({ kind: "layout" } & LayoutProfile)
  | ({ kind: "photography" } & PhotographyProfile)
  | ({ kind: "lighting" } & LightingProfile)
  | ({ kind: "color" } & ColorProfile)
  | ({ kind: "composition" } & CompositionProfile)
  | ({ kind: "typography" } & TypographyProfile)
  | ({ kind: "creative_concept_pattern" } & CreativeConceptPatternProfile);

// ── Context (Governance §4 — mandatory on every object) ─────────────────

/**
 * A context field accepts one value, several, or "*".
 *
 * Governance §4 requires context but does not fix cardinality, and both readings
 * are needed in practice: a luxury-skincare rule names one industry, while a
 * premium-positioning rule spans several. "*" (or omission) means the axis does
 * not constrain the match.
 */
export type ContextValue = string | string[];

export interface ReasoningContext {
  industry: ContextValue;
  category: ContextValue;
  audience: ContextValue;
  objective: ContextValue;
  channel: ContextValue;
  asset_type: ContextValue;
  brand_position: ContextValue;
}

/** Governance §8. Absent human insight makes a strategic object incomplete. */
export interface HumanInsight {
  functional_need: string;
  emotional_need: string;
  social_need: string;
}

/** Governance §9. */
export interface AntiPattern {
  problem: string;
  why_it_fails: string;
  replacement: string;
}

/** Governance §10 / §15. */
export interface TradeOff {
  advantage: string;
  limitation: string;
  suitable_conditions: string;
  unsuitable_conditions: string;
}

export interface ExtractedExample {
  reference?: string;
  problem: string;
  strategy?: string;
  insight?: string;
  creative_decision: string;
  execution_logic?: string;
  transferable_rule: string;
  limitations?: string;
}

// ── The knowledge object (Governance §2) ────────────────────────────────

export interface ReasoningKnowledgeObject {
  /** Governance §3: domain.sub_domain.topic.number, optional .vN suffix. */
  knowledge_id: string;
  name: string;
  domain: ReasoningDomain | string;
  sub_domain: string;
  knowledge_type: ReasoningKnowledgeType;
  /** At least one stage (Governance §6). */
  creative_stage: CreativeStage | CreativeStage[];

  context: ReasoningContext;

  /** Governance §7 — the decision intelligence requirement. */
  problem: string;
  human_insight?: HumanInsight;
  decision: string;
  reasoning: string;
  why_this_works: string;
  use_when: string | string[];
  avoid_when: string | string[];

  trade_off?: TradeOff | string;
  alternatives?: string | string[];
  anti_patterns?: AntiPattern[];
  examples?: ExtractedExample[];

  /** Governance §16: qualitative explanation of the effect. */
  impact: string;
  /** Governance §11/§16: numeric ranking, 1-10. */
  impact_score: number;
  /** Governance §11: 1-10. */
  priority: number;
  /** Governance §11: 0-1 reliability. */
  confidence: number;
  /**
   * Governance §11 defines this as how strongly the object matches the CURRENT
   * request, which is a per-request quantity. The stored value is therefore a
   * baseline the retriever starts from; the live match is computed per query and
   * returned on the retrieval result, never written back here.
   */
  context_relevance?: number;

  related_knowledge?: string[];
  source?: string;

  /** Optional domain-specific detail. See DomainProfile. */
  domain_profile?: DomainProfile;

  /** Set by the loader, not by the author. */
  _file?: string;
}

// ── Retrieval result ────────────────────────────────────────────────────

/**
 * The CreativeDirection fields a reasoning decision can land in.
 *
 * Phase 3.1.6. Before this existed, "where does a colour decision go?" was
 * answered in `route()` and "how much of the retrieval budget should colour get?"
 * was answered nowhere — so layout took 184 of 360 slots and typography, having
 * no destination at all, took 48 and produced nothing.
 *
 * Both questions are now answered from `DOMAIN_DIRECTION_SLOT` below. It lives
 * here, in the substrate both the retriever and the decision engine already
 * import, rather than in either of them — a second copy of this map is how the
 * two would drift apart, and a retrieval budget allocated against a stale map is
 * worse than no budget at all.
 */
export type DirectionSlot =
  | "camera_direction"
  | "lighting_direction"
  | "composition_strategy"
  | "color_strategy"
  | "visual_style"
  | "typography_strategy"
  | "material_direction";

export const DIRECTION_SLOTS: DirectionSlot[] = [
  "camera_direction",
  "lighting_direction",
  "composition_strategy",
  "color_strategy",
  "visual_style",
  "typography_strategy",
  "material_direction",
];

/**
 * Which slot each visual domain feeds.
 *
 * `photography` is listed under camera because that is where most of its objects
 * land, but it is the one domain whose destination genuinely depends on the
 * decision's wording — `route()` keeps that judgement. The map is used here only
 * to group candidates for the retrieval budget, where an approximate grouping is
 * correct and a missing one is not.
 *
 * Domains absent from this map are non-visual: they become STRATEGY or ADVISORY
 * decisions and compete for the budget as one group.
 */
export const DOMAIN_DIRECTION_SLOT: Record<string, DirectionSlot> = {
  camera: "camera_direction",
  photography: "camera_direction",
  lighting: "lighting_direction",
  layout: "composition_strategy",
  composition: "composition_strategy",
  color: "color_strategy",
  visual_direction: "visual_style",
  typography: "typography_strategy",
  material: "material_direction",
};

/** Grouping key for the retrieval budget: a slot name, or one of two buckets. */
export const NON_VISUAL_GROUP = "non_visual";

/**
 * Phase 4.0 — concept-bearing domains get their own retrieval group.
 *
 * Before this they shared `non_visual` with channel, production, critic and
 * examples. Measured across the thirty benchmark cases, that group's single
 * quota slot went to an `industry` or `channel` object on 26 of 30 briefs, so
 * the concept layer had nothing to lead from and produced no idea at all.
 *
 * A separate group guarantees the coverage pass reaches a concept object on
 * every brief that retrieves one. It does not guarantee a good idea — only that
 * the layer is given something to work with.
 */
export const CONCEPT_GROUP = "concept_intelligence";

export const CONCEPT_RETRIEVAL_DOMAINS = new Set([
  "human_tension",
  "consumer_insight",
  "campaign_territory",
  "idea_pattern",
  "strategy",
  "audience",
  "concept",
  "category",
  "differentiation",
]);

export function retrievalGroup(domain: string): string {
  if (DOMAIN_DIRECTION_SLOT[domain]) return DOMAIN_DIRECTION_SLOT[domain];
  if (CONCEPT_RETRIEVAL_DOMAINS.has(domain)) return CONCEPT_GROUP;
  return NON_VISUAL_GROUP;
}

export interface ReasoningRetrievalQuery {
  industry?: string;
  category?: string;
  audience?: string;
  objective?: string;
  channel?: string;
  asset_type?: string;
  brand_position?: string;
  /** Restricts to knowledge that applies at this reasoning stage. */
  creative_stage?: CreativeStage;
  /** Restricts to specific domains, e.g. ["differentiation","category"]. */
  domains?: string[];
  limit?: number;
}

export interface ContextMatchDetail {
  axis: keyof ReasoningContext | "creative_stage";
  queryValue?: string;
  objectValue: string;
  matched: boolean;
  /** True when the object declares "*" — applicable, but not evidence of fit. */
  wildcard: boolean;
}

export interface ScoredReasoningKnowledge {
  object: ReasoningKnowledgeObject;
  /** 0-1, computed per request (Governance §11 context_relevance). */
  context_relevance: number;
  /** Final ranking score. */
  score: number;
  matches: ContextMatchDetail[];
}

export interface ReasoningRetrievalResult {
  query: ReasoningRetrievalQuery;
  results: ScoredReasoningKnowledge[];
  /** Objects considered before context filtering. */
  candidates_evaluated: number;
  warnings: string[];
}
