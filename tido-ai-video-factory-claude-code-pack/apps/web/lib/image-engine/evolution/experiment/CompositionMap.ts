/**
 * The Composition Map — where the picture actually put its content.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not reverse engineering. Nothing here recovers a design from a PNG,
 * segments a product out of a render, or reconstructs layers that were never
 * separate. The engine renders the scene itself, holds the buffer in memory,
 * and asks it two questions a designer asks by looking: where is the detail,
 * and how light is it there. The answers are a placement aid, never a source of
 * truth — the design document remains the only thing that says what a layer IS.
 *
 * WHY IT IS NECESSARY
 * -------------------
 * The layout geometry is planned BEFORE the render, from the aspect ratio and
 * the copy roles. It has to be: the prompt is written from it. But the image
 * model is not a compositor. It is told to put the product on the right third
 * and it puts it somewhere near the right third, and the difference between
 * "near" and "at" is a headline crossing a bottle's shoulder.
 *
 * Measured on this engine's own geometry: on a 1:1 frame the planned headline
 * band and the planned product box intersect, and `scoreLayout` says so in its
 * own notes — "2 copy zone(s) overlap the product" — while nothing reads the
 * note. This module is what reads it, against the render rather than the plan.
 *
 * THE MEASURES
 * ------------
 * Two per cell, both cheap and both honest about what they are:
 *
 *   luminance  Relative luminance, WCAG's own formula. Decides ink colour and
 *              the contrast a line will actually achieve.
 *   detail     Local gradient energy — how much the cell differs from its
 *              neighbours. High detail is an edge: a product silhouette, a
 *              label, a hard shadow, a busy pattern. Type over high detail is
 *              unreadable however well its mean contrast scores, which is why
 *              luminance alone was never enough.
 *
 * Pure. The caller supplies the downsampled pixels; `sharp` never appears here.
 */

/** A rectangle in frame percentages, origin top-left. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Region extends Box {
  /** Mean relative luminance, 0-1. */
  luminance: number;
  /** Mean gradient energy, 0-1. Higher means busier. */
  detail: number;
  /**
   * Standard deviation of luminance across the region, 0-1.
   *
   * The measure a mean cannot give. A line half on a lit product and half on a
   * shadowed ground averages to a comfortable mid-tone and scores well on
   * contrast, while in the frame one half of the word is invisible. Anything
   * above about 0.18 is a line sitting across a tonal edge.
   */
  spread: number;
}

export interface CompositionMap {
  /** Cells per side of the square sampling grid. */
  size: number;
  /** Relative luminance per cell, row-major. */
  luminance: number[];
  /** Gradient energy per cell, row-major, normalised to the frame's own max. */
  detail: number[];
  /**
   * The busiest coherent area — in a commercial render, the product and its
   * immediate staging. Stated as a percentage box so it survives any output
   * size. Null when the frame has no region busier than the rest of it, which
   * is what a flat backdrop looks like.
   */
  product: Box | null;
  /** The single busiest cell's centre: where the eye lands first. */
  focal: { x: number; y: number } | null;
  /** Mean luminance of the whole frame. */
  mean_luminance: number;
  /** Mean detail of the whole frame. Frames above this are busy everywhere. */
  mean_detail: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** sRGB channel to linear. WCAG's own curve. */
function linear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export interface MapInput {
  /** Raw RGB, 3 bytes per pixel, row-major, `size`×`size`. */
  rgb: ArrayLike<number>;
  size: number;
}

/**
 * Builds the map from a downsampled RGB grid.
 *
 * The grid is deliberately small. At 64×64 a cell is about 1.5% of the frame,
 * which is finer than any placement decision this engine makes, and the whole
 * map costs one resize the compositor already performs for ink colour.
 */
export function buildCompositionMap(input: MapInput): CompositionMap {
  const G = Math.max(2, Math.floor(input.size));
  const rgb = input.rgb;
  const luminance: number[] = new Array(G * G);
  for (let i = 0; i < G * G; i++) {
    const p = i * 3;
    luminance[i] = clamp01(
      0.2126 * linear(Number(rgb[p] || 0)) + 0.7152 * linear(Number(rgb[p + 1] || 0)) + 0.0722 * linear(Number(rgb[p + 2] || 0)),
    );
  }

  // Gradient energy: the mean absolute luminance difference to the four
  // neighbours. A Sobel would be more principled and no more useful at this
  // resolution, where a cell already spans dozens of real pixels.
  const raw: number[] = new Array(G * G).fill(0);
  let max = 0;
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const i = y * G + x;
      let sum = 0;
      let n = 0;
      if (x > 0) { sum += Math.abs(luminance[i] - luminance[i - 1]); n++; }
      if (x < G - 1) { sum += Math.abs(luminance[i] - luminance[i + 1]); n++; }
      if (y > 0) { sum += Math.abs(luminance[i] - luminance[i - G]); n++; }
      if (y < G - 1) { sum += Math.abs(luminance[i] - luminance[i + G]); n++; }
      raw[i] = n ? sum / n : 0;
      if (raw[i] > max) max = raw[i];
    }
  }
  const detail = max > 0 ? raw.map((v) => v / max) : raw;

  const mean = (a: number[]) => a.reduce((n, v) => n + v, 0) / (a.length || 1);
  const mean_luminance = mean(luminance);
  const mean_detail = mean(detail);

  return {
    size: G,
    luminance,
    detail,
    product: productBox(detail, G),
    focal: focalPoint(detail, G),
    mean_luminance,
    mean_detail,
  };
}

/**
 * The busiest coherent area, as a percentage box.
 *
 * Taken as the bounding box of the cells in the top quartile of detail, then
 * trimmed: a bounding box over scattered cells would cover the whole frame and
 * mean nothing. Trimming drops rows and columns that contribute less than a
 * tenth of the busy cells, which removes a rim of noise at a frame edge while
 * keeping a product that genuinely spans the frame.
 */
function productBox(detail: number[], G: number): Box | null {
  const mean = detail.reduce((n, v) => n + v, 0) / (detail.length || 1);
  // Relative to the frame's own maximum (detail is normalised to it) and to its
  // own average, whichever is higher. A percentile was tried first and is
  // wrong: a product occupying a sixth of the frame puts the 75th percentile
  // squarely in the flat background, so the threshold came out at zero and
  // every frame reported "no product".
  const cut = Math.max(0.15, mean * 2.5);

  const cols = new Array(G).fill(0);
  const rows = new Array(G).fill(0);
  let busy = 0;
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      if (detail[y * G + x] >= cut) { cols[x]++; rows[y]++; busy++; }
    }
  }
  const share = busy / (G * G);
  // Nothing coherent to protect: a flat sweep has no busy cells, and a frame
  // that is busy everywhere has no area that is busier than the rest of it.
  // Saying "the product is the whole frame" would move every line off the
  // canvas, so this says nothing instead.
  if (share < 0.01 || share > 0.6) return null;

  const span = (counts: number[]) => {
    const floor = Math.max(1, Math.round(busy / G / 6));
    let lo = 0;
    let hi = G - 1;
    while (lo < hi && counts[lo] < floor) lo++;
    while (hi > lo && counts[hi] < floor) hi--;
    return [lo, hi] as const;
  };
  const [x0, x1] = span(cols);
  const [y0, y1] = span(rows);
  // A box that covers three quarters of the frame is not a product, it is a
  // frame that is busy everywhere. Returning it would push every line off the
  // canvas chasing clear space that does not exist, so this says nothing
  // instead and lets the contrast path protect the type.
  if (((x1 - x0 + 1) * (y1 - y0 + 1)) / (G * G) > 0.75) return null;
  const toPct = (v: number) => (v / G) * 100;
  return {
    x: Math.round(toPct(x0)),
    y: Math.round(toPct(y0)),
    width: Math.round(toPct(x1 - x0 + 1)),
    height: Math.round(toPct(y1 - y0 + 1)),
  };
}

/** The busiest 3×3 neighbourhood's centre, in frame percentages. */
function focalPoint(detail: number[], G: number): { x: number; y: number } | null {
  let best = -1;
  let bx = 0;
  let by = 0;
  for (let y = 1; y < G - 1; y++) {
    for (let x = 1; x < G - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += detail[(y + dy) * G + x + dx];
      if (sum > best) { best = sum; bx = x; by = y; }
    }
  }
  if (best <= 0) return null;
  return { x: Math.round(((bx + 0.5) / G) * 100), y: Math.round(((by + 0.5) / G) * 100) };
}

/** Cell indices a percentage box covers, clamped to the grid. */
function cellsIn(map: CompositionMap, box: Box): { x0: number; x1: number; y0: number; y1: number } {
  const G = map.size;
  const at = (pct: number) => Math.max(0, Math.min(G - 1, Math.floor((pct / 100) * G)));
  return {
    x0: at(box.x),
    x1: Math.max(at(box.x), at(box.x + box.width - 0.0001)),
    y0: at(box.y),
    y1: Math.max(at(box.y), at(box.y + box.height - 0.0001)),
  };
}

/** Mean luminance and detail under a percentage box. */
export function regionOf(map: CompositionMap, box: Box): Region {
  const { x0, x1, y0, y1 } = cellsIn(map, box);
  let lum = 0;
  let lum2 = 0;
  let det = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = map.luminance[y * map.size + x];
      lum += v;
      lum2 += v * v;
      det += map.detail[y * map.size + x];
      n++;
    }
  }
  if (!n) return { ...box, luminance: map.mean_luminance, detail: map.mean_detail, spread: 0 };
  const mean = lum / n;
  return { ...box, luminance: mean, detail: det / n, spread: Math.sqrt(Math.max(0, lum2 / n - mean * mean)) };
}

/**
 * How well a box would carry type, 0-10.
 *
 * Three things, in the order they ruin a line:
 *
 *   quiet      Low detail. An edge through a word is unreadable at any contrast.
 *   even       Low variance in luminance across the box, so the line is not
 *              half on a highlight and half in a shadow.
 *   clear      Distance from the product box. Type over a product is a defect
 *              even where the pixels happen to be quiet, because the product is
 *              what the client is selling.
 */
export function placementScore(map: CompositionMap, box: Box): number {
  const { x0, x1, y0, y1 } = cellsIn(map, box);
  let n = 0;
  let det = 0;
  let lum = 0;
  let lum2 = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * map.size + x;
      det += map.detail[i];
      lum += map.luminance[i];
      lum2 += map.luminance[i] * map.luminance[i];
      n++;
    }
  }
  if (!n) return 0;
  const meanDet = det / n;
  const variance = Math.max(0, lum2 / n - (lum / n) * (lum / n));

  const quiet = 10 * Math.max(0, 1 - meanDet / 0.35);
  const even = 10 * Math.max(0, 1 - Math.sqrt(variance) / 0.28);
  const clear = map.product ? 10 * (1 - overlapShare(box, map.product)) : 10;

  return Math.round(((quiet * 0.4 + even * 0.25 + clear * 0.35) + Number.EPSILON) * 100) / 100;
}

/** Share of `box` that falls inside `other`, 0-1. */
export function overlapShare(box: Box, other: Box): number {
  const w = Math.max(0, Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x));
  const h = Math.max(0, Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y));
  const area = box.width * box.height;
  return area > 0 ? (w * h) / area : 0;
}

/** Do two boxes touch at all? */
export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * The best places in the frame for a box of this size, best first.
 *
 * A coarse sweep rather than an optimiser: the grid is 64 cells a side, a step
 * of 2 cells is about 3% of the frame, and a placement decision finer than 3%
 * is below the accuracy of everything upstream of it.
 */
export function bestPlacements(
  map: CompositionMap,
  size: { width: number; height: number },
  bounds: Box,
  limit = 6,
): (Box & { score: number })[] {
  const step = 100 / map.size * 2;
  const out: (Box & { score: number })[] = [];
  const maxX = bounds.x + bounds.width - size.width;
  const maxY = bounds.y + bounds.height - size.height;
  if (maxX < bounds.x || maxY < bounds.y) return out;
  for (let y = bounds.y; y <= maxY + 0.001; y += step) {
    for (let x = bounds.x; x <= maxX + 0.001; x += step) {
      const box = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, ...size };
      out.push({ ...box, score: placementScore(map, box) });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/** Counts and geometry only — never pixels, never the client's copy. */
export function compositionMapTelemetry(m: CompositionMap | null | undefined) {
  if (!m) return { composition_map: false };
  return {
    composition_map: true,
    grid: m.size,
    product_box: m.product ? `${m.product.x},${m.product.y} ${m.product.width}x${m.product.height}` : null,
    focal: m.focal ? `${m.focal.x},${m.focal.y}` : null,
    mean_luminance: Math.round(m.mean_luminance * 100) / 100,
    mean_detail: Math.round(m.mean_detail * 100) / 100,
  };
}
