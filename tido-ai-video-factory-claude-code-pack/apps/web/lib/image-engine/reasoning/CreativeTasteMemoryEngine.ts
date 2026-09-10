import { CreativeTasteMemory } from "./CreativeTasteMemory";
import { RankedIdea, TastePattern } from "./creative-taste.types";

/**
 * CIOS Phase 4.0.4.1 — the learning loop, and the fence around it.
 *
 *   result → pattern → success / failure → future weighting
 *
 * Why this is fenced rather than free
 * ----------------------------------
 * I argued against this twice in earlier phases and the argument still holds, so
 * it is worth stating rather than quietly overriding: every score this system
 * produces is a proxy, and a loop that optimises freely against proxies finds
 * their blind spots rather than better work. Left open, it would learn to write
 * whatever the regular expressions like.
 *
 * So the loop is built with four constraints, each of which the code enforces:
 *
 *   1. **It weights selection, never evaluation.** The rubrics are untouched. A
 *      weight can only change which construction is *tried first* among ones
 *      that already exist; it cannot change what counts as good, and it cannot
 *      invent a construction.
 *   2. **A minimum sample.** A pattern seen fewer than `MIN_OBSERVATIONS` times
 *      carries no weight at all. Four observations of a template is not
 *      evidence; it is the run's first four briefs.
 *   3. **A hard cap.** `MAX_INFLUENCE` bounds how far any weight can move a
 *      candidate, so a construction that happens to suit the proxies cannot take
 *      over a run however long it goes on.
 *   4. **It is auditable and reversible.** Every weight reports the evidence
 *      behind it, and `reset()` returns the engine to neutral. A loop you cannot
 *      inspect or switch off is not a loop, it is drift.
 *
 * What it is honestly for
 * ----------------------
 * Two things it can do well: retire a construction that fails consistently for a
 * *named* reason, and stop the run from re-trying one that has failed the same
 * way twenty times. Both are bookkeeping, and bookkeeping is genuinely useful.
 *
 * What it cannot do is discover a better construction, because it has no way to
 * make one. That still needs an author.
 */

/** Below this a pattern carries no weight. */
export const MIN_OBSERVATIONS = 5;
/** The furthest any learned weight can move a candidate, in either direction. */
export const MAX_INFLUENCE = 0.15;

export interface PatternWeight {
  pattern: string;
  /** 1.0 is neutral. Bounded to 1 ± MAX_INFLUENCE. */
  weight: number;
  observations: number;
  success_rate: number;
  /** Why this weight is what it is. */
  evidence: string;
  /** The failure this construction keeps hitting, when there is one. */
  recurring_failure?: string;
}

export interface LearningReport {
  patterns_observed: number;
  patterns_weighted: number;
  promoted: PatternWeight[];
  demoted: PatternWeight[];
  /** Constructions that failed the same way often enough to retire. */
  retire: { pattern: string; reason: string; count: number }[];
  notes: string[];
}

export class CreativeTasteMemoryEngine {
  private readonly memory: CreativeTasteMemory;
  private weights = new Map<string, PatternWeight>();

  constructor(memory?: CreativeTasteMemory) {
    this.memory = memory || new CreativeTasteMemory();
  }

  public store(): CreativeTasteMemory {
    return this.memory;
  }

  /** Records one outcome. Same contract as the memory it wraps. */
  public record(entry: { case_id: string; ranked: RankedIdea; approved: boolean }): void {
    this.memory.record(entry);
  }

  /**
   * Turns what happened into weights.
   *
   * Called between runs rather than during one: weighting mid-run would make an
   * idea's treatment depend on how many briefs happened to precede it, which is
   * not a property of the idea.
   */
  public learn(): LearningReport {
    const patterns = this.memory.patterns(MIN_OBSERVATIONS);
    const notes: string[] = [];
    this.weights = new Map();

    for (const p of patterns) {
      const observations = p.approved + p.failed;
      // Centre on the run's own base rate rather than on 0.5. A run where one
      // idea in six is approved should not demote every construction in it.
      const base = this.baseRate();
      const delta = clamp(p.success_rate - base, -1, 1);
      const weight = 1 + delta * MAX_INFLUENCE;

      this.weights.set(p.pattern, {
        pattern: p.pattern,
        weight: Number(weight.toFixed(4)),
        observations,
        success_rate: p.success_rate,
        evidence:
          `${p.approved} of ${observations} approved, against a run base rate of ${base.toFixed(2)}`,
        recurring_failure: p.common_failure,
      });
    }

    const all = [...this.weights.values()];
    const promoted = all.filter((w) => w.weight > 1).sort((a, b) => b.weight - a.weight);
    const demoted = all.filter((w) => w.weight < 1).sort((a, b) => a.weight - b.weight);

    // A construction that has failed the same way often enough is worth
    // retiring by hand. The engine names it and does not remove it: deleting a
    // template on proxy evidence is the decision this loop must not make alone.
    const retire = this.retirementCandidates(patterns);

    if (patterns.length === 0) {
      notes.push(
        `No pattern has been seen ${MIN_OBSERVATIONS} times yet, so nothing carries weight. ` +
          "This is the expected state on a short run."
      );
    }
    notes.push(
      `Weights are bounded to ±${(MAX_INFLUENCE * 100).toFixed(0)}% and affect selection order only. ` +
        "No rubric is changed by anything in this report."
    );

    return {
      patterns_observed: this.memory.patterns(1).length,
      patterns_weighted: this.weights.size,
      promoted,
      demoted,
      retire,
      notes,
    };
  }

  /**
   * The multiplier for a candidate, for use in selection.
   *
   * Returns exactly 1 for anything unweighted, so a caller that has not learned
   * anything behaves identically to one without this engine at all.
   */
  public weightFor(idea: string): number {
    const pattern = CreativeTasteMemory.patternOf(idea);
    return this.weights.get(pattern)?.weight ?? 1;
  }

  /** Every weight, for inspection. A loop you cannot audit is drift. */
  public allWeights(): PatternWeight[] {
    return [...this.weights.values()].sort((a, b) => b.weight - a.weight);
  }

  /** Returns to neutral. A loop you cannot switch off is drift too. */
  public reset(): void {
    this.weights = new Map();
    this.memory.reset();
  }

  /** The share of recorded ideas that were approved. */
  private baseRate(): number {
    const total = this.memory.size();
    if (!total) return 0.5;
    return this.memory.approved().length / total;
  }

  private retirementCandidates(patterns: TastePattern[]): { pattern: string; reason: string; count: number }[] {
    const out: { pattern: string; reason: string; count: number }[] = [];
    for (const p of patterns) {
      if (p.success_rate >= 0.15 || !p.common_failure) continue;
      if (p.failed < MIN_OBSERVATIONS * 2) continue;
      out.push({ pattern: p.pattern, reason: p.common_failure, count: p.failed });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  public format(report: LearningReport): string {
    const L = [
      `TASTE LEARNING — ${report.patterns_observed} constructions seen, ${report.patterns_weighted} weighted`,
    ];
    if (report.promoted.length) {
      L.push("  promoted (tried earlier next run):");
      for (const w of report.promoted.slice(0, 3)) {
        L.push(`    ×${w.weight.toFixed(3)}  ${w.pattern.slice(0, 46)}  — ${w.evidence}`);
      }
    }
    if (report.demoted.length) {
      L.push("  demoted (tried later):");
      for (const w of report.demoted.slice(0, 3)) {
        L.push(
          `    ×${w.weight.toFixed(3)}  ${w.pattern.slice(0, 40)}  — ${w.recurring_failure || "no single reason"}`
        );
      }
    }
    if (report.retire.length) {
      L.push("  worth retiring by hand:");
      for (const r of report.retire.slice(0, 3)) {
        L.push(`    ${String(r.count).padStart(3)}×  ${r.pattern.slice(0, 40)}  (${r.reason})`);
      }
    }
    L.push("");
    L.push(`  note: weights are bounded to ±${(MAX_INFLUENCE * 100).toFixed(0)}% and change selection order only.`);
    L.push("        No rubric is altered, no construction is invented, and nothing is deleted");
    L.push("        automatically. A loop optimising freely against proxies would find their");
    L.push("        blind spots rather than better work; this one does bookkeeping.");
    return L.join("\n");
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
