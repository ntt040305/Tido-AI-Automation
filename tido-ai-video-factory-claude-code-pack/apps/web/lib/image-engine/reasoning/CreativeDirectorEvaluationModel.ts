import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { EmotionalPowerEvaluator } from "./EmotionalPowerEvaluator";
import { DIRECTOR_WEIGHTS, DirectorDimension, DirectorScore, StressTestReport } from "./creative-taste.types";

/**
 * CIOS Phase 4.0.4 — the four questions the taste rubric does not ask.
 *
 * Why these are separate from taste
 * --------------------------------
 * `CreativeTasteEngine` reads the sentence: is it original, simple, memorable,
 * filmable. These four read the idea's *position* — in a market, and over time.
 * An idea can score well on every taste dimension and fail all four, and the two
 * failures look nothing alike, so blending them into one number would hide which
 * kind of problem an idea has.
 *
 *   brand_ownership          Does this belong to this brand, or to the category?
 *   longevity                Will it still work in two years, or is it pinned to
 *                            a moment that is already passing?
 *   category_differentiation Does it stand against what the category does, or
 *                            alongside it?
 *   emotional_impact         Does it land, or is it merely correct?
 *
 * On `verdict_line`
 * ----------------
 * One sentence, in the register a director would actually use. It is generated
 * from the lowest-scoring dimension rather than from the total, because that is
 * what a director says first — not "this is a 62" but "anyone could run this".
 *
 * The limit, again
 * ---------------
 * `brand_ownership` and `category_differentiation` rest on the stress tests,
 * which have teeth. `longevity` is a proxy on time-pinned language and is the
 * weakest of the four. `emotional_impact` is carried from
 * `EmotionalPowerEvaluator` rather than recomputed, for the same reason the taste
 * engine carries its three: one evaluator per property.
 */

/** Language pinned to a moment that will pass. */
const TIME_PINNED =
  /\b(?:this year|this season|right now|today|currently|202\d|post[- ]pandemic|trending|viral|the new normal|latest|newest|just launched|limited time|black friday|tet 202\d)\b/i;

/** Language that ages the other way: standing conditions. */
const STANDING =
  /\b(?:always|still|long before|never|every time|for years|since|generation|ordinary|daily|each day)\b/i;

/** Claims that sit alongside the category rather than against it. */
const CATEGORY_ALIGNED =
  /\b(?:the best|leading|premium|trusted|quality|innovative|expert|professional|reliable|proven|effective)\b/i;

/** Constructions that take a position against something. */
const OPPOSITIONAL =
  /\b(?:not\b[^.]*\bbut\b|is not\b[^.]*\bit is\b|rather than|instead of|stop asking|refuse|will not|nobody|not one of them|do neither|turn out to be the same|the failure was never)\b/i;

export class CreativeDirectorEvaluationModel {
  public static evaluate(
    idea: string,
    context: {
      brand?: string;
      product?: string;
      category?: string;
      audience?: string;
      tension?: DynamicHumanTension | null;
      stress?: StressTestReport;
      /** Phase 4.0.4.1. Ownership judged against brand DNA, where it was run. */
      ownership?: number;
      priorIdeas?: string[];
    } = {}
  ): DirectorScore {
    const t = String(idea || "").trim();
    const notes: string[] = [];

    if (!t) {
      const zero = {} as Record<DirectorDimension, number>;
      for (const k of Object.keys(DIRECTOR_WEIGHTS) as DirectorDimension[]) zero[k] = 0;
      return { idea: t, dimensions: zero, total: 0, verdict_line: "There is nothing here.", notes };
    }

    // ── Brand ownership ────────────────────────────────────────────────
    // Read off the stress test that already asked it. An idea that survives
    // REPLACE_BRAND rests on something a competitor does not have.
    const replaceBrand = context.stress?.results.find((r) => r.test === "REPLACE_BRAND");
    const copy = context.stress?.results.find((r) => r.test === "COPY");
    // Phase 4.0.4.1: where `BrandDNAOwnership` has run, its verdict is used
    // rather than the stress test's token match. The token result stays as the
    // fallback for callers that have no DNA at all.
    const brand_ownership = clamp(
      context.ownership !== undefined
        ? context.ownership
        : (replaceBrand?.survived ? 0.6 : 0.1) + (copy?.survived ? 0.4 : 0)
    );
    if (brand_ownership < 0.5) {
      notes.push("The brand is decoration on this idea rather than load-bearing in it.");
    }

    // ── Longevity ──────────────────────────────────────────────────────
    // Pinned to a moment, or resting on a standing condition. The weakest of the
    // four: a date is checkable, a shelf life is not.
    const pinned = TIME_PINNED.test(t);
    const standing = STANDING.test(t);
    // An idea built on a discovered human tension has a longer natural life than
    // one built on a market condition, because the tension outlasts the market.
    const restsOnTension = Boolean(context.tension?.tension_statement);
    const longevity = clamp(
      (pinned ? 0.1 : 0.55) + (standing ? 0.25 : 0.1) + (restsOnTension ? 0.25 : 0)
    );
    if (pinned) notes.push(`Pinned to a moment: "${t.match(TIME_PINNED)?.[0]}".`);

    // ── Category differentiation ───────────────────────────────────────
    // Does it stand against the category or alongside it? Alongside is the
    // default and the failure.
    const aligned = CATEGORY_ALIGNED.test(t);
    const opposes = OPPOSITIONAL.test(t);
    const category_differentiation = clamp(
      (opposes ? 0.7 : 0.2) + (aligned ? -0.35 : 0.25) + (copy?.survived ? 0.15 : 0)
    );
    if (aligned && !opposes) {
      notes.push(`Sits alongside the category: "${t.match(CATEGORY_ALIGNED)?.[0]}".`);
    }

    // ── Emotional impact ───────────────────────────────────────────────
    // Carried, not recomputed. One evaluator per property.
    const emotional_impact = clamp(
      EmotionalPowerEvaluator.evaluate(t, {
        audience: context.audience,
        priorIdeas: context.priorIdeas,
        tension: context.tension,
      }).score / 20
    );

    const dimensions: Record<DirectorDimension, number> = {
      brand_ownership: round(brand_ownership),
      longevity: round(longevity),
      category_differentiation: round(category_differentiation),
      emotional_impact: round(emotional_impact),
    };

    let total = 0;
    for (const k of Object.keys(DIRECTOR_WEIGHTS) as DirectorDimension[]) {
      total += dimensions[k] * DIRECTOR_WEIGHTS[k];
    }

    return {
      idea: t,
      dimensions,
      total: Number(total.toFixed(2)),
      verdict_line: this.verdict(dimensions, total),
      notes,
    };
  }

  /**
   * What a director says first.
   *
   * Generated from the weakest dimension rather than the total, because that is
   * how the conversation actually goes: nobody opens with a score.
   */
  private static verdict(dims: Record<DirectorDimension, number>, total: number): string {
    const ranked = (Object.keys(DIRECTOR_WEIGHTS) as DirectorDimension[]).sort(
      (a, b) => dims[a] * DIRECTOR_WEIGHTS[a] - dims[b] * DIRECTOR_WEIGHTS[b]
    );
    if (total >= 75) return "This is ours and it will keep working. Make it.";
    switch (ranked[0]) {
      case "brand_ownership":
        return "Anyone could run this. What in it is only ours?";
      case "longevity":
        return "This works this quarter. What happens to it next year?";
      case "category_differentiation":
        return "This is what the category already says. Where is the argument?";
      case "emotional_impact":
        return "It is correct and it does not land. What is at stake for anyone?";
      default:
        return "Not yet.";
    }
  }

  public static aggregate(scores: DirectorScore[]): {
    cases: number;
    mean_total: number;
    by_dimension: Record<DirectorDimension, number>;
    weakest: DirectorDimension;
    /** Ideas whose brand is load-bearing. */
    brand_owned: number;
    brand_ownership_rate: number;
    common_verdict: string;
  } {
    const dims = Object.keys(DIRECTOR_WEIGHTS) as DirectorDimension[];
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const by_dimension = {} as Record<DirectorDimension, number>;
    for (const d of dims) by_dimension[d] = Number(mean(scores.map((s) => s.dimensions[d])).toFixed(4));
    const ranked = [...dims].sort(
      (a, b) => by_dimension[a] * DIRECTOR_WEIGHTS[a] - by_dimension[b] * DIRECTOR_WEIGHTS[b]
    );
    const verdicts = new Map<string, number>();
    for (const s of scores) verdicts.set(s.verdict_line, (verdicts.get(s.verdict_line) || 0) + 1);
    const top = [...verdicts.entries()].sort((a, b) => b[1] - a[1])[0];
    const owned = scores.filter((s) => s.dimensions.brand_ownership >= 0.6).length;
    return {
      cases: scores.length,
      mean_total: Number(mean(scores.map((s) => s.total)).toFixed(2)),
      by_dimension,
      weakest: ranked[0],
      brand_owned: owned,
      brand_ownership_rate: Number((owned / (scores.length || 1)).toFixed(3)),
      common_verdict: top ? top[0] : "",
    };
  }

  public static format(agg: ReturnType<typeof CreativeDirectorEvaluationModel.aggregate>): string {
    const L = [`DIRECTOR'S READ — ${agg.cases} ideas · mean ${agg.mean_total.toFixed(1)} / 100`];
    for (const d of Object.keys(DIRECTOR_WEIGHTS) as DirectorDimension[]) {
      const w = DIRECTOR_WEIGHTS[d];
      L.push(`  ${d.padEnd(26)} ${(agg.by_dimension[d] * w).toFixed(1).padStart(5)} / ${String(w).padStart(2)}`);
    }
    L.push(`  brand-owned          : ${agg.brand_owned} (${(agg.brand_ownership_rate * 100).toFixed(0)}%)`);
    L.push(`  weakest dimension    : ${agg.weakest}`);
    L.push(`  most common verdict  : "${agg.common_verdict}"`);
    L.push("");
    L.push("  note: brand_ownership and category_differentiation rest on the stress tests, which");
    L.push("        have teeth. longevity is a proxy on time-pinned language and is the weakest of");
    L.push("        the four. emotional_impact is carried from EmotionalPowerEvaluator, not rescored.");
    return L.join("\n");
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round(n: number): number {
  return Number(clamp(n).toFixed(4));
}
