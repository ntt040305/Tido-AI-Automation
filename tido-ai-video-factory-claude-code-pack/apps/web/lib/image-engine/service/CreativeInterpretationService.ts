import { AssetType } from "../../../features/picture-engine/types/picture-engine.types";
import { LLMProviderService } from "../llm/llm-provider.service";
import { StructuredInputIntentV1 } from "../types";
import { CreativeExecutionPlannerService } from "./CreativeExecutionPlannerService";
import { CinematicArtDirection, VisualDirectorService } from "./VisualDirectorService";

export type { CinematicArtDirection };
export { VisualDirectorService };

export interface VisualExecutionDirectives {
  camera_execution: string;
  lens_reasoning: string;
  camera_angle: string;
  shot_distance: string;
  depth_of_field: string;
  subject_scale_ratio: string;
  composition_layout: string;
  environment_role: string;
  lighting_execution: string;
  text_clearance: string;
  negative_composition_constraints: string[];
  cinematic_art_direction?: CinematicArtDirection;
  user_photographer_lock?: string;
}

export interface LockedIntent {
  subject: string[];
  environment: string[];
  mood: string[];
  style: string[];
  camera_requirements: string[];
  lighting_requirements: string[];
  non_negotiable_constraints: string[];
  important_user_requirements: string[];
  /** What the viewer should feel / the brief's persuasive goal. */
  emotional_goal?: string;
  /** Explicit composition asks read from the brief (layout, placement, framing). */
  composition_requirements?: string[];
  /** Explicit material, surface and texture asks read from the brief. */
  material_requirements?: string[];
}

/**
 * Which producer built the locked intent. Recorded so the resolver knows how much
 * to trust the camera/lighting arrays and so diagnostics can show it honestly.
 *
 * - LLM_STRUCTURED: dedicated multilingual interpretation call
 * - ROUTER_STRUCTURED_INTENT: reused from the Gemini router's structured_input_intent,
 *   which is already an LLM reading of the brief in the user's own language
 * - DETERMINISTIC_FALLBACK: the original English regex parser
 */
export type InterpretationSource =
  | "LLM_STRUCTURED"
  | "ROUTER_STRUCTURED_INTENT"
  | "DETERMINISTIC_FALLBACK";

export interface AIEnhancement {
  creative_objective: string;
  composition_decision: string;
  camera_improvement: string;
  lighting_improvement: string;
  visual_hierarchy: string;
  commercial_reasoning: string;
  // Aliases for backward compatibility
  composition_direction?: string;
  camera_reasoning?: string;
  lighting_reasoning?: string;
}

export interface CreativeInterpretation {
  original_concept: string;
  asset_type: AssetType;
  locked_intent: LockedIntent;
  ai_enhancement: AIEnhancement;
  execution_directives?: VisualExecutionDirectives;
  interpretation_source?: InterpretationSource;
}

export interface CreativeInterpretationInput {
  concept: string;
  assetType: AssetType;
  productCount?: number | "multiple";
  aspectRatio?: string;
  referenceAnalysis?: Record<string, any>;
  productIdentity?: Record<string, any>;
  retrievedKnowledge?: string[];
  knowledgeCards?: string[];
  brandContext?: Record<string, any>;
}

// Commercial Asset Profile Dimensions (Abstract Metadata, NOT prompt templates)
interface AssetCommercialProfile {
  focusMode: "hero_material" | "mobile_conversion" | "editorial_story" | "panoramic_narrative" | "authentic_creator";
  primaryFocalWeight: number; // 0 to 100
  secondaryFocalWeight: number;
  textClearanceZone: "upper_third" | "headline_title" | "side_margin" | "minimal_overlay";
  viewingDistance: "close_mobile" | "editorial_print" | "desktop_web" | "lifestyle_feed";
}

const ASSET_PROFILE_MAP: Record<AssetType, AssetCommercialProfile> = {
  product_hero: {
    focusMode: "hero_material",
    primaryFocalWeight: 75,
    secondaryFocalWeight: 20,
    textClearanceZone: "minimal_overlay",
    viewingDistance: "close_mobile",
  },
  social_ad: {
    focusMode: "mobile_conversion",
    primaryFocalWeight: 60,
    secondaryFocalWeight: 40,
    textClearanceZone: "upper_third",
    viewingDistance: "close_mobile",
  },
  poster: {
    focusMode: "editorial_story",
    primaryFocalWeight: 55,
    secondaryFocalWeight: 45,
    textClearanceZone: "headline_title",
    viewingDistance: "editorial_print",
  },
  banner: {
    focusMode: "panoramic_narrative",
    primaryFocalWeight: 50,
    secondaryFocalWeight: 50,
    textClearanceZone: "side_margin",
    viewingDistance: "desktop_web",
  },
  billboard: {
    focusMode: "editorial_story",
    primaryFocalWeight: 50,
    secondaryFocalWeight: 50,
    textClearanceZone: "headline_title",
    viewingDistance: "editorial_print",
  },
  ugc_thumbnail: {
    focusMode: "authentic_creator",
    primaryFocalWeight: 70,
    secondaryFocalWeight: 30,
    textClearanceZone: "upper_third",
    viewingDistance: "lifestyle_feed",
  },
};

export class CreativeInterpretationService {
  /**
   * Creative Interpretation Layer — Knowledge Fusion Engine
   * Fuses:
   * 1. User Intent (semantic extraction)
   * 2. Reference Analysis (product identity & materials)
   * 3. Knowledge Cards (retrieved domain expertise)
   * 4. Asset Type Commercial Intelligence
   * 5. Brand Context
   */
  public static interpret(input: CreativeInterpretationInput): CreativeInterpretation {
    const rawConcept = input.concept || "";
    const assetType = input.assetType || "poster";

    // 1. Extract Locked User Intent dynamically via Semantic Parsing
    const lockedIntent = this.extractLockedIntent(rawConcept, input);

    return this.assemble(rawConcept, assetType, lockedIntent, input, "DETERMINISTIC_FALLBACK");
  }

  /**
   * Preferred producer. Reads the brief the way a person would, in whatever
   * language it was written, and returns the same CreativeInterpretation shape.
   *
   * Three tiers, best available wins:
   *   1. A dedicated structured LLM interpretation call.
   *   2. The Gemini router's `structured_input_intent`, which is already an LLM
   *      reading of this same brief and costs nothing extra — it was being
   *      computed and then ignored while this service re-parsed the raw string.
   *   3. The original deterministic parser.
   *
   * Tiers 1 and 2 fix the failure that mattered most: the old parser split on
   * English prepositions and matched an English-only aesthetic word list, so a
   * Vietnamese brief produced one giant subject token, an empty camera array and
   * an empty lighting array — exactly the state in which the asset-type template
   * defaults took over and contradicted the user.
   */
  public static async interpretAsync(
    input: CreativeInterpretationInput,
    options?: { llmProvider?: LLMProviderService; routerIntent?: StructuredInputIntentV1 }
  ): Promise<CreativeInterpretation> {
    const rawConcept = input.concept || "";
    const assetType = input.assetType || "poster";

    // Tier 1 — dedicated structured interpretation.
    try {
      const provider = options?.llmProvider || new LLMProviderService();
      if (provider.isConfigured() && rawConcept.trim()) {
        const parsed = await this.callInterpretationLLM(provider, rawConcept, input);
        if (parsed) {
          const locked = this.buildLockedIntentFromLLM(parsed, rawConcept, input);
          console.log("[CREATIVE_INTERPRETATION]", {
            source: "LLM_STRUCTURED",
            subject: locked.subject.join(", ").slice(0, 80),
            camera_requirements: locked.camera_requirements,
            lighting_requirements: locked.lighting_requirements,
          });
          return this.assemble(rawConcept, assetType, locked, input, "LLM_STRUCTURED");
        }
      }
    } catch (err: any) {
      console.warn(
        `[CreativeInterpretationService] Structured LLM interpretation unavailable (${err?.message || err}). Falling back.`
      );
    }

    // Tier 2 — reuse the router's multilingual reading of the same brief.
    const routerIntent = options?.routerIntent;
    if (routerIntent && (routerIntent.core_creative_intent || "").trim()) {
      const locked = this.buildLockedIntentFromRouter(routerIntent, rawConcept, input);
      console.log("[CREATIVE_INTERPRETATION]", {
        source: "ROUTER_STRUCTURED_INTENT",
        subject: locked.subject.join(", ").slice(0, 80),
        camera_requirements: locked.camera_requirements,
        lighting_requirements: locked.lighting_requirements,
      });
      return this.assemble(rawConcept, assetType, locked, input, "ROUTER_STRUCTURED_INTENT");
    }

    // Tier 3 — deterministic.
    console.log("[CREATIVE_INTERPRETATION]", { source: "DETERMINISTIC_FALLBACK" });
    return this.interpret(input);
  }

  /**
   * Shared tail: enhancement synthesis and execution planning are identical no
   * matter which producer built the locked intent, so downstream consumers see
   * exactly the same contract they always did.
   */
  private static assemble(
    rawConcept: string,
    assetType: AssetType,
    lockedIntent: LockedIntent,
    input: CreativeInterpretationInput,
    source: InterpretationSource
  ): CreativeInterpretation {
    const aiEnhancement = this.synthesizeHybridAIEnhancement(rawConcept, assetType, lockedIntent, input);
    const executionDirectives = CreativeExecutionPlannerService.plan(input, lockedIntent, aiEnhancement);

    return {
      original_concept: rawConcept,
      asset_type: assetType,
      locked_intent: lockedIntent,
      ai_enhancement: aiEnhancement,
      execution_directives: executionDirectives,
      interpretation_source: source,
    };
  }

  private static async callInterpretationLLM(
    provider: LLMProviderService,
    concept: string,
    input: CreativeInterpretationInput
  ): Promise<Record<string, any> | null> {
    const productHint =
      input.productIdentity?.canonical_name ||
      input.productIdentity?.summary ||
      input.referenceAnalysis?.routing_summary ||
      "";

    const system =
      "You are a commercial art director reading a client brief. You extract exactly what the client asked for and nothing more. " +
      "The brief may be in Vietnamese, English, or a mix. Read it in its original language and answer in English. " +
      "You never invent camera angles, lighting setups, environments or moods that the brief does not state or clearly imply. " +
      "An empty array is the correct answer when the brief is silent on something.";

    const user = `CLIENT BRIEF:
"""
${concept.trim()}
"""

ASSET FORMAT: ${input.assetType || "poster"}${input.aspectRatio ? ` (${input.aspectRatio})` : ""}
${productHint ? `PRODUCT IN REFERENCE PHOTO: ${productHint}` : ""}
${input.brandContext?.brandName ? `BRAND: ${input.brandContext.brandName}` : ""}

Return ONLY a JSON object with exactly these keys:
{
  "subject": "the single thing being photographed, as a short noun phrase",
  "environment": "where it sits — the scene, surface and setting the brief describes; empty string if the brief does not say",
  "mood": ["short mood adjectives the brief conveys"],
  "emotional_goal": "one sentence: what the viewer should feel and why that sells this product",
  "visual_style": "the photographic or design style the brief implies, as a short phrase",
  "camera_requirements": ["explicit camera asks ONLY: angle, height, lens, framing, distance. Translate faithfully, e.g. 'góc top view hơi nghiêng' -> 'slightly tilted top-down view'. Empty array if the brief is silent."],
  "lighting_requirements": ["explicit lighting asks ONLY: direction, quality, colour, time of day, reflections. Empty array if silent."],
  "composition_requirements": ["explicit layout, placement or negative-space asks. Empty array if silent."],
  "material_requirements": ["explicit material, texture, surface or finish asks. Empty array if silent."],
  "non_negotiable_constraints": ["things the brief says must be true or must not happen"]
}

Rules:
- Never put the whole brief into "subject". Subject is the thing, not the sentence.
- Anything the brief does not state is an empty string or empty array. Do not fill gaps with commercial defaults.
- Preserve the client's meaning exactly; do not upgrade "top view" into "hero angle" or "soft light" into "three-point studio lighting".`;

    const raw = await provider.generateChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      "creative_interpretation",
      { temperature: 0.2, max_tokens: 900, timeoutMs: 20000 }
    );

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    // A response that lost the subject is not usable; fall through to the next tier.
    if (!parsed || typeof parsed !== "object" || !parsed.subject) return null;
    return parsed;
  }

  private static toArray(value: any): string[] {
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
    }
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }

  private static buildLockedIntentFromLLM(
    parsed: Record<string, any>,
    rawConcept: string,
    input: CreativeInterpretationInput
  ): LockedIntent {
    const subject = String(parsed.subject || "").trim() || rawConcept.slice(0, 120);
    const environment = String(parsed.environment || "").trim();
    const camera = this.toArray(parsed.camera_requirements);
    const lighting = this.toArray(parsed.lighting_requirements);
    const composition = this.toArray(parsed.composition_requirements);
    const materials = this.toArray(parsed.material_requirements);
    const mood = this.toArray(parsed.mood);
    const style = this.toArray(parsed.visual_style);

    return this.finalizeLockedIntent({
      subject,
      environment,
      mood,
      style,
      camera,
      lighting,
      composition,
      materials,
      emotionalGoal: String(parsed.emotional_goal || "").trim() || undefined,
      extraConstraints: this.toArray(parsed.non_negotiable_constraints),
      input,
    });
  }

  private static buildLockedIntentFromRouter(
    intent: StructuredInputIntentV1,
    rawConcept: string,
    input: CreativeInterpretationInput
  ): LockedIntent {
    const splitClauses = (v?: string) =>
      (v || "")
        .split(/[;|]|(?:,\s(?=[A-ZĐÀ-Ỹ]))/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    return this.finalizeLockedIntent({
      subject: (intent.core_creative_intent || rawConcept).trim(),
      environment: (intent.scene_environment || "").trim(),
      mood: splitClauses(intent.mood_emotion),
      style: [intent.global_visual_language, ...(intent.local_attributes || [])]
        .map((s) => (s || "").trim())
        .filter(Boolean),
      camera: splitClauses(intent.camera_requests),
      lighting: splitClauses(intent.lighting_requests),
      composition: [
        ...splitClauses(intent.composition_requests),
        ...splitClauses(intent.subject_relationships),
      ],
      materials: splitClauses(intent.material_or_visual_effect_requests),
      emotionalGoal: (intent.communication_intent || intent.promotion_intent || "").trim() || undefined,
      extraConstraints: intent.explicit_hard_requirements || [],
      input,
    });
  }

  /**
   * Common assembly for the two structured producers: attaches the reference and
   * brand locks that must hold regardless of what the brief said, and derives the
   * important-requirements summary the compiler prints.
   */
  private static finalizeLockedIntent(args: {
    subject: string;
    environment: string;
    mood: string[];
    style: string[];
    camera: string[];
    lighting: string[];
    composition: string[];
    materials: string[];
    emotionalGoal?: string;
    extraConstraints: string[];
    input: CreativeInterpretationInput;
  }): LockedIntent {
    const { input } = args;
    const nonNegotiable: string[] = [];

    const refProd = input.productIdentity || input.referenceAnalysis?.products?.[0] || input.referenceAnalysis;
    if (refProd) {
      const refDesc = refProd.color || refProd.canonical_name || refProd.product_name || refProd.description;
      nonNegotiable.push(
        refDesc
          ? `Reference Identity Lock: Uploaded product reference identity (${refDesc}) overrides concept attribute conflicts.`
          : `Reference Identity Lock: Uploaded product reference identity takes strict priority over concept conflicts.`
      );
    }

    nonNegotiable.push(`Preserve core subject: "${args.subject}"`);
    if (args.environment) {
      nonNegotiable.push(`Preserve scene environment: "${args.environment}"`);
    }
    if (input.brandContext?.brandName) {
      nonNegotiable.push(`Respect brand identity: "${input.brandContext.brandName}"`);
    }
    args.extraConstraints.forEach((c) => {
      if (c && !nonNegotiable.includes(c)) nonNegotiable.push(c);
    });

    return {
      subject: [args.subject],
      // An unstated environment stays unstated. The old parser wrote the literal
      // string "commercial background" here, which then propagated into ten
      // generated sentences as if the user had asked for it.
      environment: args.environment ? [args.environment] : [],
      mood: args.mood,
      style: args.style,
      camera_requirements: args.camera,
      lighting_requirements: args.lighting,
      composition_requirements: args.composition,
      material_requirements: args.materials,
      emotional_goal: args.emotionalGoal,
      non_negotiable_constraints: nonNegotiable,
      important_user_requirements: [
        `Core subject: "${args.subject}"`,
        ...(args.environment ? [`Environment: "${args.environment}"`] : []),
        ...args.lighting.map((l) => `Lighting directive: "${l}"`),
        ...args.camera.map((c) => `Camera directive: "${c}"`),
        ...args.composition.map((c) => `Composition directive: "${c}"`),
        ...args.materials.map((m) => `Material directive: "${m}"`),
      ],
    };
  }

  /**
   * Dynamic Semantic Intent Extractor
   * Parses natural language concepts and captures explicit user constraints without hardcoded keyword lists.
   */
  private static extractLockedIntent(concept: string, input: CreativeInterpretationInput): LockedIntent {
    const trimmed = concept.trim();
    const cameraRequirements: string[] = [];
    const lightingRequirements: string[] = [];
    const nonNegotiableConstraints: string[] = [];

    if (!trimmed) {
      return {
        subject: ["main product"],
        environment: ["commercial setting"],
        mood: ["commercial appeal"],
        style: ["commercial photography"],
        camera_requirements: [],
        lighting_requirements: [],
        non_negotiable_constraints: ["Preserve main product identity"],
        important_user_requirements: ["Default commercial visual presentation"],
      };
    }

    // Parse prepositional boundaries
    const prepRegex = /\b(on|in|inside|over|under|against|at|with|featuring)\b/i;
    const parts = trimmed.split(prepRegex).map((p) => p.trim()).filter(Boolean);

    let subjectPhrase = parts[0] || trimmed;
    let environmentPhrase = "";

    for (let i = 1; i < parts.length; i += 2) {
      const prep = (parts[i] || "").toLowerCase();
      const val = parts[i + 1] || "";

      if (["on", "in", "inside", "over", "under", "against", "at"].includes(prep)) {
        if (!environmentPhrase) environmentPhrase = val;
        else environmentPhrase += ` ${prep} ${val}`;
      } else if (["with", "featuring"].includes(prep)) {
        if (val.toLowerCase().includes("light") || val.toLowerCase().includes("shadow") || val.toLowerCase().includes("glow") || val.toLowerCase().includes("sun")) {
          lightingRequirements.push(val);
        } else if (val.toLowerCase().includes("angle") || val.toLowerCase().includes("lens") || val.toLowerCase().includes("shot") || val.toLowerCase().includes("view")) {
          cameraRequirements.push(val);
        } else if (!environmentPhrase) {
          environmentPhrase = val;
        }
      }
    }

    // Extract aesthetic terms
    const lower = trimmed.toLowerCase();
    const moodWords: string[] = [];
    const styleWords: string[] = [];
    const aestheticTerms = [
      "luxury", "premium", "artisanal", "vintage", "futuristic", "minimalist",
      "scandinavian", "rustic", "modern", "cinematic", "editorial", "cozy",
      "vibrant", "serene", "dramatic", "fresh", "warm", "sleek", "organic"
    ];

    for (const term of aestheticTerms) {
      if (lower.includes(term)) {
        if (["luxury", "premium", "cozy", "vibrant", "serene", "dramatic", "fresh", "warm", "sleek"].includes(term)) {
          moodWords.push(term);
        } else {
          styleWords.push(term);
        }
      }
    }

    // Build non-negotiables including reference identity & brand rules
    const refProd = input.productIdentity || input.referenceAnalysis?.products?.[0] || input.referenceAnalysis;
    if (refProd) {
      const refDesc = refProd.color || refProd.canonical_name || refProd.product_name || refProd.description;
      if (refDesc) {
        nonNegotiableConstraints.push(`Reference Identity Lock: Uploaded product reference identity (${refDesc}) overrides concept attribute conflicts.`);
      } else {
        nonNegotiableConstraints.push(`Reference Identity Lock: Uploaded product reference identity takes strict priority over concept conflicts.`);
      }
    }

    nonNegotiableConstraints.push(`Preserve core subject: "${subjectPhrase}"`);
    if (environmentPhrase) {
      nonNegotiableConstraints.push(`Preserve scene environment: "${environmentPhrase}"`);
    }
    if (input.brandContext?.brandName) {
      nonNegotiableConstraints.push(`Respect brand identity: "${input.brandContext.brandName}"`);
    }

    return {
      subject: [subjectPhrase],
      environment: [environmentPhrase || "commercial background"],
      mood: moodWords.length > 0 ? moodWords : ["commercial prestige"],
      style: styleWords.length > 0 ? styleWords : ["commercial photography"],
      camera_requirements: cameraRequirements,
      lighting_requirements: lightingRequirements,
      non_negotiable_constraints: nonNegotiableConstraints,
      important_user_requirements: [
        `Core subject: "${subjectPhrase}"`,
        ...(environmentPhrase ? [`Environment: "${environmentPhrase}"`] : []),
        ...lightingRequirements.map((l) => `Lighting directive: "${l}"`),
        ...cameraRequirements.map((c) => `Camera directive: "${c}"`),
      ],
    };
  }

  /**
   * Dynamic Hybrid Synthesis combining User Intent, Knowledge Retrieval, Reference Analysis & Commercial Asset Profiles.
   */
  private static synthesizeHybridAIEnhancement(
    concept: string,
    assetType: AssetType,
    lockedIntent: LockedIntent,
    input: CreativeInterpretationInput
  ): AIEnhancement {
    const profile = ASSET_PROFILE_MAP[assetType] || ASSET_PROFILE_MAP.poster;
    const subjectsStr = lockedIntent.subject.join(", ");
    const envStr = lockedIntent.environment.join(", ");
    const moodStr = lockedIntent.mood.join(", ");
    const hasEnv = envStr.trim().length > 0;

    // Knowledge fusion context
    const knowledgeList = input.knowledgeCards || input.retrievedKnowledge || [];
    const knowledgeSynthesisText = knowledgeList.length > 0
      ? ` incorporating domain expertise: [${knowledgeList.join("; ")}]`
      : "";

    // Reference & Product identity fusion context
    const refAnalysis = input.referenceAnalysis || input.productIdentity;
    const refMaterialText = refAnalysis?.packaging_material || refAnalysis?.material
      ? ` showcasing ${refAnalysis.packaging_material || refAnalysis.material} texture`
      : "";

    // Every clause below used to restate the full subject string. When the subject
    // was a whole paragraph — which it always was for a Vietnamese brief — that
    // paragraph appeared six times here and four more times downstream, crowding
    // out the knowledge payload and burying the actual instruction. The subject is
    // now named once per field at most, and clauses about things the brief never
    // mentioned are omitted rather than filled with placeholders.
    const creative_objective = `Preserve the subject '${subjectsStr}'${hasEnv ? ` within '${envStr}'` : ""} and raise its commercial impact for ${assetType} (${profile.focusMode.replace(/_/g, " ")})${knowledgeSynthesisText}.`;

    const composition_decision = `Give the subject ${profile.primaryFocalWeight}% primary focal weight${hasEnv ? ` against '${envStr}'` : ""}${refMaterialText}, holding a clear ${profile.textClearanceZone.replace(/_/g, " ")} clearance zone for commercial copy.`;

    const userCam = lockedIntent.camera_requirements.length > 0
      ? `Honour the client camera directive '${lockedIntent.camera_requirements.join("; ")}' exactly.`
      : `Choose a lens and viewpoint suited to ${profile.viewingDistance.replace(/_/g, " ")} viewing.`;
    const camera_improvement = `${userCam} Keep optics sharp on the subject${hasEnv ? " and depth natural behind it" : ""}.`;

    const userLight = lockedIntent.lighting_requirements.length > 0
      ? `Execute the client lighting directive '${lockedIntent.lighting_requirements.join("; ")}' exactly.`
      : `Light the subject in a ${moodStr || "clean commercial"} key.`;
    const lightKnowledgeText = knowledgeList.length > 0 ? ` Apply specialist knowledge [${knowledgeList[0]}].` : "";
    const lighting_improvement = `${userLight}${lightKnowledgeText} Preserve foreground-to-background separation.`;

    const visual_hierarchy = hasEnv
      ? `Primary anchor: subject (${profile.primaryFocalWeight}%). Secondary anchor: '${envStr}' (${profile.secondaryFocalWeight}%). Remainder ambient.`
      : `Primary anchor: subject (${profile.primaryFocalWeight}%). Remaining ${100 - profile.primaryFocalWeight}% is supporting space and atmosphere.`;

    const commercial_reasoning = `${lockedIntent.emotional_goal ? `${lockedIntent.emotional_goal} ` : ""}The subject stays the hero${hasEnv ? " and the requested environment is preserved" : ""}; framing and light are tuned for '${assetType}' (${profile.focusMode.replace(/_/g, " ")}) delivery.`;

    return {
      creative_objective,
      composition_decision,
      camera_improvement,
      lighting_improvement,
      visual_hierarchy,
      commercial_reasoning,
      // Backward compatibility aliases
      composition_direction: composition_decision,
      camera_reasoning: camera_improvement,
      lighting_reasoning: lighting_improvement,
    };
  }
}
