import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import type { ProviderReferenceImage } from "../ImageGenerationProvider";
import type { ReferenceManifest } from "../../types";
import { gridFor, identitiesCarried, planPacking, QualityIndex } from "./ReferencePackingStrategy";
import { allocateReferences, type Allocation, type AllocationInput } from "./reference-allocation";
import type { DroppedReference, DropReason } from "../reference-capacity";
import type { PackingWarning } from "./ReferencePackingTypes";
import {
  PACKING_DEFAULTS,
  PackedCell,
  PackedReferenceMap,
  PackingOptions,
  PackingResult,
} from "./ReferencePackingTypes";

/**
 * Builds the envelope.
 *
 * Deterministic composition only: every product's own pixels are scaled to fit
 * a cell and placed. Nothing is generated, cropped, recoloured, sharpened or
 * re-encoded through anything that could alter what the product looks like.
 * `fit: "contain"` is the whole treatment — it never crops, so a tall bottle and
 * a wide box both arrive complete, letterboxed against a neutral ground rather
 * than trimmed to fill a square.
 *
 * The same four images always produce the same sheet, byte for byte. That is
 * worth more than it sounds: the prompt cache, the idempotency key and the
 * render comparison all assume the same input makes the same request.
 */

const BACKGROUND = { r: 245, g: 245, b: 245, alpha: 1 };
const LABEL_BAND = 34;
const GUTTER = 8;

function toBuffer(ref: ProviderReferenceImage): Buffer {
  const b: any = ref.buffer;
  if (Buffer.isBuffer(b)) return b;
  if (b && Array.isArray(b.data)) return Buffer.from(b.data);
  return Buffer.from(b || []);
}

function identityOf(ref: ProviderReferenceImage, manifest?: ReferenceManifest): string | undefined {
  if (ref.product_id) return ref.product_id;
  return manifest?.product_identity_locks?.find((l) => l?.reference_ids?.includes(ref.reference_id))
    ?.product_id;
}

/**
 * Pixel area per reference, so the ranking has something real to rank on.
 *
 * A reference sharp cannot read scores zero rather than throwing. It will fail
 * later in the upload path with a better message than this function could give,
 * and a metadata read is the wrong place to end a render.
 */
async function measure(references: ProviderReferenceImage[]): Promise<Record<string, { width: number; height: number }>> {
  const index: Record<string, { width: number; height: number }> = {};
  await Promise.all(
    references.map(async (ref) => {
      try {
        const meta = await sharp(toBuffer(ref)).metadata();
        index[ref.reference_id] = { width: meta.width || 0, height: meta.height || 0 };
      } catch {
        index[ref.reference_id] = { width: 0, height: 0 };
      }
    })
  );
  return index;
}

/** Pixel area per reference, for anything that ranks on detail. */
export function areaIndex(sizes: Record<string, { width: number; height: number }>): QualityIndex {
  const out: QualityIndex = {};
  for (const [id, s] of Object.entries(sizes)) out[id] = s.width * s.height;
  return out;
}

/**
 * The label band above a cell.
 *
 * Above the product, never across it. A renderer that decides to reproduce text
 * it sees in a reference is a known hazard — the product rules forbid the model
 * from generating text of its own — so the text is kept spatially separate from
 * the pixels it describes, and a failure to draw it is not a failure of the
 * pack. `PackedReferenceMap` is the authoritative identity record; the band is
 * a convenience for anything that only has the image.
 */
async function labelBand(text: string, width: number): Promise<Buffer | null> {
  const safe = text.replace(/[<>&"']/g, "");
  const svg =
    `<svg width="${width}" height="${LABEL_BAND}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${width}" height="${LABEL_BAND}" fill="#1a1a1a"/>` +
    `<text x="10" y="${Math.round(LABEL_BAND * 0.7)}" font-family="sans-serif" ` +
    `font-size="${Math.round(LABEL_BAND * 0.55)}" fill="#ffffff">${safe}</text></svg>`;
  try {
    return await sharp(Buffer.from(svg)).png().toBuffer();
  } catch {
    return null;
  }
}

/**
 * A provider reference, as the allocator sees it.
 *
 * The allocator is pure and knows nothing about buffers or sharp; it needs a kind,
 * an identity and a size. The identity comes from the manifest, which is the one
 * place that has already decided two uploads are the same object.
 */
function toAllocationInput(
  ref: ProviderReferenceImage,
  manifest: ReferenceManifest | undefined,
  sizes: Record<string, { width: number; height: number }>,
): AllocationInput {
  const role = String(ref.role || "").toUpperCase();
  const kind: AllocationInput["kind"] =
    role === "LOGO" ? "logo" : role === "INSPIRATION_REFERENCE" ? "style" : "product";
  const size = sizes[ref.reference_id];
  return {
    id: ref.reference_id,
    kind,
    productId: identityOf(ref, manifest) ?? null,
    width: size?.width ?? null,
    height: size?.height ?? null,
    filename: ref.filename ?? ref.reference_id,
  };
}

/**
 * The allocator's drops, in the shape the rest of the pipeline already reports.
 *
 * `DroppedReference` carries a `DropReason` enum that other readers switch on, so
 * the allocator's own Vietnamese sentence is mapped onto it rather than bolted
 * alongside it. `DROP_REASON_VI` turns it back into words for the user.
 */
function toDroppedReferences(
  allocation: Allocation,
  references: ProviderReferenceImage[],
  manifest?: ReferenceManifest,
): DroppedReference[] {
  const out: DroppedReference[] = [];
  for (const dropped of allocation.dropped) {
    const ref = references.find((r) => (r.filename || r.reference_id) === dropped.what);
    if (!ref) continue;
    const role = String(ref.role || "").toUpperCase();
    const reason: DropReason =
      role === "INSPIRATION_REFERENCE"
        ? "INSPIRATION_TRAVELS_AS_TEXT"
        : role === "LOGO"
          ? "LOGO_NOT_RENDERED_BY_MODEL"
          : "REDUNDANT_VIEW_OF_SAME_PRODUCT";
    out.push({
      reference_id: ref.reference_id,
      product_id: identityOf(ref, manifest),
      role: ref.role || "PRODUCT",
      reason,
    });
  }
  return out;
}

export class ReferencePackingService {
  /**
   * Decides and, if needed, builds. Returns what the provider should be sent.
   *
   * Never throws on a packing failure: an IMPOSSIBLE result is returned as data
   * so the caller can refuse with its own error shape rather than having an
   * exception cross the provider boundary.
   */
  static async pack(args: {
    references: ProviderReferenceImage[];
    manifest?: ReferenceManifest;
    options: PackingOptions;
  }): Promise<PackingResult> {
    const references = args.references || [];
    const manifest = args.manifest;
    const limit = args.options.limit;
    const sheetSize = args.options.sheetSize ?? PACKING_DEFAULTS.sheetSize;
    const maxCells = args.options.maxCells ?? PACKING_DEFAULTS.maxCells;
    const wantLabels = args.options.label ?? PACKING_DEFAULTS.label;
    // From the active model's row. A panel under this is reported, never corrected.
    const minPanelFloor = args.options.minPanelLongestSidePx ?? PACKING_DEFAULTS.minPanelLongestSidePx;

    // Cheap plan first, so a payload that fits is never measured at all.
    const dry = planPacking({ references, manifest, limit, maxCells });

    console.log("[REFERENCE_PACKING][INPUT]", {
      total_references: references.length,
      product_count: dry.distinct_products.length,
      provider_limit: limit,
    });

    const productsIn = dry.distinct_products;

    if (dry.status === "PASS_THROUGH" || dry.status === "ADAPTED") {
      const result: PackingResult = {
        status: dry.status,
        // The same array object on pass-through, so a brief that always fitted
        // is byte-for-byte the request that was already being sent.
        references: dry.status === "PASS_THROUGH" ? references : dry.toKeep,
        dropped: dry.dropped,
        products_in: productsIn,
        products_out: identitiesCarried(dry, manifest),
      };
      ReferencePackingService.logOutput(result);
      return result;
    }

    // A dry IMPOSSIBLE is deliberately NOT returned here.
    //
    // `planPacking` calls a payload impossible when the survivors exceed what ONE
    // sheet can hold, because one sheet was all this module could ever build. The
    // allocator can use every slot as a sheet, so a payload that plan calls
    // impossible may well fit — five products on a two-image model is the measured
    // case: the plan said impossible while two sheets of four panels carry eight.
    // The allocator below is the thing that decides, and the only thing that says
    // impossible for real.

    // ── Packing it is. ────────────────────────────────────────────────────
    //
    // From here the ALLOCATION decides, not this module.
    //
    // It used to decide for itself, and it could only ever build ONE sheet plus
    // `limit - 1` references kept at full size. That put its real capacity at
    // `maxCells` and made five products impossible on a two-image model — while
    // `allocateReferences` had already worked out that two sheets of four panels
    // carry eight. Two modules disagreeing about what fits is worse than either
    // answer: the plan said yes, the renderer said IMPOSSIBLE, and the user saw the
    // renderer's answer.
    //
    // So `allocateReferences` is the single source of truth now — the transport
    // attaches what it returns, the brief's section C describes what it returns, and
    // the checks count what it returns. This method's job is to DRAW that plan.
    const sizes = await measure(references);
    const allocation = allocateReferences(
      references.map((ref) => toAllocationInput(ref, manifest, sizes)),
      { limit, maxPanelsPerSheet: maxCells, sheetSizePx: sheetSize },
    );

    if (allocation.impossible) {
      const result: PackingResult = {
        status: "IMPOSSIBLE",
        references: [],
        dropped: [...dry.dropped, ...toDroppedReferences(allocation, references, manifest)],
        products_in: productsIn,
        products_out: [],
        reason: allocation.impossible.reason_vi,
      };
      ReferencePackingService.logOutput(result);
      return result;
    }

    const byId = new Map(references.map((r) => [r.reference_id, r]));
    const sent: ProviderReferenceImage[] = [];
    const maps: PackedReferenceMap[] = [];
    const warnings: PackingWarning[] = [];

    for (const slot of allocation.slots) {
      const slotRefs = slot.panels
        .map((p) => byId.get(p.sourceImageId))
        .filter((r): r is ProviderReferenceImage => Boolean(r));

      if (slotRefs.length === 0) continue;

      // One panel means one photograph, and a photograph that does not share a
      // slot has no reason to be redrawn: it travels as its own original file at
      // full resolution. Re-encoding it into a one-cell sheet would cost detail
      // for nothing.
      if (slotRefs.length === 1) {
        sent.push(slotRefs[0]);
        continue;
      }

      const built = await ReferencePackingService.buildSheet({
        references: slotRefs,
        manifest,
        sheetSize,
        label: wantLabels,
        minPanelLongestSidePx: minPanelFloor,
        sheetIndex: slot.index,
      });

      if (!built) {
        const result: PackingResult = {
          status: "IMPOSSIBLE",
          references: [],
          dropped: dry.dropped,
          products_in: productsIn,
          products_out: [],
          reason: "The identity sheet could not be composed from the supplied references.",
        };
        ReferencePackingService.logOutput(result);
        return result;
      }

      sent.push({
        reference_id: built.map.reference_id,
        role: "PRODUCT",
        mimeType: "image/png",
        buffer: built.buffer,
        filename: `${built.map.reference_id}.png`,
      });
      maps.push(built.map);
      warnings.push(...built.warnings);
    }

    // Every product that reaches the provider, whether on a sheet or on its own.
    const productsOut: string[] = [];
    for (const slot of allocation.slots) {
      for (const panel of slot.panels) {
        const id = panel.productId || identityOf(byId.get(panel.sourceImageId) || ({} as ProviderReferenceImage), manifest);
        if (id && !productsOut.includes(id)) productsOut.push(id);
      }
    }

    const result: PackingResult = {
      status: "PACKED",
      references: sent,
      // The first sheet stays on `packed` so every existing reader keeps working;
      // `packed_sheets` carries all of them when more than one was built.
      ...(maps.length ? { packed: maps[0] } : {}),
      ...(maps.length > 1 ? { packed_sheets: maps } : {}),
      dropped: [...dry.dropped, ...toDroppedReferences(allocation, references, manifest)],
      products_in: productsIn,
      products_out: productsOut,
      ...(warnings.length ? { warnings } : {}),
    };
    ReferencePackingService.logOutput(result);
    return result;
  }

  /** Composes the contact sheet and the map that says what is where. */
  private static async buildSheet(args: {
    references: ProviderReferenceImage[];
    manifest?: ReferenceManifest;
    sheetSize: number;
    label: boolean;
    minPanelLongestSidePx: number;
    /** 1-based. Several sheets need distinct reference ids. */
    sheetIndex?: number;
  }): Promise<{ buffer: Buffer; map: PackedReferenceMap; warnings: PackingWarning[] } | null> {
    const { references, manifest, sheetSize, label, minPanelLongestSidePx } = args;
    const sheetIndex = args.sheetIndex ?? 1;
    if (!references.length) return null;

    const { rows, columns } = gridFor(references.length);
    const cellW = Math.floor((sheetSize - GUTTER * (columns + 1)) / columns);
    const cellH = Math.floor((sheetSize - GUTTER * (rows + 1)) / rows);
    if (cellW < 32 || cellH < 32) return null;

    const imageH = label ? cellH - LABEL_BAND : cellH;
    if (imageH < 24) return null;

    const layers: OverlayOptions[] = [];
    const cells: PackedCell[] = [];
    const warnings: PackingWarning[] = [];
    const contains: string[] = [];
    const sources: string[] = [];

    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      const row = Math.floor(i / columns);
      const column = i % columns;
      const left = GUTTER + column * (cellW + GUTTER);
      const top = GUTTER + row * (cellH + GUTTER);

      // The original size, read before the resize, so the downscale is measured
      // rather than assumed from the cell geometry.
      let originalWidth = 0;
      let originalHeight = 0;
      try {
        const meta = await sharp(toBuffer(ref)).metadata();
        originalWidth = meta.width || 0;
        originalHeight = meta.height || 0;
      } catch {
        // Unreadable metadata is not fatal here; the resize below decides.
      }

      let scaled: Buffer;
      try {
        scaled = await sharp(toBuffer(ref))
          // contain, never cover: cropping a reference would remove part of the
          // product, which is exactly the loss this module exists to prevent.
          .resize(cellW, imageH, { fit: "contain", background: BACKGROUND })
          .png()
          .toBuffer();
      } catch {
        // One unreadable reference must not take the whole sheet down, but it
        // also must not vanish — an absent cell is a product going missing, so
        // the pack fails and the caller refuses.
        return null;
      }

      if (label) {
        const band = await labelBand(ref.product_id || ref.reference_id, cellW);
        if (band) layers.push({ input: band, left, top });
      }
      layers.push({ input: scaled, left, top: label ? top + LABEL_BAND : top });

      const identity = identityOf(ref, manifest);
      if (identity && !contains.includes(identity)) contains.push(identity);
      sources.push(ref.reference_id);

      // `contain` fits the picture inside the cell without cropping, so the picture
      // is the cell box scaled by whichever axis binds first.
      const fit = originalWidth > 0 && originalHeight > 0
        ? Math.min(cellW / originalWidth, imageH / originalHeight, 1)
        : 0;
      const renderedWidth = fit > 0 ? Math.round(originalWidth * fit) : cellW;
      const renderedHeight = fit > 0 ? Math.round(originalHeight * fit) : imageH;
      const longestSide = Math.max(renderedWidth, renderedHeight);

      if (longestSide < minPanelLongestSidePx) {
        warnings.push({
          code: "PANEL_BELOW_IDENTITY_FLOOR",
          source_reference_id: ref.reference_id,
          product_id: identity,
          longest_side_px: longestSide,
          floor_px: minPanelLongestSidePx,
        });
      }

      cells.push({
        product_id: identity,
        source_reference_id: ref.reference_id,
        row,
        column,
        left,
        top,
        width: cellW,
        height: cellH,
        original_width: originalWidth || undefined,
        original_height: originalHeight || undefined,
        rendered_width: renderedWidth,
        rendered_height: renderedHeight,
        downscale: originalWidth > 0 && originalHeight > 0
          ? Number((longestSide / Math.max(originalWidth, originalHeight)).toFixed(3))
          : undefined,
      });
    }

    let buffer: Buffer;
    try {
      buffer = await sharp({
        create: { width: sheetSize, height: sheetSize, channels: 3, background: BACKGROUND },
      })
        .composite(layers)
        .png()
        .toBuffer();
    } catch {
      return null;
    }

    return {
      buffer,
      warnings,
      map: {
        reference_id: `PACKED_PRODUCTS_${String(sheetIndex).padStart(2, "0")}`,
        contains_products: contains,
        source_reference_ids: sources,
        grid: { rows, columns },
        sheet: { width: sheetSize, height: sheetSize },
        cells,
      },
    };
  }

  /** Counts, ids and geometry. Never a buffer, never a filename, never bytes. */
  private static logOutput(result: PackingResult): void {
    const lost = result.products_in.filter((p) => !result.products_out.includes(p));
    console.log("[REFERENCE_PACKING][PANELS]", {
      sheet: result.packed ? result.packed.sheet : null,
      grid: result.packed ? result.packed.grid : null,
      panels: (result.packed?.cells || []).map((c) => ({
        ref: c.source_reference_id,
        product: c.product_id || null,
        cell: `${c.width}x${c.height}`,
        rendered: `${c.rendered_width ?? "?"}x${c.rendered_height ?? "?"}`,
        original: `${c.original_width ?? "?"}x${c.original_height ?? "?"}`,
        downscale: c.downscale ?? null,
      })),
      below_identity_floor: (result.warnings || []).length,
    });
    console.log("[REFERENCE_PACKING][OUTPUT]", {
      status: result.status,
      output_references: result.references.length,
      packed_products: result.packed?.contains_products.length ?? 0,
      preserved_products: result.products_out.length,
      grid: result.packed ? `${result.packed.grid.rows}x${result.packed.grid.columns}` : null,
      dropped: result.dropped.map((d) => `${d.reference_id}:${d.role}:${d.reason}`),
      ...(lost.length ? { LOST_PRODUCTS: lost } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    });
  }
}
