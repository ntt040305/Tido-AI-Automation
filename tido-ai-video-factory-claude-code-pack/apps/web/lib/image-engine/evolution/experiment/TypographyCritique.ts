import type { TextCheck, VisibleText } from "../../compiler/ExactCopyIntegrityValidator";
import type { EditableDesign, EffectLayer, TextLayer } from "./EditableDesign";
import type { CompositionMap } from "./CompositionMap";
import { overlapShare } from "./CompositionMap";
import type { TypographyPlan } from "./TypographyPlan";

/**
 * The typographic critique — what a senior art director would say about the
 * type in a finished frame.
 *
 * TWO SOURCES, KEPT APART
 * -----------------------
 * A finding is either MEASURED or OBSERVED, and this module never lets the two
 * blur:
 *
 *   measured   Computed from the design the render was composed from: two text
 *              boxes that intersect, a headline set smaller than the line
 *              supporting it, a line below its contrast floor, a block over the
 *              product. These are arithmetic. They are certain, they are
 *              reproducible, and they need no model.
 *
 *   observed   Read out of the rendered pixels by a vision model: a word drawn
 *              twice, a line that collides with an object edge, letterforms
 *              that came back as noise. These are the only way to catch what
 *              the renderer did rather than what it was asked to do, and they
 *              carry the model's own uncertainty with them.
 *
 * Mixing them is how a system starts reporting a model's guess as a fact. Every
 * finding here says which it is.
 *
 * WHY DUPLICATE DETECTION IS DETERMINISTIC
 * ----------------------------------------
 * The vision model is asked to list every legible block of text. Whether the
 * same line appears twice is then a comparison, not a judgement -- and a
 * comparison is not something to ask a model to make, because it will
 * sometimes answer "no" about a list it just produced. `checkRenderedText`
 * already normalises for case and accents; this reuses that normalisation and
 * counts.
 *
 * Pure. No I/O, no model call.
 */

export type Severity = "blocking" | "serious" | "minor";
export type Source = "measured" | "observed";

export type CritiqueArea =
  | "duplicate_text"
  | "collision"
  | "hierarchy"
  | "readability"
  | "balance"
  | "professional_finish";

export interface TypographyFinding {
  area: CritiqueArea;
  severity: Severity;
  source: Source;
  /** What is wrong, as a designer would say it to another designer. */
  what: string;
  /** Where in the frame, when it is known. */
  where?: string;
  /** The concrete change, when one follows from the finding. */
  fix?: string;
}

export interface TypographyCritique {
  findings: TypographyFinding[];
  /** 0-10 per dimension. Deliberately not averaged into a single badge. */
  scores: {
    duplicate_free: number;
    collision_free: number;
    hierarchy: number;
    readability: number;
    balance: number;
  };
  /** True when nothing blocking or serious was found. */
  shippable: boolean;
}

const squash = (s: string) => String(s || "").replace(/\s+/g, " ").trim();
/** Case- and accent-insensitive, for recognising a repeat of the same words. */
const loose = (s: string) =>
  squash(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, "");

const ROLE_ORDER: Record<string, number> = { headline: 1, subheadline: 2, body: 3, cta: 4 };

export interface CritiqueInput {
  /** The design the render was composed from. Absent, only observed findings. */
  design?: EditableDesign | null;
  /** What the render was required to say, checked against what was seen. */
  textCheck?: TextCheck | null;
  /** Every block of text the vision model could read. */
  visibleText?: VisibleText[] | null;
  /**
   * What the render was found to contain. Only the product box is read, so the
   * design's own `scene_content` satisfies this without carrying a grid of
   * pixels through the review.
   */
  map?: Pick<CompositionMap, "product"> | null;
  /** The plan, for the line allowance each block was given. */
  plan?: TypographyPlan | null;
}

/**
 * Critiques the typography. Pure and total.
 *
 * Returns an empty critique when there is nothing to judge -- no design and no
 * observation. An empty finding list is a real answer and is reported as one:
 * inventing a finding to look thorough is the failure mode this module is most
 * exposed to, and the scores make silence measurable rather than ambiguous.
 */
export function critiqueTypography(input: CritiqueInput): TypographyCritique {
  const findings: TypographyFinding[] = [];
  const design = input.design || null;
  const texts = (design?.layers.filter((l): l is TextLayer => l.kind === "text") || []).slice();
  const effects = design?.layers.filter((l): l is EffectLayer => l.kind === "effect") || [];
  const canvas = design?.canvas;

  // ── 1. duplicate text ────────────────────────────────────────────────────
  const generated = (input.visibleText || [])
    .filter((v) => v && squash(v.text) && !v.on_product && !v.on_logo)
    .map((v) => squash(v.text));
  const seen = new Map<string, number>();
  for (const g of generated) {
    const key = loose(g);
    if (!key) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count < 2) continue;
    const example = generated.find((g) => loose(g) === key) || "";
    findings.push({
      area: "duplicate_text",
      severity: "blocking",
      source: "observed",
      what: `The same line is set ${count} times in one frame${example ? ` ("${example}")` : ""}.`,
      fix: "Each supplied line is one block of type. Remove every repeat and set the line once.",
    });
  }
  // A line the client never supplied, drawn anyway: the other half of the same
  // defect, and the one `checkRenderedText` already isolates.
  for (const extra of input.textCheck?.unwanted || []) {
    findings.push({
      area: "duplicate_text",
      severity: "blocking",
      source: "observed",
      what: `The frame carries text nobody supplied: "${extra}".`,
      fix: "Render only the supplied lines. Invented headlines, slogans and captions are not typography decisions.",
    });
  }
  for (const wrong of input.textCheck?.incorrect || []) {
    findings.push({
      area: "professional_finish",
      severity: "blocking",
      source: "observed",
      what: `"${wrong.expected}" came back as "${wrong.rendered}" — the letterforms are the renderer's guess, not the client's line.`,
      fix: "Set this line as real type rather than asking the image model to draw it.",
    });
  }

  // ── 2. collision ─────────────────────────────────────────────────────────
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
        findings.push({
          area: "collision",
          severity: "blocking",
          source: "measured",
          what: `The ${a.role} and the ${b.role} occupy the same area of the frame.`,
          where: `${a.role} at ${a.x},${a.y}; ${b.role} at ${b.x},${b.y}`,
          fix: "Separate the blocks vertically, or reduce the block that is not leading.",
        });
      }
    }
  }
  if (design && canvas && input.map?.product) {
    const product = input.map.product;
    for (const t of texts) {
      const box = {
        x: (t.x / canvas.width) * 100,
        y: (t.y / canvas.height) * 100,
        width: (t.width / canvas.width) * 100,
        height: (t.height / canvas.height) * 100,
      };
      const share = overlapShare(box, product);
      if (share > 0.2) {
        findings.push({
          area: "collision",
          severity: share > 0.5 ? "blocking" : "serious",
          source: "measured",
          what: `The ${t.role} crosses the product: ${Math.round(share * 100)}% of the block sits over it.`,
          where: `${Math.round(box.x)}% across, ${Math.round(box.y)}% down`,
          fix: "Move the block into the clear area the composition reserved, or reduce it until it clears the product silhouette.",
        });
      }
    }
  }

  // ── 3. hierarchy ─────────────────────────────────────────────────────────
  const ordered = [...texts].sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  for (let i = 1; i < ordered.length; i++) {
    const above = ordered[i - 1];
    const below = ordered[i];
    if ((ROLE_ORDER[below.role] ?? 9) <= (ROLE_ORDER[above.role] ?? 9)) continue;
    if (below.font_size > above.font_size) {
      findings.push({
        area: "hierarchy",
        severity: "serious",
        source: "measured",
        what: `The ${below.role} is set larger than the ${above.role} (${below.font_size}px against ${above.font_size}px), so the frame is read in the wrong order.`,
        fix: `Set the ${above.role} above the ${below.role} in size, or shorten neither and give the ${above.role} another line.`,
      });
    }
  }
  const head = ordered[0];
  const rest = ordered.slice(1);
  if (head && rest.length && rest.every((r) => head.font_size / Math.max(1, r.font_size) < 1.25)) {
    findings.push({
      area: "hierarchy",
      severity: "serious",
      source: "measured",
      what: "Every block is set at almost the same size; nothing leads the frame.",
      fix: "Widen the spread: the leading line should read at roughly twice the smallest.",
    });
  }

  // ── 4. readability ───────────────────────────────────────────────────────
  if (design && canvas) {
    const large = Math.min(canvas.width, canvas.height) * 0.045;
    const floorPx = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.018));
    for (const t of texts) {
      const plate = effects.find((e) => e.attached_to === t.id);
      const behind = plate?.effect === "plate" ? plate.fill : null;
      const ratio = behind ? contrast(t.color, behind) : null;
      const floor = t.font_size >= large ? 3 : 4.5;
      if (ratio !== null && ratio < floor) {
        findings.push({
          area: "readability",
          severity: "blocking",
          source: "measured",
          what: `The ${t.role} reaches only ${ratio.toFixed(1)}:1 against its plate, below the ${floor}:1 it needs.`,
          fix: "Change the ink or the plate until the line clears its floor.",
        });
      }
      if (t.font_size < floorPx) {
        findings.push({
          area: "readability",
          severity: "serious",
          source: "measured",
          what: `The ${t.role} is set at ${t.font_size}px on a ${canvas.width}×${canvas.height} frame — too small to read at the size this will be seen.`,
          fix: "Give the block more of the frame, or let it run to another line rather than shrinking it further.",
        });
      }
      const inset = Math.round(Math.min(canvas.width, canvas.height) * 0.04);
      if (t.x < inset || t.y < inset || t.x + t.width > canvas.width - inset || t.y + t.height > canvas.height - inset) {
        findings.push({
          area: "readability",
          severity: "serious",
          source: "measured",
          what: `The ${t.role} crosses the frame's safe margin and will be clipped by a crop or a platform overlay.`,
          fix: "Pull the block inside the safe area.",
        });
      }
    }
  }

  // ── 5. balance ───────────────────────────────────────────────────────────
  if (design && canvas && texts.length) {
    const cx = texts.reduce((n, t) => n + (t.x + t.width / 2) * t.width * t.height, 0);
    const mass = texts.reduce((n, t) => n + t.width * t.height, 0) || 1;
    const centroid = (cx / mass / canvas.width) * 100;
    const productCentre = input.map?.product ? input.map.product.x + input.map.product.width / 2 : null;
    if (productCentre !== null && Math.abs(centroid - productCentre) < 8 && (input.map?.product?.width ?? 0) < 70) {
      findings.push({
        area: "balance",
        severity: "minor",
        source: "measured",
        what: "The copy sits on the same axis as the product, so the two compete rather than balance.",
        fix: "Move the copy column to the side the product left empty.",
      });
    }
  }

  // ── 6. professional finish, from what the model saw ──────────────────────
  for (const line of input.textCheck?.missing || []) {
    findings.push({
      area: "professional_finish",
      severity: "blocking",
      source: "observed",
      what: `"${line}" does not appear in the frame at all.`,
      fix: "The line was supplied and must be set.",
    });
  }

  const worst = (area: CritiqueArea) => {
    const hits = findings.filter((f) => f.area === area);
    if (!hits.length) return 10;
    if (hits.some((f) => f.severity === "blocking")) return 2;
    if (hits.some((f) => f.severity === "serious")) return 5;
    return 8;
  };

  return {
    findings,
    scores: {
      duplicate_free: worst("duplicate_text"),
      collision_free: worst("collision"),
      hierarchy: worst("hierarchy"),
      readability: worst("readability"),
      balance: worst("balance"),
    },
    shippable: !findings.some((f) => f.severity === "blocking" || f.severity === "serious"),
  };
}

/** WCAG contrast between two hex colours. Local so this module stays pure. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = String(hex).replace("#", "");
    const ch = [0, 2, 4].map((i) => {
      const v = parseInt(h.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The critique as a person reads it.
 *
 * Ordered by severity, because a reader who stops after two lines should have
 * read the two that matter.
 */
export function renderTypographyCritique(c: TypographyCritique | null | undefined): string | undefined {
  if (!c?.findings.length) return undefined;
  const rank: Record<Severity, number> = { blocking: 0, serious: 1, minor: 2 };
  const out = ["TYPOGRAPHY CRITIQUE"];
  for (const f of [...c.findings].sort((a, b) => rank[a.severity] - rank[b.severity])) {
    out.push(`- [${f.severity}/${f.source}] ${f.what}${f.where ? ` (${f.where})` : ""}`);
    if (f.fix) out.push(`    ${f.fix}`);
  }
  return out.join("\n");
}

/** Counts and scores only — never the client's copy. */
export function typographyCritiqueTelemetry(c: TypographyCritique | null | undefined) {
  if (!c) return { typography_critique: false };
  const by: Record<string, number> = {};
  for (const f of c.findings) by[f.area] = (by[f.area] || 0) + 1;
  return {
    typography_critique: true,
    findings: c.findings.length,
    by_area: by,
    blocking: c.findings.filter((f) => f.severity === "blocking").length,
    measured: c.findings.filter((f) => f.source === "measured").length,
    observed: c.findings.filter((f) => f.source === "observed").length,
    scores: c.scores,
    shippable: c.shippable,
  };
}
