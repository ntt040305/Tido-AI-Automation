import { z } from "zod";

// Marketing, sales and creative-direction fields are optional context, not
// required input. The engine now uses only what a person actually typed: an empty
// field stays empty rather than being back-filled with a placeholder and then
// treated downstream as locked creative intent. Only the format switches the UI
// always shows as selected are required.
export const MarketingContextSchema = z.object({
  industry: z
    .enum([
      "food_beverage",
      "beauty_skincare",
      "fashion_apparel",
      "electronics_tech",
      "healthcare_wellness",
      "real_estate",
      "education",
    ])
    .optional(),
  objective: z.enum(["awareness", "conversion", "promotion", "branding"]).optional(),
  target_channel: z.string().optional(),
  target_audience: z.string().optional(),
});

export const SalesContextSchema = z.object({
  product_name: z.string().optional(),
  offer_text: z.string().optional(),
  pain_point: z.string().optional(),
  benefit: z.string().optional(),
  cta_text: z.string().optional(),
});

export const CreativeDirectionSchema = z.object({
  visual_style: z.string().optional(),
  emotional_tone: z.string().optional(),
  aspect_ratio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
  composition_layout: z.string().optional(),
});

export const BrandAssetSchema = z.object({
  asset_id: z.string(),
  type: z.enum(["product_hero", "logo", "style_reference"]),
  file_url: z.string(),
  filename: z.string().optional(),
});

export const BrandIdentitySchema = z.object({
  brand_name: z.string().optional(),
  primary_colors: z.array(z.string()).default([]),
  product_assets: z.array(BrandAssetSchema).default([]),
  logo_asset: BrandAssetSchema.optional(),
});

export const CreativeBriefSchema = z.object({
  asset_type: z.enum([
    "poster",
    "social_ad",
    "product_hero",
    "banner",
    "billboard",
    "ugc_thumbnail",
  ]),
  // The concept is the one thing a generation genuinely cannot proceed without.
  creative_concept: z.string().min(1, "Vui lòng mô tả ý tưởng của bạn"),
  marketing_context: MarketingContextSchema,
  sales_context: SalesContextSchema,
  creative_direction: CreativeDirectionSchema,
  brand_identity: BrandIdentitySchema,
  user_notes: z.string().optional(),
});

export type CreativeBriefSchemaType = z.infer<typeof CreativeBriefSchema>;
