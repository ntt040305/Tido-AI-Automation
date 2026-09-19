import { SimpleInputRequestV1 } from "../../types";
import { AssetContext, assetContextFor } from "./AssetContext";
import { DirectorBriefInput } from "./CreativeDirectorV1";
import { summarizeVisualDNA, VisualDNA } from "./VisualDNAAnalyzer";
import { buildProductTruth, ProductTruth, summarizeProductTruth } from "./ProductTruth";
import { CreativeBrief, summarizeCreativeBrief } from "./CreativeBrief";
import { CreativeBriefBuilderService } from "./CreativeBriefBuilderService";

/**
 * What is known before any creative decision is made.
 *
 * The problem this solves
 * ----------------------
 * The director's brief was assembled inline in `ExperimentPipeline` as a
 * nine-field object literal built from three different places in the request.
 * Nothing named that shape, nothing typed it, and nothing recorded where each
 * value came from — so "the director was told the audience" and "the director
 * guessed the audience" were indistinguishable from the outside, and the
 * question "what evidence did this decision rest on?" had no answer at all.
 *
 * This is that shape, named and typed. It is not a layer: it performs no
 * reasoning, calls nothing, and produces exactly the brief the inline literal
 * produced. A test asserts the two are `deepStrictEqual` across a matrix of
 * requests, because a refactor that changes behaviour is not a refactor.
 *
 * What it deliberately does NOT do
 * --------------------------------
 * It infers nothing. Every field under `user` is copied from the request
 * verbatim; nothing is normalised, defaulted, or derived. The moment this file
 * starts deciding what a brief means, it becomes a second creative layer
 * competing with the director, which is the defect this whole experiment exists
 * to remove.
 *
 * It also has no notion of industry. `evidence.industry_supplied` records
 * whether the client stated one, which is provenance; branching on its value
 * would be an industry rule, and there are none here.
 *
 * `visual_dna` carries what the attached images were read to contain. It is
 * produced elsewhere and passed in, so this file stays pure; the separation
 * between what was observed and what was inferred from it survives intact into
 * the context and is preserved again in the director-facing summary.
 */

/** Everything the caller has already resolved, passed in rather than re-derived. */
export interface CreativeDecisionContextInput {
  request: SimpleInputRequestV1;
  /**
   * The asset intent the caller resolved, with its flags already applied.
   *
   * Passed in rather than looked up here: whether V2 corrections apply is a
   * routing decision, and a context builder that re-read the flags would be a
   * second place where that decision is made.
   */
  assetIntent: AssetContext | null;
  /** The rendered brief for that intent, with its options already applied. */
  assetIntentBrief?: string;
  /**
   * What the attached images were read to contain, when that ran.
   *
   * Passed in for the same reason as the asset intent: analysing an image is an
   * I/O call behind a flag, and a builder that made it would stop being pure and
   * take the equivalence test with it.
   */
  visualDNA?: VisualDNA | null;
  /**
   * Product Truth V1. Passed in resolved, for the same reason `assetIntent` and
   * `visualDNA` are: whether a feature is on is a routing decision, and a
   * context builder that re-read the flags would be a second place where that
   * decision is made.
   */
  productTruth?: boolean;
  /**
   * Phase 1.1B. Resolved by the caller, for the same reason every other flag
   * here is: whether a feature is on is a routing decision, and a context
   * builder that re-read the flags would be a second place it gets made.
   *
   * A brief needs ProductTruth to say anything, so this only has an effect when
   * `productTruth` is on too. That dependency is enforced by the caller rather
   * than assumed here.
   */
  creativeBrief?: boolean;
}

/** The client's own words, copied, never interpreted. */
export interface CreativeDecisionUserInput {
  concept: string;
  content_message?: string;
  brand_name?: string;
  campaign_goal?: string;
  audience?: string;
  channel?: string;
  use_case?: string;
  aspect_ratio?: string;
  /**
   * Kept as supplied, and read by nothing in this file.
   *
   * It travels because the director already receives it and removing it would
   * be a behaviour change. It is not promoted to a first-class decision input,
   * because a category is the fastest route back to a house style.
   */
  industry?: string;
}

/**
 * What the request actually contains, as distinct from what was reasoned from it.
 *
 * Every field here is a count or a lookup. None of it is a judgement, which is
 * what makes it safe for a later phase to act on.
 */
export interface CreativeDecisionEvidence {
  /**
   * True when the client attached something that will be treated as the product.
   *
   * Deliberately asymmetric with `has_logo`. An image carrying no role at all
   * still becomes product identity downstream — `SimpleInputAdapterService`
   * documents a PRODUCT fallback — so reporting it as absent here would describe
   * a request the pipeline is not going to run. A logo has no such fallback, so
   * it is counted only when the role says so.
   */
  has_product_image: boolean;
  /**
   * How many distinct products the client attached.
   *
   * The two carriers are two representations of one upload set, not two sets, so
   * this is the larger of the two counts rather than their sum — adding them
   * would report six products for three uploads that happen to have been
   * adapted.
   *
   * A count rather than a flag because "there are several" and "there are three"
   * are different questions, and only the second can be staged.
   */
  product_count: number;
  /** True only when an image is explicitly roled LOGO. Never inferred. */
  has_logo: boolean;
  /** True when the use case maps to a known format, independent of any flag. */
  asset_type_known: boolean;
  /** Whether the client stated an industry. Recorded, never branched on. */
  industry_supplied: boolean;
}

export interface CreativeDecisionContext {
  user: CreativeDecisionUserInput;
  asset_intent: AssetContext | null;
  /** The rendered intent text, exactly as the director will receive it. */
  asset_intent_brief?: string;
  /** What the attached images show, or null when nothing was read. */
  visual_dna: VisualDNA | null;
  evidence: CreativeDecisionEvidence;
  /**
   * What is known about the product, with each claim labelled by how it is
   * known. Absent entirely when `product_truth_v1` is off, so a run without the
   * flag produces the object it always produced — which is the equivalence the
   * previous phases established and this one must not break.
   */
  product_truth?: ProductTruth;
  /**
   * The strategic reading of the truth object, with each statement naming the
   * inputs that produced it. Absent entirely when `creative_brief_v1` is off,
   * so a run without the flag produces the object it always produced.
   */
  creative_brief?: CreativeBrief;
}

/** Roles that mean "this is the product", per `AssetRoleV1`. */
const PRODUCT_ROLES = new Set(["PRODUCT", "PRODUCT_REFERENCE"]);

/**
 * Whether any attached image satisfies `predicate`.
 *
 * Both carriers are checked. `images` is the client transport and
 * `referenceImages` is the adapted form; which one is populated depends on the
 * entry point, and a builder that read only one would report no evidence for
 * half the callers. Presence is a boolean, so an image appearing in both costs
 * nothing.
 */
function anyImage(
  request: SimpleInputRequestV1,
  predicate: (role: string | undefined) => boolean
): boolean {
  const fromImages = (request.images || []).some((i) => predicate(i?.role));
  const fromReferences = (request.referenceImages || []).some((r) => predicate(r?.role));
  return fromImages || fromReferences;
}

/**
 * Distinct products attached, counted the same way `has_product_image` decides.
 *
 * An unroled image counts, because the adapter's documented PRODUCT fallback
 * will make it one. A logo never does.
 */
function countProducts(request: SimpleInputRequestV1): number {
  const isProduct = (role: string | undefined) =>
    !role || PRODUCT_ROLES.has(String(role).toUpperCase());
  const a = (request.images || []).filter((i) => isProduct(i?.role)).length;
  const b = (request.referenceImages || []).filter((r) => isProduct(r?.role)).length;
  return Math.max(a, b);
}

/**
 * Assembles the context. Pure: no I/O, no clock, no randomness, no mutation.
 *
 * Purity is the property the equivalence test rests on. If this ever needs to
 * read something, it takes it as an argument.
 */
export function buildContext(input: CreativeDecisionContextInput): CreativeDecisionContext {
  const { request, assetIntent, assetIntentBrief, visualDNA } = input;
  const mc = request.marketingContext;

  // Spread rather than assigned, so with the flag off the returned object has no
  // `product_truth` key at all. `deepStrictEqual` distinguishes an absent key
  // from an undefined one, and the equivalence test depends on that.
  const truth = input.productTruth ? buildProductTruth({ request, visualDNA }) : null;
  const productTruth = truth ? { product_truth: truth } : {};

  // Strategy is deliberately not passed: `MasterPromptCompilerService` produces
  // it AFTER the director judges, so at this point in the pipeline it does not
  // exist. The builder reports the fields that depend on it as missing, which
  // is the honest reading of the pipeline as it actually runs.
  const creativeBrief =
    input.creativeBrief && truth
      ? { creative_brief: CreativeBriefBuilderService.build({ productTruth: truth, visualDNA }) }
      : {};

  return {
    ...productTruth,
    ...creativeBrief,
    user: {
      concept: request.concept,
      content_message: request.contentMessage,
      brand_name: request.brandName,
      campaign_goal: mc?.objective,
      audience: mc?.target_audience,
      // Carried for the first time. The channel has always been in the request
      // and has never reached the director; this records it without changing
      // what the director is sent, which is a later phase's decision to make.
      channel: mc?.target_channel,
      use_case: request.useCase,
      aspect_ratio: request.aspectRatio,
      industry: mc?.industry,
    },
    asset_intent: assetIntent,
    asset_intent_brief: assetIntentBrief,
    visual_dna: visualDNA ?? null,
    evidence: {
      has_product_image: anyImage(
        request,
        (role) => !role || PRODUCT_ROLES.has(String(role).toUpperCase())
      ),
      has_logo: anyImage(request, (role) => String(role || "").toUpperCase() === "LOGO"),
      product_count: countProducts(request),
      // Looked up without flags on purpose: whether this engine recognises the
      // format is a fact about the request, not about which features are on.
      asset_type_known: assetContextFor(request.useCase) !== null,
      industry_supplied: Boolean(mc?.industry),
    },
  };
}

/**
 * Converts the context into the brief the director already accepts.
 *
 * `DirectorBriefInput` and `judge()` are untouched by design. The director is
 * the one component in this experiment with a settled contract and a test that
 * reads its source, so the context is adapted to it rather than the other way
 * round. Fields the context carries and the brief does not — `channel` — stop
 * here until something downstream has a use for them.
 *
 * Every key is emitted, including the ones whose value is undefined, because
 * the literal this replaces emitted them too and `deepStrictEqual` can tell the
 * difference between an absent key and an undefined one.
 */
export function toDirectorBrief(context: CreativeDecisionContext): DirectorBriefInput {
  // Emitted only when there is an analysis to summarise, so a run without images
  // — or with the flag off — produces the nine keys it always produced, which is
  // the equivalence the previous phase established and this one must not break.
  const visualDNA = summarizeVisualDNA(context.visual_dna);
  // Emitted on the same terms as `visualDNA`: only when there is something to
  // say, and spread so the key is absent rather than undefined when there is
  // not. `deepStrictEqual` distinguishes those and the equivalence test depends
  // on it.
  const productTruth = summarizeProductTruth(context.product_truth);
  // Emitted on the same terms as the two above: only when there is something to
  // say, and spread so the key is absent rather than undefined when there is
  // not. `deepStrictEqual` distinguishes those and the equivalence test depends
  // on it.
  const creativeBrief = summarizeCreativeBrief(context.creative_brief);
  return {
    ...(visualDNA ? { visualDNA } : {}),
    ...(productTruth ? { productTruth } : {}),
    ...(creativeBrief ? { creativeBrief } : {}),
    assetContext: context.asset_intent ? context.asset_intent_brief : undefined,
    concept: context.user.concept,
    contentMessage: context.user.content_message,
    brandName: context.user.brand_name,
    useCase: context.user.use_case,
    aspectRatio: context.user.aspect_ratio,
    industry: context.user.industry,
    objective: context.user.campaign_goal,
    audience: context.user.audience,
  };
}

/** What was known, for the log. Reports; never guesses. */
export function contextTelemetry(context: CreativeDecisionContext) {
  return {
    asset_type: context.asset_intent?.asset_type ?? null,
    visual_dna: context.visual_dna ? Object.keys(context.visual_dna.observed) : null,
    asset_type_known: context.evidence.asset_type_known,
    intent_brief_chars: context.asset_intent_brief?.length ?? 0,
    routes_offered: context.asset_intent?.possible_strategies?.length ?? 0,
    has_product_image: context.evidence.has_product_image,
    has_logo: context.evidence.has_logo,
    product_count: context.evidence.product_count,
    industry_supplied: context.evidence.industry_supplied,
    // Named rather than valued: the log is read by people who should not need
    // the client's brief in it to know which inputs were present.
    supplied: [
      context.user.content_message ? "copy" : "",
      context.user.brand_name ? "brand" : "",
      context.user.campaign_goal ? "objective" : "",
      context.user.audience ? "audience" : "",
      context.user.channel ? "channel" : "",
    ].filter(Boolean),
  };
}
