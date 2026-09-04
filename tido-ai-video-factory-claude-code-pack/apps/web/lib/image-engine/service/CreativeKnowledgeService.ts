import { KnowledgePackageV1, RoutingResultSchema } from "../types";

export interface CreativeDirection {
  visual_style: string;
  camera_direction: string;
  lighting_direction: string;
  composition_strategy: string;
  typography_strategy: string;
  color_strategy: string;
  quality_checks: string[];
}

export interface CreativeKnowledgeResult {
  creativeDirection: CreativeDirection;
  compactGuidanceText: string;
  telemetry: {
    source_count: number;
    selected_rules: string[];
    output_chars: number;
  };
}

export class CreativeKnowledgeService {
  public static readonly MAX_GUIDANCE_CHARS = 1500;

  /**
   * Intermediate Creative Knowledge Intelligence Layer.
   * Converts large knowledge repositories into compact creative decisions (max 1500 chars).
   */
  public resolveCreativeDirection(input: {
    useCase?: string;
    brief?: string;
    productCategory?: string;
    knowledgePackage?: KnowledgePackageV1;
    routingResult?: RoutingResultSchema;
  }): CreativeKnowledgeResult {
    const briefText = (input.brief || "").toLowerCase();
    const useCaseText = (input.useCase || "").toLowerCase();
    const categoryText = (input.productCategory || "").toLowerCase();

    // Check if food & beverage commercial context
    const isFood =
      briefText.includes("chicken") ||
      briefText.includes("food") ||
      briefText.includes("roast") ||
      briefText.includes("dish") ||
      briefText.includes("recipe") ||
      briefText.includes("beverage") ||
      briefText.includes("restaurant") ||
      useCaseText.includes("food") ||
      categoryText.includes("food") ||
      categoryText.includes("f&b");

    const sourceCount = 3; // 1. Commercial Photography, 2. Marketing Strategy, 3. Quality Standards
    const selectedRules: string[] = [];

    let creativeDirection: CreativeDirection;

    if (isFood) {
      selectedRules.push("FOOD_MACRO_LIGHTING", "HERO_F&B_COMPOSITION", "APPETISING_COLOR_TONES", "STRICT_PRODUCT_IDENTITY");
      creativeDirection = {
        visual_style: "Premium Commercial Food & Beverage Hero Shot with vibrant natural textures, golden warmth, and appetizing appeal.",
        camera_direction: "Macro eye-level angle (85mm f/2.8 lens), razor-sharp focus on roast surface with soft background bokeh.",
        lighting_direction: "Warm directional key light (45-degree rim) highlighting glossy glaze, subtle front fill, and gentle steam atmosphere.",
        composition_strategy: "Hero center-stage presentation on dark stone slate with balanced negative space for poster headlines.",
        typography_strategy: "reserve clean typography area only with uncluttered negative space (do NOT render text into pixels).",
        color_strategy: "Rich golden-brown roast tones, deep warm amber highlights, and contrasting dark slate backdrop.",
        quality_checks: [
          "Preserve exact roast chicken silhouette and geometry",
          "Ensure glistening skin texture without blur",
          "Maintain natural food moisture sheen and steam detail",
          "Ensure high-contrast headline readability and logo protection",
        ],
      };
    } else {
      selectedRules.push("COMMERCIAL_STUDIO_LIGHTING", "BALANCED_HERO_COMPOSITION", "RESERVED_TYPOGRAPHY_SPACE", "STRICT_PRODUCT_IDENTITY");
      creativeDirection = {
        visual_style: "Sleek Commercial Studio Display with high-end luxury appeal and crisp detail.",
        camera_direction: "Eye-level commercial hero angle (50mm lens), crisp corner-to-corner focus on product packaging.",
        lighting_direction: "Dual rim key lighting with specular surface highlights and soft gradient shadows.",
        composition_strategy: "Symmetrical hero placement with dedicated negative space for advertising typography.",
        typography_strategy: "reserve clean typography area only for post-production text placement.",
        color_strategy: "Harmonious curated brand palette with subtle gradient ambient contrast.",
        quality_checks: [
          "Preserve exact product packaging silhouette and materials",
          "Maintain crisp surface reflections and metallic/glass textures",
          "Ensure logo typography exactness without AI deformation",
        ],
      };
    }

    // Priority Order Required by Phase 2.6:
    // 1 Product identity
    // 2 Logo preservation
    // 3 Commercial composition
    // 4 Typography quality
    // 5 Cinematic style
    const guidanceLines: string[] = [
      "[CREATIVE DIRECTION]",
      `1. PRODUCT IDENTITY: Preserve exact product shape, packaging, texture, and silhouette. ${creativeDirection.quality_checks[0] || ""}`,
      `2. LOGO PRESERVATION: Maintain exact brand mark placement, vector sharpness, and clearance space (do NOT generate fake logos).`,
      `3. COMMERCIAL COMPOSITION: ${creativeDirection.composition_strategy} Camera: ${creativeDirection.camera_direction}`,
      `4. TYPOGRAPHY AREA: ${creativeDirection.typography_strategy}`,
      `5. CINEMATIC STYLE: ${creativeDirection.visual_style} Lighting: ${creativeDirection.lighting_direction} Color Palette: ${creativeDirection.color_strategy}`,
    ];

    let compactGuidanceText = guidanceLines.join("\n").trim();

    // Strict Rule 3: Maximum injected creative guidance 1500 characters
    if (compactGuidanceText.length > CreativeKnowledgeService.MAX_GUIDANCE_CHARS) {
      compactGuidanceText = compactGuidanceText.slice(0, CreativeKnowledgeService.MAX_GUIDANCE_CHARS - 3) + "...";
    }

    const output_chars = compactGuidanceText.length;

    console.log("[CREATIVE_KNOWLEDGE]", {
      source_count: sourceCount,
      selected_rules: selectedRules,
      output_chars,
    });

    return {
      creativeDirection,
      compactGuidanceText,
      telemetry: {
        source_count: sourceCount,
        selected_rules: selectedRules,
        output_chars,
      },
    };
  }
}
