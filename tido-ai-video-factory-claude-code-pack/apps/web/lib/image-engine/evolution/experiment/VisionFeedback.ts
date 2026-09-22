import type { CreativeIntelligence } from "./CreativeIntelligenceView";

/**
 * What a look at the finished image would say.
 *
 * The loop this prepares for is simple to describe and easy to fake: render,
 * look at the result, say what is wrong, render again. This file is only the
 * first half -- the contract -- and it is written to make the fake impossible
 * rather than merely discouraged.
 *
 * The honest problem
 * ------------------
 * Nothing in this system has ever looked at a rendered pixel. The critic and
 * the quality judge read the blueprint and the prompt: they assess what was
 * ASKED FOR, not what came back. That distinction is the whole reason renders
 * score 6.5-7.3 while prompt transmission scores near the top -- the system is
 * blind to its own output and has been grading its intentions.
 *
 * So feeding the existing critic into a type called `VisionFeedback` would be
 * a lie at the type level, and the most expensive kind: every consumer
 * downstream would reasonably believe the image had been examined. That is why
 * `analyzed_image` exists and why `source` is a required discriminator. A
 * reader can always tell whether a finding came from looking or from guessing,
 * and `pre_render_reasoning` is never silently promoted to `render_analysis`.
 *
 * What is real here today: the adapter carries forward findings the reasoning
 * layer genuinely produced, in the shape the vision model will later fill.
 * What is deliberately absent: scores. There is no number in this interface,
 * because a confidence-shaped number over an unexamined image is precisely the
 * hardcoded-94/100 failure this codebase has already corrected once.
 */

/** Where a finding came from. Required -- there is no safe default. */
export type VisionSource =
  /** A model looked at the rendered image. Nothing sets this yet. */
  | "render_analysis"
  /** Derived from the plan, before or without seeing the result. */
  | "pre_render_reasoning";

/** One observation about the image. */
export interface VisionObservation {
  /** What was seen, in plain language. */
  what: string;
  /** Where in the frame, when known. Absent rather than guessed. */
  where?: string;
  /** How sure. Carried through, never invented. */
  confidence?: "low" | "medium" | "high";
}

/** One change worth making, written as direction a person could act on. */
export interface VisionChange {
  /** The change. */
  change: string;
  /** Why it would help. */
  because?: string;
  /** Which discipline owns it -- typography, layout, lighting, and so on. */
  area?: string;
}

export interface VisionFeedback {
  /** What is wrong. Empty when nothing was found -- never padded. */
  issues: VisionObservation[];
  /** What works, and should survive the next iteration. */
  strengths: VisionObservation[];
  /** What to change next time. */
  suggested_changes: VisionChange[];
  /**
   * How much to trust this feedback as a whole, in words rather than a number.
   * Empty string when there is no basis to claim any confidence at all.
   */
  confidence: "" | "low" | "medium" | "high";

  /**
   * True only when a model actually examined the rendered image.
   *
   * The refinement loop reads this to decide whether feedback is strong enough
   * to override a director decision. Reasoning-derived feedback is a
   * suggestion; observed feedback is evidence. Conflating them would let a
   * guess outrank the creative ladder.
   */
  analyzed_image: boolean;

  source: VisionSource;
}

/** Nothing was assessed. Distinct from "assessed and found clean". */
export function emptyVisionFeedback(source: VisionSource = "pre_render_reasoning"): VisionFeedback {
  return { issues: [], strengths: [], suggested_changes: [], confidence: "", analyzed_image: false, source };
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/**
 * Carries the reasoning layer's existing findings into the vision shape.
 *
 * This is the bridge the roadmap asks for: `critic_feedback` becomes `issues`,
 * `improvement_suggestions` becomes `suggested_changes`, and the whole thing is
 * stamped `pre_render_reasoning` / `analyzed_image: false` so no consumer can
 * mistake it for sight. When a vision model is added it produces the same
 * interface with `render_analysis` and the loop needs no new plumbing.
 *
 * Strengths stay empty. The reasoning layer only reports problems, and
 * inventing praise to balance the object would be fabrication in the friendly
 * direction -- still fabrication.
 */
export function visionFeedbackFromIntelligence(
  intelligence: CreativeIntelligence | null | undefined,
): VisionFeedback {
  const out = emptyVisionFeedback("pre_render_reasoning");
  if (!intelligence) return out;

  out.issues = (intelligence.critic_feedback || [])
    .map(clean)
    .filter(Boolean)
    .map((what) => ({ what, confidence: "low" as const }));

  out.suggested_changes = (intelligence.improvement_suggestions || [])
    .map(clean)
    .filter(Boolean)
    .map((change) => ({ change }));

  // Confidence is claimed only when something was actually found, and never
  // rises above "low" while the image remains unseen.
  if (out.issues.length || out.suggested_changes.length) out.confidence = "low";

  return out;
}

/** Counts only, never the finding text. */
export function visionTelemetry(v: VisionFeedback | null | undefined) {
  if (!v) return { vision_feedback: false };
  return {
    vision_feedback: true,
    source: v.source,
    analyzed_image: v.analyzed_image,
    issues: v.issues.length,
    strengths: v.strengths.length,
    suggested_changes: v.suggested_changes.length,
    confidence: v.confidence || "none",
  };
}
