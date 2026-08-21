import { KnowledgeBlock, KnowledgeCandidate } from "../types";

export class KnowledgeDependencyResolver {
  public static resolveDependencies(
    selectedCandidates: KnowledgeCandidate[],
    allBlocks: KnowledgeBlock[]
  ): { resolved: KnowledgeCandidate[]; dependencyAdded: string[] } {
    const selectedIds = new Set(selectedCandidates.map((c) => c.block.metadata.id));
    const allBlockMap = new Map<string, KnowledgeBlock>();
    allBlocks.forEach((b) => allBlockMap.set(b.metadata.id, b));

    const dependencyAdded: string[] = [];
    const additionalCandidates: KnowledgeCandidate[] = [];

    for (const cand of selectedCandidates) {
      const deps = cand.block.metadata.dependencies || [];
      for (const depId of deps) {
        if (!selectedIds.has(depId)) {
          const depBlock = allBlockMap.get(depId);
          if (depBlock && depBlock.metadata.status === "ACTIVE") {
            selectedIds.add(depId);
            dependencyAdded.push(depId);

            additionalCandidates.push({
              block: depBlock,
              metadataScore: 0.8,
              semanticScore: 0.0,
              signalConfidence: cand.signalConfidence,
              informationValue: 0.8,
              priority: 0.5,
              queryImportance: 0.8,
              redundancyPenalty: 0.0,
              matchedSignals: [`Dependency of ${cand.block.metadata.id}`],
              selectionReasons: [`Required dependency for ${cand.block.metadata.title}`],
              matchedQueries: [],
              finalScore: Number((cand.finalScore * 0.9).toFixed(3)),
            });
          }
        }
      }
    }

    return {
      resolved: [...selectedCandidates, ...additionalCandidates],
      dependencyAdded,
    };
  }
}
