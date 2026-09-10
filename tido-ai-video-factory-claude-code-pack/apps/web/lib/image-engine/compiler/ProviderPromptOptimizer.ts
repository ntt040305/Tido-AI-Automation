export interface PromptOptimizationTelemetry {
  before_chars: number;
  after_chars: number;
  removed_sections: string[];
  compression_applied: boolean;
  /** MASTER_PROMPT_OPTIMIZATION_V2. Which priority tiers were touched. */
  tiers_dropped?: string[];
  /** Repeated concepts merged into one phrase. */
  merges_applied?: number;
  budget_status?: "OK" | "WARN" | "OVER_HARD_LIMIT";
}

export interface PromptOptimizerResult {
  optimizedPrompt: string;
  telemetry: PromptOptimizationTelemetry;
}

/**
 * MASTER_PROMPT_OPTIMIZATION_V2.
 *
 * The budget moved and the method changed with it
 * ----------------------------------------------
 * The old ceiling was 18,000 warn / 20,000 hard, and the only lever past the
 * warn line was "AGGRESSIVE_FORMATTING_COMPRESSION" — stripping blank lines and
 * rule characters. That reclaims punctuation, not content, so a prompt genuinely
 * over budget stayed over budget while the log said compression had been applied.
 *
 * The budget is soft 17,000 / hard 20,000. Length was never the problem: the
 * earlier 16,000/18,000 band with a 12,000-15,000 "target" chased brevity and
 * cost the prompt its photographic instructions. Everything under the
 * provider's ceiling is free and is now spent on quality.
 *
 * Three levers underneath it, applied in order:
 *
 *   1. remove what is not generative at all  (Task 1)
 *   2. merge repeated concepts               (Task 4)
 *   3. drop by priority tier, P2 then P1     (Task 2)
 *
 * The priority hierarchy is the part that matters
 * ----------------------------------------------
 * P0 is never touched: product identity, reference relationships, composition,
 * camera, lighting, materials, realism. These are the decisions the picture is
 * made of, and a prompt that fits the budget having lost one of them has not
 * been optimized, it has been damaged. Formatting compression is still available
 * but runs last and only on P1/P2 material, so it can no longer be mistaken for
 * having done something about size.
 */
export class ProviderPromptOptimizer {
  /**
   * Corrected in the regression recovery patch.
   *
   * The previous band — warn 16,000, hard 18,000, "target" 12,000-15,000 — was
   * treating brevity as the objective and cost the prompt its photographic
   * instructions. Length was never the problem. The provider's limit is 20,000
   * and everything under it is free, so the compiler now spends that budget on
   * quality instead of protecting headroom nobody needed.
   *
   *   under 17,000   nothing is compressed beyond removing non-generative
   *                  metadata, which is never an instruction
   *   17,000-20,000  intelligent compression: P2 explanation and duplicated
   *                  lines go, in that order
   *   over 20,000    emergency: the largest P1 section, then formatting
   *
   * P0 is never touched at any level.
   */
  public static readonly SOFT_THRESHOLD = 17000;
  public static readonly HARD_LIMIT = 20000;
  /** Kept as an alias: several existing suites and services read this name. */
  public static readonly WARN_THRESHOLD = 17000;

  /**
   * Sections that may never be dropped, however tight the budget.
   *
   * Matched against `## HEADING` text. Anything not listed in P0 or P2 is P1 —
   * an unrecognised section is treated as keep-if-space rather than as droppable,
   * because a new section nobody has classified yet is more likely to be a
   * requirement than a rationale.
   */
  private static readonly P0_SECTIONS = [
    "PRODUCT IDENTITY",
    "MULTI-PRODUCT IDENTITY ISOLATION",
    "PRODUCT INSTANCE REQUIREMENTS",
    "REFERENCE INTERPRETATION",
    "REFERENCE SEMANTICS",
    "SINGLE REFERENCE POLICY",
    "VIEWPOINT DECOUPLING",
    "SCENE-NATIVE PRODUCT INTEGRATION",
    "USER BRIEF",
    "USER HARD REQUIREMENTS",
    "TYPOGRAPHY & READABLE COPY",
    "COMMERCIAL LAYOUT",
    "ART DIRECTION",
    "CONFLICT PRIORITY",
    "FINAL OUTPUT",
    "ROLE",
  ];

  /** Explanatory sections. First to go, and no loss when they do. */
  private static readonly P2_SECTIONS = [
    "KNOWLEDGE IS NON-EXHAUSTIVE",
    "OPEN-WORLD PRODUCT REASONING",
    "FULL CREATIVE AUTHORITY",
    "INTERNAL FINAL CHECK",
    "RETRIEVAL EXPLANATION",
    "REASONING EXPLANATION",
    "KNOWLEDGE METADATA",
    "STRATEGY EXPLANATION",
    "AUDIENCE ANALYSIS",
  ];

  /**
   * Task 4 — repeated concepts, merged.
   *
   * Every group below was observed in real compiled prompts saying one thing four
   * ways. The replacement keeps the strongest reading of the group rather than
   * the shortest: "premium cinematic advertising lighting" carries premium,
   * cinematic and advertising, so nothing in the group's meaning is lost.
   */
  private static readonly MERGE_GROUPS: { name: string; pattern: RegExp; replacement: string }[] = [
    {
      name: "LIGHTING_QUALITY",
      pattern:
        /\b(?:premium\s+)?(?:cinematic|high[- ]end|luxury|professional|campaign|commercial)\s+(?:studio\s+|advertising\s+|commercial\s+|campaign\s+)?lighting\b/gi,
      replacement: "premium cinematic advertising lighting",
    },
    {
      name: "IMAGE_QUALITY",
      pattern:
        /\b(?:ultra[- ])?(?:high|photo)[- ]?(?:realistic|resolution|quality|definition)(?:,?\s+(?:ultra[- ]detailed|highly detailed|sharp focus|crisp detail))?\b/gi,
      replacement: "photorealistic high-resolution",
    },
    {
      name: "COMMERCIAL_GRADE",
      pattern:
        /\b(?:premium|luxury|high[- ]end|world[- ]class|award[- ]winning)\s+(?:commercial|advertising|campaign|brand)\s+(?:photography|imagery|quality|standard)\b/gi,
      replacement: "premium commercial photography",
    },
  ];

  /**
   * Optimizes the compiled master prompt.
   *
   * Identity locks, reference rules and resolved visual decisions are preserved
   * throughout; only explanatory and duplicated material is removed.
   */
  public static optimize(rawPrompt: string): PromptOptimizerResult {
    const before_chars = rawPrompt.length;
    const removed_sections: string[] = [];
    const tiers_dropped: string[] = [];
    let compression_applied = false;
    let merges_applied = 0;

    let text = rawPrompt;

    // ── 1. Non-generative content (Task 1) ─────────────────────────────
    // The image model does not need to know why a decision was made, where the
    // knowledge came from, or how confident the retriever was.
    const nonGenerative: { name: string; pattern: RegExp }[] = [
      { name: "KNOWLEDGE_NON_EXHAUSTIVE_EXPLANATION", pattern: /## KNOWLEDGE IS NON-EXHAUSTIVE[\s\S]*?(?=\n##|\n#|$)/gi },
      { name: "OPEN_WORLD_REASONING_EXPLANATION", pattern: /## OPEN-WORLD PRODUCT REASONING[\s\S]*?(?=\n##|\n#|$)/gi },
      { name: "FULL_CREATIVE_AUTHORITY_DISCLAIMER", pattern: /## FULL CREATIVE AUTHORITY[\s\S]*?(?=\n##|\n#|$)/gi },
      { name: "INTERNAL_FINAL_CHECKLIST", pattern: /## INTERNAL FINAL CHECK[\s\S]*?(?=\n##|\n#|$)/gi },
      {
        name: "RETRIEVED_KNOWLEDGE_NOTICE",
        pattern: /NOTICE: Retrieved professional knowledge provides supportive physical principles[\s\S]*?(?=\n\n|\n#|$)/gi,
      },
      { name: "USER_BRAND_CONTEXT_NOTE", pattern: /Note: The above brand context is user-provided background[\s\S]*?(?=\n\n|\n#|$)/gi },
      { name: "INTERNAL_MARKETING_STRATEGY_EXPLANATION", pattern: /INTERNAL STRATEGY EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi },
      { name: "AUDIENCE_ANALYSIS_EXPLANATION", pattern: /AUDIENCE ANALYSIS EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi },
      { name: "EVIDENCE_TYPE_METADATA", pattern: /evidence_type:?\s*[A-Z_]+/gi },
      { name: "CONFIDENCE_SCORE_METADATA", pattern: /confidence:?\s*0?\.\d+/gi },
      { name: "EVIDENCE_SUMMARY_METADATA", pattern: /evidence_summary:?\s*["'][^"']*["']/gi },
      { name: "RETRIEVAL_QUERIES_METADATA", pattern: /retrieval_queries:?\s*\[[^\]]*\]/gi },
      { name: "RETRIEVAL_EXPLANATIONS", pattern: /## RETRIEVAL EXPLANATION[\s\S]*?(?=\n##|\n#|$)/gi },
      { name: "REASONING_EXPLANATIONS", pattern: /## REASONING EXPLANATION[\s\S]*?(?=\n##|\n#|$)/gi },
      { name: "KNOWLEDGE_METADATA_HEADER", pattern: /## KNOWLEDGE METADATA[\s\S]*?(?=\n##|\n#|$)/gi },
      // V2 additions. All of these describe the pipeline rather than the picture.
      { name: "SELECTION_REASON_METADATA", pattern: /selection_reasons?:?\s*\[[^\]]*\]/gi },
      { name: "MATCHED_SIGNALS_METADATA", pattern: /matched_signals?:?\s*\[[^\]]*\]/gi },
      { name: "FINAL_SCORE_METADATA", pattern: /final_score:?\s*[\d.]+/gi },
      { name: "PROVENANCE_LINE", pattern: /^\s*(?:source|provenance|derived_from|knowledge_id|block_id):\s*[^\n]*$/gim },
      { name: "TOKEN_ESTIMATE_METADATA", pattern: /estimated_tokens:?\s*\d+/gi },
      { name: "SELECTION_TIER_METADATA", pattern: /selection_tier:?\s*[A-Z_]+/gi },
    ];

    for (const item of nonGenerative) {
      if (item.pattern.test(text)) {
        removed_sections.push(item.name);
        text = text.replace(item.pattern, "");
        compression_applied = true;
      }
      item.pattern.lastIndex = 0;
    }

    // Knowledge block ids: provenance the renderer cannot use. The heading itself
    // stays, because it names the topic the instructions under it belong to.
    const idPattern = /^(####\s*)\[[a-z0-9_.]+\]\s*/gim;
    if (idPattern.test(text)) {
      removed_sections.push("KNOWLEDGE_BLOCK_IDS");
      text = text.replace(idPattern, "$1");
      compression_applied = true;
    }

    // ── 2. Smart merging (Task 4) ──────────────────────────────────────
    for (const group of this.MERGE_GROUPS) {
      const matches = text.match(group.pattern);
      if (matches && matches.length > 1) {
        // Only merge where the concept is actually repeated. A single occurrence
        // is the writer's phrasing, not redundancy, and rewriting it gains
        // nothing while risking the one place the wording mattered.
        text = text.replace(group.pattern, group.replacement);
        merges_applied += matches.length - 1;
        removed_sections.push(`MERGED_${group.name}_x${matches.length}`);
        compression_applied = true;
      }
      group.pattern.lastIndex = 0;
    }

    // Instructions restated verbatim elsewhere in the prompt.
    const contained = this.dropContainedSubLines(text);
    if (contained.removed > 0) {
      text = contained.text;
      merges_applied += contained.removed;
      removed_sections.push(`DEDUPED_RESTATED_DIRECTION_x${contained.removed}`);
      compression_applied = true;
    }

    // Adjacent identical sentences, left behind by merging.
    const deduped = this.dropRepeatedSentences(text);
    if (deduped.removed > 0) {
      text = deduped.text;
      merges_applied += deduped.removed;
      removed_sections.push(`DEDUPED_SENTENCES_x${deduped.removed}`);
      compression_applied = true;
    }

    text = text.replace(/\n{3,}/g, "\n\n").trim();

    // ── 3. Priority tiers ──────────────────────────────────────────────
    // Nothing below the soft threshold is touched. A 12,000-character prompt is
    // not a problem to be solved.
    if (text.length > this.SOFT_THRESHOLD) {
      const p2 = this.dropTier(text, this.P2_SECTIONS);
      if (p2.dropped.length) {
        text = p2.text;
        tiers_dropped.push(`P2:${p2.dropped.join(",")}`);
        removed_sections.push(...p2.dropped.map((d) => `P2_${d}`));
        compression_applied = true;
      }
    }

    // Never into P0. A prompt still over the hard limit with nothing but P0 left
    // is reported over budget rather than cut into — an oversized prompt is a
    // problem, and an oversized prompt missing its product identity is a reprint.
    //
    // Looped, not single-shot: dropping one section and stopping left two of the
    // twenty largest real prompts still over the hard limit while reporting that
    // a tier had been dropped, which reads as success.
    let p1Guard = 0;
    while (text.length > this.HARD_LIMIT && p1Guard < 12) {
      const p1 = this.dropLowestP1(text);
      if (!p1.dropped.length) break;
      text = p1.text;
      tiers_dropped.push(`P1:${p1.dropped.join(",")}`);
      removed_sections.push(...p1.dropped.map((d) => `P1_${d}`));
      compression_applied = true;
      p1Guard++;
    }

    // ── 4. Formatting, last and only in an emergency ───────────────────
    // Reclaims punctuation, not content. Previously it ran from the warn line
    // down, which meant a perfectly affordable prompt was stripped of the blank
    // lines that make its sections legible.
    if (text.length > this.HARD_LIMIT) {
      removed_sections.push("FORMATTING_COMPRESSION");
      text = text
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          return !(trimmed === "```" || trimmed.startsWith("---") || trimmed.startsWith("==="));
        })
        .join("\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
      compression_applied = true;
    }

    const after_chars = text.length;
    const budget_status: "OK" | "WARN" | "OVER_HARD_LIMIT" =
      after_chars > this.HARD_LIMIT
        ? "OVER_HARD_LIMIT"
        : after_chars > this.SOFT_THRESHOLD
          ? "WARN"
          : "OK";

    const telemetry: PromptOptimizationTelemetry = {
      before_chars,
      after_chars,
      removed_sections,
      compression_applied,
      tiers_dropped,
      merges_applied,
      budget_status,
    };

    console.log("[PROMPT_OPTIMIZER]", {
      before_chars,
      after_chars,
      ratio: before_chars ? Number((after_chars / before_chars).toFixed(3)) : 1,
      budget_status,
      merges_applied,
      tiers_dropped,
      removed_sections: removed_sections.length,
    });
    if (budget_status !== "OK") {
      console.warn("[PROMPT_OPTIMIZER][BUDGET]", {
        status: budget_status,
        after_chars,
        soft: this.SOFT_THRESHOLD,
        hard: this.HARD_LIMIT,
        note: "P0 content is never dropped to reach the budget.",
      });
    }

    return { optimizedPrompt: text, telemetry };
  }

  /** Whether a `## HEADING` belongs to a tier. */
  private static inTier(heading: string, tier: string[]): boolean {
    const h = heading.replace(/^#+\s*/, "").trim().toUpperCase();
    return tier.some((t) => h.includes(t));
  }

  /** Removes every `##` section whose heading matches the given tier. */
  private static dropTier(text: string, tier: string[]): { text: string; dropped: string[] } {
    const dropped: string[] = [];
    const parts = text.split(/\n(?=## )/);
    const kept = parts.filter((part) => {
      const heading = part.split("\n")[0] || "";
      if (!heading.startsWith("## ")) return true;
      if (this.inTier(heading, tier)) {
        dropped.push(heading.replace(/^#+\s*/, "").trim());
        return false;
      }
      return true;
    });
    return { text: kept.join("\n"), dropped };
  }

  /**
   * Drops the largest P1 section, once.
   *
   * Largest rather than last: the point is to reach the budget with the fewest
   * decisions lost, and one 3,000-character atmosphere section costs less than
   * six 500-character ones. P0 is filtered out before anything is considered.
   */
  private static dropLowestP1(text: string): { text: string; dropped: string[] } {
    const parts = text.split(/\n(?=## )/);
    let target = -1;
    let targetSize = 0;
    parts.forEach((part, i) => {
      const heading = part.split("\n")[0] || "";
      if (!heading.startsWith("## ")) return;
      if (this.inTier(heading, this.P0_SECTIONS)) return;
      if (part.length > targetSize) {
        targetSize = part.length;
        target = i;
      }
    });
    if (target < 0) return { text, dropped: [] };
    const heading = (parts[target].split("\n")[0] || "").replace(/^#+\s*/, "").trim();
    parts.splice(target, 1);
    return { text: parts.join("\n"), dropped: [heading] };
  }

  /**
   * Removes labelled sub-lines whose text is already stated verbatim elsewhere.
   *
   * `ART DIRECTION` says everything twice. Its `[RESOLVED ART DIRECTION]` bullets
   * are the concatenation of the `REFERENCE SHOT SHEET` sub-entries printed
   * directly below them — the LIGHTING bullet is Key + Fill & shadow + Rim &
   * speculars + Colour temperature, word for word. On a real edit prompt that is
   * around two thousand characters of the same lighting rig described twice.
   *
   * The resolved bullet is kept and the restatement dropped, never the other way
   * round: that block declares itself "the ONLY authority on camera, lighting,
   * composition, colour, environment, material and atmosphere", so it is the copy
   * every other section is required to defer to.
   *
   * Containment is checked as an exact substring of the payload's opening. A
   * sub-line whose text was elided with an ellipsis does not match and is kept,
   * which is the safe direction to fail in.
   */
  private static dropContainedSubLines(text: string): { text: string; removed: number } {
    const lines = text.split(/\r?\n/);
    let removed = 0;
    const kept = lines.filter((line) => {
      const m = line.match(/^\s{2,}[A-Z][A-Za-z &]*:\s*(.+)$/);
      if (!m) return true;
      const payload = m[1].trim();
      if (payload.length < 60 || payload.endsWith("…")) return true;
      const probe = payload.slice(0, 60);
      // Count occurrences across the whole prompt: one is this line itself, so a
      // second means the instruction is genuinely stated twice.
      let count = 0;
      let from = 0;
      while (count < 2) {
        const at = text.indexOf(probe, from);
        if (at < 0) break;
        count++;
        from = at + probe.length;
      }
      if (count >= 2) {
        removed++;
        return false;
      }
      return true;
    });
    return { text: kept.join("\n"), removed };
  }

  /** Removes sentences that appear more than once verbatim. */
  private static dropRepeatedSentences(text: string): { text: string; removed: number } {
    const lines = text.split("\n");
    const seen = new Set<string>();
    let removed = 0;
    const kept = lines.filter((line) => {
      const trimmed = line.trim();
      // Only whole instruction lines, and only ones long enough that a repeat is
      // redundancy rather than coincidence. Headings are never deduped: two
      // sections may legitimately share one.
      if (trimmed.length < 40 || trimmed.startsWith("#")) return true;
      const key = trimmed.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      if (seen.has(key)) {
        removed++;
        return false;
      }
      seen.add(key);
      return true;
    });
    return { text: kept.join("\n"), removed };
  }
}
