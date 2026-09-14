/**
 * What an asset type IS, as a communication problem.
 *
 * The defect this addresses
 * ------------------------
 * `CreativeDirectorV1` received `FORMAT: poster` as one line of its brief and
 * contained zero references to poster, banner, thumbnail, social ad or product
 * hero anywhere in its instructions. It knew the name of the format and had no
 * reason to treat it as anything.
 *
 * That is the same defect that was found and fixed in the stable Marketing Brain
 * several phases ago, rebuilt here from scratch. Worth stating plainly, because
 * the lesson is that passing a label is not the same as passing a context, and
 * the mistake is easy to repeat every time a new module starts accepting a
 * format.
 *
 * Why this is not a template
 * -------------------------
 * Every field below describes how the format is ENCOUNTERED and what it
 * therefore has to accomplish. None of them describes what the picture should
 * contain. A poster entry that said "large headline, centred hero, negative
 * space" would be a layout with a label on it; one that says the viewer stops
 * once and has to remember something leaves the execution open, which is where
 * the product, the audience, the brand and the objective get to decide.
 *
 * `typography_role` is phrased as a role rather than a size for the same reason:
 * "can become part of the visual identity" is a possibility a designer can
 * refuse, and "36pt bold" is not.
 */

export interface AssetContext {
  asset_type: string;
  communication_goal: string;
  viewer_behavior: string;
  visual_priority: string;
  information_density: string;
  typography_role: string;
  layout_intent: string;
}

const CONTEXTS: Record<string, Omit<AssetContext, "asset_type">> = {
  poster: {
    communication_goal: "Make one idea memorable. The viewer will not be back, so what lands has to land now.",
    viewer_behavior: "Met whole and at a glance, then approached if it earned that. One impression before a word is read.",
    visual_priority: "A single big idea carried by the image, with the words confirming it rather than explaining it.",
    information_density: "Low. Anything that needs a second sentence is competing with the first.",
    typography_role:
      "Type may become part of the picture rather than a label on it — or may be almost absent if the image argues better alone. Both are legitimate posters.",
    layout_intent: "Composed to be read as a shape before it is read as content.",
  },
  social_ad: {
    communication_goal: "Earn a stop, then say one thing before the thumb moves.",
    viewer_behavior: "Mid-scroll, on a phone at arm's length, between two things the viewer would rather see. Recognition as advertising ends the stop.",
    visual_priority: "Whatever causes the interruption, then the product, then the message — in that order, because nothing after the stop happens without it.",
    information_density: "Low to moderate, and front-loaded. A second idea is not read.",
    typography_role: "Instant legibility at small size. Type that looks typeset reads as an advertisement; type that reads as native survives longer.",
    layout_intent: "Built for a vertical feed and a thumb that covers part of the frame.",
  },
  product_hero: {
    communication_goal: "Make the object itself worth wanting.",
    viewer_behavior: "Looked AT rather than past. The viewer is examining, and will notice what is wrong with a surface.",
    visual_priority: "The product's material, form and the behaviour of light on it. Everything else is support or noise.",
    information_density: "Minimal. The object is the argument.",
    typography_role:
      "Usually subordinate or absent, because words explain what the surface should already be saying — but an objective that needs a claim can still carry one.",
    layout_intent: "Controlled, so nothing in frame competes with the object.",
  },
  banner: {
    communication_goal: "Make a benefit legible fast enough to act on, inside a page the viewer came to for something else.",
    viewer_behavior: "Scanned peripherally, in a strip, while doing something else. It competes with the content they actually wanted.",
    visual_priority: "The message and what the viewer gets, with the product supporting rather than leading.",
    information_density: "Moderate, but resolved in one pass. A banner that needs re-reading has already failed.",
    typography_role: "Carries most of the communication, so clarity outranks character. Type here is information design.",
    layout_intent: "Horizontal reading order; the subject and the message on separate sides so neither is read through the other.",
  },
  ugc_thumbnail: {
    communication_goal: "Create enough curiosity to earn a click.",
    viewer_behavior: "Seen very small, in a grid, against real people's real photographs, and judged in under a second.",
    visual_priority: "Human reaction and the hook first; the product is recognised, not displayed.",
    information_density: "Very low. At this size the image is a shape and a colour before it is anything else.",
    typography_role: "A few words at most, heavy enough to survive being scaled down, and never competing with the face.",
    layout_intent: "Legible as a silhouette. Art-directed polish reads as advertising and loses to something that reads as genuine.",
  },
};

const ALIASES: Record<string, string> = {
  poster: "poster",
  billboard: "poster",
  print: "poster",
  social_ad: "social_ad",
  social: "social_ad",
  product_hero: "product_hero",
  hero: "product_hero",
  banner: "banner",
  website_banner: "banner",
  web_banner: "banner",
  ugc_thumbnail: "ugc_thumbnail",
  thumbnail_ugc: "ugc_thumbnail",
  thumbnail: "ugc_thumbnail",
  ugc: "ugc_thumbnail",
};

/**
 * The context for an asset type, or null when the type is unrecognised.
 *
 * Null rather than a poster default. An unknown format that silently receives
 * poster thinking is how every unhandled path in this engine ends up looking
 * like a poster, and a layer that cannot answer should say so.
 */
export function assetContextFor(assetType?: string): AssetContext | null {
  const raw = String(assetType || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const key = ALIASES[raw];
  if (!key) return null;
  return { asset_type: key, ...CONTEXTS[key] };
}

/**
 * The context as instruction text for the director.
 *
 * The closing line is load-bearing rather than decorative: without it the model
 * reads the block as a specification and produces the same poster every time,
 * which is the outcome this whole file is arranged to avoid.
 */
export function assetContextBrief(ctx: AssetContext): string {
  return [
    `ASSET TYPE: ${ctx.asset_type.replace(/_/g, " ")}`,
    `WHAT THIS FORMAT IS FOR: ${ctx.communication_goal}`,
    `HOW IT IS ENCOUNTERED: ${ctx.viewer_behavior}`,
    `WHAT MATTERS MOST IN IT: ${ctx.visual_priority}`,
    `HOW MUCH IT CAN SAY: ${ctx.information_density}`,
    `WHAT THE WORDS ARE DOING: ${ctx.typography_role}`,
    `HOW IT IS READ: ${ctx.layout_intent}`,
    "",
    "This is the communication problem, not the answer. Several very different images solve it. What the picture actually becomes is decided by this product, this audience, this brand and this objective — the format only says what the image has to accomplish to count as working.",
  ].join("\n");
}
