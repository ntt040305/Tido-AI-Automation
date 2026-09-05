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
   * Section priority. Anything unrecognised defaults to 5, so a new section is
   * treated as ordinary content rather than silently becoming the first casualty.
   */
  private static readonly SECTION_PRIORITY: { match: RegExp; priority: number }[] = [
    // 0 — control scaffolding. Without these the model does not know what to emit.
    { match: /^ROLE$/i, priority: 0 },
    { match: /^CONFLICT PRIORITY$/i, priority: 0 },
    { match: /^FINAL OUTPUT$/i, priority: 0 },

    // 1 — what the client actually asked for.
    { match: /^CREATIVE INTENT$/i, priority: 1 },

    // 2 — hard user constraints, including authorized copy.
    { match: /^USER HARD REQUIREMENTS$/i, priority: 2 },
    { match: /^TYPOGRAPHY & READABLE COPY$/i, priority: 2 },

    // 3 — reference identity locks.
    { match: /^PRODUCT INSTANCE REQUIREMENTS$/i, priority: 3 },
    { match: /^INSPIRATION REFERENCE — SUBJECT LOCK$/i, priority: 3 },
    { match: /^REFERENCE SEMANTICS$/i, priority: 3 },

    // 4 — the single resolved art direction.
    { match: /^ART DIRECTION$/i, priority: 4 },

    // 5 — retrieved professional knowledge.
    { match: /^PROFESSIONAL KNOWLEDGE$/i, priority: 5 },

    // 6 — output rules and format layout.
    { match: /^COMMERCIAL LAYOUT$/i, priority: 6 },
    { match: /^OUTPUT CONTEXT$/i, priority: 6 },
    { match: /^CREATIVE EXECUTION$/i, priority: 6 },
    { match: /^CREATIVE & RENDER CONSTRAINTS$/i, priority: 6 },

    // 7 — campaign framing. Valuable, but the image still reads without it.
    { match: /^CAMPAIGN STRATEGY$/i, priority: 7 },
    { match: /^BRAND KNOWLEDGE$/i, priority: 7 },
  ];

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

    const flush = () => {
      if (current.body.trim()) sections.push({ ...current, body: current.body.replace(/\s+$/, "") });
    };

    for (const line of lines) {
      const heading = line.match(/^##\s+(.+?)\s*$/);
      const bracket = line.match(/^\[([A-Z0-9 &—,'\-]+)\]\s*$/);
      const name = heading ? heading[1] : bracket ? bracket[1] : null;

      if (name) {
        flush();
        current = { name, priority: this.priorityFor(name), body: `${line}\n` };
      } else {
        current.body += `${line}\n`;
      }
    }
    flush();
    return sections;
  }

  private static priorityFor(name: string): number {
    const clean = name.replace(/^\[|\]$/g, "").trim();
    for (const rule of this.SECTION_PRIORITY) {
      if (rule.match.test(clean)) return rule.priority;
    }
    // Bracketed blocks emitted by services carry identity or constraint content
    // far more often than not, so an unknown one is treated as ordinary content
    // rather than as the first thing to throw away.
    return 5;
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
