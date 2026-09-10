/**
 * Export metadata for a rendered campaign asset.
 *
 * A flat PNG is the end of the render but not the end of the job. An agency
 * revises: the headline moves, the CTA changes colour, the client wants the
 * product 10% larger. Today that means re-rendering, because nothing downstream
 * knows where anything is.
 *
 * This file records what would be needed to rebuild the asset as an editable
 * document later — in Canva, Photoshop or Figma — without pretending that
 * document exists yet. `layers` is populated from the layout plan the campaign
 * already computed, so the geometry is real; `editable_export.status` states
 * plainly that the pixels are still flattened.
 *
 * Nothing here re-derives creative decisions. It is a record of a render that
 * already happened.
 */

export const EXPORT_METADATA_SCHEMA_VERSION = "1.0";

export type EditableExportTarget = "PSD" | "CANVA" | "FIGMA";

export type ExportLayerRole =
  | "BACKGROUND"
  | "PRODUCT"
  | "HEADLINE"
  | "SUBHEAD"
  | "CTA"
  | "LOGO"
  | "SUPPORTING"
  | "UNASSIGNED";

export interface ExportLayer {
  id: string;
  role: ExportLayerRole;
  name: string;
  /**
   * Normalised 0-1 box within the frame, taken from the campaign's layout plan.
   * Normalised rather than pixel-based so one record survives every delivery size
   * derived from the same render.
   */
  bounds: { x: number; y: number; width: number; height: number };
  /**
   * Whether this region can be edited independently TODAY. Always false for now:
   * the render is flat, so every layer is a description of a region, not a
   * separable object. This flips to true when real layer export lands.
   */
  editable: boolean;
  /** Where the geometry came from. */
  source: "LAYOUT_PLAN";
}

export interface AssetExportMetadata {
  schema_version: string;
  generated_at: string;

  asset: {
    /** Delivery file name without extension. */
    name: string;
    asset_type: string;
    use_case?: string;
    goal?: string;
  };

  campaign: {
    campaign_id: string;
    campaign_name: string;
    brand: string;
  };

  dimensions: {
    width: number;
    height: number;
    aspect_ratio: string;
    /** How width/height were established. */
    measured: "IMAGE_HEADER" | "DERIVED_FROM_RATIO";
    /** Container the provider actually returned, e.g. "webp". */
    format: string;
  };

  generation: {
    generation_id: string;
    provider: string;
    model: string;
    image_size: string;
    mime_type: string;
    /** The exact text sent to the image model. */
    prompt: string;
    prompt_chars: number;
    reference_count: number;
    rendered_at: string;
    duration_ms?: number;
  };

  /** Layout regions. Real geometry, not yet separable pixels. */
  layers: ExportLayer[];

  editable_export: {
    status: "FLATTENED";
    /** Targets this metadata is shaped for. None are implemented yet. */
    planned_targets: EditableExportTarget[];
    notes: string;
  };
}

/** Fallback frame sizes, used only when the buffer carries no readable header. */
const RATIO_FALLBACK: Record<string, { width: number; height: number }> = {
  "1:1": { width: 2048, height: 2048 },
  "16:9": { width: 2048, height: 1152 },
  "9:16": { width: 1152, height: 2048 },
};

/**
 * Reads pixel dimensions out of an encoded image header.
 *
 * PNG and WebP are both handled because the provider does not always return what
 * you would assume: the ImgStudio path emits WebP, so a PNG-only reader silently
 * fell back to guessing the frame size from the aspect ratio. A metadata record
 * that guesses is worse than one that says where its numbers came from, so the
 * caller records which of the two happened.
 */
export function readImageDimensions(
  buffer: Buffer
): { width: number; height: number; format: string } | null {
  if (buffer.length < 24) return null;

  // ── PNG: 8-byte signature, 4-byte length, "IHDR", then two big-endian uint32.
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (isPng && buffer.toString("ascii", 12, 16) === "IHDR") {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width && height) return { width, height, format: "png" };
    return null;
  }

  // ── WebP: a RIFF container whose payload chunk decides how size is encoded.
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);

    // Lossy: 3-byte frame tag, 3-byte sync code, then 14-bit width and height.
    if (chunk === "VP8 " && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      if (width && height) return { width, height, format: "webp" };
    }

    // Lossless: one signature byte, then width-1 and height-1 packed as 14 bits each.
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      if (width && height) return { width, height, format: "webp" };
    }

    // Extended: canvas size as two 24-bit little-endian values, each minus one.
    if (chunk === "VP8X" && buffer.length >= 30) {
      const width = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
      const height = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
      if (width && height) return { width, height, format: "webp" };
    }
  }

  return null;
}

/**
 * File extension for a provider mime type.
 *
 * The download name must match the bytes. Naming a WebP file ".png" is the kind
 * of mismatch Photoshop and Canva reject on open, and it is invisible until a
 * designer tries to use the file.
 */
export function extensionForMime(mimeType?: string): string {
  const m = (mimeType || "").toLowerCase();
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  return "png";
}

/** Maps a layout zone role onto an export layer role. */
function layerRole(zoneRole: string): ExportLayerRole {
  const r = (zoneRole || "").toUpperCase();
  if (r.includes("PRODUCT") || r.includes("HERO")) return "PRODUCT";
  if (r.includes("HEADLINE") || r.includes("TITLE")) return "HEADLINE";
  if (r.includes("SUBHEAD") || r.includes("BODY")) return "SUBHEAD";
  if (r.includes("CTA") || r.includes("BUTTON")) return "CTA";
  if (r.includes("LOGO") || r.includes("BRAND")) return "LOGO";
  if (r.includes("BACKGROUND") || r.includes("NEGATIVE")) return "BACKGROUND";
  if (r.includes("SUPPORT")) return "SUPPORTING";
  return "UNASSIGNED";
}

export interface BuildExportMetadataArgs {
  assetName: string;
  assetType: string;
  useCase?: string;
  assetGoal?: string;
  campaignId: string;
  campaignName: string;
  brand: string;
  aspectRatio: string;
  generationId: string;
  provider: string;
  model: string;
  imageSize: string;
  mimeType: string;
  prompt: string;
  referenceCount: number;
  durationMs?: number;
  imageBuffer?: Buffer;
  /** Zones from the campaign's layout plan, if the caller has them. */
  layoutZones?: { role: string; x: number; y: number; width: number; height: number }[];
}

export function buildAssetExportMetadata(args: BuildExportMetadataArgs): AssetExportMetadata {
  const measured = args.imageBuffer ? readImageDimensions(args.imageBuffer) : null;
  const fallback = RATIO_FALLBACK[args.aspectRatio] || { width: 0, height: 0 };
  const now = new Date().toISOString();

  return {
    schema_version: EXPORT_METADATA_SCHEMA_VERSION,
    generated_at: now,
    asset: {
      name: args.assetName,
      asset_type: args.assetType,
      use_case: args.useCase,
      goal: args.assetGoal,
    },
    campaign: {
      campaign_id: args.campaignId,
      campaign_name: args.campaignName,
      brand: args.brand,
    },
    dimensions: {
      width: measured?.width ?? fallback.width,
      height: measured?.height ?? fallback.height,
      aspect_ratio: args.aspectRatio,
      measured: measured ? "IMAGE_HEADER" : "DERIVED_FROM_RATIO",
      format: measured?.format || extensionForMime(args.mimeType),
    },
    generation: {
      generation_id: args.generationId,
      provider: args.provider,
      model: args.model,
      image_size: args.imageSize,
      mime_type: args.mimeType,
      prompt: args.prompt,
      prompt_chars: args.prompt.length,
      reference_count: args.referenceCount,
      rendered_at: now,
      duration_ms: args.durationMs,
    },
    layers: (args.layoutZones || []).map((z, i) => ({
      id: `layer_${String(i + 1).padStart(2, "0")}`,
      role: layerRole(z.role),
      name: z.role,
      bounds: { x: z.x, y: z.y, width: z.width, height: z.height },
      editable: false,
      source: "LAYOUT_PLAN" as const,
    })),
    editable_export: {
      status: "FLATTENED",
      planned_targets: ["PSD", "CANVA", "FIGMA"],
      notes:
        "The rendered file is flat pixels. Layer bounds below come from the campaign layout plan and describe where each element sits, which is what a future PSD or Canva export would need. No layer separation has been performed.",
    },
  };
}

/**
 * Download name for a rendered asset: Brand_AssetType_CampaignName.png
 *
 * Diacritics are stripped rather than encoded, because these files land in
 * Windows shares, Slack uploads and email attachments where percent-encoded
 * Vietnamese becomes unreadable. Case is preserved — unlike the delivery-package
 * naming, which is uppercase for sorting inside a fifty-file handover folder.
 */
export function assetDownloadName(args: {
  brand: string;
  assetLabel: string;
  campaignName: string;
  extension?: string;
}): string {
  const clean = (s: string, max = 40) =>
    (s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "");

  const parts = [clean(args.brand, 20), clean(args.assetLabel, 20), clean(args.campaignName)].filter(Boolean);
  return `${parts.join("_") || "campaign-asset"}.${args.extension || "png"}`;
}
