import { CreativeTasteGraph } from "./CreativeTasteGraph";
import { EmotionalMechanismExtractor } from "./EmotionalMechanismExtractor";
import { PatternExtractor } from "./PatternExtractor";
import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { RankedIdea } from "./creative-taste.types";
import {
  AttentionFlag,
  AttentionReport,
  MIN_PAIRING_OBSERVATIONS,
  UNDERRATED_MIN_CONFIDENCE,
  UNDERRATED_MIN_RANK,
} from "./emotional-mechanism.types";

/**
 * CIOS Phase 4.0.6 — a second look, beside the ranking.
 *
 * The constraint, and why it is the right one
 * ------------------------------------------
 * The phase is explicit: do not change the ranking score, do not override the
 * metrics. That is correct and it is not a limitation. An attention layer
 * permitted to move a score would be a second ranking wearing a different name,
 * and when the two disagreed there would be no principled way to say which was
 * right — you would have replaced one number you could interrogate with two you
 * could not.
 *
 * So this produces a *list beside the list*. The ranking answers "what scored
 * best". This answers "what is worth a second look, and why". A director reads
 * both, and the reason travels with the flag so they can dismiss it in a second
 * if they disagree.
 *
 * The three detectors
 * ------------------
 *   UNDERRATED_MECHANISM   Scored low, and the emotional mechanism behind it is
 *                          stronger than anything above it. The rubrics measure
 *                          properties of a sentence; a mechanism is why a person
 *                          would keep it, and those come apart.
 *   HISTORICALLY_LOVED     This structure-and-mechanism pairing has a record of
 *                          surviving directors in the graph.
 *   UNUSUAL_COMBINATION    Nothing in the graph has ever paired these. Absence
 *                          is the signal, and it is the anti-repetition
 *                          detector: the only one that rewards a thing for
 *                          never having been done.
 *
 * On not becoming a formula
 * ------------------------
 * `HISTORICALLY_LOVED` is the detector that could turn this into one, so it is
 * the most constrained: it needs `MIN_PAIRING_OBSERVATIONS` before it will fire,
 * it reports its sample size in the reason, and it is capped at one flag per
 * case. `UNUSUAL_COMBINATION` pulls the other way by construction — it can only
 * fire on something the system has not done before — and the two are deliberately
 * left in tension rather than blended into a score that would hide it.
 */

export class CreativeDirectorAttentionEngine {
  /**
   * What a director should look at besides the winner.
   *
   * Reads the ranking; never writes to it. The returned flags reference ideas by
   * text and rank, and nothing here mutates a `RankedIdea`.
   */
  public static review(
    ranked: RankedIdea[],
    graph: CreativeTasteGraph,
    context: {
      case_id: string;
      human_truth?: string;
      tension?: DynamicHumanTension | null;
    }
  ): AttentionReport {
    const notes: string[] = [];
    const flags: AttentionFlag[] = [];

    if (!ranked.length) {
      return { case_id: context.case_id, top_by_score: "", flags, notes: ["Nothing to review."] };
    }

    const read = ranked.map((r) => ({
      ranked: r,
      structure: PatternExtractor.dominant(r.idea, {
        human_truth: context.human_truth,
        tension: context.tension,
      }),
      mechanism: EmotionalMechanismExtractor.extract(r.idea, {
        human_truth: context.human_truth,
        tension: context.tension,
      }),
    }));

    const top = read[0];

    // ── 1. Underrated mechanism ────────────────────────────────────────
    // A lower-ranked idea whose mechanism rests on more of its own evidence
    // than the winner's does. The rubrics score properties of a sentence; a
    // mechanism is why a person would keep it, and the two come apart.
    for (const r of read) {
      if (r.ranked.rank < UNDERRATED_MIN_RANK) continue;
      if (!r.mechanism.mechanism) continue;
      // Two conditions, and the absolute one matters more.
      //
      // A purely relative test fired on 111 of 458 ideas, because most winners
      // carry a weak mechanism and almost anything clears "better than that". A
      // detector that fires on a quarter of everything is not attention, it is
      // noise with a label. The floor makes the flag mean the mechanism is
      // strong, not merely stronger.
      const strongInItself = r.mechanism.confidence >= UNDERRATED_MIN_CONFIDENCE;
      const strongerThanTop = r.mechanism.confidence > top.mechanism.confidence + 0.24;
      if (!strongInItself || !strongerThanTop) continue;
      flags.push({
        kind: "UNDERRATED_MECHANISM",
        idea: r.ranked.idea,
        rank: r.ranked.rank,
        reason:
          `Ranked ${r.ranked.rank} on score, and it carries its own ${r.mechanism.mechanism} — ` +
          `${r.mechanism.reason} The idea above it leans on material it does not contain.`,
        confidence: Number(Math.min(1, r.mechanism.confidence).toFixed(3)),
      });
    }

    // ── 2. Historically loved ──────────────────────────────────────────
    // The detector most able to become a formula, so the most constrained:
    // evidence floor, sample size in the reason, one flag per case.
    let lovedFlagged = false;
    for (const r of read) {
      if (lovedFlagged) break;
      if (!r.structure || !r.mechanism.mechanism) continue;
      const record = graph.pairing(r.structure, r.mechanism.mechanism);
      if (record.total < MIN_PAIRING_OBSERVATIONS || record.rate < 0.6) continue;
      // A pairing that is already the top-ranked idea needs no second look.
      if (r.ranked.rank === 1) continue;
      flags.push({
        kind: "HISTORICALLY_LOVED",
        idea: r.ranked.idea,
        rank: r.ranked.rank,
        reason:
          `${r.structure} carrying ${r.mechanism.mechanism} has survived ${record.kept} of ` +
          `${record.total} times in this run. Small sample, and worth a look.`,
        confidence: Number(Math.min(0.8, record.rate * (record.total / 10)).toFixed(3)),
      });
      lovedFlagged = true;
    }

    // ── 3. Unusual combination ─────────────────────────────────────────
    // The anti-repetition detector, and the only one that rewards a thing for
    // never having been done. Fires only once the graph is large enough for
    // "never" to mean anything.
    if (graph.size() >= MIN_PAIRING_OBSERVATIONS * 3) {
      for (const r of read) {
        if (!r.structure || !r.mechanism.mechanism) continue;
        if (!graph.isNovelPairing(r.structure, r.mechanism.mechanism)) continue;
        flags.push({
          kind: "UNUSUAL_COMBINATION",
          idea: r.ranked.idea,
          rank: r.ranked.rank,
          reason:
            `Nothing in ${graph.size()} paths has paired ${r.structure} with ${r.mechanism.mechanism}. ` +
            "That is either a gap worth filling or a combination that does not work; both are worth knowing.",
          confidence: 0.5,
        });
        break;
      }
    } else {
      notes.push(
        `The graph holds ${graph.size()} paths, too few for "never been paired" to mean anything. ` +
          "The novelty detector is off."
      );
    }

    if (!flags.length) {
      notes.push("Nothing here the ranking did not already say.");
    }

    return { case_id: context.case_id, top_by_score: ranked[0].idea, flags, notes };
  }

  public static aggregate(reports: AttentionReport[]): {
    cases: number;
    flagged_cases: number;
    flags: number;
    by_kind: Record<string, number>;
    mean_flagged_rank: number;
  } {
    const by_kind: Record<string, number> = {};
    let ranks = 0;
    let total = 0;
    for (const r of reports) {
      for (const f of r.flags) {
        by_kind[f.kind] = (by_kind[f.kind] || 0) + 1;
        ranks += f.rank;
        total++;
      }
    }
    return {
      cases: reports.length,
      flagged_cases: reports.filter((r) => r.flags.length > 0).length,
      flags: total,
      by_kind,
      mean_flagged_rank: Number((ranks / (total || 1)).toFixed(2)),
    };
  }

  public static format(agg: ReturnType<typeof CreativeDirectorAttentionEngine.aggregate>): string {
    const L = [
      `DIRECTOR'S ATTENTION — ${agg.flags} flags across ${agg.flagged_cases} of ${agg.cases} cases`,
    ];
    for (const [k, v] of Object.entries(agg.by_kind).sort((a, b) => b[1] - a[1])) {
      L.push(`  ${k.padEnd(24)} ${String(v).padStart(4)}`);
    }
    L.push(`  mean rank of a flagged idea : ${agg.mean_flagged_rank}`);
    L.push("");
    L.push("  note: this changes no score and overrides no metric. It is a second list beside the");
    L.push("        ranking — what scored best, and separately what is worth another look. The");
    L.push("        reason travels with each flag so a director can dismiss it in a second.");
    return L.join("\n");
  }
}
