/**
 * CIOS Phase 4.1 — Creative Director Engine foundation.
 *
 * What was actually missing
 * ------------------------
 * Not knowledge. The engine already retrieves professional knowledge, resolves
 * art direction across five authority tiers, plans real layout geometry with
 * zone rectangles, and locks product identity. Final output still reads about
 * 3/10.
 *
 * The gap is visible in one file: `ArtDirectionResolverService` is an
 * *arbitrator*, not a *decider*. It ranks candidates supplied by USER,
 * REFERENCE, STRATEGY, KNOWLEDGE and ASSET_DEFAULT tiers and picks a winner per
 * dimension. When a brief carries no reference image and no explicit camera
 * instruction — which is the ordinary case — there is no candidate above
 * ASSET_DEFAULT, so every such brief resolves to the same asset-type fallback.
 * The system was never choosing a lens; it was choosing between choices nobody
 * had made.
 *
 * So this layer decides. It reads the brief, works out what the image has to do
 * to a person, proposes several creative territories, and then derives a
 * complete visual specification — lens, angle, light source and direction,
 * contrast, hero placement, palette, type hierarchy — from that territory and
 * the format it has to live in.
 *
 * How it integrates
 * ----------------
 * Above the existing pipeline, never instead of it. Nothing here deletes or
 * edits the resolver, the layout service, the knowledge retriever or the V2
 * compiler. The director's decisions are emitted as STRATEGY-tier candidates the
 * existing resolver can arbitrate, which means an explicit client instruction
 * still outranks the director exactly as it outranks everything else. That is
 * the property worth protecting: a system that decides for you is only an
 * improvement while it still yields to you.
 */

// ── Task 1: Creative Understanding ────────────────────────────────────────

export interface CreativeUnderstanding {
  /** The one thing the image has to get across. */
  core_message: string;
  /** What the viewer should feel, named as an emotion rather than a mood word. */
  human_emotion: string;
  /** What they should do or think differently, having seen it. */
  desired_reaction: string;
  /** What the brand is *doing* here — not what it claims. */
  brand_role: string;
  /** The thing in this brief a picture can do that words cannot. */
  visual_opportunity: string;
  /** The reason this is hard. If it is not hard, the brief is not understood. */
  creative_challenge: string;
  /** Fields the brief did not support, named rather than invented. */
  assumptions: string[];
  /** 0-1. How much of the above came from the brief rather than from defaults. */
  grounding: number;
}

// ── Task 2: Creative Territories ──────────────────────────────────────────

export interface CreativeTerritoryV2 {
  /** Two or three words a team would say out loud. */
  name: string;
  big_idea: string;
  emotional_direction: string;
  /** The image-level metaphor. Must be something that can be photographed. */
  visual_metaphor: string;
  /** The world the campaign lives in over time, not one execution. */
  story_world: string;
  /** Why this brand, and not a competitor, gets to say it. */
  brand_connection: string;
  /** Which part of the understanding this territory is built on. */
  derived_from: string;
}

// ── Task 3: Visual Direction ──────────────────────────────────────────────

export interface CameraDirection {
  lens: string;
  angle: string;
  framing: string;
  distance: string;
}

export interface LightingDirection {
  source: string;
  direction: string;
  quality: string;
  contrast: string;
}

export interface CompositionDirection {
  hero_object: string;
  supporting_elements: string;
  negative_space: string;
  text_area: string;
}

export interface ColorDirection {
  palette: string;
  mood: string;
}

export interface TypographyDirection {
  hierarchy: string;
  placement: string;
  style: string;
}

export interface VisualDirection {
  camera: CameraDirection;
  lighting: LightingDirection;
  composition: CompositionDirection;
  color: ColorDirection;
  typography: TypographyDirection;
  /** Why these decisions and not others, one line per dimension. */
  rationale: Record<string, string>;
  /** The territory these decisions serve. */
  territory: string;
}

// ── Task 4: Format planning ───────────────────────────────────────────────

export type CreativeFormat =
  | "poster"
  | "banner"
  | "thumbnail"
  | "social_ad"
  | "packaging"
  | "landing_hero";

export const CREATIVE_FORMATS: CreativeFormat[] = [
  "poster",
  "banner",
  "thumbnail",
  "social_ad",
  "packaging",
  "landing_hero",
];

export interface FormatPlan {
  format: CreativeFormat;
  aspect_ratio: string;
  /** How the format is consumed, which is what drives everything below. */
  viewing_model: string;
  composition: string;
  camera: string;
  hierarchy: string[];
  typography: string;
  /** Where copy may sit, as prose the renderer can act on. */
  text_zones: string;
  safe_margin_percent: number;
}

// ── Task 5: Product Identity Lock V2 ──────────────────────────────────────

export interface ProductIdentityLockV2 {
  product_id: string;
  name: string;
  shape: string;
  color: string;
  logo_position: string;
  material: string;
  texture: string;
  unique_features: string[];
  /** Everything above, as one instruction block. */
  lock_statement: string;
  /** Attributes with no evidence behind them, named as unknown. */
  unknown: string[];
  /** 0-1. Share of the seven attributes actually evidenced. */
  evidence: number;
}

// ── Task 6: Priority assembly ─────────────────────────────────────────────

export type AssemblyPriority = "P0" | "P1" | "P2";

export interface AssemblySection {
  id: string;
  priority: AssemblyPriority;
  heading: string;
  body: string;
}

export interface AssembledPrompt {
  prompt: string;
  chars: number;
  included: string[];
  /** Sections a budget could not fit, with the tier they belonged to. */
  omitted: { id: string; priority: AssemblyPriority; chars: number }[];
  budget_status: "IN_TARGET" | "UNDER_TARGET" | "OVER_TARGET" | "SOFT_WARNING" | "OVER_HARD_LIMIT";
}

/**
 * MASTER PROMPT COMPILER V3.1 budget.
 *
 * Corrected in Phase 4.1.1: the hard limit is 20,000, not 16,000. The lower
 * figure was squeezing the knowledge tier for headroom the provider did not
 * actually need, and a commercial poster carries more mandatory content than a
 * product shot — an offer, a discount, a headline, a CTA and their placement are
 * all P0 on a sale poster and none of them exist on a hero shot.
 */
export const V3_BUDGET = {
  hard_limit: 20000,
  soft_warning: 17000,
  target_min: 14000,
  target_max: 18000,
};

// ── The whole director pass ───────────────────────────────────────────────

export interface DirectorBrief {
  brand: string;
  product: string;
  audience: string;
  category: string;
  objective?: string;
  /** What the client actually wrote. */
  brief_text: string;
  format: CreativeFormat;
  aspect_ratio?: string;
  /** Copy that must appear, verbatim. */
  copy?: string[];
  /** Anything the client explicitly demanded. Outranks the director. */
  hard_constraints?: string[];
  /**
   * Phase 4.1.1. The user's own concept text, unparsed.
   *
   * Separate from `brief_text` because in production these are different inputs:
   * `brief_text` is the campaign brief, `concept` is what the user typed into the
   * box. The failing case was a concept with no brief at all.
   */
  concept?: string;
  /** Phase 4.1.5. What the user chose in the UI. Absent or `auto` means unset. */
  controls?: import("./visual-controls.types").VisualDirectionControls;
  /** Attributes read from reference images, where any exist. */
  reference_attributes?: Partial<Record<
    "shape" | "color" | "logo_position" | "material" | "texture",
    string
  >> & { unique_features?: string[] };
}

export interface DirectorDecisionPackage {
  understanding: CreativeUnderstanding;
  /** Phase 4.1.1. What the concept demanded, and what was composed to satisfy it. */
  intent: import("./ConceptStructuringLayer").CommercialIntent;
  copy: import("./CommercialCopySynthesizer").SynthesizedCopy;
  execution: import("./CommercialExecutionProfile").ExecutionProfile;
  /** Phase 4.1.5. One answer per control, with the source that won. */
  visual_controls: import("./visual-controls.types").ResolvedVisualControls;
  territories: CreativeTerritoryV2[];
  chosen_territory: CreativeTerritoryV2;
  visual: VisualDirection;
  format_plan: FormatPlan;
  identity: ProductIdentityLockV2;
  assembled: AssembledPrompt;
}
