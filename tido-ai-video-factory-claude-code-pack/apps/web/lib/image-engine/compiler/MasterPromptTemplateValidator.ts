import crypto from "crypto";
import fs from "fs";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { CompilerError } from "../types";

export interface TemplateValidationResult {
  isValid: boolean;
  templateId: string;
  templateVersion: string;
  templateHash: string;
  templateContent: string;
  error?: CompilerError;
}

export class MasterPromptTemplateValidator {
  public static readonly REQUIRED_PLACEHOLDERS = [
    "{{USER_BRIEF}}",
    "{{PRODUCT_INSTANCE_REQUIREMENTS}}",
    "{{USER_HARD_CONSTRAINTS}}",
    "{{TYPOGRAPHY_AND_READABLE_COPY}}",
    "{{BRAND_KNOWLEDGE}}",
    "{{RELEVANT_KNOWLEDGE}}",
    "{{OUTPUT_CONTEXT}}",
    // v3: campaign reasoning, the single art-direction authority, and format layout
    // geometry each occupy their own section so the budget reducer can rank them.
    "{{CAMPAIGN_STRATEGY}}",
    "{{ART_DIRECTION}}",
    "{{COMMERCIAL_LAYOUT}}",
  ];

  /**
   * Loads and validates the Master Prompt V2 template file from IMAGE_ENGINE_CONFIG.MASTER_PROMPT_V2_PATH
   */
  public static loadAndValidateTemplate(
    templatePath: string = IMAGE_ENGINE_CONFIG.MASTER_PROMPT_V2_PATH
  ): TemplateValidationResult {
    if (!fs.existsSync(templatePath)) {
      return {
        isValid: false,
        templateId: "master_prompt_v2",
        templateVersion: "unknown",
        templateHash: "",
        templateContent: "",
        error: {
          code: "TEMPLATE_NOT_FOUND",
          message: `Master Prompt template file not found at '${templatePath}'`,
        },
      };
    }

    const templateContent = fs.readFileSync(templatePath, "utf-8").trim();

    if (!templateContent) {
      return {
        isValid: false,
        templateId: "master_prompt_v2",
        templateVersion: "unknown",
        templateHash: "",
        templateContent: "",
        error: {
          code: "TEMPLATE_INVALID",
          message: "Master Prompt template file is empty",
        },
      };
    }

    // Extract Version header if present: e.g. <!-- ID: master_prompt_v2 | VERSION: 2.0.0 -->
    let templateId = "master_prompt_v2";
    let templateVersion = "2.0.0";

    const headerMatch = templateContent.match(/<!--\s*ID:\s*([a-zA-Z0-9_]+)\s*\|\s*VERSION:\s*([a-zA-Z0-9_.-]+)\s*-->/);
    if (headerMatch) {
      templateId = headerMatch[1];
      templateVersion = headerMatch[2];
    }

    // Calculate SHA-256 hash of template content
    const templateHash = crypto.createHash("sha256").update(templateContent).digest("hex").slice(0, 16);

    // Validate required placeholders
    const missingPlaceholders: string[] = [];
    for (const ph of this.REQUIRED_PLACEHOLDERS) {
      if (!templateContent.includes(ph)) {
        missingPlaceholders.push(ph);
      }
    }

    if (missingPlaceholders.length > 0) {
      return {
        isValid: false,
        templateId,
        templateVersion,
        templateHash,
        templateContent,
        error: {
          code: "TEMPLATE_INVALID",
          message: `Master Prompt template missing required placeholders: ${missingPlaceholders.join(", ")}`,
        },
      };
    }

    return {
      isValid: true,
      templateId,
      templateVersion,
      templateHash,
      templateContent,
    };
  }

  /**
   * Asserts that no unresolved {{...}} placeholders remain in compiled prompt text
   */
  public static findUnresolvedPlaceholders(compiledPrompt: string): string[] {
    const regex = /\{\{([A-Z0-9_]+)\}\}/g;
    const matches = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(compiledPrompt)) !== null) {
      matches.add(match[0]);
    }

    return Array.from(matches);
  }
}
