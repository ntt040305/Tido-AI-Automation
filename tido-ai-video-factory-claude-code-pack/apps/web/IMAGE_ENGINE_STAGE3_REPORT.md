# TIDO Image Engine — Stage 3 Smart Knowledge Retrieval Engine Implementation Report

## Executive Summary
Stage 3 of the TIDO Image Engine establishes a deterministic, confidence-aware, explainable **Smart Knowledge Retrieval Engine**. Operating on the validated V1 output of the Stage 2 Knowledge Router, Stage 3 scans the local Knowledge Repository, fuses metadata matching with vector semantic retrieval via Google's `gemini-embedding-2` model, re-ranks candidates deterministically, deduplicates redundant principles, enforces token/block budget caps, and generates a clean, sanitized `KnowledgePackageV1`.

**Key Principle Enforced:**
Knowledge Retrieval answers **"WHICH EXISTING PROFESSIONAL KNOWLEDGE IS MOST RELEVANT TO THIS ROUTING RESULT?"**
It never decides creative direction, concept, camera, composition, or art direction. Proprietary `knowledge.md` content remains strictly server-side.

---

## 1. Architecture & Pipeline

```
          ┌──────────────────────────────────────────────┐
          │      Validated Stage 2 RoutingResult JSON    │
          └──────────────────────┬───────────────────────┘
                                 │
                     RoutingSignalExtractor
                                 │
           ┌─────────────────────┴─────────────────────┐
           │                                           │
  MetadataKnowledgeMatcher                   SemanticKnowledgeRetriever
 (routing_dimensions, match_rules,           (gemini-embedding-2 768D,
  keywords, aliases, tags)                    query/doc text formatting)
           │                                           │
           └─────────────────────┬─────────────────────┘
                                 │
                          CandidateFusion
                                 │
                         KnowledgeReRanker
                    (Composite scoring formula)
                                 │
                       KnowledgeDeduplicator
                  (covers[], semantic similarity 0.92)
                                 │
                     KnowledgeDependencyResolver
                     (dependencies[] tiering)
                                 │
                       KnowledgeBudgetManager
                  (Max 4 Primary, 2 Supporting, 3500 tokens)
                                 │
                      KnowledgePackageV1
```

---

## 2. Files Created & Modified

### New Files Created:
1. `lib/image-engine/retrieval/EmbeddingService.ts`: `@google/genai` client wrapper for `gemini-embedding-2` (768D) with fallback/mocking support.
2. `lib/image-engine/retrieval/KnowledgeRetrievalDocumentBuilder.ts`: Semantic document builder for block embedding.
3. `lib/image-engine/retrieval/CosineSimilarity.ts`: Cosine similarity vector utility with finite value validation.
4. `lib/image-engine/retrieval/KnowledgeEmbeddingIndexService.ts`: Local index loader/saver with SHA-256 content hashes, incremental sync, staleness detection, and atomic disk writes.
5. `lib/image-engine/retrieval/RoutingSignalExtractor.ts`: Normalizes routing classifications and visual challenges into `RetrievalSignal[]`.
6. `lib/image-engine/retrieval/MetadataKnowledgeMatcher.ts`: Deterministic metadata scoring engine.
7. `lib/image-engine/retrieval/SemanticKnowledgeRetriever.ts`: Vector similarity retrieval over retrieval queries.
8. `lib/image-engine/retrieval/CandidateFusion.ts`: Candidate stream merger by Block ID.
9. `lib/image-engine/retrieval/KnowledgeReRanker.ts`: Normalized composite re-ranker (0.0 to 1.0).
10. `lib/image-engine/retrieval/KnowledgeDeduplicator.ts`: Deduplication based on `covers[]` and pairwise semantic similarity (0.92 threshold).
11. `lib/image-engine/retrieval/KnowledgeDependencyResolver.ts`: Automatic dependency block resolution.
12. `lib/image-engine/retrieval/KnowledgeBudgetManager.ts`: Token & block cap manager.
13. `lib/image-engine/retrieval/SmartKnowledgeRetriever.ts`: Main Stage 3 orchestrator.
14. `app/api/image/knowledge/retrieve/route.ts`: `POST` API route returning `KnowledgePackageV1`.
15. `app/api/image/knowledge/index/status/route.ts`: `GET` API route exposing safe index status.
16. `lib/image-engine/run-build-knowledge-index.ts`: CLI script for index building.
17. `lib/image-engine/run-stage3-tests.ts`: Comprehensive 22-step Stage 3 test suite.
18. `lib/image-engine/run-live-retrieval-test.ts`: Integration script generating `sample_knowledge_package.json`.
19. `sample_knowledge_package.json`: Benchmark output package sample.

### Existing Files Modified:
1. `lib/image-engine/config.ts`: Centralized `RETRIEVAL_CONFIG` (models, dimensions, evidence/query weights, score weights, budget limits).
2. `lib/image-engine/types.ts`: Stage 3 types (`KnowledgePackageV1`, `SelectedBlockEntry`, `RejectedCandidateEntry`, `ScoreBreakdown`, `RetrievalStats`, etc.).
3. `lib/image-engine/repository/KnowledgeRepository.ts`: Added `getActiveBlocks()` method to interface.
4. `lib/image-engine/repository/LocalKnowledgeRepository.ts`: Implemented `getActiveBlocks()`.
5. `data/knowledge/materials/glass/metadata.json`: Added `property.transparent` to `covers[]` array.
6. `components/RenderImageComponents.tsx`: Activated `Selected Knowledge` panel in Tester UI with tier badges, score breakdowns, and rejected candidate audit panel.

---

## 3. Embedding & Index Details

* **Embedding Model:** `gemini-embedding-2`
* **Vector Dimensions:** `768`
* **Query Formatting:** `task: search result | query: {query}`
* **Document Formatting:** `title: {title} | text: {documentText}`
* **Local Index Path:** `data/indexes/knowledge_embeddings_v1.json`
* **Incremental Sync:** SHA-256 fingerprinting over metadata and document text reuses unchanged vectors and re-embeds only modified blocks. Model or dimension changes automatically trigger a full index rebuild.

---

## 4. Scoring Weights & Re-ranking Formula

Candidates receive a composite score normalized between `0.0` and `1.0`:

$$\text{Final Score} = 0.32 \times \text{Metadata} + 0.28 \times \text{Semantic} + 0.16 \times \text{SignalConfidence} + 0.10 \times \text{InfoValue} + 0.08 \times \text{Priority} + 0.06 \times \text{QueryImportance} - \text{RedundancyPenalty}$$

### Evidence Weights:
* `USER_PROVIDED`: 1.00
* `OBSERVED`: 1.00
* `STRONG_INFERENCE`: 0.80
* `WEAK_INFERENCE`: 0.45

### Budget Limits:
* `MAX_PRIMARY_BLOCKS`: 4
* `MAX_SUPPORTING_BLOCKS`: 2
* `MAX_SPECIALIST_BLOCKS_TOTAL`: 6
* `MAX_SPECIALIST_ESTIMATED_TOKENS`: 3500

---

## 5. Test Results

### Test Suite Execution Summary:
* **Stage 1 Infrastructure & Repository Tests (`run-tests.ts`):** 21 / 21 PASSED
* **Stage 2 Router Contract Consistency Tests (`run-router-tests.ts`):** 21 / 21 PASSED
* **Stage 3 Smart Retrieval Tests (`run-stage3-tests.ts`):** 22 / 22 PASSED
* **Next.js Production Build (`npm run build`):** SUCCESS (Exit Code 0)

---

## 6. Ready for Stage 4
Stage 3 is fully complete. The system produces explainable `KnowledgePackageV1` output. **Stage 4 (Master Prompt Compilation V2 & Universal Core Authoring)** remains unstarted.
