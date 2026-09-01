/**
 * Creative Decision Trace Helper
 *
 * Lightweight functions to record JSON-serializable decision rationale
 * connecting Creative Strategy with Knowledge Base nodes.
 */

import { KnowledgeNode, TechniqueCard } from "@tido/knowledge-base";
import {
  CampaignContext,
  CampaignStrategy,
  CreativeDecisionTraceItem,
} from "../interfaces/creative-director.interface";

export function buildCreativeDecisionTraces(
  context: CampaignContext,
  strategy: CampaignStrategy,
  nodes: KnowledgeNode[] = [],
  techniqueCards: TechniqueCard[] = []
): CreativeDecisionTraceItem[] {
  const traces: CreativeDecisionTraceItem[] = [];

  // Trace 1: Strategy Framework Choice
  traces.push({
    decision_type: "hook_selection",
    decision_reason: `Selected '${strategy.content_framework}' framework to match objective '${context.objective}' for audience '${context.audience}'`,
    knowledge_sources: nodes.map((n) => n.node_id),
    confidence_score: 0.92,
  });

  // Trace 2: Visual Style Choice
  traces.push({
    decision_type: "visual_style",
    decision_reason: `Applied commercial lighting & composition rules based on channel '${context.channel}'`,
    knowledge_sources: techniqueCards.map((c) => c.card_id),
    confidence_score: 0.88,
  });

  // Trace 3: Audio Tone Choice
  traces.push({
    decision_type: "audio_tone",
    decision_reason: `Set emotional tone '${strategy.emotional_direction}' to increase trust and retention`,
    knowledge_sources: nodes.filter((n) => n.domain === "audio_directing").map((n) => n.node_id),
    confidence_score: 0.90,
  });

  return traces;
}
