export interface CreativeConstraintOutput {
  product_lock: boolean;
  logo_generation: boolean;
  text_generation: boolean;
  typography_mode: "reserved_space_only" | "exact_copy_only";
  commercial_priority: string[];
  strict_negative_constraints: string[];
}

export class CreativeConstraintService {
  /**
   * Evaluates input parameters and generates strict creative constraints
   * ensuring AI model never invents fake brands, typography, or text labels.
   */
  public resolveConstraints(input: {
    copyItems?: any[];
    hasLogoAsset?: boolean;
    productCount?: number;
  }): CreativeConstraintOutput {
    const hasCopy = Boolean(input.copyItems && input.copyItems.length > 0);
    const typography_mode = hasCopy ? "exact_copy_only" : "reserved_space_only";

    return {
      product_lock: true,
      logo_generation: false,
      text_generation: hasCopy,
      typography_mode,
      commercial_priority: ["product", "material", "lighting", "composition"],
      strict_negative_constraints: [
        "DO NOT generate fake text, random letters, artificial brand names, pseudo-typography, or invented labels.",
        "DO NOT invent synthetic logos or modify preserved product brand marks.",
        "Reserve clean, uncluttered negative space for post-production typography layout.",
      ],
    };
  }

  /**
   * Formats constraint output into a compact prompt section for downstream providers.
   */
  public getPromptDirective(constraints: CreativeConstraintOutput): string {
    const lines = [
      "[CREATIVE & RENDER CONSTRAINTS]",
      `- PRODUCT IDENTITY LOCK: ${constraints.product_lock ? "ACTIVE (Strict preservation of product silhouette, shape, color, and packaging)" : "DISABLED"}`,
      `- LOGO GENERATION: ${constraints.logo_generation ? "ALLOWED" : "FORBIDDEN (Never generate fake, modified, or synthetic brand logos)"}`,
      `- TEXT GENERATION: ${constraints.text_generation ? "EXACT_COPY_ONLY (Render ONLY exact authorized user-supplied copy strings)" : "FORBIDDEN (Zero text generation allowed)"}`,
      `- TYPOGRAPHY MODE: ${constraints.typography_mode === "reserved_space_only" ? "reserve clean typography area only (Do NOT render typography/letters into image pixels)" : "exact_copy_only (Render authorized strings only)"}`,
      `- COMMERCIAL PRIORITY: ${constraints.commercial_priority.join(" > ")}`,
      `- NEGATIVE CONSTRAINTS: ${constraints.strict_negative_constraints.join(" ")}`,
    ];

    return lines.join("\n");
  }
}
