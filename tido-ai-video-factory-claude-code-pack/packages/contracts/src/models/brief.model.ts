/**
 * Brief Contract Model
 */

export type CampaignObjective =
  | "awareness"
  | "consideration"
  | "conversion"
  | "retention";

export type TargetChannel =
  | "tiktok"
  | "facebook_reels"
  | "youtube_shorts"
  | "tvc_broadcast"
  | "digital_tvc";

export type ProductionProfileId =
  | "SHORT_VERTICAL_9_16_V1"
  | "TVC_HORIZONTAL_16_9_V1";

export interface Brief {
  brief_id: string;
  project_id: string;
  product_name: string;
  industry: string;
  target_audience: string;
  campaign_objective: CampaignObjective;
  target_channel: TargetChannel;
  brand_tone?: string;
  key_selling_points: string[];
  brand_dna_id?: string;
  production_profile_id?: ProductionProfileId;
  budget_cap_usd?: number;
  created_at: string;
}
