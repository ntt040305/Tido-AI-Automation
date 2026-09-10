/**
 * CIOS Phase 4.0.3 — human insight depth.
 *
 * What the 4.0.2 benchmark actually showed
 * ----------------------------------------
 * `human_truth` scored 3.3 of 25 across a hundred briefs, and the gate rejected
 * 84 cases with 83 of them classed MATERIAL — no construction over the retrieved
 * material addressed the brief's problem. The corpus held 23 distinct tensions
 * for 100 briefs, and one of them ("promised the same result by nine brands")
 * led four unrelated campaigns.
 *
 * The cause is the primitive, not the corpus size. Retrieval asks "which stored
 * tension best matches this brief" and answers it even when the honest answer is
 * "none of them". A strategist does not work that way: they start from what the
 * client said is hard and *ladder down* to why it is hard for a person. The
 * tension is derived, not looked up, and it is anchored to this brief because it
 * was built from this brief's own words.
 *
 * So this layer inverts the primitive. The brief's stated challenge is rung one.
 * Each subsequent rung is a transformation of the one above it. Knowledge supplies
 * vocabulary and corroboration; it no longer supplies the tension itself.
 *
 * What this is, stated plainly
 * ----------------------------
 * The ladder is a *transformation grammar*, not reasoning. It classifies a stated
 * problem into one of a set of human problem archetypes and applies that
 * archetype's structure, specialised with the brief's own concrete terms. That is
 * a real and checkable operation, and it is not insight in the sense a planner
 * means — which requires knowing something about people that is not written down
 * anywhere in this repository.
 *
 * Two consequences follow, and both are honoured below:
 *
 *   1. The archetype library is authored knowledge living in code. It is small,
 *      it is visible, and where a brief matches nothing in it the analyzer says
 *      so rather than forcing the nearest fit — the failure mode that produced
 *      the 4.0.2 result in the first place.
 *   2. Every quality dimension here is a proxy. `depth` counts rungs that
 *      actually transformed; it cannot tell a profound truth from a well-formed
 *      one. The labels below say so, and `HumanInsightAuthor` is the seam where a
 *      model that can tell the difference plugs in.
 */

// ── The ladder ────────────────────────────────────────────────────────────

/**
 * Seven rungs from what is observably the case to what a brand can do about it.
 *
 * Phase 4.0.3.6 restructured this. The 4.0.3 ladder had eight rungs and two of
 * them — the functional problem and the unspoken desire — were doing the same
 * work as their neighbours, while the two that mattered most were fused: an
 * identity conflict and a social fear are different things, and separating them
 * is what lets a truth be about who someone is rather than only about what they
 * risk. The eighth rung is new: `creative_opportunity` is the bridge to the
 * expression layer, which previously had to infer it.
 *
 * Order is load-bearing. Each rung is derived from the one above it, so a rung
 * that cannot be derived truncates the ladder rather than being invented — a
 * fabricated middle rung would make every rung below it fiction, and `depth`
 * would score the fiction.
 */
export const INSIGHT_LADDER = [
  /** What is observably the case. The brief's own sentence, unchanged. */
  "observed_reality",
  /** What the person actually does about it. Read, or reconstructed. */
  "behavior",
  /** What the doing of it feels like, and is not said to feel like. */
  "hidden_emotion",
  /** What accepting the offer would cost them in who they take themselves to be. */
  "identity_conflict",
  /** What other people would conclude, which is the thing actually being avoided. */
  "social_fear",
  /** The statement about people that all of the above is a case of. */
  "human_truth",
  /** What a brand could do with it. The bridge to expression. */
  "creative_opportunity",
] as const;

export type InsightLadderStep = (typeof INSIGHT_LADDER)[number];

export interface LadderRung {
  step: InsightLadderStep;
  /** The rung itself, as a sentence. */
  statement: string;
  /** How it was obtained from the rung above. */
  derivation: string;
  /** knowledge_ids that corroborate it, where any did. May be empty. */
  evidence: string[];
  /**
   * 0-1. How much of this rung came from the brief versus from the archetype.
   * A rung the archetype supplied wholesale is weaker than one the brief's own
   * terms specialised, and the score says which.
   */
  specificity: number;
}

// ── The insight ───────────────────────────────────────────────────────────

export interface HumanInsight {
  /** The universal statement. Rung eight. */
  human_truth: string;
  /** What follows from it for this audience and category. */
  consumer_insight: string;
  /** The mechanism — why this feeling arises, not that it does. */
  why_people_feel_this: string;
  /** What makes it live now rather than at any time. */
  why_now: string;
  ladder: LadderRung[];
  /** Which archetype the surface problem was classified as. */
  archetype: string;
  /** Steps that could not be derived, named. */
  truncated_at?: InsightLadderStep;
  /**
   * Phase 4.0.3.5. The discovery layer's output, where it produced one.
   *
   * Present as evidence, not as decoration: the tension statement, the observable
   * behaviour it was built from, and the confidence that says how much of it came
   * from the brief rather than from a default.
   */
  dynamic_tension?: import("./DynamicHumanTensionDiscovery").DynamicHumanTension | null;
  /**
   * How the truth shows up in this market, where a market was established.
   *
   * Kept separate from `human_truth` deliberately. The truth stays universal —
   * that is what `universality` scores, and a culturally-specific truth is a
   * local observation rather than a truth. Culture enters the social rung above
   * it and this expression below it.
   */
  cultural_grounding?: string;
  /** The market and generation the grounding came from, or "unspecified". */
  cultural_market?: string;
  warnings: string[];
}

// ── Shallowness ───────────────────────────────────────────────────────────

/**
 * Statements that are true of everyone and therefore about no one.
 *
 * These are not banned words, they are banned *propositions*: "customers want
 * quality" fails not because "quality" is forbidden but because the sentence
 * survives having its subject replaced by any other audience and its category by
 * any other category. That substitution test is what `universality` inverts —
 * a human truth should generalise across people while staying specific to a
 * situation, and these generalise across situations too.
 */
export const SHALLOW_PROPOSITIONS: RegExp[] = [
  /\b(?:customers?|consumers?|people|users?|shoppers?|buyers?|they)\s+(?:want|need|expect|prefer|look for|desire|seek)\s+(?:more\s+)?(?:quality|convenience|value|trust|choice|simplicity|reliability|the best|good products?|better products?|savings?)\b/i,
  /\b(?:everyone|everybody|all customers?|all people)\s+(?:wants?|needs?|likes?|prefers?)\b/i,
  /\bpeople (?:are busy|have no time|do not have time|don't have time)\b/i,
  /\b(?:quality|convenience|value for money|customer satisfaction|peace of mind)\s+(?:is|are)\s+(?:important|key|essential|what matters)\b/i,
  /\bwants? to (?:feel|look) (?:good|better|great|confident)\b/i,
];

/** Abstractions that describe a feeling without naming one. */
export const EMPTY_ABSTRACTIONS = [
  "experience", "solution", "journey", "lifestyle", "wellness", "empowerment",
  "satisfaction", "engagement", "connection", "authenticity", "innovation",
];

// ── Creative lenses ───────────────────────────────────────────────────────

/**
 * How an insight becomes an idea.
 *
 * Kept separate from insight generation on purpose. Phase 4.0.1.5 fused the two
 * — the rhetorical angle was chosen while the material was assembled — and the
 * result was that improving expression and improving insight were the same edit,
 * so neither could be measured. Here the insight is finished and scored before
 * any lens touches it, and the same insight can be expressed six ways.
 */
export const CREATIVE_LENSES = [
  /** State the feeling, then invert who is at fault for it. */
  "emotional_reversal",
  /** Report the behaviour as an observed fact about how people here live. */
  "cultural_observation",
  /** Assert the thing that is true and not expected to be said. */
  "unexpected_truth",
  /** Put it in the person's own voice, as something admitted. */
  "human_confession",
  /** Carry the truth on a concrete object or act that stands for it. */
  "symbolic_metaphor",
  /** Take a position the category would rather not take. */
  "provocative_statement",
] as const;

export type CreativeLens = (typeof CREATIVE_LENSES)[number];

export interface ExpressedIdea {
  big_idea: string;
  lens: CreativeLens;
  /** The insight this expresses, unchanged by the expression. */
  human_truth: string;
  why_it_works: string;
  emotional_hook: string;
  strategic_reason: string;
}

// ── Insight quality ───────────────────────────────────────────────────────

/** The rubric, weighted to 100. */
export const INSIGHT_QUALITY_WEIGHTS = {
  depth: 25,
  tension: 25,
  universality: 20,
  specificity: 15,
  strategic_relevance: 15,
} as const;

export type InsightQualityDimension = keyof typeof INSIGHT_QUALITY_WEIGHTS;

/**
 * Every dimension here is a proxy, and the report says so on every run.
 *
 * This is a change of posture from the 4.0.1.5 rubric, which called `human_truth`
 * and `strategic_fit` MEASURED. They compared shared vocabulary between two
 * texts, which is a real comparison of the wrong thing: on the 4.0.2 run a
 * tension and a brief problem that were the same idea in different words scored
 * 0.000. Calling that MEASURED put a confidence on it that it could not carry.
 *
 * Nothing below claims better. `depth` counts rungs that transformed rather than
 * restated; `tension` looks for two poles in opposition; `universality` runs the
 * substitution test; `specificity` counts terms only this brief could supply;
 * `strategic_relevance` checks the objective is reachable from the truth. Each is
 * a checkable property that correlates with the thing it is named for, and none
 * of them is that thing.
 */
export const INSIGHT_QUALITY_METHOD: Record<InsightQualityDimension, "PROXY"> = {
  depth: "PROXY",
  tension: "PROXY",
  universality: "PROXY",
  specificity: "PROXY",
  strategic_relevance: "PROXY",
};

export interface InsightQualityScore {
  case_id: string;
  /** 0-1 per dimension, before weighting. */
  dimensions: Record<InsightQualityDimension, number>;
  /** Weighted total out of 100. */
  total: number;
  method: Record<InsightQualityDimension, "PROXY">;
  /** Shallow propositions found, quoted. */
  shallow_hits: string[];
  notes: string[];
}

// ── Seam ──────────────────────────────────────────────────────────────────

/**
 * Where a model that can actually judge an insight plugs in.
 *
 * It receives the ladder the analyzer built and returns a better rung eight, or
 * nothing. Everything downstream — the quality gate, the diversity controller,
 * the expression layer — operates on the result either way, so an authored truth
 * faces exactly the same measurement a derived one does.
 */
export interface HumanInsightAuthor {
  refine(insight: HumanInsight, brief: { challenge: string; audience: string; product: string }):
    | Promise<Partial<HumanInsight> | null>
    | Partial<HumanInsight>
    | null;
}
