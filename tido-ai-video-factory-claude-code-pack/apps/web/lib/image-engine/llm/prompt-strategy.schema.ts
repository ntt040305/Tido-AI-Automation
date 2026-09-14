import { IdentityControlMetadata, ProductManifest } from "../types";

/**
 * How a business goal becomes a picture.
 *
 * The strategy layer used to jump straight from a brief to camera and lighting
 * words, which is how "luxury anti-aging skincare" became "luxury woman holding
 * serum bottle" — a literal restatement rather than a creative translation. These
 * fields are the missing bridge: what the buyer actually wants, what they should
 * feel, what the image says, and only then how that looks.
 */
export interface VisualTranslation {
  /**
   * What is happening in the frame — the moment, as an event.
   *
   * The six fields below it are all *qualities*: atmosphere, light character,
   * material, colour. An image model given only qualities renders a well-lit
   * object, which is why "an invitation to experience the cafe" came back as a
   * warm photograph of a cup. Qualities describe how a picture feels; only a
   * scene says what is in it.
   *
   * Written as a situation with a verb: "two friends stepping in from the
   * street, first coffees just set down, door still open behind them" — never
   * "a welcoming atmosphere".
   */
  scene_moment?: string;
  /**
   * Who is present and what they are doing, or an explicit reason nobody is.
   *
   * Optional in the sense that a pack shot legitimately has no one in it. It is
   * not optional to *decide*: an advertising image with no human presence and no
   * reason for that absence is a catalogue photograph.
   */
  human_presence?: string;
  /**
   * Why the camera is where it is, in intent rather than millimetres.
   *
   * The strategy layer used to be forbidden from mentioning camera at all, so
   * that art direction would own the numbers. The prohibition went too far: it
   * left camera with no strategic input whatsoever, and every brief without a
   * reference image fell through to the asset-type default. Intent and
   * specification are different things — "placed low so the product reads as
   * something to look up to" is a decision art direction can then express as an
   * angle and a focal length.
   */
  camera_intent?: string;
  /**
   * What the words should behave like, not what size they should be.
   *
   * Typography was the last dimension still arriving as a bare parameter:
   * measured on a real poster, six of seven art-direction lines carried a reason
   * and the seventh read "reserve clean typography area only for post-production
   * text placement" — a default from the knowledge tier, exactly the defect
   * camera had before it was wired to `camera_intent`.
   *
   * Behaviour, not specification: "the words should feel spoken rather than
   * set", not "48pt bold". Weights and positions belong to art direction and
   * layout, which own them downstream.
   */
  typography_intent?: string;
  /** Who or what is actually depicted, and why that choice serves the insight. */
  subject_representation: string;
  /** The emotional temperature of the frame. */
  atmosphere: string;
  /** Quality and behaviour of light, in plain photographic terms. */
  lighting_character: string;
  /** How surfaces and materials should read. */
  material_treatment: string;
  /** The organising idea of the layout, not coordinates. */
  composition_principle: string;
  /** Palette direction and what it signals. */
  colour_direction: string;
}

export interface MarketingBrainStrategy {
  creative_angle: string;
  commercial_goal: string;
  target_customer_psychology: string;
  prompt_guidance: string;
  compression_notes?: string;
  /**
   * Legacy summary fields. Optional because a response that returns the full
   * creative bridge below has already said everything these carried, and the
   * service derives them from `visual_translation` when they are absent.
   */
  visual_strategy?: string;
  composition_strategy?: string;

  // ── Creative bridge: business goal → insight → emotion → message → visuals ──
  /** The non-obvious truth about what the buyer is really after. */
  consumer_insight?: string;
  /** What the viewer should feel, in two or three words. */
  emotional_response?: string;
  /** The one thing the image says, in a sentence. */
  creative_message?: string;
  /** The message rendered as visual decisions. */
  visual_translation?: VisualTranslation;
  /**
   * Why this asset type serves this particular campaign, and what that means the
   * image has to do.
   *
   * The format used to reach the brain as one line of metadata — `FORMAT / USE
   * CASE: poster` — with nothing anywhere telling it what a poster is or why it
   * should care. Measured across five asset types on one brief, the strategy
   * section varied at 0.21 similarity against a 0.24 same-format noise floor:
   * the format changed nothing, and what looked like variation was the model
   * answering differently twice.
   *
   * This field is the answer to "what is this asset FOR, in this campaign",
   * which is a different question for a serum launch than for a coffee opening
   * even when both are posters. It is reasoning, not a layout: it says why the
   * format pushed the concept one way, and leaves the execution to the scene.
   */
  asset_reasoning?: string;
  /**
   * What this image is trying to achieve commercially, and what that rules out.
   *
   * The engine knew the campaign objective as a string from the brief
   * ("ra mắt sản phẩm") and never reasoned about what kind of job that is. An
   * image for awareness and an image for conversion are not the same picture:
   * one has to be remembered, the other has to be acted on, and the composition
   * that serves one usually undercuts the other.
   *
   * Not an enum on purpose. Real campaigns sit between the named objectives, and
   * forcing a choice among five labels would be a template with five branches.
   */
  communication_objective?: string;
  /**
   * Which creative route was taken, and what was rejected to take it.
   *
   * The engine committed to one direction the moment it had an insight. That is
   * not how the choice is normally made — a director holds several and picks —
   * and a system that never considers an alternative cannot tell a strong idea
   * from the first idea. The exploration happens inside the model's reasoning;
   * only the verdict travels, so this costs the prompt one line rather than
   * three competing descriptions of the same picture.
   */
  creative_route?: string;
  /**
   * How this brand behaves, as distinct from what it sells.
   *
   * Brand reached the engine as a name and an optional paragraph of user text,
   * and reached the renderer as "BRAND NAME: X" — so two competitors in one
   * category, with opposite positioning, produced the same picture. Positioning,
   * personality and how the brand is currently perceived are what separate them.
   */
  brand_personality?: string;
  /**
   * The intended reading order, as an experience rather than a weighting.
   *
   * What the viewer notices, then understands, then feels or does. The layout
   * layer already allocates attention numerically per format, but those numbers
   * were identical for a campaign built to be remembered and one built to be
   * acted on.
   */
  attention_sequence?: string;
  /**
   * Which element this campaign needs weighted above the format's default.
   *
   * A control value, not a creative choice: the reasoning lives in
   * `attention_sequence`, and this says only what follows from it mechanically.
   * The layout layer holds a per-format baseline and had no way to know that a
   * trial-driving image and a brand-building image want different allocations
   * inside one format.
   *
   * "none" is the common and correct answer. The format's own numbers are
   * usually right, and a system that shifts every time is not reasoning.
   */
  attention_shift?: "cta" | "headline" | "product" | "none";

  // Backward-compatible fields for prompt compiler consumers
  target_audience?: string;
  visual_direction?: string;
  camera_direction?: string;
  lighting?: string;
  composition?: string;
  negative_prompt?: string;
  master_prompt?: string;
}

export type GroqMarketingStrategy = MarketingBrainStrategy;

export interface MarketingBrainInput {
  concept: string;
  useCase?: string;
  aspectRatio?: string;
  brandName?: string;
  brandInfo?: string;
  targetAudience?: string;
  marketingGoal?: string;
  copyItems?: string[];
  productName?: string;
  productManifest?: ProductManifest;
  identityControlMetadata?: IdentityControlMetadata;
  productCompositionMode?: string;
  productIdentityStrength?: string;
}
