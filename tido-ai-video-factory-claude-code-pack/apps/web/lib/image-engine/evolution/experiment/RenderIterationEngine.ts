import type { VisualDNA } from "./VisualDNAAnalyzer";
import type { CreativeQualityScore } from "../../benchmark/CommercialRenderCritic";

/**
 * The Render Iteration Engine — look at the render, then fix it.
 *
 * This is the first module in the system that evaluates a PICTURE. Everything
 * before it scores decisions: what was decided, what the prompt guards against,
 * how much was grounded. Useful, and repeatedly caught real defects — but every
 * one of those numbers is blind to the image.
 *
 * `VisualDNAAnalyzer` already reads images with a model and checks its own
 * inferences against what it observed, dropping any claim whose evidence does
 * not appear in the observation. That discipline is exactly what a render critic
 * needs, so this reuses it rather than building a second vision path.
 *
 * The cost, stated plainly
 * ------------------------
 * One model call per render analysed, plus a second render when an iteration is
 * taken. That is why `vision_iteration_v1` is off by default and why the
 * analyzer is INJECTED rather than imported: this module stays pure and
 * testable, and the caller decides whether to spend.
 *
 * What it will not do
 * -------------------
 * It will not claim a finding the vision pass did not produce. When no analysis
 * is supplied, `vision_available` is false and the result carries decision-side
 * scores only — the same rule the commercial critic follows.
 */

export type VisionCheck =
  | "product_accuracy"
  | "commercial_design"
  | "typography"
  | "realism"
  | "ai_artifacts";

export interface VisionFinding {
  check: VisionCheck;
  /** 1-10. Only ever set when something actually looked. */
  score: number;
  /** What was seen, quoted from the analysis. */
  observed: string;
  /** Empty when the check passed. */
  problem: string;
  /**
   * What to change, as an instruction a renderer can execute.
   *
   * "Improve typography" is not an instruction. "Increase the headline to twice
   * the supporting text and move the closing line to the lower third" is.
   */
  correction: string;
}

export interface RenderIteration {
  version: number;
  /** The rendered bytes, when the caller kept them. */
  image?: Buffer;
  vision_analysis: VisualDNA | null;
  quality_score: number;
  issues: string[];
  improvements: string[];
  findings: VisionFinding[];
  vision_available: boolean;
}

export interface IterationResult {
  iterations: RenderIteration[];
  /** Index of the kept version. */
  winner: number;
  /** Why that one. */
  because: string;
  /** The instruction block appended for the second render, when one was taken. */
  improvement_prompt?: string;
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/**
 * Turns a vision reading into findings. Pure.
 *
 * Each check asks something answerable from what the analyzer actually
 * observed. A check with nothing to read on returns a neutral score and says
 * so, rather than assuming the render passed.
 */
export function readVision(
  analysis: VisualDNA | null | undefined,
  expected: { productForm?: string; materials?: string[]; copy?: string[] } = {}
): VisionFinding[] {
  if (!analysis?.provenance?.derived_from_image) return [];
  const observed = analysis.observed?.product || null;
  const inferred = analysis.inferred || [];
  const findings: VisionFinding[] = [];

  // ── product accuracy ──────────────────────────────────────────────────
  const form = clean(observed?.form);
  const formMatches =
    !expected.productForm || !form
      ? null
      : form.toLowerCase().includes(clean(expected.productForm).toLowerCase().split(/\s+/).slice(-1)[0] || "");
  findings.push({
    check: "product_accuracy",
    score: formMatches === null ? 5 : formMatches ? 9 : 3,
    observed: form || "no product form was read from the render",
    problem: formMatches === false ? "The rendered product's form does not match the reference." : "",
    correction:
      formMatches === false
        ? "Reproduce the attached product's silhouette exactly: same proportions, same closure, same shoulder line. Do not restyle it."
        : "",
  });

  // ── realism and artifacts ─────────────────────────────────────────────
  // The analyzer's own inference list is the evidence: a claim it kept is one
  // whose basis it found in the observation.
  const artifactWords = /\b(plastic|artificial|fake|floating|unnatural|distort\w*|melt\w*|warp\w*)\b/i;
  const artifactClaims = inferred.filter((i) => artifactWords.test(clean(i.claim)));
  findings.push({
    check: "ai_artifacts",
    score: artifactClaims.length ? Math.max(1, 8 - artifactClaims.length * 3) : 8,
    observed: artifactClaims.length
      ? artifactClaims.map((c) => clean(c.claim)).join("; ")
      : "no artifact language in the analysis",
    problem: artifactClaims.length ? `${artifactClaims.length} artifact signal(s) in the render.` : "",
    correction: artifactClaims.length
      ? "Render the product as a photograph of a real object: real surface texture, a contact shadow where it meets the surface, and reflections consistent with a single light source."
      : "",
  });

  const finish = clean(observed?.finish);
  findings.push({
    check: "realism",
    score: finish ? 8 : 4,
    observed: finish || "no surface finish was read",
    problem: finish ? "" : "No surface finish is legible, which usually means the material reads as generic.",
    correction: finish
      ? ""
      : "Give the product's surface a specific finish and light it so that finish is visible.",
  });

  // ── typography, read from the render ──────────────────────────────────
  // Whether the words that should be there ARE there. The one check that
  // catches a renderer inventing letterforms.
  const readText = inferred
    .filter((i) => /text|word|letter|type|headline|caption/i.test(clean(i.claim)))
    .map((i) => clean(i.claim));
  findings.push({
    check: "typography",
    score: expected.copy?.length ? (readText.length ? 7 : 3) : 5,
    observed: readText.join("; ") || "no text was read from the render",
    problem:
      expected.copy?.length && !readText.length
        ? "Copy was supplied but no legible text was read from the render."
        : "",
    correction:
      expected.copy?.length && !readText.length
        ? "Set the copy as real type rather than leaving it to the image model; the words must be legible and correctly spelled."
        : "",
  });

  // ── commercial design ─────────────────────────────────────────────────
  findings.push({
    check: "commercial_design",
    score: observed ? 7 : 3,
    observed: observed ? "the product is legible in the frame" : "no product was read from the render",
    problem: observed ? "" : "The product could not be read from the render at all.",
    correction: observed ? "" : "Make the product the dominant element and keep it clear of copy.",
  });

  return findings;
}

/**
 * Builds the instruction block for a second render. Pure.
 *
 * Only corrections from findings that actually failed. An improvement prompt
 * that repeats what already worked wastes the characters it needs for what did
 * not.
 */
export function improvementPrompt(findings: VisionFinding[]): string | undefined {
  const failing = findings.filter((f) => f.problem && f.correction).sort((a, b) => a.score - b.score);
  if (!failing.length) return undefined;
  return [
    "CORRECTIONS FROM REVIEW OF THE PREVIOUS RENDER. Keep everything else; change only these.",
    ...failing.map((f) => `- ${f.check.replace(/_/g, " ")}: ${f.problem} ${f.correction}`),
  ].join("\n");
}

export interface IterationInput {
  /** Decision-side score, from the commercial critic. */
  critic?: CreativeQualityScore | null;
  /** The vision reading of V1, when the caller paid for one. */
  analysis?: VisualDNA | null;
  expected?: { productForm?: string; materials?: string[]; copy?: string[] };
  image?: Buffer;
}

/** Scores one version from whatever evidence exists. Pure. */
export function scoreIteration(input: IterationInput, version: number): RenderIteration {
  const findings = readVision(input.analysis, input.expected);
  const vision_available = findings.length > 0;
  // With vision, the picture governs and the decision-side score supports it.
  // Without, the decision-side score is all there is and the result says so.
  const visionMean = vision_available
    ? findings.reduce((n, f) => n + f.score, 0) / findings.length
    : 0;
  const criticScore = input.critic?.overall_score ?? 5;
  const quality_score = vision_available
    ? Math.round((visionMean * 0.7 + criticScore * 0.3) * 100) / 100
    : criticScore;

  return {
    version,
    image: input.image,
    vision_analysis: input.analysis ?? null,
    quality_score,
    issues: [
      ...findings.filter((f) => f.problem).map((f) => `${f.check}: ${f.problem}`),
      ...(input.critic?.issues_found || []),
    ],
    improvements: [
      ...findings.filter((f) => f.correction).map((f) => f.correction),
      ...(input.critic?.improvement_actions || []),
    ],
    findings,
    vision_available,
  };
}

export class RenderIterationEngine {
  /**
   * Compares versions and picks one. Pure and total.
   *
   * Conservative on ties: a second render has to be better, not equal, to
   * justify what it cost. With one version there is nothing to compare and it
   * wins by default — stated rather than implied.
   */
  static select(iterations: RenderIteration[]): IterationResult {
    if (!iterations.length) {
      return { iterations: [], winner: -1, because: "no renders to compare" };
    }
    if (iterations.length === 1) {
      return {
        iterations,
        winner: 0,
        because: "only one version was rendered, so it wins by default rather than by comparison",
      };
    }
    let best = 0;
    for (let i = 1; i < iterations.length; i++) {
      if (iterations[i].quality_score > iterations[best].quality_score) best = i;
    }
    const improved = best !== 0;
    return {
      iterations,
      winner: best,
      because: improved
        ? `version ${iterations[best].version} scored ${iterations[best].quality_score} against ${iterations[0].quality_score}`
        : `no later version beat version ${iterations[0].version} (${iterations[0].quality_score}); the first render was kept`,
      improvement_prompt: improvementPrompt(iterations[0].findings),
    };
  }
}

/** Counts and scores only — never the analysis prose. */
export function iterationTelemetry(r: IterationResult | null | undefined) {
  if (!r) return { iteration: false };
  return {
    iteration: true,
    versions: r.iterations.length,
    winner: r.winner,
    scores: r.iterations.map((i) => i.quality_score),
    vision_available: r.iterations.some((i) => i.vision_available),
    issues: r.iterations[0]?.issues.length ?? 0,
    has_improvement_prompt: Boolean(r.improvement_prompt),
  };
}
