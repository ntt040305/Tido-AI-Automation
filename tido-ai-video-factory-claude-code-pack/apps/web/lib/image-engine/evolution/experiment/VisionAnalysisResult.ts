/**
 * What a model saw when it looked at the finished render.
 *
 * The distinction this file exists to protect
 * -------------------------------------------
 * Everything else in this engine grades INTENTIONS. The commercial critic, the
 * quality judge and the blueprint metrics all read the plan and the prompt:
 * they score what was asked for. That is why prompt transmission scores near
 * the top while renders sit at 6.5-7.3 — the system has been marking its own
 * homework without ever seeing the result.
 *
 * This is the first contract in the codebase that describes OBSERVATION. The
 * single most valuable thing about it is therefore `analyzed_image`, and the
 * single easiest way to destroy its value is to set that flag when no model
 * received any bytes. Every consumer downstream will reasonably read it as
 * "this was seen", and a loop that trusts an unseen verdict will happily
 * "correct" a render nobody looked at.
 *
 * So the flag is set in exactly one place -- after a provider returns a parsed
 * response for bytes it was handed -- and `image_hash` records which bytes, so
 * a finding can always be traced to the image it came from.
 *
 * No scores
 * ---------
 * There is no overall number here. A number invites ranking, ranking invites
 * thresholds, and a threshold over a soft judgement is how this product ended
 * up with a hardcoded 94/100 badge once already. Findings are text a person can
 * check, or they are nothing.
 */

/** Which part of the craft a finding belongs to. */
export type VisionArea =
  | "typography"
  | "layout"
  | "product_accuracy"
  | "composition"
  | "readability"
  | "artifact";

/** One thing a model reports seeing. */
export interface VisionNote {
  /** What was seen, in plain language. */
  what: string;
  /** Where in the frame, when the model said. Absent rather than guessed. */
  where?: string;
  /** How sure it was. Never upgraded on the way through. */
  confidence?: "low" | "medium" | "high";
}

/**
 * The scopes a vision finding is allowed to act on.
 *
 * This is the safety rule as a type. The loop exists to fix mistakes -- text
 * that cannot be read, a product that came back wrong, a tangent in the
 * composition -- and emphatically NOT to re-argue the creative direction. A
 * model looking at one frame has no idea why the director chose an off-centre,
 * high-contrast, deliberately sparse treatment, and given the chance it will
 * regress every interesting decision toward the average poster.
 *
 * An action outside these scopes is dropped by `sanitizeActions` rather than
 * trusted, so the direction survives contact with the critic.
 */
export const CORRECTABLE_SCOPES = [
  "error",
  "readability",
  "product_accuracy",
  "composition",
] as const;

export type CorrectableScope = (typeof CORRECTABLE_SCOPES)[number];

/** One change to make on the next render. */
export interface VisionAction {
  /**
   * The instruction, specific enough to execute.
   *
   * "Improve typography" is not an instruction. "Set the closing line at half
   * the headline's weight and move it clear of the vessel's edge" is.
   */
  action: string;
  /** What it fixes. */
  because?: string;
  area?: VisionArea;
  /** Anything outside CORRECTABLE_SCOPES never reaches a render. */
  scope: CorrectableScope;
}

export interface VisionAnalysisResult {
  /**
   * True only when a vision model actually received the rendered bytes and
   * returned a parsed response. Never inferred, never defaulted to true.
   */
  analyzed_image: boolean;
  strengths: VisionNote[];
  issues: VisionNote[];
  typography_problems: VisionNote[];
  layout_problems: VisionNote[];
  product_accuracy: VisionNote[];
  improvement_actions: VisionAction[];
  /** Which provider looked, for auditing a finding after the fact. */
  provider?: string;
  /** Which bytes were looked at. */
  image_hash?: string;
  /** Present when nothing looked, saying why. */
  unavailable_reason?: string;
}

/** Nothing was seen. The only shape allowed to exist without a model call. */
export function emptyVisionAnalysis(reason?: string): VisionAnalysisResult {
  return {
    analyzed_image: false,
    strengths: [],
    issues: [],
    typography_problems: [],
    layout_problems: [],
    product_accuracy: [],
    improvement_actions: [],
    ...(reason ? { unavailable_reason: reason } : {}),
  };
}

/**
 * Drops any action the loop is not permitted to act on.
 *
 * Returns the kept actions and what was removed, because silently discarding a
 * model's output is how a system becomes impossible to debug -- the caller logs
 * the count and can see the critic straying.
 */
export function sanitizeActions(
  actions: VisionAction[] | null | undefined,
): { kept: VisionAction[]; dropped: VisionAction[] } {
  const kept: VisionAction[] = [];
  const dropped: VisionAction[] = [];
  for (const a of actions || []) {
    if (!a || typeof a.action !== "string" || !a.action.trim()) continue;
    if ((CORRECTABLE_SCOPES as readonly string[]).includes(a.scope)) kept.push(a);
    else dropped.push(a);
  }
  return { kept, dropped };
}

/** True when anything worth a second render was found. */
export function hasActionableFindings(r: VisionAnalysisResult | null | undefined): boolean {
  if (!r?.analyzed_image) return false;
  return sanitizeActions(r.improvement_actions).kept.length > 0;
}

/** Counts only -- never the finding text, which is customer content. */
export function visionAnalysisTelemetry(r: VisionAnalysisResult | null | undefined) {
  if (!r) return { vision_analysis: false };
  return {
    vision_analysis: true,
    analyzed_image: r.analyzed_image,
    provider: r.provider || "none",
    strengths: r.strengths.length,
    issues: r.issues.length,
    typography_problems: r.typography_problems.length,
    layout_problems: r.layout_problems.length,
    product_accuracy: r.product_accuracy.length,
    actions: r.improvement_actions.length,
  };
}
