import { MotivationFamily } from "./human-motivation.types";

/**
 * CIOS Phase 4.0.3.7 — the third stage of situation recovery.
 *
 * Where the first two stages stop
 * ------------------------------
 * Explicit extraction reads a behaviour out of the brief's sentence. Latent
 * reconstruction infers one from the shape of a stated condition. Between them
 * they served 87 of 100 briefs, and the 13 that remained divide cleanly:
 *
 *   9  a motivation family matched, and neither stage produced a behaviour
 *   2  production constraints, correctly declined
 *   2  no family matched either
 *
 * The nine are the interesting ones. "Her skin has reacted badly before, and the
 * memory of that outweighs any improvement a new product could promise" states a
 * situation with no verb the extractor can use and no condition shape the
 * reconstructor recognises — but HARM_MEMORY matched it on real evidence in the
 * text. The family is the finding; what is missing is only the sentence that
 * would carry it.
 *
 * So expansion builds that sentence from the family and the brief's own fields.
 *
 * The rule that governs this file
 * ------------------------------
 * **No emotion is invented here.** Every emotional term in an expanded situation
 * comes from the family that was matched on evidence in the brief's text, never
 * from a guess about how someone in this category probably feels. What expansion
 * supplies is *structure* — a moment, a place, a thing being weighed — assembled
 * from the audience, the product and the family's own account of the stake.
 *
 * Confidence is capped below reconstruction, which is itself capped below
 * reading. Three stages, three ceilings, and the report says which produced each
 * tension. A brief served by expansion is a brief the system had the least to go
 * on for, and that has to remain visible.
 */

export interface ExpandedHumanSituation {
  /** The brief's sentence, unchanged. */
  surface_statement: string;
  /** The situation, assembled from the family and the brief's fields. */
  constructed_situation: string;
  /** The act the family implies, phrased so a sentence can carry it. */
  implied_behavior: string;
  /** When and where this happens, from the channel and category. */
  occasion: string;
  /** What is being weighed at that moment. From the family's stake. */
  what_is_weighed: string;
  /** Which brief fields were actually used. Empty is possible and honest. */
  built_from: string[];
  /** 0-1. Capped below reconstruction: this is assembly, not reading. */
  confidence: number;
}

/**
 * How each family's situation reads when it has to be assembled.
 *
 * One entry per family, keyed by id. Each supplies a behaviour phrased as an act
 * and an occasion phrased as a moment — the two things a sentence needs and the
 * brief did not give. Neither names a feeling: the feeling is the family's, and
 * the family was matched on the brief's own words.
 */
export interface ExpansionTemplate {
  /** What someone in this situation is doing, as a plural verb phrase. */
  implied_behavior: string;
  /** The moment it happens in. */
  occasion: string;
}

export const EXPANSION_TEMPLATES: Record<string, ExpansionTemplate> = {
  EXPOSURE: {
    implied_behavior: "time the visit for when the place is empty",
    occasion: "the few seconds between reaching for it and being seen reaching for it",
  },
  COMPETENCE: {
    implied_behavior: "read past the introduction looking for the part written for them",
    occasion: "the moment the explanation starts again from the beginning",
  },
  VERIFICATION: {
    implied_behavior: "look for a second source before believing the first",
    occasion: "the moment a claim arrives in the same form as the last one",
  },
  PRICE_EXPOSURE: {
    implied_behavior: "work out the real total before agreeing to the quoted one",
    occasion: "the gap between the price named and the price paid",
  },
  COHERENCE: {
    implied_behavior: "look for the version of it addressed to someone like them",
    occasion: "the moment the category shows who it thinks it is talking to",
  },
  LOAD: {
    implied_behavior: "keep the worse method because it is already running",
    occasion: "the moment a better option turns out to need setting up",
  },
  HARM_MEMORY: {
    implied_behavior: "weigh a new promise against a thing that already happened",
    occasion: "the moment before trying something from the same category again",
  },
  RESPONSIBILITY: {
    implied_behavior: "gather more than they need so the choice can be defended",
    occasion: "the moment the decision becomes theirs to sign",
  },
  INVISIBLE_WORK: {
    implied_behavior: "keep doing it without any sign that it is working",
    occasion: "the long stretch where nothing happens and nothing confirms it",
  },
  MISMATCH: {
    implied_behavior: "translate what they are told into what they will actually get",
    occasion: "the moment the specification meets the situation it was not written for",
  },
};

/** Builds the expansion for a family, or nothing if it has no template. */
export function expansionFor(family: MotivationFamily): ExpansionTemplate | null {
  return EXPANSION_TEMPLATES[family.id] || null;
}
