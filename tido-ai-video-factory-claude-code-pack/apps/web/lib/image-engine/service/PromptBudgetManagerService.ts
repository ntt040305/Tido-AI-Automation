import { tierFor } from "../compiler/prompt-section-policy";

export interface PromptSectionRemoval {
  section: string;
  priority: number;
  chars: number;
  reason: "DUPLICATE" | "LOW_PRIORITY_SECTION";
}

export interface PromptBudgetManagerResult {
  before: number;
  after: number;
  identity_chars: number;
  knowledge_chars: number;
  product_count: number;
  compression_mode: "HIGH" | "MEDIUM" | "CATALOG";
  final_prompt: string;
  /** Exactly what was dropped and why. Never silent. */
  removals: PromptSectionRemoval[];
  duplicate_lines_removed: number;
  truncated: boolean;
  sections_kept: string[];
}

interface PromptSection {
  /** Heading text, e.g. "PROFESSIONAL KNOWLEDGE", or a bracket block name. */
  name: string;
  priority: number;
  body: string;
}

/**
 * Prompt Budget Manager.
 *
 * The previous implementation reduced line by line, keeping any line whose text
 * matched an identity-lock pattern and discarding the rest until it fit. Because
 * the retrieved knowledge, the typography rules, the conflict hierarchy and the
 * closing render instruction matched none of those patterns, they were the first
 * things deleted — on essentially every render, since compiled prompts sat right
 * at the ceiling. Renders shipped with a prompt that had lost its knowledge
 * payload and ended mid-sentence on an orphaned list fragment.
 *
 * Reduction is now section-aware and runs in a fixed order:
 *
 *   1. Remove genuinely duplicated lines (the same instruction repeated verbatim
 *      by two layers). This alone recovers most of the overage.
 *   2. Drop whole sections, lowest priority first, never partially.
 *   3. Only if both fail, hard-truncate — and say so loudly.
 *
 * Priority follows the required KEEP order: creative intent, user constraints,
 * reference identity locks, art direction, professional knowledge, output rules.
 * Lower number = kept longer. Priority 0 is never dropped.
 */
export class PromptBudgetManagerService {
  /**
   * Ceilings are configurable because they are a provider property, not a design
   * decision. The previous 15,000 target was well under what the model accepts and
   * was being hit on every single render, which is how the knowledge payload came
   * to be discarded as routine behaviour.
   */
  public static readonly HARD_MAXIMUM = Number(process.env.PROMPT_HARD_MAXIMUM_CHARS || 24000);
  public static readonly EMERGENCY_TARGET = Number(process.env.PROMPT_TARGET_CHARS || 22000);

  /**
   * Section ranking now comes from `prompt-section-policy`, which
   * `ProviderPromptOptimizer` is checked against by the test suite.
   *
   * It used to be a private table here, and it disagreed with the optimizer's
   * on the sections that matter most: the optimizer declared ART DIRECTION and
   * COMMERCIAL LAYOUT undroppable while this service ranked them 4 and 6, and
   * this service runs second, so its opinion was the one that shipped. Measured
   * on five production prompts — art direction cut to 16 characters on four of
   * five, commercial layout gone on five of five.
   *
   * Two rankings for one prompt is the defect. The table moved; the loop below
   * did not.
   */

  public enforceBudget(
    prompt: string,
    productCount: number = 1,
    compressionMode: "HIGH" | "MEDIUM" | "CATALOG" = "HIGH"
  ): PromptBudgetManagerResult {
    const before = prompt.length;
    const removals: PromptSectionRemoval[] = [];

    // ── Pass 0: strip machine metadata that was never meant for the model ──
    let text = prompt;
    const stripPatterns: RegExp[] = [
      /confidence:?\s*0?\.\d+/gi,
      /evidence_type:?\s*[A-Z_]+/gi,
      /## RETRIEVAL EXPLANATION[\s\S]*?(?=\n##|\n#|$)/gi,
      /INTERNAL STRATEGY EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi,
      /AUDIENCE ANALYSIS EXPLANATION:[\s\S]*?(?=\n\n|\n#|$)/gi,
    ];
    stripPatterns.forEach((p) => {
      text = text.replace(p, "");
    });
    text = text.replace(/\n{3,}/g, "\n\n").trim();

    // ── Pass 1: remove duplicated instructions ────────────────────────────
    const { deduped, removedCount } = PromptBudgetManagerService.dedupeLines(text);
    text = deduped;

    if (text.length <= PromptBudgetManagerService.EMERGENCY_TARGET) {
      return this.finish(before, text, productCount, compressionMode, removals, removedCount, false);
    }

    // ── Pass 2: drop whole sections, lowest priority first ────────────────
    const sections = PromptBudgetManagerService.parseSections(text);
    const droppable = sections
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => s.priority > 0)
      .sort((a, b) => (b.s.priority - a.s.priority) || (b.index - a.index));

    const dropped = new Set<number>();
    let currentLength = text.length;

    for (const { s, index } of droppable) {
      if (currentLength <= PromptBudgetManagerService.EMERGENCY_TARGET) break;
      dropped.add(index);
      currentLength -= s.body.length;
      removals.push({
        section: s.name,
        priority: s.priority,
        chars: s.body.length,
        reason: "LOW_PRIORITY_SECTION",
      });
    }

    if (dropped.size > 0) {
      text = sections
        .filter((_, i) => !dropped.has(i))
        .map((s) => s.body)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    // ── Pass 3: last resort ───────────────────────────────────────────────
    let truncated = false;
    if (text.length > PromptBudgetManagerService.HARD_MAXIMUM) {
      text = text.slice(0, PromptBudgetManagerService.HARD_MAXIMUM).trim();
      truncated = true;
      console.error("[PROMPT_BUDGET_MANAGER][HARD_TRUNCATION]", {
        message:
          "Prompt exceeded the hard maximum even after de-duplication and section removal. Content was cut mid-section.",
        hard_maximum: PromptBudgetManagerService.HARD_MAXIMUM,
      });
    }

    return this.finish(before, text, productCount, compressionMode, removals, removedCount, truncated);
  }

  /**
   * Splits a compiled prompt into ranked sections.
   *
   * Boundaries are markdown "## HEADING" lines and bracketed block titles such as
   * "[RESOLVED ART DIRECTION]", which is how every layer in this engine labels its
   * output. Content before the first boundary belongs to the document preamble and
   * is never dropped.
   */
  private static parseSections(text: string): PromptSection[] {
    const lines = text.split("\n");
    const sections: PromptSection[] = [];
    let current: PromptSection = { name: "PREAMBLE", priority: 0, body: "" };
    /**
     * The ranking of the `## ` heading the parser is currently inside.
     *
     * A bracketed block is a CHILD of the heading above it, not a sibling of it.
     * Before this was tracked, `[RESOLVED ART DIRECTION]` was ranked by its own
     * name, matched no rule, and fell to the default 5 — so the resolved art
     * direction was thrown away ahead of content its parent outranked, and
     * `## ART DIRECTION` survived owning nothing but its own heading line.
     * Measured on five production prompts: art direction reduced to 16
     * characters on four of five, commercial layout gone entirely on five of
     * five, and `[CREATIVE & RENDER CONSTRAINTS]` dropped from inside
     * `## FINAL OUTPUT`, a section priority 0 declares undroppable.
     *
     * Null until the first heading, so a bracket that appears in the preamble
     * is ranked exactly as it was before.
     */
    let parentPriority: number | null = null;

    const flush = () => {
      if (current.body.trim()) sections.push({ ...current, body: current.body.replace(/\s+$/, "") });
    };

    for (const line of lines) {
      const heading = line.match(/^##\s+(.+?)\s*$/);
      const bracket = line.match(/^\[([A-Z0-9 &—,'\-]+)\]\s*$/);
      const name = heading ? heading[1] : bracket ? bracket[1] : null;

      if (name) {
        flush();
        // Annotated rather than inferred: `parentPriority` is assigned from this
        // constant two lines down, and without a declared type the compiler
        // reports the pair as circular (TS7022).
        const priority: number = heading
          ? this.priorityFor(name)
          : parentPriority ?? this.priorityFor(name);
        if (heading) parentPriority = priority;
        current = { name, priority, body: `${line}\n` };
      } else {
        current.body += `${line}\n`;
      }
    }
    flush();
    return sections;
  }

  private static priorityFor(name: string): number {
    // Unrecognised names fall to TIER_ORDINARY inside `tierFor`, on the same
    // reasoning the local default carried: a block emitted by a layer nobody
    // updated the table for is far more likely to be a requirement than a
    // rationale, so it outlives everything explicitly judged droppable.
    return tierFor(name);
  }

  /**
   * Drops lines that repeat an instruction already given verbatim.
   *
   * Structural lines (headings, blanks, bullets that are part of a list whose
   * meaning depends on position) are left alone; only substantive repeated
   * sentences are collapsed.
   */
  private static dedupeLines(text: string): { deduped: string; removedCount: number } {
    const seen = new Set<string>();
    const out: string[] = [];
    let removedCount = 0;

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      const isStructural =
        trimmed.length === 0 ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("```") ||
        trimmed.length < 40;

      if (isStructural) {
        out.push(line);
        continue;
      }

      const key = trimmed.toLowerCase().replace(/[^a-z0-9à-ỹ]+/gi, " ").trim();
      if (seen.has(key)) {
        removedCount++;
        continue;
      }
      seen.add(key);
      out.push(line);
    }

    return { deduped: out.join("\n").replace(/\n{3,}/g, "\n\n"), removedCount };
  }

  private finish(
    before: number,
    text: string,
    productCount: number,
    compressionMode: "HIGH" | "MEDIUM" | "CATALOG",
    removals: PromptSectionRemoval[],
    duplicateLinesRemoved: number,
    truncated: boolean
  ): PromptBudgetManagerResult {
    let identity_chars = 0;
    let knowledge_chars = 0;
    text.split("\n").forEach((line) => {
      const t = line.trim();
      if (
        t.includes("PRODUCT IDENTITY LOCK") ||
        t.includes("LOGO PRESERVATION") ||
        t.includes("[REF CONTROL]") ||
        t.includes("PRODUCT MANIFEST") ||
        t.includes("LOCK [PRODUCT_") ||
        t.includes("REFERENCE IDENTITY LOCK")
      ) {
        identity_chars += line.length;
      } else if (t.includes("KNOWLEDGE") || t.includes("RETRIEVED")) {
        knowledge_chars += line.length;
      }
    });

    const sections_kept = PromptBudgetManagerService.parseSections(text).map((s) => s.name);

    const result: PromptBudgetManagerResult = {
      before,
      after: text.length,
      identity_chars,
      knowledge_chars,
      product_count: productCount,
      compression_mode: compressionMode,
      final_prompt: text,
      removals,
      duplicate_lines_removed: duplicateLinesRemoved,
      truncated,
      sections_kept,
    };

    console.log("[PROMPT_BUDGET_MANAGER]", {
      before: result.before,
      after: result.after,
      duplicate_lines_removed: duplicateLinesRemoved,
      sections_removed: removals.map((r) => `${r.section} (p${r.priority}, -${r.chars}ch)`),
      truncated,
      identity_chars,
      knowledge_chars,
      product_count: productCount,
      compression_mode: compressionMode,
    });

    if (removals.length > 0) {
      console.warn("[PROMPT_BUDGET_MANAGER][SECTIONS_REMOVED]", {
        message: "Prompt exceeded budget. These sections were dropped whole, lowest priority first.",
        removed: removals,
      });
    }

    return result;
  }
}
