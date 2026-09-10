import { CreativeConcept } from "./creative-concept.types";

/**
 * CIOS Phase 3.1.8.1 — concept / art direction separation.
 *
 * The human benchmark's blindness audit found that CIOS was not producing
 * concepts. Measured across all thirty benchmark cases:
 *
 *   big idea source domain   layout 20 · strategy 4 · lighting 2 · color 2 · material 1 · typography 1
 *   contaminated big ideas   22 of 30
 *
 * So the campaign's central thought was a layout rule — "The subject within the
 * upper 65 percent and reserve the lower 35 percent for platform interface" —
 * twenty times out of thirty. That is not a weak idea; it is an art direction
 * decision wearing the wrong label, and it made the two layers indistinguishable
 * from each other and the blind test impossible to run.
 *
 * The two layers answer different questions and this schema is what keeps them
 * apart:
 *
 *   CreativeConcept   WHY anyone should care.  big_idea, consumer_insight,
 *                     core_message, differentiation.
 *   CreativeDirection HOW to execute it.       composition, camera, lighting,
 *                     typography, material, colour, atmosphere.
 *
 * A concept containing a lens, a percentage or a frame position has skipped its
 * own layer. The gate below rejects it rather than annotating it, because a
 * concept that reads as production instruction is not a marginal concept — it is
 * the wrong kind of object.
 */

export type ConceptViolationKind =
  /** Frame geometry: percentages of frame, thirds, axes, upper/lower bands. */
  | "LAYOUT_INSTRUCTION"
  /** Lens, focal length, angle, shot distance, depth of field. */
  | "CAMERA_INSTRUCTION"
  /** Sources, ratios, direction of light, shadow behaviour. */
  | "LIGHTING_INSTRUCTION"
  /** Type levels, weights, tracking, leading, faces. */
  | "TYPOGRAPHY_INSTRUCTION"
  /** Any bare quantity: a concept does not carry numbers. */
  | "MEASUREMENT"
  /** Surface, finish and material rendering notes. */
  | "MATERIAL_INSTRUCTION"
  /** The lead knowledge object came from an art direction domain. */
  | "ART_DIRECTION_SOURCE"
  /** No idea was produced at all. */
  | "MISSING_BIG_IDEA"
  /**
   * Phase 4.0 — a required element of a complete concept is absent.
   *
   * A valid concept needs a tension, an insight, an emotional direction and a
   * differentiation. Before Phase 4.0 the corpus could not supply the first
   * three, so requiring them would have rejected everything; the Creative
   * Concept Intelligence layer is what makes the requirement enforceable.
   */
  | "INCOMPLETE_CONCEPT";

export interface ConceptViolation {
  kind: ConceptViolationKind;
  /** Which concept field carried it. */
  field: keyof CreativeConcept;
  /** The offending text, quoted so the finding can be acted on. */
  evidence: string;
  /** What made it a violation, in one line. */
  reason: string;
}

/**
 * The result of validating one concept.
 *
 * `separation_score` is reported alongside `valid` rather than instead of it: a
 * concept with one borderline measurement and one with six layout instructions
 * are both invalid, and a reviewer triaging a corpus needs to tell them apart.
 */
export interface CreativeConceptValidation {
  valid: boolean;
  violations: ConceptViolation[];
  /** 0-10. Ten is a concept with no execution language anywhere in it. */
  separation_score: number;
  /** Fields that were checked and came back clean. */
  clean_fields: (keyof CreativeConcept)[];
  /**
   * True when the concept says nothing at all.
   *
   * Distinguished from a contaminated concept because the two need different
   * responses: contamination is a routing fault, absence is a corpus gap.
   */
  empty: boolean;
}

/** Concept fields the gate inspects. Everything else is execution or provenance. */
export const CONCEPT_PROSE_FIELDS: (keyof CreativeConcept)[] = [
  "big_idea",
  "consumer_insight",
  "core_message",
  "differentiation",
];

/**
 * Domains a big idea may be built from.
 *
 * Everything absent from this list describes execution. `industry` is included
 * because a category communication model is genuine strategic material; `critic`
 * and `channel` are not, because one evaluates work and the other constrains
 * delivery — neither is a reason for anyone to care.
 */
export const CONCEPT_LEAD_DOMAINS = new Set([
  // Phase 4.0 — the Creative Concept Intelligence domains, authored specifically
  // to lead. Listed first because `pickLead` walks this order and a tension or a
  // territory is a better source for a big idea than a strategy rule is.
  "human_tension",
  "consumer_insight",
  "campaign_territory",
  "idea_pattern",
  "strategy",
  "concept",
  "audience",
  "category",
  "differentiation",
  "industry",
]);

/**
 * Preference order for the concept lead.
 *
 * A human tension is the strongest starting point for a campaign idea, a
 * territory the next. `industry` sits last: a category communication model can
 * ground an idea but rarely is one.
 */
export const CONCEPT_LEAD_PRIORITY = [
  "human_tension",
  "campaign_territory",
  "consumer_insight",
  "idea_pattern",
  "strategy",
  "concept",
  "audience",
  "differentiation",
  "category",
  "industry",
];

/** Domains whose decisions are execution, and can never lead a concept. */
export const ART_DIRECTION_DOMAINS = new Set([
  "layout",
  "composition",
  "camera",
  "lighting",
  "photography",
  "color",
  "colour",
  "typography",
  "material",
  "visual_direction",
]);
