import {
  AssetReferenceClassification,
  LogoLockEntry,
  ProductIdentityLockEntry,
  ReferenceIdentityReport,
  ReferenceIdentityRule,
  ReferenceManifest,
  ReferenceRelationshipType,
  RoutingResultSchema,
} from "../types";

import { ProductPlanningService } from "./ProductPlanningService";
import { ReferenceControlService } from "./ReferenceControlService";

export class ReferenceIntelligenceService {
  private planner = new ProductPlanningService();
  private controlService = new ReferenceControlService();

  /**
   * Generates a structured ReferenceManifest from Stage 2 RoutingResultSchema
   * featuring Phase 2.4 Reference Identity Preservation locks, classifications,
   * Phase 2.5.2 Product Manifest, and diagnostics.
   */
  public generateManifest(
    routingResult: RoutingResultSchema,
    targetProductCountRequested?: number
  ): ReferenceManifest {
    const products = routingResult.products || [];
    const assetRoles = routingResult.asset_roles || [];

    // Collect all referenced IDs
    const allRefIds = new Set<string>();
    products.forEach((p) => (p.reference_ids || []).forEach((ref) => allRefIds.add(ref)));
    assetRoles.forEach((ar) => allRefIds.add(ar.reference_id));

    const totalReferences = Math.max(allRefIds.size, 1);

    // Identify product vs logo vs style roles
    const logoRefIds = assetRoles.filter((ar) => ar.role === "LOGO").map((ar) => ar.reference_id);
    const productRefIds = assetRoles.filter((ar) => ar.role === "PRODUCT").map((ar) => ar.reference_id);
    const styleRefIds = assetRoles.filter((ar) => (ar.role as string) === "STYLE" || ar.role === "SUPPORT_REFERENCE").map((ar) => ar.reference_id);

    const detectedProductsCount = Math.max(products.length, productRefIds.length, 1);
    const detectedLogosCount = logoRefIds.length;

    // Check if multiple views of the same single product exist
    let sameProductViewsCount = 0;
    if (products.length === 1 && products[0].reference_ids && products[0].reference_ids.length > 1) {
      sameProductViewsCount = products[0].reference_ids.length;
    }

    // Determine Relationship Type
    let relationshipType: ReferenceRelationshipType = "single_product";

    if (products.length > 1) {
      relationshipType = "multi_product";
    } else if (sameProductViewsCount > 1) {
      relationshipType = "same_product_multi_view";
    } else if (detectedLogosCount > 0 && products.length >= 1) {
      relationshipType = "product_with_logo";
    } else if (products.length === 0 && detectedLogosCount > 0) {
      relationshipType = "brand_only";
    } else if (products.length === 0 && detectedLogosCount === 0) {
      relationshipType = "style_only";
    } else {
      relationshipType = "single_product";
    }

    // 1. Reference Classification Layer
    const classifications: AssetReferenceClassification[] = [];
    allRefIds.forEach((refId) => {
      const isLogo = logoRefIds.includes(refId);
      const isProd = productRefIds.includes(refId) || products.some((p) => (p.reference_ids || []).includes(refId));
      const isStyle = styleRefIds.includes(refId) || assetRoles.some((ar) => ar.reference_id === refId && ((ar.role as string) === "STYLE" || ar.role === "SUPPORT_REFERENCE"));

      if (isProd || isLogo || (!isStyle && relationshipType !== "style_only")) {
        classifications.push({
          reference_id: refId,
          classification: "IDENTITY_REFERENCE",
          role: isLogo ? "LOGO" : "PRODUCT",
          reason: "Commercial asset requires exact visual identity, shape, packaging, and logo preservation.",
        });
      } else {
        classifications.push({
          reference_id: refId,
          classification: "INSPIRATION_REFERENCE",
          role: "STYLE",
          reason: "Style reference allows creative interpretation for lighting mood and aesthetic composition.",
        });
      }
    });

    // 2. Identity Rules Generator
    const identityRules: ReferenceIdentityRule[] = [];
    const productIdentityLocks: ProductIdentityLockEntry[] = [];
    const logoLocks: LogoLockEntry[] = [];

    // Product Identity Locks
    products.forEach((prod, idx) => {
      const pId = prod.product_id || `PRODUCT_${String(idx + 1).padStart(2, "0")}`;
      const refs = prod.reference_ids && prod.reference_ids.length > 0 ? prod.reference_ids : [`REF_01`];
      const canonicalName = (prod as any).brand_name || prod.summary || `Commercial Product ${idx + 1}`;
      const features =
        (prod as any).key_visual_features ||
        prod.branding_features?.map((b: any) => b.name || b.value || b.label || String(b)) ||
        ["Product Contour", "Brand Label"];

      productIdentityLocks.push({
        product_id: pId,
        reference_ids: refs,
        canonical_name: canonicalName,
        key_features: features,
        preserve_aspects: ["logo_branding", "label_typography", "packaging_contours", "exact_color_palette"],
      });

      identityRules.push({
        rule_id: `RULE_PROD_LOCK_${idx + 1}`,
        type: "product_lock",
        target_reference_ids: refs,
        instruction: `LOCK PRODUCT IDENTITY: Maintain strict visual adherence to canonical product '${canonicalName}'. Lock logo typography, label layout, silhouette, and color saturation from ${refs.join(", ")}.`,
        priority: "CRITICAL",
        strength: "hard",
        rules: ["preserve silhouette", "preserve geometry", "preserve packaging", "preserve colors"],
      });

      identityRules.push({
        rule_id: `RULE_PKG_LOCK_${idx + 1}`,
        type: "packaging_lock",
        target_reference_ids: refs,
        instruction: `PRESERVE PACKAGING: Maintain exact physical container geometry, material finish (glass/plastic/metal), lid/cap details, and structural contours.`,
        priority: "HIGH",
        strength: "hard",
        rules: ["preserve packaging geometry", "preserve container finish"],
      });
    });

    // Logo Locks
    if (logoRefIds.length > 0) {
      logoRefIds.forEach((lRefId, idx) => {
        const brandName = (products[0] as any)?.brand_name || products[0]?.summary || "Brand Logo";
        logoLocks.push({
          reference_id: lRefId,
          brand_name: brandName,
          placement_rule: "Place crisp logo vector in primary visual focus zone with clear brand contrast.",
        });

        identityRules.push({
          rule_id: `RULE_LOGO_PRESERVE_${idx + 1}`,
          type: "logo_preservation",
          target_reference_ids: [lRefId],
          instruction: `PRESERVE LOGO: Lock exact vector geometry, font kerning, and color values of logo reference '${lRefId}' without distortion or text alteration.`,
          priority: "CRITICAL",
          strength: "absolute",
          rules: ["use original logo", "do not redraw", "do not modify typography", "do not change proportions"],
        });
      });
    }

    // Multi-Product Arrangement Rules
    if (relationshipType === "multi_product") {
      const allProductRefs = products.flatMap((p) => p.reference_ids || []);
      identityRules.push({
        rule_id: "RULE_MULTI_PROD_ARRANGEMENT",
        type: "multi_product_arrangement",
        target_reference_ids: allProductRefs,
        instruction: "MULTI-PRODUCT ARRANGEMENT: Position primary hero product centrally in sharp focus. Arrange secondary product(s) in balanced visual hierarchy.",
        priority: "HIGH",
        strength: "hard",
      });
    }

    // Multi-View Consistency Rules
    if (relationshipType === "same_product_multi_view") {
      const multiViewRefs = products[0]?.reference_ids || [];
      identityRules.push({
        rule_id: "RULE_MULTI_VIEW_CONSISTENCY",
        type: "multi_view_consistency",
        target_reference_ids: multiViewRefs,
        instruction: `MULTI-VIEW CONSISTENCY: Cross-reference all uploaded angles (${multiViewRefs.join(", ")}). Ensure 3D shape, material transparency, and label position remain consistent.`,
        priority: "HIGH",
        strength: "hard",
      });
    }

    // Style Guidelines
    if (relationshipType === "style_only") {
      identityRules.push({
        rule_id: "RULE_STYLE_GUIDELINE",
        type: "style_guideline",
        target_reference_ids: Array.from(allRefIds),
        instruction: "STYLE GUIDELINE: Extract color grading, ambient lighting temperature, and aesthetic mood from style references.",
        priority: "MEDIUM",
        strength: "flexible",
      });
    }

    // 3. Diagnostics Report Generation
    const referenceIdentityReport: ReferenceIdentityReport = {
      product_lock: products.length > 0,
      logo_lock: detectedLogosCount > 0,
      identity_score: products.length > 0 && detectedLogosCount > 0 ? 98 : products.length > 0 ? 92 : 80,
      transformation_allowed: true,
      classifications,
    };

    const productManifest = this.planner.buildProductManifest(routingResult, targetProductCountRequested);
    const identityControlMetadata = this.controlService.generateControlMetadata(routingResult);

    return {
      relationship_type: relationshipType,
      total_references: totalReferences,
      detected_products_count: detectedProductsCount,
      detected_logos_count: detectedLogosCount,
      same_product_views_count: sameProductViewsCount,
      classifications,
      identity_rules: identityRules,
      product_identity_locks: productIdentityLocks,
      logo_locks: logoLocks,
      reference_identity_report: referenceIdentityReport,
      product_manifest: productManifest,
      identity_control_metadata: identityControlMetadata,
    };
  }
}
