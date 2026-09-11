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
    // The creative signal. These two carry everything the Marketing Brain and
    // Creative Interpretation worked out from the concept — the emotional angle,
    // the visual idea, the composition intent, the commercial goal, and the
    // client's own locked non-negotiables. They were classified P1 and, because
    // they are also the largest non-P0 sections, they were the first thing
    // dropped: measured on the eight largest real prompts, 8 of 8 lost one of
    // them. The system understood the brief and then deleted its understanding
    // to save characters.
    "CAMPAIGN STRATEGY",
    "CREATIVE INTENT",
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
   * the shortest, so nothing in the group's meaning is lost.
   *
   * It used to unify them as "premium cinematic advertising lighting", which
   * made this pass a *source* of the three words the prompt now tells the
   * renderer to ignore. Premium, cinematic and luxury are verdicts on a finished
   * picture; the merged phrase names the treatment instead.
   */
  private static readonly MERGE_GROUPS: { name: string; pattern: RegExp; replacement: string }[] = [
    {
      name: "LIGHTING_QUALITY",
      pattern:
        /\b(?:premium\s+)?(?:cinematic|high[- ]end|luxury|professional|campaign|commercial)\s+(?:studio\s+|advertising\s+|commercial\s+|campaign\s+)?lighting\b/gi,
      replacement: "controlled directional advertising lighting",
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

    // The same scene description repeated once per product instance.
    const shared = this.foldRepeatedParentheticals(text);
    if (shared.folded > 0) {
      text = shared.text;
      removed_sections.push(`FOLDED_REPEATED_SCENE_x${shared.folded}`);
      compression_applied = true;
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

    // ── 3a. Compress the creative signal rather than lose it ───────────
    // P0 is never dropped, so once the strategy sections became P0 the budget
    // had to come from somewhere. It comes from inside them: the five signals
    // below are kept and the surrounding meta-prose — the paragraphs explaining
    // which section outranks which — is not. That prose is about the prompt's
    // own architecture and tells the renderer nothing about the picture.
    if (text.length > this.SOFT_THRESHOLD) {
      const compressed = this.compressSignalSections(text);
      if (compressed.saved > 0) {
        text = compressed.text;
        removed_sections.push(`SIGNAL_META_PROSE_${compressed.saved}chars`);
        compression_applied = true;
      }
    }

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
   * Drops the least valuable P1 section, once.
   *
   * By value, not by size. The previous rule took the *largest* P1 section on
   * the reasoning that this reaches the budget with the fewest sections lost —
   * but the largest section is the campaign strategy, which is the most
   * valuable content outside P0. Optimising for the number of sections removed
   * rather than for what they were worth deleted the best reasoning in the
   * prompt first, every time.
   *
   * `P1_DROP_ORDER` is least valuable first. A section nobody has classified is
   * dropped only after every classified one, because an unknown section is more
   * likely to be a requirement than a rationale.
   */
  private static readonly P1_DROP_ORDER = [
    "BRAND KNOWLEDGE",
    "OUTPUT CONTEXT",
    // Last of the droppable sections, not because it is cheap but because it is
    // the most valuable thing that is still legitimately droppable.
    //
    // It carries the format foundation block — the only place the knowledge
    // system says what a banner is rather than a poster — so it goes only after
    // brand facts and output metadata are gone. Promoting it to P0 was tried and
    // reverted: measured on a serum launch across five runs, four exceeded the
    // 20,000 hard limit because the prompt's non-knowledge content is already
    // ~21,600 on its own. Protecting this section cannot work until that is
    // reclaimed; forcing it only moves the failure to the provider.
    "PROFESSIONAL KNOWLEDGE",
  ];

  private static dropLowestP1(text: string): { text: string; dropped: string[] } {
    const parts = text.split(/\n(?=## )/);
    let target = -1;
    let bestRank = Number.POSITIVE_INFINITY;
    parts.forEach((part, i) => {
      const heading = part.split("\n")[0] || "";
      if (!heading.startsWith("## ")) return;
      if (this.inTier(heading, this.P0_SECTIONS)) return;
      const rank = this.P1_DROP_ORDER.findIndex((name) =>
        heading.replace(/^#+\s*/, "").trim().toUpperCase().includes(name)
      );
      // Unclassified sections rank last (highest number), so they survive until
      // everything explicitly judged droppable has gone.
      const effective = rank < 0 ? this.P1_DROP_ORDER.length : rank;
      // Lowest rank first — the list reads least-valuable-first, so the section
      // to lose is the one nearest its head. Taking the maximum instead spent
      // the list from the wrong end: the realised order was unclassified, then
      // PROFESSIONAL KNOWLEDGE — the section holding specular behaviour, contact
      // shadows and material response — then OUTPUT CONTEXT, then BRAND
      // KNOWLEDGE. Realism was the first classified casualty of an oversized
      // prompt, which is the opposite of what the list says.
      if (effective < bestRank) {
        bestRank = effective;
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

  /**
   * Folds a scene description repeated once per product instance.
   *
   * A multi-product prompt lists every instance with the same parenthetical
   * concept text attached:
   *
   *   * PRODUCT_01: Bound strictly to [REF_01]. (Ba ly ca phe ... studio ...)
   *   * PRODUCT_02: Bound strictly to [REF_02]. (Ba ly ca phe ... studio ...)
   *   * PRODUCT_03: Bound strictly to [REF_03]. (Ba ly ca phe ... studio ...)
   *
   * The scene is one scene. Stating it three times costs thousands of
   * characters and adds nothing, and on a three-product prompt it is the
   * difference between 21,400 characters and fitting the provider's limit
   * without touching a single product identity instruction.
   *
   * Exact-duplicate text only, and the first occurrence is always kept in full,
   * so no information is lost — the later instances point at it.
   */
  private static foldRepeatedParentheticals(text: string): { text: string; folded: number } {
    const counts = new Map<string, number>();
    const paren = /\(([^()]{60,})\)/g;
    let m: RegExpExecArray | null;
    while ((m = paren.exec(text))) {
      const body = m[1].trim();
      counts.set(body, (counts.get(body) || 0) + 1);
    }

    let folded = 0;
    let out = text;
    for (const [body, n] of counts) {
      if (n < 2) continue;
      let seen = 0;
      out = out.split(`(${body})`).reduce((acc, part, i, arr) => {
        if (i === arr.length - 1) return acc + part;
        seen++;
        // The first occurrence keeps the full text; the rest reference it.
        const replacement = seen === 1 ? `(${body})` : "(same scene as described above)";
        if (seen > 1) folded++;
        return acc + part + replacement;
      }, "");
    }
    return { text: out, folded };
  }

  /**
   * Keeps the five creative signals and drops the meta-prose around them.
   *
   *   emotional angle     CREATIVE ANGLE, Mood, Emotional goal
   *   visual concept      VISUAL DIRECTION, CREATIVE CONCEPT, Visual style
   *   composition intent  Visual hierarchy, composition, layout
   *   commercial goal     Objective, COMMERCIAL FRAMING
   *   creative hook       Why this works, Subject, and every Non-negotiable
   *
   * What goes is the explanatory paragraph each section carries about which
   * other section outranks it. That is architecture commentary: it costs three
   * to four hundred characters per section and describes the prompt rather than
   * the picture.
   *
   * Non-negotiables are never touched. They are the client's own locked intent —
   * "Must not look like a normal product listing", "Must be formatted as a 1:1
   * poster" — and were being dropped wholesale with the section around them.
   */
  private static compressSignalSections(text: string): { text: string; saved: number } {
    const SIGNAL =
      /^(?:CREATIVE ANGLE|VISUAL DIRECTION|CREATIVE CONCEPT|VISUAL STYLE|COMMERCIAL FRAMING|LOCKED CLIENT INTENT|ATTACHED REFERENCE ROLES|ASSET CONTEXT|THE SCENE)|^\s*-\s*(?:Subject|Mood|Visual style|Emotional goal|Non-negotiable|Objective|Visual hierarchy|Why this works|What this format asks|Why this format serves|What is happening|Who is in frame)/i;
    // Prose that explains the prompt's own precedence rules.
    const META =
      /\b(?:where those conflict|this block wins|they win|outranks? (?:both|every other)|resolved in the ART DIRECTION|is a failure even when|the exact camera, lighting and layout)\b/i;

    const before = text.length;
    const parts = text.split(/\n(?=## )/);
    const out = parts.map((part) => {
      const heading = part.split("\n")[0] || "";
      if (!/^##\s+(?:CAMPAIGN STRATEGY|CREATIVE INTENT)\b/i.test(heading)) return part;
      const kept = part.split("\n").filter((line) => {
        const l = line.trim();
        if (!l || l.startsWith("## ")) return true;
        if (SIGNAL.test(l)) return true;
        // A long paragraph that is only about section precedence.
        if (META.test(l) && l.length > 120) return false;
        return true;
      });
      return kept.join("\n");
    });
    const joined = out.join("\n");
    return { text: joined, saved: before - joined.length };
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
