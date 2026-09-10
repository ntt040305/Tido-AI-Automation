/**
 * CIOS Phase 4.0.5 — creative structures, and what a memory of them is for.
 *
 * The distinction this file rests on
 * --------------------------------
 * `CreativeTasteMemory` already reduces an idea to a *template fingerprint* —
 * "· is why we · the ·" — which identifies the frame that produced it. That is
 * bookkeeping about the generator, and it is useful for retiring a frame.
 *
 * A creative structure is a different object. "The fault is not where everyone
 * puts it" is a device, not a template: it can be written a hundred ways, it
 * predates this system, and a planner would recognise it in work from any
 * agency. Two ideas from different frames can share a structure, and two ideas
 * from the same frame can differ in one.
 *
 * Structures are what a memory of *judgement* should hold, because they are the
 * thing that transfers between briefs. A template that worked on a fashion brief
 * tells you almost nothing about a clinic; a structure that worked might.
 *
 * The line this file will not cross
 * --------------------------------
 * A memory of what worked, applied without restraint, is a formula. If the run
 * learns that `OBJECT_CARRYING_TRUTH` succeeds and then reaches for it every
 * time, the memory has not made the work better — it has made it uniform, and
 * uniform is the failure this codebase has spent four phases removing.
 *
 * So the retrieval side is built to *widen* rather than narrow: it reports which
 * structures have worked in a context, which are saturated in the current run,
 * and it always leaves a share of generation unguided. Those three together are
 * the difference between memory and formula, and each is enforced in code rather
 * than intended in a comment.
 */

/**
 * The five structures Phase 4.0.5 names.
 *
 * Deliberately five and deliberately old: these are devices a creative
 * department would name without prompting, not categories invented to fit this
 * engine's output. A structure the system cannot produce is still worth
 * detecting, because its absence is then reportable.
 */
export const CREATIVE_STRUCTURES = [
  /** The fault is not where everyone puts it. Blame moves off the person. */
  "emotional_reversal",
  /** One concrete thing carries the whole argument. */
  "object_carrying_truth",
  /** An ordinary repeated act is made the subject. */
  "human_ritual",
  /** Who someone is, or has stopped being, is the stake. */
  "identity_transformation",
  /** The situation seen from somewhere nobody stands. */
  "unexpected_perspective",
] as const;

export type CreativeStructure = (typeof CREATIVE_STRUCTURES)[number];

export interface StructureDetection {
  structure: CreativeStructure;
  /** 0-1. How strongly the idea exhibits it. */
  strength: number;
  /** What in the text carried it. */
  evidence: string;
}

/**
 * One decision, remembered.
 *
 * Richer than `TasteMemoryEntry`, which recorded a score and a template. This
 * holds the director's own reasoning — what worked, what failed, and at which
 * stage — because a memory that stores only outcomes can rank patterns and
 * cannot explain them.
 */
export interface TasteMemoryRecord {
  case_id: string;
  idea: string;
  decision: "PURSUE" | "MODIFY" | "REJECT";
  /** The structures the idea exhibits. An idea can carry more than one. */
  structures: StructureDetection[];
  /** In the director's terms, why it survived what it survived. */
  why_worked: string[];
  /** In the director's terms, what went wrong and at which stage. */
  why_failed: string[];
  /** Which stage blocked it, where one did. */
  blocked_at?: string;
  /** The context a future retrieval matches on. */
  context: {
    industry: string;
    brand: string;
    /** Which motivation family the insight came from. */
    family: string;
    territory: string;
  };
  /** Carried so a retrieval can weigh a strong success above a marginal one. */
  score: number;
  /** The band the idea's interpretation of its truth fell in. */
  interpretation_band: string;
}

/**
 * What retrieval hands back before generation.
 *
 * Three lists rather than one ranking, because all three are needed to guide
 * without dictating: what has worked here, what this run has already used too
 * much of, and what has never been tried at all.
 */
export interface TasteGuidance {
  /** Structures with evidence of working in this context, best first. */
  suggested: { structure: CreativeStructure; success_rate: number; evidence: string }[];
  /** Structures this run has leaned on too heavily. Suppressed, not banned. */
  saturated: { structure: CreativeStructure; share: number }[];
  /** Structures with no record in this context. Kept available on purpose. */
  untried: CreativeStructure[];
  /**
   * 0-1. The share of generation that must remain unguided.
   *
   * The single most important field here. Without it a memory closes the search
   * space it was meant to inform.
   */
  novelty_reserve: number;
  /** Whether there was enough evidence to guide at all. */
  confident: boolean;
  notes: string[];
}

/** Below this many observations in a context, retrieval declines to guide. */
export const MIN_CONTEXT_OBSERVATIONS = 4;

/** A structure above this share of a run's ideas is saturated. */
export const SATURATION_SHARE = 0.35;

/** Never guide more than this proportion of generation. */
export const MAX_GUIDED_SHARE = 0.6;
