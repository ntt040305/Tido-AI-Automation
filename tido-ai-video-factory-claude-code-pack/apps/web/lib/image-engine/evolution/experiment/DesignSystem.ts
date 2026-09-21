import type { ProductMeaning } from "./ProductMeaning";
import type { VisualDNA } from "./VisualDNAAnalyzer";
import type { AssetContext } from "./AssetContext";
import type { CreativeDecision } from "./CreativeDecision";
import type { Decision, DecisionBasis } from "./CreativeBlueprint";

/**
 * The Design System — one visual language, settled before the frame is described.
 *
 * Six systems, each a `Decision` so it carries what it rests on. Deterministic,
 * pure, no model call.
 *
 * Why this is not a style library
 * -------------------------------
 * The roadmap's example — "luxury skincare: ivory, gold, serif, glass" — is a
 * style preset keyed on a category, and a table of those is the one thing this
 * codebase has refused at every phase. What makes a perfume brand differ from a
 * food brand is not a lookup: it is that they are made of different materials,
 * photographed under different light, and sold on different claims. Every one of
 * those is already observed or declared upstream.
 *
 * So the palette comes from `VisualDNA.observed.product.palette` — the colours
 * the product actually is. The material language comes from the observed
 * materials and finish. The spacing system comes from the format's own
 * information density. A serum and a bowl of pho get different design systems
 * because they ARE different, not because a table says beauty means ivory.
 *
 * Where nothing is observed the field stays null. A design system invented for a
 * product nobody photographed is a house style with a provenance record.
 */

export type DesignSystemField =
  | "color_system"
  | "typography_system"
  | "graphic_language"
  | "material_language"
  | "spacing_system"
  | "visual_style";

export const DESIGN_SYSTEM_FIELDS: readonly DesignSystemField[] = [
  "color_system",
  "typography_system",
  "graphic_language",
  "material_language",
  "spacing_system",
  "visual_style",
];

export interface DesignSystem {
  color_system: Decision | null;
  typography_system: Decision | null;
  graphic_language: Decision | null;
  material_language: Decision | null;
  spacing_system: Decision | null;
  visual_style: Decision | null;
  /** Share of the six that are grounded, 0–1. */
  completeness: number;
  missing: DesignSystemField[];
}

export interface DesignSystemInput {
  visualDNA?: VisualDNA | null;
  productMeaning?: ProductMeaning | null;
  assetContext?: AssetContext | null;
  decision?: CreativeDecision | null;
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

function made(
  value: string,
  because: string,
  derived_from: DecisionBasis,
  confidence: Decision["confidence"]
): Decision | null {
  const v = clean(value);
  const b = clean(because);
  if (!v || !b || v.toLowerCase() === b.toLowerCase()) return null;
  return { value: v, because: b, derived_from, confidence };
}

export function buildDesignSystem(input: DesignSystemInput): DesignSystem {
  const observed = input.visualDNA?.observed?.product || null;
  const ac = input.assetContext || null;
  const d = input.decision || null;
  const pm = input.productMeaning || null;

  const palette = (observed?.palette || []).map(clean).filter(Boolean);
  const materials = (observed?.materials || []).map(clean).filter(Boolean);
  const finish = clean(observed?.finish);

  const fields: Record<DesignSystemField, Decision | null> = {
    // The colours the product already is, not a palette chosen for its category.
    color_system: made(
      palette.length
        ? `Built from the product's own colours (${palette.join(", ")}); anything added has to sit against them rather than compete.`
        : "",
      "VisualDNA.observed.product.palette — read off the attached image",
      "visual_dna",
      "high"
    ),

    typography_system: made(
      clean(d?.typography_decision) || clean(ac?.typography_role),
      clean(d?.typography_decision)
        ? "the director's call on how the words behave"
        : `AssetContext.typography_role for a ${clean(ac?.asset_type).replace(/_/g, " ")} asset`,
      clean(d?.typography_decision) ? "director" : "strategy",
      "high"
    ),

    // Graphic language is decided by what the frame is ALLOWED, which the
    // director states as what to avoid. Nothing invents decoration here.
    graphic_language: made(
      (d?.avoid_elements || []).length
        ? `Nothing added beyond what the photograph contains. Specifically excluded: ${(d!.avoid_elements || []).map(clean).filter(Boolean).join("; ")}.`
        : palette.length
          ? "Nothing added beyond what the photograph contains; the product's own surfaces carry the frame."
          : "",
      (d?.avoid_elements || []).length
        ? "the director's avoid-list for this brief"
        : "VisualDNA.observed.product — the product's surfaces are what the frame has to work with",
      (d?.avoid_elements || []).length ? "director" : "visual_dna",
      "medium"
    ),

    material_language: made(
      [materials.join(" and "), finish].filter(Boolean).join(", "),
      "VisualDNA.observed.product — the material as the attached image shows it",
      "visual_dna",
      "high"
    ),

    // Spacing follows the format's own information density, which is the real
    // difference between a luxury poster and an ecommerce banner.
    spacing_system: made(
      clean(ac?.information_density),
      `AssetContext.information_density for a ${clean(ac?.asset_type).replace(/_/g, " ")} asset`,
      "strategy",
      "high"
    ),

    visual_style: made(
      clean(d?.environment_decision) || (pm?.visual_implication ? pm.visual_implication.value : ""),
      clean(d?.environment_decision)
        ? "the chosen direction's visual language"
        : pm?.visual_implication
          ? `ProductMeaning.visual_implication — ${pm.visual_implication.because}`
          : "",
      clean(d?.environment_decision) ? "director" : "product_truth",
      "high"
    ),
  };

  const missing = DESIGN_SYSTEM_FIELDS.filter((f) => !fields[f]);
  return {
    ...fields,
    completeness: Math.round(((DESIGN_SYSTEM_FIELDS.length - missing.length) / DESIGN_SYSTEM_FIELDS.length) * 100) / 100,
    missing,
  };
}

/** Counts and field names only — never the design language text. */
export function designSystemTelemetry(s: DesignSystem | null | undefined) {
  if (!s) return { design_system: false };
  const byBasis: Record<string, number> = {};
  for (const f of DESIGN_SYSTEM_FIELDS) {
    const d = s[f];
    if (d) byBasis[d.derived_from] = (byBasis[d.derived_from] || 0) + 1;
  }
  return {
    design_system: true,
    completeness: s.completeness,
    filled: DESIGN_SYSTEM_FIELDS.length - s.missing.length,
    missing: s.missing,
    by_basis: byBasis,
  };
}

/** The design system as the prompt carries it, or undefined when empty. */
export function renderDesignSystem(s: DesignSystem | null | undefined): string | undefined {
  if (!s) return undefined;
  const rows = DESIGN_SYSTEM_FIELDS.map((f) => [f, s[f]] as const).filter(([, d]) => d);
  if (!rows.length) return undefined;
  return [
    "DESIGN SYSTEM — the visual language for this brief, taken from the product rather than from a house style.",
    ...rows.map(([f, d]) => `- ${f.replace(/_/g, " ")}: ${d!.value}`),
  ].join("\n");
}
