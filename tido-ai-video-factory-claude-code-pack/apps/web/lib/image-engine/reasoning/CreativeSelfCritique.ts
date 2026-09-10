import { classify } from "./semantic-relations";
import { similarity } from "./OriginalityEvaluator";

/**
 * CIOS Phase 4.0.7 — the writer's own second look.
 *
 * Where it sits, and why that matters
 * ----------------------------------
 * Immediately after generation, before the diversity guard and long before any
 * evaluator. It is not a score, it does not rank, and nothing it produces
 * travels further than the pool: a candidate it drops is gone, and a candidate
 * it keeps arrives at the Creative Director engine with no mark on it.
 *
 * What it is honestly for
 * ----------------------
 * A generator that produces eighteen candidates produces eighteen *sentences*,
 * and some of them only sound like ideas. Five failures are common enough and
 * checkable enough to be worth catching before a director's time is spent:
 *
 *   restates_truth         the human truth, reworded
 *   generic_category_claim anything any brand in the category could say
 *   no_human_moment        an abstraction with no person and no situation in it
 *   not_brand_owned        nothing from this brief is load-bearing
 *   no_tension             a pleasant sentence with nothing held against anything
 *
 * The circularity, stated plainly
 * ------------------------------
 * Three of these overlap with things the evaluators already measure —
 * `not_brand_owned` is close to REPLACE_BRAND, `restates_truth` to the ECHO band,
 * `no_human_moment` to the cold reading. Filtering on them and then reporting
 * that fewer candidates fail those tests would be circular, and any benchmark
 * that leans on it is measuring the filter rather than the writing.
 *
 * So the claim made for this layer is narrow and testable: it changes *which
 * candidate is recommended*, by removing sentences that would otherwise sit at
 * the top of the ranking and be rejected on a ground the ranking does not
 * weight. Whether that actually improves the director's verdict is an empirical
 * question the A/B/C benchmark answers, and it is reported as the answer comes
 * out.
 */

export type CritiqueIssue =
  | "restates_truth"
  | "generic_category_claim"
  | "no_human_moment"
  | "not_brand_owned"
  | "no_tension";

export interface CritiqueResult {
  idea: string;
  keep: boolean;
  issues: CritiqueIssue[];
  reasoning: string;
}

/** How many issues a candidate may carry and still be worth a director's look. */
export const CRITIQUE_ISSUE_LIMIT = 2;

/**
 * Claims that survive having the brand swapped out, because they were never
 * about the brand.
 */
const CATEGORY_CLAIM =
  /\b(?:the best|the leading|trusted by|premium|innovative|world[- ]class|award[- ]winning|customer[- ]first|quality you can trust|we care|your partner|excellence|leading the way|number one|for everyone|redefin\w+|unlock\w*|elevat\w+|empower\w+|seamless|holistic|transform your)\b/i;

/** A person, named or addressed. */
const PERSON =
  /\b(?:i|you|your|we|they|them|their|he|she|her|his|people|someone|somebody|nobody|anyone|everyone|buyers?|owners?|parents?|mothers?|fathers?|drivers?|patients?|students?|teachers?|workers?|customers?|men|women|kids?|children|families|shoppers?|readers?|players?|users?|somebody)\b/i;

/** A situation: something with a place, a time or a thing in it. */
const SITUATION =
  /\b(?:receipts?|bills?|prices?|tags?|labels?|packets?|bottles?|boxe?s?|bags?|letters?|lists?|notes?|menus?|photographs?|screens?|phones?|mirrors?|windows?|doors?|seats?|chairs?|tables?|counters?|shelves|shelf|aisles?|queues?|drawers?|wardrobes?|kitchens?|signs?|cards?|keys?|coats?|shirts?|rooms?|streets?|shops?|mornings?|nights?|hands?|faces?|floors?|beds?|cars?|buses?|markets?|today|tonight|again|every time|before anyone|in public)\b/i;

/** Two things held against each other. */
const TENSION =
  /\b(?:but|rather than|instead of|without|never|nobody|no one|and (?:will not|cannot|would not|still|yet)|would have to|no longer|used to|stopped|gave up|before anyone|only|not\b[^.]*\bbut\b)\b/i;

export class CreativeSelfCritique {
  /**
   * One candidate, read the way a writer reads their own line back.
   *
   * `truth` and the brief anchors are supplied because three of the five
   * questions cannot be asked without them — whether a sentence restates a truth
   * is meaningless without the truth. The sentence is still the only thing
   * judged; the context is what it is judged *against*.
   */
  public static review(
    idea: string,
    context: {
      human_truth?: string;
      /** Material only this brief supplies: behaviour, key phrase, product words. */
      anchors?: string[];
    } = {}
  ): CritiqueResult {
    const t = String(idea || "").trim();
    if (!t) {
      return {
        idea: t,
        keep: false,
        issues: ["no_human_moment", "no_tension"],
        reasoning: "There is no sentence to review.",
      };
    }

    const issues: CritiqueIssue[] = [];
    const why: string[] = [];

    // ── 1. Is this merely the human truth, differently? ─────────────────
    const truth = String(context.human_truth || "").trim();
    if (truth) {
      const sim = similarity(t, truth);
      const relation = classify(t, truth).relation;
      if (sim >= 0.55 || relation === "RESTATES") {
        issues.push("restates_truth");
        why.push(
          relation === "RESTATES"
            ? "it asserts what the truth asserts, about the same subject"
            : `it shares ${Math.round(sim * 100)}% of the truth's own language`
        );
      }
    }

    // ── 2. Could a competitor say this? ─────────────────────────────────
    if (CATEGORY_CLAIM.test(t)) {
      issues.push("generic_category_claim");
      why.push(`it makes a claim any brand in the category could make ("${t.match(CATEGORY_CLAIM)?.[0]}")`);
    }

    // ── 3. Is there a specific human moment? ────────────────────────────
    const hasPerson = PERSON.test(t);
    const hasSituation = SITUATION.test(t);
    if (!hasPerson || !hasSituation) {
      issues.push("no_human_moment");
      why.push(
        !hasPerson && !hasSituation
          ? "there is nobody in it and nothing happening"
          : !hasPerson
            ? "there is a situation but nobody in it"
            : "there is a person but no moment they are in"
      );
    }

    // ── 4. Is anything from this brief load-bearing? ────────────────────
    const anchors = (context.anchors || []).map((a) => String(a || "").trim()).filter(Boolean);
    if (anchors.length) {
      const carried = anchors.some((a) => {
        const words = a
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        if (words.length < 2) return false;
        return words.filter((w) => new RegExp(`\\b${escapeRe(w)}\\w*\\b`, "i").test(t)).length >= 2;
      });
      if (!carried) {
        issues.push("not_brand_owned");
        why.push("nothing this brief supplied is load-bearing in it");
      }
    }

    // ── 5. Tension, or only a nice sentence? ────────────────────────────
    if (!TENSION.test(t)) {
      issues.push("no_tension");
      why.push("nothing is held against anything; it states rather than opposes");
    }

    // Two is the line, and it was chosen by measurement rather than taste.
    //
    // At a limit of one the critique drops 185 candidates of 1,274 and the
    // director's verdict gets *worse*: approval 8% to 7%, TRANSFORMED ideas 11 to
    // 7, DISCONNECTED 60 to 67. It was removing sentences that carried the truth
    // but happened to be short on situation vocabulary. At two it removes 33 and
    // the verdict is unchanged. A filter that costs good work to remove bad work
    // is not worth having, so it sits where it does no harm.
    const keep = issues.length <= CRITIQUE_ISSUE_LIMIT;
    return {
      idea: t,
      keep,
      issues,
      reasoning: issues.length
        ? `${keep ? "Kept" : "Dropped"}: ${why.join("; ")}.`
        : "Kept: it says something specific, about someone, with something at stake.",
    };
  }

  /** Run-level summary, for the phase report. Never scored, never ranked. */
  public static aggregate(results: CritiqueResult[]): {
    reviewed: number;
    kept: number;
    dropped: number;
    by_issue: Record<string, number>;
  } {
    const by_issue: Record<string, number> = {};
    for (const r of results) for (const i of r.issues) by_issue[i] = (by_issue[i] || 0) + 1;
    return {
      reviewed: results.length,
      kept: results.filter((r) => r.keep).length,
      dropped: results.filter((r) => !r.keep).length,
      by_issue,
    };
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
