export type ProductionProfileId =
  | "SHORT_VERTICAL_9_16_V1"
  | "TVC_HORIZONTAL_16_9_V1";

export type ProjectStatus =
  | "DRAFT"
  | "AWAITING_BRIEF_CONFIRMATION"
  | "CLAUDE_CREATING"
  | "AWAITING_CREATIVE_APPROVAL"
  | "PRODUCTION_PLANNING"
  | "AUTOMATED_PRODUCTION"
  | "FINAL_QC"
  | "COMPLETED"
  | "NEEDS_USER_FIX"
  | "MANUAL_REVIEW"
  | "FAILED"
  | "CANCELLED";

export type SceneImportance = "standard" | "important" | "hero" | "hook";

export interface VersionRef {
  id: string;
  version: number;
}

export interface ProjectRef {
  projectId: string;
  profileId: ProductionProfileId;
  status: ProjectStatus;
  currentBrief?: VersionRef;
  currentScript?: VersionRef;
  currentOutput?: VersionRef;
}
