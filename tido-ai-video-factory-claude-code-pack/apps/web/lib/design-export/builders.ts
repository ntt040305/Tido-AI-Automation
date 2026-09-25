import sharp from "sharp";
import { writePsdBuffer, type Layer, type Psd } from "ag-psd";
import pptxgen from "pptxgenjs";
import {
  anchorXOf,
  baselineOf,
  editableSvg,
  type EditableDesign,
  type EditableLayer,
  type EffectLayer,
  type ImageLayer,
  type TextLayer,
} from "@/lib/image-engine/evolution/experiment/EditableDesign";

/**
 * Phase 5.5 — editable files, built from the design, never from a picture.
 *
 * Every builder reads the same `EditableDesign` (design_document.editable) and
 * the layer assets stored beside the render: the scene plate and the brand's
 * logo. The served PNG is not an input to any of them. So the text in every
 * file is the client's exact line as data, the logo is the mark they uploaded,
 * and each layer sits where the design put it.
 */

export interface LayerAssets {
  /** The scene plate: background + product, one raster, no text. */
  scene: Buffer;
  logo?: Buffer | null;
  /** The served composite, used only as the PSD's preview image. */
  composite?: Buffer | null;
}

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
};

const textLayers = (d: EditableDesign) => d.layers.filter((l): l is TextLayer => l.kind === "text");

// ── PSD ────────────────────────────────────────────────────────────────────

/** Raw RGBA at a size, for a PSD pixel layer. */
async function rgba(input: Buffer, width: number, height: number, fit: "fill" | "contain" = "fill") {
  const { data, info } = await sharp(input)
    .resize(width, height, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

/** A PostScript-style name, which is what a PSD text layer names its font by. */
export function postScriptName(family: string, weight: number): string {
  const bold = weight >= 700;
  const known: Record<string, [string, string]> = {
    arial: ["ArialMT", "Arial-BoldMT"],
    georgia: ["Georgia", "Georgia-Bold"],
    "times new roman": ["TimesNewRomanPSMT", "TimesNewRomanPS-BoldMT"],
  };
  const k = known[family.trim().toLowerCase()];
  if (k) return bold ? k[1] : k[0];
  const base = family.replace(/[^A-Za-z0-9]/g, "");
  return `${base}-${bold ? "Bold" : weight <= 300 ? "Light" : weight === 500 ? "Medium" : weight === 600 ? "SemiBold" : "Regular"}`;
}

/** One SVG holding a single layer, cropped to its bounds, for its pixels. */
function singleLayerSvg(d: EditableDesign, layer: EditableLayer, pad: number) {
  const x = Math.max(0, layer.x - pad);
  const y = Math.max(0, layer.y - pad);
  const w = Math.min(d.canvas.width, layer.x + layer.width + pad) - x;
  const h = Math.min(d.canvas.height, layer.y + layer.height + pad) - y;
  const shifted = { ...d, canvas: { ...d.canvas, width: w, height: h }, layers: [{ ...layer, x: layer.x - x, y: layer.y - y }] } as EditableDesign;
  return { svg: editableSvg(shifted, {}), x, y, w, h };
}

/**
 * A layered PSD. Background, Scene, Effects, Logo and one live text layer per
 * line. Text layers carry their text as TEXT (font, size, colour, tracking,
 * justification) plus pre-rendered pixels, so they display everywhere and
 * re-render as live type in Photoshop.
 */
export async function buildPsd(d: EditableDesign, assets: LayerAssets): Promise<Buffer> {
  const { width: W, height: H } = d.canvas;
  const children: Layer[] = [];
  const effects: Layer[] = [];
  const texts: Layer[] = [];

  for (const l of d.layers) {
    if (l.kind === "effect") {
      if (l.id === "background") {
        const px = await rgba(Buffer.from(editableSvg({ ...d, layers: [l] } as EditableDesign, {})), W, H);
        children.push({ name: l.name, left: 0, top: 0, right: W, bottom: H, opacity: l.opacity, imageData: px });
      } else {
        // Cropped to the effect's own bounds, like the text layers: a plate
        // stored as a full-canvas bitmap is a layer nobody can see the edges of.
        const crop = singleLayerSvg(d, l, 0);
        const px = await rgba(Buffer.from(crop.svg), crop.w, crop.h);
        effects.push({ name: l.name, left: crop.x, top: crop.y, right: crop.x + crop.w, bottom: crop.y + crop.h, opacity: l.opacity, imageData: px });
      }
    } else if (l.kind === "image") {
      const src = l.role === "scene" ? assets.scene : assets.logo;
      if (!src) continue;
      const px = await rgba(src, l.width, l.height, l.role === "logo" ? "contain" : "fill");
      children.push({ name: l.name, left: l.x, top: l.y, right: l.x + px.width, bottom: l.y + px.height, opacity: l.opacity, imageData: px });
    } else {
      const pad = Math.ceil(l.font_size * 0.6);
      const crop = singleLayerSvg(d, l, pad);
      const px = await rgba(Buffer.from(crop.svg), crop.w, crop.h);
      texts.push({
        name: l.name,
        left: crop.x,
        top: crop.y,
        right: crop.x + crop.w,
        bottom: crop.y + crop.h,
        opacity: l.opacity,
        imageData: px,
        text: {
          // Photoshop's own line separator is CR. The content is the client's
          // line unchanged; the breaks are where the layout engine wrapped it,
          // so a two-line headline opens as ONE live text layer set on two
          // lines rather than as two layers somebody has to keep in sync.
          text: (l.lines && l.lines.length ? l.lines : [l.content]).join("\r"),
          transform: [1, 0, 0, 1, anchorXOf(l), baselineOf(l)],
          antiAlias: "smooth",
          shapeType: "point",
          style: {
            font: { name: postScriptName(l.font_family, l.font_weight) },
            fontSize: l.font_size,
            fillColor: hexToRgb(l.color),
            tracking: Math.round(l.letter_spacing * 1000),
            autoLeading: false,
            leading: Math.round(l.font_size * l.line_height),
            fauxBold: false,
          },
          paragraphStyle: { justification: l.align === "center" ? "center" : l.align },
        },
      });
    }
  }

  // Bottom to top: Background, Scene, Effects, Logo, Text.
  const logoIdx = children.findIndex((c) => c.name === "Logo");
  const logo = logoIdx >= 0 ? children.splice(logoIdx, 1) : [];
  if (effects.length) children.push({ name: "Effects", opened: true, children: effects });
  children.push(...logo);
  if (texts.length) children.push({ name: "Text", opened: true, children: texts });

  const psd: Psd = { width: W, height: H, children };
  if (assets.composite) psd.imageData = await rgba(assets.composite, W, H);
  return writePsdBuffer(psd, { invalidateTextLayers: true, generateThumbnail: false });
}

// ── PPTX (the Canva-editable path) ─────────────────────────────────────────

/** 96 px to the inch, the unit PowerPoint and Canva agree on. */
const PX_PER_IN = 96;
const inch = (px: number) => Math.round((px / PX_PER_IN) * 1000) / 1000;

/**
 * A one-slide PowerPoint file. Canva imports .pptx as an editable design:
 * each text box stays text (font, size, colour), each picture stays a separate
 * image that can be replaced, and each shape a shape.
 */
export async function buildPptx(d: EditableDesign, assets: LayerAssets): Promise<Buffer> {
  const pres = new pptxgen();
  pres.defineLayout({ name: "TIDO_DESIGN", width: inch(d.canvas.width), height: inch(d.canvas.height) });
  pres.layout = "TIDO_DESIGN";
  pres.title = d.brand?.name ? `${d.brand.name} design` : "TIDO design";
  const slide = pres.addSlide();
  const bg = d.layers.find((l) => l.id === "background") as EffectLayer | undefined;
  slide.background = { color: (bg?.fill || d.canvas.background.color).replace("#", "") };

  for (const l of d.layers) {
    const box = { x: inch(l.x), y: inch(l.y), w: inch(l.width), h: inch(l.height) };
    if (l.kind === "image") {
      const src = l.role === "scene" ? assets.scene : assets.logo;
      if (!src) continue;
      const png = await sharp(src).png().toBuffer();
      slide.addImage({ data: `data:image/png;base64,${png.toString("base64")}`, ...box, altText: l.name, objectName: l.name } as never);
    } else if (l.kind === "effect") {
      if (l.id === "background") continue; // the slide background
      slide.addShape(pres.ShapeType.roundRect, {
        ...box,
        fill: { color: l.fill.replace("#", "") },
        line: { color: l.fill.replace("#", ""), width: 0 },
        rectRadius: Math.min(0.5, l.radius / Math.max(1, Math.min(l.width, l.height))),
        objectName: l.name,
      } as never);
    } else {
      // A little wider than the measured line, centred on it, so a real font's
      // metrics never force a wrap of their own. The breaks are the layout
      // engine's, carried as newlines, and `wrap: false` keeps PowerPoint from
      // adding any others -- the box shows exactly the lines that were set.
      const extra = Math.round(l.width * 0.15);
      const x = l.align === "left" ? l.x : l.align === "right" ? l.x - extra : l.x - extra / 2;
      const body = (l.lines && l.lines.length ? l.lines : [l.content]).join("\n");
      slide.addText(body, {
        x: inch(x), y: inch(l.y), w: inch(l.width + extra), h: inch(l.height),
        fontFace: l.font_family,
        fontSize: Math.round(l.font_size * 0.75 * 10) / 10,
        bold: l.font_weight >= 600,
        color: l.color.replace("#", ""),
        align: l.align,
        valign: "middle",
        charSpacing: Math.round(l.letter_spacing * l.font_size * 0.75 * 10) / 10,
        lineSpacing: Math.round(l.font_size * l.line_height * 0.75 * 10) / 10,
        margin: 0,
        wrap: false,
        fit: "none",
        objectName: l.name,
      } as never);
    }
  }
  const out = await pres.write({ outputType: "nodebuffer" });
  return Buffer.from(out as ArrayBuffer);
}

// ── SVG ────────────────────────────────────────────────────────────────────

/** A standalone SVG: images embedded, text as `<text>`, plates as `<rect>`. */
export async function buildSvg(d: EditableDesign, assets: LayerAssets): Promise<Buffer> {
  const images: Record<string, Buffer> = { scene: await sharp(assets.scene).png().toBuffer() };
  if (assets.logo) images.logo = await sharp(assets.logo).png().toBuffer();
  return Buffer.from(editableSvg(d, images), "utf-8");
}

// ── Figma ──────────────────────────────────────────────────────────────────

/**
 * Figma node JSON: one FRAME whose children are RECTANGLE (image fills and
 * plates) and TEXT nodes, in Figma's own field names. Figma has no file
 * import for JSON, so this is what a plugin or the REST-shaped tooling
 * consumes; the SVG export is the direct import path (Figma keeps its text
 * as text).
 */
export async function buildFigma(d: EditableDesign, assets: LayerAssets): Promise<Buffer> {
  const rgb = (hex: string) => {
    const c = hexToRgb(hex);
    return { r: c.r / 255, g: c.g / 255, b: c.b / 255, a: 1 };
  };
  const images: Record<string, string> = {
    scene: `data:image/png;base64,${(await sharp(assets.scene).png().toBuffer()).toString("base64")}`,
  };
  if (assets.logo) images.logo = `data:image/png;base64,${(await sharp(assets.logo).png().toBuffer()).toString("base64")}`;

  const node = (l: EditableLayer) => {
    const base = { id: l.id, name: l.name, x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation, opacity: l.opacity };
    if (l.kind === "image") {
      const img = l as ImageLayer;
      return { ...base, type: "RECTANGLE", fills: [{ type: "IMAGE", scaleMode: img.role === "logo" ? "FIT" : "FILL", imageRef: img.asset }] };
    }
    if (l.kind === "effect") {
      const e = l as EffectLayer;
      return { ...base, type: "RECTANGLE", cornerRadius: e.radius, fills: [{ type: "SOLID", color: rgb(e.fill) }] };
    }
    const t = l as TextLayer;
    return {
      ...base,
      type: "TEXT",
      // Figma stores a text node's content as one string with real newlines.
      // The string still reads as the client's line; only its breaks are ours.
      characters: (t.lines && t.lines.length ? t.lines : [t.content]).join("\n"),
      /** The client's line with no layout applied, for anything that needs it verbatim. */
      exactContent: t.content,
      style: {
        fontFamily: t.font_family,
        fontWeight: t.font_weight,
        fontSize: t.font_size,
        letterSpacing: Math.round(t.letter_spacing * t.font_size * 100) / 100,
        lineHeightPx: Math.round(t.font_size * t.line_height),
        textAlignHorizontal: t.align === "center" ? "CENTER" : t.align.toUpperCase(),
        textAlignVertical: "CENTER",
      },
      fills: [{ type: "SOLID", color: rgb(t.color) }],
    };
  };

  const doc = {
    schema: "tido.figma-nodes.v1",
    note: "Figma node JSON for plugins and tooling. To open directly in Figma, import the SVG export: its text stays editable.",
    document: {
      id: "frame",
      type: "FRAME",
      name: d.brand?.name ? `${d.brand.name} design` : "TIDO design",
      width: d.canvas.width,
      height: d.canvas.height,
      fills: [{ type: "SOLID", color: rgb(d.canvas.background.color) }],
      children: d.layers.filter((l) => l.id !== "background").map(node),
    },
    images,
  };
  return Buffer.from(JSON.stringify(doc, null, 2), "utf-8");
}

export const FORMATS = {
  psd: { build: buildPsd, ext: "psd", mime: "image/vnd.adobe.photoshop" },
  pptx: { build: buildPptx, ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  svg: { build: buildSvg, ext: "svg", mime: "image/svg+xml" },
  figma: { build: buildFigma, ext: "figma.json", mime: "application/json" },
} as const;

export type EditableFormat = keyof typeof FORMATS;

/** Text layers in the design, for callers that must never ship a file without them. */
export function designTextCount(d: EditableDesign): number {
  return textLayers(d).length;
}
