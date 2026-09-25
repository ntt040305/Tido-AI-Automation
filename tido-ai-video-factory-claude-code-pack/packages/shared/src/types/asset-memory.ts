/**
 * What the system knows about an uploaded asset, keyed by its bytes.
 *
 * Mirrors migration 0006. The reasoning payloads are documents rather than
 * columns for the same reason they are in `intelligence.ts`: their shape
 * belongs to the engine's analyzer and changes as it improves, and pinning it
 * here would mean editing this package every time an observed field was added.
 *
 * WHAT IS AND IS NOT A PROPERTY OF AN ASSET
 * ------------------------------------------
 * The line this file has to hold is between what is true about the PHOTOGRAPH
 * and what was true about one RENDER that happened to use it. The observed
 * surface of a ceramic cup is the former. The props a director staged around
 * it, the brief it illustrated, the copy it carried are the latter, and none of
 * them belong in a row keyed by a content hash -- a memory that absorbed them
 * would report one afternoon's staging as a permanent fact about the object.
 */

/** Which analyzer branch looked at this asset. */
export type AssetBranch = "product" | "logo" | "reference";

export const ASSET_BRANCHES: readonly AssetBranch[] = ["product", "logo", "reference"] as const;

/** A document whose shape the engine owns and this layer only stores. */
export type AssetDocument = Record<string, unknown>;

export interface AssetMemoryRow {
  id: number;
  /** Internal profile id, never a Firebase UID. Never null: see 0006. */
  user_id: string;
  /** Full lower-case sha-256 of the bytes as uploaded. The identity. */
  content_hash: string;
  /**
   * The engine's 16-character hash of the NORMALISED buffer.
   *
   * A hint for recognising the same photograph re-encoded, never an identity:
   * it is a truncation, and a truncation that decided ownership would hand one
   * customer's product analysis to another at the first collision.
   */
  prepared_hash: string | null;
  role: string;
  branch: AssetBranch;
  mime_type: string | null;
  byte_size: number | null;
  /** What a model saw: the observed branch for this asset. */
  observed: AssetDocument;
  /** What AssetDNA read from it. Excludes per-render staging. */
  treatment: AssetDocument | null;
  /** Vision calls this row represents; the gap to `times_seen` is work saved. */
  model_calls: number;
  /**
   * The analyser's own timestamp for the analysis this row holds.
   *
   * What makes `model_calls` truthful. `derived_from_image` is true of a REUSED
   * analysis as well as a fresh one, so counting on it alone recorded cache
   * hits as vision calls; a sighting carrying this same timestamp reused the
   * analysis and cost nothing.
   */
  analyzed_at: string | null;
  times_seen: number;
  first_seen_at: string;
  last_seen_at: string;
}

/** One asset, as the application offers it for remembering. */
export interface RememberAssetInput {
  contentHash: string;
  preparedHash?: string | null;
  role: string;
  branch: AssetBranch;
  mimeType?: string | null;
  byteSize?: number | null;
  observed?: AssetDocument | null;
  treatment?: AssetDocument | null;
  /**
   * True when a model looked at this asset at all, fresh or reused.
   *
   * Not on its own enough to count a vision call -- see `analyzedAt`.
   */
  analyzed: boolean;
  /**
   * `VisualDNA.provenance.analyzed_at`, carried through untouched.
   *
   * The repository counts a call only when this differs from what it already
   * stored. Undefined is treated as a reuse, which is the conservative
   * direction: over-reporting the saving is the error worth avoiding.
   */
  analyzedAt?: string | null;
}

export interface RememberAssetsResult {
  /** Assets seen for the first time. */
  created: number;
  /** Assets already known, whose row was merged and counters advanced. */
  updated: number;
  /** Offered but not written, because they carried nothing worth keeping. */
  skipped: number;
}

/**
 * The rules for how one asset's record changes, as pure functions.
 *
 * These live in the contract rather than in the Supabase implementation
 * because they are not storage details -- they decide what the system is
 * allowed to forget, which is a domain question. Keeping them here means the
 * application, the repository and the tests all read the same rule instead of
 * three descriptions of it.
 */

/** Lower-case sha-256, as migration 0006 constrains it. */
const FULL_SHA256 = /^[0-9a-f]{64}$/;

const isDocument = (v: unknown): v is AssetDocument =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * The hash as a key, or null when it is not one.
 *
 * Null rather than a throw for a malformed value: a caller asking about a hash
 * nobody could have uploaded deserves the same answer as one asking about an
 * asset nobody uploaded -- nothing is known. The truncation check is the point,
 * because the engine's own 16-character hash is the value most likely to be
 * reached for by mistake, and it is the one that must never become a key.
 */
export function normalizeContentHash(hash: unknown): string | null {
  const h = typeof hash === "string" ? hash.trim().toLowerCase() : "";
  return FULL_SHA256.test(h) ? h : null;
}

/** True when a document carries anything at all worth storing. */
export function hasAssetContent(v: unknown): boolean {
  if (!isDocument(v)) return false;
  return Object.values(v).some((x) => {
    if (x === null || x === undefined) return false;
    if (Array.isArray(x)) return x.length > 0;
    if (typeof x === "object") return Object.keys(x as object).length > 0;
    if (typeof x === "string") return x.trim().length > 0;
    return true;
  });
}

/**
 * Merges an incoming reading over a stored one, key by key.
 *
 * The incoming value wins only where it actually has something to say. This is
 * the anti-degradation rule, and it exists because vision calls are not
 * deterministic: the same photograph analysed twice can come back missing a
 * field. "The model did not mention it this time" and "the object does not
 * have one" are different statements, and a row that replaced rather than
 * merged would record the second whenever the first happened.
 */
export function mergeAssetDocument(stored: unknown, incoming: unknown): AssetDocument {
  const base: AssetDocument = isDocument(stored) ? { ...stored } : {};
  if (!isDocument(incoming)) return base;

  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length) base[key] = value;
      continue;
    }
    if (typeof value === "string") {
      if (value.trim()) base[key] = value;
      continue;
    }
    if (typeof value === "object") {
      // Recurse, so a nested branch is merged rather than swapped wholesale.
      // `treatment.product.material` surviving a render that only re-read the
      // logo is the case this exists for.
      const merged = mergeAssetDocument(base[key], value);
      if (Object.keys(merged).length) base[key] = merged;
      continue;
    }
    base[key] = value;
  }
  return base;
}

/**
 * Whether two analysis timestamps name the same analysis.
 *
 * Compared as instants, never as strings. Postgres renders a timestamptz as
 * `2026-09-24T01:33:00.808+00:00` and JavaScript renders the same instant as
 * `2026-09-24T01:33:00.808Z` -- so `===` reports every reused analysis as a new
 * one, and `model_calls` counts a vision call that never happened. That is not
 * hypothetical: it is what the first live run of this table actually recorded,
 * two calls for two sightings of one cached analysis, and it was invisible
 * because the number it corrupts is the number nobody else can check.
 *
 * An absent timestamp on either side is NOT a match. The caller treats a
 * non-match conservatively -- see `RememberAssetInput.analyzedAt` -- so an
 * unknown counts as a reuse rather than as a call.
 */
export function isSameAnalysis(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return left === right;
}
