import { GENERIC_MARKERS } from "./creative-concept.types";
import { OriginalityAssessment, OriginalitySignals } from "./creative-synthesis.types";

/**
 * Scores how far an idea is from its own material, from ideas already used, and
 * from category default.
 *
 * Two of the four signals are real measures of real properties. Two are proxies,
 * and they carry a third of the weight between them, because a proxy weighted
 * like a measure is how a score ends up describing its own heuristics rather
 * than the thing it claims to assess.
 *
 * There is no embedding service here, so "semantic distance" is trigram and
 * content-word overlap rather than vector distance. That is a weaker measure and
 * it is named honestly: it detects paraphrase and reuse reliably, and it cannot
 * tell that two differently-worded ideas mean the same thing. Where an embedding
 * service exists, `distance()` is the single function to replace.
 */

const WEIGHTS: Record<keyof OriginalitySignals, number> = {
  semantic_distance: 0.4,
  cliche_penalty: 0.27,
  memorability: 0.18,
  emotional_tension: 0.15,
};

/** Below this, two ideas are the same idea differently worded. */
export const SIMILARITY_REJECT_THRESHOLD = 0.72;

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "she", "her", "his", "they", "them",
  "their", "have", "has", "had", "was", "were", "been", "being", "does", "not",
  "but", "who", "what", "when", "where", "which", "while", "from", "into", "than",
  "then", "too", "very", "will", "would", "could", "should", "about", "there",
  "these", "those", "other", "more", "most", "some", "such", "only", "own", "same",
  "just", "also", "because", "rather", "instead", "already", "anyway", "before",
]);

function contentWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function trigrams(text: string): Set<string> {
  const t = String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * 0-1 similarity between two strings. 1 is identical.
 *
 * Blends character trigrams with content-word overlap: trigrams catch
 * paraphrase and small edits, content words catch the case where a sentence is
 * rebuilt around the same handful of substantive terms.
 */
export function similarity(a: string, b: string): number {
  const tri = jaccard(trigrams(a), trigrams(b));
  const wa = new Set(contentWords(a));
  const wb = new Set(contentWords(b));
  const words = jaccard(wa, wb);
  return Number((tri * 0.5 + words * 0.5).toFixed(4));
}

/** Abstractions that make a sentence forgettable. */
const ABSTRACT = [
  "experience", "solution", "journey", "innovation", "excellence", "quality",
  "value", "lifestyle", "passion", "commitment", "leading", "trusted", "empower",
  "unlock", "elevate", "transform", "seamless", "holistic", "synergy",
];

/** Opposition markers: a sentence holding two things against each other. */
const OPPOSITION = /\b(rather than|instead of|not\b.*\bbut\b|without|even though|anyway|yet\b|while\b|before anyone|refuse|decline|give up)\b/i;

/** Emotional vocabulary that names a feeling rather than describing one. */
const EMOTIONAL = [
  "relief", "fear", "guilt", "shame", "pride", "belong", "recognit", "trust",
  "doubt", "confiden", "anxiet", "permission", "safe", "loss", "regret", "respect",
  "comfort", "certain", "exhaust", "resent", "hope", "afraid", "worth",
];

export class OriginalityEvaluator {
  /**
   * Assesses one candidate.
   *
   * `sourceMaterial` is the tension, insight and territory the idea was built
   * from. Distance is measured against it deliberately: an idea that merely
   * restates its own input has added nothing, which is exactly the Phase 4.0.1
   * defect where the big idea was a knowledge object's decision field.
   */
  public static assess(
    idea: string,
    sourceMaterial: string[],
    priorIdeas: string[],
    avoidPhrases: string[] = []
  ): OriginalityAssessment {
    const notes: string[] = [];

    // ── Semantic distance ──────────────────────────────────────────────
    const vsSource = sourceMaterial.length
      ? Math.max(...sourceMaterial.map((m) => similarity(idea, m)))
      : 0;
    let closest = "";
    let vsPrior = 0;
    for (const p of priorIdeas) {
      const s = similarity(idea, p);
      if (s > vsPrior) {
        vsPrior = s;
        closest = p;
      }
    }
    // The worse of the two distances governs: restating your own input and
    // restating a previous idea are both failures to add anything.
    const semantic_distance = Number((1 - Math.max(vsSource, vsPrior)).toFixed(4));
    if (vsSource > 0.6) notes.push(`Close paraphrase of its own source material (${vsSource.toFixed(2)}).`);

    // ── Cliché penalty ─────────────────────────────────────────────────
    const lowered = idea.toLowerCase();
    const generic = GENERIC_MARKERS.filter((m) => lowered.includes(m.toLowerCase()));
    const avoided = avoidPhrases.filter((m) => m && lowered.includes(m.toLowerCase()));
    const abstract = contentWords(idea).filter((w) => ABSTRACT.includes(w));
    const clichéCount = generic.length + avoided.length + abstract.length;
    const cliche_penalty = Number(Math.max(0, 1 - clichéCount * 0.25).toFixed(4));
    if (clichéCount) notes.push(`${clichéCount} category or abstract marker(s): ${[...generic, ...avoided, ...abstract].slice(0, 3).join(", ")}.`);

    // ── Memorability (proxy) ───────────────────────────────────────────
    // Short and concrete correlates with recall. Imperfectly — which is why this
    // carries under a fifth of the weight.
    const words = idea.split(/\s+/).length;
    const lengthScore = words <= 12 ? 1 : words <= 18 ? 0.75 : words <= 26 ? 0.45 : 0.2;
    const concreteness = 1 - Math.min(1, abstract.length * 0.3);
    const memorability = Number((lengthScore * 0.65 + concreteness * 0.35).toFixed(4));

    // ── Emotional tension (proxy) ──────────────────────────────────────
    const hasOpposition = OPPOSITION.test(idea);
    const emotionalHits = EMOTIONAL.filter((e) => lowered.includes(e)).length;
    const emotional_tension = Number(
      Math.min(1, (hasOpposition ? 0.6 : 0) + Math.min(0.4, emotionalHits * 0.2)).toFixed(4)
    );

    const signals: OriginalitySignals = { semantic_distance, cliche_penalty, memorability, emotional_tension };
    let score = 0;
    for (const k of Object.keys(WEIGHTS) as (keyof OriginalitySignals)[]) score += signals[k] * WEIGHTS[k];
    score = Number((score * 10).toFixed(2));

    const tooSimilar = vsPrior >= SIMILARITY_REJECT_THRESHOLD;
    if (tooSimilar) notes.push(`Too close to an idea already used (${vsPrior.toFixed(2)}).`);

    return {
      signals,
      score,
      compared_against: priorIdeas.length,
      too_similar_to: tooSimilar ? closest : undefined,
      accepted: !tooSimilar,
      notes,
    };
  }

  /**
   * Picks the best candidate that is not a repeat.
   *
   * This is the "regenerate if too similar" mechanism, done exhaustively rather
   * than by retry: every candidate the material supports is assessed, the ones
   * that duplicate a prior idea are rejected, and the highest remaining wins.
   * A retry loop over a deterministic generator would produce the same candidate
   * every time, so exhausting the space is the only form of regeneration that
   * means anything here.
   */
  public static selectBest<T extends { big_idea: string }>(
    candidates: T[],
    sourceMaterial: string[],
    priorIdeas: string[],
    avoidPhrases: string[] = []
  ): { chosen: T; assessment: OriginalityAssessment; rejected: number } | null {
    if (!candidates.length) return null;

    const assessed = candidates.map((c) => ({
      candidate: c,
      assessment: this.assess(c.big_idea, sourceMaterial, priorIdeas, avoidPhrases),
    }));
    const fresh = assessed.filter((a) => a.assessment.accepted);
    const pool = fresh.length ? fresh : assessed;
    pool.sort((a, b) => b.assessment.score - a.assessment.score || a.candidate.big_idea.localeCompare(b.candidate.big_idea));

    return {
      chosen: pool[0].candidate,
      assessment: pool[0].assessment,
      rejected: assessed.length - fresh.length,
    };
  }
}
