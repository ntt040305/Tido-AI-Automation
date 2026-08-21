import { ProductIdentityResolver } from "../compiler/ProductIdentityResolver";
import {
  CopyItemInput,
  ExtractedAssetRoleV1,
  GenerationIntentBriefV1,
  GenerationReferenceV1,
  MasterPromptCompilerInput,
  RoutingResultSchema,
  SimpleInputRequestV1,
  StructuredInputIntentV1,
} from "../types";
import { SimpleInputValidatorV1 } from "../validation/SimpleInputValidatorV1";

export interface SimpleInputAdaptedPayloadV1 {
  success: boolean;
  status: "READY" | "NO_PRODUCT_REFERENCE" | "INVALID_REQUEST";
  compilerInput?: Partial<MasterPromptCompilerInput>;
  resolvedRoutingResult: RoutingResultSchema;
  resolvedProductCount: number;
  productCandidates: ExtractedAssetRoleV1[];
  brandAssets: ExtractedAssetRoleV1[];
  supportReferences: ExtractedAssetRoleV1[];
  ambiguousAssets: ExtractedAssetRoleV1[];
  generationReferences: GenerationReferenceV1[];
  generationIntentBrief: GenerationIntentBriefV1;
  compilerBrief: string;
  copyItems: CopyItemInput[];
  brandName?: string;
  brandInfo?: string;
  hardRequirements: string[];
  useCase?: string;
  aspectRatio?: string;
  diagnostics: {
    rawConceptChars: number;
    generationBriefChars: number;
    exactCopyChars: number;
    hardRequirementChars: number;
    generatedCopyAllowed: boolean;
    referenceRolePassthroughGapNoted: boolean;
  };
  error?: string;
}

export class SimpleInputAdapterService {
  /**
   * Adapts SimpleInputRequestV1 and Stage 2 RoutingResultSchema into structured backend inputs
   * for the existing TIDO Image Engine compiler & knowledge retrieval stages.
   * 
   * Server-side only, deterministic, side-effect-light, 0 LLM / provider calls.
   */
  public static adapt(
    request: SimpleInputRequestV1,
    routingResult: RoutingResultSchema
  ): SimpleInputAdaptedPayloadV1 {
    // 1. Validate request bounds via SimpleInputValidatorV1
    const validation = SimpleInputValidatorV1.validateRequest(request);
    if (!validation.isValid) {
      return {
        success: false,
        status: "INVALID_REQUEST",
        error: validation.errors.join("; "),
        resolvedRoutingResult: routingResult,
        resolvedProductCount: 0,
        productCandidates: [],
        brandAssets: [],
        supportReferences: [],
        ambiguousAssets: [],
        generationReferences: [],
        generationIntentBrief: {
          formatted_brief_text: "",
          char_count: 0,
          word_count: 0,
        },
        compilerBrief: "",
        copyItems: [],
        hardRequirements: [],
        diagnostics: {
          rawConceptChars: request.concept?.length || 0,
          generationBriefChars: 0,
          exactCopyChars: 0,
          hardRequirementChars: 0,
          generatedCopyAllowed: false,
          referenceRolePassthroughGapNoted: false,
        },
      };
    }

    // 2. Extract structured intent & asset roles
    const structuredIntent: StructuredInputIntentV1 = routingResult.structured_input_intent || {
      core_creative_intent: request.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: request.brandName ? [request.brandName] : [],
      explicit_hard_requirements: request.hardRequirements || [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [],
    };

    const assetRoles: ExtractedAssetRoleV1[] =
      routingResult.asset_roles ||
      structuredIntent.asset_roles ||
      (request.images || []).map((img, i) => ({
        reference_id: img.reference_id || `REF_${String(i + 1).padStart(2, "0")}`,
        role: "PRODUCT" as const,
        confidence: 0.9,
      }));

    // 3. Asset Gating: Categorize into eligible pools
    const productCandidates = assetRoles.filter((a) => a.role === "PRODUCT");
    const brandAssets = assetRoles.filter((a) => a.role === "LOGO");
    const supportReferences = assetRoles.filter((a) => a.role === "SUPPORT_REFERENCE");
    const ambiguousAssets = assetRoles.filter((a) => a.role === "AMBIGUOUS" || a.role === "UNKNOWN");

    const productCandidateRefIds = new Set(productCandidates.map((p) => p.reference_id));

    // Filter routingResult products to only include eligible PRODUCT candidates
    const eligibleProducts = (routingResult.products || []).filter((prod) =>
      prod.reference_ids.some((r) => productCandidateRefIds.has(r))
    );

    const filteredRoutingResult: RoutingResultSchema = {
      ...routingResult,
      products: eligibleProducts,
    };

    // 4. Product Identity Resolution (only run on eligible PRODUCT candidates)
    let resolvedProductCount = 0;
    let identityPackage: any = null;

    if (productCandidates.length > 0) {
      identityPackage = ProductIdentityResolver.resolve(
        filteredRoutingResult,
        productCandidates.map((c) => c.reference_id),
        Array.from(productCandidateRefIds)
      );
      resolvedProductCount = identityPackage.distinctProductCount;
    }

    const hasProductReference = resolvedProductCount > 0;
    const status = hasProductReference ? "READY" : "NO_PRODUCT_REFERENCE";

    // 5. Build Generation Reference Set (Additive Passthrough Pipeline)
    // Deterministic order: PRODUCT refs -> LOGO refs -> SUPPORT_REFERENCE refs (AMBIGUOUS excluded)
    const generationReferences: GenerationReferenceV1[] = [];

    productCandidates.forEach((c, idx) => {
      const mappedId = identityPackage?.referenceMappings?.find((r: any) => r.reference_id === c.reference_id)?.product_id;
      generationReferences.push({
        reference_id: c.reference_id,
        input_index: idx,
        role: "PRODUCT",
        product_id: mappedId || `PRODUCT_${String(idx + 1).padStart(2, "0")}`,
      });
    });

    brandAssets.forEach((b, idx) => {
      generationReferences.push({
        reference_id: b.reference_id,
        input_index: productCandidates.length + idx,
        role: "LOGO",
      });
    });

    supportReferences.forEach((s, idx) => {
      generationReferences.push({
        reference_id: s.reference_id,
        input_index: productCandidates.length + brandAssets.length + idx,
        role: "SUPPORT_REFERENCE",
      });
    });

    // 6. Build Generation Intent Brief & Model-Visible Reference Role Map
    const generationIntentBrief = SimpleInputValidatorV1.formatGenerationIntentBrief(structuredIntent);
    let compilerBrief = generationIntentBrief.formatted_brief_text;

    // Append compact, model-visible attachment-order reference role map
    if (generationReferences.length > 0) {
      const roleLines: string[] = [];
      generationReferences.forEach((ref, idx) => {
        const imgNum = idx + 1;
        if (ref.role === "PRODUCT") {
          roleLines.push(`- Image ${imgNum} (${ref.reference_id}): ${ref.product_id || "PRODUCT"} identity reference`);
        } else if (ref.role === "LOGO") {
          roleLines.push(`- Image ${imgNum} (${ref.reference_id}): Standalone brand logo visual reference (brand logo evidence only; NOT a product)`);
        } else if (ref.role === "SUPPORT_REFERENCE") {
          roleLines.push(`- Image ${imgNum} (${ref.reference_id}): Supporting visual reference (mood/environment/composition inspiration; subordinate to User Concept)`);
        }
      });
      compilerBrief += `\n\nATTACHED REFERENCE ROLES (ORDER MATCHES MULTIPART IMAGES):\n${roleLines.join("\n")}`;
    }

    // 7. Map Exact Copy Items
    const copyItems: CopyItemInput[] = (structuredIntent.extracted_copy_items || []).map((item) => {
      let type: CopyItemInput["type"] = "other";
      if (item.role === "HEADLINE") type = "headline";
      else if (item.role === "SUBHEADLINE") type = "subheadline";
      else if (item.role === "PRODUCT_NAME") type = "product_name";
      else if (item.role === "PRICE") type = "price";
      else if (item.role === "CTA") type = "cta";

      return {
        text: item.text,
        type,
      };
    });

    // Also include any raw copyItems from request if not already present
    if (request.copyItems && request.copyItems.length > 0) {
      request.copyItems.forEach((rawCopy) => {
        const text = typeof rawCopy === "string" ? rawCopy : (rawCopy as any).text;
        if (text && !copyItems.some((c) => c.text === text)) {
          copyItems.push({ text, type: "other" });
        }
      });
    }

    // 8. Derive Brand Info & Brand Name
    const brandName = request.brandName || structuredIntent.brand_mentions?.[0] || undefined;
    
    let brandInfo = request.brandInfo || undefined;
    if (!brandInfo && brandAssets.length > 0) {
      brandInfo = `Standalone brand logo reference provided (${brandAssets.map((b) => b.reference_id).join(", ")})`;
    }

    // 9. Derive Hard Requirements & Options
    const hardRequirements = [
      ...(request.hardRequirements || []),
      ...(structuredIntent.explicit_hard_requirements || []),
    ].filter((req, idx, self) => self.indexOf(req) === idx);

    const useCase = request.useCase || "Poster";
    const aspectRatio = request.aspectRatio || "4:5";

    // 10. Prompt Budget Diagnostics
    const exactCopyChars = copyItems.reduce((sum, c) => sum + c.text.length, 0);
    const hardReqChars = hardRequirements.reduce((sum, h) => sum + h.length, 0);

    // 11. Construct Compiler Input Partial
    const compilerInput: Partial<MasterPromptCompilerInput> = {
      productReferences: identityPackage?.referenceMappings || productCandidates.map((c, idx) => ({
        reference_id: c.reference_id,
        product_id: `PRODUCT_${String(idx + 1).padStart(2, "0")}`,
        input_index: idx,
      })),
      brief: compilerBrief,
      productCount: resolvedProductCount,
      copyItems,
      brandName,
      brandInfo,
      hardRequirements,
      useCase,
      aspectRatio,
      routingResult: filteredRoutingResult,
    };

    return {
      success: true,
      status,
      compilerInput,
      resolvedRoutingResult: filteredRoutingResult,
      resolvedProductCount,
      productCandidates,
      brandAssets,
      supportReferences,
      ambiguousAssets,
      generationReferences,
      generationIntentBrief,
      compilerBrief,
      copyItems,
      brandName,
      brandInfo,
      hardRequirements,
      useCase,
      aspectRatio,
      diagnostics: {
        rawConceptChars: request.concept?.length || 0,
        generationBriefChars: generationIntentBrief.char_count,
        exactCopyChars,
        hardRequirementChars: hardReqChars,
        generatedCopyAllowed: structuredIntent.generated_copy_allowed || false,
        referenceRolePassthroughGapNoted: false, // Resolved in Phase 3.5!
      },
    };
  }
}
