import { defaultLLMProviderService, LLMProviderService } from "../../llm/llm-provider.service";

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
  concept: string;
  contentMessage?: string;
  brandName?: string;
  useCase?: string;
  aspectRatio?: string;
  industry?: string;
  objective?: string;
  audience?: string;
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
      flags.copyRoles;
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

    if (flags.exploration) {
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

    if (flags.copyRoles) {
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
      brief.contentMessage ? `TEXT THAT MUST APPEAR: ${brief.contentMessage}` : "",
      brief.brandName ? `BRAND: ${brief.brandName}` : "",
      brief.industry ? `INDUSTRY: ${brief.industry}` : "",
      brief.objective ? `CAMPAIGN OBJECTIVE: ${brief.objective}` : "",
      brief.audience ? `AUDIENCE: ${brief.audience}` : "",
      // The context replaces the bare label when it is available: printing both
      // would state the format twice and say nothing extra the second time.
      brief.assetContext ? brief.assetContext : brief.useCase ? `FORMAT: ${brief.useCase}` : "",
      brief.aspectRatio ? `ASPECT RATIO: ${brief.aspectRatio}` : "",
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
      const result = await this.attempt(system, user, started, attempt);
      if (result) return result;
    }
    return null;
  }

  private async attempt(
    system: string,
    user: string,
    started: number,
    attempt: number
  ): Promise<CreativeJudgment | null> {
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
        { temperature: 0.85, max_tokens: 8000, timeoutMs: 180000 }
      );

      const judgment = this.parse(raw);
      if (!judgment) {
        console.warn("[EXPERIMENT][CREATIVE_JUDGMENT_V1] unparseable response", {
          attempt,
          chars: raw?.length ?? 0,
        });
        return null;
      }

      console.log("[EXPERIMENT][CREATIVE_JUDGMENT_V1]", {
        duration_ms: Date.now() - started,
        attempt,
        directions: judgment.directions.length,
        selected: judgment.selected,
        has_reasoning: Boolean(judgment.reasoning),
        generic_flagged: judgment.generic_check?.flagged?.length ?? 0,
        generic_revised: judgment.generic_check?.revised ?? null,
        has_brand: Boolean(judgment.brand),
        has_consumer: Boolean(judgment.consumer),
        semantics: judgment.semantics?.length ?? 0,
        review_scores: judgment.review?.scores ?? null,
        review_refined: judgment.review?.refined ?? null,
      });
      return judgment;
    } catch (err: any) {
      // The render continues on the stable prompt. An experiment that can fail a
      // generation is a worse trade than an experiment that sometimes does
      // nothing.
      console.warn("[EXPERIMENT][CREATIVE_JUDGMENT_V1] attempt failed", {
        attempt,
        error: err?.message || String(err),
      });
      return null;
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
          !parsed.review
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
