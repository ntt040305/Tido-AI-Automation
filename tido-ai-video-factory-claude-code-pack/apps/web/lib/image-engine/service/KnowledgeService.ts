import { KnowledgeRepository } from "../repository/KnowledgeRepository";
import { LocalKnowledgeRepository } from "../repository/LocalKnowledgeRepository";
import {
  KnowledgeBlock,
  KnowledgeBlockMetadata,
  KnowledgeType,
  Manifest,
  ValidationReport,
} from "../types";

export class KnowledgeService {
  private repository: KnowledgeRepository;

  constructor(repository?: KnowledgeRepository) {
    this.repository = repository || new LocalKnowledgeRepository();
  }

  async getRepositoryStatus() {
    const validation = await this.repository.validateRepository();
    const manifest = await this.repository.buildManifest();

    return {
      status: validation.isValid ? "ok" : "error",
      manifestVersion: manifest.repository_version,
      totalBlocks: manifest.total_blocks,
      activeBlocks: manifest.active_blocks,
      draftBlocks: manifest.draft_blocks,
      deprecatedBlocks: manifest.deprecated_blocks,
      errors: validation.errors,
      buildTimestamp: manifest.build_timestamp,
    };
  }

  async listBlocks(): Promise<KnowledgeBlockMetadata[]> {
    return this.repository.listKnowledgeBlocks();
  }

  async getBlock(id: string): Promise<KnowledgeBlock | null> {
    return this.repository.getKnowledgeBlock(id);
  }

  async findByType(type: KnowledgeType): Promise<KnowledgeBlockMetadata[]> {
    return this.repository.findByType(type);
  }

  async findByTags(tags: string[]): Promise<KnowledgeBlockMetadata[]> {
    return this.repository.findByTags(tags);
  }

  async validate(): Promise<ValidationReport> {
    return this.repository.validateRepository();
  }

  async buildManifest(): Promise<Manifest> {
    return this.repository.buildManifest();
  }
}

// Export singleton instance for app-wide use
export const defaultKnowledgeService = new KnowledgeService();
