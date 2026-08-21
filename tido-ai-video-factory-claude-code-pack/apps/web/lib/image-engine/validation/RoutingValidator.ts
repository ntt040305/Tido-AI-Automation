import { CreativeLeakDetector } from "./CreativeLeakDetector";
import { RoutingResultSchema } from "../types";

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  routing?: RoutingResultSchema;
}

export class RoutingValidator {
  private static ALLOWED_ROUTING_MODES = [
    "HIGH_CONFIDENCE",
    "PARTIAL_CONFIDENCE",
    "OPEN_WORLD",
    "INSUFFICIENT_EVIDENCE",
  ];

  private static ALLOWED_EVIDENCE_TYPES = [
    "USER_PROVIDED",
    "OBSERVED",
    "STRONG_INFERENCE",
    "WEAK_INFERENCE",
  ];

  private static ALLOWED_UNKNOWN_IMPORTANCE = ["LOW", "MEDIUM", "HIGH"];
  private static ALLOWED_QUERY_IMPORTANCE = ["PRIMARY", "SUPPORTING"];

  public static validate(
    data: any,
    expectedRefIds: string[]
  ): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== "object") {
      return { isValid: false, errors: ["Routing output is not a valid JSON object."] };
    }

    // 1. Top level required fields
    if (data.routing_version !== "1.0") {
      errors.push(`routing_version must be exactly '1.0' (received '${data.routing_version}')`);
    }

    if (!this.ALLOWED_ROUTING_MODES.includes(data.routing_mode)) {
      errors.push(`Invalid routing_mode '${data.routing_mode}'`);
    }

    if (data.requires_universal_core !== true) {
      errors.push("requires_universal_core must be strictly true");
    }

    if (typeof data.routing_summary !== "string" || data.routing_summary.trim() === "") {
      errors.push("routing_summary is required and must be a non-empty string");
    }

    // Global Retrieval Queries validation
    if (!Array.isArray(data.global_retrieval_queries)) {
      errors.push("global_retrieval_queries must be an array");
    } else {
      data.global_retrieval_queries.forEach((q: any, i: number) => {
        this.validateRetrievalQuery(q, `global_retrieval_queries[${i}]`, errors);
      });
    }

    // Products validation
    if (!Array.isArray(data.products) || data.products.length === 0) {
      errors.push("products array is missing or empty");
    } else {
      const seenProductIds = new Set<string>();

      data.products.forEach((prod: any, idx: number) => {
        const prodPrefix = `products[${idx}]`;

        if (!prod.product_id || typeof prod.product_id !== "string") {
          errors.push(`${prodPrefix}.product_id is missing or invalid`);
        } else {
          if (seenProductIds.has(prod.product_id)) {
            errors.push(`Duplicate product_id '${prod.product_id}' detected`);
          }
          seenProductIds.add(prod.product_id);
        }

        if (!Array.isArray(prod.reference_ids) || prod.reference_ids.length === 0) {
          errors.push(`${prodPrefix}.reference_ids must be a non-empty array`);
        } else {
          for (const refId of prod.reference_ids) {
            if (!expectedRefIds.includes(refId)) {
              errors.push(`${prodPrefix} contains unknown reference_id '${refId}'`);
            }
          }
        }

        if (
          typeof prod.reference_relationship_confidence !== "number" ||
          prod.reference_relationship_confidence < 0 ||
          prod.reference_relationship_confidence > 1
        ) {
          errors.push(
            `${prodPrefix}.reference_relationship_confidence must be a number between 0.0 and 1.0`
          );
        }

        if (typeof prod.summary !== "string" || prod.summary.trim() === "") {
          errors.push(`${prodPrefix}.summary is required`);
        }

        // Validate classification arrays
        const classificationFields = [
          "categories",
          "industry_domains",
          "likely_functions",
          "materials",
          "contents",
          "surface_properties",
          "geometry_traits",
          "packaging_types",
          "branding_features",
        ];

        for (const field of classificationFields) {
          if (!Array.isArray(prod[field])) {
            errors.push(`${prodPrefix}.${field} must be an array`);
          } else {
            prod[field].forEach((item: any, itemIdx: number) => {
              this.validateClassificationItem(item, `${prodPrefix}.${field}[${itemIdx}]`, errors);
            });
          }
        }

        // Validate Visual Challenges (id, description, confidence)
        if (!Array.isArray(prod.visual_challenges)) {
          errors.push(`${prodPrefix}.visual_challenges must be an array`);
        } else {
          prod.visual_challenges.forEach((vc: any, itemIdx: number) => {
            this.validateVisualChallenge(vc, `${prodPrefix}.visual_challenges[${itemIdx}]`, errors);
          });
        }

        // Validate Unknowns (subject, reason, importance)
        if (!Array.isArray(prod.unknowns)) {
          errors.push(`${prodPrefix}.unknowns must be an array`);
        } else {
          prod.unknowns.forEach((unk: any, itemIdx: number) => {
            this.validateUnknown(unk, `${prodPrefix}.unknowns[${itemIdx}]`, errors);
          });
        }

        // Validate Retrieval Queries (query, importance, reason)
        if (!Array.isArray(prod.retrieval_queries)) {
          errors.push(`${prodPrefix}.retrieval_queries must be an array`);
        } else {
          prod.retrieval_queries.forEach((q: any, itemIdx: number) => {
            this.validateRetrievalQuery(q, `${prodPrefix}.retrieval_queries[${itemIdx}]`, errors);
          });
        }
      });
    }

    // Creative Leak Detection
    const leakCheck = CreativeLeakDetector.validateNonCreativeRouting(data);
    if (leakCheck.hasLeak) {
      errors.push(leakCheck.leakDetails || "Creative leak detected");
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    return {
      isValid: true,
      routing: data as RoutingResultSchema,
    };
  }

  /**
   * Helper: Validate Shape A (Classification Item)
   */
  private static validateClassificationItem(item: any, path: string, errors: string[]) {
    if (!item || typeof item !== "object") {
      errors.push(`${path} must be an object`);
      return;
    }
    if (typeof item.value !== "string") {
      errors.push(`${path}.value must be a string`);
    }
    if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) {
      errors.push(`${path}.confidence must be a number between 0.0 and 1.0`);
    }
    if (!this.ALLOWED_EVIDENCE_TYPES.includes(item.evidence_type)) {
      errors.push(`${path}.evidence_type '${item.evidence_type}' is invalid`);
    }
    if (typeof item.evidence_summary !== "string") {
      errors.push(`${path}.evidence_summary must be a string`);
    }
  }

  /**
   * Helper: Validate Shape B (Visual Challenge)
   */
  private static validateVisualChallenge(item: any, path: string, errors: string[]) {
    if (!item || typeof item !== "object") {
      errors.push(`${path} must be an object`);
      return;
    }
    if (typeof item.id !== "string" || item.id.trim() === "") {
      errors.push(`${path}.id is required and must be a string`);
    }
    if (typeof item.description !== "string" || item.description.trim() === "") {
      errors.push(`${path}.description is required and must be a string`);
    }
    if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) {
      errors.push(`${path}.confidence must be a number between 0.0 and 1.0`);
    }
  }

  /**
   * Helper: Validate Shape C (Unknown Item)
   */
  private static validateUnknown(item: any, path: string, errors: string[]) {
    if (typeof item === "string") {
      errors.push(`${path} must be an object { subject, reason, importance }, not a plain string`);
      return;
    }
    if (!item || typeof item !== "object") {
      errors.push(`${path} must be an object`);
      return;
    }
    if (typeof item.subject !== "string" || item.subject.trim() === "") {
      errors.push(`${path}.subject is required`);
    }
    if (typeof item.reason !== "string" || item.reason.trim() === "") {
      errors.push(`${path}.reason is required`);
    }
    if (!this.ALLOWED_UNKNOWN_IMPORTANCE.includes(item.importance)) {
      errors.push(`${path}.importance '${item.importance}' must be LOW, MEDIUM, or HIGH`);
    }
  }

  /**
   * Helper: Validate Shape D (Retrieval Query)
   */
  private static validateRetrievalQuery(item: any, path: string, errors: string[]) {
    if (typeof item === "string") {
      errors.push(`${path} must be an object { query, importance, reason }, not a plain string`);
      return;
    }
    if (!item || typeof item !== "object") {
      errors.push(`${path} must be an object`);
      return;
    }
    if (typeof item.query !== "string" || item.query.trim() === "") {
      errors.push(`${path}.query is required`);
    }
    if (!this.ALLOWED_QUERY_IMPORTANCE.includes(item.importance)) {
      errors.push(`${path}.importance '${item.importance}' must be PRIMARY or SUPPORTING`);
    }
    if (typeof item.reason !== "string" || item.reason.trim() === "") {
      errors.push(`${path}.reason is required`);
    }
  }
}
