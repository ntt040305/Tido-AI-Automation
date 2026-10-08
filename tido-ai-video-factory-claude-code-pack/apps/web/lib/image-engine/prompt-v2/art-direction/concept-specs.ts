/**
 * Technical specifications the client typed into the concept, extracted and translated.
 *
 * THE PROBLEM
 * -----------
 * A client who knows photography writes "shot at 85mm, f/2.8, warm 3200K light". Those
 * are the three most specific instructions in the whole brief, and today they are
 * invisible in two directions at once:
 *
 *   1. The concept is pasted into the prompt verbatim, so "85mm" reaches the model as a
 *      numeral — which `gpt-checks` correctly REFUSES, costing a repair call, after which
 *      the director usually drops the instruction rather than translating it.
 *   2. Nothing reads them as decisions, so the camera block derives its own focal length
 *      and quietly overrules the one person in the room who stated a preference.
 *
 * THE FIX, IN TWO HALVES
 * ----------------------
 * Extract them as EXPLICIT USER SELECTIONS — precedence tier 3, above anything the system
 * inferred — and keep the concrete value in the Art Direction Sheet, where it can be
 * reviewed and compared. Then translate them to words for the prompt, so the client's
 * actual instruction survives the digit ban instead of being deleted by it.
 *
 * WHAT IS NOT EXTRACTED
 * ---------------------
 * Prices. "Chỉ từ 30K" is copy, and "30K" matches a Kelvin-shaped pattern closely enough
 * to matter: 30K as a colour temperature is physically absurd, which is exactly why the
 * bounds below are bounds and not just patterns. A number is only read as a spec when it
 * is in the range that spec can actually take.
 *
 * Pure. No I/O, no clock, no model call.
 */

export interface ConceptSpecs {
  /** Focal length in millimetres, when the client stated a plausible one. */
  lens_mm?: number;
  /** Aperture f-number, when stated. */
  aperture?: number;
  /** Colour temperature in kelvin, when stated. */
  kelvin?: number;
  /** The exact substrings matched, in the order found. For the sheet's record. */
  matched: string[];
}

/**
 * Plausible ranges. A match outside its range is not a spec.
 *
 * The lens floor is 8mm because fisheyes exist and the ceiling 1200mm because
 * super-telephotos do; the point is to exclude "2mm" and "5000mm", not to police taste.
 * Kelvin starts at 1500 — below candlelight nothing is a light source — which is what
 * keeps "30K" in a price line from being read as a colour temperature.
 */
const LENS_RANGE = [8, 1200] as const;
const APERTURE_RANGE = [0.7, 45] as const;
const KELVIN_RANGE = [1500, 20000] as const;

function inRange(v: number, [lo, hi]: readonly [number, number]): boolean {
  return Number.isFinite(v) && v >= lo && v <= hi;
}

/**
 * Reads every spec the text states.
 *
 * Last one wins per kind, deliberately: a client who writes "50mm, actually make it 85mm"
 * has changed their mind in the order they wrote it, and reading the first match would
 * honour the sentence they corrected.
 */
export function extractConceptSpecs(concept: string | null | undefined): ConceptSpecs {
  const text = String(concept ?? "");
  const out: ConceptSpecs = { matched: [] };

  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*mm\b/gi)) {
    const v = Number(String(m[1]).replace(",", "."));
    if (inRange(v, LENS_RANGE)) {
      out.lens_mm = v;
      out.matched.push(m[0]);
    }
  }

  // `f/2.8`, `f2.8`, `f 2.8`. Not bare "2.8": that is a number in a sentence.
  for (const m of text.matchAll(/\bf\s*\/?\s*(\d+(?:[.,]\d+)?)\b/gi)) {
    const v = Number(String(m[1]).replace(",", "."));
    if (inRange(v, APERTURE_RANGE)) {
      out.aperture = v;
      out.matched.push(m[0]);
    }
  }

  // `3200K`, `3200 K`, `3200 kelvin`. The range is what excludes a price written as "30K".
  for (const m of text.matchAll(/(\d{3,5})\s*(?:K\b|kelvin\b)/gi)) {
    const v = Number(m[1]);
    if (inRange(v, KELVIN_RANGE)) {
      out.kelvin = v;
      out.matched.push(m[0]);
    }
  }

  return out;
}

/** True when the client stated at least one spec. */
export function hasConceptSpecs(specs: ConceptSpecs): boolean {
  return specs.lens_mm !== undefined || specs.aperture !== undefined || specs.kelvin !== undefined;
}

/**
 * The concept with every matched spec removed.
 *
 * Needed because the concept is quoted into the brief, and a numeral in it would be
 * refused by the checks even after the camera block translated it properly. The
 * instruction is not lost — it has already been promoted to the sheet, which is a more
 * binding place than a sentence in the middle of a paragraph.
 *
 * Tidies the punctuation the removal leaves behind, so "shot at 85mm, f/2.8, warm light"
 * does not become "shot at  ,  , warm light".
 */
export function conceptWithoutSpecs(concept: string | null | undefined, specs: ConceptSpecs): string {
  let text = String(concept ?? "");
  if (!specs.matched.length) return text.trim();
  for (const found of specs.matched) {
    text = text.split(found).join("");
  }
  return text
    .replace(/\(\s*[,;·/]*\s*\)/g, "")
    .replace(/\s*,\s*(?=,)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])\s*(?=[,.;:])/g, "")
    .replace(/(^|[.!?]\s*)[,;:]\s*/g, "$1")
    .replace(/[,;:]\s*$/g, "")
    .trim();
}
