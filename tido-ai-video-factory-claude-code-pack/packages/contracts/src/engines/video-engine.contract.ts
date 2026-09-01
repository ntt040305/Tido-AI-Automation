/**
 * Video Engine Contract (Compatible with Video Provider Routers like Runway / Kling / CogVideo)
 */

export interface VideoEngineRequest {
  prompt?: string;
  source_image_url?: string;
  camera_motion?: "static" | "pan_right" | "tilt_up" | "push_in" | "orbit" | "whip_pan";
  motion_strength?: number; // 1 to 10
  duration_seconds: number; // e.g. 3, 5, 10
  fps?: number; // 24, 30, 60
  aspect_ratio: "9:16" | "16:9" | "1:1";
  provider?: "runway" | "kling" | "pika" | "cogvideo" | "mock";
}

export interface VideoEngineResponse {
  job_id: string;
  status: "succeeded" | "failed";
  output_video_url?: string;
  duration_seconds?: number;
  error?: string;
}
