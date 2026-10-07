/**
 * What a person may attach, checked once, in the user's language.
 *
 * WHY IT IS A MODULE
 * ------------------
 * Two places need the same answer: the uploader, so a person is told before they
 * wait for an upload, and the route, because a request can arrive without going
 * through the uploader at all. Before this existed neither side counted or measured
 * anything — `BrandIdentityUploader` appended whatever `e.target.files` held and
 * `generate-simple/route.ts` buffered all of it — so eight 12-megapixel photographs
 * were accepted and sent.
 *
 * NOT the provider's limit. The provider takes two images per call; more than that
 * are packed into two sheets by `allocateReferences`. This is about what the system
 * will accept from a person, and the two numbers are deliberately different.
 *
 * REFUSED, NEVER TRIMMED
 * ----------------------
 * Over the cap is an error with a Vietnamese message naming the number. Quietly
 * keeping the first eight of nine photographs is the failure mode the packing work
 * exists to prevent, and doing it at intake instead would be the same failure one
 * step earlier.
 *
 * Pure. No I/O: the caller supplies the files it already has.
 */

export interface IntakeLimits {
  maxProductImages: number;
  maxLogoImages: number;
  maxStyleImages: number;
  maxBytesPerImage: number;
  maxTotalBytes: number;
  acceptedMimeTypes: readonly string[];
  acceptedLogoMimeTypes: readonly string[];
}

/** Just enough of a file to judge. Works for a browser `File` and a route `File` alike. */
export interface IntakeFileLike {
  name?: string;
  type?: string;
  size?: number;
}

export interface IntakeChannel {
  /** Vietnamese, used verbatim in the message: "ảnh sản phẩm". */
  label: string;
  items: unknown[];
  max: number;
  types: readonly string[];
}

export interface IntakeProblem {
  code: "TOO_MANY_IMAGES" | "IMAGE_TOO_LARGE" | "UPLOAD_TOO_LARGE" | "UNSUPPORTED_IMAGE_TYPE";
  /** Shown to the person. Names the limit, so the next attempt can succeed. */
  message_vi: string;
  /** Counts and types only — never a buffer, never the file's contents. */
  detail: Record<string, unknown>;
}

function asFile(item: unknown): IntakeFileLike | null {
  if (!item || typeof item !== "object") return null;
  const f = item as IntakeFileLike;
  if (typeof f.size !== "number" && typeof f.type !== "string") return null;
  return f;
}

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * The first problem, or null.
 *
 * First rather than all: a person fixes one thing at a time, and a list of four
 * complaints about one upload reads as a wall.
 */
export function checkIntake(channels: IntakeChannel[], limits: IntakeLimits): IntakeProblem | null {
  let totalBytes = 0;

  for (const channel of channels) {
    const files = channel.items.map(asFile).filter((f): f is IntakeFileLike => f !== null);

    if (files.length > channel.max) {
      return {
        code: "TOO_MANY_IMAGES",
        message_vi:
          `Bạn đang gửi ${files.length} ${channel.label}, vượt quá giới hạn ${channel.max}. ` +
          `Hãy bớt lại rồi thử lại.`,
        detail: { channel: channel.label, received: files.length, max: channel.max },
      };
    }

    for (const file of files) {
      const size = Number(file.size) || 0;
      totalBytes += size;

      if (size > limits.maxBytesPerImage) {
        return {
          code: "IMAGE_TOO_LARGE",
          message_vi:
            `Ảnh "${file.name || "không rõ tên"}" nặng ${mb(size)}, vượt quá giới hạn ` +
            `${mb(limits.maxBytesPerImage)} mỗi ảnh.`,
          detail: { channel: channel.label, bytes: size, max_bytes: limits.maxBytesPerImage },
        };
      }

      // An empty type is allowed: some clients omit it, and the normalisation step
      // reads the actual bytes anyway. A type that is present and wrong is refused.
      const type = String(file.type || "").toLowerCase();
      if (type && !channel.types.includes(type)) {
        return {
          code: "UNSUPPORTED_IMAGE_TYPE",
          message_vi:
            `Ảnh "${file.name || "không rõ tên"}" có định dạng ${type} chưa được hỗ trợ cho ` +
            `${channel.label}. Hãy dùng ${channel.types.join(", ")}.`,
          detail: { channel: channel.label, mime: type, accepted: [...channel.types] },
        };
      }
    }
  }

  if (totalBytes > limits.maxTotalBytes) {
    return {
      code: "UPLOAD_TOO_LARGE",
      message_vi:
        `Tổng dung lượng ảnh là ${mb(totalBytes)}, vượt quá giới hạn ${mb(limits.maxTotalBytes)} ` +
        `cho một lần tạo.`,
      detail: { total_bytes: totalBytes, max_total_bytes: limits.maxTotalBytes },
    };
  }

  return null;
}
