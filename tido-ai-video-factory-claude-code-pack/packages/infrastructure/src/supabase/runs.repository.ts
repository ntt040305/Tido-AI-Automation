import { getDb, unavailable, failed } from "./client";
import type { DbResult, CreativeRun, Actor, RecordRunInput, RunRepository } from "@tido/shared";
import { isMember } from "./identity.repository";

/**
 * Creative runs.
 *
 * This repository has an unusual shape for a reason: **recording a run must
 * never be able to fail a render.**
 *
 * By the time anything here is called the picture already exists and the user
 * is waiting for it. A database that is slow, full, misconfigured or simply
 * not set up yet is a problem for analytics and a non-problem for the person
 * who asked for a poster. So `recordRun` swallows everything and returns a
 * value, and the route ignores it. The same rule the vision review already
 * follows: a commentary on a picture is never worth the picture.
 *
 * The writes are also deliberately unauthorised. A run is recorded by the
 * server about work it just did, not by a client claiming something happened,
 * which is why `recordRun` takes no Actor -- there is nobody to check. Reads
 * are a different matter and take one.
 */


/**
 * Records one generation.
 *
 * Returns whether it was written. The caller is expected to ignore that and
 * carry on; it exists so tests can assert the write happened, not so routes
 * can branch on it.
 */
export async function recordRun(input: RecordRunInput): Promise<DbResult<CreativeRun>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const res = await db
      .from("creative_runs")
      .insert({
        id: input.id,
        engine_generation_id: input.engineGenerationId ?? null,
        org_id: input.orgId ?? null,
        project_id: input.projectId ?? null,
        user_id: input.userId ?? null,
        // Truncated rather than rejected. An over-long brief is a reason to
        // store less of it, never a reason to lose the whole record of a
        // render that succeeded.
        concept: input.concept ? String(input.concept).slice(0, 8000) : null,
        asset_type: input.assetType ?? null,
        aspect_ratio: input.aspectRatio ?? null,
        pipeline: input.pipeline,
        pipeline_version: input.pipelineVersion ?? null,
        features_enabled: input.featuresEnabled ?? [],
        status: input.status,
        success: input.success,
        duration_ms: input.durationMs ?? null,
        error_code: input.errorCode ?? null,
        image_path: input.imagePath ?? null,
        parent_run_id: input.parentRunId ?? null,
      })
      .select("*")
      .single();

    if (res.error) return failed(res.error);
    return { ok: true, data: res.data as CreativeRun };
  } catch (e) {
    return failed(e);
  }
}

/**
 * Records a run and guarantees it cannot throw.
 *
 * The function routes actually call. `recordRun` already returns failures as
 * values, but a caller on the render path should not have to know or care --
 * this makes "fire and forget" the shape of the API rather than a discipline
 * every call site has to remember.
 */
export async function recordRunSafely(input: RecordRunInput): Promise<void> {
  try {
    const result = await recordRun(input);
    if (!result.ok && !result.unavailable) {
      console.warn("[DB] run not recorded:", result.error);
    }
  } catch (e: any) {
    console.warn("[DB] run not recorded:", e?.message || String(e));
  }
}

export async function listRunsForOrg(
  actor: Actor,
  orgId: string,
  limit = 50,
): Promise<DbResult<CreativeRun[]>> {
  if (!isMember(actor, orgId)) {
    return { ok: false, error: "not a member of this workspace" };
  }
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const res = await db
      .from("creative_runs")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));
    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data || []) as CreativeRun[] };
  } catch (e) {
    return failed(e);
  }
}

/**
 * One run, if this actor may see it.
 *
 * Visible when it belongs to an org they are in, or when it is theirs. An
 * anonymous run -- no org, no user -- matches neither and is invisible to
 * everyone. That is correct rather than a gap: nobody owns it, so nobody gets
 * to claim it by signing in afterwards.
 */
export async function getRun(actor: Actor, runId: string): Promise<DbResult<CreativeRun>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const res = await db.from("creative_runs").select("*").eq("id", runId).maybeSingle();
    if (res.error) return failed(res.error);
    if (!res.data) return { ok: false, error: "run not found" };

    const run = res.data as CreativeRun;
    const mine = run.user_id !== null && run.user_id === actor.profile.id;
    const ours = run.org_id !== null && isMember(actor, run.org_id);
    if (!mine && !ours) return { ok: false, error: "run not found" };

    return { ok: true, data: run };
  } catch (e) {
    return failed(e);
  }
}
