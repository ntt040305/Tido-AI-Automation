/**
 * Human signals, and the memory built from them.
 *
 * Mirrors migration 0005. The shapes here are the contract between the
 * application -- which owns the learning rules -- and the infrastructure, which
 * owns where the bytes go.
 *
 * WHY THESE TYPES DUPLICATE `UserKit`
 * ------------------------------------
 * `Preference` and `PreferenceArea` already exist in the engine, and at a
 * glance `StoredPreference` below is the same object. Importing the engine's
 * version here would invert the dependency this whole package exists to
 * establish: `@tido/shared` depends on nothing, which is what stops a database
 * driver reaching a browser bundle, and an engine type is a creative-layer
 * concern that would then be pinned by a storage contract.
 *
 * So the storage shape is declared independently and the application maps
 * between the two, in one place, with a test asserting the two vocabularies
 * still agree. The alternative -- a shared type owned by neither layer -- is
 * how the creative layer ends up unable to change a field without a migration.
 */

/**
 * Everything a person can be recorded as having done.
 *
 * Wider than the set the learning code acts on, deliberately. `reject` is the
 * external correction the Phase 3 audit found missing: a system that only ever
 * observes approvals reinforces whatever it already produces, with nothing to
 * push back. Recording it before anything reads it means the evidence exists on
 * the day that rule is written, rather than starting from zero then.
 */
export type UserEventKind =
  | "download"
  | "save"
  | "favorite"
  | "approve"
  | "repeat_edit"
  | "reject"
  | "template_use";

/** The recording vocabulary, matching the check constraint in 0005. */
export const USER_EVENT_KINDS: readonly UserEventKind[] = [
  "download",
  "save",
  "favorite",
  "approve",
  "repeat_edit",
  "reject",
  "template_use",
] as const;

/**
 * Kinds whose repetition on the same render is noise rather than signal.
 *
 * Matches the partial unique index in 0005. Exported because the application
 * needs to explain a refused duplicate, and a second hand-maintained list would
 * eventually disagree with the index.
 */
export const DEDUPLICATED_EVENT_KINDS: readonly UserEventKind[] = [
  "download",
  "save",
  "favorite",
  "approve",
  "reject",
] as const;

export interface UserEventRow {
  id: number;
  /** Internal profile id, never a Firebase UID. Never null: see 0005. */
  user_id: string;
  kind: UserEventKind;
  /** Null when the render was not persisted, which does not invalidate the event. */
  run_id: string | null;
  /** The engine's own id, which is what the browser holds. */
  engine_generation_id: string | null;
  context: Record<string, unknown>;
  occurred_at: string;
}

export interface RecordUserEventInput {
  kind: UserEventKind;
  /** The engine generation id as the client holds it. */
  generationId?: string | null;
  context?: Record<string, unknown>;
}

export interface RecordUserEventResult {
  /** False only when nothing was written. A duplicate is not a failure. */
  recorded: boolean;
  /**
   * True when this person had already signalled this about this render.
   *
   * Surfaced rather than swallowed because the caller must not count it: a
   * duplicate that silently increments an occurrence is how three clicks on one
   * render become a preference.
   */
  duplicate: boolean;
  event: UserEventRow | null;
}

export type UserPreferenceArea = "visual" | "design" | "workflow" | "quality";

export const USER_PREFERENCE_AREAS: readonly UserPreferenceArea[] = [
  "visual",
  "design",
  "workflow",
  "quality",
] as const;

/** One stored preference. The storage-side twin of the engine's `Preference`. */
export interface StoredPreference {
  area: UserPreferenceArea;
  value: string;
  /** True only when the user said it. The field the authority ladder reads. */
  stated: boolean;
  occurrences: number;
  negative: boolean;
}

export interface UserPreferenceRow extends StoredPreference {
  id: number;
  user_id: string;
  /** Generated lower(value). The merge key, computed by Postgres. */
  value_key: string;
  created_at: string;
  updated_at: string;
}

export interface UserCreativeProfileRow {
  user_id: string;
  observed_runs: number;
  /** Set by the one-time import from the JSON kit files; null for everyone since. */
  imported_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A person's whole creative memory, as the application works with it.
 *
 * Deliberately the same shape the file store used to hold, so the merge rules
 * in `UserKit` operate on it unchanged whichever store it came from.
 */
export interface UserMemorySnapshot {
  observed_runs: number;
  preferences: StoredPreference[];
  /** True when these counts came from the file import rather than recorded events. */
  imported: boolean;
}
