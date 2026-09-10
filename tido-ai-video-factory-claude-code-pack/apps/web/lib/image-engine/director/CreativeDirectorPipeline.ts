import { CommercialCopySynthesizer } from "./CommercialCopySynthesizer";
import { CommercialExecutionProfile } from "./CommercialExecutionProfile";
import { ConceptStructuringLayer } from "./ConceptStructuringLayer";
import { CreativeFormatPlanner } from "./CreativeFormatPlanner";
import { CreativeTerritoryGenerator } from "./CreativeTerritoryGenerator";
import { CreativeUnderstandingLayer } from "./CreativeUnderstandingLayer";
import { MasterPromptCompilerV3 } from "./MasterPromptCompilerV3";
import { ProductIdentityLockBuilder } from "./ProductIdentityLockV2";
import { VisualDirectionResolver } from "./VisualDirectionResolver";
import { VisualDirectorEngine } from "./VisualDirectorEngine";
import { DirectorBrief, DirectorDecisionPackage } from "./creative-director.types";

/**
 * CIOS Phase 4.1 — the pipeline, in order.
 *
 *   User Brief
 *     ↓ Creative Understanding Layer
 *     ↓ Creative Territory Generator
 *     ↓ Visual Director Engine
 *     ↓ Creative Format Planner
 *     ↓ Product Identity Lock V2
 *     ↓ Master Prompt Compiler V3
 *     ↓ Image Provider
 *
 * One ordering note: the format planner runs *before* the visual director rather
 * than after it, despite the diagram's order. The director cannot choose a lens
 * without knowing whether the image is a thumbnail or a poster — the format is
 * an input to the visual decision, not a treatment applied to it afterwards. The
 * planner is listed after in the brief because it is the later concern
 * conceptually; running it in that order would mean deciding a camera and then
 * discovering it was wrong for the slot.
 *
 * Deterministic throughout. No LLM call is made, so this returns the same
 * package for the same brief every time and can be tested. The LLM seam exists
 * one layer down in the reasoning stack and its gateway has never been reachable
 * in this environment; wiring this pipeline to it would make the whole thing
 * untestable in exchange for nothing observable.
 */

export class CreativeDirectorPipeline {
  public static run(brief: DirectorBrief, knowledge?: string[]): DirectorDecisionPackage {
    // Phase 4.1.1. The concept is read for requirements before anything else,
    // because what it demands changes the format, the copy and the composition.
    // Previously it was read only for emotional register and then discarded.
    const conceptText = `${brief.concept || ""} ${brief.brief_text || ""}`.trim();
    const intent = ConceptStructuringLayer.parse(conceptText);
    const copy = CommercialCopySynthesizer.synthesize(conceptText, intent, brief.copy || [], brief.product);

    const understanding = CreativeUnderstandingLayer.understand(brief);
    const territories = CreativeTerritoryGenerator.generate(brief, understanding);
    const chosen_territory = CreativeTerritoryGenerator.choose(territories, understanding);

    // The concept's own asset type outranks the caller's, because a user who
    // typed "poster" into the box has said which asset they want more recently
    // than whatever the form defaulted to.
    const format = CreativeFormatPlanner.normalize(intent.asset_type || brief.format);
    const format_plan = CreativeFormatPlanner.plan(format, brief.aspect_ratio);
    const execution = CommercialExecutionProfile.resolve(format, format_plan, intent, copy);

    // The synthesized copy is fed back in as authorized copy, which is what makes
    // the visual director treat the image as one that carries type.
    const briefWithCopy: DirectorBrief = { ...brief, copy: CommercialCopySynthesizer.texts(copy) };

    // Phase 4.1.5. Controls are resolved before the director runs so a binding
    // choice replaces the decision rather than being applied over the top of one
    // the prompt has already stated.
    const unbound = VisualDirectorEngine.direct(briefWithCopy, understanding, chosen_territory, format_plan);
    const visual_controls = VisualDirectionResolver.resolve({
      selected: brief.controls,
      concept: conceptText,
      aiDecision: {
        camera: unbound.camera.angle,
        lens: unbound.camera.lens,
        lighting: unbound.lighting.source,
        composition: unbound.composition.supporting_elements,
        typography: unbound.typography.style,
        color_mood: unbound.color.palette,
      },
    });
    const visual = VisualDirectorEngine.direct(
      briefWithCopy,
      understanding,
      chosen_territory,
      format_plan,
      visual_controls
    );
    const identity = ProductIdentityLockBuilder.build(brief);

    const assembled = MasterPromptCompilerV3.assemble({
      brief: briefWithCopy,
      understanding,
      territory: chosen_territory,
      visual,
      formatPlan: format_plan,
      identity,
      knowledge,
      intent,
      copy,
      execution,
      visualControls: visual_controls,
    });

    return {
      understanding,
      territories,
      chosen_territory,
      visual,
      format_plan,
      identity,
      assembled,
      intent,
      copy,
      execution,
      visual_controls,
    };
  }
}
