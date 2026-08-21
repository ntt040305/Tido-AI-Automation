import { IMAGE_ENGINE_CONFIG } from "../config";
import { RoutingResultSchema, KnowledgeEmbeddingIndexSchema, KnowledgeBlock } from "../types";
import { EmbeddingService } from "./EmbeddingService";
import { CosineSimilarity } from "./CosineSimilarity";

export interface SemanticMatchResult {
  blockId: string;
  semanticScore: number;
  matchedQueries: string[];
  selectionReasons: string[];
  maxQueryImportance: number;
}

export class SemanticKnowledgeRetriever {
  public static async retrieveSemanticCandidates(
    routing: RoutingResultSchema,
    activeBlocks: KnowledgeBlock[],
    indexSchema: KnowledgeEmbeddingIndexSchema | null
  ): Promise<Map<string, SemanticMatchResult>> {
    const resultsMap = new Map<string, SemanticMatchResult>();

    if (!indexSchema || !indexSchema.blocks || indexSchema.blocks.length === 0) {
      return resultsMap;
    }

    const indexVectorMap = new Map<string, number[]>();
    indexSchema.blocks.forEach((b) => indexVectorMap.set(b.id, b.embedding));

    const queriesToRun: Array<{ query: string; weight: number; label: string }> = [];
    const queryWeights = IMAGE_ENGINE_CONFIG.QUERY_WEIGHTS as Record<string, number>;

    // 1. Product Retrieval Queries
    if (Array.isArray(routing.products)) {
      for (const prod of routing.products) {
        if (Array.isArray(prod.retrieval_queries)) {
          for (const q of prod.retrieval_queries) {
            const qStr = typeof q === "string" ? q : q.query;
            const imp = typeof q === "string" ? "PRIMARY" : q.importance;
            const weight = queryWeights[imp] ?? 1.0;

            if (qStr && qStr.trim()) {
              queriesToRun.push({ query: qStr.trim(), weight, label: imp });
            }
          }
        }
      }
    }

    // 2. Global Retrieval Queries
    if (Array.isArray(routing.global_retrieval_queries)) {
      for (const q of routing.global_retrieval_queries) {
        const qStr = typeof q === "string" ? q : q.query;
        const weight = queryWeights.GLOBAL ?? 0.75;
        if (qStr && qStr.trim()) {
          queriesToRun.push({ query: qStr.trim(), weight, label: "GLOBAL" });
        }
      }
    }

    if (queriesToRun.length === 0) {
      return resultsMap;
    }

    // Run semantic similarity search per query
    for (const qItem of queriesToRun) {
      try {
        const queryVector = await EmbeddingService.embedQuery(qItem.query);

        for (const block of activeBlocks) {
          const docVector = indexVectorMap.get(block.metadata.id);
          if (!docVector) continue;

          const sim = CosineSimilarity.compute(queryVector, docVector);
          const weightedSim = Math.max(0, sim) * qItem.weight;

          if (weightedSim >= 0.35) { // Minimum semantic threshold
            const existing = resultsMap.get(block.metadata.id) || {
              blockId: block.metadata.id,
              semanticScore: 0,
              matchedQueries: [],
              selectionReasons: [],
              maxQueryImportance: 0,
            };

            existing.semanticScore = Math.max(existing.semanticScore, Number(weightedSim.toFixed(3)));
            existing.maxQueryImportance = Math.max(existing.maxQueryImportance, qItem.weight);

            if (!existing.matchedQueries.includes(qItem.query)) {
              existing.matchedQueries.push(qItem.query);
              existing.selectionReasons.push(
                `Strong semantic match (${Math.round(sim * 100)}%) to ${qItem.label} query: "${qItem.query}"`
              );
            }

            resultsMap.set(block.metadata.id, existing);
          }
        }
      } catch (err: any) {
        console.warn(`Semantic retrieval failed for query '${qItem.query}': ${err.message}`);
      }
    }

    return resultsMap;
  }
}
