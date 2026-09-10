import { BrandDNA } from "./brand-dna.types";
import { CreativeStructure } from "./creative-patterns.types";
import { CreativeTerritory } from "./creative-taste.types";
import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { InsightContradiction } from "./InsightContradictionEngine";
import { MemoryMechanism } from "./emotional-mechanism.types";

/**
 * CIOS Phase 4.0.7 — the generation seam.
 *
 * What the audit found, and why this file exists
 * ---------------------------------------------
 * The Phase 4.0.6 benchmark blamed the evaluators; the audit blamed the
 * generator, with numbers:
 *
 *   4.98 ideas per brief, from exactly one territory
 *   four of six modes firing exactly 92 times — once per brief, mechanically
 *   one frame emitted 48 times as a *constant string*, no material spliced
 *   emotional_reversal and human_ritual never produced at all
 *   human_confession manufacturing 85 of 121 recognitions, at 92% of its output
 *   REPLACE_BRAND failing on 76% of everything
 *
 * That is not a population a ranking can choose from. It is six sentences with
 * the nouns swapped, and the reason `PURSUE` is zero is that nothing in the pool
 * was ever a candidate.
 *
 * So generation becomes a seam with an interface, rather than a fixed list of
 * frames. A provider is asked for candidates *given a direction* — a territory,
 * optionally a structure to search in, optionally a psychological objective —
 * and returns whatever it can honestly produce. The deterministic provider is
 * the fallback and the test harness; the LLM provider is the one that can
 * actually write.
 *
 * The rule this phase runs under
 * -----------------------------
 * No evaluator, rubric or threshold changes. The benchmark stays an independent
 * judge, which is the only way the numbers at the end mean anything. Everything
 * here is upstream of the first evaluator.
 */

export interface CreativeCandidate {
  /** The idea itself. */
  idea: string;
  /** Which territory it was generated against. */
  territory: string;
  /** The structure it was *aimed at*, where it was aimed at one. */
  structure_direction?: CreativeStructure;
  /** The psychological objective it was *aimed at*, where there was one. */
  mechanism_objective?: MemoryMechanism;
  /** Which provider made it, for provenance. */
  provider: string;
  /** A short account of how it was constructed. */
  derivation: string;
  /**
   * True where the candidate was produced with no direction at all.
   *
   * Tracked because the phase requires a share of generation to stay unguided,
   * and a share that is not measured is a share that quietly goes to zero.
   */
  unguided: boolean;
}

/**
 * Everything a provider is given.
 *
 * Deliberately the whole insight rather than a summary: a provider that can only
 * see a truth writes about the truth, which is the `ECHO` failure Phase 4.0.4.1
 * measured. The material below is what an idea can be built *from* without
 * repeating any of it.
 */
export interface GenerationRequest {
  human_truth: string;
  contradiction: InsightContradiction;
  tension: DynamicHumanTension | null;
  brand_dna: BrandDNA;
  territory: CreativeTerritory;
  /** The brief's own particulars, for anchoring. */
  brief: {
    brand: string;
    product: string;
    audience: string;
    category: string;
    objective?: string;
    challenge: string;
    key_phrase?: string;
  };
  /** A structure to search in. Absent means unguided. */
  structure_direction?: CreativeStructure;
  /** A psychological objective. Absent means unguided. */
  mechanism_objective?: MemoryMechanism;
  /** Ideas already produced, which the provider must not paraphrase. */
  avoid: string[];
  /**
   * Sentence openings the pool already has enough of.
   *
   * Paraphrase rejection is not enough on its own. The first run of the searched
   * pool produced thirteen of eighteen candidates opening on the same behaviour
   * clause — "Women stopped believing the category ..." — with different tails.
   * None was a paraphrase of another by any similarity measure, and a director
   * looking at the page would still see one idea thirteen times. An opening that
   * has been used its share is listed here, and a provider reaching for it should
   * reach for something else instead.
   */
  avoid_openings: string[];
  /** How many candidates are wanted from this call. */
  count: number;
}

export interface CreativeGenerationProvider {
  readonly name: string;
  /**
   * True where `generate` returns a promise.
   *
   * Declared rather than detected. The population builder has a synchronous
   * driver, and the only way to detect asynchrony by inspection is to call the
   * provider and look at what comes back — which, for the LLM provider, means
   * making a network request purely to discover that it should not have been
   * called. A declared flag costs one line and no request.
   */
  readonly asynchronous?: boolean;
  /** True where the provider can actually run right now. */
  available(): boolean;
  generate(request: GenerationRequest): Promise<CreativeCandidate[]> | CreativeCandidate[];
}

/**
 * A candidate in the shape `IdeaRankingEngine` already accepts.
 *
 * Identical to `ModeExpression` except that `mode` is a plain string, because a
 * candidate generated against a structure or a psychological objective has no
 * honest expression-mode label and stamping one on it would put a false
 * provenance into taste memory. The ranker reads `big_idea` and carries `mode`
 * through untouched, so widening the input type changes no evaluation.
 */
export interface RankableIdea {
  big_idea: string;
  mode: string;
  /**
   * The ground this candidate was generated on.
   *
   * Needed because a pool now spans several territories, and the ranker's own
   * `territory` argument is a single one. Without this every candidate would be
   * labelled with the primary territory regardless of where it came from, and
   * taste memory would learn from a false provenance. Optional, so
   * `ModeExpression` still satisfies the type.
   */
  territory?: string;
  human_truth: string;
  why_it_works: string;
  emotional_hook: string;
  strategic_reason: string;
}

// ── Psychological objectives (Task 4) ─────────────────────────────────────

/**
 * What each mechanism asks a writer to *do*.
 *
 * These are objectives, not templates, and the distinction is the whole of Task
 * 4. A template says "write: What looks like X is usually Y". An objective says
 * "surface a private behaviour the audience would recognise in themselves" and
 * leaves the sentence open. The deterministic provider satisfies an objective by
 * choosing *different material and a different construction*, not by filling a
 * different frame — which is why each entry below names the material to reach
 * for rather than a shape to pour it into.
 */
export const MECHANISM_OBJECTIVES: Record<MemoryMechanism, { asks: string; reach_for: string }> = {
  recognition: {
    asks: "surface a private behaviour the audience would recognise in themselves",
    reach_for: "the observed behaviour, stated as something done rather than something felt",
  },
  relief: {
    asks: "name a burden they assumed was their own fault, and take it off them",
    reach_for: "the social consequence, reassigned from the person to the category",
  },
  transgression: {
    asks: "say a relevant true thing the category leaves unsaid",
    reach_for: "the stake, stated as the thing nobody in this market will admit",
  },
  concretion: {
    asks: "find one object, place or act capable of carrying the whole truth",
    reach_for: "a concrete noun from the brief's own situation, made the subject",
  },
  reversal: {
    asks: "move blame, meaning or responsibility somewhere unexpected and defensible",
    reach_for: "the identity cost, with the fault relocated to what made it cost anything",
  },
};

/**
 * What each structure asks a writer to build.
 *
 * Same discipline as the mechanisms: a direction to search in, not a sentence to
 * produce. A provider that cannot honestly reach a structure with the material it
 * has should return fewer candidates rather than a forced one — Phase 4.0.3
 * established that a forced fit is worse than a gap, and nothing since has
 * contradicted it.
 */
export const STRUCTURE_DIRECTIONS: Record<CreativeStructure, string> = {
  emotional_reversal: "put the fault somewhere other than where the audience has been putting it",
  object_carrying_truth: "let one concrete thing do the whole argument",
  human_ritual: "make an ordinary repeated act the subject",
  identity_transformation: "make who they are, or have stopped being, the thing at stake",
  unexpected_perspective: "describe it from a position nobody in the category stands in",
};

// ── Self-containment (Task 5) ─────────────────────────────────────────────

export interface SelfContainmentResult {
  /** True where the idea carries its own tension without the deck. */
  contained: boolean;
  /** 0-1. How much of the tension survives on the sentence alone. */
  strength: number;
  /** What is missing, where something is. */
  missing: string[];
  reason: string;
}

/** Below this a candidate is sent back for another attempt before ranking. */
export const SELF_CONTAINMENT_FLOOR = 0.45;

// ── Diversity guard (Task 7) ──────────────────────────────────────────────

export interface PoolDiagnosis {
  candidates: number;
  distinct_ideas: number;
  duplicate_rate: number;
  structures: number;
  mechanisms: number;
  territories: number;
  unguided_share: number;
  /** Search spaces the pool is missing, for a regeneration pass. */
  gaps: {
    structures: CreativeStructure[];
    mechanisms: MemoryMechanism[];
    territories: boolean;
  };
  healthy: boolean;
  notes: string[];
}

/** What a pool has to contain before it is worth ranking. */
export const POOL_TARGETS = {
  min_candidates: 12,
  max_candidates: 18,
  min_structures: 3,
  min_mechanisms: 3,
  min_territories: 2,
  max_duplicate_rate: 0.15,
  /** The share of generation that must stay undirected. */
  min_unguided_share: 0.3,
  max_unguided_share: 0.4,
};
