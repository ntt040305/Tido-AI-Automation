import { RankedIdea, TasteMemoryEntry, TastePattern } from "./creative-taste.types";

/**
 * CIOS Phase 4.0.4 — what the run learned about its own output.
 *
 * What this is for, and what it is not
 * -----------------------------------
 * It records which ideas were approved, which failed, and why, and reduces each
 * to the construction it came from so that patterns become countable. After a
 * hundred briefs it can say things like: the confession frame is approved four
 * times in five and the hidden-cost frame fails the copy test more often than it
 * passes.
 *
 * It is **not** a learning loop, and calling it one would be the overclaim of
 * this phase. Nothing here feeds back into generation. The patterns are a
 * *report* — evidence for a person deciding which constructions to keep, not a
 * weight the engine adjusts on its own. An automatic feedback loop over proxy
 * scores would optimise the templates against the metric's blind spots, which is
 * the failure this codebase has now avoided three times deliberately.
 *
 * On `pattern`
 * -----------
 * An idea reduces to its construction by replacing every content word with a
 * marker, leaving the frame. "The failure was never women; it is a category
 * where..." and "The failure was never men; it is a category where..." reduce to
 * the same pattern, which is exactly what makes the count meaningful.
 */

export class CreativeTasteMemory {
  private readonly entries: TasteMemoryEntry[] = [];

  /**
   * Reduces an idea to its construction.
   *
   * Content words become markers; the function words and punctuation that make
   * the frame are kept. Two ideas from the same template reduce identically
   * however different their material.
   */
  public static patternOf(idea: string): string {
    return String(idea || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s;:,—-]/g, "")
      .split(/\s+/)
      .map((w) =>
        FUNCTION_WORDS.has(w) || w.length <= 3 ? w : "·"
      )
      .join(" ")
      .replace(/(?:· )+·/g, "·")
      .trim()
      .slice(0, 70);
  }

  /** Records one ranked idea's outcome. */
  public record(entry: {
    case_id: string;
    ranked: RankedIdea;
    approved: boolean;
  }): void {
    const { ranked } = entry;
    const failure_reasons: string[] = [];

    for (const f of ranked.stress.failures) failure_reasons.push(`stress:${f}`);
    for (const [dim, v] of Object.entries(ranked.director.dimensions)) {
      if (v < 0.4) failure_reasons.push(`director:${dim}`);
    }
    for (const [dim, v] of Object.entries(ranked.taste.dimensions)) {
      if (v < 0.35) failure_reasons.push(`taste:${dim}`);
    }

    this.entries.push({
      idea: ranked.idea,
      case_id: entry.case_id,
      territory: ranked.territory,
      mode: ranked.mode,
      score: ranked.score,
      approved: entry.approved,
      failure_reasons,
      pattern: CreativeTasteMemory.patternOf(ranked.idea),
    });
  }

  public approved(): TasteMemoryEntry[] {
    return this.entries.filter((e) => e.approved);
  }

  public failed(): TasteMemoryEntry[] {
    return this.entries.filter((e) => !e.approved);
  }

  /** Why work failed, most common first. */
  public failureReasons(): { reason: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const e of this.failed()) {
      for (const r of e.failure_reasons) counts.set(r, (counts.get(r) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Which constructions work, and which do not.
   *
   * Only patterns seen more than once are returned: a construction with a single
   * appearance has a success rate of 0 or 1 and neither means anything.
   */
  public patterns(minAppearances = 2): TastePattern[] {
    const byPattern = new Map<string, TasteMemoryEntry[]>();
    for (const e of this.entries) {
      const list = byPattern.get(e.pattern) || [];
      list.push(e);
      byPattern.set(e.pattern, list);
    }

    const out: TastePattern[] = [];
    for (const [pattern, list] of byPattern) {
      if (list.length < minAppearances) continue;
      const approved = list.filter((e) => e.approved).length;
      const failures = new Map<string, number>();
      for (const e of list.filter((x) => !x.approved)) {
        for (const r of e.failure_reasons) failures.set(r, (failures.get(r) || 0) + 1);
      }
      const top = [...failures.entries()].sort((a, b) => b[1] - a[1])[0];
      out.push({
        pattern,
        approved,
        failed: list.length - approved,
        success_rate: Number((approved / list.length).toFixed(3)),
        common_failure: top ? top[0] : undefined,
      });
    }
    return out.sort((a, b) => b.success_rate - a.success_rate || b.approved - a.approved);
  }

  /** Constructions worth keeping, on the evidence so far. */
  public successPatterns(): TastePattern[] {
    return this.patterns().filter((p) => p.success_rate >= 0.6);
  }

  /** Constructions that fail more often than they work. */
  public failurePatterns(): TastePattern[] {
    return this.patterns().filter((p) => p.success_rate < 0.4);
  }

  public size(): number {
    return this.entries.length;
  }

  public reset(): void {
    this.entries.length = 0;
  }

  public format(): string {
    const approved = this.approved().length;
    const failed = this.failed().length;
    const reasons = this.failureReasons().slice(0, 5);
    const good = this.successPatterns();
    const bad = this.failurePatterns();

    const L = [
      `TASTE MEMORY — ${this.size()} ideas · ${approved} approved · ${failed} failed`,
      "  top failure reasons:",
    ];
    for (const r of reasons) L.push(`    ${String(r.count).padStart(3)}  ${r.reason}`);
    L.push(`  constructions that work  : ${good.length}`);
    for (const p of good.slice(0, 3)) {
      L.push(`    ${(p.success_rate * 100).toFixed(0)}%  ${p.pattern.slice(0, 56)}`);
    }
    L.push(`  constructions that do not: ${bad.length}`);
    for (const p of bad.slice(0, 3)) {
      L.push(`    ${(p.success_rate * 100).toFixed(0)}%  ${p.pattern.slice(0, 44)}  (${p.common_failure || "—"})`);
    }
    L.push("");
    L.push("  note: a report, not a learning loop. Nothing here feeds back into generation.");
    L.push("        Adjusting the templates automatically against these proxy scores would tune");
    L.push("        them to the metrics' blind spots; the patterns are evidence for a person.");
    return L.join("\n");
  }
}

/** Kept when reducing an idea to its frame. */
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "and", "but", "or", "not", "no", "is", "are", "was", "were",
  "be", "been", "it", "its", "this", "that", "these", "those", "they", "them",
  "their", "there", "here", "what", "who", "whom", "which", "when", "where",
  "why", "how", "will", "would", "can", "could", "shall", "should", "may",
  "might", "must", "have", "has", "had", "do", "does", "did", "of", "to", "in",
  "on", "at", "by", "for", "with", "from", "into", "onto", "than", "then",
  "because", "while", "before", "after", "until", "unless", "rather", "instead",
  "never", "always", "still", "yet", "only", "even", "just", "more", "most",
  "less", "least", "very", "so", "too", "as", "if", "about", "over", "under",
  "up", "down", "out", "off", "again", "once", "all", "any", "both", "each",
  "few", "many", "some", "such", "own", "same", "one", "two",
]);
