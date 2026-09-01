/**
 * TIDO Context Matcher Engine
 *
 * Algorithmically calculates compatibility scores between a ContextQuery
 * and Knowledge Nodes / Technique Cards without hard-coded marketing rules.
 */

import { ContextQuery, KnowledgeNode, TechniqueCard } from "../types";

export interface MatchScoreDetails {
  node_id: string;
  total_score: number; // 0.0 to 1.0
  industry_score: number;
  objective_score: number;
  channel_score: number;
  confidence_boost: number;
}

export class ContextMatcherEngine {
  private readonly WEIGHT_INDUSTRY = 0.35;
  private readonly WEIGHT_OBJECTIVE = 0.3;
  private readonly WEIGHT_CHANNEL = 0.25;
  private readonly WEIGHT_METADATA_QUALITY = 0.1;

  /**
   * Tính toán điểm số tương thích giữa ContextQuery và một KnowledgeNode
   */
  public calculateNodeMatchScore(
    query: ContextQuery,
    node: KnowledgeNode
  ): MatchScoreDetails {
    const matcher = node.context_matcher;

    // 1. Industry Match Score (Exact match = 1.0, Sub-category match = 0.7, Wildcard/General = 0.4)
    const industryScore = this.computeArrayMatchScore(
      query.industry,
      matcher.suitable_industries
    );

    // 2. Objective Match Score
    const objectiveScore = this.computeArrayMatchScore(
      query.campaign_objective,
      matcher.suitable_objectives
    );

    // 3. Channel Match Score
    const channelScore = this.computeArrayMatchScore(
      query.target_channel,
      matcher.suitable_channels
    );

    // 4. Quality & Historical Performance Boost
    const qualityBoost =
      (node.metadata.confidence_score + node.metadata.historical_pass_rate) / 2;

    const totalScore =
      industryScore * this.WEIGHT_INDUSTRY +
      objectiveScore * this.WEIGHT_OBJECTIVE +
      channelScore * this.WEIGHT_CHANNEL +
      qualityBoost * this.WEIGHT_METADATA_QUALITY;

    return {
      node_id: node.node_id,
      total_score: Number(Math.min(1.0, totalScore).toFixed(4)),
      industry_score: industryScore,
      objective_score: objectiveScore,
      channel_score: channelScore,
      confidence_boost: qualityBoost,
    };
  }

  /**
   * Tính toán và sắp xếp danh sách Knowledge Nodes theo điểm số tương thích
   */
  public rankKnowledgeNodes(
    query: ContextQuery,
    nodes: KnowledgeNode[]
  ): KnowledgeNode[] {
    return [...nodes].sort((a, b) => {
      const scoreA = this.calculateNodeMatchScore(query, a).total_score;
      const scoreB = this.calculateNodeMatchScore(query, b).total_score;
      return scoreB - scoreA; // Sắp xếp giảm dần
    });
  }

  /**
   * Lọc và sắp xếp Technique Cards phù hợp cho Scene Role
   */
  public rankTechniqueCards(
    query: ContextQuery,
    cards: TechniqueCard[]
  ): TechniqueCard[] {
    return cards.filter((card) => {
      if (query.scene_role && card.scene_role !== query.scene_role) {
        return false;
      }
      return true;
    });
  }

  private computeArrayMatchScore(target: string, suitableList: string[]): number {
    if (!suitableList || suitableList.length === 0) return 0.5; // General fallback
    const normalizedTarget = target.toLowerCase().trim();

    if (suitableList.some((s) => s.toLowerCase().trim() === normalizedTarget)) {
      return 1.0;
    }
    if (suitableList.includes("*") || suitableList.includes("all")) {
      return 0.7;
    }
    return 0.1;
  }
}
