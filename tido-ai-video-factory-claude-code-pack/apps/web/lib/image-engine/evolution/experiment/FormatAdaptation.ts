import type { CreativeBlueprint, Decision } from "./CreativeBlueprint";

/**
 * Multi-format adaptation — one concept, four shapes.
 *
 * The concept, the hierarchy, the product focus and the message are format
 * invariants: they are what the campaign IS, and a 9:16 story that changes them
 * is a different advertisement, not an adaptation. What legitimately changes is
 * where things sit and how much room they have.
 *
 * So this returns, per format, exactly two things: the invariants (carried
 * verbatim, so a reader can verify nothing drifted) and the adaptations (the
 * layout consequences of the shape). It does not re-decide the concept, and it
 * cannot — `ProfessionalCreativeBrain` owns that and there is one of it.
 *
 * Deterministic, pure, no model call. Only the aspect ratios the provider
 * actually supports are offered, because an adaptation to a ratio that fails at
 * the provider is a plan for a render nobody can make.
 */

/** What `IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS` allows. */
export const SUPPORTED_RATIOS = ["1:1", "9:16", "16:9"] as const;
export type SupportedRatio = (typeof SUPPORTED_RATIOS)[number];

export interface FormatPlan {
  ratio: SupportedRatio;
  /** Carried verbatim from the blueprint. Changing one is a different ad. */
  invariants: {
    concept: string | null;
    hierarchy: string | null;
    product_focus: string | null;
    message: string | null;
  };
  /** What the shape changes, and why. */
  adaptations: { property: string; change: string; because: string }[];
}

export interface AdaptationSet {
  plans: FormatPlan[];
  /** Invariants the blueprint could not supply, named rather than invented. */
  missing_invariants: string[];
}

const val = (d: Decision | null | undefined): string | null => (d?.value?.trim() ? d.value.trim() : null);

/**
 * How each supported shape changes a layout, stated as consequences of the
 * shape itself rather than as a per-format template.
 */
function adaptationsFor(ratio: SupportedRatio): FormatPlan["adaptations"] {
  switch (ratio) {
    case "1:1":
      return [
        {
          property: "copy band",
          change: "One band only, above or below the product.",
          because: "A square gives no long edge to run copy along, so a second band would crowd the subject.",
        },
        {
          property: "product scale",
          change: "The product fills the centre with even margin on all four sides.",
          because: "Equal edges mean no direction leads, so the subject has to hold the middle.",
        },
      ];
    case "9:16":
      return [
        {
          property: "reading path",
          change: "Vertical: the eye enters at the top and exits at the bottom.",
          because: "A tall frame is read top to bottom, so the closing line belongs at the foot.",
        },
        {
          property: "product scale",
          change: "The product occupies the middle third, with copy above and below it.",
          because: "The height gives two copy zones that a square does not have.",
        },
      ];
    case "16:9":
      return [
        {
          property: "reading path",
          change: "Horizontal: copy on one side, product on the other.",
          because: "A wide frame is read across, so stacking copy over the product wastes the width.",
        },
        {
          property: "negative space",
          change: "The empty side carries the copy rather than being filled.",
          because: "Width is the one thing this shape has that the others do not.",
        },
      ];
  }
}

/**
 * Plans every supported format from one blueprint. Pure and total.
 *
 * Invariants are carried, never regenerated. An invariant the blueprint did not
 * decide is reported in `missing_invariants` rather than filled, because an
 * adaptation that invents the message it is supposed to preserve has preserved
 * nothing.
 */
export function adaptFormats(b: CreativeBlueprint | null | undefined): AdaptationSet {
  const invariants = {
    concept: val(b?.concept?.big_idea),
    hierarchy: val(b?.design?.hierarchy_logic),
    product_focus: val(b?.layout?.product_position),
    message: val(b?.concept?.message_strategy),
  };
  const missing = Object.entries(invariants)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  return {
    plans: SUPPORTED_RATIOS.map((ratio) => ({
      ratio,
      invariants,
      adaptations: adaptationsFor(ratio),
    })),
    missing_invariants: missing,
  };
}

/** Counts and ratios only — never the concept text. */
export function adaptationTelemetry(a: AdaptationSet | null | undefined) {
  if (!a) return { adaptation: false };
  return {
    adaptation: true,
    formats: a.plans.map((p) => p.ratio),
    invariants_carried: 4 - a.missing_invariants.length,
    missing_invariants: a.missing_invariants,
  };
}
