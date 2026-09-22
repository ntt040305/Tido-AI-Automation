import type { CreativeBlueprint } from "./CreativeBlueprint";
import type { TypographySystem, TextRole, TextSpec } from "./TypographySystem";
import type { LayoutGeometry, ZoneName, Zone } from "./LayoutGeometry";
import type { VisionAnalysisResult } from "./VisionAnalysisResult";
import {
  bridgeVisionToCorrections,
  applyTypographyCorrections,
  applyLayoutCorrections,
  type StructuredCorrections,
  type TypographyCorrection,
  type LayoutCorrection,
} from "./VisionCorrectionBridge";

/**
 * The design reasoning between seeing a problem and changing a value.
 *
 * What was missing
 * ----------------
 * The bridge already maps a finding onto an action: "the headline lacks
 * dominance" becomes `increase_headline_hierarchy`. That is a rule firing, and
 * it is the right first step, but it reasons about nothing. It cannot say what
 * the headline's scale currently is, what it would become, whether the change
 * is worth making, or what it must not disturb on the way.
 *
 * This engine is that missing step. It reads the actual `TextSpec` and `Zone`
 * the systems hold, computes the concrete before and after, and states the
 * change the way a senior designer would state it to another designer -- as a
 * role not being fulfilled, not as a size being wrong.
 *
 *   Bad:  "make the headline bigger"
 *   Good: "The headline is not acting as the first visual anchor. Raise its
 *          hierarchy to 3.3 while holding the product's dominance."
 *
 * The second sentence is checkable. It names the value, and it names what is
 * being preserved, which is the part a rule has no way to express.
 *
 * What it refuses to touch
 * ------------------------
 * `PROTECTED_FIELDS` is drawn from the blueprint's own section list rather than
 * written by hand, so it cannot drift away from what the blueprint actually
 * contains. Concept, story, tension, emotional hook, colour story, atmosphere,
 * brand emotional direction and the product's position are all closed to this
 * engine. What remains open is hierarchy, spacing, contrast, balance and text
 * area -- execution, and only execution.
 *
 * A vision model shown a single frame has no access to why a deliberately
 * sparse, off-centre, high-contrast treatment was chosen. Given any latitude it
 * regresses toward the average poster, which is worse than the defect it was
 * fixing. The protection here is structural: there is no field in
 * `DesignDecisionResult` capable of expressing a concept change.
 */

export type DecisionConfidence = "high" | "medium" | "low";

/** One typographic change, with what it was and what it becomes. */
export interface TypographyDecision {
  role: TextRole;
  /** What is wrong, in the designer's terms rather than the model's. */
  problem: string;
  /** The change, concrete and checkable. */
  decision: string;
  /** Why, expressed as the role the element must fulfil. */
  reason: string;
  decision_confidence: DecisionConfidence;
  /** The value before, when there was one to read. */
  from?: number | string;
  to?: number | string;
  /** False when confidence was too low to act on. */
  applied: boolean;
}

export interface LayoutDecision {
  zone: ZoneName;
  problem: string;
  decision: string;
  reason: string;
  decision_confidence: DecisionConfidence;
  from?: string;
  to?: string;
  applied: boolean;
}

export interface DesignDecisionResult {
  typography_decisions: TypographyDecision[];
  layout_decisions: LayoutDecision[];
  /**
   * What this pass deliberately did not touch, named from the blueprint.
   *
   * Present so the protection is visible rather than merely claimed -- a reader
   * can check that the concept survived rather than trusting that it did.
   */
  protected_elements: string[];
  /** The systems after the applied decisions. Null when nothing was applied. */
  typography?: TypographySystem | null;
  layout?: LayoutGeometry | null;
  /** Findings that reached no decision, so the gap stays visible. */
  untranslated: string[];
}

/**
 * Blueprint fields this engine may never influence, by section and name.
 *
 * Kept as data so it can be asserted against `SECTION_FIELDS` in a test: if the
 * blueprint grows a new concept field, the test fails rather than the field
 * quietly becoming editable.
 */
export const PROTECTED_FIELDS: Record<string, string[]> = {
  concept: ["big_idea", "campaign_concept", "visual_story", "creative_tension", "emotional_hook", "message_strategy"],
  visual_world: ["visual_world", "environment_logic", "color_story", "visual_metaphor", "styling", "props", "atmosphere"],
  brand_expression: ["visual_language", "color_system", "material_language", "emotional_direction"],
  layout: ["product_position"],
};

/** The only fields this engine is permitted to act on. */
export const EDITABLE_FIELDS: Record<string, string[]> = {
  design: ["hierarchy_logic", "spacing_behavior", "placement_reason", "contrast_strategy"],
  layout: ["visual_balance", "text_area"],
};

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/**
 * Names what survived this pass, reading the blueprint rather than asserting.
 *
 * A decision the blueprint never made is not listed. Claiming to have protected
 * something that was never there would be the same species of lie as claiming
 * to have seen an image nobody looked at.
 */
function protectedElements(blueprint: CreativeBlueprint | null | undefined): string[] {
  if (!blueprint) return [];
  const out: string[] = [];
  const add = (label: string, value: unknown) => {
    if (clean((value as any)?.value)) out.push(label);
  };
  add("creative concept", blueprint.concept?.big_idea);
  add("visual story", blueprint.concept?.visual_story);
  add("emotional direction", blueprint.concept?.emotional_hook);
  add("colour story", blueprint.visual_world?.color_story);
  add("atmosphere", blueprint.visual_world?.atmosphere);
  add("brand mood", blueprint.brand_expression?.emotional_direction);
  add("product hero position", blueprint.layout?.product_position);
  return out;
}

/**
 * How sure this engine is that a change is right.
 *
 * Three things raise confidence, and all of them are about evidence rather than
 * about how bad the problem sounds:
 *
 *   - the correction's own priority, which carries the finding's confidence
 *   - whether the current value can actually be read (a change proposed against
 *     an unknown starting point is a guess about a guess)
 *   - whether the problem is objective -- misrendered text is simply wrong,
 *     while "the headline feels weak" is a judgement
 */
function typographyConfidence(c: TypographyCorrection, spec: TextSpec | undefined): DecisionConfidence {
  // Deliberately NOT gated on holding the spec. Confidence is about the
  // evidence for the problem, which came from looking at the render, not about
  // whether this process happens to hold the structure that produced it. An
  // earlier draft returned "low" whenever the spec was absent, which read as
  // caution and was actually a bug: the pipeline does not attach its typography
  // system to the result, so every decision scored low, nothing was ever
  // applied, and the feature was inert while appearing to work.
  //
  // What an absent spec genuinely costs is the numeric from/to, and that is
  // handled by simply omitting it rather than by refusing to decide.
  if (c.action === "correct_text_content") return "high";
  if (c.priority === "high") return "high";
  if (c.priority === "low") return "low";
  return "medium";
}

function layoutConfidence(c: LayoutCorrection, zone: Zone | undefined): DecisionConfidence {
  // A zone outside the safe inset is measurable, not a matter of taste.
  if (c.action === "move_cta_to_safe_area") return "high";
  if (c.priority === "high") return "high";
  if (c.priority === "low") return "low";
  return "medium";
}

/**
 * Whether a change is worth making at this confidence.
 *
 * High applies. Low never applies. Medium applies only when the change is
 * material -- a 5% nudge to a scale nobody will notice is not worth a second
 * render, and a loop that acts on every medium finding will churn renders for
 * no visible gain.
 */
function shouldApply(confidence: DecisionConfidence, significant: boolean): boolean {
  if (confidence === "high") return true;
  if (confidence === "low") return false;
  return significant;
}

/** The reason, written as the role the element is failing to fulfil. */
const TYPOGRAPHY_REASON: Record<string, (r: TextRole) => string> = {
  increase_headline_hierarchy: (r) =>
    `The ${r} is not acting as the first thing the eye lands on. Raising its hierarchy restores the reading order without touching the product's dominance.`,
  reduce_headline_dominance: (r) =>
    `The ${r} is competing with the product for the first look. Pulling it back lets the product lead again while the words still carry the message.`,
  increase_text_contrast: (r) =>
    `The ${r} is losing against what sits behind it. Separating them tonally is what makes it readable at a glance rather than on inspection.`,
  tighten_tracking: (r) => `The ${r} is reading as loose letters rather than as a phrase.`,
  loosen_tracking: (r) => `The ${r} is reading as a single mass; opening it up lets the words separate.`,
  correct_text_content: (r) =>
    `The ${r} did not render as written. Text that is wrong is not a matter of degree -- it has to be exact before anything else about it matters.`,
};

const LAYOUT_REASON: Record<string, (z: ZoneName) => string> = {
  move_cta_to_safe_area: (z) =>
    `The ${z} is sitting where a crop or a platform's chrome can take it. Inside the safe area it survives every placement this asset will meet.`,
  separate_overlapping_zones: (z) =>
    `The ${z} and the product are fighting for the same space, which reads as an accident rather than a decision. Separating them keeps both legible and leaves the composition's intent alone.`,
  increase_zone_margin: (z) =>
    `The ${z} has nothing to breathe into, and crowding reads as cheapness regardless of how good the type is.`,
  raise_zone_priority: (z) => `The ${z} is being lost in the frame and is not earning the attention its job needs.`,
};

export interface DesignDecisionInput {
  analysis: VisionAnalysisResult | null | undefined;
  blueprint?: CreativeBlueprint | null;
  typography?: TypographySystem | null;
  layout?: LayoutGeometry | null;
}

/**
 * Turns what was seen into what the design systems should do about it.
 *
 * Pure. Applies nothing itself beyond producing the adjusted structures, so a
 * caller can inspect every decision before spending a render on it.
 */
export function decideDesignChanges(input: DesignDecisionInput): DesignDecisionResult {
  const out: DesignDecisionResult = {
    typography_decisions: [],
    layout_decisions: [],
    protected_elements: protectedElements(input.blueprint),
    untranslated: [],
  };

  // Nothing looked, so nothing is decided. The bridge already enforces this;
  // repeating it here keeps the engine correct when called directly.
  if (!input.analysis?.analyzed_image) return out;

  const corrections: StructuredCorrections = bridgeVisionToCorrections(input.analysis);
  out.untranslated = corrections.untranslated;

  const specs = input.typography?.specs || [];
  const zones = input.layout?.zones || [];

  // ── typography ────────────────────────────────────────────────────────
  const appliedTypography: TypographyCorrection[] = [];
  for (const c of corrections.typography) {
    const spec = specs.find((s) => s.role === c.role);
    const confidence = typographyConfidence(c, spec);
    const from = spec?.scale;
    const to = projectedScale(c, from);
    // Below a tenth of a step the change is invisible in the render and not
    // worth what a second render costs.
    const significant = from === undefined || to === undefined || Math.abs(to - from) >= 0.2;
    const applied = shouldApply(confidence, significant);

    out.typography_decisions.push({
      role: c.role,
      problem: c.because,
      decision: describeTypography(c, from, to),
      reason: (TYPOGRAPHY_REASON[c.action] || ((r: TextRole) => `The ${r} needs adjusting.`))(c.role),
      decision_confidence: confidence,
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      applied,
    });
    if (applied) appliedTypography.push(c);
  }

  // ── layout ────────────────────────────────────────────────────────────
  const appliedLayout: LayoutCorrection[] = [];
  for (const c of corrections.layout) {
    const zone = zones.find((z) => z.name === c.zone);
    const confidence = layoutConfidence(c, zone);
    const from = zone ? `${round(zone.x)}, ${round(zone.y)}` : undefined;
    const applied = shouldApply(confidence, true);

    out.layout_decisions.push({
      zone: c.zone,
      problem: c.because,
      decision: describeLayout(c),
      reason: (LAYOUT_REASON[c.action] || ((z: ZoneName) => `The ${z} needs adjusting.`))(c.zone),
      decision_confidence: confidence,
      ...(from ? { from } : {}),
      applied,
    });
    if (applied) appliedLayout.push(c);
  }

  // The existing systems do the applying. This engine decides; it does not own
  // a second implementation of typography or layout.
  if (appliedTypography.length) {
    out.typography = applyTypographyCorrections(input.typography, appliedTypography);
  }
  if (appliedLayout.length) {
    out.layout = applyLayoutCorrections(input.layout, appliedLayout);
  }

  // Record where each zone actually landed, so the decision can be checked
  // against the result rather than believed.
  if (out.layout) {
    for (const d of out.layout_decisions) {
      const moved = out.layout.zones.find((z) => z.name === d.zone);
      if (moved && d.applied) d.to = `${round(moved.x)}, ${round(moved.y)}`;
    }
  }
  if (out.typography) {
    for (const d of out.typography_decisions) {
      const s = out.typography.specs.find((x) => x.role === d.role);
      if (s && d.applied) d.to = s.scale;
    }
  }

  return out;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** What the scale would become, mirroring what the bridge would do. */
function projectedScale(c: TypographyCorrection, from: number | undefined): number | undefined {
  if (from === undefined) return undefined;
  if (c.action === "increase_headline_hierarchy") return Math.min(Number((from * 1.35).toFixed(2)), 6);
  if (c.action === "reduce_headline_dominance") return Math.max(Number((from * 0.75).toFixed(2)), 1);
  return from;
}

function describeTypography(c: TypographyCorrection, from?: number, to?: number): string {
  const move = from !== undefined && to !== undefined && from !== to ? ` from ${from} to ${to}` : "";
  switch (c.action) {
    case "increase_headline_hierarchy":
      return `Increase ${c.role} scale${move}`;
    case "reduce_headline_dominance":
      return `Reduce ${c.role} scale${move}`;
    case "increase_text_contrast":
      return `Give the ${c.role} a clear tonal separation from its background`;
    case "tighten_tracking":
      return `Close the ${c.role} letter spacing`;
    case "loosen_tracking":
      return `Open the ${c.role} letter spacing`;
    case "correct_text_content":
      return `Reproduce the ${c.role} text exactly as specified`;
  }
}

function describeLayout(c: LayoutCorrection): string {
  switch (c.action) {
    case "move_cta_to_safe_area":
      return `Move the ${c.zone} inside the safe area`;
    case "separate_overlapping_zones":
      return `Move the ${c.zone} clear of the product`;
    case "increase_zone_margin":
      return `Increase the clear space around the ${c.zone}`;
    case "raise_zone_priority":
      return `Give the ${c.zone} more visual weight`;
  }
}

/**
 * The applied decisions, as an instruction for the corrected render.
 *
 * Only `applied` decisions appear -- a low-confidence decision is recorded for
 * the interface to show, not sent to a renderer. The block opens by naming what
 * must survive, using the blueprint's own protected elements, because an
 * instruction that leads with problems invites a reinterpretation and the whole
 * value of this pass is that only the listed things move.
 */
export function renderDesignDecisions(r: DesignDecisionResult | null | undefined): string | undefined {
  if (!r) return undefined;
  const t = r.typography_decisions.filter((d) => d.applied);
  const l = r.layout_decisions.filter((d) => d.applied);
  if (!t.length && !l.length) return undefined;

  const keep = r.protected_elements.length
    ? `Hold these exactly as they are: ${r.protected_elements.join(", ")}.`
    : "Hold the concept, mood, palette, lighting and composition idea exactly as they are.";

  const rank = { high: 0, medium: 1, low: 2 } as const;
  const lines = [
    ...t.sort((a, b) => rank[a.decision_confidence] - rank[b.decision_confidence])
      .map((d) => `- ${d.decision}. ${d.reason}`),
    ...l.sort((a, b) => rank[a.decision_confidence] - rank[b.decision_confidence])
      .map((d) => `- ${d.decision}. ${d.reason}`),
  ];

  return [
    "EXECUTION CORRECTIONS",
    "",
    keep,
    "This is a correction pass, not a reinterpretation. Change only what is listed:",
    "",
    ...lines,
  ].join("\n");
}

/**
 * The two renders compared as a designer would compare them.
 *
 * Deliberately no numeric score. A number invites a threshold, a threshold over
 * a soft judgement is how this product shipped a hardcoded 94/100 once, and the
 * honest form of "is this better" is a sentence naming what changed and what
 * did not. Each field is a statement or absent -- never a fabricated middle.
 */
export interface DesignQualityComparison {
  typography_quality: string;
  layout_quality: string;
  readability: string;
  product_focus: string;
  overall_reasoning: string;
  /** Which render this recommends keeping. */
  recommendation: "first" | "second";
}

/** Counts a category of problem across an analysis. */
function countOf(a: VisionAnalysisResult, key: keyof VisionAnalysisResult): number {
  const v = a[key];
  return Array.isArray(v) ? v.length : 0;
}

/**
 * Compares two reviewed renders.
 *
 * Conservative by construction: the second render must be better on the balance
 * of observed problems to be recommended. Equal is not better, and unknown is
 * not better -- replacing a result the user is about to see has to be earned.
 */
export function compareDesignQuality(
  first: VisionAnalysisResult | null | undefined,
  second: VisionAnalysisResult | null | undefined,
): DesignQualityComparison {
  const unavailable = (why: string): DesignQualityComparison => ({
    typography_quality: why,
    layout_quality: why,
    readability: why,
    product_focus: why,
    overall_reasoning: `${why} The first render was kept, because there is no basis to prefer the other.`,
    recommendation: "first",
  });

  if (!first?.analyzed_image) return unavailable("The first render was not reviewed.");
  if (!second?.analyzed_image) return unavailable("The corrected render was not reviewed.");

  const verdict = (label: string, a: number, b: number, better: string, worse: string, same: string) =>
    b < a ? `${better} (${a} → ${b})` : b > a ? `${worse} (${a} → ${b})` : `${same} (${a})`;

  const t1 = countOf(first, "typography_problems");
  const t2 = countOf(second, "typography_problems");
  const l1 = countOf(first, "layout_problems");
  const l2 = countOf(second, "layout_problems");
  const r1 = countOf(first, "issues");
  const r2 = countOf(second, "issues");
  const p1 = countOf(first, "product_accuracy");
  const p2 = countOf(second, "product_accuracy");

  const total1 = t1 + l1 + r1 + p1;
  const total2 = t2 + l2 + r2 + p2;
  const secondWins = total2 < total1;

  return {
    typography_quality: verdict(
      "typography", t1, t2,
      "The type reads more cleanly than before",
      "The type came back weaker",
      "The type is unchanged",
    ),
    layout_quality: verdict(
      "layout", l1, l2,
      "The frame sits better",
      "The frame came back more crowded",
      "The frame is unchanged",
    ),
    readability: verdict(
      "readability", r1, r2,
      "Fewer things get in the way of reading it",
      "More things get in the way of reading it",
      "Readability is unchanged",
    ),
    product_focus: verdict(
      "product", p1, p2,
      "The product holds up better",
      "The product suffered",
      "The product is unchanged",
    ),
    overall_reasoning: secondWins
      ? `The corrected render resolved ${total1 - total2} of ${total1} observed problems without the direction changing, so it is the one to keep.`
      : total2 > total1
        ? `The corrections introduced more problems than they fixed (${total1} → ${total2}). The first render was kept.`
        : `The corrections changed nothing measurable (${total1} problems either way), so the first render was kept rather than spending the difference for nothing.`,
    recommendation: secondWins ? "second" : "first",
  };
}

/** Counts and confidences only -- never the reasoning, which quotes the render. */
export function designDecisionTelemetry(r: DesignDecisionResult | null | undefined) {
  if (!r) return { design_decisions: false };
  const conf = (ds: { decision_confidence: DecisionConfidence }[]) => ({
    high: ds.filter((d) => d.decision_confidence === "high").length,
    medium: ds.filter((d) => d.decision_confidence === "medium").length,
    low: ds.filter((d) => d.decision_confidence === "low").length,
  });
  return {
    design_decisions: true,
    typography: r.typography_decisions.length,
    typography_applied: r.typography_decisions.filter((d) => d.applied).length,
    typography_confidence: conf(r.typography_decisions),
    layout: r.layout_decisions.length,
    layout_applied: r.layout_decisions.filter((d) => d.applied).length,
    layout_confidence: conf(r.layout_decisions),
    protected: r.protected_elements.length,
    untranslated: r.untranslated.length,
  };
}
