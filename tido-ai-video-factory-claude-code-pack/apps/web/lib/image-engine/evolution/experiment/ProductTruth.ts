import { SimpleInputRequestV1 } from "../../types";
import { VisualDNA, VisualDNAObservedProduct } from "./VisualDNAAnalyzer";

/**
 * Phase 1.1A — what is known about the product before anything is decided.
 *
 * Why this is not a new provenance system
 * ---------------------------------------
 * Three evidence vocabularies already exist in this engine:
 *
 *   BrandDNA.provenance            "DECLARED" | "DERIVED" | "ABSENT"
 *   VisualDNAInference.confidence  "low" | "medium" | "high" (+ basis, basis_quote)
 *   ProductIdentityResolver        USER_PROVIDED | OBSERVED | STRONG_INFERENCE |
 *                                  WEAK_INFERENCE | AMBIGUOUS, per the Evidence
 *                                  Priority Policy in knowledge_router_v1.md
 *
 * `Provenance` below is BrandDNA's three levels plus the one tier VisualDNA
 * supplies, named `provenance` to match the field that already exists rather
 * than inventing a parallel noun. OBSERVED outranks DECLARED for the same
 * reason the router policy puts it in the highest confidence band (0.90-0.95),
 * and for an empirical one: Phase 1.0 measured product identity rising from
 * 4.67 to 8.33 on the ON arm purely by letting the renderer see what the
 * attached photograph actually contained. Where the observation and the text
 * disagreed, the observation was right.
 *
 * BrandDNA's own union is deliberately NOT widened here. It is written to and
 * never switched on, it lives in the unwired `reasoning/` subsystem, and
 * importing across that boundary would couple two subsystems that are currently
 * independent — an architecture change this phase is not allowed to make. The
 * two stay compatible by construction, and a test asserts the overlap.
 *
 * What this file does NOT do
 * --------------------------
 * It does not reason. Every value is copied from something the caller already
 * resolved: the client's own words, or what the vision pass observed. Fields
 * that would need a judgement are ABSENT and stay ABSENT until a later phase
 * can fill them with evidence attached.
 *
 * An absent field is not a failure. It is the honest state of a request that
 * did not carry the information, and `completeness` exists so nothing
 * downstream can mistake three ABSENTs for five answers.
 */

/** BrandDNA's three levels, plus the tier VisualDNA supplies. */
export type Provenance = "OBSERVED" | "DECLARED" | "DERIVED" | "ABSENT";

/** The three BrandDNA already uses. Exported so a test can assert the overlap. */
export const BRAND_DNA_PROVENANCE: readonly Provenance[] = ["DECLARED", "DERIVED", "ABSENT"];

export interface TruthClaim {
  /** Empty exactly when provenance is ABSENT. Never a placeholder, never a guess. */
  value: string;
  provenance: Provenance;
  /**
   * What entitles the claim: a quoted phrase from the request, the VisualDNA
   * field it was read from, or why nothing was available. Never a paraphrase —
   * the point of a basis is that a reader can go and check it.
   */
  basis: string;
  /** Carried only by DERIVED claims, reusing VisualDNAInference's scale. */
  confidence?: "low" | "medium" | "high";
}

export interface ProductTruth {
  /** What it does or is, stated so a sceptic could check it. */
  functional_truth: TruthClaim;
  /** True of THIS one and not of the category. DERIVED-only, so ABSENT for now. */
  differentiation: TruthClaim;
  /** Material reality. OBSERVED or ABSENT — never anything in between. */
  sensory: TruthClaim & { observed?: VisualDNAObservedProduct };
  /** What it is worth to someone, and why. DERIVED-only, so ABSENT for now. */
  emotional_value: TruthClaim;
  /** When, where and by whom it is actually used. DERIVED-only for now. */
  usage_context: TruthClaim;
  /** Share of the five fields that are not ABSENT, 0-1, two decimals. */
  completeness: number;
}

/** The only way an empty claim is built, so absence always looks the same. */
export function absent(reason: string): TruthClaim {
  return { value: "", provenance: "ABSENT", basis: reason };
}

const clean = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * Renders the observed product as one sentence.
 *
 * Joined rather than summarised: every clause is a field the vision pass
 * reported, so a reader can map the sentence back to the observation. A summary
 * would be this file adding a judgement to an observation, which is the one
 * thing the OBSERVED tier exists to rule out.
 */
function sensoryValue(p: VisualDNAObservedProduct): string {
  return [
    clean(p.form),
    p.materials?.length ? clean(p.materials.join(", ")) : "",
    p.palette?.length ? clean(p.palette.join(", ")) : "",
    clean(p.finish),
    clean(p.surface_detail),
    clean(p.scale_cues),
    clean(p.condition),
  ]
    .filter(Boolean)
    .join("; ");
}

export interface ProductTruthInput {
  request: SimpleInputRequestV1;
  /** Passed in already resolved, exactly as `CreativeDecisionContext` takes it. */
  visualDNA?: VisualDNA | null;
}

/**
 * Assembles what is known. Pure: no I/O, no clock, no randomness, no mutation.
 *
 * Purity is not incidental. `buildContext` is pure and an equivalence test rests
 * on that, so anything it calls has to be too.
 */
export function buildProductTruth(input: ProductTruthInput): ProductTruth {
  const { request } = input;
  const sales = (request as { salesContext?: { product_name?: string; benefit?: string } })
    .salesContext;

  // ── functional truth: DECLARED, or absent ────────────────────────────────
  //
  // `salesContext.benefit` is the client stating what the product does for
  // someone. It has been on the request the whole time and nothing has read it.
  // `product_name` is the weaker fallback: a name is not a function, but a named
  // product is more checkable than an unnamed one.
  const benefit = clean(sales?.benefit);
  const productName = clean(sales?.product_name);
  const functional_truth: TruthClaim = benefit
    ? { value: benefit, provenance: "DECLARED", basis: `salesContext.benefit: "${benefit}"` }
    : productName
      ? {
          value: productName,
          provenance: "DECLARED",
          basis: `salesContext.product_name: "${productName}"`,
        }
      : absent("no salesContext.benefit or product_name supplied");

  // ── sensory: OBSERVED, or absent. Never anything in between ──────────────
  //
  // The rule that makes this tier worth having. Deriving a material from a
  // concept string would turn a guess into a finding's label, and the measured
  // value of Phase 1.0 was precisely that the observation is real.
  const observed = input.visualDNA?.observed?.product;
  const sensoryText = observed ? sensoryValue(observed) : "";
  const sensory: ProductTruth["sensory"] = sensoryText
    ? { value: sensoryText, provenance: "OBSERVED", basis: "VisualDNA.observed.product", observed }
    : absent(
        input.visualDNA
          ? "VisualDNA ran but reported no product observation"
          : "no VisualDNA analysis on this request"
      );

  // ── the three that need a judgement ──────────────────────────────────────
  //
  // Each has a tempting near-source on the request, and each would be a
  // relabelling rather than a reading:
  //
  //   differentiation   nothing declares it. BrandDNA.distinctive_assets is
  //                     about the brand, not about this product.
  //   emotional_value   `creativeDirection.emotional_tone` is the user's chosen
  //                     AESTHETIC, not what the product is worth to anyone.
  //   usage_context     `marketingContext.target_channel` is where the ASSET is
  //                     seen and `target_audience` is who the AD is for. Neither
  //                     is how, or by whom, the product is used.
  //
  // Promoting any of them would put a guess behind a provenance label, which is
  // the failure this vocabulary exists to prevent.
  const differentiation = absent("DERIVED tier not implemented; no declared source exists");
  const emotional_value = absent(
    "DERIVED tier not implemented; creativeDirection.emotional_tone is an aesthetic choice, not the product's value"
  );
  const usage_context = absent(
    "DERIVED tier not implemented; marketingContext describes where the asset runs, not how the product is used"
  );

  const fields = [functional_truth, differentiation, sensory, emotional_value, usage_context];
  const known = fields.filter((f) => f.provenance !== "ABSENT").length;

  return {
    functional_truth,
    differentiation,
    sensory,
    emotional_value,
    usage_context,
    completeness: Number((known / fields.length).toFixed(2)),
  };
}

/** Counts and labels only. No product text, no client words. */
export function productTruthTelemetry(t: ProductTruth | null | undefined) {
  if (!t) return { product_truth: false };
  return {
    product_truth: true,
    completeness: t.completeness,
    functional: t.functional_truth.provenance,
    differentiation: t.differentiation.provenance,
    sensory: t.sensory.provenance,
    emotional_value: t.emotional_value.provenance,
    usage_context: t.usage_context.provenance,
  };
}

/**
 * Phase 1.1B — renders what is known into the brief the director already takes.
 *
 * What this deliberately does NOT emit: the sensory observation
 * --------------------------------------------------------------
 * `summarizeVisualDNA` already puts form, materials, finish, surface detail,
 * palette, scale cues and condition into the same brief, and Phase 1.0 measured
 * what that is worth — product identity 4.67 to 8.33 on the ON arm. Emitting it
 * again from here would state one observation twice, which is the duplicate
 * -carrier defect this project has now paid for twice: once as two scenes, once
 * as two layout authorities. One carrier. VisualDNA owns the sensory tier and
 * this function does not repeat it.
 *
 * So what is genuinely new here is narrower than it looks, and worth naming:
 *
 *   DECLARED   `salesContext.benefit` is read by NOTHING in this engine today.
 *              A client can state what their product does for someone and the
 *              system discards it before any prompt is built.
 *
 *   ABSENT     Stated on purpose. A director told nothing about differentiation
 *              invents one; a director told "this is not established" has been
 *              given a reason not to. Naming an absence is the cheapest
 *              anti-invention instruction available, and it costs one line.
 *
 * No interpretation. Every line is a copy of something declared, or a statement
 * that something is unknown. Turning either into meaning is Phase 1.1C.
 */
export function summarizeProductTruth(t: ProductTruth | null | undefined): string | undefined {
  if (!t) return undefined;

  // Phase 1.1B. A stated claim carries the evidence that entitles it, on the
  // line under it. The director previously read "WHAT IT DOES: X" with no way
  // to tell a quoted client sentence from something the pipeline assembled —
  // and a fact whose source cannot be checked is treated, correctly, as a
  // suggestion. `basis` already exists on every TruthClaim; this stops throwing
  // it away at the last step.
  //
  // A claim with a value and no basis is not printed at all. That is the same
  // rule the blueprint schema enforces, for the same reason: an unsourced
  // assertion in a creative brief is indistinguishable from an invention.
  const declared: string[] = [];
  const ft = t.functional_truth;
  if (ft.provenance === "DECLARED" && ft.value.trim() && ft.basis.trim()) {
    declared.push(
      `  WHAT IT DOES: ${ft.value}`,
      `    Known because the client wrote: ${ft.basis}`
    );
  }

  // The three judgement fields first, then the two that have a source, because
  // the first three are the ones a director is most likely to invent. Fixed
  // order regardless, so a reader comparing two briefs sees the same fields in
  // the same places.
  const unknown = (
    [
      ["what makes this one different from others in its category", t.differentiation],
      ["what it is worth to someone, beyond what it does", t.emotional_value],
      ["how, where and by whom it is actually used", t.usage_context],
      ["what the product physically is", t.sensory],
      ["what the product does", t.functional_truth],
    ] as const
  )
    // Sensory is ABSENT exactly when no observation exists, so this states it
    // only when VisualDNA found nothing. When it did find something the brief
    // already carries it and a "not established" line beside it would contradict
    // the observation sitting three lines above.
    .filter(([, claim]) => claim.provenance === "ABSENT")
    .map(([label]) => label);

  const lines: string[] = ["WHAT IS KNOWN ABOUT THIS PRODUCT, and how it is known."];

  if (declared.length) {
    lines.push(
      "",
      "DECLARED BY THE CLIENT. This is a fact about the product, not a claim to improve on:",
      ...declared
    );
  }

  if (unknown.length) {
    lines.push(
      "",
      "NOT ESTABLISHED. Nobody has told you these and nothing has observed them:",
      ...unknown.map((u) => `  - ${u}`),
      "Do not invent them. A direction that depends on one of these is a direction",
      "resting on something you made up — choose another, or say plainly that you",
      "are assuming it and why."
    );
  }

  // Nothing declared and nothing unknown cannot happen today, but a later phase
  // that fills every field would make it possible, and a block reading only its
  // own heading is worse than no block.
  return lines.length > 1 ? lines.join("\n") : undefined;
}
