import {
  KnowledgeBlock,
  KnowledgeBlockMetadata,
  KnowledgeType,
  Manifest,
  ValidationReport,
} from "../types";

/**
 * Knowledge Repository Abstraction
 * Downstream services (Knowledge Router, Knowledge Retriever, Prompt Compiler)
 * consume this interface. Switching from Local Filesystem to Database / Vector DB
 * requires ZERO rewriting of caller services.
 */
export interface KnowledgeRepository {
  /**
   * List all knowledge block metadata in the repository
   */
  listKnowledgeBlocks(): Promise<KnowledgeBlockMetadata[]>;

  /**
   * Retrieve a full knowledge block (metadata + full markdown content) by ID
   */
  getKnowledgeBlock(id: string): Promise<KnowledgeBlock | null>;

  /**
   * Retrieve all active knowledge blocks with metadata and content
   */
  getActiveBlocks(): KnowledgeBlock[];


  /**
   * Retrieve only metadata for a knowledge block by ID (lightweight)
   */
  getKnowledgeMetadata(id: string): Promise<KnowledgeBlockMetadata | null>;

  /**
   * Load markdown content for a knowledge block by ID on demand
   */
  loadKnowledgeContent(id: string): Promise<string | null>;

  /**
   * Filter knowledge blocks by knowledge_type
   */
  findByType(type: KnowledgeType): Promise<KnowledgeBlockMetadata[]>;

  /**
   * Filter knowledge blocks by semantic_tags or keywords
   */
  findByTags(tags: string[]): Promise<KnowledgeBlockMetadata[]>;

  /**
   * Validate the repository for duplicates, schema violations, missing files, broken references
   */
  validateRepository(): Promise<ValidationReport>;

  /**
   * Build/rebuild canonical manifest.json deterministically
   */
  buildManifest(): Promise<Manifest>;
}
