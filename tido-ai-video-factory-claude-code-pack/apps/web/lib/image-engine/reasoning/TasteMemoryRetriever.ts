import { PatternExtractor } from "./PatternExtractor";
import { CreativeDirectorDecisionEngine, DirectorDecision } from "./CreativeDirectorDecisionEngine";
import {
  CREATIVE_STRUCTURES,
  CreativeStructure,
  MAX_GUIDED_SHARE,
  MIN_CONTEXT_OBSERVATIONS,
  SATURATION_SHARE,
  TasteGuidance,
  TasteMemoryRecord,
} from "./creative-patterns.types";
import { RankedIdea } from "./creative-taste.types";

/**
 * CIOS Phase 4.0.5 — a memory of judgement, and the fence around using it.
 *
 * What it stores
 * -------------
 * Every director decision, with the structures the idea used, the director's own
 * reasons on both sides, and the context that makes a future match meaningful:
 * industry, brand, motivation family, territory. Storing outcomes alone would
 * let the memory rank structures and never explain them.
 *
 * What retrieval does, and the three things that stop it becoming a formula
 * -----------------------------------------------------------------------
 * The requirement is that memory *guides* creativity rather than manufacturing
 * it, and that is a real tension: a memory of what worked, applied without
 * restraint, is a formula by definition. Three constraints, each enforced here
 * rather than intended:
 *
 *   1. **A novelty reserve.** `MAX_GUIDED_SHARE` caps how much of generation any
 *      guidance may touch. Some proportion of every run is always unguided, so
 *      the memory cannot close the search space it was meant to inform.
 *   2. **Saturation suppression.** A structure this run has already leaned on
 *      past `SATURATION_SHARE` is reported as saturated *even when it is
 *      succeeding*. Success is exactly when a structure is most likely to take
 *      over a run, so that is when the brake has to be strongest.
 *   3. **Untried structures are surfaced, not hidden.** Retrieval returns what
 *      has no record alongside what has a good one. A memory that only returns
 *      winners narrows every run it touches.
 *
 * And one thing retrieval never does: it does not score. Guidance changes the
 * order in which structures are *tried*. Every rubric downstream is untouched,
 * which is the same line Phase 4.0.4.1's learning loop drew and for the same
 * reason — a loop optimising freely against proxies finds their blind spots.
 */

export class TasteMemoryRetriever {
  private readonly records: TasteMemoryRecord[] = [];

  // ── Capture ─────────────────────────────────────────────────────────────

  /**
   * Records one director decision.
   *
   * The reasons are taken from the decision's own chain rather than re-derived,
   * so the memory cannot disagree with the decision it is remembering.
   */
  public capture(
    decision: DirectorDecision,
    ranked: RankedIdea,
    context: { industry: string; brand: string; family: string; human_truth?: string }
  ): void {
    const why_worked = decision.chain
      .filter((c) => c.verdict === "SUPPORTS")
      .map((c) => `${c.stage}: ${c.finding}`);
    const why_failed = decision.chain
      .filter((c) => c.verdict !== "SUPPORTS")
      .map((c) => `${c.stage} ${c.verdict === "BLOCKS" ? "blocked" : "weakened"}: ${c.finding}`);

    this.records.push({
      case_id: decision.case_id,
      idea: decision.idea,
      decision: decision.decision,
      structures: PatternExtractor.extract(decision.idea, {
        human_truth: context.human_truth,
        tension: null,
      }),
      why_worked,
      why_failed,
      blocked_at: decision.chain.find((c) => c.verdict === "BLOCKS")?.stage,
      context: {
        industry: context.industry,
        brand: context.brand,
        family: context.family,
        territory: decision.territory,
      },
      score: ranked.score,
      interpretation_band: decision.interpretation.band,
    });
  }

  public size(): number {
    return this.records.length;
  }

  public all(): TasteMemoryRecord[] {
    return [...this.records];
  }

  public reset(): void {
    this.records.length = 0;
  }

  // ── Retrieval ───────────────────────────────────────────────────────────

  /**
   * What the memory has to say before this brief is generated.
   *
   * `runSoFar` is the structures already used in the current run, which is what
   * saturation is measured against. Passing it is not optional in practice: a
   * retrieval without it can only suggest, and suggestion without suppression is
   * how a memory becomes a formula.
   */
  public retrieve(
    context: { industry?: string; family?: string; brand?: string },
    runSoFar: CreativeStructure[] = []
  ): TasteGuidance {
    const notes: string[] = [];

    // Matching is by industry and motivation family, in that order of
    // preference. A structure that worked on a clinic brief transfers to another
    // clinic brief more reliably than to a coffee one.
    const matches = this.records.filter(
      (r) =>
        (!context.industry || r.context.industry === context.industry) ||
        (!!context.family && r.context.family === context.family)
    );

    if (matches.length < MIN_CONTEXT_OBSERVATIONS) {
      notes.push(
        `Only ${matches.length} decision(s) recorded in this context, below the floor of ` +
          `${MIN_CONTEXT_OBSERVATIONS}. Declining to guide rather than guiding on noise.`
      );
      return {
        suggested: [],
        saturated: this.saturation(runSoFar),
        untried: [...CREATIVE_STRUCTURES],
        novelty_reserve: 1,
        confident: false,
        notes,
      };
    }

    // ── What has worked here ───────────────────────────────────────────
    const stats = new Map<CreativeStructure, { worked: number; total: number }>();
    for (const r of matches) {
      const worked = r.decision !== "REJECT";
      for (const s of r.structures) {
        const cur = stats.get(s.structure) || { worked: 0, total: 0 };
        cur.total++;
        if (worked) cur.worked++;
        stats.set(s.structure, cur);
      }
    }

    const suggested = [...stats.entries()]
      .filter(([, v]) => v.total >= 2)
      .map(([structure, v]) => ({
        structure,
        success_rate: Number((v.worked / v.total).toFixed(3)),
        evidence: `${v.worked} of ${v.total} survived the director in this context`,
      }))
      .filter((x) => x.success_rate > 0.2)
      .sort((a, b) => b.success_rate - a.success_rate);

    const saturated = this.saturation(runSoFar);
    const seen = new Set(stats.keys());
    const untried = CREATIVE_STRUCTURES.filter((s) => !seen.has(s));

    if (untried.length) {
      notes.push(
        `${untried.length} structure(s) have no record here and are returned alongside the ` +
          "suggestions rather than filtered out."
      );
    }
    for (const s of saturated) {
      notes.push(
        `${s.structure} is at ${(s.share * 100).toFixed(0)}% of this run and is suppressed — ` +
          "success is exactly when a structure is most likely to take over."
      );
    }

    // The reserve shrinks as evidence accumulates and never reaches zero.
    const novelty_reserve = Number(Math.max(1 - MAX_GUIDED_SHARE, 1 - matches.length / 40).toFixed(3));
    notes.push(
      `${(novelty_reserve * 100).toFixed(0)}% of generation stays unguided. A memory that guided ` +
        "everything would close the search space it exists to inform."
    );

    return { suggested, saturated, untried, novelty_reserve, confident: true, notes };
  }

  /** Structures the current run has leaned on past the saturation share. */
  private saturation(runSoFar: CreativeStructure[]): { structure: CreativeStructure; share: number }[] {
    if (!runSoFar.length) return [];
    const counts = new Map<CreativeStructure, number>();
    for (const s of runSoFar) counts.set(s, (counts.get(s) || 0) + 1);
    return [...counts.entries()]
      .map(([structure, n]) => ({ structure, share: n / runSoFar.length }))
      .filter((x) => x.share > SATURATION_SHARE)
      .sort((a, b) => b.share - a.share);
  }

  /**
   * The order structures should be *tried* in, given guidance.
   *
   * Not a filter and not a score. Everything stays available; suggested
   * structures move earlier, saturated ones move later, and the untried are
   * deliberately placed above the saturated rather than at the end — a structure
   * nobody has tried here is more interesting than one this run has exhausted.
   */
  public static order(guidance: TasteGuidance): CreativeStructure[] {
    if (!guidance.confident) return [...CREATIVE_STRUCTURES];
    const rank = new Map<CreativeStructure, number>();
    CREATIVE_STRUCTURES.forEach((s, i) => rank.set(s, i));

    const score = (s: CreativeStructure): number => {
      const suggestion = guidance.suggested.find((x) => x.structure === s);
      const saturatedBy = guidance.saturated.find((x) => x.structure === s);
      let v = 0;
      if (suggestion) v -= suggestion.success_rate * 10;
      if (guidance.untried.includes(s)) v -= 2;
      if (saturatedBy) v += saturatedBy.share * 12;
      return v + (rank.get(s) ?? 0) * 0.01;
    };

    return [...CREATIVE_STRUCTURES].sort((a, b) => score(a) - score(b));
  }

  // ── Reporting ───────────────────────────────────────────────────────────

  public aggregate(): {
    records: number;
    pursue: number;
    modify: number;
    reject: number;
    by_structure: { structure: CreativeStructure; worked: number; total: number; rate: number }[];
    top_failure: string;
    contexts: number;
  } {
    const stats = new Map<CreativeStructure, { worked: number; total: number }>();
    const failures = new Map<string, number>();
    const contexts = new Set<string>();

    for (const r of this.records) {
      contexts.add(`${r.context.industry}/${r.context.family}`);
      for (const s of r.structures) {
        const cur = stats.get(s.structure) || { worked: 0, total: 0 };
        cur.total++;
        if (r.decision !== "REJECT") cur.worked++;
        stats.set(s.structure, cur);
      }
      for (const f of r.why_failed) {
        const stage = f.split(" ")[0];
        failures.set(stage, (failures.get(stage) || 0) + 1);
      }
    }

    const top = [...failures.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      records: this.records.length,
      pursue: this.records.filter((r) => r.decision === "PURSUE").length,
      modify: this.records.filter((r) => r.decision === "MODIFY").length,
      reject: this.records.filter((r) => r.decision === "REJECT").length,
      by_structure: [...stats.entries()]
        .map(([structure, v]) => ({
          structure,
          worked: v.worked,
          total: v.total,
          rate: Number((v.worked / v.total).toFixed(3)),
        }))
        .sort((a, b) => b.rate - a.rate || b.total - a.total),
      top_failure: top ? `${top[0]} (${top[1]})` : "none",
      contexts: contexts.size,
    };
  }

  public format(): string {
    const agg = this.aggregate();
    const L = [
      `TASTE MEMORY — ${agg.records} decisions across ${agg.contexts} contexts`,
      `  pursue ${agg.pursue} · modify ${agg.modify} · reject ${agg.reject}`,
      "  structures, by how often they survived the director:",
    ];
    for (const s of agg.by_structure) {
      L.push(`    ${(s.rate * 100).toFixed(0).padStart(3)}%  ${s.structure.padEnd(26)} ${s.worked}/${s.total}`);
    }
    L.push(`  most common failure stage : ${agg.top_failure}`);
    L.push("");
    L.push("  note: guidance changes the order structures are tried in and nothing else. No rubric");
    L.push(`        is altered, saturated structures are suppressed even while succeeding, and at`);
    L.push(`        least ${((1 - MAX_GUIDED_SHARE) * 100).toFixed(0)}% of generation stays unguided.`);
    return L.join("\n");
  }
}

/** Re-exported so callers need one import for the capture side. */
export type { DirectorDecision };
export { CreativeDirectorDecisionEngine };
