/**
 * Scene Planner Component V1.1
 *
 * Upgraded Scene Planner generating complete ProductionScenePackages
 * containing execution directives for all downstream engines.
 */

import { Brief, ScenePurpose } from "@tido/contracts";
import { BrandDNA } from "@tido/knowledge-base";
import {
  CampaignContext,
  CampaignStrategy,
  ProductionScenePackage,
  ReferenceAssetRequirement,
} from "../interfaces/creative-director.interface";

export class ScenePlanner {
  public planProductionScenePackages(
    brief: Brief,
    context: CampaignContext,
    strategy: CampaignStrategy,
    referenceAssets: ReferenceAssetRequirement[] = [],
    brandDna?: BrandDNA
  ): ProductionScenePackage[] {
    const isVertical =
      brief.target_channel === "tiktok" ||
      brief.target_channel === "facebook_reels" ||
      brief.target_channel === "youtube_shorts";
    const aspectRatio: "9:16" | "16:9" = isVertical ? "9:16" : "16:9";

    const scenePurposes: ScenePurpose[] = ["hook", "problem", "solution", "hero", "cta"];

    return scenePurposes.map((purpose, index) => {
      const sceneId = `scene_${brief.project_id}_${index + 1}`;
      const scriptText = this.generateBaseScript(brief, purpose);
      const sceneDuration = purpose === "hook" ? 3 : 5;

      return {
        // Base @tido/contracts Scene Properties
        scene_id: sceneId,
        project_id: brief.project_id,
        sequence_number: index + 1,
        purpose: purpose,
        duration_seconds: sceneDuration,

        visual_direction: {
          prompt: `Commercial scene showing ${brief.product_name}, ${purpose} composition, ${context.brand_tone || "cinematic style"}`,
          aspect_ratio: aspectRatio,
          model: "flow-nano-banana-2",
        },

        voice_direction: {
          script_text: scriptText,
          language: "vi",
          emotion: purpose === "cta" ? "authoritative" : "warm",
          enable_humanization: true,
          normalize_vietnamese: true,
        },

        motion_direction: {
          camera_motion: purpose === "hook" ? "push_in" : "static",
          duration_seconds: sceneDuration,
          aspect_ratio: aspectRatio,
        },

        production_instruction: {
          resolution: isVertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
          fps: 30,
          elements: [
            {
              type: "image",
              start_time_seconds: 0,
              duration_seconds: sceneDuration,
              source_url: "",
            },
            {
              type: "audio",
              start_time_seconds: 0,
              duration_seconds: sceneDuration,
              source_url: "",
            },
          ],
        },

        // Extended ProductionScenePackage Properties (V1.1)
        creative_intent: {
          scene_purpose: purpose,
          communication_goal: this.getGoalForPurpose(purpose, brief),
          audience_emotion_target: purpose === "hook" ? "curiosity" : purpose === "cta" ? "urgency" : "trust",
          story_role: `Act ${index + 1}: ${purpose.toUpperCase()} phase of ${strategy.content_framework}`,
        },

        voice_production: {
          script_text: scriptText,
          speaker_profile: brandDna?.voice_identity.preferred_speaker_gender || "warm_female_presenter",
          emotion: purpose === "cta" ? "authoritative" : "warm",
          pacing_wpm: 150,
          pause_strategy: "Pause 300ms after key selling points",
          voice_style_direction: "Natural conversational Vietnamese narrative",
        },

        reference_assets: referenceAssets,

        visual_production: {
          camera_angle: purpose === "hook" ? "low_angle" : "eye_level",
          shot_type: purpose === "hook" ? "close_up" : purpose === "hero" ? "medium_shot" : "wide_shot",
          lighting: "3-point soft commercial key light 5600K",
          composition: "Rule of thirds with clean subject isolations",
          color_direction: brandDna?.visual_identity.brand_tone || "Vibrant high-contrast commercial palette",
          visual_style: "Premium cinematic commercial",
        },

        video_production: {
          motion_type: purpose === "hook" ? "dynamic_push_in" : "subtle_ambient_float",
          camera_movement: purpose === "hook" ? "push_in" : "static",
          acting_direction: "Natural subtle expressions focusing on product interaction",
          duration_seconds: sceneDuration,
          temporal_requirements: [
            "Maintain actor facial feature stability",
            "Prevent logo morphing",
          ],
        },

        composer_instruction: {
          subtitle_requirement: true,
          logo_placement: "top_right_safe_zone",
          music_direction: purpose === "cta" ? "upbeat_climax_finish" : "building_rhythmic_background",
          transition_guidance: "Smooth 200ms crossfade",
        },

        qc_rules: {
          must_have: [
            "Clear product brand recognition",
            "High contrast text subtitle legibility",
          ],
          must_not_have: [
            ...(brandDna?.forbidden_rules.forbidden_words || []),
            "Unstable facial morphing artifacts",
          ],
        },
      };
    });
  }

  private generateBaseScript(brief: Brief, purpose: ScenePurpose): string {
    switch (purpose) {
      case "hook":
        return `Bạn có đang gặp khó khăn khi lựa chọn ${brief.product_name}?`;
      case "problem":
        return `Nhiều giải pháp thông thường chưa mang lại hiệu quả như mong đợi cho ${brief.target_audience}.`;
      case "solution":
        return `Giải pháp đột phá chính là ${brief.product_name} với ${brief.key_selling_points[0] || "tính năng ưu việt"}.`;
      case "hero":
        return `Cảm nhận sự thay đổi rõ rệt cùng ${brief.product_name} ngay hôm nay.`;
      case "cta":
        return `Khám phá ngay ${brief.product_name} để nhận ưu đãi đặc biệt dành cho ${brief.target_audience}!`;
      default:
        return `Trải nghiệm ${brief.product_name}.`;
    }
  }

  private getGoalForPurpose(purpose: ScenePurpose, brief: Brief): string {
    switch (purpose) {
      case "hook":
        return "Capture viewer attention within the first 3 seconds";
      case "problem":
        return `Highlight core problem faced by ${brief.target_audience}`;
      case "solution":
        return `Introduce ${brief.product_name} as the ultimate solution`;
      case "hero":
        return "Showcase product in high-quality hero action";
      case "cta":
        return "Drive immediate conversion and call to action";
      default:
        return "Engage target audience";
    }
  }
}
