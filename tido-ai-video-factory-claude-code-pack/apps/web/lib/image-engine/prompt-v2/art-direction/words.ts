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
  if (v < 28) return "a wide, enveloping view that takes in the whole setting";
  if (v < 40) return "a slightly wide view, with no stretched edges";
  if (v < 60) return "a natural view that exaggerates nothing, neither stretched nor flattened";
  if (v < 85) return "a slightly long view that draws the background a little closer";
  if (v < 120) return "a long, gently compressing view that flattens the background towards the subject";
  return "a tightly compressed view: the background is pulled flat behind the subject and reads almost as a backdrop";
}

/** Aperture as depth of field. */
export function apertureWords(fNumber: number): string {
  const v = Number(fNumber) || 4;
  if (v <= 1.8) return "very shallow focus: only the nearest face of the hero is crisp and everything else melts";
  if (v <= 2.8) return "shallow focus: the hero is crisp and the background falls away softly";
  if (v <= 4.5) return "shallow focus with enough depth to hold the whole hero crisp while the background softens";
  if (v <= 8) return "moderate depth: every product in the group is crisp and only the far background softens";
  return "deep focus: the setting is nearly as crisp as the subject";
}

/** Colour temperature as a described light. */
export function kelvinWords(kelvin: number): string {
  const v = Number(kelvin) || 4500;
  if (v <= 2900) return "deeply warm, close to candlelight";
  if (v <= 3500) return "warm amber, like late afternoon indoors";
  if (v <= 4200) return "softly warm, a shade warmer than neutral";
  if (v <= 5000) return "neutral white, neither warm nor cool";
  if (v <= 6000) return "clean and daylight-neutral";
  return "cool and slightly blue, like open shade";
}

/** Fill ratio as contrast. The number is a key-to-fill ratio, so higher means harsher. */
export function fillRatioWords(ratio: number): string {
  const v = Number(ratio) || 3;
  if (v <= 1.6) return "shadows almost as bright as the lit side: flat, even, no drama";
  if (v <= 2.5) return "soft shadows that keep their detail";
  if (v <= 4) return "clearly modelled shadows with detail still readable in them";
  if (v <= 6) return "deep shadows that hold only a little detail";
  return "near-black shadows: the lit edge does all the describing";
}

/** Camera tilt as a visible angle. Zero is the common and correct answer. */
export function tiltWords(degrees: number): string {
  const v = Math.abs(Number(degrees) || 0);
  if (v < 1) return "the camera level, horizon true, no tilt";
  if (v < 3) return "the camera tilted barely a degree or two off level, enough to feel alive and not enough to read as a mistake";
  if (v < 6) return "the camera tilted a few degrees off level for tension";
  return "the camera clearly tilted off level, the tilt an intentional part of the picture";
}

/** Camera height relative to the subject. Named by what it does, not by a number. */
export type CameraHeight = "low" | "subject_line" | "slightly_above" | "high" | "overhead";

export const CAMERA_HEIGHT_WORDS: Record<CameraHeight, string> = {
  low: "the lens below the subject's mid-line, looking slightly up so the subject stands over the viewer",
  subject_line: "the lens level with the subject's mid-line, the honest eye-level view",
  slightly_above: "the lens a little above the subject's mid-line, looking gently down",
  high: "the lens well above the subject, looking down across the arrangement",
  overhead: "the lens directly overhead, looking straight down on the surface",
};

/** Key-light direction. Named by where the light comes from and what it does to the form. */
export type KeyDirection =
  | "front_left" | "front_right" | "side_left" | "side_right" | "back_left" | "back_right" | "top";

export const KEY_DIRECTION_WORDS: Record<KeyDirection, string> = {
  front_left: "the key light from the front left, high, so shadows fall back and to the right",
  front_right: "the key light from the front right, high, so shadows fall back and to the left",
  side_left: "the key light from the left side, raking across the subject so its form is described by the shadow edge",
  side_right: "the key light from the right side, raking across the subject so its form is described by the shadow edge",
  back_left: "the key light from behind and to the left, so the subject is rimmed and its front is modelled by fill alone",
  back_right: "the key light from behind and to the right, so the subject is rimmed and its front is modelled by fill alone",
  top: "the key light from directly above, close in, so shadows pool tightly under the subject",
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

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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
    : `tall enough to read without effort at a glance — never thinner than a hairline against the background`;
}
