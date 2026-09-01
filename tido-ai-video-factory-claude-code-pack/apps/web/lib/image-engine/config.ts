import path from "path";

/**
 * Centralized Path & System Configuration for TIDO Image Engine (Stage 1, 2 & 3)
 * Safe for cross-platform operations (Windows, Linux, macOS)
 */
export const IMAGE_ENGINE_CONFIG = {
  // Data Root Directory relative to web app base
  DATA_ROOT: path.resolve(process.cwd(), "data"),

  // Subdirectory relative paths
  PROMPTS_DIR: path.resolve(process.cwd(), "data/prompts"),
  SCHEMAS_DIR: path.resolve(process.cwd(), "data/schemas"),
  KNOWLEDGE_DIR: path.resolve(process.cwd(), "data/knowledge"),
  BRANDS_DIR: path.resolve(process.cwd(), "data/brands"),
  CREATIVE_REFS_DIR: path.resolve(process.cwd(), "data/creative_references"),
  INDEXES_DIR: path.resolve(process.cwd(), "data/indexes"),
  EXPERIMENTS_DIR: path.resolve(process.cwd(), "data/experiments"),
  EVALUATIONS_DIR: path.resolve(process.cwd(), "data/evaluations"),

  // Specific canonical file paths
  MASTER_PROMPT_V2_PATH: path.resolve(
    process.cwd(),
    "data/prompts/master_prompt_v2.md"
  ),
  EDIT_PROMPT_V1_PATH: path.resolve(
    process.cwd(),
    "data/prompts/edit_prompt_v1.md"
  ),
  KNOWLEDGE_ROUTER_V1_PATH: path.resolve(
    process.cwd(),
    "data/prompts/knowledge_router_v1.md"
  ),
  ROUTING_SCHEMA_V1_PATH: path.resolve(
    process.cwd(),
    "data/schemas/routing_schema_v1.json"
  ),
  KNOWLEDGE_BLOCK_SCHEMA_V1_PATH: path.resolve(
    process.cwd(),
    "data/schemas/knowledge_block_schema_v1.json"
  ),
  MANIFEST_PATH: path.resolve(
    process.cwd(),
    "data/indexes/manifest.json"
  ),
  KNOWLEDGE_INDEX_PATH: path.resolve(
    process.cwd(),
    "data/indexes/knowledge_embeddings_v1.json"
  ),

  // Stage 2 Router API Configuration
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  ROUTER_TIMEOUT_MS: 45000,
  ROUTER_MAX_RETRIES: 2,
  MAX_IMAGE_COUNT: 5,
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/jpg", "image/png", "image/webp"],

  // Stage 3 Smart Retrieval Configuration
  EMBEDDING_MODEL: "gemini-embedding-2",
  EMBEDDING_DIMENSIONS: 768,

  EVIDENCE_WEIGHTS: {
    USER_PROVIDED: 1.0,
    OBSERVED: 1.0,
    STRONG_INFERENCE: 0.8,
    WEAK_INFERENCE: 0.45,
  },

  QUERY_WEIGHTS: {
    PRIMARY: 1.0,
    SUPPORTING: 0.65,
    GLOBAL: 0.75,
  },

  SCORE_WEIGHTS: {
    METADATA: 0.32,
    SEMANTIC: 0.28,
    SIGNAL_CONFIDENCE: 0.16,
    INFORMATION_VALUE: 0.10,
    PRIORITY: 0.08,
    QUERY_IMPORTANCE: 0.06,
  },

  BUDGET_DEFAULTS: {
    MAX_PRIMARY_BLOCKS: 4,
    MAX_SUPPORTING_BLOCKS: 2,
    MAX_SPECIALIST_BLOCKS_TOTAL: 6,
    MAX_SPECIALIST_ESTIMATED_TOKENS: 3500,
  },

  MIN_SELECTION_SCORE: {
    HIGH_CONFIDENCE: 0.50,
    PARTIAL_CONFIDENCE: 0.55,
    OPEN_WORLD: 0.60,
    INSUFFICIENT_EVIDENCE: 0.70,
  },

  SEMANTIC_REDUNDANCY_THRESHOLD: 0.92,

  // Stage 5 Nano Banana 2 Generation Configuration
  TIDO_IMAGE_MODEL: process.env.TIDO_IMAGE_MODEL || "gemini-3.1-flash-image",
  TIDO_IMAGE_OUTPUT_SIZE: process.env.TIDO_IMAGE_OUTPUT_SIZE || "2K",
  TIDO_IMAGE_OUTPUT_MIME: process.env.TIDO_IMAGE_OUTPUT_MIME || "image/png",
  GENERATED_DIR: path.resolve(process.cwd(), "data/generated/image-renders"),
  GENERATION_TIMEOUT_MS: 90000,
  MAX_PRODUCT_REFERENCES: 10,
  SUPPORTED_ASPECT_RATIOS: ["1:1", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"],
  IMGSTUDIO_SUPPORTED_ASPECT_RATIOS: ["1:1", "4:5", "3:4", "4:3", "5:4", "9:16", "16:9"],
};

export function resolveDataPath(relativePath: string): string {
  const resolved = path.resolve(IMAGE_ENGINE_CONFIG.DATA_ROOT, relativePath);
  // Security path traversal check
  if (!resolved.startsWith(IMAGE_ENGINE_CONFIG.DATA_ROOT)) {
    throw new Error(`Security Violation: Path traversal attempt outside data root (${relativePath})`);
  }
  return resolved;
}
