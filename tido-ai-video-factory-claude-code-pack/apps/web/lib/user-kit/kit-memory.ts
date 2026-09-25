import { getInfrastructure, isDatabaseConfigured } from "@tido/infrastructure";
import type {
  Actor,
  StoredPreference,
  UserEventKind,
  UserMemorySnapshot,
  VerifiedIdentity,
} from "@tido/shared";
import { USER_EVENT_KINDS } from "@tido/shared";
import type { Preference, UserKit } from "@/lib/image-engine/evolution/experiment/UserKit";
import { emptyKit } from "@/lib/image-engine/evolution/experiment/UserKit";
import {
  learnFromSignal,
  learnFromRejection,
  APPROVAL_KINDS,
  NEGATIVE_KINDS,
  type ApprovalKind,
} from "@/lib/image-engine/evolution/experiment/UserKitLearning";
import { fileKitStore, loadOrCreateKit } from "./kit-store";
import { runUuid } from "@/lib/persistence/record-generation";

/**
 * The path from something a person did to something the system remembers.
 *
 * Phase 3.1. Before this, an act of approval reached `learnFromSignal`, became
 * a merged `UserKit`, and was written to `data/accounts/kits/{uid}.json` -- one
 * machine's disk, invisible to every query, gone with the container. The audit
 * found two such files, both produced by test runs, which is to say the memory
 * had never held anything.
 *
 * WHAT MOVED AND WHAT DID NOT
 * ----------------------------
 * The storage moved. The learning did not. `learnFromSignal` and
 * `recordPreference` are called here exactly as the route called them before,
 * on exactly the same in-memory `UserKit` value, and the authority model --
 * stated at user tier, observed at strategy tier and low confidence after three
 * occurrences -- is untouched. This file is a store and a mapping, not a second
 * opinion about what a preference is.
 *
 * WHY THE ORDER IS EVENT FIRST, THEN LEARNING
 * --------------------------------------------
 * The event is written before anything is learned from it, and a duplicate
 * stops the flow. That ordering is the whole reason the database is worth
 * having here: three impatient clicks on one download button must not become
 * three occurrences, because three occurrences is precisely the bar at which an
 * observed preference starts influencing renders. The uniqueness rule that
 * enforces this lives in an index, not in this function, so a race between two
 * requests resolves in the database rather than between two reads.
 *
 * THE FILE STORE IS STILL HERE, AS A FALLBACK
 * --------------------------------------------
 * This product renders pictures when Supabase is unreachable, and it did so for
 * its whole life before there was a database. So an unconfigured or failing
 * database falls back to the files rather than dropping the signal. That path
 * is honestly degraded -- it has no dedupe and no cross-instance visibility --
 * and `storage` in the result says which one ran, so nobody has to guess.
 */

/** Which store actually answered. Returned so a caller never has to infer it. */
export type MemoryStorage = "database" | "file";

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/** The orchestrator's asset-id prefix: `ast_img_<generationId>`. */
const ASSET_ID_PREFIX = "ast_img_";

/**
 * The engine generation id a signal is about.
 *
 * The download button sent the ASSET id, which is the generation id behind a
 * fixed prefix. It matched no `creative_runs.engine_generation_id`, so every
 * event landed with `run_id` NULL and no approval ever reached a pattern. The
 * client now sends the generation id; this also accepts the asset form, so a
 * browser tab still running the old bundle records correctly too.
 */
export function generationIdFromSignal(raw: unknown): string {
  const id = clean(raw);
  return id.startsWith(ASSET_ID_PREFIX) ? id.slice(ASSET_ID_PREFIX.length) : id;
}

/** The engine's kit as the storage layer holds it. */
export function toSnapshot(kit: UserKit): UserMemorySnapshot {
  return {
    observed_runs: kit.observed_runs,
    imported: false,
    preferences: kit.preferences.map((p) => ({
      area: p.area,
      value: p.value,
      stated: p.stated,
      occurrences: p.occurrences,
      negative: p.negative,
    })) as StoredPreference[],
  };
}

/** The storage snapshot as the engine reads it. */
export function fromSnapshot(userId: string, snapshot: UserMemorySnapshot | null): UserKit {
  if (!snapshot) return emptyKit(userId);
  return {
    user_id: userId,
    observed_runs: snapshot.observed_runs,
    preferences: (snapshot.preferences || []).map((p) => ({
      area: p.area,
      value: p.value,
      stated: p.stated,
      occurrences: p.occurrences,
      negative: p.negative,
    })) as Preference[],
  };
}

/**
 * Resolves a verified identity to an actor, or null.
 *
 * An `Actor` is the only thing the memory repository accepts, for the reason
 * every repository in this codebase takes one: a bare user id is whatever
 * arrived in a request body. Here it matters more than usual -- an event
 * written against the wrong id does not misattribute a row, it teaches the
 * system somebody else's taste.
 */
async function actorFor(identity: VerifiedIdentity): Promise<Actor | null> {
  if (!isDatabaseConfigured()) return null;
  const resolved = await getInfrastructure().identity.resolveActor(identity);
  return resolved.ok ? resolved.data : null;
}

/**
 * This person's memory, from the database when there is one.
 *
 * Never throws and never null: memory is an assist, and a lookup that failed is
 * indistinguishable from a person who has not taught the system anything yet.
 * Both mean "render from the brief alone", which is the correct behaviour for
 * both.
 */
export async function loadKitForIdentity(identity: VerifiedIdentity): Promise<UserKit> {
  try {
    const actor = await actorFor(identity);
    if (actor) {
      const result = await getInfrastructure().memory.load(actor);
      if (result.ok) return fromSnapshot(identity.firebaseUid, result.data);
      // A configured database that answered with an error is worth a line; an
      // unconfigured one is the expected state on a developer's machine.
      if (!result.unavailable) {
        console.warn("[USER_MEMORY] load failed, falling back to file:", result.error);
      }
    }
  } catch (e) {
    console.warn("[USER_MEMORY] load failed:", e instanceof Error ? e.message : String(e));
  }
  return loadOrCreateKit(identity.firebaseUid);
}

export interface ApprovalInput {
  kind: UserEventKind;
  /** The engine generation id as the browser holds it. */
  generationId?: string | null;
  /** What the system decided for that render. The material to learn from. */
  intelligence?: unknown;
  /** Anything else the caller knew: the surface, the template. */
  context?: Record<string, unknown>;
}

export interface ApprovalOutcome {
  recorded: boolean;
  /** True when this person had already signalled this about this render. */
  duplicate: boolean;
  learned: number;
  unextracted: number;
  storage: MemoryStorage;
}

/**
 * Records one human signal and folds it into this person's memory.
 *
 * The flow the phase brief describes, in order:
 *
 *   human event -> user_events -> UserKitLearning -> user_preferences
 *
 * Phase 4.6 wrote the rule for reading a rejection, deliberately narrow: an
 * explicit `reject` counts against the render's patterns and adds one "avoid"
 * occurrence for its ROUTE -- the one choice that is the render's whole
 * premise -- and nothing else about taste is inferred from it. A `repeat_edit`
 * (a regenerate of a render nobody kept) counts against the patterns only.
 * `template_use` is still recorded and not learned from.
 */
export async function recordApproval(
  identity: VerifiedIdentity,
  input: ApprovalInput,
): Promise<ApprovalOutcome> {
  const kind = input.kind;
  if (!USER_EVENT_KINDS.includes(kind)) {
    return { recorded: false, duplicate: false, learned: 0, unextracted: 0, storage: "file" };
  }

  const infra = getInfrastructure();
  const actor = await actorFor(identity).catch(() => null);
  const generationId = generationIdFromSignal(input.generationId);

  if (actor) {
    const event = await infra.memory.recordEvent(actor, {
      kind,
      generationId: generationId || null,
      context: input.context ?? {},
    });

    if (event.ok) {
      // Already signalled. Nothing is learned from it, by design: an occurrence
      // added here is an occurrence the three-render threshold did not earn.
      if (event.data.duplicate) {
        return { recorded: false, duplicate: true, learned: 0, unextracted: 0, storage: "database" };
      }

      // Phase 4.6. The negative half of the loop. A rejection, or a regenerate
      // of a render nobody kept, counts once against that render's patterns
      // (idempotent per run) and -- for an explicit rejection only -- adds one
      // "avoid" occurrence for its route. Neither moves a decision on its own:
      // patterns need MIN_PATTERN_SUPPORT renders and preferences three
      // occurrences before either is read back.
      //
      // Handled BEFORE the approval path on purpose: `repeat_edit` is in
      // APPROVAL_KINDS for the kit's observed-run count, and letting it fall
      // through would have PROMOTED the patterns of a render the person
      // regenerated away from.
      if ((NEGATIVE_KINDS as readonly string[]).includes(kind)) {
        let learned = 0;
        if (kind === "reject") {
          const loaded = await infra.memory.load(actor);
          const kit = fromSnapshot(identity.firebaseUid, loaded.ok ? loaded.data : null);
          const rejection = learnFromRejection(kit, (input.intelligence ?? null) as never);
          learned = rejection.learned;
          if (learned) {
            const saved = await infra.memory.save(actor, toSnapshot(rejection.kit));
            if (!saved.ok) console.warn("[USER_MEMORY] save failed:", saved.error);
          }
        }
        try {
          if (generationId) {
            const demoted = await infra.creativeMemory.markRunRejected(actor, runUuid(generationId));
            if (demoted.ok && demoted.data) console.log("[CREATIVE_PATTERNS][REJECTED]", { patterns: demoted.data, kind });
          }
        } catch (e) {
          console.warn("[CREATIVE_PATTERNS] rejection skipped:", e instanceof Error ? e.message : String(e));
        }
        return { recorded: true, duplicate: false, learned, unextracted: 0, storage: "database" };
      }

      if (!APPROVAL_KINDS.includes(kind as ApprovalKind)) {
        return { recorded: true, duplicate: false, learned: 0, unextracted: 0, storage: "database" };
      }

      const loaded = await infra.memory.load(actor);
      const kit = fromSnapshot(identity.firebaseUid, loaded.ok ? loaded.data : null);

      const result = learnFromSignal(kit, {
        kind: kind as ApprovalKind,
        generation_id: generationId,
        at: new Date().toISOString(),
        intelligence: (input.intelligence ?? null) as never,
      });

      const saved = await infra.memory.save(actor, toSnapshot(result.kit));
      if (!saved.ok) {
        console.warn("[USER_MEMORY] save failed:", saved.error);
      }

      // Phase 3.3. The one path by which a creative pattern ever becomes
      // "approved". A render finishing says something was made; this says a
      // person kept it, and keeping the two apart is what stops the system
      // learning from its own output.
      //
      // Resolved from the engine's generation id rather than passed in,
      // because the browser holds that id and not the run's uuid.
      //
      // Awaited: the caller is a fire-and-forget button, so this costs nobody a
      // wait, and a promotion that finishes after the response is a promotion
      // nothing can confirm. If the render's patterns are not stored yet, the
      // other half of this lives in `record-creative-memory`, which promotes on
      // learning when an approval for the run is already on record.
      try {
        if (generationId) {
          // The same deterministic mapping the persistence layer used to write
          // the run. Reused rather than looked up: one definition of "which row
          // is this render" is the reason 0004 chose a derived UUID at all.
          const promoted = await infra.creativeMemory.markRunApproved(actor, runUuid(generationId));
          if (promoted.ok && promoted.data) {
            console.log("[CREATIVE_PATTERNS][APPROVED]", { patterns: promoted.data });
          }
        }
      } catch (e) {
        console.warn("[CREATIVE_PATTERNS] promotion skipped:", e instanceof Error ? e.message : String(e));
      }

      return {
        recorded: true,
        duplicate: false,
        learned: result.learned,
        unextracted: result.unextracted.length,
        storage: "database",
      };
    }

    if (!event.unavailable) {
      console.warn("[USER_MEMORY] event not recorded, falling back to file:", event.error);
    }
  }

  // No database. The signal is still the scarcest thing this system receives,
  // so it goes somewhere rather than nowhere -- with no dedupe, which is the
  // cost of this path and the reason it is the fallback and not the design.
  if (!APPROVAL_KINDS.includes(kind as ApprovalKind)) {
    return { recorded: false, duplicate: false, learned: 0, unextracted: 0, storage: "file" };
  }

  const result = learnFromSignal(loadOrCreateKit(identity.firebaseUid), {
    kind: kind as ApprovalKind,
    generation_id: generationId,
    at: new Date().toISOString(),
    intelligence: (input.intelligence ?? null) as never,
  });
  fileKitStore.save(result.kit);

  return {
    recorded: true,
    duplicate: false,
    learned: result.learned,
    unextracted: result.unextracted.length,
    storage: "file",
  };
}
