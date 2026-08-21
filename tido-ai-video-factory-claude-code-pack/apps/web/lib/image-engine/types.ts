/**
 * Domain Models & Types for TIDO Image Intelligence Infrastructure (Stage 1 & 2)
 */

export type KnowledgeStatus = "DRAFT" | "ACTIVE" | "DEPRECATED";

export type KnowledgeType =
  | "UNIVERSAL"
  | "MATERIAL"
  | "PROPERTY"
  | "CONTENT"
  | "GEOMETRY"
  | "PACKAGING"
  | "INDUSTRY"
  | "PHOTOGRAPHY"
  | "COMPOSITION"
  | "CAMERA"
  | "LIGHTING"
  | "TYPOGRAPHY"
  | "COLOR"
  | "BRANDING"
  | "ADVERTISING"
  | "QUALITY";

export type KnowledgeScope = "GLOBAL" | "GENERIC" | "SPECIALIST";

export type ReviewStatus = "UNREVIEWED" | "REVIEWED" | "VERIFIED" | "APPROVED";

export interface RoutingDimensions {
  categories?: string[];
  industry_domains?: string[];
  materials?: string[];
  contents?: string[];
  properties?: string[];
  geometry_traits?: string[];
  packaging_types?: string[];
  visual_challenges?: string[];
}

export interface MatchRule {
  condition: string;
  weight: number;
}

export interface ValidationMeta {
  review_status: ReviewStatus;
  tested_jobs: string[];
  notes: string;
}

export interface KnowledgeBlockMetadata {
  schema_version: string;
  id: string;
  version: string;
  status: KnowledgeStatus;
  knowledge_type: KnowledgeType;
  title: string;
  summary: string;
  scope: KnowledgeScope;
  keywords: string[];
  aliases: string[];
  semantic_tags: string[];
  routing_dimensions: RoutingDimensions;
  match_rules: MatchRule[];
  related_blocks: string[];
  dependencies: string[];
  covers: string[];
  priority: number;
  information_value: number;
  genericity: number;
  creative_recipe: boolean; // MUST BE FALSE for standard blocks
  content_file: string; // Relative path to knowledge.md
  language: string; // "vi" | "en"
  validation: ValidationMeta;
}

export interface KnowledgeBlock {
  metadata: KnowledgeBlockMetadata;
  content: string; // Content of knowledge.md
  filePath: string; // Absolute path to metadata.json
  contentPath: string; // Absolute path to knowledge.md
}

// ── MANIFEST TYPES ────────────────────────────────────────────────
export interface ManifestItem {
  id: string;
  version: string;
  type: KnowledgeType;
  status: KnowledgeStatus;
  metadataPath: string; // Relative to data root
  contentPath: string;  // Relative to data root
}

export interface Manifest {
  repository_version: string;
  build_timestamp: string;
  total_blocks: number;
  active_blocks: number;
  draft_blocks: number;
  deprecated_blocks: number;
  knowledge_blocks: ManifestItem[];
}

// ── VALIDATION REPORT TYPES ───────────────────────────────────────
export interface ValidationError {
  blockId?: string;
  file?: string;
  code:
    | "DUPLICATE_ID"
    | "INVALID_SCHEMA"
    | "MISSING_METADATA"
    | "MISSING_CONTENT"
    | "PATH_TRAVERSAL"
    | "CREATIVE_RECIPE_VIOLATION"
    | "MISSING_DEPENDENCY"
    | "INVALID_RELATED_BLOCK"
    | "INVALID_COVERED_BLOCK"
    | "INVALID_STATUS"
    | "INVALID_TYPE";
  message: string;
}

export interface MetadataProvenance {
  signal: string;
  matchedBy: "routing_dimensions" | "match_rules" | "keywords" | "aliases" | "semantic_tags";
  matchedValue: string;
  confidence: number;
  contribution: number;
}

export interface ValidationReport {
  isValid: boolean;
  totalChecked: number;
  passedCount: number;
  failedCount: number;
  errors: ValidationError[];
  passedBlocks: string[];
}

// ── ROUTING SCHEMA V1 DOMAIN TYPES ──────────────────────────────
export type RoutingMode =
  | "HIGH_CONFIDENCE"
  | "PARTIAL_CONFIDENCE"
  | "OPEN_WORLD"
  | "INSUFFICIENT_EVIDENCE";

export type EvidenceType =
  | "USER_PROVIDED"
  | "OBSERVED"
  | "STRONG_INFERENCE"
  | "WEAK_INFERENCE";

export type UnknownImportance = "LOW" | "MEDIUM" | "HIGH";
export type QueryImportance = "PRIMARY" | "SUPPORTING";

/**
 * Shape A: Classification Item (for materials, contents, categories, etc.)
 */
export interface ClassificationItem<T = string> {
  value: T;
  confidence: number; // 0.0 to 1.0
  evidence_type: EvidenceType;
  evidence_summary: string;
}

// Backward compatibility alias for existing code
export type EvidenceItem<T = string> = ClassificationItem<T>;

/**
 * Shape B: Visual Challenge (Knowledge Need)
 */
export interface VisualChallenge {
  id: string;
  description: string;
  confidence: number; // 0.0 to 1.0
}

/**
 * Shape C: Unknown Item
 */
export interface RoutingUnknown {
  subject: string;
  reason: string;
  importance: UnknownImportance;
}

/**
 * Shape D: Knowledge Retrieval Query
 */
export interface RetrievalQuery {
  query: string;
  importance: QueryImportance;
  reason: string;
}

/**
 * Shape E: Product Routing Entry
 */
export interface ProductRoutingEntry {
  product_id: string;
  reference_ids: string[];
  reference_relationship_confidence: number; // 0.0 to 1.0
  summary: string;
  categories: ClassificationItem[];
  industry_domains: ClassificationItem[];
  likely_functions: ClassificationItem[];
  materials: ClassificationItem[];
  contents: ClassificationItem[];
  surface_properties: ClassificationItem[];
  geometry_traits: ClassificationItem[];
  packaging_types: ClassificationItem[];
  branding_features: ClassificationItem[];
  visual_challenges: VisualChallenge[];
  unknowns: RoutingUnknown[];
  retrieval_queries: RetrievalQuery[];
}

/**
 * Shape F: Top-Level Routing Result
 */
export interface RoutingResultSchema {
  routing_version: string; // Must be "1.0"
  routing_mode: RoutingMode;
  requires_universal_core: boolean; // Must be true
  products: ProductRoutingEntry[];
  global_retrieval_queries: RetrievalQuery[];
  routing_summary: string;
  structured_input_intent?: StructuredInputIntentV1;
  asset_roles?: ExtractedAssetRoleV1[];
}

// ── STAGE 2 ROUTER SERVICE & API TYPES ───────────────────────────
export interface RouterImageInput {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

export interface RouterInput {
  images: RouterImageInput[];
  brief?: string;
  concept?: string;
  productCount?: number;
  brandName?: string;
  brandInfo?: string;
  copyItems?: string[];
  hardRequirements?: string[];
  useCase?: string;
  aspectRatio?: string;
}

export type RouterErrorCode =
  | "ROUTER_API_ERROR"
  | "ROUTER_TIMEOUT"
  | "ROUTER_INVALID_RESPONSE"
  | "ROUTER_SCHEMA_VALIDATION_FAILED"
  | "ROUTER_CREATIVE_LEAK"
  | "INVALID_IMAGE_INPUT"
  | "MISSING_IMAGE"
  | "MISSING_ROUTER_PROMPT"
  | "MISSING_ROUTING_SCHEMA"
  | "CONFIG_ERROR";

export interface RouterError {
  code: RouterErrorCode;
  message: string;
  details?: any;
}

export interface RouterResult {
  success: boolean;
  routing?: RoutingResultSchema;
  meta?: {
    model: string;
    durationMs: number;
    requestId: string;
    imageCount: number;
  };
  error?: RouterError;
}

// ── STAGE 3 RETRIEVAL ENGINE TYPES ────────────────────────────────
export type RetrievalMode = "HYBRID" | "METADATA_ONLY" | "SEMANTIC_ONLY";

export type SelectionTier = "UNIVERSAL" | "PRIMARY" | "SUPPORTING" | "DEPENDENCY";

export type RejectionReasonCode =
  | "LOW_SCORE"
  | "LOW_CONFIDENCE"
  | "REDUNDANT"
  | "OVER_BUDGET"
  | "NARROW_SPECIALIST_UNSUPPORTED"
  | "COVERED_BY_SELECTED_BLOCK"
  | "INACTIVE"
  | "DEPENDENCY_NOT_REQUIRED";

export interface ScoreBreakdown {
  metadata: number;
  semantic: number;
  signal_confidence: number;
  information_value: number;
  priority: number;
  query_importance: number;
  redundancy_penalty: number;
}

export interface SelectedBlockEntry {
  id: string;
  version: string;
  title: string;
  knowledge_type: KnowledgeType;
  selection_tier: SelectionTier;
  final_score: number;
  scores: ScoreBreakdown;
  matched_signals: string[];
  selection_reasons: string[];
  estimated_tokens: number;
}

export interface RejectedCandidateEntry {
  id: string;
  final_score: number;
  reason_code: RejectionReasonCode;
  reason: string;
}

export interface RetrievalStats {
  repository_blocks: number;
  metadata_candidates: number;
  semantic_candidates: number;
  fused_candidates: number;
  selected_blocks: number;
  estimated_tokens: number;
  duration_ms: number;
}

export interface KnowledgePackageV1 {
  package_version: "1.0";
  routing_version: "1.0";
  retrieval_mode: RetrievalMode;
  requires_universal_core: boolean;
  universal_blocks: SelectedBlockEntry[];
  selected_blocks: SelectedBlockEntry[];
  rejected_candidates: RejectedCandidateEntry[];
  warnings: string[];
  stats: RetrievalStats;
}

export interface RetrievalSignal {
  dimension: string;
  value: string;
  confidence: number;
  evidenceType: EvidenceType;
  effectiveWeight: number;
}

export interface KnowledgeCandidate {
  block: KnowledgeBlock;
  metadataScore: number;
  semanticScore: number;
  signalConfidence: number;
  informationValue: number;
  priority: number;
  queryImportance: number;
  redundancyPenalty: number;
  matchedSignals: string[];
  selectionReasons: string[];
  matchedQueries: string[];
  provenance?: MetadataProvenance[];
  finalScore: number;
}

export interface KnowledgeEmbeddingIndexItem {
  id: string;
  version: string;
  content_hash: string;
  embedding: number[];
}

export interface KnowledgeEmbeddingIndexSchema {
  index_version: string;
  embedding_model: string;
  embedding_dimensions: number;
  generated_at: string;
  blocks: KnowledgeEmbeddingIndexItem[];
}

export type RetrievalErrorCode =
  | "INVALID_ROUTING_INPUT"
  | "KNOWLEDGE_REPOSITORY_INVALID"
  | "KNOWLEDGE_INDEX_ERROR"
  | "KNOWLEDGE_INDEX_STALE"
  | "EMBEDDING_API_ERROR"
  | "EMBEDDING_DIMENSION_MISMATCH"
  | "SEMANTIC_RETRIEVAL_ERROR"
  | "RETRIEVAL_CONFIG_ERROR"
  | "KNOWLEDGE_SELECTION_ERROR";

export interface RetrievalError {
  code: RetrievalErrorCode;
  message: string;
  details?: any;
}

export interface RetrievalResult {
  success: boolean;
  package?: KnowledgePackageV1;
  error?: RetrievalError;
}

// ── STAGE 4B MASTER PROMPT COMPILER TYPES ────────────────────────

export interface CopyItemInput {
  text: string;
  type?: "headline" | "subheadline" | "product_name" | "price" | "cta" | "other";
}

export interface ProductReferenceInput {
  reference_id: string; // e.g. "REF_01"
  product_id?: string;  // e.g. "PRODUCT_01"
  input_index?: number;
  name?: string;
}

export interface MasterPromptCompilerInput {
  productReferences?: (ProductReferenceInput | string)[];
  brief?: string;
  productCount?: number;
  copyItems?: (CopyItemInput | string)[];
  brandName?: string;
  brandInfo?: string;
  hardRequirements?: string[];
  useCase?: string;
  aspectRatio?: string;
  routingResult: RoutingResultSchema;
  knowledgePackage: KnowledgePackageV1;
}

export type CompilerWarningCode =
  | "NO_SPECIALIST_KNOWLEDGE"
  | "NO_EXACT_COPY"
  | "NO_BRAND_CONTEXT"
  | "ROUTER_HAS_HIGH_IMPORTANCE_UNKNOWNS"
  | "PRODUCT_INSTANCE_AMBIGUITY"
  | "PROMPT_TOKEN_BUDGET_HIGH"
  | "OPEN_WORLD_REASONING_ONLY";

export type CompilerErrorCode =
  | "INVALID_COMPILER_INPUT"
  | "ROUTING_VERSION_MISMATCH"
  | "KNOWLEDGE_PACKAGE_MISMATCH"
  | "KNOWLEDGE_BLOCK_NOT_FOUND"
  | "KNOWLEDGE_BLOCK_NOT_ACTIVE"
  | "UNIVERSAL_CORE_MISSING"
  | "TEMPLATE_NOT_FOUND"
  | "TEMPLATE_INVALID"
  | "UNRESOLVED_PLACEHOLDER"
  | "EXACT_COPY_INTEGRITY_FAILED"
  | "PRODUCT_INSTANCE_CONFLICT"
  | "REFERENCE_MAPPING_INVALID"
  | "PROMPT_BUDGET_EXCEEDED"
  | "PROMPT_COMPILATION_FAILED";

export interface CompilerError {
  code: CompilerErrorCode;
  message: string;
  details?: any;
}

export interface CompiledReferenceMapping {
  reference_id: string;
  product_id?: string;
  role?: AssetRoleV1;
  input_index: number;
}

export interface CompiledGenerationPackageV1 {
  package_version: "1.0";
  template: {
    id: string;
    version: string;
    hash: string;
  };
  routing: {
    version: string;
    mode: RoutingMode;
  };
  knowledge: {
    universal_block_ids: string[];
    specialist_block_ids: string[];
    knowledge_versions: Record<string, string>;
  };
  references: CompiledReferenceMapping[];
  output_config: {
    use_case?: string;
    aspect_ratio?: string;
  };
  compiled_prompt: string;
  compiler_warnings: CompilerWarningCode[];
  stats: {
    prompt_characters: number;
    estimated_prompt_tokens: number;
    universal_knowledge_tokens: number;
    specialist_knowledge_tokens: number;
    compile_duration_ms: number;
  };
  provenance?: Record<string, any>;
  input_fingerprint: string;
  compiled_prompt_hash: string;
}

export interface CompilerResult {
  success: boolean;
  package?: CompiledGenerationPackageV1;
  error?: CompilerError;
}

// ── STAGE 5 NANO BANANA 2 GENERATION TYPES ───────────────────────
export type GenerationErrorCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "RENDER_BLOCKED"
  | "MASTER_PROMPT_STALE"
  | "REFERENCE_MAPPING_INVALID"
  | "REFERENCE_MISSING"
  | "REFERENCE_LIMIT_EXCEEDED"
  | "CLOUDFLARE_REFERENCE_LIMIT_EXCEEDED"
  | "INVALID_REFERENCE_IMAGE"
  | "UNSUPPORTED_ASPECT_RATIO"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_REJECTED"
  | "PROVIDER_NO_IMAGE"
  | "PROVIDER_RESPONSE_INVALID"
  | "ASSET_STORAGE_FAILED"
  | "GENERATION_FAILED"
  | "PROVIDER_UPSTREAM_ERROR";

export interface GenerationError {
  code: GenerationErrorCode;
  message: string;
  details?: any;
}

export interface ReferenceImageInput {
  reference_id: string; // e.g. REF_01
  product_id?: string;  // e.g. PRODUCT_01 (optional for non-product references)
  role?: AssetRoleV1;
  input_index: number;
  mimeType: string;
  buffer: Buffer;
  filename?: string;
}

export interface GenerationReferenceV1 {
  reference_id: string;
  input_index: number;
  role: AssetRoleV1;
  product_id?: string;
  mimeType?: string;
  buffer?: Buffer;
  filename?: string;
}

export interface GenerationRequestInput {
  requestId?: string;
  productReferences: ReferenceImageInput[];
  routingResult: RoutingResultSchema;
  knowledgePackage: KnowledgePackageV1;
  masterPromptPackage: CompiledGenerationPackageV1;
  compilerInput?: MasterPromptCompilerInput;
}

export interface GenerationResultV1 {
  generation_version: "1.0";
  generation_id: string;
  status: "SUCCEEDED" | "FAILED";
  provider: {
    name: string;
    model: string;
  };
  asset?: {
    asset_id: string;
    url: string;
    mime_type: string;
  };
  output?: {
    aspect_ratio: string;
    image_size: string;
    resolution?: string;
    quality?: string;
    width?: number;
    height?: number;
  };
  remote_details?: {
    remote_image_id?: string;
    cost_vnd?: number;
    balance_vnd?: number;
    provider_name?: string;
    model?: string;
    url?: string;
  };
  cost_vnd?: number;
  balance_vnd?: number;
  trace: {
    template_id?: string;
    template_version: string;
    template_hash: string;
    compiled_prompt_hash: string;
    input_fingerprint: string;
    knowledge_versions: Record<string, string>;
    reference_hashes: Record<string, string>;
    idempotency_key?: string;
  };
  timing: {
    generation_duration_ms: number;
  };
  warnings: string[];
  error?: GenerationError;
}

// ── STAGE 6.0 GENERATION VERSIONING & TARGETED IMAGE EDIT TYPES ──

export type OperationType = "GENERATE" | "EDIT";

export type EditCategory =
  | "TEXT_EDIT"
  | "PRODUCT_EDIT"
  | "OBJECT_EDIT"
  | "LIGHTING_EDIT"
  | "BACKGROUND_EDIT"
  | "COMPOSITION_EDIT"
  | "OTHER";

export interface ImageVersionMetadata {
  image_id: string;
  project_id: string;
  operation_type: OperationType;
  parent_image_id?: string;
  root_generation_id?: string;
  input_fingerprint?: string;
  edit_fingerprint?: string;
  edit_instruction?: string;
  edit_category?: EditCategory;
  compiled_prompt_hash?: string;
  edit_prompt_hash?: string;
  reference_hashes: Record<string, string>;
  provider: {
    name: string;
    model: string;
  };
  created_at: string;
  cost_vnd?: number;
  balance_vnd?: number;
}

export interface EditPromptCompilerInput {
  parentImageId: string;
  editInstruction: string;
  editCategory?: EditCategory;
  supportingReferences?: (ProductReferenceInput | string)[];
  copyItems?: (CopyItemInput | string)[];
  brandName?: string;
  brandInfo?: string;
  preserveOptions?: {
    preserveComposition?: boolean;
    preserveProductIdentity?: boolean;
    preserveUnrequestedContent?: boolean;
  };
}

export interface CompiledEditPackageV1 {
  package_version: "1.0";
  template: {
    id: string;
    version: string;
    hash: string;
  };
  parent_image_id: string;
  edit_instruction: string;
  edit_category: EditCategory;
  compiled_edit_prompt: string;
  compiled_edit_prompt_hash: string;
  edit_fingerprint: string;
  supporting_references: CompiledReferenceMapping[];
  stats: {
    prompt_characters: number;
    estimated_prompt_tokens: number;
    compile_duration_ms: number;
  };
}

export interface EditCompilerResult {
  success: boolean;
  package?: CompiledEditPackageV1;
  error?: CompilerError;
}

export interface ImageEditRequestInput {
  requestId?: string;
  projectId?: string;
  parentImageId: string;
  parentImageBuffer: Buffer;
  parentMimeType?: string;
  rootGenerationId?: string;
  editInstruction: string;
  editCategory?: EditCategory;
  supportingReferences?: ReferenceImageInput[];
  copyItems?: (CopyItemInput | string)[];
  brandName?: string;
  brandInfo?: string;
  aspectRatio?: string;
  compiledEditPackage?: CompiledEditPackageV1;
  editCompilerInput?: EditPromptCompilerInput;
}

export interface EditResultV1 {
  edit_version: "1.0";
  edit_id: string;
  parent_image_id: string;
  root_generation_id: string;
  status: "SUCCEEDED" | "FAILED";
  provider: {
    name: string;
    model: string;
  };
  asset?: {
    asset_id: string;
    url: string;
    mime_type: string;
  };
  output?: {
    aspect_ratio: string;
    image_size: string;
    resolution?: string;
    quality?: string;
    width?: number;
    height?: number;
  };
  remote_details?: {
    remote_image_id?: string;
    cost_vnd?: number;
    balance_vnd?: number;
    provider_name?: string;
    model?: string;
    url?: string;
  };
  cost_vnd?: number;
  balance_vnd?: number;
  trace: {
    template_id?: string;
    template_version: string;
    template_hash: string;
    edit_prompt_hash: string;
    edit_fingerprint: string;
    supporting_reference_hashes: Record<string, string>;
    idempotency_key?: string;
  };
  timing: {
    edit_duration_ms: number;
  };
  warnings: string[];
  error?: GenerationError;
}

// ── SIMPLE INPUT V1 DOMAIN TYPES ──────────────────────────────────

export const CONCEPT_LENGTH_POLICY = {
  SOFT_GUIDANCE_LIMIT: 600,
  WARNING_THRESHOLD: 800,
  HARD_MAXIMUM_LIMIT: 1000,
} as const;

export interface SimpleInputRequestV1 {
  referenceImages?: ReferenceImageInput[];
  referenceIds?: string[];
  images?: { reference_id?: string; buffer?: Buffer; mimeType?: string; filename?: string }[];
  concept: string;
  useCase: string;
  aspectRatio: string;
  brandName?: string;
  brandInfo?: string;
  copyItems?: (CopyItemInput | string)[];
  hardRequirements?: string[];
  requestId?: string;
  projectId?: string;
}

export type ExtractedCopyRoleV1 =
  | "HEADLINE"
  | "SUBHEADLINE"
  | "PRODUCT_NAME"
  | "PRICE"
  | "CTA"
  | "GENERAL";

export interface ExtractedCopyItemV1 {
  role: ExtractedCopyRoleV1;
  text: string;
  confidence: number;
  evidence?: string;
}

export type AssetRoleV1 =
  | "PRODUCT"
  | "LOGO"
  | "SUPPORT_REFERENCE"
  | "AMBIGUOUS"
  | "UNKNOWN";

export interface ExtractedAssetRoleV1 {
  reference_id: string;
  role: AssetRoleV1;
  confidence: number;
  evidence?: string;
}

export interface StructuredInputIntentV1 {
  core_creative_intent: string;
  global_visual_language: string;
  scene_environment?: string;
  mood_emotion?: string;
  subject_relationships?: string;
  composition_requests?: string;
  camera_requests?: string;
  lighting_requests?: string;
  color_requests?: string;
  material_or_visual_effect_requests?: string;
  typography_requests?: string;
  communication_intent?: string;
  promotion_intent?: string;
  extracted_copy_items: ExtractedCopyItemV1[];
  generated_copy_allowed: boolean;
  brand_mentions: string[];
  explicit_hard_requirements: string[];
  local_attributes: string[];
  creative_freedom_level?: "STRICT" | "BALANCED" | "HIGH";
  asset_roles: ExtractedAssetRoleV1[];
  unknowns?: string[];
}

export interface GenerationIntentBriefV1 {
  formatted_brief_text: string;
  char_count: number;
  word_count: number;
}

export interface SimpleInputValidationResultV1 {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SimpleImageGenerationResultV1 {
  success: boolean;
  generationId: string;
  status:
    | "COMPLETED"
    | "VALIDATION_FAILED"
    | "INTERPRETATION_FAILED"
    | "NO_PRODUCT_REFERENCE"
    | "COMPILATION_FAILED"
    | "EXACT_COPY_FAILED"
    | "PROMPT_BUDGET_EXCEEDED"
    | "REFERENCE_ORDER_MISMATCH"
    | "UNSUPPORTED_ASPECT_RATIO"
    | "GENERATION_FAILED"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_UPSTREAM_ERROR";
  imageUrl?: string;
  imageBuffer?: Buffer;
  useCase: string;
  aspectRatio: string;
  diagnostics?: {
    routerDurationMs: number;
    adapterDurationMs: number;
    retrievalDurationMs: number;
    compilerDurationMs: number;
    providerDurationMs: number;
    totalDurationMs: number;
    promptChars: number;
    referenceCount: number;
    productCount: number;
    logoCount: number;
    supportReferenceCount: number;
    geminiCallCount: number;
    providerCallCount: number;
  };
  error?: {
    code: string;
    message: string;
  };
}





