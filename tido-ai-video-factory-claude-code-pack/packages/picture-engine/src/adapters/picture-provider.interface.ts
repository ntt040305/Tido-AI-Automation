/**
 * Provider Adapter Interface for Picture Engine V1 Pro
 */

import { PictureEngineRequest, PictureEngineResponse } from "@tido/contracts";

export interface ProviderCapabilities {
  supports_identity_lock: boolean;
  supports_negative_prompt: boolean;
  supported_aspect_ratios: string[];
  max_resolution: string;
}

export interface ProviderCostEstimate {
  estimated_credits: number;
  estimated_usd: number;
}

export interface PictureEditRequest {
  source_asset_id: string;
  edit_instruction: string;
  aspect_ratio: string;
}

export interface PictureVariationRequest {
  source_asset_id: string;
  variation_strength: number;
  aspect_ratio: string;
}

export interface IPictureEngineProviderAdapter {
  provider_name: string;
  model_name: string;

  validateRequest(request: PictureEngineRequest): boolean;

  checkCapabilities(request: PictureEngineRequest): ProviderCapabilities;

  estimateCost(request: PictureEngineRequest): ProviderCostEstimate;

  generateImage(request: PictureEngineRequest): Promise<PictureEngineResponse>;

  editImage(request: PictureEditRequest): Promise<PictureEngineResponse>;

  variationImage(request: PictureVariationRequest): Promise<PictureEngineResponse>;
}
