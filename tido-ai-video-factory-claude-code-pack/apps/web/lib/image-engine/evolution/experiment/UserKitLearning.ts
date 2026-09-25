import type { UserKit, Preference, PreferenceArea } from "./UserKit";
import { recordPreference } from "./UserKit";
import type { CreativeIntelligence } from "./CreativeIntelligenceView";

/**
 * What to learn from, and what to ignore.
 *
 * The brief is specific and correct about this: do not learn from every
 * generation. A render the user glanced at and abandoned is not a preference,
 * and a system that treats it as one drifts toward whatever it happened to
 * produce most often rather than toward what anyone wanted.
 *
 * So learning is driven only by ACTS OF APPROVAL. Someone downloading a file,
 * saving it, marking it, or approving it has spent something -- attention,
 * intent, a click they did not have to make -- and that is the only signal here
 * that distinguishes a good render from a rendered one.
 *
 * Why short values only
 * --------------------
 * A preference has to be able to RECUR, because `preferenceDecisions` refuses
 * to act on anything observed fewer than three times. That threshold is the
 * safety rail, and it silently stops working if the values are prose: two
 * renders will never produce the same 200-character sentence, so every such
 * "preference" would sit at one occurrence forever -- present in the store,
 * counted in telemetry, and permanently unable to influence anything.
 *
 * That would be a memory that looks like it is learning and is not, which is
 * the failure mode this codebase has hit repeatedly. So a value that is too
 * long to recur is not stored as a preference at all; it is returned as
 * `unextracted` so the gap is visible.
 */

/** The only events that count as approval. */
export type ApprovalKind = "download" | "save" | "favorite" | "approve" | "repeat_edit";

export const APPROVAL_KINDS: readonly ApprovalKind[] = [
  "download",
  "save",
  "favorite",
  "approve",
  "repeat_edit",
] as const;

export interface ApprovalSignal {
  kind: ApprovalKind;
  /** Which render was approved. */
  generation_id: string;
  at: string;
  /** What the system decided for that render. The material to learn from. */
  intelligence?: CreativeIntelligence | null;
}

/** The longest a value can be and still plausibly recur. */
const MAX_PREFERENCE_CHARS = 48;

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/**
 * Whether a value is short and stable enough to be worth counting.
 *
 * Prose fails this on purpose. See the note at the top of the file.
 */
function isRecurrable(value: string): boolean {
  if (!value) return false;
  if (value.length > MAX_PREFERENCE_CHARS) return false;
  // A sentence is a description, not a preference.
  if (/[.!?]\s/.test(value)) return false;
  return true;
}

/** A route name without its gloss: "editorial advertising — a photograph…" -> "editorial advertising". */
export function routeLabel(direction: unknown): string {
  const value = clean(direction);
  const dash = value.search(/\s[—–-]\s/);
  return dash > 0 ? value.slice(0, dash).trim() : value;
}

export interface ExtractionResult {
  preferences: Preference[];
  /** Values that were real but too long to ever recur. Recorded, not stored. */
  unextracted: string[];
}

/**
 * Reads one approved render for preferences.
 *
 * Everything produced here is `stated: false`. The user approved a picture;
 * they did not tell us why they liked it, and treating an inference about a
 * person as something they said is exactly what `UserKit` exists to prevent.
 */
export function extractPreferences(intelligence: CreativeIntelligence | null | undefined): ExtractionResult {
  const out: ExtractionResult = { preferences: [], unextracted: [] };
  if (!intelligence) return out;

  const consider = (area: PreferenceArea, raw: unknown) => {
    const value = clean(raw);
    if (!value) return;
    if (!isRecurrable(value)) {
      out.unextracted.push(value);
      return;
    }
    out.preferences.push({ area, value, stated: false, occurrences: 1, negative: false });
  };

  // The direction is the one field that is reliably short: it is a route name
  // the director chose, not a description it wrote. Route names now carry a
  // gloss -- "editorial advertising — a photograph with a point of view" -- which
  // pushed every one past the length rule, so no approval ever taught anything.
  // The label before the dash is the route itself, and the part that recurs.
  consider("visual", routeLabel(intelligence.selected_direction));
  consider("visual", intelligence.visual_strategy?.what);
  consider("design", intelligence.typography_reasoning?.what);
  consider("design", intelligence.layout_reasoning?.what);
  consider("quality", intelligence.composition_reasoning?.what);

  return out;
}

/**
 * Folds one approval into the kit.
 *
 * `repeat_edit` is counted but contributes no preference: that the user edited
 * something twice says they were dissatisfied, not what they wanted instead.
 * Reading a preference out of a correction would learn the opposite of the
 * truth.
 */
export function learnFromSignal(kit: UserKit, signal: ApprovalSignal): { kit: UserKit; learned: number; unextracted: string[] } {
  if (!APPROVAL_KINDS.includes(signal.kind)) return { kit, learned: 0, unextracted: [] };

  const next = { ...kit, observed_runs: kit.observed_runs + 1 };
  if (signal.kind === "repeat_edit") return { kit: next, learned: 0, unextracted: [] };

  const { preferences, unextracted } = extractPreferences(signal.intelligence);
  let updated = next;
  for (const p of preferences) updated = recordPreference(updated, p);
  return { kit: updated, learned: preferences.length, unextracted };
}

/**
 * Signals that say a render was NOT what the person wanted (Phase 4.6).
 *
 * `reject` is explicit. `repeat_edit` is recorded when a person regenerates a
 * render they never kept. Both count against the render's patterns; only an
 * explicit rejection teaches a preference.
 */
export const NEGATIVE_KINDS = ["reject", "repeat_edit"] as const;

/** Signals that a person kept a render. `repeat_edit` is deliberately absent. */
export const POSITIVE_KINDS = ["download", "save", "favorite", "approve"] as const;

/**
 * Folds one explicit rejection into the kit, as "avoid" for the ROUTE only.
 *
 * Narrow on purpose. A rejection says the render missed; it does not say which
 * of its choices missed, and reading "avoid this lighting" out of it would be a
 * guess. The route is the one choice that is the render's whole premise, so it
 * is the one a rejection can fairly be charged to.
 *
 * Still subject to the kit's threshold: `preferenceDecisions` ignores an
 * observed preference until it recurs three times, so one rejection moves
 * nothing -- three rejections of the same route become "Avoid: <route>".
 */
export function learnFromRejection(
  kit: UserKit,
  intelligence: CreativeIntelligence | null | undefined,
): { kit: UserKit; learned: number } {
  const route = routeLabel(intelligence?.selected_direction);
  if (!route || !isRecurrable(route)) return { kit, learned: 0 };
  const updated = recordPreference(kit, { area: "visual", value: route, stated: false, occurrences: 1, negative: true });
  return { kit: updated, learned: 1 };
}

/** Counts and areas only -- never the values, which identify a person's taste. */
export function learningTelemetry(r: { learned: number; unextracted: string[] } | null | undefined) {
  if (!r) return { kit_learning: false };
  return { kit_learning: true, learned: r.learned, unextracted: r.unextracted.length };
}
