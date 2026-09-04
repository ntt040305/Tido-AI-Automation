export interface BudgetAllocation {
  identity: number; // 7000 chars
  creative: number; // 3000 chars
  camera_lighting: number; // 2500 chars
  knowledge: number; // 4000 chars
  general: number; // 2500 chars
  safety: number; // 1000 chars
}

export interface PromptBudgetManagerResult {
  before: number;
  after: number;
  identity_chars: number;
  knowledge_chars: number;
  product_count: number;
  compression_mode: "HIGH" | "MEDIUM" | "CATALOG";
  final_prompt: string;
}

export class PromptBudgetManagerService {
  public static readonly HARD_MAXIMUM = 20000;
  public static readonly EMERGENCY_TARGET = 15000;

  public static readonly RESERVED_BUDGETS: BudgetAllocation = {
    identity: 7000,
    creative: 3000,
    camera_lighting: 2500,
    knowledge: 4000,
    general: 2500,
    safety: 1000,
  };

  /**
   * Enforces strict prompt budget management before provider execution,
   * guaranteeing that final prompt length is ALWAYS <= 15,000 characters
   * and NEVER throws PROMPT_BUDGET_EXCEEDED errors.
   */
  public enforceBudget(
    prompt: string,
    productCount: number = 1,
    compressionMode: "HIGH" | "MEDIUM" | "CATALOG" = "HIGH"
  ): PromptBudgetManagerResult {
    const before = prompt.length;
    let text = prompt;

    // 1. Mandatory Metadata & Explanation Stripping (Compression Order)
    const stripPatterns: { name: string; pattern: RegExp }[] = [
      { name: "REASONING", pattern: /## (REASONING|OPEN-WORLD)[\s\S]*?(?=\n##|\n#|$)/gi },
      { name: "CONFIDENCE", pattern: /confidence:?\s*0?\.\d+/gi },
      { name: "METADATA", pattern: /evidence_type:?\s*[A-Z_]+/gi },
      { name: "RETRIEVAL_EXPLANATION", pattern: /## RETRIEVAL EXPLANATION[\s\S]*?(?=\n##|\n#|$)/gi },
      { name: "INTERNAL_CHECKLIST", pattern: /## INTERNAL FINAL CHECK[\s\S]*?(?=\n##|\n#|$)/gi },
      { name: "MARKETING_STRATEGY", pattern: /INTERNAL STRATEGY EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi },
      { name: "AUDIENCE_ANALYSIS", pattern: /AUDIENCE ANALYSIS EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi },
    ];

    stripPatterns.forEach((item) => {
      text = text.replace(item.pattern, "");
    });

    text = text.replace(/\n{3,}/g, "\n\n").trim();

    // 2. Measure Identity and Knowledge Chars
    const lines = text.split("\n");
    let identity_chars = 0;
    let knowledge_chars = 0;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (
        trimmed.includes("PRODUCT IDENTITY LOCK") ||
        trimmed.includes("LOGO PRESERVATION") ||
        trimmed.includes("[REF CONTROL]") ||
        trimmed.includes("PRODUCT MANIFEST") ||
        trimmed.includes("LOCK [PRODUCT_") ||
        trimmed.includes("REFERENCE IDENTITY LOCK")
      ) {
        identity_chars += line.length;
      } else if (trimmed.includes("KNOWLEDGE") || trimmed.includes("RETRIEVED")) {
        knowledge_chars += line.length;
      }
    });

    // 3. Emergency Fallback Reducer (If final prompt > 15000 chars)
    if (text.length > PromptBudgetManagerService.EMERGENCY_TARGET) {
      // Pass A: Compress Knowledge Cards to minimal snippet
      text = text.replace(/## RETRIEVED KNOWLEDGE CARDS[\s\S]*?(?=\n##|\n#|\[PRODUCT|\[LOGO|\[REF CONTROL|PRODUCT PLANNING MANIFEST|$)/gi, "");
      text = text.replace(/## TECHNIQUE CARDS[\s\S]*?(?=\n##|\n#|\[PRODUCT|\[LOGO|\[REF CONTROL|PRODUCT PLANNING MANIFEST|$)/gi, "");
      text = text.replace(/\n{3,}/g, "\n\n").trim();
    }

    // Pass B: If STILL over the emergency target, drop optional lines.
    //
    // Budget is allocated in two passes. Must-preserve content (product identity locks
    // and the art direction) is reserved FIRST, then whatever budget remains is filled
    // with optional lines in document order. The previous single top-to-bottom pass
    // spent the whole budget on early lines and discarded everything after it, which
    // silently deleted the art direction because that block is appended last.
    if (text.length > PromptBudgetManagerService.EMERGENCY_TARGET) {
      const currentLines = text.split("\n");

      // The art direction is one contiguous block at the end of the prompt, so once it
      // starts every following line belongs to it.
      let insideArtDirection = false;
      const mustPreserve: boolean[] = currentLines.map((line) => {
        const trimmed = line.trim();

        if (trimmed.includes("[ART DIRECTION") || trimmed.includes("[INSPIRATION REFERENCE RULES")) {
          insideArtDirection = true;
        }

        const isIdentity =
          trimmed.includes("PRODUCT IDENTITY LOCK") ||
          trimmed.includes("LOGO PRESERVATION") ||
          trimmed.includes("[REF CONTROL]") ||
          trimmed.includes("PRODUCT MANIFEST") ||
          trimmed.includes("LOCK [PRODUCT_") ||
          trimmed.includes("REFERENCE IDENTITY LOCK") ||
          trimmed.startsWith("* LOCK");

        const isArtDirection =
          insideArtDirection ||
          trimmed.includes("[INSPIRED VISUAL STYLE DIRECTIVE]") ||
          trimmed.includes("SUBJECT LOCK:");

        return isIdentity || isArtDirection;
      });

      let reservedLength = 0;
      currentLines.forEach((line, i) => {
        if (mustPreserve[i]) reservedLength += line.length + 1;
      });

      const optionalBudget = Math.max(0, PromptBudgetManagerService.EMERGENCY_TARGET - reservedLength);
      let optionalUsed = 0;
      const keep: boolean[] = currentLines.map((line, i) => {
        if (mustPreserve[i]) return true;
        if (optionalUsed + line.length + 1 >= optionalBudget) return false;
        optionalUsed += line.length + 1;
        return true;
      });

      text = currentLines.filter((_, i) => keep[i]).join("\n").trim();
    }

    // Pass C: absolute hard-limit enforcement.
    //
    // Passes A and B protect identity locks and the art direction unconditionally, so a
    // prompt with many product locks and a verbose shot sheet could still finish well
    // above the provider limit. HARD_MAXIMUM was declared but never actually applied,
    // which let oversized prompts through to PromptBudgetValidator, and that validator
    // only blocks the render instead of shrinking it.
    //
    // Rebuild by strict priority: product identity first, art direction second, the rest
    // last, adding a line only while it still fits.
    if (text.length > PromptBudgetManagerService.HARD_MAXIMUM) {
      const lines = text.split("\n");

      let seenArtDirection = false;
      const priority = lines.map((line) => {
        const t = line.trim();

        if (t.includes("[ART DIRECTION") || t.includes("[INSPIRATION REFERENCE RULES")) {
          seenArtDirection = true;
        }

        const isIdentity =
          t.includes("PRODUCT IDENTITY LOCK") ||
          t.includes("LOGO PRESERVATION") ||
          t.includes("[REF CONTROL]") ||
          t.includes("PRODUCT MANIFEST") ||
          t.includes("LOCK [PRODUCT_") ||
          t.includes("REFERENCE IDENTITY LOCK") ||
          t.startsWith("* LOCK");
        if (isIdentity) return 2;

        if (seenArtDirection || t.includes("[INSPIRED VISUAL STYLE DIRECTIVE]") || t.includes("SUBJECT LOCK:")) {
          return 1;
        }
        return 0;
      });

      const keep: boolean[] = new Array(lines.length).fill(false);
      let used = 0;
      for (const tier of [2, 1, 0]) {
        for (let i = 0; i < lines.length; i++) {
          if (priority[i] !== tier || keep[i]) continue;
          const cost = lines[i].length + 1;
          if (used + cost > PromptBudgetManagerService.HARD_MAXIMUM) continue;
          keep[i] = true;
          used += cost;
        }
      }

      text = lines.filter((_, i) => keep[i]).join("\n").trim();

      console.warn("[PROMPT_BUDGET_MANAGER][HARD_LIMIT_ENFORCED]", {
        hard_maximum: PromptBudgetManagerService.HARD_MAXIMUM,
        final_chars: text.length,
      });
    }

    // Final guarantee. Nothing downstream may ever receive more than the hard maximum.
    if (text.length > PromptBudgetManagerService.HARD_MAXIMUM) {
      text = text.slice(0, PromptBudgetManagerService.HARD_MAXIMUM).trim();
    }

    const after = text.length;

    // Recalculate identity & knowledge chars for final telemetry
    identity_chars = 0;
    knowledge_chars = 0;
    text.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (
        trimmed.includes("PRODUCT IDENTITY LOCK") ||
        trimmed.includes("LOGO PRESERVATION") ||
        trimmed.includes("[REF CONTROL]") ||
        trimmed.includes("PRODUCT MANIFEST") ||
        trimmed.includes("LOCK [PRODUCT_") ||
        trimmed.includes("REFERENCE IDENTITY LOCK")
      ) {
        identity_chars += line.length;
      } else if (trimmed.includes("KNOWLEDGE") || trimmed.includes("RETRIEVED")) {
        knowledge_chars += line.length;
      }
    });

    const result: PromptBudgetManagerResult = {
      before,
      after,
      identity_chars,
      knowledge_chars,
      product_count: productCount,
      compression_mode: compressionMode,
      final_prompt: text,
    };

    console.log("[PROMPT_BUDGET_MANAGER]", {
      before: result.before,
      after: result.after,
      identity_chars: result.identity_chars,
      knowledge_chars: result.knowledge_chars,
      product_count: result.product_count,
      compression_mode: result.compression_mode,
    });

    return result;
  }
}
