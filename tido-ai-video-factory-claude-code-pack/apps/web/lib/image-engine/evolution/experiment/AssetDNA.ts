import type { Decision, DecisionBasis } from "./CreativeBlueprint";
import type { VisualDNA, VisualDNAObservedProduct, VisualDNAObservedLogo } from "./VisualDNAAnalyzer";

/**
 * What the uploaded assets are, as a designer would understand them.
 *
 * Why this is not AssetIntelligence
 * ---------------------------------
 * `AssetIntelligence.ts` already exists and plans DECORATIVE elements --
 * backgrounds, textures, shapes, props the director asked for. It answers "what
 * else belongs in this frame". This file answers a different question: "what is
 * the thing the user gave me", for the product, the logo and the references
 * they uploaded. Same word, opposite direction, so they stay separate modules.
 *
 * Why this is not a second vision system
 * --------------------------------------
 * It does not look at anything. `VisualDNAAnalyzer` already reads uploaded
 * images with a model and -- importantly -- already drops any inference whose
 * `basis_quote` does not appear in what was observed. That discipline is worth
 * more than a second analyser, so this module is a pure reading of its output.
 * No model call, no image handling, no bytes.
 *
 * The trap this file deliberately avoids
 * --------------------------------------
 * The obvious way to produce "a coffee cup suits a cafe, a morning atmosphere,
 * and not a jewellery treatment" is a category table: detect the category, look
 * up the environments. That is exactly the style-preset database this project
 * forbids, and it fails the moment someone uploads something the table has
 * never seen -- which, for a platform serving every industry, is most of the
 * time. It also quietly makes every coffee brand's poster look the same.
 *
 * So nothing here is looked up. Suitability is DERIVED from what was actually
 * observed: a matte, absorbent, hand-scale surface behaves one way under light
 * and a faceted, specular, small-scale one behaves another, and that is a fact
 * about the object rather than about its industry. Two products in the same
 * category with different finishes get different answers, which is the whole
 * point.
 *
 * Every field carries `because`, `derived_from` and `confidence`, and anything
 * the observation does not support is absent rather than guessed.
 */

/** How this asset may be treated, and what would fight it. */
export interface AssetTreatment {
  /** Lighting and environment the observed surface supports. */
  supports: Decision[];
  /**
   * Treatments the observation actively contradicts.
   *
   * Only ever derived from a conflict that was seen -- never "products like
   * this usually avoid X". An empty list is the correct and common answer.
   */
  contradicts: Decision[];
}

/** What the uploaded product is. */
export interface ProductDNA {
  /** Physical form, quoted from the observation. */
  form: Decision | null;
  /** Surface behaviour: how light will actually meet it. */
  material: Decision | null;
  /** Colour actually present, never a brand palette guess. */
  palette: Decision | null;
  /** Texture and wear that make it read as a real manufactured object. */
  texture: Decision | null;
  /** How the object carries itself. The nearest thing here to a judgement. */
  personality: Decision | null;
  treatment: AssetTreatment;
}

/**
 * How the logo has to be handled.
 *
 * Logo rules are the one place where being wrong is a brand-safety problem
 * rather than a taste problem, so these are conservative by construction: they
 * widen the safe area when the observation is thin rather than narrowing it.
 */
export interface LogoDNA {
  /** Where it can sit, given its own geometry. */
  placement: Decision | null;
  /** Clear space around it, as a multiple of its own height. */
  safe_area: Decision | null;
  /** How small it can go before its letterforms stop resolving. */
  scale_behaviour: Decision | null;
  colour: Decision | null;
}

/** A supporting object and what it is doing in the frame. */
export interface SupportingAssetDNA {
  role: string;
  /** How it relates to the product. The field that stops a collage. */
  relationship: Decision;
  /** Whether it coheres with the product's observed surface. */
  compatible: boolean;
}

export interface AssetDNA {
  product: ProductDNA | null;
  logo: LogoDNA | null;
  supporting: SupportingAssetDNA[];
  /** Observations that supported nothing, kept so the gaps stay visible. */
  unread: string[];
  provenance: {
    /** False means no model saw an image. The caller must not treat this as fact. */
    derived_from_image: boolean;
    observed_branches: string[];
  };
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

function decide(
  value: string,
  because: string,
  derived_from: DecisionBasis,
  confidence: "low" | "medium" | "high",
): Decision | null {
  const v = clean(value);
  const b = clean(because);
  // A decision without its basis is the thing this codebase keeps deleting.
  if (!v || !b) return null;
  return { value: v, because: b, derived_from, confidence };
}

/** Nothing was uploaded, or nothing was read. Distinct from "read and empty". */
export function emptyAssetDNA(): AssetDNA {
  return {
    product: null,
    logo: null,
    supporting: [],
    unread: [],
    provenance: { derived_from_image: false, observed_branches: [] },
  };
}

/**
 * Surface vocabulary, in behavioural terms rather than category terms.
 *
 * These match how a surface BEHAVES under light, which is a physical property
 * of the thing that was observed. "matte" is not a category and not a style: it
 * is a statement about specular response, and it is true of a ceramic mug, a
 * paper carton and an unglazed tile alike.
 */
const MATTE = /\bmatte?\b|\bunglazed\b|\bbrushed\b|\bfrosted\b|\bsoft-touch\b|\braw\b|\blinen\b|\bpaper\b|\bcard\b|\bfabric\b|\bcloth\b|\bwood\b|\bconcrete\b|\bstone\w*\b|\bleather\b|\bsuede\b/i;
// Word-anchored, and this is not fussiness. Without the boundary, "glaze"
// matched inside "unglazed" -- so an unglazed stoneware mug read as a polished
// surface, and a linen cloth beside it was flagged as incompatible with its own
// product. A substring match here inverts the meaning of the word it matched.
const SPECULAR = /\bgloss\w*\b|\bpolished\b|\bmirror\w*\b|\bchrome\b|\blacquer\w*\b|\bglaze[ds]?\b|\bvarnish\w*\b|\bmetallic\b|\bfoil\b|\bpatent\b|\benamel\w*\b/i;
const TRANSPARENT = /\bglass\b|\btransparent\b|\btranslucent\b|\bclear\b|\bcrystal\b|\bacrylic\b/i;
const FACETED = /\bfacet\w*\b|\bprism\w*\b|\bengraved\b|\bembossed\b|\bribbed\b|\bfluted\b|\bknurled\b/i;

/**
 * Derives what treatments the observed surface supports.
 *
 * The reasoning is the same a photographer would use standing in front of the
 * object: a matte surface eats specular highlight and needs shape from
 * direction, a polished one needs something worth reflecting, glass needs
 * something behind it. None of that depends on knowing what the product is.
 */
function treatmentFor(product: VisualDNAObservedProduct): AssetTreatment {
  const supports: Decision[] = [];
  const contradicts: Decision[] = [];

  const materials = (product.materials || []).map(clean).filter(Boolean);
  const finish = clean(product.finish);
  const surface = [...materials, finish].join(" ");
  if (!surface) return { supports, contradicts };

  const quote = finish || materials[0];

  if (MATTE.test(surface)) {
    push(supports, decide(
      "directional light with a soft falloff, shaping the form rather than glinting off it",
      `the surface was observed as "${quote}", which absorbs specular highlight and reads flat under a hard source`,
      "visual_dna", "high",
    ));
    push(contradicts, decide(
      "high-gloss reflective staging",
      `nothing in the observed surface ("${quote}") would produce the reflections that treatment depends on`,
      "visual_dna", "medium",
    ));
  }

  if (SPECULAR.test(surface)) {
    push(supports, decide(
      "a controlled environment with something worth reflecting, and large soft sources shaped into the highlight",
      `the surface was observed as "${quote}", so its highlights carry the form and every reflection becomes part of the subject`,
      "visual_dna", "high",
    ));
    push(contradicts, decide(
      "a busy or cluttered surround",
      `a polished surface observed as "${quote}" will reflect the clutter back into the frame`,
      "visual_dna", "medium",
    ));
  }

  if (TRANSPARENT.test(surface)) {
    push(supports, decide(
      "backlight or a bright ground behind the object, so the material reads as transparent rather than grey",
      `the surface was observed as "${quote}", which has no colour of its own without something passing through it`,
      "visual_dna", "high",
    ));
  }

  if (FACETED.test(surface)) {
    push(supports, decide(
      "raking light across the surface so the relief is visible",
      `the surface was observed as "${quote}", and flat frontal light would collapse that detail entirely`,
      "visual_dna", "medium",
    ));
  }

  const scale = clean(product.scale_cues);
  if (scale) {
    push(supports, decide(
      "a framing that keeps the object's real size legible",
      `scale was readable from "${scale}", and losing it makes the product read as a render rather than a photograph`,
      "visual_dna", "medium",
    ));
  }

  const condition = clean(product.condition);
  if (/used|worn|opened|aged|patina/i.test(condition)) {
    push(contradicts, decide(
      "a pristine, untouched hero treatment",
      `the object was observed as "${condition}", and staging it as unopened would contradict what is visibly there`,
      "visual_dna", "high",
    ));
  }

  return { supports, contradicts };
}

function push(list: Decision[], d: Decision | null) {
  if (d) list.push(d);
}

/** Reads the product branch. Returns null when nothing was observed. */
function productFrom(p: VisualDNAObservedProduct | undefined): ProductDNA | null {
  if (!p) return null;
  const form = clean(p.form);
  const materials = (p.materials || []).map(clean).filter(Boolean);
  const palette = (p.palette || []).map(clean).filter(Boolean);
  const finish = clean(p.finish);
  const detail = clean(p.surface_detail);
  if (!form && !materials.length && !palette.length && !finish) return null;

  // Personality is the one derived reading here, so it is held to a lower
  // confidence and states the observations it rests on. It is not a style
  // label: it describes how the object presents, which is visible.
  const restraint = materials.length <= 2 && palette.length <= 3;
  const personality = form || materials.length
    ? decide(
        restraint
          ? "restrained and deliberate, carrying its quality in the material rather than in decoration"
          : "layered and expressive, with several materials and colours doing work at once",
        `observed ${materials.length} material${materials.length === 1 ? "" : "s"} and ${palette.length} colour${palette.length === 1 ? "" : "s"}${finish ? ` with a ${finish} finish` : ""}`,
        "visual_dna",
        "low",
      )
    : null;

  return {
    form: form ? decide(form, `the object's construction was observed directly as "${form}"`, "visual_dna", "high") : null,
    material: materials.length
      ? decide(materials.join(", "), `these surfaces were observed on the object itself`, "visual_dna", "high")
      : null,
    palette: palette.length
      ? decide(palette.join(", "), `these colours are present in the uploaded image, not inferred from a brand`, "visual_dna", "high")
      : null,
    texture: detail
      ? decide(detail, `surface detail was observed as "${detail}", which is what makes it read as manufactured rather than rendered`, "visual_dna", "medium")
      : null,
    personality,
    treatment: treatmentFor(p),
  };
}

/**
 * Reads the logo branch into handling rules.
 *
 * Deliberately conservative. Where the observation is thin the safe area widens
 * and the minimum size rises, because the cost of a logo rendered too small or
 * too tight is a brand-safety failure, while the cost of too much clear space
 * is a slightly emptier corner.
 */
function logoFrom(l: VisualDNAObservedLogo | undefined): LogoDNA | null {
  if (!l) return null;
  const letterform = clean(l.letterform);
  const weight = clean(l.weight);
  const geometry = clean(l.geometry);
  const spacing = clean(l.spacing);
  const colour = (l.colour || []).map(clean).filter(Boolean);
  if (!letterform && !geometry && !weight && !colour.length) return null;

  const light = /light|thin|hairline|fine/i.test(weight);
  const tight = /tight|close|condensed|narrow/i.test(spacing);

  return {
    placement: geometry
      ? decide(
          /wide|horizontal|linear|lockup/i.test(geometry)
            ? "a horizontal edge -- upper or lower -- where its width is an asset rather than a constraint"
            : "a corner or a margin, where a compact mark holds its own without competing with the product",
          `the mark's geometry was observed as "${geometry}"`,
          "visual_dna",
          "medium",
        )
      : null,
    safe_area: decide(
      tight || !spacing
        ? "clear space of at least the mark's full height on every side"
        : "clear space of at least half the mark's height on every side",
      spacing
        ? `internal spacing was observed as "${spacing}", so the mark needs that much room again to keep its own rhythm`
        : "internal spacing could not be read, so the wider margin is used rather than the tighter one",
      "visual_dna",
      spacing ? "medium" : "low",
    ),
    scale_behaviour: decide(
      light
        ? "hold it large; its strokes disappear before the rest of the frame does"
        : "it survives reduction, but never below the height where its letterforms stop separating",
      light
        ? `the mark's weight was observed as "${weight}", and fine strokes are the first thing a render loses`
        : `the mark's weight was observed as "${weight || "unremarkable"}", which tolerates reduction better than a hairline would`,
      "visual_dna",
      weight ? "medium" : "low",
    ),
    colour: colour.length
      ? decide(colour.join(", "), "these are the mark's own colours, observed on the uploaded asset", "visual_dna", "high")
      : null,
  };
}

export interface AssetDNAInput {
  visualDNA?: VisualDNA | null;
  /** Supporting objects the director named, if any. */
  supportingRoles?: string[];
}

/**
 * Builds the reading. Pure, total, and silent when it was given nothing.
 *
 * The provenance gate is the important line: when `derived_from_image` is false
 * nothing looked at a pixel, so there is no observation to read and the result
 * is empty rather than confidently wrong.
 */
export function buildAssetDNA(input: AssetDNAInput): AssetDNA {
  const dna = input.visualDNA;
  if (!dna?.provenance?.derived_from_image) return emptyAssetDNA();

  const product = productFrom(dna.observed?.product);
  const logo = logoFrom(dna.observed?.logo);

  // Supporting objects are checked for coherence against the product's observed
  // surface rather than against a taste rule. An object that does not cohere is
  // still listed -- flagged, not deleted, because the director may have chosen
  // the contrast deliberately.
  const supporting: SupportingAssetDNA[] = [];
  for (const role of input.supportingRoles || []) {
    const name = clean(role);
    if (!name) continue;
    const productSurface = (dna.observed?.product?.materials || []).join(" ");
    const compatible =
      !productSurface ||
      !(MATTE.test(productSurface) && SPECULAR.test(name)) &&
      !(SPECULAR.test(productSurface) && MATTE.test(name));
    supporting.push({
      role: name,
      relationship: {
        value: compatible
          ? `sits with the product without competing for the same surface reading`
          : `reads against the product's own surface, so it needs a reason to be there`,
        because: productSurface
          ? `the product's surface was observed as "${productSurface}"`
          : "the product's surface could not be read, so coherence was not assessed",
        derived_from: "visual_dna",
        confidence: productSurface ? "medium" : "low",
      },
      compatible,
    });
  }

  // Inferences the analyzer made that this reading did not use. Recorded so the
  // gap between what was seen and what was used stays visible.
  const unread = (dna.inferred || [])
    .map((i) => clean(i.claim))
    .filter(Boolean);

  return {
    product,
    logo,
    supporting,
    unread,
    provenance: {
      derived_from_image: true,
      observed_branches: Object.keys(dna.observed || {}).filter(
        (k) => (dna.observed as any)[k],
      ),
    },
  };
}

/**
 * The reading as prompt text, for the blueprint and the art director.
 *
 * Returns undefined when there is nothing to say, so a caller can append it
 * unconditionally without risking an empty heading in the prompt.
 */
export function renderAssetDNA(a: AssetDNA | null | undefined): string | undefined {
  if (!a?.provenance.derived_from_image) return undefined;
  const lines: string[] = [];

  if (a.product) {
    const p = a.product;
    const facts = [
      p.form && `Form: ${p.form.value}`,
      p.material && `Surface: ${p.material.value}`,
      p.palette && `Colour present: ${p.palette.value}`,
      p.texture && `Surface detail: ${p.texture.value}`,
    ].filter(Boolean);
    if (facts.length) lines.push("THE PRODUCT, AS OBSERVED", ...facts.map((f) => `- ${f}`));

    if (p.treatment.supports.length) {
      lines.push("", "WHAT THIS SURFACE SUPPORTS");
      for (const s of p.treatment.supports) lines.push(`- ${s.value} (${s.because})`);
    }
    if (p.treatment.contradicts.length) {
      lines.push("", "WHAT WOULD FIGHT IT");
      for (const c of p.treatment.contradicts) lines.push(`- ${c.value} (${c.because})`);
    }
  }

  if (a.logo) {
    const l = a.logo;
    const rules = [
      l.placement && `Placement: ${l.placement.value}`,
      l.safe_area && `Clear space: ${l.safe_area.value}`,
      l.scale_behaviour && `Scale: ${l.scale_behaviour.value}`,
    ].filter(Boolean);
    if (rules.length) lines.push("", "THE MARK", ...rules.map((r) => `- ${r}`));
  }

  const incompatible = a.supporting.filter((s) => !s.compatible);
  if (incompatible.length) {
    lines.push("", "SUPPORTING OBJECTS THAT NEED A REASON");
    for (const s of incompatible) lines.push(`- ${s.role}: ${s.relationship.value}`);
  }

  return lines.length ? lines.join("\n") : undefined;
}

/** Counts only -- never the observations, which describe the customer's product. */
export function assetDNATelemetry(a: AssetDNA | null | undefined) {
  if (!a) return { asset_dna: false };
  return {
    asset_dna: true,
    derived_from_image: a.provenance.derived_from_image,
    branches: a.provenance.observed_branches,
    product_fields: a.product
      ? [a.product.form, a.product.material, a.product.palette, a.product.texture, a.product.personality].filter(Boolean).length
      : 0,
    supports: a.product?.treatment.supports.length ?? 0,
    contradicts: a.product?.treatment.contradicts.length ?? 0,
    logo_rules: a.logo ? [a.logo.placement, a.logo.safe_area, a.logo.scale_behaviour].filter(Boolean).length : 0,
    supporting: a.supporting.length,
    incompatible: a.supporting.filter((s) => !s.compatible).length,
    unread: a.unread.length,
  };
}
