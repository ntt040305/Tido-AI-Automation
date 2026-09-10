import { HumanInsightGenerator } from "./HumanInsightGenerator";
import { HumanTensionAnalyzer } from "./HumanTensionAnalyzer";
import { similarity } from "./OriginalityEvaluator";
import {
  HumanInsight,
  INSIGHT_LADDER,
  INSIGHT_QUALITY_METHOD,
  INSIGHT_QUALITY_WEIGHTS,
  InsightQualityDimension,
  InsightQualityScore,
} from "./human-insight.types";

/**
 * Scores an insight before any lens is allowed to express it.
 *
 * Two dimensions here pull against each other on purpose, and they are applied to
 * different fields for that reason. `universality` asks whether the human truth
 * would still be true with this brand removed — a truth that names the product is
 * a product claim wearing a truth's clothes. `specificity` asks whether the
 * consumer insight is about *this* audience in *this* category — an insight that
 * would fit any brief is the shallowness this phase exists to remove. A good
 * insight scores high on both because they are measured on different sentences.
 *
 * Everything below is a proxy and the report says so on every run. `depth` counts
 * rungs that transformed rather than restated; it cannot tell a profound truth
 * from a well-formed one. That distinction needs the blind human benchmark, and
 * this gate exists to stop obviously bad work reaching it — not to replace it.
 */

export interface InsightThresholds {
  total: number;
  /** A truth that fails the substitution test cannot pass on total alone. */
  universality: number;
  /** Nor can one whose ladder never descended. */
  depth: number;
}

export const DEFAULT_INSIGHT_THRESHOLDS: InsightThresholds = {
  total: 55,
  universality: 0.4,
  depth: 0.5,
};

export type InsightVerdict = "PASS" | "WEAK" | "REJECTED";

export interface InsightGateResult {
  verdict: InsightVerdict;
  score: InsightQualityScore;
  reasons: string[];
}

/** A sentence holding two things against each other. */
const OPPOSITION =
  /\b(rather than|instead of|and (?:still|yet)|but\b|without|even though|while\b|before\b|not\b[^.]*\bbut\b|cannot both|at the same time|and cannot|and will not|and would)\b/i;

/** Vocabulary that names a feeling rather than gesturing at one. */
const FELT = [
  "afraid", "fear", "shame", "ashamed", "guilt", "pride", "relief", "exposed",
  "humiliat", "blame", "judged", "isolat", "alone", "doubt", "trust", "resent",
  "embarrass", "exclud", "belong", "regret", "insult", "underestimat", "carel",
  "verdict", "concede", "admit", "risk", "loss", "cost",
];

/** Terms that make a statement about a market rather than about people. */
const MARKET_TALK =
  /\b(brand|category|product|campaign|market|segment|consumer|customer|audience|purchase|conversion|retention)\b/i;

export class HumanInsightQualityGate {
  public static score(caseId: string, insight: HumanInsight, brief: { audience: string; product: string; objective?: string }): InsightQualityScore {
    const notes: string[] = [];
    const truth = insight.human_truth || "";
    const ladder = insight.ladder || [];

    // ── Depth (proxy) ──────────────────────────────────────────────────
    // Rungs reached, discounted by rungs that only restated the one above. A
    // ladder of eight paraphrases is not eight rungs deep.
    const reached = ladder.length / INSIGHT_LADDER.length;
    let restated = 0;
    for (let i = 1; i < ladder.length; i++) {
      if (similarity(ladder[i].statement, ladder[i - 1].statement) >= 0.55) restated++;
    }
    const transformRate = ladder.length > 1 ? 1 - restated / (ladder.length - 1) : 0;
    const depth = Number((reached * 0.6 + transformRate * 0.4).toFixed(4));
    if (restated) notes.push(`${restated} rung(s) restate the rung above rather than transforming it.`);
    if (insight.truncated_at) notes.push(`Ladder truncated at ${insight.truncated_at}.`);

    // ── Tension (proxy) ────────────────────────────────────────────────
    // Two poles held against each other, plus a named feeling. A truth with
    // neither is an observation.
    // Measured from the ladder's structure first, and only then from the prose.
    // The internal-conflict rung is built from two poles by construction, so
    // sniffing the rendered sentence for opposition markers was measuring the
    // phrasing rather than the thing: it found poles in 35 of 100 cases that all
    // had them. Where the rung exists and holds two distinct clauses, the
    // opposition is a fact about how it was built.
    const conflictRung = HumanTensionAnalyzer.at(ladder, "identity_conflict");
    const conflict = conflictRung?.statement || "";
    const structuralPoles = Boolean(conflictRung) && /,\s*and\s+\S/.test(conflict);
    const hasPoles = structuralPoles || OPPOSITION.test(truth) || OPPOSITION.test(conflict);
    const feelings = FELT.filter((f) => `${truth} ${conflict} ${insight.consumer_insight}`.toLowerCase().includes(f)).length;
    const tension = Number(Math.min(1, (hasPoles ? 0.55 : 0) + Math.min(0.45, feelings * 0.15)).toFixed(4));
    if (!hasPoles) notes.push("Nothing in the truth or the conflict is held in opposition.");

    // ── Universality (proxy) ───────────────────────────────────────────
    // The substitution test, run in both directions: the truth must survive
    // removing this brand, and must NOT survive being about no one in
    // particular. Market vocabulary fails the first; a shallow proposition
    // fails the second.
    const briefTerms = new Set(
      [...words(brief.product), ...words(brief.audience)].filter((w) => w.length > 3)
    );
    const truthWords = words(truth);
    const leaked = [...truthWords].filter((w) => briefTerms.has(w)).length;
    const shallow = HumanInsightGenerator.shallowHits(insight);
    let universality = 1;
    if (leaked) universality -= Math.min(0.5, leaked * 0.2);
    if (MARKET_TALK.test(truth)) universality -= 0.25;
    if (shallow.length) universality -= 0.6;
    if (!truth) universality = 0;
    universality = Number(Math.max(0, universality).toFixed(4));
    if (leaked) notes.push(`The truth names ${leaked} term(s) from this brief, so it is a claim rather than a truth.`);
    if (shallow.length) notes.push(`Shallow proposition: "${shallow[0]}".`);

    // ── Specificity (proxy) ────────────────────────────────────────────
    // Measured on the ladder, not the truth: the rungs are where this brief is
    // supposed to show through.
    const perRung = ladder.length
      ? ladder.reduce((s, r) => s + r.specificity, 0) / ladder.length
      : 0;
    const specificity = Number(Math.min(1, perRung * 1.4).toFixed(4));
    if (specificity < 0.25 && ladder.length) {
      notes.push("The rungs return their archetype largely unchanged; little of this brief shows through.");
    }

    // ── Strategic relevance (proxy) ────────────────────────────────────
    // Is there anything a brand could do about it? An unspoken desire the
    // product could plausibly meet is the connection; a truth with no desire
    // beneath it is an observation about the human condition.
    const desire = HumanTensionAnalyzer.at(ladder, "creative_opportunity")?.statement || "";
    // The sentinel is "Not established", not the word "nothing". The 4.0.3.6
    // creative-opportunity rung legitimately ends "...which nothing in this
    // category currently does", and a bare /nothing/ test read that as an
    // unreachable objective on 99 of 100 briefs.
    const objectiveReachable = Boolean(desire) && !/^not established/i.test(desire.trim());
    const productLink = overlap(words(`${insight.consumer_insight} ${desire}`), words(`${brief.product} ${brief.objective || ""}`));
    const strategic_relevance = Number(
      Math.min(1, (objectiveReachable ? 0.6 : 0) + Math.min(0.4, productLink * 1.2)).toFixed(4)
    );
    if (!objectiveReachable) notes.push("No unspoken desire was reached, so there is nothing for the brand to answer.");

    const dimensions: Record<InsightQualityDimension, number> = {
      depth,
      tension,
      universality,
      specificity,
      strategic_relevance,
    };
    let total = 0;
    for (const k of Object.keys(INSIGHT_QUALITY_WEIGHTS) as InsightQualityDimension[]) {
      total += dimensions[k] * INSIGHT_QUALITY_WEIGHTS[k];
    }

    return {
      case_id: caseId,
      dimensions,
      total: Number(total.toFixed(2)),
      method: INSIGHT_QUALITY_METHOD,
      shallow_hits: shallow,
      notes,
    };
  }

  /**
   * Holds a weak insight back from the expression layer.
   *
   * Three conditions rather than one total, for the same reason the creative gate
   * has two: a single threshold lets an insight pass on the strength of the
   * dimensions that are easiest to satisfy. `universality` and `depth` are the two
   * that cannot be traded away — a shallow truth and an undescended ladder are
   * not weak insights, they are the absence of one.
   */
  public static evaluate(
    caseId: string,
    insight: HumanInsight,
    brief: { audience: string; product: string; objective?: string },
    thresholds: InsightThresholds = DEFAULT_INSIGHT_THRESHOLDS
  ): InsightGateResult {
    const score = this.score(caseId, insight, brief);
    const reasons: string[] = [];

    if (score.shallow_hits.length) {
      reasons.push(`Shallow: "${score.shallow_hits[0]}" is true of every audience in every category.`);
    }
    if (score.dimensions.universality < thresholds.universality) {
      reasons.push(`universality ${score.dimensions.universality.toFixed(2)} below ${thresholds.universality}.`);
    }
    if (score.dimensions.depth < thresholds.depth) {
      reasons.push(`depth ${score.dimensions.depth.toFixed(2)} below ${thresholds.depth}: the ladder did not descend.`);
    }
    if (score.total < thresholds.total) {
      reasons.push(`total ${score.total.toFixed(1)} below ${thresholds.total}.`);
    }

    const hardFail =
      score.shallow_hits.length > 0 ||
      score.dimensions.universality < thresholds.universality ||
      score.dimensions.depth < thresholds.depth;

    if (hardFail) return { verdict: "REJECTED", score, reasons };
    if (score.total < thresholds.total) return { verdict: "WEAK", score, reasons };
    return { verdict: "PASS", score, reasons };
  }

  /** Run-level summary. */
  public static aggregate(scores: InsightQualityScore[]): {
    cases: number;
    mean_total: number;
    by_dimension: Record<InsightQualityDimension, number>;
    shallow_cases: number;
    weakest: InsightQualityDimension;
  } {
    const dims = Object.keys(INSIGHT_QUALITY_WEIGHTS) as InsightQualityDimension[];
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const by_dimension = {} as Record<InsightQualityDimension, number>;
    for (const d of dims) by_dimension[d] = Number(mean(scores.map((s) => s.dimensions[d])).toFixed(4));
    const ranked = [...dims].sort((a, b) => by_dimension[a] - by_dimension[b]);
    return {
      cases: scores.length,
      mean_total: Number(mean(scores.map((s) => s.total)).toFixed(2)),
      by_dimension,
      shallow_cases: scores.filter((s) => s.shallow_hits.length > 0).length,
      weakest: ranked[0],
    };
  }

  public static format(agg: ReturnType<typeof HumanInsightQualityGate.aggregate>): string {
    const L = [`INSIGHT QUALITY — ${agg.cases} cases · mean ${agg.mean_total.toFixed(1)} / 100`];
    for (const k of Object.keys(INSIGHT_QUALITY_WEIGHTS) as InsightQualityDimension[]) {
      const w = INSIGHT_QUALITY_WEIGHTS[k];
      L.push(`  ${k.padEnd(20)} ${(agg.by_dimension[k] * w).toFixed(1).padStart(5)} / ${String(w).padStart(2)}   (proxy)`);
    }
    L.push(`  shallow insights     : ${agg.shallow_cases}`);
    L.push(`  weakest dimension    : ${agg.weakest}`);
    L.push("");
    L.push("  note: every dimension above is a proxy. depth counts rungs that transformed rather");
    L.push("        than restated; it cannot tell a profound truth from a well-formed one. Only the");
    L.push("        blind human benchmark can.");
    return L.join("\n");
  }
}

function words(text: string): Set<string> {
  return new Set(
    String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3)
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.min(a.size, b.size);
}
