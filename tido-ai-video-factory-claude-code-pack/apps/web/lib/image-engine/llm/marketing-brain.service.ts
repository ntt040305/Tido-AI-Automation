import { defaultLLMProviderService, LLMChatMessage, LLMProviderService } from "./llm-provider.service";
import { MarketingBrainInput, MarketingBrainStrategy } from "./prompt-strategy.schema";

/**
 * How each asset type is encountered, and what that makes worth reasoning about.
 *
 * Deliberately not layouts. The format is a set of viewing conditions, and
 * viewing conditions change what an image has to accomplish — they do not
 * decide where the headline goes. Every entry therefore ends by naming several
 * executions that all suit the format, so the brain treats this as context to
 * reason from rather than an answer to copy.
 *
 * Only the entry for the requested format is sent, so this costs one block per
 * render rather than five.
 */
const ASSET_REASONING_CONTEXT: Record<string, string> = {
  poster:
    "Met whole and at a glance, then approached if it earned that. One impression lands before a word is read, so the relationship between image and message IS the design. Worth reasoning about: what the picture says before the words are read, how much attention this campaign has actually earned, and what a viewer carries away from a single look. A poster can be a product hero, a told story, one emotional image, or purely conceptual — all four are right for some campaign.",
  banner:
    "Met peripherally, inside someone else's page, by a person doing something else. It competes with the content they came for and gets a fraction of a second of unwilling attention. Worth reasoning about: how fast the message resolves, what the viewer is scanning past it toward, and what would make stopping worth their while. Branding, promotional, storytelling and straight product banners are all legitimate.",
  social_ad:
    "Met mid-scroll, on a phone at arm's length, between two things the viewer would rather look at. It must earn a stop before it can say anything, and being recognised as advertising ends the stop. Worth reasoning about: what genuinely interrupts a scroll for this audience, what survives being seen small, and what the viewer can do in the next second. Many different images stop a scroll — choose the one this campaign supports.",
  product_hero:
    "The product is the subject rather than a participant, and the viewer is being invited to want it. Worth reasoning about: what makes this specific object desirable in the hand — material, weight, surface, how light behaves on it — and what a photograph can show that a description cannot. Do not assume an isolated studio pack shot: a hero can sit in a world, be in use, or be seen at macro scale, as long as the object stays the subject.",
  ugc_thumbnail:
    "Met small, in a grid, against real people's real photographs, and judged in well under a second. Polish that reads as advertising loses to something that reads as genuine. Worth reasoning about: what makes someone curious rather than informed, what human reaction is legible at this size, and what the viewer thinks they will get by clicking. Many storytelling approaches work here.",
};

/** Maps the UI's asset ids and their aliases onto the contexts above. */
function assetContextFor(useCase?: string): { key: string; context: string } | null {
  const raw = String(useCase || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const alias: Record<string, string> = {
    poster: "poster",
    billboard: "poster",
    print: "poster",
    banner: "banner",
    website_banner: "banner",
    web_banner: "banner",
    social_ad: "social_ad",
    social: "social_ad",
    product_hero: "product_hero",
    hero: "product_hero",
    ugc_thumbnail: "ugc_thumbnail",
    thumbnail_ugc: "ugc_thumbnail",
    thumbnail: "ugc_thumbnail",
    ugc: "ugc_thumbnail",
  };
  const key = alias[raw];
  return key ? { key, context: ASSET_REASONING_CONTEXT[key] } : null;
}

export class MarketingBrainService {

  private llmProvider: LLMProviderService;

  constructor(provider?: LLMProviderService) {
    this.llmProvider = provider || defaultLLMProviderService;
  }

  public async generateStrategy(input: MarketingBrainInput): Promise<MarketingBrainStrategy> {
    const startTime = Date.now();

    const systemPrompt = `You are a Senior Commercial Creative Director. You do NOT write image prompts. You decide what a campaign should say and what that means visually, and you reason in this order:

  BUSINESS GOAL → CONSUMER INSIGHT → EMOTIONAL RESPONSE → CREATIVE MESSAGE → VISUAL TRANSLATION

Answer WHY THIS VISUAL NEEDS TO EXIST before you answer what it looks like. An
image that cannot say what would be lost if it were never made is decoration.

The step most people skip is the insight. Restating the product category is not an insight.

  Weak:   "Luxury anti-aging skincare" → "a luxury woman holding a serum bottle"
  Strong: women buying anti-aging products are buying confidence and continuity with
          who they already are, not a younger face → feeling: trust, poise,
          self-possession → message: this is care, not correction → SCENE: a woman
          in her fifties at her own bathroom mirror in morning light, mid-routine,
          unhurried, looking at herself rather than at the camera → visually: her
          face treated with dignity, soft directional light that keeps skin
          texture honest, refined material rendering, uncluttered composition.

Translate the message into a SCENE, then into visual decisions.

A scene is what is happening: people, place, action, moment. "A welcoming
atmosphere" is not a scene. "Two friends stepping in from the street, first
coffees just set down, the door still open behind them" is a scene. An image
model renders what you name; name qualities and it renders a well-lit object.

Advertising images usually contain people doing something. Decide whether this
one does. If it does not, say why not — a pack shot with no one in it is a
legitimate choice, an advertisement that forgot to include anyone is not.

State camera INTENT — why the camera sits where it does, and what that makes the
viewer feel. Do not name lenses, focal lengths, apertures or lighting rigs: a
separate art-direction layer turns your intent into those numbers, and a
technical instruction from you would compete with the client's own directives.

Avoid premium, luxury, cinematic, beautiful, stunning, high-end and their
synonyms. They are verdicts on a finished picture, not things a camera can point
at, and every brand claims them, so they carry no information and render as
generic gloss. Name what would make a viewer reach that verdict instead: the
weight of the glass, the way the light falls off, the unhurriedness of the
gesture. If a word cannot be photographed, it does not belong in the visual
fields — the exception is the client's own language, which you may keep when
they used it.

CONSIDER SEVERAL DIRECTIONS BEFORE YOU COMMIT TO ONE.

Work out at least three genuinely different ways this brief could be answered —
for instance the safe commercial reading, the one that builds the brand's
standing, and the one that takes a real risk to be remembered. They must differ
in WHAT HAPPENS in the frame, not in lighting or palette; three versions of one
idea are one idea.

Then judge them against each other on strategic fit, audience relevance, brand
suitability and originality, and commit to the strongest. Originality does not
win on its own: a distinctive idea the brand cannot credibly own is worse than a
plain one it can.

Do this in your reasoning. Report only the route you took and the strongest
option you turned down, in one sentence. Nobody downstream needs the pitch.

BEFORE YOU ANSWER, CHECK YOUR OWN WORK.

Ask, honestly: is this memorable, or is it merely competent? Could a competitor
run the same image with their logo on it? Does it actually solve the
communication goal, or does it just look like an advertisement for this
category? Would a creative director sign this off, or ask what the idea is?

If the answer to any of those is uncomfortable, go back and choose again. This
matters more than polishing the words in the fields below.

EVERY CHOICE MUST BE INTENTIONAL, NOT AUTOMATIC.

Nothing here is banned — marble, silk, water droplets, golden hour, a single
bloom on an empty surface are all legitimate, and some briefs genuinely call for
them. The test is not whether an element is common; it is whether YOU chose it.
Before you keep a detail, ask what it is doing for this campaign and what would
be lost without it. If the honest answer is "it looks expensive" or "this kind
of ad usually has one", it is a shortcut, and a shortcut is what makes an image
look machine-made. Decoration that carries no meaning is the most reliable
symptom.

WHAT THE IMAGE IS FOR CHANGES WHAT IT SHOULD BE.

Images do different commercial jobs — building awareness, establishing a brand,
explaining something, driving an action, provoking a response — and the job
changes the picture. Something made to be remembered and something made to be
acted on are not the same image, and a composition that serves one usually
undercuts the other. Decide which job this one has from the brief, and let that
decision show in the scene rather than only in the words.

A BRAND IS A BEHAVIOUR, NOT A LOGO.

Work out how this brand behaves before deciding how its image looks: where it
sits against its competitors, how it would speak if it were a person, and what
people currently assume about it that it may want to confirm or correct. A
challenger and an incumbent in one category want opposite images — one has to be
noticed, the other has to be trusted — and treating them alike is how a category
ends up with one house style. Use what the client actually told you; where they
told you little, say what you inferred rather than inventing a heritage.

INDUSTRIES DIFFER IN WHAT THEY HAVE TO EARN, NOT IN HOW THEY LOOK.

A category has to overcome something specific before it can persuade: some must
earn trust before desire, some must earn desire before trust, some must first be
understood at all, and some are fighting indifference rather than doubt. Work out
what this category has to earn with THIS audience — it is a judgement about the
brief, not a lookup. Two brands in one industry often have opposite problems, and
an industry has no house style; treating one as if it did is how every skincare
ad ends up looking like every other skincare ad.

THE ASSET TYPE IS A REASONING CONTEXT, NOT A TEMPLATE.

The format tells you how the image will be met: at what distance, among what
else, with how much of the viewer's attention, and what they can do next. That
changes what the image has to accomplish, and so it changes the scene. It does
not hand you a layout.

Before deciding anything visual, answer this: what is this asset type FOR, in
THIS campaign? A poster for a coffee opening and a poster for a serum launch are
one format doing two unrelated jobs. Several genuinely different executions are
right for any format — a poster can be a product hero, a story, a single
emotional image or a conceptual one. Choose the execution this campaign earns
and say what the format contributed to that choice. Never choose it because the
format usually looks a certain way.

WRITE SHORT. Every field below is at most two sentences — scene_moment may run
to three when the moment genuinely needs them. Where a field states a character
limit, that limit is the contract and not a suggestion: "one sentence" was read
as three hundred characters, which is why the limits are now numeric. These are directions, not essays:
the prompt has a hard character budget, and every extra sentence here is paid for
by deleting a professional-knowledge rule somewhere else in the same prompt.

STRICT JSON OUTPUT REQUIREMENT:
Return ONLY a valid JSON object matching this structure:
{
  "creative_angle": "<one sentence: the commercial positioning angle>",
  "consumer_insight": "<the non-obvious truth about what this buyer actually wants. Never restate the product category.>",
  "emotional_response": "<two or three words: what the viewer should feel>",
  "creative_message": "<one sentence: the single thing this image says>",
  "communication_objective": "<AT MOST 180 CHARACTERS. What this image has to achieve commercially — be remembered, be understood, be acted on, be felt — and what that rules out. Decide it from the brief; do not pick a label.>",
  "creative_route": "<AT MOST 140 CHARACTERS. The route you chose and the strongest one you rejected, e.g. 'took the quiet-ritual route over the clinical-proof route, which the brand cannot own yet'.>",
  "brand_personality": "<AT MOST 140 CHARACTERS. How this brand behaves — positioning, personality, current perception. Say what you inferred where the client did not tell you.>",
  "attention_shift": "<exactly one of: cta, headline, product, none. Which element this campaign needs weighted ABOVE what the format would normally give it. Answer 'none' unless the objective genuinely demands otherwise \u2014 most images do not.>",
  "attention_sequence": "<AT MOST 140 CHARACTERS. What the viewer notices first, understands second, and feels or does third.>",
  "asset_reasoning": "<AT MOST TWO SENTENCES. What this asset type is FOR in this specific campaign, and what that means the image must do. Do NOT describe a layout and do NOT recite what the format usually looks like.>",
  "visual_translation": {
    "scene_moment": "<what is HAPPENING in the frame: place, action, the specific moment. A situation with a verb, not an adjective. This is the most important field you produce.>",
    "human_presence": "<who is in frame and what they are doing; or state plainly that no person appears and why that serves this image>",
    "typography_intent": "<how any words should BEHAVE — spoken or set, loud or quiet, part of the picture or laid over it — and why that suits this brand. No sizes, weights or positions. If no words appear, say what the image carries instead.>",
    "camera_intent": "<why the camera sits where it does and what that makes the viewer feel, e.g. 'low, so the product reads as something to look up to'. No lenses or focal lengths.>",
    "subject_representation": "<who or what is depicted, and why that choice serves the insight>",
    "atmosphere": "<the emotional temperature of the frame>",
    "lighting_character": "<quality and behaviour of light in plain words, e.g. 'soft directional light that keeps skin texture honest'>",
    "material_treatment": "<how surfaces and materials should read>",
    "composition_principle": "<the organising idea of the layout, not coordinates>",
    "colour_direction": "<palette direction and what it signals>"
  },
  "commercial_goal": "<commercial objective and conversion hook>",
  "target_customer_psychology": "<buyer profile, psychological hooks, value triggers>",
  "composition_strategy": "<hero placement and visual hierarchy in one sentence>",
  "prompt_guidance": "<the visual translation condensed to one or two sentences>",
  "compression_notes": "<short note for budget optimisation>"
}`;

    // Build context with Product Manifest, Identity Control Metadata, and Creative Brief
    let productContext = "";
    if (input.productManifest) {
      const pm = input.productManifest;
      productContext += `\n[PRODUCT MANIFEST]\n- Target Count: ${pm.validation.target_count_requested} (Detected: ${pm.validation.detected_product_count})\n- Relationship Type: ${pm.relationship_type}\n- Identity Locks:\n  * ${pm.compact_identity_locks.join("\n  * ")}`;
    }

    if (input.identityControlMetadata) {
      productContext += `\n[IDENTITY CONTROL METADATA]\n- Directive: ${input.identityControlMetadata.compact_directive}\n- Confidence: ${input.identityControlMetadata.identity_confidence_score}`;
    }

    // Unspecified fields are omitted, not defaulted. Feeding the brain a generic
    // audience and goal it was never given produced generic strategy that read as
    // if the client had asked for it.
    // The format is no longer a bare label. It used to arrive as this one line
    // and nothing else in the instruction mentioned it, so the brain had a name
    // for the format and no reason to treat it as anything.
    const assetCtx = assetContextFor(input.useCase);
    const briefLines = [
      `- CONCEPT: ${input.concept}`,
      `- FORMAT / USE CASE: ${input.useCase || "Poster"}`,
      assetCtx ? `- HOW THIS FORMAT IS ENCOUNTERED: ${assetCtx.context}` : "",
      `- ASPECT RATIO: ${input.aspectRatio || "1:1"}`,
      input.brandName ? `- BRAND NAME: ${input.brandName}` : "",
      input.brandInfo ? `- BRAND INFO: ${input.brandInfo}` : "",
      input.productName ? `- PRODUCT: ${input.productName}` : "",
      input.targetAudience ? `- TARGET AUDIENCE: ${input.targetAudience}` : "",
      input.marketingGoal ? `- MARKETING GOAL: ${input.marketingGoal}` : "",
      `- COMPOSITION MODE: ${input.productCompositionMode || "single"}`,
      `- IDENTITY STRENGTH: ${input.productIdentityStrength || "strict"}`,
      input.copyItems && input.copyItems.length > 0
        ? `- AUTHORIZED COPY ITEMS: ${JSON.stringify(input.copyItems)}`
        : "",
    ].filter(Boolean);

    const userPrompt = `
CREATIVE BRIEF:
${briefLines.join("\n")}
${productContext}

The brief may be written in Vietnamese, English, or a mix; read it in its original
language and answer in English. Where the brief is silent about audience or
objective, infer them from the concept and the product rather than assuming a
generic premium shopper. Never contradict an explicit instruction in the concept.

Generate the complete structured JSON commercial strategy now.`;

    const messages: LLMChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    try {
      // The strategy schema is a full creative bridge — insight, emotional
      // response, message and a six-field visual translation. That is a long
      // structured JSON answer, and the provider's 15s default was aborting it on
      // every call, silently dropping the campaign back to the offline fallback.
      // Budget the call for the answer it actually asks for.
      const responseText = await this.llmProvider.generateChatCompletion(messages, "marketing_brain", {
        temperature: 0.6,
        max_tokens: 1800,
        timeoutMs: 60000,
      });
      
      let parsed: MarketingBrainStrategy;
      try {
        parsed = JSON.parse(responseText) as MarketingBrainStrategy;
      } catch (jsonErr) {
        // Strip markdown code fences if LLM wrapped json in ```json ... ```
        const cleaned = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned) as MarketingBrainStrategy;
      }

      if (parsed.creative_angle && (parsed.visual_strategy || parsed.prompt_guidance || parsed.visual_translation)) {
        // A model that returns the bridge but skips visual_strategy is still a good
        // answer; synthesise the legacy summary field from the translation so older
        // consumers keep working.
        if (!parsed.visual_strategy && parsed.visual_translation) {
          const vt = parsed.visual_translation;
          parsed.visual_strategy = [vt.atmosphere, vt.lighting_character, vt.material_treatment]
            .filter(Boolean)
            .join(" ");
        }
        if (!parsed.composition_strategy && parsed.visual_translation?.composition_principle) {
          parsed.composition_strategy = parsed.visual_translation.composition_principle;
        }

        // Populate backward compatibility fields for legacy prompt compiler consumers
        parsed.target_audience = parsed.target_customer_psychology || input.targetAudience;
        parsed.visual_direction = parsed.visual_strategy;
        parsed.composition = parsed.composition_strategy;
        parsed.master_prompt = parsed.prompt_guidance || parsed.visual_strategy;
        // camera_direction and lighting are deliberately NOT set here.
        //
        // They used to be assigned two fixed strings — "85mm prime lens, eye-level
        // product hero angle" and "3-point commercial studio lighting" — on every
        // response, regardless of what the model actually reasoned. Those constants
        // now feed ArtDirectionResolverService as tier-3 candidates, where they
        // would outrank retrieved professional knowledge with a value nobody chose.
        // The strategy's real photographic thinking lives in visual_strategy.
        parsed.negative_prompt = "distorted anatomy, blurry, low resolution, bad quality, clutter, fake text";

        console.log("[MARKETING_BRAIN]", {
          model: this.llmProvider.getModelName(),
          duration_ms: Date.now() - startTime,
          angle: parsed.creative_angle,
          insight: parsed.consumer_insight,
          emotion: parsed.emotional_response,
          message: parsed.creative_message,
          has_visual_translation: Boolean(parsed.visual_translation),
        });
        return parsed;
      }
      throw new Error("Invalid schema structure in LLM JSON response.");
    } catch (err: any) {
      console.warn(`[MarketingBrainService] LLM call failed (${err.message || err.code}). Using fallback strategy.`);
      return this.createFallbackStrategy(input);
    }
  }

  /**
   * Used only when the LLM is unreachable. It deliberately asserts as little as
   * possible: an offline fallback must not invent a camera rig, a lighting setup
   * or an audience, because downstream those become tier-3 art direction that
   * outranks real retrieved knowledge. Staying quiet lets the lower tiers speak.
   */
  public createFallbackStrategy(input: MarketingBrainInput): MarketingBrainStrategy {
    const concept = (input.concept || "").trim();
    const format = input.useCase || "Poster";
    const creativeAngle = input.brandName
      ? `${input.brandName} ${format.toLowerCase()} built directly from the client concept`
      : `${format} built directly from the client concept`;

    return {
      creative_angle: creativeAngle,
      visual_strategy: "",
      commercial_goal: input.marketingGoal || "",
      target_customer_psychology: input.targetAudience || "",
      composition_strategy: "",
      prompt_guidance: concept,
      compression_notes: "Offline fallback: strategy reasoning unavailable, concept passed through unchanged.",
      // Backward compatibility fields
      target_audience: input.targetAudience || "",
      visual_direction: "",
      composition: "",
      negative_prompt: "distorted, blurry, low resolution, bad anatomy, text overlap, ugly, watermarks, bad quality",
      master_prompt: concept,
    };
  }
}

export const defaultMarketingBrainService = new MarketingBrainService();
