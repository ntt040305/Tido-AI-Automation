import type { MarketingBrainStrategy } from "../../llm/prompt-strategy.schema";
import type { CreativeDecision } from "./CreativeDecision";
import type { CreativeJudgment } from "./CreativeDirectorV1";
import type { MarketingInsight } from "./MarketingInsight";
import type { ProductMeaning } from "./ProductMeaning";
import type { AssetContext } from "./AssetContext";
import { LayoutArchitect } from "./LayoutArchitect";
import type { ProductTruth, TruthClaim } from "./ProductTruth";
import type { VisualDNA } from "./VisualDNAAnalyzer";
import {
  ArtDirection,
  BrandExpressionDirection,
  CampaignDirection,
  CreativeBlueprint,
  Decision,
  DecisionBasis,
  LayoutDirection,
  PhotographyDirection,
  SECTION_FIELDS,
  TOTAL_BLUEPRINT_FIELDS,
  TypographyDirection,
  allDecisions,
  blueprintProvenance,
} from "./CreativeBlueprint";

/**
 * The Professional Creative Brain — ONE reasoning layer, not four agents.
 *
 * Art director, photographer, typographer and layout designer are four ROLES,
 * and this file is the one place all four are resolved. They are deliberately
 * not four modules with four entry points: four independent describers of one
 * frame produce four frames, which is the duplicate-carrier defect this project
 * has already paid for twice.
 *
 * No model call. No agent. No clock, no randomness.
 * -------------------------------------------------
 * Every value here is ROUTED from something an upstream stage already authored.
 * The director's single existing call is the author of record for craft
 * decisions — `CreativeJudgment.reasoning` already carries {choice, reason} for
 * camera, lighting, composition, typography and colour, which is exactly
 * `value` and `because`. That reasoning was being computed and thrown away.
 *
 * The brain does not invent a lens because a lens field exists. Phase 2.1
 * measured what the pipeline actually authors: lens 0/6 and depth of field 0/6
 * across six real briefs. Those fields stay null, and `missing` names them.
 * That list is the honest map of what the system cannot yet decide, and it is
 * more useful than a blueprint that looks full.
 *
 * Authority ladder, applied per field
 * -----------------------------------
 *   USER explicit  >  CREATIVE DIRECTOR  >  AI suggestion
 * expressed as ladder order: a rung reading the client's own words is tried
 * before one reading the director's reasoning, which is tried before one
 * reading a strategy inference. First rung with something to say wins.
 */

export interface CreativeBrainInput {
  productTruth?: ProductTruth | null;
  marketingInsight?: MarketingInsight | null;
  /** The DERIVED tier. The main source of product grounding in this layer. */
  productMeaning?: ProductMeaning | null;
  visualDNA?: VisualDNA | null;
  strategy?: MarketingBrainStrategy | null;
  /** The resolved director contract. */
  decision?: CreativeDecision | null;
  /** The raw judgment, which carries the director's own reasons. */
  judgment?: CreativeJudgment | null;
  /** The resolved asset intent. The Layout Architect's format spine. */
  assetContext?: AssetContext | null;
  productCount?: number;
  hasLogo?: boolean;
  /**
   * The client's own copy, with whatever roles they labelled.
   *
   * USER tier, so it outranks the director's reading of the same strings. The
   * brain could not see it before, which left `hierarchy_logic` with exactly one
   * source -- the director's `copy_roles` -- and that source is empty whenever
   * `typography_roles_v1` is off. Measured on run_20260919_007: copy_roles was
   * [] on 12/12 renders, hierarchy was undecided on all of them, and
   * commercial_quality averaged 5.47, the system's worst dimension by a margin.
   */
  copyItems?: (string | { text: string; type?: string })[];
  /**
   * An insight ladder from `reasoning/HumanTensionAnalyzer`, where the caller
   * built one.
   *
   * Passed in resolved, like every other flagged input, so the brain stays
   * flag-free. The analyzer truncates rather than guessing, so a shallow ladder
   * here means the evidence was shallow and the confidence below says so.
   */
  tension?: { statement: string; step: string; matched: boolean; archetype: string } | null;
  /**
   * Corrections from a previous pass, keyed `section.field`.
   *
   * The refinement loop's whole mechanism. The brain is deterministic, so
   * re-assembling identical inputs returns an identical blueprint and a second
   * pass is theatre. This is the one input that can differ between passes.
   *
   * Consulted LAST in every ladder, so a correction can only fill a field that
   * nothing decided. It cannot overrule the client, the director, or an
   * observation -- a critic who can overwrite the brief is not a critic, and
   * the USER > DIRECTOR > AI order is not negotiable because a later pass
   * disagrees with it.
   */
  corrections?: Record<string, { value: string; because: string }>;
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

function stated(claim: TruthClaim | undefined | null): string {
  if (!claim || claim.provenance === "ABSENT") return "";
  return clean(claim.value);
}

interface Rung {
  text: string;
  because: string;
  derived_from: DecisionBasis;
  confidence: Decision["confidence"];
  /** Only ever set where a real source exists. See `Decision`. */
  commercial_effect?: string;
  alternative_rejected?: string;
}

/**
 * First rung with something to say. Null when all are silent.
 *
 * A rung whose basis would merely restate its value is skipped rather than
 * emitted — the same check `validateBlueprint` runs, applied at the source so a
 * blueprint is never built already broken.
 */
function decide(rungs: (Rung | null)[]): Decision | null {
  for (const r of rungs) {
    if (!r) continue;
    const value = clean(r.text);
    const because = clean(r.because);
    if (!value || !because) continue;
    if (value.toLowerCase() === because.toLowerCase()) continue;
    return {
      value,
      because,
      derived_from: r.derived_from,
      confidence: r.confidence,
      // Spread so an absent field stays absent rather than becoming undefined:
      // `deepStrictEqual` distinguishes those and the equivalence tests depend
      // on it.
      ...(clean(r.commercial_effect) ? { commercial_effect: clean(r.commercial_effect) } : {}),
      ...(clean(r.alternative_rejected) ? { alternative_rejected: clean(r.alternative_rejected) } : {}),
    };
  }
  return null;
}

/** A rung reading the director's own reasoning: its choice AND its reason. */
function fromReasoning(
  j: CreativeJudgment | null | undefined,
  key: "camera" | "lighting" | "composition" | "typography" | "colour"
): Rung | null {
  const r = j?.reasoning?.[key];
  if (!r) return null;
  return {
    text: clean(r.choice),
    because: `the director's own reason for the ${key} decision: ${clean(r.reason)}`,
    derived_from: "director",
    confidence: "high",
  };
}

const rung = (
  text: string,
  because: string,
  derived_from: DecisionBasis,
  confidence: Decision["confidence"] = "medium"
): Rung => ({ text, because, derived_from, confidence });

/**
 * A clause of a decision that speaks to a craft dimension.
 *
 * Used where nothing authors a field but the director may have mentioned it in
 * passing inside another one. Quoting that clause is routing; writing one when
 * there is no clause would be authoring, so this returns "" rather than a
 * fallback.
 */
function clause(text: string, re: RegExp): string {
  if (!text) return "";
  for (const part of text.split(/[;.]\s*|\n/)) {
    const p = part.trim();
    if (p && re.test(p)) return p;
  }
  return "";
}

const LENS = /\b(\d{2,3}\s?mm|lens|focal length|telephoto|wide[- ]angle|macro|compress\w*|flatten\w*)\b/i;
const FOCUS = /\b(depth of field|bokeh|shallow|deep focus|f\/\d|aperture|sharp throughout|falls? off|focus falls|blur\w*)\b/i;
const DEPTH = /\b(depth|layer\w*|foreground|background|distance|recede\w*|near and far)\b/i;
const WEIGHT = /\b(weight|bold|light|heavy|thin|regular|black|condensed)\b/i;
const SPACING = /\b(spacing|whitespace|white space|breathing|margin|gutter|air|leading|tracking)\b/i;
const PLACEMENT = /\b(placed|placement|top|bottom|left|right|corner|above|below|beside|across)\b/i;
const CONTRAST = /\b(contrast|legib\w*|readab\w*|against|stands? out|reads? clear\w*)\b/i;
const BALANCE = /\b(balance|visual weight|negative space|counterweight|asymmetr\w*|symmetr\w*|weighted)\b/i;
const FLOW = /\b(eye|reads? (?:first|from)|leads? the|draws? the|flow|path|first second)\b/i;
/** Least certain first: what a budget pass gives up before anything else. */
const CONFIDENCE_ORDER: Record<Decision["confidence"], number> = { low: 0, medium: 1, high: 2 };

const METAPHOR = /\b(as if|like a|stands? for|means?|signals?|says?|reads? as)\b/i;

export class ProfessionalCreativeBrain {
  /**
   * Assembles the blueprint. Pure and total: never throws, always returns an
   * object. A caller inside a paid render must not be taken down by a missing
   * adjective, and a blueprint of 38 nulls is a legitimate answer for a request
   * that supplied nothing.
   */
  static assemble(input: CreativeBrainInput): CreativeBlueprint {
    const t = input.productTruth || null;
    const mi = input.marketingInsight || null;
    const pm = input.productMeaning || null;
    /** A rung reading a ProductMeaning field, carrying its basis forward. */
    const fromMeaning = (dd: Decision | null | undefined, label: string): Rung | null =>
      dd ? { text: dd.value, because: `ProductMeaning.${label} - ${dd.because}`, derived_from: "product_truth", confidence: dd.confidence } : null;
    /** A rung reading a MarketingInsight field, carrying its basis forward. */
    const fromInsight = (dd: Decision | null | undefined, label: string): Rung | null =>
      dd ? { text: dd.value, because: `MarketingInsight.${label} - ${dd.because}`, derived_from: dd.derived_from, confidence: dd.confidence } : null;
    const s = input.strategy || null;
    const d = input.decision || null;
    const j = input.judgment || null;
    const vt = s?.visual_translation;
    const ac = input.assetContext || null;
    const observed = input.visualDNA?.observed?.product || null;
    /**
     * A rung reading a correction for one field. Lowest priority everywhere.
     *
     * `low` confidence on purpose: a correction is a critic's inference about a
     * gap, not an observation, and the blueprint has to keep saying so.
     */
    const corrected = (field: string): Rung | null => {
      const c = input.corrections?.[field];
      return c && clean(c.value)
        ? { text: c.value, because: `correction after review - ${c.because}`, derived_from: "director", confidence: "low" }
        : null;
    };
    // Normalised once: a copy item is a bare string or an object with a type.
    const copyList = (input.copyItems || []).filter(Boolean);
    const copyTexts = copyList.map((c) => (typeof c === "string" ? c : clean(c?.text))).filter(Boolean);
    const clientRoles = copyList
      .map((c) => (typeof c === "string" ? "" : clean(c?.type)))
      .filter(Boolean)
      .map((r) => r.toUpperCase());

    const story = decide([
      fromMeaning(pm?.functional_value, "functional_value"),
      t ? rung(stated(t.functional_truth), "ProductTruth.functional_truth, declared by the client", "product_truth", "high") : null,
      d ? rung(clean(d.visual_story), "the director's visual story for this brief", "director", "medium") : null,
    ]);

    // ── concept ────────────────────────────────────────────────────────────
    const concept: CampaignDirection = {
      big_idea: decide([
        d
          ? {
              text: clean(d.strategy_route),
              because: `the director chose this route: ${clean(d.strategy_reason)}`,
              derived_from: "director",
              confidence: "high",
              // The only real rejection in the engine: the runner-up route and
              // why it lost, carried from `CreativeStrategy.why_not_runner_up`.
              ...(clean(d.deliberately_avoided) ? { alternative_rejected: clean(d.deliberately_avoided) } : {}),
              ...(clean(ac?.communication_goal) ? { commercial_effect: clean(ac?.communication_goal) } : {}),
            }
          : null,
        d ? rung(clean(d.selected_direction), `the director's chosen direction, for this goal: ${clean(d.creative_goal)}`, "director", "high") : null,
        corrected("concept.big_idea"),
      ]),
      campaign_concept: decide([
        d ? rung(clean(d.creative_goal), "what the director set out to achieve with this direction", "director", "high") : null,
        s ? rung(clean(s.creative_message), "MarketingStrategy.creative_message", "strategy") : null,
        corrected("concept.campaign_concept"),
      ]),
      visual_story: decide([
        d ? rung(clean(d.visual_story), "the director's account of what the frame shows", "director", "high") : null,
        vt ? rung(clean(vt.scene_moment), "visual_translation.scene_moment", "strategy") : null,
        corrected("concept.visual_story"),
      ]),
      // A concept with no tension is a description. Sourced from the route the
      // director turned down, which is the only place the engine records a
      // trade-off it actually made.
      creative_tension: decide([
        d ? rung(clean(d.deliberately_avoided), "the direction the director considered and rejected", "director", "high") : null,
        // reasoning/HumanTensionAnalyzer, reading the brief's own stated
        // challenge. Confidence follows whether a known problem shape matched:
        // an unmatched ladder is derived from sentence structure alone and the
        // analyzer says so itself.
        input.tension?.statement
          ? rung(
              input.tension.statement,
              `reasoning/HumanTensionAnalyzer reached the ${input.tension.step} rung on the brief's stated challenge (${input.tension.archetype})`,
              "strategy",
              input.tension.matched ? "high" : "low"
            )
          : null,
        fromInsight(mi?.objection, "objection"),
        mi?.customer_problem
          ? rung(mi.customer_problem.value, `MarketingInsight.customer_problem — ${mi.customer_problem.because}`, "strategy")
          : null,
        corrected("concept.creative_tension"),
      ]),
      emotional_hook: decide([
        fromInsight(mi?.desire, "desire"),
        fromMeaning(pm?.emotional_value, "emotional_value"),
        d ? rung(clean(d.creative_goal), "the director's goal, read as what the viewer should feel", "director", "low") : null,
        corrected("concept.emotional_hook"),
      ]),
      message_strategy: decide([
        d ? rung(clean(d.strategy_reason), "the director's reason for answering the brief this way", "director", "high") : null,
        s ? rung(clean(s.communication_objective), "MarketingStrategy.communication_objective", "strategy") : null,
        corrected("concept.message_strategy"),
      ]),
    };

    // ── visual world ───────────────────────────────────────────────────────
    const visual_world: ArtDirection = {
      visual_world: decide([
        d ? rung(clean(d.environment_decision), "the chosen direction's visual language", "director", "high") : null,
        s ? rung(clean(s.creative_angle), "the angle strategy committed the campaign to", "strategy") : null,
        corrected("visual_world.visual_world"),
      ]),
      environment_logic: decide([
        d ? rung(clean(d.scene_definition), "the director's definition of the scene", "director", "high") : null,
        corrected("visual_world.environment_logic"),
      ]),
      color_story: decide([
        fromReasoning(j, "colour"),
        vt ? rung(clean(vt.colour_direction), "visual_translation.colour_direction", "strategy") : null,
        observed?.palette?.length
          ? rung(observed.palette.join(", "), "VisualDNA.observed.product.palette, read off the attached image", "visual_dna", "high")
          : null,
        corrected("visual_world.color_story"),
      ]),
      visual_metaphor: decide([
        d ? rung(clause(clean(d.visual_story), METAPHOR), "the meaning the director named inside the visual story", "director") : null,
        d?.element_meanings?.length
          ? rung(d.element_meanings.join("; "), "the meanings the director assigned to individual elements", "director", "high")
          : null,
        corrected("visual_world.visual_metaphor"),
      ]),
      styling: decide([
        d?.important_visual_elements?.length
          ? rung(d.important_visual_elements.join("; "), "the elements the director called essential to the frame", "director", "high")
          : null,
        corrected("visual_world.styling"),
      ]),
      props: decide([
        d?.staging_requirements?.length
          ? rung(d.staging_requirements.join("; "), "how the director staged the subjects in the frame", "director", "high")
          : null,
        corrected("visual_world.props"),
      ]),
      atmosphere: decide([
        vt ? rung(clean(vt.atmosphere), "visual_translation.atmosphere", "strategy") : null,
        d ? rung(clean(d.creative_goal), "the emotional goal the director set", "director", "low") : null,
        corrected("visual_world.atmosphere"),
      ]),
      composition_logic: decide([
        fromReasoning(j, "composition"),
        d ? rung(clean(d.composition_decision), "the director's composition call for this brief", "director", "high") : null,
        vt ? rung(clean(vt.composition_principle), "visual_translation.composition_principle", "strategy") : null,
        corrected("visual_world.composition_logic"),
      ]),
    };

    // ── photography ────────────────────────────────────────────────────────
    // Behaviour, never specification. Nothing here reads a focal length from a
    // table; where the director named one it travels as the director's words.
    const cameraText = clean(d?.camera_decision);
    const photography: PhotographyDirection = {
      camera_language: decide([
        fromReasoning(j, "camera"),
        d ? rung(cameraText, "the director's camera call for this brief", "director", "high") : null,
        vt ? rung(clean(vt.camera_intent), "strategy stated the camera's job without specifying it", "strategy") : null,
        corrected("photography.camera_language"),
      ]),
      lens_character: decide([
        d ? rung(clause(cameraText, LENS), "the lens behaviour the director named while deciding the camera", "director") : null,
        // Behaviour derived from the product's own physical reality. Never a
        // focal length: what a lens DOES to a subject is decidable from what
        // the subject is, and a number is not.
        pm?.visual_implication
          ? rung(
              "A perspective close enough that the product's own surface and markings read as the subject, with the surroundings compressed behind it rather than competing with it.",
              "ProductMeaning.visual_implication - " + pm.visual_implication.because,
              "product_truth",
              "medium"
            )
          : null,
        corrected("photography.lens_character"),
      ]),
      focus_behavior: decide([
        d ? rung(clause(cameraText, FOCUS), "the focus behaviour named inside the camera decision", "director") : null,
        d ? rung(clause(clean(d.lighting_decision), FOCUS), "the focus behaviour named inside the lighting decision", "director") : null,
        observed
          ? rung(
              "Whatever carries the product's identity stays the sharpest thing in the frame; everything else may fall away.",
              "VisualDNA.observed.product - the identifying surface was read off the attached image",
              "visual_dna",
              "high"
            )
          : null,
        corrected("photography.focus_behavior"),
      ]),
      lighting_behavior: decide([
        fromReasoning(j, "lighting"),
        d ? rung(clean(d.lighting_decision), "the director's lighting call for this brief", "director", "high") : null,
        vt ? rung(clean(vt.lighting_character), "visual_translation.lighting_character", "strategy") : null,
        corrected("photography.lighting_behavior"),
      ]),
      depth_feeling: decide([
        d ? rung(clause(clean(d.scene_definition), DEPTH), "the depth the director described in the scene", "director") : null,
        d ? rung(clause(cameraText, DEPTH), "the depth named inside the camera decision", "director") : null,
        fromInsight(mi?.life_context, "life_context"),
        corrected("photography.depth_feeling"),
      ]),
      material_rendering: decide([
        observed
          ? rung(
              [
                ...(observed.materials || []).map(clean),
                clean(observed.finish),
                clean(observed.surface_detail),
              ].filter(Boolean).join("; "),
              "VisualDNA.observed.product — the material as the attached image shows it",
              "visual_dna",
              "high"
            )
          : null,
        vt ? rung(clean(vt.material_treatment), "how strategy asked surfaces to read, no image having been analysed", "strategy") : null,
        corrected("photography.material_rendering"),
      ]),
    };

    // ── typography ─────────────────────────────────────────────────────────
    // Required to rest on product, brand, audience or concept — never on a
    // font list. The ladder has no rung that could supply one.
    const typoText = clean(d?.typography_decision);
    const design: TypographyDirection = {
      font_character: decide([
        fromReasoning(j, "typography"),
        d ? rung(typoText, "the director's call on how the words should behave", "director", "high") : null,
        vt ? rung(clean(vt.typography_intent), "strategy stated what the words should behave like", "strategy") : null,
        corrected("design.font_character"),
      ]),
      // How the words should SOUND. Rests on what the product means and who is
      // looking, which is the dependency that stops typography defaulting to a
      // house style.
      typographic_voice: decide([
        d ? rung(clause(typoText, WEIGHT), "the weight the director named in the typography decision", "director") : null,
        fromMeaning(pm?.emotional_value, "emotional_value"),
        fromInsight(mi?.desire, "desire"),
        corrected("design.typographic_voice"),
      ]),
      hierarchy_logic: decide([
        // The client labelling their own copy outranks the director reading it.
        clientRoles.length
          ? rung(
              `Read in this order: ${clientRoles.join(" -> ")}.`,
              "the client labelled each string on the request, which is a reading order they chose rather than one inferred for them",
              "user",
              "high"
            )
          : null,
        d?.copy_roles?.length
          ? rung(
              `Read in this order: ${d.copy_roles.map((r) => clean(r?.role)).filter(Boolean).join(" → ")}.`,
              "the director assigned each authorized string a job, and that assignment is the reading order",
              "director",
              "high"
            )
          : null,
        // Last resort: the order the client typed them in. Weak, and says so,
        // but a stated order beats leaving the renderer to choose which line
        // leads -- which is what an undecided hierarchy actually means.
        copyTexts.length > 1
          ? rung(
              `Read in the order the client supplied: ${copyTexts.length} strings, first to last.`,
              "the client supplied several strings and labelled none; the order they were written in is the only reading order anyone has stated",
              "user",
              "low"
            )
          : null,
        corrected("design.hierarchy_logic"),
      ]),
      spacing_behavior: decide([
        d ? rung(clause(typoText, SPACING), "the spacing named inside the typography decision", "director") : null,
        d ? rung(clause(clean(d.composition_decision), SPACING), "the spacing named inside the composition decision", "director") : null,
        corrected("design.spacing_behavior"),
      ]),
      placement_reason: decide([
        d ? rung(clause(typoText, PLACEMENT), "where the director placed the words", "director") : null,
        pm?.visual_implication
          ? rung(
              "The words go where they do not cover the product's own markings - those are what the buyer recognises.",
              "ProductMeaning.visual_implication - " + pm.visual_implication.because,
              "product_truth",
              "high"
            )
          : null,
        corrected("design.placement_reason"),
      ]),
      contrast_strategy: decide([
        d ? rung(clause(typoText, CONTRAST), "the legibility the director asked for", "director") : null,
        fromInsight(mi?.objection, "objection"),
        corrected("design.contrast_strategy"),
      ]),
    };

    // ── layout ─────────────────────────────────────────────────────────────
    const compText = clean(d?.composition_decision);
    // The architect decides structure the director left undecided. Consulted
    // AFTER every director rung in each field below, so USER > DIRECTOR > AI
    // survives: it fills gaps, it never overrides a decision that was made.
    const arch = LayoutArchitect.design({
      assetContext: input.assetContext,
      decision: d,
      productMeaning: pm,
      visualDNA: input.visualDNA,
      productCount: input.productCount,
      hasLogo: input.hasLogo,
      copyItems: input.copyItems,
    });
    const fromArchitect = (dd: Decision | null, field: string): Rung | null =>
      dd ? { text: dd.value, because: `LayoutArchitect.${field} - ${dd.because}`, derived_from: dd.derived_from, confidence: dd.confidence } : null;
    const layout: LayoutDirection = {
      visual_balance: decide([
        d ? rung(clause(compText, BALANCE), "the balance named inside the composition decision", "director") : null,
        fromArchitect(arch.visual_balance, "visual_balance"),
        corrected("layout.visual_balance"),
      ]),
      product_position: decide([
        d?.staging_requirements?.length
          ? rung(d.staging_requirements.join("; "), "where the director placed the product in the frame", "director", "high")
          : null,
        d ? rung(clean(d.product_relationship), "why these products share the frame", "director") : null,
        fromArchitect(arch.product_position, "product_position"),
        corrected("layout.product_position"),
      ]),
      text_area: decide([
        d ? rung(clause(typoText, PLACEMENT), "the area the director reserved for the words", "director") : null,
        fromArchitect(arch.text_area, "text_area"),
        corrected("layout.text_area"),
      ]),
      negative_space: decide([
        d ? rung(clause(compText, SPACING), "the space the director left empty, and why", "director") : null,
        fromArchitect(arch.negative_space, "negative_space"),
        corrected("layout.negative_space"),
      ]),
      attention_flow: decide([
        d ? rung(clause(compText, FLOW), "the reading path the director described", "director") : null,
        fromArchitect(arch.attention_flow, "attention_flow"),
        corrected("layout.attention_flow"),
      ]),
      composition_balance: decide([
        d ? rung(compText, "the director's composition call, as the frame's overall balance", "director", "high") : null,
        vt ? rung(clean(vt.composition_principle), "strategy's organising idea for the frame", "strategy") : null,
        fromArchitect(arch.composition_balance, "composition_balance"),
        corrected("layout.composition_balance"),
      ]),
    };

    // ── brand expression ───────────────────────────────────────────────────
    const brand_expression: BrandExpressionDirection = {
      visual_language: decide([
        d ? rung(clean(d.environment_decision), "the chosen direction's visual language", "director", "high") : null,
        d ? rung(clean(d.brand_context), "how the director read the brand's behaviour", "director") : null,
        corrected("brand_expression.visual_language"),
      ]),
      color_system: decide([
        vt ? rung(clean(vt.colour_direction), "strategy's palette direction and what it signals", "strategy") : null,
        observed?.palette?.length
          ? rung(observed.palette.join(", "), "VisualDNA.observed.product.palette, read off the image", "visual_dna", "high")
          : null,
        corrected("brand_expression.color_system"),
      ]),
      // Observed material must cite the observation when one exists, or
      // `validateBlueprint` rejects the blueprint. First for that reason.
      material_language: decide([
        observed
          ? rung(
              [...(observed.materials || []).map(clean), clean(observed.finish)].filter(Boolean).join("; "),
              "VisualDNA.observed.product — the material as the image shows it",
              "visual_dna",
              "high"
            )
          : null,
        vt ? rung(clean(vt.material_treatment), "how strategy asked surfaces to read", "strategy") : null,
        corrected("brand_expression.material_language"),
      ]),
      emotional_direction: decide([
        fromMeaning(pm?.emotional_value, "emotional_value"),
        d ? rung(clean(d.audience_context), "who the director understood to be looking", "director") : null,
        corrected("brand_expression.emotional_direction"),
      ]),
    };

    const draft = {
      story,
      concept,
      visual_world,
      photography,
      design,
      layout,
      brand_expression,
    } as CreativeBlueprint;

    const flat = allDecisions(draft);
    const groundedRows = flat.filter((x) => x.decision);
    const grounded = groundedRows.length;
    // Shares of the GROUNDED decisions, not of 36: a blueprint with four
    // fields, all resting on the product, IS fully product-grounded, and
    // dividing by 36 would punish honesty about the gaps.
    const shareOf = (pred: (b: DecisionBasis) => boolean) =>
      grounded ? Math.round((groundedRows.filter((x) => pred(x.decision!.derived_from)).length / grounded) * 100) / 100 : 0;
    const sectionsDeciding = new Set(groundedRows.map((x) => x.section)).size;

    return {
      ...draft,
      provenance: blueprintProvenance({
        productTruth: t,
        marketingInsight: mi,
        visualDNA: input.visualDNA,
        strategy: s,
        director: d,
      }),
      confidence: Math.round((grounded / TOTAL_BLUEPRINT_FIELDS) * 100) / 100,
      metrics: {
        grounded_in_product_score: shareOf((b) => b === "product_truth" || b === "visual_dna"),
        grounded_in_strategy_score: shareOf((b) => b === "strategy"),
        creative_coherence_score: Math.round((sectionsDeciding / 6) * 100) / 100,
      },
      missing: flat.filter((x) => !x.decision).map((x) => `${x.section}.${x.field}`),
    };
  }

  /**
   * The blueprint as the compiler receives it, or undefined when nothing
   * grounded.
   *
   * Sections are omitted entirely when empty rather than printed as a heading
   * with nothing under it — a renderer handed an empty heading treats it as a
   * dimension it may fill itself, which is the opposite of the intent.
   */
  static render(
    b: CreativeBlueprint | null | undefined,
    opts: { maxChars?: number } = {}
  ): string | undefined {
    if (!b) return undefined;
    // Order is the spec's, and it is load-bearing rather than cosmetic: the
    // concept comes before the craft that serves it, and brand expression sits
    // last because it is the frame the rest is read inside. A renderer reads a
    // long prompt in order and weights the end; the blueprint itself is already
    // appended last for that reason.
    const LABELS: Record<string, string> = {
      concept: "CREATIVE CONCEPT",
      visual_world: "ART DIRECTION",
      photography: "PHOTOGRAPHY DIRECTION",
      design: "TYPOGRAPHY DIRECTION",
      layout: "LAYOUT DIRECTION",
      brand_expression: "BRAND EXPRESSION",
    };
    const lines: string[] = [];
    if (b.story) lines.push("", "THE STORY:", `- ${b.story.value}`);
    for (const section of Object.keys(LABELS)) {
      const bag = (b as any)[section] || {};
      const rows = SECTION_FIELDS[section as keyof typeof SECTION_FIELDS]
        .map((f) => [f, bag[f] as Decision | null] as const)
        .filter(([, dec]) => dec);
      if (!rows.length) continue;
      lines.push("", `${LABELS[section]}:`, ...rows.map(([f, dec]) => `- ${f.replace(/_/g, " ")}: ${dec!.value}`));
    }
    if (!lines.length) return undefined;
    const full = ProfessionalCreativeBrain.compose(b, new Set());

    // The compiler trims its own output to 22,000 characters because that is
    // the measured ceiling above which this pipeline stops trusting a prompt,
    // and PromptBudgetManagerService.HARD_MAXIMUM truncates at 24,000.
    // Appending the blueprint after that ran the live prompt to 30,402
    // characters: 6,400 past the maximum the system itself calls unsafe, and
    // past it by a margin something downstream would cut silently, mid-line.
    //
    // So the blueprint lives inside a budget too. The LEAST certain decisions
    // go first: a low-confidence inference is the cheapest thing in the object
    // to lose, and the high-confidence decisions resting on the product are
    // the ones worth the characters.
    // `=== undefined` rather than a falsy check: a headroom of 0 is the case
    // this budget exists for, and `!max` would treat it as no budget at all
    // and emit the whole blueprint into a prompt with no room for it.
    const max = opts.maxChars;
    if (max === undefined || full.length <= max) return full;

    const ranked = allDecisions(b)
      .filter((x) => x.decision)
      .sort((a, x) => CONFIDENCE_ORDER[a.decision!.confidence] - CONFIDENCE_ORDER[x.decision!.confidence]);
    const dropped = new Set<string>();
    let candidate = full;
    for (const row of ranked) {
      if (candidate.length <= max) break;
      dropped.add(`${row.section}.${row.field}`);
      candidate = ProfessionalCreativeBrain.compose(b, dropped);
    }
    // If even the heading does not fit, the caller has no headroom at all and
    // gets nothing rather than a fragment ending mid-sentence.
    return candidate.length <= max ? candidate : undefined;
  }

  /** The rendered text with a set of fields withheld. Used by the budget pass. */
  private static compose(b: CreativeBlueprint, dropped: Set<string>): string {
    const LABELS: Record<string, string> = {
      concept: "CREATIVE CONCEPT",
      visual_world: "ART DIRECTION",
      photography: "PHOTOGRAPHY DIRECTION",
      design: "TYPOGRAPHY DIRECTION",
      layout: "LAYOUT DIRECTION",
      brand_expression: "BRAND EXPRESSION",
    };
    const lines: string[] = [];
    if (b.story && !dropped.has("story.story")) lines.push("", "THE STORY:", `- ${b.story.value}`);
    for (const section of Object.keys(LABELS)) {
      const bag = (b as any)[section] || {};
      const rows = SECTION_FIELDS[section as keyof typeof SECTION_FIELDS]
        .filter((f) => !dropped.has(`${section}.${f}`))
        .map((f) => [f, bag[f] as Decision | null] as const)
        .filter(([, dec]) => dec);
      if (!rows.length) continue;
      lines.push("", `${LABELS[section]}:`, ...rows.map(([f, dec]) => `- ${f.replace(/_/g, " ")}: ${dec!.value}`));
    }
    return [
      "CREATIVE BLUEPRINT — decided for this brief, from the product and the brand rather than a house style.",
      "Execute these as written. Where two lines could conflict, the creative concept decides.",
      ...lines,
    ].join("\n");
  }
}
