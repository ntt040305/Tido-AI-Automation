import { RoutingResultSchema, CompiledReferenceMapping } from "../types";

export interface ResolvedProductGroup {
  product_id: string;
  reference_ids: string[];
  summary?: string;
  is_same_identity_proven: boolean;
  confidence: number;
  evidence_type: "USER_PROVIDED" | "OBSERVED" | "STRONG_INFERENCE" | "WEAK_INFERENCE" | "AMBIGUOUS";
}

export interface ResolvedProductIdentityPackage {
  groups: ResolvedProductGroup[];
  distinctProductCount: number;
  isSameIdentityMergeAllowed: boolean;
  referenceMappings: CompiledReferenceMapping[];
}

export class ProductIdentityResolver {
  /**
   * Safe same-identity threshold derived from Stage 2 Router Evidence Priority Policy (knowledge_router_v1.md):
   * - OBSERVED (0.90 - 0.95): Direct visual proof (e.g. front/back views of exact same physical item).
   * - STRONG_INFERENCE (0.70 - 0.85): High confidence deduction.
   * Merging multiple reference images under a single product identity requires positive evidence (confidence >= 0.85).
   * WEAK_INFERENCE (< 0.85) or AMBIGUOUS evidence CANNOT merge references into one identity, regardless of requested visible instance count.
   */
  private static STRONG_SAME_IDENTITY_THRESHOLD = 0.85;

  public static resolve(
    routingResult: RoutingResultSchema,
    rawProductReferences?: (string | { reference_id: string; product_id?: string; input_index?: number })[],
    expectedRefIds?: string[]
  ): ResolvedProductIdentityPackage {
    const rawRefs = rawProductReferences || [];
    const routedProducts = routingResult?.products || [];

    // Step 1: Check if user explicitly supplied distinct product mappings in rawReferences
    const explicitProductMap = new Map<string, string[]>(); // product_id -> reference_id[]
    if (rawRefs.length > 0) {
      rawRefs.forEach((ref, idx) => {
        if (typeof ref === "object" && ref.product_id) {
          const refId = ref.reference_id || (expectedRefIds?.[idx] ?? `REF_${String(idx + 1).padStart(2, "0")}`);
          const list = explicitProductMap.get(ref.product_id) || [];
          list.push(refId);
          explicitProductMap.set(ref.product_id, list);
        }
      });
    }

    // If explicit product mappings were given by user (e.g. PRODUCT_01 -> [REF_01], PRODUCT_02 -> [REF_02]), honor them directly
    if (explicitProductMap.size > 1) {
      const groups: ResolvedProductGroup[] = [];
      const referenceMappings: CompiledReferenceMapping[] = [];

      let indexCounter = 0;
      explicitProductMap.forEach((refIds, prodId) => {
        const matchingRoutedProd = routedProducts.find((p) => p.product_id === prodId || p.reference_ids.some((r) => refIds.includes(r)));
        groups.push({
          product_id: prodId,
          reference_ids: refIds,
          summary: matchingRoutedProd?.summary,
          is_same_identity_proven: refIds.length > 1,
          confidence: 1.0,
          evidence_type: "USER_PROVIDED",
        });

        refIds.forEach((refId) => {
          referenceMappings.push({
            reference_id: refId,
            product_id: prodId,
            input_index: indexCounter++,
          });
        });
      });

      return {
        groups,
        distinctProductCount: groups.length,
        isSameIdentityMergeAllowed: false,
        referenceMappings,
      };
    }

    // Step 2: Analyze routed products from Stage 2 Routing Result against conservative evidence rules
    const groups: ResolvedProductGroup[] = [];
    const referenceMappings: CompiledReferenceMapping[] = [];

    // Collect all expected reference IDs
    const allRefIds = expectedRefIds && expectedRefIds.length > 0
      ? expectedRefIds
      : rawRefs.map((r, i) => (typeof r === "string" ? r : r.reference_id || `REF_${String(i + 1).padStart(2, "0")}`));

    // If routedProducts has entries, evaluate each entry's evidence for same-identity merge validity
    if (routedProducts.length > 0) {
      routedProducts.forEach((prod, pIdx) => {
        const refIds = prod.reference_ids || [];

        if (refIds.length <= 1) {
          // Single-reference product entry: valid single product identity
          const finalProdId = prod.product_id && prod.product_id.startsWith("PRODUCT_")
            ? prod.product_id
            : `PRODUCT_${String(pIdx + 1).padStart(2, "0")}`;

          groups.push({
            product_id: finalProdId,
            reference_ids: refIds,
            summary: prod.summary,
            is_same_identity_proven: true,
            confidence: prod.reference_relationship_confidence ?? 1.0,
            evidence_type: "OBSERVED",
          });
        } else {
          // Multiple references assigned to a single routed product.
          // CONSERVATIVE EVIDENCE GUARD: Check if there is positive SAME_IDENTITY evidence justifying this merge.
          // NOTE: Visible instance count (productCount) is NEVER used to authorize a merge.
          const confidence = prod.reference_relationship_confidence ?? 0;
          const isValidSameIdentityMerge = confidence >= this.STRONG_SAME_IDENTITY_THRESHOLD;

          if (isValidSameIdentityMerge) {
            const finalProdId = prod.product_id && prod.product_id.startsWith("PRODUCT_")
              ? prod.product_id
              : `PRODUCT_${String(pIdx + 1).padStart(2, "0")}`;

            groups.push({
              product_id: finalProdId,
              reference_ids: refIds,
              summary: prod.summary,
              is_same_identity_proven: true,
              confidence,
              evidence_type: confidence >= 0.9 ? "OBSERVED" : "STRONG_INFERENCE",
            });
          } else {
            // WEAK INFERENCE / AMBIGUOUS MERGE DETECTED!
            // Execute conservative separation policy: split references into separate distinct physical product identities.
            refIds.forEach((refId) => {
              const separateProdId = `PRODUCT_${String(groups.length + 1).padStart(2, "0")}`;
              groups.push({
                product_id: separateProdId,
                reference_ids: [refId],
                summary: `${prod.summary || "Product item"} (${refId})`,
                is_same_identity_proven: false,
                confidence,
                evidence_type: "AMBIGUOUS",
              });
            });
          }
        }
      });
    }

    // Step 3: Handle any unassigned references conservatively
    const assignedRefIds = new Set<string>();
    groups.forEach((g) => g.reference_ids.forEach((r) => assignedRefIds.add(r)));

    allRefIds.forEach((refId) => {
      if (!assignedRefIds.has(refId)) {
        const newProdId = `PRODUCT_${String(groups.length + 1).padStart(2, "0")}`;
        groups.push({
          product_id: newProdId,
          reference_ids: [refId],
          summary: `Product reference ${refId}`,
          is_same_identity_proven: false,
          confidence: 0.5,
          evidence_type: "AMBIGUOUS",
        });
      }
    });

    // Construct final referenceMappings
    let mappingIdx = 0;
    groups.forEach((g) => {
      g.reference_ids.forEach((refId) => {
        referenceMappings.push({
          reference_id: refId,
          product_id: g.product_id,
          input_index: mappingIdx++,
        });
      });
    });

    const isSameIdentityMergeAllowed =
      groups.length === 1 && groups[0].is_same_identity_proven && groups[0].reference_ids.length > 1;

    return {
      groups,
      distinctProductCount: groups.length,
      isSameIdentityMergeAllowed,
      referenceMappings,
    };
  }
}
