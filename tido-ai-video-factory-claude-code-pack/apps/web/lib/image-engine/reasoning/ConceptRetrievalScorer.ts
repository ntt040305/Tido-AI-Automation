import { ReasoningKnowledgeObject, ReasoningRetrievalQuery } from "./reasoning-knowledge.types";
import { ConceptCandidate, ConceptRelevanceScore, ConceptRelevanceSignals } from "./concept-generation.types";

/**
 * Scores a concept object on how well its human material fits a brief.
 *
 * The eight-axis retrieval score asks "does this knowledge apply here". This
 * asks a different question — "is this the right thing for a person to feel
 * here" — and the two disagree often enough to matter. A strategy rule tagged
 * `industry: beauty` and a human tension tagged the same way score identically
 * on context; only one of them names something the audience is actually caught
 * between.
 *
 * Weights, and why they are ordered this way
 * ------------------------------------------
 * `human_problem` dominates because a concept that names the wrong tension is
 * wrong no matter how well it matches every label. `emotional` is weighted
 * lowest of the five not because tone is unimportant but because it is measured
 * by vocabulary overlap, which is the weakest signal here — weighting a weak
 * measure heavily is how a scorer starts ranking on noise.
 */

const WEIGHTS: Record<keyof ConceptRelevanceSignals, number> = {
  human_problem: 0.35,
  audience: 0.2,
  brand_position: 0.15,
  industry: 0.2,
  emotional: 0.1,
};

/** Words too common to indicate a shared tension. */
const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "она", "she", "her", "his", "they",
  "them", "their", "have", "has", "had", "was", "were", "been", "being", "does",
  "not", "but", "who", "what", "when", "where", "which", "while", "from", "into",
  "than", "then", "too", "very", "will", "would", "could", "should", "about",
  "there", "these", "those", "other", "more", "most", "some", "such", "only",
  "own", "same", "just", "also", "because", "product", "brand", "campaign",
]);

function words(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.min(a.size, b.size);
}

/** Emotional register vocabulary, grouped so a tone maps onto a family. */
const EMOTIONAL_FAMILIES: [RegExp, string[]][] = [
  [/premium|luxur|refined|restrained|quiet|considered|understated/i,
    ["restraint", "confidence", "composure", "discretion", "assurance", "calm", "quiet", "unhurried"]],
  [/warm|friendly|welcoming|local|honest|unpretentious|human/i,
    ["belonging", "recognition", "welcome", "warmth", "ease", "familiar", "company", "ordinary"]],
  [/clinical|precise|technical|expert|sober|exact/i,
    ["evidence", "verifiable", "certainty", "proof", "measured", "accountability", "rigour"]],
  [/bold|energetic|fun|playful|direct|fast/i,
    ["urgency", "surprise", "momentum", "decisiveness", "immediate"]],
  [/reassuring|calm|safe|gentle|caring/i,
    ["relief", "safety", "permission", "reassurance", "forgiveness", "support"]],
];

export class ConceptRetrievalScorer {
  /**
   * Scores one object.
   *
   * `briefText` is the brief's own prose — product, concept and tone. It is what
   * the human_problem signal is measured against, because a tension is relevant
   * when it appears in the brief's own description of the problem, not when it
   * shares a label with it.
   */
  public static score(
    obj: ReasoningKnowledgeObject,
    query: ReasoningRetrievalQuery,
    briefText: string
  ): ConceptRelevanceScore {
    const profile = obj.domain_profile as
      | { kind?: string; human_tension?: string; emotional_trigger?: string; industries?: string[] }
      | undefined;
    const isPattern = profile?.kind === "creative_concept_pattern";

    const matched: string[] = [];
    const signals: ConceptRelevanceSignals = {
      human_problem: 0,
      audience: 0,
      brand_position: 0,
      industry: 0,
      emotional: 0,
    };

    // ── Human problem ──────────────────────────────────────────────────
    // Compared against the tension text where the object has one, and against
    // `problem` otherwise, so non-pattern objects are scored on the closest
    // equivalent rather than excluded.
    const tensionText = profile?.human_tension || String(obj.problem || "");
    signals.human_problem = overlap(words(tensionText), words(briefText));
    if (signals.human_problem > 0.1) matched.push("human_problem");

    // ── Audience ───────────────────────────────────────────────────────
    const objAudience = obj.context?.audience;
    const audienceValues = Array.isArray(objAudience) ? objAudience : [objAudience];
    if (query.audience && audienceValues.some((v) => v && v !== "*" && String(v) === query.audience)) {
      signals.audience = 1;
      matched.push("audience");
    } else if (audienceValues.every((v) => !v || v === "*")) {
      // A universal object is applicable but unproven for this audience. Half
      // credit, so a specifically-matched object always outranks it.
      signals.audience = 0.5;
    }

    // ── Brand position ─────────────────────────────────────────────────
    const objPosition = obj.context?.brand_position;
    const positionValues = Array.isArray(objPosition) ? objPosition : [objPosition];
    if (query.brand_position && positionValues.some((v) => v && v !== "*" && String(v) === query.brand_position)) {
      signals.brand_position = 1;
      matched.push("brand_position");
    } else if (positionValues.every((v) => !v || v === "*")) {
      signals.brand_position = 0.5;
    }

    // ── Industry ───────────────────────────────────────────────────────
    const objIndustry = obj.context?.industry;
    const industryValues = Array.isArray(objIndustry) ? objIndustry : [objIndustry];
    if (query.industry && industryValues.some((v) => v && v !== "*" && String(v) === query.industry)) {
      signals.industry = 1;
      matched.push("industry");
    } else if (query.industry && profile?.industries?.includes(query.industry)) {
      signals.industry = 1;
      matched.push("industry");
    } else if (industryValues.every((v) => !v || v === "*")) {
      signals.industry = 0.5;
    }

    // ── Emotional ──────────────────────────────────────────────────────
    const trigger = profile?.emotional_trigger || String(obj.impact || "");
    const tone = String(briefText || "");
    for (const [pattern, family] of EMOTIONAL_FAMILIES) {
      if (!pattern.test(tone)) continue;
      const hit = family.some((w) => trigger.toLowerCase().includes(w));
      if (hit) {
        signals.emotional = 1;
        matched.push("emotional");
        break;
      }
      signals.emotional = Math.max(signals.emotional, 0.3);
    }

    let total = 0;
    for (const k of Object.keys(WEIGHTS) as (keyof ConceptRelevanceSignals)[]) {
      total += signals[k] * WEIGHTS[k];
    }
    // A purpose-built concept pattern is preferred over an object that merely
    // has a usable `problem` field. Small, because a well-matched strategy rule
    // should still be able to beat a poorly-matched pattern.
    if (isPattern) total *= 1.15;

    return {
      knowledge_id: obj.knowledge_id,
      domain: String(obj.domain),
      signals,
      total: Number(Math.min(1, total).toFixed(4)),
      matched,
    };
  }

  /** Scores and ranks a candidate set. */
  public static rank(
    candidates: ConceptCandidate[],
    query: ReasoningRetrievalQuery,
    briefText: string
  ): { candidate: ConceptCandidate; score: ConceptRelevanceScore }[] {
    return candidates
      .map((c) => ({ candidate: c, score: this.score(c.object, query, briefText) }))
      .sort(
        (a, b) =>
          b.score.total - a.score.total ||
          // Ties broken by the retrieval score, then by id, so ranking is stable
          // across runs. A non-deterministic chain cannot be regression tested.
          b.candidate.score - a.candidate.score ||
          a.score.knowledge_id.localeCompare(b.score.knowledge_id)
      );
  }
}
