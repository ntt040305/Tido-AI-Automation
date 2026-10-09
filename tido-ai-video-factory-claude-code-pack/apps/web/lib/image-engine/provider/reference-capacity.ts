import type { ProviderReferenceImage } from "./ImageGenerationProvider";
import type { ReferenceManifest } from "../types";

/**
 * How many references a provider will actually accept, and what to do when the
 * brief carries more than that.
 *
 * The problem this exists for
 * ---------------------------
 * ImgStudio answers an edit request carrying four images with HTTP 400 and
 * "Provider only supports maximum 3 images per edit request". Nothing upstream
 * knew that number, so the pipeline compiled a prompt, normalized four buffers,
 * and spent a provider call to be told a fact that was knowable before any of it
 * started. Gemini and Cloudflare each already declare their own ceiling and
 * refuse ahead of the wire; this adapter is the same idea with one addition —
 * some of what pushes a brief over the ceiling can be shed without losing
 * anything, and that should be tried before anyone is told no.
 *
 * What it will and will not do
 * ----------------------------
 * It shed only references whose absence costs no product identity, and it stops
 * the moment the payload fits. When the only way left to fit is to leave out a
 * product the client uploaded, it does not do it. A render missing one of four
 * products is not a smaller version of the requested image; it is a different
 * image that looks finished, and the person who asked for it would have no way
 * to see what went missing. Refusing names the products and costs nothing.
 *
 * It decides nothing creative. Which product matters most, how they should be
 * arranged, what the picture means — none of that is here. This is transport:
 * how many files fit in an envelope, and which of them are duplicates.
 */

/** Shed in this order, and only as far as the ceiling requires. */
export type DropReason =
  /** Style already travels as analyzed text; the orchestrator withholds the image on its own path. */
  | "INSPIRATION_TRAVELS_AS_TEXT"
  /** Locked product rule: logos are composited deterministically, never rendered by the model. */
  | "LOGO_NOT_RENDERED_BY_MODEL"
  /** A second photograph of a product another retained reference already carries. */
  | "REDUNDANT_VIEW_OF_SAME_PRODUCT"
  /** Never classified, so nothing downstream depends on it. */
  | "UNCLASSIFIED_REFERENCE"
  /** A deliberate context reference, shed last because something chose it. */
  | "SUPPORTING_CONTEXT";

/**
 * Each drop reason in the user's language.
 *
 * Here rather than in the UI because the reason is a fact about what the system
 * did, and a person is entitled to it in words they read. Fix C: nothing is lost
 * silently, so every entry has a sentence.
 */
export const DROP_REASON_VI: Record<DropReason, string> = {
  INSPIRATION_TRAVELS_AS_TEXT:
    "Ảnh phong cách không được gửi kèm; phong cách của nó được mô tả bằng chữ trong prompt.",
  LOGO_NOT_RENDERED_BY_MODEL:
    "Logo không được model vẽ lại; logo được ghép vào ảnh một cách chính xác.",
  REDUNDANT_VIEW_OF_SAME_PRODUCT:
    "Đây là góc chụp thêm của một sản phẩm đã có ảnh khác, nên không được gửi kèm.",
  UNCLASSIFIED_REFERENCE:
    "Ảnh này không được nhận dạng là sản phẩm, logo hay phong cách, nên không được gửi kèm.",
  SUPPORTING_CONTEXT:
    "Ảnh bối cảnh hỗ trợ; được bỏ lại sau cùng để nhường chỗ cho sản phẩm.",
};

export type CapacityStatus =
  /** Fits as-is. The reference list is returned untouched, same order, same objects. */
  | "WITHIN_LIMIT"
  /** Fits after shedding references that carry no product identity of their own. */
  | "ADAPTED"
  /** Does not fit, and every remaining reference is a distinct product. */
  | "OVER_CAPACITY";

export interface DroppedReference {
  reference_id: string;
  product_id?: string;
  role: string;
  reason: DropReason;
}

export interface CapacityPlan {
  status: CapacityStatus;
  limit: number;
  received: number;
  /** What to send. Identical to the input when status is WITHIN_LIMIT. */
  send: ProviderReferenceImage[];
  dropped: DroppedReference[];
  /** Distinct product identities in the payload, whether carried or not. */
  distinct_products: string[];
  /** How many references still have to go when status is OVER_CAPACITY. */
  over_by: number;
}

const PRODUCT_ROLES = new Set(["PRODUCT", "PRODUCT_REFERENCE"]);

/**
 * The identity a reference carries, preferring what the manifest resolved.
 *
 * The manifest is the one place that has already decided two uploads are the
 * same object; re-deciding that here from filenames would be a second opinion
 * competing with a settled one.
 */
function identityOf(
  ref: ProviderReferenceImage,
  manifest?: ReferenceManifest
): string | undefined {
  if (ref.product_id) return ref.product_id;
  const lock = manifest?.product_identity_locks?.find((l) =>
    l?.reference_ids?.includes(ref.reference_id)
  );
  return lock?.product_id;
}

function isProduct(ref: ProviderReferenceImage, manifest?: ReferenceManifest): boolean {
  if (ref.role && PRODUCT_ROLES.has(String(ref.role).toUpperCase())) return true;
  // A reference the manifest locked to a product is a product, whatever its role
  // says. An unset role is the common case for a single upload, and treating it
  // as sheddable would drop the only thing the brief is about.
  return Boolean(identityOf(ref, manifest));
}

/**
 * Which tier a reference can be shed in, or null if it must be kept.
 *
 * `carriedIdentities` is the set of product ids already spoken for by an earlier
 * retained reference. A product photograph is sheddable only when some other
 * retained reference carries the same product — that is what makes it a second
 * view rather than a product going missing.
 */
function dropTier(
  ref: ProviderReferenceImage,
  manifest: ReferenceManifest | undefined,
  carriedIdentities: Set<string>
): { order: number; reason: DropReason } | null {
  const role = String(ref.role || "").toUpperCase();
  if (role === "INSPIRATION_REFERENCE") return { order: 1, reason: "INSPIRATION_TRAVELS_AS_TEXT" };
  if (role === "LOGO") return { order: 2, reason: "LOGO_NOT_RENDERED_BY_MODEL" };

  const identity = identityOf(ref, manifest);
  if (identity && carriedIdentities.has(identity)) {
    return { order: 3, reason: "REDUNDANT_VIEW_OF_SAME_PRODUCT" };
  }
  // Past this point anything holding an identity is the sole carrier of it.
  if (isProduct(ref, manifest)) return null;

  if (!role || role === "UNKNOWN" || role === "AMBIGUOUS") {
    return { order: 4, reason: "UNCLASSIFIED_REFERENCE" };
  }
  if (role === "SUPPORT_REFERENCE") return { order: 5, reason: "SUPPORTING_CONTEXT" };
  return null;
}

/**
 * Works out what can be sent, without sending anything.
 *
 * Pure: no I/O, no mutation of the input array or of any reference in it. The
 * caller decides what to do with an OVER_CAPACITY plan — this returns the
 * finding, not the refusal.
 */
export function planReferenceCapacity(args: {
  references: ProviderReferenceImage[];
  manifest?: ReferenceManifest;
  limit: number;
}): CapacityPlan {
  const references = args.references || [];
  const manifest = args.manifest;
  const limit = Math.max(0, Math.floor(args.limit));
  const received = references.length;

  const distinct: string[] = [];
  for (const ref of references) {
    const id = identityOf(ref, manifest);
    if (id && !distinct.includes(id)) distinct.push(id);
  }

  if (!limit || received <= limit) {
    return {
      status: "WITHIN_LIMIT",
      limit,
      received,
      // The same array, so a payload that always fitted is byte-for-byte the
      // payload that was already being sent before this file existed.
      send: references,
      dropped: [],
      distinct_products: distinct,
      over_by: 0,
    };
  }

  // Identities are claimed in input order, so the first photograph of a product
  // is the one that stays and any later view of it becomes sheddable.
  const carried = new Set<string>();
  const tiers: { index: number; order: number; reason: DropReason }[] = [];
  references.forEach((ref, index) => {
    const tier = dropTier(ref, manifest, carried);
    if (tier) {
      tiers.push({ index, order: tier.order, reason: tier.reason });
    } else {
      const id = identityOf(ref, manifest);
      if (id) carried.add(id);
    }
  });

  // Cheapest tier first, and within a tier the later upload goes before the
  // earlier one, so the order the client chose survives as far as it can.
  tiers.sort((a, b) => a.order - b.order || b.index - a.index);

  const shed = new Set<number>();
  const dropped: DroppedReference[] = [];
  for (const tier of tiers) {
    if (received - shed.size <= limit) break;
    shed.add(tier.index);
    const ref = references[tier.index];
    dropped.push({
      reference_id: ref.reference_id,
      product_id: identityOf(ref, manifest),
      role: String(ref.role || "UNKNOWN"),
      reason: tier.reason,
    });
  }

  const send = references.filter((_, i) => !shed.has(i));
  if (send.length <= limit) {
    return {
      status: "ADAPTED",
      limit,
      received,
      send,
      dropped,
      distinct_products: distinct,
      over_by: 0,
    };
  }

  // Everything left is the only copy of a product the client uploaded. Nothing
  // is dropped and nothing is sent: the plan reports the conflict and the caller
  // refuses, which is the one outcome that leaves the person able to act on it.
  return {
    status: "OVER_CAPACITY",
    limit,
    received,
    send,
    dropped,
    distinct_products: distinct,
    over_by: send.length - limit,
  };
}

/** A one-line, user-facing account of why nothing was sent. */
export function describeOverCapacity(plan: CapacityPlan): string {
  const products = plan.distinct_products.length;
  const noun = products === 1 ? "sản phẩm" : "sản phẩm";
  return (
    `Nhà cung cấp chỉ nhận tối đa ${plan.limit} ảnh tham chiếu cho một lần tạo, ` +
    `brief này có ${plan.send.length} ảnh không thể lược bớt` +
    (products ? ` (${products} ${noun} khác nhau)` : "") +
    `. Bỏ bớt ${plan.over_by} ${noun} hoặc tách thành nhiều lần tạo.`
  );
}

/** Telemetry shape. Counts and ids only — no buffers, no filenames. */
export function capacityTelemetry(plan: CapacityPlan) {
  return {
    status: plan.status,
    limit: plan.limit,
    received: plan.received,
    sending: plan.send.length,
    over_by: plan.over_by,
    distinct_products: plan.distinct_products.length,
    dropped: plan.dropped.map((d) => `${d.reference_id}:${d.role}:${d.reason}`),
  };
}
