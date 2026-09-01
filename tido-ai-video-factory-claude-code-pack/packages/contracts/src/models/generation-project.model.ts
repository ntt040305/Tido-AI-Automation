/**
 * GenerationProject Contract Model — TIDO Creative OS Layer 1
 */

import { AspectRatio, ProjectStatus, ProjectType } from "../common/enums";

export type CreativeType =
  | "poster"
  | "social_ad"
  | "product_hero"
  | "banner"
  | "billboard"
  | "ugc_thumbnail";

export type MarketingGoal =
  | "awareness"
  | "conversion"
  | "promotion"
  | "branding";

export interface VoiceProjectInput {
  script_text: string;
  voice_id: string;
  emotion?: "neutral" | "excited" | "warm" | "authoritative" | "sad";
  speed?: number;
  pipeline_mode?: "v2_safe" | "v2_micro_dynamics";
}

export type ProductCompositionMode =
  | "single"
  | "multi"
  | "catalog";

export type ProductIdentityStrength =
  | "standard"
  | "strict"
  | "absolute";

export interface ImageProjectInput {
  prompt: string;
  creative_type?: CreativeType;
  marketing_goal?: MarketingGoal;
  aspect_ratio: AspectRatio;
  reference_asset_ids?: string[];
  brand_name?: string;
  industry?: string;
  target_audience?: string;
  sales_copy_hooks?: string[];
  product_composition_mode?: ProductCompositionMode;
  product_identity_strength?: ProductIdentityStrength;
  target_product_count?: number;
}

export interface VideoProjectInput {
  concept: string;
  duration_seconds: number;
  aspect_ratio: AspectRatio;
  target_audience?: string;
  reference_asset_ids?: string[];
}

export type GenerationProjectInput =
  | VoiceProjectInput
  | ImageProjectInput
  | VideoProjectInput;

export interface GenerationProject {
  id: string;
  title: string;
  type: ProjectType;
  input: GenerationProjectInput;
  status: ProjectStatus;
  scene_ids?: string[];
  output_asset_ids?: string[];
  created_at: string;
  updated_at?: string;
}
