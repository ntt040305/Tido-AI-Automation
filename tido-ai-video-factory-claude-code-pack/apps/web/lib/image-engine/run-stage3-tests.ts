import { LocalKnowledgeRepository } from "./repository/LocalKnowledgeRepository";
import { RoutingValidator } from "./validation/RoutingValidator";
import { RoutingSignalExtractor } from "./retrieval/RoutingSignalExtractor";
import { MetadataKnowledgeMatcher } from "./retrieval/MetadataKnowledgeMatcher";
import { CosineSimilarity } from "./retrieval/CosineSimilarity";
import { KnowledgeEmbeddingIndexService } from "./retrieval/KnowledgeEmbeddingIndexService";
import { CandidateFusion } from "./retrieval/CandidateFusion";
import { KnowledgeReRanker } from "./retrieval/KnowledgeReRanker";
import { KnowledgeDeduplicator } from "./retrieval/KnowledgeDeduplicator";
import { KnowledgeDependencyResolver } from "./retrieval/KnowledgeDependencyResolver";
import { KnowledgeBudgetManager } from "./retrieval/KnowledgeBudgetManager";
import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import { EmbeddingService } from "./retrieval/EmbeddingService";
import { RoutingResultSchema } from "./types";

export async function runStage3Tests() {
  console.log("\n=================================================");
  console.log("⚡ STAGE 3 SMART KNOWLEDGE RETRIEVAL TEST SUITE");
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

  // Inject a mock embedding provider for offline test execution
  EmbeddingService.setMockProvider(async (text: string) => {
    // Generate deterministic 768-dim mock vector based on string hash
    const vec = new Array(768).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    for (let i = 0; i < 768; i++) {
      vec[i] = Math.sin(hash + i * 0.1);
    }
    return vec;
  });

  const repo = new LocalKnowledgeRepository();
  const activeBlocks = repo.getActiveBlocks();

  // ── TEST GROUP 1: COSINE SIMILARITY ────────────────────────────
  console.log("🔹 1. Cosine Similarity Utility Tests");

  const vA = [1, 0, 0, 0];
  const vB = [1, 0, 0, 0];
  const simIdentical = CosineSimilarity.compute(vA, vB);
  assert(Math.abs(simIdentical - 1.0) < 0.001, "Identical vectors yield similarity 1.0");

  const vOrth = [0, 1, 0, 0];
  const simOrth = CosineSimilarity.compute(vA, vOrth);
  assert(Math.abs(simOrth - 0.0) < 0.001, "Orthogonal vectors yield similarity 0.0");

  const simZero = CosineSimilarity.compute([0, 0, 0, 0], [1, 2, 3, 4]);
  assert(simZero === 0, "Zero vector handles gracefully without division by zero");

  // ── TEST GROUP 2: ROUTING SIGNAL EXTRACTION ────────────────────
  console.log("\n🔹 2. Routing Signal Extractor Tests");

  const sampleRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "High-end glass beverage bottle with transparency challenges",
    products: [
      {
        product_id: "PROD_01",
        reference_ids: ["REF_01", "REF_02", "REF_03"],
        reference_relationship_confidence: 0.98,
        summary: "Luxury glass perfume bottle",
        categories: [{ value: "perfume", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Perfume bottle" }],
        industry_domains: [{ value: "cosmetics", confidence: 0.92, evidence_type: "OBSERVED", evidence_summary: "Cosmetics sector" }],
        likely_functions: [{ value: "container", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Container" }],
        materials: [{ value: "glass", confidence: 0.96, evidence_type: "OBSERVED", evidence_summary: "Glass material" }],
        contents: [{ value: "fragrance liquid", confidence: 0.88, evidence_type: "STRONG_INFERENCE", evidence_summary: "Liquid content" }],
        surface_properties: [{ value: "transparent", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Transparent surface" }],
        geometry_traits: [{ value: "cylindrical", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Cylindrical shape" }],
        packaging_types: [{ value: "bottle", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Bottle packaging" }],
        branding_features: [],
        visual_challenges: [
          {
            id: "transparent_glass_realism",
            description: "High refractivity glass reflections and transparent liquid depth",
            confidence: 0.94,
          },
        ],
        unknowns: [],
        retrieval_queries: [
          {
            query: "glass refraction and liquid reflection visual principles",
            importance: "PRIMARY",
            reason: "Core glass visual challenge",
          },
        ],
      },
    ],
    global_retrieval_queries: [],
  };

  const signals = RoutingSignalExtractor.extractSignals(sampleRouting);
  assert(signals.length > 0, "Extracted retrieval signals from RoutingResult");
  const glassSignal = signals.find((s) => s.dimension === "MATERIAL" && s.value === "glass");
  assert(!!glassSignal, "Extracted glass material signal", `found ${signals.length} signals`);
  assert(glassSignal?.effectiveWeight === 0.96, "Correct effective weight calculation (0.96 * 1.0)");

  // ── TEST GROUP 3: METADATA KNOWLEDGE MATCHING ───────────────
  console.log("\n🔹 3. Metadata Knowledge Matcher Tests");

  const glassBlock = activeBlocks.find((b) => b.metadata.id === "material.glass");
  assert(!!glassBlock, "Found 'material.glass' active block in repository");

  if (glassBlock) {
    const matchRes = MetadataKnowledgeMatcher.matchBlock(glassBlock, signals);
    assert(matchRes.metadataScore > 0.8, "material.glass receives strong metadata match score (>0.8)", `score: ${matchRes.metadataScore}`);
    assert(matchRes.matchedSignals.length > 0, "Records matched signals for explainability");
  }

  // ── TEST GROUP 4: DEDUPLICATION & COVERS METADATA ────────────
  console.log("\n🔹 4. Knowledge Deduplication Tests");

  const transparentBlock = activeBlocks.find((b) => b.metadata.id === "property.transparent");
  assert(!!transparentBlock, "Found 'property.transparent' active block in repository");

  if (glassBlock && transparentBlock) {
    const mockCandidates = [
      {
        block: glassBlock,
        metadataScore: 0.95,
        semanticScore: 0.90,
        signalConfidence: 0.96,
        informationValue: 0.90,
        priority: 0.8,
        queryImportance: 1.0,
        redundancyPenalty: 0.0,
        matchedSignals: ["material: glass"],
        selectionReasons: ["Observed glass material"],
        matchedQueries: [],
        finalScore: 0.94,
      },
      {
        block: transparentBlock,
        metadataScore: 0.85,
        semanticScore: 0.85,
        signalConfidence: 0.95,
        informationValue: 0.85,
        priority: 0.7,
        queryImportance: 0.8,
        redundancyPenalty: 0.0,
        matchedSignals: ["property: transparent"],
        selectionReasons: ["Observed transparent property"],
        matchedQueries: [],
        finalScore: 0.82,
      },
    ];

    const dedupRes = KnowledgeDeduplicator.deduplicate(mockCandidates, null);
    assert(dedupRes.deduplicatedCandidates.length === 1, "Deduplication retained 1 candidate");
    assert(dedupRes.deduplicatedCandidates[0].block.metadata.id === "material.glass", "material.glass retained as primary");
    assert(dedupRes.rejectedCandidates.length === 1, "property.transparent rejected as covered/redundant");
    assert(dedupRes.rejectedCandidates[0].reason_code === "COVERED_BY_SELECTED_BLOCK", "Rejection reason code is COVERED_BY_SELECTED_BLOCK");
  }

  // ── TEST GROUP 5: BUDGET & TIER MANAGEMENT ───────────────────
  console.log("\n🔹 5. Knowledge Budget Manager Tests");

  const tokenEst = KnowledgeBudgetManager.estimateTokens("Hello world professional knowledge text");
  assert(tokenEst > 0, "Token estimator calculates reasonable count");

  // ── TEST GROUP 6: END-TO-END RETRIEVER PIPELINE ─────────────
  console.log("\n🔹 6. SmartKnowledgeRetriever Pipeline Tests");

  const result = await SmartKnowledgeRetriever.retrieve(sampleRouting, ["REF_01", "REF_02", "REF_03"]);
  assert(result.success === true, "SmartKnowledgeRetriever executed successfully");
  assert(!!result.package, "Returned valid KnowledgePackageV1");
  if (result.package) {
    assert(result.package.package_version === "1.0", "Package version is '1.0'");
    assert(result.package.selected_blocks.length > 0, "Selected relevant Knowledge blocks");
    assert(result.package.stats.repository_blocks === activeBlocks.length, "Stats reflect repository block count");
    console.log(`   Selected blocks: ${result.package.selected_blocks.map((b) => `${b.id} (${Math.round(b.final_score * 100)}%)`).join(", ")}`);
    console.log(`   Retrieval Mode: ${result.package.retrieval_mode}`);
  }

  // ── TEST GROUP 7: BOUNDARY VALIDATION REJECTION ──────────────
  console.log("\n🔹 7. Retrieval Boundary Validation Tests");

  const invalidResult = await SmartKnowledgeRetriever.retrieve({ invalid: "data" });
  assert(invalidResult.success === false, "Rejects malformed routing input at boundary");
  assert(invalidResult.error?.code === "INVALID_ROUTING_INPUT", "Error code is INVALID_ROUTING_INPUT");

  console.log("\n=================================================");
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runStage3Tests().catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  });
}
