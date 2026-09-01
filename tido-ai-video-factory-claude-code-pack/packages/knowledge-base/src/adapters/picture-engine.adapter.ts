/**
 * Picture Engine Integration Adapter
 *
 * Translates retrieved Knowledge Nodes, Technique Cards, and Brand DNA
 * into actionable directives for Picture Engine (Nano Banana 2 / ImgStudio).
 */

import { BrandDNA, KnowledgeNode, TechniqueCard } from "../types";

export interface PictureEngineDirectivePayload {
  prompt_modifiers: string[];
  lighting_instructions: string;
  composition_instructions: string;
  color_palette_hex: string[];
  brand_negative_prompts: string[];
  style_preset_hints: string[];
}

export class PictureEngineKnowledgeAdapter {
  public compilePictureDirectives(
    nodes: KnowledgeNode[],
    techniqueCards: TechniqueCard[],
    brandDna?: BrandDNA
  ): PictureEngineDirectivePayload {
    const promptModifiers: string[] = [];
    const negativePrompts: string[] = [];
    let lightingInstruction = "";
    let compositionInstruction = "";
    const colorPaletteHex: string[] = [];

    // 1. Process Technique Cards
    for (const card of techniqueCards) {
      if (card.lighting_setup?.key_light) {
        lightingInstruction += `Key: ${card.lighting_setup.key_light}. Fill: ${card.lighting_setup.fill_light || "Soft"}. `;
      }
      if (card.camera_setup?.shot_size) {
        compositionInstruction += `Shot size: ${card.camera_setup.shot_size}. Angle: ${card.camera_setup.angle || "eye_level"}. `;
      }
      if (card.provider_hints?.picture_provider_prompt) {
        promptModifiers.push(card.provider_hints.picture_provider_prompt);
      }
    }

    // 2. Process Knowledge Nodes
    for (const node of nodes) {
      if (node.payload.prompt_injection_hints) {
        promptModifiers.push(...node.payload.prompt_injection_hints);
      }
      if (node.payload.negative_directives) {
        negativePrompts.push(...node.payload.negative_directives);
      }
    }

    // 3. Process Brand DNA
    if (brandDna) {
      colorPaletteHex.push(...brandDna.visual_identity.primary_colors);
      if (brandDna.forbidden_rules.forbidden_visuals) {
        negativePrompts.push(...brandDna.forbidden_rules.forbidden_visuals);
      }
    }

    return {
      prompt_modifiers: Array.from(new Set(promptModifiers)),
      lighting_instructions: lightingInstruction.trim(),
      composition_instructions: compositionInstruction.trim(),
      color_palette_hex: Array.from(new Set(colorPaletteHex)),
      brand_negative_prompts: Array.from(new Set(negativePrompts)),
      style_preset_hints: brandDna?.visual_identity.aesthetic_keywords || [],
    };
  }
}
