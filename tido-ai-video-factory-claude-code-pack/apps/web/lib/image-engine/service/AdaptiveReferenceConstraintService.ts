import {
  AdaptiveConstraintSet,
  ReferenceQualityProfile,
} from "../types";

/**
 * Phase 3.4 & Phase 3.5 — Adaptive Reference Constraint Service
 *
 * Generates deterministic rendering compensation directives when weak references require compensation.
 *
 * STRICT SAFETY RULES:
 * 1. Must NEVER contain product replacement, redesign, shape modification, or logo alteration.
 * 2. When bypass_action is DIRECT_BYPASS or QUALITY_WARNING_ADVISED, requires_adaptation is FALSE.
 * 3. Compact adaptation directive must prefer 200-300 characters (hard maximum <= 500 characters).
 */
export class AdaptiveReferenceConstraintService {
  /**
   * Builds rendering compensation directives based on ReferenceQualityProfile.
   */
  public generateConstraints(qualityProfile: ReferenceQualityProfile): AdaptiveConstraintSet {
    // DIRECT_BYPASS and QUALITY_WARNING_ADVISED bypass prompt adaptation completely
    const shouldBypass =
      qualityProfile.bypass_action === "DIRECT_BYPASS" ||
      qualityProfile.bypass_action === "QUALITY_WARNING_ADVISED" ||
      !qualityProfile.is_weak_reference;

    if (shouldBypass) {
      return {
        requires_adaptation: false,
        depth_enhancement: "",
        lighting_enhancement: "",
        material_realism: "",
        environment_integration: "",
        contact_shadow_generation: "",
        compact_adaptation_directive: "",
      };
    }

    // Deterministic, non-destructive rendering compensation rules
    const depthEnhancement = "Synthesize natural volumetric depth layers separating product hero from backdrop.";
    const lightingEnhancement = "Apply 3D studio lighting with soft directional key light and crisp specular rim highlights.";
    const materialRealism = "Render authentic physical subsurface scattering, glass transparency, and surface micro-reflections.";
    const environmentIntegration = "Harmonize product packaging smoothly into ambient environment without visual cutout lines.";
    const contactShadowGeneration = "Generate soft ambient occlusion and realistic ground contact shadows under product base.";

    // Minimal compact directive for MasterPromptCompiler (200-300 chars target, hard max 500 chars limit)
    const compactDirective =
      `[REFERENCE ADAPTATION RULES]\n` +
      `Reference image provides exact product identity ONLY. Do NOT copy flat background or flat lighting.\n` +
      `- Synthesize realistic 3D depth, soft ground contact shadows, studio key lighting, and authentic surface reflections.`;

    // Guarantee <= 500 characters budget limit
    const finalCompactDirective =
      compactDirective.length > 500 ? compactDirective.substring(0, 497) + "..." : compactDirective;

    return {
      requires_adaptation: true,
      depth_enhancement: depthEnhancement,
      lighting_enhancement: lightingEnhancement,
      material_realism: materialRealism,
      environment_integration: environmentIntegration,
      contact_shadow_generation: contactShadowGeneration,
      compact_adaptation_directive: finalCompactDirective,
    };
  }
}
