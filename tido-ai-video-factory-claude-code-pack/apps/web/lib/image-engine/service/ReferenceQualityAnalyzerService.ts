import {
  ReferenceBypassAction,
  ReferenceQualityCategory,
  ReferenceQualityClassification,
  ReferenceQualityProfile,
  ReferenceReadinessScore,
  RoutingResultSchema,
} from "../types";

/**
 * Phase 3.4 & Phase 3.5 — Reference Quality & Readiness Analyzer Service
 *
 * PURE ANALYSIS LAYER.
 * Evaluates uploaded reference metadata from RoutingResultSchema.
 * Classifies reference visual quality and rendering readiness without modifying product identity data or manifests.
 *
 * SAFELY FALLS BACK to Phase 3.4 default behavior if any error occurs during analysis.
 */
export class ReferenceQualityAnalyzerService {
  /**
   * Analyzes reference characteristics to determine rendering readiness and bypass decision.
   */
  public analyze(routingResult: RoutingResultSchema): ReferenceQualityProfile {
    try {
      const products = routingResult.products || [];

      // Collect metadata strings for evaluation
      const summaries = products.map((p) => (p.summary || "").toLowerCase()).join(" ");
      const visualChallenges = products
        .flatMap((p) => p.visual_challenges || [])
        .map((vc) => `${vc.id || ""} ${vc.description || ""}`.toLowerCase())
        .join(" ");

      const surfaceProps = products
        .flatMap((p) => p.surface_properties || [])
        .map((s) => (s.value || String(s)).toLowerCase())
        .join(" ");

      const packagingTypes = products
        .flatMap((p) => p.packaging_types || [])
        .map((pt) => (pt.value || String(pt)).toLowerCase())
        .join(" ");

      const combinedMeta = `${summaries} ${visualChallenges} ${surfaceProps} ${packagingTypes}`;

      // Keyword indicators
      const isLowQuality =
        combinedMeta.includes("low quality") ||
        combinedMeta.includes("low resolution") ||
        combinedMeta.includes("blurry") ||
        combinedMeta.includes("noisy") ||
        combinedMeta.includes("degraded");

      const hasProfessionalStudioKeywords =
        (combinedMeta.includes("white background") || combinedMeta.includes("studio white")) &&
        (combinedMeta.includes("professional lighting") ||
          combinedMeta.includes("studio lighting") ||
          combinedMeta.includes("soft shadow") ||
          combinedMeta.includes("contact shadow") ||
          combinedMeta.includes("high detail") ||
          combinedMeta.includes("reflections"));

      const hasStrongEnvKeywords =
        combinedMeta.includes("environmental shot") ||
        combinedMeta.includes("lifestyle environment") ||
        combinedMeta.includes("natural light scene") ||
        combinedMeta.includes("real world background") ||
        combinedMeta.includes("cinematic setting");

      const hasFlat2DKeywords =
        combinedMeta.includes("2d") ||
        combinedMeta.includes("flat product") ||
        combinedMeta.includes("graphics asset") ||
        combinedMeta.includes("no shadow") ||
        combinedMeta.includes("marketplace photo") ||
        combinedMeta.includes("e-commerce photo");

      const hasIsolatedPngKeywords =
        combinedMeta.includes("transparent") ||
        combinedMeta.includes("png") ||
        combinedMeta.includes("isolated") ||
        combinedMeta.includes("cutout");

      let category: ReferenceQualityCategory = "MARKETPLACE_FLAT";
      let classification: ReferenceQualityClassification = "WEAK_STUDIO_WHITE_BG";
      let action: ReferenceBypassAction = "PROMPT_COMPENSATION_ONLY";
      let detectedBg: "white_studio" | "isolated_transparent" | "flat_2d" | "natural_environment" | "unknown" = "white_studio";
      let isWeak = true;

      if (isLowQuality) {
        category = "LOW_QUALITY";
        classification = "WEAK_STUDIO_WHITE_BG";
        action = "QUALITY_WARNING_ADVISED";
        detectedBg = "unknown";
        isWeak = true;
      } else if (hasStrongEnvKeywords && !hasFlat2DKeywords && !hasIsolatedPngKeywords) {
        category = "LIFESTYLE_ENVIRONMENT";
        classification = "STRONG_ENVIRONMENTAL";
        action = "DIRECT_BYPASS";
        detectedBg = "natural_environment";
        isWeak = false;
      } else if (hasProfessionalStudioKeywords) {
        category = "PROFESSIONAL_STUDIO";
        classification = "STRONG_ENVIRONMENTAL";
        action = "DIRECT_BYPASS";
        detectedBg = "white_studio";
        isWeak = false;
      } else if (hasIsolatedPngKeywords) {
        category = "ISOLATED_OBJECT";
        classification = "ISOLATED_PNG";
        action = "PROMPT_COMPENSATION_ONLY";
        detectedBg = "isolated_transparent";
        isWeak = true;
      } else if (hasFlat2DKeywords) {
        category = "MARKETPLACE_FLAT";
        classification = "FLAT_MARKETPLACE_2D";
        action = "PROMPT_COMPENSATION_ONLY";
        detectedBg = "flat_2d";
        isWeak = true;
      } else {
        // Default white background studio without lighting context
        category = "MARKETPLACE_FLAT";
        classification = "WEAK_STUDIO_WHITE_BG";
        action = "PROMPT_COMPENSATION_ONLY";
        detectedBg = "white_studio";
        isWeak = true;
      }

      // Compute ReferenceReadinessScore (rendering context readiness)
      const readinessScore: ReferenceReadinessScore = {
        resolutionScore: isLowQuality ? 20 : 90,
        sharpnessScore: isLowQuality ? 30 : isWeak ? 75 : 95,
        backgroundContextScore: action === "DIRECT_BYPASS" ? 95 : 25,
        lightingContextScore: action === "DIRECT_BYPASS" ? 90 : 30,
        depthInformationScore: action === "DIRECT_BYPASS" ? 90 : 20,
        overallScore: action === "DIRECT_BYPASS" ? 92 : isLowQuality ? 25 : 40,
      };

      return {
        quality_classification: classification,
        category,
        bypass_action: action,
        readiness_score: readinessScore,
        is_weak_reference: isWeak,
        identity_completeness_score: products.length > 0 ? 95 : 70,
        visual_context_score: readinessScore.overallScore,
        lacks_depth: isWeak,
        lacks_environmental_lighting: isWeak,
        lacks_contact_shadows: isWeak,
        lacks_material_reflections: isWeak,
        detected_background: detectedBg,
        diagnostics_summary: `Reference readiness decision: category=${category}, action=${action}, readinessScore=${readinessScore.overallScore}.`,
      };
    } catch (err: any) {
      // SILENT FALLBACK to Phase 3.4 safe behavior if analysis fails
      return {
        quality_classification: "WEAK_STUDIO_WHITE_BG",
        category: "MARKETPLACE_FLAT",
        bypass_action: "PROMPT_COMPENSATION_ONLY",
        is_weak_reference: true,
        identity_completeness_score: 90,
        visual_context_score: 30,
        lacks_depth: true,
        lacks_environmental_lighting: true,
        lacks_contact_shadows: true,
        lacks_material_reflections: true,
        detected_background: "white_studio",
        diagnostics_summary: `Reference quality analysis fallback triggered due to error: ${err?.message || "unknown"}.`,
      };
    }
  }
}
