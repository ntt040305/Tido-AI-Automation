import type { CreativeDecision } from "./CreativeDecision";
import type { VisualDNA } from "./VisualDNAAnalyzer";
import type { ProductMeaning } from "./ProductMeaning";
import type { DecisionBasis } from "./CreativeBlueprint";

/**
 * Asset Intelligence — what may appear in the frame besides the product.
 *
 * The rule is the whole module: an asset exists only when something upstream
 * already said what it MEANS. The director records `element_meanings` beside
 * `important_visual_elements` precisely so an element can be traced to a
 * meaning; this pairs them and refuses anything unpaired.
 *
 * That refusal is the feature. "Add a coffee bean because it looks nice" cannot
 * be expressed here — there is no field for it, and an element with no meaning
 * is dropped rather than admitted with a placeholder purpose. Decoration is not
 * something this schema can hold.
 *
 * Deterministic, pure, no model call. Nothing is generated; assets are ROUTED
 * from decisions that already exist.
 */

export type AssetKind = "background" | "texture" | "shape" | "icon" | "decoration" | "effect";

export interface IntelligentAsset {
  asset: string;
  /** What it is for. Sourced, never "it looks good". */
  purpose: string;
  /** How it relates to the product. The field that stops collage. */
  relationship: string;
  /** Where it sits, and why there. */
  placement: string;
  kind: AssetKind;
  derived_from: DecisionBasis;
}

export interface AssetPlan {
  assets: IntelligentAsset[];
  /**
   * Elements the director named but never gave a meaning.
   *
   * Reported rather than admitted. This list is the honest measure of how much
   * of a frame was going to be decoration.
   */
  rejected: { element: string; reason: string }[];
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/**
 * Classifies an element by what it is, using only structural words.
 *
 * Craft vocabulary, not subject matter: "texture" and "shadow" mean the same
 * thing photographing a serum or a bowl of pho. Anything unrecognised is a
 * decoration, which is the most restrictive class, because guessing generously
 * is how decoration gets in.
 */
function kindOf(element: string): AssetKind {
  const e = element.toLowerCase();
  if (/\b(backdrop|background|wall|surface|floor|counter|table)\b/.test(e)) return "background";
  if (/\b(texture|grain|weave|fabric|paper|stone|wood)\b/.test(e)) return "texture";
  if (/\b(shape|line|band|frame|border|block|column)\b/.test(e)) return "shape";
  if (/\b(icon|badge|mark|symbol|logo)\b/.test(e)) return "icon";
  if (/\b(steam|smoke|light|glow|reflection|shadow|haze|condensation)\b/.test(e)) return "effect";
  return "decoration";
}

export interface AssetPlanInput {
  decision?: CreativeDecision | null;
  visualDNA?: VisualDNA | null;
  productMeaning?: ProductMeaning | null;
}

/**
 * Pairs each named element with its meaning. Pure and total.
 *
 * The pairing is positional, because that is how the director emits them:
 * `element_meanings[i]` is the meaning of `important_visual_elements[i]`. Where
 * the arrays are ragged the unpaired elements are rejected rather than matched
 * to whatever meaning happens to be left, which would attach a reason to the
 * wrong thing and read as sourced.
 */
export function planAssets(input: AssetPlanInput): AssetPlan {
  const d = input.decision || null;
  const elements = (d?.important_visual_elements || []).map(clean).filter(Boolean);
  const meanings = (d?.element_meanings || []).map(clean).filter(Boolean);
  const observed = input.visualDNA?.observed?.product || null;

  const assets: IntelligentAsset[] = [];
  const rejected: { element: string; reason: string }[] = [];

  elements.forEach((element, i) => {
    const meaning = meanings[i];
    if (!meaning) {
      rejected.push({
        element,
        reason:
          "the director named it but recorded no meaning for it; an element with no stated meaning is decoration",
      });
      return;
    }
    assets.push({
      asset: element,
      purpose: meaning,
      relationship: observed
        ? `Read against the product's own ${clean(observed.finish) || clean(observed.form) || "surface"}; it supports the product and never covers it.`
        : "It supports the product and never covers it.",
      placement: "In the same moment as the product, close enough to read as one scene.",
      kind: kindOf(element),
      derived_from: "director",
    });
  });

  // A meaning with no element is the mirror failure and is equally refused.
  meanings.slice(elements.length).forEach((meaning) => {
    rejected.push({ element: meaning, reason: "a meaning with no element to attach it to" });
  });

  return { assets, rejected };
}

/** Counts and kinds only — never the asset text. */
export function assetTelemetry(p: AssetPlan | null | undefined) {
  if (!p) return { assets: false };
  const byKind: Record<string, number> = {};
  for (const a of p.assets) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
  return {
    assets: true,
    admitted: p.assets.length,
    rejected: p.rejected.length,
    by_kind: byKind,
  };
}

/** The plan as the prompt carries it, or undefined when nothing qualified. */
export function renderAssets(p: AssetPlan | null | undefined): string | undefined {
  if (!p?.assets.length) return undefined;
  return [
    "SUPPORTING ELEMENTS — each is here because it says something. Nothing else is added.",
    ...p.assets.map((a) => `- ${a.asset}: ${a.purpose}\n    ${a.relationship}`),
  ].join("\n");
}
