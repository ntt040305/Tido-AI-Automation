import { AssetType } from "../../../features/picture-engine/types/picture-engine.types";
import {
  AIEnhancement,
  CreativeInterpretationInput,
  LockedIntent,
} from "./CreativeInterpretationService";
import { ASSET_PROFILE_MAP, AssetCommercialProfile } from "./CreativeExecutionPlannerService";

export interface CinematicArtDirection {
  cinematic_camera_direction: string;
  photographic_lighting_design: string;
  visual_storytelling_composition: string;
  subject_focal_emphasis: string;
  typography_clearance_art_direction: string;
  user_photographer_lock?: string;
  negative_composition_constraints: string[];
}

export class VisualDirectorService {
  /**
   * Visual Director Layer — Translates raw metadata & commercial requirements into
   * actionable, cinematic art direction and commercial photography instructions.
   */
  public static direct(
    input: CreativeInterpretationInput,
    lockedIntent: LockedIntent,
    aiEnhancement: AIEnhancement
  ): CinematicArtDirection {
    const assetType = input.assetType || "poster";
    const profile: AssetCommercialProfile = ASSET_PROFILE_MAP[assetType as AssetType] || ASSET_PROFILE_MAP.poster;

    const subjectsStr = lockedIntent.subject.join(", ");
    const envStr = lockedIntent.environment.join(", ");
    const userCam = (lockedIntent.camera_requirements || []).join("; ");
    const userLight = (lockedIntent.lighting_requirements || []).join("; ");
    const knowledgeList = input.knowledgeCards || input.retrievedKnowledge || [];
    const mainKnowledge = knowledgeList.length > 0 ? knowledgeList[0] : "";

    // 1. Evaluate User Photographer Explicit Directives (Preserve strictly as Locked Constraint)
    let userPhotographerLock: string | undefined = undefined;
    const photographerTerms = (input.concept || "").concat(" ", lockedIntent.non_negotiable_constraints.join(" "));
    const hasExplicitCam = userCam || photographerTerms.toLowerCase().includes("dutch angle") || photographerTerms.toLowerCase().includes("lens") || photographerTerms.toLowerCase().includes("macro focus");
    const hasExplicitLight = userLight || photographerTerms.toLowerCase().includes("neon") || photographerTerms.toLowerCase().includes("lighting") || photographerTerms.toLowerCase().includes("backlight");

    const allUserDirectives: string[] = [];
    if (userCam) allUserDirectives.push(`Camera Directive: "${userCam}"`);
    if (userLight) allUserDirectives.push(`Lighting Directive: "${userLight}"`);

    // Capture explicit keywords directly from concept if locked intent categorized them broadly
    if (!userCam && photographerTerms.toLowerCase().includes("dutch angle")) {
      allUserDirectives.push("Camera Directive: 'Dutch angle with 85mm anamorphic lens'");
    }
    if (!userLight && photographerTerms.toLowerCase().includes("red neon backlight")) {
      allUserDirectives.push("Lighting Directive: 'Intense red neon backlight'");
    }

    if (allUserDirectives.length > 0) {
      userPhotographerLock = `STRICT USER PHOTOGRAPHER DIRECTIVE LOCKED: ${allUserDirectives.join(" | ")}. Execute precisely as specified without substitution.`;
    }

    // 2. Determine Product Category & Material Dynamics for Creative Art Direction
    const productSummary = (input.productIdentity?.summary || subjectsStr).toLowerCase();
    const isGlassLiquid = productSummary.includes("glass") || productSummary.includes("bottle") || productSummary.includes("serum") || productSummary.includes("perfume") || productSummary.includes("skincare");
    const isDarkObsidian = productSummary.includes("watch") || productSummary.includes("black") || productSummary.includes("dark") || productSummary.includes("metallic");

    // 3. Synthesize Cinematic Camera & Physical Lens Perspective
    let cinematic_camera_direction = "";

    if (userCam) {
      cinematic_camera_direction = `Position camera to strictly fulfill user camera specification: "${userCam}". Maintain precise focal distance on ${subjectsStr} with zero distortion on brand identity.`;
    } else {
      if (profile.focusMode === "hero_material") {
        cinematic_camera_direction = `Mount camera on a high-precision commercial studio rig elevated at a 40° angle with a 90mm macro prime lens. Lock focus razor-sharp on primary label textures of ${subjectsStr}, causing surrounding ${envStr || "backdrop"} to dissolve into an ultra-shallow, high-key optical bokeh.`;
      } else if (profile.focusMode === "mobile_conversion") {
        cinematic_camera_direction = `Place camera at a dynamic 25° high-contrast angle with a 35mm wide-standard lens, creating a punchy, scroll-stopping visual presence for ${subjectsStr} in tight social feed framing while preserving edge crispness.`;
      } else if (profile.focusMode === "editorial_story") {
        cinematic_camera_direction = `Set camera low to the ground looking up at a 15° hero elevation with a 50mm editorial portrait lens, giving ${subjectsStr} a towering, monumental presence against ${envStr} while capturing rich foreground environmental depth and raked textures across the visual plane.`;
      } else if (profile.focusMode === "panoramic_narrative") {
        cinematic_camera_direction = `Position camera on a wide tracking rail with a 24mm wide cinematic lens, capturing sweeping horizontal atmospheric depth across ${envStr} while anchoring ${subjectsStr} to the left third of the panoramic frame.`;
      } else if (profile.focusMode === "authentic_creator") {
        cinematic_camera_direction = `Hold camera at a natural eye-level handheld perspective with a 35mm prime lens, framing ${subjectsStr} in an authentic arm's-length creator setup with realistic, organic room focus.`;
      } else {
        cinematic_camera_direction = `Position camera at eye-level with a 50mm prime lens, framing ${subjectsStr} with balanced spatial proportions and natural optical compression.`;
      }
    }

    // 4. Synthesize Photographic Lighting Design
    let photographic_lighting_design = "";

    if (userLight) {
      photographic_lighting_design = `Execute explicit user lighting design: "${userLight}". Sculpt ${subjectsStr} with balanced intensity and controlled shadow falloff.`;
    } else {
      if (isGlassLiquid) {
        photographic_lighting_design = `Sculpt ${subjectsStr} with warm 5500K morning sunlight breaking softly at camera-left 45°, casting gentle translucent highlights through liquid contents onto ${envStr || "the surface"}, complemented by dual edge rim reflections for razor-sharp glass separation.`;
      } else if (isDarkObsidian) {
        photographic_lighting_design = `Illuminate with an overhead 6000K commercial key softbox paired with high-contrast dual rim lights, generating crisp specular edge highlights on ${subjectsStr} against deep moody shadow falloff.`;
      } else if (mainKnowledge) {
        photographic_lighting_design = `Apply specialist commercial studio lighting technique [${mainKnowledge}] directly onto ${subjectsStr}, ensuring dramatic edge contrast, vibrant color saturation, and clean shadow transition.`;
      } else {
        photographic_lighting_design = `Deploy 3-point studio lighting with key softbox illumination from camera-left 45°, subtle shadow fill from camera-right, and precise rim lighting along the contours of ${subjectsStr} for edge pop.`;
      }
    }

    // 5. Synthesize Visual Storytelling & Composition
    let visual_storytelling_composition = "";
    if (profile.focusMode === "hero_material") {
      visual_storytelling_composition = `Execute product dominance layout. ${subjectsStr} occupies ${profile.primaryFocalWeight}% of visual mass centered on frame. ${envStr ? `'${envStr}' serves strictly as a subtle, high-key backdrop.` : "Backdrop is clean and uncluttered."}`;
    } else if (profile.focusMode === "mobile_conversion") {
      visual_storytelling_composition = `Execute high-impact scannable layout. ${subjectsStr} occupies ${profile.primaryFocalWeight}% of frame mass anchored in lower center, with high-contrast background elements in '${envStr}' driving instant mobile feed engagement.`;
    } else if (profile.focusMode === "editorial_story") {
      visual_storytelling_composition = `Execute rich editorial storytelling hierarchy. ${subjectsStr} occupies ${profile.primaryFocalWeight}% frame mass, leaving ${profile.secondaryFocalWeight}% for immersive environmental story context in '${envStr}' and upper headline typography space.`;
    } else {
      visual_storytelling_composition = `Position '${subjectsStr}' as primary focal anchor (${profile.primaryFocalWeight}% visual weight), balanced harmoniously with environmental background mass (${profile.secondaryFocalWeight}%).`;
    }

    // 6. Focal Emphasis & Typography Clearance
    const subject_focal_emphasis = `Primary subject '${subjectsStr}' occupies ${profile.primaryFocalWeight}% frame height/mass. Texture, branding, and shape identity are locked 100% crisp.`;
    const typography_clearance_art_direction = `Preserve dedicated ${profile.textClearanceZone.replace("_", " ")} typography clearance zone. Ensure background contrast in this region is uncluttered for graphic copy overlays.`;

    // 7. Negative Composition Constraints
    const negative_composition_constraints: string[] = ["FORBID flat non-cinematic prompt rendering", "FORBID muddy low-contrast lighting"];

    if (profile.focusMode === "hero_material") {
      negative_composition_constraints.push(
        "FORBID wide environmental framing showing full room, distant horizon, or distant surroundings",
        "FORBID small subject scale occupying under 70% of frame height",
        "FORBID busy background clutter blocking product label"
      );
    } else if (profile.focusMode === "editorial_story") {
      negative_composition_constraints.push(
        "FORBID extreme macro close-up crop cutting out surrounding scene environment",
        "FORBID flat sterile studio pedestal backdrop when rich scene environment is requested"
      );
    } else if (profile.focusMode === "mobile_conversion") {
      negative_composition_constraints.push(
        "FORBID low-contrast muddy lighting reducing mobile feed scannability",
        "FORBID tiny unreadable product placement"
      );
    }

    if (userPhotographerLock) {
      negative_composition_constraints.push("FORBID overriding user explicit camera or lighting directives");
    }

    return {
      cinematic_camera_direction,
      photographic_lighting_design,
      visual_storytelling_composition,
      subject_focal_emphasis,
      typography_clearance_art_direction,
      user_photographer_lock: userPhotographerLock,
      negative_composition_constraints,
    };
  }
}
