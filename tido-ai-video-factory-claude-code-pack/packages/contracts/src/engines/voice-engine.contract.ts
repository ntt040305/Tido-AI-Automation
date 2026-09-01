/**
 * Voice Engine Contract (Compatible with F5-TTS Vietnamese Core)
 */

export interface VoiceEngineRequest {
  script_text: string;
  speaker_id?: string;
  reference_audio_url?: string;
  language: "vi" | "en";
  speed_factor?: number; // e.g. 1.0
  emotion?: "neutral" | "excited" | "warm" | "authoritative" | "sad";
  pause_duration_ms?: number;
  enable_humanization?: boolean;
  normalize_vietnamese?: boolean;
}

export interface VoiceEngineResponse {
  job_id: string;
  status: "succeeded" | "failed";
  output_audio_url?: string;
  duration_seconds?: number;
  auto_qc_score?: number;
  error?: string;
}
