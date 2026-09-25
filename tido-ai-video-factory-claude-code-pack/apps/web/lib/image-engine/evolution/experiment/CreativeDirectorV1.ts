import { defaultLLMProviderService, LLMProviderService } from "../../llm/llm-provider.service";
import {
  NO_TEXT_TYPOGRAPHY,
  stripUnauthorizedText,
  unauthorizedText,
  type TextRequirement,
} from "../../compiler/ExactCopyIntegrityValidator";

/**
 * Creative Judgment V1 — exploration, reasoning, and the generic check.
 *
 * Experiment-only. Nothing in the stable pipeline imports this file, and it
 * cannot be reached unless one of the three V1 flags is on.
 *
 * Why it is one call and not three
 * --------------------------------
 * The three features are separately switchable, but when several are on they run
 * as one request. Exploring directions, then explaining the choice, then asking
 * whether the choice is generic are the same act of judgement: splitting them
 * into three calls would make the reasoning explain a direction it had not
 * chosen, and the generic check argue with a direction it had not reasoned
 * about. The flags decide what the model is ASKED for, not how many times it is
 * asked.
 *
 * What it does not do
 * -------------------
 * It does not touch the brief, the compiler, the knowledge system or the
 * provider. It produces a document that the composer appends to an already
 * compiled prompt. If this call fails, the render proceeds with the stable
 * prompt exactly as it would have — a creative upgrade is not worth an outage,
 * and every failure path here returns null rather than throwing.
 */

export interface CreativeDirection {
  name: string;
  core_idea: string;
  visual_language: string;
  why_it_fits: string;
  /** V2: what the viewer should feel, and how they should react. */
  emotional_objective?: string;
  audience_reaction?: string;
}

/** V2: what the brand IS, as distinct from what it sells. */
export interface BrandIntelligence {
  personality: string;
  positioning: string;
  emotional_territory: string;
  audience_perception: string;
  inferred: string;
}

/** V2: who is looking, and what has to happen in their head. */
export interface ConsumerIntelligence {
  viewer: string;
  first_feeling: string;
  trust_driver: string;
  desire_driver: string;
  intended_action: string;
  attention: { first_second: string; then: string; finally: string };
}

/** V2: an element and the meaning it carries, rather than its popularity. */
export interface VisualSemantic {
  element: string;
  communicates: string;
  why_this_brand: string;
}

/** V2: the internal review, with the scores that drove any revision. */
export interface CreativeReview {
  strategically_justified: string;
  survives_logo_removal: string;
  differentiated_from_generic_ai: string;
  solves_communication_goal: string;
  agency_would_approve: string;
  scores: {
    originality: number;
    brand_fit: number;
    audience_relevance: number;
    commercial_strength: number;
    ai_generic_risk: number;
  };
  refined: boolean;
  what_changed?: string;
}

/** One judgement about a candidate, and the words it rests on. */
export interface StrategyVerdict {
  stance: "supports" | "neutral" | "works_against";
  because: string;
  /**
   * Quoted from the brief or from the attached-image analysis.
   *
   * Checked rather than trusted. A verdict whose evidence appears nowhere in
   * what the director was given is downgraded to neutral and marked unverified:
   * the same discipline `VisualDNA` uses for inference, for the same reason —
   * an assessment nobody can trace is a preference with a schema around it.
   */
  evidence: string;
}

/** A route developed far enough to be judged against the others. */
export interface StrategyCandidate {
  route: string;
  core_idea: string;
  /**
   * Phase 0.2. How the frame is RENDERED, not what is in it.
   *
   * The exploration branch has carried this since it existed; this branch did
   * not, so a strategy-selection run reached the renderer with a subject and no
   * photograph — the single field separating "what happens" from "how it looks".
   *
   * Optional, because every judgment produced before this field existed is still
   * a valid judgment and the resolver must not start throwing on them.
   */
  visual_language?: string;
  /**
   * Phase 4.1. The three craft decisions, per candidate rather than only for
   * the winner, so every direction on the table is a complete concept a person
   * can compare -- and so the evaluator can switch to one without borrowing the
   * set-aside route's composition, type or light. Optional: judgments produced
   * before this existed remain valid.
   */
  composition?: string;
  typography?: string;
  lighting?: string;
  why_this_route: string;
  assessment: {
    product: StrategyVerdict;
    audience: StrategyVerdict;
    objective: StrategyVerdict;
    brand: StrategyVerdict;
    channel: StrategyVerdict;
    feasibility: StrategyVerdict;
  };
  /** V2 depth, when `creative_strategy_intelligence_v1` is also on. */
  emotional_objective?: string;
  audience_reaction?: string;
  /**
   * Format Challenge V1. The failure mode this route risks, copied from the
   * brief's list, and what the route does that pays for it.
   *
   * Optional, like every field added after the fact: a judgment produced before
   * this existed is still a valid judgment, and nothing downstream may start
   * throwing on one.
   */
  risks?: string;
  earns_it?: string;
}

/**
 * Which route this brief is answered by, and why that one.
 *
 * Replaces the three fixed names — Commercial Safe, Premium Brand, Creative
 * Exploration — which were written into the JSON contract itself and so came
 * back identically for every product, every audience and every format. Three
 * commercial attitudes are not three communication strategies, and a brief that
 * can be answered by the same three whatever it says has not been read.
 */
export interface CreativeStrategy {
  candidates: StrategyCandidate[];
  selected: string;
  selection_reason: string;
  runner_up: string;
  why_not_runner_up: string;
  /** Every route offered, in the order it was offered. Distribution is measurable. */
  routes_offered: string[];
  /** The subset developed into candidates. */
  routes_developed: string[];
}

/**
 * Why these products are in one picture together.
 *
 * The question that was never asked. Measured on a three-product render: the
 * compiled prompt contained twenty-one thousand characters and not one line
 * describing any relationship between the products. Every line that mentioned
 * them was an isolation instruction — "each is a separate physical identity",
 * "do NOT clone", "do NOT average", three reference priorities at 0.9, 0.9, 0.9
 * — and the layout reserved one PRODUCT_FOCAL zone for all three. The renderer
 * produced three separated objects in a row, which is the prompt working
 * exactly as written.
 *
 * Isolation is right and stays. What was missing is its counterweight, and a
 * counterweight has to start from why the products belong in the same frame.
 *
 * `relationship_type` is free text on purpose. A closed set — collection,
 * hero_support, comparison, bundle, lifestyle — would be the menu problem this
 * project has removed twice already: the model returns the shape it is given,
 * and a list of five becomes five templates. Those words appear in the
 * instructions as examples of the KIND of answer wanted, and the director is
 * told in as many words that its own phrase is better than any of them.
 */
export interface ProductRelationshipDecision {
  /** In the director's own words. Not chosen from a list. */
  relationship_type: string;
  /** Why THESE products are together in THIS brief, for THIS audience. */
  strategic_reason: string;
  /** What that relationship means the picture has to show. */
  visual_implication: string;
  /** What it means for which product leads, and whether one should. */
  hierarchy_implication: string;
}

/**
 * How the group is physically staged, derived from why it exists.
 *
 * Every field answers a specific way the three-product render failed: no
 * contact shadow anchoring anything, no single key direction, no overlap or
 * depth ordering, no readable ground plane, no hierarchy, no interaction.
 *
 * It is not a layout. It says what must be physically true of the scene — one
 * light, one floor, who is in front — and leaves the arrangement to the
 * renderer, which is the difference between staging and a template.
 */
export interface MultiProductStaging {
  relationship: ProductRelationshipDecision;
  /** Which product leads and which support, or why none should. */
  hierarchy: string;
  /** How the group reads as one thing: gathered, ranked, spread, layered. */
  grouping: string;
  /** The surface they all stand on, and how it recedes. */
  shared_ground: string;
  /** One key direction for the whole group. */
  light_direction: string;
  /** What is in front of what, and where they overlap. */
  depth_order: string;
  /** How they touch the ground, each other, or a hand. */
  interaction: string;
  /** Why this staging, for this relationship and this brief. */
  reason: string;
}

export interface DecisionWithReason {
  choice: string;
  reason: string;
}

export interface CreativeJudgment {
  directions: CreativeDirection[];
  selected: string;
  selection_reason: string;
  rejected_reason?: string;
  reasoning?: {
    camera: DecisionWithReason;
    lighting: DecisionWithReason;
    composition: DecisionWithReason;
    typography: DecisionWithReason;
    colour: DecisionWithReason;
  };
  generic_check?: {
    /** Elements that are common in this category and were kept or dropped. */
    flagged: string[];
    /** Why each kept element earns its place for THIS brand, or what replaced it. */
    justification: string;
    revised: boolean;
  };
  brand?: BrandIntelligence;
  consumer?: ConsumerIntelligence;
  semantics?: VisualSemantic[];
  review?: CreativeReview;
  /**
   * What each authorized string is doing in THIS asset.
   *
   * Asked for rather than inferred. The strings themselves are not decided here
   * and cannot be — they are the client's words; only the job each one does is
   * open to judgement, and that job changes with the format even when the words
   * do not.
   */
  copy_roles?: CopyRoleJudgment[];
  /**
   * Strategy Selection V1. Present only when the flag is on and the format
   * offered routes to choose between.
   */
  strategy?: CreativeStrategy;
  /**
   * Multi-Product Staging V1. Present only when the brief carries two or more
   * products and the flag is on.
   */
  staging?: MultiProductStaging;
  /**
   * Phase 4.2 / 4.3. The evaluation of every developed direction and the
   * selection rule's outcome. Attached by the pipeline after the call, never
   * produced by the model.
   */
  evaluation?: import("./DirectionEvaluator").DirectionEvaluation;
}

/** One authorized string, the job it does here, and why that is the job. */
export interface CopyRoleJudgment {
  text: string;
  role: string;
  reason: string;
}

export interface DirectorBriefInput {
  /**
   * What the format is for, as a communication problem.
   *
   * Supplied only when `asset_type_intelligence_v1` is on. Without it the
   * director sees `FORMAT: poster` and nothing else, which is what it saw before
   * this existed.
   */
  assetContext?: string;
  /**
   * What the client's own attachments were read to contain.
   *
   * Supplied only when `visual_dna_v1` is on and an image was analysed. Without
   * it this director decides camera, lighting and composition for a product it
   * has never seen, which is what it did before this field existed.
   *
   * Optional, and last in the brief: it informs the decisions, it does not make
   * them.
   */
  visualDNA?: string;
  /**
   * What is known about the product, and how it is known.
   *
   * Supplied only when `product_truth_v1` is on. It deliberately does NOT
   * repeat the material observation — `visualDNA` above already carries that,
   * and stating one observation twice is the duplicate-carrier defect this
   * project has paid for twice. What it adds is the half nothing else carries:
   * what the client DECLARED the product does, and an explicit list of what is
   * NOT established, so a direction is not built on an invented difference.
   */
  productTruth?: string;
  /**
   * The strategic reading of the product, with every statement naming what
   * produced it.
   *
   * Supplied only when `creative_brief_v1` is on, and only when ProductTruth is
   * on too — a brief with no truth object to read has nothing to say. It sits
   * BELOW `productTruth` on purpose: the facts come first and the reading of
   * them second, so a director who disagrees with the reading can still see
   * what it was read from.
   */
  creativeBrief?: string;
  /**
   * The routes this format offers, already shuffled by the caller.
   *
   * They also appear inside `assetContext` as prose. They are repeated here so
   * the director is asked for a structured answer about a known list rather than
   * about whatever it remembers reading, and so the pipeline — not the model —
   * owns the order that was presented.
   */
  routes?: string[];
  /**
   * How many products the client attached.
   *
   * Asked for only when it is two or more: a single-product brief has no
   * relationship to reason about, and asking anyway would invite one to be
   * invented.
   */
  productCount?: number;
  /**
   * What this account's own history suggests: standing preferences and
   * patterns from kept work, already thresholded, capped and diversified by the
   * caller. Built by `memoryContextBrief`.
   *
   * Context, never direction. It is the LAST thing in the brief and says so in
   * its own header: the brief in front of the director outranks every line of
   * it. The engine has no account and no store -- these arrive as sentences,
   * resolved above the engine boundary.
   */
  memoryContext?: string;
  /**
   * Phase 4.2. How each OFFERED route has gone for this account before, from
   * `renderRouteEvidence`: renders, keeps, rejections, vision problems. Read
   * before the director chooses, so memory informs the selection itself rather
   * than arriving only as a correction afterwards.
   */
  routeEvidence?: string;
  /**
   * What words may appear in this image, resolved once from what the person
   * typed (`resolveTextRequirement`). "exact": these lines, verbatim, and no
   * others -- the director decides how they look, never what they say. "none":
   * the image carries no text, and the director decides composition and visual
   * direction only. Supersedes `contentMessage` when present.
   */
  textRequirement?: TextRequirement;
  /**
   * Phase 5.4. The Brand Kit as a brief block (`brandKitBrief`): palette,
   * fonts, preferred and forbidden styles. The client's standing identity --
   * above the director's taste, below the brief in front of it.
   */
  brandKit?: string;
  concept: string;
  contentMessage?: string;
  brandName?: string;
  useCase?: string;
  aspectRatio?: string;
  industry?: string;
  objective?: string;
  audience?: string;
}

/**
 * Renders recalled memory as a director brief block, or undefined when there is
 * none -- in which case the brief is byte-identical to what it was before.
 *
 * Preferences and workspace patterns stay in separate lists because they carry
 * different authority: a preference is something a person stated or repeated; a
 * pattern is a statistical observation over a body of work. Merging them would
 * let a pattern seen three times read like something the client asked for.
 */
export function memoryContextBrief(
  standingPreferences?: string[] | null,
  creativeMemory?: string[] | null,
): string | undefined {
  const prefs = (standingPreferences || []).map((s) => String(s).trim()).filter(Boolean);
  const memory = (creativeMemory || []).map((s) => String(s).trim()).filter(Boolean);
  if (!prefs.length && !memory.length) return undefined;
  return [
    "CONTEXT FROM THIS ACCOUNT'S PREVIOUS WORK — observations, not instructions.",
    "Everything above outranks every line below. Use a line only where the brief is silent,",
    "ignore any line the brief contradicts, and do not let these make this concept resemble the last one.",
    ...(prefs.length ? ["Standing preferences this person stated or repeatedly kept:", ...prefs.map((p) => `  - ${p}`)] : []),
    ...(memory.length ? ["Observed in this workspace's previous renders:", ...memory.map((m) => `  - ${m}`)] : []),
  ].join("\n");
}

/** The director's brief block for the text requirement. */
export function textRequirementBrief(req: TextRequirement): string {
  if (req.mode === "exact") {
    return [
      "TEXT THAT MUST APPEAR — exactly these lines, verbatim, and no other words:",
      ...req.lines.map((l, i) => `  ${i + 1}. "${l}"`),
      "You decide how this text LOOKS: style, font direction, size, placement, hierarchy and visual treatment. You never decide what it SAYS. Do not rewrite, replace, summarize, translate or add to it, and do not propose any other headline, slogan, CTA or lettering. Wherever you quote on-image text, quote only these lines.",
    ].join("\n");
  }
  return [
    "TEXT: NONE. The client supplied no text, so this image carries no text at all.",
    "Decide composition and visual direction only. Do not propose, write or imply any headline, slogan, tagline, CTA, price, caption or decorative lettering.",
    `Wherever you are asked about typography, answer exactly: "${NO_TEXT_TYPOGRAPHY}".`,
  ].join("\n");
}

/**
 * Holds a judgment to the text requirement, after the model has answered.
 *
 * The brief already says it; this makes it true. A director that writes a
 * headline for an image that must carry none, or quotes a slogan the client
 * never typed, has that sentence removed -- whole, so what remains still reads
 * as the director wrote it -- and every craft field that decides type is set to
 * the requirement's answer. Returns what was removed, so the violation is
 * recorded rather than silently absorbed.
 */
export function enforceTextRequirement(
  judgment: CreativeJudgment,
  req: TextRequirement | undefined,
): { judgment: CreativeJudgment; removed: string[] } {
  if (!req || !judgment) return { judgment, removed: [] };
  const removed: string[] = [];
  const fix = (v: string | undefined): string | undefined => {
    if (typeof v !== "string" || !v) return v;
    const found = unauthorizedText([v], req);
    if (!found.length) return v;
    removed.push(...found);
    return stripUnauthorizedText(v, req);
  };
  const noText = req.mode === "none";

  const copyRoles = noText
    ? []
    : (judgment.copy_roles || []).filter((r) => {
        const ok = req.lines.includes(String(r?.text || "").trim());
        if (!ok && r?.text) removed.push(`copy role for unsupplied text "${r.text}"`);
        return ok;
      });
  if (noText && judgment.copy_roles?.length) removed.push(...judgment.copy_roles.map((r) => `copy role "${r.text}"`));

  const reasoning = judgment.reasoning
    ? {
        ...judgment.reasoning,
        typography: noText
          ? { choice: NO_TEXT_TYPOGRAPHY, reason: "the client supplied no text, so none is drawn" }
          : { ...judgment.reasoning.typography, choice: fix(judgment.reasoning.typography?.choice) || "", reason: fix(judgment.reasoning.typography?.reason) || "" },
        camera: judgment.reasoning.camera && { ...judgment.reasoning.camera, choice: fix(judgment.reasoning.camera.choice) || "" },
        composition: judgment.reasoning.composition && { ...judgment.reasoning.composition, choice: fix(judgment.reasoning.composition.choice) || "" },
        lighting: judgment.reasoning.lighting && { ...judgment.reasoning.lighting, choice: fix(judgment.reasoning.lighting.choice) || "" },
        colour: judgment.reasoning.colour && { ...judgment.reasoning.colour, choice: fix(judgment.reasoning.colour.choice) || "" },
      }
    : judgment.reasoning;

  const strategy = judgment.strategy
    ? {
        ...judgment.strategy,
        candidates: (judgment.strategy.candidates || []).map((c) => ({
          ...c,
          core_idea: fix(c.core_idea) || "",
          visual_language: fix(c.visual_language),
          composition: fix(c.composition),
          lighting: fix(c.lighting),
          typography: noText ? NO_TEXT_TYPOGRAPHY : fix(c.typography),
        })),
      }
    : judgment.strategy;

  const directions = (judgment.directions || []).map((d) => ({
    ...d,
    core_idea: fix(d.core_idea) || "",
    visual_language: fix(d.visual_language) || "",
  }));

  return {
    judgment: { ...judgment, copy_roles: copyRoles, reasoning, strategy, directions },
    removed: [...new Set(removed)],
  };
}

export interface JudgmentFlags {
  exploration: boolean;
  reasoning: boolean;
  antiGeneric: boolean;
  /** V2. Each independent of the others and of the three above. */
  strategy?: boolean;
  consumer?: boolean;
  brand?: boolean;
  semantics?: boolean;
  review?: boolean;
  /** Typography Foundation Cleanup V1. Independent of every flag above. */
  copyRoles?: boolean;
  /**
   * Strategy Selection V1. Replaces the fixed triad rather than joining it:
   * two systems generating directions for one brief is the two-scene defect at
   * the strategy layer.
   */
  strategySelection?: boolean;
  /**
   * Multi-Product Staging V1. Independent of every flag above; resolved by the
   * caller, which is the only place the product count is known.
   */
  multiProductStaging?: boolean;
  /**
   * Format Challenge V1. Requires each candidate to name the failure mode it
   * risks and say how it earns it.
   *
   * Only meaningful alongside `strategySelection`: it is a requirement on a
   * candidate, and without route selection there are no candidates. Gated
   * separately anyway, so the rebalance can be measured on its own — a combined
   * change would attribute a win to whichever half was louder.
   */
  formatChallenge?: boolean;
}

const EXPLORATION_BLOCK = `
PART 1 — EXPLORE BEFORE YOU COMMIT.

Produce three directions that answer this brief in genuinely different ways:

  1. Commercial Safe      — clarity first. The product and the offer read
                            immediately, with nothing between the viewer and the
                            message. Right whenever comprehension matters more
                            than memorability: a promotion, a launch nobody has
                            heard of yet, a category the audience finds confusing.
  2. Premium Brand        — restraint first. Builds standing rather than shifting
                            units. Right when the brand already has attention and
                            needs to be taken seriously with it.
  3. Creative Exploration — distinctiveness first. Takes a real risk to be
                            remembered. Right when the category is crowded and
                            being ignored is the actual danger.

They must differ in WHAT HAPPENS in the frame. Three lighting treatments of one
idea are one direction, not three.

Then choose. Judge them against strategic fit, audience relevance, brand
suitability and originality, and commit to the strongest FOR THIS BRIEF.

All three win regularly, and the safe one wins more often than creative people
like to admit. Originality does not win on its own: a distinctive idea this brand
cannot credibly own is worth less than a plain one it can, and an image nobody
understands has failed whatever else it achieved. Do not pick the boldest
direction as a habit — pick the one this brief earns, and name the strongest
direction you turned down and why.`;

const REASONING_BLOCK = `
PART 2 — DECIDE, AND SAY WHY.

For camera, lighting, composition, typography and colour, give a choice AND the
reason it serves this brief. A parameter with no reason attached is a default
wearing a decision's clothes.

  Not:  camera: low angle
  But:  choice: low angle, close to the surface
        reason: the bottle has to read as something to look up to, and this
                audience distrusts brands that shout

No lens millimetres, f-stops or lighting rigs. State intent; the art-direction
layer owns the numbers.

Where the brief describes what the format is for, decide against THAT, not
against the category. The same product wants different typography on something
read at a glance and something read while deciding whether to buy — and the
right answer for one is often wrong for the other.`;

/**
 * Format Challenge V1 — how the failure modes are meant to be used.
 *
 * The list of failure modes has always been well written: it names outcomes, not
 * components, and a test asserts none of them is an instruction. What it never
 * had was a verb. Measured over twelve renders, the director used it to
 * eliminate — five of eight stated tradeoffs rejected the richer option, in the
 * vocabulary of "dilutes", "distracts", "clutter", "visual noise" — and six of
 * twelve renders then chose a route that explicitly disclaims having an idea.
 *
 * "The setting competes with the object" names a RELATIONSHIP failure. It was
 * heard as a COMPONENT ban: avoid settings. This block is the correction, and it
 * is deliberately short — the instruction that produced the behaviour was an
 * absence, so the repair is a presence, not an argument.
 */
const FORMAT_CHALLENGE_BLOCK = `
HOW TO USE THE FAILURE MODES.

They are tests, not a list of things to avoid. Every one of them is a way this
format fails while still being a competent picture, and the safest route — the
one that touches none of them — is usually the forgettable one.

So a route that risks a failure mode is not disqualified. It owes an answer.

For each candidate, name the failure mode it risks and say how it earns the
risk: what the route does that pays for it. A candidate that risks nothing is
telling you it has no idea, and you should say so in its assessment rather than
rewarding it.

Do not drop an element because it appears in a failure mode. A setting that
competes with the object is a failure; a setting that explains the object is the
answer to it. The difference is what the element DOES, and that is your decision
to make, not the format's.
`;

const STRATEGY_SELECTION_BLOCK = `
PART 1 — CHOOSE THE ROUTE, THEN COMMIT TO IT.

The format above lists the routes that legitimately solve it. They are
alternatives of equal standing; the order they appear in carries no meaning and
is shuffled every time, so the first is not the recommended one.

Develop THREE of them into real directions. Say why those three are the three
worth developing for THIS brief — not why they are interesting in general.

A direction is not finished at what happens in the frame. Say how it is
RENDERED as well: the light, the distance, the surface, the colour. "A bottle on
a table" is a subject; "raking light from behind, the label half in shadow, a
worn wood surface close to the lens" is a photograph. Without that second half
the renderer receives a subject and invents the picture around it.

For each, judge six things. Each judgement is one of supports, neutral or
works_against, a short reason, and EVIDENCE quoted from what you were given: a
phrase from the brief, from the audience, from the objective, or from the
observations of the client's attachments. Quote it; do not paraphrase it.

  product      does what this product actually is support this route
  audience     does it work on the people described
  objective    does it serve what the campaign is for
  brand        can this brand credibly own it
  channel      does it walk into the way this format fails
  feasibility  can it be produced as a still image

Where you were told nothing — no audience, no attached image — say neutral and
put "not supplied" in evidence. An invented reason is worse than an absent one.

Then choose, and name the runner-up and why it lost.

Your selection_reason must be unusable for a different product. If the sentence
you write would read the same for something else in the same format, you have
described the route rather than chosen it.`;

const STAGING_BLOCK = `
THESE PRODUCTS ARE IN ONE PHOTOGRAPH TOGETHER. WHY?

Answer that before anything else. Not "there are three of them" — why THESE, for
THIS audience, in THIS campaign. A set that shares an occasion is not a set that
invites comparison, and neither is a headline product with two behind it.

Name the relationship in your own words. Words like collection, hero and
support, comparison, bundle or a scene from someone's life are examples of the
KIND of answer wanted, not a list to pick from; a phrase of your own that fits
this brief is better than any of them, and repeating one of those five back is a
sign you have described the count rather than the reason.

Then stage it. The relationship decides the staging, and you must be able to say
how.

Everything else in this brief tells the renderer to keep these products APART —
each is a separate identity, do not blend them, do not transfer features. That
is correct and it stays. But nothing yet tells it they share a photograph, and
without that it produces objects cut out and placed side by side on a
background. Say what is physically true of the scene they share:

  hierarchy        which one leads and which support — or why none should, and
                   what then stops the picture reading as a catalogue row
  grouping         what makes them read as one thing rather than three things
  shared_ground    the surface all of them stand on, and how it recedes
  light_direction  ONE key direction for the whole group. Not three.
  depth_order      what is in front of what, and where they overlap. Objects at
                   identical depth, evenly spaced and equally lit, are the
                   failure this exists to prevent.
  interaction      how they touch the ground, each other, or a hand

Do not arrange a layout. Say what must be true of the scene and let the frame
follow from it.`;

const COPY_ROLES_BLOCK = `
DECIDE WHAT EACH STRING IS DOING.

The lines under TEXT THAT MUST APPEAR are the only words that will be drawn. Give
each one a role. The role is a claim about the job that string does in THIS asset
for THIS objective \u2014 not a description of what kind of string it is.

Roles: HEADLINE, SUBHEADLINE, CTA, OFFER, PRODUCT_NAME, SUPPORTING_TEXT.

The same words are not the same role twice. A discount figure is the HEADLINE on
a format whose whole job is the offer, and SUPPORTING_TEXT on one whose job is to
make the product wanted before price is mentioned. The figure did not change; the
asset did. Decide from four things: what this format is for, what the campaign is
trying to achieve, what the words mean, and what the viewer should do next.

Exactly one string is the HEADLINE \u2014 the one a viewer who reads nothing else must
have read. If two of them both seem to deserve it, this asset has no hierarchy
yet and you have not finished deciding.

Copy each string back exactly as it was given. Do not translate it, reword it,
shorten it, or add one that was not there. You are labelling words that already
exist, not writing copy.`;

const ANTI_GENERIC_BLOCK = `
PART 3 — CHECK YOURSELF FOR AUTOPILOT.

Some things appear in this kind of advertising constantly: marble surfaces,
scattered leaves and petals, water droplets, a woman holding the product and
smiling at nothing, golden-hour glow, silk, smoke.

None of them is banned. Several are right for some briefs. The test is whether
YOU chose it.

For each such element in your direction, answer honestly: would this still make
sense specifically for THIS brand and THIS product, or is it here because ads in
this category usually have one? "It looks expensive" is not a reason. If an
element cannot justify itself, replace it with something this brief actually
implies, and say what you changed.`;

const BRAND_BLOCK = `
BRAND INTELLIGENCE — WHAT THIS BRAND IS, NOT WHAT IT SELLS.

A logo, a palette and a product category do not tell you how a brand behaves.
Work out its personality, where it sits against competitors, the emotional
territory it can credibly occupy, and what people currently assume about it.

Industry does not determine style. Two skincare brands can want opposite images:
one built on precision and clinical trust, another on warmth and the sense that
someone made this by hand. Deciding from the category is how a whole industry
ends up with one house style.

Where the client told you little, infer — and say plainly that you inferred it.
Do not invent a heritage, a founder or a history the brief does not support.`;

const CONSUMER_BLOCK = `
CONSUMER PSYCHOLOGY — WHAT HAPPENS IN THE VIEWER'S HEAD.

Before any visual decision: who is actually looking, what should they feel in the
first instant, what would make them trust this, what would make them want it, and
what should they do next.

Then set the reading as three beats: what takes the eye in the first second, what
makes it make sense a moment later, and what turns understanding into action.
These are usually three different things, and an image that does all three with
the same element is doing one of them badly.

Let the campaign objective decide the balance. Something built to be remembered
and something built to be acted on are not the same picture.`;

const SEMANTICS_BLOCK = `
VISUAL SEMANTICS — EVERY ELEMENT MEANS SOMETHING.

Materials, light, colour, space, camera height, expression and movement all
communicate whether or not you intended them to. Choose each one for what it
says, never for how often it appears in this category.

  Weak:   marble, because the brand is expensive.
  Strong: a dense, evenly worked stone surface, because the brand's claim is
          precision and consistency, and that material says "made to a tolerance"
          rather than "cost a lot".

For the elements that carry real weight in your direction, name what each one
communicates and why it is right for THIS brand.`;

const REVIEW_BLOCK = `
CREATIVE REVIEW — THE CONVERSATION BEFORE THE WORK GOES OUT.

Review your own direction as a creative director would review someone else's:

  1. Is it strategically justified, or just attractive?
  2. Would it still work if the logo were removed — or does the logo do the work?
  3. Is it distinguishable from the thousands of generic AI advertisements that
     already exist?
  4. Does it solve a real communication goal?
  5. Would a professional agency put its name on it?

Score originality, brand fit, audience relevance and commercial strength out of
10, and score AI-generic risk out of 10 where 10 means it looks machine-made.

If originality or brand fit is below 6, or generic risk is above 6, REVISE the
direction before answering, and report what you changed. Do not report a weak
score and leave the work as it was — the score exists to trigger the revision,
not to decorate it.`;

/**
 * Holds every strategy verdict to the words it claims to rest on.
 *
 * A verdict whose evidence appears nowhere in what the director was given is not
 * refused outright — a weak reading of one dimension should not discard a whole
 * candidate — but it is downgraded to neutral and marked, so nothing downstream
 * can mistake it for something that was checked. The same rule `VisualDNA` uses
 * on inference, and for the same reason: the only difference between a finding
 * and an invention is whether anything looked.
 *
 * Matching is deliberately forgiving about case and whitespace and deliberately
 * strict about length: a three-word quote matches almost any text and so proves
 * nothing.
 */
class VisualStrategyCheck {
  private static readonly MIN_QUOTE = 8;

  public static verify(strategy: CreativeStrategy, given: string): void {
    const haystack = given.toLowerCase().replace(/\s+/g, " ");
    let downgraded = 0;
    for (const candidate of strategy.candidates || []) {
      const a = candidate?.assessment as Record<string, StrategyVerdict> | undefined;
      if (!a) continue;
      for (const key of Object.keys(a)) {
        const v = a[key];
        if (!v || v.stance === "neutral") continue;
        const quote = String(v.evidence || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (/^not supplied$/.test(quote)) continue;
        if (quote.length >= this.MIN_QUOTE && haystack.includes(quote)) continue;
        a[key] = {
          stance: "neutral",
          because: v.because,
          evidence: `unverified: ${v.evidence || "(none)"}`,
        };
        downgraded++;
      }
    }
    if (downgraded) {
      console.warn("[EXPERIMENT][STRATEGY] verdicts downgraded for unquotable evidence", {
        downgraded,
        candidates: strategy.candidates?.length ?? 0,
      });
    }
  }
}

/**
 * How long one judgement call may take, and whether a failure is worth repeating.
 *
 * The timeout was 180,000ms written into the call, with one unconditional retry
 * after it — a worst case of six minutes for a feature whose entire generation
 * is meant to finish in two. It was never a considered number; it was headroom
 * chosen when nothing was measured.
 *
 * 60,000 is the default because a real judgement returns in well under it, and
 * because a call that has not answered in a minute is not going to answer in
 * three. `LLM_DIRECTOR_TIMEOUT_MS` moves it without a deploy.
 */
const DIRECTOR_TIMEOUT_MS = (() => {
  const raw = Number(process.env.LLM_DIRECTOR_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 60000;
})();

/**
 * Whether trying the same request again could plausibly succeed.
 *
 * The retry exists for a measured reason: run back to back, the gateway produced
 * no usable judgment on 2 of 7 briefs because it returned something unparseable
 * or timed out under load. Those are worth repeating.
 *
 * A refused connection, an expired key and an exhausted quota are not. Repeating
 * them buys nothing and costs the full timeout a second time, which is how a
 * dead gateway turns a two-minute render into a nine-minute one while producing
 * exactly the same fallback it would have produced immediately.
 */
function worthRetrying(err: unknown): boolean {
  const m = String((err as any)?.message || err).toLowerCase();
  if (/fetch failed|econnrefused|enotfound|eai_again|socket hang up|network/.test(m)) return false;
  if (/(401|402|403|429)|unauthoriz|forbidden|quota|rate.?limit|insufficient|billing/.test(m)) {
    return false;
  }
  return true;
}

export class CreativeDirectorV1 {
  private llm: LLMProviderService;

  constructor(provider?: LLMProviderService) {
    this.llm = provider || defaultLLMProviderService;
  }

  public async judge(
    brief: DirectorBriefInput,
    flags: JudgmentFlags
  ): Promise<CreativeJudgment | null> {
    const anyFlag =
      flags.exploration || flags.reasoning || flags.antiGeneric ||
      flags.strategy || flags.consumer || flags.brand || flags.semantics || flags.review ||
      flags.copyRoles || flags.strategySelection || flags.multiProductStaging;
    if (!anyFlag) return null;

    const parts: string[] = [];
    const shape: string[] = [];

    // Order matters: the model reads these in sequence, and who the brand is and
    // who is looking have to be settled before directions are invented for them.
    if (flags.brand) {
      parts.push(BRAND_BLOCK);
      shape.push(`  "brand": {
    "personality": "<how it behaves, in a sentence>",
    "positioning": "<where it sits against competitors>",
    "emotional_territory": "<what it can credibly make people feel>",
    "audience_perception": "<what people currently assume about it>",
    "inferred": "<what of the above you inferred rather than were told>"
  }`);
    }

    if (flags.consumer) {
      parts.push(CONSUMER_BLOCK);
      shape.push(`  "consumer": {
    "viewer": "<who is actually looking, beyond a demographic bracket>",
    "first_feeling": "<what they should feel in the first instant>",
    "trust_driver": "<what makes this credible to them>",
    "desire_driver": "<what makes them want it>",
    "intended_action": "<what they should do next>",
    "attention": {
      "first_second": "<what takes the eye>",
      "then": "<what makes it make sense>",
      "finally": "<what turns understanding into action>"
    }
  }`);
    }

    // Strategy selection replaces exploration rather than joining it. Two
    // systems inventing directions for one brief is the two-scene defect a phase
    // of this project was spent removing, moved up a layer.
    if (flags.strategySelection && brief.routes?.length) {
      parts.push(STRATEGY_SELECTION_BLOCK);
      const depth = flags.strategy
        ? `, "emotional_objective": "<what the viewer should feel>", "audience_reaction": "<how they should react>"`
        : "";
      if (flags.formatChallenge) parts.push(FORMAT_CHALLENGE_BLOCK);
      const verdict = (k: string) =>
        `"${k}": { "stance": "supports|neutral|works_against", "because": "<short>", "evidence": "<quoted from the brief, or 'not supplied'>" }`;
      // Format Challenge V1. Two fields, asked of every candidate rather than
      // only the winner: a requirement that applies after the choice is made is
      // a rationalisation, and rationalising the safe pick is the behaviour this
      // phase exists to change.
      const challenge = flags.formatChallenge
        ? `, "risks": "<the failure mode from HOW THIS FORMAT FAILS that this route risks, copied exactly>", "earns_it": "<how this route answers that failure's challenge — what it does that pays for the risk>"`
        : "";
      shape.push(`  "strategy": {
    "candidates": [
      { "route": "<one of the routes offered, copied exactly>", "core_idea": "<what happens in the frame>", "visual_language": "<how it is rendered: light, distance, surface, colour — concretely>", "composition": "<how the frame is arranged: subject placement, framing, where the eye goes>", "typography": "<how the type is treated and where it sits against the image>", "lighting": "<how light behaves on the product and the scene>", "why_this_route": "<what in THIS brief makes it right>"${depth}${challenge},
        "assessment": { ${["product", "audience", "objective", "brand", "channel", "feasibility"].map(verdict).join(", ")} } }
    ],
    "selected": "<the route you chose, copied exactly>",
    "selection_reason": "<why it beat the others, naming this product, this audience or this objective>",
    "runner_up": "<the route you turned down last>",
    "why_not_runner_up": "<what it could not do here>"
  }`);
    } else if (flags.exploration) {
      parts.push(EXPLORATION_BLOCK);
      // The strategy flag adds two fields to every direction. They are declared
      // here rather than only described in the prose above, because the model
      // returns the shape it is given: asking for `emotional_objective` in the
      // instructions while omitting it from the contract produced it on zero
      // directions out of three.
      const extra = flags.strategy
        ? `, "emotional_objective": "<what the viewer should feel>", "audience_reaction": "<how they should react>"`
        : "";
      const extraShort = flags.strategy ? `, "emotional_objective": "...", "audience_reaction": "..."` : "";
      shape.push(`  "directions": [
    { "name": "Commercial Safe", "core_idea": "<what happens in the frame>", "visual_language": "<how it is rendered, concretely>", "why_it_fits": "<what in the brief makes this right>"${extra} },
    { "name": "Premium Brand", "core_idea": "...", "visual_language": "...", "why_it_fits": "..."${extraShort} },
    { "name": "Creative Exploration", "core_idea": "...", "visual_language": "...", "why_it_fits": "..."${extraShort} }
  ],
  "selected": "<the name of the direction you chose>",
  "selection_reason": "<why it beat the others, in one or two sentences>",
  "rejected_reason": "<the strongest direction you turned down and why>"`);
    }

    if (flags.strategy) {
      // Deepens exploration rather than repeating it: the directions gain what
      // the viewer should FEEL and DO, and the selection is judged on six named
      // criteria instead of a general impression. Without the exploration flag
      // there is nothing to deepen, so this says so rather than inventing a
      // second set of directions.
      parts.push(
        flags.exploration
          ? `
STRATEGY DEPTH.

For each direction also state the emotional objective and the reaction you expect
from the audience. They must differ in STORYTELLING, VISUAL CONCEPT, EMOTIONAL
APPROACH and COMMUNICATION STRATEGY — not merely in colour, background or light.
Three treatments of one idea are one direction.

Judge the selection explicitly against business objective, audience relevance,
brand suitability, originality, commercial effectiveness and production
feasibility. A direction that cannot be produced is not a direction.`
          : `
STRATEGY DEPTH.

Judge your thinking against business objective, audience relevance, brand
suitability, originality, commercial effectiveness and production feasibility.`
      );
    }

    if (flags.reasoning) {
      parts.push(REASONING_BLOCK);
      shape.push(`  "reasoning": {
    "camera":      { "choice": "...", "reason": "..." },
    "lighting":    { "choice": "...", "reason": "..." },
    "composition": { "choice": "...", "reason": "..." },
    "typography":  { "choice": "...", "reason": "..." },
    "colour":      { "choice": "...", "reason": "..." }
  }`);
    }

    if (flags.semantics) {
      parts.push(SEMANTICS_BLOCK);
      shape.push(`  "semantics": [
    { "element": "<a material, colour, light quality, space or gesture that carries weight here>", "communicates": "<what it says to a viewer>", "why_this_brand": "<why that meaning is right for THIS brand>" }
  ]`);
    }

    // Asked only when there is a group to reason about. One product has no
    // relationship, and a director asked for one anyway will invent one.
    if (flags.multiProductStaging && (brief.productCount ?? 0) >= 2) {
      parts.push(STAGING_BLOCK);
      shape.push(`  "staging": {
    "relationship": {
      "relationship_type": "<your own phrase for why these belong in one frame>",
      "strategic_reason": "<why THESE products, for THIS audience, in THIS campaign>",
      "visual_implication": "<what that relationship means the picture must show>",
      "hierarchy_implication": "<what it means for which one leads, if any>"
    },
    "hierarchy": "<which leads, which support, or why none does>",
    "grouping": "<what makes them read as one thing>",
    "shared_ground": "<the surface they share and how it recedes>",
    "light_direction": "<one key direction for the whole group>",
    "depth_order": "<what is in front of what, and where they overlap>",
    "interaction": "<how they touch the ground, each other, or a hand>",
    "reason": "<why this staging for this relationship and this brief>"
  }`);
    }

    // Roles are only asked for words that exist. With no text, asking the
    // director to assign HEADLINE / CTA roles invites it to supply the words.
    if (flags.copyRoles && brief.textRequirement?.mode !== "none") {
      parts.push(COPY_ROLES_BLOCK);
      // Declared in the contract, not only in the prose. Measured earlier in
      // this system: a field asked for in instructions and omitted from the
      // shape came back on zero responses out of three.
      shape.push(`  "copy_roles": [
    { "text": "<one line, copied back exactly as given>", "role": "HEADLINE|SUBHEADLINE|CTA|OFFER|PRODUCT_NAME|SUPPORTING_TEXT", "reason": "<what this string does for this asset and this objective>" }
  ]`);
    }

    if (flags.antiGeneric) {
      parts.push(ANTI_GENERIC_BLOCK);
      shape.push(`  "generic_check": {
    "flagged": ["<category-default elements present in your direction, or empty>"],
    "justification": "<why each earns its place for THIS brand, or what you replaced it with>",
    "revised": <true if you changed the direction as a result, false if it survived scrutiny>
  }`);
    }

    if (flags.review) {
      parts.push(REVIEW_BLOCK);
      shape.push(`  "review": {
    "strategically_justified": "<answer question 1>",
    "survives_logo_removal": "<answer question 2>",
    "differentiated_from_generic_ai": "<answer question 3>",
    "solves_communication_goal": "<answer question 4>",
    "agency_would_approve": "<answer question 5>",
    "scores": { "originality": 0, "brand_fit": 0, "audience_relevance": 0, "commercial_strength": 0, "ai_generic_risk": 0 },
    "refined": <true if you revised the direction before answering>,
    "what_changed": "<what you revised, or an empty string>"
  }`);
    }

    const system = `You are a commercial creative director deciding what an advertising image should be.

You are NOT writing an image prompt. A separate layer does that. You are making
the decisions that layer will execute, and recording why you made them.
${parts.join("\n")}

Avoid premium, luxury, cinematic, beautiful and stunning. They are verdicts on a
finished picture, not things a camera can point at, and every brand claims them.
Name what would make a viewer reach that verdict instead.

Return ONLY a JSON object of this shape, and nothing else:
{
${shape.join(",\n")}
}`;

    const briefLines = [
      `CONCEPT: ${brief.concept}`,
      brief.textRequirement
        ? textRequirementBrief(brief.textRequirement)
        : brief.contentMessage
          ? `TEXT THAT MUST APPEAR: ${brief.contentMessage}`
          : "",
      brief.brandName ? `BRAND: ${brief.brandName}` : "",
      brief.industry ? `INDUSTRY: ${brief.industry}` : "",
      brief.objective ? `CAMPAIGN OBJECTIVE: ${brief.objective}` : "",
      brief.audience ? `AUDIENCE: ${brief.audience}` : "",
      // The context replaces the bare label when it is available: printing both
      // would state the format twice and say nothing extra the second time.
      brief.assetContext ? brief.assetContext : brief.useCase ? `FORMAT: ${brief.useCase}` : "",
      brief.aspectRatio ? `ASPECT RATIO: ${brief.aspectRatio}` : "",
      brief.visualDNA ? `
${brief.visualDNA}` : "",
      brief.productTruth ? `
${brief.productTruth}` : "",
      brief.creativeBrief ? `
${brief.creativeBrief}` : "",
      (brief.productCount ?? 0) >= 2
        ? `PRODUCTS ATTACHED: ${brief.productCount} distinct products in one image`
        : "",
      brief.routes?.length
        ? [
            "",
            "ROUTES OFFERED FOR THIS FORMAT, in the order presented:",
            ...brief.routes.map((r) => `  - ${r}`),
          ].join("\n")
        : "",
      brief.brandKit ? `
${brief.brandKit}` : "",
      brief.routeEvidence ? `
${brief.routeEvidence}` : "",
      // Last on purpose: memory informs, the brief decides.
      brief.memoryContext ? `
${brief.memoryContext}` : "",
    ].filter(Boolean);

    const started = Date.now();
    const user = briefLines.join("\n");

    // One retry, because the measured failure rate is too high to ignore.
    //
    // Run in isolation the call succeeded 3 times out of 3. Run back to back
    // across a benchmark it produced no usable judgment on 2 of 7 briefs — the
    // gateway intermittently returns something unparseable or times out under
    // consecutive load. Falling silently back to stable on nearly a third of
    // renders would make the experiment look inert rather than broken, and inert
    // is the harder failure to notice.
    //
    // One retry, not a loop: if a second attempt also fails, a stable render is
    // a better outcome than one the user waited three more minutes for.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { judgment, retryable } = await this.attempt(system, user, started, attempt);
      if (judgment) return judgment;
      if (!retryable) {
        console.warn("[EXPERIMENT][CREATIVE_JUDGMENT_V1] not retrying", {
          attempt,
          elapsed_ms: Date.now() - started,
          reason: "a second identical request cannot change this outcome",
        });
        return null;
      }
    }
    return null;
  }

  private async attempt(
    system: string,
    user: string,
    started: number,
    attempt: number
  ): Promise<{ judgment: CreativeJudgment | null; retryable: boolean }> {
    try {
      const raw = await this.llm.generateChatCompletion(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        "creative_judgment_v1",
        // Warmer than the strategy call: this one is asked for alternatives, and
        // three directions produced at low temperature tend to be one direction
        // described three ways.
        //
        // max_tokens is 4000 because 2200 was truncating the answer. Every
        // observed failure returned ~4,500 characters of valid JSON with no
        // closing brace — three directions, five reasoned decisions and a
        // generic check, written partly in Vietnamese, which tokenises far less
        // efficiently than English. The parser was blamed first; it was the
        // budget.
        { temperature: 0.85, max_tokens: 8000, timeoutMs: DIRECTOR_TIMEOUT_MS }
      );

      const judgment = this.parse(raw);
      if (judgment?.strategy) {
        VisualStrategyCheck.verify(judgment.strategy, `${system}
${user}`);
      }
      if (!judgment) {
        console.warn("[EXPERIMENT][CREATIVE_JUDGMENT_V1] unparseable response", {
          attempt,
          chars: raw?.length ?? 0,
        });
        // Measured: the gateway does this intermittently under consecutive load,
        // and a second ask usually lands. This one is worth repeating.
        return { judgment: null, retryable: true };
      }

      console.log("[EXPERIMENT][CREATIVE_JUDGMENT_V1]", {
        duration_ms: Date.now() - started,
        attempt,
        directions: judgment.directions.length,
        selected: judgment.selected,
        has_reasoning: Boolean(judgment.reasoning),
        generic_flagged: judgment.generic_check?.flagged?.length ?? 0,
        generic_revised: judgment.generic_check?.revised ?? null,
        staging_relationship: judgment.staging?.relationship?.relationship_type ?? null,
        strategy_selected: judgment.strategy?.selected ?? null,
        strategy_candidates: judgment.strategy?.candidates?.length ?? 0,
        strategy_offered: judgment.strategy?.routes_offered?.length ?? 0,
        has_brand: Boolean(judgment.brand),
        has_consumer: Boolean(judgment.consumer),
        semantics: judgment.semantics?.length ?? 0,
        review_scores: judgment.review?.scores ?? null,
        review_refined: judgment.review?.refined ?? null,
      });
      return { judgment, retryable: false };
    } catch (err: any) {
      // The render continues on the stable prompt. An experiment that can fail a
      // generation is a worse trade than an experiment that sometimes does
      // nothing.
      const retryable = worthRetrying(err);
      console.warn("[EXPERIMENT][CREATIVE_JUDGMENT_V1] attempt failed", {
        attempt,
        elapsed_ms: Date.now() - started,
        timeout_ms: DIRECTOR_TIMEOUT_MS,
        retryable,
        error: err?.message || String(err),
      });
      return { judgment: null, retryable };
    }
  }

  /** Tolerant of fenced JSON, which this gateway emits intermittently. */
  private parse(raw: string): CreativeJudgment | null {
    const attempt = (text: string): CreativeJudgment | null => {
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") return null;
        const directions = Array.isArray(parsed.directions)
          ? parsed.directions.filter((d: any) => d && typeof d.name === "string")
          : [];
        // A judgment with neither a direction nor reasoning has nothing to add to
        // the prompt, and appending an empty section would be noise.
        if (
          !directions.length &&
          !parsed.reasoning &&
          !parsed.generic_check &&
          !parsed.brand &&
          !parsed.consumer &&
          !parsed.semantics &&
          !parsed.review &&
          !parsed.strategy &&
          !parsed.staging
        ) {
          return null;
        }
        return { ...parsed, directions } as CreativeJudgment;
      } catch {
        return null;
      }
    };
    return (
      attempt(raw.trim()) ||
      attempt(raw.replace(/```json/gi, "").replace(/```/g, "").trim()) ||
      attempt(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1))
    );
  }
}
