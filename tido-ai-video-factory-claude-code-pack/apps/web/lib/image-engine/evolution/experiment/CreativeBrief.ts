/**
 * Phase 1.1B — the Creative Brief schema.
 *
 * The strategic layer between what is KNOWN about a product and what a director
 * DECIDES to do with it. ProductTruth says the coffee is cold brewed eighteen
 * hours; the brief says what that gives a campaign to work with. Nothing here
 * decides a picture — that is the director's job, and this file is careful not
 * to do it for them.
 *
 * Why `derived_from` is a list and not a string
 * ---------------------------------------------
 * A brief field is usually the product of several facts at once: a story rests
 * on what the thing does AND how it is used. One source string would force the
 * builder to pick a winner and drop the rest, and the dropped one is exactly
 * what a reader needs when the field looks wrong.
 *
 * No creative field may exist without naming what produced it. That rule is
 * enforced by `validateBrief` rather than by convention, because every previous
 * phase of this roadmap that relied on convention lost to a structured field
 * pulling the other way.
 *
 * Product-independence
 * --------------------
 * Five questions, each answerable for any product. There is no category table
 * and no house angle: "what problem does this solve for whoever buys it" has an
 * answer for a cold brew, a laptop stand, a rice cooker and an insurance policy,
 * and none of those answers is written here.
 */

/**
 * Where a brief field came from, as a path into an existing structure.
 *
 * Deliberately a string rather than an enum. These are paths into four schemas
 * that each already carry their own provenance vocabulary — `ProductTruth`'s
 * OBSERVED/DECLARED/DERIVED/ABSENT, `VisualDNAInference`'s confidence scale,
 * `BrandDNA`'s three — and collapsing them into a fifth enum here would be the
 * parallel provenance system this roadmap has repeatedly been told not to build.
 */
export type BriefSource = string;

/** Sources this phase can cite. Exported so a test can assert the closed set. */
export const BRIEF_SOURCES = {
  FUNCTIONAL_TRUTH: "ProductTruth.functional_truth",
  DIFFERENTIATION: "ProductTruth.differentiation",
  SENSORY: "ProductTruth.sensory",
  EMOTIONAL_VALUE: "ProductTruth.emotional_value",
  USAGE_CONTEXT: "ProductTruth.usage_context",
  ABSENT_CLAIMS: "ProductTruth.absent_claims",
  OBSERVED_PRODUCT: "VisualDNA.observed.product",
  CONSUMER_INSIGHT: "MarketingStrategy.consumer_insight",
  CUSTOMER_PSYCHOLOGY: "MarketingStrategy.target_customer_psychology",
  EMOTIONAL_RESPONSE: "MarketingStrategy.emotional_response",
  CREATIVE_MESSAGE: "MarketingStrategy.creative_message",
} as const;

export const ALL_BRIEF_SOURCES: readonly string[] = Object.values(BRIEF_SOURCES);

/**
 * One strategic statement, and the inputs that produced it.
 *
 * `value` is assembled from the sources named in `derived_from` and from
 * nothing else. There is no field for a judgement the builder made on its own,
 * because the builder is not permitted to make one.
 */
export interface BriefField {
  value: string;
  derived_from: BriefSource[];
}

export type BriefFieldName =
  | "product_story"
  | "consumer_problem"
  | "emotional_angle"
  | "visual_opportunity"
  | "avoid_direction";

/** Fixed order, so two briefs are always comparable. */
export const BRIEF_FIELDS: readonly BriefFieldName[] = [
  "product_story",
  "consumer_problem",
  "emotional_angle",
  "visual_opportunity",
  "avoid_direction",
];

export interface CreativeBrief {
  /** What this product actually is, as a thing worth saying. */
  product_story: BriefField | null;
  /** What the buyer is trying to solve. Absent until strategy supplies it. */
  consumer_problem: BriefField | null;
  /** What it should feel like to the person looking. */
  emotional_angle: BriefField | null;
  /** What the product physically gives a camera to work with. */
  visual_opportunity: BriefField | null;
  /** What a direction must NOT rest on, because nothing establishes it. */
  avoid_direction: BriefField | null;
  /** Share of the five fields that are filled, 0–1, two decimals. */
  completeness: number;
  /** The unfilled fields, by name. Never a reason to fail. */
  missing: BriefFieldName[];
}

export interface BriefViolation {
  field: BriefFieldName;
  rule: string;
}

/**
 * Checks the rule the schema cannot express in types: no creative output
 * without a known input.
 *
 * Pure, and reports every violation rather than throwing on the first. A brief
 * with three unsourced fields is a different problem from one with a typo, and
 * a validator that stops at the first cannot tell them apart.
 *
 * A null field is not a violation. Missing data is the normal state of a real
 * brief and the schema records it in `missing`; what is forbidden is a field
 * that asserts something while declining to say where it came from.
 */
export function validateBrief(brief: CreativeBrief): BriefViolation[] {
  const violations: BriefViolation[] = [];
  for (const name of BRIEF_FIELDS) {
    const field = brief[name];
    if (!field) continue;
    if (!field.value?.trim()) {
      violations.push({ field: name, rule: "field is present but its value is empty" });
    }
    if (!Array.isArray(field.derived_from) || field.derived_from.length === 0) {
      violations.push({ field: name, rule: "creative output with no source" });
      continue;
    }
    for (const src of field.derived_from) {
      if (!String(src || "").trim()) {
        violations.push({ field: name, rule: "an empty source was cited" });
      } else if (!ALL_BRIEF_SOURCES.includes(src)) {
        violations.push({ field: name, rule: `cites a source this phase cannot read: ${src}` });
      }
    }
  }
  // completeness must describe the object it is attached to, or it is worse
  // than absent: a caller that trusts it makes a decision on a number nothing
  // checked.
  const filled = BRIEF_FIELDS.filter((f) => brief[f]).length;
  const expected = Math.round((filled / BRIEF_FIELDS.length) * 100) / 100;
  if (brief.completeness !== expected) {
    violations.push({
      field: BRIEF_FIELDS[0],
      rule: `completeness says ${brief.completeness} but ${filled}/${BRIEF_FIELDS.length} fields are filled`,
    });
  }
  return violations;
}

/** Counts, field names and sources only — never the brief's text. */
export function briefTelemetry(brief: CreativeBrief | null | undefined) {
  if (!brief) return { brief: false };
  const sources = new Set<string>();
  for (const name of BRIEF_FIELDS) {
    for (const s of brief[name]?.derived_from || []) sources.add(s);
  }
  return {
    brief: true,
    completeness: brief.completeness,
    filled: BRIEF_FIELDS.filter((f) => brief[f]).length,
    missing: brief.missing,
    sources_cited: [...sources].sort(),
  };
}

/**
 * The brief as the director will read it, or undefined when there is nothing
 * to say.
 *
 * Each statement is followed by what produced it, on the line beneath, for the
 * reason Phase 1.1B established for ProductTruth: a director who cannot check a
 * claim treats it as a suggestion.
 *
 * `missing` is stated rather than hidden. A director told which questions are
 * unanswered can say "I am assuming this and here is why"; one shown a
 * confident four-fifths brief cannot tell that the fifth is missing at all.
 */
export function summarizeCreativeBrief(brief: CreativeBrief | null | undefined): string | undefined {
  if (!brief) return undefined;
  const lines: string[] = [];

  const LABELS: Record<BriefFieldName, string> = {
    product_story: "THE PRODUCT, AS SOMETHING WORTH SAYING",
    consumer_problem: "WHAT THE BUYER IS TRYING TO SOLVE",
    emotional_angle: "WHAT IT SHOULD FEEL LIKE",
    visual_opportunity: "WHAT THE PRODUCT GIVES A CAMERA",
    avoid_direction: "WHAT A DIRECTION MUST NOT REST ON",
  };

  for (const name of BRIEF_FIELDS) {
    const field = brief[name];
    if (!field?.value?.trim() || !field.derived_from?.length) continue;
    lines.push("", `${LABELS[name]}:`, `  ${field.value}`, `    From: ${field.derived_from.join(", ")}`);
  }

  if (!lines.length) return undefined;

  if (brief.missing.length) {
    lines.push(
      "",
      "NOT ANSWERED. Nothing in the inputs establishes these:",
      ...brief.missing.map((m) => `  - ${m.replace(/_/g, " ")}`),
      "A direction that depends on one of them is resting on something nobody",
      "supplied. Choose another, or say plainly that you are assuming it and why."
    );
  }

  return ["CREATIVE BRIEF — what the inputs support, and what they do not.", ...lines].join("\n");
}
