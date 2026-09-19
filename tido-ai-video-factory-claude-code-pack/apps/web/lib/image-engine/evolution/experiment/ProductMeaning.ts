import type { ProductTruth, TruthClaim } from "./ProductTruth";
import type { VisualDNA } from "./VisualDNAAnalyzer";
import type { Decision } from "./CreativeBlueprint";

/**
 * The Product Meaning layer — ProductTruth's missing DERIVED tier.
 *
 * Measured cause of the grounding bottleneck: across 12 live renders of
 * `run_20260919_003`, only 3 of 26 grounded blueprint decisions rested on the
 * product or the image; 23 came from the director reasoning about itself. The
 * reason is structural rather than mysterious — `differentiation`,
 * `emotional_value` and `usage_context` are DERIVED-only in ProductTruth, the
 * DERIVED tier was never built, so they are ABSENT on every request and nothing
 * product-shaped was available for the brain to cite.
 *
 * This is that tier. Deterministic, no model call, no agent.
 *
 * The line this file will not cross
 * ---------------------------------
 * It adds no FACTS. Every value is a re-framing of a claim ProductTruth already
 * holds, quoted in `because` so a reader can check it against the client's own
 * words. It never says the coffee is ethically sourced unless the client did,
 * and it never decides what category the product is in.
 *
 * What it does add is IMPLICATION: the step from "the client declared an
 * 18-hour cold process" to "the process is the reason to choose this one, so
 * the picture has to make the process visible". That step is inference, it is
 * marked as inference by `confidence`, and it is anchored to the sentence it
 * came from. An inference that cannot point at something declared is a
 * hallucination with a schema around it — the discipline `VisualDNA` uses for
 * `basis_quote`, applied here.
 *
 * Product-independence
 * --------------------
 * There is no category table and no style vocabulary. Every frame below quotes
 * the client's own sentence rather than describing a kind of product, which is
 * why the same code produces usable meaning for a cold brew, a laptop stand, a
 * rice cooker and an insurance policy without knowing which it is holding.
 */

export type MeaningFieldName =
  | "functional_value"
  | "emotional_value"
  | "customer_problem"
  | "purchase_motivation"
  | "differentiation"
  | "usage_story"
  | "visual_implication";

export const MEANING_FIELDS: readonly MeaningFieldName[] = [
  "functional_value",
  "emotional_value",
  "customer_problem",
  "purchase_motivation",
  "differentiation",
  "usage_story",
  "visual_implication",
];

export interface ProductMeaning {
  /** What it does for the buyer, in the client's own terms. */
  functional_value: Decision | null;
  /** What that is worth to them. Inference, and says so. */
  emotional_value: Decision | null;
  /** What it is there to solve. Inference from the declared function. */
  customer_problem: Decision | null;
  /** Why they would choose it. */
  purchase_motivation: Decision | null;
  /** What is true of THIS one. Only ever from a declared or observed claim. */
  differentiation: Decision | null;
  /** When and how it is actually used. */
  usage_story: Decision | null;
  /** What all of the above means the picture has to do. */
  visual_implication: Decision | null;
  completeness: number;
  missing: MeaningFieldName[];
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/** A claim that says something. ABSENT claims carry an empty value by contract. */
function stated(c: TruthClaim | undefined | null): string {
  if (!c || c.provenance === "ABSENT") return "";
  return clean(c.value);
}

/** The evidence phrase for a claim, so `because` can quote rather than assert. */
function evidence(c: TruthClaim | undefined | null, path: string): string {
  if (!c || c.provenance === "ABSENT") return "";
  const basis = clean(c.basis);
  return basis ? `${path} (${c.provenance}): ${basis}` : `${path} (${c.provenance})`;
}

function made(
  value: string,
  because: string,
  confidence: Decision["confidence"]
): Decision | null {
  const v = clean(value);
  const b = clean(because);
  if (!v || !b) return null;
  if (v.toLowerCase() === b.toLowerCase()) return null;
  // Always product-sourced: this layer reads nothing else.
  return { value: v, because: b, derived_from: "product_truth", confidence };
}

export interface ProductMeaningInput {
  productTruth?: ProductTruth | null;
  visualDNA?: VisualDNA | null;
}

export function buildProductMeaning(input: ProductMeaningInput): ProductMeaning {
  const t = input.productTruth || null;
  const observed = input.visualDNA?.observed?.product || null;

  const fn = stated(t?.functional_truth);
  const fnWhy = evidence(t?.functional_truth, "ProductTruth.functional_truth");
  const sensory = stated(t?.sensory);
  const sensoryWhy = evidence(t?.sensory, "ProductTruth.sensory");
  const usage = stated(t?.usage_context);
  const usageWhy = evidence(t?.usage_context, "ProductTruth.usage_context");
  const emotional = stated(t?.emotional_value);
  const emotionalWhy = evidence(t?.emotional_value, "ProductTruth.emotional_value");
  const diff = stated(t?.differentiation);
  const diffWhy = evidence(t?.differentiation, "ProductTruth.differentiation");

  const fields: Record<MeaningFieldName, Decision | null> = {
    // DECLARED, restated as what it gives the buyer. No inference, so high.
    functional_value: made(fn, fnWhy, "high"),

    // Inference. Stated as a question the picture must answer rather than as a
    // feeling the buyer definitely has — the difference between reading the
    // client's sentence and inventing a psychology for them.
    emotional_value: made(
      emotional || (fn ? `What "${fn}" is worth to the buyer is the reason to choose this over one without it.` : ""),
      emotional ? emotionalWhy : fn ? `inferred from ${fnWhy}; nothing states the emotional value directly` : "",
      emotional ? "high" : "low"
    ),

    customer_problem: made(
      fn ? `The buyer's problem is whatever "${fn}" exists to remove.` : "",
      fn ? `inferred from ${fnWhy}; no consumer insight was supplied` : "",
      "low"
    ),

    purchase_motivation: made(
      diff || fn
        ? `They would choose this one because of ${diff ? `"${diff}"` : `"${fn}"`}, not because of the category.`
        : "",
      diff ? diffWhy : fn ? `inferred from ${fnWhy}` : "",
      diff ? "medium" : "low"
    ),

    // Never invented. A difference nobody declared and nothing observed is the
    // single most dangerous field in this schema — it is where a category
    // cliché would enter if one could.
    differentiation: made(
      diff || sensory,
      diff ? diffWhy : sensory ? `${sensoryWhy}; the observed physical reality is the only difference established` : "",
      diff ? "high" : "medium"
    ),

    usage_story: made(
      usage,
      usageWhy,
      "high"
    ),

    // The step this layer exists to make: from what the product IS to what the
    // camera therefore has to do. Anchored to an observation wherever one
    // exists, because a visual instruction resting on nothing seen is exactly
    // the unforced output Phase 0.5 measured.
    visual_implication: made(
      observed
        ? `The picture has to show ${[clean(observed.form), (observed.materials || []).map(clean).filter(Boolean).join(" and "), clean(observed.finish)]
            .filter(Boolean)
            .join(", ")} as it actually is — that physical reality is what the buyer will recognise.`
        : sensory
          ? `The picture has to show ${sensory} as it actually is.`
          : "",
      observed
        ? "VisualDNA.observed.product — read off the attached image, not described by anyone"
        : sensory
          ? sensoryWhy
          : "",
      observed ? "high" : "medium"
    ),
  };

  const missing = MEANING_FIELDS.filter((f) => !fields[f]);
  return {
    ...fields,
    completeness: Math.round(((MEANING_FIELDS.length - missing.length) / MEANING_FIELDS.length) * 100) / 100,
    missing,
  };
}

/** Counts and field names only — never the meaning text. */
export function productMeaningTelemetry(m: ProductMeaning | null | undefined) {
  if (!m) return { product_meaning: false };
  const byConfidence: Record<string, number> = {};
  for (const f of MEANING_FIELDS) {
    const d = m[f];
    if (d) byConfidence[d.confidence] = (byConfidence[d.confidence] || 0) + 1;
  }
  return {
    product_meaning: true,
    completeness: m.completeness,
    filled: MEANING_FIELDS.length - m.missing.length,
    missing: m.missing,
    by_confidence: byConfidence,
  };
}

/**
 * The meaning as the director reads it, or undefined when nothing grounded.
 *
 * Inferences are labelled as inferences in the text, not only in the schema.
 * A director shown a confident-looking line has no way to know it was derived,
 * and will build on it as if the client had said it.
 */
export function summarizeProductMeaning(m: ProductMeaning | null | undefined): string | undefined {
  if (!m) return undefined;
  const LABELS: Record<MeaningFieldName, string> = {
    functional_value: "WHAT IT DOES FOR THE BUYER",
    emotional_value: "WHAT THAT IS WORTH TO THEM",
    customer_problem: "THE PROBLEM IT REMOVES",
    purchase_motivation: "WHY THEY WOULD CHOOSE THIS ONE",
    differentiation: "WHAT IS TRUE OF THIS ONE",
    usage_story: "WHEN AND HOW IT IS USED",
    visual_implication: "WHAT THAT MEANS THE PICTURE MUST DO",
  };
  const lines: string[] = [];
  for (const f of MEANING_FIELDS) {
    const d = m[f];
    if (!d) continue;
    const mark = d.confidence === "low" ? "  (inferred, not stated by anyone)" : "";
    lines.push("", `${LABELS[f]}:${mark}`, `  ${d.value}`, `    From: ${d.because}`);
  }
  if (!lines.length) return undefined;
  if (m.missing.length) {
    lines.push(
      "",
      "NOT ESTABLISHED. Nothing supplied or observed answers these:",
      ...m.missing.map((x) => `  - ${x.replace(/_/g, " ")}`),
      "Do not invent them."
    );
  }
  return ["WHAT THIS PRODUCT MEANS, and how much of it is inference.", ...lines].join("\n");
}
