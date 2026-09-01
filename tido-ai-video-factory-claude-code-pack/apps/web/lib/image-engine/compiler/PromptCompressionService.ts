export interface CompressionResult {
  before_chars: number;
  after_chars: number;
  removed_sections: string[];
  compressed_prompt: string;
  is_compressed: boolean;
}

export class PromptCompressionService {
  public static readonly COMPRESSION_THRESHOLD = 19500;
  public static readonly MAX_PROMPT_LENGTH = 20000;

  /**
   * Compresses compiled prompt if length > 19,500 chars, strictly preserving:
   *  - PRODUCT IDENTITY LOCK
   *  - LOGO PRESERVATION
   *  - REFERENCE CONTROL
   *  - PRODUCT MANIFEST SUMMARY
   *
   * Compresses first:
   *  - knowledge cards
   *  - technique cards
   *  - verbose marketing explanations
   *  - duplicated instructions
   */
  public static compress(prompt: string): CompressionResult {
    const before_chars = prompt.length;
    const removed_sections: string[] = [];

    if (before_chars <= PromptCompressionService.COMPRESSION_THRESHOLD) {
      return {
        before_chars,
        after_chars: before_chars,
        removed_sections: [],
        compressed_prompt: prompt,
        is_compressed: false,
      };
    }

    let text = prompt;

    // Pass 1: Remove verbose marketing explanations and meta disclaimers
    const marketingPatterns: { name: string; pattern: RegExp }[] = [
      {
        name: "INTERNAL_STRATEGY_EXPLANATION",
        pattern: /INTERNAL STRATEGY EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi,
      },
      {
        name: "AUDIENCE_ANALYSIS_EXPLANATION",
        pattern: /AUDIENCE ANALYSIS EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi,
      },
      {
        name: "OPEN_WORLD_PRODUCT_REASONING",
        pattern: /## OPEN-WORLD PRODUCT REASONING[\s\S]*?(?=\n##|\n#|$)/gi,
      },
      {
        name: "FULL_CREATIVE_AUTHORITY",
        pattern: /## FULL CREATIVE AUTHORITY[\s\S]*?(?=\n##|\n#|$)/gi,
      },
      {
        name: "INTERNAL_FINAL_CHECKLIST",
        pattern: /## INTERNAL FINAL CHECK[\s\S]*?(?=\n##|\n#|$)/gi,
      },
      {
        name: "KNOWLEDGE_NON_EXHAUSTIVE_EXPLANATION",
        pattern: /## KNOWLEDGE IS NON-EXHAUSTIVE[\s\S]*?(?=\n##|\n#|$)/gi,
      },
    ];

    marketingPatterns.forEach((item) => {
      if (item.pattern.test(text)) {
        removed_sections.push(item.name);
        text = text.replace(item.pattern, "");
      }
    });

    text = text.replace(/\n{3,}/g, "\n\n").trim();

    // Pass 2: Compress technique cards and knowledge cards if still > 19,500 chars
    if (text.length > PromptCompressionService.COMPRESSION_THRESHOLD) {
      const knowledgeTechniquePatterns: { name: string; pattern: RegExp }[] = [
        {
          name: "TECHNIQUE_CARDS",
          pattern: /## TECHNIQUE CARDS[\s\S]*?(?=\n##|\n#|\[PRODUCT|\[LOGO|\[REF CONTROL|PRODUCT PLANNING MANIFEST|$)/gi,
        },
        {
          name: "KNOWLEDGE_CARDS",
          pattern: /## RETRIEVED KNOWLEDGE CARDS[\s\S]*?(?=\n##|\n#|\[PRODUCT|\[LOGO|\[REF CONTROL|PRODUCT PLANNING MANIFEST|$)/gi,
        },
      ];

      knowledgeTechniquePatterns.forEach((item) => {
        if (item.pattern.test(text)) {
          removed_sections.push(item.name);
          text = text.replace(item.pattern, "");
        }
      });

      text = text.replace(/\n{3,}/g, "\n\n").trim();
    }

    // Pass 3: Deduplicate lines and collapse excessive breaks if still > 19,500 chars
    if (text.length > PromptCompressionService.COMPRESSION_THRESHOLD) {
      removed_sections.push("COLLAPSE_DUPLICATE_LINES");
      const lines = text.split("\n");
      const uniqueLines: string[] = [];
      const seenLines = new Set<string>();

      for (const line of lines) {
        const trimmed = line.trim();
        // MUST NEVER REMOVE OR SKIP CRITICAL IDENTITY LOCKS & MANIFESTS
        if (
          trimmed.includes("PRODUCT IDENTITY LOCK") ||
          trimmed.includes("LOGO PRESERVATION") ||
          trimmed.includes("[REF CONTROL]") ||
          trimmed.includes("PRODUCT MANIFEST") ||
          trimmed.includes("PRODUCT PLANNING MANIFEST") ||
          trimmed.includes("[PRODUCT_")
        ) {
          uniqueLines.push(line);
        } else if (trimmed.length === 0 || !seenLines.has(trimmed)) {
          if (trimmed.length > 0) seenLines.add(trimmed);
          uniqueLines.push(line);
        }
      }

      text = uniqueLines.join("\n").trim();
    }

    const after_chars = text.length;

    console.log("[PROMPT_COMPRESSION_SERVICE]", {
      before_chars,
      after_chars,
      removed_sections,
      is_compressed: true,
    });

    return {
      before_chars,
      after_chars,
      removed_sections,
      compressed_prompt: text,
      is_compressed: true,
    };
  }
}
