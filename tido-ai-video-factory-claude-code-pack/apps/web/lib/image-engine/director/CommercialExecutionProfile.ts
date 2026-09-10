import { CommercialIntent } from "./ConceptStructuringLayer";
import { SynthesizedCopy } from "./CommercialCopySynthesizer";
import { CreativeFormat, FormatPlan } from "./creative-director.types";

/**
 * CIOS Phase 4.1.1 Task 3 — a sale poster is not a product shot with words on it.
 *
 * The failure this fixes
 * --------------------
 * Asked for a 50%-off poster with a CTA, the pipeline produced a clean product
 * hero. Every format spec in the planner describes how to photograph a *product*
 * — "one dominant subject", "the product fills 60-70% of the frame", "strong
 * figure-ground separation". None of them describes a promotion. So a poster
 * brief and a sale-poster brief produced the same composition, and the sale was
 * simply absent.
 *
 * The difference is not decoration
 * -------------------------------
 * On a product hero the product is the message. On a sale poster the *offer* is
 * the message and the product is the evidence. That inverts the hierarchy: the
 * discount is the largest element in the frame, the product supports it, and a
 * viewer who takes nothing else away must still leave knowing there is 50% off.
 * A composition that makes the product dominant and the number small has failed
 * the brief however well the product is lit.
 *
 * This profile applies only where the concept asked for it. A brief with no
 * offer and no CTA passes through untouched, because turning every image into a
 * sale poster would be the same error in the opposite direction.
 */

export interface ExecutionProfile {
  /** True where promotional execution replaced product-hero execution. */
  promotional: boolean;
  mode: "product_hero" | "promotional";
  /** Reading order, strongest first. */
  hierarchy: string[];
  composition: string;
  /** What must be unmistakable at a glance, before anything is read in detail. */
  first_glance: string;
  typography: string;
  text_zones: string;
  notes: string[];
}

/** Where the promotional elements sit, per format. */
const PROMO_LAYOUT: Record<CreativeFormat, { zones: string; composition: string; typography: string }> = {
  poster: {
    zones:
      "Discount occupies the upper third and is the single largest element in the frame. Headline sits directly beneath it. Product occupies the middle band at roughly 40-50% of frame height, never overlapping the discount. CTA sits in the lower fifth as a solid, high-contrast block with clear edges.",
    composition:
      "Promotional hierarchy, not product hierarchy: the offer reads first and the product second. The product is placed to support the number, not to compete with it — offset to one side or below, with the discount given clear air around it. Background is a flat or simply graded field that gives the type maximum contrast; no busy environment behind text.",
    typography:
      "Three levels and no more: discount set very large and heavy, headline at roughly one third of that, CTA in a contrasting solid block. Numerals in the discount are the most legible thing in the image.",
  },
  banner: {
    zones:
      "Left third carries the product; the right two thirds carry the discount, headline and CTA stacked in reading order. CTA is a solid button-like block at the right edge, inside the safe margin.",
    composition:
      "Strict left-to-right promotional read: product, then offer, then action. Nothing centred. The offer and CTA must survive the banner being cropped narrower at small viewport widths, so both sit inside the middle 60% horizontally.",
    typography:
      "Two levels: the discount and the CTA. The headline is a supporting line beneath the discount, never larger than it.",
  },
  social_ad: {
    zones:
      "Hook and discount in the upper third where the thumb does not cover them. Product in the middle. CTA above the lower fifth, which stays clear for platform interface.",
    composition:
      "The offer is the hook. It must be readable in the first quarter second of a scroll, which means high value contrast and a number large enough to read at arm's length on a phone. Product is present and in use, supporting the claim.",
    typography:
      "Discount and hook set as one visual unit at the top. CTA set as a distinct block, visually separated so it reads as an action rather than as more copy.",
  },
  thumbnail: {
    zones: "Discount across the upper half or one corner. No more than three words besides the number.",
    composition:
      "One subject, one number. At 120 pixels wide the discount is the only text that can survive, so it is the composition. Product fills the remaining area as a recognisable silhouette.",
    typography:
      "The discount only, set as heavy as the frame allows, with a hard value contrast behind it. Any second line will be illegible and must not be attempted.",
  },
  landing_hero: {
    zones:
      "Offer and CTA occupy the calm two thirds reserved for composited copy; the product holds the remaining third.",
    composition:
      "The reserved copy area now has a stated job: it carries the offer and the CTA. It still must hold legible text of either colour, so it stays low-detail and even in tone.",
    typography:
      "Rendered type is kept minimal because real HTML type will be composited over this area — the discount may be rendered, the CTA is left to the page.",
  },
  packaging: {
    zones: "None. Promotional text is not applied to a pack face in this pass.",
    composition:
      "Packaging is the product's own surface and promotional overlay would be redesigning the pack. Promotional execution does not apply; the product-hero treatment stands.",
    typography: "The pack's own typographic system, reproduced exactly. Nothing is added.",
  },
};

export class CommercialExecutionProfile {
  public static resolve(
    format: CreativeFormat,
    plan: FormatPlan,
    intent: CommercialIntent,
    copy: SynthesizedCopy
  ): ExecutionProfile {
    const notes: string[] = [];

    // Packaging is deliberately exempt. Overlaying a sale badge on a pack face
    // is redesigning the packaging, which Task 5 forbids outright.
    if (!intent.promotional || format === "packaging") {
      notes.push(
        format === "packaging" && intent.promotional
          ? "Promotional execution suppressed: adding sale graphics to a pack face would redesign the packaging."
          : "No offer, discount or CTA in the concept; product-hero execution retained."
      );
      return {
        promotional: false,
        mode: "product_hero",
        hierarchy: plan.hierarchy,
        composition: plan.composition,
        first_glance: "The product, clearly and attractively presented.",
        typography: plan.typography,
        text_zones: plan.text_zones,
        notes,
      };
    }

    const layout = PROMO_LAYOUT[format] || PROMO_LAYOUT.poster;
    const discount = intent.discount;
    const cta = copy.items.find((i) => i.role === "cta")?.text;
    const headline = copy.items.find((i) => i.role === "headline")?.text;

    // Hierarchy is rebuilt, not reordered: the elements themselves differ. A
    // product hero has no discount and no CTA to rank.
    const hierarchy: string[] = [];
    if (discount) hierarchy.push(`discount (${discount}) — largest element in the frame`);
    if (headline) hierarchy.push(`headline (${headline})`);
    hierarchy.push("product — hero object, supporting the offer rather than competing with it");
    if (cta) hierarchy.push(`CTA (${cta}) — visually distinct block`);
    if (intent.branding_required) hierarchy.push("brand mark");

    notes.push(
      `Promotional execution: offer "${intent.offer_type}"${discount ? ` at ${discount}` : ""} leads the hierarchy, product supports it.`
    );

    const first_glance = discount
      ? `A viewer who looks for one second and reads nothing else must still come away knowing there is ${discount} off. The number is the first thing seen.`
      : `A viewer who looks for one second must come away knowing there is an offer on, not merely that the product exists.`;

    return {
      promotional: true,
      mode: "promotional",
      hierarchy,
      composition: layout.composition,
      first_glance,
      typography: layout.typography,
      text_zones: layout.zones,
      notes,
    };
  }
}
