/**
 * TIDO Creative Director Engine V1.1 — Core Interfaces
 */

import { Brief, Scene } from "@tido/contracts";

export interface CampaignContext {
  industry: string;
  audience: string;
  objective: string;
  channel: string;
  marketing_angle: string;
  brand_tone?: string;
}

export interface CampaignStrategy {
  creative_angle: string;
  hook_strategy: string;
  emotional_direction: string;
  content_framework: "problem_solution" | "storytelling" | "product_demo" | "social_proof_cta";
  cta_strategy: string;
}

export interface CreativeIntent {
  scene_purpose: "hook" | "problem" | "solution" | "hero" | "proof" | "cta";
  communication_goal: string;
  audience_emotion_target: string;
  story_role: string;
}

export interface VoiceProductionDirection {
  script_text: string;
  speaker_profile: string;
  emotion: string;
  pacing_wpm: number;
  pause_strategy: string;
  voice_style_direction: string;
}

export type ReferenceAssetCategory = "video_ai_reference" | "commercial_creative";

export type ReferenceAssetType =
  // Use Case A: Video AI Reference Assets
  | "character_reference"
  | "product_reference"
  | "environment_reference"
  // Use Case B: Commercial Creative Assets
  | "poster"
  | "banner"
  | "social_creative"
  | "product_hero_image";

export interface ReferenceAssetRequirement {
  asset_id: string;
  category: ReferenceAssetCategory;
  type: ReferenceAssetType;
  purpose: string;
  visual_description: string;
  consistency_requirements: {
    identity_constraint?: string;
    wardrobe_or_style?: string;
    brand_color_match?: boolean;
    lighting_match?: boolean;
  };
}

export interface VisualProductionDirection {
  camera_angle: string;
  shot_type: string;
  lighting: string;
  composition: string;
  color_direction: string;
  visual_style: string;
}

export interface VideoProductionDirection {
  motion_type: string;
  camera_movement: string;
  acting_direction: string;
  duration_seconds: number;
  temporal_requirements: string[];
}

export interface ComposerInstruction {
  subtitle_requirement: boolean;
  logo_placement: string;
  music_direction: string;
  transition_guidance: string;
}

export interface QualityControlRules {
  must_have: string[];
  must_not_have: string[];
}

/**
 * ProductionScenePackage wraps and extends existing @tido/contracts Scene model
 * to ensure 100% backward compatibility while providing complete production details.
 */
export interface ProductionScenePackage extends Scene {
  creative_intent: CreativeIntent;
  voice_production: VoiceProductionDirection;
  reference_assets: ReferenceAssetRequirement[];
  visual_production: VisualProductionDirection;
  video_production: VideoProductionDirection;
  composer_instruction: ComposerInstruction;
  qc_rules: QualityControlRules;
}

/**
 * Lightweight JSON-serializable decision trace
 */
export interface CreativeDecisionTraceItem {
  decision_type: "hook_selection" | "visual_style" | "audio_tone" | "asset_choice";
  decision_reason: string;
  knowledge_sources: string[]; // Node IDs or Card IDs
  confidence_score: number; // 0.0 to 1.0
}

export interface CreativePlan {
  project_id: string;
  brief: Brief;
  context: CampaignContext;
  strategy: CampaignStrategy;
  scenes: ProductionScenePackage[]; // Upgraded to ProductionScenePackage (extends Scene)
  decision_traces: CreativeDecisionTraceItem[];
  generated_at: string;
}
