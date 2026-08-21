import { KnowledgeBlock, KnowledgeCandidate, RetrievalSignal } from "../types";
import { MetadataMatchResult } from "./MetadataKnowledgeMatcher";
import { SemanticMatchResult } from "./SemanticKnowledgeRetriever";

export class CandidateFusion {
  public static fuseCandidates(
    activeBlocks: KnowledgeBlock[],
    metadataMatches: MetadataMatchResult[],
    semanticMatchesMap: Map<string, SemanticMatchResult>,
    signals: RetrievalSignal[]
  ): KnowledgeCandidate[] {
    const candidateMap = new Map<string, KnowledgeCandidate>();

    const metaMap = new Map<string, MetadataMatchResult>();
    metadataMatches.forEach((m) => metaMap.set(m.block.metadata.id, m));

    for (const block of activeBlocks) {
      const blockId = block.metadata.id;
      const metaResult = metaMap.get(blockId);
      const semResult = semanticMatchesMap.get(blockId);

      const metadataScore = metaResult ? metaResult.metadataScore : 0;
      const semanticScore = semResult ? semResult.semanticScore : 0;

      // Skip blocks with neither metadata nor semantic match
      if (metadataScore === 0 && semanticScore === 0) {
        continue;
      }

      const matchedSignals = metaResult ? metaResult.matchedSignals : [];
      const matchedQueries = semResult ? semResult.matchedQueries : [];
      const provenance = metaResult ? metaResult.provenance : [];

      const selectionReasons = [
        ...(metaResult ? metaResult.selectionReasons : []),
        ...(semResult ? semResult.selectionReasons : []),
      ];

      // Calculate signalConfidence strictly from signals that ACTUALLY matched this candidate
      const matchedConfidences = metaResult ? metaResult.matchedSignalsConfidences : [];
      const signalConfidence = matchedConfidences.length > 0
        ? Number((matchedConfidences.reduce((a, b) => a + b, 0) / matchedConfidences.length).toFixed(3))
        : 0;

      // Extract information value & priority from block metadata (normalized 0.0 - 1.0)
      const rawInfoVal = block.metadata.information_value ?? 0.8;
      const informationValue = Math.min(1.0, Math.max(0.0, rawInfoVal > 1 ? rawInfoVal / 10 : rawInfoVal));

      const rawPriority = block.metadata.priority ?? 50;
      const priority = Math.min(1.0, Math.max(0.0, rawPriority > 1 ? rawPriority / 100 : rawPriority));

      // Query importance: 0 if no semantic query matched this candidate
      const queryImportance = semResult ? semResult.maxQueryImportance : 0;

      candidateMap.set(blockId, {
        block,
        metadataScore,
        semanticScore,
        signalConfidence,
        informationValue,
        priority,
        queryImportance,
        redundancyPenalty: 0.0,
        matchedSignals,
        selectionReasons,
        matchedQueries,
        provenance,
        finalScore: 0.0, // Calculated by KnowledgeReRanker
      });
    }

    return Array.from(candidateMap.values());
  }
}
