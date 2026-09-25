/**
 * The rows that hold what the AI thought.
 *
 * Mirrors migration 0003. The reasoning payloads are typed as `unknown`-ish
 * documents on purpose: their shape belongs to the engine, changes as the
 * creative layer improves, and pinning it here would mean this package had to
 * be edited every time a blueprint field was added. What is typed strictly is
 * what the database actually constrains -- the columns.
 */

/** A document whose shape the engine owns and this layer only stores. */
export type IntelligenceDocument = Record<string, unknown>;

export interface CreativeRequest {
  id: string;
  /** Null for an anonymous render. Ownership is optional throughout. */
  org_id: string | null;
  project_id: string | null;
  user_id: string | null;
  brief: string | null;
  asset_type: string | null;
  aspect_ratio: string | null;
  /** Uploaded products, logos, references — by storage key and role, not bytes. */
  assets: IntelligenceDocument[];
  /** Objective, audience, campaign context, copy the image must carry. */
  goals: IntelligenceDocument;
  created_at: string;
}

export interface CreativeIntelligenceRow {
  run_id: string;
  /** Lifted out of the document because it is the unit of "what do kept renders share". */
  selected_direction: string | null;
  strategy: IntelligenceDocument | null;
  intelligence: IntelligenceDocument | null;
  /** The compiled prompt. Without it no render is reproducible. */
  prompt: string | null;
  created_at: string;
}

export interface CreativeBlueprintRow {
  run_id: string;
  blueprint: IntelligenceDocument | null;
  typography: IntelligenceDocument | null;
  layout: IntelligenceDocument | null;
  composition: IntelligenceDocument | null;
  asset_dna: IntelligenceDocument | null;
  /** Phase 5.1 (0013). Null for renders made before it, or without the execution layer. */
  design_document?: IntelligenceDocument | null;
  grounded_score: number | null;
  missing_count: number | null;
  created_at: string;
}

export interface DesignDecisionRow {
  id: number;
  run_id: string;
  kind: "typography" | "layout";
  target: string | null;
  action: string;
  problem: string | null;
  decision: string | null;
  reason: string | null;
  value_from: string | null;
  value_to: string | null;
  confidence: "high" | "medium" | "low" | null;
  /** False when confidence was too low to act. Declined decisions are kept. */
  applied: boolean;
  created_at: string;
}

export interface RenderIterationRow {
  id: number;
  run_id: string;
  version: number;
  image_path: string | null;
  prompt: string | null;
  /** The correction sent to the renderer. Null on V1, which corrected nothing. */
  instruction: string | null;
  problem_count: number | null;
  /** True for the version actually served. */
  selected: boolean;
  created_at: string;
}

export interface VisionReviewRow {
  id: number;
  run_id: string;
  version: number;
  /**
   * True only when a model actually received the rendered bytes.
   *
   * A column rather than a key inside `findings`, because every consumer will
   * read it as "this was seen" and burying it would invite assuming it.
   */
  analyzed_image: boolean;
  provider: string | null;
  image_hash: string | null;
  findings: IntelligenceDocument;
  problem_count: number;
  unavailable_reason: string | null;
  created_at: string;
}

/**
 * Everything one render produced, handed over in a single call.
 *
 * The route assembles this once and the repository writes it. A per-table API
 * would make partial persistence the default failure mode: six awaits, any of
 * which can fail, leaving a run with intelligence but no blueprint and no way
 * to tell whether that is a gap or a fact about the render.
 */
export interface PersistIntelligenceInput {
  runId: string;
  requestId?: string | null;

  selectedDirection?: string | null;
  strategy?: IntelligenceDocument | null;
  intelligence?: IntelligenceDocument | null;
  prompt?: string | null;

  blueprint?: IntelligenceDocument | null;
  typography?: IntelligenceDocument | null;
  layout?: IntelligenceDocument | null;
  composition?: IntelligenceDocument | null;
  assetDna?: IntelligenceDocument | null;
  /**
   * Phase 5.1. The editable design document the render was made from --
   * canvas, layers, positions, styling, the client's exact text. Stored on
   * the blueprint row (0013), so it shares the run's ownership and lifetime.
   */
  designDocument?: IntelligenceDocument | null;
  groundedScore?: number | null;
  missingCount?: number | null;

  decisions?: Array<Omit<DesignDecisionRow, "id" | "run_id" | "created_at">>;
  iterations?: Array<Omit<RenderIterationRow, "id" | "run_id" | "created_at">>;
  reviews?: Array<Omit<VisionReviewRow, "id" | "run_id" | "created_at">>;
}

/** Counts of what was written. Never the reasoning, which is customer content. */
export interface PersistIntelligenceResult {
  intelligence: boolean;
  blueprint: boolean;
  decisions: number;
  iterations: number;
  reviews: number;
}
