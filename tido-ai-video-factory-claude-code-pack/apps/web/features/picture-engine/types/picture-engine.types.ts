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
}

export interface CreativeBrief {
  asset_type: AssetType;
  creative_concept?: string;
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
  image_url: string;
  aspect_ratio: AspectRatioType;
  diagnostics: GenerationDiagnostics;
  /** The campaign angle the strategy layer decided on. Empty when unavailable. */
  creative_angle: string;
  created_at: string;
}
