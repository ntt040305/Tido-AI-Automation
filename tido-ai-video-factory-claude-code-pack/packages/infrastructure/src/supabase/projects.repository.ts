import { getDb, unavailable, failed } from "./client";
import type { DbResult, Project, Actor, ProjectRepository } from "@tido/shared";
import { canWrite, isMember } from "./identity.repository";

/**
 * Projects.
 *
 * Every function takes an `Actor` and checks membership before it touches a
 * row. That check is not a duplicate of the RLS policies in 0002 -- it is the
 * one that actually runs, because this code reaches Postgres with the service
 * role key and RLS does not apply to it.
 *
 * The ordering matters and is the same everywhere: authorise, then query.
 * Filtering by `org_id` after the fact would still return the right rows, but
 * it hides the authorisation decision inside a where clause where the next
 * person to edit the query can drop it without noticing.
 */

export async function listProjects(actor: Actor, orgId: string): Promise<DbResult<Project[]>> {
  if (!isMember(actor, orgId)) {
    return { ok: false, error: "not a member of this workspace" };
  }
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const res = await db
      .from("projects")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false });
    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data || []) as Project[] };
  } catch (e) {
    return failed(e);
  }
}

/**
 * Fetches one project.
 *
 * Reads the row first and authorises against the org it actually belongs to,
 * rather than trusting an org id from the caller. Passing both and comparing
 * them would let a caller who knows a project id test membership of an org by
 * varying the other argument.
 */
export async function getProject(actor: Actor, projectId: string): Promise<DbResult<Project>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const res = await db.from("projects").select("*").eq("id", projectId).maybeSingle();
    if (res.error) return failed(res.error);
    if (!res.data) return { ok: false, error: "project not found" };

    const project = res.data as Project;
    if (!isMember(actor, project.org_id)) {
      // Deliberately the same message as a genuine miss. Distinguishing them
      // turns this into a way to discover which project ids exist.
      return { ok: false, error: "project not found" };
    }
    return { ok: true, data: project };
  } catch (e) {
    return failed(e);
  }
}

export interface CreateProjectInput {
  orgId: string;
  name: string;
  brandContext?: Record<string, unknown>;
}

export async function createProject(
  actor: Actor,
  input: CreateProjectInput,
): Promise<DbResult<Project>> {
  if (!canWrite(actor, input.orgId)) {
    return { ok: false, error: "insufficient permission to create a project here" };
  }
  const name = String(input.name || "").trim();
  if (!name) return { ok: false, error: "a project needs a name" };

  const db = await getDb();
  if (!db) return unavailable();

  try {
    const res = await db
      .from("projects")
      .insert({
        org_id: input.orgId,
        created_by: actor.profile.id,
        name,
        brand_context: input.brandContext ?? {},
      })
      .select("*")
      .single();
    if (res.error) return failed(res.error);
    return { ok: true, data: res.data as Project };
  } catch (e) {
    return failed(e);
  }
}

export async function updateProject(
  actor: Actor,
  projectId: string,
  changes: { name?: string; brandContext?: Record<string, unknown> },
): Promise<DbResult<Project>> {
  const existing = await getProject(actor, projectId);
  if (!existing.ok) return existing;
  if (!canWrite(actor, existing.data.org_id)) {
    return { ok: false, error: "insufficient permission to change this project" };
  }

  const patch: Record<string, unknown> = {};
  if (typeof changes.name === "string" && changes.name.trim()) patch.name = changes.name.trim();
  if (changes.brandContext) patch.brand_context = changes.brandContext;
  if (Object.keys(patch).length === 0) return { ok: true, data: existing.data };

  const db = await getDb();
  if (!db) return unavailable();

  try {
    // `org_id` is never in the patch. Moving a project between workspaces is a
    // transfer with its own authorisation question on both sides, not an edit.
    const res = await db
      .from("projects")
      .update(patch)
      .eq("id", projectId)
      .select("*")
      .single();
    if (res.error) return failed(res.error);
    return { ok: true, data: res.data as Project };
  } catch (e) {
    return failed(e);
  }
}
