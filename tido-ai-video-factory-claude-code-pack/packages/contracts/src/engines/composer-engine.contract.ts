/**
 * Composer Engine Contract (Compatible with Remotion / FFmpeg Video Assembly)
 */

export interface ComposerEngineRequest {
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  background_color?: string;
  elements: Array<{
    type: "video" | "image" | "audio" | "text" | "watermark";
    start_time_seconds: number;
    duration_seconds: number;
    source_url: string;
    style?: Record<string, unknown>;
  }>;
  audio_mix?: {
    voice_track_url?: string;
    music_track_url?: string;
    music_volume?: number; // 0.0 to 1.0
    ducking_enabled?: boolean;
  };
}

export interface ComposerEngineResponse {
  job_id: string;
  status: "succeeded" | "failed";
  output_video_url?: string;
  render_duration_seconds?: number;
  file_size_bytes?: number;
  error?: string;
}
