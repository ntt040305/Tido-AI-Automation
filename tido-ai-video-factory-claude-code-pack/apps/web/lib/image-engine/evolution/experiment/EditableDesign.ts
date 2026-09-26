import crypto from "crypto";
import type { CreativeDocument, DocumentElement } from "./CreativeDocument";
import type { BrandKit } from "./BrandKit";
import type { TypographyPlan } from "./TypographyPlan";
import { colorFor, contrastRatio, normalizeHex } from "./BrandKit";
import { fontStack as stackFor, needsVietnamese, selectPairing } from "./FontIntelligence";
import { buildCompositionMap, compositionMapTelemetry, type Box, type CompositionMap } from "./CompositionMap";
import { layoutText, type BlockInput, type Role } from "./TextLayoutEngine";
import type { CreativeBlueprint } from "./CreativeBlueprint";
import {
  buildTypographyDNA, categoryHint, materialForContrast, materialPaint,
  type Material, type TypographyDNA, typographyDnaTelemetry,
} from "./TypographyDNA";

/**
 * Phase 5.5 — the editable design, in real pixels.
 *
 * WHERE THE LAYERS COME FROM
 * --------------------------
 * Not from the picture. In Editable mode the image model renders the SCENE
 * only -- no words, no logo -- and every other layer is placed here from the
 * design document the render was planned from: the client's exact lines, the
 * brand's logo, the CTA plate. So the layers exist before any pixels are
 * composited, and the served PNG is one composite of them. Nothing is ever
 * recovered from a rendered image; there is nothing to recover.
 *
 * WHAT IS AND IS NOT SEPARATE
 * ---------------------------
 * The scene -- background and product together -- is one raster, because the
 * image model returns one raster and separating it would mean segmenting a
 * render, which this system does not do. The layer is named for what it is.
 * Everything placed on top of it is a separate, editable layer.
 *
 * This file is pure except `composeEditable`, which loads `sharp` lazily.
 */

export interface EditableAsset {
  kind: "scene_plate" | "logo";
  /** Relative to the generation's directory. */
  file: string;
  mime: "image/png";
  width: number;
  height: number;
  sha256: string;
}

interface LayerBase {
  id: string;
  /** What a person sees in the layers panel. */
  name: string;
  /** Top-left, in canvas pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  z: number;
}

export interface ImageLayer extends LayerBase {
  kind: "image";
  role: "scene" | "logo";
  /** Key into `assets`. */
  asset: string;
  /** The part of the asset shown, as fractions of it. Full frame unless cropped. */
  crop: { x: number; y: number; width: number; height: number };
}

export interface TextLayer extends LayerBase {
  kind: "text";
  role: "headline" | "subheadline" | "body" | "cta";
  /** The client's line, exactly. Never produced, altered or recased here. */
  content: string;
  /**
   * The visual lines the layout engine broke `content` into, in order.
   *
   * A presentation detail, not an edit: joined by single spaces they reproduce
   * `content` exactly, and every exporter writes `content` as the layer's text
   * with these as its line breaks. One editable layer per client line survives
   * a headline that runs to two lines, which single-line fitting could only
   * achieve by shrinking the type until nothing led.
   */
  lines: string[];
  font_family: string;
  /** The generic family a renderer falls back to when `font_family` is missing. */
  font_fallback: "serif" | "sans-serif";
  font_size: number;
  font_weight: number;
  line_height: number;
  /** In ems. */
  letter_spacing: number;
  color: string;
  align: "left" | "center" | "right";
  /**
   * Phase 5.6.3 — the creative treatment of the letterforms themselves.
   *
   * Set from the `TypographyDNA` on the design, then narrowed per layer: a
   * treatment that would drop THIS line under its contrast floor is refused
   * here even where the design as a whole asked for it. `plain` is a real
   * answer, not a missing one.
   */
  material?: Material;
}

export interface EffectLayer extends LayerBase {
  kind: "effect";
  effect: "plate" | "shadow" | "gradient" | "blur" | "overlay" | "scrim";
  fill: string;
  radius: number;
  blur: number;
  /** The layer this effect belongs to, when it belongs to one. */
  attached_to?: string;
}

export type EditableLayer = ImageLayer | TextLayer | EffectLayer;

export interface EditableDesign {
  version: 3;
  canvas: { width: number; height: number; aspect_ratio: string; unit: "px"; background: { color: string } };
  text_mode: "exact" | "none";
  brand: { name: string; colors: string[]; fonts: { heading?: string; body?: string } } | null;
  assets: Record<string, EditableAsset>;
  /** Bottom to top. */
  layers: EditableLayer[];
  /** Stated, so no export can imply more separation than exists. */
  scene_is_single_raster: true;
  /**
   * What the layout engine had to do to set this type -- a column moved clear
   * of the product, a scrim added under a line the picture could not carry, a
   * size capped so the reading order did not invert. Carried on the design so
   * the critic and the record read the same account, rather than one reading a
   * log line.
   */
  layout_notes?: string[];
  /** How quiet the chosen column is, 0-10. 10 when no scene was read. */
  placement_score?: number;
  /** True when the column was moved off the planned area to clear the product. */
  moved_for_product?: boolean;
  /**
   * What the rendered scene was found to contain: the busiest coherent area
   * (in a commercial render, the product and its staging) and the point the
   * eye lands on, both as frame percentages.
   *
   * Recorded here so the critic can check a block against the product without
   * re-reading the pixels, and so a finding about a collision can be traced to
   * the measurement that produced it.
   */
  scene_content?: { product: Box | null; focal: { x: number; y: number } | null };
  /**
   * Phase 5.6.3 — the art direction of the type: what it should feel like, how
   * it relates to the picture, and what treatment was refused. Carried on the
   * design so the record and the critic read the same account of it.
   */
  typography_dna?: TypographyDNA;
}

/** Mean relative luminance (0..1) of a canvas-pixel box of the scene. */
export type LuminanceProbe = (box: { x: number; y: number; width: number; height: number }) => number;

/**
 * A measured luminance as a grey of the same lightness.
 *
 * `contrastRatio` needs two colours, and what sits under a line is a region of
 * a photograph rather than a colour. A grey of the region's own luminance gives
 * the same contrast ratio the real pixels would, which is the only property the
 * check reads -- it is not a claim about the region's hue.
 */
function greyOf(luminance: number): string {
  const l = Math.max(0, Math.min(1, luminance));
  const srgb = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  const c = Math.round(Math.max(0, Math.min(1, srgb)) * 255).toString(16).padStart(2, "0");
  return `#${c}${c}${c}`;
}

export interface PlanInput {
  document: CreativeDocument;
  brandKit?: BrandKit | null;
  scene: { width: number; height: number; sha256: string };
  logo?: { width: number; height: number; sha256: string } | null;
  /** Absent, text colour falls back to the brand or to dark ink. */
  luminance?: LuminanceProbe;
  /** Mean colour of the scene, for the background layer when the brand names none. */
  sceneColor?: string;
  /**
   * What the rendered scene actually contains -- where its detail is and how
   * light it is there. Absent, the type is set into the pre-render plan's own
   * area, which is what this module did before the map existed.
   */
  map?: CompositionMap | null;
  /**
   * The typography plan, when the document did not carry one. The document is
   * the source of truth; this is for callers that build a document and a plan
   * separately.
   */
  plan?: TypographyPlan | null;
  /**
   * The commercial category, when the brief states one. Only the typeface
   * selector reads it: a food headline and a luxury headline want different
   * letterforms even at the same typographic personality.
   *
   * Nothing upstream produces one -- this engine has no category table on
   * purpose -- so when it is absent `categoryHint` recognises one from the
   * director's own vocabulary instead, and no match means no category.
   */
  category?: string | null;
  /**
   * Phase 5.6.3 — the director's decisions, which is where the typography's
   * creative treatment comes from. Absent, the type is set plain: a default
   * that is honest about knowing nothing rather than decorative by guess.
   */
  blueprint?: CreativeBlueprint | null;
}

const ROLES = new Set(["headline", "subheadline", "body", "cta"]);
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Phase 5.6.6 — faces come from `FontIntelligence`, not from a table here.
 *
 * This used to name Georgia for serif and Arial for everything else. Georgia
 * has no `ả ặ ư ơ ễ ỹ ụ` on this platform, so Vietnamese serif headlines were
 * drawn PER CHARACTER from two different typefaces. The selector verifies
 * coverage before it names a face.
 */

function weightOf(role: string, prose: string | undefined): number {
  const p = String(prose || "").toLowerCase();
  if (/light|thin|hairline/.test(p)) return 300;
  if (role === "headline" || role === "cta") return /heavy|black/.test(p) ? 800 : 700;
  if (/heavy|bold|solid/.test(p) && role === "subheadline") return 600;
  return role === "subheadline" ? 500 : 400;
}

function trackingOf(prose: string | undefined): number {
  const p = String(prose || "").toLowerCase();
  if (/wide|generous|open/.test(p)) return 0.04;
  if (/tight|condensed/.test(p)) return -0.01;
  return 0;
}

/** Rough advance width of a line, in pixels. Deliberately generous. */
export function estimateTextWidth(text: string, size: number, weight: number, letterSpacing: number): number {
  const perChar = weight >= 700 ? 0.6 : 0.55;
  return [...text].length * size * (perChar + letterSpacing);
}

/** The plate colour a spec was set on, if it was set on one. */
function plateOf(el: DocumentElement): string | null {
  const m = /solid (#[0-9a-f]{6}) plate/i.exec(String(el.style?.contrast?.against || el.style?.treatment || ""));
  return m ? m[1].toLowerCase() : null;
}

/** Lines a role may run to when no plan said. Conservative, and per role. */
const DEFAULT_MAX_LINES: Record<Role, number> = { headline: 2, subheadline: 2, body: 3, cta: 1 };
const HIERARCHY_OF: Record<Role, number> = { headline: 1, subheadline: 2, body: 3, cta: 4 };

/**
 * The area the copy column is set into, in frame percentages.
 *
 * The plan's own reserved area where there is one -- that is the area the image
 * prompt asked the renderer to keep clean, and setting type anywhere else
 * throws away what the render was composed for. Without a plan it falls back to
 * the bounding box of the document's text elements, padded, which is what this
 * module used implicitly before the plan existed.
 */
export function copyArea(plan: TypographyPlan | null, els: DocumentElement[]): Box {
  if (plan?.space) return { x: plan.space.x, y: plan.space.y, width: plan.space.width, height: plan.space.height };
  if (!els.length) return { x: 10, y: 10, width: 80, height: 80 };
  const x0 = Math.min(...els.map((e) => e.position.x - e.size.width / 2));
  const x1 = Math.max(...els.map((e) => e.position.x + e.size.width / 2));
  const y0 = Math.min(...els.map((e) => e.position.y - e.size.height / 2));
  const y1 = Math.max(...els.map((e) => e.position.y + e.size.height / 2));
  // Padded vertically: the zones were laid out as separate bands with the
  // product between them, and a column has to breathe across them.
  const pad = 4;
  return {
    x: Math.max(0, x0),
    y: Math.max(0, y0 - pad),
    width: Math.min(100 - Math.max(0, x0), x1 - x0),
    height: Math.min(100 - Math.max(0, y0 - pad), y1 - y0 + pad * 2),
  };
}

/**
 * Plans the editable design from the document. Pure.
 *
 * The imagery keeps the document's own positions, scaled from its authoring
 * canvas to the scene's real pixels. The TYPE is set by the layout engine:
 * broken into lines, sized from one base so hierarchy cannot invert, placed
 * against the render's own quiet areas, and given a scrim where the picture
 * cannot carry it on its own. Never by changing the words.
 */
export function planEditableDesign(input: PlanInput): EditableDesign {
  const doc = input.document;
  const W = input.scene.width;
  const H = input.scene.height;
  const authorW = doc.canvas?.width || W;
  const authorH = doc.canvas?.height || H;
  const sx = W / authorW;
  const sy = H / authorH;
  const kit = input.brandKit || null;

  const assets: Record<string, EditableAsset> = {
    scene: { kind: "scene_plate", file: "layers/scene.png", mime: "image/png", width: W, height: H, sha256: input.scene.sha256 },
  };
  const layers: EditableLayer[] = [];
  let z = 0;

  const background = colorFor(kit, "background") || normalizeHex(input.sceneColor) || "#ffffff";
  layers.push({
    kind: "effect", effect: "overlay", id: "background", name: "Background", fill: background, radius: 0, blur: 0,
    x: 0, y: 0, width: W, height: H, rotation: 0, opacity: 1, z: z++,
  });
  layers.push({
    kind: "image", role: "scene", id: "scene", name: "Scene (background + product)", asset: "scene",
    x: 0, y: 0, width: W, height: H, crop: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0, opacity: 1, z: z++,
  });

  const box = (el: DocumentElement) => {
    const c = el.position_px || { x: (el.position.x / 100) * authorW, y: (el.position.y / 100) * authorH };
    const s = el.size_px || { width: (el.size.width / 100) * authorW, height: (el.size.height / 100) * authorH };
    return { cx: c.x * sx, cy: c.y * sy, w: s.width * sx, h: s.height * sy };
  };

  // ── logo: the brand's own mark, placed in its zone, never redrawn ───────
  const logoEl = doc.elements.find((e) => e.id === "logo" || e.style?.source === "brand_logo");
  if (logoEl && input.logo) {
    assets.logo = { kind: "logo", file: "layers/logo.png", mime: "image/png", width: input.logo.width, height: input.logo.height, sha256: input.logo.sha256 };
    const b = box(logoEl);
    // Contain: the mark keeps its proportions inside the zone.
    const k = Math.min(b.w / input.logo.width, b.h / input.logo.height);
    const w = Math.round(input.logo.width * k);
    const h = Math.round(input.logo.height * k);
    layers.push({
      kind: "image", role: "logo", id: "logo", name: "Logo", asset: "logo",
      x: Math.round(b.cx - w / 2), y: Math.round(b.cy - h / 2), width: w, height: h,
      crop: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0, opacity: 1, z: 0,
    });
  }

  // ── text: one layer per exact line, set by the layout engine ────────
  const plan = input.plan ?? doc.typography_plan ?? null;
  const textEls = doc.elements.filter((e) => e.type === "text" && e.content);
  // One pairing for the whole design: hierarchy should come from two faces
  // used consistently, not from a different decision per line.
  const copyLines = doc.elements.filter((e) => e.type === "text" && e.content).map((e) => String(e.content));
  const viCopy = needsVietnamese(copyLines);
  const personality = plan?.style?.personality ?? null;
  const category = input.category ?? categoryHint(input.blueprint);
  const pairing = selectPairing({
    personality,
    category,
    brandFamily: kit?.fonts?.heading ?? null,
    lines: copyLines,
  });

  // Phase 5.6.3 — the creative treatment, resolved once for the whole design
  // from decisions the director already made. It needs the rendered scene to
  // finish the job, which is why it is built here rather than at plan time:
  // whether a glow reads at all depends on how light the picture came back.
  const dna = buildTypographyDNA({
    blueprint: input.blueprint ?? null,
    personality,
    category,
    brandKit: kit,
    map: input.map ?? null,
  });

  const planned = new Map((plan?.blocks || []).map((b) => [b.content, b]));

  const blockInputs: BlockInput[] = textEls.map((el) => {
    const role = (ROLES.has(String(el.role)) ? el.role : "body") as Role;
    const st = el.style || {};
    const cls = String(st.font_class || "sans-serif");
    const wantsSerif = /serif/.test(cls) && cls !== "sans-serif" && cls !== "display-sans";
    const def = wantsSerif ? pairing.heading : role === "headline" ? pairing.heading : pairing.body;
    const p = planned.get(el.content);
    const align = st.text_align === "left" ? "left" : st.text_align === "right" ? "right" : "center";
    return {
      id: el.id,
      role,
      content: el.content,
      hierarchy: p?.hierarchy ?? HIERARCHY_OF[role],
      max_lines: p?.max_lines ?? DEFAULT_MAX_LINES[role],
      scale: p?.scale ?? el.text?.scale ?? 1,
      alignment: (p?.alignment ?? align) as BlockInput["alignment"],
      // The brand's face when the kit named one the selector accepted;
      // otherwise the chosen face. Never a family that cannot draw the copy.
      font_family: def.brand_font ? def.family : st.font_family && !viCopy ? st.font_family : def.family,
      font_fallback: def.fallback === "monospace" ? "sans-serif" : def.fallback,
      // The DNA owns the HEADLINE's weight and tracking, because the headline
      // is what carries the voice. It does not own the other roles: a
      // light-and-airy weight applied to a CTA would make the least important
      // line the hardest to read, and a role's weight relative to the headline
      // is what hierarchy is made of.
      //
      // There was a check here for what the document "asked for" first. It was
      // dead: `style.font_weight` holds the typography system's BEHAVIOURAL
      // prose ("solid and unmodulated, heavy enough to be read at a glance"),
      // derived from the same personality the DNA reads, so it matched /heavy/
      // on almost every brief and pinned every headline to 800 whatever the
      // direction said. The DNA reads that personality AND the mood AND the
      // render, so it is the better-informed of the two.
      font_weight: role === "headline" ? dna.weight : weightOf(role, st.font_weight),
      line_height: st.line_height || 1.2,
      letter_spacing: role === "headline" ? dna.spacing || trackingOf(st.letter_spacing) : trackingOf(st.letter_spacing),
      color: normalizeHex(st.color || "") || null,
      plate: plateOf(el),
    };
  });

  // The safe inset the geometry reasons in: 5% for a square or tall frame, 4%
  // for a wide one, matching `gridFor`. Nothing critical crosses it.
  const laid = layoutText({
    canvas: { width: W, height: H },
    blocks: blockInputs,
    area: copyArea(plan, textEls),
    safe_inset: doc.ratio === "16:9" ? 4 : 5,
    map: input.map ?? null,
    brand_text_color: colorFor(kit, "text", "primary"),
  });

  const texts: TextLayer[] = [];
  const plates: EffectLayer[] = [];
  for (const b of laid.blocks) {
    const el = textEls.find((e) => e.id === b.id);
    // What this line is actually read against: its own plate or scrim where the
    // layout engine added one, otherwise the picture underneath it, measured.
    const under = b.scrim?.fill
      ?? (input.luminance ? greyOf(input.luminance({ x: b.x, y: b.y, width: b.width, height: b.height })) : background);
    // Only the HEADLINE wears the treatment.
    //
    // Rendered with every line wearing it, a glow direction produced a glowing
    // headline, a mushy subheadline and a glowing CTA on a solid button plate:
    // the treatment stopped being art direction and became a filter over the
    // whole frame. A designer gives the voice to the line that carries it and
    // leaves the rest clean, and a CTA on a plate is a button, not a place for
    // an effect.
    const wants = b.role === "headline" ? dna.material : "plain";
    const checked = materialForContrast(wants, b.color, under, dna.accent);
    if (checked.refused && !dna.refused.includes(checked.refused)) {
      dna.refused.push(`${b.role} — ${checked.refused}`);
    }
    texts.push({
      material: checked.material,
      kind: "text", id: b.id, name: `Text \u2014 ${b.role}`, role: b.role, content: b.content, lines: b.lines,
      font_family: b.font_family, font_fallback: b.font_fallback,
      font_size: b.font_size, font_weight: b.font_weight, line_height: round(b.line_height), letter_spacing: b.letter_spacing,
      color: b.color, align: b.align, x: b.x, y: b.y, width: b.width, height: b.height,
      rotation: 0, opacity: el?.opacity ?? 1, z: 0,
    });
    if (b.scrim) {
      // A plate is opaque and was decided by the typography system; a scrim is
      // partial and was decided here, because the picture could not carry the
      // line. Named apart so an editor shows them for what they are.
      const isPlate = b.scrim.opacity >= 1;
      plates.push({
        kind: "effect", effect: isPlate ? "plate" : "scrim",
        id: `${b.id}_${isPlate ? "plate" : "scrim"}`,
        name: isPlate ? "CTA plate" : `Scrim \u2014 ${b.role}`,
        fill: b.scrim.fill, radius: b.scrim.radius, blur: 0, attached_to: b.id,
        x: b.scrim.x, y: b.scrim.y, width: b.scrim.width, height: b.scrim.height,
        rotation: 0, opacity: b.scrim.opacity, z: 0,
      });
    }
  }

  // Effects sit under the logo and the words they serve; words on top.
  for (const p of plates) layers.push({ ...p, z: z++ });
  const logo = layers.find((l) => l.id === "logo");
  if (logo) logo.z = z++;
  for (const t of texts) layers.push({ ...t, z: z++ });
  layers.sort((a, b) => a.z - b.z);

  return {
    version: 3,
    canvas: { width: W, height: H, aspect_ratio: doc.canvas?.aspect_ratio || doc.ratio, unit: "px", background: { color: background } },
    text_mode: doc.text_mode || (texts.length ? "exact" : "none"),
    brand: doc.brand ?? null,
    assets,
    layers,
    scene_is_single_raster: true,
    ...(input.map ? { scene_content: { product: input.map.product, focal: input.map.focal } } : {}),
    ...(texts.length ? { typography_dna: dna } : {}),
    layout_notes: laid.notes,
    placement_score: laid.placement_score,
    moved_for_product: laid.moved_for_product,
  };
}

// ── one SVG, used for the composite AND the SVG export ─────────────────────

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Baseline of the FIRST visual line.
 *
 * Unchanged for a one-line layer, which is what every consumer of it assumed
 * before line breaking existed: the box is one line tall, so the centre of the
 * box plus a third of the size is the baseline.
 */
export function baselineOf(t: TextLayer): number {
  const lineH = t.height / Math.max(1, (t.lines || [t.content]).length);
  return t.y + lineH / 2 + t.font_size * 0.35;
}

/** Baseline of every visual line, top to bottom. */
export function baselinesOf(t: TextLayer): number[] {
  const lines = t.lines && t.lines.length ? t.lines : [t.content];
  const lineH = t.height / lines.length;
  return lines.map((_, i) => t.y + i * lineH + lineH / 2 + t.font_size * 0.35);
}

export function anchorXOf(t: TextLayer): number {
  return t.align === "left" ? t.x : t.align === "right" ? t.x + t.width : t.x + t.width / 2;
}

/**
 * The design as SVG. Text is `<text>`, plates are `<rect>`, images are
 * `<image>` with the asset embedded (or omitted when `images` lacks it).
 * `skipScene` builds the overlay the composite draws over the scene.
 */
export function editableSvg(
  design: EditableDesign,
  images: Partial<Record<string, Buffer>>,
  opts: { skipScene?: boolean } = {},
): string {
  const { width: W, height: H } = design.canvas;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<desc>TIDO editable design. Text elements are live text; the scene (background + product) is one raster.</desc>`,
  ];
  // Phase 5.6.3 — the material treatment, as gradients and filters scoped to
  // the layer that wears them. Built up front so every definition is declared
  // before it is referenced, which is what a strict SVG reader requires; the
  // attributes are applied to the `<text>` below. `plain` produces neither.
  const paints = new Map<string, { defs: string; attrs: Record<string, string> }>();
  const dna = design.typography_dna;
  if (dna) {
    for (const l of design.layers) {
      if (l.kind !== "text" || !l.material || l.material === "plain") continue;
      paints.set(l.id, materialPaint({ ...dna, material: l.material }, l.id, l.color, {
        // The brand's ACCENT, resolved with the design. Reading the brand's
        // first colour here instead took the PRIMARY, and a dark green primary
        // made a "metallic" headline dark green on a near-black frame.
        accent: dna.accent ?? null,
        // The treatment is scaled from the line's own size: a relief measured
        // on a 64px probe is invisible on a 240px headline.
        size: l.font_size,
      }));
    }
  }
  const defs = [...paints.values()].map((p) => p.defs).filter(Boolean).join("");
  if (defs) out.push(`<defs>${defs}</defs>`);
  for (const l of design.layers) {
    const common = `id="${esc(l.id)}" data-name="${esc(l.name)}" opacity="${l.opacity}"`;
    if (l.kind === "effect") {
      if (opts.skipScene && l.id === "background") continue;
      out.push(`<rect ${common} x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" rx="${l.radius}" fill="${esc(l.fill)}"/>`);
    } else if (l.kind === "image") {
      if (opts.skipScene && l.role === "scene") continue;
      const buf = images[l.asset];
      if (!buf) continue;
      const href = `data:image/png;base64,${buf.toString("base64")}`;
      out.push(`<image ${common} x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" preserveAspectRatio="xMidYMid meet" href="${href}" xlink:href="${href}"/>`);
    } else {
      const anchor = l.align === "left" ? "start" : l.align === "right" ? "end" : "middle";
      // The layer's own face first, then the fallbacks `FontIntelligence`
      // measured. It used to name Georgia and Times New Roman as the serif
      // fallbacks -- the two faces the font work removed for having no
      // Vietnamese tone marks -- which reintroduced mid-word substitution on
      // any machine missing the chosen face. One function now owns the stack.
      const family = stackFor({ family: l.font_family, fallback: l.font_fallback });
      const lines = l.lines && l.lines.length ? l.lines : [l.content];
      const ax = round(anchorXOf(l));
      const ys = baselinesOf(l);
      // One `<text>` holding one `<tspan>` per visual line. Every vector editor
      // opens that as ONE text object whose content is the client's whole line,
      // which is what keeps a wrapped headline a single editable layer.
      const spans = lines
        .map((line, i) => `<tspan x="${ax}" y="${round(ys[i])}">${esc(line)}</tspan>`)
        .join("");
      // The material's own fill, stroke and filter replace the plain fill. An
      // editor still opens this as live text: the treatment is attributes on
      // the text element, never a rasterised or outlined copy of it.
      const paint = paints.get(l.id);
      const painted = paint
        ? Object.entries(paint.attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(" ")
        : `fill="${esc(l.color)}"`;
      out.push(
        `<text ${common} data-role="${l.role}"${l.material && l.material !== "plain" ? ` data-material="${esc(l.material)}"` : ""} text-anchor="${anchor}"` +
          ` font-family="${esc(family)}" font-size="${l.font_size}" font-weight="${l.font_weight}"` +
          ` letter-spacing="${round(l.letter_spacing * l.font_size)}" ${painted}>${spans}</text>`,
      );
    }
  }
  out.push("</svg>");
  return out.join("\n");
}

// ── composing (the only impure part) ───────────────────────────────────────

export interface ComposeInput {
  document: CreativeDocument;
  brandKit?: BrandKit | null;
  scene: Buffer;
  logo?: Buffer | null;
  /** The plan, when the document did not carry one. */
  plan?: TypographyPlan | null;
  /** The director's decisions. Without them the type is set plain. */
  blueprint?: CreativeBlueprint | null;
  /** The commercial category, when the caller knows one. */
  category?: string | null;
}

export interface ComposeResult {
  design: EditableDesign;
  /** The served image: every layer, flattened, as PNG. */
  composite: Buffer;
  /** Layer assets to store beside the render, keyed by their `file`. */
  files: Record<string, Buffer>;
}

const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

/**
 * Composes the scene and the planned layers. The scene is kept at its own
 * size; the logo is normalised to PNG. Text colour, where the brand does not
 * set one, is chosen against the scene's real pixels.
 */
export async function composeEditable(input: ComposeInput): Promise<ComposeResult> {
  const sharp = (await import("sharp")).default;
  const scenePng = await sharp(input.scene).png().toBuffer();
  const meta = await sharp(scenePng).metadata();
  const W = meta.width || 1024;
  const H = meta.height || 1024;

  // A 64×64 sample of the render. One resize, read twice: once for the ink
  // colour of each line, once for the composition map that decides where the
  // column may go at all.
  const G = 64;
  const { data } = await sharp(scenePng).resize(G, G, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const map = buildCompositionMap({ rgb: data, size: G });
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lumAt = (gx: number, gy: number) => {
    const i = (gy * G + gx) * 3;
    return 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
  };
  const luminance: LuminanceProbe = (b) => {
    const x0 = Math.max(0, Math.floor((b.x / W) * G)), x1 = Math.min(G - 1, Math.ceil(((b.x + b.width) / W) * G));
    const y0 = Math.max(0, Math.floor((b.y / H) * G)), y1 = Math.min(G - 1, Math.ceil(((b.y + b.height) / H) * G));
    let sum = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { sum += lumAt(x, y); n++; }
    return n ? sum / n : 1;
  };
  let r = 0, g = 0, bl = 0;
  for (let i = 0; i < data.length; i += 3) { r += data[i]; g += data[i + 1]; bl += data[i + 2]; }
  const px = data.length / 3;
  const hex = (v: number) => Math.round(v / px).toString(16).padStart(2, "0");
  const sceneColor = `#${hex(r)}${hex(g)}${hex(bl)}`;

  let logoPng: Buffer | null = null;
  let logoMeta: { width: number; height: number } | null = null;
  if (input.logo?.length) {
    try {
      logoPng = await sharp(input.logo).png().toBuffer();
      const m = await sharp(logoPng).metadata();
      logoMeta = { width: m.width || 1, height: m.height || 1 };
    } catch {
      logoPng = null;
    }
  }

  const design = planEditableDesign({
    document: input.document,
    brandKit: input.brandKit,
    scene: { width: W, height: H, sha256: sha(scenePng) },
    logo: logoPng && logoMeta ? { ...logoMeta, sha256: sha(logoPng) } : null,
    luminance,
    sceneColor,
    map,
    plan: input.plan ?? null,
    blueprint: input.blueprint ?? null,
    category: input.category ?? null,
  });
  console.log("[EDITABLE][COMPOSITION]", compositionMapTelemetry(map));
  for (const note of design.layout_notes || []) console.log("[EDITABLE][LAYOUT]", note);
  if (design.typography_dna) {
    console.log("[EDITABLE][TYPOGRAPHY_DNA]", typographyDnaTelemetry(design.typography_dna));
    // A refused treatment is a design decision someone may query later, so it
    // is said rather than left implicit in the absence of an effect.
    for (const r of design.typography_dna.refused) console.log("[EDITABLE][TYPOGRAPHY_DNA] refused", r);
  }
  const overlay = editableSvg(design, { logo: logoPng ?? undefined }, { skipScene: true });
  const composite = await sharp(scenePng).composite([{ input: Buffer.from(overlay), top: 0, left: 0 }]).png().toBuffer();

  const files: Record<string, Buffer> = { "layers/scene.png": scenePng };
  if (logoPng && design.assets.logo) files["layers/logo.png"] = logoPng;
  return { design, composite, files };
}

/** Counts only -- never the client's copy. */
export function editableTelemetry(d: EditableDesign | null | undefined) {
  if (!d) return { editable_design: false };
  const by = (k: string) => d.layers.filter((l) => l.kind === k).length;
  return {
    editable_design: true,
    canvas: `${d.canvas.width}x${d.canvas.height}`,
    layers: d.layers.length,
    text_layers: by("text"),
    image_layers: by("image"),
    effect_layers: by("effect"),
    has_logo: Boolean(d.assets.logo),
    scrims: d.layers.filter((l) => l.kind === "effect" && l.effect === "scrim").length,
    wrapped_lines: d.layers.filter((l): l is TextLayer => l.kind === "text").map((t) => (t.lines || [t.content]).length),
    font_sizes: d.layers.filter((l): l is TextLayer => l.kind === "text").map((t) => t.font_size),
    placement_score: d.placement_score ?? null,
    moved_for_product: Boolean(d.moved_for_product),
    min_text_contrast: Math.min(
      ...d.layers.filter((l): l is TextLayer => l.kind === "text").map((t) => {
        const plate = d.layers.find((p) => p.kind === "effect" && p.attached_to === t.id) as EffectLayer | undefined;
        return plate ? contrastRatio(t.color, plate.fill) : 21;
      }),
      21,
    ),
  };
}
