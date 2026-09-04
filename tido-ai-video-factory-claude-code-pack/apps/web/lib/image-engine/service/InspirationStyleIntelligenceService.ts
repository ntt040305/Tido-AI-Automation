import crypto from "crypto";
import { LLMProviderService } from "../llm/llm-provider.service";
import { InspirationPromptDirective, InspirationStyleManifest } from "../types";

export interface InspirationAnalysisInput {
  imageBuffer?: Buffer;
  mimeType?: string;
  imageHash?: string;
  existingManifest?: InspirationStyleManifest;
  hintText?: string;
}

/**
 * Inspiration Style Intelligence Layer — Phase 3.6 Additive Extension
 *
 * Lightweight, optional analysis pass that extracts visual style directives from
 * uploaded inspiration reference images.
 *
 * ARCHITECTURAL SAFETY CONSTRAINTS:
 * 1. Analyzes ONLY visual style attributes (composition, camera, lighting, colorMood, environment, visualMood).
 * 2. ZERO product identity, logo, or brand packaging modifications.
 * 3. Caches and reuses existing manifest when image source hash is unchanged.
 * 4. Silent fallback on vision/LLM error: Generation continues normally with no blocking.
 * 5. No database migration required (in-memory / payload state).
 */
export class InspirationStyleIntelligenceService {
  private llmProvider: LLMProviderService;

  constructor(llmProvider?: LLMProviderService) {
    this.llmProvider = llmProvider || new LLMProviderService();
  }

  /**
   * Generates a deterministic SHA-256 hash for an image buffer.
   */
  public calculateImageHash(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  }

  /**
   * Analyzes an inspiration image and extracts a structured InspirationStyleManifest.
   * Reuses existingManifest if valid and source_hash matches.
   */
  public async analyzeStyle(input: InspirationAnalysisInput): Promise<InspirationStyleManifest> {
    const hash = input.imageHash || (input.imageBuffer ? this.calculateImageHash(input.imageBuffer) : undefined);

    // Rule 2 Check: Reuse existing manifest if provided and valid
    if (input.existingManifest && input.existingManifest.composition) {
      if (!hash || input.existingManifest.source_hash === hash) {
        console.log(`[InspirationStyleIntelligence] Reusing cached inspiration style manifest (hash: ${hash || "existing"}). Skipping Vision analysis.`);
        return input.existingManifest;
      }
    }

    // Default Heuristic Fallback Manifest
    const defaultFallback: InspirationStyleManifest = {
      composition: "Balanced commercial hero positioning with clean subject clearance.",
      camera: "Eye-level 50mm studio prime lens perspective with sharp optical clarity.",
      lighting: "High-end commercial 3-point softbox studio lighting with subtle rim separation.",
      colorMood: "Harmonious commercial tone with vivid palette and balanced contrast.",
      environment: "Clean high-key studio setting with uncluttered background texture.",
      visualMood: "Premium, polished commercial advertisement atmosphere.",
      analyzed_at: new Date().toISOString(),
      source_hash: hash || "fallback",
      derived_from_image: false,
    };

    // If no buffer and no hint, return default fallback cleanly
    if (!input.imageBuffer && !input.hintText) {
      return defaultFallback;
    }

    try {
      // Attempt Vision / LLM analysis pass if LLM is configured
      if (!this.llmProvider.isConfigured()) {
        return defaultFallback;
      }

      const promptText = `ANALYZE THE VISUAL STYLE OF THE ATTACHED INSPIRATION IMAGE (FOR STYLE TRANSFER ONLY).
DO NOT ANALYZE PRODUCT IDENTITY, LOGO, BRANDING, OR PACKAGING.

Your description will be handed to an image generator that will NEVER see this image. It
must be able to recreate this exact photographic treatment for a COMPLETELY DIFFERENT
product using your words alone. Be concrete and specific: name the actual colours, the
direction and quality of the light, the background gradient, the surface the subject sits
on, the props and their arrangement, the depth of field, and the camera height.

NEVER name, describe, or reference the product, bottle, package, brand or label that
appears in this image. Describe only the photographic world around it.

Work like a photographer writing a shot sheet so the exact setup can be rebuilt in a
studio. Every field must be specific and actionable. Never answer "standard", "typical"
or "commercial" on its own; state what you actually observe.

Return a JSON object with exactly these keys:
{
  "composition": "Overall spatial layout, focal placement and subject balance",
  "camera": "One-line summary of the camera treatment",
  "lighting": "One-line summary of the lighting treatment",
  "colorMood": "One-line summary of palette and tone",
  "environment": "One-line summary of the set and backdrop",
  "visualMood": "Overall emotional atmosphere",

  "cameraAngle": "Camera height relative to the subject and any tilt, e.g. 'just below the product mid-line, level, no tilt'",
  "focalLength": "Apparent lens and perspective character, e.g. '85mm, mild compression, straight verticals'",
  "depthOfField": "Aperture feel, where the focus plane sits, how quickly it falls off",
  "cameraDistance": "How close the camera is and what fraction of the frame height the subject occupies",

  "keyLight": "Key light direction (clock position), height, and quality (hard/soft, size of source)",
  "fillAndShadow": "Fill ratio, shadow direction, hardness and density, contrast level",
  "rimAndHighlights": "Rim/back light presence and how speculars behave on glass, liquid and metal",
  "lightColorTemperature": "Warm or cool, approximate Kelvin, and any mixed or gelled sources",

  "subjectPlacement": "Exactly where the subject sits in frame and its scale",
  "depthLayering": "What occupies foreground, midground and background",
  "negativeSpace": "Any deliberate empty area reserved for headline or logo, and where",

  "colorPalette": "Dominant colours with concrete names or hex values, and their proportions",
  "colorGrading": "Saturation level, contrast curve, highlight and shadow tinting",

  "propStyling": "Every prop present, roughly how many, and how they are arranged around the subject",
  "surfaceAndSet": "The surface the subject stands on, its material, wetness and reflectivity",
  "backgroundTreatment": "Backdrop type, gradient direction and colours, vignette and falloff",
  "motionAndEffects": "Splashes, droplets, floating or suspended elements, smoke, and any motion cues",

  "finishing": "Sharpness, glow or bloom, grain, and other post-processing character",
  "photographicStyle": "The commercial genre and era this photography belongs to"
}

Optional hint/context provided by user: "${input.hintText || "Commercial reference photo"}"

Respond ONLY with a valid JSON object matching the schema above.`;

      // The inspiration image itself must be sent, otherwise this pass invents style
      // attributes from the concept text and describes a photograph it never saw.
      const userContent = input.imageBuffer
        ? ([
          { type: "text", text: promptText },
          {
            type: "image_url",
            image_url: {
              url: `data:${input.mimeType || "image/jpeg"};base64,${input.imageBuffer.toString("base64")}`,
              detail: "high",
            },
          },
        ] as const)
        : promptText;

      const responseText = await this.llmProvider.generateChatCompletion(
        [
          {
            role: "system",
            content: "You are a Senior Commercial Photographer and Art Director. Extract purely photographic and visual style attributes from inspiration reference images.",
          },
          {
            role: "user",
            content: userContent as any,
          },
        ],
        "inspiration_style_analysis",
        // The shot sheet is ~25 fields of prose. Without headroom the JSON is cut off
        // mid-object and the whole analysis falls back to generic studio defaults.
        { max_tokens: 2600, temperature: 0.3, timeoutMs: 60000 }
      );

      // Parse JSON payload from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          composition: parsed.composition || defaultFallback.composition,
          camera: parsed.camera || defaultFallback.camera,
          lighting: parsed.lighting || defaultFallback.lighting,
          colorMood: parsed.colorMood || defaultFallback.colorMood,
          environment: parsed.environment || defaultFallback.environment,
          visualMood: parsed.visualMood || defaultFallback.visualMood,
          analyzed_at: new Date().toISOString(),
          source_hash: hash || "analyzed",
          // Only trustworthy as a style directive when the image was actually sent.
          derived_from_image: Boolean(input.imageBuffer),

          // Deep fields pass through only when the model actually returned them, so a
          // partial response degrades to the six-field summary instead of emitting
          // empty headings into the prompt.
          cameraAngle: parsed.cameraAngle || undefined,
          focalLength: parsed.focalLength || undefined,
          depthOfField: parsed.depthOfField || undefined,
          cameraDistance: parsed.cameraDistance || undefined,
          keyLight: parsed.keyLight || undefined,
          fillAndShadow: parsed.fillAndShadow || undefined,
          rimAndHighlights: parsed.rimAndHighlights || undefined,
          lightColorTemperature: parsed.lightColorTemperature || undefined,
          subjectPlacement: parsed.subjectPlacement || undefined,
          depthLayering: parsed.depthLayering || undefined,
          negativeSpace: parsed.negativeSpace || undefined,
          colorPalette: parsed.colorPalette || undefined,
          colorGrading: parsed.colorGrading || undefined,
          propStyling: parsed.propStyling || undefined,
          surfaceAndSet: parsed.surfaceAndSet || undefined,
          backgroundTreatment: parsed.backgroundTreatment || undefined,
          motionAndEffects: parsed.motionAndEffects || undefined,
          finishing: parsed.finishing || undefined,
          photographicStyle: parsed.photographicStyle || undefined,
        };
      }

      return defaultFallback;
    } catch (err: any) {
      // Rule 5: Silent Fallback — Generation continues normally, no blocking, no product identity impact
      console.warn(`[InspirationStyleIntelligence] Vision style analysis pass failed cleanly: ${err.message || String(err)}. Falling back to default style manifest.`);
      return defaultFallback;
    }
  }

  /**
   * Safely merges multiple inspiration style manifests into a single coherent manifest.
   */
  public mergeManifests(manifests: InspirationStyleManifest[]): InspirationStyleManifest {
    const valid = manifests.filter((m) => m && m.composition);
    if (valid.length === 0) {
      return {
        composition: "Balanced commercial hero positioning.",
        camera: "50mm prime studio lens perspective.",
        lighting: "High-end commercial 3-point softbox studio lighting.",
        colorMood: "Harmonious commercial color palette.",
        environment: "Clean high-key commercial studio backdrop.",
        visualMood: "Premium advertisement aesthetic.",
        analyzed_at: new Date().toISOString(),
      };
    }

    if (valid.length === 1) {
      return valid[0];
    }

    return {
      composition: valid.map((m) => m.composition).filter(Boolean).join(" | "),
      camera: valid.map((m) => m.camera).filter(Boolean).join(" | "),
      lighting: valid.map((m) => m.lighting).filter(Boolean).join(" | "),
      colorMood: valid.map((m) => m.colorMood).filter(Boolean).join(" | "),
      environment: valid.map((m) => m.environment).filter(Boolean).join(" | "),
      visualMood: valid.map((m) => m.visualMood).filter(Boolean).join(" | "),
      analyzed_at: new Date().toISOString(),
      source_hash: valid.map((m) => m.source_hash).filter(Boolean).join("+"),
    };
  }

  /**
   * Converts extracted style information into a structured InspirationPromptDirective
   * with compact commercial visual instructions for prompt compiler integration.
   */
  public generatePromptDirective(manifest: InspirationStyleManifest): InspirationPromptDirective {
    const compactParts = [
      manifest.composition ? `Composition: ${manifest.composition}` : "",
      manifest.camera ? `Camera: ${manifest.camera}` : "",
      manifest.lighting ? `Lighting: ${manifest.lighting}` : "",
      manifest.colorMood ? `Color & Mood: ${manifest.colorMood}` : "",
      manifest.environment ? `Environment: ${manifest.environment}` : "",
      manifest.visualMood ? `Visual Atmosphere: ${manifest.visualMood}` : "",
    ].filter(Boolean);

    return {
      composition: manifest.composition,
      camera: manifest.camera,
      lighting: manifest.lighting,
      colorMood: manifest.colorMood,
      environment: manifest.environment,
      visualMood: manifest.visualMood,
      compactDirective: compactParts.join("\n"),
    };
  }
}
