import { LocalKnowledgeRepository } from "./repository/LocalKnowledgeRepository";
import { RoutingSignalExtractor } from "./retrieval/RoutingSignalExtractor";
import { MetadataKnowledgeMatcher } from "./retrieval/MetadataKnowledgeMatcher";
import { CandidateFusion } from "./retrieval/CandidateFusion";
import { KnowledgeReRanker } from "./retrieval/KnowledgeReRanker";
import { KnowledgeDeduplicator } from "./retrieval/KnowledgeDeduplicator";
import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import { SemanticKnowledgeRetriever } from "./retrieval/SemanticKnowledgeRetriever";
import { EmbeddingService } from "./retrieval/EmbeddingService";
import { KnowledgeEmbeddingIndexService } from "./retrieval/KnowledgeEmbeddingIndexService";
import { RoutingResultSchema } from "./types";

export async function runStage31Tests() {
  console.log("\n=================================================");
  console.log("⚡ STAGE 3.1 — RETRIEVAL QUALITY HARDENING TESTS");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  const repo = new LocalKnowledgeRepository();
  const activeBlocks = repo.getActiveBlocks();
  const glassBlock = activeBlocks.find((b) => b.metadata.id === "material.glass");
  const transparentBlock = activeBlocks.find((b) => b.metadata.id === "property.transparent");

  assert(!!glassBlock, "Repository contains active 'material.glass' block");
  assert(!!transparentBlock, "Repository contains active 'property.transparent' block");

  // Sample Glass Bottle Routing Result
  const sampleGlassRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "High-end glass beverage bottle with transparency challenges",
    products: [
      {
        product_id: "PROD_01",
        reference_ids: ["REF_01", "REF_02", "REF_03"],
        reference_relationship_confidence: 0.98,
        summary: "Luxury glass bottle",
        categories: [{ value: "beverage", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Beverage category" }],
        industry_domains: [{ value: "food_and_beverage", confidence: 0.92, evidence_type: "OBSERVED", evidence_summary: "Food and beverage" }],
        likely_functions: [{ value: "container", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Container function" }],
        materials: [{ value: "glass", confidence: 0.97, evidence_type: "OBSERVED", evidence_summary: "Glass material" }],
        contents: [{ value: "liquid", confidence: 0.88, evidence_type: "STRONG_INFERENCE", evidence_summary: "Liquid contents" }],
        surface_properties: [{ value: "transparent", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Transparent surface" }],
        geometry_traits: [{ value: "cylindrical", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Cylindrical bottle shape" }],
        packaging_types: [{ value: "bottle", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Glass bottle packaging" }],
        branding_features: [],
        visual_challenges: [
          {
            id: "transparent_glass_realism",
            description: "glass transparency optical principles refraction specular edge darkening",
            confidence: 0.94,
          },
        ],
        unknowns: [],
        retrieval_queries: [
          {
            query: "glass transparency optical principles refraction specular edge darkening",
            importance: "PRIMARY",
            reason: "Core optical refraction and transparency visual challenge",
          },
        ],
      },
    ],
    global_retrieval_queries: [],
  };

  // ── TEST 1: METADATA-ONLY MODE ─────────────────────────────────
  console.log("🔹 1. Metadata-Only Mode Integrity Test");
  
  // Clear any existing mock provider to test metadata fallback
  EmbeddingService.setMockProvider(null);

  const metaOnlyResult = await SmartKnowledgeRetriever.retrieve(sampleGlassRouting);
  assert(metaOnlyResult.success === true, "Metadata-Only retrieval executed successfully");
  if (metaOnlyResult.package) {
    const pkg = metaOnlyResult.package;
    assert(pkg.retrieval_mode === "METADATA_ONLY" || pkg.retrieval_mode === "HYBRID", "Returned valid retrieval mode");
    
    const glassCandidate = pkg.selected_blocks.find((b) => b.id === "material.glass");
    assert(!!glassCandidate, "material.glass selected via metadata");
    
    if (glassCandidate && pkg.retrieval_mode === "METADATA_ONLY") {
      assert(glassCandidate.scores.semantic === 0, "semantic score is exactly 0 in METADATA_ONLY mode");
      assert(glassCandidate.scores.query_importance === 0, "query_importance is exactly 0 when no query matched");
    }
  }

  // ── TEST 2: HYBRID RETRIEVAL MODE WITH MOCK EMBEDDINGS ────────
  console.log("\n🔹 2. Real/Mock Hybrid Retrieval Mode Test");

  // Inject deterministic word-feature mock vector provider to test HYBRID channel
  EmbeddingService.setMockProvider(async (text: string) => {
    const vec = new Array(768).fill(0);
    const stopWords = new Set(["task", "search", "result", "query", "title", "text", "and", "or", "the", "a", "of", "in", "to", "for", "with"]);
    const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !stopWords.has(w));
    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash << 5) - hash + word.charCodeAt(i);
        hash |= 0;
      }
      const idx = Math.abs(hash) % 768;
      vec[idx] += 1.0;
    }
    const mag = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || 1.0;
    return vec.map((val) => val / mag);
  });

  // Re-sync embedding index in memory using mock provider
  const syncResult = await KnowledgeEmbeddingIndexService.syncIndex(activeBlocks, { forceRebuild: true });
  assert(syncResult.index.embedding_dimensions === 768, "Embedding index generated with 768D vectors");
  assert(syncResult.index.blocks.length === activeBlocks.length, "All active blocks indexed");

  const hybridResult = await SmartKnowledgeRetriever.retrieve(
    sampleGlassRouting,
    ["REF_01", "REF_02", "REF_03"],
    syncResult.index
  );
  assert(hybridResult.success === true, "Hybrid retrieval pipeline executed successfully");
  if (hybridResult.package) {
    const pkg = hybridResult.package;
    if (pkg.warnings.length > 0) {
      console.log("   Test 2 Warnings:", pkg.warnings);
    }
    assert(pkg.retrieval_mode === "HYBRID", "retrieval_mode reports HYBRID");
    assert(pkg.stats.semantic_candidates > 0, "semantic_candidates > 0 in HYBRID mode");
    
    const glassCand = pkg.selected_blocks.find((b) => b.id === "material.glass");
    if (glassCand) {
      assert(glassCand.scores.metadata > 0, "Candidate metadata score > 0");
      assert(glassCand.scores.semantic > 0, "Candidate semantic score > 0");
      assert(glassCand.scores.query_importance > 0, "Candidate query_importance > 0 in HYBRID mode");
    }
  }

  // Reset mock provider after hybrid test
  EmbeddingService.setMockProvider(null);

  // ── TEST 3: MATCHED SIGNAL PROVENANCE AUDIT ─────────────────────
  console.log("\n🔹 3. Matched Signal Provenance Audit Test");

  const signals = RoutingSignalExtractor.extractSignals(sampleGlassRouting);
  if (glassBlock) {
    const matchRes = MetadataKnowledgeMatcher.matchBlock(glassBlock, signals);
    
    assert(matchRes.matchedSignals.length > 0, "Recorded matched signals");
    assert(matchRes.provenance.length === matchRes.matchedSignals.length, "Provenance array length matches matchedSignals length");
    
    const containsGlass = matchRes.matchedSignals.some((s) => s.includes("glass"));
    const containsTransparent = matchRes.matchedSignals.some((s) => s.includes("transparent"));
    assert(containsGlass || containsTransparent, "Matched explicit glass or transparent signals");

    // Check that unmatched signal (e.g. automotive industry) is NOT claimed
    const claimsUnmatchedIndustry = matchRes.matchedSignals.some((s) => s.includes("automotive"));
    assert(!claimsUnmatchedIndustry, "material.glass does NOT claim unmatched 'automotive' industry signal");
  }

  // ── TEST 4: FALSE MATCH PREVENTION ──────────────────────────────
  console.log("\n🔹 4. False Match Prevention Test");

  const dummyMetalBlock = {
    metadata: {
      schema_version: "1.0",
      id: "material.metal",
      version: "1.0.0",
      status: "ACTIVE",
      knowledge_type: "MATERIAL",
      title: "Metal Surface Behavior",
      summary: "Metallic reflection principles",
      scope: "GENERIC",
      keywords: ["metal", "metallic"],
      aliases: [],
      semantic_tags: ["material.metal"],
      routing_dimensions: {
        materials: ["metal"],
      },
      match_rules: [],
      related_blocks: [],
      dependencies: [],
      covers: [],
      priority: 80,
      information_value: 0.8,
      genericity: 0.5,
      creative_recipe: false,
      content_file: "knowledge.md",
      language: "en",
      validation: { review_status: "UNREVIEWED", tested_jobs: [], notes: "" },
    },
    content: "Metal knowledge",
    filePath: "",
    contentPath: "",
  };

  const metalMatch = MetadataKnowledgeMatcher.matchBlock(dummyMetalBlock as any, signals);
  assert(metalMatch.metadataScore === 0, "Unmatched router signals (liquid, glass, bottle) do NOT inflate dummy metal score (score = 0)");
  assert(metalMatch.matchedSignals.length === 0, "Dummy metal candidate records zero matched signals for glass routing");

  // ── TEST 5: STANDARDIZED COVERS[] DEDUPLICATION & VALIDATION ───
  console.log("\n🔹 5. Standardized covers[] Block ID Test");

  if (glassBlock && transparentBlock) {
    assert(glassBlock.metadata.covers?.includes("property.transparent"), "material.glass explicitly covers Block ID 'property.transparent'");

    const candidates = CandidateFusion.fuseCandidates(
      activeBlocks,
      [
        { block: glassBlock, metadataScore: 0.95, matchedSignals: ["material: glass"], selectionReasons: [], provenance: [], matchedSignalsConfidences: [0.97] },
        { block: transparentBlock, metadataScore: 0.85, matchedSignals: ["property: transparent"], selectionReasons: [], provenance: [], matchedSignalsConfidences: [0.95] },
      ],
      new Map(),
      signals
    );

    const ranked = KnowledgeReRanker.rankCandidates(candidates);
    const dedup = KnowledgeDeduplicator.deduplicate(ranked, null);

    assert(dedup.deduplicatedCandidates.length === 1, "Deduplication retained higher-scoring material.glass");
    assert(dedup.rejectedCandidates.length === 1, "Rejected property.transparent as covered");
    assert(dedup.rejectedCandidates[0].reason_code === "COVERED_BY_SELECTED_BLOCK", "Reason code is COVERED_BY_SELECTED_BLOCK");
    assert(dedup.rejectedCandidates[0].reason.includes("material.glass"), "Rejection reason explicitly references covering parent 'material.glass'");
  }

  // ── TEST 6: REPOSITORY COVERS VALIDATION ───────────────────────
  console.log("\n🔹 6. Repository covers[] Block ID Validation Test");
  const repoValidation = await repo.validateRepository();
  assert(repoValidation.isValid === true, "Knowledge Repository validation passed with zero errors");

  console.log("\n=================================================");
  console.log(`📊 STAGE 3.1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runStage31Tests().catch((err) => {
    console.error("Stage 3.1 test execution error:", err);
    process.exit(1);
  });
}
