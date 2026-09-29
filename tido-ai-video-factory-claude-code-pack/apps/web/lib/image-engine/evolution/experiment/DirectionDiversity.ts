import type { StrategyCandidate } from "./CreativeDirectorV1";
import type { CategoryRelationship } from "./IndustryContextIntelligence";

/**
 * Direction Diversity Control — measures and protects creative distinctiveness across candidates.
 *
 * ARCHITECTURAL PRINCIPLE:
 * Candidate directions must differ in IDEA and STRATEGY, not merely in color tint or camera angle.
 *
 * Bad diversity:
 *   A: blue minimal bottle
 *   B: green minimal bottle
 *   C: white minimal bottle
 *
 * Good diversity:
 *   A: Surreal visual metaphor dramatizing product extraction
 *   B: Authentic human lifestyle ritual around consumer morning tension
 *   C: Category convention reinterpreted with extreme architectural restraint
 *   D: Unexpected cultural / art direction breaking standard category codes
 *   E: Bold typographic / graphic interplay treating product as kinetic sculpture
 */

export interface CandidateDivergenceReport {
  /** 0.0 (completely identical) to 1.0 (radially distinct ideas). */
  diversity_score: number;
  /** Maximum similarity found between any pair of candidates. */
  max_similarity: number;
  /** Whether the candidate set meets the minimum acceptable strategic divergence. */
  is_sufficiently_diverse: boolean;
  /** Pairs of candidates that are too conceptually close to each other. */
  redundant_pairs: Array<{
    route_a: string;
    route_b: string;
    similarity: number;
    reason: string;
  }>;
  /** Unique category relationships explored across candidates. */
  category_stances_explored: CategoryRelationship[];
  /** Recommendations to improve diversity if below threshold. */
  diversification_advice: string[];
}

const MINIMUM_DIVERSITY_THRESHOLD = 0.55;

/** Tokenizes text into meaningful content words (length >= 4, lowercased). */
function contentWords(text: string | undefined | null): Set<string> {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return new Set(words);
}

/** Computes Jaccard similarity between two word sets. */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((w) => {
    if (b.has(w)) shared++;
  });
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Evaluates the divergence across candidate creative directions.
 */
export function auditCandidateDiversity(candidates: StrategyCandidate[]): CandidateDivergenceReport {
  if (!candidates || candidates.length < 2) {
    return {
      max_similarity: 0,
      diversity_score: 1.0,
      is_sufficiently_diverse: true,
      redundant_pairs: [],
      category_stances_explored: [],
      diversification_advice: [],
    };
  }

  const redundantPairs: CandidateDivergenceReport["redundant_pairs"] = [];
  const stances = new Set<CategoryRelationship>();

  let totalPairSimilarities = 0;
  let pairCount = 0;
  let maxPairSimilarity = 0;

  for (let i = 0; i < candidates.length; i++) {
    const cA = candidates[i];
    const wordsA = contentWords(`${cA.route} ${cA.core_idea} ${cA.visual_language || ""} ${cA.why_this_route}`);

    for (let j = i + 1; j < candidates.length; j++) {
      const cB = candidates[j];
      const wordsB = contentWords(`${cB.route} ${cB.core_idea} ${cB.visual_language || ""} ${cB.why_this_route}`);

      const sim = jaccardSimilarity(wordsA, wordsB);
      if (sim > maxPairSimilarity) maxPairSimilarity = sim;
      totalPairSimilarities += sim;
      pairCount++;

      // If similarity exceeds 45%, they are exploring the same basic concept
      if (sim > 0.45) {
        redundantPairs.push({
          route_a: cA.route,
          route_b: cB.route,
          similarity: Math.round(sim * 100) / 100,
          reason: `Both routes rely on substantially similar vocabulary and visual ideas (${Math.round(sim * 100)}% conceptual overlap).`,
        });
      }
    }
  }

  const avgSimilarity = pairCount > 0 ? totalPairSimilarities / pairCount : 0;
  const rawDiversityScore = Math.max(0, Math.min(1, 1 - avgSimilarity));
  const roundedDiversity = Math.round(rawDiversityScore * 100) / 100;

  const isDiverse = roundedDiversity >= MINIMUM_DIVERSITY_THRESHOLD && redundantPairs.length === 0;

  const advice: string[] = [];
  if (!isDiverse) {
    advice.push("Candidates converge toward similar visual vocabulary. Diversify between surreal metaphor, human lifestyle, high-craft restraint, and bold cultural contrast.");
  }
  if (candidates.length >= 3 && redundantPairs.length > 0) {
    advice.push(`Resolve redundancy between '${redundantPairs[0].route_a}' and '${redundantPairs[0].route_b}' by shifting one to an unexpected category relationship.`);
  }

  return {
    diversity_score: roundedDiversity,
    max_similarity: Math.round(maxPairSimilarity * 100) / 100,
    is_sufficiently_diverse: isDiverse,
    redundant_pairs: redundantPairs,
    category_stances_explored: Array.from(stances),
    diversification_advice: advice,
  };
}

/**
 * Ensures candidate routes have genuine strategic diversity.
 * If two routes are near-duplicates, it rewrites the weaker duplicate's angle into
 * a distinctive alternative route.
 */
export function diversifyCandidateSet(
  candidates: StrategyCandidate[],
  coreOpportunity?: string
): { candidates: StrategyCandidate[]; diversified: boolean } {
  const audit = auditCandidateDiversity(candidates);
  if (audit.is_sufficiently_diverse || candidates.length < 2) {
    return { candidates, diversified: false };
  }

  // Clone to avoid mutating original objects
  const adjusted = candidates.map((c) => ({ ...c }));

  for (const pair of audit.redundant_pairs) {
    // Locate the second candidate in the pair and pivot its angle
    const targetIdx = adjusted.findIndex((c) => c.route === pair.route_b);
    if (targetIdx !== -1) {
      const target = adjusted[targetIdx];
      target.route = `${target.route} (Art Direction Contrast)`;
      target.core_idea = `Counter-perspective: thay vì tiếp cận theo hướng quen thuộc, sử dụng phép ẩn dụ thị giác bất ngờ (unexpected visual metaphor) và tương phản cao để tạo dấu ấn đột phá`;
      if (target.visual_language) {
        target.visual_language = `Không gian kiến trúc tối giản hiện đại với độ sâu trường ảnh điện ảnh, tương phản hoàn toàn với quy chuẩn thông thường`;
      }
      target.why_this_route = `Tạo sự đối trọng rõ nét với hướng tiếp cận '${pair.route_a}', khai phóng khoảng trống thị giác chưa từng được khai thác`;
    }
  }

  return { candidates: adjusted, diversified: true };
}
