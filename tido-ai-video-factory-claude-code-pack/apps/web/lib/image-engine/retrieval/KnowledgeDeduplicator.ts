import { IMAGE_ENGINE_CONFIG } from "../config";
import { KnowledgeCandidate, RejectedCandidateEntry, KnowledgeEmbeddingIndexSchema } from "../types";
import { CosineSimilarity } from "./CosineSimilarity";

export interface DeduplicationResult {
  deduplicatedCandidates: KnowledgeCandidate[];
  rejectedCandidates: RejectedCandidateEntry[];
}

export class KnowledgeDeduplicator {
  public static deduplicate(
    rankedCandidates: KnowledgeCandidate[],
    indexSchema: KnowledgeEmbeddingIndexSchema | null
  ): DeduplicationResult {
    const deduplicated: KnowledgeCandidate[] = [];
    const rejected: RejectedCandidateEntry[] = [];

    const coveredByMap = new Map<string, string>(); // coveredBlockId -> coveringParentBlockId

    const indexVectorMap = new Map<string, number[]>();
    if (indexSchema?.blocks) {
      indexSchema.blocks.forEach((b) => indexVectorMap.set(b.id, b.embedding));
    }

    for (const cand of rankedCandidates) {
      const blockId = cand.block.metadata.id;

      // 1. Explicit covers[] Block ID check
      if (coveredByMap.has(blockId)) {
        const coveringParentId = coveredByMap.get(blockId);
        rejected.push({
          id: blockId,
          final_score: cand.finalScore,
          reason_code: "COVERED_BY_SELECTED_BLOCK",
          reason: `Content covered by higher-scoring selected block '${coveringParentId}'.`,
        });
        continue;
      }

      // 2. Pairwise Semantic Similarity Redundancy Check
      let isRedundant = false;
      let redundantParentId = "";

      for (const accepted of deduplicated) {
        const vecAccepted = indexVectorMap.get(accepted.block.metadata.id);
        const vecCand = indexVectorMap.get(blockId);

        if (vecAccepted && vecCand) {
          const sim = CosineSimilarity.compute(vecAccepted, vecCand);
          if (sim >= IMAGE_ENGINE_CONFIG.SEMANTIC_REDUNDANCY_THRESHOLD) {
            isRedundant = true;
            redundantParentId = accepted.block.metadata.id;
            break;
          }
        }
      }

      if (isRedundant) {
        rejected.push({
          id: blockId,
          final_score: cand.finalScore,
          reason_code: "REDUNDANT",
          reason: `Semantic content highly redundant (${Math.round(
            IMAGE_ENGINE_CONFIG.SEMANTIC_REDUNDANCY_THRESHOLD * 100
          )}% similarity) with selected block '${redundantParentId}'.`,
        });
        continue;
      }

      // Mark any blocks explicitly covered by this block (using Block IDs)
      const covers = cand.block.metadata.covers || [];
      covers.forEach((coveredId) => {
        if (!coveredByMap.has(coveredId)) {
          coveredByMap.set(coveredId, blockId);
        }
      });

      deduplicated.push(cand);
    }

    return {
      deduplicatedCandidates: deduplicated,
      rejectedCandidates: rejected,
    };
  }
}
