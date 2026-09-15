import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import type { ProviderReferenceImage } from "../ImageGenerationProvider";
import type { ReferenceManifest } from "../../types";
import { gridFor, identitiesCarried, planPacking, QualityIndex } from "./ReferencePackingStrategy";
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
async function measure(references: ProviderReferenceImage[]): Promise<QualityIndex> {
  const index: QualityIndex = {};
  await Promise.all(
    references.map(async (ref) => {
      try {
        const meta = await sharp(toBuffer(ref)).metadata();
        index[ref.reference_id] = (meta.width || 0) * (meta.height || 0);
      } catch {
        index[ref.reference_id] = 0;
      }
    })
  );
  return index;
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

    if (dry.status === "IMPOSSIBLE") {
      const result: PackingResult = {
        status: "IMPOSSIBLE",
        references: dry.toKeep,
        dropped: dry.dropped,
        products_in: productsIn,
        products_out: [],
        reason: dry.reason,
      };
      ReferencePackingService.logOutput(result);
      return result;
    }

    // Packing it is. Now the measurement is worth paying for: it decides which
    // references keep a slot of their own at full resolution.
    const quality = await measure(dry.toPack);
    const plan = planPacking({ references, manifest, limit, maxCells, quality });

    const built = await ReferencePackingService.buildSheet({
      references: plan.toPack,
      manifest,
      sheetSize,
      label: wantLabels,
    });

    if (!built) {
      const result: PackingResult = {
        status: "IMPOSSIBLE",
        references: [],
        dropped: plan.dropped,
        products_in: productsIn,
        products_out: [],
        reason: "The identity sheet could not be composed from the supplied references.",
      };
      ReferencePackingService.logOutput(result);
      return result;
    }

    const packedRef: ProviderReferenceImage = {
      reference_id: built.map.reference_id,
      role: "PRODUCT",
      mimeType: "image/png",
      buffer: built.buffer,
      filename: `${built.map.reference_id}.png`,
    };

    const result: PackingResult = {
      status: "PACKED",
      references: [packedRef, ...plan.toKeep],
      packed: built.map,
      dropped: plan.dropped,
      products_in: productsIn,
      products_out: identitiesCarried(plan, manifest),
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
  }): Promise<{ buffer: Buffer; map: PackedReferenceMap } | null> {
    const { references, manifest, sheetSize, label } = args;
    if (!references.length) return null;

    const { rows, columns } = gridFor(references.length);
    const cellW = Math.floor((sheetSize - GUTTER * (columns + 1)) / columns);
    const cellH = Math.floor((sheetSize - GUTTER * (rows + 1)) / rows);
    if (cellW < 32 || cellH < 32) return null;

    const imageH = label ? cellH - LABEL_BAND : cellH;
    if (imageH < 24) return null;

    const layers: OverlayOptions[] = [];
    const cells: PackedCell[] = [];
    const contains: string[] = [];
    const sources: string[] = [];

    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      const row = Math.floor(i / columns);
      const column = i % columns;
      const left = GUTTER + column * (cellW + GUTTER);
      const top = GUTTER + row * (cellH + GUTTER);

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
      cells.push({
        product_id: identity,
        source_reference_id: ref.reference_id,
        row,
        column,
        left,
        top,
        width: cellW,
        height: cellH,
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
      map: {
        reference_id: "PACKED_PRODUCTS_01",
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
