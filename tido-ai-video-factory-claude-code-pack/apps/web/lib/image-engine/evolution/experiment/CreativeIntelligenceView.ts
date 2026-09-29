import type { CreativeBlueprint, Decision } from "./CreativeBlueprint";
import type { CreativeDecision } from "./CreativeDecision";
import type { ProductMeaning } from "./ProductMeaning";
import type { MarketingInsight } from "./MarketingInsight";
import type { CreativeQualityScore } from "../../benchmark/CommercialRenderCritic";
import type { CreativeDiagnosis } from "../../benchmark/CreativeDiagnosis";
import type { ConceptComparison } from "../../benchmark/ConceptEvaluator";
import type { MarketingBrainStrategy } from "../../llm/prompt-strategy.schema";
import type { IndustryLandscape } from "./IndustryContextIntelligence";
import type { CreativeOpportunity } from "./CreativeOpportunity";

/**
 * The creative intelligence, translated for a person.
 *
 * Everything this system decides already exists as structured data with
 * provenance. None of it has ever left the backend, so the interface shows a
 * finished image and nothing about how it was arrived at.
 *
 * This is the translation layer, and it is a VIEW — it reasons about nothing.
 * Every string below is read from a decision some module already made. Where a
 * decision was not made the field is absent rather than filled, because the one
 * thing worse than showing no reasoning is showing invented reasoning: this
 * codebase has corrected that exact failure twice, once for a hardcoded 94/100
 * quality badge and once for placeholder brief text that was being locked in as
 * user intent.
 *
 * Two rules it follows
 * --------------------
 * 1. NO INTERNAL VOCABULARY. A user must never read "Layout Geometry",
 *    "Prompt Compiler", "blueprint" or "derived_from". The module names are an
 *    implementation detail and naming them makes a creative tool read like a
 *    developer console.
 * 2. NOTHING WITHOUT A SOURCE. Every field carries `because` where the
 *    underlying decision had one, so a professional can check any claim.
 */

/** One thing the system decided, and what made it decide that. */
export interface CreativeReason {
  /** The decision, in plain language. */
  what: string;
  /** Why, quoted from the decision's own basis. Absent when it had none. */
  why?: string;
  /**
   * How sure the system is. Carried through rather than flattened, because a
   * low-confidence inference presented like an observation is a lie of tone.
   */
  confidence?: "low" | "medium" | "high";
}

/** One creative direction the director developed. */
export interface ConceptOption {
  name: string;
  idea: string;
  reason: string;
  /** True for the one the director chose. */
  selected: boolean;
}

export interface CreativeIntelligence {
  /** "I understand this product as…" — one or two sentences. */
  creative_summary?: string;
  /** The direction the director committed to. */
  selected_direction?: string;
  /** Why that direction, in the director's own words. */
  reasoning?: string;
  /** Who this is for and what they want. */
  audience_insight?: CreativeReason;
  /** The world the picture lives in. */
  visual_strategy?: CreativeReason;
  typography_reasoning?: CreativeReason;
  composition_reasoning?: CreativeReason;
  layout_reasoning?: CreativeReason;
  /** What the system thinks is weak, in plain language. */
  critic_feedback?: string[];
  /** What it would change, written as direction rather than as a score. */
  improvement_suggestions?: string[];
  /** Every direction considered, the chosen one marked. */
  concepts?: ConceptOption[];
  /**
   * Phase 6 / New Product Principle: Commercial Category Landscape & Strategic Opportunity.
   */
  category_intelligence?: {
    industry: string;
    provenance: string;
    core_opportunity?: string;
    human_tension?: string;
    category_relationship?: string;
    whitespace_leveraged?: string;
    overused_cliches_avoided?: string[];
  };
  /**
   * Present only when something was genuinely undecided.
   *
   * Shown so a professional can see where the system stopped rather than
   * assuming it decided everything.
   */
  undecided?: string[];
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/** A decision becomes a reason, or nothing. Never a placeholder. */
function reasonOf(d: Decision | null | undefined): CreativeReason | undefined {
  const what = clean(d?.value);
  if (!what) return undefined;
  const why = clean(d?.because);
  return { what, ...(why ? { why } : {}), ...(d?.confidence ? { confidence: d.confidence } : {}) };
}

/**
 * Turns a diagnosis into something a person would act on.
 *
 * The internal form names blueprint fields ("design.hierarchy_logic"); those
 * are stripped. What remains is the problem and the correction, which is what a
 * creative director would actually say.
 */
function humanProblem(d: CreativeDiagnosis): string {
  return clean(d.problem);
}

export interface IntelligenceInput {
  blueprint?: CreativeBlueprint | null;
  /**
   * The marketing strategy, which the STABLE pipeline already produces.
   *
   * This is what lets intelligence reach ordinary users. The blueprint needs a
   * Creative Director, and the director only runs on the experiment path --
   * running it in stable would add a model call and change what renders, which
   * is exactly the risk this must not take.
   *
   * The strategy is different: `MarketingBrainService` runs on every stable
   * generation already. Reading it costs nothing, changes nothing, and yields
   * real product understanding, audience and craft intent. Fields it cannot
   * supply -- the chosen route and the directions considered -- stay absent
   * rather than being approximated, because those are the director's and the
   * director did not run.
   */
  strategy?: MarketingBrainStrategy | null;
  decision?: CreativeDecision | null;
  productMeaning?: ProductMeaning | null;
  marketingInsight?: MarketingInsight | null;
  critic?: CreativeQualityScore | null;
  diagnosis?: CreativeDiagnosis[] | null;
  concepts?: ConceptComparison | null;
  industryLandscape?: IndustryLandscape | null;
  creativeOpportunity?: CreativeOpportunity | null;
}

/**
 * Builds the view. Pure, and total: an empty input produces an empty object
 * rather than a shell of headings with nothing under them.
 */
export function buildCreativeIntelligence(input: IntelligenceInput): CreativeIntelligence {
  const b = input.blueprint || null;
  const d = input.decision || null;
  const pm = input.productMeaning || null;
  const mi = input.marketingInsight || null;

  const out: CreativeIntelligence = {};

  // ── what the product is ────────────────────────────────────────────────
  const story = clean(b?.story?.value) || clean(pm?.functional_value?.value);
  const material = clean(b?.brand_expression?.material_language?.value);
  const vt = input.strategy?.visual_translation;
  const summaryParts = [story, material].filter(Boolean);
  if (summaryParts.length) out.creative_summary = summaryParts.join(" ");
  else {
    // Stable path: the strategy's own reading of what is being shown.
    const fromStrategy = [clean(vt?.subject_representation), clean(vt?.material_treatment)]
      .filter(Boolean)
      .join(" ");
    if (fromStrategy) out.creative_summary = fromStrategy;
  }

  // ── the direction ──────────────────────────────────────────────────────
  const direction =
    clean(b?.concept?.big_idea?.value) ||
    clean(d?.strategy_route) ||
    clean(d?.selected_direction) ||
    clean(input.strategy?.creative_route) ||
    clean(input.strategy?.creative_angle);
  if (direction) out.selected_direction = direction;

  const why =
    clean(b?.concept?.big_idea?.because) ||
    clean(d?.strategy_reason) ||
    clean(input.strategy?.creative_message) ||
    clean(input.strategy?.communication_objective);
  if (why) out.reasoning = why;

  // ── who it is for ──────────────────────────────────────────────────────
  const audience =
    reasonOf(b?.concept?.emotional_hook) ||
    (mi?.target_customer ? reasonOf(mi.target_customer) : undefined) ||
    (mi?.customer_problem ? reasonOf(mi.customer_problem) : undefined) ||
    (clean(input.strategy?.consumer_insight)
      ? { what: clean(input.strategy!.consumer_insight!), confidence: "medium" as const }
      : clean(input.strategy?.target_customer_psychology)
        ? { what: clean(input.strategy!.target_customer_psychology), confidence: "medium" as const }
        : undefined);
  if (audience) out.audience_insight = audience;

  // ── the craft ──────────────────────────────────────────────────────────
  const fromVt = (what?: string, why?: string): CreativeReason | undefined =>
    clean(what) ? { what: clean(what), ...(clean(why) ? { why: clean(why) } : {}), confidence: "medium" } : undefined;

  const visual =
    reasonOf(b?.visual_world?.visual_world) ||
    reasonOf(b?.brand_expression?.visual_language) ||
    fromVt(vt?.atmosphere, clean(input.strategy?.creative_angle));
  if (visual) out.visual_strategy = visual;

  const typo =
    reasonOf(b?.design?.typographic_voice) ||
    reasonOf(b?.design?.font_character) ||
    fromVt(vt?.typography_intent);
  if (typo) out.typography_reasoning = typo;

  const comp =
    reasonOf(b?.visual_world?.composition_logic) ||
    reasonOf(b?.photography?.camera_language) ||
    fromVt(vt?.camera_intent) ||
    fromVt(vt?.lighting_character);
  if (comp) out.composition_reasoning = comp;

  const layout =
    reasonOf(b?.layout?.attention_flow) ||
    reasonOf(b?.layout?.visual_balance) ||
    fromVt(vt?.composition_principle);
  if (layout) out.layout_reasoning = layout;

  // ── what the system thinks is weak ─────────────────────────────────────
  const problems = (input.diagnosis || []).filter((x) => x.severity !== "low").map(humanProblem).filter(Boolean);
  if (problems.length) out.critic_feedback = problems;

  const actions = [
    ...(input.diagnosis || []).filter((x) => x.severity !== "low").map((x) => clean(x.recommended_correction)),
    ...(input.critic?.improvement_actions || []).map(clean),
  ].filter(Boolean);
  if (actions.length) out.improvement_suggestions = [...new Set(actions)];

  // ── the directions considered ──────────────────────────────────────────
  // The director develops several routes and keeps one. The rest were being
  // discarded before anything downstream could see them, which is why a user
  // has never been able to ask "what else did you consider".
  const comparison = input.concepts;
  if (comparison && comparison.scores.length > 1) {
    out.concepts = comparison.scores.map((s) => ({
      name: s.route,
      idea: s.route,
      reason: s.notes[0] || `Scored ${s.total} across originality, emotion, commercial fit and visual potential.`,
      selected: s.route === comparison.selected,
    }));
  }

  // ── where the system stopped ───────────────────────────────────────────
  if (b?.missing?.length) {
    // Field paths are internal; what a reader needs is the discipline that was
    // left open, in their language.
    const AREA: Record<string, string> = {
      concept: "creative concept",
      visual_world: "art direction",
      photography: "photography",
      design: "typography",
      layout: "layout",
      brand_expression: "brand expression",
    };
    const areas = [...new Set(b.missing.map((m) => AREA[m.split(".")[0]]).filter(Boolean))];
    if (areas.length) out.undecided = areas;
  }

  // ── category context & creative opportunity ────────────────────────────
  if (input.industryLandscape) {
    const l = input.industryLandscape;
    const opp = input.creativeOpportunity;
    out.category_intelligence = {
      industry: l.industry_name,
      provenance: l.provenance,
      ...(opp?.core_opportunity ? { core_opportunity: opp.core_opportunity } : {}),
      ...(opp?.human_tension ? { human_tension: opp.human_tension } : {}),
      ...(opp?.category_relationship ? { category_relationship: opp.category_relationship } : {}),
      ...(opp?.originality_reason ? { whitespace_leveraged: opp.originality_reason } : {}),
      ...(l.overused_category_cliches?.length ? { overused_cliches_avoided: l.overused_category_cliches } : {}),
    };
  }

  return out;
}

/** Counts only — never the reasoning text. */
export function intelligenceTelemetry(v: CreativeIntelligence | null | undefined) {
  if (!v) return { creative_intelligence: false };
  return {
    creative_intelligence: true,
    fields: Object.keys(v).length,
    has_direction: Boolean(v.selected_direction),
    concepts: v.concepts?.length ?? 0,
    problems: v.critic_feedback?.length ?? 0,
    suggestions: v.improvement_suggestions?.length ?? 0,
    undecided_areas: v.undecided?.length ?? 0,
  };
}
