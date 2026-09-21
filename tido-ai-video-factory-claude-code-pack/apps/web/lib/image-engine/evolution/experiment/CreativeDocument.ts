import type { LayoutGeometry } from "./LayoutGeometry";
import type { TypographySystem } from "./TypographySystem";
import type { VisualComposition } from "./VisualComposition";
import type { CreativeBlueprint } from "./CreativeBlueprint";

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
}

export interface ExportMapping {
  target: "psd" | "svg" | "canva";
  ready: boolean;
  blocked_by: string;
  /** Which document field maps to which concept in the target. Real, and usable. */
  field_map: Record<string, string>;
}

export interface CreativeDocument {
  ratio: string;
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
}

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
  for (const spec of t?.specs || []) {
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
  if (logo) push("logo", "graphic", "the attached logo", logo.x, logo.y, logo.width, logo.height, false, []);

  const editable = elements.filter((e) => e.editable).length;
  return {
    ratio: g?.ratio || "1:1",
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
