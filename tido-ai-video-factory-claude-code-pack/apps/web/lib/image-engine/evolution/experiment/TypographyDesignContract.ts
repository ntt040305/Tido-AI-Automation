import type { CreativeBlueprint } from "./CreativeBlueprint";
import type { CompositionPlan } from "./CompositionPlan";
import type { TextLine, TextRole, TypographySystem } from "./TypographySystem";
import type { BrandKit } from "./BrandKit";
import { colorFor, contrastRatio, normalizeHex, readableOn } from "./BrandKit";

/**
 * Phase 6 — The Typography Design Contract.
 *
 * Implements the 21-parameter Typography Design Contract as the single
 * authoritative decision representation for all typography in TIDO.
 *
 * One Owner (Creative Director + TypographyDNA),
 * One Authoritative Decision,
 * One Master Typography Directive.
 */

export type InformationPriority = 1 | 2 | 3 | 4 | 5;

export interface TypographyElementContract {
  /** 1. Exact client content string */
  content: string;
  /** 2. Strict Information Priority (1 = Primary Message, 5 = CTA/Promo Detail) */
  information_priority: InformationPriority;
  /** 3. Message Role */
  message_role: TextRole | "offer" | "brand";
  /** 4. Visual Group for optical cohesion */
  visual_group: string;
  /** 5. Positional Region relative to composition */
  positional_region: string;
  /** 6. Maximum bounding box in canvas percentages */
  bounding_region: { max_width_pct: number; max_height_pct: number };
  /** 7. Relative scale multiplier (headline dominant) */
  scale: number;
  /** 8. Bounded line count allowance */
  line_count: { min: number; max: number };
  /** 9. Concept-justified font personality */
  font_personality: string;
  /** 10. Stroke weight (700-800 for Level 1, 500-600 for Level 2, 400 for Level 3) */
  font_weight: number;
  /** 11. Casing behaviour */
  case: "as_supplied" | "uppercase" | "title_case";
  /** 12. Letter tracking in ems */
  tracking: number;
  /** 13. Line height (1.28-1.35 for Vietnamese diacritics) */
  line_height: number;
  /** 14. Coherent alignment system */
  alignment: "left" | "center" | "right";
  /** 15. Harmonious color */
  color: string;
  /** 16. Target contrast floor (WCAG >= 4.5:1) */
  contrast_ratio: number;
  /** 17. Restrained visual effect: NO arbitrary outlines or drop-shadows */
  effect: "clean_vector" | "subtle_ambient" | "plate";
  /** 18. Strict relationship to product (never crowd cap/silhouette) */
  relationship_to_product: string;
  /** 19. Relationship to negative space */
  relationship_to_negative_space: string;
  /** 20. Optical grouping distance to parent/adjacent block */
  relationship_to_other_text: string;
  /** 21. Commercial communication purpose */
  visual_purpose: string;
}

export interface TypographyDesignContract {
  mode: "exact" | "none";
  elements: TypographyElementContract[];
  primary_message: TypographyElementContract | null;
  secondary_message: TypographyElementContract | null;
  supporting_information: TypographyElementContract[];
  typography_role: string;
  hierarchy: string[];
  grouping: string;
  alignment: "left" | "center" | "right";
  font_character: string;
  visual_scale: string;
  line_structure: string;
  spacing_rhythm: string;
  color_direction: string;
  relationship_to_product: string;
  relationship_to_negative_space: string;
  relationship_to_scene: string;
  relationship_to_lighting: string;
  treatment: string;
  forbidden_effects: string[];
  commercial_intent: string;
  personality: string;
  font_pairing: {
    heading_class: string;
    body_class: string;
    heading_font: string | null;
    body_font: string | null;
    rationale: string;
  };
  communication_zone: {
    x: number;
    y: number;
    width: number;
    height: number;
    product_zone: string;
    description: string;
  };
  spacing_system: {
    optical_group_gap_factor: number;
    line_height_factor: number;
    min_product_distance_pct: number;
  };
  vietnamese_diacritic_protection: boolean;
}

const VIETNAMESE_REGEX = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

export interface BuildContractInput {
  lines: TextLine[];
  blueprint?: CreativeBlueprint | null;
  compositionPlan?: CompositionPlan | null;
  brandKit?: BrandKit | null;
  typographySystem?: TypographySystem | null;
  ratio?: string;
  personality?: string | null;
}

export class TypographyDesignContractService {
  /**
   * Resolves the authoritative Typography Design Contract from the creative decisions.
   */
  public static buildContract(input: BuildContractInput): TypographyDesignContract {
    const rawLines = (input.lines || []).filter((l) => l && l.text && l.text.trim());
    if (!rawLines.length) {
      return {
        mode: "none",
        elements: [],
        primary_message: null,
        secondary_message: null,
        supporting_information: [],
        typography_role: "none",
        hierarchy: [],
        grouping: "none",
        alignment: "center",
        font_character: "none",
        visual_scale: "none",
        line_structure: "none",
        spacing_rhythm: "none",
        color_direction: "none",
        relationship_to_product: "no typography in frame",
        relationship_to_negative_space: "no typography in frame",
        relationship_to_scene: "clean photograph only",
        relationship_to_lighting: "balanced scene lighting",
        treatment: "none",
        forbidden_effects: ["NO text", "NO typography", "NO lettering"],
        commercial_intent: "pure photographic scene without typography",
        personality: "none",
        font_pairing: {
          heading_class: "sans-serif",
          body_class: "sans-serif",
          heading_font: null,
          body_font: null,
          rationale: "no typography in this frame",
        },
        communication_zone: {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          product_zone: "center",
          description: "no typography zone reserved",
        },
        spacing_system: {
          optical_group_gap_factor: 0.3,
          line_height_factor: 1.25,
          min_product_distance_pct: 6,
        },
        vietnamese_diacritic_protection: false,
      };
    }

    const hasVietnamese = rawLines.some((l) => VIETNAMESE_REGEX.test(l.text));
    const personality =
      input.personality ||
      input.typographySystem?.personality?.value ||
      (input.blueprint as any)?.design?.typographic_voice?.value ||
      "direct";

    const ratio = input.ratio || "1:1";
    const wide = ratio === "16:9";

    // Determine alignment from composition/geometry
    const compZone = input.compositionPlan?.typography_zone?.value;
    const side = compZone
      ? compZone.x < 35
        ? "left"
        : compZone.x > 55
          ? "right"
          : "center"
      : wide
        ? "left"
        : "center";
    const alignment: "left" | "center" | "right" = side === "center" ? "center" : side;

    // Communication zone derived from CompositionPlan
    const commZone = {
      x: compZone ? Math.round(compZone.x) : side === "left" ? 6 : side === "right" ? 52 : 12,
      y: compZone ? Math.round(compZone.y) : 8,
      width: compZone ? Math.round(compZone.width) : side === "center" ? 76 : 42,
      height: compZone ? Math.round(compZone.height) : 38,
      product_zone: compZone?.product_zone || (side === "left" ? "right" : side === "right" ? "left" : "lower"),
      description: input.compositionPlan?.typography_zone?.because || "balanced commercial layout",
    };

    // Strict Level 1-5 Information Hierarchy and Content Grouping
    // Step 1: Find exactly ONE primary headline
    let primaryIndex = rawLines.findIndex((l) => l.role === "headline");
    if (primaryIndex < 0) primaryIndex = 0; // Fall back to first line if no headline specified

    const elements: TypographyElementContract[] = rawLines.map((line, idx) => {
      const isPrimary = idx === primaryIndex;
      const isCta = line.role === "cta";
      const isSub = line.role === "subheadline";

      let priority: InformationPriority = 3;
      let role: TypographyElementContract["message_role"] = "body";
      let group = "supporting_info";
      let scale = 1.0;
      let weight = 400;
      let purpose = "supplies supporting brand detail";

      if (isPrimary) {
        priority = 1;
        role = "headline";
        group = "hero_statement";
        scale = rawLines.length <= 2 ? 3.0 : 2.6;
        weight = 750;
        purpose = "dominant commercial hook read first by viewer";
      } else if (isSub) {
        priority = 2;
        role = "subheadline";
        group = "hero_statement"; // Grouped with headline for optical cohesion!
        scale = 1.5;
        weight = 550;
        purpose = "completes the primary hook with product value";
      } else if (isCta) {
        priority = 5;
        role = "cta";
        group = "action_cluster";
        scale = 1.25;
        weight = 600;
        purpose = "promotional conversion action";
      } else {
        // Detect promotional discounts (e.g. "GIẢM 20%")
        if (/giảm|sale|off|tặng|deal|chỉ\s*\d/i.test(line.text)) {
          priority = 4;
          role = "offer";
          group = isSub ? "hero_statement" : "action_cluster";
          scale = 1.35;
          weight = 650;
          purpose = "commercial promotional proposition";
        }
      }

      // Case styling: never force all-caps on Vietnamese
      const isAllUpper = line.text === line.text.toUpperCase() && /[A-ZÀ-Ỹ]/.test(line.text);
      const textCase: TypographyElementContract["case"] = hasVietnamese
        ? isAllUpper
          ? "uppercase"
          : "as_supplied"
        : isPrimary
          ? "title_case"
          : "as_supplied";

      // Tracking and line height
      const tracking = isPrimary ? 0.02 : textCase === "uppercase" ? 0.08 : 0.01;
      const lineHeight = hasVietnamese ? 1.32 : 1.24;

      return {
        content: line.text,
        information_priority: priority,
        message_role: role,
        visual_group: group,
        positional_region: `${commZone.y < 30 ? "upper" : "center"}-${side}`,
        bounding_region: {
          max_width_pct: commZone.width,
          max_height_pct: Math.round(commZone.height / Math.max(1, rawLines.length)),
        },
        scale,
        line_count: { min: 1, max: isPrimary ? 3 : isCta ? 1 : 2 },
        font_personality: personality,
        font_weight: weight,
        case: textCase,
        tracking,
        line_height: lineHeight,
        alignment,
        color: colorFor(input.brandKit, "text", isPrimary ? "primary" : "secondary") || "#111111",
        contrast_ratio: 4.5,
        effect: isCta ? "plate" : "clean_vector",
        relationship_to_product: "strictly clear of product silhouette and neck/cap with >= 6% margin",
        relationship_to_negative_space: "anchored in uncluttered photographic negative space",
        relationship_to_other_text: isSub
          ? "optically paired directly beneath headline with tight 0.28em gap"
          : "clear secondary separation",
        visual_purpose: purpose,
      };
    });

    // Ensure elements are strictly sorted by information priority (Level 1 leads)
    elements.sort((a, b) => a.information_priority - b.information_priority);

    // 21-Parameter Typography Design Contract Resolution
    const primaryMsg = elements.find((e) => e.information_priority === 1) || elements[0] || null;
    const secondaryMsg = elements.find((e) => e.information_priority === 2) || (elements.length > 1 ? elements[1] : null);
    const supportingMsgs = elements.filter((e) => e !== primaryMsg && e !== secondaryMsg);

    const bpCategory = (input.blueprint as any)?.category || (input.blueprint as any)?.intent?.category || "";
    const bpStyle = (input.blueprint as any)?.visual_style || (input.blueprint as any)?.design?.visual_style?.value || "";
    const bpLighting = (input.blueprint as any)?.lighting || (input.blueprint as any)?.design?.lighting?.value || "";
    const cat = String(bpCategory).toLowerCase();

    let fontCharacter = "Refined, contemporary agency-grade display with balanced optical proportions and crisp edge clarity";
    if (/skincare|serum|cream|cosmetic|beauty|dermatology/i.test(cat)) {
      fontCharacter = "Refined, spacious, and airy contemporary editorial display with disciplined stroke contrast, generous kerning, and quiet prestige";
    } else if (/coffee|tea|cafe|beverage|roast/i.test(cat)) {
      fontCharacter = "Warm, grounded, artisanal editorial typography with tactile humanist undertones and balanced editorial weight";
    } else if (/tech|software|electronics|device|audio/i.test(cat)) {
      fontCharacter = "Structured, high-precision neo-grotesque with clean geometry, neutral authority, and razor-sharp legibility";
    } else if (/fashion|luxury|perfume|fragrance|jewelry/i.test(cat)) {
      fontCharacter = "High-fashion directional typography with commanding vertical proportions, elegant contrast, and bold composition-led restraint";
    } else if (/food|snack|sauce|energy|playful/i.test(cat)) {
      fontCharacter = "Confident, dynamic, high-impact display lettering with controlled energy and immediate commercial clarity";
    }

    const isLightScene = !/dark|moody|night|dramatic|cinematic dark|black/i.test(bpLighting + bpStyle);
    const colorDirection = isLightScene
      ? "Harmonious deep tone sampled from scene shadow and product palette (warm deep charcoal / espresso #1f1813), WCAG >= 4.5:1 contrast against light background"
      : "Luminous warm ambient tint sampled from key lighting highlights (warm champagne / soft ivory #f5ede4), WCAG >= 4.5:1 contrast against deep background";

    const hierarchy = elements.map((e) => {
      const pName = e.information_priority === 1
        ? "LEVEL 1 (PRIMARY HEADLINE)"
        : e.information_priority === 2
          ? "LEVEL 2 (SUBHEADLINE / DESCRIPTOR)"
          : e.information_priority === 5
            ? "LEVEL 5 (CALL TO ACTION / OFFER)"
            : `LEVEL ${e.information_priority} (SUPPORTING INFORMATION)`;
      return `${pName}: "${e.content}" — scale ${e.scale}x, weight ${e.font_weight}, role: ${e.message_role}`;
    });

    return {
      mode: "exact",
      elements,
      primary_message: primaryMsg,
      secondary_message: secondaryMsg,
      supporting_information: supportingMsgs,
      typography_role: "Dominant commercial hero hook and brand aesthetic anchor, establishing immediate viewer attention within 0.5s",
      hierarchy,
      grouping: "Single unified column grid; primary headline and secondary subheadline optically paired with 0.28em line gap into one coherent system rather than isolated fragments",
      alignment,
      font_character: fontCharacter,
      visual_scale: "Dominant Level 1 hook (2.6-3.0x relative scale), subordinate Level 2 descriptor (1.4-1.6x), quiet supporting details (1.0x)",
      line_structure: `Headline balanced across max 2 lines with natural grammatical breaks; subheadline single line; generous line-height (${hasVietnamese ? "1.32-1.35x for diacritic clearance" : "1.24-1.28x"})`,
      spacing_rhythm: "Spacious optical breathing rhythm; 0.28em grouping between headline and subheadline; minimum 8% canvas negative space surrounding the text block",
      color_direction: colorDirection,
      relationship_to_product: "Strictly clear of the product silhouette, bottle neck, cap, dropper, and label, preserving at least 8% clear canvas margin. Typography must never overlap, touch, crowd, or occlude the hero product.",
      relationship_to_negative_space: `Anchored naturally within the quiet ${commZone.y < 35 ? "upper" : "lower"}-${side} photographic negative space, creating balanced breathing room with the product.`,
      relationship_to_scene: "Art-directed directly into the photographic surface plane; visually belongs to the physical environment, atmospheric depth, and camera perspective.",
      relationship_to_lighting: "Subtly modulated by the scene's ambient illumination and color temperature; organic tonal integration, never synthetic flat digital text pasted on top.",
      treatment: "Crisp photographic typography rendered directly into the raster image with clean optical kerning, perfect edge definition, and agency-level craft.",
      forbidden_effects: [
        "NO floating boxes",
        "NO pill containers",
        "NO badges",
        "NO cards",
        "NO dark scrims",
        "NO heavy drop shadows",
        "NO thick outlines",
        "NO bevels/extrusion",
        "NO artificial glow",
      ],
      commercial_intent: "Serve the commercial campaign by establishing immediate prestige, commanding attention, and communicating the product proposition with senior art-director polish.",
      personality,
      font_pairing: {
        heading_class: input.brandKit?.fonts?.heading ? "custom" : "display-sans",
        body_class: input.brandKit?.fonts?.body ? "custom" : "sans-serif",
        heading_font: input.brandKit?.fonts?.heading || null,
        body_font: input.brandKit?.fonts?.body || null,
        rationale: `aligned with ${personality} commercial tone`,
      },
      communication_zone: commZone,
      spacing_system: {
        optical_group_gap_factor: 0.28,
        line_height_factor: hasVietnamese ? 1.32 : 1.24,
        min_product_distance_pct: 8,
      },
      vietnamese_diacritic_protection: hasVietnamese,
    };
  }

  /**
   * Phase 6 — Master Prompt Typography Art Direction for Nano Banana 2.
   * Renders the complete, protected senior-agency art direction section.
   */
  public static renderAgencyTypographyArtDirection(contract: TypographyDesignContract): string {
    if (contract.mode === "none" || !contract.elements.length) {
      return [
        "## TYPOGRAPHY ART DIRECTION",
        "- TEXT MODE: NONE. This frame carries NO typography, no headline, no labels, and no text overlays.",
        "- Compose the entire frame as a finished photograph with balanced scene lighting.",
        "- Do not reserve arbitrary empty blank blocks. Fill the scene naturally.",
        "- RENDER NO TEXT, NUMERALS, OR INVENTED LETTERING ANYWHERE IN THE IMAGE.",
      ].join("\n");
    }

    const z = contract.communication_zone;
    const primary = contract.primary_message || contract.elements[0];
    const secondary = contract.secondary_message;
    const supporting = contract.supporting_information;

    const hierarchyLines = [
      `  * LEVEL 1 (PRIMARY HEADLINE): "${primary.content}" — ${primary.scale}x visual scale, commanding commercial hook, read first. Flush-${contract.alignment} in the quiet negative space.`,
      ...(secondary ? [`  * LEVEL 2 (SUBHEADLINE / DESCRIPTOR): "${secondary.content}" — ${secondary.scale}x scale, visually subordinate, supporting the primary hook.`] : []),
      ...supporting.map((m, i) => `  * LEVEL ${i + 3} (SUPPORTING DETAIL): "${m.content}" — quiet, disciplined, grouped with the message cluster.`),
    ];

    return [
      "## TYPOGRAPHY ART DIRECTION",
      "Typography is an integral element of the complete commercial poster, designed directly in the frame to match the lighting, composition, color palette, and premium commercial art direction.",
      "",
      "- HIERARCHY & INFORMATION ROLES:",
      ...hierarchyLines,
      "",
      "- ART DIRECTION & COMPOSITION INTEGRATION:",
      `  * Spatial Anchoring: Anchored strictly within the quiet communication zone at ${z.x}% across, ${z.y}% down (${z.width}% width x ${z.height}% height of canvas), flush-${contract.alignment}.`,
      "  * Product Clearance: Minimum 8% canvas margin separation from all product silhouettes, bottle caps, necks, and reflections. Typography must NEVER touch, overlap, crowd, or occlude the product.",
      `  * Typography System & Grouping: ${contract.grouping}.`,
      "",
      "- COLOR & TONAL INTEGRATION:",
      `  * Palette Integration: ${contract.color_direction}.`,
      "  * Contrast Floor: Minimum 4.5:1 contrast ratio against the background for effortless readability while feeling organically part of the photographic scene.",
      "",
      "- STYLE & RESTRAINT:",
      `  * Font Character: ${contract.font_character}.`,
      `  * Spacing & Rhythm: ${contract.spacing_rhythm}.`,
      "  * Diacritic Integrity: Vietnamese accents and diacritics must be rendered sharp, clean, fully attached, and perfectly spaced with natural line height (1.32-1.35x).",
      "  * FORBIDDEN UI EFFECTS: STRICTLY NO floating boxes, NO pill containers, NO UI badges, NO cards, NO dark scrims, NO drop shadows, NO thick outlines, NO 3D bevels or extrusions. Typography sits purely and cleanly as photographic commercial typography integrated with the environment.",
      "",
      "- EXACT COPY MANDATE:",
      "  * Render ONLY the authorized supplied text verbatim.",
      "  * Do NOT invent slogans, do NOT add decorative words, do NOT alter spelling or diacritics, do NOT duplicate lines elsewhere in the image.",
    ].join("\n");
  }

  /**
   * Renders the authoritative Master Typography Directive for the Master Prompt.
   * Tells Nano Banana 2 exactly how the photographic scene must support typography.
   */
  public static renderMasterTypographyDirective(contract: TypographyDesignContract): string {
    if (contract.mode === "none" || !contract.elements.length) {
      return [
        "## TYPOGRAPHY & ART DIRECTION CONTRACT",
        "TEXT MODE: NONE",
        "- This frame carries NO typography, no headline, no labels, and no text overlays.",
        "- Compose the entire frame as a finished photograph with balanced scene lighting.",
        "- Do not reserve arbitrary empty blank blocks. Fill the scene naturally.",
        "- RENDER NO TEXT, NUMERALS, OR INVENTED LETTERING ANYWHERE IN THE IMAGE.",
      ].join("\n");
    }

    const z = contract.communication_zone;
    const primary = contract.primary_message?.content || contract.elements[0]?.content;
    const lineCount = contract.elements.length;

    return [
      "## TYPOGRAPHY & ART DIRECTION CONTRACT",
      "TEXT MODE: EXACT COMPOSITED TYPOGRAPHY",
      `The visual typography is art-directed and composited with high-precision vector typography (${contract.alignment} aligned, ${contract.personality} personality).`,
      "",
      "PHOTOGRAPHIC SCENE REQUIREMENTS FOR TYPOGRAPHY INTEGRATION:",
      `- COMMUNICATION ZONE: Strictly reserve the clear communication zone at ${z.x}% across, ${z.y}% down (${z.width}% width x ${z.height}% height of canvas).`,
      `- NEGATIVE SPACE & TEXTURE: Inside this communication zone, maintain smooth, gentle tonal gradation and low high-frequency pattern. Avoid busy background objects, harsh specular reflections, or high-contrast geometric edges. Even, soft photographic tone is required for typography readability.`,
      `- PRODUCT SEPARATION & CLEARANCE: The product is positioned in the ${z.product_zone} area. Maintain at least a 6% clear negative-space buffer between the product silhouette/cap/neck and the communication zone. Typography must never crowd or touch the product.`,
      `- PRIMARY MESSAGE ANCHOR: The primary headline ("${primary}") and ${lineCount - 1} supporting lines will occupy this zone as a unified typographic system.`,
      "- NO TEXT IN RASTER: RENDER ABSOLUTELY NO TEXT, WORDS, LETTERING, WATERMARKS, OR FAKE LABELS in the photographic image. The typography will be composited separately; any text generated by the image model will create a fatal visual collision.",
    ].join("\n");
  }
}
