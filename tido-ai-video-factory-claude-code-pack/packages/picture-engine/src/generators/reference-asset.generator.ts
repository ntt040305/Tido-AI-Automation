/**
 * Mode 1: Reference Asset Generator Component
 *
 * Generates AI Reference Assets for downstream AI Video Generation.
 */

import { PictureEngineRequest } from "@tido/contracts";
import { BrandDNA, KnowledgeNode, TechniqueCard } from "@tido/knowledge-base";
import { ProductionScenePackage } from "@tido/creative-director";
import { ReferenceAssetMetadata } from "../interfaces/picture-engine-v1-pro.interface";

export interface ReferenceAssetGenerationResult {
  metadata: ReferenceAssetMetadata;
  requests: PictureEngineRequest[];
}

export class ReferenceAssetGenerator {
  public generateReferenceAssetRequests(
    scenePackage: ProductionScenePackage,
    type: "character_reference" | "product_reference" | "environment_reference",
    nodes: KnowledgeNode[] = [],
    techniqueCards: TechniqueCard[] = [],
    brandDna?: BrandDNA
  ): ReferenceAssetGenerationResult {
    const assetId = `ref_${type}_${scenePackage.scene_id}`;

    if (type === "character_reference") {
      return this.buildCharacterReference(scenePackage, assetId, brandDna);
    } else if (type === "product_reference") {
      return this.buildProductReference(scenePackage, assetId, brandDna);
    } else {
      return this.buildEnvironmentReference(scenePackage, assetId, brandDna);
    }
  }

  private buildCharacterReference(
    scenePackage: ProductionScenePackage,
    assetId: string,
    brandDna?: BrandDNA
  ): ReferenceAssetGenerationResult {
    const metadata: ReferenceAssetMetadata = {
      asset_id: assetId,
      category: "video_ai_reference",
      type: "character_reference",
      identity_lock: {
        face_lock: true,
        feature_fingerprint: `char_feat_${scenePackage.project_id}`,
      },
      camera_views: ["front", "side_45", "close_up_detail"],
      video_usage_purpose: "character_face_swap",
      consistency_requirements: {
        lighting_lock: true,
        color_lock: true,
        material_texture_lock: true,
      },
    };

    const views = ["front view neutral lighting", "side 45 degree angle portrait", "close-up detail facial feature studio shot"];

    const requests: PictureEngineRequest[] = views.map((viewPrompt) => ({
      prompt: `[CHARACTER REFERENCE] ${scenePackage.visual_production.visual_style} model, ${viewPrompt}, facial identity consistency, clean grey background`,
      negative_prompt: "deformed face, unnatural skin texture, changing features",
      aspect_ratio: "1:1",
      model: "flow-nano-banana-2",
    }));

    return { metadata, requests };
  }

  private buildProductReference(
    scenePackage: ProductionScenePackage,
    assetId: string,
    brandDna?: BrandDNA
  ): ReferenceAssetGenerationResult {
    const metadata: ReferenceAssetMetadata = {
      asset_id: assetId,
      category: "video_ai_reference",
      type: "product_reference",
      identity_lock: {
        product_shape_lock: true,
        label_lock: true,
        feature_fingerprint: `prod_feat_${scenePackage.project_id}`,
      },
      camera_views: ["front", "side_45", "close_up_detail"],
      video_usage_purpose: "product_3d_keyframe",
      consistency_requirements: {
        lighting_lock: true,
        color_lock: true,
        material_texture_lock: true,
      },
    };

    const requests: PictureEngineRequest[] = [
      {
        prompt: `[PRODUCT REFERENCE] High resolution 3D studio render of ${scenePackage.visual_direction.prompt}, exact product shape lock, label lock, neutral grey background`,
        negative_prompt: "warped packaging, distorted logo, altered text",
        aspect_ratio: "1:1",
        model: "flow-nano-banana-2",
      },
    ];

    return { metadata, requests };
  }

  private buildEnvironmentReference(
    scenePackage: ProductionScenePackage,
    assetId: string,
    brandDna?: BrandDNA
  ): ReferenceAssetGenerationResult {
    const metadata: ReferenceAssetMetadata = {
      asset_id: assetId,
      category: "video_ai_reference",
      type: "environment_reference",
      identity_lock: {
        feature_fingerprint: `env_feat_${scenePackage.project_id}`,
      },
      camera_views: ["environment_backdrop"],
      video_usage_purpose: "background_motion_tracking",
      consistency_requirements: {
        lighting_lock: true,
        color_lock: true,
        material_texture_lock: true,
      },
    };

    const requests: PictureEngineRequest[] = [
      {
        prompt: `[ENVIRONMENT REFERENCE] Clean commercial studio environment background, ${scenePackage.visual_production.lighting}, depth of field, static camera perspective`,
        negative_prompt: "cluttered, intrusive objects, harsh shadows",
        aspect_ratio: scenePackage.visual_direction.aspect_ratio,
        model: "flow-nano-banana-2",
      },
    ];

    return { metadata, requests };
  }
}
