import { CreativeFormat, FormatPlan } from "./creative-director.types";

/**
 * CIOS Phase 4.1 Task 4 — the format decides more than the crop.
 *
 * What already existed, and what did not
 * ------------------------------------
 * `CommercialLayoutService` already plans real layout geometry — zone
 * rectangles, attention budgets, eye flow, negative-space strategy — for poster,
 * banner, social ad, thumbnail and product hero. That work is not duplicated
 * here and is not replaced.
 *
 * What it does not carry is the other half of a format decision: the *camera*
 * and the *typographic treatment* each format demands. A thumbnail and a poster
 * do not merely crop differently. A thumbnail is read at 120 pixels wide in a
 * grid of competitors, so it needs one shape, one value contrast and type that
 * survives at thumbnail scale; a poster is read at two metres and rewards detail
 * a thumbnail would turn to mush. Feeding both the same camera direction is how
 * a system produces technically-correct, uniformly mediocre images.
 *
 * It also had no spec at all for two formats this phase requires: packaging and
 * landing hero. Packaging is the odd one — it is not a photograph of a product
 * in a world, it is the product's own surface, and a camera direction that
 * frames it as a scene is simply wrong.
 */

interface Spec {
  viewing_model: string;
  composition: string;
  camera: string;
  hierarchy: string[];
  typography: string;
  text_zones: string;
  safe_margin_percent: number;
  default_ratio: string;
}

const SPECS: Record<CreativeFormat, Spec> = {
  poster: {
    viewing_model:
      "Read from two to four metres, then approached. It has to work as a shape at distance and reward a closer look.",
    composition:
      "One dominant subject occupying the central vertical band, sitting slightly above centre so the lower third stays open for copy. Strong figure-ground separation; a silhouette that is still readable when the image is squinted at.",
    camera:
      "Slightly below eye level so the subject carries authority. Medium telephoto compression, 85-135mm equivalent, which flattens the background into a clean field behind the subject.",
    hierarchy: ["product", "headline", "supporting image", "logo", "legal"],
    typography:
      "One display weight for the headline, set large enough to read across a room; a single supporting weight beneath it. No third typeface. Headline sits in reserved space, never over the product's key surface.",
    text_zones:
      "Headline in the lower third; logo bottom-right or bottom-centre; no text within the safe margin of any edge.",
    safe_margin_percent: 8,
    default_ratio: "1:1",
  },
  banner: {
    viewing_model:
      "Read peripherally, in a horizontal strip, while the viewer is doing something else. It gets less than a second.",
    composition:
      "Left-to-right reading order: subject anchored on one side, message on the other, nothing in the centre competing. Extreme horizontal composition — the subject must not be centred or the layout collapses at narrow heights.",
    camera:
      "Eye level, straight on, minimal perspective distortion. Wider lens, 35-50mm equivalent, so the subject reads whole at small vertical height rather than being cropped by the strip.",
    hierarchy: ["headline", "product", "cta", "logo"],
    typography:
      "Headline and CTA only. Set at a weight that survives being 60 pixels tall. No body copy — a banner that needs a sentence has already failed.",
    text_zones:
      "Message block on the opposite side to the product, vertically centred; CTA adjacent to it, never in a corner.",
    safe_margin_percent: 6,
    default_ratio: "16:9",
  },
  thumbnail: {
    viewing_model:
      "Seen at roughly 120 pixels wide, in a grid, against direct competitors. It is a shape and a colour before it is an image.",
    composition:
      "One subject, one idea, no supporting elements. The subject fills 60-70% of the frame. Background reduced to a single flat or gently graded field — any environmental detail becomes noise at this size.",
    camera:
      "Close, straight-on, centred. Short telephoto, 50-85mm equivalent, at a distance that fills the frame with the subject. No depth-of-field theatre; everything that matters is sharp because nothing else is in the frame.",
    hierarchy: ["product", "one word of text", "nothing else"],
    typography:
      "At most three words, set very heavy, with a hard value contrast against whatever sits behind them. If the type would need an outline or a shadow to be legible, the background is wrong, not the type.",
    text_zones: "A single corner or the top edge. Never across the subject.",
    safe_margin_percent: 5,
    default_ratio: "1:1",
  },
  social_ad: {
    viewing_model:
      "Thumb-stopping in a vertical feed, at arm's length, between two things the viewer would rather look at.",
    composition:
      "Vertical, subject in the upper-middle where the thumb does not cover it. Deliberate asymmetry — a centred subject reads as a stock image and gets scrolled. Motion or gesture implied rather than static presentation.",
    camera:
      "Slightly high or slightly low, never neutral — the angle is what distinguishes it from an organic post. 35-50mm equivalent, close enough to feel handheld and intentional rather than staged.",
    hierarchy: ["product in use", "hook line", "brand cue", "cta"],
    typography:
      "Hook line in the upper third, in a weight that reads over image. Native-feeling rather than typeset — a social ad that looks like a poster is ignored as an advertisement.",
    text_zones:
      "Upper third for the hook, lower fifth reserved and kept clear for platform interface overlays.",
    safe_margin_percent: 10,
    default_ratio: "9:16",
  },
  packaging: {
    viewing_model:
      "Held, turned, and seen on a shelf beside eleven competitors. This is the product's own surface, not a photograph of the product in a world.",
    composition:
      "The pack face square to the frame, filling the frame with minimal environment. Structure and proportion of the physical pack are the composition — there is no scene to arrange. Any surface behind it is a neutral field, not a set.",
    camera:
      "Straight-on, dead level, no perspective convergence. Long lens, 100-135mm equivalent, to keep the pack's edges parallel and its proportions true — a wide lens bows a pack face and makes the artwork read wrong.",
    hierarchy: ["brand mark", "product name", "variant", "supporting information"],
    typography:
      "The pack's own typographic system, reproduced exactly. Nothing is set here — the type on a pack is artwork, not layout, and inventing it is redesigning the product.",
    text_zones: "None. All type is part of the pack artwork itself.",
    safe_margin_percent: 12,
    default_ratio: "1:1",
  },
  landing_hero: {
    viewing_model:
      "The first screen of a web page, behind an overlay of real HTML text. It is a backdrop that must not compete with the words placed on top of it.",
    composition:
      "Deliberately off-centre: the subject occupies one third, and the remaining two thirds are a calm, low-detail field where headline and call to action will be composited. That empty area is the deliverable, not wasted space.",
    camera:
      "Wide, 24-35mm equivalent, with generous headroom and air around the subject. Level or slightly above, giving an open and unpressured read rather than a heroic one.",
    hierarchy: ["negative space for headline", "product", "environment", "logo"],
    typography:
      "None rendered. Real type is composited in the browser. What this image owes typography is contrast headroom: the copy area must hold legible text of either colour.",
    text_zones:
      "Two thirds of the frame on the copy side kept visually quiet — even tone, no high-contrast detail, no part of the subject crossing into it.",
    safe_margin_percent: 6,
    default_ratio: "16:9",
  },
};

/** Accepts the loose spellings that arrive from briefs and existing call sites. */
const ALIASES: Record<string, CreativeFormat> = {
  poster: "poster",
  billboard: "poster",
  print: "poster",
  banner: "banner",
  website_banner: "banner",
  web_banner: "banner",
  leaderboard: "banner",
  thumbnail: "thumbnail",
  ugc_thumbnail: "thumbnail",
  thumbnail_ugc: "thumbnail",
  video_thumbnail: "thumbnail",
  social_ad: "social_ad",
  social: "social_ad",
  instagram: "social_ad",
  story: "social_ad",
  packaging: "packaging",
  pack: "packaging",
  packshot: "packaging",
  label: "packaging",
  landing_hero: "landing_hero",
  hero: "landing_hero",
  landing: "landing_hero",
  website_hero: "landing_hero",
  // Deliberately NOT landing_hero: a product hero is a centred, filled frame,
  // while a landing hero keeps two thirds of the canvas empty for composited
  // copy. Mapping one to the other produced a product shot with most of the
  // frame reserved for text that was never going to be placed.
  product_hero: "poster",
};

export class CreativeFormatPlanner {
  public static normalize(raw: string | undefined): CreativeFormat {
    const key = String(raw || "poster").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return ALIASES[key] || "poster";
  }

  public static plan(format: CreativeFormat, aspectRatio?: string): FormatPlan {
    const spec = SPECS[format] || SPECS.poster;
    return {
      format,
      aspect_ratio: aspectRatio || spec.default_ratio,
      viewing_model: spec.viewing_model,
      composition: spec.composition,
      camera: spec.camera,
      hierarchy: [...spec.hierarchy],
      typography: spec.typography,
      text_zones: spec.text_zones,
      safe_margin_percent: spec.safe_margin_percent,
    };
  }

  /** Every format, for coverage checks. */
  public static all(): CreativeFormat[] {
    return Object.keys(SPECS) as CreativeFormat[];
  }
}
