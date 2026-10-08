/**
 * The industry, spelled so a reader can read it. Nothing else.
 *
 * THE MEASURED DEFECT
 * -------------------
 * A live render's OUTPUT line read:
 *
 *   "A square social advertisement for the coffee and tea brand Florian, coffee_tea, …"
 *
 * `coffee_tea` is a database enum. It reached the image model as a word, which means it
 * reached the renderer as something to interpret, and the brand's own description was
 * already two words earlier in the same sentence. This file is the fix: one map from the
 * stored id to the phrase a person would say.
 *
 * WHAT THIS FILE IS FORBIDDEN TO BECOME
 * -------------------------------------
 * A creative lookup table. The industry may influence exactly two things:
 *
 *   1. its own SPELLING, which is this map;
 *   2. NEGATIVES — things to exclude, which is `exclusionsFor` below.
 *
 * It may never supply a focal length, a colour, a Kelvin value, a prop, a surface, a
 * festival motif or a composition. Those are derived from the client's own inputs, and
 * `run-art-direction-tests` has a static test that fails if a creative constant ever
 * appears keyed on an industry id — including in this file.
 *
 * WHY THE NEGATIVES ARE ALLOWED
 * -----------------------------
 * Because a negative cannot invent a picture. "No raw meat" on a dessert brief removes a
 * failure; it does not decide the lighting, the palette or the mood. The asymmetry is the
 * whole reason the industry lock is forbidden in one direction and permitted in the other.
 *
 * Pure. No I/O, no clock, no model call.
 */

/**
 * The display spelling, per stored id.
 *
 * Values are noun phrases that read correctly inside "a poster for a {X} brand", because
 * that is the only sentence they are used in.
 */
const LABELS: Record<string, string> = {
  food_beverage: "food and drink",
  beauty_skincare: "beauty and skincare",
  coffee_tea: "coffee and tea",
  fashion_apparel: "fashion and accessories",
  electronics_tech: "consumer electronics",
  fmcg: "everyday consumer goods",
  home_lifestyle: "homeware and lifestyle",
  healthcare_wellness: "health and wellness",
  real_estate: "property",
  education: "education",
  other: "general consumer goods",
};

/**
 * Exclusions worth stating, per stored id. NEGATIVES ONLY.
 *
 * Each entry names a thing that is wrong to draw for that category and nothing about what
 * is right. Empty for every category where no such failure is known, which is most of
 * them — an entry here has to be earned by a bad render, not guessed at a desk.
 */
const EXCLUSIONS: Record<string, string[]> = {
  food_beverage: ["no raw or undercooked food unless the concept asks for it", "no inedible props touching the food"],
  coffee_tea: ["no spilled or stained surfaces around the cups unless the concept asks for it"],
  beauty_skincare: ["no visible skin conditions on any hand or face that the concept did not ask for"],
  electronics_tech: ["no invented ports, buttons, logos or screen content that the photographs do not show"],
  healthcare_wellness: ["no clinical or medical claims rendered as text, badges or seals"],
};

/**
 * The display spelling for an industry id.
 *
 * An unknown id is returned verbatim with its separators repaired rather than replaced by
 * a default, because an unknown id is usually a real industry someone typed — and "spa
 * and massage" is better in the prompt than "general consumer goods". Only an empty value
 * falls through to the neutral phrase.
 */
export function industryLabel(raw: string | null | undefined): string {
  const id = String(raw ?? "").trim();
  if (!id) return "general consumer goods";
  const known = LABELS[id.toLowerCase()];
  if (known) return known;
  // `some_new_category` → "some new category". Already-prose values pass through unharmed.
  return id.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** True when the id is one this map knows. For telemetry and for the leak test. */
export function industryKnown(raw: string | null | undefined): boolean {
  return Boolean(LABELS[String(raw ?? "").trim().toLowerCase()]);
}

/** Exclusions for an industry id. Empty for an unknown one: a guess is worse than silence. */
export function exclusionsFor(raw: string | null | undefined): string[] {
  return EXCLUSIONS[String(raw ?? "").trim().toLowerCase()] ?? [];
}

/** Every id this map spells. Read by the leak test, which checks the values carry no craft. */
export function knownIndustryIds(): string[] {
  return Object.keys(LABELS);
}
