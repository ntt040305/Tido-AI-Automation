/**
 * Numbers in, words out. The one place a measurement becomes a description.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * The Art Direction Sheet resolves every creative decision to a concrete value — 85mm,
 * f/2.8, 3200K, forty-two percent of the frame — because a sheet that says "a longish
 * lens" cannot be reviewed, cannot be compared between two renders, and cannot be A/B'd.
 * The MASTER PROMPT may not contain any of those values. That is not a style preference:
 * the D8/K12 migration measured it, and a numeral in a Sunburst prompt reaches the image
 * as a drawn numeral, while a parameter dump makes the whole render worse.
 *
 * So the sheet keeps the numbers and this file translates them. Every translation is a
 * total function over the range — no gaps, no throws — because a render must never fail
 * because a lens length fell between two buckets.
 *
 * WHAT A TRANSLATION IS ALLOWED TO SAY
 * ------------------------------------
 * Only the VISIBLE consequence. "85mm" becomes "a long, gently compressing view" — not
 * "shot on an 85" and not "portrait lens", because the model is drawing a picture, not
 * choosing equipment. A reader who knows what 85mm looks like should recognise the
 * sentence, and a reader who does not should still be able to draw it.
 *
 * Pure. No I/O, no clock, no model call, no environment read.
 */

/** Integers 0..100 spelled out. The range covers every percentage and tilt this needs. */
const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/**
 * A whole number as a word.
 *
 * Clamped rather than thrown: the callers feed it percentages and degrees, both of which
 * are already bounded by construction, and a surprise outside the range is not worth
 * ending a render over. Over a hundred it falls back to "more than a hundred", which is
 * a true sentence and never a digit.
 */
export function numberWord(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  if (v < 0) return "zero";
  if (v < 20) return ONES[v];
  if (v === 100) return "a hundred";
  if (v > 100) return "more than a hundred";
  const tens = Math.floor(v / 10);
  const ones = v % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`;
}

/**
 * A percentage, spelled, rounded to the nearest five.
 *
 * Rounded because the precision is false past that point — nothing downstream can place
 * type at forty-three percent of the canvas rather than forty-five — and because a
 * vocabulary of twenty-one phrases is one a model uses consistently, while a vocabulary
 * of a hundred is one it paraphrases.
 */
export function percentWords(pct: number): string {
  const v = Math.max(0, Math.min(100, Math.round(Number(pct) / 5) * 5));
  return `about ${numberWord(v)} percent`;
}

/**
 * The same quantity as a relative phrase, with no percentage at all.
 *
 * This is what `words_only` density uses. The buckets are the fractions a person
 * actually names when describing a layout, which is why they are uneven: "half" and "a
 * third" are landmarks and "thirty-seven percent" is not.
 */
export function shareWords(pct: number): string {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  if (v < 8) return "a narrow strip";
  if (v < 18) return "a small part";
  if (v < 28) return "roughly a quarter";
  if (v < 40) return "roughly a third";
  if (v < 46) return "a little under half";
  if (v < 56) return "about half";
  if (v < 68) return "a little over half";
  if (v < 80) return "roughly two thirds";
  return "most";
}

/** Which band of a frame a vertical position falls in. Used for zones and type placement. */
export function bandWords(topPct: number, heightPct: number): string {
  const centre = Math.max(0, Math.min(100, topPct + heightPct / 2));
  if (centre < 20) return "the top band";
  if (centre < 38) return "the upper third";
  if (centre < 62) return "the middle band";
  if (centre < 80) return "the lower third";
  return "the bottom band";
}

/**
 * Focal length as a look.
 *
 * The boundaries are where the VISIBLE character changes, not where lens ranges are
 * marketed: under 35 the edges start to stretch, around 50 nothing is exaggerated either
 * way, from 70 the background begins to flatten towards the subject, and past 120 the
 * flattening is the dominant fact about the picture.
 */
export function lensWords(mm: number): string {
  const v = Number(mm) || 50;
  if (v < 28) return "a wide, enveloping view taking in the whole setting";
  if (v < 40) return "a slightly wide view, with no stretched edges";
  if (v < 60) return "a natural view, nothing stretched or flattened";
  if (v < 85) return "a slightly long view, the background drawn closer";
  if (v < 120) return "a long, compressing view, the background flattened towards the subject";
  return "a tightly compressed view, the background flat behind the subject like a backdrop";
}

/** Aperture as depth of field. */
export function apertureWords(fNumber: number): string {
  const v = Number(fNumber) || 4;
  if (v <= 1.8) return "very shallow focus: only the hero's nearest face crisp";
  if (v <= 2.8) return "shallow focus: the hero crisp, the background soft";
  if (v <= 4.5) return "shallow focus holding the whole hero crisp, the background soft";
  if (v <= 8) return "moderate depth: every product crisp, only the far background soft";
  return "deep focus: the setting nearly as crisp as the subject";
}

/** Colour temperature as a described light. */
export function kelvinWords(kelvin: number): string {
  const v = Number(kelvin) || 4500;
  if (v <= 2900) return "deeply warm, close to candlelight";
  if (v <= 3500) return "warm amber, like late afternoon";
  if (v <= 4200) return "a shade warmer than neutral";
  if (v <= 5000) return "neutral white, neither warm nor cool";
  if (v <= 6000) return "clean daylight";
  return "cool and slightly blue, like open shade";
}

/** Fill ratio as contrast. The number is a key-to-fill ratio, so higher means harsher. */
export function fillRatioWords(ratio: number): string {
  const v = Number(ratio) || 3;
  if (v <= 1.6) return "flat, even light; shadows almost as bright as the lit side";
  if (v <= 2.5) return "soft shadows, detail kept";
  if (v <= 4) return "clearly modelled shadows, detail still readable";
  if (v <= 6) return "deep shadows, little detail held";
  return "near-black shadows; the lit edge does the describing";
}

/** Camera tilt as a visible angle. Zero is the common and correct answer. */
export function tiltWords(degrees: number): string {
  const v = Math.abs(Number(degrees) || 0);
  if (v < 1) return "the camera level, no tilt";
  if (v < 3) return "the camera tilted barely off level";
  if (v < 6) return "the camera tilted a few degrees off level, for tension";
  return "the camera clearly and deliberately tilted off level";
}

/** Camera height relative to the subject. Named by what it does, not by a number. */
export type CameraHeight = "low" | "subject_line" | "slightly_above" | "high" | "overhead";

export const CAMERA_HEIGHT_WORDS: Record<CameraHeight, string> = {
  low: "the lens below the subject's mid-line, looking up",
  subject_line: "the lens level with the subject's mid-line",
  slightly_above: "the lens a little above the subject's mid-line, looking down",
  high: "the lens well above the subject, looking down across it",
  overhead: "the lens directly overhead, straight down",
};

/** Key-light direction. Named by where the light comes from and what it does to the form. */
export type KeyDirection =
  | "front_left" | "front_right" | "side_left" | "side_right" | "back_left" | "back_right" | "top";

export const KEY_DIRECTION_WORDS: Record<KeyDirection, string> = {
  front_left: "a high key light from the front left, shadows falling back and right",
  front_right: "a high key light from the front right, shadows falling back and left",
  side_left: "a key light raking from the left, the form described by the shadow edge",
  side_right: "a key light raking from the right, the form described by the shadow edge",
  back_left: "a key light behind and left, the subject rimmed, its front on fill alone",
  back_right: "a key light behind and right, the subject rimmed, its front on fill alone",
  top: "a close key light directly above, shadows pooling under the subject",
};

/**
 * Colour words to hex, and back again.
 *
 * Lives here because it is a SPELLING, which is what this file is for: the sheet stores
 * `#c0392b` so that two renders can be compared by equality, and the prompt says "a deep
 * red" because an image model cannot read a hex code — and because a hex is six digits,
 * which a master prompt may not contain.
 *
 * Measured: the first draft of the art-director path put `#f2efe9` into the prompt as the
 * field colour. It was simultaneously unreadable to the renderer and a digit leak.
 */
export const COLOUR_HEX: Record<string, string> = {
  black: "#111111", white: "#f7f5f1", grey: "#8a8a8a", gray: "#8a8a8a",
  red: "#c0392b", crimson: "#a01f2d", pink: "#e39aa8", orange: "#d4752a",
  amber: "#c98a2e", gold: "#b9912f", yellow: "#d9b72c", cream: "#efe6d4",
  green: "#3f7a53", matcha: "#7a9a56", teal: "#2f6f6b", blue: "#2e5d8a",
  navy: "#1d3350", purple: "#5b4580", violet: "#6a4b8a", brown: "#6b4a32",
  beige: "#ded3c0", tan: "#c7a781", silver: "#b9bdc2", bronze: "#8c6a3f",
};

/** Descriptive names for the neutrals the derivation reaches for when nothing is stated. */
const NEUTRAL_NAMES: Record<string, string> = {
  "#f2efe9": "a warm off-white, close to unbleached paper",
  "#d8d2c6": "a soft putty grey",
  "#23211e": "a near-black charcoal with a warm cast",
};

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * WCAG relative luminance, 0 (black) to 1 (white). Null when the input is not a hex.
 *
 * The real formula rather than a cheap average, because the cheap one is wrong in exactly
 * the case that matters: pure yellow and pure blue have nearly the same naive average and
 * wildly different perceived brightness, so an "accent" picked by average can be invisible
 * against its own background.
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** WCAG contrast ratio, 1 to 21. Null when either input is not a hex. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The floor for text against whatever it sits on. WCAG AA for body text.
 *
 * Applied to a drawn image rather than to a web page, which is a stricter situation than
 * the standard was written for: the viewer cannot zoom a poster, and a one-pass renderer
 * will not be nudging the colour afterwards.
 */
export const TEXT_CONTRAST_MIN = 4.5;

/**
 * How far an accent must sit from the field in luminance before it reads as emphasis.
 *
 * The measured defect this exists for: the four-dish brief derived `#f7f5f1` as its accent
 * from the words "white ceramic", against a `#f2efe9` field. Both are off-whites. An
 * accent that close to its ground is not an accent — it is a slightly different
 * background, and "a small part is the accent, a very pale white" is an instruction that
 * cannot be followed.
 *
 * A luminance DELTA rather than a contrast ratio because an accent is a shape against a
 * ground, not text to be read: 0.15 is roughly the point at which a shape stops reading as
 * a smudge, well below the 4.5:1 a letterform needs.
 */
export const ACCENT_LUMINANCE_DELTA_MIN = 0.15;

/** True when `accent` is far enough from `field` in luminance to read as emphasis. */
export function accentSeparates(accent: string, field: string): boolean {
  const a = relativeLuminance(accent);
  const f = relativeLuminance(field);
  if (a === null || f === null) return false;
  return Math.abs(a - f) >= ACCENT_LUMINANCE_DELTA_MIN;
}

/**
 * A neutral that is readable on this background, derived from the background itself.
 *
 * The last resort when every tier's candidate failed its contrast check. Derived from the
 * background's own luminance and from nothing else — no industry, no product type, no
 * occasion — so it is always either a near-black or a near-white, whichever the ground can
 * carry.
 *
 * The two values are the darkest and lightest the palette's own neutral range already
 * uses, so this never introduces a colour the rest of the sheet does not know.
 */
export const NEUTRAL_INK = "#1a1a1a";
export const NEUTRAL_PAPER = "#f7f5f1";

export function readableNeutralFor(background: string): string {
  const l = relativeLuminance(background);
  // An unreadable background is treated as light, which is the common case and the one
  // where ink is the safe answer.
  if (l === null) return NEUTRAL_INK;
  // Whichever actually MEASURES best, not whichever a luminance threshold guesses.
  //
  // The first draft returned paper below a 0.45 threshold. On the brand-kit fixture's
  // `#e01b24` red — luminance 0.17, comfortably "dark" — that gave 4.4 to 1, just under the
  // floor, and ink was worse at 3.6. A threshold cannot know that; a ratio can.
  //
  // The tasteful pair is tried first and the PURE pair only if neither clears the floor,
  // because that is what a last resort is for: on a saturated field no off-white reaches AA,
  // and pure white on that red reaches 4.8. A softer default that cannot be read is not a
  // softer default, it is an unreadable one.
  const candidates = [NEUTRAL_INK, NEUTRAL_PAPER, "#000000", "#ffffff"];
  let best = NEUTRAL_INK;
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background) ?? 0;
    if (ratio >= TEXT_CONTRAST_MIN) return candidate;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }
  // Nothing cleared the floor. The field itself is the problem — a mid-grey carries no type
  // at all — so this returns the best available and the caller records the shortfall.
  return best;
}

/**
 * A hex as a colour a person could mix.
 *
 * Nearest named colour by straight RGB distance, with a lightness qualifier so that two
 * different reds do not both come out as "red". Not perceptually uniform — a proper metric
 * would want Lab — and deliberately not: the vocabulary is two dozen words wide, and a
 * more accurate distance would pick the same word nearly every time.
 */
export function colourWords(hex: string): string {
  const named = NEUTRAL_NAMES[String(hex || "").trim().toLowerCase()];
  if (named) return named;

  const rgb = hexToRgb(hex);
  // Not a hex at all: hand it back unchanged rather than guessing. The caller may have
  // been given a colour that was already a word.
  if (!rgb) return String(hex || "").trim() || "an unnamed colour";

  let best = "grey";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [word, candidate] of Object.entries(COLOUR_HEX)) {
    const c = hexToRgb(candidate);
    if (!c) continue;
    const d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
    // `<` and not `<=`, so the first spelling of a duplicate pair wins ("grey", never
    // "gray") and the output cannot shift with object-key order.
    if (d < bestDistance) {
      bestDistance = d;
      best = word;
    }
  }

  const lightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  const qualifier = lightness > 215 ? "a very pale " : lightness > 165 ? "a light " : lightness > 80 ? "a " : "a deep ";
  return `${qualifier}${best}`;
}

/**
 * One cap height as a floor, in the density the caller asked for.
 *
 * Both forms are true statements about the same number; only one carries a spelled
 * percentage, which is why the mode is a parameter rather than a decision made here.
 */
export function capHeightFloorWords(pct: number, density: "words_only" | "words_plus_percent"): string {
  return density === "words_plus_percent"
    ? `at least ${percentWords(pct)} of the canvas height`
    : `tall enough to read at a glance`;
}
