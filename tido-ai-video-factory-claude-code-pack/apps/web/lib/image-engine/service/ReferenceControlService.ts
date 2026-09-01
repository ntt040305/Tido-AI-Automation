import {
  IdentityControlMetadata,
  ReferenceManifest,
  ReferencePriorityEntry,
  RoutingResultSchema,
} from "../types";

export class ReferenceControlService {
  /**
   * Evaluates reference priority, feature preservation, flexibility boundaries, and forbidden AI transformations,
   * producing structured IdentityControlMetadata and an ultra-compact directive (under 500 characters).
   */
  public generateControlMetadata(
    routingResult: RoutingResultSchema,
    manifest?: ReferenceManifest
  ): IdentityControlMetadata {
    const assetRoles = routingResult.asset_roles || [];
    const products = routingResult.products || [];

    const referencePriority: ReferencePriorityEntry[] = [];
    const preserveFeaturesSet = new Set<string>();
    const flexibleFeaturesSet = new Set<string>();
    const forbiddenTransformationsSet = new Set<string>();

    let rankCounter = 1;

    // 1. Logos get rank 1 and highest priority weight
    const logoRoles = assetRoles.filter((ar) => ar.role === "LOGO");
    logoRoles.forEach((ar) => {
      referencePriority.push({
        reference_id: ar.reference_id,
        priority_rank: rankCounter++,
        role_weight: 1.0,
        role: "LOGO",
      });
      preserveFeaturesSet.add("Vector Logo Geometry");
      preserveFeaturesSet.add("Brand Typography");
      forbiddenTransformationsSet.add("Redraw Logo");
      forbiddenTransformationsSet.add("Distort Font Kerning");
    });

    // 2. Products get high priority weight
    const prodRoles = assetRoles.filter((ar) => ar.role === "PRODUCT");
    if (prodRoles.length === 0 && products.length > 0) {
      products.forEach((p) => {
        (p.reference_ids || []).forEach((ref) => {
          referencePriority.push({
            reference_id: ref,
            priority_rank: rankCounter++,
            role_weight: 0.9,
            role: "PRODUCT",
          });
        });
      });
    } else {
      prodRoles.forEach((ar) => {
        referencePriority.push({
          reference_id: ar.reference_id,
          priority_rank: rankCounter++,
          role_weight: 0.9,
          role: "PRODUCT",
        });
      });
    }

    if (products.length > 0 || prodRoles.length > 0) {
      preserveFeaturesSet.add("Product Silhouette & Geometry");
      preserveFeaturesSet.add("Packaging Contours & Label Layout");
      forbiddenTransformationsSet.add("Altering Product Shape");
      forbiddenTransformationsSet.add("Inventing Unverified Text");
    }

    // 3. Flexible Features (Environment, Lighting, Camera)
    flexibleFeaturesSet.add("Background Environment");
    flexibleFeaturesSet.add("Studio Illumination & Lighting");
    flexibleFeaturesSet.add("Camera Angle & Depth of Field");

    // 4. Style & Support References
    const styleRoles = assetRoles.filter((ar) => (ar.role as string) === "STYLE" || ar.role === "SUPPORT_REFERENCE");
    styleRoles.forEach((ar) => {
      referencePriority.push({
        reference_id: ar.reference_id,
        priority_rank: rankCounter++,
        role_weight: 0.6,
        role: "STYLE",
      });
      flexibleFeaturesSet.add("Color Palette Inspiration");
    });

    // 5. Confidence Score Calculation
    const hasProduct = prodRoles.length > 0 || products.length > 0;
    const hasLogo = logoRoles.length > 0;
    let confidenceScore = 0.85;
    if (hasProduct && hasLogo) confidenceScore = 0.98;
    else if (hasProduct) confidenceScore = 0.92;
    else if (hasLogo) confidenceScore = 0.90;

    const preserveFeatures = Array.from(preserveFeaturesSet);
    const flexibleFeatures = Array.from(flexibleFeaturesSet);
    const forbiddenTransformations = Array.from(forbiddenTransformationsSet);

    // 6. Compact Identity Directive (STRICTLY UNDER 500 CHARACTERS)
    const prioStr = referencePriority.map((rp) => `${rp.reference_id}(${rp.role}:${rp.role_weight})`).join(", ");
    const lockStr = preserveFeatures.slice(0, 3).join(", ");
    const allowStr = flexibleFeatures.slice(0, 3).join(", ");
    const forbidStr = forbiddenTransformations.slice(0, 3).join(", ");

    let compactDirective = `[REF CONTROL] Prio: ${prioStr} | Lock: ${lockStr} | Allow: ${allowStr} | Forbid: ${forbidStr}`;

    if (compactDirective.length > 490) {
      compactDirective = compactDirective.slice(0, 487) + "...";
    }

    return {
      metadata_version: "1.0",
      reference_priority: referencePriority,
      preserve_features: preserveFeatures,
      flexible_features: flexibleFeatures,
      forbidden_transformations: forbiddenTransformations,
      identity_confidence_score: confidenceScore,
      compact_directive: compactDirective,
    };
  }
}
