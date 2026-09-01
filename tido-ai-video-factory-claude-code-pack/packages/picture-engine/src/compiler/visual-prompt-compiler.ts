/**
 * Visual Prompt Compiler Layer Component
 *
 * Compiles final production prompts from:
 * ProductionScenePackage + Knowledge Base Nodes + Technique Cards + Brand DNA.
 */

import { PictureEngineRequest } from "@tido/contracts";
import { BrandDNA, KnowledgeNode, TechniqueCard } from "@tido/knowledge-base";
import { ProductionScenePackage } from "@tido/creative-director";

export interface CompiledVisualPromptOutput {
  final_prompt: string;
  negative_prompt: string;
  visual_constraints: string[];
  compiled_request: PictureEngineRequest;
}

export class VisualPromptCompiler {
  public compileVisualPrompt(
    scenePackage: ProductionScenePackage,
    nodes: KnowledgeNode[] = [],
    techniqueCards: TechniqueCard[] = [],
    brandDna?: BrandDNA
  ): CompiledVisualPromptOutput {
    const basePrompt = scenePackage.visual_direction.prompt;
    const shotType = scenePackage.visual_production.shot_type;
    const lighting = scenePackage.visual_production.lighting;
    const composition = scenePackage.visual_production.composition;
    const style = scenePackage.visual_production.visual_style;

    // Knowledge Node Directives
    const kbDirectives = nodes
      .map((n) => (n.payload.prompt_injection_hints || n.payload.core_directives).join(", "))
      .filter(Boolean)
      .join(". ");

    const kbNegatives = nodes
      .map((n) => (n.payload.negative_directives || []).join(", "))
      .filter(Boolean);

    // Technique Card Directives
    const cardDirectives = techniqueCards
      .map((c) => c.provider_hints?.picture_provider_prompt || `${c.camera_setup.shot_size || ""} ${c.lighting_setup.key_light || ""}`)
      .filter(Boolean)
      .join(". ");

    // Brand DNA Style & Negative Prompts
    const brandTone = brandDna?.visual_identity.brand_tone || "";
    const brandNegatives = brandDna?.forbidden_rules.forbidden_visuals || [];

    const finalPrompt = [
      `[COMMERCIAL DIRECTIVE] ${style} commercial visual`,
      `[SUBJECT] ${basePrompt}`,
      `[COMPOSITION] ${shotType}, ${composition}`,
      `[LIGHTING] ${lighting}`,
      brandTone ? `[BRAND STYLE] ${brandTone}` : "",
      kbDirectives ? `[KNOWLEDGE DIRECTIVE] ${kbDirectives}` : "",
      cardDirectives ? `[TECHNIQUE] ${cardDirectives}` : "",
    ]
      .filter(Boolean)
      .join(". ")
      .trim();

    const negativePrompt = [
      "blurry, distorted, low resolution, bad anatomy, deformed limbs",
      ...scenePackage.qc_rules.must_not_have,
      ...kbNegatives,
      ...brandNegatives,
    ]
      .filter(Boolean)
      .join(", ");

    const visualConstraints = [
      ...scenePackage.qc_rules.must_have,
      `Aspect Ratio Constraint: ${scenePackage.visual_direction.aspect_ratio}`,
      `Camera Angle Constraint: ${scenePackage.visual_production.camera_angle}`,
    ];

    const compiledRequest: PictureEngineRequest = {
      prompt: finalPrompt,
      negative_prompt: negativePrompt,
      aspect_ratio: scenePackage.visual_direction.aspect_ratio,
      model: "flow-nano-banana-2",
      style_modifiers: [style, shotType],
    };

    return {
      final_prompt: finalPrompt,
      negative_prompt: negativePrompt,
      visual_constraints: visualConstraints,
      compiled_request: compiledRequest,
    };
  }
}
