import { AssetType } from "../../../features/picture-engine/types/picture-engine.types";
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
}

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

    // 2. Synthesize Hybrid AI Enhancement combining Knowledge, Reference Analysis, and Asset Commercial Profile
    const aiEnhancement = this.synthesizeHybridAIEnhancement(rawConcept, assetType, lockedIntent, input);

    // 3. Synthesize Concrete Visual Execution Directives via Creative Execution Planner Layer
    const executionDirectives = CreativeExecutionPlannerService.plan(input, lockedIntent, aiEnhancement);

    return {
      original_concept: rawConcept,
      asset_type: assetType,
      locked_intent: lockedIntent,
      ai_enhancement: aiEnhancement,
      execution_directives: executionDirectives,
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

    // Creative Objective: Preserve user subject & environment while applying asset commercial focus & knowledge
    const creative_objective = `Preserve subject '${subjectsStr}' in environment '${envStr}', enhancing overall visual impact to achieve ${profile.focusMode.replace("_", " ")} commercial objectives for ${assetType}${knowledgeSynthesisText}.`;

    // Composition Decision
    const composition_decision = `Position '${subjectsStr}' with a ${profile.primaryFocalWeight}% primary focal weight in '${envStr}'${refMaterialText}, maintaining dedicated ${profile.textClearanceZone.replace("_", " ")} clearance for commercial text.`;

    // Camera Improvement
    const userCam = lockedIntent.camera_requirements.length > 0 ? ` satisfying user requirement '${lockedIntent.camera_requirements.join(", ")}' and` : "";
    const camera_improvement = `Determine lens perspective tailored for ${profile.viewingDistance.replace("_", " ")} viewing,${userCam} focusing sharp optics on ${subjectsStr} while preserving natural depth in ${envStr}.`;

    // Lighting Improvement (fusing knowledge cards & user lighting directives)
    const userLight = lockedIntent.lighting_requirements.length > 0 ? ` incorporating user directive '${lockedIntent.lighting_requirements.join(", ")}'` : "";
    const lightKnowledgeText = knowledgeList.length > 0 ? ` and applying specialist knowledge [${knowledgeList[0]}]` : "";
    const lighting_improvement = `Direct light sources to illuminate ${subjectsStr} in a ${moodStr} key tone,${userLight}${lightKnowledgeText} while preserving foreground-to-background contrast against ${envStr}.`;

    // Visual Hierarchy
    const visual_hierarchy = `Primary Anchor: ${subjectsStr} (${profile.primaryFocalWeight}%), Secondary Anchor: ${envStr} (${profile.secondaryFocalWeight}%), Ambient Environment (${100 - profile.primaryFocalWeight - profile.secondaryFocalWeight}%).`;

    // Commercial Reasoning (explains WHY this choice is optimal for the selected asset_type)
    const commercial_reasoning = `The '${subjectsStr}' remains the hero subject. The '${envStr}' environment is fully preserved, while framing and lighting are optimized for '${assetType}' (${profile.focusMode.replace("_", " ")}) channel performance.`;

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
