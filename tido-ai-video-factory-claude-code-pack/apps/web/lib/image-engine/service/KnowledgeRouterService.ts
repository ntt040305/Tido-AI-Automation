import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { RoutingRuntimeSchemaAdapter } from "../schema/RoutingRuntimeSchemaAdapter";
import { RoutingValidator } from "../validation/RoutingValidator";
import { ReferenceIntelligenceService } from "./ReferenceIntelligenceService";
import {
  RouterInput,
  RouterResult,
  RoutingResultSchema,
} from "../types";

export function isReferenceImageRequired(useCase?: string): boolean {
  if (!useCase) return false;
  const normalized = useCase.toLowerCase().replace(/[\s_-]+/g, "_");
  return (
    normalized.includes("product_hero") ||
    normalized.includes("packaging") ||
    normalized.includes("product_lifestyle")
  );
}

export class KnowledgeRouterService {
  private promptPath: string;

  constructor(promptPath: string = IMAGE_ENGINE_CONFIG.KNOWLEDGE_ROUTER_V1_PATH) {
    this.promptPath = promptPath;
  }

  /**
   * Main entry point: Analyze product reference images + contextual brief
   * Server-side only!
   */
  async analyzeProductReferences(input: RouterInput): Promise<RouterResult> {
    const startTime = Date.now();
    const requestId = `req_router_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Validate input images based on creative_type / useCase requirement
    const refRequired = isReferenceImageRequired(input.useCase);

    if (!input.images || !Array.isArray(input.images) || input.images.length === 0) {
      if (refRequired) {
        return {
          success: false,
          error: {
            code: "MISSING_IMAGE",
            message: `At least one product reference image is required for '${input.useCase || "Product Hero"}' creative types.`,
          },
        };
      }

      // Allow text/concept based visual generation (Reference images optional for Poster, Banner, Social Ads, Thumbnails, etc.)
      const textRouting = createDevFallbackRouting(input, ["CONCEPT_REF_01"]);
      return {
        success: true,
        routing: textRouting,
        meta: {
          model: "concept-text-router",
          durationMs: Date.now() - startTime,
          requestId,
          imageCount: 0,
        },
      };
    }

    // 2. API Key check
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === "" || apiKey.includes("xxxxxxxx")) {
      console.warn("[KnowledgeRouterService] GEMINI_API_KEY missing or mock fallback active. Using dev fallback routing.");
      const fallbackRouting = createDevFallbackRouting(input, input.images.map((_, i) => `REF_${String(i + 1).padStart(2, "0")}`));
      return {
        success: true,
        routing: fallbackRouting,
        meta: {
          model: "dev-fallback",
          durationMs: Date.now() - startTime,
          requestId,
          imageCount: input.images.length,
        },
      };
    }

    if (input.images.length > IMAGE_ENGINE_CONFIG.MAX_IMAGE_COUNT) {
      return {
        success: false,
        error: {
          code: "INVALID_IMAGE_INPUT",
          message: `Maximum allowed reference images is ${IMAGE_ENGINE_CONFIG.MAX_IMAGE_COUNT} (received ${input.images.length}).`,
        },
      };
    }

    const expectedRefIds: string[] = [];
    const imageParts: { inlineData: { data: string; mimeType: string } }[] = [];

    for (let i = 0; i < input.images.length; i++) {
      const img = input.images[i];
      const refId = `REF_${String(i + 1).padStart(2, "0")}`;
      expectedRefIds.push(refId);

      if (!IMAGE_ENGINE_CONFIG.ALLOWED_IMAGE_TYPES.includes(img.mimeType.toLowerCase())) {
        return {
          success: false,
          error: {
            code: "INVALID_IMAGE_INPUT",
            message: `Unsupported MIME type '${img.mimeType}' for ${refId}. Allowed: JPEG, PNG, WEBP.`,
          },
        };
      }

      if (img.buffer.length > IMAGE_ENGINE_CONFIG.MAX_IMAGE_SIZE_BYTES) {
        return {
          success: false,
          error: {
            code: "INVALID_IMAGE_INPUT",
            message: `Image ${refId} exceeds maximum size limit of 10MB.`,
          },
        };
      }

      imageParts.push({
        inlineData: {
          data: img.buffer.toString("base64"),
          mimeType: img.mimeType,
        },
      });
    }

    // 3. Load System Router Prompt
    if (!fs.existsSync(this.promptPath)) {
      return {
        success: false,
        error: {
          code: "MISSING_ROUTER_PROMPT",
          message: `Knowledge Router Prompt file missing at '${this.promptPath}'`,
        },
      };
    }

    const routerPromptBase = fs.readFileSync(this.promptPath, "utf-8");

    // 4. Construct Structured Input Text
    const formattedContext = this.buildRouterContextText(input, expectedRefIds);
    const fullSystemPrompt = `${routerPromptBase}\n\n${formattedContext}`;

    // 5. Initialize official @google/genai SDK client
    let ai: GoogleGenAI;
    try {
      ai = new GoogleGenAI({ apiKey });
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: "CONFIG_ERROR",
          message: `Failed to initialize @google/genai SDK client: ${err.message}`,
        },
      };
    }

    const responseSchema = RoutingRuntimeSchemaAdapter.getGeminiResponseSchema();

    // 6. Call Gemini 3.6 Flash model with Retry Policy & Timeout Protection (12s ceiling)
    let attempts = 0;
    let lastError: any = null;
    let rawTextResponse = "";

    while (attempts <= IMAGE_ENGINE_CONFIG.ROUTER_MAX_RETRIES) {
      attempts++;
      try {
        const timeoutMs = 12000;
        let timeoutId: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`KnowledgeRouter Gemini call timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        const responsePromise = ai.models.generateContent({
          model: IMAGE_ENGINE_CONFIG.GEMINI_MODEL,
          contents: [fullSystemPrompt, ...imageParts],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema as any,
          },
        });

        const response = (await Promise.race([responsePromise, timeoutPromise])) as any;
        clearTimeout(timeoutId);

        rawTextResponse = response.text || "";
        if (rawTextResponse && rawTextResponse.trim().length > 0) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[KnowledgeRouterService] Request ${requestId} attempt ${attempts} failed: ${err.message || String(err)}`);
        if (attempts > IMAGE_ENGINE_CONFIG.ROUTER_MAX_RETRIES) {
          break;
        }
      }
    }

    if (!rawTextResponse) {
      const errMsg = lastError ? (lastError.message || String(lastError)) : "Empty response from Gemini Router model.";
      console.warn(`[KnowledgeRouterService] Gemini Router API unavailable (${errMsg}). Returning non-blocking fallback routing.`);

      const fallbackRouting = createDevFallbackRouting(input, expectedRefIds);
      fallbackRouting.retrieval_status = "fallback";
      fallbackRouting.error_reason = errMsg;
      fallbackRouting.knowledge_cards = [];

      return {
        success: true,
        routing: fallbackRouting,
        meta: {
          model: "dev-fallback",
          durationMs: Date.now() - startTime,
          requestId,
          imageCount: input.images.length,
        },
      };
    }

    // 7. Parse and Validate Response
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(rawTextResponse);
    } catch (err: any) {
      console.warn(`[KnowledgeRouterService] Failed to parse Gemini response as JSON: ${err.message}. Using fallback routing.`);
      const fallbackRouting = createDevFallbackRouting(input, expectedRefIds);
      fallbackRouting.retrieval_status = "fallback";
      fallbackRouting.error_reason = `JSON parse failed: ${err.message}`;
      fallbackRouting.knowledge_cards = [];

      return {
        success: true,
        routing: fallbackRouting,
        meta: {
          model: "dev-fallback",
          durationMs: Date.now() - startTime,
          requestId,
          imageCount: input.images.length,
        },
      };
    }

    const validation = RoutingValidator.validate(parsedJson, expectedRefIds);
    if (!validation.isValid || !validation.routing) {
      console.warn(`[KnowledgeRouterService] Schema validation failed: ${validation.errors?.join("; ")}. Using fallback routing.`);
      const fallbackRouting = createDevFallbackRouting(input, expectedRefIds);
      fallbackRouting.retrieval_status = "fallback";
      fallbackRouting.error_reason = `Validation failed: ${validation.errors?.join("; ")}`;
      fallbackRouting.knowledge_cards = [];

      return {
        success: true,
        routing: fallbackRouting,
        meta: {
          model: "dev-fallback",
          durationMs: Date.now() - startTime,
          requestId,
          imageCount: input.images.length,
        },
      };
    }

    const durationMs = Date.now() - startTime;
    const validatedRouting: RoutingResultSchema = validation.routing;

    // Attach Phase 2.2 Reference Manifest
    const refIntel = new ReferenceIntelligenceService();
    validatedRouting.reference_manifest = refIntel.generateManifest(validatedRouting);

    // Structured Observability Logging
    console.log(
      JSON.stringify({
        event: "ROUTER_ANALYSIS_SUCCESS",
        requestId,
        model: IMAGE_ENGINE_CONFIG.GEMINI_MODEL,
        durationMs,
        imageCount: input.images.length,
        imageMimeTypes: input.images.map((i) => i.mimeType),
        routingMode: validatedRouting.routing_mode,
        detectedProductsCount: validatedRouting.products?.length || 0,
        relationshipType: validatedRouting.reference_manifest.relationship_type,
      })
    );

    return {
      success: true,
      routing: validatedRouting,
      meta: {
        model: IMAGE_ENGINE_CONFIG.GEMINI_MODEL,
        durationMs,
        requestId,
        imageCount: input.images.length,
      },
    };
  }

  /**
   * Helper: Format context & brief data for Gemini prompt
   */
  private buildRouterContextText(input: RouterInput, refIds: string[]): string {
    const lines: string[] = [];

    lines.push("=== REFERENCE MAP ===");
    for (let i = 0; i < refIds.length; i++) {
      const filename = input.images[i]?.filename || `Image_${i + 1}`;
      lines.push(`${refIds[i]}: Product Reference Image ${i + 1} (${filename}, ${input.images[i].mimeType})`);
    }
    lines.push("");

    lines.push("=== CONTEXTUAL USER INPUT ===");
    if (input.concept) lines.push(`User Creative Concept: "${input.concept}"`);
    if (input.brief) lines.push(`User Creative Brief: "${input.brief}"`);
    if (input.brandName) lines.push(`Brand Name: "${input.brandName}"`);
    if (input.brandInfo) lines.push(`Brand Background: "${input.brandInfo}"`);
    if (input.productCount) lines.push(`Expected Product Count: ${input.productCount}`);
    if (input.useCase) lines.push(`Target Use Case: "${input.useCase}"`);
    if (input.aspectRatio) lines.push(`Target Aspect Ratio: "${input.aspectRatio}"`);

    if (input.copyItems && input.copyItems.length > 0) {
      lines.push(`Exact Copy Elements: ${JSON.stringify(input.copyItems)}`);
    }

    if (input.hardRequirements && input.hardRequirements.length > 0) {
      lines.push(`User Hard Constraints: ${JSON.stringify(input.hardRequirements)}`);
    }

    lines.push("");
    lines.push("Analyze the reference image(s) above in accordance with REFERENCE MAP and USER INPUT context.");
    lines.push("Return structured JSON conforming to routing_schema_v1.json (including structured_input_intent and asset_roles when user concept/inputs are provided).");

    return lines.join("\n");
  }
}

// Singleton export
export const defaultKnowledgeRouterService = new KnowledgeRouterService();

function createDevFallbackRouting(input: RouterInput, refIds: string[]): RoutingResultSchema {
  const conceptOrBriefText = input.concept || input.brief || "Commercial Product Visual";
  const brand = input.brandName || "Commercial Brand";

  const assetRoles = refIds.map((refId) => ({
    reference_id: refId,
    role: "PRODUCT" as const,
    confidence: 0.95,
    evidence: `Fallback assumption for ${refId}`,
  }));

  const structuredIntent = {
    core_creative_intent: conceptOrBriefText,
    global_visual_language: "commercial",
    extracted_copy_items: (input.copyItems || []).map((text) => ({
      role: "GENERAL" as const,
      text: typeof text === "string" ? text : (text as any).text || String(text),
      confidence: 1.0,
      evidence: "User provided copy item",
    })),
    generated_copy_allowed: false,
    brand_mentions: input.brandName ? [input.brandName] : [],
    explicit_hard_requirements: input.hardRequirements || [],
    local_attributes: [],
    creative_freedom_level: "BALANCED" as const,
    asset_roles: assetRoles,
  };

  // Fallback identity grouping obeys the same conservative policy as normal routing:
  // MERGE REQUIRES POSITIVE SAME-IDENTITY EVIDENCE.
  // Requested visible instance count (productCount) is NEVER used as evidence to group multiple references.
  const products = refIds.length <= 1
    ? [
      {
        product_id: "PRODUCT_01",
        reference_ids: refIds,
        reference_relationship_confidence: 1.0,
        summary: `${conceptOrBriefText} for brand ${brand}`,
        categories: [
          { value: "Commercial Product", confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
        ],
        industry_domains: [
          { value: "Retail & Consumer Goods", confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
        ],
        likely_functions: [
          { value: "Commercial display and packaging", confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
        ],
        materials: [
          { value: "Glass / Plastic Container", confidence: 0.9, evidence_type: "STRONG_INFERENCE" as const, evidence_summary: conceptOrBriefText }
        ],
        contents: [
          { value: conceptOrBriefText, confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
        ],
        surface_properties: [
          { value: "Transparent / Glossy", confidence: 0.85, evidence_type: "STRONG_INFERENCE" as const, evidence_summary: "Standard commercial surface" }
        ],
        geometry_traits: [
          { value: "3D Product Geometry", confidence: 0.8, evidence_type: "STRONG_INFERENCE" as const, evidence_summary: "Commercial packaging form factor" }
        ],
        packaging_types: [
          { value: "Product Container", confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
        ],
        branding_features: [
          { value: `${brand} Branding`, confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: brand }
        ],
        visual_challenges: [
          { id: "surface_refraction", description: "Complex light reflections and specular highlights on product surface.", confidence: 0.9 }
        ],
        unknowns: [],
        retrieval_queries: [
          { query: `${conceptOrBriefText} ${brand} product material specification`, importance: "PRIMARY" as const, reason: "Retrieve product definition" }
        ]
      }
    ]
    : refIds.map((refId, idx) => ({
      product_id: `PRODUCT_${String(idx + 1).padStart(2, "0")}`,
      reference_ids: [refId],
      reference_relationship_confidence: 0.5,
      summary: `${conceptOrBriefText} for brand ${brand} (Item ${idx + 1})`,
      categories: [
        { value: "Commercial Product", confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
      ],
      industry_domains: [
        { value: "Retail & Consumer Goods", confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
      ],
      likely_functions: [
        { value: "Commercial display and packaging", confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
      ],
      materials: [
        { value: "Glass / Plastic Container", confidence: 0.9, evidence_type: "STRONG_INFERENCE" as const, evidence_summary: conceptOrBriefText }
      ],
      contents: [
        { value: `${conceptOrBriefText} Variant ${idx + 1}`, confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
      ],
      surface_properties: [
        { value: "Transparent / Glossy", confidence: 0.85, evidence_type: "STRONG_INFERENCE" as const, evidence_summary: "Standard commercial surface" }
      ],
      geometry_traits: [
        { value: "3D Product Geometry", confidence: 0.8, evidence_type: "STRONG_INFERENCE" as const, evidence_summary: "Commercial packaging form factor" }
      ],
      packaging_types: [
        { value: "Product Container", confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: conceptOrBriefText }
      ],
      branding_features: [
        { value: `${brand} Branding`, confidence: 1, evidence_type: "USER_PROVIDED" as const, evidence_summary: brand }
      ],
      visual_challenges: [
        { id: "surface_refraction", description: "Complex light reflections and specular highlights on product surface.", confidence: 0.9 }
      ],
      unknowns: [],
      retrieval_queries: [
        { query: `${conceptOrBriefText} ${brand} product material specification`, importance: "PRIMARY" as const, reason: "Retrieve product definition" }
      ]
    }));

  const fallbackResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "PARTIAL_CONFIDENCE",
    requires_universal_core: true,
    products,
    global_retrieval_queries: [
      { query: `${conceptOrBriefText} commercial visual representation`, importance: "PRIMARY", reason: "Identify visual standards" }
    ],
    routing_summary: `Dev fallback routing generated for ${conceptOrBriefText}`,
    structured_input_intent: structuredIntent,
    asset_roles: assetRoles,
    retrieval_status: "fallback",
    knowledge_cards: [],
    error_reason: "Knowledge router API fallback activated",
  };

  const refIntel = new ReferenceIntelligenceService();
  fallbackResult.reference_manifest = refIntel.generateManifest(fallbackResult);

  return fallbackResult;
}
