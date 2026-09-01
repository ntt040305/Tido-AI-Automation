/**
 * Composer Engine Integration Adapter
 *
 * Translates retrieved Knowledge Nodes, Technique Cards, and Brand DNA
 * into video assembly, graphics, subtitle, and layout rules for Composer Engine (Remotion / FFmpeg).
 */

import { BrandDNA, KnowledgeNode, TechniqueCard } from "../types";

export interface ComposerEngineDirectivePayload {
  layout_template_hints: string[];
  brand_logo_watermark_url?: string;
  brand_primary_color_hex?: string;
  forbidden_text_keywords: string[];
  transition_style: string;
}

export class ComposerEngineKnowledgeAdapter {
  public compileComposerDirectives(
    nodes: KnowledgeNode[],
    techniqueCards: TechniqueCard[],
    brandDna?: BrandDNA
  ): ComposerEngineDirectivePayload {
    const layoutHints: string[] = [];
    const forbiddenWords: string[] = [];

    if (brandDna) {
      if (brandDna.forbidden_rules?.forbidden_words) {
        forbiddenWords.push(...brandDna.forbidden_rules.forbidden_words);
      }
    }

    for (const card of techniqueCards) {
      if (card.qc_rules) {
        layoutHints.push(...card.qc_rules);
      }
    }

    return {
      layout_template_hints: Array.from(new Set(layoutHints)),
      brand_logo_watermark_url: brandDna?.visual_identity.logo_assets?.[0],
      brand_primary_color_hex: brandDna?.visual_identity.primary_colors?.[0],
      forbidden_text_keywords: Array.from(new Set(forbiddenWords)),
      transition_style: "cut",
    };
  }
}
