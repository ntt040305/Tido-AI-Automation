import { RoutingResultSchema } from "../types";

/**
 * Creative Leak Detector
 * Application-side safety net that inspects Knowledge Router JSON outputs
 * to guarantee that the Router has NOT made creative, photographic, or art direction decisions.
 */
export class CreativeLeakDetector {
  // Key patterns that indicate illegal creative prescription fields
  private static FORBIDDEN_FIELDS = [
    "recommended_camera",
    "recommended_lighting",
    "recommended_composition",
    "recommended_background",
    "recommended_props",
    "recommended_font",
    "creative_direction",
    "color_palette_recommendation",
    "pedestal_recommendation",
    "viewpoint_recommendation",
  ];

  // Specific creative prescription phrases that must not appear in descriptors
  private static FORBIDDEN_CREATIVE_PHRASES = [
    "use camera angle",
    "recommended lens",
    "use lighting setup",
    "dramatic lighting recommendation",
    "place on pedestal",
    "cyberpunk background recommendation",
    "neon lighting setup",
    "suggested font",
    "recommended composition",
    "creative concept suggestion",
  ];

  public static validateNonCreativeRouting(routing: RoutingResultSchema): {
    hasLeak: boolean;
    leakDetails?: string;
  } {
    // 1. Check top-level JSON keys for forbidden creative fields
    const rawJson = JSON.stringify(routing);

    for (const forbiddenField of this.FORBIDDEN_FIELDS) {
      if (rawJson.includes(`"${forbiddenField}"`)) {
        return {
          hasLeak: true,
          leakDetails: `Architectural Violation: Forbidden creative field '${forbiddenField}' detected in Router output.`,
        };
      }
    }

    // 2. Check text values for explicit creative prescription phrases
    const lowerText = rawJson.toLowerCase();
    for (const phrase of this.FORBIDDEN_CREATIVE_PHRASES) {
      if (lowerText.includes(phrase)) {
        return {
          hasLeak: true,
          leakDetails: `Architectural Violation: Forbidden creative phrase '${phrase}' detected in Router output.`,
        };
      }
    }

    return { hasLeak: false };
  }
}
