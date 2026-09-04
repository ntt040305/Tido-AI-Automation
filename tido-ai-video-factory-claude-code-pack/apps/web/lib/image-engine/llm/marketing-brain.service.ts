import { defaultLLMProviderService, LLMChatMessage, LLMProviderService } from "./llm-provider.service";
import { MarketingBrainInput, MarketingBrainStrategy } from "./prompt-strategy.schema";

export class MarketingBrainService {
  private llmProvider: LLMProviderService;

  constructor(provider?: LLMProviderService) {
    this.llmProvider = provider || defaultLLMProviderService;
  }

  public async generateStrategy(input: MarketingBrainInput): Promise<MarketingBrainStrategy> {
    const startTime = Date.now();

    const systemPrompt = `You are a Senior AI Commercial Creative Director and Advertising Strategist for TIDO Creative OS.
Your task is to analyze the product concept, brand guidelines, reference constraints, and product identity rules to generate a structured commercial creative strategy JSON object.

STRICT JSON OUTPUT REQUIREMENT:
Return ONLY a valid JSON object matching the following structure:
{
  "creative_angle": "<Concise 1-sentence commercial creative positioning angle>",
  "visual_strategy": "<High-converting art direction, camera focal length, studio lighting, surface reflections, and atmosphere>",
  "commercial_goal": "<Commercial objective and conversion hook alignment>",
  "target_customer_psychology": "<Target customer profile, psychological hooks, and value triggers>",
  "composition_strategy": "<Product arrangement, hero placement, visual hierarchy, and ratio balance>",
  "prompt_guidance": "<Direct visual instructions for master prompt compilation>",
  "compression_notes": "<Brief strategy summary notes for prompt budget optimization>"
}`;

    // Build context with Product Manifest, Identity Control Metadata, and Creative Brief
    let productContext = "";
    if (input.productManifest) {
      const pm = input.productManifest;
      productContext += `\n[PRODUCT MANIFEST]\n- Target Count: ${pm.validation.target_count_requested} (Detected: ${pm.validation.detected_product_count})\n- Relationship Type: ${pm.relationship_type}\n- Identity Locks:\n  * ${pm.compact_identity_locks.join("\n  * ")}`;
    }

    if (input.identityControlMetadata) {
      productContext += `\n[IDENTITY CONTROL METADATA]\n- Directive: ${input.identityControlMetadata.compact_directive}\n- Confidence: ${input.identityControlMetadata.identity_confidence_score}`;
    }

    const userPrompt = `
CREATIVE BRIEF:
- CONCEPT: ${input.concept}
- FORMAT / USE CASE: ${input.useCase || "Poster"}
- ASPECT RATIO: ${input.aspectRatio || "9:16"}
- BRAND NAME: ${input.brandName || "Commercial Brand"}
- BRAND INFO: ${input.brandInfo || "High quality commercial brand"}
- TARGET AUDIENCE: ${input.targetAudience || "Modern consumers seeking premium quality"}
- MARKETING GOAL: ${input.marketingGoal || "Conversion & Brand Perception"}
- COMPOSITION MODE: ${input.productCompositionMode || "single"}
- IDENTITY STRENGTH: ${input.productIdentityStrength || "strict"}
${input.copyItems && input.copyItems.length > 0 ? `- AUTHORIZED COPY ITEMS: ${JSON.stringify(input.copyItems)}` : ""}
${productContext}

Generate the complete structured JSON commercial strategy now.`;

    const messages: LLMChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    try {
      const responseText = await this.llmProvider.generateChatCompletion(messages, "marketing_brain");
      
      let parsed: MarketingBrainStrategy;
      try {
        parsed = JSON.parse(responseText) as MarketingBrainStrategy;
      } catch (jsonErr) {
        // Strip markdown code fences if LLM wrapped json in ```json ... ```
        const cleaned = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned) as MarketingBrainStrategy;
      }

      if (parsed.creative_angle && (parsed.visual_strategy || parsed.prompt_guidance)) {
        // Populate backward compatibility fields for legacy prompt compiler consumers
        parsed.target_audience = parsed.target_customer_psychology || input.targetAudience;
        parsed.visual_direction = parsed.visual_strategy;
        parsed.composition = parsed.composition_strategy;
        parsed.master_prompt = parsed.prompt_guidance || parsed.visual_strategy;
        parsed.camera_direction = "85mm prime lens, eye-level product hero angle, soft shallow depth of field";
        parsed.lighting = "3-point commercial studio lighting with soft key and crisp rim highlight";
        parsed.negative_prompt = "distorted anatomy, blurry, low resolution, bad quality, clutter, fake text";

        console.log(`[MarketingBrainService] Strategy generated via ${this.llmProvider.getModelName()} in ${Date.now() - startTime}ms! Angle: "${parsed.creative_angle}"`);
        return parsed;
      }
      throw new Error("Invalid schema structure in LLM JSON response.");
    } catch (err: any) {
      console.warn(`[MarketingBrainService] LLM call failed (${err.message || err.code}). Using fallback strategy.`);
      return this.createFallbackStrategy(input);
    }
  }

  public createFallbackStrategy(input: MarketingBrainInput): MarketingBrainStrategy {
    const concept = input.concept || "Commercial Product Visual";
    const brand = input.brandName || "Commercial Brand";
    const format = input.useCase || "Poster";

    const creativeAngle = input.brandName
      ? `${brand} ${format} - Premium Commercial Positioning`
      : `${concept} - ${format} Commercial Visual`;
    const visualStrategy = `High-end commercial advertising visual for ${concept}. 85mm prime lens, eye-level product hero angle, 3-point studio lighting with soft key and crisp rim highlights. Warm natural tones and reflections.`;
    const compositionStrategy = `Hero product placement following the golden ratio with top visual space preserved for typography.`;
    const guidance = `Commercial photography of ${brand !== "Commercial Brand" ? brand + " " : ""}${concept}. Studio lighting, refractive surface details, sharp focal clarity.`;

    return {
      creative_angle: creativeAngle,
      visual_strategy: visualStrategy,
      commercial_goal: input.marketingGoal || "Brand Perception & Conversion",
      target_customer_psychology: input.targetAudience || "Modern consumers seeking quality and luxury aesthetics.",
      composition_strategy: compositionStrategy,
      prompt_guidance: guidance,
      compression_notes: "Fallback strategy generated.",
      // Backward compatibility fields
      target_audience: input.targetAudience || "Modern consumers seeking quality and luxury aesthetics.",
      visual_direction: visualStrategy,
      camera_direction: "85mm prime lens, eye-level hero angle",
      lighting: "3-point commercial studio lighting",
      composition: compositionStrategy,
      negative_prompt: "distorted, blurry, low resolution, bad anatomy, text overlap, ugly, watermarks, bad quality",
      master_prompt: guidance,
    };
  }
}

export const defaultMarketingBrainService = new MarketingBrainService();
