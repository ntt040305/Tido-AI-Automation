import type { Decision, DecisionBasis } from "./CreativeBlueprint";

/**
 * User Kit Memory — what this person keeps asking for.
 *
 * Not a Brand Kit. A brand kit describes a brand and applies to every asset for
 * it; this describes a PERSON and applies to every brand they work on. The two
 * would conflict constantly if they were the same object, which is why they are
 * not.
 *
 * The rule that makes this safe
 * -----------------------------
 * A preference is USER tier — the highest authority in this engine — but only
 * when the user actually stated it. A preference INFERRED from what they
 * accepted before is a guess about a person, and guessing about people is how a
 * system starts ignoring what they asked for today because of what they liked
 * last week.
 *
 * So every preference carries `stated`. Stated preferences enter at `user`;
 * observed ones enter at `strategy` with low confidence and are always
 * overridable by the current brief. Nothing here can outrank an explicit
 * instruction in the request.
 *
 * Storage is an interface, not an implementation. This file holds the shape and
 * the merge rules; where the bytes live is the caller's decision.
 */

export type PreferenceArea = "visual" | "design" | "workflow" | "quality";

export interface Preference {
  area: PreferenceArea;
  /** e.g. "cinematic", "serif headlines", "ecommerce", "no plastic AI look". */
  value: string;
  /**
   * True when the user said it. False when it was inferred from their history.
   *
   * This is the field the authority ladder reads, so it is never defaulted.
   */
  stated: boolean;
  /** How many times this showed up. Only meaningful for observed preferences. */
  occurrences: number;
  /** What the user is avoiding, rather than seeking. */
  negative: boolean;
}

export interface UserKit {
  user_id: string;
  preferences: Preference[];
  /** Total renders this kit was built from. Zero for a new user. */
  observed_runs: number;
}

/** Where a kit is stored. Implemented by the caller; this file has no I/O. */
export interface UserKitStore {
  load(userId: string): UserKit | null;
  save(kit: UserKit): void;
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

export function emptyKit(userId: string): UserKit {
  return { user_id: userId, preferences: [], observed_runs: 0 };
}

/**
 * Records a preference, merging with what is already known. Pure.
 *
 * A stated preference always wins over an observed one for the same value: the
 * user telling us outranks us noticing.
 */
export function recordPreference(kit: UserKit, p: Preference): UserKit {
  const value = clean(p.value);
  if (!value) return kit;
  const existing = kit.preferences.find(
    (x) => x.area === p.area && x.value.toLowerCase() === value.toLowerCase() && x.negative === p.negative
  );
  if (!existing) {
    return { ...kit, preferences: [...kit.preferences, { ...p, value, occurrences: Math.max(1, p.occurrences) }] };
  }
  return {
    ...kit,
    preferences: kit.preferences.map((x) =>
      x === existing
        ? { ...x, stated: x.stated || p.stated, occurrences: x.occurrences + Math.max(1, p.occurrences) }
        : x
    ),
  };
}

/**
 * Turns preferences into decisions the brain can consult.
 *
 * Stated preferences become `user` tier. Observed ones become `strategy` tier at
 * low confidence, and only after they have recurred — a single occurrence is an
 * event, not a preference, and treating it as one would make the system chase
 * noise.
 */
export function preferenceDecisions(
  kit: UserKit | null | undefined,
  minOccurrences = 3
): { area: PreferenceArea; decision: Decision; negative: boolean }[] {
  if (!kit) return [];
  const out: { area: PreferenceArea; decision: Decision; negative: boolean }[] = [];
  for (const p of kit.preferences) {
    const qualifies = p.stated || p.occurrences >= minOccurrences;
    if (!qualifies) continue;
    const derived_from: DecisionBasis = p.stated ? "user" : "strategy";
    out.push({
      area: p.area,
      negative: p.negative,
      decision: {
        value: p.negative ? `Avoid: ${p.value}` : p.value,
        because: p.stated
          ? "the user stated this preference directly"
          : `observed across ${p.occurrences} of this user's runs; never stated, so it yields to the current brief`,
        derived_from,
        confidence: p.stated ? "high" : "low",
      },
    });
  }
  return out;
}

/** Counts and areas only — never the preference text, which identifies a person. */
export function userKitTelemetry(kit: UserKit | null | undefined) {
  if (!kit) return { user_kit: false };
  const byArea: Record<string, number> = {};
  for (const p of kit.preferences) byArea[p.area] = (byArea[p.area] || 0) + 1;
  return {
    user_kit: true,
    preferences: kit.preferences.length,
    stated: kit.preferences.filter((p) => p.stated).length,
    observed: kit.preferences.filter((p) => !p.stated).length,
    negative: kit.preferences.filter((p) => p.negative).length,
    observed_runs: kit.observed_runs,
    by_area: byArea,
  };
}

/**
 * The kit as the director reads it, or undefined when nothing qualifies.
 *
 * Says explicitly that a preference yields to the brief. A director shown a
 * preference with no such note will treat it as a constraint, and a preference
 * that overrides today's instruction is worse than no memory at all.
 */
export function summarizeUserKit(kit: UserKit | null | undefined): string | undefined {
  const decisions = preferenceDecisions(kit);
  if (!decisions.length) return undefined;
  const likes = decisions.filter((d) => !d.negative);
  const avoids = decisions.filter((d) => d.negative);
  const lines: string[] = ["WHAT THIS USER USUALLY WANTS. It yields to anything the current brief says."];
  if (likes.length) lines.push("", "Tends to prefer:", ...likes.map((d) => `  - ${d.decision.value}`));
  if (avoids.length) lines.push("", "Tends to reject:", ...avoids.map((d) => `  - ${d.decision.value.replace(/^Avoid: /, "")}`));
  return lines.join("\n");
}
