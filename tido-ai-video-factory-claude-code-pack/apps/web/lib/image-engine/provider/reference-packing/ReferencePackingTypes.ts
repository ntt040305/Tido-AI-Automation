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
  /**
   * The ORIGINAL pixel size, and what the panel actually became.
   *
   * The cell rectangle above is the box; these are the picture inside it. A
   * `contain` fit means a tall photograph in a square cell does not fill the cell,
   * so `width`/`height` overstate how many pixels of product survived. Recorded so
   * the loss can be judged by numbers instead of by looking at the sheet.
   */
  original_width?: number;
  original_height?: number;
  rendered_width?: number;
  rendered_height?: number;
  /** rendered longest side / original longest side. 1 means nothing was lost. */
  downscale?: number;
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
  /** Absent unless a sheet was built. The FIRST sheet, for existing readers. */
  packed?: PackedReferenceMap;
  /**
   * Every sheet, when more than one was built.
   *
   * A two-image model carrying eight products needs two sheets, so one map is no
   * longer enough to say what is where. `packed` stays as the first of them so
   * nothing that reads it breaks.
   */
  packed_sheets?: PackedReferenceMap[];
  dropped: DroppedReference[];
  /**
   * Every distinct product the payload started with, and every one that reaches
   * the provider. A difference between these two is the failure this whole
   * module exists to make impossible, so both are reported rather than one.
   */
  products_in: string[];
  products_out: string[];
  reason?: string;
  /**
   * Panels that came out too small to carry identity, and anything else worth
   * telling the director about the packing.
   *
   * Reported, never corrected: making one panel bigger means making another
   * smaller, so the honest thing is to say identity may not survive this sheet
   * rather than to rearrange until the warning disappears. Travels into the
   * decisions tag.
   */
  warnings?: PackingWarning[];
}

export interface PackingWarning {
  code: "PANEL_BELOW_IDENTITY_FLOOR";
  /** Which cell, by the reference it came from. */
  source_reference_id: string;
  product_id?: string;
  longest_side_px: number;
  floor_px: number;
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
  /**
   * Longest side, in pixels, below which a product panel is reported as too small.
   *
   * From the active model's row (`models/image-model-profiles.ts`), because what is
   * legible depends on the sheet size the model accepts. A warning, never a refusal.
   */
  minPanelLongestSidePx?: number;
}

export const PACKING_DEFAULTS = {
  /** 1024 matches the provider's output resolution tier; 3x3 cells stay legible. */
  sheetSize: 1024,
  maxCells: 9,
  label: true,
  /** 1024 / 3 — the smallest cell a 3x3 sheet at the default size produces. */
  minPanelLongestSidePx: 341,
} as const;
