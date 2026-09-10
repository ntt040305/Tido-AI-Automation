import sharp from "sharp";

type SharpMetadata = Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;

/**
 * CIOS Phase 4.0.7.1 — image transport normalization.
 *
 * The failure this exists to end
 * -----------------------------
 * The creative pipeline passes. The provider call fails, and it fails with a
 * 413 from ImgStudio: "Ảnh tải lên quá lớn. Vui lòng dùng ảnh dưới 9.5MB mỗi lần
 * chỉnh sửa."
 *
 * A preprocessor already existed, and its logs said `compression_applied: false`
 * on the exact requests that then 413'd. The reason is a single comparison: it
 * compressed only when *one* image exceeded 10MB, while the provider rejects on
 * the *total* multipart body at 9.5MB. Three 3.5MB references are 10.5MB on the
 * wire and not one of them trips a 10MB per-image test, so every one passed
 * through untouched and the request was oversized before it was built. There was
 * no total-payload accounting anywhere in the path.
 *
 * What this does
 * -------------
 * Normalizes every image before it can reach a provider, to a budget expressed
 * the way the provider expresses its limit — a total.
 *
 *   longest side   2048px, aspect ratio preserved, never enlarged
 *   quality        85 down to 70, in steps, only as far as the budget requires
 *   per image      under 3MB
 *   whole payload  under 9MB, against the provider's 9.5MB with headroom
 *
 * What it preserves
 * ----------------
 * Aspect ratio is never altered — `fit: "inside"` with `withoutEnlargement`, so a
 * small image is left at its own size rather than being blown up to the cap.
 * Transparency survives: an image with an alpha channel is encoded as WebP, which
 * keeps it, rather than JPEG, which would composite it onto black and put a hard
 * rectangle behind a cut-out product. Lanczos3 resampling keeps logo edges and
 * label text legible, which is what "product identity" means for a reference
 * image the model is asked to reproduce.
 */

/** The provider's own ceiling. Ours sits below it, deliberately. */
export const PROVIDER_LIMIT_BYTES = Math.round(9.5 * 1024 * 1024);

export const NORMALIZATION_DEFAULTS = {
  /** Longest side, in pixels. */
  maxDimension: 2048,
  /** Per image, after normalization. */
  maxImageBytes: 3 * 1024 * 1024,
  /** The whole multipart body's worth of images. Headroom under the provider. */
  maxTotalBytes: 9 * 1024 * 1024,
  /** Tried in order, stopping at the first that fits. */
  qualitySteps: [85, 80, 75, 70],
};

export interface NormalizationBudget {
  maxDimension?: number;
  maxImageBytes?: number;
  maxTotalBytes?: number;
  qualitySteps?: number[];
}

export interface NormalizationInput {
  reference_id?: string;
  buffer?: Buffer | { data?: number[] } | null;
  mimeType?: string;
  filename?: string;
}

export interface NormalizedImage {
  reference_id: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
  before_size: number;
  after_size: number;
  before_dimensions: string;
  after_dimensions: string;
  compression_applied: boolean;
  /** Quality actually used, where the image was re-encoded. */
  quality?: number;
  /** True where an alpha channel was found and kept. */
  transparency_preserved: boolean;
  notes: string[];
}

export type UploadGuardStatus = "PASS" | "COMPRESSED" | "BLOCKED";

export interface UploadGuardReport {
  original_total: number;
  final_total: number;
  status: UploadGuardStatus;
  limit: number;
  passes: number;
  reason: string;
}

export interface NormalizationResult {
  images: NormalizedImage[];
  guard: UploadGuardReport;
}

export class ImageNormalizationService {
  /**
   * Normalizes one image to a per-image budget.
   *
   * Quality descends only as far as the budget requires: an image that already
   * fits at 85 is never re-encoded at 70 to save bytes nobody needed. Where even
   * the lowest quality step does not fit, the longest side is halved once and the
   * ladder is walked again, because past a point resolution is the only thing
   * left to give and it costs less than another 15 points of quality.
   */
  public static async normalizeOne(
    input: NormalizationInput,
    budget: NormalizationBudget = {}
  ): Promise<NormalizedImage> {
    const b = { ...NORMALIZATION_DEFAULTS, ...budget };
    const refId = input.reference_id || "unknown_ref";
    const raw = toBuffer(input.buffer);
    const notes: string[] = [];

    if (!raw.length) {
      return {
        reference_id: refId,
        buffer: raw,
        mimeType: input.mimeType || "image/png",
        filename: input.filename || `${refId}.png`,
        before_size: 0,
        after_size: 0,
        before_dimensions: "unknown",
        after_dimensions: "unknown",
        compression_applied: false,
        transparency_preserved: false,
        notes: ["Empty buffer; nothing to normalize."],
      };
    }

    let meta: SharpMetadata;
    try {
      meta = await sharp(raw).metadata();
    } catch (err: any) {
      // An unreadable buffer is passed through rather than dropped: the provider
      // may still accept it, and failing here would turn a possibly-working
      // request into a certain failure.
      notes.push(`Unreadable by sharp (${err?.message || err}); passed through untouched.`);
      return {
        reference_id: refId,
        buffer: raw,
        mimeType: input.mimeType || "image/png",
        filename: input.filename || `${refId}.png`,
        before_size: raw.length,
        after_size: raw.length,
        before_dimensions: "unknown",
        after_dimensions: "unknown",
        compression_applied: false,
        transparency_preserved: false,
        notes,
      };
    }

    const width = meta.width || 0;
    const height = meta.height || 0;
    const hasAlpha = Boolean(meta.hasAlpha);
    const before = raw.length;
    const longest = Math.max(width, height);

    // Aspect ratio is preserved by construction: only the longest side is given a
    // cap and sharp scales the other to match.
    const capped = longest > b.maxDimension;
    const oversized = before > b.maxImageBytes;

    if (!capped && !oversized) {
      return {
        reference_id: refId,
        buffer: raw,
        mimeType: input.mimeType || `image/${meta.format || "png"}`,
        filename: input.filename || `${refId}.${meta.format || "png"}`,
        before_size: before,
        after_size: before,
        before_dimensions: `${width}x${height}`,
        after_dimensions: `${width}x${height}`,
        compression_applied: false,
        transparency_preserved: hasAlpha,
        notes: ["Already inside the budget; left untouched."],
      };
    }

    let dimensionCap = capped ? b.maxDimension : longest;
    let best: { buf: Buffer; mime: string; quality: number } | null = null;

    for (let round = 0; round < 2 && !best; round++) {
      for (const quality of b.qualitySteps) {
        const encoded = await encode(raw, dimensionCap, quality, hasAlpha);
        if (encoded.buf.length <= b.maxImageBytes) {
          best = { ...encoded, quality };
          break;
        }
        // Keep the smallest attempt so a failure to reach the budget still
        // returns the best available rather than the original.
        if (!best || encoded.buf.length < best.buf.length) best = { ...encoded, quality };
      }
      if (best && best.buf.length > b.maxImageBytes && round === 0) {
        dimensionCap = Math.max(512, Math.round(dimensionCap / 2));
        notes.push(`Quality alone did not reach the budget; longest side reduced to ${dimensionCap}px.`);
        best = null;
      }
    }

    const chosen = best!;
    const after = await sharp(chosen.buf).metadata();
    if (chosen.buf.length > b.maxImageBytes) {
      notes.push(`Still ${formatBytes(chosen.buf.length)} after the last quality step.`);
    }
    if (hasAlpha) notes.push("Alpha channel found; encoded as WebP so transparency survives.");

    const result: NormalizedImage = {
      reference_id: refId,
      buffer: chosen.buf,
      mimeType: chosen.mime,
      filename: renameTo(input.filename || `${refId}`, chosen.mime),
      before_size: before,
      after_size: chosen.buf.length,
      before_dimensions: `${width}x${height}`,
      after_dimensions: `${after.width || 0}x${after.height || 0}`,
      compression_applied: true,
      quality: chosen.quality,
      transparency_preserved: hasAlpha,
      notes,
    };

    console.log("[IMAGE_NORMALIZATION]", {
      reference_id: result.reference_id,
      before_size: formatBytes(result.before_size),
      before_dimensions: result.before_dimensions,
      after_size: formatBytes(result.after_size),
      after_dimensions: result.after_dimensions,
      compression_applied: result.compression_applied,
    });

    return result;
  }

  /**
   * Normalizes a whole upload, then holds it against the payload budget.
   *
   * The second half is the part that was missing. Per-image normalization can
   * leave four 2.8MB images — every one inside its own budget, 11.2MB on the
   * wire. So the total is measured, and if it is over, the images are normalized
   * again against a per-image share of what is actually left.
   */
  /**
   * An image reported exactly as it arrived.
   *
   * Used on the passthrough path so diagnostics stay truthful: `before` and
   * `after` are identical and `compression_applied` is false, because nothing
   * was applied.
   */
  private static async passthrough(input: NormalizationInput): Promise<NormalizedImage> {
    const raw = toBuffer(input.buffer);
    const refId = input.reference_id || "unknown_ref";
    let dims = "unknown";
    let hasAlpha = false;
    try {
      const meta = await sharp(raw).metadata();
      if (meta.width && meta.height) dims = `${meta.width}x${meta.height}`;
      hasAlpha = Boolean(meta.hasAlpha);
    } catch {
      // An unreadable buffer is still passed through: the provider may accept it.
    }
    return {
      reference_id: refId,
      buffer: raw,
      mimeType: input.mimeType || "image/png",
      filename: input.filename || `${refId}.png`,
      before_size: raw.length,
      after_size: raw.length,
      before_dimensions: dims,
      after_dimensions: dims,
      compression_applied: false,
      transparency_preserved: hasAlpha,
      notes: ["Original preserved: the payload was already inside budget."],
    };
  }

  public static async normalizePayload(
    inputs: NormalizationInput[],
    budget: NormalizationBudget = {}
  ): Promise<NormalizationResult> {
    const b = { ...NORMALIZATION_DEFAULTS, ...budget };
    const list = inputs || [];
    const originalTotal = list.reduce((t, i) => t + toBuffer(i.buffer).length, 0);

    // ── Passthrough: the payload already fits ──────────────────────────
    //
    // Restored behaviour, and the single most damaging regression this patch
    // undoes. The previous version normalized every image unconditionally: a
    // typical 4000x3000 client product photo was resized to 2048x1536 and
    // re-encoded at q85, keeping 26% of its pixels, *before the model ever saw
    // it*. Label text, surface texture and packaging detail were destroyed at
    // the input, and no prompt instruction can recover detail that was never
    // delivered.
    //
    // The provider rejects on total payload, so total payload is what decides.
    // An image is only ever touched to make a request that would not otherwise
    // fit — never because it is individually large. Product reference fidelity
    // outranks payload optimization.
    if (originalTotal <= b.maxTotalBytes) {
      const untouched: NormalizedImage[] = [];
      for (const input of list) untouched.push(await this.passthrough(input));
      const guard: UploadGuardReport = {
        original_total: originalTotal,
        final_total: originalTotal,
        status: "PASS",
        limit: b.maxTotalBytes,
        passes: 0,
        reason: `Payload is ${formatBytes(originalTotal)}, inside the ${formatBytes(b.maxTotalBytes)} budget. Originals preserved at full resolution and quality.`,
      };
      console.log("[UPLOAD_GUARD]", {
        original_total: formatBytes(originalTotal),
        final_total: formatBytes(originalTotal),
        status: "PASS",
        images_preserved: untouched.length,
      });
      return { images: untouched, guard };
    }

    console.log("[UPLOAD_GUARD][OVER_BUDGET]", {
      original_total: formatBytes(originalTotal),
      limit: formatBytes(b.maxTotalBytes),
      note: "Normalizing only because the total payload does not fit.",
    });

    let images: NormalizedImage[] = [];
    for (const input of list) images.push(await this.normalizeOne(input, b));

    let passes = 1;
    let total = images.reduce((t, i) => t + i.after_size, 0);

    // Up to two further passes, each with a tighter per-image share. More than
    // that is a payload no quality setting is going to rescue, and the honest
    // answer there is BLOCKED rather than a fourth round of degradation.
    while (total > b.maxTotalBytes && passes < 3 && images.length > 0) {
      const share = Math.floor((b.maxTotalBytes * 0.92) / images.length);
      const tighter: NormalizationBudget = {
        ...b,
        maxImageBytes: Math.max(256 * 1024, share),
        maxDimension: Math.max(768, Math.round(b.maxDimension / (passes + 1))),
      };
      const next: NormalizedImage[] = [];
      for (let i = 0; i < images.length; i++) {
        const source = list[i];
        const again = await this.normalizeOne(source, tighter);
        // Keep whichever pass produced the smaller buffer; a tighter budget can
        // occasionally encode larger on an image that was already small.
        next.push(again.after_size <= images[i].after_size ? again : images[i]);
      }
      images = next;
      total = images.reduce((t, i) => t + i.after_size, 0);
      passes++;
    }

    const status: UploadGuardStatus =
      total > b.maxTotalBytes ? "BLOCKED" : originalTotal === total ? "PASS" : "COMPRESSED";

    const guard: UploadGuardReport = {
      original_total: originalTotal,
      final_total: total,
      status,
      limit: b.maxTotalBytes,
      passes,
      reason:
        status === "PASS"
          ? "Payload was already inside the budget."
          : status === "COMPRESSED"
            ? `Normalized from ${formatBytes(originalTotal)} to ${formatBytes(total)} in ${passes} pass(es).`
            : `Still ${formatBytes(total)} after ${passes} passes, over the ${formatBytes(b.maxTotalBytes)} budget.`,
    };

    console.log("[UPLOAD_GUARD]", {
      original_total: formatBytes(guard.original_total),
      final_total: formatBytes(guard.final_total),
      status: guard.status,
    });

    return { images, guard };
  }
}

/**
 * One encode attempt.
 *
 * WebP for anything with an alpha channel, JPEG otherwise. The alternative —
 * JPEG for everything — composites transparency onto black, which puts a
 * rectangle behind a cut-out product and is a visible defect in the generated
 * image rather than a transport detail.
 */
async function encode(
  raw: Buffer,
  dimensionCap: number,
  quality: number,
  hasAlpha: boolean
): Promise<{ buf: Buffer; mime: string }> {
  const pipeline = sharp(raw).resize(dimensionCap, dimensionCap, {
    fit: "inside",
    withoutEnlargement: true,
    kernel: sharp.kernel.lanczos3,
  });
  if (hasAlpha) {
    return { buf: await pipeline.webp({ quality, effort: 4 }).toBuffer(), mime: "image/webp" };
  }
  return { buf: await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer(), mime: "image/jpeg" };
}

function toBuffer(value: NormalizationInput["buffer"]): Buffer {
  if (!value) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  const data = (value as { data?: number[] }).data;
  if (Array.isArray(data)) return Buffer.from(data);
  try {
    return Buffer.from(value as never);
  } catch {
    return Buffer.alloc(0);
  }
}

function renameTo(filename: string, mime: string): string {
  const ext = mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : "png";
  const stem = String(filename).replace(/\.[a-z0-9]+$/i, "");
  return `${stem}.${ext}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
