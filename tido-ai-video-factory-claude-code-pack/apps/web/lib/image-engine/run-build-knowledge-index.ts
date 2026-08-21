import { LocalKnowledgeRepository } from "./repository/LocalKnowledgeRepository";
import { KnowledgeEmbeddingIndexService } from "./retrieval/KnowledgeEmbeddingIndexService";
import { IMAGE_ENGINE_CONFIG } from "./config";

export async function runBuildKnowledgeIndex() {
  console.log("\n=================================================");
  console.log("⚡ TIDO IMAGE ENGINE — KNOWLEDGE EMBEDDING INDEX BUILDER");
  console.log("=================================================\n");

  const repo = new LocalKnowledgeRepository();
  const activeBlocks = repo.getActiveBlocks();

  console.log(`📂 Active Knowledge Blocks Found: ${activeBlocks.length}`);
  activeBlocks.forEach((b) => {
    console.log(`   - ${b.metadata.id} (v${b.metadata.version}) [${b.metadata.knowledge_type}]`);
  });

  const statusBefore = KnowledgeEmbeddingIndexService.evaluateStatus(activeBlocks);
  console.log(`\n🔍 Current Index Status: ${statusBefore.status}`);

  const manifest = await repo.buildManifest();
  console.log(`📄 Manifest Rebuilt: ${manifest.total_blocks} total blocks (${manifest.active_blocks} ACTIVE) saved to manifest.json`);

  if (!process.env.GEMINI_API_KEY) {
    console.log("\n⚠️  GEMINI_API_KEY is not set in environment variables.");
    console.log("   Skipping vector generation. Metadata matching will operate in METADATA_ONLY mode.\n");
    return;
  }

  console.log(`\n🔄 Syncing vectors with ${IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL} (${IMAGE_ENGINE_CONFIG.EMBEDDING_DIMENSIONS}D)...`);
  const result = await KnowledgeEmbeddingIndexService.syncIndex(activeBlocks);

  console.log("\n=================================================");
  console.log("📊 KNOWLEDGE EMBEDDING INDEX SUMMARY");
  console.log("=================================================");
  console.log(`   ACTIVE BLOCKS:  ${activeBlocks.length}`);
  console.log(`   REUSED VECTORS: ${result.reusedCount}`);
  console.log(`   UPDATED:        ${result.updatedCount}`);
  console.log(`   MODEL:          ${result.index.embedding_model}`);
  console.log(`   DIMENSIONS:     ${result.index.embedding_dimensions}`);
  console.log(`   GENERATED AT:   ${result.index.generated_at}`);
  console.log(`   STATUS:         READY`);
  console.log("=================================================\n");
}

if (require.main === module) {
  runBuildKnowledgeIndex().catch((err) => {
    console.error("Index build failed:", err);
    process.exit(1);
  });
}
