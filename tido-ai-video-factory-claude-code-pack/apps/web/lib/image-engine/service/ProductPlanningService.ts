import {
  ProductExtractedTraits,
  ProductManifest,
  ProductPlanEntry,
  ReferenceRelationshipType,
  RoutingResultSchema,
} from "../types";

export class ProductPlanningService {
  /**
   * Converts uploaded reference assets into a structured ProductManifest before generation,
   * applying adaptive identity detail compression based on target product count:
   *  - 1 product: HIGH identity detail
   *  - 2-3 products: MEDIUM compact identity
   *  - 4+ products: CATALOG compact identity
   */
  public buildProductManifest(
    routingResult: RoutingResultSchema,
    targetProductCountRequested?: number
  ): ProductManifest {
    const products = routingResult.products || [];
    const assetRoles = routingResult.asset_roles || [];

    const logoRefIds = assetRoles.filter((ar) => ar.role === "LOGO").map((ar) => ar.reference_id);
    const productRefIds = assetRoles.filter((ar) => ar.role === "PRODUCT").map((ar) => ar.reference_id);

    // Identify relationship type
    let sameProductViewsCount = 0;
    if (products.length === 1 && products[0].reference_ids && products[0].reference_ids.length > 1) {
      sameProductViewsCount = products[0].reference_ids.length;
    }

    let relationshipType: ReferenceRelationshipType = "single_product";

    if (products.length > 1) {
      relationshipType = "multi_product";
    } else if (sameProductViewsCount > 1) {
      relationshipType = "same_product_multi_view";
    } else if (logoRefIds.length > 0 && products.length >= 1) {
      relationshipType = "product_with_logo";
    } else if (products.length === 0 && logoRefIds.length > 0) {
      relationshipType = "brand_only";
    } else if (products.length === 0 && logoRefIds.length === 0) {
      relationshipType = "style_only";
    } else {
      relationshipType = "single_product";
    }

    let detectedCount = 0;
    if (relationshipType === "brand_only" || relationshipType === "style_only") {
      detectedCount = 0;
    } else if (products.length > 0) {
      detectedCount = products.length;
    } else {
      detectedCount = Math.max(productRefIds.length, 1);
    }
    const targetCount = targetProductCountRequested || (relationshipType === "multi_product" ? Math.max(2, products.length) : 1);

    const isValidCount = targetCount > 0;
    const validationNotes = `Target requested: ${targetCount}, detected products: ${detectedCount}, relationship: ${relationshipType}.`;

    // Determine Adaptive Detail Level based on Requirement 3:
    // 1 product: HIGH, 2-10 products: MEDIUM, >10 products: CATALOG
    let compressionMode: "HIGH" | "MEDIUM" | "CATALOG" = "HIGH";
    if (targetCount > 10 || products.length > 10) {
      compressionMode = "CATALOG";
    } else if (targetCount >= 2 || products.length >= 2) {
      compressionMode = "MEDIUM";
    } else {
      compressionMode = "HIGH";
    }

    // Extract Product Entries & Compact Locks
    const productEntries: ProductPlanEntry[] = [];
    const compactLocks: string[] = [];

    // Calculate raw string length before compression for telemetry
    const before_chars = JSON.stringify(products).length;

    if (relationshipType === "brand_only") {
      compactLocks.push(`LOCK BRAND LOGO (${logoRefIds.join(", ") || "REF_LOGO"}): Maintain original vector geometry, font kerning, and brand color.`);
    } else if (relationshipType === "style_only") {
      compactLocks.push(`LOCK STYLE REFERENCE: Extract ambient lighting mood and color palette.`);
    } else {
      products.forEach((prod, idx) => {
        const pId = prod.product_id || `PRODUCT_${String(idx + 1).padStart(2, "0")}`;
        const refs = prod.reference_ids && prod.reference_ids.length > 0 ? prod.reference_ids : [`REF_01`];
        const canonicalName = (prod as any).brand_name || prod.summary || `Commercial Product ${idx + 1}`;

        const shapeTrait = prod.geometry_traits?.map((g) => g.value).join(", ") || "Canonical Container Contour";
        const colorTrait = prod.surface_properties?.map((s) => s.value).join(", ") || "Canonical Colors";
        const materialTrait = prod.materials?.map((m) => m.value).join(", ") || "Glass / Plastic / Metallic Finish";
        const packagingTrait = prod.packaging_types?.map((p) => p.value).join(", ") || "Commercial Packaging";
        const labelTrait = prod.branding_features?.map((b) => b.value).join(", ") || "Official Label Typography";
        const logoRelationship = logoRefIds.length > 0 ? `Bound to Logo Reference (${logoRefIds.join(", ")})` : "Integrated Product Branding";

        const traits: ProductExtractedTraits = {
          shape: shapeTrait,
          color: colorTrait,
          material: materialTrait,
          packaging: packagingTrait,
          label: labelTrait,
          logo_relationship: logoRelationship,
        };

        let compactLock = "";
        if (compressionMode === "CATALOG") {
          // >10 products: CATALOG ultra-compact 1-line lock (under 60 chars per product)
          compactLock = `LOCK [${pId}]: Preserve silhouette, packaging, colors & logo.`;
        } else if (compressionMode === "MEDIUM") {
          // 2-3 products: MEDIUM compact identity (compact 1-2 line summary)
          compactLock = `LOCK [${pId}] (${canonicalName}) [Refs: ${refs.join(", ")}]: Shape=${shapeTrait} | Colors=${colorTrait} | Material=${materialTrait} | Package=${packagingTrait}. Preserve exact silhouette, packaging & logo. No redesign.`;
        } else {
          // 1 product: HIGH identity detail
          compactLock =
            `LOCK [${pId}] (${canonicalName}) [Refs: ${refs.join(", ")}]:\n` +
            `  - Shape: ${shapeTrait}\n` +
            `  - Material: ${materialTrait}\n` +
            `  - Packaging: ${packagingTrait}\n` +
            `  - Color: ${colorTrait}\n` +
            `  - Label: ${labelTrait}\n` +
            `  - Rules: Preserve exact silhouette, packaging appearance, colors & logo/label. No redesign, no replacement.`;
        }

        productEntries.push({
          product_id: pId,
          canonical_name: canonicalName,
          reference_ids: refs,
          is_hero: idx === 0,
          traits,
          compact_identity_lock: compactLock,
        });

        compactLocks.push(compactLock);
      });
    }

    const after_chars = compactLocks.join("\n").length;
    const compressionRatioNum = before_chars > 0 ? Math.max(0, (1 - after_chars / before_chars) * 100) : 0;
    const compression_ratio = `${compressionRatioNum.toFixed(1)}%`;

    console.log("[IDENTITY_COMPRESSION]", {
      before_chars,
      after_chars,
      products_count: detectedCount,
      compression_mode: compressionMode,
      compression_ratio,
    });

    return {
      manifest_version: "1.0",
      relationship_type: relationshipType,
      compression_mode: compressionMode,
      products: productEntries,
      validation: {
        target_count_requested: targetCount,
        detected_product_count: detectedCount,
        is_valid: isValidCount,
        notes: validationNotes,
      },
      compact_identity_locks: compactLocks,
    };
  }
}
