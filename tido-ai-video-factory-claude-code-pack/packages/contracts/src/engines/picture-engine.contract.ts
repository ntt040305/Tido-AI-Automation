/**
 * Picture Engine Contract (Compatible with Nano Banana 2 API / ImgStudio)
 */

export interface PictureEngineRequest {
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: "9:16" | "16:9" | "1:1" | "4:5";
  model: string; // e.g. "flow-nano-banana-2"
  seed?: number;
  reference_image_urls?: string[];
  identity_preservation?: {
    character_id?: string;
    product_id?: string;
  };
  style_modifiers?: string[];
}

export interface PictureEngineResponse {
  job_id: string;
  status: "succeeded" | "failed";
  output_image_url?: string;
  seed_used?: number;
  error?: string;
}
