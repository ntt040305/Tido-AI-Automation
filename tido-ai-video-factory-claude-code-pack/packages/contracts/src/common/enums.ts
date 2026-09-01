/**
 * TIDO Creative OS Layer 1 Common Enums
 */

export type ProjectType = "voice" | "image" | "video";

export type EngineType = "picture" | "voice" | "video" | "composer";

export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export type ScenePurpose =
  | "hook"
  | "problem"
  | "solution"
  | "hero"
  | "proof"
  | "cta";

export type ProjectStatus = "pending" | "processing" | "completed" | "failed";

export type RenderJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AssetCategory = "input" | "generated";

export type AssetType =
  | "character_image"
  | "product_image"
  | "logo_image"
  | "style_reference"
  | "voice_sample"
  | "commercial_image"
  | "voice_audio"
  | "scene_video"
  | "final_video"
  | "music_track"
  | "sfx_audio";

export type AssetStatus = "pending" | "ready" | "failed" | "expired";
