/**
 * The shape of the database, in TypeScript.
 *
 * Hand-written rather than generated, for now. Generated types need a live
 * project to introspect, and this schema has to be reviewable before anyone
 * points it at one. When `supabase gen types` runs in CI, this file is what it
 * replaces -- the names below match the SQL exactly so that swap is mechanical.
 *
 * It lives in the shared package because the application reads these rows and
 * the infrastructure writes them. Putting the row shapes on the far side of
 * the infrastructure boundary would mean the application could not name what
 * it was handed without importing a database driver.
 */

import type { OrgPlan, MemberRole, PipelineId } from "../constants/roles";

export interface UserProfile {
  id: string;
  /** The single Firebase identifier in the whole schema. */
  firebase_uid: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  plan: OrgPlan;
  /** Created automatically with an account; the interface hides team UI for these. */
  is_personal: boolean;
  created_at: string;
}

export interface WorkspaceMember {
  org_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  created_by: string | null;
  name: string;
  /** Brand name, palette, standing rules. Shape deliberately open. */
  brand_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreativeRun {
  /** The engine's own generation id, reused as the primary key. */
  id: string;
  /**
   * Null for an anonymous render.
   *
   * Nullable on purpose in both the type and the SQL: this product renders for
   * signed-out visitors, and making ownership mandatory would turn anonymous
   * generation into a constraint violation.
   */
  org_id: string | null;
  project_id: string | null;
  user_id: string | null;

  concept: string | null;
  asset_type: string | null;
  aspect_ratio: string | null;

  pipeline: PipelineId;
  pipeline_version: string | null;
  /** Which flags were on. Without this an output cannot be attributed. */
  features_enabled: string[];

  status: string;
  success: boolean;
  duration_ms: number | null;
  error_code: string | null;

  /** Storage key. Bytes are never in a row. */
  image_path: string | null;
  /** Set when the vision loop produced this as a correction of another run. */
  parent_run_id: string | null;

  created_at: string;
}

/** What a caller supplies when recording a run. */
export type CreativeRunInput = Omit<CreativeRun, "created_at" | "features_enabled"> & {
  features_enabled?: string[];
};

export interface Database {
  public: {
    Tables: {
      user_profiles: { Row: UserProfile };
      organizations: { Row: Organization };
      workspace_members: { Row: WorkspaceMember };
      projects: { Row: Project };
      creative_runs: { Row: CreativeRun };
    };
  };
}
