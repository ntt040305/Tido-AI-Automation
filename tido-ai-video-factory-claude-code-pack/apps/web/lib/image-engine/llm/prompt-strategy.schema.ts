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
