import { LocalKnowledgeRepository } from "../repository/LocalKnowledgeRepository";
import { RoutingValidator } from "../validation/RoutingValidator";
import {
  RoutingResultSchema,
  KnowledgePackageV1,
  RetrievalResult,
  RetrievalMode,
  KnowledgeEmbeddingIndexSchema,
} from "../types";
import { RoutingSignalExtractor } from "./RoutingSignalExtractor";
import { MetadataKnowledgeMatcher } from "./MetadataKnowledgeMatcher";
import { KnowledgeEmbeddingIndexService } from "./KnowledgeEmbeddingIndexService";
import { SemanticKnowledgeRetriever } from "./SemanticKnowledgeRetriever";
import { CandidateFusion } from "./CandidateFusion";
import { KnowledgeReRanker } from "./KnowledgeReRanker";
import { KnowledgeDeduplicator } from "./KnowledgeDeduplicator";
import { KnowledgeDependencyResolver } from "./KnowledgeDependencyResolver";
import { KnowledgeBudgetManager } from "./KnowledgeBudgetManager";

export class SmartKnowledgeRetriever {
  private static repository = new LocalKnowledgeRepository();

  /**
   * Orchestrates the complete Smart Knowledge Retrieval Pipeline
   */
  public static async retrieve(
    rawRouting: any,
    expectedRefIds?: string[],
    overrideIndexSchema: KnowledgeEmbeddingIndexSchema | null = null,
    options?: {
      useCase?: string;
      brief?: string;
      brandName?: string;
      brandInfo?: string;
      copyItems?: any[];
      hardRequirements?: string[];
    }
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Dynamically resolve expected reference IDs if not explicitly passed
    let effectiveRefIds = expectedRefIds;
    if (!effectiveRefIds || effectiveRefIds.length === 0) {
      if (rawRouting && Array.isArray(rawRouting.products)) {
        const found = new Set<string>();
        for (const prod of rawRouting.products) {
          if (Array.isArray(prod.reference_ids)) {
            prod.reference_ids.forEach((r: string) => found.add(r));
          }
        }
        effectiveRefIds = Array.from(found);
      }
      if (!effectiveRefIds || effectiveRefIds.length === 0) {
        effectiveRefIds = ["REF_01", "REF_02", "REF_03"];
      }
    }

    // 1. Boundary Validation of Input Routing JSON
    const validation = RoutingValidator.validate(rawRouting, effectiveRefIds);
    if (!validation.isValid || !validation.routing) {
      return {
        success: false,
        error: {
          code: "INVALID_ROUTING_INPUT",
          message: `Input routing JSON failed boundary validation: ${
            Array.isArray(validation.errors)
              ? validation.errors.map((e: any) => (typeof e === "string" ? e : e.message || String(e))).join("; ")
              : "Invalid routing payload"
          }`,
          details: validation.errors,
        },
      };
    }

    const routing: RoutingResultSchema = validation.routing;

    try {
      // 2. Load Repository Active Blocks
      const activeBlocks = this.repository.getActiveBlocks();

      // 3. Extract Retrieval Signals
      const signals = RoutingSignalExtractor.extractSignals(routing);

      // 4. Metadata Knowledge Matching with Intent Context
      const metadataMatches = activeBlocks.map((block) =>
        MetadataKnowledgeMatcher.matchBlock(block, signals, {
          brief: options?.brief,
          routingSummary: routing.routing_summary,
        })
      );
      const activeMetadataCandidates = metadataMatches.filter((m) => m.metadataScore > 0);

      // 5. Index & Semantic Knowledge Retrieval with Fallback
      let retrievalMode: RetrievalMode = "HYBRID";
      let semanticMatchesMap = new Map<string, any>();
      let indexSchema = overrideIndexSchema;

      try {
        if (!indexSchema) {
          indexSchema = KnowledgeEmbeddingIndexService.loadIndex();
          if (!indexSchema && process.env.GEMINI_API_KEY) {
            // Sync index if missing and key available
            const syncRes = await KnowledgeEmbeddingIndexService.syncIndex(activeBlocks);
            indexSchema = syncRes.index;
          }
        }

        if (indexSchema) {
          semanticMatchesMap = await SemanticKnowledgeRetriever.retrieveSemanticCandidates(
            routing,
            activeBlocks,
            indexSchema
          );
          if (semanticMatchesMap.size > 0) {
            retrievalMode = "HYBRID";
          } else {
            retrievalMode = "METADATA_ONLY";
          }
        } else {
          retrievalMode = "METADATA_ONLY";
          if (!process.env.GEMINI_API_KEY) {
            warnings.push("SEMANTIC_RETRIEVAL_UNAVAILABLE: GEMINI_API_KEY is not configured in environment.");
          } else {
            warnings.push("SEMANTIC_RETRIEVAL_UNAVAILABLE: Local embedding index not built.");
          }
        }
      } catch (err: any) {
        retrievalMode = "METADATA_ONLY";
        warnings.push(`SEMANTIC_RETRIEVAL_UNAVAILABLE: ${err.message || String(err)}`);
      }

      // 6. Candidate Fusion
      const fusedCandidates = CandidateFusion.fuseCandidates(
        activeBlocks,
        activeMetadataCandidates,
        semanticMatchesMap,
        signals
      );

      // 7. Deterministic Re-ranking
      const rankedCandidates = KnowledgeReRanker.rankCandidates(fusedCandidates);

      // 8. Deduplication
      const { deduplicatedCandidates, rejectedCandidates: dedupRejected } =
        KnowledgeDeduplicator.deduplicate(rankedCandidates, indexSchema);

      // 9. Dependency Resolution
      const { resolved: dependencyResolved, dependencyAdded } =
        KnowledgeDependencyResolver.resolveDependencies(deduplicatedCandidates, activeBlocks);

      // Resolve effective useCase
      const effectiveUseCase =
        options?.useCase ||
        (rawRouting as any)?.useCase ||
        (rawRouting as any)?.use_case ||
        (rawRouting as any)?.output_config?.use_case;

      // 10. Knowledge Budget & Tier Enforcement (Intent-Aware & Budget-Aware)
      const budgetResult = KnowledgeBudgetManager.enforceBudget(
        dependencyResolved,
        dependencyAdded,
        routing.routing_mode,
        {
          useCase: effectiveUseCase,
          brief: options?.brief,
          brandName: options?.brandName,
          brandInfo: options?.brandInfo,
          copyItems: options?.copyItems,
          hardRequirements: options?.hardRequirements,
          productCount: routing.products?.length || 1,
        }
      );
      if (effectiveUseCase && typeof effectiveUseCase === "string") {
        const uc = effectiveUseCase.trim().toLowerCase();
        let targetBlockId = "";
        if (uc === "poster") targetBlockId = "specialist.poster_foundation";
        else if (uc === "social_ad") targetBlockId = "specialist.social_ad_foundation";
        else if (uc === "product_hero") targetBlockId = "specialist.product_hero_foundation";
        else if (uc === "banner" || uc === "website_banner") targetBlockId = "specialist.website_banner_foundation";
        else if (uc === "ugc_thumbnail" || uc === "thumbnail_ugc") targetBlockId = "specialist.ugc_thumbnail_foundation";

        if (targetBlockId) {
          const foundationBlock = activeBlocks.find((b) => b.metadata.id === targetBlockId);
          if (foundationBlock && foundationBlock.metadata.status === "ACTIVE") {
            const alreadySelected = budgetResult.selectedBlocks.some((b) => b.id === foundationBlock.metadata.id);
            if (!alreadySelected) {
              const foundationEntry = {
                id: foundationBlock.metadata.id,
                version: foundationBlock.metadata.version,
                title: foundationBlock.metadata.title,
                knowledge_type: foundationBlock.metadata.knowledge_type,
                selection_tier: "PRIMARY" as const,
                final_score: 1.0,
                scores: {
                  metadata: 1.0,
                  semantic: 0.0,
                  signal_confidence: 1.0,
                  information_value: 1.0,
                  priority: foundationBlock.metadata.priority || 100,
                  query_importance: 1.0,
                  redundancy_penalty: 0.0,
                },
                matched_signals: [`useCase:${effectiveUseCase}`],
                selection_reasons: [`DETERMINISTIC_${targetBlockId.toUpperCase()}_ROUTING`],
                estimated_tokens: KnowledgeBudgetManager.estimateTokens(foundationBlock.content),
              };
              budgetResult.selectedBlocks.unshift(foundationEntry);
            }
          }
        }
      }

      // Check Universal Core requirement warning
      if (routing.requires_universal_core && budgetResult.universalBlocks.length === 0) {
        warnings.push("UNIVERSAL_CORE_NOT_POPULATED: Universal commercial knowledge blocks pending Stage 4.");
      }

      const allRejected = [...dedupRejected, ...budgetResult.rejectedCandidates];
      const durationMs = Date.now() - startTime;

      const pkg: KnowledgePackageV1 = {
        package_version: "1.0",
        routing_version: "1.0",
        retrieval_mode: retrievalMode,
        requires_universal_core: routing.requires_universal_core,
        universal_blocks: budgetResult.universalBlocks,
        selected_blocks: budgetResult.selectedBlocks,
        rejected_candidates: allRejected,
        warnings,
        stats: {
          repository_blocks: activeBlocks.length,
          metadata_candidates: activeMetadataCandidates.length,
          semantic_candidates: semanticMatchesMap.size,
          fused_candidates: fusedCandidates.length,
          selected_blocks: budgetResult.selectedBlocks.length + budgetResult.universalBlocks.length,
          estimated_tokens: budgetResult.totalTokens,
          duration_ms: durationMs,
        },
      };

      // Server-side observability log
      console.log(
        `[STAGE 3 RETRIEVER] mode=${retrievalMode} selected=${pkg.stats.selected_blocks} rejected=${allRejected.length} tokens=${pkg.stats.estimated_tokens} duration=${durationMs}ms`
      );

      return {
        success: true,
        package: pkg,
      };
    } catch (err: any) {
      console.warn(`[STAGE 3 RETRIEVER] Knowledge retrieval encountered exception (${err.message || String(err)}). Returning non-blocking fallback package.`);
      const fallbackPackage: KnowledgePackageV1 = {
        package_version: "1.0",
        routing_version: "1.0",
        retrieval_mode: "METADATA_ONLY",
        requires_universal_core: true,
        universal_blocks: [],
        selected_blocks: [
          {
            id: "specialist.poster_foundation",
            version: "1.0",
            title: "Poster Foundation Technique",
            knowledge_type: "COMPOSITION",
            selection_tier: "PRIMARY",
            final_score: 1.0,
            scores: { metadata: 1, semantic: 0, signal_confidence: 1, information_value: 1, priority: 100, query_importance: 1, redundancy_penalty: 0 },
            matched_signals: ["fallback"],
            selection_reasons: ["FALLBACK_KNOWLEDGE_PACKAGE"],
            estimated_tokens: 150,
          },
        ],
        rejected_candidates: [],
        warnings: [`KNOWLEDGE_RETRIEVAL_FALLBACK: ${err.message || String(err)}`],
        stats: {
          repository_blocks: 1,
          metadata_candidates: 1,
          semantic_candidates: 0,
          fused_candidates: 1,
          selected_blocks: 1,
          estimated_tokens: 150,
          duration_ms: Date.now() - startTime,
        },
      };
      return {
        success: true,
        package: fallbackPackage,
      };
    }
  }
}
