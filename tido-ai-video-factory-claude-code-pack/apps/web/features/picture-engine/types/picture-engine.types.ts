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

export interface ImageQCScorecard {
  overall_score: number; // 0.0 to 1.0
  brand_alignment_score: number;
  technical_quality_score: number;
  commercial_impact_score: number;
  validation_result: "pass" | "warn" | "fail";
  issues: string[];
}

export interface GeneratedAsset {
  asset_id: string;
  image_url: string;
  aspect_ratio: AspectRatioType;
  qc_scorecard: ImageQCScorecard;
  ai_explanation: string;
  created_at: string;
}
