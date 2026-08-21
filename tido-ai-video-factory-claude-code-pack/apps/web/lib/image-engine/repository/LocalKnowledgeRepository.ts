import fs from "fs";
import path from "path";
import { IMAGE_ENGINE_CONFIG, resolveDataPath } from "../config";
import { KnowledgeRepository } from "./KnowledgeRepository";
import {
  KnowledgeBlock,
  KnowledgeBlockMetadata,
  KnowledgeType,
  Manifest,
  ManifestItem,
  ValidationError,
  ValidationReport,
} from "../types";

export class LocalKnowledgeRepository implements KnowledgeRepository {
  private knowledgeDir: string;
  private manifestPath: string;
  private metadataCache: Map<string, { metadata: KnowledgeBlockMetadata; metaPath: string; contentPath: string }> | null = null;

  constructor(
    knowledgeDir: string = IMAGE_ENGINE_CONFIG.KNOWLEDGE_DIR,
    manifestPath: string = IMAGE_ENGINE_CONFIG.MANIFEST_PATH
  ) {
    this.knowledgeDir = path.resolve(knowledgeDir);
    this.manifestPath = path.resolve(manifestPath);
  }

  /**
   * Helper: Prevent path traversal security violations
   */
  private assertPathSafety(targetPath: string, rootDir: string = this.knowledgeDir): string {
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(rootDir)) {
      throw new Error(`Security Violation: Path traversal detected (${targetPath}) outside (${rootDir})`);
    }
    return resolved;
  }

  /**
   * Recursively scan directory for metadata.json files
   */
  private findMetadataFiles(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results = results.concat(this.findMetadataFiles(fullPath));
      } else if (item.isFile() && item.name === "metadata.json") {
        results.push(fullPath);
      }
    }
    return results;
  }

  /**
   * Internal loader to scan & cache metadata
   */
  private async getOrBuildCache(forceRefresh = false) {
    if (this.metadataCache && !forceRefresh) {
      return this.metadataCache;
    }

    const cache = new Map<string, { metadata: KnowledgeBlockMetadata; metaPath: string; contentPath: string }>();
    const metadataFiles = this.findMetadataFiles(this.knowledgeDir);

    for (const metaPath of metadataFiles) {
      try {
        this.assertPathSafety(metaPath, this.knowledgeDir);
        const rawJson = fs.readFileSync(metaPath, "utf-8");
        const metadata = JSON.parse(rawJson) as KnowledgeBlockMetadata;

        const blockDir = path.dirname(metaPath);
        const contentFileName = metadata.content_file || "knowledge.md";
        const contentPath = path.join(/*turbopackIgnore: true*/ blockDir, contentFileName);

        cache.set(metadata.id, {
          metadata,
          metaPath,
          contentPath,
        });
      } catch (err) {
        // Handled during validation
      }
    }

    this.metadataCache = cache;
    return cache;
  }

  async listKnowledgeBlocks(): Promise<KnowledgeBlockMetadata[]> {
    const cache = await this.getOrBuildCache();
    return Array.from(cache.values()).map((item) => item.metadata);
  }

  getActiveBlocks(): KnowledgeBlock[] {
    const metadataFiles = this.findMetadataFiles(this.knowledgeDir);
    const results: KnowledgeBlock[] = [];

    for (const metaPath of metadataFiles) {
      try {
        this.assertPathSafety(metaPath, this.knowledgeDir);
        const rawJson = fs.readFileSync(metaPath, "utf-8");
        const metadata = JSON.parse(rawJson) as KnowledgeBlockMetadata;

        if (metadata.status !== "ACTIVE") continue;

        const blockDir = path.dirname(metaPath);
        const contentFileName = metadata.content_file || "knowledge.md";
        const contentPath = path.join(blockDir, contentFileName);

        let content = "";
        if (fs.existsSync(contentPath)) {
          content = fs.readFileSync(contentPath, "utf-8");
        }

        results.push({
          metadata,
          content,
          filePath: metaPath,
          contentPath,
        });
      } catch {
        // Skip invalid block
      }
    }

    return results;
  }

  async getKnowledgeBlock(id: string): Promise<KnowledgeBlock | null> {

    const cache = await this.getOrBuildCache();
    const item = cache.get(id);
    if (!item) return null;

    const content = await this.loadKnowledgeContent(id);
    if (content === null) return null;

    return {
      metadata: item.metadata,
      content,
      filePath: item.metaPath,
      contentPath: item.contentPath,
    };
  }

  async getKnowledgeMetadata(id: string): Promise<KnowledgeBlockMetadata | null> {
    const cache = await this.getOrBuildCache();
    const item = cache.get(id);
    return item ? item.metadata : null;
  }

  async loadKnowledgeContent(id: string): Promise<string | null> {
    const cache = await this.getOrBuildCache();
    const item = cache.get(id);
    if (!item) return null;

    try {
      this.assertPathSafety(item.contentPath, this.knowledgeDir);
      if (!fs.existsSync(item.contentPath)) {
        return null;
      }
      return fs.readFileSync(item.contentPath, "utf-8");
    } catch {
      return null;
    }
  }

  async findByType(type: KnowledgeType): Promise<KnowledgeBlockMetadata[]> {
    const all = await this.listKnowledgeBlocks();
    return all.filter((b) => b.knowledge_type === type);
  }

  async findByTags(tags: string[]): Promise<KnowledgeBlockMetadata[]> {
    const all = await this.listKnowledgeBlocks();
    const normalizedTags = tags.map((t) => t.toLowerCase());

    return all.filter((block) => {
      const blockTags = [
        ...(block.keywords || []),
        ...(block.semantic_tags || []),
        ...(block.aliases || []),
      ].map((t) => t.toLowerCase());

      return normalizedTags.some((tag) => blockTags.includes(tag));
    });
  }

  async validateRepository(): Promise<ValidationReport> {
    const errors: ValidationError[] = [];
    const passedBlocks: string[] = [];
    const seenIds = new Map<string, string>(); // ID -> metaPath

    const metadataFiles = this.findMetadataFiles(this.knowledgeDir);

    const VALID_TYPES: KnowledgeType[] = [
      "UNIVERSAL", "MATERIAL", "PROPERTY", "CONTENT", "GEOMETRY",
      "PACKAGING", "INDUSTRY", "PHOTOGRAPHY", "COMPOSITION", "CAMERA",
      "LIGHTING", "TYPOGRAPHY", "COLOR", "BRANDING", "ADVERTISING", "QUALITY"
    ];

    const VALID_STATUSES = ["DRAFT", "ACTIVE", "DEPRECATED"];

    const loadedBlocks = new Map<string, KnowledgeBlockMetadata>();

    // Pass 1: Syntax, duplicate ID, path safety, and schema rules
    for (const metaPath of metadataFiles) {
      let relativeMetaPath = path.relative(IMAGE_ENGINE_CONFIG.DATA_ROOT, metaPath);
      try {
        this.assertPathSafety(metaPath, this.knowledgeDir);
      } catch (err: any) {
        errors.push({
          file: relativeMetaPath,
          code: "PATH_TRAVERSAL",
          message: err.message,
        });
        continue;
      }

      let metadata: KnowledgeBlockMetadata;
      try {
        const raw = fs.readFileSync(metaPath, "utf-8");
        metadata = JSON.parse(raw) as KnowledgeBlockMetadata;
      } catch (err: any) {
        errors.push({
          file: relativeMetaPath,
          code: "INVALID_SCHEMA",
          message: `Malformed JSON: ${err.message}`,
        });
        continue;
      }

      // Check required fields
      if (!metadata.id || !metadata.knowledge_type || !metadata.version) {
        errors.push({
          blockId: metadata.id,
          file: relativeMetaPath,
          code: "INVALID_SCHEMA",
          message: "Missing required fields (id, knowledge_type, version)",
        });
        continue;
      }

      // Duplicate ID check
      if (seenIds.has(metadata.id)) {
        errors.push({
          blockId: metadata.id,
          file: relativeMetaPath,
          code: "DUPLICATE_ID",
          message: `Duplicate ID '${metadata.id}' found in '${relativeMetaPath}' (first defined in '${seenIds.get(metadata.id)}')`,
        });
      } else {
        seenIds.set(metadata.id, relativeMetaPath);
      }
      loadedBlocks.set(metadata.id, metadata);

      // Status check
      if (!VALID_STATUSES.includes(metadata.status)) {
        errors.push({
          blockId: metadata.id,
          file: relativeMetaPath,
          code: "INVALID_STATUS",
          message: `Invalid status '${metadata.status}'`,
        });
      }

      // Knowledge type check
      if (!VALID_TYPES.includes(metadata.knowledge_type)) {
        errors.push({
          blockId: metadata.id,
          file: relativeMetaPath,
          code: "INVALID_TYPE",
          message: `Invalid knowledge_type '${metadata.knowledge_type}'`,
        });
      }

      // Creative recipe violation check (MUST BE FALSE)
      if (metadata.creative_recipe !== false) {
        errors.push({
          blockId: metadata.id,
          file: relativeMetaPath,
          code: "CREATIVE_RECIPE_VIOLATION",
          message: `Rule Violation: creative_recipe must be false for standard knowledge block '${metadata.id}'`,
        });
      }

      // Content file existence check
      const blockDir = path.dirname(metaPath);
      const contentFileName = metadata.content_file || "knowledge.md";
      const contentPath = path.join(/*turbopackIgnore: true*/ blockDir, contentFileName);

      try {
        this.assertPathSafety(contentPath, this.knowledgeDir);
        if (!fs.existsSync(contentPath)) {
          errors.push({
            blockId: metadata.id,
            file: relativeMetaPath,
            code: "MISSING_CONTENT",
            message: `Content file '${contentFileName}' does not exist at '${contentPath}'`,
          });
        }
      } catch (err: any) {
        errors.push({
          blockId: metadata.id,
          file: relativeMetaPath,
          code: "PATH_TRAVERSAL",
          message: `Bad content_file path: ${err.message}`,
        });
      }

      passedBlocks.push(metadata.id);
    }

    // Pass 2: Dependency and Related Block Reference checks
    for (const [id, meta] of loadedBlocks.entries()) {
      if (meta.dependencies && Array.isArray(meta.dependencies)) {
        for (const depId of meta.dependencies) {
          if (!loadedBlocks.has(depId)) {
            errors.push({
              blockId: id,
              code: "MISSING_DEPENDENCY",
              message: `Dependency '${depId}' required by '${id}' does not exist in repository`,
            });
          }
        }
      }

      if (meta.related_blocks && Array.isArray(meta.related_blocks)) {
        for (const relId of meta.related_blocks) {
          if (!loadedBlocks.has(relId)) {
            errors.push({
              blockId: id,
              code: "INVALID_RELATED_BLOCK",
              message: `Related block '${relId}' referenced by '${id}' does not exist in repository`,
            });
          }
        }
      }

      if (meta.covers && Array.isArray(meta.covers)) {
        for (const coveredId of meta.covers) {
          if (!loadedBlocks.has(coveredId)) {
            errors.push({
              blockId: id,
              code: "INVALID_COVERED_BLOCK",
              message: `Covered block '${coveredId}' referenced by '${id}' does not exist in repository`,
            });
          }
        }
      }
    }

    const failedCount = errors.length;
    const isValid = failedCount === 0;

    return {
      isValid,
      totalChecked: metadataFiles.length,
      passedCount: passedBlocks.length - failedCount,
      failedCount,
      errors,
      passedBlocks,
    };
  }

  async buildManifest(): Promise<Manifest> {
    const cache = await this.getOrBuildCache(true);
    const sortedBlocks = Array.from(cache.values()).sort((a, b) =>
      a.metadata.id.localeCompare(b.metadata.id)
    );

    const manifestItems: ManifestItem[] = sortedBlocks.map((item) => {
      const relMeta = path
        .relative(IMAGE_ENGINE_CONFIG.DATA_ROOT, item.metaPath)
        .replace(/\\/g, "/");
      const relContent = path
        .relative(IMAGE_ENGINE_CONFIG.DATA_ROOT, item.contentPath)
        .replace(/\\/g, "/");

      return {
        id: item.metadata.id,
        version: item.metadata.version,
        type: item.metadata.knowledge_type,
        status: item.metadata.status,
        metadataPath: relMeta,
        contentPath: relContent,
      };
    });

    const activeCount = manifestItems.filter((i) => i.status === "ACTIVE").length;
    const draftCount = manifestItems.filter((i) => i.status === "DRAFT").length;
    const deprecatedCount = manifestItems.filter((i) => i.status === "DEPRECATED").length;

    const manifest: Manifest = {
      repository_version: "1.0.0",
      build_timestamp: new Date().toISOString(),
      total_blocks: manifestItems.length,
      active_blocks: activeCount,
      draft_blocks: draftCount,
      deprecated_blocks: deprecatedCount,
      knowledge_blocks: manifestItems,
    };

    // Ensure indexes directory exists
    const indexesDir = path.dirname(this.manifestPath);
    if (!fs.existsSync(indexesDir)) {
      fs.mkdirSync(indexesDir, { recursive: true });
    }

    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    return manifest;
  }
}
