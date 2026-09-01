/**
 * TIDO Knowledge Retrieval Service Interface
 *
 * Designed for future pluggable Vector DB adapters (pgvector, Qdrant),
 * hybrid search (Dense + BM25), and multi-tenant SaaS isolation.
 */

import { ContextQuery, KnowledgeNode, TechniqueCard } from "../types";

export interface RetrievalResult<T> {
  items: T[];
  total_matches: number;
  retrieval_strategy: "exact_match" | "hybrid_vector_bm25" | "vector_similarity" | "fallback_parent";
  latency_ms: number;
}

export interface IKnowledgeVectorStoreAdapter {
  provider_name: "pgvector" | "qdrant" | "memory_mock";

  searchSimilarNodes(
    tenant_id: string,
    vector: number[],
    limit: number,
    filterTags?: string[]
  ): Promise<KnowledgeNode[]>;

  indexNode(node: KnowledgeNode, vector?: number[]): Promise<void>;
}

export interface IKnowledgeRetrievalService {
  /**
   * Truy xuất các Knowledge Nodes phù hợp nhất với Context Query
   */
  retrieveKnowledgeNodes(
    query: ContextQuery
  ): Promise<RetrievalResult<KnowledgeNode>>;

  /**
   * Truy xuất các Technique Cards phù hợp cho Scene cụ thể
   */
  retrieveTechniqueCards(
    query: ContextQuery
  ): Promise<RetrievalResult<TechniqueCard>>;

  /**
   * Đăng ký Vector DB Adapter động (pgvector hoặc Qdrant)
   */
  registerVectorStoreAdapter(adapter: IKnowledgeVectorStoreAdapter): void;
}
