import type { CreativeJudgment, StrategyCandidate, StrategyVerdict } from "./CreativeDirectorV1";
import { routeLabel } from "./UserKitLearning";
import { NO_TEXT_TYPOGRAPHY, unauthorizedText, type TextRequirement } from "../../compiler/ExactCopyIntegrityValidator";
import { forbiddenStylesIn, preferredStylesIn, type BrandKit } from "./BrandKit";

/**
 * Phase 4.2 / 4.3. Evaluates the directions the Creative Director developed,
 * and decides -- under a rule, not a feeling -- whether memory may overrule it.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a second director and not a second evaluator. `CreativeDirectorV1`
 * already judges every candidate on six axes -- product, audience, objective,
 * brand, channel, feasibility -- each with a stance and the words it rests on.
 * That assessment is the backbone of every score below. What this adds is the
 * one thing the director cannot see from inside a single call: what happened
 * the LAST times this account made each route. Pure and synchronous; it makes
 * no model call and has no path to a database. Evidence arrives as numbers,
 * resolved above the engine boundary like every other memory input.
 *
 * THE SELECTION RULE
 * ------------------
 * The director decides. Its pick stands unless ALL of these hold:
 *   1. this account's own history is against the pick -- a thresholded "avoid"
 *      preference, or at least MIN_EVIDENCE_RUNS renders of the route with more
 *      rejections than keeps;
 *   2. another candidate carries no such evidence and outscores it by at least
 *      OVERRIDE_MARGIN;
 *   3. that candidate was developed far enough to be rendered coherently -- it
 *      has its own composition, typography and lighting, so switching does not
 *      leave the old pick's craft decisions attached to a new scene.
 * A first-time account therefore always gets the director's choice: nothing is
 * concluded from no history, and nothing from one event.
 */

/** Renders of a route before its history may move a decision. Mirrors MIN_PATTERN_SUPPORT. */
export const MIN_EVIDENCE_RUNS = 3;
/** How much better an alternative must score before memory may overrule the director. */
export const OVERRIDE_MARGIN = 0.1;

/** What this account's history says about one route. Plain numbers, no identity. */
export interface RouteEvidence {
  /** The route as recorded -- the director's `selected_direction` on past runs. */
  route: string;
  /** Renders made with this route. */
  runs: number;
  /** Of those, kept by a person (download / approve). */
  kept: number;
  /** Of those, rejected, or regenerated without being kept. */
  rejected: number;
  /** Vision problems found across those renders. */
  problems: number;
  /** A preference this person has passed the threshold on. */
  preference?: "prefer" | "avoid" | null;
}

export interface ConceptEvaluation {
  route: string;
  /** 0..1. The director's assessment, moved by memory where memory has earned it. */
  score: number;
  strengths: string[];
  weaknesses: string[];
  risk: { level: "low" | "medium" | "high"; reason: string };
  signals: {
    /** The director's six-axis assessment alone, 0..1. */
    assessment: number;
    /** The product verdict rests on an actual observation of the uploaded product. */
    product_grounded: boolean;
    /** (kept - rejected) / runs, or null below the evidence threshold. */
    route_confidence: number | null;
    runs: number;
    vision_problems_per_run: number | null;
    preference: "prefer" | "avoid" | null;
    director_pick: boolean;
    /**
     * Typography compliance with the text requirement: the route neither
     * invents words nor (when no text was supplied) plans type at all. Null when
     * no requirement was given to evaluate against.
     */
    typography_compliant: boolean | null;
    /** What the route wrote that the requirement does not allow. */
    text_violations: string[];
    /** Phase 5.4. Styles the brand forbids that this route proposes. */
    brand_violations?: string[];
    /** Phase 5.4. Styles the brand prefers that this route embodies. */
    brand_matches?: string[];
  };
}

/** How much a route proposing a style the brand forbids is marked down. */
export const BRAND_VIOLATION_PENALTY = 0.15;

/** How much a route that invents text is marked down. */
export const TEXT_VIOLATION_PENALTY = 0.15;

/**
 * What a candidate wrote that the text requirement does not allow.
 *
 * exact: any quoted string that is not one of the supplied lines.
 * none:  any quoted string or text-creating sentence, and ANY typography plan
 *        other than "none" -- a route that designs type for an image with no
 *        text has planned words, whether or not it named them.
 */
export function candidateTextViolations(c: StrategyCandidate, req: TextRequirement | null | undefined): string[] {
  if (!req) return [];
  const found = unauthorizedText(
    [c.core_idea, c.visual_language, c.composition, c.lighting, c.why_this_route, req.mode === "exact" ? c.typography : undefined],
    req,
  );
  if (req.mode === "none") {
    const t = clean(c.typography);
    if (t && t !== NO_TEXT_TYPOGRAPHY && !/^none\b/i.test(t)) found.push(`plans typography for an image with no text: ${t.slice(0, 120)}`);
  }
  return [...new Set(found)];
}

export interface DirectionEvaluation {
  evaluations: ConceptEvaluation[];
  /** What the director chose, and its own reason, kept even when overruled. */
  director_pick: string;
  director_reason: string;
  /** What runs. Equal to `director_pick` unless memory overruled it. */
  selected: string;
  source: "director" | "memory_override";
  /** Why this direction was selected, in words a person can check. */
  reasoning: string;
  /** On an override: why the director's first choice was set aside. */
  set_aside_reason?: string;
  /** How long the director's call took, when measured. */
  director_ms?: number;
}

const AXIS_WEIGHTS: Record<keyof StrategyCandidate["assessment"], number> = {
  product: 0.25,
  audience: 0.2,
  objective: 0.2,
  brand: 0.15,
  channel: 0.1,
  feasibility: 0.1,
};

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const key = (route: unknown): string => routeLabel(clean(route)).toLowerCase();
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function stanceValue(v: StrategyVerdict | undefined): number {
  if (!v) return 0.5;
  if (v.stance === "supports") return 1;
  if (v.stance === "works_against") return 0;
  return 0.5;
}

function evidenceFor(route: string, evidence: RouteEvidence[]): RouteEvidence | null {
  const k = key(route);
  const hits = evidence.filter((e) => key(e.route) === k);
  if (!hits.length) return null;
  // Several recorded spellings of one route (with and without its gloss) are
  // one route's history.
  return hits.reduce((a, b) => ({
    route: a.route,
    runs: a.runs + b.runs,
    kept: a.kept + b.kept,
    rejected: a.rejected + b.rejected,
    problems: a.problems + b.problems,
    preference: a.preference ?? b.preference ?? null,
  }));
}

/** The history-derived confidence for a route, or null below the threshold. */
export function routeConfidence(e: RouteEvidence | null): number | null {
  if (!e || e.runs < MIN_EVIDENCE_RUNS) return null;
  return Math.max(-1, Math.min(1, (e.kept - e.rejected) / e.runs));
}

/** Memory is against this route, by the rule above. */
function historyAgainst(e: RouteEvidence | null): string | null {
  if (!e) return null;
  // Every reason that applies, not just the first: a person reading why their
  // director's choice was set aside should see all of the evidence.
  const reasons: string[] = [];
  if (e.preference === "avoid") reasons.push("this person has repeatedly turned this direction down");
  const c = routeConfidence(e);
  if (c !== null && e.rejected > e.kept) {
    reasons.push(`rejected in ${e.rejected} of ${e.runs} previous renders and kept in ${e.kept}`);
  }
  return reasons.length ? reasons.join("; ") : null;
}

function evaluateCandidate(
  c: StrategyCandidate,
  evidence: RouteEvidence[],
  productObserved: boolean,
  isDirectorPick: boolean,
  textRequirement?: TextRequirement | null,
  brandKit?: BrandKit | null,
): ConceptEvaluation {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const a = c.assessment || ({} as StrategyCandidate["assessment"]);

  let assessment = 0;
  for (const [axis, weight] of Object.entries(AXIS_WEIGHTS) as [keyof typeof AXIS_WEIGHTS, number][]) {
    const v = a[axis];
    assessment += weight * stanceValue(v);
    if (v?.stance === "supports" && clean(v.because)) strengths.push(`${axis}: ${clean(v.because)}`);
    if (v?.stance === "works_against" && clean(v.because)) weaknesses.push(`${axis}: ${clean(v.because)}`);
  }
  if (clean(c.earns_it)) strengths.push(`answers the format's failure mode: ${clean(c.earns_it)}`);

  // Asset intelligence: the product verdict counts as grounded only when a
  // model actually looked at the uploaded product and the verdict quotes it.
  const productEvidence = clean(a.product?.evidence).toLowerCase();
  const productGrounded =
    productObserved && a.product?.stance === "supports" && Boolean(productEvidence) && productEvidence !== "not supplied";
  if (productGrounded) strengths.push("grounded in what was observed in the product photograph");

  const e = evidenceFor(c.route, evidence);
  const confidence = routeConfidence(e);
  const perRun = e && e.runs >= MIN_EVIDENCE_RUNS ? e.problems / e.runs : null;
  const preference = e?.preference ?? null;

  let score = assessment;
  if (confidence !== null) {
    score += 0.15 * confidence;
    if (confidence > 0) strengths.push(`kept in ${e!.kept} of ${e!.runs} previous renders of this route`);
    if (confidence < 0) weaknesses.push(`rejected in ${e!.rejected} of ${e!.runs} previous renders of this route`);
  }
  if (preference === "prefer") {
    score += 0.1;
    strengths.push("matches a standing preference this person has kept repeatedly");
  } else if (preference === "avoid") {
    score -= 0.1;
    weaknesses.push("this person has repeatedly turned this direction down");
  }
  if (perRun !== null && perRun > 3) {
    const penalty = Math.min(0.1, ((perRun - 3) / 5) * 0.1);
    score -= penalty;
    weaknesses.push(`previous renders of this route averaged ${perRun.toFixed(1)} vision problems`);
  }

  // Typography compliance. A route that writes its own words -- or plans type
  // for an image that must carry none -- is marked down and says why. The
  // enforcement step removes the words either way; this records that the
  // route tried, which is what makes a director that keeps doing it visible.
  const textViolations = candidateTextViolations(c, textRequirement);
  if (textViolations.length) {
    score -= TEXT_VIOLATION_PENALTY;
    weaknesses.push(`typography: ${textRequirement!.mode === "none" ? "adds text to an image that must carry none" : "introduces words the client did not supply"} (${textViolations[0]})`);
  } else if (textRequirement) {
    strengths.push(
      textRequirement.mode === "exact"
        ? "typography: uses only the text the client supplied"
        : "typography: keeps the image free of text, as required",
    );
  }

  // Phase 5.4: the brand's standing rules. A route built on a style the brand
  // refuses is marked down and flagged; one that embodies a preferred style is
  // credited. Matched on the route's own words, so the record shows which.
  const prose = [c.core_idea, c.visual_language, c.composition, c.typography, c.lighting, c.why_this_route];
  const brandViolations = forbiddenStylesIn(prose, brandKit);
  const brandMatches = preferredStylesIn(prose, brandKit);
  if (brandViolations.length) {
    score -= BRAND_VIOLATION_PENALTY;
    weaknesses.push(`brand: proposes a style the brand forbids (${brandViolations.join(", ")})`);
  }
  if (brandMatches.length) {
    score += 0.05;
    strengths.push(`brand: embodies the brand's preferred style (${brandMatches.join(", ")})`);
  }

  const against = historyAgainst(e);
  const blocking = ["product", "feasibility"].filter(
    (axis) => a[axis as keyof typeof a]?.stance === "works_against",
  );
  const level: ConceptEvaluation["risk"]["level"] =
    blocking.length || against || textViolations.length || brandViolations.length ? "high" : weaknesses.length || clean(c.risks) ? "medium" : "low";
  const riskReason =
    (textViolations.length ? weaknesses.find((w) => w.startsWith("typography:")) : "") ||
    clean(c.risks) ||
    (blocking.length ? weaknesses.find((w) => blocking.some((b) => w.startsWith(b))) : "") ||
    against ||
    weaknesses[0] ||
    "no specific risk identified";

  return {
    route: clean(c.route),
    score: round3(clamp01(score)),
    strengths,
    weaknesses,
    risk: { level, reason: riskReason },
    signals: {
      assessment: round3(assessment),
      product_grounded: productGrounded,
      route_confidence: confidence === null ? null : round3(confidence),
      runs: e?.runs ?? 0,
      vision_problems_per_run: perRun === null ? null : round3(perRun),
      preference,
      director_pick: isDirectorPick,
      typography_compliant: textRequirement ? textViolations.length === 0 : null,
      text_violations: textViolations,
      ...(brandKit ? { brand_violations: brandViolations, brand_matches: brandMatches } : {}),
    },
  };
}

/** A candidate complete enough to be rendered without borrowing another's craft. */
function renderable(c: StrategyCandidate | undefined): boolean {
  return Boolean(c && clean(c.core_idea) && clean(c.composition) && clean(c.typography) && clean(c.lighting));
}

/**
 * Scores every developed direction and applies the selection rule.
 *
 * Null when there is nothing to evaluate -- no route selection ran, or the
 * director developed no candidates. Callers treat null as "the director's
 * judgment, unevaluated", which is what every render did before this existed.
 */
export function evaluateDirections(
  judgment: CreativeJudgment | null | undefined,
  ctx: {
    evidence?: RouteEvidence[] | null;
    productObserved?: boolean;
    directorMs?: number;
    /** Phase 4 typography constraint: exactly these lines, or no text. */
    textRequirement?: TextRequirement | null;
    /** Phase 5.4: the brand's preferred and forbidden styles. */
    brandKit?: BrandKit | null;
  },
): DirectionEvaluation | null {
  const strategy = judgment?.strategy;
  const candidates = (strategy?.candidates || []).filter((c) => clean(c?.route));
  if (!strategy || !candidates.length) return null;

  const evidence = (ctx.evidence || []).filter((e) => e && clean(e.route));
  const directorPick = clean(strategy.selected) || clean(candidates[0].route);
  const isPick = (route: string) => key(route) === key(directorPick);

  const evaluations = candidates.map((c) =>
    evaluateCandidate(c, evidence, Boolean(ctx.productObserved), isPick(c.route), ctx.textRequirement, ctx.brandKit),
  );
  const ranked = [...evaluations].sort((x, y) => y.score - x.score);
  const pickEval = evaluations.find((e) => isPick(e.route)) ?? ranked[0];
  const top = ranked[0];

  const pickAgainst = historyAgainst(evidenceFor(pickEval.route, evidence));
  const alternative = ranked.find(
    (e) =>
      !isPick(e.route) &&
      !historyAgainst(evidenceFor(e.route, evidence)) &&
      e.score - pickEval.score >= OVERRIDE_MARGIN &&
      renderable(candidates.find((c) => key(c.route) === key(e.route))),
  );

  const rank = ranked.findIndex((e) => e === pickEval) + 1;
  const directorReason = clean(strategy.selection_reason);

  if (pickAgainst && alternative) {
    const alt = candidates.find((c) => key(c.route) === key(alternative.route))!;
    return {
      evaluations,
      director_pick: directorPick,
      director_reason: directorReason,
      selected: clean(alt.route),
      source: "memory_override",
      set_aside_reason: `set aside: ${pickAgainst}`,
      reasoning:
        `"${clean(alt.route)}" was selected over the director's first choice "${directorPick}", which ` +
        `${pickAgainst}. It scored ${alternative.score.toFixed(2)} against ${pickEval.score.toFixed(2)}` +
        (alternative.strengths.length ? `, and its strongest case is ${alternative.strengths[0]}` : "") +
        `. ${clean(alt.why_this_route)}`.trim(),
      ...(typeof ctx.directorMs === "number" ? { director_ms: ctx.directorMs } : {}),
    };
  }

  const tail =
    top !== pickEval && top.score > pickEval.score
      ? ` The evaluation ranked "${top.route}" slightly higher (${top.score.toFixed(2)} vs ${pickEval.score.toFixed(2)}), but nothing in this account's history argued against the director's choice, so its judgment stands.`
      : ` It ranked ${rank} of ${evaluations.length} on evaluation (score ${pickEval.score.toFixed(2)}).`;
  return {
    evaluations,
    director_pick: directorPick,
    director_reason: directorReason,
    selected: directorPick,
    source: "director",
    reasoning: `${directorReason || `The director chose "${directorPick}".`}${tail}${
      pickEval.strengths.length ? ` Strongest case: ${pickEval.strengths[0]}.` : ""
    }`.trim(),
    ...(typeof ctx.directorMs === "number" ? { director_ms: ctx.directorMs } : {}),
  };
}

/**
 * Returns the judgment that should run: the director's own, annotated with the
 * evaluation, or -- when memory overruled -- the same judgment re-pointed at
 * the alternative, coherently.
 *
 * Coherent means every field `toCreativeDecision` and the resolver read now
 * describes ONE direction: the selected route, its reason, its idea, and the
 * composition / typography / lighting that route itself specified. Camera is
 * cleared rather than kept, because it was decided for the other scene. The
 * director's original pick becomes the runner-up, with the evaluator's reason,
 * so the record says exactly what was turned down and why.
 */
export function applyEvaluation(
  judgment: CreativeJudgment,
  evaluation: DirectionEvaluation | null,
): CreativeJudgment {
  if (!evaluation) return judgment;
  if (evaluation.source !== "memory_override" || !judgment.strategy) {
    return { ...judgment, evaluation };
  }
  const winner = judgment.strategy.candidates.find((c) => key(c.route) === key(evaluation.selected));
  if (!winner) return { ...judgment, evaluation };

  const reason = (choice: string) => ({ choice, reason: `specified by the selected route "${clean(winner.route)}"` });
  return {
    ...judgment,
    // Top-level `selected` belongs to the exploration shape; left pointing at
    // the old pick it would win in the resolver's first branch.
    selected: judgment.selected && key(judgment.selected) === key(evaluation.director_pick) ? clean(winner.route) : judgment.selected,
    strategy: {
      ...judgment.strategy,
      selected: clean(winner.route),
      selection_reason: evaluation.reasoning,
      runner_up: evaluation.director_pick,
      why_not_runner_up: evaluation.set_aside_reason || "set aside on this account's history",
    },
    reasoning: judgment.reasoning
      ? {
          ...judgment.reasoning,
          camera: { choice: "", reason: "cleared: decided for the direction that was set aside" },
          composition: reason(clean(winner.composition)),
          typography: reason(clean(winner.typography)),
          lighting: reason(clean(winner.lighting)),
        }
      : judgment.reasoning,
    evaluation,
  };
}

/**
 * This account's history per offered route, for the director to read BEFORE it
 * chooses. Only routes with history appear; below the threshold a route is
 * reported as "too few renders to judge" rather than scored, so the director
 * is told as plainly as the evaluator what the evidence can and cannot carry.
 */
export function renderRouteEvidence(
  routes: string[] | undefined,
  evidence: RouteEvidence[] | undefined | null,
): string | undefined {
  if (!routes?.length || !evidence?.length) return undefined;
  const lines: string[] = [];
  for (const route of routes) {
    const e = evidenceFor(route, evidence);
    if (!e) continue;
    const pref = e.preference === "avoid" ? "; this person has repeatedly turned it down" : e.preference === "prefer" ? "; this person repeatedly keeps it" : "";
    if (e.runs < MIN_EVIDENCE_RUNS) {
      lines.push(`  - ${routeLabel(route)}: made ${e.runs} time(s) — too few renders to judge${pref}`);
    } else {
      lines.push(
        `  - ${routeLabel(route)}: made ${e.runs} times, kept ${e.kept}, rejected ${e.rejected}, ` +
          `${(e.problems / e.runs).toFixed(1)} vision problems per render${pref}`,
      );
    }
  }
  if (!lines.length) return undefined;
  return [
    "HOW THESE ROUTES HAVE GONE FOR THIS ACCOUNT — evidence, not instructions.",
    "Weigh it in your selection. The brief still decides; a route with little history is not a worse route.",
    ...lines,
  ].join("\n");
}

/** Counts and scores only; route names are the director's vocabulary, not customer data. */
export function evaluationTelemetry(e: DirectionEvaluation | null) {
  if (!e) return { evaluated: false };
  return {
    evaluated: true,
    candidates: e.evaluations.length,
    source: e.source,
    director_pick: e.director_pick,
    selected: e.selected,
    scores: e.evaluations.map((x) => x.score),
    with_history: e.evaluations.filter((x) => x.signals.runs > 0).length,
  };
}
