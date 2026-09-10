import { CopyItemInput } from "../types";
import { MarketingBrainStrategy } from "../llm/prompt-strategy.schema";
import { CiosShadowReport } from "../reasoning/cios-shadow.types";

/**
 * The five deliverables a commercial picture campaign is expected to ship.
 *
 * These are campaign-level names. Each maps to an engine `useCase` — the two
 * vocabularies are deliberately kept separate so the campaign layer can talk the
 * way an agency does ("thumbnail") while the engine keeps its own asset profile
 * name ("ugc_thumbnail").
 */
export type CampaignAssetType =
  | "poster"
  | "banner"
  | "social_ad"
  | "product_hero"
  | "thumbnail";

export const ALL_CAMPAIGN_ASSET_TYPES: CampaignAssetType[] = [
  "poster",
  "banner",
  "social_ad",
  "product_hero",
  "thumbnail",
];

/** Campaign asset name → engine useCase. */
export const ASSET_USE_CASE: Record<CampaignAssetType, string> = {
  poster: "poster",
  banner: "banner",
  social_ad: "social_ad",
  product_hero: "product_hero",
  thumbnail: "ugc_thumbnail",
};

/**
 * Default delivery ratio per asset type. Every value is one the provider can
 * actually render — a preset that needs a ratio the provider rejects is derived
 * by crop at delivery time instead (see export-presets).
 */
export const ASSET_DEFAULT_RATIO: Record<CampaignAssetType, string> = {
  poster: "9:16",
  banner: "16:9",
  social_ad: "9:16",
  product_hero: "1:1",
  thumbnail: "16:9",
};

export interface CampaignReferenceImage {
  reference_id?: string;
  buffer?: Buffer;
  mimeType?: string;
  filename?: string;
  role?: "PRODUCT" | "LOGO" | "INSPIRATION_REFERENCE";
}

/**
 * What an account manager actually has when a job comes in.
 *
 * Only `brand`, `product` and `concept` carry real weight; everything else is
 * optional context. Nothing here is defaulted to a placeholder — an unanswered
 * field stays unanswered rather than becoming invented creative intent.
 */
export interface CampaignBriefInput {
  brand: string;
  product: string;
  audience?: string;
  objective?: string;
  channel?: string;
  tone?: string;
  industry?: string;
  /** The creative ask, in the client's own words and language. */
  concept?: string;
  /**
   * What the work is actually up against, in one line.
   *
   * Phase 4.0.2. The concept layer's strongest retrieval signal — does this
   * tension appear in the brief's own problem — had nothing to score against,
   * because a brief carried a product description and no statement of the
   * difficulty. Measured on the 30-case set, that made the claim-fatigue brief
   * select a price-guilt tension: thirty distinct ideas, frequently about the
   * wrong problem.
   *
   * Optional, so every existing caller is unaffected. Supplied, it is what
   * `human_problem` and `human_truth` are measured against.
   */
  creativeChallenge?: string;
  brandInfo?: string;
  copyItems?: (CopyItemInput | string)[];
  hardRequirements?: string[];
  references?: CampaignReferenceImage[];
  assetTypes?: CampaignAssetType[];
  /** Override the default delivery ratio for specific assets. */
  ratioOverrides?: Partial<Record<CampaignAssetType, string>>;
  campaignId?: string;
}

/**
 * The visual rules every asset in the campaign must obey.
 *
 * This is what makes five renders look like one campaign rather than five
 * unrelated pictures. It is deliberately about logic, not coordinates — the
 * per-asset layout geometry is decided later by CommercialLayoutService.
 */
export interface VisualDNA {
  mood: string;
  colour_logic: string;
  lighting_logic: string;
  composition_logic: string;
  typography_logic: string;
  product_presentation: string;
}

export interface CampaignConcept {
  campaign_id: string;
  campaign_name: string;
  big_idea: string;
  core_message: string;
  /** Kept from the marketing reasoning so the campaign can explain itself. */
  consumer_insight?: string;
  emotional_response?: string;
  visual_dna: VisualDNA;
  asset_plan: CampaignAssetType[];
  provenance: {
    strategy_source: "MARKETING_BRAIN" | "DETERMINISTIC_FALLBACK";
    interpretation_source?: string;
    derived_fields: string[];
  };
}

export interface ArtDirectionDecisionRecord {
  dimension: string;
  value: string;
  source: string;
  confidence: number;
  specificity: string;
  score: number;
  client_locked: boolean;
  qualifiers?: string[];
}

export interface AssetPromptPlan {
  campaign_dna_applied: string[];
  asset_adaptations: string[];
  art_direction_sources: Record<string, string>;
  /** Full scoring detail per dimension, for debugging a surprising render. */
  art_direction_decisions: ArtDirectionDecisionRecord[];
  knowledge_blocks: string[];
  client_locked_dimensions: string[];
}

export interface AssetPlanResult {
  asset_type: CampaignAssetType;
  use_case: string;
  aspect_ratio: string;
  asset_goal: string;
  layout_logic: {
    eye_flow: string;
    negative_space_strategy: string;
    safe_margin_percent: number;
    zones: { role: string; x: number; y: number; width: number; height: number }[];
  };
  visual_priority: { element: string; importance: number; role: string }[];
  prompt_plan: AssetPromptPlan;
  final_prompt: string;
  prompt_chars: number;
  warnings: string[];
  /** Populated only when the asset was actually rendered. */
  image_url?: string;
  generation_id?: string;
  error?: { code: string; message: string };
}

export interface CampaignRunDiagnostics {
  router_source: string;
  strategy_source: string;
  interpretation_sources: string[];
  gemini_calls: number;
  llm_calls: number;
  provider_calls: number;
  duration_ms: number;
  warnings: string[];
  /** Phase 3.1 — whether the parallel CIOS reasoning path ran on this campaign. */
  cios_reasoning_enabled?: boolean;
}

export interface CampaignResult {
  success: boolean;
  campaign: CampaignConcept;
  /**
   * The raw marketing reasoning behind the campaign. Carried on the result so a
   * reviewer can see the insight → emotion → message → visual-translation chain
   * that produced the concept, rather than only its conclusion.
   */
  strategy?: MarketingBrainStrategy;
  assets: AssetPlanResult[];
  delivery?: {
    package_root: string;
    manifest_path: string;
    summary_json_path: string;
    summary_txt_path: string;
    file_count: number;
  };
  diagnostics: CampaignRunDiagnostics;
  /**
   * Phase 3.1 — what the CIOS reasoning stack would have decided for this brief.
   *
   * Observation only. Nothing in `assets` was produced from it, and nothing in it
   * reached a prompt. When the flag is off this carries `{ enabled: false }` with
   * a reason rather than being absent, so "shadow mode was never asked to run" is
   * distinguishable from "shadow mode ran and found nothing".
   */
  cios_reasoning?: CiosShadowReport;
  error?: { code: string; message: string };
}
