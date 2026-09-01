/**
 * Mode 2: Commercial Creative Generator Component
 *
 * Generates marketing visual assets using extensible creative_type string parameters.
 */

import { PictureEngineRequest } from "@tido/contracts";
import { BrandDNA, KnowledgeNode, TechniqueCard } from "@tido/knowledge-base";
import { ProductionScenePackage } from "@tido/creative-director";
import { CommercialCreativeOptions } from "../interfaces/picture-engine-v1-pro.interface";

export interface CommercialCreativeResult {
  creative_type: string;
  request: PictureEngineRequest;
}

export class CommercialCreativeGenerator {
  public generateCommercialCreativeRequest(
    scenePackage: ProductionScenePackage,
    options: CommercialCreativeOptions,
    nodes: KnowledgeNode[] = [],
    techniqueCards: TechniqueCard[] = [],
    brandDna?: BrandDNA
  ): CommercialCreativeResult {
    const creativeType = options.creative_type || "poster";
    const aspectRatio = options.custom_aspect_ratio || this.resolveAspectRatio(creativeType, scenePackage);

    const prompt = [
      `[COMMERCIAL CREATIVE: ${creativeType.toUpperCase()}]`,
      scenePackage.visual_direction.prompt,
      `Composition: ${scenePackage.visual_production.composition}`,
      `Lighting: ${scenePackage.visual_production.lighting}`,
      `Style: ${scenePackage.visual_production.visual_style}`,
      options.brand_accent_color ? `Primary Accent: ${options.brand_accent_color}` : "",
      "Text Overlay Safe Zones Preserved",
    ]
      .filter(Boolean)
      .join(". ");

    const request: PictureEngineRequest = {
      prompt: prompt,
      negative_prompt: [
        "cluttered canvas",
        "bad placement",
        ...scenePackage.qc_rules.must_not_have,
      ].join(", "),
      aspect_ratio: aspectRatio,
      model: "flow-nano-banana-2",
      style_modifiers: [creativeType, scenePackage.visual_production.visual_style],
    };

    return {
      creative_type: creativeType,
      request: request,
    };
  }

  private resolveAspectRatio(
    creativeType: string,
    scenePackage: ProductionScenePackage
  ): "9:16" | "16:9" | "1:1" | "4:5" {
    switch (creativeType.toLowerCase()) {
      case "banner":
      case "billboard":
        return "16:9";
      case "poster":
      case "social_creative":
      case "thumbnail":
        return "9:16";
      case "product_hero":
      case "ecommerce_visual":
      case "catalog_visual":
        return "1:1";
      default:
        return scenePackage.visual_direction.aspect_ratio || "1:1";
    }
  }
}
