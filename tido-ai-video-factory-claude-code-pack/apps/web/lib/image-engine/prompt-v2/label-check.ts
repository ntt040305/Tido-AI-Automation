/**
 * The product-label check — did the render keep the label the reference showed?
 *
 * WHY IT IS SEPARATE FROM THE COPY CHECK
 * --------------------------------------
 * `checkRenderedText` already compares the CAMPAIGN copy against what the vision
 * pass read, and it deliberately ignores anything marked `on_product`, because the
 * product's own lettering is not typography the renderer invented. That leaves a
 * hole the audit named: nothing checks the product's label at all. This engine has
 * one recorded case of a render inventing a real third-party mark on a bottle while
 * the vision pass reported nothing wrong.
 *
 * WHAT IT COSTS
 * -------------
 * Nothing. It reads the `visible_text` the review pass already collected rather
 * than making a second vision call. A render with the review disabled has no
 * observation to read, and this reports `unavailable` instead of guessing.
 *
 * WHAT IT CANNOT DO
 * -----------------
 * It cannot see. It compares strings a vision model claimed to read against the
 * strings the brief said were on the label, so a model that misreads a label will
 * produce a false mismatch, and a model that reports nothing produces no finding at
 * all. It is a tripwire, not a verdict, and `confidence` says which.
 *
 * Pure. No model call, no I/O.
 */

export interface LabelObservation {
  text: string;
  on_product?: boolean;
  on_logo?: boolean;
}

export interface LabelCheck {
  /** False only when something was expected, observed, and did not match. */
  ok: boolean;
  /** `none` when nothing was observed, so nothing can be concluded. */
  confidence: "none" | "low";
  /** Labels the brief declared and the vision pass did not report on the product. */
  missing: string[];
  /** Product lettering that was reported but matches no declared label. */
  unexpected: string[];
  /** What was compared, for the record. */
  expected: string[];
  observed: string[];
}

const squash = (s: string) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

/** Accent- and case-insensitive, for recognising the same words. Never for accepting them. */
const loose = (s: string) =>
  squash(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Compares the labels the brief declared against the product lettering the vision
 * pass reported.
 *
 * A declared label counts as present when any observed on-product string contains
 * it or it contains the observed string: a vision model reads "SKIN1004" off a
 * label that says "SKIN1004 Centella Ampoule", and that is a match, not a miss.
 */
export function checkProductLabels(expected: string[], observed: LabelObservation[]): LabelCheck {
  const wanted = expected.map(squash).filter(Boolean);
  const onProduct = observed.filter((o) => o?.on_product && squash(o.text)).map((o) => squash(o.text));

  if (!wanted.length || !onProduct.length) {
    return {
      ok: true,
      confidence: "none",
      missing: [],
      unexpected: [],
      expected: wanted,
      observed: onProduct,
    };
  }

  const missing = wanted.filter((w) => {
    const lw = loose(w);
    return !onProduct.some((o) => {
      const lo = loose(o);
      return lo && lw && (lo.includes(lw) || lw.includes(lo));
    });
  });

  const unexpected = onProduct.filter((o) => {
    const lo = loose(o);
    return !wanted.some((w) => {
      const lw = loose(w);
      return lo && lw && (lo.includes(lw) || lw.includes(lo));
    });
  });

  return {
    ok: missing.length === 0 && unexpected.length === 0,
    confidence: "low",
    missing,
    unexpected,
    expected: wanted,
    observed: onProduct,
  };
}

/** Counts and verdicts. The strings are short label fragments, kept for diagnosis. */
export function labelCheckTelemetry(c: LabelCheck | null | undefined) {
  if (!c) return { label_check: false };
  return {
    label_check: true,
    ok: c.ok,
    confidence: c.confidence,
    expected: c.expected.length,
    observed: c.observed.length,
    missing: c.missing.length,
    unexpected: c.unexpected.length,
  };
}
