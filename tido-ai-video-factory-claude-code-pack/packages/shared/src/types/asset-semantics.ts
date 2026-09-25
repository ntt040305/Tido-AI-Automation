/**
 * Meaning, as opposed to identity.
 *
 * Mirrors migration 0008. The distinction this file exists to keep is the one
 * stated in that migration and worth repeating wherever it might be forgotten:
 *
 *   `content_hash` says two uploads ARE the same asset. It is a fact.
 *   A similarity score says two assets are ALIKE. It is an opinion.
 *
 * Nothing here can change the first. Every type below carries a score, and a
 * score is never promoted to an identity anywhere in this codebase.
 */

/**
 * Which question a vector answers.
 *
 * Built only from fields the analyzer actually observed -- no category table,
 * no industry lookup, no style taxonomy. Two products differ here because
 * their surfaces were seen to differ.
 */
export type AssetFacet = "identity" | "appearance" | "style";

export const ASSET_FACETS: readonly AssetFacet[] = ["identity", "appearance", "style"] as const;

/** What each facet is for, in the words the API uses. */
export const FACET_QUESTION: Readonly<Record<AssetFacet, string>> = {
  identity: "is this the same object",
  appearance: "does this look alike",
  style: "is this treated alike",
} as const;

/** One vector, and the text it was built from. */
export interface AssetEmbeddingRow {
  id: number;
  asset_id: number;
  facet: AssetFacet;
  /** The exact text embedded. Without it a surprising result is unauditable. */
  source_text: string;
  model: string;
  dims: number;
  created_at: string;
}

/** One facet offered for indexing. */
export interface AssetFacetInput {
  facet: AssetFacet;
  /** The text built from the observation. Never invented, never a template. */
  sourceText: string;
  /** The vector. Absent means the embedder was unavailable; nothing is stored. */
  embedding: number[];
  model: string;
}

export interface IndexAssetInput {
  assetId: number;
  facets: AssetFacetInput[];
}

export interface IndexAssetResult {
  stored: number;
  /** Facets already held with identical source text, so not re-embedded. */
  unchanged: number;
  skipped: number;
}

/**
 * One neighbour, with the evidence for why it is one.
 *
 * `score` is cosine similarity in [-1, 1]; higher is nearer. It is reported
 * rather than thresholded inside the repository, because where the line falls
 * is a product decision and burying it in a query would make it unarguable.
 */
export interface SimilarAsset {
  asset_id: number;
  content_hash: string;
  facet: AssetFacet;
  score: number;
  role: string;
  branch: string;
  /** What the neighbour's vector was built from, so a result can be explained. */
  source_text: string;
  times_seen: number;
  last_seen_at: string;
}

export interface SimilarityQuery {
  facet: AssetFacet;
  /** Search by an asset already held. Its own row is never returned. */
  assetId?: number;
  /** Or by a vector built elsewhere, for a query that is not an asset. */
  embedding?: number[];
  /**
   * Required with `embedding`: which model produced it.
   *
   * Vectors from two models occupy unrelated spaces, so a search that mixed
   * them would return an ordering with no meaning and nothing in the result to
   * show it. Searching by `assetId` reads the model off the stored row instead.
   */
  model?: string;
  limit?: number;
  /**
   * Neighbours scoring below this are not returned.
   *
   * Defaults are provisional and measured, not guessed -- see
   * `PROVISIONAL_FACET_FLOOR`. A caller that wants to see everything passes -1
   * and does its own thresholding.
   */
  minScore?: number;
}

/**
 * Provisional score floors, one per facet.
 *
 * WHAT A FLOOR IS FOR, AND WHAT IT IS NOT FOR
 * --------------------------------------------
 * It rejects the unrelated. It does NOT identify the same object.
 *
 * Measured against `gemini-embedding-2` over a corpus where the right answer
 * was known before the model was asked -- one cup photographed twice, a bowl
 * sharing its surface, an unrelated glass bottle:
 *
 *   identity    same 0.971  ·  similar 0.801  ·  unrelated 0.661
 *   appearance                  similar 0.905  ·  unrelated 0.664
 *   style       same 0.888                     ·  unrelated 0.750
 *
 * The floors below sit under the "similar" band and above "unrelated", so a
 * search returns things genuinely related and drops things that are not. They
 * deliberately do NOT sit in the gap between 0.971 and 0.801: that gap is one
 * measurement on one pair, and a threshold tuned to it would be fitted to four
 * items rather than calibrated.
 *
 * So "is this the same product" is answered by RANK -- the nearest neighbour,
 * which was the same cup at 0.971 with clear air beneath it -- and not by a
 * constant. `verify-asset-semantics.ts` asserts the ordering and the separation
 * on every run, and fails if either stops holding.
 *
 * A caller that wants to see everything passes -1 and thresholds its own way.
 */
export const PROVISIONAL_FACET_FLOOR: Readonly<Record<AssetFacet, number>> = {
  identity: 0.75,
  appearance: 0.7,
  style: 0.7,
} as const;

/** Vectors from two different models are not comparable. */
export function comparableModels(a: string, b: string): boolean {
  return Boolean(a) && Boolean(b) && a === b;
}
