import { getDb, unavailable, failed } from "./client";
import type {
  DbResult,
  Actor,
  RecordUserEventInput,
  RecordUserEventResult,
  StoredPreference,
  UserEventRow,
  UserMemoryRepository,
  UserMemorySnapshot,
  UserPreferenceRow,
} from "@tido/shared";
import { DEDUPLICATED_EVENT_KINDS, USER_EVENT_KINDS } from "@tido/shared";

/**
 * Where a person's creative memory lives.
 *
 * This replaces `data/accounts/kits/*.json`, which the Phase 3 audit found
 * holding the only external success signal the system had in a format nothing
 * could query -- two files on one machine's disk, invisible to RLS, gone with
 * the container.
 *
 * WHAT THIS FILE DOES NOT DECIDE
 * -------------------------------
 * None of the learning rules are here. Whether a preference qualifies, how
 * occurrences accumulate, whether a stated preference outranks an observed one:
 * all of that stays in `UserKit` in the application, unchanged by this phase.
 * This module stores a snapshot and hands it back.
 *
 * That split is deliberate rather than tidy. A threshold encoded in SQL as well
 * as TypeScript is two thresholds, and they will eventually disagree -- at
 * which point the system's behaviour depends on which one you read.
 *
 * THE ONE RULE THIS LAYER DOES ENFORCE
 * -------------------------------------
 * A duplicate signal is not counted. That is enforced here, by a unique index,
 * rather than in the application, because it is the property the three-
 * occurrence threshold rests on: three occurrences must mean three different
 * renders. An application-side check would be a read followed by a write with a
 * race in between, and the race resolves in the direction of over-counting.
 */

/** Postgres unique violation. A duplicate signal, not a failure. */
const UNIQUE_VIOLATION = "23505";

const errorCode = (e: unknown): string | null =>
  e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string"
    ? ((e as { code: string }).code)
    : null;

/**
 * Appends one human signal.
 *
 * The run is resolved by the engine's own generation id rather than by
 * recomputing the UUIDv5 the application derives. Two copies of that derivation
 * would be two things to keep in step, and `creative_runs.engine_generation_id`
 * is already unique -- so a lookup is both shorter and harder to get wrong.
 *
 * A render that was never persisted yields a null `run_id` and the event is
 * still written. Losing a person's click because the machine's record of the
 * render is missing would be the wrong failure direction: the click is the
 * scarcer signal of the two.
 */
async function recordEvent(
  actor: Actor,
  input: RecordUserEventInput,
): Promise<DbResult<RecordUserEventResult>> {
  const db = await getDb();
  if (!db) return unavailable();

  if (!USER_EVENT_KINDS.includes(input.kind)) {
    return { ok: false, error: `unknown event kind: ${String(input.kind)}` };
  }

  const generationId = input.generationId ? String(input.generationId).slice(0, 200) : null;

  try {
    let runId: string | null = null;
    if (generationId) {
      const run = await db
        .from("creative_runs")
        .select("id")
        .eq("engine_generation_id", generationId)
        .maybeSingle();
      // A failed lookup is not a failed event. The engine id is kept either
      // way, so the event stays attributable to the render afterwards.
      if (!run.error && run.data) runId = (run.data as { id: string }).id;
    }

    const inserted = await db
      .from("user_events")
      .insert({
        user_id: actor.profile.id,
        kind: input.kind,
        run_id: runId,
        engine_generation_id: generationId,
        context: input.context ?? {},
      })
      .select("*")
      .single();

    if (inserted.error) {
      if (errorCode(inserted.error) === UNIQUE_VIOLATION) {
        // This person already signalled this about this render. Reported, not
        // counted: an occurrence added here is an occurrence the threshold
        // did not earn.
        return { ok: true, data: { recorded: false, duplicate: true, event: null } };
      }
      return failed(inserted.error);
    }

    return {
      ok: true,
      data: { recorded: true, duplicate: false, event: inserted.data as UserEventRow },
    };
  } catch (e) {
    if (errorCode(e) === UNIQUE_VIOLATION) {
      return { ok: true, data: { recorded: false, duplicate: true, event: null } };
    }
    return failed(e);
  }
}

/** This person's stored memory, or null when they have none yet. */
async function load(actor: Actor): Promise<DbResult<UserMemorySnapshot | null>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const profile = await db
      .from("user_creative_profiles")
      .select("*")
      .eq("user_id", actor.profile.id)
      .maybeSingle();

    if (profile.error) return failed(profile.error);
    // No profile is the normal state for a new account, not an error.
    if (!profile.data) return { ok: true, data: null };

    const prefs = await db
      .from("user_preferences")
      .select("*")
      .eq("user_id", actor.profile.id);

    if (prefs.error) return failed(prefs.error);

    const row = profile.data as { observed_runs: number; imported_at: string | null };
    return {
      ok: true,
      data: {
        observed_runs: row.observed_runs ?? 0,
        imported: Boolean(row.imported_at),
        preferences: ((prefs.data || []) as UserPreferenceRow[]).map((p) => ({
          area: p.area,
          value: p.value,
          stated: p.stated,
          occurrences: p.occurrences,
          negative: p.negative,
        })),
      },
    };
  } catch (e) {
    return failed(e);
  }
}

/**
 * Writes merged memory back.
 *
 * Read-modify-write against the rows that already exist, rather than an upsert
 * on the unique index. The merge key is `lower(value)`, which Postgres
 * generates -- and naming a generated column as a conflict target is a detail
 * of PostgREST's behaviour that this layer would rather not depend on. Matching
 * locally on the same expression is explicit and testable.
 *
 * Nothing is ever deleted. The rules that produced this snapshot live in the
 * application; a store that dropped a preference those rules still hold would
 * be making a creative decision from the storage layer.
 */
async function save(
  actor: Actor,
  snapshot: UserMemorySnapshot,
): Promise<DbResult<UserMemorySnapshot>> {
  const db = await getDb();
  if (!db) return unavailable();
  if (!snapshot) return { ok: false, error: "a snapshot is required" };

  const userId = actor.profile.id;
  const now = new Date().toISOString();

  try {
    const profile = await db
      .from("user_creative_profiles")
      .upsert(
        {
          user_id: userId,
          observed_runs: Math.max(0, Math.trunc(snapshot.observed_runs || 0)),
          updated_at: now,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (profile.error) return failed(profile.error);

    const existing = await db.from("user_preferences").select("*").eq("user_id", userId);
    if (existing.error) return failed(existing.error);

    const byKey = new Map<string, UserPreferenceRow>();
    for (const row of (existing.data || []) as UserPreferenceRow[]) {
      byKey.set(`${row.area}|${row.value_key}|${row.negative}`, row);
    }

    const fresh: Record<string, unknown>[] = [];
    for (const p of snapshot.preferences || []) {
      const value = String(p.value || "").trim();
      if (!value) continue;
      const key = `${p.area}|${value.toLowerCase()}|${Boolean(p.negative)}`;
      const current = byKey.get(key);

      if (!current) {
        fresh.push({
          user_id: userId,
          area: p.area,
          value: value.slice(0, 200),
          stated: Boolean(p.stated),
          occurrences: Math.max(0, Math.trunc(p.occurrences || 1)),
          negative: Boolean(p.negative),
          updated_at: now,
        });
        continue;
      }

      // Only write when something actually moved. A signal that taught nothing
      // should not stamp `updated_at` on every preference this person holds.
      const stated = current.stated || Boolean(p.stated);
      const occurrences = Math.max(0, Math.trunc(p.occurrences || 0));
      if (stated === current.stated && occurrences === current.occurrences) continue;

      const updated = await db
        .from("user_preferences")
        .update({ stated, occurrences, updated_at: now })
        .eq("id", current.id);
      if (updated.error) return failed(updated.error);
    }

    if (fresh.length) {
      const created = await db.from("user_preferences").insert(fresh);
      if (created.error) {
        // Two signals for the same person landing at once. The other write won;
        // its row is the same row, so there is nothing to repair and nothing
        // lost. Reported as success because the memory holds what it should.
        if (errorCode(created.error) !== UNIQUE_VIOLATION) return failed(created.error);
      }
    }

    return load(actor) as Promise<DbResult<UserMemorySnapshot>>;
  } catch (e) {
    return failed(e);
  }
}

/** Recent signals from this person, newest first. */
async function events(actor: Actor, limit = 100): Promise<DbResult<UserEventRow[]>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const res = await db
      .from("user_events")
      .select("*")
      .eq("user_id", actor.profile.id)
      .order("occurred_at", { ascending: false })
      .limit(Math.min(Math.max(1, Math.trunc(limit)), 500));

    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data || []) as UserEventRow[] };
  } catch (e) {
    return failed(e);
  }
}

/** Whether repeating this kind on the same render should be counted. */
export function isDeduplicated(kind: string): boolean {
  return DEDUPLICATED_EVENT_KINDS.includes(kind as never);
}

export const userMemoryRepository: UserMemoryRepository = {
  recordEvent,
  load,
  save,
  events,
};

export type { StoredPreference };
