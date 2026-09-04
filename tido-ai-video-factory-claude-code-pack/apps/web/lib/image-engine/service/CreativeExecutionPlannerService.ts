import { AssetType } from "../../../features/picture-engine/types/picture-engine.types";
import {
  AIEnhancement,
  CreativeInterpretationInput,
  LockedIntent,
  VisualExecutionDirectives,
} from "./CreativeInterpretationService";
import { VisualDirectorService } from "./VisualDirectorService";

export interface AssetCommercialProfile {
  focusMode: "hero_material" | "mobile_conversion" | "editorial_story" | "panoramic_narrative" | "authentic_creator";
  primaryFocalWeight: number; // 0 to 100
  secondaryFocalWeight: number;
  textClearanceZone: "upper_third" | "headline_title" | "side_margin" | "minimal_overlay";
  viewingDistance: "close_mobile" | "editorial_print" | "desktop_web" | "lifestyle_feed";
}

export const ASSET_PROFILE_MAP: Record<AssetType, AssetCommercialProfile> = {
  product_hero: {
    focusMode: "hero_material",
    primaryFocalWeight: 80,
    secondaryFocalWeight: 15,
    textClearanceZone: "minimal_overlay",
    viewingDistance: "close_mobile",
  },
  social_ad: {
    focusMode: "mobile_conversion",
    primaryFocalWeight: 65,
    secondaryFocalWeight: 30,
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
    secondaryFocalWeight: 45,
    textClearanceZone: "side_margin",
    viewingDistance: "desktop_web",
  },
  billboard: {
    focusMode: "editorial_story",
    primaryFocalWeight: 50,
    secondaryFocalWeight: 45,
    textClearanceZone: "headline_title",
    viewingDistance: "editorial_print",
  },
  ugc_thumbnail: {
    focusMode: "authentic_creator",
    primaryFocalWeight: 70,
    secondaryFocalWeight: 25,
    textClearanceZone: "upper_third",
    viewingDistance: "lifestyle_feed",
  },
};

export class CreativeExecutionPlannerService {
  /**
   * Creative Execution Planner — Translates AI Reasoning & Asset Profile into Concrete Visual Directives.
   * Synthesizes camera parameters, framing bounds, subject ratios, depth of field, and negative framing constraints.
   */
  public static plan(
    input: CreativeInterpretationInput,
    lockedIntent: LockedIntent,
    aiEnhancement: AIEnhancement
  ): VisualExecutionDirectives {
    const assetType = input.assetType || "poster";
    const profile = ASSET_PROFILE_MAP[assetType] || ASSET_PROFILE_MAP.poster;

    const subjectsStr = lockedIntent.subject.join(", ");
    const envStr = lockedIntent.environment.join(", ");
    const userCam = lockedIntent.camera_requirements.join("; ");
    const userLight = lockedIntent.lighting_requirements.join("; ");
    const knowledgeList = input.knowledgeCards || input.retrievedKnowledge || [];
    const mainKnowledge = knowledgeList.length > 0 ? knowledgeList[0] : "";

    // 1. Lens & Focal Length Execution (Derived dynamically from profile viewingDistance & focusMode)
    let focalLength = "50mm prime lens";
    let aperture = "f/2.8";
    let shotDistance = "Medium shot (1.5m distance)";
    let cameraAngle = "Eye-level perspective (0° elevation)";

    if (profile.focusMode === "hero_material") {
      focalLength = "90mm macro commercial prime lens";
      aperture = "Ultra-shallow f/1.8 optical depth of field";
      shotDistance = "Macro close-up (0.8m distance)";
      cameraAngle = "Elevated 45° product studio angle";
    } else if (profile.focusMode === "mobile_conversion") {
      focalLength = "35mm dynamic wide-standard lens";
      aperture = "Balanced f/2.8 depth of field";
      shotDistance = "Tight social feed framing (1.2m distance)";
      cameraAngle = "Dynamic 25° high-contrast angle";
    } else if (profile.focusMode === "editorial_story") {
      focalLength = "50mm editorial portrait lens";
      aperture = "Deep selective f/4.0 aperture maintaining environment clarity";
      shotDistance = "Environmental story framing (2.2m distance)";
      cameraAngle = "Eye-level to slight 15° low-angle hero framing";
    } else if (profile.focusMode === "panoramic_narrative") {
      focalLength = "24mm wide cinematic lens";
      aperture = "Deep f/5.6 aperture across panorama";
      shotDistance = "Panoramic wide shot (3.0m distance)";
      cameraAngle = "Horizontal level eye-line perspective";
    } else if (profile.focusMode === "authentic_creator") {
      focalLength = "35mm handheld creator lens";
      aperture = "Natural f/2.2 ambient room focus";
      shotDistance = "Arm's length handheld framing (0.9m distance)";
      cameraAngle = "Natural eye-level handheld perspective";
    }

    if (userCam) {
      cameraAngle = `${cameraAngle} integrating user directive '${userCam}'`;
    }

    const camera_execution = `${focalLength}, ${cameraAngle}, ${shotDistance}, ${aperture}. Crisp focal lock on ${subjectsStr}.`;
    const lens_reasoning = `Selected ${focalLength} to optimize ${profile.focusMode.replace("_", " ")} visual delivery for ${assetType} viewing.`;

    // 2. Subject Scale Ratio & Composition Layout
    const subject_scale_ratio = `Primary subject '${subjectsStr}' occupies ${profile.primaryFocalWeight}% of total frame height/mass.`;

    let composition_layout = `Position '${subjectsStr}' as primary hero anchor (${profile.primaryFocalWeight}%), with secondary environmental mass (${profile.secondaryFocalWeight}%) in '${envStr}'.`;
    if (profile.textClearanceZone === "minimal_overlay") {
      composition_layout += " Symmetrical centered hero placement.";
    } else if (profile.textClearanceZone === "upper_third") {
      composition_layout += " Asymmetric lower-two-thirds product placement with upper third reserved.";
    } else if (profile.textClearanceZone === "headline_title") {
      composition_layout += " Editorial vertical balance with clear top typography space.";
    } else if (profile.textClearanceZone === "side_margin") {
      composition_layout += " Rule-of-thirds product placement anchored to left or right canvas edge.";
    }

    // 3. Environment Role
    let environment_role = "";
    if (profile.focusMode === "hero_material") {
      environment_role = `'${envStr}' serves strictly as a subtle, high-key background backdrop. Product identity remains 100% unobscured.`;
    } else if (profile.focusMode === "editorial_story") {
      environment_role = `'${envStr}' plays an essential narrative role occupying ${profile.secondaryFocalWeight}% visual weight, establishing full atmospheric context.`;
    } else if (profile.focusMode === "mobile_conversion") {
      environment_role = `'${envStr}' provides high-contrast scannable context, reinforcing lifestyle utility without cluttering feed view.`;
    } else {
      environment_role = `'${envStr}' provides supporting contextual background (${profile.secondaryFocalWeight}% visual weight).`;
    }

    // 4. Lighting Execution
    let lighting_execution = `3-point commercial studio lighting directed on '${subjectsStr}'.`;
    if (userLight) {
      lighting_execution += ` Incorporating user lighting directive '${userLight}'.`;
    } else if (mainKnowledge) {
      lighting_execution += ` Applying technique directive [${mainKnowledge}].`;
    } else {
      lighting_execution += ` Key softbox illumination with rim highlights on ${subjectsStr} for edge definition.`;
    }

    // 5. Text Clearance
    const text_clearance = `Preserve dedicated ${profile.textClearanceZone.replace("_", " ")} clearance zone with clean contrast for typography/branding.`;

    // 6. Dynamic Negative Composition Constraints
    const negative_composition_constraints: string[] = [];

    if (profile.focusMode === "hero_material") {
      negative_composition_constraints.push(
        "FORBID wide environmental framing showing full room, distant horizon, or distant surroundings",
        "FORBID small subject scale occupying under 70% of frame height",
        "FORBID busy background clutter or distracting objects blocking product label",
        "FORBID extreme wide-angle distortion"
      );
    } else if (profile.focusMode === "editorial_story") {
      negative_composition_constraints.push(
        "FORBID extreme macro close-up crop that cuts out the surrounding scene environment",
        "FORBID isolated studio pedestal background when rich scene environment is requested",
        "FORBID flat sterile studio backdrop without atmospheric depth"
      );
    } else if (profile.focusMode === "mobile_conversion") {
      negative_composition_constraints.push(
        "FORBID low-contrast muddy lighting reducing mobile feed scannability",
        "FORBID tiny unreadable product placement",
        "FORBID extreme macro crop hiding usage context"
      );
    } else if (profile.focusMode === "panoramic_narrative") {
      negative_composition_constraints.push(
        "FORBID centered vertical composition",
        "FORBID tight macro crop blocking banner text clearance"
      );
    } else {
      negative_composition_constraints.push(
        "FORBID artificial studio pedestal look when authentic real-world scene is requested"
      );
    }

    // 7. Synthesize Cinematic Art Direction via Visual Director Layer
    const cinematicArtDirection = VisualDirectorService.direct(input, lockedIntent, aiEnhancement);

    return {
      camera_execution,
      lens_reasoning,
      camera_angle: cameraAngle,
      shot_distance: shotDistance,
      depth_of_field: aperture,
      subject_scale_ratio,
      composition_layout,
      environment_role,
      lighting_execution,
      text_clearance,
      negative_composition_constraints: [
        ...negative_composition_constraints,
        ...cinematicArtDirection.negative_composition_constraints,
      ],
      cinematic_art_direction: cinematicArtDirection,
      user_photographer_lock: cinematicArtDirection.user_photographer_lock,
    };
  }
}
