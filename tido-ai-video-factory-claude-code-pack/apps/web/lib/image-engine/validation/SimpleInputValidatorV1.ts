import {
  CONCEPT_LENGTH_POLICY,
  ExtractedAssetRoleV1,
  ExtractedCopyItemV1,
  ExtractedCopyRoleV1,
  GenerationIntentBriefV1,
  SimpleInputRequestV1,
  SimpleInputValidationResultV1,
  StructuredInputIntentV1,
} from "../types";

export class SimpleInputValidatorV1 {
  public static readonly VALID_COPY_ROLES: ExtractedCopyRoleV1[] = [
    "HEADLINE",
    "SUBHEADLINE",
    "PRODUCT_NAME",
    "PRICE",
    "CTA",
    "GENERAL",
  ];

  /**
   * Validates a SimpleInputRequestV1 structure for four-input requirements and concept length policy.
   */
  public static validateRequest(input: SimpleInputRequestV1): SimpleInputValidationResultV1 {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!input || typeof input !== "object") {
      return { isValid: false, errors: ["Input payload must be a valid object"], warnings: [] };
    }

    if (!input.concept || typeof input.concept !== "string" || input.concept.trim().length === 0) {
      errors.push("Concept text is required and cannot be empty.");
    } else {
      const charLen = input.concept.trim().length;
      if (charLen > CONCEPT_LENGTH_POLICY.HARD_MAXIMUM_LIMIT) {
        errors.push(
          `Concept length (${charLen} chars) exceeds hard maximum limit of ${CONCEPT_LENGTH_POLICY.HARD_MAXIMUM_LIMIT} characters.`
        );
      } else if (charLen > CONCEPT_LENGTH_POLICY.WARNING_THRESHOLD) {
        warnings.push(
          `Concept length (${charLen} chars) exceeds warning threshold of ${CONCEPT_LENGTH_POLICY.WARNING_THRESHOLD} characters.`
        );
      } else if (charLen > CONCEPT_LENGTH_POLICY.SOFT_GUIDANCE_LIMIT) {
        warnings.push(
          `Concept length (${charLen} chars) exceeds soft guidance threshold of ${CONCEPT_LENGTH_POLICY.SOFT_GUIDANCE_LIMIT} characters.`
        );
      }
    }

    if (!input.useCase || typeof input.useCase !== "string" || input.useCase.trim().length === 0) {
      errors.push("Use case is required.");
    }

    if (!input.aspectRatio || typeof input.aspectRatio !== "string" || input.aspectRatio.trim().length === 0) {
      errors.push("Aspect ratio is required.");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Filters asset roles to extract ONLY positive PRODUCT candidates (role === "PRODUCT" && confidence >= 0.80).
   * Enforces the architectural invariant: AMBIGUOUS != PRODUCT and UNKNOWN != PRODUCT.
   */
  public static filterProductCandidates(assetRoles: ExtractedAssetRoleV1[]): ExtractedAssetRoleV1[] {
    if (!Array.isArray(assetRoles)) return [];
    return assetRoles.filter(
      (asset) => asset.role === "PRODUCT" && typeof asset.confidence === "number" && asset.confidence >= 0.80
    );
  }

  /**
   * Validates if a given copy role string is a supported ExtractedCopyRoleV1.
   */
  public static isValidCopyRole(role: string): role is ExtractedCopyRoleV1 {
    return SimpleInputValidatorV1.VALID_COPY_ROLES.includes(role as ExtractedCopyRoleV1);
  }

  /**
   * Formats a StructuredInputIntentV1 into a compact GenerationIntentBriefV1,
   * completely omitting unspecified visual parameters without dangling headers.
   */
  public static formatGenerationIntentBrief(intent: StructuredInputIntentV1): GenerationIntentBriefV1 {
    const lines: string[] = [];

    if (intent.core_creative_intent && intent.core_creative_intent.trim()) {
      lines.push(`CREATIVE CONCEPT: ${intent.core_creative_intent.trim()}`);
    }

    if (intent.global_visual_language && intent.global_visual_language.trim()) {
      lines.push(`VISUAL STYLE: ${intent.global_visual_language.trim()}`);
    }

    if (intent.scene_environment && intent.scene_environment.trim()) {
      lines.push(`SCENE & ENVIRONMENT: ${intent.scene_environment.trim()}`);
    }

    if (intent.mood_emotion && intent.mood_emotion.trim()) {
      lines.push(`MOOD & ATMOSPHERE: ${intent.mood_emotion.trim()}`);
    }

    if (intent.subject_relationships && intent.subject_relationships.trim()) {
      lines.push(`SUBJECT RELATIONSHIPS & PLACEMENT: ${intent.subject_relationships.trim()}`);
    }

    if (intent.composition_requests && intent.composition_requests.trim()) {
      lines.push(`COMPOSITION: ${intent.composition_requests.trim()}`);
    }

    if (intent.camera_requests && intent.camera_requests.trim()) {
      lines.push(`VIEWPOINT & CAMERA: ${intent.camera_requests.trim()}`);
    }

    if (intent.lighting_requests && intent.lighting_requests.trim()) {
      lines.push(`LIGHTING DESIGN: ${intent.lighting_requests.trim()}`);
    }

    const effects = [];
    if (intent.color_requests && intent.color_requests.trim()) {
      effects.push(intent.color_requests.trim());
    }
    if (intent.material_or_visual_effect_requests && intent.material_or_visual_effect_requests.trim()) {
      effects.push(intent.material_or_visual_effect_requests.trim());
    }
    if (effects.length > 0) {
      lines.push(`COLOR PALETTE & VISUAL EFFECTS: ${effects.join(" | ")}`);
    }

    if (intent.typography_requests && intent.typography_requests.trim()) {
      lines.push(`TYPOGRAPHY OVERLAY TREATMENT: ${intent.typography_requests.trim()}`);
    }

    const text = lines.join("\n");
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

    return {
      formatted_brief_text: text,
      char_count: text.length,
      word_count: wordCount,
    };
  }
}
