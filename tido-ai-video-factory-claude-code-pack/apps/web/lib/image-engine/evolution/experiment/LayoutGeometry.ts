import type { AssetContext } from "./AssetContext";
import type { CreativeBlueprint } from "./CreativeBlueprint";
import { wantsGenerousSpace, type BrandKit } from "./BrandKit";

/**
 * Layout Geometry — where things actually sit.
 *
 * Every layout decision in this engine has so far been prose: "the cup
 * off-centre left, negative space carrying the queue". A renderer can act on
 * that, but nothing downstream can MEASURE it, lay a text object at it, or
 * export it. This is the first module that produces coordinates.
 *
 * Deterministic, pure, no model call.
 *
 * Why the geometry is derived and not templated
 * ---------------------------------------------
 * Positions come from three things the brief already fixes: the aspect ratio
 * (which decides where space exists at all), the copy roles the client supplied
 * (which decide how many zones are needed), and the product count (which
 * decides whether there is a hero or a row). A luxury serum poster and a coffee
 * poster with the same ratio, the same three copy roles and one product get the
 * same grid, because their layout problem is the same one. Nothing here keys on
 * what the product is.
 *
 * Coordinates are percentages of the frame, origin top-left, so they survive
 * any output size.
 */

export type ZoneName = "product" | "headline" | "subheadline" | "cta" | "supporting" | "logo";

export interface Zone {
  name: ZoneName;
  /** Centre of the zone, as a percentage of frame width/height. */
  x: number;
  y: number;
  /** Zone extent as a percentage of the frame. */
  width: number;
  height: number;
  /** 1–10. Higher wins when two zones contend for the same area. */
  priority: number;
  /** What this zone is doing, and why it is here rather than elsewhere. */
  because: string;
}

export interface Grid {
  /** Columns the frame is reasoned in. Wider frames get more. */
  columns: number;
  rows: number;
  /** Margin as a percentage of the shorter edge. */
  margin: number;
  /** Safe area inset, inside which nothing critical may fall. */
  safe_inset: number;
}

export interface EyePath {
  /** Zone the eye enters at. */
  enter: ZoneName;
  /** Zones it travels through, in order. */
  through: ZoneName[];
  /** Where it stops — the conversion point when there is one. */
  exit: ZoneName;
  because: string;
}

export interface LayoutScore {
  balance: number;
  hierarchy: number;
  readability: number;
  conversion: number;
  premium_perception: number;
  overall: number;
  notes: string[];
}

/**
 * Phase 5.3. The layout stated as decisions a designer would write down, each
 * derived from the zones above -- never chosen separately from them, so the
 * statement and the coordinates cannot disagree.
 */
export interface LayoutDecisions {
  /** e.g. "center-right" -- where the product sits, in words. */
  product_placement: string;
  headline_placement: string | null;
  cta_placement: string | null;
  /** How the copy lines up: along one edge, or on the centre axis. */
  alignment: "left" | "centre" | "right" | "none";
  /** Share of the frame left empty, and what that reads as. */
  whitespace: { share: number; label: string };
  balance: "symmetric" | "asymmetric";
  /** The grid in words. */
  grid: string;
  /** Elements in the order the eye meets them. */
  hierarchy: ZoneName[];
  /** Why the frame is arranged this way. */
  because: string;
}

export interface LayoutGeometry {
  ratio: string;
  grid: Grid;
  zones: Zone[];
  eye_path: EyePath | null;
  score: LayoutScore;
  decisions?: LayoutDecisions;
}

/** A position in words. Thirds of the frame, the way a designer describes it. */
export function placementLabel(x: number, y: number): string {
  const v = y < 34 ? "top" : y > 66 ? "bottom" : "center";
  const h = x < 40 ? "left" : x > 60 ? "right" : "center";
  if (v === "center" && h === "center") return "center";
  if (h === "center") return `${v}-center`;
  if (v === "center") return `center-${h}`;
  return `${v}-${h}`;
}

/** Which side the director's composition put the subject on, if it said. */
export function sideFromComposition(hint: string | null | undefined): "left" | "right" | null {
  const h = String(hint || "").toLowerCase();
  if (!h) return null;
  const right = /\b(right|phải)\b/.test(h);
  const left = /\b(left|trái)\b/.test(h);
  // Only a statement about where the SUBJECT sits counts; "light from the
  // left" is about lighting, so a side word must come with a placement word.
  const placed = /third|side|off-?cent(re|er)|weight|frame|placed|sits|positioned|lower|upper/.test(h);
  if (placed && right && !left) return "right";
  if (placed && left && !right) return "left";
  if (/off-?cent(re|er)|asymmetric|rule of thirds/.test(h)) return "right";
  return null;
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");
const round = (n: number) => Math.round(n * 100) / 100;

/** Orientation drives everything: it is where space exists. */
function gridFor(ratio: string): Grid {
  if (ratio === "16:9") return { columns: 12, rows: 6, margin: 6, safe_inset: 4 };
  if (ratio === "9:16") return { columns: 6, rows: 12, margin: 7, safe_inset: 5 };
  return { columns: 8, rows: 8, margin: 8, safe_inset: 5 };
}

export interface GeometryInput {
  ratio?: string;
  assetContext?: AssetContext | null;
  blueprint?: CreativeBlueprint | null;
  /** Roles the client labelled, uppercased. Decides how many zones exist. */
  copyRoles?: string[];
  productCount?: number;
  hasLogo?: boolean;
  /**
   * Phase 5.3. The director's composition decision, in its words. When it puts
   * the subject to one side, the frame is laid out asymmetrically to match --
   * the geometry follows the creative decision rather than overriding it.
   * Absent, the layout is exactly what it was before this existed.
   */
  compositionHint?: string | null;
  /** Phase 5.4. A brand that wants premium or minimal space gets more of it. */
  brandKit?: BrandKit | null;
}

/**
 * Lays out the frame. Pure and total.
 *
 * The product is placed first because everything else is placed relative to it:
 * copy goes where the product is not. That ordering is the whole reason the
 * result reads as a composition rather than a list of coordinates.
 */
export function buildGeometry(input: GeometryInput): LayoutGeometry {
  const ratio = clean(input.ratio) || "1:1";
  const grid = gridFor(ratio);
  const roles = (input.copyRoles || []).map((r) => clean(r).toUpperCase()).filter(Boolean);
  const count = Math.max(1, input.productCount || 1);
  const wide = ratio === "16:9";
  const tall = ratio === "9:16";

  const zones: Zone[] = [];

  // ── the product, first ─────────────────────────────────────────────────
  // A wide frame splits left/right because width is what it has; a tall frame
  // stacks because height is what it has. A square centres because neither
  // edge leads.
  // Phase 5.3: the director's composition may put the subject to one side on a
  // frame that is not already wide. Only for a single product with copy to
  // balance it -- a row of several has no side to lean to, and an image with no
  // text has nothing to put on the other side.
  const side = !wide && count === 1 && roles.length ? sideFromComposition(input.compositionHint) : null;
  const generous = wantsGenerousSpace(input.brandKit);
  const productX = wide ? 70 : side === "right" ? 64 : side === "left" ? 36 : 50;
  const productY = tall ? 50 : side ? 56 : 50;
  const soloSize = generous ? (wide ? 38 : 50) : wide ? 45 : 60;
  zones.push({
    name: "product",
    x: productX,
    y: productY,
    width: count > 1 ? 80 : side ? Math.min(soloSize, 52) : soloSize,
    height: count > 1 ? 45 : side ? Math.min(soloSize + 4, 60) : soloSize,
    priority: 10,
    because:
      count > 1
        ? `${count} products share the frame, so they occupy one band evenly rather than one leading`
        : wide
          ? "a wide frame is read across, so the product takes one side and leaves the other for copy"
          : "neither edge of this frame leads, so the product holds the optical centre",
  });

  // ── copy zones, placed where the product is not ────────────────────────
  // With the product to one side, the copy takes the other, aligned to its edge.
  const copyX = wide ? 25 : side === "right" ? 30 : side === "left" ? 70 : 50;
  const copyWidth = (full: number) => (side ? Math.min(full, 50) : full);
  const hasHeadline = roles.includes("HEADLINE");
  const hasCta = roles.includes("CTA") || roles.includes("OFFER");
  const hasSub = roles.includes("SUBHEADLINE") || roles.includes("SUPPORTING_TEXT");

  if (hasHeadline) {
    zones.push({
      name: "headline",
      x: copyX,
      y: wide ? 38 : 15,
      width: wide ? 40 : copyWidth(generous ? 70 : 80),
      height: 18,
      priority: 9,
      because: wide
        ? "the empty side becomes the information zone, balancing the product's visual weight without crossing it"
        : "the headline takes the band above the product so it is read before the eye reaches the subject",
    });
  }
  if (hasSub) {
    zones.push({
      name: "subheadline",
      x: copyX,
      y: wide ? 55 : 30,
      width: wide ? 40 : copyWidth(70),
      height: 10,
      priority: 6,
      because: "sits directly under the headline so the two read as one statement rather than two",
    });
  }
  if (hasCta) {
    zones.push({
      name: "cta",
      x: copyX,
      y: wide ? 72 : 88,
      width: wide ? 25 : copyWidth(40),
      height: 8,
      priority: 7,
      because: "placed at the end of the reading path, so the eye arrives at it having already passed the product",
    });
  }
  const supporting = roles.filter((r) => !["HEADLINE", "CTA", "OFFER", "SUBHEADLINE", "SUPPORTING_TEXT"].includes(r));
  if (supporting.length) {
    zones.push({
      name: "supporting",
      x: copyX,
      y: wide ? 85 : 78,
      width: wide ? 40 : copyWidth(70),
      height: 6,
      priority: 3,
      because: "the remaining strings sit below the main statement, subordinate by position as well as by size",
    });
  }
  // Only when a logo was actually attached. A zone reserved for a mark nobody
  // supplied is an instruction to draw one.
  if (input.hasLogo) {
    zones.push({
      name: "logo",
      x: grid.margin + 4,
      y: grid.margin + 3,
      width: 12,
      height: 6,
      priority: 4,
      because: "a corner clear of both the product and the copy bands, at the smallest size that stays legible",
    });
  }

  // ── eye path ───────────────────────────────────────────────────────────
  const byPriority = [...zones].sort((a, b) => b.priority - a.priority);
  const eye_path: EyePath | null = zones.length > 1
    ? {
        enter: byPriority[0].name,
        through: byPriority.slice(1, -1).map((z) => z.name),
        exit: hasCta ? "cta" : byPriority[byPriority.length - 1].name,
        because: hasCta
          ? "the eye enters on the heaviest element and exits on the action, crossing the product on the way"
          : "with no closing line, the path ends on the lightest element rather than on an action",
      }
    : null;

  const score = scoreLayout({ ratio, grid, zones, eye_path } as LayoutGeometry);
  return { ratio, grid, zones, eye_path, score, decisions: layoutDecisions({ ratio, grid, zones, eye_path, score }, side, generous) };
}

/** States the layout as decisions, read off the zones. */
export function layoutDecisions(
  g: Omit<LayoutGeometry, "decisions">,
  side: "left" | "right" | null = null,
  generous = false,
): LayoutDecisions {
  const at = (name: ZoneName) => g.zones.find((z) => z.name === name) || null;
  const product = at("product");
  const headline = at("headline");
  const cta = at("cta");
  const copy = g.zones.filter((z) => z.name !== "product" && z.name !== "logo");
  const meanX = copy.length ? copy.reduce((n, z) => n + z.x, 0) / copy.length : 50;
  const alignment: LayoutDecisions["alignment"] = !copy.length ? "none" : meanX < 45 ? "left" : meanX > 55 ? "right" : "centre";
  const occupied = g.zones.reduce((n, z) => n + (z.width * z.height) / 100, 0);
  const share = Math.max(0, Math.round(100 - occupied));
  const label = share >= 45 ? "large premium spacing" : share >= 25 ? "balanced spacing" : "dense, information-first";
  const asymmetric = Boolean(product && Math.abs(product.x - 50) > 8);
  return {
    product_placement: product ? placementLabel(product.x, product.y) : "none",
    headline_placement: headline ? placementLabel(headline.x, headline.y) : null,
    cta_placement: cta ? (cta.y > 66 ? "bottom area" : placementLabel(cta.x, cta.y)) : null,
    alignment,
    whitespace: { share, label },
    balance: asymmetric ? "asymmetric" : "symmetric",
    grid: `${g.grid.columns}×${g.grid.rows} grid, ${g.grid.margin}% margin, ${g.grid.safe_inset}% safe inset`,
    hierarchy: [...g.zones].sort((a, b) => b.priority - a.priority).map((z) => z.name),
    because: [
      side
        ? `the director set the subject ${side} of centre, so the copy takes the opposite side and lines up along one edge`
        : g.ratio === "16:9"
          ? "a wide frame is read across: product on one side, copy on the other"
          : "neither edge of this frame leads, so the product holds the optical centre and any copy stacks on its axis",
      generous ? "the brand asks for a premium, uncluttered feel, so the elements are smaller and the space around them larger" : "",
      !copy.length ? "no text was supplied, so the frame is composed for the image alone" : "",
    ].filter(Boolean).join("; "),
  };
}

/**
 * Scores a layout on five commercial properties. Pure.
 *
 * These are geometric measures, not aesthetic ones: overlap, distribution,
 * whether a conversion zone exists. Nothing here claims the layout is beautiful.
 */
export function scoreLayout(g: Omit<LayoutGeometry, "score">): LayoutScore {
  const notes: string[] = [];
  const zones = g.zones;
  const product = zones.find((z) => z.name === "product");

  // ── balance: is visual weight distributed, or piled on one side ────────
  const leftWeight = zones.filter((z) => z.x < 50).reduce((n, z) => n + z.priority, 0);
  const rightWeight = zones.filter((z) => z.x >= 50).reduce((n, z) => n + z.priority, 0);
  const total = leftWeight + rightWeight || 1;
  const skew = Math.abs(leftWeight - rightWeight) / total;
  const balance = round(Math.max(1, 10 - skew * 12));
  if (skew > 0.5) notes.push(`Visual weight is ${Math.round(skew * 100)}% skewed to one side.`);

  // ── hierarchy: are priorities distinct, or is everything equally loud ──
  const priorities = new Set(zones.map((z) => z.priority));
  const hierarchy = round(Math.min(10, 2 + priorities.size * 2));
  if (priorities.size < 3) notes.push("Fewer than three priority levels: little separates one element from another.");

  // ── readability: does anything critical overlap the product ────────────
  let overlaps = 0;
  if (product) {
    for (const z of zones) {
      if (z.name === "product") continue;
      const dx = Math.abs(z.x - product.x) * 2;
      const dy = Math.abs(z.y - product.y) * 2;
      if (dx < z.width + product.width && dy < z.height + product.height) overlaps++;
    }
  }
  const readability = round(Math.max(1, 10 - overlaps * 3));
  if (overlaps) notes.push(`${overlaps} copy zone(s) overlap the product.`);

  // ── conversion: is there an exit, and is it reachable ──────────────────
  const hasCta = zones.some((z) => z.name === "cta");
  const conversion = hasCta ? (g.eye_path?.exit === "cta" ? 10 : 6) : 3;
  if (!hasCta) notes.push("No closing zone: the layout has nowhere for the eye to act.");

  // ── premium perception: how much of the frame is left empty ────────────
  const occupied = zones.reduce((n, z) => n + (z.width * z.height) / 100, 0);
  const empty = Math.max(0, 100 - occupied);
  // Rewards emptiness up to a point; a frame that is 90% empty is not premium,
  // it is unfinished.
  const premium_perception = round(Math.max(1, Math.min(10, empty / 5)));
  if (empty < 20) notes.push(`Only ${Math.round(empty)}% of the frame is empty; nothing has room.`);

  const overall = round((balance + hierarchy + readability + conversion + premium_perception) / 5);
  return { balance, hierarchy, readability, conversion, premium_perception, overall, notes };
}

/** Counts and coordinates only. */
export function geometryTelemetry(g: LayoutGeometry | null | undefined) {
  if (!g) return { geometry: false };
  return {
    geometry: true,
    ratio: g.ratio,
    zones: g.zones.length,
    zone_names: g.zones.map((z) => z.name),
    eye_path: g.eye_path ? [g.eye_path.enter, ...g.eye_path.through, g.eye_path.exit] : null,
    score: g.score.overall,
    issues: g.score.notes.length,
  };
}

/** Zones that exist only because copy exists. Named for what they hold. */
const COPY_ZONES: ZoneName[] = ["headline", "subheadline", "cta", "supporting"];

export interface RenderGeometryOptions {
  /**
   * The renderer is drawing the SCENE only -- the type is set separately and
   * composited afterwards.
   *
   * With this on, the copy zones are still transmitted, because the picture has
   * to be composed around them, but they are transmitted as AREAS TO KEEP
   * CLEAR rather than under typographic names. A block that says "headline:
   * centred at 50% across" is typography vocabulary handed to a model that is
   * being told in the same prompt to render no typography, and a model given
   * both has a contradiction to resolve. This removes it.
   */
  sceneOnly?: boolean;
}

/** The geometry as the prompt carries it. Percentages, so any size works. */
export function renderGeometry(
  g: LayoutGeometry | null | undefined,
  opts: RenderGeometryOptions = {},
): string | undefined {
  if (!g?.zones.length) return undefined;
  if (opts.sceneOnly) {
    const d0 = g.decisions;
    const copy = g.zones.filter((z) => COPY_ZONES.includes(z.name));
    const rest = g.zones.filter((z) => !COPY_ZONES.includes(z.name));
    return [
      `SCENE GEOMETRY (${g.ratio}) \u2014 positions are percentages of the frame, origin top-left. This frame carries no text; these are areas, not elements.`,
      ...(d0
        ? [`- composition: product ${d0.product_placement}; ${d0.balance} balance; ${d0.whitespace.label} (~${d0.whitespace.share}% of the frame left empty).`]
        : []),
      ...rest.map((z) => `- ${z.name}: centred at ${z.x}% across, ${z.y}% down, occupying ~${z.width}%\u00d7${z.height}%. ${z.because}`),
      ...copy.map(
        (z, i) =>
          `- clear area ${i + 1}: centred at ${z.x}% across, ${z.y}% down, occupying ~${z.width}%\u00d7${z.height}%. Keep it quiet: even tone, low detail, no product edge, no hard highlight, no busy pattern. Leave it genuinely empty.`,
      ),
    ].join("\n");
  }
  const d = g.decisions;
  return [
    `LAYOUT GEOMETRY (${g.ratio}) — positions are percentages of the frame, origin top-left.`,
    ...(d
      ? [
          `- layout: product ${d.product_placement}${d.headline_placement ? `, headline ${d.headline_placement}` : ""}${d.cta_placement ? `, CTA ${d.cta_placement}` : ""}; ${d.alignment === "none" ? "no text" : `${d.alignment}-aligned copy`}; ${d.balance} balance; ${d.whitespace.label} (~${d.whitespace.share}% of the frame left empty).`,
        ]
      : []),
    ...g.zones.map(
      (z) => `- ${z.name}: centred at ${z.x}% across, ${z.y}% down, occupying ~${z.width}%×${z.height}%. ${z.because}`
    ),
    ...(g.eye_path
      ? [`- reading path: ${[g.eye_path.enter, ...g.eye_path.through, g.eye_path.exit].join(" → ")}. ${g.eye_path.because}`]
      : []),
  ].join("\n");
}
