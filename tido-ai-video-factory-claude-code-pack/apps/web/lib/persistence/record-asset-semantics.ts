import { getInfrastructure } from "@tido/infrastructure";
import type { Actor, AssetFacetInput } from "@tido/shared";
import { EmbeddingService } from "@/lib/image-engine/retrieval/EmbeddingService";
import { IMAGE_ENGINE_CONFIG } from "@/lib/image-engine/config";
import { facetTexts, facetTelemetry } from "./asset-semantics";

/**
 * Giving a remembered asset a position in meaning-space.
 *
 * Phase 3.2.5, and deliberately a separate module from `record-assets.ts`:
 * asset memory is complete and correct without any of this, and a failure here
 * must not be able to disturb it. The hash is the identity and it is written
 * first; a vector is an opinion about the same row, added afterwards or not at
 * all.
 *
 * WHY THIS RUNS AUTOMATICALLY AND RETRIEVAL DOES NOT
 * ---------------------------------------------------
 * Indexing is the write side. Leaving it manual would mean the retrieval
 * foundation had nothing to retrieve -- which is precisely the state the Phase
 * 3 audit found seven modules in, and the reason that audit exists. Reading
 * this index back INTO a render is the part that is deferred, and nothing in
 * the generation path calls it.
 *
 * WHAT IT COSTS, AND WHAT BOUNDS IT
 * ----------------------------------
 * One embedding call per facet per NEW asset -- at most three, usually one or
 * two, and zero for an asset already indexed with the same observation. It runs
 * after the picture exists, in the same fire-and-forget step that records the
 * run, so it is off the critical path entirely. `TIDO_ASSET_EMBEDDINGS=off`
 * disables it without touching asset memory.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * Fabricate a vector. If the embedder is unavailable -- no key, an outage, a
 * refused call -- that facet is simply not indexed, and a search that would
 * have matched it returns nothing instead of returning a confident neighbour
 * computed from a placeholder. An empty result is honest; a synthetic vector is
 * a wrong answer wearing the shape of a right one.
 */

/** Off by an env flag, and off when nothing can embed. */
function enabled(): boolean {
  if (String(process.env.TIDO_ASSET_EMBEDDINGS || "").toLowerCase() === "off") return false;
  return Boolean(process.env.GEMINI_API_KEY);
}

export interface IndexAssetsInput {
  actor: Actor | null;
  /** The content hashes written by `recordAssets` on this render. */
  contentHashes: string[];
}

export interface IndexAssetsOutcome {
  considered: number;
  embedded: number;
  stored: number;
  unchanged: number;
  failed: number;
}

/**
 * Indexes this render's assets. Never throws, never awaited for a value.
 *
 * Reads the stored rows back rather than taking the in-flight documents,
 * because the row is what a later search will actually return -- and because
 * `remember` merges, so the row can legitimately hold more than this render
 * observed. Embedding the in-flight version would file a thinner description
 * than the one on record.
 */
export async function indexAssetSemantics(input: IndexAssetsInput): Promise<IndexAssetsOutcome> {
  const outcome: IndexAssetsOutcome = { considered: 0, embedded: 0, stored: 0, unchanged: 0, failed: 0 };
  try {
    if (!input.actor || !input.contentHashes?.length || !enabled()) return outcome;

    const infra = getInfrastructure();
    const rows = await infra.assets.getMany(input.actor, input.contentHashes);
    if (!rows.ok || !rows.data.length) return outcome;

    const model = IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL;

    for (const row of rows.data) {
      const wanted = facetTexts(row.observed, row.treatment);
      if (!wanted.length) continue;
      outcome.considered += wanted.length;

      // What is already held, so an unchanged observation costs nothing. The
      // repository checks this too -- it has to, since two renders can race --
      // but checking here is what avoids paying for the embedding in the first
      // place, which is the expensive half.
      const held = await infra.assetSemantics.facetsFor(input.actor, row.id);
      const known = new Map<string, { source_text: string; model: string }>();
      if (held.ok) for (const h of held.data) known.set(h.facet, { source_text: h.source_text, model: h.model });

      const facets: AssetFacetInput[] = [];
      for (const { facet, sourceText } of wanted) {
        const current = known.get(facet);
        if (current && current.source_text === sourceText && current.model === model) {
          outcome.unchanged++;
          continue;
        }
        try {
          const embedding = await EmbeddingService.embedText(sourceText, false);
          outcome.embedded++;
          facets.push({ facet, sourceText, embedding, model });
        } catch (e) {
          // One facet failing is one facet unindexed, not a lost asset. The
          // others still go in, and the gap closes on a later render.
          outcome.failed++;
          console.warn(
            `[ASSET_SEMANTICS] ${facet} not embedded:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      if (!facets.length) continue;
      const stored = await infra.assetSemantics.index(input.actor, { assetId: row.id, facets });
      if (stored.ok) outcome.stored += stored.data.stored;
      else if (!stored.unavailable) console.warn("[ASSET_SEMANTICS] not stored:", stored.error);
    }

    // Counts and facet names only. The source text describes a customer's
    // product and never belongs in a log line.
    if (outcome.considered) {
      console.log("[ASSET_SEMANTICS]", { assets: rows.data.length, ...outcome, model });
    }
    return outcome;
  } catch (e) {
    console.warn("[ASSET_SEMANTICS] indexing skipped:", e instanceof Error ? e.message : String(e));
    return outcome;
  }
}

export { facetTexts, facetTelemetry };
