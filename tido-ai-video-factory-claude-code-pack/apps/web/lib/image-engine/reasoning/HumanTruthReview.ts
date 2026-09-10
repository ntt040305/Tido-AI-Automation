import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { similarity } from "./OriginalityEvaluator";

/**
 * CIOS Phase 4.0.3.5 — the five questions a planner asks of a truth.
 *
 * What this replaces, and why it is still a proxy
 * ----------------------------------------------
 * The 4.0.1.5 rubric's `human_truth` is lexical overlap between the tension and
 * the brief's problem statement. Phase 4.0.3 established what that measures by
 * running the control: feed the brief's own sentence back as the tension and it
 * scores 18.9 of 25 — the highest available score, awarded to the input. The
 * metric rewards restatement and the adversarial harness punishes it, which means
 * the two instruments in the suite disagree by construction.
 *
 * This file does not fix that by becoming a measurement. Nothing here reads a
 * sentence and knows whether it is true of people, and no arrangement of regular
 * expressions will. What it does is replace one bad proxy with five better ones:
 * checks on the *content* of the truth rather than on its vocabulary overlap with
 * the input. That is a real improvement and a bounded one, and both halves are
 * stated on every report this produces.
 *
 * The five, and what each can actually establish:
 *
 *   obvious              — whether the truth is a platitude or restates the brief.
 *                          Checkable. Platitudes have surface forms.
 *   hidden_motivation    — whether it names a motive the brief did not state.
 *                          Checkable as presence-and-difference, not as insight.
 *   self_recognition     — whether it describes a person doing something, in
 *                          language a person would use. Checkable as register.
 *   competitor_could_say — whether it depends on a specific behaviour or is a
 *                          category-generic claim. Checkable, weakly.
 *   changes_strategy     — whether a different action follows from it than from
 *                          the brief alone. The weakest of the five; it detects
 *                          the presence of a redirection, not its value.
 *
 * A truth that passes all five is not thereby good. It has passed the checks that
 * can be automated, which is the most this layer claims and the reason the blind
 * human benchmark from Phase 3.1.8 remains the instrument of record.
 */

export type ReviewQuestion =
  | "obvious"
  | "hidden_motivation"
  | "self_recognition"
  | "competitor_could_say"
  | "changes_strategy";

export interface ReviewFinding {
  question: ReviewQuestion;
  /** True where the truth passes this question. */
  passed: boolean;
  /** 0-1. How strongly, for aggregation. */
  score: number;
  /** What in the text decided it. */
  evidence: string;
}

export interface HumanTruthReviewResult {
  findings: ReviewFinding[];
  /** 0-100, weighted. An alternative to the rubric's lexical human_truth. */
  score: number;
  /** Questions the truth failed, named. */
  failed: ReviewQuestion[];
  verdict: "STRONG" | "SERVICEABLE" | "WEAK";
  notes: string[];
}

/**
 * Weights.
 *
 * `obvious` and `hidden_motivation` carry most of it because they are the two
 * that separate a truth from a restatement, which is the failure this phase
 * exists to catch. `changes_strategy` carries least because it is the check this
 * layer can least honestly make.
 */
const WEIGHTS: Record<ReviewQuestion, number> = {
  obvious: 28,
  hidden_motivation: 26,
  self_recognition: 20,
  competitor_could_say: 16,
  changes_strategy: 10,
};

/** Sentences that are true and carry no information. */
const PLATITUDE = [
  /\bpeople (?:are|is) (?:different|complex|busy|human)\b/i,
  /\b(?:everyone|everybody) (?:wants?|needs?|likes?|deserves?)\b/i,
  /\bat the end of the day\b/i,
  /\b(?:quality|trust|convenience|value) (?:matters|is important|is key)\b/i,
  /\bpeople want to (?:feel|look) (?:good|better|confident)\b/i,
  /\b(?:customers?|consumers?) (?:want|need|expect) (?:more|better|the best)\b/i,
];

/** Words that name a motive rather than a preference. */
const MOTIVE = [
  "afraid", "fear", "shame", "ashamed", "guilt", "pride", "relief", "exposed",
  "blame", "judged", "isolat", "doubt", "trust", "resent", "embarrass", "belong",
  "regret", "insult", "underestimat", "verdict", "concede", "admit", "protect",
  "defend", "justify", "permission", "recognis", "recogniz", "seen", "standing",
  "accountab", "responsib", "identity", "worth",
];

/** Vocabulary that makes a sentence about a market rather than about a person. */
const MARKET_REGISTER =
  /\b(brand|category|product|campaign|market|segment|consumer|customer|audience|conversion|retention|proposition|touchpoint|funnel|equity)\b/i;

/** A sentence describing an act or a state of a person. */
const PERSON_SUBJECT =
  /\b(people|they|she|he|someone|anyone|a person|buyers|customers were|most of us|we)\b/i;

/**
 * Tells that a sentence was spliced rather than written.
 *
 * A subordinating conjunction stranded between two finite verbs, a repeated
 * template connective, an immediately doubled word.
 */
const MALFORMED: RegExp[] = [
  /\b(?:because|which|that)\b[^.]{0,40}\bis usually\b/i,
  /\busually\b[^.]*\busually\b/i,
  /\blooks like\b[^.]*\blooks like\b/i,
  /\b(\w+)\s+\1\b/i,
  /\b(?:the|a|an|of|to|and|or|in|on|for|with)\s+is\b/i,
];

/** Language that implies a different action follows. */
const REDIRECTION =
  /\b(rather than|instead of|not\b[^.]*\bbut\b|before\b|until\b|what stops|the reason .* is not|is not\b[^.]*\bit is\b|do not\b[^.]*\bthey\b|long before)\b/i;

export class HumanTruthReview {
  public static review(
    truth: string,
    context: {
      briefProblem: string;
      audience: string;
      product: string;
      objective?: string;
      /** The discovery layer's output, when there was one. */
      tension?: DynamicHumanTension | null;
    }
  ): HumanTruthReviewResult {
    const t = String(truth || "").trim();
    const notes: string[] = [];
    const findings: ReviewFinding[] = [];

    if (!t) {
      return {
        findings: (Object.keys(WEIGHTS) as ReviewQuestion[]).map((q) => ({
          question: q,
          passed: false,
          score: 0,
          evidence: "no truth to review",
        })),
        score: 0,
        failed: Object.keys(WEIGHTS) as ReviewQuestion[],
        verdict: "WEAK",
        notes: ["No human truth was produced, so there is nothing to review."],
      };
    }

    // ── 1. Is this obvious? ────────────────────────────────────────────
    // Two ways to be obvious: be a platitude, or be the brief again.
    const platitude = PLATITUDE.find((p) => p.test(t));
    const vsBrief = similarity(t, context.briefProblem);
    const obviousScore = platitude ? 0 : Math.max(0, 1 - Math.max(0, vsBrief - 0.25) * 2.2);
    findings.push({
      question: "obvious",
      passed: !platitude && vsBrief < 0.5,
      score: Number(obviousScore.toFixed(3)),
      evidence: platitude
        ? `platitude: "${t.match(platitude)?.[0]}"`
        : `${Math.round(vsBrief * 100)}% similar to the brief's own problem statement`,
    });
    if (platitude) notes.push("The truth is a platitude: true, and carrying no information.");
    if (vsBrief >= 0.5) notes.push("The truth is close to a restatement of the brief.");

    // ── 2. Does it reveal hidden motivation? ───────────────────────────
    // Present-and-different: it must name a motive, and that motive must not be
    // one the brief already stated. A truth that repeats the brief's own stated
    // feeling has revealed nothing.
    const lowered = t.toLowerCase();
    const motives = MOTIVE.filter((m) => lowered.includes(m));
    const briefMotives = MOTIVE.filter((m) => context.briefProblem.toLowerCase().includes(m));
    const novel = motives.filter((m) => !briefMotives.includes(m));
    const needNamed = Boolean(context.tension?.psychological_need);
    const motivationScore = Math.min(1, novel.length * 0.4 + (needNamed ? 0.3 : 0) + (motives.length ? 0.2 : 0));
    findings.push({
      question: "hidden_motivation",
      passed: motivationScore >= 0.5,
      score: Number(motivationScore.toFixed(3)),
      evidence: novel.length
        ? `names ${novel.slice(0, 3).join(", ")}, which the brief does not`
        : motives.length
          ? "names only motives the brief already stated"
          : "names no motive",
    });

    // ── 3. Would people recognise themselves? ──────────────────────────
    // Wellformedness belongs here rather than in a separate check: a sentence a
    // reader has to parse twice is one they do not recognise themselves in,
    // whatever it says. This layer scored 94 of 100 for "What looks like people
    // buyer reject correction language because it frames is usually recognising
    // yourself in what you are offered being protected" before it looked.
    // A person recognises a sentence about a person doing something, in language
    // they would use. Market vocabulary is the reliable tell that they would not.
    const marketTalk = MARKET_REGISTER.test(t);
    const personSubject = PERSON_SUBJECT.test(t);
    const overLong = t.split(/\s+/).length > 28;
    const malformed = MALFORMED.find((p) => p.test(t));
    const recognitionScore = Math.max(
      0,
      (personSubject ? 0.6 : 0.15) +
        (marketTalk ? -0.35 : 0.25) +
        (overLong ? -0.2 : 0.15) +
        (malformed ? -0.7 : 0)
    );
    findings.push({
      question: "self_recognition",
      passed: personSubject && !marketTalk && !malformed,
      score: Number(Math.min(1, recognitionScore).toFixed(3)),
      evidence: malformed
        ? `does not read as a sentence: "${t.match(malformed)?.[0]}"`
        : marketTalk
          ? `written in market register: "${t.match(MARKET_REGISTER)?.[0]}"`
          : personSubject
            ? "describes a person, in a person's language"
            : "no human subject",
    });
    if (malformed) notes.push("The truth does not read as a sentence; a reader parses it twice.");

    // ── 4. Could competitors say the same? ─────────────────────────────
    // The weak spot of every universal truth: universality is what makes it a
    // truth and also what makes it available to everyone. What makes it ownable
    // is that it rests on a specific behaviour rather than a category claim. So
    // this checks whether the discovered behaviour is what the truth is about.
    const behaviour = context.tension?.observable_behavior || "";
    const restsOnBehaviour = behaviour ? similarity(t, behaviour) > 0.08 : false;
    const genericClaim = /\b(?:best|leading|trusted|quality|premium|innovative|customer[- ]first)\b/i.test(t);
    const ownableScore = Math.max(
      0,
      (restsOnBehaviour ? 0.55 : 0.2) + (genericClaim ? -0.3 : 0.25) + (context.tension ? 0.2 : 0)
    );
    findings.push({
      question: "competitor_could_say",
      passed: !genericClaim && (restsOnBehaviour || Boolean(context.tension)),
      score: Number(Math.min(1, ownableScore).toFixed(3)),
      evidence: genericClaim
        ? "makes a claim any competitor also makes"
        : restsOnBehaviour
          ? "rests on the specific behaviour the brief describes"
          : "generic in form, though not a category claim",
    });

    // ── 5. Does it change strategy? ────────────────────────────────────
    // The honest limit of this file. A redirection in the sentence — "not X, but
    // Y", "what stops people is not..." — means a different action follows than
    // from the brief alone. Whether that action is better is not checkable here,
    // and this question carries the least weight for that reason.
    const redirects = REDIRECTION.test(t);
    const contradicts = Boolean(context.tension?.contradiction);
    const strategyScore = Math.min(1, (redirects ? 0.6 : 0.1) + (contradicts ? 0.3 : 0));
    findings.push({
      question: "changes_strategy",
      passed: redirects,
      score: Number(strategyScore.toFixed(3)),
      evidence: redirects
        ? `redirects: "${t.match(REDIRECTION)?.[0]}"`
        : "states a condition without implying a different action",
    });

    let score = 0;
    for (const f of findings) score += f.score * WEIGHTS[f.question];
    const failed = findings.filter((f) => !f.passed).map((f) => f.question);

    return {
      findings,
      score: Number(score.toFixed(2)),
      failed,
      verdict: score >= 70 ? "STRONG" : score >= 45 ? "SERVICEABLE" : "WEAK",
      notes,
    };
  }

  public static aggregate(results: HumanTruthReviewResult[]): {
    cases: number;
    mean_score: number;
    by_question: Record<ReviewQuestion, number>;
    strong: number;
    serviceable: number;
    weak: number;
    most_failed: ReviewQuestion;
  } {
    const qs = Object.keys(WEIGHTS) as ReviewQuestion[];
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const by_question = {} as Record<ReviewQuestion, number>;
    for (const q of qs) {
      by_question[q] = Number(
        mean(results.map((r) => r.findings.find((f) => f.question === q)?.score ?? 0)).toFixed(4)
      );
    }
    const failCounts = qs.map((q) => ({ q, n: results.filter((r) => r.failed.includes(q)).length }));
    failCounts.sort((a, b) => b.n - a.n);
    return {
      cases: results.length,
      mean_score: Number(mean(results.map((r) => r.score)).toFixed(2)),
      by_question,
      strong: results.filter((r) => r.verdict === "STRONG").length,
      serviceable: results.filter((r) => r.verdict === "SERVICEABLE").length,
      weak: results.filter((r) => r.verdict === "WEAK").length,
      most_failed: failCounts[0].q,
    };
  }

  public static format(agg: ReturnType<typeof HumanTruthReview.aggregate>): string {
    const L = [`HUMAN TRUTH REVIEW — ${agg.cases} truths · mean ${agg.mean_score.toFixed(1)} / 100`];
    for (const q of Object.keys(WEIGHTS) as ReviewQuestion[]) {
      L.push(`  ${q.padEnd(22)} ${(agg.by_question[q] * WEIGHTS[q]).toFixed(1).padStart(5)} / ${String(WEIGHTS[q]).padStart(2)}`);
    }
    L.push(`  strong ${agg.strong} · serviceable ${agg.serviceable} · weak ${agg.weak}`);
    L.push(`  most failed question : ${agg.most_failed}`);
    L.push("");
    L.push("  note: these are five better proxies, not a measurement. They check the truth's own");
    L.push("        content rather than its vocabulary overlap with the brief, which is what the");
    L.push("        4.0.1.5 human_truth does. Nothing here establishes that a truth is true of");
    L.push("        people; the blind human benchmark remains the instrument of record.");
    return L.join("\n");
  }
}
