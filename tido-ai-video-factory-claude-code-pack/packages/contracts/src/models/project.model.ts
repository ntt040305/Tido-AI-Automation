/**
 * CreativeProject / GenerationProject Backward Compatibility Export
 */

import { GenerationProject, GenerationProjectInput } from "./generation-project.model";
import { ProjectStatus } from "../common/enums";

export type { ProjectStatus };

export type CreativeProject = GenerationProject;

export interface LegacyProject {
  project_id: string;
  tenant_id?: string;
  title: string;
  status: ProjectStatus;
  brief_id?: string;
  campaign_id?: string;
  scene_ids: string[];
  asset_ids?: string[];
  created_at: string;
  updated_at?: string;
}
