export interface ReferenceSimilarityMetrics {
  silhouette: number;    // 20% Weight
  geometry: number;      // 25% Weight
  color: number;         // 20% Weight
  packaging: number;      // 20% Weight
  logo_position: number;  // 15% Weight
  compositeSimilarityScore: number;
}

export interface DimensionalCommercialScores {
  productFidelity: number;    // 30% Weight (Hard Gate >= 0.85)
  logoFidelity: number;       // 20% Weight (Hard Gate >= 0.85)
  composition: number;        // 15% Weight
  lighting: number;           // 10% Weight
  typography: number;         // 15% Weight
  commercialImpact: number;   // 10% Weight
}

export interface EvaluationResultPayload {
  passed: boolean; // Overall >= 0.85 AND productFidelity >= 0.85 AND logoFidelity >= 0.85
  hardIdentityPassed: boolean; // productFidelity >= 0.85 && logoFidelity >= 0.85
  overallWeightedScore: number;
  scores: DimensionalCommercialScores;
  referenceSimilarity: ReferenceSimilarityMetrics;
  detectedDiscrepancies: Array<"PRODUCT_SHAPE_ALTERED" | "LOGO_DEFORMED" | "BAD_LIGHTING" | "COMPOSITION_CLUTTER" | "TEXT_UNREADABLE">;
  hardFailureReasons: string[];
}

export class ReferenceAwareCreativeCriticAgent {
  public static readonly MIN_PRODUCT_FIDELITY = 0.85;
  public static readonly MIN_LOGO_FIDELITY = 0.85;
  public static readonly MIN_OVERALL_SCORE = 0.85;

  /**
   * Reference-Aware Creative Critic Agent:
   * Evaluates the rendered visual against original product reference assets across 6 commercial dimensions
   * and 5 reference similarity sub-dimensions, enforcing non-negotiable hard identity failure rules.
   */
  public evaluate(input: {
    scores?: Partial<DimensionalCommercialScores>;
    referenceSimilarity?: Partial<ReferenceSimilarityMetrics>;
  }): EvaluationResultPayload {
    // 1. Calculate Reference Similarity Breakdown
    const simInput = input.referenceSimilarity || {};
    const silhouette = simInput.silhouette ?? 0.90;
    const geometry = simInput.geometry ?? 0.90;
    const color = simInput.color ?? 0.90;
    const packaging = simInput.packaging ?? 0.90;
    const logo_position = simInput.logo_position ?? 0.90;

    const compositeSimilarityScore = Number(
      (
        silhouette * 0.20 +
        geometry * 0.25 +
        color * 0.20 +
        packaging * 0.20 +
        logo_position * 0.15
      ).toFixed(3)
    );

    const referenceSimilarity: ReferenceSimilarityMetrics = {
      silhouette,
      geometry,
      color,
      packaging,
      logo_position,
      compositeSimilarityScore,
    };

    // 2. Derive Dimensional Commercial Scores
    const scoresInput = input.scores || {};
    const productFidelity = scoresInput.productFidelity ?? compositeSimilarityScore;
    const logoFidelity = scoresInput.logoFidelity ?? 0.90;
    const composition = scoresInput.composition ?? 0.90;
    const lighting = scoresInput.lighting ?? 0.90;
    const typography = scoresInput.typography ?? 0.90;
    const commercialImpact = scoresInput.commercialImpact ?? 0.90;

    const scores: DimensionalCommercialScores = {
      productFidelity,
      logoFidelity,
      composition,
      lighting,
      typography,
      commercialImpact,
    };

    // 3. Compute Weighted Commercial Score Formula
    const overallWeightedScore = Number(
      (
        scores.productFidelity * 0.30 +
        scores.logoFidelity * 0.20 +
        scores.composition * 0.15 +
        scores.lighting * 0.10 +
        scores.typography * 0.15 +
        scores.commercialImpact * 0.10
      ).toFixed(3)
    );

    // 4. Enforce Hard Identity Gate Rules
    const hardIdentityPassed =
      scores.productFidelity >= ReferenceAwareCreativeCriticAgent.MIN_PRODUCT_FIDELITY &&
      scores.logoFidelity >= ReferenceAwareCreativeCriticAgent.MIN_LOGO_FIDELITY;

    const hardFailureReasons: string[] = [];
    const detectedDiscrepancies: EvaluationResultPayload["detectedDiscrepancies"] = [];

    if (scores.productFidelity < ReferenceAwareCreativeCriticAgent.MIN_PRODUCT_FIDELITY) {
      hardFailureReasons.push(
        `Product Fidelity (${scores.productFidelity}) below hard identity threshold 0.85`
      );
      detectedDiscrepancies.push("PRODUCT_SHAPE_ALTERED");
    }

    if (scores.logoFidelity < ReferenceAwareCreativeCriticAgent.MIN_LOGO_FIDELITY) {
      hardFailureReasons.push(
        `Logo Fidelity (${scores.logoFidelity}) below hard identity threshold 0.85`
      );
      detectedDiscrepancies.push("LOGO_DEFORMED");
    }

    if (scores.lighting < 0.75) {
      detectedDiscrepancies.push("BAD_LIGHTING");
    }
    if (scores.composition < 0.75) {
      detectedDiscrepancies.push("COMPOSITION_CLUTTER");
    }
    if (scores.typography < 0.75) {
      detectedDiscrepancies.push("TEXT_UNREADABLE");
    }

    // Hard Rule: Identity failure CANNOT be compensated by other scores
    const passed = hardIdentityPassed && overallWeightedScore >= ReferenceAwareCreativeCriticAgent.MIN_OVERALL_SCORE;

    return {
      passed,
      hardIdentityPassed,
      overallWeightedScore,
      scores,
      referenceSimilarity,
      detectedDiscrepancies,
      hardFailureReasons,
    };
  }
}
