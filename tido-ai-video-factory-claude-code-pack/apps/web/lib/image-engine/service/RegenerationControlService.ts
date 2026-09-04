import { EvaluationResultPayload } from "../evaluator/ReferenceAwareCreativeCriticAgent";

export type RegenerationTarget =
  | "BASE_SCENE_FULL"
  | "LIGHTING_ADJUST"
  | "COMPOSITION_ADJUST"
  | "TYPOGRAPHY_ONLY";

export interface RegenerationPlan {
  allowed: boolean;
  attemptNumber: number;
  maxAttempts: number;
  target: RegenerationTarget;
  discrepancy: string;
  actionSummary: string;
}

export class RegenerationControlService {
  public static readonly MAX_ATTEMPTS = 3;

  /**
   * Regeneration Control Service:
   * Maps creative critic discrepancies into targeted regeneration actions.
   * Strictly respects the maximum limit of 3 regeneration attempts.
   */
  public evaluateRegeneration(
    criticResult: EvaluationResultPayload,
    currentAttempt: number = 1
  ): RegenerationPlan {
    const maxAttempts = RegenerationControlService.MAX_ATTEMPTS;

    if (criticResult.passed) {
      return {
        allowed: false,
        attemptNumber: currentAttempt,
        maxAttempts,
        target: "TYPOGRAPHY_ONLY",
        discrepancy: "NONE",
        actionSummary: "Generation passed all quality gates. Zero regeneration required.",
      };
    }

    if (currentAttempt >= maxAttempts) {
      return {
        allowed: false,
        attemptNumber: currentAttempt,
        maxAttempts,
        target: "BASE_SCENE_FULL",
        discrepancy: criticResult.detectedDiscrepancies[0] || "HARD_IDENTITY_FAIL",
        actionSummary: `Maximum regeneration attempt limit (${maxAttempts}) reached. Outputting controlled failure payload.`,
      };
    }

    const nextAttempt = currentAttempt + 1;
    const discrepancies = criticResult.detectedDiscrepancies || [];

    let target: RegenerationTarget = "BASE_SCENE_FULL";
    let discrepancy = "HARD_IDENTITY_FAIL";
    let actionSummary = "";

    if (discrepancies.includes("PRODUCT_SHAPE_ALTERED")) {
      target = "BASE_SCENE_FULL";
      discrepancy = "PRODUCT_SHAPE_ALTERED";
      actionSummary = "Product shape or silhouette altered from reference. Executing full base scene regeneration with strict product lock.";
    } else if (discrepancies.includes("LOGO_DEFORMED")) {
      target = "BASE_SCENE_FULL";
      discrepancy = "LOGO_DEFORMED";
      actionSummary = "Logo deformation detected. Executing full base scene regeneration with deterministic logo overlay.";
    } else if (discrepancies.includes("BAD_LIGHTING")) {
      target = "LIGHTING_ADJUST";
      discrepancy = "BAD_LIGHTING";
      actionSummary = "Lighting exposure/contrast off target. Adjusting key rim light brightness in prompt compiler.";
    } else if (discrepancies.includes("COMPOSITION_CLUTTER")) {
      target = "COMPOSITION_ADJUST";
      discrepancy = "COMPOSITION_CLUTTER";
      actionSummary = "Composition clutter detected. Adjusting layout safe zones and negative space clearance.";
    } else if (discrepancies.includes("TEXT_UNREADABLE")) {
      target = "TYPOGRAPHY_ONLY";
      discrepancy = "TEXT_UNREADABLE";
      actionSummary = "Typography legibility or contrast ratio below threshold. Re-running local typography finishing engine (Zero provider API cost).";
    } else {
      target = "BASE_SCENE_FULL";
      discrepancy = "GENERAL_QUALITY_FAIL";
      actionSummary = "General quality failure. Re-running prompt compiler and provider generation.";
    }

    return {
      allowed: true,
      attemptNumber: nextAttempt,
      maxAttempts,
      target,
      discrepancy,
      actionSummary,
    };
  }
}
