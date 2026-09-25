import type { Box, CompositionMap } from "./CompositionMap";
import { bestPlacements, overlapShare, placementScore, regionOf } from "./CompositionMap";
import { contrastRatio, normalizeHex, readableOn } from "./BrandKit";

/**
 * The Text Layout Engine — the part that makes type look designed.
 *
 * WHAT IT REPLACES
 * ----------------
 * The compositor used to do one thing with a line: put it at the centre of its
 * planned zone on a single line, shrinking the font until it fitted. Measured
 * on a three-line Vietnamese brief, that produced a headline at 35px under a
 * subheadline at 41px — the most important line set smaller than the line
 * supporting it, on every frame, deterministically, because the headline was
 * the longest string and so shrank the most.
 *
 * That is the whole defect behind "poor hierarchy" and "typography looks pasted
 * on": there was no typesetting, only fitting.
 *
 * WHAT IT DOES INSTEAD
 * --------------------
 * Sets a column of type the way a designer sets one:
 *
 *   1. It finds the column. Where a composition map exists it is read from the
 *      RENDER, so the copy goes where the picture is actually quiet rather than
 *      where the pre-render plan hoped it would be.
 *   2. It solves one base size for the whole column, so every block's size is a
 *      ratio of the same number and hierarchy cannot invert.
 *   3. It breaks lines — balanced, never mid-word — up to the number of lines
 *      the plan allows for that role, and only then reduces size.
 *   4. It stacks with optical spacing, so blocks read as one statement.
 *   5. It checks contrast against the pixels each line will actually sit on and
 *      adds a scrim where the picture cannot carry the line on its own.
 *
 * WORDS ARE NEVER TOUCHED
 * -----------------------
 * Line breaking changes where a line wraps, never what it says. `content` on
 * the way out is the same string that came in, character for character; the
 * visual lines are carried beside it. Every exporter writes `content` as the
 * text and the lines as its layout, which is what keeps "one editable layer,
 * exact content preserved" true through PSD, PPTX, SVG and Figma.
 *
 * Pure. No I/O, no model call.
 */

export type Role = "headline" | "subheadline" | "body" | "cta";
export type Align = "left" | "center" | "right";

export interface BlockInput {
  id: string;
  role: Role;
  /** The client's line, exactly. */
  content: string;
  /** Read order. 1 is read first. */
  hierarchy: number;
  /** The most visual lines this block may run to before size must give way. */
  max_lines: number;
  /** Size relative to the smallest block. Never a point size. */
  scale: number;
  alignment: Align;
  font_family: string;
  font_fallback: "serif" | "sans-serif";
  font_weight: number;
  line_height: number;
  /** In ems. */
  letter_spacing: number;
  /** A colour the brand fixed, or null to decide against the picture. */
  color: string | null;
  /** A plate this block is set on, when one was decided (the CTA's). */
  plate: string | null;
}

export interface Scrim {
  fill: string;
  opacity: number;
  radius: number;
  x: number;
  y: number;
  width: number;
  height: number;
  because: string;
}

export interface LaidOutBlock {
  id: string;
  role: Role;
  /** Unchanged. The exact string that came in. */
  content: string;
  /** The visual lines, in order. Joined by a space they reproduce `content`. */
  lines: string[];
  font_size: number;
  line_height: number;
  font_weight: number;
  letter_spacing: number;
  font_family: string;
  font_fallback: "serif" | "sans-serif";
  align: Align;
  color: string;
  /** Contrast achieved against what is behind it. */
  contrast: number;
  /** Canvas pixels, top-left origin. Encloses every line. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** A plate or a softening wash, when the picture could not carry the line. */
  scrim: Scrim | null;
}

export interface LayoutResult {
  blocks: LaidOutBlock[];
  /** The column the type was set in, in canvas pixels. */
  column: { x: number; y: number; width: number; height: number };
  /** What the engine had to do, for the record and for the critic. */
  notes: string[];
  /** 0-10, how quiet the chosen column is. 10 with no composition map. */
  placement_score: number;
  /** True when the column was moved off the pre-render plan to clear the product. */
  moved_for_product: boolean;
}

// ── measurement ────────────────────────────────────────────────────────────

/**
 * Advance width of a string, in ems.
 *
 * Per-character rather than a flat factor, because the flat factor is why a
 * headline of narrow letters and a headline of wide ones were fitted to the
 * same size. The table is a serviceable average across the grotesques and
 * transitionals these exports fall back to; it is deliberately a little
 * generous, since a line that measures slightly wide is set slightly small and
 * a line that measures slightly narrow overruns its column.
 *
 * Combining diacritics carry no advance at all, which is the correction that
 * matters for Vietnamese: "Giảm giá 50%" is 12 code points and 12 advances,
 * not 15.
 */
const NARROW = new Set([..."ijltIJ.,;:'`|!’"]);
const WIDE = new Set([..."mwMW@%"]);
const CAPS_EXTRA = 0.06;

export function advanceEms(text: string, weight: number, letterSpacing: number): number {
  let ems = 0;
  let n = 0;
  for (const ch of text.normalize("NFD")) {
    const code = ch.codePointAt(0) || 0;
    // Combining marks: U+0300–U+036F. Drawn over the base letter, no advance.
    if (code >= 0x0300 && code <= 0x036f) continue;
    n++;
    if (ch === " ") { ems += 0.27; continue; }
    if (NARROW.has(ch)) { ems += 0.3; continue; }
    if (WIDE.has(ch)) { ems += 0.87; continue; }
    if (ch >= "0" && ch <= "9") { ems += 0.56; continue; }
    ems += ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 0.64 + CAPS_EXTRA : 0.52;
  }
  // Heavier faces set wider; letter spacing adds one advance per character.
  const weightFactor = weight >= 800 ? 1.07 : weight >= 700 ? 1.04 : weight <= 300 ? 0.97 : 1;
  return ems * weightFactor + n * letterSpacing;
}

/** Advance width in pixels at a given size. */
export function measure(text: string, size: number, weight: number, letterSpacing: number): number {
  return advanceEms(text, weight, letterSpacing) * size;
}

// ── line breaking ──────────────────────────────────────────────────────────

/**
 * Breaks a string into at most `maxLines` visual lines that each fit `width`.
 *
 * Greedy first, then balanced: greedy wrapping leaves a one-word last line,
 * which on a two-line headline is the single most obvious tell that type was
 * placed by a machine. Balancing re-flows to the narrowest width at which the
 * same number of lines still fits, which evens the rag without changing the
 * break count.
 *
 * Returns null when the string cannot fit in `maxLines` at this size — the
 * caller's signal to reduce the size rather than to break the rule.
 */
export function breakLines(text: string, width: number, size: number, weight: number, tracking: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const fits = (s: string) => measure(s, size, weight, tracking) <= width;

  // A single word longer than the column cannot be broken: this engine does not
  // hyphenate the client's copy.
  if (words.some((w) => !fits(w))) return null;

  const greedy = (w: number): string[] => {
    const out: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, size, weight, tracking) <= w) line = next;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out;
  };

  const first = greedy(width);
  if (first.length > maxLines) return null;
  if (first.length === 1) return first;

  // Balance: the narrowest column that still produces the same line count.
  let lo = Math.max(...words.map((w) => measure(w, size, weight, tracking)));
  let hi = width;
  let best = first;
  for (let i = 0; i < 12 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    const candidate = greedy(mid);
    if (candidate.length <= first.length) { best = candidate; hi = mid; }
    else lo = mid;
  }
  return best;
}

// ── layout ─────────────────────────────────────────────────────────────────

export interface LayoutInput {
  canvas: { width: number; height: number };
  blocks: BlockInput[];
  /** The area the plan reserved, in frame percentages. */
  area: Box;
  /** Safe inset as a percentage of the frame. Nothing critical crosses it. */
  safe_inset: number;
  /** The rendered scene, read. Absent, the plan's area is used as given. */
  map?: CompositionMap | null;
  /** The brand's text colour, when it fixed one. */
  brand_text_color?: string | null;
  /** Minimum size in pixels a line may be set at before the layout gives up. */
  min_font_size?: number;
}

const pct = (v: number, total: number) => (v / 100) * total;
const round = (n: number) => Math.round(n * 100) / 100;

/** Gap below a block, as a fraction of its own size. Larger after a headline. */
const GAP_AFTER: Record<Role, number> = { headline: 0.55, subheadline: 0.45, body: 0.4, cta: 0.3 };

/**
 * Sets the column. Pure and total.
 *
 * Returns an empty block list when there is nothing to set — never a guessed
 * placement, because type drawn at a guessed position is worse than no type at
 * all: it is confidently wrong and it ships.
 */
export function layoutText(input: LayoutInput): LayoutResult {
  const notes: string[] = [];
  const W = input.canvas.width;
  const H = input.canvas.height;
  const blocks = [...input.blocks].sort((a, b) => a.hierarchy - b.hierarchy);
  if (!blocks.length) {
    return { blocks: [], column: { x: 0, y: 0, width: 0, height: 0 }, notes, placement_score: 10, moved_for_product: false };
  }

  // ── the column, in frame percentages ─────────────────────────────────────
  const inset = Math.max(0, input.safe_inset || 0);
  const safe: Box = { x: inset, y: inset, width: 100 - inset * 2, height: 100 - inset * 2 };
  const planned = clampTo(input.area, safe);

  let column = planned;
  let moved = false;
  let score = 10;
  if (input.map) {
    score = placementScore(input.map, planned);
    const product = input.map.product;
    const crosses = product ? overlapShare(planned, product) : 0;
    // Only move for a real problem. A column is not relocated because some
    // other part of the frame scored a fraction higher -- the pre-render plan
    // is what the picture was composed for, and second-guessing it by a point
    // would undo the composition the prompt bought.
    if (crosses > 0.18 || score < 6) {
      // Moving is tried at the planned width first, then at progressively
      // narrower columns. A designer whose column will not fit beside the
      // product narrows the column; they do not set the headline across the
      // bottle. A narrower column costs size or gains a line, both of which
      // this engine handles, and both of which are cheaper than a collision.
      //
      // Height grows as width shrinks so the column keeps roughly the area the
      // copy needs -- a narrower column is a taller one.
      const candidates: (Box & { score: number })[] = [];
      for (const factor of [1, 0.8, 0.66, 0.52, 0.42]) {
        const width = Math.max(16, planned.width * factor);
        const height = Math.min(safe.height, planned.height / Math.max(0.5, factor * 0.9));
        for (const o of bestPlacements(input.map, { width, height }, safe, 4)) candidates.push(o);
      }
      const best = candidates.reduce((a, b) => (b.score > a.score ? b : a), { score: -1 } as Box & { score: number });
      // Among placements that score within half a point of the best, the widest
      // wins: a wider column sets larger type, and half a point of quiet is not
      // worth a smaller headline.
      const chosen = candidates
        .filter((o) => o.score >= best.score - 0.5)
        .reduce((a, b) => (b.width > a.width ? b : a));
      if (chosen && chosen.score > score + 1.2) {
        column = { x: chosen.x, y: chosen.y, width: chosen.width, height: chosen.height };
        moved = true;
        const narrowed = chosen.width < planned.width - 0.5;
        score = chosen.score;
        notes.push(
          [
            crosses > 0.18
              ? `the copy column was moved clear of the product: ${Math.round(crosses * 100)}% of the planned area fell across it`
              : "the copy column was moved to the quietest area of the render; the planned area was too busy to carry type",
            narrowed ? `and narrowed to ${Math.round(chosen.width)}% of the frame to fit beside it` : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      } else if (crosses > 0.18) {
        notes.push(`the planned copy area crosses the product by ${Math.round(crosses * 100)}% and no clearer area exists in the frame at any usable width`);
      }
    }
  }

  const colX = pct(column.x, W);
  let colYPct = column.y;
  const colW = pct(column.width, W);
  const colH = pct(column.height, H);

  // ── one more relief, vertical only ───────────────────────────────────────
  //
  // A column that could not be moved sideways can often still be slid up or
  // down the same track: a product sitting low in the frame leaves a band at
  // the top, and sliding the whole stack into it clears the product without
  // breaking the stack apart. Sliding the WHOLE column is deliberate -- moving
  // one block out of a stack is how a column stops reading as a column.
  if (input.map?.product && !moved) {
    const product = input.map.product;
    const current = overlapShare({ ...column, y: colYPct }, product);
    if (current > 0.18) {
      let bestY = colYPct;
      let bestOverlap = current;
      const step = 100 / input.map.size;
      for (let y = safe.y; y + column.height <= safe.y + safe.height + 0.001; y += step) {
        const share = overlapShare({ ...column, y }, product);
        if (share < bestOverlap - 0.05) { bestOverlap = share; bestY = y; }
      }
      if (bestY !== colYPct) {
        colYPct = bestY;
        moved = true;
        score = placementScore(input.map, { ...column, y: bestY });
        notes.push(
          `the copy column was slid ${bestY < column.y ? "up" : "down"} the frame to clear the product: ${Math.round(current * 100)}% overlap became ${Math.round(bestOverlap * 100)}%`,
        );
      }
    }
  }
  const colY = pct(colYPct, H);

  // ── one base size for the whole column ───────────────────────────────────
  //
  // Solved, not fitted per block. Everything is a multiple of `unit`, so the
  // headline is larger than the subheadline by construction and no amount of
  // wrapping can invert them.
  const minSize = Math.max(8, input.min_font_size ?? Math.round(Math.min(W, H) * 0.016));
  const ceiling = Math.round(Math.min(W, H) * 0.14);
  let unit = 0;
  let wrapped: { block: BlockInput; lines: string[]; size: number }[] = [];

  // A plate needs room either side of its line, so the CTA measures against a
  // narrower column than the rest.
  const roomFor = (b: BlockInput) => colW * (b.plate ? 0.82 : 0.98);

  for (let u = ceiling; u >= minSize / Math.min(...blocks.map((b) => b.scale)); u -= 0.5) {
    const attempt: { block: BlockInput; lines: string[]; size: number }[] = [];
    let ok = true;
    let stack = 0;
    for (const b of blocks) {
      const size = Math.max(minSize, Math.round(u * b.scale));
      const lines = breakLines(b.content, roomFor(b), size, b.font_weight, b.letter_spacing, b.max_lines);
      if (!lines) { ok = false; break; }
      attempt.push({ block: b, lines, size });
      stack += lines.length * size * b.line_height + size * GAP_AFTER[b.role];
    }
    if (!ok) continue;
    // Drop the trailing gap: the column ends at the last line, not after it.
    stack -= attempt.length ? attempt[attempt.length - 1].size * GAP_AFTER[attempt[attempt.length - 1].block.role] : 0;
    if (stack <= colH) { unit = u; wrapped = attempt; break; }
  }

  if (!unit) {
    // Nothing fits the reserved area even at the floor. Set at the floor and
    // say so, rather than shrinking below legibility: a 6px headline is not a
    // smaller headline, it is a missing one.
    unit = minSize / Math.min(...blocks.map((b) => b.scale));
    wrapped = blocks.map((b) => {
      const size = Math.max(minSize, Math.round(unit * b.scale));
      return {
        block: b,
        size,
        lines: breakLines(b.content, roomFor(b), size, b.font_weight, b.letter_spacing, Math.max(b.max_lines, 6)) ?? [b.content],
      };
    });
    notes.push("the copy does not fit the reserved area at a legible size; it is set at the floor and overflows the plan");
  }

  // ── hierarchy, enforced ──────────────────────────────────────────────────
  // Sizes derive from one unit, so this can only fire when two roles share a
  // scale. It is kept because a silent tie between a headline and its
  // subheadline is the defect this engine exists to remove, and an assertion
  // that never fires costs nothing.
  for (let i = 1; i < wrapped.length; i++) {
    const prev = wrapped[i - 1];
    const cur = wrapped[i];
    if (cur.block.hierarchy > prev.block.hierarchy && cur.size > prev.size) {
      cur.size = prev.size;
      cur.lines = breakLines(cur.block.content, roomFor(cur.block), cur.size, cur.block.font_weight, cur.block.letter_spacing, Math.max(cur.block.max_lines, 4)) ?? cur.lines;
      notes.push(`${cur.block.role} was capped at the ${prev.block.role}'s size so the reading order is not inverted`);
    }
  }

  // ── stack it ─────────────────────────────────────────────────────────────
  const totalH = wrapped.reduce((n, w, i) => {
    const gap = i === wrapped.length - 1 ? 0 : w.size * GAP_AFTER[w.block.role];
    return n + w.lines.length * w.size * w.block.line_height + gap;
  }, 0);
  // Centred in the column vertically: a column of type sitting at the top of a
  // taller reserved area reads as a mistake, not as a choice.
  let cursor = colY + Math.max(0, (colH - totalH) / 2);

  const out: LaidOutBlock[] = [];
  for (let i = 0; i < wrapped.length; i++) {
    const { block: b, lines, size } = wrapped[i];
    const lineH = size * b.line_height;
    const height = lines.length * lineH;
    const widest = Math.max(...lines.map((l) => measure(l, size, b.font_weight, b.letter_spacing)));
    const width = Math.min(colW, Math.ceil(widest));
    const x = b.alignment === "left" ? colX : b.alignment === "right" ? colX + colW - width : colX + (colW - width) / 2;
    const y = cursor;

    // ── ink and contrast, against what this block will actually sit on ─────
    const boxPct: Box = {
      x: (x / W) * 100,
      y: (y / H) * 100,
      width: (width / W) * 100,
      height: (height / H) * 100,
    };
    const behind = input.map ? regionOf(input.map, boxPct) : null;
    const plate = b.plate ? normalizeHex(b.plate) : null;
    const brand = normalizeHex(b.color || input.brand_text_color || "");

    let color: string;
    let ratio: number;
    let scrim: Scrim | null = null;

    if (plate) {
      color = brand && contrastRatio(brand, plate) >= 4.5 ? brand : readableOn(plate);
      ratio = contrastRatio(color, plate);
      const padX = Math.round(size * 0.75);
      const padY = Math.round(size * 0.45);
      scrim = {
        fill: plate, opacity: 1, radius: Math.round(size * 0.32),
        x: Math.round(x - padX), y: Math.round(y - padY),
        width: Math.round(width + padX * 2), height: Math.round(height + padY * 2),
        because: "the action is set on a solid plate, the highest-contrast element in the frame",
      };
    } else {
      const lum = behind ? behind.luminance : 1;
      const behindHex = grey(lum);
      const dark = "#111111";
      const light = "#ffffff";
      const candidates = brand ? [brand, contrastRatio(dark, behindHex) >= contrastRatio(light, behindHex) ? dark : light] : [dark, light];
      color = candidates.reduce((best, c) => (contrastRatio(c, behindHex) > contrastRatio(best, behindHex) ? c : best), candidates[0]);
      ratio = contrastRatio(color, behindHex);

      // Headline-size type is legible at 3:1; everything else needs 4.5:1. A
      // busy region needs more than a ratio can express, so detail counts too.
      const floor = size >= Math.min(W, H) * 0.045 ? 3 : 4.5;
      const busy = behind ? behind.detail > 0.22 : false;
      // A line lying across a tonal edge -- half on the lit product, half on a
      // shadowed ground -- averages to a comfortable mid-tone and passes the
      // ratio while being illegible over half its length. The mean cannot see
      // that; the spread can.
      const uneven = behind ? behind.spread > 0.18 : false;
      if (ratio < floor || busy || uneven) {
        const wash = color === "#ffffff" ? "#000000" : "#ffffff";
        const padX = Math.round(size * 0.6);
        const padY = Math.round(size * 0.35);
        scrim = {
          fill: wash,
          // Enough to carry the line, not enough to read as a box: measured
          // against how far the region falls short.
          opacity: Math.min(0.62, Math.max(0.28, (floor - Math.min(ratio, floor)) / floor + (busy ? 0.22 : 0) + (uneven ? 0.18 : 0))),
          radius: Math.round(size * 0.2),
          x: Math.round(x - padX), y: Math.round(y - padY),
          width: Math.round(width + padX * 2), height: Math.round(height + padY * 2),
          because: busy
            ? "the render is too detailed behind this line to carry it unaided"
            : uneven
              ? "this line lies across a tonal edge in the render: half of it would read and half would not"
              : `the line reached ${round(ratio)}:1 against the picture, below the ${floor}:1 it needs`,
        };
        const washed = mix(grey(lum), wash, scrim.opacity);
        ratio = contrastRatio(color, washed);
        notes.push(`${b.role} was given a scrim: ${scrim.because}`);
      }
    }

    out.push({
      id: b.id,
      role: b.role,
      content: b.content,
      lines,
      font_size: size,
      line_height: b.line_height,
      font_weight: b.font_weight,
      letter_spacing: b.letter_spacing,
      font_family: b.font_family,
      font_fallback: b.font_fallback,
      align: b.alignment,
      color,
      contrast: round(ratio),
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      scrim,
    });

    cursor += height + (i === wrapped.length - 1 ? 0 : size * GAP_AFTER[b.role]);
  }

  return {
    blocks: out,
    column: { x: Math.round(colX), y: Math.round(colY), width: Math.round(colW), height: Math.round(colH) },
    notes,
    placement_score: round(score),
    moved_for_product: moved,
  };
}

/** A grey of the same relative luminance, for contrast arithmetic. */
function grey(luminance: number): string {
  const l = Math.max(0, Math.min(1, luminance));
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  const v = Math.max(0, Math.min(255, Math.round(c * 255)));
  const h = v.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

/** `over` laid on `under` at `alpha`. */
function mix(under: string, over: string, alpha: number): string {
  const c = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [ur, ug, ub] = c(under);
  const [or_, og, ob] = c(over);
  const m = (a: number, b: number) => Math.round(a * (1 - alpha) + b * alpha).toString(16).padStart(2, "0");
  return `#${m(ur, or_)}${m(ug, og)}${m(ub, ob)}`;
}

/** `box` moved and shrunk until it sits inside `bounds`. */
export function clampTo(box: Box, bounds: Box): Box {
  const width = Math.min(box.width, bounds.width);
  const height = Math.min(box.height, bounds.height);
  return {
    width,
    height,
    x: Math.max(bounds.x, Math.min(box.x, bounds.x + bounds.width - width)),
    y: Math.max(bounds.y, Math.min(box.y, bounds.y + bounds.height - height)),
  };
}

/** Counts, sizes and scores only — never the client's copy. */
export function layoutTelemetry(r: LayoutResult | null | undefined) {
  if (!r) return { text_layout: false };
  return {
    text_layout: true,
    blocks: r.blocks.length,
    sizes: r.blocks.map((b) => b.font_size),
    line_counts: r.blocks.map((b) => b.lines.length),
    min_contrast: r.blocks.length ? Math.min(...r.blocks.map((b) => b.contrast)) : null,
    scrims: r.blocks.filter((b) => b.scrim).length,
    placement_score: r.placement_score,
    moved_for_product: r.moved_for_product,
    notes: r.notes.length,
  };
}
