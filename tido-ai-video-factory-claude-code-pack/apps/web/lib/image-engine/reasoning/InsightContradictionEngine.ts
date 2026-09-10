import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { HumanTensionAnalyzer } from "./HumanTensionAnalyzer";
import { MOTIVATION_FAMILIES } from "./human-motivation.types";
import { HumanInsight } from "./human-insight.types";

/**
 * CIOS Phase 4.0.3.7 — does this insight actually hold a contradiction?
 *
 * Why an insight without one is not a weak insight
 * ------------------------------------------------
 * "People want to be treated well" is true, and nothing follows from it, because
 * nothing is set against it. An insight earns its name by naming two things a
 * person wants that cannot both be had — that is what makes it a *finding* rather
 * than an observation, and it is what gives a creative team something to resolve.
 *
 * Every layer before this one can produce a well-formed sentence with no
 * contradiction in it. The ladder will descend, the stack will fill, the review
 * will find a motive, and the result can still be a statement nobody has to
 * choose about. So this engine asks the one question none of the others do, and
 * rejects rather than scores down: a concept built on an insight with no
 * contradiction is a concept with nothing at its centre.
 *
 * The four parts, and what each is read from
 * -----------------------------------------
 *   desire    — the stack's functional need: what they are trying to get.
 *   fear      — the stack's social consequence: what they are trying to avoid.
 *   tradeoff  — the identity cost of getting the desire.
 *   tension   — the sentence that holds the two against each other.
 *
 * All four come from material the earlier layers established. This engine adds no
 * new claims about the person; it checks whether what was established actually
 * opposes itself, and says how strongly.
 *
 * What `contradiction_strength` is
 * -------------------------------
 * A proxy, like everything else automated here. It measures whether the desire
 * and the fear are *different things* (a desire opposed to its own restatement is
 * not a contradiction), whether a cost is named, and whether the tension sentence
 * puts them in opposition grammatically. It cannot tell whether the opposition is
 * one a real person would feel. That remains the blind human benchmark's job.
 */

export interface InsightContradiction {
  /** What the person is trying to get. */
  desire: string;
  /** What they are trying to avoid. */
  fear: string;
  /** What getting the desire would cost them. */
  tradeoff: string;
  /** The two held against each other, as one sentence. */
  tension: string;
  /** 0-1. How strongly the parts actually oppose. */
  contradiction_strength: number;
  /** True where the insight may proceed to expression. */
  passed: boolean;
  reasons: string[];
}

/** Below this the parts are present and not actually opposed. */
export const CONTRADICTION_FLOOR = 0.45;

/** Grammatical opposition in the tension sentence. */
const OPPOSED =
  /\b(?:and (?:cannot|will not|would not|still|yet)|rather than|instead of|without|before they|but\b|is not\b[^.]*\bit is\b|not\b[^.]*\bbut\b|would cost|at the cost of|only by|unless)\b/i;

export class InsightContradictionEngine {
  public static evaluate(insight: HumanInsight): InsightContradiction {
    const reasons: string[] = [];
    const t: DynamicHumanTension | null | undefined = insight.dynamic_tension;
    const stack = t?.motivation;
    const family = MOTIVATION_FAMILIES.find((f) => f.id === stack?.family);

    const conflictRung =
      HumanTensionAnalyzer.at(insight.ladder, "identity_conflict")?.statement || "";
    const socialRung = HumanTensionAnalyzer.at(insight.ladder, "social_fear")?.statement || "";

    // ── The four parts ─────────────────────────────────────────────────
    const desire = strip(family?.short_want || stack?.functional_need || "");
    const fear = strip(stack?.social_consequence || socialRung);
    const tradeoff = strip(family?.short_identity || stack?.identity_need || "");
    const tension = strip(conflictRung || t?.contradiction || "");

    if (!desire) reasons.push("No desire: nothing the person is trying to get was established.");
    if (!fear) reasons.push("No fear: nothing the person is trying to avoid was established.");
    if (!tradeoff) reasons.push("No tradeoff: getting the desire was not shown to cost anything.");
    if (!tension) reasons.push("No tension sentence: the two were never held against each other.");

    if (!desire || !fear || !tradeoff || !tension) {
      return {
        desire,
        fear,
        tradeoff,
        tension,
        contradiction_strength: 0,
        passed: false,
        reasons,
      };
    }

    // ── Strength ───────────────────────────────────────────────────────
    // Three checks, and the first is the one that matters. A desire opposed to
    // its own restatement is not a contradiction, however well the sentence is
    // built, and that is the failure this engine exists to catch.
    const distinct = 1 - overlap(words(desire), words(fear));
    const costNamed = overlap(words(tradeoff), words(desire)) < 0.6 ? 1 : 0.3;
    const grammaticallyOpposed = OPPOSED.test(tension) ? 1 : 0;

    if (distinct < 0.5) {
      reasons.push(
        `The desire and the fear are the same thing differently worded (${(1 - distinct).toFixed(2)} overlap), ` +
          "so nothing is actually opposed."
      );
    }
    if (!grammaticallyOpposed) {
      reasons.push("The tension sentence states the two parts without setting them against each other.");
    }
    if (costNamed < 1) {
      reasons.push("The tradeoff restates the desire rather than naming what it costs.");
    }

    const contradiction_strength = Number(
      (distinct * 0.5 + costNamed * 0.2 + grammaticallyOpposed * 0.3).toFixed(3)
    );
    const passed = contradiction_strength >= CONTRADICTION_FLOOR;
    if (!passed) {
      reasons.push(
        `contradiction_strength ${contradiction_strength.toFixed(2)} is below ${CONTRADICTION_FLOOR}: ` +
          "this is an observation rather than an insight."
      );
    }

    return { desire, fear, tradeoff, tension, contradiction_strength, passed, reasons };
  }

  public static aggregate(results: InsightContradiction[]): {
    cases: number;
    passed: number;
    pass_rate: number;
    mean_strength: number;
    missing_part: number;
    most_common_reason: string;
  } {
    const reasons = new Map<string, number>();
    for (const r of results) {
      for (const x of r.reasons) {
        const key = x.split(":")[0];
        reasons.set(key, (reasons.get(key) || 0) + 1);
      }
    }
    const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
    const passed = results.filter((r) => r.passed).length;
    return {
      cases: results.length,
      passed,
      pass_rate: results.length ? Number((passed / results.length).toFixed(3)) : 0,
      mean_strength: Number(
        (results.reduce((n, r) => n + r.contradiction_strength, 0) / (results.length || 1)).toFixed(3)
      ),
      missing_part: results.filter((r) => !r.desire || !r.fear || !r.tradeoff || !r.tension).length,
      most_common_reason: top ? top[0] : "none",
    };
  }

  public static format(agg: ReturnType<typeof InsightContradictionEngine.aggregate>): string {
    return [
      `CONTRADICTION — ${agg.cases} insights · pass ${agg.passed} (${(agg.pass_rate * 100).toFixed(0)}%)`,
      `  mean strength        : ${agg.mean_strength.toFixed(2)}`,
      `  missing a part       : ${agg.missing_part}`,
      `  most common failure  : ${agg.most_common_reason}`,
      "",
      "  note: a proxy. It checks that the desire and the fear are different things, that a",
      "        cost is named, and that the sentence opposes them. It cannot tell whether the",
      "        opposition is one a real person would feel.",
    ].join("\n");
  }
}

function words(text: string): Set<string> {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.min(a.size, b.size);
}

function strip(text: string): string {
  return String(text || "").replace(/[.]+$/, "").trim();
}
