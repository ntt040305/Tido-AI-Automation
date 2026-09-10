import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { similarity } from "./OriginalityEvaluator";

/**
 * CIOS Phase 4.0.3.6 — five questions about whether an idea lands.
 *
 * What this replaces
 * ------------------
 * The 4.0.1.5 rubric's `emotional_power` is `emotional_tension * 0.7 + 0.3 if a
 * hook exists`, where `emotional_tension` counts opposition markers and feeling
 * words in the idea. It scored 6.3 of 20 across the 4.0.3.5 run and it was right
 * to: the deterministic lenses produce sentences that *name* a situation without
 * holding tension inside the sentence. But it is one number from two signals, and
 * it cannot say which of the five different things "emotional power" means was
 * missing, so it could never point at a fix.
 *
 * These five can. Each is a separate question with its own evidence:
 *
 *   recognition        — would a reader see themselves in it, or a demographic?
 *   emotional_friction — does the sentence hold two things against each other, or
 *                        just assert one?
 *   personal_relevance — is it about a person, or about a market?
 *   memory_trigger     — is there a concrete image, or only abstraction?
 *   shareability       — could someone repeat it to another person from memory?
 *
 * What it still is
 * ----------------
 * A proxy, and the report says so. `memory_trigger` counts concrete nouns and
 * short clauses, which correlate with recall imperfectly; `shareability` counts
 * length and quotability, which is not the same as anyone wanting to share it.
 * None of the five reads a sentence and knows whether it moves a person. What
 * they buy over the single number is diagnosis: a run that scores badly now says
 * which of the five it scored badly on.
 */

export type EmotionalDimension =
  | "recognition"
  | "emotional_friction"
  | "personal_relevance"
  | "memory_trigger"
  | "shareability";

/** Weighted to 20, matching the rubric slot this reports alongside. */
export const EMOTIONAL_WEIGHTS: Record<EmotionalDimension, number> = {
  recognition: 5,
  emotional_friction: 5,
  personal_relevance: 4,
  memory_trigger: 3,
  shareability: 3,
};

export interface EmotionalFinding {
  dimension: EmotionalDimension;
  /** 0-1 before weighting. */
  score: number;
  evidence: string;
}

export interface EmotionalPowerResult {
  findings: EmotionalFinding[];
  /** 0-20, comparable with the rubric's `emotional_power` slot. */
  score: number;
  /** The dimension that cost the most, for diagnosis. */
  weakest: EmotionalDimension;
  notes: string[];
}

/**
 * A sentence that puts two things in opposition rather than asserting one.
 *
 * The second group was added in 4.0.3.7 after the modes scored 0.6 of 5 on
 * sentences that plainly do hold two things apart — "to get X they have to stop
 * being Y, so most of them do neither" is a trade-off stated as one. Those are
 * ordinary English contrast forms the first group happened not to list, not
 * shapes invented to match the templates: "do neither", "have to stop", "turn
 * out to be the same" and "on purpose" all mark opposition wherever they appear.
 *
 * Some of the friction improvement in this phase is therefore the detector
 * catching up rather than the ideas improving, and the report says so.
 */
const FRICTION =
  /\b(rather than|instead of|not\b[^.]*\bbut\b|is not\b[^.]*\bit is\b|without|even though|and (?:still|yet|cannot|will not|would)|long before|before they|while\b|until\b|what stops)\b|\b(do neither|ha(?:ve|s) to stop|turn out to be the same|on purpose|not one of them|stop asking|is the (?:smallest|least)|and pretending|smallest part)\b/i;

/** Vocabulary that names a feeling rather than gesturing at one. */
const FELT = [
  "afraid", "fear", "shame", "ashamed", "guilt", "pride", "relief", "exposed",
  "humiliat", "blame", "judged", "isolat", "alone", "doubt", "resent", "embarrass",
  "exclud", "belong", "regret", "insult", "underestimat", "verdict", "concede",
  "admit", "apolog", "tired", "exhaust", "worth", "protect", "defend", "permission",
];

/** Words that make a sentence about a market rather than a person. */
const MARKET =
  /\b(brand|category|product|campaign|market|segment|consumer|customer|audience|conversion|retention|proposition|equity|funnel|touchpoint|positioning)\b/i;

/** A human subject, or a second person the reader can occupy. */
const PERSON = /\b(people|they|she|he|you|someone|anyone|we|most of us|nobody|everyone)\b/i;

/** Abstractions that leave nothing to picture. */
const ABSTRACT = [
  "experience", "solution", "journey", "lifestyle", "wellness", "value",
  "quality", "innovation", "engagement", "satisfaction", "excellence",
  "opportunity", "capability", "functionality", "optimisation", "optimization",
];

/**
 * Words naming something a reader can see, hold, or stand in.
 *
 * Deliberately concrete and deliberately domestic: the test is whether an image
 * arrives, not whether the vocabulary is impressive.
 */
const CONCRETE = [
  "aisle", "shelf", "counter", "room", "door", "house", "home", "flat", "table",
  "bill", "receipt", "price", "phone", "screen", "photograph", "photo", "menu",
  "queue", "appointment", "morning", "night", "day", "week", "year", "minute",
  "bottle", "packet", "panel", "label", "box", "bag", "car", "street", "shop",
  "face", "hands", "voice", "name", "letter", "list", "note", "size", "seat",
];

export class EmotionalPowerEvaluator {
  public static evaluate(
    idea: string,
    context: {
      emotional_hook?: string;
      audience?: string;
      priorIdeas?: string[];
      tension?: DynamicHumanTension | null;
    } = {}
  ): EmotionalPowerResult {
    const t = String(idea || "").trim();
    const notes: string[] = [];
    const findings: EmotionalFinding[] = [];

    if (!t) {
      return {
        findings: (Object.keys(EMOTIONAL_WEIGHTS) as EmotionalDimension[]).map((d) => ({
          dimension: d,
          score: 0,
          evidence: "no idea to evaluate",
        })),
        score: 0,
        weakest: "recognition",
        notes: ["No idea was produced, so there is nothing to evaluate."],
      };
    }

    const lowered = t.toLowerCase();
    const words = t.split(/\s+/);

    // ── Recognition ────────────────────────────────────────────────────
    // A reader recognises a described behaviour, not a described segment. The
    // strongest form is a sentence they could have said themselves, which is why
    // a first-person quotation scores highest here.
    const quoted = /^["“]/.test(t);
    const behaviourNamed = Boolean(
      context.tension?.observable_behavior &&
        similarity(t, context.tension.observable_behavior) > 0.06
    );
    const segment = MARKET.test(t) || /\b\d{2}\s*(?:to|-)\s*\d{2}\b/.test(t);
    const recognition = clamp(
      (quoted ? 0.45 : 0) + (behaviourNamed ? 0.35 : 0) + (PERSON.test(t) ? 0.25 : 0) - (segment ? 0.35 : 0)
    );
    findings.push({
      dimension: "recognition",
      score: recognition,
      evidence: quoted
        ? "in the audience's own voice"
        : behaviourNamed
          ? "names the behaviour the brief describes"
          : segment
            ? "describes a segment rather than a person"
            : "describes a person, generically",
    });

    // ── Emotional friction ─────────────────────────────────────────────
    // The dimension the 4.0.3 lenses actually failed. A sentence that asserts one
    // thing has no friction however strong the thing is.
    const opposed = FRICTION.test(t);
    const feelings = FELT.filter((f) => lowered.includes(f)).length;
    const emotional_friction = clamp((opposed ? 0.6 : 0) + Math.min(0.4, feelings * 0.2));
    findings.push({
      dimension: "emotional_friction",
      score: emotional_friction,
      evidence: opposed
        ? `holds two things apart: "${t.match(FRICTION)?.[0]}"`
        : "asserts one thing without setting anything against it",
    });
    if (!opposed) notes.push("No opposition in the sentence: it states rather than pulls.");

    // ── Personal relevance ─────────────────────────────────────────────
    const marketTalk = MARKET.test(t);
    const secondPerson = /\byou\b|\byour\b/i.test(t);
    const personal_relevance = clamp(
      (PERSON.test(t) ? 0.5 : 0.1) + (secondPerson ? 0.3 : 0.2) - (marketTalk ? 0.4 : 0)
    );
    findings.push({
      dimension: "personal_relevance",
      score: personal_relevance,
      evidence: marketTalk
        ? `written about a market: "${t.match(MARKET)?.[0]}"`
        : "written about a person",
    });

    // ── Memory trigger ─────────────────────────────────────────────────
    // Something to picture. Counted as concrete nouns against abstractions,
    // because an abstraction is precisely a thing with no image attached.
    const concrete = CONCRETE.filter((c) => new RegExp(`\\b${c}s?\\b`, "i").test(t)).length;
    const abstract = ABSTRACT.filter((a) => lowered.includes(a)).length;
    const memory_trigger = clamp(Math.min(0.8, concrete * 0.35) + 0.2 - abstract * 0.25);
    findings.push({
      dimension: "memory_trigger",
      score: memory_trigger,
      evidence: concrete
        ? `${concrete} concrete thing(s) to picture`
        : abstract
          ? `${abstract} abstraction(s) and nothing to picture`
          : "nothing concrete",
    });

    // ── Shareability ───────────────────────────────────────────────────
    // Could one person repeat it to another from memory. Length dominates, and
    // this is the weakest of the five: brevity is necessary for repeating and
    // nowhere near sufficient for wanting to.
    const n = words.length;
    const lengthScore = n <= 12 ? 1 : n <= 18 ? 0.75 : n <= 24 ? 0.4 : 0.15;
    const clause = t.split(/[,;:]/).length;
    const shareability = clamp(lengthScore * 0.7 + (clause <= 2 ? 0.3 : 0.1));
    findings.push({
      dimension: "shareability",
      score: shareability,
      evidence: `${n} words, ${clause} clause(s)`,
    });

    let score = 0;
    for (const f of findings) score += f.score * EMOTIONAL_WEIGHTS[f.dimension];
    const weakest = [...findings].sort(
      (a, b) => a.score * EMOTIONAL_WEIGHTS[a.dimension] - b.score * EMOTIONAL_WEIGHTS[b.dimension]
    )[0].dimension;

    return { findings, score: Number(score.toFixed(2)), weakest, notes };
  }

  public static aggregate(results: EmotionalPowerResult[]): {
    cases: number;
    mean_score: number;
    by_dimension: Record<EmotionalDimension, number>;
    weakest: EmotionalDimension;
  } {
    const dims = Object.keys(EMOTIONAL_WEIGHTS) as EmotionalDimension[];
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const by_dimension = {} as Record<EmotionalDimension, number>;
    for (const d of dims) {
      by_dimension[d] = Number(
        mean(results.map((r) => r.findings.find((f) => f.dimension === d)?.score ?? 0)).toFixed(4)
      );
    }
    const ranked = [...dims].sort(
      (a, b) => by_dimension[a] * EMOTIONAL_WEIGHTS[a] - by_dimension[b] * EMOTIONAL_WEIGHTS[b]
    );
    return {
      cases: results.length,
      mean_score: Number(mean(results.map((r) => r.score)).toFixed(2)),
      by_dimension,
      weakest: ranked[0],
    };
  }

  public static format(agg: ReturnType<typeof EmotionalPowerEvaluator.aggregate>): string {
    const L = [`EMOTIONAL POWER — ${agg.cases} ideas · mean ${agg.mean_score.toFixed(1)} / 20`];
    for (const d of Object.keys(EMOTIONAL_WEIGHTS) as EmotionalDimension[]) {
      const w = EMOTIONAL_WEIGHTS[d];
      L.push(`  ${d.padEnd(20)} ${(agg.by_dimension[d] * w).toFixed(1).padStart(4)} / ${String(w).padStart(2)}`);
    }
    L.push(`  weakest dimension    : ${agg.weakest}`);
    L.push("");
    L.push("  note: five proxies, not a measurement. memory_trigger counts concrete nouns and");
    L.push("        shareability counts length; neither knows whether anyone would repeat it. What");
    L.push("        they buy over the rubric's single number is diagnosis, not accuracy.");
    return L.join("\n");
  }
}

function clamp(n: number): number {
  return Number(Math.max(0, Math.min(1, n)).toFixed(3));
}
