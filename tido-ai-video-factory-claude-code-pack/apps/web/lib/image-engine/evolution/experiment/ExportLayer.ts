import type { CreativeDocument, DocumentElement } from "./CreativeDocument";
import type { TextLayer } from "./TypographyRenderer";

/**
 * Export — real files where real files are possible, honest models where not.
 *
 * SVG is a genuine export. It is text, this system holds every value it needs,
 * and the text elements stay text: opening the result in a vector editor gives
 * you editable type, not an image of type. That is a real deliverable.
 *
 * Canva has no public import format for arbitrary documents, so what is
 * produced is a structurally complete JSON using Canva's own vocabulary —
 * usable by anything that wants to drive their API, and honest that it is a
 * model rather than a file Canva will open.
 *
 * PSD is a binary format with layer data this pipeline does not have: the image
 * provider returns one flat raster, so there are no separated pixel layers to
 * write. Rather than emit a one-layer PSD and call it layered, this produces a
 * document MODEL with every field a writer would need, and says plainly that
 * the pixels are missing.
 *
 * All three are pure: they build strings and objects and write nothing.
 */

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── SVG ────────────────────────────────────────────────────────────────────

export interface SvgExport {
  svg: string;
  /** Text elements that remain text, not outlines or pixels. */
  live_text: number;
  /** Image layers referenced but not embedded. */
  image_placeholders: number;
}

/**
 * A real SVG. Text stays text.
 *
 * Image layers are emitted as `<image>` with an href the caller fills in,
 * because embedding a megabyte of base64 per layer would make the file
 * unopenable for no benefit. The geometry is exact either way.
 */
export function exportSvg(
  doc: CreativeDocument,
  textLayers: TextLayer[],
  width = 1024,
  height = 1024
): SvgExport {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <desc>Generated design document. Text elements are live text and remain editable.</desc>`,
  ];

  let images = 0;
  const ordered = [...doc.elements].sort((a, b) => a.z_index - b.z_index);
  for (const el of ordered) {
    if (el.type === "text") continue; // drawn from textLayers below, with full type data
    const x = ((el.position.x - el.size.width / 2) / 100) * width;
    const y = ((el.position.y - el.size.height / 2) / 100) * height;
    const w = (el.size.width / 100) * width;
    const h = (el.size.height / 100) * height;
    images++;
    parts.push(
      `  <image id="${esc(el.id)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"` +
        ` opacity="${el.opacity}" href="" data-layer-type="${esc(el.type)}" data-content="${esc(el.content)}"/>`
    );
  }

  for (const t of textLayers) {
    const x = (t.position.x / 100) * width;
    const y = (t.position.y / 100) * height;
    const size = Math.round(Math.min(width, height) * 0.032 * t.scale);
    const anchor = t.alignment === "left" ? "start" : t.alignment === "right" ? "end" : "middle";
    parts.push(
      `  <text id="${esc(t.id)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}"` +
        ` font-weight="${t.weight}" letter-spacing="${(t.tracking * size).toFixed(2)}"` +
        ` text-anchor="${anchor}" dominant-baseline="middle" fill="${esc(t.color)}"` +
        ` opacity="${t.opacity}" data-role="${esc(t.role)}">${esc(t.content)}</text>`
    );
  }

  parts.push(`</svg>`);
  return { svg: parts.join("\n"), live_text: textLayers.length, image_placeholders: images };
}

// ── Canva ──────────────────────────────────────────────────────────────────

export interface CanvaElement {
  type: "TEXT" | "IMAGE" | "SHAPE";
  /** Percentages of the page, as Canva's API expresses position. */
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  /** TEXT only. */
  text?: { content: string; fontSize: number; fontWeight: number; textAlign: string; color: string };
  /** IMAGE only. The caller supplies the asset reference. */
  asset?: { ref: string; describes: string };
}

export interface CanvaDesignDocument {
  version: "1";
  page: { width: number; height: number };
  elements: CanvaElement[];
  /** Honest about what this is. */
  import_ready: boolean;
  note: string;
}

export function exportCanva(
  doc: CreativeDocument,
  textLayers: TextLayer[],
  width = 1024,
  height = 1024
): CanvaDesignDocument {
  const elements: CanvaElement[] = [];
  for (const el of [...doc.elements].sort((a, b) => a.z_index - b.z_index)) {
    if (el.type === "text") continue;
    elements.push({
      type: el.type === "shape" ? "SHAPE" : "IMAGE",
      left: el.position.x - el.size.width / 2,
      top: el.position.y - el.size.height / 2,
      width: el.size.width,
      height: el.size.height,
      rotation: el.rotation,
      opacity: el.opacity,
      asset: { ref: "", describes: el.content },
    });
  }
  for (const t of textLayers) {
    elements.push({
      type: "TEXT",
      left: t.position.x - t.size.width / 2,
      top: t.position.y - t.size.height / 2,
      width: t.size.width,
      height: t.size.height,
      rotation: 0,
      opacity: t.opacity,
      text: {
        content: t.content,
        fontSize: Math.round(Math.min(width, height) * 0.032 * t.scale),
        fontWeight: t.weight,
        textAlign: t.alignment === "centre" ? "center" : t.alignment,
        color: t.color,
      },
    });
  }
  return {
    version: "1",
    page: { width, height },
    elements,
    import_ready: false,
    note: "Structurally complete in Canva's vocabulary. Canva has no public import format for arbitrary documents, so this drives their API rather than opening as a file.",
  };
}

// ── PSD ────────────────────────────────────────────────────────────────────

export interface PsdLayer {
  name: string;
  type: "background" | "product" | "shadow" | "effect" | "text" | "shape";
  /** Pixel bounds, resolved from percentages. */
  bounds: { left: number; top: number; right: number; bottom: number };
  opacity: number;
  editable: boolean;
  /** Text layers carry everything a PSD text record needs except the font. */
  text?: { content: string; size: number; weight: number; alignment: string; color: string };
  /** True when this layer has no pixel data to write. */
  pixels_missing: boolean;
}

export interface PsdDocumentModel {
  width: number;
  height: number;
  layers: PsdLayer[];
  /** False, always, with the reason. No fake PSD is produced. */
  writable: boolean;
  blocked_by: string;
}

export function exportPsdModel(
  doc: CreativeDocument,
  textLayers: TextLayer[],
  width = 1024,
  height = 1024
): PsdDocumentModel {
  const toBounds = (x: number, y: number, w: number, h: number) => ({
    left: Math.round(((x - w / 2) / 100) * width),
    top: Math.round(((y - h / 2) / 100) * height),
    right: Math.round(((x + w / 2) / 100) * width),
    bottom: Math.round(((y + h / 2) / 100) * height),
  });

  const layers: PsdLayer[] = [];
  for (const el of [...doc.elements].sort((a, b) => a.z_index - b.z_index)) {
    if (el.type === "text") continue;
    layers.push({
      name: el.id,
      type: (["background", "product", "shadow", "effect", "shape"] as const).includes(el.type as any)
        ? (el.type as PsdLayer["type"])
        : "effect",
      bounds: toBounds(el.position.x, el.position.y, el.size.width, el.size.height),
      opacity: el.opacity,
      editable: false,
      // The provider returns one flat raster, so no separated pixels exist for
      // any image layer. Saying so per layer is the honest form.
      pixels_missing: true,
    });
  }
  for (const t of textLayers) {
    layers.push({
      name: t.id,
      type: "text",
      bounds: toBounds(t.position.x, t.position.y, t.size.width, t.size.height),
      opacity: t.opacity,
      editable: true,
      text: {
        content: t.content,
        size: Math.round(Math.min(width, height) * 0.032 * t.scale),
        weight: t.weight,
        alignment: t.alignment,
        color: t.color,
      },
      // Text layers are vector records, not pixels: nothing is missing.
      pixels_missing: false,
    });
  }

  return {
    width,
    height,
    layers,
    writable: false,
    blocked_by:
      "the image provider returns one flat raster, so no separated pixel layers exist to write into a PSD; the text records here are complete",
  };
}

/** Counts only. */
export function exportTelemetry(args: {
  svg?: SvgExport | null;
  canva?: CanvaDesignDocument | null;
  psd?: PsdDocumentModel | null;
}) {
  return {
    svg_bytes: args.svg?.svg.length ?? 0,
    svg_live_text: args.svg?.live_text ?? 0,
    canva_elements: args.canva?.elements.length ?? 0,
    canva_import_ready: args.canva?.import_ready ?? false,
    psd_layers: args.psd?.layers.length ?? 0,
    psd_text_layers: args.psd?.layers.filter((l) => l.type === "text").length ?? 0,
    psd_writable: args.psd?.writable ?? false,
  };
}
