import { getDb, unavailable, failed } from "./client";
import type {
  DbResult,
  Actor,
  AssetDocument,
  AssetMemoryRepository,
  AssetMemoryRow,
  RememberAssetInput,
  RememberAssetsResult,
} from "@tido/shared";
import {
  ASSET_BRANCHES,
  hasAssetContent,
  isSameAnalysis,
  mergeAssetDocument,
  normalizeContentHash,
} from "@tido/shared";

const isDocument = (v: unknown): v is AssetDocument =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * Where a person's uploaded assets are remembered.
 *
 * Phase 3.2. Before this, what a vision model saw in a customer's product
 * photograph was written to `creative_blueprints.asset_dna` -- one column, keyed
 * per RUN. That records the reading and discards the fact that it is the same
 * photograph next time, so the same object is re-analysed on every render for
 * as long as the account exists.
 *
 * THE ONE RULE THIS FILE ENFORCES
 * --------------------------------
 * A row may improve and must never degrade. Vision calls are not deterministic:
 * the same photograph analysed twice can come back with fewer observed fields,
 * a dropped branch, or nothing at all. An upsert that replaced the row would
 * turn that flakiness into permanent data loss, and nothing downstream could
 * tell a thin reading from a thin object.
 *
 * So `remember` merges field by field, keeps whichever side actually has a
 * value, and never lets a present field be replaced by an absent one. The cost
 * is a read before the write; the alternative is a memory that gets worse the
 * longer it runs.
 *
 * WHERE THE MERGE RULE ACTUALLY LIVES
 * ------------------------------------
 * In `@tido/shared`, not here. It decides what the system is allowed to
 * forget, which is a domain question rather than a Supabase one -- and keeping
 * it in one place means the repository, the application and the tests cannot
 * end up reading three different descriptions of the same rule.
 *
 * WHAT IT DOES NOT DECIDE
 * ------------------------
 * Nothing here looks at an image or interprets one. The observation comes from
 * `VisualDNAAnalyzer` and the reading from `AssetDNA`, both of which already
 * exist and neither of which this phase touched. This module stores their
 * output and hands it back.
 */

async function remember(
  actor: Actor,
  assets: RememberAssetInput[],
): Promise<DbResult<RememberAssetsResult>> {
  const db = await getDb();
  if (!db) return unavailable();

  const result: RememberAssetsResult = { created: 0, updated: 0, skipped: 0 };
  if (!Array.isArray(assets) || assets.length === 0) return { ok: true, data: result };

  const userId = actor.profile.id;

  // Only assets with a real hash, a known branch, and something to remember.
  // A row carrying neither an observation nor a reading is a claim that the
  // asset was analysed and found to be nothing, which is different from not
  // having been analysed -- and the second is what actually happened.
  const usable = assets.filter((a) => {
    const hash = normalizeContentHash(a?.contentHash);
    if (!hash) return false;
    if (!ASSET_BRANCHES.includes(a.branch)) return false;
    return hasAssetContent(a.observed) || hasAssetContent(a.treatment);
  });
  result.skipped = assets.length - usable.length;
  if (!usable.length) return { ok: true, data: result };

  try {
    const hashes = usable.map((a) => normalizeContentHash(a.contentHash)!);
    const existing = await db
      .from("asset_memory")
      .select("*")
      .eq("user_id", userId)
      .in("content_hash", hashes);

    if (existing.error) return failed(existing.error);

    const known = new Map<string, AssetMemoryRow>();
    for (const row of (existing.data || []) as AssetMemoryRow[]) known.set(row.content_hash, row);

    const now = new Date().toISOString();
    const fresh: Record<string, unknown>[] = [];

    for (const asset of usable) {
      const hash = normalizeContentHash(asset.contentHash)!;
      const current = known.get(hash);

      if (!current) {
        fresh.push({
          user_id: userId,
          content_hash: hash,
          prepared_hash: asset.preparedHash ?? null,
          role: String(asset.role || "").slice(0, 64) || "UNKNOWN",
          branch: asset.branch,
          mime_type: asset.mimeType ?? null,
          byte_size: asset.byteSize ?? null,
          observed: isDocument(asset.observed) ? asset.observed : {},
          treatment: isDocument(asset.treatment) ? asset.treatment : null,
          model_calls: asset.analyzed ? 1 : 0,
          analyzed_at: asset.analyzedAt ?? null,
          times_seen: 1,
          first_seen_at: now,
          last_seen_at: now,
        });
        continue;
      }

      const observed = mergeAssetDocument(current.observed, asset.observed);
      const treatment = hasAssetContent(asset.treatment)
        ? mergeAssetDocument(current.treatment, asset.treatment)
        : current.treatment;

      // A fresh analysis, or the same one handed back by the analyzer's cache?
      // `derived_from_image` cannot tell them apart -- it is true of both -- so
      // the analyser's own timestamp does. An unknown timestamp counts as a
      // reuse, which under-reports the saving rather than inflating it.
      const freshAnalysis =
        asset.analyzed &&
        Boolean(asset.analyzedAt) &&
        !isSameAnalysis(asset.analyzedAt, current.analyzed_at);

      const updated = await db
        .from("asset_memory")
        .update({
          observed,
          treatment,
          // Only ever gained. A render where the analyzer did not run still
          // counts as a sighting, which is what makes the gap between these two
          // numbers the work the memory saved.
          times_seen: current.times_seen + 1,
          model_calls: current.model_calls + (freshAnalysis ? 1 : 0),
          analyzed_at: freshAnalysis ? asset.analyzedAt : current.analyzed_at,
          last_seen_at: now,
          prepared_hash: asset.preparedHash ?? current.prepared_hash,
          mime_type: asset.mimeType ?? current.mime_type,
          byte_size: asset.byteSize ?? current.byte_size,
        })
        .eq("id", current.id);

      if (updated.error) return failed(updated.error);
      result.updated++;
    }

    if (fresh.length) {
      const created = await db.from("asset_memory").insert(fresh);
      if (created.error) {
        // Two renders for the same person landing at once. The other write won
        // and its row is the same row, so nothing is lost and nothing needs
        // repairing -- the only casualty is one increment of `times_seen`,
        // which is a counter rather than evidence.
        if ((created.error as { code?: string }).code !== "23505") return failed(created.error);
      } else {
        result.created = fresh.length;
      }
    }

    return { ok: true, data: result };
  } catch (e) {
    return failed(e);
  }
}

async function get(actor: Actor, contentHash: string): Promise<DbResult<AssetMemoryRow | null>> {
  const db = await getDb();
  if (!db) return unavailable();

  const hash = normalizeContentHash(contentHash);
  // Not an error. A caller asking about a truncated or malformed hash gets the
  // same answer as one asking about an asset nobody uploaded, which is the
  // honest answer in both cases: nothing is known.
  if (!hash) return { ok: true, data: null };

  try {
    const res = await db
      .from("asset_memory")
      .select("*")
      .eq("user_id", actor.profile.id)
      .eq("content_hash", hash)
      .maybeSingle();

    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data as AssetMemoryRow) ?? null };
  } catch (e) {
    return failed(e);
  }
}

async function getMany(actor: Actor, contentHashes: string[]): Promise<DbResult<AssetMemoryRow[]>> {
  const db = await getDb();
  if (!db) return unavailable();

  const hashes = (contentHashes || []).map(normalizeContentHash).filter(Boolean) as string[];
  if (!hashes.length) return { ok: true, data: [] };

  try {
    const res = await db
      .from("asset_memory")
      .select("*")
      .eq("user_id", actor.profile.id)
      .in("content_hash", hashes.slice(0, 50));

    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data || []) as AssetMemoryRow[] };
  } catch (e) {
    return failed(e);
  }
}

async function recent(actor: Actor, limit = 50): Promise<DbResult<AssetMemoryRow[]>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    const res = await db
      .from("asset_memory")
      .select("*")
      .eq("user_id", actor.profile.id)
      .order("last_seen_at", { ascending: false })
      .limit(Math.min(Math.max(1, Math.trunc(limit)), 200));

    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data || []) as AssetMemoryRow[] };
  } catch (e) {
    return failed(e);
  }
}

export const assetMemoryRepository: AssetMemoryRepository = {
  remember,
  get,
  getMany,
  recent,
};
