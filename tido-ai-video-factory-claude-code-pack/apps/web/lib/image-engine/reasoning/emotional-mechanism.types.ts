/**
 * CIOS Phase 4.0.6 — why a person would remember this.
 *
 * The gap this fills
 * -----------------
 * Three layers already touch memory and none of them answers the question.
 * `MemoryPatternEvaluator` scores five *routes* — is there an image, a shape, a
 * feeling — which is how a thing is retained. `PatternExtractor` names the
 * *device* — a reversal, an object carrying the argument — which is how it was
 * built. Neither says why a person, having read it once, would still have it
 * tomorrow.
 *
 * That reason is psychological and there are not many of them. An idea sticks
 * because you recognised yourself in it, because it lifted something you were
 * carrying, because it said a thing that is not said, because it left an image
 * you cannot put down, or because it made you turn something over. Five
 * mechanisms, and they are the level at which taste actually operates: a
 * director does not say "this has 0.8 mental image", they say "she'll see
 * herself in that".
 *
 * What is extractable and what is not
 * ----------------------------------
 * The four components — fear, desire, contradiction, transformation — are read
 * from the idea's own text and from the insight material behind it. Those are
 * checkable. The *mechanism* is inferred from which components are present and
 * how, and it is the weakest inference in the file: two ideas with the same
 * components can work on a reader for different reasons, and nothing here can
 * tell them apart.
 *
 * So the mechanism is reported with the components that produced it, always.
 * A director who disagrees with the label can see the four facts it was drawn
 * from and overrule it, which is the only useful form of a judgement this
 * uncertain.
 */

/** Why a person would still have this tomorrow. */
export const MEMORY_MECHANISMS = [
  /** They saw themselves. The most durable and the hardest to fake. */
  "recognition",
  /** Something they were carrying was named and set down. */
  "relief",
  /** It said a thing that is not said. */
  "transgression",
  /** An image they cannot put down. */
  "concretion",
  /** It made them turn something over. */
  "reversal",
] as const;

export type MemoryMechanism = (typeof MEMORY_MECHANISMS)[number];

export interface EmotionalMechanism {
  idea: string;
  /** What the idea implies the person is avoiding. Empty where none is present. */
  human_fear: string;
  /** What it implies they want. */
  human_desire: string;
  /** The two things held against each other, where the idea holds any. */
  contradiction: string;
  /** Movement from one emotional state to another, where the idea moves. */
  emotional_transformation: string;
  /** Why this would be remembered. Inferred from the four above. */
  mechanism: MemoryMechanism | null;
  /** 0-1. How much of the mechanism rests on evidence rather than default. */
  confidence: number;
  /** The reason in a sentence, in the register a director would use. */
  reason: string;
  /** What in the text produced each component. */
  evidence: Record<string, string>;
  notes: string[];
}

export const MECHANISM_REASONS: Record<MemoryMechanism, string> = {
  recognition: "She will see herself in it, and that is the thing people repeat.",
  relief: "It names something they have been carrying, and sets it down.",
  transgression: "It says the thing nobody says, which is why it will travel.",
  concretion: "There is one image in it they will not be able to put down.",
  reversal: "It makes you turn something over, and a mind that turns something over keeps it.",
};

// ── The graph (Task 2) ────────────────────────────────────────────────────

export type TasteNodeKind = "idea" | "structure" | "mechanism" | "decision" | "outcome";

export interface TasteNode {
  id: string;
  kind: TasteNodeKind;
  label: string;
  /** How many times this node has been seen. */
  count: number;
}

export interface TasteEdge {
  from: string;
  to: string;
  count: number;
}

/**
 * A path from one idea to what happened to it.
 *
 * The point of holding this as a graph rather than as rows is that the middle is
 * queryable: which mechanisms survive a director, which structures carry which
 * mechanisms, which combinations have never been tried. Those are questions
 * about the *shape* of what has been made, and a table of decisions cannot
 * answer them.
 */
export interface TastePath {
  idea: string;
  structure: string | null;
  mechanism: MemoryMechanism | null;
  decision: string;
  outcome: "kept" | "dropped";
}

// ── Attention (Task 3) ────────────────────────────────────────────────────

export type AttentionKind =
  /** Scored low, and the mechanism behind it is unusually strong. */
  | "UNDERRATED_MECHANISM"
  /** This structure-and-mechanism pairing has a record of surviving directors. */
  | "HISTORICALLY_LOVED"
  /** A combination nothing in the memory has seen before. */
  | "UNUSUAL_COMBINATION";

export interface AttentionFlag {
  kind: AttentionKind;
  idea: string;
  /** Where it sat on score alone. */
  rank: number;
  /** Why a director should look at it anyway. */
  reason: string;
  /** 0-1. How much evidence is behind the flag. */
  confidence: number;
}

/**
 * What the attention engine hands a director.
 *
 * Deliberately *beside* the ranking rather than inside it. The phase is explicit
 * that ranking scores must not change and metrics must not be overridden, and
 * that is the right constraint: an attention layer that could move a score would
 * be a second ranking with a different name, and the two would disagree without
 * either being wrong.
 *
 * So this is a second list. The ranking says what scored best; this says what is
 * worth a second look and why. A director reads both.
 */
export interface AttentionReport {
  case_id: string;
  /** The ranking's own answer, unchanged. */
  top_by_score: string;
  flags: AttentionFlag[];
  notes: string[];
}

/** Below this many observations, the historical detector declines. */
export const MIN_PAIRING_OBSERVATIONS = 3;

/** An idea must sit at least this far down the ranking to be "underrated". */
export const UNDERRATED_MIN_RANK = 2;

/**
 * And its mechanism must be strong in itself, not merely stronger than the
 * winner's.
 *
 * Without this floor the detector fired on 111 of 458 ideas: most winners carry
 * a weak mechanism, so almost anything cleared a relative test. A flag that
 * appears on a quarter of everything tells a director nothing.
 */
export const UNDERRATED_MIN_CONFIDENCE = 0.5;
