/**
 * TIDO Knowledge Base Layer — TypeScript Type Definitions
 */

export type KnowledgeDomain =
  | "marketing"
  | "creative_direction"
  | "cinematography"
  | "audio_directing";

export type KnowledgeStatus = "draft" | "active" | "deprecated" | "archived";

export interface ContextMatcher {
  suitable_industries: string[];
  suitable_objectives: string[];
  suitable_channels: string[];
  target_audiences?: string[];
  emotional_tones?: string[];
}

export interface KnowledgePayload {
  core_directives: string[];
  prompt_injection_hints?: string[];
  constraints: string[];
  negative_directives?: string[];
}

export interface KnowledgeMetadata {
  author: string;
  confidence_score: number; // 0.0 to 1.0
  historical_pass_rate: number; // 0.0 to 1.0
  status: KnowledgeStatus;
  tags?: string[];
}

export interface KnowledgeNode {
  node_id: string;
  version: string;
  tenant_id: string; // "global" or multi-tenant SaaS Enterprise ID
  domain: KnowledgeDomain;
  category: string;
  title: string;
  summary?: string;
  context_matcher: ContextMatcher;
  payload: KnowledgePayload;
  metadata: KnowledgeMetadata;
}

export type SceneRole =
  | "hook"
  | "problem_statement"
  | "solution_reveal"
  | "product_hero"
  | "social_proof"
  | "cta";

export interface VisualSetup {
  subject_blocking?: string;
  background_depth?: string;
  prop_arrangement?: string;
  color_palette?: string[];
}

export interface LightingSetup {
  key_light?: string;
  fill_light?: string;
  rim_light?: string;
  contrast_ratio?: string;
}

export interface CameraSetup {
  shot_size?: "extreme_close_up" | "close_up" | "medium_shot" | "wide_shot";
  angle?: "eye_level" | "low_angle" | "high_angle" | "top_down";
  lens_feel?: string;
  motion_profile?: string;
}

export interface TechniqueCardProviderHints {
  picture_provider_prompt?: string;
  video_provider_motion?: string;
  voice_provider_emotion?: string;
}

export interface TechniqueCard {
  card_id: string;
  version: string;
  tenant_id: string;
  name: string;
  scene_role: SceneRole;
  visual_setup: VisualSetup;
  lighting_setup: LightingSetup;
  camera_setup: CameraSetup;
  qc_rules: string[];
  provider_hints?: TechniqueCardProviderHints;
}

export interface BrandVisualIdentity {
  primary_colors: string[];
  secondary_colors?: string[];
  brand_tone: string;
  aesthetic_keywords?: string[];
  logo_assets?: string[];
}

export interface BrandVoiceIdentity {
  preferred_speaker_gender: "male" | "female" | "neutral" | "any";
  tone_descriptors: string[];
  pacing_preference?: "slow" | "moderate" | "fast" | "dynamic";
  pronunciation_lexicon?: Record<string, string>;
}

export interface BrandForbiddenRules {
  forbidden_words: string[];
  forbidden_visuals: string[];
  forbidden_competitor_claims?: string[];
}

export interface BrandDNA {
  brand_id: string;
  tenant_id: string;
  brand_name: string;
  industry?: string;
  visual_identity: BrandVisualIdentity;
  voice_identity: BrandVoiceIdentity;
  forbidden_rules: BrandForbiddenRules;
}

export interface ContextQuery {
  query_id: string;
  tenant_id: string;
  industry: string;
  campaign_objective: string;
  target_channel: string;
  brand_tone?: string;
  target_audience?: string;
  scene_role?: SceneRole;
  budget_tier?: string;
  query_embedding?: number[];
  limit?: number;
}

export interface CreativeDecision {
  decision_id: string;
  project_id: string;
  scene_id: string;
  selected_technique_card_ids: string[];
  applied_knowledge_node_ids: string[];
  decision_reasoning: string;
  confidence_score: number;
  timestamp: string;
}

export interface CreativeScoreBreakdown {
  brand_alignment: number; // 0 to 100
  technical_quality: number; // 0 to 100
  commercial_appeal: number; // 0 to 100
}

export interface CreativeScore {
  score_id: string;
  project_id: string;
  scene_id: string;
  pass_status: boolean;
  overall_score: number;
  score_breakdown: CreativeScoreBreakdown;
  feedback_comments?: string[];
}
