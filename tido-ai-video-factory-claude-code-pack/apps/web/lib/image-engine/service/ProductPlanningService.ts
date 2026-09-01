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
   * extracting product traits, evaluating reference relationships, validating target product count,
   * and generating compact provider-ready identity locks.
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

    // Extract Product Entries & Compact Locks
    const productEntries: ProductPlanEntry[] = [];
    const compactLocks: string[] = [];

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

        const compactLock = `LOCK [${pId}] (${canonicalName}) [Refs: ${refs.join(", ")}]: Shape=${shapeTrait} | Color=${colorTrait} | Material=${materialTrait} | Package=${packagingTrait} | Logo=${logoRelationship}`;

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

    return {
      manifest_version: "1.0",
      relationship_type: relationshipType,
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
