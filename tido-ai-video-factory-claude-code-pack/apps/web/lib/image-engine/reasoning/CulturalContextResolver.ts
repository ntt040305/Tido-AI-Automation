import {
  COUNTRY_RULES,
  CULTURAL_LIBRARY,
  CulturalContext,
  CulturalGeneration,
  GENERATION_DELTAS,
  GENERATION_RULES,
  NO_CULTURE,
} from "./cultural-context.types";

/**
 * Decides which cultural context, if any, a brief is entitled to.
 *
 * "If any" is the operative part. A resolver that always returns something turns
 * an absent signal into a confident answer, which is the same defect Phase 4.0.2
 * had in retrieval and Phase 4.0.3 removed from archetype matching. Where the
 * brief carries no market signal, this returns `NO_CULTURE` and the insight is
 * built without a cultural rung.
 *
 * The market is inferred from surface forms — place names, currency, Tet, the
 * diacritics themselves. The generation is inferred from the audience descriptor
 * only, never from the product: a brief for a school does not make its audience
 * Gen Z, since the buyer is the parent.
 */

export interface CulturalResolution {
  context: CulturalContext;
  resolved: boolean;
  /** What in the brief established the market and the generation. */
  evidence: string[];
  warnings: string[];
}

export class CulturalContextResolver {
  public static resolve(brief: {
    audience?: string;
    product?: string;
    brand?: string;
    challenge?: string;
    market?: string;
    industry?: string;
  }): CulturalResolution {
    const evidence: string[] = [];
    const warnings: string[] = [];

    // ── Market ─────────────────────────────────────────────────────────
    // An explicit market beats an inferred one. Everything else in the brief is
    // evidence, including the brand name, because a Vietnamese brand name in a
    // Vietnamese brief is the strongest signal available and is often the only one.
    const blob = [brief.market, brief.audience, brief.product, brief.brand, brief.challenge]
      .filter(Boolean)
      .join(" \n ");

    let country = "";
    for (const [pattern, key] of COUNTRY_RULES) {
      const m = blob.match(pattern);
      if (m) {
        country = key;
        evidence.push(`market ${key} from "${m[0]}"`);
        break;
      }
    }
    if (!country && brief.market) {
      const k = String(brief.market).toLowerCase().trim();
      if (CULTURAL_LIBRARY[k]) {
        country = k;
        evidence.push(`market ${k} stated in the brief`);
      }
    }

    if (!country) {
      warnings.push(
        "NO_CULTURAL_MARKET: nothing in the brief identifies a market, so no cultural context is " +
          "applied. An insight is still produced; it is simply not culturally grounded."
      );
      return { context: NO_CULTURE, resolved: false, evidence, warnings };
    }

    const base = CULTURAL_LIBRARY[country];
    if (!base) {
      warnings.push(
        `NO_CULTURAL_LIBRARY(${country}): the market was identified and there is no entry for it. ` +
          "Declining rather than substituting a neighbouring market's context."
      );
      return { context: NO_CULTURE, resolved: false, evidence, warnings };
    }

    // ── Generation ─────────────────────────────────────────────────────
    // From the audience descriptor alone. A brief for a tutoring service does
    // not make its audience Gen Z; the buyer is the parent, and reading the
    // product would get that backwards on every education brief in the set.
    let generation: CulturalGeneration = "unspecified";
    for (const [pattern, key] of GENERATION_RULES) {
      const m = String(brief.audience || "").match(pattern);
      if (m) {
        generation = key;
        evidence.push(`generation ${key} from "${m[0]}"`);
        break;
      }
    }
    if (generation === "unspecified") {
      warnings.push(
        "NO_GENERATION: the audience descriptor carries no age signal, so only the market-level " +
          "context applies."
      );
    }

    const delta = GENERATION_DELTAS[country]?.[generation] || {};
    const merge = (a: string[], b?: string[]) => [...(b || []), ...a];

    return {
      context: {
        ...base,
        generation,
        // Generational observations lead: they are the narrower claim, and a
        // narrower claim that fits is worth more than a broad one that also does.
        current_tensions: merge(base.current_tensions, delta.current_tensions),
        behavior_shifts: merge(base.behavior_shifts, delta.behavior_shifts),
        language_patterns: merge(base.language_patterns, delta.language_patterns),
        social_values: merge(base.social_values, delta.social_values),
        cultural_symbols: merge(base.cultural_symbols, delta.cultural_symbols),
      },
      resolved: true,
      evidence,
      warnings,
    };
  }

  /**
   * The single cultural force most relevant to a stated situation.
   *
   * Relevance is lexical overlap with the situation, which is a weak measure and
   * is used here for a purpose it can carry: choosing between five authored
   * sentences, not judging whether any of them is true. Where nothing overlaps at
   * all, this returns empty rather than the first entry — an irrelevant cultural
   * force is worse than none, because it reads as a brand asserting a connection
   * to a culture it has not made.
   */
  public static forceFor(context: CulturalContext, situation: string): string {
    if (!context.social_values.length && !context.current_tensions.length) return "";
    const target = words(situation);
    if (!target.size) return "";

    const candidates = [...context.current_tensions, ...context.social_values];
    let best = "";
    let bestScore = 0;
    for (const c of candidates) {
      const cw = words(c);
      if (sharedWords(cw, target) < 2) continue;
      const score = overlap(cw, target);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    // A single shared word is coincidence, not relevance — and at 0.12 it was
    // attaching "the alley shop whose proprietor knows the household" to an
    // anti-ageing brief and "education as the family's shared investment" to
    // men's skincare. An irrelevant cultural claim is worse than none: it reads
    // as a brand asserting a connection to a culture it has not made.
    return bestScore >= 0.16 ? best : "";
  }

  /** The symbol that best carries a situation, or empty. Same discipline. */
  public static symbolFor(context: CulturalContext, situation: string): string {
    if (!context.cultural_symbols.length) return "";
    const target = words(situation);
    let best = "";
    let bestScore = 0;
    for (const c of context.cultural_symbols) {
      const cw = words(c);
      if (sharedWords(cw, target) < 2) continue;
      const score = overlap(cw, target);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return bestScore >= 0.16 ? best : "";
  }

  /** A behaviour shift that makes a standing truth live now, or empty. */
  public static shiftFor(context: CulturalContext, situation: string): string {
    if (!context.behavior_shifts.length) return "";
    const target = words(situation);
    let best = "";
    let bestScore = 0;
    for (const c of context.behavior_shifts) {
      const cw = words(c);
      if (sharedWords(cw, target) < 2) continue;
      const score = overlap(cw, target);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return bestScore >= 0.18 ? best : "";
  }
}

/**
 * Content words only.
 *
 * A length filter alone counts "rather" and "than" as evidence, which is how
 * "education as the family's shared investment" came to be asserted over a
 * men's skincare brief: the two sentences shared two function words and nothing
 * else. Function words are the most common words in both strings, so they make
 * every pair of sentences look related.
 */
const FUNCTION_WORDS = new Set([
  "rather", "than", "that", "this", "with", "from", "into", "when", "where",
  "which", "while", "would", "could", "should", "there", "these", "those",
  "about", "because", "before", "after", "their", "them", "they", "have",
  "been", "being", "does", "what", "over", "under", "more", "most", "some",
  "such", "only", "same", "just", "also", "very", "will", "each", "other",
  "then", "here", "make", "made", "like", "into", "onto", "upon", "still",
]);

function words(text: string): Set<string> {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !FUNCTION_WORDS.has(w))
  );
}

/**
 * Shared content words between two short strings.
 *
 * A ratio alone is the wrong instrument here. On a five-word cultural entry one
 * incidental match reads as 20% relevance, which attached "the alley shop whose
 * proprietor knows the household" to an anti-ageing brief. Raising the ratio to
 * 0.3 then cut cultural grounding from 86 briefs to 12, because a genuinely
 * relevant entry can still share only a few words with a short situation.
 *
 * So relevance needs both: a ratio *and* at least two shared content words. Two
 * words is the smallest amount of evidence that is not a coincidence.
 */
function sharedWords(a: Set<string>, b: Set<string>): number {
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.min(a.size, b.size);
}
