/**
 * Scene Contract Model — Unified Engine Directives (8-Second Core Unit)
 */

import { ScenePurpose } from "../common/enums";
import { PictureEngineRequest } from "../engines/picture-engine.contract";
import { VoiceEngineRequest } from "../engines/voice-engine.contract";
import { VideoEngineRequest } from "../engines/video-engine.contract";
import { ComposerEngineRequest } from "../engines/composer-engine.contract";

export type { ScenePurpose };

export type SceneStatus =
  | "pending"
  | "script_approved"
  | "image_approved"
  | "video_rendering"
  | "completed"
  | "failed";

export interface SceneReferenceAsset {
  asset_id: string;
  role: "first_frame" | "product_hero" | "character_identity" | "style_reference";
}

export interface Scene {
  scene_id: string;
  project_id: string;
  sequence_number: number;
  version: number;
  parent_scene_id?: string;
  version_notes?: string;
  purpose: ScenePurpose;
  duration: 8; // Strictly 8 seconds per Layer 1 spec

  /** Visual directive passed to Picture Engine */
  visual_direction: PictureEngineRequest;

  /** Audio/Voice directive passed to Voice Engine */
  voice_direction: VoiceEngineRequest;

  /** Motion directive passed to Video Engine */
  motion_direction: VideoEngineRequest;

  /** Post-production instruction passed to Composer Engine */
  production_instruction?: ComposerEngineRequest;

  /** Reference assets bound to this scene */
  reference_assets?: SceneReferenceAsset[];

  /** Status of the scene production workflow */
  status: SceneStatus;

  /** Optional knowledge integration references */
  technique_card_ids?: string[];
  knowledge_node_ids?: string[];
}
