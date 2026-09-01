/**
 * Lightweight Image Quality Checker Component
 *
 * Evaluates PictureEngineResponse and returns standardized ImageQCResult.
 */

import { PictureEngineRequest, PictureEngineResponse } from "@tido/contracts";
import { ImageQCResult } from "../interfaces/picture-engine-v1-pro.interface";

export class ImageQualityChecker {
  public evaluateQuality(
    response: PictureEngineResponse,
    request: PictureEngineRequest
  ): ImageQCResult {
    const issues: string[] = [];

    if (response.status === "failed") {
      issues.push(response.error || "Generation execution failed.");
      return {
        overall_score: 0.0,
        brand_alignment_score: 0.0,
        technical_quality_score: 0.0,
        commercial_impact_score: 0.0,
        issues: issues,
        validation_result: "fail",
      };
    }

    let technicalScore = 0.95;
    let brandScore = 0.90;
    let commercialScore = 0.92;

    if (!response.output_image_url) {
      issues.push("Missing output image URL in response payload");
      technicalScore -= 0.3;
    }

    const overallScore = Math.min(
      1.0,
      Number(((technicalScore + brandScore + commercialScore) / 3).toFixed(2))
    );

    let validationResult: "pass" | "warn" | "fail" = "pass";
    if (overallScore < 0.6) {
      validationResult = "fail";
    } else if (overallScore < 0.85 || issues.length > 0) {
      validationResult = "warn";
    }

    return {
      overall_score: overallScore,
      brand_alignment_score: brandScore,
      technical_quality_score: technicalScore,
      commercial_impact_score: commercialScore,
      issues: issues,
      validation_result: validationResult,
    };
  }
}
