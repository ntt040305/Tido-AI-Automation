/**
 * The Finish Layer — what KIND of photograph this is.
 *
 * WHY THIS EXISTS
 * ---------------
 * Measured on the twelve-case benchmark, the `finish` domain scored 0 of 12: not
 * one prompt said anything about tonality, highlight behaviour, black level,
 * grain or lens character. Every other domain had at least a sentence; this one
 * had nothing at all, in any prompt, ever.
 *
 * That is the domain where "machine-made" actually lives. A render that gives
 * itself away rarely does so through composition or light direction -- it does it
 * through finish: highlights that clip flat instead of compressing, blacks pinned
 * at zero, no grain anywhere, a contrast curve of unnatural evenness, bokeh with
 * no optical signature. A commercial photograph carries the fingerprint of the
 * medium that made it, and an image with no such fingerprint reads as rendered
 * even when every other decision is right.
 *
 * WHAT IT DECIDES
 * ---------------
 * One medium, and the five numbers that medium implies: black level, highlight
 * rolloff, grain, corner falloff and where saturation sits. Numbers rather than
 * adjectives, because "filmic" is a verdict and `blacks at 12/255` is a thing to
 * render. The medium is chosen from evidence the brief already contains -- the
 * same resolver idiom `TypographyDNA` uses: regex readings over decided prose,
 * each vote recorded with the phrase that produced it.
 *
 * WHAT IT MAY NOT DECIDE
 * ----------------------
 * Not the light (BLOCK 4 owns it), not where the camera stands or what lens it
 * carries (BLOCK 5, owned by `CompositionPlan`). Lens CHARACTER is here --
 * falloff, flare, the shape of an out-of-focus edge -- because that is the
 * signature of the medium rather than a choice about framing, and the two are
 * stated in different blocks so neither can contradict the other.
 *
 * HONESTY ABOUT THE NUMBERS
 * -------------------------
 * Every value below is REASONED from how the medium behaves, not measured on this
 * provider. Whether Nano Banana 2 responds differently to "blacks at 12/255" than
 * to "deep blacks" is unverified. The numbers are falsifiable, which is the point:
 * they can be changed in one table when a live render says they are wrong.
 *
 * Pure. No model call, no I/O, no clock.
 */

/** How the frame is rendered, as a set of values a renderer can act on. */
export interface Finish {
  /** The medium's name, as the prompt states it. Never alone -- always with its numbers. */
  medium: string;
  /** One sentence on what that medium does to a picture. */
  reads: string;
  /** Darkest value in the frame, 0-255. Film does not reach 0 and digital does. */
  black_level: number;
  /** Stops of compression above the key before a highlight clips. */
  highlight_rolloff_stops: number;
  /** Grain as a share of frame width, 0 for none. */
  grain_percent: number;
  /** Corner falloff as a percentage of centre brightness lost, 0 for none. */
  vignette_percent: number;
  /** Where colour is allowed to be saturated. */
  saturation: string;
  /** What an out-of-focus edge looks like. */
  bokeh: string;
  /** Whether a specular highlight may bloom, and how far. */
  flare: string;
  /** Every value traced to what produced it. */
  because: Record<string, string>;
  /** Values an asset type or the typography overrode, and why. */
  refused: string[];
}

interface Medium {
  name: string;
  when: RegExp;
  reads: string;
  black_level: number;
  highlight_rolloff_stops: number;
  grain_percent: number;
  vignette_percent: number;
  saturation: string;
  bokeh: string;
  flare: string;
}

/**
 * The media this layer can choose, and what each one is evidence OF.
 *
 * Six, not a catalogue: each is a distinct tonal behaviour rather than a different
 * name for the same curve. A seventh would have to behave differently from all of
 * these to earn a row.
 */
const MEDIA: Medium[] = [
  {
    name: "4x5 colour transparency",
    when: /\b(editorial|still life|architectural|monument|considered|restrained|quiet|deliberate|gallery|museum)\b/i,
    reads: "it holds enormous tonal latitude, shows no structure in the midtones, and compresses highlights for a long way before they give up",
    black_level: 12,
    highlight_rolloff_stops: 3,
    grain_percent: 0.15,
    vignette_percent: 2,
    saturation: "held in the product's own hue; the neutrals around it stay neutral",
    bokeh: "round and quiet, with no edge outlining",
    flare: "no flare or bloom; a specular highlight stays inside its own shape",
  },
  {
    name: "8x10 colour transparency",
    when: /\b(luxur|luxury|couture|jewel|jewellery|precious|heirloom|atelier|bespoke|haute)\b/i,
    reads: "it holds detail under inspection, runs a tonal scale so smooth it has no steps in it, and shows no grain structure at any size",
    black_level: 10,
    highlight_rolloff_stops: 3.5,
    grain_percent: 0,
    vignette_percent: 1,
    saturation: "one saturated note and the rest of the frame restrained around it",
    bokeh: "round, extremely smooth, no outlining at all",
    flare: "no flare or bloom of any kind",
  },
  {
    name: "6x7 colour negative",
    when: /\b(appetite|fresh|freshness|juicy|baked|harvest|warm|indulgen|abundan|ingredient)\b/i,
    reads: "it has a generous shoulder and warm-leaning midtones, and flatters food and skin rather than measuring them",
    black_level: 14,
    highlight_rolloff_stops: 3,
    grain_percent: 0.25,
    vignette_percent: 3,
    saturation: "warm hues carry a little more saturation than the cool ones",
    bokeh: "round and soft-edged",
    flare: "a faint warm bloom where a highlight is brightest, no streaks",
  },
  {
    name: "35mm colour negative",
    when: /\b(archive|archival|heritage|nostalgi|retro|vintage|analogue|analog|film|memory|documentary)\b/i,
    reads: "it carries visible grain structure, a soft shoulder, and the slight tonal unevenness that says a frame was exposed rather than computed",
    black_level: 18,
    highlight_rolloff_stops: 2.5,
    grain_percent: 0.5,
    vignette_percent: 6,
    saturation: "slightly muted overall, with the warm end holding more than the cool end",
    bokeh: "round with a faint bright rim",
    flare: "a soft veil against a strong source, never a lens-flare star",
  },
  {
    name: "35mm digital with direct flash",
    when: /\b(splash|motion|burst|energetic|dynamic|street|party|playful|pop|impact|kinetic)\b/i,
    reads: "it falls off hard behind the subject, renders crisp specular highlights, and runs the short tonal scale of a frame lit by one bright source close in",
    black_level: 8,
    highlight_rolloff_stops: 1.5,
    grain_percent: 0.1,
    vignette_percent: 4,
    saturation: "high and even, the way flash renders colour",
    bokeh: "busy, with defined edges",
    flare: "small hard specular points, no veiling",
  },
  {
    name: "digital medium format",
    when: /\b(clinical|laborator|hygien|clean|precision|precise|technical|engineered|efficacy|trust|evidence|innovation)\b/i,
    reads: "it stays neutral through the whole scale, carries no grain, and adds no character of its own between the subject and the sensor",
    black_level: 4,
    highlight_rolloff_stops: 2,
    grain_percent: 0,
    vignette_percent: 0,
    saturation: "accurate rather than expressive; no hue is pushed",
    bokeh: "neutral and even",
    flare: "no flare or bloom of any kind",
  },
];

/** The medium an asset type starts from when the brief argues for nothing. */
const DEFAULT_BY_ASSET: Record<string, string> = {
  poster: "4x5 colour transparency",
  banner: "digital medium format",
  social: "6x7 colour negative",
  packshot: "digital medium format",
  catalogue: "digital medium format",
};

const FALLBACK_MEDIUM = "4x5 colour transparency";

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export interface FinishInput {
  /** `AssetContext.asset_type`, or the use case. */
  assetType?: string | null;
  /** The category hint, where one was inferred. */
  category?: string | null;
  /** The brand's personality word. */
  personality?: string | null;
  /**
   * Prose the system already decided: the blueprint's photography direction, the
   * composition's atmosphere and lighting quality, the brand's emotional
   * territory. Read for evidence, never quoted into the output.
   */
  evidence?: (string | null | undefined)[];
  /** How many lines of copy the model must draw. Changes what grain is allowed. */
  copyLines?: number;
}

/** Which asset family this is, for the rules that depend on how it is read. */
function assetFamily(assetType: string): "banner" | "hero" | "poster" | "social" {
  const a = assetType.toLowerCase();
  if (/banner|display|leaderboard|skyscraper|web ad/.test(a)) return "banner";
  if (/packshot|product hero|hero|catalogue|catalog|ecommerce|e-commerce/.test(a)) return "hero";
  if (/social|instagram|facebook|feed|story|reel/.test(a)) return "social";
  return "poster";
}

/**
 * Resolves the finish.
 *
 * One medium wins. Unlike a treatment axis, a finish does not blend: a frame is
 * either on transparency film or it is not, and averaging two media produces the
 * tonal signature of neither. Where two media are both argued for, the one with
 * more evidence behind it wins and the loser is recorded in `because`.
 */
export function resolveFinish(input: FinishInput): Finish {
  const assetType = clean(input.assetType) || "poster";
  const family = assetFamily(assetType);
  const haystack = [clean(input.category), clean(input.personality), ...(input.evidence || []).map(clean)]
    .filter(Boolean)
    .join(" · ");

  const votes = MEDIA.map((m) => ({
    medium: m,
    hits: (haystack.match(new RegExp(m.when.source, "gi")) || []).map((h) => h.toLowerCase()),
  }))
    .filter((v) => v.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);

  const defaultName = DEFAULT_BY_ASSET[family] || DEFAULT_BY_ASSET[assetType.toLowerCase()] || FALLBACK_MEDIUM;
  const chosen = votes[0]?.medium || MEDIA.find((m) => m.name === defaultName) || MEDIA[0];
  const because: Record<string, string> = {};
  const refused: string[] = [];

  because.medium = votes.length
    ? `the brief is about ${[...new Set(votes[0].hits)].join(", ")}, which is what ${chosen.name} is for`
    : `nothing in the brief argued for a medium, so the ${family}'s own default was used`;
  if (votes.length > 1) {
    because.contest = `${votes[1].medium.name} was also argued for (${[...new Set(votes[1].hits)].join(", ")}) and lost on weight of evidence; a frame cannot be on two stocks`;
  }

  const finish: Finish = {
    medium: chosen.name,
    reads: chosen.reads,
    black_level: chosen.black_level,
    highlight_rolloff_stops: chosen.highlight_rolloff_stops,
    grain_percent: chosen.grain_percent,
    vignette_percent: chosen.vignette_percent,
    saturation: chosen.saturation,
    bokeh: chosen.bokeh,
    flare: chosen.flare,
    because,
    refused,
  };

  // ── what the channel overrides ───────────────────────────────────────────
  //
  // A banner is read at a few hundred pixels while someone is scrolling. Grain
  // and corner falloff do not survive that downscale as texture -- they survive
  // as mush around the edges of the type -- and a long rolloff flattens the
  // contrast the format needs to be read at all.
  if (family === "banner") {
    if (finish.grain_percent > 0) {
      refused.push(`grain ${finish.grain_percent}% dropped: it does not survive a banner's downscale as texture, only as noise`);
      finish.grain_percent = 0;
    }
    if (finish.vignette_percent > 0) {
      refused.push(`corner falloff ${finish.vignette_percent}% dropped: at banner size it reads as a dirty frame edge`);
      finish.vignette_percent = 0;
    }
    if (finish.highlight_rolloff_stops > 2) {
      refused.push(`rolloff shortened from ${finish.highlight_rolloff_stops} stops to 2: a banner needs separation more than latitude`);
      finish.highlight_rolloff_stops = 2;
    }
    because.channel = "a banner is read small and in motion, so contrast and edge cleanliness outrank tonal subtlety";
  }

  // A hero is examined, often enlarged. Falloff and flare read as defects there,
  // and the long rolloff is what keeps a bright surface from burning out.
  if (family === "hero") {
    if (finish.vignette_percent > 0) {
      refused.push(`corner falloff ${finish.vignette_percent}% dropped: a product hero is inspected, and falloff reads as a lighting fault`);
      finish.vignette_percent = 0;
    }
    if (finish.highlight_rolloff_stops < 3) {
      refused.push(`rolloff lengthened from ${finish.highlight_rolloff_stops} stops to 3: a packshot's bright surfaces must compress rather than clip`);
      finish.highlight_rolloff_stops = 3;
    }
    because.channel = "a product hero is looked at closely, so surface rendering outranks atmosphere";
  }

  // ── what the typography overrides ────────────────────────────────────────
  //
  // One-pass: the model draws the letterforms in the same exposure. Grain lands
  // inside the strokes and across the accents, and a Vietnamese tone mark is a
  // mark a few pixels tall. This is the one place finish and BLOCK 8 genuinely
  // constrain each other.
  if ((input.copyLines || 0) > 0 && finish.grain_percent > 0.3) {
    refused.push(`grain reduced from ${finish.grain_percent}% to 0.3%: the frame carries drawn type, and grain inside a tone mark destroys it`);
    finish.grain_percent = 0.3;
    because.typography = "the letterforms are rendered in this same exposure, so the grain has to stay smaller than an accent";
  }

  return finish;
}

/**
 * The finish, as BLOCK 7 states it.
 *
 * Numbers first, adjectives only where a number would be false precision. The
 * opening clause names the medium and then immediately says what it DOES, so the
 * name is never left to carry the instruction on its own -- a medium name alone is
 * a category label, and a category label is what this layer exists to replace.
 */
export function renderFinishForPrompt(f: Finish | null | undefined): string {
  if (!f) return "";
  const grain =
    f.grain_percent > 0
      ? `Grain: ${f.grain_percent}% of the frame's width, even across the whole frame and present in the shadows as much as the midtones.`
      : "Grain: none. The frame has no granular structure at any magnification.";
  const vignette =
    f.vignette_percent > 0
      ? `Corner falloff: ${f.vignette_percent}% darker at the corners than at the centre, gradual, with no visible edge to it.`
      : "Corner falloff: none. The corners are as bright as the centre.";
  const optics = `${f.bokeh}; ${f.flare}.`;
  return [
    `FINISH — this frame is a photograph on ${f.medium}, not a render.`,
    `What that medium does: ${f.reads}.`,
    `Tonality: the darkest value in the frame sits at ${f.black_level}/255 and nothing reaches pure black; ${f.highlight_rolloff_stops} stops of highlight rolloff above the key, so bright surfaces compress instead of clipping to white.`,
    grain,
    vignette,
    `Colour: ${f.saturation}.`,
    `Optical signature: ${optics}`,
  ].join("\n");
}

/** Counts and names only. Never the client's copy. */
export function finishTelemetry(f: Finish | null | undefined) {
  if (!f) return { finish: false };
  return {
    finish: true,
    medium: f.medium,
    blacks: f.black_level,
    rolloff_stops: f.highlight_rolloff_stops,
    grain_percent: f.grain_percent,
    vignette_percent: f.vignette_percent,
    refused: f.refused.length,
  };
}
