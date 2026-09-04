import { LLMProviderService } from "../llm/llm-provider.service";
import {
  ConceptProfessionalizationRequest,
  ConceptProfessionalizationResult,
  ProductIdentityContext,
} from "../types";

/**
 * Concept Professionalizer Layer (UI: "✨ Chuyên nghiệp hóa ý tưởng")
 *
 * ISOLATED USER INPUT SERVICE — WITH AUTOMATIC PRODUCT IDENTITY CONTEXT INJECTION.
 * Elevates raw/simple user concepts into polished commercial advertising art directions.
 *
 * ARCHITECTURE PRINCIPLES:
 * 1. Purely optional user input layer extension.
 * 2. Automatic System Context: Receives product identity context from reference analysis.
 * 3. User does NOT need to input brand or category manually.
 * 4. Does NOT modify backend prompts, compilers, product manifests, or generation contracts.
 * 5. Gracefully falls back to original user concept if LLM fails or is unconfigured.
 */
export class ConceptProfessionalizerService {
  private llmProvider: LLMProviderService;

  constructor(llmProvider?: LLMProviderService) {
    this.llmProvider = llmProvider || new LLMProviderService();
  }

  /**
   * Builds normalized ProductIdentityContext from request, manifests, or manual inputs.
   */
  public buildIdentityContext(
    request: ConceptProfessionalizationRequest
  ): ProductIdentityContext {
    let identityContext = request.identityContext;
    const userConceptLower = (request.userConcept || "").toLowerCase();

    // Purge stale brand context if detectedBrand conflicts with userConcept intent
    if (identityContext && identityContext.detectedBrand) {
      const brandLower = identityContext.detectedBrand.toLowerCase();
      const isCosmeticConcept = userConceptLower.includes("mỹ phẩm") || userConceptLower.includes("serum") || userConceptLower.includes("skincare") || userConceptLower.includes("kem dưỡng") || userConceptLower.includes("son");
      const isSnackBrand = brandLower.includes("lay") || brandLower.includes("snack") || brandLower.includes("bánh");

      const isSnackConcept = userConceptLower.includes("snack") || userConceptLower.includes("bánh") || userConceptLower.includes("khoai tây");
      const isCosmeticBrand = brandLower.includes("serum") || brandLower.includes("skincare") || brandLower.includes("cosmetic");

      if ((isCosmeticConcept && isSnackBrand) || (isSnackConcept && isCosmeticBrand)) {
        console.warn(`[ConceptProfessionalizerService] Purged stale brand '${identityContext.detectedBrand}' due to concept category mismatch.`);
        const staleKw = isCosmeticConcept ? ["lay", "snack", "khoai tây", "bánh"] : ["serum", "mỹ phẩm", "skincare", "kem dưỡng"];
        const cleanLocks = (identityContext.identityLocks || []).filter(
          (l) => !staleKw.some((kw) => l.toLowerCase().includes(kw))
        );
        const cleanRules = (identityContext.preservationRules || []).filter(
          (r) => !staleKw.some((kw) => r.toLowerCase().includes(kw))
        );

        identityContext = {
          ...identityContext,
          detectedBrand: undefined,
          detectedProductType: undefined,
          detectedCategory: isCosmeticConcept ? "Cosmetics Skincare" : "Food Snack",
          identityLocks: cleanLocks,
          preservationRules: cleanRules,
        };
      }
      return identityContext;
    }

    if (identityContext) {
      return identityContext;
    }

    const locks: string[] = [];
    const rules: string[] = [];
    let detectedCategory = request.productCategory;
    let detectedBrand = request.brandName;
    let detectedProductType = request.productName;

    // Purge stale brandName if conflicting with userConcept
    if (detectedBrand) {
      const brandLower = detectedBrand.toLowerCase();
      const isCosmeticConcept = userConceptLower.includes("mỹ phẩm") || userConceptLower.includes("serum") || userConceptLower.includes("skincare") || userConceptLower.includes("kem dưỡng") || userConceptLower.includes("son");
      const isSnackBrand = brandLower.includes("lay") || brandLower.includes("snack") || brandLower.includes("bánh");

      const isSnackConcept = userConceptLower.includes("snack") || userConceptLower.includes("bánh") || userConceptLower.includes("khoai tây");
      const isCosmeticBrand = brandLower.includes("serum") || brandLower.includes("skincare") || brandLower.includes("cosmetic");

      if ((isCosmeticConcept && isSnackBrand) || (isSnackConcept && isCosmeticBrand)) {
        console.warn(`[ConceptProfessionalizerService] Purged stale brandName '${request.brandName}' due to concept mismatch.`);
        detectedBrand = undefined;
        detectedProductType = undefined;
        detectedCategory = isCosmeticConcept ? "Cosmetics Skincare" : "Food Snack";
      }
    }

    if (request.productManifest && Array.isArray(request.productManifest.products) && request.productManifest.products.length > 0) {
      const entry = request.productManifest.products[0];
      if (entry.canonical_name && !detectedProductType) detectedProductType = entry.canonical_name;
      if (entry.traits?.packaging && !detectedCategory) detectedCategory = entry.traits.packaging;
      if (entry.compact_identity_lock) locks.push(entry.compact_identity_lock);
      if (Array.isArray(request.productManifest.compact_identity_locks)) {
        locks.push(...request.productManifest.compact_identity_locks);
      }
    }

    if (request.referenceManifest) {
      if (Array.isArray(request.referenceManifest.identity_rules)) {
        request.referenceManifest.identity_rules.forEach((r) => {
          if (r.instruction) rules.push(r.instruction);
        });
      }
    }

    const referenceAvailable = Boolean(
      detectedBrand ||
      detectedCategory ||
      detectedProductType ||
      locks.length > 0 ||
      rules.length > 0
    );

    return {
      referenceAvailable,
      detectedCategory,
      detectedBrand,
      detectedProductType,
      identityLocks: Array.from(new Set(locks)),
      preservationRules: Array.from(new Set(rules)),
    };
  }

  /**
   * Expands a simple user concept into a professional commercial advertising concept,
   * automatically integrating product identity context when reference images exist.
   */
  public async professionalize(
    request: ConceptProfessionalizationRequest
  ): Promise<ConceptProfessionalizationResult> {
    const rawConcept = request.userConcept ? request.userConcept.trim() : "";

    // Empty input returns immediately without calling LLM
    if (!rawConcept) {
      return {
        originalConcept: "",
        professionalConcept: "",
        wasOptimized: false,
      };
    }

    const identityContext = this.buildIdentityContext(request);

    try {
      const identityRulesSection = identityContext.referenceAvailable
        ? `CRITICAL PRODUCT IDENTITY PRESERVATION RULES:\n` +
          `The uploaded product reference image is the absolute source of truth.\n` +
          `The product must remain unchanged.\n\n` +
          `Preserve:\n` +
          `- product silhouette\n` +
          `- packaging shape\n` +
          `- logo\n` +
          `- brand marks\n` +
          `- label layout\n` +
          `- colors\n` +
          `- physical proportions\n` +
          `${identityContext.detectedBrand ? `- Detected Brand: ${identityContext.detectedBrand}\n` : ""}` +
          `${identityContext.detectedProductType ? `- Detected Product Type: ${identityContext.detectedProductType}\n` : ""}` +
          `${identityContext.identityLocks.length > 0 ? `- Identity Locks: ${identityContext.identityLocks.join("; ")}\n` : ""}` +
          `\nNever:\n` +
          `- redesign packaging\n` +
          `- replace product category\n` +
          `- invent another product\n` +
          `- create fictional brand assets\n\n` +
          `Only improve:\n` +
          `- environment\n` +
          `- lighting\n` +
          `- camera angle\n` +
          `- composition\n` +
          `- commercial atmosphere\n` +
          `- visual storytelling\n`
        : `GENERAL ADVERTISING CREATIVE DIRECTION RULES:\n` +
          `- Transform user concept into a professional commercial visual scene.\n` +
          `- Enhance visual composition, studio lighting, depth, mood, and brand elegance.\n`;

      const messages = [
        {
          role: "system" as const,
          content:
            `You are a Senior Commercial Advertising Creative Director.\n` +
            `Your task is to transform a simple user advertising idea into a professional commercial advertising concept.\n\n` +
            identityRulesSection +
            `\nREQUIREMENTS:\n` +
            `- Do NOT use technical AI prompt jargon (such as "35mm", "unreal engine", "8k", "octane render").\n` +
            `- Do NOT write intros, commentary, or markdown formatting.\n` +
            `- Output MUST be a single cohesive text paragraph under 1000 characters.`,
        },
        {
          role: "user" as const,
          content:
            `User Idea: "${rawConcept}"\n` +
            `Format Type: "${request.outputType || "poster"}"\n` +
            `${identityContext.referenceAvailable ? `Detected Product Hero: "${[identityContext.detectedBrand, identityContext.detectedProductType, identityContext.detectedCategory].filter(Boolean).join(" - ") || "Uploaded Product Reference"}"\n` : ""}` +
            `\nDevelop this idea into a professional commercial advertising concept that highlights the product hero in a stunning environment. Respond in the same language as the user idea (Vietnamese if Vietnamese, English if English).`,
        },
      ];

      const rawResponse = await this.llmProvider.generateChatCompletion(
        messages,
        "concept_professionalizer",
        { temperature: 0.7, max_tokens: 400 }
      );

      // Clean up response: remove quotes, markdown headers, and trim
      let cleaned = (rawResponse || "")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/^[#*-\s]+/g, "")
        .trim();

      if (cleaned.length > 1000) {
        cleaned = cleaned.substring(0, 997) + "...";
      }

      const finalOutput = cleaned || rawConcept;
      const wasOptimized = finalOutput !== rawConcept;

      // Telemetry log (No concept content logged as per safety requirement)
      console.log("[CONCEPT_PROFESSIONALIZER]", {
        used: true,
        inputLength: rawConcept.length,
        outputLength: finalOutput.length,
        referenceAvailable: identityContext.referenceAvailable,
      });

      return {
        originalConcept: rawConcept,
        professionalConcept: finalOutput,
        wasOptimized,
      };
    } catch (err: any) {
      console.warn(`[ConceptProfessionalizerService] Falling back to original concept due to error: ${err?.message}`);

      // Silent fallback on LLM failure
      return {
        originalConcept: rawConcept,
        professionalConcept: rawConcept,
        wasOptimized: false,
      };
    }
  }
}
