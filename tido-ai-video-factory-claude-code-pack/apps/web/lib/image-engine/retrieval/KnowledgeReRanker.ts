import { IMAGE_ENGINE_CONFIG } from "../config";
import { KnowledgeCandidate } from "../types";

export class KnowledgeReRanker {
  public static rankCandidates(candidates: KnowledgeCandidate[]): KnowledgeCandidate[] {
    const weights = IMAGE_ENGINE_CONFIG.SCORE_WEIGHTS;

    for (const cand of candidates) {
      const meta = cand.metadataScore * weights.METADATA;
      const sem = cand.semanticScore * weights.SEMANTIC;
      const conf = cand.signalConfidence * weights.SIGNAL_CONFIDENCE;
      const info = cand.informationValue * weights.INFORMATION_VALUE;
      const prio = cand.priority * weights.PRIORITY;
      const qImp = cand.queryImportance * weights.QUERY_IMPORTANCE;

      const rawFinal = meta + sem + conf + info + prio + qImp - cand.redundancyPenalty;
      cand.finalScore = Number(Math.max(0.0, Math.min(1.0, rawFinal)).toFixed(3));
    }

    // Sort descending by final score
    return candidates.sort((a, b) => b.finalScore - a.finalScore);
  }
}
