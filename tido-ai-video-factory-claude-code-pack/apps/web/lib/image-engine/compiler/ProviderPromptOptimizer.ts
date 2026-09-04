export interface PromptOptimizationTelemetry {
  before_chars: number;
  after_chars: number;
  removed_sections: string[];
  compression_applied: boolean;
}

export interface PromptOptimizerResult {
  optimizedPrompt: string;
  telemetry: PromptOptimizationTelemetry;
}

export class ProviderPromptOptimizer {
  public static readonly WARN_THRESHOLD = 18000;
  public static readonly HARD_LIMIT = 20000;

  /**
   * Optimizes the raw compiled master prompt by stripping internal reasoning,
   * marketing strategy explanations, and redundant disclaimers while strictly
   * preserving identity locks, reference image rules, and visual style directives.
   */
  public static optimize(rawPrompt: string): PromptOptimizerResult {
    const before_chars = rawPrompt.length;
    const removed_sections: string[] = [];
    let compression_applied = false;

    let text = rawPrompt;

    // 1. Target and remove internal explanatory & meta-checklist blocks
    const internalExplanations: { name: string; pattern: RegExp }[] = [
      {
        name: "KNOWLEDGE_NON_EXHAUSTIVE_EXPLANATION",
        pattern: /## KNOWLEDGE IS NON-EXHAUSTIVE[\s\S]*?(?=\n##|\n#|$)/gi,
      },
      {
        name: "OPEN_WORLD_REASONING_EXPLANATION",
        pattern: /## OPEN-WORLD PRODUCT REASONING[\s\S]*?(?=\n##|\n#|$)/gi,
      },
      {
        name: "FULL_CREATIVE_AUTHORITY_DISCLAIMER",
        pattern: /## FULL CREATIVE AUTHORITY[\s\S]*?(?=\n##|\n#|$)/gi,
      },
      {
        name: "INTERNAL_FINAL_CHECKLIST",
        pattern: /## INTERNAL FINAL CHECK[\s\S]*?(?=\n##|\n#|$)/gi,
      },
      {
        name: "RETRIEVED_KNOWLEDGE_NOTICE",
        pattern: /NOTICE: Retrieved professional knowledge provides supportive physical principles[\s\S]*?(?=\n\n|\n#|$)/gi,
      },
      {
        name: "USER_BRAND_CONTEXT_NOTE",
        pattern: /Note: The above brand context is user-provided background[\s\S]*?(?=\n\n|\n#|$)/gi,
      },
      {
        name: "INTERNAL_MARKETING_STRATEGY_EXPLANATION",
        pattern: /INTERNAL STRATEGY EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi,
      },
      {
        name: "AUDIENCE_ANALYSIS_EXPLANATION",
        pattern: /AUDIENCE ANALYSIS EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi,
      },
      {
        name: "EVIDENCE_TYPE_METADATA",
        pattern: /evidence_type:?\s*[A-Z_]+/gi,
      },
      {
        name: "CONFIDENCE_SCORE_METADATA",
        pattern: /confidence:?\s*0?\.\d+/gi,
      },
      {
        name: "EVIDENCE_SUMMARY_METADATA",
        pattern: /evidence_summary:?\s*["'][^"']*["']/gi,
      },
      {
        name: "RETRIEVAL_QUERIES_METADATA",
        pattern: /retrieval_queries:?\s*\[[^\]]*\]/gi,
      },
      {
        name: "RETRIEVAL_EXPLANATIONS",
        pattern: /## RETRIEVAL EXPLANATION[\s\S]*?(?=\n##|\n#|$)/gi,
      },
      {
        name: "REASONING_EXPLANATIONS",
        pattern: /## REASONING EXPLANATION[\s\S]*?(?=\n##|\n#|$)/gi,
      },
      {
        name: "KNOWLEDGE_METADATA_HEADER",
        pattern: /## KNOWLEDGE METADATA[\s\S]*?(?=\n##|\n#|$)/gi,
      },
    ];

    internalExplanations.forEach((item) => {
      if (item.pattern.test(text)) {
        removed_sections.push(item.name);
        text = text.replace(item.pattern, "");
        compression_applied = true;
      }
    });

    // 2. Clean up duplicate empty lines and extra whitespace
    text = text.replace(/\n{3,}/g, "\n\n").trim();

    let after_chars = text.length;

    // 3. Mandatory Auto-compression if prompt > 18,000 chars
    if (after_chars > ProviderPromptOptimizer.WARN_THRESHOLD) {
      compression_applied = true;
      removed_sections.push("AGGRESSIVE_FORMATTING_COMPRESSION");

      // Strip redundant formatting headers and whitespace while strictly keeping identity locks
      text = text
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          // Filter out filler decoration lines
          if (trimmed === "```" || trimmed.startsWith("---") || trimmed.startsWith("===")) {
            return false;
          }
          return true;
        })
        .join("\n");

      // Collapse multiple linebreaks into single linebreaks
      text = text.replace(/\n{2,}/g, "\n").trim();
      after_chars = text.length;
    }

    const telemetry: PromptOptimizationTelemetry = {
      before_chars,
      after_chars,
      removed_sections,
      compression_applied,
    };

    console.log("[PROMPT_OPTIMIZER]", telemetry);

    return {
      optimizedPrompt: text,
      telemetry,
    };
  }
}
