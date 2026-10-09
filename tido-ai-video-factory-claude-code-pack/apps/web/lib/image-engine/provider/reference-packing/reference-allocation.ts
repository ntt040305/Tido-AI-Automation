/**
 * What actually gets sent to the image model, and in what shape.
 *
 * THE PROBLEM
 * -----------
 * GPT-Image-2.5-Sunburst accepts **two** images per call and answers a third with
 * HTTP 400 before it renders anything (`03-provider-capabilities.md` §2.2). A user
 * with five product photos and a logo has six. Refusing them is not an option, and
 * neither is quietly dropping four — so the images are PACKED into at most two
 * reference sheets and sent in one call.
 *
 * ONE DECISION, ONE PLACE
 * -----------------------
 * This function is the only thing that decides what travels. The transport asks it
 * what to attach, the brief's section C describes exactly the slots it returned,
 * and the checks count references against the same answer. Three readers, one
 * decision, so the prompt can never describe an arrangement different from the one
 * the provider received — which is the failure this seam exists to make impossible.
 *
 * WHAT IT NEVER DOES
 * ------------------
 * It never silently drops a distinct product. If the inputs cannot be made to fit
 * without losing one, it says `impossible` and the caller raises a typed error that
 * the user sees; it does not pick a product to lose. Extra angles of a product
 * already carried, and the logo's own image, are the only things it will shed, and
 * both are reported in `dropped` with a Vietnamese reason.
 *
 * Pure. No I/O, no sharp, no clock, no randomness. It plans; `ReferencePackingService`
 * draws.
 */

/** Priority order, highest first. Not configurable: it is the product decision. */
export type ReferenceKind = "product" | "logo" | "style";

export interface AllocationInput {
  /** A stable id for the uploaded image, used to trace a panel back to a file. */
  id: string;
  kind: ReferenceKind;
  /**
   * Which product this image shows, where the system knows.
   *
   * Resolved upstream from `product_identity_locks[].reference_ids`
   * (`service/ReferenceIntelligenceService.ts:103-118`). Two images sharing a
   * `productId` are two angles of ONE product; two different ids are two products.
   * Absent means unknown, and unknown is treated as a distinct product — the same
   * conservative policy the router states at
   * `service/KnowledgeRouterService.ts:369-372`: merging requires positive
   * same-identity evidence.
   */
  productId?: string | null;
  /** Pixel size of the original, where known. Only used to report the downscale. */
  width?: number | null;
  height?: number | null;
  /** For logs and the brief's visual descriptor. Never a buffer. */
  filename?: string | null;
}

export interface AllocatedPanel {
  /** "A", "B", … per sheet, or "LOGO". Drawn outside the image area, never over it. */
  label: string;
  role: ReferenceKind;
  sourceImageId: string;
  /** Planned pixel box for this panel inside the sheet. */
  outWidth: number;
  outHeight: number;
  /** Which product this panel shows, where known. */
  productId?: string | null;
}

export interface AllocatedSlot {
  /** 1-based. This is the "Image N" the prompt names. */
  index: number;
  kind: "single" | "sheet";
  panels: AllocatedPanel[];
  width: number;
  height: number;
}

export interface DroppedReference {
  what: string;
  reason_vi: string;
}

export interface Allocation {
  slots: AllocatedSlot[];
  dropped: DroppedReference[];
  /** True when at least one slot carries more than one panel. */
  packed: boolean;
  /**
   * Set when a distinct product would have had to be dropped. The caller raises a
   * typed error; this module does not choose a product to lose.
   */
  impossible?: { reason_vi: string; products: string[] };
}

export interface AllocationOptions {
  /** The provider's hard per-call ceiling. `maxReferences` from the profile. */
  limit: number;
  /** Panels one sheet may carry. `maxPanelsPerSheet` from the profile. */
  maxPanelsPerSheet: number;
  /** Pixel edge of a sheet. `sheetSizePx` from the profile. */
  sheetSizePx: number;
}

/** A distinct product's id, or a per-image stand-in when the system cannot tell. */
function identityKey(input: AllocationInput): string {
  const pid = String(input.productId || "").trim();
  return pid || `__unknown__${input.id}`;
}

/**
 * The allocation.
 *
 * Shape of the answer, in order:
 *   1. everything fits  → one slot each, full size, stable order
 *   2. it does not      → exactly `limit` slots, products spread as evenly as
 *                         possible, distinct products before extra angles, the
 *                         logo as a small labelled strip on the emptiest slot
 *   3. it still cannot  → shed extra angles, then the logo image; a distinct
 *                         product is never shed silently
 */
export function allocateReferences(inputs: AllocationInput[], options: AllocationOptions): Allocation {
  const limit = Math.max(0, Math.floor(options.limit));
  const maxPanels = Math.max(1, Math.floor(options.maxPanelsPerSheet));
  const sheet = Math.max(1, Math.floor(options.sheetSizePx));

  const dropped: DroppedReference[] = [];

  // The style reference never travels as an image. It reaches the director as the
  // text manifest the vision pass already produces
  // (`config.ts:144` WITHHOLD_INSPIRATION_IMAGE_FROM_PROVIDER, default on). Handing
  // the generator a second photograph is what made it blend two products into one
  // frame.
  for (const s of inputs.filter((i) => i.kind === "style")) {
    dropped.push({
      what: s.filename || s.id,
      reason_vi: "Ảnh phong cách không được gửi kèm; phong cách của nó được mô tả bằng chữ trong prompt.",
    });
  }

  const products = inputs.filter((i) => i.kind === "product");
  const logos = inputs.filter((i) => i.kind === "logo");

  // Only one logo travels as an image. A second is a duplicate mark.
  for (const extra of logos.slice(1)) {
    dropped.push({
      what: extra.filename || extra.id,
      reason_vi: "Chỉ một ảnh logo được gửi; các ảnh logo còn lại bị bỏ qua.",
    });
  }
  const logo = logos[0] || null;

  if (limit <= 0) {
    return {
      slots: [],
      dropped,
      packed: false,
      ...(products.length > 0
        ? {
            impossible: {
              reason_vi: "Model hiện tại không nhận ảnh tham chiếu nào.",
              products: distinctProductIds(products),
            },
          }
        : {}),
    };
  }

  // Distinct products first, then the extra angles of products already carried.
  // Within each group, input order — so the same brief always allocates the same
  // way and "Image 1" means the same photograph on every render.
  const { primary, extraAngles } = splitByIdentity(products);
  const orderedProducts = [...primary, ...extraAngles];

  // ── 1. Everything fits ──────────────────────────────────────────────────
  const needed = orderedProducts.length + (logo ? 1 : 0);
  if (needed <= limit) {
    const slots: AllocatedSlot[] = [];
    for (const p of orderedProducts) {
      slots.push(singleSlot(slots.length + 1, p, sheet));
    }
    if (logo) slots.push(singleSlot(slots.length + 1, logo, sheet));
    return { slots, dropped, packed: false };
  }

  // ── 2. Pack ─────────────────────────────────────────────────────────────
  //
  // The logo rides along on a sheet rather than claiming a whole slot: a mark is
  // small, and a slot spent on it is a slot a product cannot have.
  let capacity = limit * maxPanels - (logo ? 1 : 0);
  let carried = orderedProducts;

  if (carried.length > capacity) {
    // Shed extra angles first — a product already has a panel elsewhere.
    const keepExtras = Math.max(0, capacity - primary.length);
    for (const shed of extraAngles.slice(keepExtras)) {
      dropped.push({
        what: shed.filename || shed.id,
        reason_vi: "Đây là góc chụp thêm của một sản phẩm đã có ảnh khác, nên không được gửi kèm.",
      });
    }
    carried = [...primary, ...extraAngles.slice(0, keepExtras)];
  }

  let logoRides = Boolean(logo);
  if (carried.length > capacity && logoRides) {
    // Give the logo's panel back to a product. The logo then travels as text only,
    // which the brief has to state so the director never asks the image model to
    // draw a mark it was not given.
    capacity = limit * maxPanels;
    logoRides = false;
    dropped.push({
      what: logo!.filename || logo!.id,
      reason_vi: "Không còn chỗ cho ảnh logo; logo chỉ được mô tả bằng chữ, không được vẽ lại.",
    });
  }

  if (carried.length > capacity) {
    // Every remaining image is a distinct product. This module does not choose one
    // to lose.
    return {
      slots: [],
      dropped,
      packed: true,
      impossible: {
        reason_vi:
          `Model hiện tại chỉ nhận ${limit} ảnh mỗi lần, ghép tối đa ${maxPanels} ô mỗi ảnh ` +
          `(tối đa ${limit * maxPanels} sản phẩm). Bạn đang gửi ${carried.length} sản phẩm khác nhau — ` +
          `hãy tách thành nhiều lần tạo.`,
        products: distinctProductIds(carried),
      },
    };
  }

  // Spread as evenly as possible across exactly `limit` slots, and keep products in
  // separate slots at full size for as long as there are slots for them.
  const buckets: AllocationInput[][] = Array.from({ length: limit }, () => []);
  carried.forEach((p, i) => buckets[i % limit].push(p));

  const slots: AllocatedSlot[] = buckets.map((bucket, i) => {
    if (bucket.length === 1) return singleSlot(i + 1, bucket[0], sheet);
    return sheetSlot(i + 1, bucket, sheet);
  });

  if (logoRides && logo) {
    // The emptiest slot, so the logo costs the least detail. Ties go to the last
    // slot, keeping "Image 1" the product-heavy one.
    let target = 0;
    for (let i = 1; i < slots.length; i++) {
      if (slots[i].panels.length <= slots[target].panels.length) target = i;
    }
    attachLogoStrip(slots[target], logo, sheet);
  }

  return { slots, dropped, packed: slots.some((s) => s.panels.length > 1) };
}

function distinctProductIds(inputs: AllocationInput[]): string[] {
  const out: string[] = [];
  for (const i of inputs) {
    const k = identityKey(i);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * First image of each product, then every further image of a product already seen.
 *
 * The distinction matters because the second angle of a bottle is worth less than
 * the first photograph of a different bottle, and under pressure that is the order
 * things should be given up in.
 */
function splitByIdentity(products: AllocationInput[]): {
  primary: AllocationInput[];
  extraAngles: AllocationInput[];
} {
  const seen = new Set<string>();
  const primary: AllocationInput[] = [];
  const extraAngles: AllocationInput[] = [];
  for (const p of products) {
    const k = identityKey(p);
    if (seen.has(k)) extraAngles.push(p);
    else {
      seen.add(k);
      primary.push(p);
    }
  }
  return { primary, extraAngles };
}

function singleSlot(index: number, input: AllocationInput, sheet: number): AllocatedSlot {
  const [w, h] = fitInside(input, sheet, sheet);
  return {
    index,
    kind: "single",
    panels: [
      {
        label: "A",
        role: input.kind,
        sourceImageId: input.id,
        outWidth: w,
        outHeight: h,
        productId: input.productId ?? null,
      },
    ],
    width: sheet,
    height: sheet,
  };
}

/**
 * A grid, chosen deterministically from the panel count.
 *
 * `ceil(sqrt(n))` columns is the same rule `ReferencePackingStrategy.gridFor:139-144`
 * already uses, so a sheet drawn here and a sheet drawn by the existing service
 * agree on their geometry.
 */
export function gridForPanels(n: number): { rows: number; columns: number } {
  if (n <= 1) return { rows: 1, columns: 1 };
  const columns = Math.ceil(Math.sqrt(n));
  return { rows: Math.ceil(n / columns), columns };
}

/** Panel letters, so a prompt can say "panel B of Image 1" and be understood. */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function sheetSlot(index: number, inputs: AllocationInput[], sheet: number): AllocatedSlot {
  const { rows, columns } = gridForPanels(inputs.length);
  // The label strip is reserved OUTSIDE the picture area of every cell, so a letter
  // never sits on a product.
  const labelPx = Math.max(12, Math.round(sheet / 64));
  const cellW = Math.floor(sheet / columns);
  const cellH = Math.floor(sheet / rows);
  const panelBoxH = Math.max(1, cellH - labelPx);

  const panels: AllocatedPanel[] = inputs.map((input, i) => {
    const [w, h] = fitInside(input, cellW, panelBoxH);
    return {
      label: LETTERS[i] || `P${i + 1}`,
      role: input.kind,
      sourceImageId: input.id,
      outWidth: w,
      outHeight: h,
      productId: input.productId ?? null,
    };
  });

  return { index, kind: "sheet", panels, width: sheet, height: sheet };
}

/**
 * The logo as a small separated strip, not a grid cell.
 *
 * A quarter of the sheet's edge, which is enough for a mark to be legible and
 * little enough that it does not compete with a product for the sheet.
 */
function attachLogoStrip(slot: AllocatedSlot, logo: AllocationInput, sheet: number): void {
  const strip = Math.max(1, Math.round(sheet / 4));
  const [w, h] = fitInside(logo, strip, strip);
  slot.panels.push({
    label: "LOGO",
    role: "logo",
    sourceImageId: logo.id,
    outWidth: w,
    outHeight: h,
    productId: null,
  });
  slot.kind = "sheet";
}

/**
 * The largest box inside `maxW × maxH` with the input's own aspect ratio.
 *
 * Never upscales: a 300 px photo in a 512 px cell stays 300 px. Stretching a
 * reference changes the proportions the render is supposed to preserve, which is
 * the one thing a product reference exists to carry.
 */
function fitInside(input: AllocationInput, maxW: number, maxH: number): [number, number] {
  const w = Number(input.width) > 0 ? Number(input.width) : 0;
  const h = Number(input.height) > 0 ? Number(input.height) : 0;
  if (!w || !h) return [maxW, maxH];
  const scale = Math.min(maxW / w, maxH / h, 1);
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}

/**
 * Panels whose longest side fell under the profile's floor.
 *
 * Reported, never corrected: making a panel bigger means making another smaller, and
 * the honest thing is to say that identity may not survive this packing rather than
 * to rearrange until the warning disappears.
 */
export function smallPanels(
  allocation: Allocation,
  minLongestSidePx: number,
): { slot: number; label: string; longestSidePx: number }[] {
  const out: { slot: number; label: string; longestSidePx: number }[] = [];
  for (const slot of allocation.slots) {
    for (const panel of slot.panels) {
      if (panel.role !== "product") continue;
      const longest = Math.max(panel.outWidth, panel.outHeight);
      if (longest < minLongestSidePx) out.push({ slot: slot.index, label: panel.label, longestSidePx: longest });
    }
  }
  return out;
}

/** Counts and sizes only. Never a filename the client owns, never a buffer. */
export function allocationTelemetry(allocation: Allocation, minLongestSidePx?: number) {
  return {
    slots: allocation.slots.length,
    packed: allocation.packed,
    panels_per_slot: allocation.slots.map((s) => s.panels.length),
    panel_sizes: allocation.slots.map((s) => s.panels.map((p) => `${p.label}:${p.outWidth}x${p.outHeight}`)),
    dropped: allocation.dropped.length,
    impossible: Boolean(allocation.impossible),
    ...(typeof minLongestSidePx === "number"
      ? { small_panels: smallPanels(allocation, minLongestSidePx).length }
      : {}),
  };
}
