import type { ProductTruth } from "./ProductTruth";

/**
 * The Creative Blueprint — one object, produced once, emitted once.
 *
 * Phase 2.0 established the shape and the rule; Phase 4 widened it to carry the
 * whole professional stack: story, concept, art direction, photography,
 * typography, layout and brand expression.
 *
 * One object, not seven
 * ---------------------
 * The obvious build is seven prompt blocks. That is the mistake this file
 * exists to avoid. Seven independent blocks each describe the frame, and seven
 * descriptions of one frame read as seven frames to a renderer with no way to
 * know they are the same one. This project has paid for that twice — two scenes
 * in Phase 0.3, two layout authorities in Phase 0.4 — and both cost a phase to
 * unwind.
 *
 * Why every decision names its basis
 * ----------------------------------
 * `because` and `derived_from` are required, not decorative. Two measurements
 * stand behind that. Phase 1.1A: a reframing written as prose lost to eighteen
 * structured fields pulling the other way. Phase 0.5: given no forcing input,
 * the director chose a route that explicitly disclaims having an idea in six of
 * twelve renders. Unforced creative output regresses to the category default,
 * and a field that cannot say what forced it is an invention.
 *
 * Unknown stays unknown
 * ---------------------
 * Every slot is `Decision | null`. A field nothing authored is null and appears
 * in `missing`. Filling it with plausible craft language would produce exactly
 * the unforced output Phase 0.5 measured, wearing a provenance record that says
 * otherwise — and a laundered invention is worse than an empty field, because
 * the empty one is visible.
 *
 * Product-independence
 * --------------------
 * Every field asks for a PROPERTY, never a style. There is no category table,
 * no industry switch, no house look. "What is the lens doing and why" has an
 * answer for a serum, a bowl of pho, a laptop and a coat; "use soft beauty
 * lighting" only has one for the first, and would be this file choosing the
 * picture.
 */

/** Where a decision came from. The anti-invention gate. */
export type DecisionBasis =
  /** The client said so explicitly — a lock, not an inference. */
  | "user"
  /** ProductTruth: declared benefit, or observed material reality. */
  | "product_truth"
  /** VisualDNA: read from the attached image, not described by anyone. */
  | "visual_dna"
  /** Marketing strategy or the insight layer built from it. */
  | "strategy"
  /** The Creative Director's own reasoning, from its single existing call. */
  | "director";

export const DECISION_BASES: readonly DecisionBasis[] = [
  "user",
  "product_truth",
  "visual_dna",
  "strategy",
  "director",
];

/**
 * One creative decision, and what entitles it.
 *
 * `confidence` reuses `VisualDNAInference`'s scale rather than introducing a
 * new vocabulary — this engine already carries three evidence vocabularies and
 * a fourth would be the parallel system this roadmap keeps being told not to
 * build. Every other schema in this phase reuses THIS type for the same reason.
 */
export interface Decision {
  /** The decision itself, concretely. Empty is not a valid decision. */
  value: string;
  /**
   * What forced this, quoted so a reader can check it.
   *
   * "Because it looks premium" is not a basis. "ProductTruth declares an
   * 18-hour cold process and the brand positions as a neighbourhood shop" is.
   */
  because: string;
  derived_from: DecisionBasis;
  confidence: "low" | "medium" | "high";
}

// ── the six directions ──────────────────────────────────────────────────────

/** Phase 2 — the concept. What the campaign is actually saying. */
export interface CampaignDirection {
  big_idea: Decision | null;
  campaign_concept: Decision | null;
  visual_story: Decision | null;
  /** The tension the idea resolves. An idea with no tension is a description. */
  creative_tension: Decision | null;
  emotional_hook: Decision | null;
  message_strategy: Decision | null;
}

/** Phase 3 — the art director. The world the picture happens in. */
export interface ArtDirection {
  visual_world: Decision | null;
  environment_logic: Decision | null;
  color_story: Decision | null;
  visual_metaphor: Decision | null;
  styling: Decision | null;
  props: Decision | null;
  atmosphere: Decision | null;
  composition_logic: Decision | null;
}

/**
 * Phase 3 — the photographer.
 *
 * Behaviour, never specification. "The background falls away so the label is
 * the only thing sharp" is a decision; "85mm at f/1.8" is a camera database
 * entry that says nothing about why. No brands, no numbers.
 */
export interface PhotographyDirection {
  camera_language: Decision | null;
  lens_character: Decision | null;
  focus_behavior: Decision | null;
  lighting_behavior: Decision | null;
  depth_feeling: Decision | null;
  material_rendering: Decision | null;
}

/**
 * Phase 3 — the typography designer.
 *
 * Required to rest on product, brand, audience or concept. Enforced by
 * `derived_from` rather than asked for in prose, because prose has now lost
 * twice to structured fields in this codebase.
 */
export interface TypographyDirection {
  /** What the letterforms are like, as behaviour rather than a typeface name. */
  font_character: Decision | null;
  /** How the words should sound — spoken, set, stamped, handwritten. */
  typographic_voice: Decision | null;
  /** Why the reading order is this order. */
  hierarchy_logic: Decision | null;
  /** What the space between things is doing. */
  spacing_behavior: Decision | null;
  /** Why the words sit where they sit. */
  placement_reason: Decision | null;
  /** How legibility is won against this particular frame. */
  contrast_strategy: Decision | null;
}

/** Phase 3 — the layout designer. Where things sit and where the eye goes. */
export interface LayoutDirection {
  visual_balance: Decision | null;
  product_position: Decision | null;
  text_area: Decision | null;
  negative_space: Decision | null;
  attention_flow: Decision | null;
  composition_balance: Decision | null;
}

/** What the picture says about the brand. */
export interface BrandExpressionDirection {
  visual_language: Decision | null;
  color_system: Decision | null;
  /** Where an image was analysed this must cite it: material is observed. */
  material_language: Decision | null;
  emotional_direction: Decision | null;
}

export type BlueprintSection =
  | "concept"
  | "visual_world"
  | "photography"
  | "design"
  | "layout"
  | "brand_expression";

export const BLUEPRINT_SECTIONS: readonly BlueprintSection[] = [
  "concept",
  "visual_world",
  "photography",
  "design",
  "layout",
  "brand_expression",
];

/** Field order per section, fixed, so two blueprints are always comparable. */
export const SECTION_FIELDS: Record<BlueprintSection, readonly string[]> = {
  concept: ["big_idea", "campaign_concept", "visual_story", "creative_tension", "emotional_hook", "message_strategy"],
  visual_world: [
    "visual_world", "environment_logic", "color_story", "visual_metaphor",
    "styling", "props", "atmosphere", "composition_logic",
  ],
  photography: [
    "camera_language", "lens_character", "focus_behavior",
    "lighting_behavior", "depth_feeling", "material_rendering",
  ],
  design: [
    "font_character", "typographic_voice", "hierarchy_logic",
    "spacing_behavior", "placement_reason", "contrast_strategy",
  ],
  layout: [
    "visual_balance", "product_position", "text_area",
    "negative_space", "attention_flow", "composition_balance",
  ],
  brand_expression: ["visual_language", "color_system", "material_language", "emotional_direction"],
};

/** 36 fields across six sections, plus `story` which sits outside them. */
export const TOTAL_BLUEPRINT_FIELDS = Object.values(SECTION_FIELDS).reduce((n, f) => n + f.length, 0);

export interface CreativeBlueprint {
  /** What this product is, as something worth saying. From ProductTruth. */
  story: Decision | null;
  concept: CampaignDirection;
  visual_world: ArtDirection;
  photography: PhotographyDirection;
  design: TypographyDirection;
  layout: LayoutDirection;
  brand_expression: BrandExpressionDirection;
  /** What the blueprint was built from, recorded rather than assumed. */
  provenance: {
    product_truth: boolean;
    product_truth_completeness: number;
    marketing_insight: boolean;
    marketing_insight_completeness: number;
    visual_dna: boolean;
    strategy: boolean;
    director: boolean;
  };
  /** Share of the 36 fields that are grounded, 0–1. Never a quality score. */
  confidence: number;
  /**
   * Phase 5 grounding metrics. Shares of the GROUNDED decisions, not of 36 —
   * a blueprint with four fields, all resting on the product, is fully grounded
   * in the product and saying otherwise would punish honesty about gaps.
   */
  metrics: {
    /** Rests on ProductTruth, ProductMeaning or the observed image. */
    grounded_in_product_score: number;
    /** Rests on marketing strategy or the insight built from it. */
    grounded_in_strategy_score: number;
    /**
     * Share of sections that decided anything at all.
     *
     * Coherence in the only sense this layer can check: a blueprint that
     * decided the concept and nothing else is not a coherent brief, whatever
     * the concept says. It is not a judgement about whether the decisions agree
     * — nothing here can read meaning — and the name should not be read as one.
     */
    creative_coherence_score: number;
  };
  /** Every field nothing authored, as `section.field`. */
  missing: string[];
}

/** Every decision in a blueprint, flattened, with its section and field name. */
export function allDecisions(
  b: CreativeBlueprint
): { section: BlueprintSection; field: string; decision: Decision | null }[] {
  const out: { section: BlueprintSection; field: string; decision: Decision | null }[] = [];
  for (const section of BLUEPRINT_SECTIONS) {
    const bag = (b as any)[section] || {};
    for (const field of SECTION_FIELDS[section]) {
      out.push({ section, field, decision: bag[field] ?? null });
    }
  }
  return out;
}

export interface BlueprintViolation {
  section: BlueprintSection | "story";
  field: string;
  rule: string;
}

/**
 * Checks what the types cannot express.
 *
 * Pure. Reports every violation rather than throwing on the first: a blueprint
 * with four unsourced fields is a different problem from one with a typo, and a
 * validator that stops at the first cannot tell them apart.
 *
 * This does NOT judge whether a decision is good. It judges whether the system
 * was entitled to make it. Those are different questions and only the second is
 * mechanically checkable.
 *
 * A null field is never a violation — unknown is a legitimate state and
 * `missing` records it. What is forbidden is a field that asserts something
 * while declining to say where it came from.
 */
export function validateBlueprint(
  b: CreativeBlueprint,
  opts: { visualDNAAvailable?: boolean } = {}
): BlueprintViolation[] {
  const v: BlueprintViolation[] = [];
  const fail = (section: BlueprintViolation["section"], field: string, rule: string) =>
    v.push({ section, field, rule });

  const checkDecision = (section: BlueprintViolation["section"], field: string, d: Decision | null) => {
    if (!d) return;
    if (!d.value?.trim()) fail(section, field, "value is empty");
    if (!d.because?.trim()) fail(section, field, "no basis given");
    if (!DECISION_BASES.includes(d.derived_from)) {
      fail(section, field, `derived_from is not one of the known inputs: ${d.derived_from}`);
    }
    if (!["low", "medium", "high"].includes(d.confidence)) {
      fail(section, field, `confidence is not low|medium|high: ${d.confidence}`);
    }
    // A basis that merely restates the decision is not a basis. Cheap, and it
    // catches the commonest way a required field is satisfied without being
    // answered.
    if (
      d.value?.trim() &&
      d.because?.trim() &&
      d.because.trim().toLowerCase() === d.value.trim().toLowerCase()
    ) {
      fail(section, field, "the basis restates the decision instead of grounding it");
    }
  };

  checkDecision("story", "story", b.story);
  for (const { section, field, decision } of allDecisions(b)) checkDecision(section, field, decision);

  // Material language is observable whenever an image was analysed. Claiming it
  // came from anywhere else, with the observation sitting right there, is the
  // defect ProductTruth's OBSERVED tier exists to prevent.
  const material = b.brand_expression?.material_language;
  if (opts.visualDNAAvailable && material && material.derived_from !== "visual_dna") {
    fail("brand_expression", "material_language", "an image was analysed, so material language must cite visual_dna");
  }

  // `confidence` and `missing` must describe the object they are attached to,
  // or they are worse than absent: a caller that trusts them decides on a
  // number nothing checked.
  const grounded = allDecisions(b).filter((d) => d.decision).length;
  const expected = Math.round((grounded / TOTAL_BLUEPRINT_FIELDS) * 100) / 100;
  if (b.confidence !== expected) {
    fail("story", "confidence", `confidence says ${b.confidence} but ${grounded}/${TOTAL_BLUEPRINT_FIELDS} are grounded`);
  }
  const rows = allDecisions(b).filter((d) => d.decision);
  const share = (pred: (x: string) => boolean) =>
    rows.length ? Math.round((rows.filter((r) => pred(r.decision!.derived_from)).length / rows.length) * 100) / 100 : 0;
  const expectedProduct = share((x) => x === "product_truth" || x === "visual_dna");
  const expectedStrategy = share((x) => x === "strategy");
  if (b.metrics && b.metrics.grounded_in_product_score !== expectedProduct) {
    fail("story", "metrics", `grounded_in_product_score says ${b.metrics.grounded_in_product_score} but ${expectedProduct} of grounded decisions rest on the product`);
  }
  if (b.metrics && b.metrics.grounded_in_strategy_score !== expectedStrategy) {
    fail("story", "metrics", `grounded_in_strategy_score says ${b.metrics.grounded_in_strategy_score} but ${expectedStrategy} rest on strategy`);
  }

  const missing = allDecisions(b).filter((d) => !d.decision).map((d) => `${d.section}.${d.field}`);
  if (missing.length !== (b.missing?.length ?? -1)) {
    fail("story", "missing", `missing lists ${b.missing?.length} fields but ${missing.length} are ungrounded`);
  }

  return v;
}

/** Counts and labels only — never the decision text. */
export function blueprintTelemetry(b: CreativeBlueprint | null | undefined) {
  if (!b) return { blueprint: false };
  const decisions = allDecisions(b);
  const byBasis: Record<string, number> = {};
  const bySection: Record<string, number> = {};
  for (const d of decisions) {
    if (!d.decision) continue;
    byBasis[d.decision.derived_from] = (byBasis[d.decision.derived_from] || 0) + 1;
    bySection[d.section] = (bySection[d.section] || 0) + 1;
  }
  return {
    blueprint: true,
    fields: TOTAL_BLUEPRINT_FIELDS,
    grounded: decisions.filter((d) => d.decision).length,
    confidence: b.confidence,
    by_basis: byBasis,
    by_section: bySection,
    // The number this layer exists to watch. A blueprint where everything says
    // "director" is a director talking to itself, which Phase 0.5 measured as
    // producing category defaults.
    grounded_in_product: (byBasis.product_truth || 0) + (byBasis.visual_dna || 0),
    metrics: b.metrics,
    missing: b.missing.length,
    provenance: b.provenance,
  };
}

export function blueprintProvenance(args: {
  productTruth?: ProductTruth | null;
  marketingInsight?: { completeness: number } | null;
  visualDNA?: unknown;
  strategy?: unknown;
  director?: unknown;
}): CreativeBlueprint["provenance"] {
  return {
    product_truth: Boolean(args.productTruth),
    product_truth_completeness: args.productTruth?.completeness ?? 0,
    marketing_insight: Boolean(args.marketingInsight),
    marketing_insight_completeness: args.marketingInsight?.completeness ?? 0,
    visual_dna: Boolean(args.visualDNA),
    strategy: Boolean(args.strategy),
    director: Boolean(args.director),
  };
}
