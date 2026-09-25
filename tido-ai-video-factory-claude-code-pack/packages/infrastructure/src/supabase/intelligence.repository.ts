import { getDb, unavailable, failed } from "./client";
import { isMember } from "./identity.repository";
import type {
  DbResult,
  Actor,
  IntelligenceDocument,
  CreativeRequest,
  CreativeIntelligenceRow,
  CreativeBlueprintRow,
  DesignDecisionRow,
  RenderIterationRow,
  VisionReviewRow,
  PersistIntelligenceInput,
  PersistIntelligenceResult,
  IntelligenceRepository,
} from "@tido/shared";

/**
 * Where the reasoning goes.
 *
 * Every write here is about work the server just finished, so nothing takes an
 * `Actor`. Reads do, because reads are a client asking a question.
 *
 * Partial success is the expected case, not an error
 * ---------------------------------------------------
 * A stable render produces intelligence and no blueprint. An experiment render
 * with the vision loop off produces a blueprint and no reviews. `persist`
 * therefore writes what it was given and reports what landed, rather than
 * treating an absent section as a failure. The alternative -- requiring all
 * six -- would mean either refusing to record most renders or inventing empty
 * rows, and an empty row is a claim that the render produced nothing, which is
 * different from not being asked.
 *
 * Why upsert rather than insert
 * ------------------------------
 * The same run can be persisted twice: a retry above this layer, a second pass
 * after a correction render. Upserting on `run_id` makes that idempotent
 * instead of a primary key violation that would lose the newer reasoning.
 */

const doc = (v: unknown): IntelligenceDocument | null =>
  v && typeof v === "object" ? (v as IntelligenceDocument) : null;

async function recordRequest(
  input: Parameters<IntelligenceRepository["recordRequest"]>[0],
): Promise<DbResult<CreativeRequest>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const res = await db
      .from("creative_requests")
      .insert({
        org_id: input.orgId ?? null,
        project_id: input.projectId ?? null,
        user_id: input.userId ?? null,
        // Truncated rather than rejected. An over-long brief is a reason to
        // store less of it, never a reason to lose the record entirely.
        brief: input.brief ? String(input.brief).slice(0, 8000) : null,
        asset_type: input.assetType ?? null,
        aspect_ratio: input.aspectRatio ?? null,
        assets: input.assets ?? [],
        goals: input.goals ?? {},
      })
      .select("*")
      .single();

    if (res.error) return failed(res.error);
    return { ok: true, data: res.data as CreativeRequest };
  } catch (e) {
    return failed(e);
  }
}

async function persist(
  input: PersistIntelligenceInput,
): Promise<DbResult<PersistIntelligenceResult>> {
  const db = await getDb();
  if (!db) return unavailable();
  if (!input?.runId) return { ok: false, error: "a run id is required" };

  const result: PersistIntelligenceResult = {
    intelligence: false,
    blueprint: false,
    decisions: 0,
    iterations: 0,
    reviews: 0,
  };

  try {
    // Link the run to its request, when there is one. Done first so a later
    // failure still leaves the association recorded.
    if (input.requestId) {
      await db.from("creative_runs").update({ request_id: input.requestId }).eq("id", input.runId);
    }

    const hasIntelligence =
      input.intelligence || input.strategy || input.prompt || input.selectedDirection;
    if (hasIntelligence) {
      const r = await db.from("creative_intelligence").upsert(
        {
          run_id: input.runId,
          selected_direction: input.selectedDirection ?? null,
          strategy: doc(input.strategy),
          intelligence: doc(input.intelligence),
          prompt: input.prompt ?? null,
        },
        { onConflict: "run_id" },
      );
      if (r.error) return failed(r.error);
      result.intelligence = true;
    }

    const hasBlueprint =
      input.blueprint || input.typography || input.layout || input.composition || input.assetDna || input.designDocument;
    if (hasBlueprint) {
      const r = await db.from("creative_blueprints").upsert(
        {
          run_id: input.runId,
          blueprint: doc(input.blueprint),
          typography: doc(input.typography),
          layout: doc(input.layout),
          composition: doc(input.composition),
          asset_dna: doc(input.assetDna),
          design_document: doc(input.designDocument),
          grounded_score: input.groundedScore ?? null,
          missing_count: input.missingCount ?? null,
        },
        { onConflict: "run_id" },
      );
      if (r.error) return failed(r.error);
      result.blueprint = true;
    }

    // Children are replaced rather than appended. Persisting the same run
    // twice should leave one set of decisions, not two — and a duplicated
    // decision would double-count in exactly the aggregate this table exists
    // to make possible.
    if (input.decisions?.length) {
      await db.from("design_decisions").delete().eq("run_id", input.runId);
      const rows = input.decisions.map((d) => ({ ...d, run_id: input.runId }));
      const r = await db.from("design_decisions").insert(rows);
      if (r.error) return failed(r.error);
      result.decisions = rows.length;
    }

    if (input.iterations?.length) {
      await db.from("render_iterations").delete().eq("run_id", input.runId);
      const rows = input.iterations.map((i) => ({ ...i, run_id: input.runId }));
      const r = await db.from("render_iterations").insert(rows);
      if (r.error) return failed(r.error);
      result.iterations = rows.length;
    }

    if (input.reviews?.length) {
      await db.from("vision_reviews").delete().eq("run_id", input.runId);
      const rows = input.reviews.map((v) => ({ ...v, run_id: input.runId }));
      const r = await db.from("vision_reviews").insert(rows);
      if (r.error) return failed(r.error);
      result.reviews = rows.length;
    }

    return { ok: true, data: result };
  } catch (e) {
    return failed(e);
  }
}

async function persistSafely(input: PersistIntelligenceInput): Promise<void> {
  try {
    const r = await persist(input);
    if (!r.ok && !r.unavailable) {
      // Counts only. The reasoning describes the customer's product and copy
      // and never belongs in a log line.
      console.warn("[DB] intelligence not persisted:", r.error);
    }
  } catch (e) {
    console.warn("[DB] intelligence not persisted:", e instanceof Error ? e.message : String(e));
  }
}

async function getForRun(actor: Actor, runId: string) {
  const db = await getDb();
  if (!db) return unavailable<never>();

  try {
    // Authorise against the run first, exactly as the projects repository
    // does: the child rows carry no ownership of their own, so asking them
    // would be asking the wrong table.
    const run = await db
      .from("creative_runs")
      .select("id, org_id, user_id")
      .eq("id", runId)
      .maybeSingle();
    if (run.error) return failed<never>(run.error);
    if (!run.data) return { ok: false as const, error: "run not found" };

    const r = run.data as { org_id: string | null; user_id: string | null };
    const mine = r.user_id !== null && r.user_id === actor.profile.id;
    const ours = r.org_id !== null && isMember(actor, r.org_id);
    // Same message as a genuine miss, so this cannot be used to discover
    // which run ids exist.
    if (!mine && !ours) return { ok: false as const, error: "run not found" };

    const [intelligence, blueprint, decisions, iterations, reviews] = await Promise.all([
      db.from("creative_intelligence").select("*").eq("run_id", runId).maybeSingle(),
      db.from("creative_blueprints").select("*").eq("run_id", runId).maybeSingle(),
      db.from("design_decisions").select("*").eq("run_id", runId).order("id"),
      db.from("render_iterations").select("*").eq("run_id", runId).order("version"),
      db.from("vision_reviews").select("*").eq("run_id", runId).order("version"),
    ]);

    return {
      ok: true as const,
      data: {
        intelligence: (intelligence.data as CreativeIntelligenceRow) ?? null,
        blueprint: (blueprint.data as CreativeBlueprintRow) ?? null,
        decisions: (decisions.data as DesignDecisionRow[]) ?? [],
        iterations: (iterations.data as RenderIterationRow[]) ?? [],
        reviews: (reviews.data as VisionReviewRow[]) ?? [],
      },
    };
  } catch (e) {
    return failed<never>(e);
  }
}

export const intelligenceRepository: IntelligenceRepository = {
  recordRequest,
  persist,
  persistSafely,
  getForRun: getForRun as IntelligenceRepository["getForRun"],
};
