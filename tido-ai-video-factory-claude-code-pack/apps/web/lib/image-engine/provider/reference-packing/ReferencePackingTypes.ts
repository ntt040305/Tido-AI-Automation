import type { ProviderReferenceImage } from "../ImageGenerationProvider";
import type { DroppedReference } from "../reference-capacity";

/**
 * Carrying more product identities than a provider will accept images.
 *
 * ImgStudio takes three images per edit request. A brief with four products has
 * four identities that cannot be invented, and the capacity guard in front of
 * the provider correctly refuses rather than quietly leaving one out. Refusing
 * is the right answer to "which product do we discard"; it is not an answer to
 * "how do four products reach a provider that takes three images".
 *
 * This is that answer: put several products into one image, deterministically,
 * at their original pixels, and keep a map saying which product is in which part
 * of it. The packed image is an envelope. Nothing here decides anything about
 * the picture being made — not which product matters, not how they should be
 * arranged in the render, not what the image means. Those belong to the creative
 * layer and are not reachable from this module.
 *
 * What the packed sheet is NOT
 * ---------------------------
 * It is not a layout, a mock-up, or a suggestion to the renderer about
 * arrangement. A grid in a reference image is an artifact of transport, and the
 * fact that a renderer might read it as composition advice is the known risk of
 * this approach — the reason the identity map exists is so the prompt can
 * eventually say what the grid is. Until it does, this module's own tests can
 * only prove the identities survive the trip, not that the render understands
 * them.
 */

/** Where one product's original pixels ended up inside a packed sheet. */
export interface PackedCell {
  product_id?: string;
  source_reference_id: string;
  /** Zero-based grid position, reading order. */
  row: number;
  column: number;
  /** Pixel rectangle inside the packed image. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The identity map that has to survive alongside the packed image. */
export interface PackedReferenceMap {
  reference_id: string;
  contains_products: string[];
  source_reference_ids: string[];
  grid: { rows: number; columns: number };
  sheet: { width: number; height: number };
  cells: PackedCell[];
}

export type PackingStatus =
  /** At or under the ceiling. Nothing was examined, nothing was built. */
  | "PASS_THROUGH"
  /** Fits once references carrying no identity of their own are shed. No sheet. */
  | "ADAPTED"
  /** A sheet was built so that every distinct product could travel. */
  | "PACKED"
  /**
   * Cannot be made to fit. More distinct products than one sheet can hold
   * legibly, or a ceiling too small to carry a sheet at all.
   */
  | "IMPOSSIBLE";

export interface PackingPlan {
  status: PackingStatus;
  limit: number;
  received: number;
  /** Shed before packing was considered, each with the reason it cost nothing. */
  dropped: DroppedReference[];
  /** References to pack into one sheet, in the order they will be laid out. */
  toPack: ProviderReferenceImage[];
  /** References that travel as their own original file, highest priority first. */
  toKeep: ProviderReferenceImage[];
  /** Every distinct product identity in the payload, carried or not. */
  distinct_products: string[];
  /** Populated when status is IMPOSSIBLE. */
  reason?: string;
}

export interface PackingResult {
  status: PackingStatus;
  /** What to hand the provider. At most `limit` entries. */
  references: ProviderReferenceImage[];
  /** Absent unless a sheet was built. */
  packed?: PackedReferenceMap;
  dropped: DroppedReference[];
  /**
   * Every distinct product the payload started with, and every one that reaches
   * the provider. A difference between these two is the failure this whole
   * module exists to make impossible, so both are reported rather than one.
   */
  products_in: string[];
  products_out: string[];
  reason?: string;
}

export interface PackingOptions {
  /** Provider ceiling. Supplied by the caller; this module never assumes one. */
  limit: number;
  /** Edge length of the square sheet, in pixels. */
  sheetSize?: number;
  /** Most products one sheet may hold before each becomes too small to read. */
  maxCells?: number;
  /**
   * Draw the product id above each cell.
   *
   * On by default because a sheet whose cells are unlabelled cannot be mapped
   * back to identities by anything that only sees the image. The text sits in a
   * band above the product, never over it, and failing to draw it is not a
   * failure of the pack — an unlabelled sheet still carries the pixels, and the
   * map in `PackedReferenceMap` is the authoritative record either way.
   */
  label?: boolean;
}

export const PACKING_DEFAULTS = {
  /** 1024 matches the provider's output resolution tier; 3x3 cells stay legible. */
  sheetSize: 1024,
  maxCells: 9,
  label: true,
} as const;
