import type { MarketingBrainStrategy } from "../../llm/prompt-strategy.schema";
import type { ProductTruth, TruthClaim } from "./ProductTruth";
import type { ProductMeaning } from "./ProductMeaning";
import type { Decision, DecisionBasis } from "./CreativeBlueprint";

/**
 * Phase 1 — the Marketing Insight layer.
 *
 * Who is buying, what they are trying to solve, and what would move them.
 * ProductTruth knows the product; this knows the person. Neither knows the
 * picture — that is the director's job and this file does not do it.
 *
 * Deterministic. No model call, no agent, no clock. Every value is assembled
 * from claims that already exist upstream, and `because` names the one it came
 * from. Where nothing speaks to a field it stays null and `missing` says so.
 *
 * Reuses `Decision` from CreativeBlueprint rather than declaring a sixth
 * {value, because, derived_from, confidence} shape. One vocabulary, reused, is
 * the whole difference between a system and a pile of schemas.
 */

export type InsightFieldName =
  | "target_customer"
  | "life_context"
  | "customer_problem"
  | "desire"
  | "purchase_trigger"
  | "objection"
  | "competitive_angle";

export const INSIGHT_FIELDS: readonly InsightFieldName[] = [
  "target_customer",
  "life_context",
  "customer_problem",
  "desire",
  "purchase_trigger",
  "objection",
  "competitive_angle",
];

export interface MarketingInsight {
  /** Who is actually looking. The client's words where they gave any. */
  target_customer: Decision | null;
  /** When and where the product meets their day. Never invented demographics. */
  life_context: Decision | null;
  /** What they are trying to solve — never who they are. Different questions. */
  customer_problem: Decision | null;
  /** What they want, as distinct from what they need. */
  desire: Decision | null;
  /** The moment that turns wanting into buying. */
  purchase_trigger: Decision | null;
  /** What would stop them, so the picture can answer it. */
  objection: Decision | null;
  /** What this one has that the alternative does not. */
  competitive_angle: Decision | null;
  completeness: number;
  missing: InsightFieldName[];
}

/**
 * Source priority, applied as ladder order in every field below:
 *
 *   USER INPUT  >  PRODUCT TRUTH / MEANING  >  MARKETING STRATEGY  >  INFERENCE
 *
 * Expressed as the order of rungs rather than asserted in a comment, so a rung
 * cannot quietly outrank one above it.
 */

export interface MarketingInsightInput {
  productTruth?: ProductTruth | null;
  /** The DERIVED tier. Where the product-grounded rungs below get their text. */
  productMeaning?: ProductMeaning | null;
  strategy?: MarketingBrainStrategy | null;
  /** The client's own marketing context, straight off the request. */
  audience?: string;
  objective?: string;
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/** A claim that says something. ABSENT claims carry an empty value by contract. */
function stated(claim: TruthClaim | undefined | null): string {
  if (!claim || claim.provenance === "ABSENT") return "";
  return clean(claim.value);
}

interface Rung {
  text: string;
  source: string;
  derived_from: DecisionBasis;
  confidence: Decision["confidence"];
}

/** First rung with something to say wins. Null when all are silent. */
function decide(rungs: Rung[]): Decision | null {
  for (const r of rungs) {
    if (!r.text.trim()) continue;
    return {
      value: r.text.trim(),
      because: r.source,
      derived_from: r.derived_from,
      confidence: r.confidence,
    };
  }
  return null;
}

export function buildMarketingInsight(input: MarketingInsightInput): MarketingInsight {
  const t = input.productTruth || null;
  const s = input.strategy || null;

  const m = input.productMeaning || null;
  const r = (
    text: string,
    source: string,
    derived_from: DecisionBasis,
    confidence: Decision["confidence"]
  ): Rung => ({ text, source, derived_from, confidence });
  /** A rung reading a ProductMeaning field, carrying its basis forward. */
  const fromMeaning = (d: Decision | null | undefined, label: string): Rung =>
    r(d ? d.value : "", d ? `ProductMeaning.${label} — ${d.because}` : "", "product_truth", d?.confidence || "low");

  const fields: Record<InsightFieldName, Decision | null> = {
    target_customer: decide([
      r(clean(input.audience), "the client named the audience on the request", "user", "high"),
      r(clean(s?.target_customer_psychology), "MarketingStrategy.target_customer_psychology", "strategy", "medium"),
    ]),

    // Where the product meets their day. Read from how the product is actually
    // used, never from a demographic: nothing in this pipeline knows the
    // buyer's age, income or city, and inventing one would be the fastest route
    // back to a category cliche.
    life_context: decide([
      fromMeaning(m?.usage_story, "usage_story"),
      r(stated(t?.usage_context), "ProductTruth.usage_context", "product_truth", "high"),
    ]),

    // `audience` is available and deliberately unused here: who someone is and
    // what they are trying to solve are different questions.
    customer_problem: decide([
      r(clean(s?.consumer_insight), "MarketingStrategy.consumer_insight", "strategy", "high"),
      fromMeaning(m?.customer_problem, "customer_problem"),
    ]),

    desire: decide([
      fromMeaning(m?.emotional_value, "emotional_value"),
      r(clean(s?.emotional_response), "MarketingStrategy.emotional_response", "strategy", "medium"),
    ]),

    purchase_trigger: decide([
      fromMeaning(m?.purchase_motivation, "purchase_motivation"),
      r(stated(t?.emotional_value), "ProductTruth.emotional_value", "product_truth", "high"),
      r(clean(s?.commercial_goal), "MarketingStrategy.commercial_goal, read as what it asks of the buyer", "strategy", "low"),
    ]),

    // What would stop them. Derived from what is NOT established: an unproven
    // claim is exactly the thing a sceptical buyer stops at, and ProductTruth
    // already knows which claims those are. Costs no new information.
    objection: decide([
      r(
        t && t.differentiation?.provenance === "ABSENT"
          ? "Nothing yet proves this one is different from any other in its category — the picture has to carry that proof itself."
          : "",
        "ProductTruth.differentiation is ABSENT: nobody declared a difference and nothing observed one",
        "product_truth",
        "medium"
      ),
    ]),

    competitive_angle: decide([
      fromMeaning(m?.differentiation, "differentiation"),
      r(stated(t?.differentiation), "ProductTruth.differentiation", "product_truth", "high"),
      r(clean(s?.creative_angle), "MarketingStrategy.creative_angle", "strategy", "medium"),
    ]),
  };

  const missing = INSIGHT_FIELDS.filter((f) => !fields[f]);
  return {
    ...fields,
    completeness: Math.round(((INSIGHT_FIELDS.length - missing.length) / INSIGHT_FIELDS.length) * 100) / 100,
    missing,
  };
}

/** Counts and field names only — never the insight text. */
export function marketingInsightTelemetry(i: MarketingInsight | null | undefined) {
  if (!i) return { marketing_insight: false };
  const byBasis: Record<string, number> = {};
  for (const f of INSIGHT_FIELDS) {
    const d = i[f];
    if (d) byBasis[d.derived_from] = (byBasis[d.derived_from] || 0) + 1;
  }
  return {
    marketing_insight: true,
    completeness: i.completeness,
    filled: INSIGHT_FIELDS.length - i.missing.length,
    missing: i.missing,
    by_basis: byBasis,
  };
}

/**
 * The insight as the director reads it, or undefined when there is nothing.
 *
 * Each line carries its source, for the reason established for ProductTruth: a
 * director who cannot check a claim treats it as a suggestion. The unanswered
 * questions are stated rather than hidden, so the director can say it is
 * assuming one instead of quietly inventing it.
 */
export function summarizeMarketingInsight(i: MarketingInsight | null | undefined): string | undefined {
  if (!i) return undefined;
  const LABELS: Record<InsightFieldName, string> = {
    target_customer: "WHO IS LOOKING",
    life_context: "WHERE THIS MEETS THEIR DAY",
    customer_problem: "WHAT THEY ARE TRYING TO SOLVE",
    desire: "WHAT THEY WANT, AS DISTINCT FROM WHAT THEY NEED",
    purchase_trigger: "WHAT TURNS WANTING INTO BUYING",
    objection: "WHAT WOULD STOP THEM",
    competitive_angle: "WHAT THIS ONE HAS THAT THE ALTERNATIVE DOES NOT",
  };
  const lines: string[] = [];
  for (const f of INSIGHT_FIELDS) {
    const d = i[f];
    if (!d) continue;
    lines.push("", `${LABELS[f]}:`, `  ${d.value}`, `    From: ${d.because}`);
  }
  if (!lines.length) return undefined;
  if (i.missing.length) {
    lines.push(
      "",
      "NOT ESTABLISHED. Nothing supplied or observed answers these:",
      ...i.missing.map((m) => `  - ${m.replace(/_/g, " ")}`),
      "Do not invent them. If the idea needs one, say you are assuming it and why."
    );
  }
  return ["WHO THIS IS FOR, and how that is known.", ...lines].join("\n");
}
