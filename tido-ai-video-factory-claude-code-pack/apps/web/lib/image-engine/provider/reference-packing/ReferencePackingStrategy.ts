import type { ProviderReferenceImage } from "../ImageGenerationProvider";
import type { ReferenceManifest } from "../../types";
import { planReferenceCapacity } from "../reference-capacity";
import { PACKING_DEFAULTS, PackingPlan } from "./ReferencePackingTypes";

/**
 * What to pack, what to keep whole, and what never needed to travel.
 *
 * Pure and synchronous. No sharp, no buffers read, no I/O — the plan is decided
 * from roles, identities and a table of sizes the caller measured, so the whole
 * decision tree can be tested without composing a single pixel.
 *
 * The shedding ladder is not reimplemented here. `planReferenceCapacity` already
 * owns the question of what can be removed for free and is already tested on it;
 * packing starts where that answer runs out. Two modules deciding separately
 * what a logo is worth is how they drift apart.
 */

/** Size of each reference, for ranking. Area in pixels where known, else bytes. */
export type QualityIndex = Record<string, number>;

function bytesOf(ref: ProviderReferenceImage): number {
  const b: any = ref.buffer;
  if (!b) return 0;
  if (Buffer.isBuffer(b)) return b.length;
  if (Array.isArray(b.data)) return b.data.length;
  return typeof b.length === "number" ? b.length : 0;
}

function identityOf(ref: ProviderReferenceImage, manifest?: ReferenceManifest): string | undefined {
  if (ref.product_id) return ref.product_id;
  return manifest?.product_identity_locks?.find((l) => l?.reference_ids?.includes(ref.reference_id))
    ?.product_id;
}

/**
 * Ranks which references deserve a slot of their own.
 *
 * "Most important" is settled by pixels, not by meaning. A creative judgement
 * about which product leads the image belongs to the director and is already
 * made elsewhere; repeating it here from filenames would be a second, worse
 * opinion competing with a real one. Resolution is a transport fact: the
 * reference with the most detail loses the most by being scaled into a cell, so
 * it is the one worth sending whole.
 *
 * Ties break on input order, so the same brief always packs the same way.
 */
export function rankForFullResolution(
  references: ProviderReferenceImage[],
  quality?: QualityIndex
): ProviderReferenceImage[] {
  return references
    .map((ref, index) => ({
      ref,
      index,
      score: quality?.[ref.reference_id] ?? bytesOf(ref),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.ref);
}

export function planPacking(args: {
  references: ProviderReferenceImage[];
  manifest?: ReferenceManifest;
  limit: number;
  maxCells?: number;
  quality?: QualityIndex;
}): PackingPlan {
  const references = args.references || [];
  const limit = Math.max(0, Math.floor(args.limit));
  const maxCells = args.maxCells ?? PACKING_DEFAULTS.maxCells;

  const capacity = planReferenceCapacity({
    references,
    manifest: args.manifest,
    limit,
  });

  const base = {
    limit,
    received: references.length,
    distinct_products: capacity.distinct_products,
  };

  if (capacity.status === "WITHIN_LIMIT") {
    return { ...base, status: "PASS_THROUGH", dropped: [], toPack: [], toKeep: references };
  }

  if (capacity.status === "ADAPTED") {
    // Shedding alone was enough. Building a sheet here would scale down
    // references the provider was willing to take at full size.
    return { ...base, status: "ADAPTED", dropped: capacity.dropped, toPack: [], toKeep: capacity.send };
  }

  // Over capacity: everything left is the only copy of something.
  const survivors = capacity.send;

  if (limit < 1) {
    return {
      ...base,
      status: "IMPOSSIBLE",
      dropped: capacity.dropped,
      toPack: [],
      toKeep: [],
      reason: "The provider accepts no reference images at all.",
    };
  }

  if (survivors.length > maxCells) {
    // Past this the cells are too small for a product to be identifiable, and a
    // sheet nobody can read is a silent loss wearing the costume of a solution.
    return {
      ...base,
      status: "IMPOSSIBLE",
      dropped: capacity.dropped,
      toPack: [],
      toKeep: [],
      reason:
        `${survivors.length} distinct references exceed the ${maxCells} a single sheet can hold legibly.`,
    };
  }

  // The sheet carries every survivor, including the ones that also travel whole.
  // The redundancy is deliberate: one artifact containing all of them is what
  // makes "no product disappeared" checkable against a single object rather than
  // inferred from the arithmetic of two lists.
  const toKeep = limit > 1 ? rankForFullResolution(survivors, args.quality).slice(0, limit - 1) : [];

  return {
    ...base,
    status: "PACKED",
    dropped: capacity.dropped,
    toPack: survivors,
    toKeep,
  };
}

/** Grid shape for n cells: as square as possible, filled in reading order. */
export function gridFor(n: number): { rows: number; columns: number } {
  if (n <= 0) return { rows: 0, columns: 0 };
  const columns = Math.ceil(Math.sqrt(n));
  return { rows: Math.ceil(n / columns), columns };
}

/** The identities a plan will deliver, for comparison against the ones it received. */
export function identitiesCarried(
  plan: PackingPlan,
  manifest?: ReferenceManifest
): string[] {
  const out: string[] = [];
  for (const ref of [...plan.toPack, ...plan.toKeep]) {
    const id = identityOf(ref, manifest);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
