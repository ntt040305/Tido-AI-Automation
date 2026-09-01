/**
 * RenderJob Contract Model — Asynchronous Worker Task Execution
 */

import { EngineType, RenderJobStatus } from "../common/enums";

export type { EngineType, RenderJobStatus };

export interface RenderJob {
  job_id: string;
  project_id: string;
  scene_id?: string;
  engine_type: EngineType;
  provider_name?: string;
  provider_job_id?: string;
  status: RenderJobStatus;
  output_asset_ids?: string[];
  error_message?: string;
  created_at: string;
  completed_at?: string;
}
