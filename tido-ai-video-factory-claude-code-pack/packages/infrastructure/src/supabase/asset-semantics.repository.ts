import { getDb, unavailable, failed } from "./client";
import type {
  DbResult,
  Actor,
  AssetEmbeddingRow,
  AssetFacet,
  AssetSemanticsRepository,
  IndexAssetInput,
  IndexAssetResult,
  SimilarAsset,
  SimilarityQuery,
} from "@tido/shared";
import { ASSET_FACETS } from "@tido/shared";

/**
 * Meaning-based lookup over assets already remembered by their bytes.
 *
 * Phase 3.2.5. Strictly additive: `asset_memory` and its repository are not
 * touched, and nothing here can change what an asset IS. The hash decides
 * identity; this only ranks likeness, and every method returns a score rather
 * than a verdict so the difference stays visible to whoever reads the result.
 *
 * THE ISOLATION THIS FILE IS RESPONSIBLE FOR
 * -------------------------------------------
 * A content hash is global and so is a vector. Two companies photographing the
 * same product land near each other in the space whether or not anyone intended
 * it, so "find me something like this" reaches into every other customer's
 * library unless something stops it. Nothing in the embedding stops it; the
 * `user_id` filter inside `search_asset_embeddings` does, and it is applied in
 * SQL rather than after the fact, because a post-filter on a `limit 10` returns
 * an empty page while the neighbours it dropped were someone else's.
 *
 * WHY THE SEARCH IS A DATABASE FUNCTION
 * --------------------------------------
 * PostgREST cannot express `<=>`. The alternative is fetching every one of a
 * person's vectors and sorting them in Node, which works at ten assets and
 * stops working at ten thousand -- the wrong shape of thing to find out later.
 */

/** Postgres renders a vector as `[0.1,0.2,...]`; this is the inverse. */
function toVectorLiteral(values: number[]): string | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  for (const v of values) {
    // A NaN reaching pgvector is a cast error at best and a meaningless
    // distance at worst. Refused here, where the cause is still visible.
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
  }
  return `[${values.join(",")}]`;
}

async function index(actor: Actor, input: IndexAssetInput): Promise<DbResult<IndexAssetResult>> {
  const db = await getDb();
  if (!db) return unavailable();

  const result: IndexAssetResult = { stored: 0, unchanged: 0, skipped: 0 };
  if (!input?.assetId || !Array.isArray(input.facets) || !input.facets.length) {
    return { ok: true, data: result };
  }

  try {
    // The asset must belong to this person. Checked rather than assumed: the
    // id arrives as a number, and a number from the wrong place would attach
    // one customer's vectors to another customer's asset.
    const owned = await db
      .from("asset_memory")
      .select("id")
      .eq("id", input.assetId)
      .eq("user_id", actor.profile.id)
      .maybeSingle();

    if (owned.error) return failed(owned.error);
    if (!owned.data) {
      result.skipped = input.facets.length;
      return { ok: true, data: result };
    }

    const existing = await db
      .from("asset_embeddings")
      .select("id, facet, source_text, model")
      .eq("asset_id", input.assetId);

    if (existing.error) return failed(existing.error);

    const held = new Map<string, { id: number; source_text: string; model: string }>();
    for (const row of (existing.data || []) as { id: number; facet: string; source_text: string; model: string }[]) {
      held.set(row.facet, { id: row.id, source_text: row.source_text, model: row.model });
    }

    for (const facet of input.facets) {
      if (!ASSET_FACETS.includes(facet?.facet)) {
        result.skipped++;
        continue;
      }
      const sourceText = String(facet.sourceText || "").trim();
      const literal = toVectorLiteral(facet.embedding);
      // No text or no usable vector means nothing is written. An embedding of
      // an empty string would put every unread asset at one point in the
      // space, where they would all be returned as each other's neighbours --
      // a confident wrong answer that looks like the feature working.
      if (!sourceText || !literal || !facet.model) {
        result.skipped++;
        continue;
      }

      const current = held.get(facet.facet);
      if (current && current.source_text === sourceText && current.model === facet.model) {
        // Identical input to the same model. Re-embedding would spend money to
        // produce the vector already sitting in the row.
        result.unchanged++;
        continue;
      }

      const row = {
        asset_id: input.assetId,
        facet: facet.facet,
        embedding: literal,
        source_text: sourceText.slice(0, 4000),
        model: facet.model,
        dims: facet.embedding.length,
      };

      const written = current
        ? await db.from("asset_embeddings").update(row).eq("id", current.id)
        : await db.from("asset_embeddings").insert(row);

      if (written.error) {
        // Two renders of the same asset landing together. The other write won
        // and stored the same vector for the same text, so there is nothing to
        // repair.
        if ((written.error as { code?: string }).code !== "23505") return failed(written.error);
        result.unchanged++;
        continue;
      }
      result.stored++;
    }

    return { ok: true, data: result };
  } catch (e) {
    return failed(e);
  }
}

async function facetsFor(actor: Actor, assetId: number): Promise<DbResult<AssetEmbeddingRow[]>> {
  const db = await getDb();
  if (!db) return unavailable();

  try {
    // Joined to the parent so an id belonging to someone else returns nothing
    // rather than revealing which facets it has.
    const res = await db
      .from("asset_embeddings")
      .select("id, asset_id, facet, source_text, model, dims, created_at, asset_memory!inner(user_id)")
      .eq("asset_id", assetId)
      .eq("asset_memory.user_id", actor.profile.id);

    if (res.error) return failed(res.error);
    const rows = ((res.data || []) as unknown[]).map((r) => {
      const row = r as Record<string, unknown>;
      delete row.asset_memory;
      return row as unknown as AssetEmbeddingRow;
    });
    return { ok: true, data: rows };
  } catch (e) {
    return failed(e);
  }
}

async function similar(actor: Actor, query: SimilarityQuery): Promise<DbResult<SimilarAsset[]>> {
  const db = await getDb();
  if (!db) return unavailable();

  const facet = query?.facet;
  if (!ASSET_FACETS.includes(facet)) return { ok: false, error: `unknown facet: ${String(facet)}` };

  try {
    let literal: string | null = null;
    let model = "";
    let exclude: number | null = null;

    if (Array.isArray(query.embedding) && query.embedding.length) {
      literal = toVectorLiteral(query.embedding);
      model = String(query.model || "");
      if (!model) return { ok: false, error: "a model is required when querying by vector" };
    } else if (query.assetId) {
      // Search by an asset already held: its own stored vector is the query.
      // Its row is then excluded from the results, because an asset is
      // trivially its own nearest neighbour and returning it would push a real
      // neighbour off the end of the page.
      const own = await db
        .from("asset_embeddings")
        .select("embedding, model, asset_memory!inner(user_id)")
        .eq("asset_id", query.assetId)
        .eq("facet", facet)
        .eq("asset_memory.user_id", actor.profile.id)
        .maybeSingle();

      if (own.error) return failed(own.error);
      // No vector for that facet, or not this person's asset. Both mean the
      // same thing to a caller: nothing to search with.
      if (!own.data) return { ok: true, data: [] };

      const stored = own.data as unknown as { embedding: unknown; model: string };
      literal = typeof stored.embedding === "string" ? stored.embedding : toVectorLiteral(stored.embedding as number[]);
      model = stored.model;
      exclude = query.assetId;
    } else {
      return { ok: false, error: "either an assetId or an embedding is required" };
    }

    if (!literal) return { ok: true, data: [] };

    const res = await db.rpc("search_asset_embeddings", {
      p_user: actor.profile.id,
      p_facet: facet,
      p_query: literal,
      p_model: model,
      p_limit: Math.min(Math.max(1, Math.trunc(query.limit ?? 10)), 100),
      p_min: typeof query.minScore === "number" ? query.minScore : -1,
      p_exclude: exclude,
    });

    if (res.error) return failed(res.error);
    return { ok: true, data: (res.data || []) as SimilarAsset[] };
  } catch (e) {
    return failed(e);
  }
}

export const assetSemanticsRepository: AssetSemanticsRepository = {
  index,
  facetsFor,
  similar,
};

export type { AssetFacet };
