/**
 * Who wins when two sources disagree. One function, eight tiers.
 *
 * WHY ONE FUNCTION AND NOT A RULE PER FIELD
 * -----------------------------------------
 * Because the order is a product decision, not a per-field detail, and the way it goes
 * wrong is always the same: some field somewhere grows its own opinion about whether the
 * brand kit or the concept wins, nobody notices, and two fields on the same sheet now
 * answer the question differently. There is one ladder and every field climbs it.
 *
 * THE LADDER, HIGHEST FIRST
 * -------------------------
 *   1 exact_copy          the client's own strings and prices. Never altered by anything.
 *   2 product_appearance  what the photographs actually show. A photograph outranks an
 *                         opinion about the product, including the brand's own.
 *   3 explicit_selection  a dropdown the client set, or a spec they typed into the
 *                         concept ("85mm"). The client speaking in a field.
 *   4 concept_text        the client's prose. Speaking, but not in a field.
 *   5 brand_kit           stored brand rules.
 *   6 mood_reference      style read off an inspiration image.
 *   7 creative_approach   restrained / balanced / bold.
 *   8 default             what the derivation rules produce from geometry and counts.
 *
 * Note where `product_appearance` sits: above the brand kit. That is deliberate and it is
 * the tier that prevents the measured failure where a kit's primary colour is also the
 * product's colour and the background was painted in it, erasing the product.
 *
 * CONFLICTS ARE RECORDED, NOT SILENCED
 * ------------------------------------
 * When a lower tier offered something different, that is written into
 * `conflicts_resolved` on the sheet. A reviewer asking "why is the background not the
 * brand colour" gets the answer from the sheet instead of from a guess.
 *
 * Pure. No I/O, no clock, no model call.
 */

/** Highest first. The index in this array IS the priority. */
export const PRECEDENCE_TIERS = [
  "exact_copy",
  "product_appearance",
  "explicit_selection",
  "concept_text",
  "brand_kit",
  "mood_reference",
  "creative_approach",
  "default",
] as const;

export type PrecedenceTier = (typeof PRECEDENCE_TIERS)[number];

export function tierRank(tier: PrecedenceTier): number {
  const at = PRECEDENCE_TIERS.indexOf(tier);
  // An unknown tier ranks last rather than throwing: a typo in a candidate must not be
  // able to end a render, and ranking it last means it can only ever lose.
  return at < 0 ? PRECEDENCE_TIERS.length : at;
}

export interface Candidate<T> {
  tier: PrecedenceTier;
  /** `undefined` and `null` both mean "this source had nothing to say". */
  value: T | null | undefined;
  /** What this source is, in a few words. Appears in a conflict line. */
  from?: string;
}

export interface Resolved<T> {
  value: T | undefined;
  tier: PrecedenceTier;
  from?: string;
  /** One line per losing candidate that actually disagreed. */
  conflicts: string[];
}

/**
 * The winner, and what it beat.
 *
 * Stable within a tier: two candidates at the same rank leave the FIRST one standing,
 * because the caller lists them in the order it considers them authoritative and a sort
 * that reordered equals would make the sheet non-deterministic.
 */
export function resolvePrecedence<T>(
  field: string,
  candidates: Candidate<T>[],
  /** How to compare two values for the conflict log. Default is JSON equality. */
  same: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
): Resolved<T> {
  const offered = candidates.filter((c) => c.value !== undefined && c.value !== null) as Array<
    Candidate<T> & { value: T }
  >;
  if (!offered.length) {
    return { value: undefined, tier: "default", conflicts: [] };
  }

  let winner = offered[0];
  for (const c of offered.slice(1)) {
    if (tierRank(c.tier) < tierRank(winner.tier)) winner = c;
  }

  const conflicts: string[] = [];
  for (const c of offered) {
    if (c === winner) continue;
    if (same(c.value, winner.value)) continue;
    conflicts.push(
      `${field}: ${winner.tier}${winner.from ? ` (${winner.from})` : ""} won over ` +
        `${c.tier}${c.from ? ` (${c.from})` : ""}`,
    );
  }

  return { value: winner.value, tier: winner.tier, from: winner.from, conflicts };
}
