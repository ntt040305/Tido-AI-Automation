import fs from "fs";
import crypto from "crypto";
import path from "path";
import { IMAGE_ENGINE_CONFIG } from "../config";
import { KnowledgeBlock, KnowledgeEmbeddingIndexSchema, KnowledgeEmbeddingIndexItem } from "../types";
import { KnowledgeRetrievalDocumentBuilder } from "./KnowledgeRetrievalDocumentBuilder";
import { EmbeddingService } from "./EmbeddingService";

export interface IndexStatusInfo {
  status: "READY" | "STALE" | "MISSING" | "ERROR";
  model: string;
  dimensions: number;
  indexedBlocks: number;
  staleBlocks: number;
  missingBlocks: number;
  generatedAt?: string;
  error?: string;
}

export class KnowledgeEmbeddingIndexService {
  /**
   * Generates a deterministic content hash for a Knowledge Block.
   */
  public static computeContentHash(block: KnowledgeBlock): string {
    const docText = KnowledgeRetrievalDocumentBuilder.buildDocumentText(block);
    const metaStr = JSON.stringify({
      id: block.metadata.id,
      version: block.metadata.version,
      status: block.metadata.status,
      keywords: block.metadata.keywords || [],
      aliases: block.metadata.aliases || [],
      semantic_tags: block.metadata.semantic_tags || [],
      routing_dimensions: block.metadata.routing_dimensions || {},
    });

    return crypto
      .createHash("sha256")
      .update(`${metaStr}::${docText}`)
      .digest("hex");
  }

  /**
   * Loads local embedding index schema from disk if valid.
   */
  public static loadIndex(): KnowledgeEmbeddingIndexSchema | null {
    const indexPath = IMAGE_ENGINE_CONFIG.KNOWLEDGE_INDEX_PATH;
    if (!fs.existsSync(indexPath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(indexPath, "utf-8");
      const indexObj = JSON.parse(raw) as KnowledgeEmbeddingIndexSchema;

      // Invalidate if model or dimensions mismatch
      if (
        indexObj.embedding_model !== IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL ||
        indexObj.embedding_dimensions !== IMAGE_ENGINE_CONFIG.EMBEDDING_DIMENSIONS
      ) {
        return null;
      }

      return indexObj;
    } catch {
      return null;
    }
  }

  /**
   * Evaluates current index freshness against active repository blocks.
   */
  public static evaluateStatus(activeBlocks: KnowledgeBlock[]): IndexStatusInfo {
    const index = this.loadIndex();
    if (!index) {
      return {
        status: "MISSING",
        model: IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL,
        dimensions: IMAGE_ENGINE_CONFIG.EMBEDDING_DIMENSIONS,
        indexedBlocks: 0,
        staleBlocks: 0,
        missingBlocks: activeBlocks.length,
      };
    }

    const indexMap = new Map<string, KnowledgeEmbeddingIndexItem>();
    index.blocks.forEach((b) => indexMap.set(b.id, b));

    let missing = 0;
    let stale = 0;

    for (const block of activeBlocks) {
      const item = indexMap.get(block.metadata.id);
      if (!item) {
        missing++;
      } else {
        const hash = this.computeContentHash(block);
        if (hash !== item.content_hash) {
          stale++;
        }
      }
    }

    const isStale = missing > 0 || stale > 0;

    return {
      status: isStale ? "STALE" : "READY",
      model: index.embedding_model,
      dimensions: index.embedding_dimensions,
      indexedBlocks: index.blocks.length,
      staleBlocks: stale,
      missingBlocks: missing,
      generatedAt: index.generated_at,
    };
  }

  /**
   * Incrementally syncs/rebuilds local embedding index for active Knowledge Blocks.
   */
  public static async syncIndex(
    activeBlocks: KnowledgeBlock[],
    options: { forceRebuild?: boolean } = {}
  ): Promise<{ index: KnowledgeEmbeddingIndexSchema; updatedCount: number; reusedCount: number }> {
    const existingIndex = options.forceRebuild ? null : this.loadIndex();
    const existingMap = new Map<string, KnowledgeEmbeddingIndexItem>();

    if (existingIndex) {
      existingIndex.blocks.forEach((b) => existingMap.set(b.id, b));
    }

    const updatedBlocks: KnowledgeEmbeddingIndexItem[] = [];
    let updatedCount = 0;
    let reusedCount = 0;

    for (const block of activeBlocks) {
      // Exclude non-active blocks
      if (block.metadata.status !== "ACTIVE") {
        continue;
      }

      const hash = this.computeContentHash(block);
      const existing = existingMap.get(block.metadata.id);

      if (existing && existing.content_hash === hash) {
        updatedBlocks.push(existing);
        reusedCount++;
      } else {
        // Embed changed or new block
        const docText = KnowledgeRetrievalDocumentBuilder.buildDocumentText(block);
        const embedding = await EmbeddingService.embedDocument(block.metadata.title, docText);

        updatedBlocks.push({
          id: block.metadata.id,
          version: block.metadata.version,
          content_hash: hash,
          embedding,
        });
        updatedCount++;
      }
    }

    const newIndex: KnowledgeEmbeddingIndexSchema = {
      index_version: "1.0",
      embedding_model: IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL,
      embedding_dimensions: IMAGE_ENGINE_CONFIG.EMBEDDING_DIMENSIONS,
      generated_at: new Date().toISOString(),
      blocks: updatedBlocks,
    };

    // Atomic save to disk
    this.saveIndexAtomically(newIndex);

    return { index: newIndex, updatedCount, reusedCount };
  }

  /**
   * Writes the index file atomically to prevent partial writes.
   */
  private static saveIndexAtomically(index: KnowledgeEmbeddingIndexSchema) {
    const indexPath = IMAGE_ENGINE_CONFIG.KNOWLEDGE_INDEX_PATH;
    const tempPath = `${indexPath}.tmp.${Date.now()}`;
    const dir = path.dirname(indexPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(tempPath, JSON.stringify(index, null, 2), "utf-8");
    fs.renameSync(tempPath, indexPath);
  }
}
