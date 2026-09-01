import { IdentityControlMetadata, ProductManifest } from "../types";

export interface MarketingBrainStrategy {
  creative_angle: string;
  visual_strategy: string;
  commercial_goal: string;
  target_customer_psychology: string;
  composition_strategy: string;
  prompt_guidance: string;
  compression_notes?: string;

  // Backward-compatible fields for prompt compiler consumers
  target_audience?: string;
  visual_direction?: string;
  camera_direction?: string;
  lighting?: string;
  composition?: string;
  negative_prompt?: string;
  master_prompt?: string;
}

export type GroqMarketingStrategy = MarketingBrainStrategy;

export interface MarketingBrainInput {
  concept: string;
  useCase?: string;
  aspectRatio?: string;
  brandName?: string;
  brandInfo?: string;
  targetAudience?: string;
  marketingGoal?: string;
  copyItems?: string[];
  productName?: string;
  productManifest?: ProductManifest;
  identityControlMetadata?: IdentityControlMetadata;
  productCompositionMode?: string;
  productIdentityStrength?: string;
}
