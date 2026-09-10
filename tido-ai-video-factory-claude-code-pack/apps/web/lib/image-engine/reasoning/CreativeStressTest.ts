import { similarity } from "./OriginalityEvaluator";
import { StressTestName, StressTestReport, StressTestResult } from "./creative-taste.types";

/**
 * CIOS Phase 4.0.4 — the four tests a director runs before reading anything else.
 *
 * These reject rather than score, and the distinction is the point. A scoring
 * dimension lets a weakness be offset by a strength somewhere else; an idea that
 * works equally well for a competitor is not a weaker idea, it is not this
 * brand's idea, and no amount of craft elsewhere changes that.
 *
 * The four
 * --------
 *   REPLACE_BRAND   Swap the brand for a competitor. If the idea reads
 *                   identically, the brand is decoration on it.
 *   FIRST_REACTION  Is it understood on one pass? An idea that needs a second
 *                   read gets one read in the world.
 *   EXPLANATION     Does it carry its own meaning, or does it need the strategy
 *                   deck standing next to it?
 *   COPY            Could a competitor run it tomorrow, unchanged? Not "would
 *                   they" — could they.
 *
 * Honest limits, per test
 * ----------------------
 * REPLACE_BRAND and COPY are the two with real teeth: brand-dependence and
 * category-genericness both have surface forms, and swapping a token and
 * re-reading is a genuine operation on the text.
 *
 * FIRST_REACTION is the weakest of the four and it is not close. A real first
 * reaction is a person's, measured in the moment before they think. What is
 * checked here is the structural proxy — clause count, subordination, whether
 * the sentence resolves before it ends. It catches an idea that is obviously
 * hard to parse and it cannot tell you whether anyone would care.
 *
 * EXPLANATION sits between them: dependence on an antecedent the idea does not
 * supply is checkable; needing the room to have read the brief is not.
 */

/** Category-generic claims any competitor could make. */
const GENERIC_CLAIM =
  /\b(?:the best|leading|trusted|premium|innovative|world[- ]class|award[- ]winning|customer[- ]first|quality you can trust|we care|your partner|excellence)\b/i;

/** Language that refers out to something the idea has not supplied. */
const DANGLING_REFERENCE =
  /\b(?:this|that|it|they|them|these|those|such|the above|the former|the latter)\b/i;

/** Terms whose meaning lives in a strategy document rather than in the world. */
const DECK_DEPENDENT =
  /\b(?:positioning|proposition|equity|territory|architecture|framework|pillar|ecosystem|touchpoint|funnel|segment|persona|insight[- ]led|north star)\b/i;

/** Marks a sentence that resolves rather than trailing into a second clause. */
const SUBORDINATOR =
  /\b(?:because|although|whereas|which|while|since|unless|whereby|insofar|given that|in order that)\b/i;

export class CreativeStressTest {
  public static run(
    idea: string,
    context: {
      brand?: string;
      product?: string;
      category?: string;
      /** Competitor names, where the brief supplies any. */
      competitors?: string[];
      /** The behaviour the brief described. Brief-specific by construction. */
      behaviour?: string;
      /** The distinctive phrase from the brief's own challenge. */
      keyPhrase?: string;
      /** Ideas already delivered this run, for the copy test's second half. */
      priorIdeas?: string[];
    } = {}
  ): StressTestReport {
    const t = String(idea || "").trim();
    const notes: string[] = [];

    if (!t) {
      const dead: StressTestResult[] = (
        ["REPLACE_BRAND", "FIRST_REACTION", "EXPLANATION", "COPY"] as StressTestName[]
      ).map((test) => ({
        test,
        survived: false,
        evidence: "no idea to test",
        consequence: "There is nothing to run.",
      }));
      return { idea: t, results: dead, failures: dead.map((d) => d.test), survived: false, notes };
    }

    const results: StressTestResult[] = [];
    const brand = String(context.brand || "").trim();
    const product = String(context.product || "").trim();

    // ── 1. Replace brand ───────────────────────────────────────────────
    // Swap the brand token for a placeholder and compare. An idea that does not
    // change is an idea the brand is not in.
    const swapped = brand
      ? t.replace(new RegExp(`\\b${escapeRe(brand)}\\b`, "gi"), "A Competitor")
      : t;
    const brandPresent = brand ? swapped !== t : false;
    const productPresent = product
      ? contentWords(product).some((w) => new RegExp(`\\b${escapeRe(w)}s?\\b`, "i").test(t))
      : false;

    // The idea does not have to name the brand, and the first version of this
    // test assumed it did — which failed 527 of 533 ideas, because a good big
    // idea almost never says the brand's name. That was the test being wrong,
    // not the work.
    //
    // The real question is whether the idea rests on something *this brief*
    // supplied that a competitor would not inherit along with it: the behaviour
    // the brief described, the distinctive phrase in its challenge, the product
    // itself. An idea resting on none of those is one any competitor could run.
    const behaviourWords = contentWords(context.behaviour || "");
    const behaviourPresent =
      behaviourWords.length > 0 &&
      behaviourWords.filter((w) => new RegExp(`\\b${escapeRe(w)}\\w*\\b`, "i").test(t)).length >= 2;
    const keyWords = contentWords(context.keyPhrase || "");
    const keyPresent =
      keyWords.length > 0 &&
      keyWords.filter((w) => new RegExp(`\\b${escapeRe(w)}\\w*\\b`, "i").test(t)).length >= 2;

    const restsOnSomething = brandPresent || productPresent || behaviourPresent || keyPresent;
    results.push({
      test: "REPLACE_BRAND",
      survived: restsOnSomething,
      evidence: brandPresent
        ? "names the brand, so the swap changes it"
        : productPresent
          ? "rests on the product, which the competitor does not have"
          : behaviourPresent
            ? "rests on the behaviour this brief described"
            : keyPresent
              ? "rests on the distinctive situation this brief named"
              : "rests on nothing this brief supplied",
      consequence: restsOnSomething
        ? "The brand is load-bearing here."
        : "A competitor could run this unchanged; the brand is decoration on it.",
    });

    // ── 2. First reaction ──────────────────────────────────────────────
    // The weakest of the four. Structural legibility only.
    const words = t.split(/\s+/).length;
    const clauses = t.split(/[,;:—]/).filter((c) => c.trim().length > 3).length;
    const subordinated = SUBORDINATOR.test(t);
    const immediate = words <= 20 && clauses <= 2 && !subordinated;
    results.push({
      test: "FIRST_REACTION",
      survived: immediate,
      evidence: `${words} words, ${clauses} clause(s)${subordinated ? ", subordinated" : ""}`,
      consequence: immediate
        ? "It resolves on one pass."
        : "It needs a second read, and in the world it gets one.",
    });
    if (!immediate && words > 24) {
      notes.push("Long enough that the second half arrives after the reader has decided.");
    }

    // ── 3. Explanation ─────────────────────────────────────────────────
    // Does it carry its own meaning? Two failures: a pronoun with no antecedent
    // inside the sentence, and vocabulary whose meaning lives in a deck.
    const deck = DECK_DEPENDENT.test(t);
    // A dangling reference only counts when it appears before any noun it could
    // refer to — "it" in the second clause of a sentence that named a subject is
    // ordinary English.
    const firstClause = t.split(/[,;:—]/)[0] || t;
    const dangling = DANGLING_REFERENCE.test(firstClause) && !/^[A-Z][a-z]+ /.test(firstClause);
    const standsAlone = !deck && !dangling;
    results.push({
      test: "EXPLANATION",
      survived: standsAlone,
      evidence: deck
        ? `depends on deck vocabulary: "${t.match(DECK_DEPENDENT)?.[0]}"`
        : dangling
          ? "opens with a reference to something it has not supplied"
          : "carries its own meaning",
      consequence: standsAlone
        ? "It works without the deck standing next to it."
        : "It needs explaining, and the audience will not be in the room for that.",
    });

    // ── 4. Copy ────────────────────────────────────────────────────────
    // Could a competitor run it tomorrow. A generic claim always can be; so can
    // an idea already indistinguishable from another in this run.
    const generic = GENERIC_CLAIM.test(t);
    let nearest = 0;
    for (const p of context.priorIdeas || []) nearest = Math.max(nearest, similarity(t, p));
    const uncopyable = !generic && nearest < 0.6;
    results.push({
      test: "COPY",
      survived: uncopyable,
      evidence: generic
        ? `makes a claim anyone could make: "${t.match(GENERIC_CLAIM)?.[0]}"`
        : nearest >= 0.6
          ? `${Math.round(nearest * 100)}% similar to an idea already delivered this run`
          : "rests on something specific enough to be defended",
      consequence: uncopyable
        ? "A competitor would have to concede something to run it."
        : "A competitor could run this tomorrow with nothing changed.",
    });

    const failures = results.filter((r) => !r.survived).map((r) => r.test);

    // An idea survives when it passes the two tests with teeth. FIRST_REACTION
    // and EXPLANATION are reported and do not veto on their own, because a proxy
    // this weak should not be able to kill work by itself.
    const hardFailures = failures.filter((f) => f === "REPLACE_BRAND" || f === "COPY");
    const survived = hardFailures.length === 0 && failures.length <= 2;

    if (hardFailures.length) {
      notes.push(
        `Fails ${hardFailures.join(" and ")} — the two tests that decide whether this is the brand's idea.`
      );
    }

    return { idea: t, results, failures, survived, notes };
  }

  public static aggregate(reports: StressTestReport[]): {
    cases: number;
    survived: number;
    survival_rate: number;
    by_test: Record<StressTestName, number>;
    /** Ideas any competitor could run: the generic-rejection number. */
    generic: number;
    generic_rejection_rate: number;
    /** Ideas that rest on something only this brand has. */
    brand_owned: number;
    brand_ownership_rate: number;
  } {
    const tests: StressTestName[] = ["REPLACE_BRAND", "FIRST_REACTION", "EXPLANATION", "COPY"];
    const by_test = {} as Record<StressTestName, number>;
    for (const t of tests) {
      by_test[t] = reports.filter((r) => r.results.find((x) => x.test === t)?.survived).length;
    }
    const n = reports.length || 1;
    const generic = reports.filter((r) => r.failures.includes("COPY")).length;
    const brandOwned = by_test.REPLACE_BRAND;
    return {
      cases: reports.length,
      survived: reports.filter((r) => r.survived).length,
      survival_rate: Number((reports.filter((r) => r.survived).length / n).toFixed(3)),
      by_test,
      generic,
      generic_rejection_rate: Number((generic / n).toFixed(3)),
      brand_owned: brandOwned,
      brand_ownership_rate: Number((brandOwned / n).toFixed(3)),
    };
  }

  public static format(agg: ReturnType<typeof CreativeStressTest.aggregate>): string {
    return [
      `STRESS TESTS — ${agg.cases} ideas · ${agg.survived} survive (${(agg.survival_rate * 100).toFixed(0)}%)`,
      `  replace brand   : ${agg.by_test.REPLACE_BRAND} pass`,
      `  first reaction  : ${agg.by_test.FIRST_REACTION} pass`,
      `  explanation     : ${agg.by_test.EXPLANATION} pass`,
      `  copy            : ${agg.by_test.COPY} pass`,
      `  generic (would be rejected) : ${agg.generic} (${(agg.generic_rejection_rate * 100).toFixed(0)}%)`,
      `  brand-owned                 : ${agg.brand_owned} (${(agg.brand_ownership_rate * 100).toFixed(0)}%)`,
      "",
      "  note: REPLACE_BRAND and COPY have teeth — brand-dependence and genericness have",
      "        surface forms. FIRST_REACTION is the weakest and does not veto on its own: a",
      "        real first reaction is a person's, and clause-counting is not that.",
    ].join("\n");
  }
}

/** Content words, for checking whether brief-specific material survived. */
function contentWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !COMMON.has(w));
}

const COMMON = new Set([
  "that", "this", "with", "from", "they", "them", "their", "have", "will",
  "would", "about", "there", "these", "those", "what", "when", "where", "which",
  "while", "because", "than", "then", "more", "most", "some", "such", "only",
  "very", "just", "also", "into", "over", "under", "been", "being", "does",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
