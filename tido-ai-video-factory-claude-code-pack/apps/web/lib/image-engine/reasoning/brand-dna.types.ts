/**
 * CIOS Phase 4.0.4.1 — what a brand actually is, for the ownership question.
 *
 * The problem with the 4.0.4 test
 * ------------------------------
 * `REPLACE_BRAND` asked whether the idea contained a token only this brief
 * supplied — the brand name, the product, the behaviour, the key phrase. That is
 * a real check and it is the wrong one. An idea can name the product and still
 * belong to the category; an idea can name nothing and still be unmistakably one
 * brand's, because it rests on something that brand has done and its competitors
 * have not.
 *
 * Ownership is a relation between an idea and a brand's *history*, not an overlap
 * between two strings. This file describes what would have to be known for that
 * relation to be checked.
 *
 * The honest position on what is knowable here
 * -------------------------------------------
 * Almost none of it is in the briefs. The hundred-brief benchmark carries a
 * name, a product, an audience, an objective and a tone. It does not say what
 * the brand has done, what it is permitted to claim, or what it owns visually —
 * and those are the three that decide ownership.
 *
 * So `BrandDNA` is a *declared* structure. `BrandDNAResolver` fills what the
 * brief genuinely supports and reports `completeness`, and the ownership
 * judgement is scaled by how much was actually known. A brand with an empty DNA
 * gets a low-confidence verdict that says so, rather than a confident verdict
 * built on a name.
 *
 * That is deliberately less flattering than the token test it replaces. The
 * token test could always answer; this one frequently cannot, and the cases
 * where it cannot are exactly the cases where nobody should be told their idea
 * is ownable.
 */

export interface BrandDNA {
  brand: string;
  /**
   * What the brand holds to be worth having. Not adjectives about itself —
   * positions it would defend at a cost.
   */
  values: string[];
  /**
   * What it has actually done. The strongest ownership evidence there is,
   * because a competitor cannot acquire another brand's past.
   */
  history: string[];
  /** How it behaves when it is inconvenient. Ownership lives here more than in values. */
  behavior: string[];
  /**
   * What this brand is allowed to say that others in its category are not, and
   * what it is *not* allowed to say however true.
   */
  category_permission: { permitted: string[]; forbidden: string[] };
  /** Things an audience would recognise without the logo. */
  distinctive_assets: string[];
  /** Which fields came from the brief and which were declared. */
  provenance: Record<string, "DECLARED" | "DERIVED" | "ABSENT">;
  /** 0-1. How much of the DNA is actually known. */
  completeness: number;
}

/** The empty DNA. Returned rather than a guess. */
export const NO_BRAND_DNA: BrandDNA = {
  brand: "",
  values: [],
  history: [],
  behavior: [],
  category_permission: { permitted: [], forbidden: [] },
  distinctive_assets: [],
  provenance: {},
  completeness: 0,
};

/**
 * What a category lets a brand say, and what it does not.
 *
 * Category permission is the one part of brand DNA that can be derived without
 * knowing the brand, because it is a property of the category. A healthcare
 * brand cannot promise outcomes however much it wants to; a local business can
 * claim proximity that a national one cannot.
 *
 * These are authored and they are the sort of claim a person in the market
 * should check. They are used only to *withhold* permission, never to grant an
 * idea more ownership than its evidence supports.
 */
export const CATEGORY_PERMISSION: Record<string, { permitted: string[]; forbidden: string[] }> = {
  beauty: {
    permitted: ["showing the routine as it is", "naming what the category exaggerates", "declining to promise transformation"],
    forbidden: ["clinical outcome claims", "promising a permanent result"],
  },
  healthcare: {
    permitted: ["naming the fear nobody says out loud", "showing the wait", "admitting uncertainty"],
    forbidden: ["promising an outcome", "implying diagnosis", "guaranteeing a timeline"],
  },
  food_beverage: {
    permitted: ["showing the ordinary meal", "naming the occasion", "admitting the compromise"],
    forbidden: ["health outcome claims", "implying nutritional superiority without evidence"],
  },
  fashion: {
    permitted: ["showing the garment on a real body", "naming resale", "declining seasonality"],
    forbidden: ["promising status", "implying belonging is purchasable"],
  },
  hospitality: {
    permitted: ["showing the arrival", "naming the off-season honestly", "admitting what the room is for"],
    forbidden: ["promising an experience the property cannot control"],
  },
  real_estate: {
    permitted: ["giving the commute in minutes", "naming year three", "showing the building's people"],
    forbidden: ["promising appreciation", "implying an investment return"],
  },
  technology: {
    permitted: ["showing the work it replaces", "naming the migration cost", "admitting what it does not do"],
    forbidden: ["implying it removes accountability", "promising it will not be wrong"],
  },
  education: {
    permitted: ["naming what a graduate can do", "showing the teachers", "admitting the fee is certain"],
    forbidden: ["promising an outcome", "implying a placement guarantee"],
  },
  local_business: {
    permitted: ["claiming proximity", "naming the proprietor", "showing the actual premises"],
    forbidden: ["claiming scale it does not have"],
  },
};

/**
 * How a brand behaves, derived from the tone the brief states.
 *
 * Tone is the one behavioural signal a brief reliably carries. It is weak
 * evidence — a stated tone is an intention, not a record — and it is marked
 * DERIVED wherever it is used.
 */
export const TONE_BEHAVIOR: [RegExp, string][] = [
  [/\bplain|upfront|direct|honest|no[- ]nonsense\b/i, "says the price before it is asked for"],
  [/\bcalm|unhurried|patient|reassur\w*\b/i, "does not rush the person deciding"],
  [/\bwarm|human|personal|friendly\b/i, "answers as a person rather than as a channel"],
  [/\bunintimidating|welcoming|easy|approachable\b/i, "makes the first time survivable"],
  [/\bquiet|restrained|understated|minimal\b/i, "declines to raise its voice when the category does"],
  [/\bsupportive|caring|gentle\b/i, "stays with the decision after it is made"],
  [/\bconfident|assured|expert\b/i, "states what it knows and marks what it does not"],
];

export interface OwnershipVerdict {
  /** 0-1. How much of the idea rests on this brand rather than the category. */
  ownership: number;
  /** The chain: what in the idea rests on what in the brand. */
  reasoning: string[];
  /** 0-1. How much the verdict can be trusted, given how much DNA was known. */
  confidence: number;
  /** True where the idea claims something the category does not permit. */
  breaches_permission: boolean;
  /** The specific breach, when there is one. */
  breach?: string;
  notes: string[];
}
