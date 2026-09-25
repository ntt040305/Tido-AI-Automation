import crypto from "crypto";
import { getInfrastructure } from "@tido/infrastructure";
import type { Actor, AssetBranch, RememberAssetInput } from "@tido/shared";
import type { SimpleImageGenerationResultV1, SimpleInputRequestV1 } from "@/lib/image-engine/types";
import { branchForRole } from "@/lib/image-engine/evolution/experiment/VisualDNAAnalyzer";
import { buildAssetDNA } from "@/lib/image-engine/evolution/experiment/AssetDNA";
import { indexAssetSemantics } from "./record-asset-semantics";

/**
 * What the uploaded assets are, remembered by their bytes.
 *
 * WHY THIS LIVES IN apps/web AND NOT IN THE ENGINE
 * -------------------------------------------------
 * Same reason as `record-generation.ts`: the engine has no path to a database
 * and a test walks `lib/image-engine` on every build to keep it that way. So
 * `VisualDNAAnalyzer` looks at the pixels, `AssetDNA` reads its output, and
 * this -- application code, above the boundary -- is what stores the result.
 *
 * NO SECOND VISION SYSTEM
 * -----------------------
 * Nothing here looks at an image. There is no model call, no prompt and no
 * analysis in this file. It hashes buffers the route already holds, reads the
 * observation the analyzer already produced, and calls `buildAssetDNA` -- the
 * existing module, unmodified -- to turn that observation into a reading.
 *
 * WHY buildAssetDNA IS CALLED HERE RATHER THAN READ OFF THE RESULT
 * -----------------------------------------------------------------
 * The pipeline does call it, but only inside `if (productionOn)` -- gated on
 * `design_production_v1`, which is off. Asset memory that only filled while an
 * unrelated feature flag happened to be on would be empty in production and
 * look fine in a test, which is precisely the failure mode the Phase 3 audit
 * found in seven modules.
 *
 * `buildAssetDNA` is pure and total, so calling it from here costs one function
 * call and cannot diverge from what the pipeline computes when the flag is on.
 * Where the pipeline did capture a reading, that one is preferred.
 *
 * WHAT IS DELIBERATELY NOT STORED
 * --------------------------------
 * `supporting` -- the props a director staged around the product. AssetDNA
 * produces it and it is genuinely useful, but it describes a RENDER, not a
 * photograph. Filed under a content hash it would harden one afternoon's
 * staging into a permanent fact about the customer's object.
 */

/**
 * The identity of an uploaded asset.
 *
 * The whole sha-256, not the engine's 16-character truncation. That truncation
 * is correct for an in-process cache whose worst case is a wasted vision call;
 * here the worst case of a collision is one customer's product analysis
 * attached to another customer's render, so the key is the entire digest.
 */
export function contentHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** One attachment as the request carries it. */
interface Attachment {
  role?: string;
  buffer?: Buffer;
  mimeType?: string;
}

/**
 * Only the parts of the analyzer's output this file reads.
 *
 * Narrow on purpose rather than importing `VisualDNA`: the observed branches
 * are the engine's to change, and a storage mapper that named all of them would
 * need editing every time one was added. What is pinned here is the provenance,
 * which is the contract the alignment below actually depends on.
 */
interface ObservationSource {
  observed?: Record<string, unknown>;
  provenance?: {
    derived_from_image?: boolean;
    analyzed_roles?: string[];
    source_hashes?: string[];
    analyzed_at?: string;
  };
}

/** The AssetDNA branches this file files against a hash. */
interface ReadingSource {
  product?: Record<string, unknown> | null;
  logo?: Record<string, unknown> | null;
}

/**
 * Pairs each analyzed asset with the observation that was made of it.
 *
 * `VisualDNA.provenance` carries `analyzed_roles` and `source_hashes` as
 * parallel arrays in selection order, and the analyzer takes at most one image
 * per branch -- so the role at index i names the branch whose observation
 * belongs to the asset at index i. That alignment is the analyzer's own
 * contract rather than an assumption made here, and a test pins it.
 */
export function assetRows(
  request: SimpleInputRequestV1,
  result: SimpleImageGenerationResultV1,
): RememberAssetInput[] {
  const r = result as unknown as Record<string, unknown>;
  const visualDna = (r.visualDna as ObservationSource | undefined) ?? null;
  const analyzed = Boolean(visualDna?.provenance?.derived_from_image);

  const attachments: Attachment[] = [
    ...(((request as unknown as { images?: Attachment[] }).images) || []),
    ...(((request as unknown as { referenceImages?: Attachment[] }).referenceImages) || []),
  ].filter((a) => a?.buffer?.length);

  if (!attachments.length) return [];

  // The reading, from the module that already does this. Preferred from the
  // pipeline when the flag that builds it happened to be on; derived here
  // otherwise, which is the common case.
  //
  // `supportingRoles` is deliberately omitted: see the note at the top.
  const dna =
    (r.assetDna as ReadingSource | undefined) ??
    (analyzed ? (buildAssetDNA({ visualDNA: visualDna as never }) as ReadingSource) : null);

  const roles: string[] = visualDna?.provenance?.analyzed_roles ?? [];
  const hashes: string[] = visualDna?.provenance?.source_hashes ?? [];

  const rows: RememberAssetInput[] = [];
  const seen = new Set<string>();

  for (const attachment of attachments) {
    const buffer = attachment.buffer!;
    // An absent role means PRODUCT. That is the upload route's own convention,
    // stated in its log line as `role: p.role || "PRODUCT (default)"` -- it
    // tags inspiration references explicitly and leaves product images bare.
    //
    // Applied here rather than in the analyzer, because changing what the
    // analyzer selects would change which images a model looks at and
    // therefore what gets rendered. This layer only decides what is filed.
    const role = String(attachment.role || "PRODUCT").toUpperCase();
    const branch = branchForRole(role);
    // A role the analyzer does not look at has no observation to store, and a
    // row with neither observation nor reading is a claim that the asset was
    // examined and found to be nothing.
    if (!branch) continue;

    const hash = contentHash(buffer);
    // The same file attached twice in one request is one asset. Counting it
    // twice would inflate `times_seen` on a single upload, which is the same
    // class of error the duplicate-approval rule fixed in 3.1.
    if (seen.has(hash)) continue;
    seen.add(hash);

    const index = roles.findIndex((role) => branchForRole(role) === branch);
    const observed = analyzed ? (visualDna?.observed?.[branch] ?? null) : null;
    const wasAnalyzed = analyzed && index !== -1;

    // Only the branch that belongs to this asset. `treatment` holding the whole
    // AssetDNA would file the logo's rules under the product's hash.
    const treatment =
      branch === "product" ? dna?.product ?? null : branch === "logo" ? dna?.logo ?? null : null;

    rows.push({
      contentHash: hash,
      // The analyzer hashes AFTER normalising, so this only exists when it ran,
      // and it is what recognises the same photograph re-encoded.
      preparedHash: wasAnalyzed ? hashes[index] ?? null : null,
      role,
      branch: branch as AssetBranch,
      mimeType: attachment.mimeType ?? null,
      byteSize: buffer.length,
      observed: (observed as Record<string, unknown>) ?? null,
      treatment: (treatment as Record<string, unknown>) ?? null,
      analyzed: wasAnalyzed,
      // The analyser's own timestamp, carried through untouched. It is what
      // distinguishes a fresh call from the analyzer handing back a cached
      // analysis, which it does whenever the image hashes still match -- and
      // which `derived_from_image` reports identically.
      analyzedAt: wasAnalyzed ? (visualDna?.provenance?.analyzed_at ?? null) : null,
    });
  }

  return rows;
}

export interface RecordAssetsInput {
  request: SimpleInputRequestV1;
  result: SimpleImageGenerationResultV1;
  /** Resolved once by the caller, which already needed it for the run. */
  actor: Actor | null;
}

/**
 * Remembers this render's assets. Never throws, never awaited for a value.
 *
 * Anonymous renders are not remembered. A memory nobody owns can never be
 * retrieved, and an unowned pool keyed by content hash is something any later
 * account could be pointed at.
 */
export async function recordAssets(input: RecordAssetsInput): Promise<void> {
  try {
    if (!input.actor) return;
    const rows = assetRows(input.request, input.result);
    if (!rows.length) return;

    const saved = await getInfrastructure().assets.remember(input.actor, rows);
    if (!saved.ok) {
      if (!saved.unavailable) console.warn("[ASSET_MEMORY] not recorded:", saved.error);
      return;
    }

    // Counts only. What a customer's product looks like is their business and
    // does not belong in a log line.
    console.log("[ASSET_MEMORY]", {
      offered: rows.length,
      ...saved.data,
      analyzed: rows.filter((a) => a.analyzed).length,
    });

    // Phase 3.2.5. Position in meaning-space, added after identity is on
    // record and unable to disturb it. Its own module and its own try/catch:
    // asset memory is complete without any vector, and a failed embedding must
    // cost a search result rather than a remembered asset. Awaited because the
    // whole chain already runs after the response; it cannot throw.
    await indexAssetSemantics({
      actor: input.actor,
      contentHashes: rows.map((a) => a.contentHash),
    });
  } catch (e) {
    console.warn("[ASSET_MEMORY] not recorded:", e instanceof Error ? e.message : String(e));
  }
}
