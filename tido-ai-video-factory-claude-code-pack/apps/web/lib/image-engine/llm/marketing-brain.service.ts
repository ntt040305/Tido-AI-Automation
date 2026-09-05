import { defaultLLMProviderService, LLMChatMessage, LLMProviderService } from "./llm-provider.service";
import { MarketingBrainInput, MarketingBrainStrategy } from "./prompt-strategy.schema";

export class MarketingBrainService {
  private llmProvider: LLMProviderService;

  constructor(provider?: LLMProviderService) {
    this.llmProvider = provider || defaultLLMProviderService;
  }

  public async generateStrategy(input: MarketingBrainInput): Promise<MarketingBrainStrategy> {
    const startTime = Date.now();

    const systemPrompt = `You are a Senior Commercial Creative Director. You do NOT write image prompts. You decide what a campaign should say and what that means visually, and you reason in this order:

  BUSINESS GOAL → CONSUMER INSIGHT → EMOTIONAL RESPONSE → CREATIVE MESSAGE → VISUAL TRANSLATION

The step most people skip is the insight. Restating the product category is not an insight.

  Weak:   "Luxury anti-aging skincare" → "a luxury woman holding a serum bottle"
  Strong: women buying anti-aging products are buying confidence and continuity with
          who they already are, not a younger face → feeling: trust, poise,
          self-possession → message: this is care, not correction → visually: a
          mature subject treated with dignity, calm premium air, soft directional
          light, refined material rendering, minimal uncluttered composition.

Translate the message into visual decisions. Do not name lenses, focal lengths,
apertures or lighting rigs — a separate art-direction layer owns those, and a
technical instruction from you would compete with the client's own directives.

STRICT JSON OUTPUT REQUIREMENT:
Return ONLY a valid JSON object matching this structure:
{
  "creative_angle": "<one sentence: the commercial positioning angle>",
  "consumer_insight": "<the non-obvious truth about what this buyer actually wants. Never restate the product category.>",
  "emotional_response": "<two or three words: what the viewer should feel>",
  "creative_message": "<one sentence: the single thing this image says>",
  "visual_translation": {
    "subject_representation": "<who or what is depicted, and why that choice serves the insight>",
    "atmosphere": "<the emotional temperature of the frame>",
    "lighting_character": "<quality and behaviour of light in plain words, e.g. 'soft directional light that keeps skin texture honest'>",
    "material_treatment": "<how surfaces and materials should read>",
    "composition_principle": "<the organising idea of the layout, not coordinates>",
    "colour_direction": "<palette direction and what it signals>"
  },
  "commercial_goal": "<commercial objective and conversion hook>",
  "target_customer_psychology": "<buyer profile, psychological hooks, value triggers>",
  "composition_strategy": "<hero placement and visual hierarchy in one sentence>",
  "prompt_guidance": "<the visual translation condensed to one or two sentences>",
  "compression_notes": "<short note for budget optimisation>"
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

    // Unspecified fields are omitted, not defaulted. Feeding the brain a generic
    // audience and goal it was never given produced generic strategy that read as
    // if the client had asked for it.
    const briefLines = [
      `- CONCEPT: ${input.concept}`,
      `- FORMAT / USE CASE: ${input.useCase || "Poster"}`,
      `- ASPECT RATIO: ${input.aspectRatio || "1:1"}`,
      input.brandName ? `- BRAND NAME: ${input.brandName}` : "",
      input.brandInfo ? `- BRAND INFO: ${input.brandInfo}` : "",
      input.productName ? `- PRODUCT: ${input.productName}` : "",
      input.targetAudience ? `- TARGET AUDIENCE: ${input.targetAudience}` : "",
      input.marketingGoal ? `- MARKETING GOAL: ${input.marketingGoal}` : "",
      `- COMPOSITION MODE: ${input.productCompositionMode || "single"}`,
      `- IDENTITY STRENGTH: ${input.productIdentityStrength || "strict"}`,
      input.copyItems && input.copyItems.length > 0
        ? `- AUTHORIZED COPY ITEMS: ${JSON.stringify(input.copyItems)}`
        : "",
    ].filter(Boolean);

    const userPrompt = `
CREATIVE BRIEF:
${briefLines.join("\n")}
${productContext}

The brief may be written in Vietnamese, English, or a mix; read it in its original
language and answer in English. Where the brief is silent about audience or
objective, infer them from the concept and the product rather than assuming a
generic premium shopper. Never contradict an explicit instruction in the concept.

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

      if (parsed.creative_angle && (parsed.visual_strategy || parsed.prompt_guidance || parsed.visual_translation)) {
        // A model that returns the bridge but skips visual_strategy is still a good
        // answer; synthesise the legacy summary field from the translation so older
        // consumers keep working.
        if (!parsed.visual_strategy && parsed.visual_translation) {
          const vt = parsed.visual_translation;
          parsed.visual_strategy = [vt.atmosphere, vt.lighting_character, vt.material_treatment]
            .filter(Boolean)
            .join(" ");
        }
        if (!parsed.composition_strategy && parsed.visual_translation?.composition_principle) {
          parsed.composition_strategy = parsed.visual_translation.composition_principle;
        }

        // Populate backward compatibility fields for legacy prompt compiler consumers
        parsed.target_audience = parsed.target_customer_psychology || input.targetAudience;
        parsed.visual_direction = parsed.visual_strategy;
        parsed.composition = parsed.composition_strategy;
        parsed.master_prompt = parsed.prompt_guidance || parsed.visual_strategy;
        // camera_direction and lighting are deliberately NOT set here.
        //
        // They used to be assigned two fixed strings — "85mm prime lens, eye-level
        // product hero angle" and "3-point commercial studio lighting" — on every
        // response, regardless of what the model actually reasoned. Those constants
        // now feed ArtDirectionResolverService as tier-3 candidates, where they
        // would outrank retrieved professional knowledge with a value nobody chose.
        // The strategy's real photographic thinking lives in visual_strategy.
        parsed.negative_prompt = "distorted anatomy, blurry, low resolution, bad quality, clutter, fake text";

        console.log("[MARKETING_BRAIN]", {
          model: this.llmProvider.getModelName(),
          duration_ms: Date.now() - startTime,
          angle: parsed.creative_angle,
          insight: parsed.consumer_insight,
          emotion: parsed.emotional_response,
          message: parsed.creative_message,
          has_visual_translation: Boolean(parsed.visual_translation),
        });
        return parsed;
      }
      throw new Error("Invalid schema structure in LLM JSON response.");
    } catch (err: any) {
      console.warn(`[MarketingBrainService] LLM call failed (${err.message || err.code}). Using fallback strategy.`);
      return this.createFallbackStrategy(input);
    }
  }

  /**
   * Used only when the LLM is unreachable. It deliberately asserts as little as
   * possible: an offline fallback must not invent a camera rig, a lighting setup
   * or an audience, because downstream those become tier-3 art direction that
   * outranks real retrieved knowledge. Staying quiet lets the lower tiers speak.
   */
  public createFallbackStrategy(input: MarketingBrainInput): MarketingBrainStrategy {
    const concept = (input.concept || "").trim();
    const format = input.useCase || "Poster";
    const creativeAngle = input.brandName
      ? `${input.brandName} ${format.toLowerCase()} built directly from the client concept`
      : `${format} built directly from the client concept`;

    return {
      creative_angle: creativeAngle,
      visual_strategy: "",
      commercial_goal: input.marketingGoal || "",
      target_customer_psychology: input.targetAudience || "",
      composition_strategy: "",
      prompt_guidance: concept,
      compression_notes: "Offline fallback: strategy reasoning unavailable, concept passed through unchanged.",
      // Backward compatibility fields
      target_audience: input.targetAudience || "",
      visual_direction: "",
      composition: "",
      negative_prompt: "distorted, blurry, low resolution, bad anatomy, text overlap, ugly, watermarks, bad quality",
      master_prompt: concept,
    };
  }
}

export const defaultMarketingBrainService = new MarketingBrainService();
