/**
 * TIDO Picture Engine V1 Pro — UI Types & Data Models
 */

export type AssetType =
  | "poster"
  | "social_ad"
  | "product_hero"
  | "banner"
  | "billboard"
  | "ugc_thumbnail";

export type IndustryType =
  | "food_beverage"
  | "beauty_skincare"
  | "fashion_apparel"
  | "electronics_tech"
  | "healthcare_wellness"
  | "real_estate"
  | "education";

export type CampaignObjective =
  | "awareness"
  | "conversion"
  | "promotion"
  | "branding";

export type AspectRatioType = "1:1" | "4:5" | "9:16" | "16:9";

export interface UIState {
  activePanel: "brief" | "canvas" | "strategy";
  isStrategyOpen: boolean;
  isHistoryOpen: boolean;
}

export interface CreativeSession {
  projectId: string;
  projectName: string;
  campaignName?: string;
  created_at?: string;
}

export interface MarketingContext {
  industry: IndustryType;
  objective: CampaignObjective;
  target_channel: string;
  target_audience: string;
}

export interface SalesContext {
  product_name: string;
  offer_text?: string;
  pain_point?: string;
  benefit?: string;
  cta_text?: string;
}

import { ProductCompositionMode, ProductIdentityStrength } from "@tido/contracts";

export interface CreativeDirection {
  /**
   * Phase 4.1.5. Visual direction controls, keyed by control. An absent key or
   * the value "auto" means the user left it on Tự chọn and the engine decides.
   */
  visual_controls?: Record<string, string>;
  visual_style: string;
  emotional_tone: string;
  aspect_ratio: AspectRatioType;
  composition_layout?: string;
  product_composition_mode?: ProductCompositionMode;
  product_identity_strength?: ProductIdentityStrength;
  target_product_count?: number;
}

export interface BrandAsset {
  asset_id: string;
  type: "product_hero" | "logo" | "style_reference";
  file_url: string;
  filename?: string;
  file?: File;
}

export interface BrandIdentity {
  brand_name: string;
  primary_colors: string[];
  product_assets: BrandAsset[];
  logo_asset?: BrandAsset;
  reference_assets?: BrandAsset[];
  /**
   * Phase 5.4. A saved Brand Kit (signed-in only). Sent as an id: the server
   * resolves it against the person's own workspaces, never trusting the client.
   */
  brand_kit_id?: string;
  /**
   * Phase 5.5. Render in Editable mode: the scene without text or logo, the
   * words and the mark composited as separate layers, so the result can be
   * downloaded as a real editable file. Signed-in only.
   */
  editable_export?: boolean;
}

export interface CreativeBrief {
  asset_type: AssetType;
  creative_concept?: string;
  /**
   * Text the user wants to appear in the image, in their own words.
   *
   * Deliberately separate from `creative_concept`. The concept is why the image
   * exists; this is what has to be readable in it. Users write "Khai trương giảm
   * 20%" here — never "headline" or "CTA".
   */
  content_message?: string;
  marketing_context: MarketingContext;
  sales_context: SalesContext;
  creative_direction: CreativeDirection;
  brand_identity: BrandIdentity;
  user_notes?: string;
}

export interface AIStrategy {
  creative_angle: string;
  applied_knowledge_nodes: string[];
  applied_technique_cards: string[];
  compiled_prompt: string;
  negative_prompt: string;
}

/** One thing the AI decided, and what made it decide that. */
export interface CreativeReason {
  what: string;
  why?: string;
  confidence?: "low" | "medium" | "high";
}

/** One creative direction the AI developed. */
export interface ConceptOption {
  name: string;
  idea: string;
  reason: string;
  selected: boolean;
}

/**
 * What the creative system decided, in human language.
 *
 * Mirrors the backend view contract exactly. Every field is optional because
 * the backend omits anything nothing decided -- an absent field means the
 * system did not decide it, and the panel must show that rather than invent
 * filler. This product has twice had to remove confident-looking placeholders.
 */
/**
 * One change the design reasoning made, with what it was and what it became.
 *
 * `applied` is false when confidence was too low to act. Those are still shown
 * -- a decision the AI considered and declined is worth more to a designer than
 * silence, and hiding them would make the panel look more certain than the
 * system is.
 */
export interface DesignDecision {
  role?: string;
  zone?: string;
  problem: string;
  decision: string;
  reason: string;
  decision_confidence: "high" | "medium" | "low";
  from?: number | string;
  to?: number | string;
  applied: boolean;
}

export interface DesignDecisionResult {
  typography_decisions: DesignDecision[];
  layout_decisions: DesignDecision[];
  /** What this pass deliberately left alone, named from the blueprint. */
  protected_elements: string[];
  untranslated: string[];
}

/** The two renders compared in words rather than by a score. */
export interface DesignQualityComparison {
  typography_quality: string;
  layout_quality: string;
  readability: string;
  product_focus: string;
  overall_reasoning: string;
  recommendation: "first" | "second";
}

/** One thing a model reported seeing in the finished render. */
export interface VisionNote {
  what: string;
  where?: string;
  confidence?: "low" | "medium" | "high";
}

/**
 * What a model saw when it looked at the render.
 *
 * `analyzed_image` is the field that matters. It is false whenever nothing
 * actually looked -- the provider was down, the loop was off, the reply did not
 * parse -- and the interface must never present an unseen verdict as an
 * observation.
 */
export interface VisionAnalysis {
  analyzed_image: boolean;
  strengths: VisionNote[];
  issues: VisionNote[];
  typography_problems: VisionNote[];
  layout_problems: VisionNote[];
  product_accuracy: VisionNote[];
  improvement_actions: { action: string; because?: string; area?: string; scope: string }[];
  unavailable_reason?: string;
}

export interface CreativeIntelligence {
  creative_summary?: string;
  selected_direction?: string;
  reasoning?: string;
  audience_insight?: CreativeReason;
  visual_strategy?: CreativeReason;
  typography_reasoning?: CreativeReason;
  composition_reasoning?: CreativeReason;
  layout_reasoning?: CreativeReason;
  critic_feedback?: string[];
  improvement_suggestions?: string[];
  concepts?: ConceptOption[];
  undecided?: string[];
}

export interface PictureEngineError {
  code: string;
  message: string;
  source: "validation" | "compiler" | "provider" | "qc" | "system";
}

export interface GenerationJobState {
  job_id: string | null;
  status:
    | "idle"
    | "interpreting"
    | "compiling"
    | "rendering"
    | "qc_evaluating"
    | "completed"
    | "failed";
  progress_percent: number;
  current_step_label: string;
  error?: PictureEngineError;
}

/**
 * What the pipeline actually did, as reported by the backend.
 *
 * This replaces ImageQCScorecard, which displayed a fixed 94/100 "Creative Score",
 * a fixed 96% "Brand Consistency", an always-PASS badge and an empty issue list on
 * every render, including ones that went badly. Nothing in the pipeline inspects
 * the generated image, so no quality judgement can honestly be shown. These are
 * measurements instead.
 */
export interface GenerationDiagnostics {
  interpretation_source?: string;
  art_direction_provenance?: Record<string, string>;
  art_direction_decisions?: {
    dimension: string;
    source: string;
    confidence: number;
    specificity: string;
    score: number;
    client_locked: boolean;
    qualifiers?: string[];
  }[];
  art_direction_suppressed?: string[];
  strategy_chain?: {
    has_consumer_insight: boolean;
    has_visual_translation: boolean;
    creative_angle?: string;
  };
  layout_visual_priority?: string[];
  layout_eye_flow?: string;
  knowledge_blocks_applied: string[];
  prompt_chars: number;
  prompt_sections_kept?: string[];
  prompt_sections_removed?: { section: string; priority: number; chars: number }[];
  duplicate_lines_removed?: number;
  prompt_hard_truncated?: boolean;
  references_analyzed: number;
  products_detected: number;
  logos_detected: number;
  inspiration_references: number;
  generation_parameters: {
    model: string;
    aspect_ratio: string;
    resolution: string;
    references_attached: number;
  };
  pipeline_warnings: string[];
  layout_zones?: string[];
}

export interface GeneratedAsset {
  asset_id: string;
  /**
   * The engine's generation id -- the key the server recorded the render
   * under. Distinct from `asset_id` (`ast_img_<generationId>`), which is what
   * the approval signal used to send, so no download ever linked to its run.
   * Optional because older persisted state and the mock do not carry it.
   */
  generation_id?: string;
  image_url: string;
  /**
   * Phase 5.5. True when this render was made in Editable mode and has
   * separate layers stored: text, logo and scene, exportable as PSD, Canva,
   * SVG or Figma. False for an ordinary render, which downloads as PNG only.
   */
  editable_export?: boolean;
  aspect_ratio: AspectRatioType;
  diagnostics: GenerationDiagnostics;
  /** The campaign angle the strategy layer decided on. Empty when unavailable. */
  creative_angle: string;
  created_at: string;
}
