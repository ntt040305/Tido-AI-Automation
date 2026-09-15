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

  /**
   * V2. The routes that are legitimate for this channel, for the director to
   * CHOOSE between — never a route it is assigned.
   *
   * The three directions the director explores today are named Commercial Safe,
   * Premium Brand and Creative Exploration. Those are three commercial
   * attitudes, and they are the same three on every asset type; a banner and a
   * product hero are not solved by different attitudes, they are solved by
   * different communication strategies. This is that list, and it differs by
   * channel because the channel is what makes a strategy viable.
   *
   * Optional, so every existing consumer and every existing test stays valid.
   */
  possible_strategies?: string[];

  /**
   * V2. How this format fails, which is not the same question as which clichés
   * the category over-uses.
   *
   * `generic_check` already asks whether an element is here because the category
   * usually has one. It does not ask whether the image is about to fail in the
   * specific way this channel fails, and those are different mistakes: a poster
   * nobody remembers and a banner nobody can read in one pass are both correct
   * pictures that did not work.
   */
  failure_modes?: string[];
}

/** Options for rendering the brief. Absent means V1 output, byte for byte. */
export interface AssetContextBriefOptions {
  /** V2. Append the strategy list and the failure modes. */
  includeStrategies?: boolean;
}

/**
 * Returns the routes in a new order, without touching the original.
 *
 * Position in a list is a signal whether anyone intends it to be. Measured in
 * this project: the first of three fixed directions was selected 0 times out of
 * 17, and the block that produced them was written with a bias nobody noticed
 * until the distribution was counted. A list offered in a fixed order invites
 * the same failure in the opposite direction — whatever sits first becomes the
 * default, and the reasons written for it read like judgement.
 *
 * `rng` is injectable so a test can assert the shuffle happened rather than
 * assert against a coin flip.
 */
export function shuffleRoutes(routes: string[], rng: () => number = Math.random): string[] {
  const out = [...routes];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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

/**
 * The V2 corrections, held apart from the entries they correct.
 *
 * Three fields in `CONTEXTS` answer the question instead of asking it, which is
 * exactly what the header of this file says must not happen. They are not edited
 * in place for one reason: `asset_type_intelligence_v1` is a flag that already
 * ships, and silently changing what it produces is not a fix, it is an
 * unannounced behaviour change. So V1 keeps returning what it has always
 * returned and V2 returns the correction, until V2 becomes the default and this
 * map is deleted along with the strings it replaces.
 *
 * What was wrong with each:
 *
 *   banner.layout_intent — "the subject and the message on separate sides" is a
 *   layout. Measured on a live run: the director read it back and returned "the
 *   tube sits on the right, the launch text on the left" as its own creative
 *   idea. The template went in as context and came out as a decision.
 *
 *   ugc_thumbnail.visual_priority — "Human reaction and the hook first" forces a
 *   person into the frame before the brand, the product or the audience has been
 *   considered. Creator-style work often has a person in it; that is a finding,
 *   not a requirement.
 *
 *   ugc_thumbnail.typography_role — "never competing with the face" assumes the
 *   face the field above had already mandated. Found by the subject guard in
 *   `run-evolution-tests` rather than by reading, which is the argument for
 *   having the guard.
 */
const INTENT_V2_OVERRIDES: Record<string, Partial<Omit<AssetContext, "asset_type">>> = {
  banner: {
    layout_intent:
      "Read across, in a shallow strip, in peripheral vision, by someone who came to the page for something else.",
  },
  ugc_thumbnail: {
    visual_priority:
      "Whatever creates curiosity first; the product is recognised rather than displayed.",
    typography_role:
      "A few words at most, heavy enough to survive being scaled down, and never competing with whatever the frame leads with.",
  },
};

/**
 * The routes that solve each channel.
 *
 * Every list is long enough that no entry reads as the default, and the entry
 * that used to be hard-coded sits among the others with no special standing:
 * split is one of five ways to answer a banner, and a human reaction is one of
 * six ways to answer a thumbnail. Which one is right is decided by the product,
 * the brand, the audience and the objective — none of which this file knows.
 *
 * No entry names an industry. A list that said "skincare: soft focus" would be
 * the same defect one level up.
 */
const INTENT_V2_STRATEGIES: Record<string, string[]> = {
  poster: [
    "iconic product composition — the object itself is the idea",
    "conceptual metaphor — the idea is carried by something the product is not",
    "editorial advertising — a photograph with a point of view",
    "emotional storytelling — a moment the viewer recognises",
    "graphic-driven design — shape and colour before photography",
    "typographic poster — the words are the picture",
  ],
  social_ad: [
    "pattern interrupt — something the feed does not contain",
    "native creator style — reads as a post rather than a placement",
    "product as hook — the object is itself the reason to stop",
    "before and after — a change the viewer wants",
    "question hook — an opening the viewer needs closed",
    "motion implied — a still that reads as the middle of something",
  ],
  product_hero: [
    "studio isolation — the object against controlled nothing",
    "material macro — close enough that the surface is the subject",
    "in-context still life — the object where it is used",
    "scale demonstration — the object against something known",
    "construction reveal — how it is made becomes why it is good",
  ],
  banner: [
    "split message and subject — read one side then the other",
    "full bleed image with overlaid message",
    "typographic only — no photography at all",
    "product as background — the message sits on the object",
    "vertical arrangement — read from one end to the other",
  ],
  ugc_thumbnail: [
    "human reaction — a response the viewer reads instantly",
    "point of view — the frame belongs to whoever is holding it",
    "result first — the outcome before the thing that produced it",
    "object in real life — the product somewhere unstaged",
    "text dominant — the words carry the curiosity",
    "curiosity gap — the frame withholds the part that matters",
  ],
};

/**
 * How each format fails while still being a competent picture.
 *
 * Stated as failures rather than rules so they cannot be executed. "Needs a
 * second sentence before it lands" is something a director can test a direction
 * against; "use one short line" would be this file writing the copy.
 */
const INTENT_V2_FAILURE_MODES: Record<string, string[]> = {
  poster: [
    "needs a second sentence before the idea lands",
    "handsome and immediately forgettable",
    "the words explain the picture instead of finishing it",
  ],
  social_ad: [
    "reads as advertising before it reads as anything else",
    "carries a second idea nobody gets to",
    "the stop is earned by something the product cannot pay off",
  ],
  product_hero: [
    "the setting competes with the object",
    "the surfaces do not survive being looked at closely",
    "flattering in a way that will not match what arrives",
  ],
  banner: [
    "needs a second pass to be understood",
    "loses its point when the edges are cropped",
    "the benefit is present but not the first thing read",
  ],
  ugc_thumbnail: [
    "looks art-directed, and so reads as a placement",
    "unreadable once it is small",
    "the curiosity is manufactured rather than earned",
  ],
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
export function assetContextFor(assetType?: string, v2 = false): AssetContext | null {
  const raw = String(assetType || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const key = ALIASES[raw];
  if (!key) return null;
  const base: AssetContext = { asset_type: key, ...CONTEXTS[key] };
  // `v2` defaults to false, so every existing caller and every existing test
  // receives exactly what it received before this parameter existed.
  if (!v2) return base;
  return {
    ...base,
    ...INTENT_V2_OVERRIDES[key],
    possible_strategies: INTENT_V2_STRATEGIES[key],
    failure_modes: INTENT_V2_FAILURE_MODES[key],
  };
}

/**
 * The context as instruction text for the director.
 *
 * The closing line is load-bearing rather than decorative: without it the model
 * reads the block as a specification and produces the same poster every time,
 * which is the outcome this whole file is arranged to avoid.
 */
export function assetContextBrief(
  ctx: AssetContext,
  options?: AssetContextBriefOptions
): string {
  const lines = [
    `ASSET TYPE: ${ctx.asset_type.replace(/_/g, " ")}`,
    `WHAT THIS FORMAT IS FOR: ${ctx.communication_goal}`,
    `HOW IT IS ENCOUNTERED: ${ctx.viewer_behavior}`,
    `WHAT MATTERS MOST IN IT: ${ctx.visual_priority}`,
    `HOW MUCH IT CAN SAY: ${ctx.information_density}`,
    `WHAT THE WORDS ARE DOING: ${ctx.typography_role}`,
    `HOW IT IS READ: ${ctx.layout_intent}`,
  ];

  // Appended only under V2, and only when the data is there. Without both
  // conditions this function returns the V1 string character for character,
  // which is what makes the flag a real switch rather than a label.
  if (options?.includeStrategies) {
    if (ctx.possible_strategies?.length) {
      lines.push(
        "",
        "ROUTES THAT LEGITIMATELY SOLVE THIS FORMAT. Choose one and say why it is right for THIS brief. They are alternatives, not a ranking, and the first is not the default:",
        ...ctx.possible_strategies.map((s) => `  - ${s}`),
        "A route is chosen by what this product is, who is looking, what the brand can credibly own and what the campaign has to achieve. If the reason you can give for your choice would read the same for a different product, you have not chosen yet."
      );
    }
    if (ctx.failure_modes?.length) {
      lines.push(
        "",
        "HOW THIS FORMAT FAILS WHILE STILL BEING A COMPETENT PICTURE:",
        ...ctx.failure_modes.map((f) => `  - ${f}`)
      );
    }
  }

  lines.push(
    "",
    "This is the communication problem, not the answer. Several very different images solve it. What the picture actually becomes is decided by this product, this audience, this brand and this objective — the format only says what the image has to accomplish to count as working."
  );
  return lines.join("\n");
}
