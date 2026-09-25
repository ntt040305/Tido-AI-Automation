import type { LayoutGeometry } from "./LayoutGeometry";
import type { TypographySystem } from "./TypographySystem";
import type { TypographyPlan } from "./TypographyPlan";
import type { VisualComposition } from "./VisualComposition";
import type { CreativeBlueprint } from "./CreativeBlueprint";
import { colorFor, type BrandKit } from "./BrandKit";

/**
 * The Creative Document — a real intermediate representation.
 *
 * `DesignProject` records which layers were DECIDED. This records where they
 * ARE: every element carries position, size, z-index and opacity, taken from
 * `LayoutGeometry`, so the structure can be written to a format that expects
 * coordinates.
 *
 * The honesty boundary, stated once
 * ---------------------------------
 * The image provider returns one flat raster. Nothing here can separate a
 * rendered PNG back into background, product and type. So:
 *
 *   - `raster_is_flat` is true on every document this pipeline produces;
 *   - text elements are REAL text objects, because the system holds the string,
 *     the role and the geometry independently of the pixels — those survive a
 *     re-render and can be edited without one;
 *   - image-backed elements (background, product, shadow, reflection) carry
 *     their geometry as a PLAN, not as a handle on pixels, and `editable` is
 *     false on all of them;
 *   - export mappings are declared and `ready: false`. The mapping tables are
 *     real — they say which of this document's fields correspond to which
 *     concept in each target — but nothing writes those files.
 *
 * A document whose text is editable and whose product is not is an accurate
 * description of what this system can actually do today. Claiming more would
 * fail the first time somebody moved a layer.
 */

export type ElementType =
  | "background"
  | "product"
  | "shadow"
  | "reflection"
  | "effect"
  | "shape"
  | "text"
  | "graphic";

export type EditableProperty = "content" | "position" | "size" | "rotation" | "opacity" | "color" | "font";

export interface DocumentElement {
  id: string;
  type: ElementType;
  /** For text, the role. For imagery, what it depicts. */
  content: string;
  /** Percentages of the frame, origin top-left. Survives any output size. */
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  opacity: number;
  z_index: number;
  editable: boolean;
  editable_properties: EditableProperty[];
  /** Text objects only. Behavioural, never a typeface name. */
  text?: {
    /** Relative to the smallest text in the document. Never a point size. */
    scale: number;
    weight: string;
    tracking: string;
    alignment: "left" | "centre" | "right";
  };
  // ── Phase 5.1: the AI-readable editable structure. Optional so documents
  // built before it existed stay valid. ─────────────────────────────────────
  /** The coarse layer kind an editor works in. */
  layer_type?: LayerType;
  /** Text layers: the job the line does. `content` holds the line itself. */
  role?: string;
  /** Pixel geometry at the canvas size. `position` is the centre. */
  position_px?: { x: number; y: number };
  size_px?: { width: number; height: number };
  style?: LayerStyle;
}

export type LayerType = "image" | "text" | "background" | "effect";

export interface LayerStyle {
  /** Where an image layer's pixels come from. */
  source?: "rendered_raster" | "brand_logo";
  fit?: "cover" | "contain";
  font_family?: string | null;
  font_class?: string;
  font_weight?: string;
  font_size_px?: number;
  line_height?: number;
  letter_spacing?: string;
  text_align?: "left" | "centre" | "right";
  color?: string | null;
  /** The treatment the line gets -- a CTA's plate, a headline's dominance. */
  treatment?: string;
  contrast?: { minimum: number; against: string; ratio?: number };
  background_color?: string | null;
  description?: string;
}

/** The frame, in pixels, at the size the document is authored for. */
export interface Canvas {
  width: number;
  height: number;
  aspect_ratio: string;
  unit: "px";
}

export interface ExportMapping {
  target: "psd" | "svg" | "canva";
  ready: boolean;
  blocked_by: string;
  /** Which document field maps to which concept in the target. Real, and usable. */
  field_map: Record<string, string>;
}

export interface CreativeDocument {
  /** 2 for documents carrying the Phase 5.1 structure. */
  version?: number;
  canvas?: Canvas;
  /** "exact" when the client supplied text, "none" when the image carries none. */
  text_mode?: "exact" | "none";
  brand?: { name: string; colors: string[]; fonts: { heading?: string; body?: string } } | null;
  /**
   * Phase 5.5. Set when the render was made in Editable mode: the scene was
   * rendered without text or logo and every other layer placed from this
   * document. `editable` is then the export-grade representation (v3).
   */
  editable_mode?: boolean;
  editable?: import("./EditableDesign").EditableDesign;
  ratio: string;
  /**
   * The typography plan this document was laid out from. Carried on the
   * document because the document is the single source of truth: the
   * compositor reads the plan's reserved area and per-block line allowance
   * from here rather than being handed them separately, so what the image
   * prompt was written for and what the type is set into are one structure.
   */
  typography_plan?: TypographyPlan | null;
  elements: DocumentElement[];
  raster_is_flat: boolean;
  exports: ExportMapping[];
  /** Share of elements a person could change without a re-render. */
  editable_share: number;
}

const BLOCKED = "the image provider returns one flat raster; there is no layer data to write";

/** z-order follows the composition stack: background back, finishing front. */
const Z_OF: Record<ElementType, number> = {
  background: 0,
  effect: 10,
  shadow: 20,
  product: 30,
  reflection: 40,
  shape: 50,
  graphic: 60,
  text: 70,
};

function mappings(): ExportMapping[] {
  return [
    {
      target: "psd",
      ready: false,
      blocked_by: BLOCKED,
      field_map: {
        "element.id": "layer.name",
        "element.position": "layer.bounds origin (percent → pixels at export size)",
        "element.size": "layer.bounds extent",
        "element.z_index": "layer order in the layer stack",
        "element.opacity": "layer.opacity",
        "element.text.scale": "textLayer relative size against the document base",
        "element.text.alignment": "textLayer.paragraphStyle.alignment",
      },
    },
    {
      target: "svg",
      ready: false,
      blocked_by: BLOCKED,
      field_map: {
        "element.id": "id attribute",
        "element.position": "x / y attributes in percentage units",
        "element.size": "width / height attributes",
        "element.rotation": "transform=rotate()",
        "element.opacity": "opacity attribute",
        "element.z_index": "document order",
        "element.text.alignment": "text-anchor",
      },
    },
    {
      target: "canva",
      ready: false,
      blocked_by: BLOCKED,
      field_map: {
        "element.type": "element kind (TEXT / IMAGE / SHAPE)",
        "element.position": "left / top as a percentage of the page",
        "element.size": "width / height as a percentage of the page",
        "element.text.scale": "font size relative to the page base",
      },
    },
  ];
}

export interface DocumentInput {
  geometry?: LayoutGeometry | null;
  typography?: TypographySystem | null;
  composition?: VisualComposition | null;
  blueprint?: CreativeBlueprint | null;
  /** Phase 5.4. The brand's colours, fonts and logo. */
  brandKit?: BrandKit | null;
  /** Phase 5.1. The long edge, in pixels, the document is authored at. */
  canvasLongEdge?: number;
  /**
   * The typography plan the prompt was written from. Stored on the document
   * so the compositor sets type into the area the picture was composed to
   * leave, rather than into the area the pre-render grid guessed at.
   */
  plan?: TypographyPlan | null;
}

/** The canvas for a ratio at a long-edge size. */
export function canvasFor(ratio: string, longEdge = 2048): Canvas {
  const [w, h] = String(ratio || "1:1").split(":").map(Number);
  const rw = w > 0 ? w : 1;
  const rh = h > 0 ? h : 1;
  return rw >= rh
    ? { width: longEdge, height: Math.round((longEdge * rh) / rw), aspect_ratio: ratio || "1:1", unit: "px" }
    : { width: Math.round((longEdge * rw) / rh), height: longEdge, aspect_ratio: ratio || "1:1", unit: "px" };
}

const LAYER_OF: Record<ElementType, LayerType> = {
  background: "background",
  product: "image",
  shadow: "image",
  reflection: "image",
  graphic: "image",
  effect: "effect",
  shape: "effect",
  text: "text",
};

/**
 * Builds the document. Pure and total.
 *
 * Elements come only from decisions that exist: a zone in the geometry, a spec
 * in the typography, a layer in the composition. Nothing is placed that nothing
 * decided, so a document mirrors what was actually reasoned about.
 */
export function buildCreativeDocument(input: DocumentInput): CreativeDocument {
  const g = input.geometry || null;
  const t = input.typography || null;
  const elements: DocumentElement[] = [];

  const push = (
    id: string,
    type: ElementType,
    content: string,
    x: number,
    y: number,
    width: number,
    height: number,
    editable: boolean,
    editable_properties: EditableProperty[],
    text?: DocumentElement["text"]
  ) => {
    if (!content.trim()) return;
    elements.push({
      id,
      type,
      content: content.trim(),
      position: { x, y },
      size: { width, height },
      rotation: 0,
      opacity: 1,
      z_index: Z_OF[type],
      editable,
      editable_properties,
      ...(text ? { text } : {}),
    });
  };

  // ── imagery: geometry is a PLAN, never a handle on pixels ──────────────
  const bg = input.composition?.layers.find((l) => l.layer === "background");
  if (bg) push("background", "background", bg.content, 50, 50, 100, 100, false, []);

  const product = g?.zones.find((z) => z.name === "product");
  const hero = input.composition?.layers.find((l) => l.layer === "hero_product");
  if (product) {
    push(
      "product",
      "product",
      hero?.content || "the attached product",
      product.x,
      product.y,
      product.width,
      product.height,
      false,
      []
    );
    // A shadow is implied by the product having a position and a light having
    // been decided; it is geometry, not an invention.
    if (input.blueprint?.photography?.lighting_behavior) {
      push("shadow", "shadow", "contact shadow beneath the product", product.x, product.y + product.height / 2, product.width * 0.8, 8, false, []);
    }
  }

  const effect = input.composition?.layers.find((l) => l.layer === "finishing");
  if (effect) push("finishing", "effect", effect.content, 50, 50, 100, 100, false, []);

  // ── text: the one genuinely editable class ─────────────────────────────
  // Phase 5.1: text layers from the client's own lines, one layer per line,
  // each carrying the line verbatim. Lines that share a zone are stacked
  // inside it in the order they were written.
  const lineSpecs = (t?.specs || []).filter((s) => s.text);
  const byZone = new Map<string, typeof lineSpecs>();
  for (const spec of lineSpecs) byZone.set(spec.zone, [...(byZone.get(spec.zone) || []), spec]);
  // A line is never dropped: the words are the client's, and a document that
  // loses one no longer describes the render. Without its zone it takes the
  // lower-middle band, where it can still be moved.
  const FALLBACK_ZONE = { x: 50, y: 78, width: 80, height: 12 };
  lineSpecs.forEach((spec, i) => {
    const zone = g?.zones.find((z) => z.name === spec.zone) ?? FALLBACK_ZONE;
    const peers = byZone.get(spec.zone)!;
    const k = peers.indexOf(spec);
    const h = zone.height / peers.length;
    push(
      `text_${i + 1}_${spec.role}`,
      "text",
      spec.text!,
      zone.x,
      zone.y - zone.height / 2 + h * (k + 0.5),
      zone.width,
      h,
      true,
      // Content is editable by the PERSON -- these are their words. The AI never
      // edits it; that rule lives in the text requirement, not here.
      ["content", "position", "size", "rotation", "opacity", "color", "font"],
      { scale: spec.scale, weight: spec.weight, tracking: spec.tracking, alignment: spec.alignment },
    );
    const el = elements[elements.length - 1];
    el.role = spec.role;
    el.style = {
      font_family: spec.font_family ?? null,
      font_class: spec.font_class,
      font_weight: spec.weight,
      line_height: spec.line_height,
      letter_spacing: spec.tracking,
      text_align: spec.alignment,
      color: spec.color ?? null,
      treatment: spec.treatment,
      contrast: spec.contrast,
    };
  });

  for (const spec of lineSpecs.length ? [] : t?.specs || []) {
    const zone = g?.zones.find((z) => z.name === spec.zone);
    if (!zone) continue;
    push(
      `text_${spec.role}`,
      "text",
      spec.role,
      zone.x,
      zone.y,
      zone.width,
      zone.height,
      true,
      ["content", "position", "size", "color", "font"],
      { scale: spec.scale, weight: spec.weight, tracking: spec.tracking, alignment: spec.alignment }
    );
  }

  const logo = g?.zones.find((z) => z.name === "logo");
  if (logo) push("logo", "graphic", input.brandKit?.has_logo ? `${input.brandKit.name} logo` : "the attached logo", logo.x, logo.y, logo.width, logo.height, false, []);

  // Phase 5.1: the structure an editor reads -- canvas, layer kinds, pixels,
  // styling. Only when a Phase 5 input was given, so older callers get the
  // document they always got.
  const phase5 = Boolean(input.canvasLongEdge || input.brandKit || lineSpecs.length || t?.disabled);
  const ratio = g?.ratio || "1:1";
  const canvas = phase5 ? canvasFor(ratio, input.canvasLongEdge || 2048) : undefined;
  if (canvas) {
    const bgColor = colorFor(input.brandKit, "background");
    for (const e of elements) {
      e.layer_type = LAYER_OF[e.type];
      e.position_px = { x: Math.round((e.position.x / 100) * canvas.width), y: Math.round((e.position.y / 100) * canvas.height) };
      e.size_px = { width: Math.round((e.size.width / 100) * canvas.width), height: Math.round((e.size.height / 100) * canvas.height) };
      if (e.type === "text" && e.style) {
        // The size a line of this role reaches in its box: the box height
        // divided across its line height, capped by its relative scale.
        e.style.font_size_px = Math.round(Math.min(e.size_px.height / (e.style.line_height || 1.2), (canvas.height / 40) * (e.text?.scale || 1)));
      } else if (e.type === "background") {
        e.style = { background_color: bgColor, description: e.content };
      } else if (e.id === "logo") {
        e.style = { source: "brand_logo", fit: "contain" };
      } else if (e.layer_type === "image") {
        e.style = { source: "rendered_raster", fit: "contain", description: e.content };
      } else {
        e.style = { description: e.content };
      }
    }
  }

  const editable = elements.filter((e) => e.editable).length;
  return {
    ...(input.plan ? { typography_plan: input.plan } : {}),
    ...(canvas
      ? {
          version: 2,
          canvas,
          text_mode: lineSpecs.length ? ("exact" as const) : ("none" as const),
          brand: input.brandKit
            ? { name: input.brandKit.name, colors: input.brandKit.colors.map((c) => c.hex), fonts: input.brandKit.fonts }
            : null,
        }
      : {}),
    ratio,
    elements: elements.sort((a, b) => a.z_index - b.z_index),
    raster_is_flat: true,
    exports: mappings(),
    editable_share: elements.length ? Math.round((editable / elements.length) * 100) / 100 : 0,
  };
}

/** Counts only. Reports the honest editability. */
export function documentTelemetry(d: CreativeDocument | null | undefined) {
  if (!d) return { creative_document: false };
  const byType: Record<string, number> = {};
  for (const e of d.elements) byType[e.type] = (byType[e.type] || 0) + 1;
  return {
    creative_document: true,
    ratio: d.ratio,
    elements: d.elements.length,
    by_type: byType,
    text_objects: d.elements.filter((e) => e.type === "text").length,
    editable_share: d.editable_share,
    raster_is_flat: d.raster_is_flat,
    exports_ready: d.exports.filter((e) => e.ready).map((e) => e.target),
  };
}
