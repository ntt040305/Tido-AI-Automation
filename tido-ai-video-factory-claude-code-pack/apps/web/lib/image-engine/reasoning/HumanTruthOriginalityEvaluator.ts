import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { similarity } from "./OriginalityEvaluator";

/**
 * CIOS Phase 4.0.3.7 — is this truth worth having found?
 *
 * The gap this fills
 * -----------------
 * `HumanTruthReview` asks whether a truth is sound: not obvious, names a motive,
 * recognisable, ownable, actionable. A truth can pass all five and still be one
 * every planner in the category already knows. Soundness and originality are
 * different properties and the run was only measuring the first.
 *
 * The four questions here are about the second:
 *
 *   familiarity          — is this already a stock line in this trade?
 *   perspective_shift    — does it make you see the situation differently, or
 *                          only describe it accurately?
 *   strategic_implication— does a different plan follow, or the same plan with
 *                          better words?
 *   emotional_surprise   — does it name something people would recognise and not
 *                          expect to hear said?
 *
 * The honest limit, stated plainly
 * -------------------------------
 * `familiarity` is the only one of the four with real teeth, because a stock line
 * has a surface form and can be listed. The other three are weaker: a
 * perspective shift is detected as a structural reversal, an implication as the
 * presence of a redirect, a surprise as the pairing of ordinary language with an
 * uncomfortable noun. Each correlates with the thing it is named for and none is
 * that thing.
 *
 * Which means this evaluator can reliably catch a truth that is *unoriginal* and
 * cannot certify that one is original. That asymmetry is the useful shape for a
 * gate, and it is why the score is reported as a floor rather than a grade.
 */

export type OriginalityQuestion =
  | "familiarity"
  | "perspective_shift"
  | "strategic_implication"
  | "emotional_surprise";

export const ORIGINALITY_WEIGHTS: Record<OriginalityQuestion, number> = {
  familiarity: 35,
  perspective_shift: 25,
  strategic_implication: 20,
  emotional_surprise: 20,
};

export interface OriginalityFinding {
  question: OriginalityQuestion;
  score: number;
  evidence: string;
}

export interface TruthOriginalityResult {
  findings: OriginalityFinding[];
  /** 0-100. A floor, not a grade — see the file header. */
  score: number;
  verdict: "FRESH" | "SERVICEABLE" | "STOCK";
  notes: string[];
}

/**
 * Lines this trade has already worn out.
 *
 * Every entry is a proposition a planner has heard, not a banned word. They are
 * listed because a stock line is the one form of unoriginality that can be
 * detected reliably: it has a surface form, and the surface form recurs.
 */
const STOCK_TRUTHS: [RegExp, string][] = [
  [/\bpeople (?:buy|choose) (?:with|on) emotion\b/i, "people buy on emotion"],
  [/\bpeople (?:do not|don't) buy (?:the )?product,? they buy\b/i, "they don't buy the product, they buy…"],
  [/\bit(?:'s| is) not about the product,? it(?:'s| is) about\b/i, "it's not about the product"],
  [/\bpeople want to (?:feel|be) (?:seen|heard|understood|valued)\b/i, "people want to feel seen"],
  [/\btrust is (?:earned|everything|the real currency)\b/i, "trust is earned"],
  [/\bauthenticity (?:is|wins|matters)\b/i, "authenticity wins"],
  [/\bless is more\b/i, "less is more"],
  [/\bpeople remember how you made them feel\b/i, "people remember how you made them feel"],
  [/\bwe (?:all )?want to belong\b/i, "we all want to belong"],
  [/\btime is (?:the )?(?:new )?luxury\b/i, "time is the new luxury"],
];

/** A sentence that turns the accepted reading over. */
const REVERSAL =
  /\b(?:is not\b[^.]*\bit is\b|not because\b[^.]*\bbut because\b|what looks like\b|what people call\b|the cost .* is not\b|long before\b|before they will\b|rather than\b|is usually\b)\b/i;

/** Language implying a different plan, not better words for the same one. */
const IMPLICATION =
  /\b(?:what stops|will not|cannot|would have to|only by|until\b|before\b|instead of|rather than|give up|refuse)\b/i;

/** Nouns people recognise and do not expect a brand to say out loud. */
const UNCOMFORTABLE = [
  "shame", "ashamed", "humiliat", "afraid", "fear", "guilt", "blame", "exposed",
  "judged", "insult", "underestimat", "resent", "regret", "isolat", "alone",
  "defensib", "verdict", "concede", "admit", "carel", "vanity", "taken in",
  "face", "standing", "unmet", "protected", "cost",
];

/** Vocabulary that makes a sentence sound like a deck rather than a person. */
const DECK_SPEAK =
  /\b(?:consumer|customer|audience|brand|category|segment|proposition|equity|journey|touchpoint|insight-led|value proposition)\b/i;

export class HumanTruthOriginalityEvaluator {
  public static evaluate(
    truth: string,
    context: {
      briefProblem?: string;
      priorTruths?: string[];
      tension?: DynamicHumanTension | null;
    } = {}
  ): TruthOriginalityResult {
    const t = String(truth || "").trim();
    const notes: string[] = [];
    const findings: OriginalityFinding[] = [];

    if (!t) {
      return {
        findings: (Object.keys(ORIGINALITY_WEIGHTS) as OriginalityQuestion[]).map((q) => ({
          question: q,
          score: 0,
          evidence: "no truth to evaluate",
        })),
        score: 0,
        verdict: "STOCK",
        notes: ["No human truth was produced."],
      };
    }

    // ── Familiarity ────────────────────────────────────────────────────
    // Two ways to be familiar: be a stock line, or be one this run has already
    // delivered. The second matters because a truth repeated across briefs is
    // unoriginal in the only sense the client will experience.
    const stock = STOCK_TRUTHS.find(([p]) => p.test(t));
    let nearestPrior = 0;
    for (const p of context.priorTruths || []) nearestPrior = Math.max(nearestPrior, similarity(t, p));
    const familiarity = stock ? 0 : Math.max(0, 1 - Math.max(0, nearestPrior - 0.35) * 1.8);
    findings.push({
      question: "familiarity",
      score: Number(familiarity.toFixed(3)),
      evidence: stock
        ? `stock line: "${stock[1]}"`
        : nearestPrior > 0.5
          ? `${Math.round(nearestPrior * 100)}% similar to a truth already delivered this run`
          : "not a stock line, and distinct from this run's other truths",
    });
    if (stock) notes.push(`The truth is a line this trade has worn out: "${stock[1]}".`);

    // ── Perspective shift ──────────────────────────────────────────────
    // Detected as a structural reversal: the sentence takes the accepted reading
    // and turns it over. That is what a shift looks like in text; it is not the
    // same as being one.
    const reverses = REVERSAL.test(t);
    const merelyDescribes = !reverses && /\b(?:is|are|have|has)\b/.test(t);
    const perspective_shift = reverses ? 0.9 : merelyDescribes ? 0.25 : 0.5;
    findings.push({
      question: "perspective_shift",
      score: perspective_shift,
      evidence: reverses
        ? `turns the reading over: "${t.match(REVERSAL)?.[0]}"`
        : "describes the situation accurately without changing how it reads",
    });

    // ── Strategic implication ──────────────────────────────────────────
    const implies = IMPLICATION.test(t);
    // Optional all the way down. `motivation` is always present on a tension the
    // discovery layer built, and a caller constructing a partial one for a test
    // or a probe should get an answer rather than a crash — the same defect that
    // dropped seven briefs in Phase 4.0.2.
    const hasDesire = Boolean(context.tension?.motivation?.functional_need);
    const strategic_implication = Math.min(1, (implies ? 0.7 : 0.15) + (hasDesire ? 0.3 : 0));
    findings.push({
      question: "strategic_implication",
      score: Number(strategic_implication.toFixed(3)),
      evidence: implies
        ? "a different plan follows from it"
        : "the same plan would follow, with better words",
    });

    // ── Emotional surprise ─────────────────────────────────────────────
    // Ordinary language carrying a noun a brand would normally avoid. Deck
    // vocabulary is the reliable tell that no surprise is available.
    const lowered = t.toLowerCase();
    const uncomfortable = UNCOMFORTABLE.filter((u) => lowered.includes(u)).length;
    const deck = DECK_SPEAK.test(t);
    const emotional_surprise = Math.max(
      0,
      Math.min(1, uncomfortable * 0.4 + (deck ? -0.5 : 0.2))
    );
    findings.push({
      question: "emotional_surprise",
      score: Number(emotional_surprise.toFixed(3)),
      evidence: deck
        ? `written in deck vocabulary: "${t.match(DECK_SPEAK)?.[0]}"`
        : uncomfortable
          ? `${uncomfortable} thing(s) a brand would normally not say`
          : "nothing uncomfortable is named",
    });

    let score = 0;
    for (const f of findings) score += f.score * ORIGINALITY_WEIGHTS[f.question];

    return {
      findings,
      score: Number(score.toFixed(2)),
      verdict: score >= 70 ? "FRESH" : score >= 45 ? "SERVICEABLE" : "STOCK",
      notes,
    };
  }

  public static aggregate(results: TruthOriginalityResult[]): {
    cases: number;
    mean_score: number;
    by_question: Record<OriginalityQuestion, number>;
    fresh: number;
    serviceable: number;
    stock: number;
    weakest: OriginalityQuestion;
  } {
    const qs = Object.keys(ORIGINALITY_WEIGHTS) as OriginalityQuestion[];
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const by_question = {} as Record<OriginalityQuestion, number>;
    for (const q of qs) {
      by_question[q] = Number(
        mean(results.map((r) => r.findings.find((f) => f.question === q)?.score ?? 0)).toFixed(4)
      );
    }
    const ranked = [...qs].sort(
      (a, b) => by_question[a] * ORIGINALITY_WEIGHTS[a] - by_question[b] * ORIGINALITY_WEIGHTS[b]
    );
    return {
      cases: results.length,
      mean_score: Number(mean(results.map((r) => r.score)).toFixed(2)),
      by_question,
      fresh: results.filter((r) => r.verdict === "FRESH").length,
      serviceable: results.filter((r) => r.verdict === "SERVICEABLE").length,
      stock: results.filter((r) => r.verdict === "STOCK").length,
      weakest: ranked[0],
    };
  }

  public static format(agg: ReturnType<typeof HumanTruthOriginalityEvaluator.aggregate>): string {
    const L = [`TRUTH ORIGINALITY — ${agg.cases} truths · mean ${agg.mean_score.toFixed(1)} / 100`];
    for (const q of Object.keys(ORIGINALITY_WEIGHTS) as OriginalityQuestion[]) {
      const w = ORIGINALITY_WEIGHTS[q];
      L.push(`  ${q.padEnd(22)} ${(agg.by_question[q] * w).toFixed(1).padStart(5)} / ${String(w).padStart(2)}`);
    }
    L.push(`  fresh ${agg.fresh} · serviceable ${agg.serviceable} · stock ${agg.stock}`);
    L.push(`  weakest question     : ${agg.weakest}`);
    L.push("");
    L.push("  note: this catches a truth that is unoriginal; it cannot certify that one is");
    L.push("        original. Only `familiarity` has real teeth — a stock line has a surface form.");
    L.push("        Read the score as a floor, not a grade.");
    return L.join("\n");
  }
}
