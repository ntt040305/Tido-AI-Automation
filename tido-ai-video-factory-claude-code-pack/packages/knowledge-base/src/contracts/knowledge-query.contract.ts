/**
 * TIDO Knowledge Query API Contract
 *
 * Contract definitions for API communication between SaaS Clients / Microservices
 * and the Knowledge Intelligence Service.
 */

import { BrandDNA, ContextQuery, KnowledgeNode, TechniqueCard } from "../types";

export interface KnowledgeQueryApiRequest {
  tenant_id: string;
  query: ContextQuery;
  brand_id?: string;
  include_technique_cards?: boolean;
}

export interface KnowledgeQueryApiResponse {
  query_id: string;
  tenant_id: string;
  matched_knowledge_nodes: Array<{
    node: KnowledgeNode;
    match_score: number;
  }>;
  recommended_technique_cards: TechniqueCard[];
  applied_brand_dna?: BrandDNA;
  execution_metadata: {
    processed_at: string;
    total_nodes_evaluated: number;
    latency_ms: number;
  };
}
