import { IMAGE_ENGINE_CONFIG } from "../config";
import { RoutingResultSchema, RetrievalSignal, EvidenceType } from "../types";

export class RoutingSignalExtractor {
  public static extractSignals(routing: RoutingResultSchema): RetrievalSignal[] {
    const signals: RetrievalSignal[] = [];

    if (!routing || !Array.isArray(routing.products)) {
      return signals;
    }

    const weights = IMAGE_ENGINE_CONFIG.EVIDENCE_WEIGHTS as Record<string, number>;

    for (const prod of routing.products) {
      // 1. Classification Dimensions
      const mappings: Array<{ field: keyof typeof prod; dimension: string }> = [
        { field: "categories", dimension: "CATEGORY" },
        { field: "industry_domains", dimension: "INDUSTRY" },
        { field: "materials", dimension: "MATERIAL" },
        { field: "contents", dimension: "CONTENT" },
        { field: "surface_properties", dimension: "PROPERTY" },
        { field: "geometry_traits", dimension: "GEOMETRY" },
        { field: "packaging_types", dimension: "PACKAGING" },
        { field: "branding_features", dimension: "BRANDING" },
      ];

      for (const map of mappings) {
        const items = prod[map.field];
        if (Array.isArray(items)) {
          for (const item of items as any[]) {
            if (item && typeof item.value === "string" && typeof item.confidence === "number") {
              const evidenceType: EvidenceType = item.evidence_type || "OBSERVED";
              const weightMultiplier = weights[evidenceType] ?? 0.8;
              signals.push({
                dimension: map.dimension,
                value: item.value.toLowerCase().trim(),
                confidence: item.confidence,
                evidenceType,
                effectiveWeight: item.confidence * weightMultiplier,
              });
            }
          }
        }
      }

      // 2. Visual Challenges
      if (Array.isArray(prod.visual_challenges)) {
        for (const vc of prod.visual_challenges) {
          if (vc && typeof vc.confidence === "number") {
            const val = (vc.id || vc.description || "").toLowerCase().trim();
            if (val) {
              signals.push({
                dimension: "VISUAL_CHALLENGE",
                value: val,
                confidence: vc.confidence,
                evidenceType: "OBSERVED",
                effectiveWeight: vc.confidence * (weights.OBSERVED ?? 1.0),
              });
            }
          }
        }
      }
    }

    // 3. Global Retrieval Queries & Routing Summary
    if (Array.isArray(routing.global_retrieval_queries)) {
      for (const gq of routing.global_retrieval_queries) {
        if (gq && typeof gq.query === "string" && gq.query.trim()) {
          signals.push({
            dimension: "GLOBAL_INTENT",
            value: gq.query.toLowerCase().trim(),
            confidence: 0.95,
            evidenceType: "USER_PROVIDED",
            effectiveWeight: 0.95,
          });
        }
      }
    }

    if (typeof routing.routing_summary === "string" && routing.routing_summary.trim()) {
      signals.push({
        dimension: "GLOBAL_INTENT",
        value: routing.routing_summary.toLowerCase().trim(),
        confidence: 0.90,
        evidenceType: "USER_PROVIDED",
        effectiveWeight: 0.90,
      });
    }

    return signals;
  }
}
