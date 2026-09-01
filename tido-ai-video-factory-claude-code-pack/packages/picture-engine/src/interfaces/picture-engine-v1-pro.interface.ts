/**
 * TIDO Picture Engine V1 Pro — Core Interfaces
 */

export interface ReferenceAssetIdentityLock {
  face_lock?: boolean;
  product_shape_lock?: boolean;
  label_lock?: boolean;
  feature_fingerprint?: string;
}

export type CameraViewOption = "front" | "side_45" | "close_up_detail" | "environment_backdrop";

export type VideoUsagePurpose =
  | "character_face_swap"
  | "product_3d_keyframe"
  | "background_motion_tracking";

export interface ConsistencyRequirements {
  lighting_lock: boolean;
  color_lock: boolean;
  material_texture_lock: boolean;
}

export interface ReferenceAssetMetadata {
  asset_id: string;
  category: "video_ai_reference" | "commercial_creative";
  type: "character_reference" | "product_reference" | "environment_reference";
  identity_lock: ReferenceAssetIdentityLock;
  camera_views: CameraViewOption[];
  video_usage_purpose: VideoUsagePurpose;
  consistency_requirements: ConsistencyRequirements;
}

export interface CommercialCreativeOptions {
  creative_type: string; // Extensible (poster, banner, social_creative, product_hero, billboard, ugc_thumbnail, catalog_hero, etc.)
  target_channel?: string;
  custom_aspect_ratio?: "9:16" | "16:9" | "1:1" | "4:5";
  brand_accent_color?: string;
}

export interface ImageQCResult {
  overall_score: number; // 0.0 to 1.0
  brand_alignment_score: number; // 0.0 to 1.0
  technical_quality_score: number; // 0.0 to 1.0
  commercial_impact_score: number; // 0.0 to 1.0
  issues: string[];
  validation_result: "pass" | "warn" | "fail";
}

export interface PictureEngineGenerationMetadata {
  generation_id: string;
  engine_version: "V1_PRO";
  mode: "reference_asset" | "commercial_creative";
  provider_name: string;
  model_name: string;
  compiled_prompt: string;
  negative_prompt?: string;
  applied_knowledge_node_ids: string[];
  applied_technique_card_ids: string[];
  qc_result: ImageQCResult;
  generated_at: string;
}
