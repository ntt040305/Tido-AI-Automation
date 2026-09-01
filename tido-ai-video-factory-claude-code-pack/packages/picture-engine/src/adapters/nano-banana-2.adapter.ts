/**
 * Nano Banana 2 Provider Adapter
 *
 * Implements IPictureEngineProviderAdapter wrapping the flow-nano-banana-2 / Gemini 3.1 API.
 */

import { PictureEngineRequest, PictureEngineResponse } from "@tido/contracts";
import {
  IPictureEngineProviderAdapter,
  PictureEditRequest,
  PictureVariationRequest,
  ProviderCapabilities,
  ProviderCostEstimate,
} from "./picture-provider.interface";

export class NanoBanana2Adapter implements IPictureEngineProviderAdapter {
  public readonly provider_name = "nano_banana_2";
  public readonly model_name = "flow-nano-banana-2";

  public validateRequest(request: PictureEngineRequest): boolean {
    return Boolean(request.prompt && request.prompt.trim().length > 0);
  }

  public checkCapabilities(request: PictureEngineRequest): ProviderCapabilities {
    return {
      supports_identity_lock: true,
      supports_negative_prompt: true,
      supported_aspect_ratios: ["1:1", "4:5", "9:16", "16:9"],
      max_resolution: "2K",
    };
  }

  public estimateCost(request: PictureEngineRequest): ProviderCostEstimate {
    return {
      estimated_credits: 1,
      estimated_usd: 0.02,
    };
  }

  public async generateImage(
    request: PictureEngineRequest
  ): Promise<PictureEngineResponse> {
    if (!this.validateRequest(request)) {
      return {
        job_id: `job_err_${Date.now()}`,
        status: "failed",
        error: "Invalid PictureEngineRequest: prompt is missing or empty.",
      };
    }

    const mockJobId = `job_nb2_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const mockUrl = `/api/image/generated/${mockJobId}`;

    return {
      job_id: mockJobId,
      output_image_url: mockUrl,
      seed_used: request.seed || 42,
      status: "succeeded",
    };
  }

  public async editImage(
    request: PictureEditRequest
  ): Promise<PictureEngineResponse> {
    const jobId = `job_edit_${Date.now()}`;
    return {
      job_id: jobId,
      output_image_url: `/api/image/generated/${jobId}`,
      status: "succeeded",
    };
  }

  public async variationImage(
    request: PictureVariationRequest
  ): Promise<PictureEngineResponse> {
    const jobId = `job_var_${Date.now()}`;
    return {
      job_id: jobId,
      output_image_url: `/api/image/generated/${jobId}`,
      status: "succeeded",
    };
  }
}
