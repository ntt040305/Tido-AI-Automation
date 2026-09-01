/**
 * Reference Asset Planner Component
 *
 * Identifies and plans required assets prior to video generation across 2 core use cases:
 * Use Case A: Video AI Reference Assets (Character, Product, Environment)
 * Use Case B: Commercial Creative Assets (Poster, Banner, Social Creative, Product Hero Image)
 */

import { Brief } from "@tido/contracts";
import { BrandDNA } from "@tido/knowledge-base";
import {
  CampaignContext,
  CampaignStrategy,
  ReferenceAssetRequirement,
} from "../interfaces/creative-director.interface";

export class ReferenceAssetPlanner {
  public planReferenceAssets(
    brief: Brief,
    context: CampaignContext,
    strategy: CampaignStrategy,
    brandDna?: BrandDNA
  ): ReferenceAssetRequirement[] {
    const assets: ReferenceAssetRequirement[] = [];
    const brandColors = brandDna?.visual_identity.primary_colors || ["#000000"];

    // -------------------------------------------------------------
    // USE CASE A: VIDEO AI REFERENCE ASSETS
    // -------------------------------------------------------------

    // 1. Character Reference
    assets.push({
      asset_id: `ref_char_${brief.project_id}_01`,
      category: "video_ai_reference",
      type: "character_reference",
      purpose: "Maintain actor facial identity and wardrobe across all video scenes",
      visual_description: `Model fitting target audience persona (${context.audience}), neatly groomed, approachable expression`,
      consistency_requirements: {
        identity_constraint: "Consistent facial features, hair style, and lighting across scenes",
        wardrobe_or_style: "Modern casual commercial attire matching brand tone",
        brand_color_match: true,
      },
    });

    // 2. Product Reference
    assets.push({
      asset_id: `ref_prod_${brief.project_id}_01`,
      category: "video_ai_reference",
      type: "product_reference",
      purpose: "Provide 3D key visual reference for product consistency",
      visual_description: `High-resolution studio render of ${brief.product_name} packaging and label`,
      consistency_requirements: {
        identity_constraint: "Exact logo placement and packaging geometry",
        brand_color_match: true,
        lighting_match: true,
      },
    });

    // 3. Environment Reference
    assets.push({
      asset_id: `ref_env_${brief.project_id}_01`,
      category: "video_ai_reference",
      type: "environment_reference",
      purpose: "Set consistent background lighting and depth for scene composition",
      visual_description: `Sleek commercial background setting suitable for ${context.industry} product display`,
      consistency_requirements: {
        wardrobe_or_style: context.brand_tone || "Modern minimalist studio",
        lighting_match: true,
      },
    });

    // -------------------------------------------------------------
    // USE CASE B: COMMERCIAL CREATIVE ASSETS
    // -------------------------------------------------------------

    // 4. Product Hero Image
    assets.push({
      asset_id: `comm_hero_${brief.project_id}_01`,
      category: "commercial_creative",
      type: "product_hero_image",
      purpose: "Hero visual centerpiece for main campaign key visual",
      visual_description: `Commercial close-up shot of ${brief.product_name} with dramatic side lighting`,
      consistency_requirements: {
        brand_color_match: true,
        lighting_match: true,
      },
    });

    // 5. Poster / Social Creative
    assets.push({
      asset_id: `comm_social_${brief.project_id}_01`,
      category: "commercial_creative",
      type: brief.target_channel === "tvc_broadcast" ? "poster" : "social_creative",
      purpose: `Promotional asset formatted for ${brief.target_channel}`,
      visual_description: `Clean commercial layout emphasizing angle: "${strategy.creative_angle}"`,
      consistency_requirements: {
        identity_constraint: "Brand primary color accent: " + brandColors[0],
        brand_color_match: true,
      },
    });

    return assets;
  }
}
