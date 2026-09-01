/**
 * Video Engine Integration Adapter
 *
 * Translates retrieved Knowledge Nodes and Technique Cards into motion
 * and camera control directives for Video Provider Routers (Runway / Kling / CogVideo).
 */

import { KnowledgeNode, TechniqueCard } from "../types";

export interface VideoEngineDirectivePayload {
  camera_motion_type: string;
  motion_speed: "slow" | "normal" | "fast";
  fps_target: number;
  temporal_stability_hints: string[];
  provider_motion_bucket?: number;
}

export class VideoEngineKnowledgeAdapter {
  public compileVideoDirectives(
    nodes: KnowledgeNode[],
    techniqueCards: TechniqueCard[]
  ): VideoEngineDirectivePayload {
    let cameraMotion = "static";
    const stabilityHints: string[] = [];

    for (const card of techniqueCards) {
      if (card.camera_setup?.motion_profile) {
        cameraMotion = card.camera_setup.motion_profile;
      }
      if (card.provider_hints?.video_provider_motion) {
        stabilityHints.push(card.provider_hints.video_provider_motion);
      }
    }

    for (const node of nodes) {
      if (node.domain === "cinematography") {
        stabilityHints.push(...node.payload.core_directives);
      }
    }

    return {
      camera_motion_type: cameraMotion,
      motion_speed: "normal",
      fps_target: 30,
      temporal_stability_hints: Array.from(new Set(stabilityHints)),
    };
  }
}
