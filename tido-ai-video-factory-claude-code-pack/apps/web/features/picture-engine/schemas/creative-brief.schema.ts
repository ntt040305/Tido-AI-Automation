import { z } from "zod";

export const MarketingContextSchema = z.object({
  industry: z.enum([
    "food_beverage",
    "beauty_skincare",
    "fashion_apparel",
    "electronics_tech",
    "healthcare_wellness",
    "real_estate",
    "education",
  ]),
  objective: z.enum(["awareness", "conversion", "promotion", "branding"]),
  target_channel: z.string().min(1, "Vui lòng nhập kênh truyền thông"),
  target_audience: z.string().min(1, "Vui lòng mô tả đối tượng mục tiêu"),
});

export const SalesContextSchema = z.object({
  product_name: z.string().min(1, "Vui lòng nhập tên sản phẩm"),
  offer_text: z.string().optional(),
  pain_point: z.string().optional(),
  benefit: z.string().optional(),
  cta_text: z.string().optional(),
});

export const CreativeDirectionSchema = z.object({
  visual_style: z.string().min(1, "Vui lòng chọn phong cách thị giác"),
  emotional_tone: z.string().min(1, "Vui lòng chọn tông cảm xúc"),
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
  brand_name: z.string().min(1, "Vui lòng nhập tên thương hiệu"),
  primary_colors: z.array(z.string()).default(["#090A0F", "#3B82F6"]),
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
  marketing_context: MarketingContextSchema,
  sales_context: SalesContextSchema,
  creative_direction: CreativeDirectionSchema,
  brand_identity: BrandIdentitySchema,
  user_notes: z.string().optional(),
});

export type CreativeBriefSchemaType = z.infer<typeof CreativeBriefSchema>;
