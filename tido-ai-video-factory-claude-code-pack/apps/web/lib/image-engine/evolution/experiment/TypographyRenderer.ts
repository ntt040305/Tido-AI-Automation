import type { LayoutGeometry } from "./LayoutGeometry";
import type { TypographySystem, TextSpec } from "./TypographySystem";

/**
 * The Typography Renderer — real text, drawn by us, not by the image model.
 *
 * Why this exists
 * ---------------
 * Image models are unreliable at text and this project has the measurements to
 * prove it: across the live benchmarks the renderer produced "SLOB SPEEPED" for
 * SLOW STEEPED, "ETHIGALLY SOURGED" for ETHICALLY SOURCED, "12 FL G2" for
 * 12 FL OZ, and in one run a completely blank label. Every one of those is a
 * model guessing at letterforms.
 *
 * So the words stop being the model's problem. The model renders the picture;
 * this draws the type as vector text and composites it. The result is correct
 * by construction — a headline cannot be misspelled by a renderer that never
 * saw it.
 *
 * Text stays text
 * ---------------
 * The SVG this builds is the same SVG the exporter writes. Compositing
 * rasterises a copy for the preview; the vector source survives, which is what
 * makes the output genuinely editable rather than described as editable.
 *
 * Fonts
 * -----
 * Generic CSS families only — `serif`, `sans-serif`. Not a house style and not
 * a typeface choice: they are the minimum needed to draw a glyph at all, and
 * they map from the typography personality's own stroke behaviour rather than
 * from a product category.
 */

export interface TextLayer {
  id: string;
  content: string;
  role: TextSpec["role"];
  /** Percentages of the frame, origin top-left. */
  position: { x: number; y: number };
  size: { width: number; height: number };
  /** Relative to the smallest text. Resolved to pixels at render time. */
  scale: number;
  weight: number;
  /** Letter spacing in ems. */
  tracking: number;
  alignment: "left" | "centre" | "right";
  color: string;
  opacity: number;
}

export interface TypographyRenderResult {
  layers: TextLayer[];
  /** The vector source. What the exporter writes and what compositing draws. */
  svg: string;
  /** Present only when a base image was supplied and compositing succeeded. */
  composited?: Buffer;
  /** Why compositing did not happen, when it did not. */
  skipped?: string;
}

/** Personality → stroke weight and family. Behaviour, not a typeface. */
const FONT_OF: Record<string, { family: string; weight: number; tracking: number }> = {
  editorial: { family: "serif", weight: 400, tracking: 0.06 },
  technical: { family: "sans-serif", weight: 500, tracking: -0.01 },
  crafted: { family: "serif", weight: 400, tracking: 0.02 },
  direct: { family: "sans-serif", weight: 700, tracking: 0 },
  quiet: { family: "sans-serif", weight: 300, tracking: 0.08 },
  assertive: { family: "sans-serif", weight: 800, tracking: -0.02 },
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface TypographyRenderInput {
  geometry?: LayoutGeometry | null;
  typography?: TypographySystem | null;
  /** The client's strings, keyed by the role they were assigned. */
  copy?: { role: string; text: string }[];
  /** Output size in pixels. Percentages resolve against this. */
  width?: number;
  height?: number;
  /** Colour for the type. Taken from the design system where one exists. */
  color?: string;
}

/**
 * Builds the text layers and their vector source. Pure — no I/O.
 *
 * Returns no layers when there is no geometry to place against or no copy to
 * set. Drawing text at a guessed position would be worse than letting the
 * image model try, because it would be confidently wrong.
 */
export function buildTextLayers(input: TypographyRenderInput): TextLayer[] {
  const g = input.geometry;
  const t = input.typography;
  if (!g || !t?.specs.length) return [];

  const personality = String(t.personality?.value || "direct");
  const font = FONT_OF[personality] || FONT_OF.direct;
  const color = input.color || "#111111";

  const layers: TextLayer[] = [];
  for (const spec of t.specs) {
    const zone = g.zones.find((z) => z.name === spec.zone);
    if (!zone) continue;
    // A layer needs a string. The role tells us which of the client's strings
    // belongs here; without a match there is nothing to draw.
    const match = (input.copy || []).find(
      (c) => c.role.toLowerCase() === spec.role.toLowerCase() ||
             (spec.role === "headline" && /headline|offer/i.test(c.role)) ||
             (spec.role === "body" && /supporting|product_name/i.test(c.role))
    );
    if (!match?.text?.trim()) continue;

    layers.push({
      id: `text_${spec.role}`,
      content: match.text.trim(),
      role: spec.role,
      position: { x: zone.x, y: zone.y },
      size: { width: zone.width, height: zone.height },
      scale: spec.scale,
      weight: font.weight,
      tracking: font.tracking,
      alignment: spec.alignment,
      color,
      opacity: 1,
    });
  }
  return layers;
}

/** The SVG source. Text remains text; nothing here is rasterised. */
export function buildSvg(layers: TextLayer[], width: number, height: number, personality = "direct"): string {
  const font = FONT_OF[personality] || FONT_OF.direct;
  // Base size is a fraction of the shorter edge so type scales with the frame.
  const base = Math.min(width, height) * 0.032;
  const anchor = (a: TextLayer["alignment"]) => (a === "left" ? "start" : a === "right" ? "end" : "middle");

  const body = layers
    .map((l) => {
      const px = (l.position.x / 100) * width;
      const py = (l.position.y / 100) * height;
      const size = Math.round(base * l.scale);
      return [
        `  <text x="${px.toFixed(1)}" y="${py.toFixed(1)}"`,
        ` id="${esc(l.id)}"`,
        ` font-family="${font.family}"`,
        ` font-size="${size}"`,
        ` font-weight="${l.weight}"`,
        ` letter-spacing="${(l.tracking * size).toFixed(2)}"`,
        ` text-anchor="${anchor(l.alignment)}"`,
        ` dominant-baseline="middle"`,
        ` fill="${esc(l.color)}"`,
        ` opacity="${l.opacity}">`,
        esc(l.content),
        `</text>`,
      ].join("");
    })
    .join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    body,
    `</svg>`,
  ].join("\n");
}

/**
 * Composites the type onto a rendered image.
 *
 * `sharp` is required lazily so that every pure path above stays importable in
 * environments without it, and a compositing failure degrades to "no text
 * drawn" rather than taking a paid render down.
 */
export async function renderTypography(
  input: TypographyRenderInput & { baseImage?: Buffer }
): Promise<TypographyRenderResult> {
  const layers = buildTextLayers(input);
  const width = input.width || 1024;
  const height = input.height || 1024;
  const personality = String(input.typography?.personality?.value || "direct");
  const svg = buildSvg(layers, width, height, personality);

  if (!layers.length) return { layers, svg, skipped: "no text layers resolved: no geometry, no specs, or no copy" };
  if (!input.baseImage) return { layers, svg, skipped: "no base image supplied; the vector source was built anyway" };

  try {
    const sharp = (await import("sharp")).default;
    const composited = await sharp(input.baseImage)
      .resize(width, height, { fit: "cover" })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer();
    return { layers, svg, composited };
  } catch (err: any) {
    return { layers, svg, skipped: `compositing failed: ${err?.message || String(err)}` };
  }
}

/** Counts and roles only — never the client's copy. */
export function typographyRenderTelemetry(r: TypographyRenderResult | null | undefined) {
  if (!r) return { typography_render: false };
  return {
    typography_render: true,
    layers: r.layers.length,
    roles: r.layers.map((l) => l.role),
    svg_chars: r.svg.length,
    composited: Boolean(r.composited),
    skipped: r.skipped ?? null,
  };
}

/**
 * The instruction the image model gets when we are drawing the text ourselves.
 *
 * Without this the model renders its own words underneath ours and the frame
 * carries both — which is worse than either.
 */
export const NO_TEXT_DIRECTIVE =
  "RENDER NO TEXT. Produce the photograph only: no words, letters, numerals, captions, labels, logos or lettering of any kind anywhere in the frame, and leave the composed empty areas genuinely empty. The typography is set separately and composited afterwards; any text rendered here will collide with it.";
