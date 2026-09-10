import { CreativeUnderstanding, DirectorBrief } from "./creative-director.types";

/**
 * CIOS Phase 4.1 Task 1 — what the brief is actually asking for.
 *
 * A brief arrives as a sentence or two of client prose. Everything downstream
 * needs six specific things from it, and the pipeline previously took none of
 * them: it went from raw text to keyword retrieval to an asset-type default.
 *
 * The six are not a summary. They are the questions a director asks before
 * picking up a camera — what has to land, what it should feel like, what the
 * viewer does next, what the brand is doing rather than claiming, what a picture
 * can do here that a sentence cannot, and why this is hard.
 *
 * Honest limits
 * ------------
 * Rule-based, reading the brief's own words. Where the brief does not support a
 * field, the field is filled from the objective and the category and the
 * assumption is *named* in `assumptions` rather than presented as a reading.
 * `grounding` reports the share that came from the brief. A brief of five words
 * produces a low grounding score and should: the honest output for "make it
 * premium" is a stated set of assumptions, not a confident analysis.
 */

/** Objective words that imply what the viewer is meant to do. */
const OBJECTIVE_REACTIONS: { match: RegExp; reaction: string }[] = [
  { match: /\b(?:launch|introduc|new|unveil|reveal)\b/i, reaction: "look twice at something they had not noticed existed" },
  { match: /\b(?:awareness|reach|visib)/i, reaction: "remember the brand next time the category comes up" },
  { match: /\b(?:convert|sale|sell|purchase|buy|order)\b/i, reaction: "feel that buying it is the obvious next step" },
  { match: /\b(?:trust|credib|reassur|proof)/i, reaction: "believe the claim without needing it argued" },
  { match: /\b(?:premium|luxur|upmarket|elevat)/i, reaction: "revise upward what they thought this brand costs" },
  { match: /\b(?:re-?position|shift|change perception)/i, reaction: "hold a different idea of the brand than they walked in with" },
  { match: /\b(?:engage|share|viral|social)/i, reaction: "stop scrolling long enough to take it in" },
];

/** Emotional registers, keyed to what the brief is worried about. */
const EMOTION_SIGNALS: { match: RegExp; emotion: string }[] = [
  { match: /\b(?:trust|doubt|sceptic|skeptic|believ|proof|honest)/i, emotion: "the relief of not having to be sceptical" },
  { match: /\b(?:premium|luxur|craft|artisan|heritage)/i, emotion: "quiet admiration for something made properly" },
  { match: /\b(?:fresh|natural|clean|pure|organic)/i, emotion: "the appetite that comes before thought" },
  { match: /\b(?:fast|quick|convenien|easy|simpl)/i, emotion: "the small relief of one less thing to manage" },
  { match: /\b(?:family|share|together|friend|gather)/i, emotion: "belonging to the group in the picture" },
  { match: /\b(?:young|gen ?z|student|trend)/i, emotion: "recognition of a world they already live in" },
  { match: /\b(?:safe|gentle|sensitive|care|protect)/i, emotion: "being looked after rather than sold to" },
  { match: /\b(?:bold|confiden|strong|power)/i, emotion: "borrowed confidence" },
];

/** What a picture can do that prose cannot, by category of claim. */
const OPPORTUNITY_SIGNALS: { match: RegExp; opportunity: string }[] = [
  { match: /\b(?:texture|crisp|creamy|smooth|melt|crunch)/i, opportunity: "make the texture legible enough to be felt before it is read" },
  { match: /\b(?:fresh|natural|ingredient|origin|source)/i, opportunity: "show the ingredient in a state no packaging shot ever shows it" },
  { match: /\b(?:size|portion|volume|capacity|big|large)/i, opportunity: "let scale be understood by comparison rather than stated in numbers" },
  { match: /\b(?:colour|color|vibrant|bright|shade|tone)/i, opportunity: "let colour carry the whole proposition without a word of copy" },
  { match: /\b(?:craft|hand|made|process|detail)/i, opportunity: "hold on a detail close enough that the making becomes visible" },
  { match: /\b(?:heritage|history|origin|tradition|year)/i, opportunity: "put the present product in a frame that implies its past" },
];

export class CreativeUnderstandingLayer {
  public static understand(brief: DirectorBrief): CreativeUnderstanding {
    const text = `${brief.brief_text || ""} ${brief.objective || ""}`.trim();
    const assumptions: string[] = [];
    let grounded = 0;
    const total = 6;

    // ── Core message ───────────────────────────────────────────────────
    // The brief's own first assertion where it makes one, because a client's
    // opening sentence is almost always the thing they came to say.
    const firstClaim = this.firstSentence(brief.brief_text);
    let core_message: string;
    if (firstClaim && firstClaim.split(/\s+/).length >= 4) {
      core_message = firstClaim;
      grounded++;
    } else {
      core_message = `${brief.product} is worth choosing over the rest of ${brief.category}`;
      assumptions.push("Core message inferred from product and category: the brief states no proposition.");
    }

    // ── Human emotion ──────────────────────────────────────────────────
    const emotionHit = EMOTION_SIGNALS.find((e) => e.match.test(text));
    let human_emotion: string;
    if (emotionHit) {
      human_emotion = emotionHit.emotion;
      grounded++;
    } else {
      human_emotion = "wanting it before deciding to want it";
      assumptions.push("Emotion defaulted to appetite: the brief names no feeling and no anxiety.");
    }

    // ── Desired reaction ───────────────────────────────────────────────
    const reactionHit = OBJECTIVE_REACTIONS.find((r) => r.match.test(text));
    let desired_reaction: string;
    if (reactionHit) {
      desired_reaction = reactionHit.reaction;
      grounded++;
    } else {
      desired_reaction = "hold the product in mind long enough to look for it";
      assumptions.push("Reaction defaulted to recall: the brief states no objective.");
    }

    // ── Brand role ─────────────────────────────────────────────────────
    // What the brand *does* in the picture. A role that is a claim is not a role,
    // so this is always phrased as an action.
    const brand_role = this.brandRole(brief, text);
    // Brand behaviour needs a brand subject or a third-person verb. A bare
    // imperative — "make it premium" — is an instruction to the designer, not a
    // description of the brand, and counting it as evidence pushed a three-word
    // brief to a grounding of 0.5.
    const describesBrand =
      /\b(?:we|our|us)\b/i.test(brief.brief_text) ||
      /\b(?:the brand|the company)\b/i.test(brief.brief_text) ||
      /\b(?:makes|offers|provides|crafts|builds|sources|produces|helps)\b/i.test(brief.brief_text);
    if (describesBrand) grounded++;
    else assumptions.push("Brand role derived from category convention: the brief describes no brand behaviour.");

    // ── Visual opportunity ─────────────────────────────────────────────
    const oppHit = OPPORTUNITY_SIGNALS.find((o) => o.match.test(text));
    let visual_opportunity: string;
    if (oppHit) {
      visual_opportunity = oppHit.opportunity;
      grounded++;
    } else {
      visual_opportunity = `show ${brief.product} in use rather than on a shelf, so the reason to want it is visible`;
      assumptions.push("Visual opportunity defaulted to in-use framing: the brief names no visible property.");
    }

    // ── Creative challenge ─────────────────────────────────────────────
    const creative_challenge = this.challenge(brief, text);
    if (/\b(?:but|however|although|problem|challenge|difficult|struggl|crowded|competitive|commodit)/i.test(text)) {
      grounded++;
    } else {
      assumptions.push("Challenge inferred from category dynamics: the brief names no obstacle.");
    }

    return {
      core_message: sentence(core_message),
      human_emotion,
      desired_reaction,
      brand_role,
      visual_opportunity,
      creative_challenge,
      assumptions,
      grounding: Number((grounded / total).toFixed(2)),
    };
  }

  /**
   * What the brand does here.
   *
   * Read from the brief where it describes an action, otherwise composed from
   * the category. Never "the leading X" — a superlative is a claim, and a claim
   * gives a renderer nothing to put in the frame.
   */
  private static brandRole(brief: DirectorBrief, text: string): string {
    if (/\b(?:hand-?made|craft|artisan)/i.test(text)) {
      return `${brief.brand} is the one that still makes it by hand, and the picture has to show the hand`;
    }
    if (/\b(?:fast|quick|deliver|convenien)/i.test(text)) {
      return `${brief.brand} is the one that removes the wait, so the picture is the moment after the waiting stopped`;
    }
    if (/\b(?:safe|gentle|sensitive|natural|clean)/i.test(text)) {
      return `${brief.brand} is the one that leaves things out, so the picture has to look like less rather than more`;
    }
    if (/\b(?:premium|luxur|heritage)/i.test(text)) {
      return `${brief.brand} is the one that refuses to cut the corner everyone else cuts`;
    }
    return `${brief.brand} is the one that takes ${brief.category} seriously enough to show it properly`;
  }

  /**
   * Why this is hard.
   *
   * A brief with no stated difficulty still has one, and naming it is what stops
   * the territory generator producing the category's default answer.
   */
  private static challenge(brief: DirectorBrief, text: string): string {
    const stated = brief.brief_text.match(/\b(?:but|however|although)\b([^.]+)/i);
    if (stated) return sentence(`The brief's own obstacle:${stated[1]}`);
    if (/\b(?:crowded|competitive|commodit|saturat|everyone)/i.test(text)) {
      return `Everything in ${brief.category} already looks like this, so the picture has to be recognisable as the category and unlike any of it`;
    }
    if (/\b(?:new|launch|unknown|unfamiliar)/i.test(text)) {
      return `Nobody is looking for ${brief.product} yet, so the image has to create the want before it can satisfy it`;
    }
    if (/\b(?:premium|expensive|price|cost)/i.test(text)) {
      return `The price has to look justified in the picture, because nobody reads the argument for it`;
    }
    return `${brief.audience} has seen a thousand images of ${brief.category} and remembers none of them`;
  }

  private static firstSentence(text: string): string {
    const t = String(text || "").trim();
    if (!t) return "";
    const m = t.match(/^[^.!?]+[.!?]?/);
    return (m ? m[0] : t).trim().replace(/[.!?]+$/, "");
  }
}

function sentence(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const body = t.replace(/[.]+$/, "");
  return body.charAt(0).toUpperCase() + body.slice(1) + ".";
}
