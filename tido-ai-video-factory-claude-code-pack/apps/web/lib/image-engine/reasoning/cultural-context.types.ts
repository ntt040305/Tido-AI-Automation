/**
 * CIOS Phase 4.0.3.5 — cultural context.
 *
 * What this is, and the care it needs
 * -----------------------------------
 * Everything in the library below is an authored generalisation about groups of
 * people. That is a category of knowledge that is useful when it is accurate and
 * actively harmful when it is not, because a generalisation applied to an
 * individual is a stereotype and a campaign built on one is a campaign that tells
 * its audience it does not know them.
 *
 * Four rules follow, and the code enforces them rather than trusting the caller:
 *
 *   1. **Culture never overrides the brief.** Where the brief says something and
 *      the cultural context implies otherwise, the brief wins. Culture supplies a
 *      social force the brief did not state; it does not correct one it did.
 *   2. **Culture is applied only where it is established.** A brief with no
 *      country and no generation gets `UNSPECIFIED`, and the insight is built
 *      without a cultural rung rather than with a guessed one.
 *   3. **Culture shapes how a truth shows up, not whether it is true.** The human
 *      truth stays universal — that is what `universality` scores. What culture
 *      supplies is the social force above it and the expression below it.
 *   4. **Every entry is falsifiable and dated.** These are observations that go
 *      out of date. `reviewed` says when someone last checked, and
 *      `needs_local_review` marks the ones a person from that market should read
 *      before they ship.
 *
 * The Vietnam entry is the only one written in depth, because it is the only
 * market this system's briefs are actually in — the hundred-brief benchmark is
 * Vietnamese throughout, from the brand names down. Everything else is a stub
 * that declines rather than a thin guess that answers.
 */

export type CulturalGeneration = "gen_z" | "millennial" | "gen_x" | "boomer" | "unspecified";

export interface CulturalContext {
  /** ISO-ish country key, or "unspecified". */
  country: string;
  generation: CulturalGeneration;
  /** What the group is observed to treat as worth having. */
  social_values: string[];
  /** Live frictions, not timeless traits. These date fastest. */
  current_tensions: string[];
  /** Concrete things that carry meaning here. Never decoration. */
  cultural_symbols: string[];
  /** Behaviour that has measurably moved, with a direction. */
  behavior_shifts: string[];
  /** How people talk: register, indirection, what is left unsaid. */
  language_patterns: string[];
  /** ISO date. These observations expire. */
  reviewed: string;
  /** True where a person from this market should check before shipping. */
  needs_local_review: boolean;
}

/** The empty context. Returned rather than a guess. */
export const NO_CULTURE: CulturalContext = {
  country: "unspecified",
  generation: "unspecified",
  social_values: [],
  current_tensions: [],
  cultural_symbols: [],
  behavior_shifts: [],
  language_patterns: [],
  reviewed: "",
  needs_local_review: false,
};

/**
 * Vietnam, urban, 2026.
 *
 * Written from what the briefs in this repository actually describe — bilingual
 * menus that make one audience the afterthought, Tet campaigns that apply Western
 * holiday conventions, imported formulations used in a tropical climate, family
 * members choosing elder care. Those are the observations; the generalisations
 * below are the smallest ones that account for them.
 *
 * Deliberately absent: anything about diligence, warmth, or values that could be
 * said about any population and would function only as flattery.
 */
const VIETNAM_BASE: Omit<CulturalContext, "generation"> = {
  country: "vn",
  social_values: [
    "a decision that can be explained to the family that will ask about it",
    "visible care for parents, which is read as evidence of character",
    "education as the family's shared investment rather than the child's own project",
    "not causing another person to lose face, including a stranger doing their job",
    "thrift that is competence rather than constraint, and is not admitted to as either",
  ],
  current_tensions: [
    "imported goods carry authority, and the authority is not always earned in local conditions",
    "the household is consulted on purchases the buyer is nominally making alone",
    "a rising professional class whose spending is visible to relatives whose norms it exceeds",
    "English signals modernity and excludes; Vietnamese signals belonging and reads as less premium",
    "urban density makes private need publicly observable in ways the category ignores",
  ],
  cultural_symbols: [
    "the shared table, where the order is made for everyone rather than by everyone",
    "Tet as an accounting of the year rather than a decorative occasion",
    "the motorbike as the unit of daily logistics and of independence",
    "the alley shop whose proprietor knows the household",
    "the ancestral altar, which makes the home a place with an audience",
  ],
  behavior_shifts: [
    "product research has moved to peer video and group chat, ahead of retailer and brand channels",
    "cash has given way to transfer and wallet, which makes household spending legible to the household",
    "renting in cities is losing its status penalty among younger professionals, unevenly",
    "second-hand and resale have moved from necessity to preference in fashion",
  ],
  language_patterns: [
    "refusal is expressed as difficulty rather than as no",
    "a complaint is delivered as a question about whether something was misunderstood",
    "seniority is encoded in the pronoun before anything is said, so register is a decision made first",
    "superlatives in advertising are discounted heavily; specificity reads as honesty",
  ],
  reviewed: "2026-09-08",
  needs_local_review: true,
};

/**
 * Generational deltas, applied on top of the market.
 *
 * Deltas rather than whole contexts, because most of what is true of a market is
 * true across its generations, and a per-generation library repeats itself into
 * contradiction.
 */
const VN_GENERATION: Record<CulturalGeneration, Partial<CulturalContext>> = {
  gen_z: {
    current_tensions: [
      "expected to be fluent in a global culture and to remain legible to a family that is not",
      "career paths their parents cannot evaluate, and therefore cannot endorse",
    ],
    behavior_shifts: ["brand discovery happens in comment sections rather than in search"],
    language_patterns: ["code-switches mid-sentence; a fully Vietnamese ad can read as addressed to someone older"],
  },
  millennial: {
    current_tensions: [
      "supporting parents and children at once, on an income that is the first in the family to be discretionary",
      "the first generation to be sold self-care in a culture that reads self-spending as indulgence",
    ],
    behavior_shifts: ["moved household purchasing decisions online while keeping the family consultation intact"],
    language_patterns: [],
  },
  gen_x: {
    current_tensions: ["asked to adopt tools their juniors already assume, without being seen to learn them"],
    behavior_shifts: [],
    language_patterns: ["responds to plain claims; treats stylistic effort as a cost passed on"],
  },
  boomer: {
    current_tensions: ["decisions increasingly made for them by adult children, and framed as care"],
    behavior_shifts: [],
    language_patterns: ["formality is not distance; its absence is noticed"],
  },
  unspecified: {},
};

/** The library. One market in depth; the rest decline. */
export const CULTURAL_LIBRARY: Record<string, Omit<CulturalContext, "generation">> = {
  vn: VIETNAM_BASE,
};

export const GENERATION_DELTAS: Record<string, Record<CulturalGeneration, Partial<CulturalContext>>> = {
  vn: VN_GENERATION,
};

/** Surface forms that identify a market. Vietnamese diacritics included. */
export const COUNTRY_RULES: [RegExp, string][] = [
  [
    /\b(?:vietnam|vietnamese|viet nam|hanoi|saigon|ho chi minh|hcmc|da nang|hue|can tho|tet)\b|việt nam|hà nội|sài gòn|tết|đồng/i,
    "vn",
  ],
];

/** Surface forms that identify a generation. */
export const GENERATION_RULES: [RegExp, CulturalGeneration][] = [
  [/\bgen[\s-]?z\b|\b1[89]\s*(?:to|-)\s*2[0-9]\b|\bstudents?\b|\bteens?\b/i, "gen_z"],
  [/\bmillennial|\b2[5-9]\s*(?:to|-)\s*3[0-9]\b|\byoung (?:professional|parent|famil)/i, "millennial"],
  [/\bgen[\s-]?x\b|\b4[0-9]\s*(?:to|-)\s*5[0-9]\b|\bmature (?:buyer|professional)/i, "gen_x"],
  [/\bboomer|\b6[0-9]\s*(?:to|-)\s*[78][0-9]\b|\belder|\bretire/i, "boomer"],
];
