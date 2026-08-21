import { IMAGE_ENGINE_CONFIG } from "../config";
import { KnowledgeCandidate, SelectedBlockEntry, RejectedCandidateEntry, SelectionTier } from "../types";

export interface BudgetEnforcementResult {
  universalBlocks: SelectedBlockEntry[];
  selectedBlocks: SelectedBlockEntry[];
  rejectedCandidates: RejectedCandidateEntry[];
  totalTokens: number;
}

export class KnowledgeBudgetManager {
  /**
   * Fast deterministic token estimation helper
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    // Standard rule-of-thumb: ~4 characters per token + header overhead
    return Math.ceil(text.length / 4) + 40;
  }

  public static estimateCompactChars(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length * 0.58) + 100;
  }

  public static enforceBudget(
    candidates: KnowledgeCandidate[],
    dependenciesAdded: string[],
    routingMode: string,
    extraOptions?: {
      useCase?: string;
      brief?: string;
      brandName?: string;
      brandInfo?: string;
      copyItems?: any[];
      hardRequirements?: string[];
      productCount?: number;
    }
  ): BudgetEnforcementResult {
    const budget = IMAGE_ENGINE_CONFIG.BUDGET_DEFAULTS;
    const minThresholds = IMAGE_ENGINE_CONFIG.MIN_SELECTION_SCORE as Record<string, number>;
    const minScore = minThresholds[routingMode] ?? 0.50;

    const universalBlocks: SelectedBlockEntry[] = [];
    const selectedBlocks: SelectedBlockEntry[] = [];
    const rejectedCandidates: RejectedCandidateEntry[] = [];

    let primaryCount = 0;
    let supportingCount = 0;
    let totalSpecialistCount = 0;
    let optionalPosterSpecialistCount = 0;
    let tokenAccumulator = 0;

    // 1. Calculate Estimated Base Assembly Compact Characters
    let basePromptChars = 12800; // Static Master Prompt template & instruction framework baseline overhead

    // User brief & context
    if (extraOptions?.brief) basePromptChars += extraOptions.brief.length;
    if (extraOptions?.brandName) basePromptChars += extraOptions.brandName.length;
    if (extraOptions?.brandInfo) basePromptChars += extraOptions.brandInfo.length;

    if (Array.isArray(extraOptions?.copyItems)) {
      for (const item of extraOptions.copyItems) {
        if (typeof item === "string") basePromptChars += item.length;
        else if (item && typeof item.text === "string") basePromptChars += item.text.length;
      }
    }

    if (Array.isArray(extraOptions?.hardRequirements)) {
      for (const req of extraOptions.hardRequirements) {
        basePromptChars += req.length;
      }
    }

    const prodCount = extraOptions?.productCount || 1;
    basePromptChars += prodCount * 250;

    // Add Poster Foundation base overhead (~750 compact chars) if Poster useCase
    const isPosterUseCase = extraOptions?.useCase && extraOptions.useCase.trim().toLowerCase() === "poster";
    if (isPosterUseCase) {
      basePromptChars += 750;
    }

    // Accumulate Universal Blocks compact length
    for (const cand of candidates) {
      const meta = cand.block.metadata;
      if (meta.knowledge_type === "UNIVERSAL" || meta.scope === "GLOBAL") {
        basePromptChars += this.estimateCompactChars(cand.block.content || "");
      }
    }

    let currentPromptCharsAccumulator = basePromptChars;
    const MAX_SAFE_PROMPT_CHARS = 19400; // Hard provider ceiling is 20,000

    for (const cand of candidates) {
      const block = cand.block;
      const meta = block.metadata;

      const estimatedTokens = this.estimateTokens(block.content || "");
      const blockCharCount = this.estimateCompactChars(block.content || "");

      // Universal Blocks handling (managed separately)
      if (meta.knowledge_type === "UNIVERSAL" || meta.scope === "GLOBAL") {
        universalBlocks.push({
          id: meta.id,
          version: meta.version,
          title: meta.title,
          knowledge_type: meta.knowledge_type,
          selection_tier: "UNIVERSAL",
          final_score: cand.finalScore,
          scores: {
            metadata: cand.metadataScore,
            semantic: cand.semanticScore,
            signal_confidence: cand.signalConfidence,
            information_value: cand.informationValue,
            priority: cand.priority,
            query_importance: cand.queryImportance,
            redundancy_penalty: cand.redundancyPenalty,
          },
          matched_signals: cand.matchedSignals,
          selection_reasons: cand.selectionReasons,
          estimated_tokens: estimatedTokens,
        });
        continue;
      }

      // Minimum Score Filter
      if (cand.finalScore < minScore) {
        rejectedCandidates.push({
          id: meta.id,
          final_score: cand.finalScore,
          reason_code: "LOW_SCORE",
          reason: `Score (${cand.finalScore}) is below routing mode '${routingMode}' threshold (${minScore}).`,
        });
        continue;
      }

      // 1. Poster Specialist Soft Cap (Max 2 optional poster specialists)
      const isOptionalPosterSpecialist = (meta.id.startsWith("specialist.poster_") && meta.id !== "specialist.poster_foundation") || meta.id === "specialist.commercial_poster_design";
      if (isOptionalPosterSpecialist && optionalPosterSpecialistCount >= 2) {
        rejectedCandidates.push({
          id: meta.id,
          final_score: cand.finalScore,
          reason_code: "OVER_BUDGET",
          reason: "Exceeds soft cap of maximum 2 optional poster specialist blocks.",
        });
        continue;
      }

      // 2. Global Provider Prompt Character Budget Constraint (Hard limit 20,000 chars)
      if (currentPromptCharsAccumulator + blockCharCount > MAX_SAFE_PROMPT_CHARS) {
        rejectedCandidates.push({
          id: meta.id,
          final_score: cand.finalScore,
          reason_code: "OVER_BUDGET",
          reason: `Exceeds provider prompt character budget ceiling (${currentPromptCharsAccumulator + blockCharCount} > ${MAX_SAFE_PROMPT_CHARS} chars).`,
        });
        continue;
      }

      // General Specialist Block Count & Token Budget Constraints
      if (totalSpecialistCount >= budget.MAX_SPECIALIST_BLOCKS_TOTAL) {
        rejectedCandidates.push({
          id: meta.id,
          final_score: cand.finalScore,
          reason_code: "OVER_BUDGET",
          reason: `Exceeds maximum total specialist blocks budget (${budget.MAX_SPECIALIST_BLOCKS_TOTAL}).`,
        });
        continue;
      }

      if (tokenAccumulator + estimatedTokens > budget.MAX_SPECIALIST_ESTIMATED_TOKENS) {
        rejectedCandidates.push({
          id: meta.id,
          final_score: cand.finalScore,
          reason_code: "OVER_BUDGET",
          reason: `Exceeds maximum estimated token budget (${budget.MAX_SPECIALIST_ESTIMATED_TOKENS} tokens).`,
        });
        continue;
      }

      // Determine Selection Tier
      let tier: SelectionTier = "SUPPORTING";
      if (dependenciesAdded.includes(meta.id)) {
        tier = "DEPENDENCY";
      } else if (cand.finalScore >= 0.80 || cand.metadataScore >= 0.90) {
        tier = "PRIMARY";
      }

      if (tier === "PRIMARY" && primaryCount >= budget.MAX_PRIMARY_BLOCKS) {
        tier = "SUPPORTING";
      }

      if (tier === "SUPPORTING" && supportingCount >= budget.MAX_SUPPORTING_BLOCKS && primaryCount >= budget.MAX_PRIMARY_BLOCKS) {
        rejectedCandidates.push({
          id: meta.id,
          final_score: cand.finalScore,
          reason_code: "OVER_BUDGET",
          reason: `Exceeds maximum supporting blocks cap (${budget.MAX_SUPPORTING_BLOCKS}).`,
        });
        continue;
      }

      // Accept Block
      if (tier === "PRIMARY") primaryCount++;
      else if (tier === "SUPPORTING") supportingCount++;

      totalSpecialistCount++;
      tokenAccumulator += estimatedTokens;
      currentPromptCharsAccumulator += blockCharCount;
      if (isOptionalPosterSpecialist) optionalPosterSpecialistCount++;

      selectedBlocks.push({
        id: meta.id,
        version: meta.version,
        title: meta.title,
        knowledge_type: meta.knowledge_type,
        selection_tier: tier,
        final_score: cand.finalScore,
        scores: {
          metadata: cand.metadataScore,
          semantic: cand.semanticScore,
          signal_confidence: cand.signalConfidence,
          information_value: cand.informationValue,
          priority: cand.priority,
          query_importance: cand.queryImportance,
          redundancy_penalty: cand.redundancyPenalty,
        },
        matched_signals: cand.matchedSignals,
        selection_reasons: cand.selectionReasons,
        estimated_tokens: estimatedTokens,
      });
    }

    return {
      universalBlocks,
      selectedBlocks,
      rejectedCandidates,
      totalTokens: tokenAccumulator,
    };
  }
}
