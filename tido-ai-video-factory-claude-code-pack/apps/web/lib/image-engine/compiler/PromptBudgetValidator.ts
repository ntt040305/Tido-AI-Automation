export type PromptBudgetStatus = "COMFORTABLE" | "NORMAL" | "HIGH" | "CRITICAL" | "BLOCKED";

export interface PromptBudgetBreakdown {
  static_chars: number;
  user_chars: number;
  reference_requirement_chars: number;
  brand_chars: number;
  knowledge_chars: number;
  copy_chars: number;
  formatting_chars: number;
}

export interface PromptBudgetValidationResult {
  total_prompt_chars: number;
  provider_hard_limit: number;
  status: PromptBudgetStatus;
  is_blocked: boolean;
  breakdown: PromptBudgetBreakdown;
  error?: string;
}

export class PromptBudgetValidator {
  /**
   * Must stay >= PromptBudgetManagerService.HARD_MAXIMUM, otherwise the manager
   * produces a prompt this validator then refuses, and the render is blocked after
   * the work is already done.
   */
  public static readonly DEFAULT_PROVIDER_HARD_LIMIT = Number(
    process.env.PROMPT_HARD_MAXIMUM_CHARS || 24000
  );

  /**
   * Deterministically validates the compiled prompt length and calculates detailed segment breakdown
   * BEFORE any paid provider API request is issued.
   */
  public static validate(
    compiledPrompt: string,
    components: {
      userBrief?: string;
      userHardConstraints?: string[];
      brandInfo?: string;
      copyItems?: Array<string | { text: string }>;
      knowledgeText?: string;
      referenceRequirementText?: string;
    },
    providerHardLimit: number = PromptBudgetValidator.DEFAULT_PROVIDER_HARD_LIMIT
  ): PromptBudgetValidationResult {
    const totalPromptChars = compiledPrompt.length;

    // Calculate component lengths
    const userBriefChars = components.userBrief ? components.userBrief.length : 0;
    const userHardConstraintsChars = components.userHardConstraints
      ? components.userHardConstraints.join("\n").length
      : 0;
    const userChars = userBriefChars + userHardConstraintsChars;

    const brandChars = components.brandInfo ? components.brandInfo.length : 0;
    const knowledgeChars = components.knowledgeText ? components.knowledgeText.length : 0;
    const referenceRequirementChars = components.referenceRequirementText
      ? components.referenceRequirementText.length
      : 0;

    let copyChars = 0;
    if (components.copyItems && components.copyItems.length > 0) {
      components.copyItems.forEach((item) => {
        const text = typeof item === "string" ? item : item.text;
        if (text) copyChars += text.length;
      });
    }

    // Formatting overhead (blank lines & headers)
    const lineBreaks = (compiledPrompt.match(/\n/g) || []).length;
    const headingHashes = (compiledPrompt.match(/#/g) || []).length;
    const formattingChars = lineBreaks + headingHashes;

    // Remaining chars are static control infrastructure
    const dynamicCharsSum = userChars + brandChars + knowledgeChars + referenceRequirementChars + copyChars + formattingChars;
    const staticChars = Math.max(0, totalPromptChars - dynamicCharsSum);

    let status: PromptBudgetStatus;
    let isBlocked = false;
    let error: string | undefined;

    if (totalPromptChars > providerHardLimit) {
      status = "BLOCKED";
      isBlocked = true;
      error = `PROMPT_BUDGET_EXCEEDED: Compiled prompt length (${totalPromptChars} chars) exceeds configured provider hard limit of ${providerHardLimit} chars. Provider call blocked.`;
    } else if (totalPromptChars > 19000) {
      status = "CRITICAL";
    } else if (totalPromptChars > 18500) {
      status = "HIGH";
    } else if (totalPromptChars > 17500) {
      status = "NORMAL";
    } else {
      status = "COMFORTABLE";
    }

    return {
      total_prompt_chars: totalPromptChars,
      provider_hard_limit: providerHardLimit,
      status,
      is_blocked: isBlocked,
      breakdown: {
        static_chars: staticChars,
        user_chars: userChars,
        reference_requirement_chars: referenceRequirementChars,
        brand_chars: brandChars,
        knowledge_chars: knowledgeChars,
        copy_chars: copyChars,
        formatting_chars: formattingChars,
      },
      ...(error ? { error } : {}),
    };
  }
}
