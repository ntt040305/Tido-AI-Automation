import { getDb, unavailable, failed } from "./client";
import type {
  DbResult,
  Actor,
  ConceptInput,
  CreativeConceptRow,
  CreativePatternRow,
  CreativeMemoryRepository,
  LearnPatternsResult,
  ObservedPattern,
  PatternDimension,
  PatternQuery,
  RecordConceptsResult,
  SimilarPattern,
} from "@tido/shared";
import { PATTERN_DIMENSIONS } from "@tido/shared";

/**
 * What keeps working, and what each brief could have been.
 *
 * Phase 3.3 and Phase 4. Neither adds intelligence: `CreativeDirectorV1`
 * already reasons about routes and already says why it turned one down, and the
 * patterns below are counted from rows this database already holds. This is
 * where both stop being discarded.
 *
 * THE COUNTERS ARE THE POINT
 * ---------------------------
 * `support_count` and `approved_count` are what let a caller tell a pattern
 * worth following from a coincidence, and they are only trustworthy if a single
 * render can contribute at most one of each. So learning is idempotent per run:
 * `evidence_runs` records which runs have already been counted, and a run
 * already in that list reinforces nothing.
 *
 * Without that, re-running extraction over history -- which the whole design
 * encourages, because it is how the rules stay revisable -- would multiply every
 * count by the number of times it had been run.
 */

const MAX_EVIDENCE = 50;

/** Every `creative_patterns` column a listing needs -- all but `embedding`. */
// One literal, not a concatenation: supabase-js parses the select string at the
// type level, and a `string` built with `+` types every row as an error.
const PATTERN_LIST_COLUMNS =
  "id, org_id, user_id, dimension, value, value_key, support_count, approved_count, problem_count, evidence_runs, approved_runs, rejected_count, rejected_runs, embedding_model, source_text, first_seen_at, last_seen_at";

function toVectorLiteral(values: number[] | undefined): string | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  for (const v of values) if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return `[${values.join(",")}]`;
}

/** Where a pattern belongs: a workspace when there is one, a person otherwise. */
function ownerOf(actor: Actor, orgId?: string | null) {
  const org = orgId ?? actor.memberships[0]?.org_id ?? null;
  return org ? { org_id: org, user_id: null } : { org_id: null, user_id: actor.profile.id };
}

async function learnPatterns(
  actor: Actor,
  observations: ObservedPattern[],
  orgId?: string | null,
): Promise<DbResult<LearnPatternsResult>> {
  const db = await getDb();
  if (!db) return unavailable();

  const result: LearnPatternsResult = { created: 0, reinforced: 0, skipped: 0 };
  if (!Array.isArray(observations) || !observations.length) return { ok: true, data: result };

  const owner = ownerOf(actor, orgId);

  // Collapse duplicates within one batch first. One render naming the same
  // direction twice is one observation, not two, and counting it twice would
  // let a single run clear a threshold meant to need three.
  const byKey = new Map<string, ObservedPattern>();
  for (const o of observations) {
    const value = String(o?.value || "").trim();
    if (!value || value.length > 300) {
      result.skipped++;
      continue;
    }
    if (!PATTERN_DIMENSIONS.includes(o.dimension)) {
      result.skipped++;
      continue;
    }
    if (!o.runId) {
      result.skipped++;
      continue;
    }
    const key = `${o.dimension}|${value.toLowerCase()}|${o.runId}`;
    if (byKey.has(key)) continue;
    byKey.set(key, { ...o, value });
  }
  if (!byKey.size) return { ok: true, data: result };

  try {
    const wanted = [...byKey.values()];
    const query = db.from("creative_patterns").select(PATTERN_LIST_COLUMNS);
    const existing = owner.org_id
      ? await query.eq("org_id", owner.org_id)
      : await query.eq("user_id", owner.user_id!);

    if (existing.error) return failed(existing.error);

    const held = new Map<string, CreativePatternRow>();
    for (const row of (existing.data || []) as CreativePatternRow[]) {
      held.set(`${row.dimension}|${row.value_key}`, row);
    }

    const now = new Date().toISOString();
    const fresh: Record<string, unknown>[] = [];

    for (const o of wanted) {
      const key = `${o.dimension}|${o.value.toLowerCase()}`;
      const current = held.get(key);

      if (!current) {
        fresh.push({
          ...owner,
          dimension: o.dimension,
          value: o.value,
          support_count: 1,
          approved_count: o.approved ? 1 : 0,
          problem_count: Math.max(0, Math.trunc(o.problems || 0)),
          evidence_runs: [o.runId],
          first_seen_at: now,
          last_seen_at: now,
        });
        continue;
      }

      // Already counted this run. Re-running extraction over history must not
      // multiply the evidence -- which is what makes the rules revisable.
      const seen: string[] = Array.isArray(current.evidence_runs) ? current.evidence_runs : [];
      if (seen.includes(o.runId)) {
        result.skipped++;
        continue;
      }

      const updated = await db
        .from("creative_patterns")
        .update({
          support_count: current.support_count + 1,
          approved_count: current.approved_count + (o.approved ? 1 : 0),
          problem_count: current.problem_count + Math.max(0, Math.trunc(o.problems || 0)),
          // Capped, newest kept. The list is for tracing a claim back to the
          // work, not for being complete; an unbounded array on a hot row is a
          // different problem from the one it solves.
          evidence_runs: [o.runId, ...seen].slice(0, MAX_EVIDENCE),
          last_seen_at: now,
        })
        .eq("id", current.id);

      if (updated.error) return failed(updated.error);
      result.reinforced++;
    }

    if (fresh.length) {
      const created = await db.from("creative_patterns").insert(fresh);
      if (created.error) {
        // Two extractions racing. The other write created the same row, so the
        // pattern exists; only one increment is lost, and a counter is not
        // evidence.
        if ((created.error as { code?: string }).code !== "23505") return failed(created.error);
      } else {
        result.created = fresh.length;
      }
    }

    return { ok: true, data: result };
  } catch (e) {
    return failed(e);
  }
}

/** Attaches a vector to a pattern already learned. */
async function embedPattern(
  actor: Actor,
  patternId: number,
  sourceText: string,
  embedding: number[],
  model: string,
): Promise<DbResult<boolean>> {
  const db = await getDb();
  if (!db) return unavailable();

  const literal = toVectorLiteral(embedding);
  // No vector is a usable state: a pattern works by exact match without one,
  // and an embedder outage must not stop patterns being learned.
  if (!literal || !sourceText || !model) return { ok: true, data: false };

  try {
    const owner = ownerOf(actor);
    const q = db
      .from("creative_patterns")
      .update({ embedding: literal, embedding_model: model, source_text: sourceText.slice(0, 2000) })
      .eq("id", patternId);

    const res = owner.org_id ? await q.eq("org_id", owner.org_id) : await q.eq("user_id", owner.user_id!);
    if (res.error) return failed(res.error);
    return { ok: true, data: true };
  } catch (e) {
    return failed(e);
  }
}

async function listPatterns(
  actor: Actor,
  dimension?: PatternDimension,
  limit = 100,
): Promise<DbResult<CreativePatternRow[]>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const owner = ownerOf(actor);
    // Everything except the vector. A 768-float embedding is ~9 KB of text per
    // row, no caller of a listing reads it, and recall lists up to 200 rows on
    // every signed-in render. `embedding_model` says whether one exists.
    let q = db.from("creative_patterns").select(PATTERN_LIST_COLUMNS);
    q = owner.org_id ? q.eq("org_id", owner.org_id) : q.eq("user_id", owner.user_id!);
    if (dimension) q = q.eq("dimension", dimension);

    const res = await q
      .order("approved_count", { ascending: false })
      .order("support_count", { ascending: false })
      .limit(Math.min(Math.max(1, Math.trunc(limit)), 500));

    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data || []) as CreativePatternRow[] };
  } catch (e) {
    return failed(e);
  }
}

async function similarPatterns(actor: Actor, query: PatternQuery): Promise<DbResult<SimilarPattern[]>> {
  const db = await getDb();
  if (!db) return unavailable();

  const literal = toVectorLiteral(query?.embedding);
  if (!literal) return { ok: true, data: [] };
  if (!query.model) return { ok: false, error: "a model is required when querying by vector" };

  try {
    const owner = ownerOf(actor);
    const res = await db.rpc("search_creative_patterns", {
      p_org: owner.org_id,
      p_user: owner.user_id,
      p_query: literal,
      p_model: query.model,
      p_dimension: query.dimension ?? null,
      p_limit: Math.min(Math.max(1, Math.trunc(query.limit ?? 10)), 100),
      p_min: typeof query.minScore === "number" ? query.minScore : -1,
    });

    if (res.error) return failed(res.error);
    const rows = (res.data || []) as SimilarPattern[];
    const floor = Math.max(0, Math.trunc(query.minSupport ?? 0));
    return { ok: true, data: floor ? rows.filter((r) => r.support_count >= floor) : rows };
  } catch (e) {
    return failed(e);
  }
}

/**
 * Promotes every pattern whose evidence includes this run.
 *
 * `approved_runs` rather than a bare counter, so approving the same render
 * twice cannot inflate the one number the whole feature rests on -- the same
 * discipline the duplicate-approval index enforces in 0005, applied here in the
 * one place a second signal for one run could still arrive.
 */
async function markRunApproved(actor: Actor, runId: string): Promise<DbResult<number>> {
  const db = await getDb();
  if (!db) return unavailable();
  if (!runId) return { ok: true, data: 0 };

  try {
    const owner = ownerOf(actor);
    // JSON-encoded, not a JS array. `evidence_runs` is jsonb, and supabase-js
    // renders an array argument as a Postgres ARRAY literal (`{a,b}`) -- which
    // jsonb then refuses to parse. Passing the JSON text is what `cs` expects
    // of a jsonb column, and the difference is a runtime 22P02 rather than a
    // type error, so nothing catches it until a real approval arrives.
    const q = db
      .from("creative_patterns")
      .select(PATTERN_LIST_COLUMNS)
      .contains("evidence_runs", JSON.stringify([runId]));
    const found = owner.org_id ? await q.eq("org_id", owner.org_id) : await q.eq("user_id", owner.user_id!);
    if (found.error) return failed(found.error);

    let promoted = 0;
    for (const row of (found.data || []) as CreativePatternRow[]) {
      const already: string[] = Array.isArray((row as unknown as { approved_runs?: string[] }).approved_runs)
        ? (row as unknown as { approved_runs: string[] }).approved_runs
        : [];
      if (already.includes(runId)) continue;

      const updated = await db
        .from("creative_patterns")
        .update({
          approved_count: row.approved_count + 1,
          approved_runs: [runId, ...already].slice(0, MAX_EVIDENCE),
        })
        .eq("id", row.id);
      if (updated.error) return failed(updated.error);
      promoted++;
    }
    return { ok: true, data: promoted };
  } catch (e) {
    return failed(e);
  }
}

/**
 * Records one negative signal against every pattern this run exhibited.
 *
 * Mirrors `markRunApproved`: `rejected_runs` rather than a bare counter, so a
 * second reject click -- or a reject after a regenerate of the same render --
 * counts once. What a rejection MEANS is decided elsewhere, and with a threshold:
 * `patternQualifies` and `patternConfidence` ignore it below MIN_PATTERN_SUPPORT.
 */
async function markRunRejected(actor: Actor, runId: string): Promise<DbResult<number>> {
  const db = await getDb();
  if (!db) return unavailable();
  if (!runId) return { ok: true, data: 0 };

  try {
    const owner = ownerOf(actor);
    const q = db
      .from("creative_patterns")
      .select(PATTERN_LIST_COLUMNS)
      .contains("evidence_runs", JSON.stringify([runId]));
    const found = owner.org_id ? await q.eq("org_id", owner.org_id) : await q.eq("user_id", owner.user_id!);
    if (found.error) return failed(found.error);

    let demoted = 0;
    for (const row of (found.data || []) as unknown as CreativePatternRow[]) {
      const already: string[] = Array.isArray(row.rejected_runs) ? row.rejected_runs : [];
      if (already.includes(runId)) continue;

      const updated = await db
        .from("creative_patterns")
        .update({
          rejected_count: (row.rejected_count ?? 0) + 1,
          rejected_runs: [runId, ...already].slice(0, MAX_EVIDENCE),
        })
        .eq("id", row.id);
      if (updated.error) return failed(updated.error);
      demoted++;
    }
    return { ok: true, data: demoted };
  } catch (e) {
    return failed(e);
  }
}

// ── concepts ────────────────────────────────────────────────────────────────

async function recordConcepts(
  runId: string,
  concepts: ConceptInput[],
): Promise<DbResult<RecordConceptsResult>> {
  const db = await getDb();
  if (!db) return unavailable();

  const result: RecordConceptsResult = { stored: 0, skipped: 0, hasSelection: false };
  if (!runId || !Array.isArray(concepts) || !concepts.length) return { ok: true, data: result };

  // One route per run, and at most one selected. Both are enforced by the
  // database too; doing it here as well means a caller gets a usable answer
  // instead of a constraint violation it cannot act on.
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  let selectedTaken = false;

  for (const c of concepts) {
    const route = String(c?.route || "").trim().slice(0, 200);
    if (!route) {
      result.skipped++;
      continue;
    }
    const key = route.toLowerCase();
    if (seen.has(key)) {
      result.skipped++;
      continue;
    }
    seen.add(key);

    const selected = Boolean(c.selected) && !selectedTaken;
    if (selected) selectedTaken = true;

    rows.push({
      run_id: runId,
      route,
      core_idea: c.coreIdea ?? null,
      visual_language: c.visualLanguage ?? null,
      why_this_route: c.whyThisRoute ?? null,
      selected,
      // A reason attached to the winner is a contradiction, and the database
      // refuses it. Dropped here rather than sent.
      rejected_reason: selected ? null : (c.rejectedReason ?? null),
      origin: c.origin === "authored" ? "authored" : "offered",
      // Phase 4 (0012). Absent on concepts recorded without an evaluation,
      // which is every concept from before this phase and any run the
      // evaluator had nothing to score.
      details: c.details ?? null,
      evaluation: c.evaluation ?? null,
      score: typeof c.score === "number" && Number.isFinite(c.score) ? Math.max(0, Math.min(1, Math.round(c.score * 1000) / 1000)) : null,
    });
  }

  if (!rows.length) return { ok: true, data: result };

  try {
    const res = await db.from("creative_concepts").upsert(rows, { onConflict: "run_id,route" });
    if (res.error) return failed(res.error);
    result.stored = rows.length;
    result.hasSelection = selectedTaken;
    return { ok: true, data: result };
  } catch (e) {
    return failed(e);
  }
}

async function conceptsForRun(actor: Actor, runId: string): Promise<DbResult<CreativeConceptRow[]>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    // Visibility through the run, as everything in 0003 does. The join is the
    // check: a run this actor cannot see yields no rows.
    const orgIds = actor.memberships.map((m) => m.org_id);
    const runs = await db
      .from("creative_runs")
      .select("id, org_id, user_id")
      .eq("id", runId)
      .maybeSingle();

    if (runs.error) return failed(runs.error);
    const run = runs.data as { org_id: string | null; user_id: string | null } | null;
    if (!run) return { ok: true, data: [] };

    const visible =
      (run.org_id && orgIds.includes(run.org_id)) || run.user_id === actor.profile.id;
    if (!visible) return { ok: true, data: [] };

    const res = await db
      .from("creative_concepts")
      .select("*")
      .eq("run_id", runId)
      .order("selected", { ascending: false })
      .order("id");

    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data || []) as CreativeConceptRow[] };
  } catch (e) {
    return failed(e);
  }
}

export const creativeMemoryRepository: CreativeMemoryRepository = {
  learnPatterns,
  markRunApproved,
  markRunRejected,
  embedPattern,
  listPatterns,
  similarPatterns,
  recordConcepts,
  conceptsForRun,
};
