import { LLMProviderService } from "../llm/llm-provider.service";
import { BenchmarkCase } from "./creative-benchmark.types";

/**
 * CIOS Phase 3.1.7 — the baseline the benchmark compares against.
 *
 * Benchmarks V1 and V2 compared CIOS against `CreativeKnowledgeService`, which
 * produces a direction and no concept at all. CIOS won every concept dimension
 * against a literal zero, the report flagged that as a BLOCKING finding on every
 * run, and the headline "100% win rate" was worth nothing.
 *
 * This provider replaces that. It is a *standard AI creative workflow*: brief in,
 * one round of generic creative reasoning, art direction and prompt out. No
 * retrieval, no knowledge corpus, no decision routing, no slot arbitration. That
 * is exactly the architecture most AI creative tools ship, and it is the thing
 * CIOS has to beat to justify its own complexity.
 *
 * What it must not touch
 * ----------------------
 * `CreativeDecisionEngine`, `ReasoningKnowledge*`, `CreativeDirection`, and any
 * CIOS routing. Enforced by a test that reads this file's imports, not by
 * intention — a baseline that quietly borrowed the system under test would make
 * every number here meaningless.
 *
 * Two backends, and the difference matters
 * ----------------------------------------
 * `llm` is the defensible baseline: a real model doing the work a real product
 * does. `template` is a deterministic stand-in that runs with no network.
 *
 * The template backend has an unavoidable problem, stated here rather than in a
 * footnote: it was written by the same author as the system it is measured
 * against. I can make it lose. So it is built to be as strong as I can honestly
 * make it — it fills every art direction field, uses real category conventions,
 * and states concrete numbers wherever a competent generic tool would. Where its
 * numbers still favour CIOS, the structural dimensions (does an instruction name
 * a measurable quantity) are meaningful and the taste dimensions (originality,
 * differentiation) are not, because I authored both sides of those. The `llm`
 * backend is what removes that caveat.
 */

export type LegacyBackend = "llm" | "template";

export interface LegacyCreativeOutput {
  concept: {
    big_idea: string;
    core_message: string;
    consumer_insight: string;
    differentiation: string;
  };
  direction: {
    camera: string;
    lighting: string;
    composition: string;
    colour: string;
    atmosphere: string;
    typography: string;
    material: string;
  };
  /** Which backend produced this, carried onto every result for the record. */
  backend: LegacyBackend;
  /** Set when the llm backend was asked for and could not run. */
  degraded_reason?: string;
}

/**
 * Category conventions a competent generalist would already know.
 *
 * This is the honest ceiling of a system with no knowledge layer: real craft
 * vocabulary, correctly applied by category, but the same answer every time for
 * a given category — because there is nothing to retrieve that would make it
 * situational. That sameness is the architectural difference under test, so the
 * entries below are deliberately good rather than deliberately weak.
 */
type CategoryConvention = LegacyCreativeOutput["direction"] & { insight: string; idea: string };

const CATEGORY_CONVENTIONS: Record<string, CategoryConvention> = {
  beauty: {
    camera: "Shoot the product at eye level on an 85mm lens with a shallow depth of field, product filling roughly half the frame.",
    lighting: "Soft diffused key from a large source at 45 degrees with a white bounce opposite to lift the shadow side.",
    composition: "Centre the product with generous negative space above and below, leaving the lower third clear for copy.",
    colour: "A restrained palette of soft neutrals with one accent drawn from the packaging, low overall saturation.",
    atmosphere: "Clean, clinical and calm, with a sense of quiet luxury and precision.",
    typography: "A refined serif for the product name with a clean sans for claims, generous letter spacing on the headline.",
    material: "Render glass and liquid with true specular highlights and visible surface clarity, no plastic sheen.",
    insight: "She is sceptical of brightening claims and wants evidence she can see for herself.",
    idea: "Visible results, presented with restraint",
  },
  food_beverage: {
    camera: "Shoot at a 45 degree angle on a 50mm lens, close enough that texture reads, with the hero item sharp front to back.",
    lighting: "Backlight the subject with a soft source to bring out translucency, filling the front with a low bounce.",
    composition: "Place the hero item slightly off centre on a rule-of-thirds intersection, with supporting elements falling away behind.",
    colour: "Warm, appetising tones with a deliberate contrast between the food and a cooler background surface.",
    atmosphere: "Fresh, generous and inviting, with a sense of the moment just before it is eaten.",
    typography: "A warm humanist sans throughout, heavier weight on the name, prices in a clear tabular figure style.",
    material: "Keep surface texture honest — visible grain, condensation and steam where the product genuinely has them.",
    insight: "They are choosing where to spend a small daily treat and want to feel it was worth it.",
    idea: "The everyday moment, made worth looking forward to",
  },
  fashion: {
    camera: "Shoot full length on an 85mm lens at subject eye level, with enough distance that the garment silhouette reads cleanly.",
    lighting: "One large soft source at 30 degrees with controlled falloff, keeping fabric texture legible in the shadows.",
    composition: "Place the figure off centre with generous headroom, the garment occupying the central third of the frame.",
    colour: "A muted, desaturated palette that lets the garment colour lead, with a neutral background.",
    atmosphere: "Understated and contemporary, confident without performance.",
    typography: "A minimal grotesque in a light weight, small and set at the frame margin, well away from the subject.",
    material: "Render fabric weave and drape faithfully, with matte surfaces and no artificial sheen.",
    insight: "She buys pieces she expects to keep, and reads over-styling as a lack of confidence in the garment.",
    idea: "Clothes that speak for themselves",
  },
  hospitality: {
    camera: "Shoot at standing eye level on a 35mm lens to give a sense of the room, with the foreground sharp and depth falling away.",
    lighting: "Warm practical light sources within the frame, supplemented by soft ambient fill to keep shadow detail.",
    composition: "Lead the eye through the space along a diagonal, with the focal area in the upper right third.",
    colour: "Warm, natural tones with green and wood accents, avoiding cool or clinical hues.",
    atmosphere: "Calm, welcoming and unhurried, with a sense of arrival.",
    typography: "A warm serif for the venue name with a clean sans for practical detail, prices right aligned.",
    material: "Render natural materials — timber, linen, stone — with true texture and no gloss.",
    insight: "They are choosing a place to feel looked after, not a list of amenities.",
    idea: "A place that feels like it was waiting for you",
  },
  technology: {
    camera: "Shoot the interface or device straight on at 50mm with the screen sharp corner to corner and no perspective distortion.",
    lighting: "Even, low contrast lighting with no visible hotspots, keeping the screen legible and the surface neutral.",
    composition: "Anchor the product on a strict grid with the interface occupying the central half of the frame.",
    colour: "A neutral palette with a single brand accent used sparingly on the call to action.",
    atmosphere: "Precise, current and unhyped, with nothing decorative competing for attention.",
    typography: "A neutral grotesque throughout with weight carrying hierarchy, and a monospace face for any code or data.",
    material: "Render device surfaces and screen glass accurately, with no exaggerated reflections.",
    insight: "They distrust marketing language and want to see the thing actually working.",
    idea: "It does the one thing, properly",
  },
  real_estate: {
    camera: "Shoot interiors at chest height on a 24mm lens kept level, so vertical lines stay vertical and the space is not exaggerated.",
    lighting: "Balance interior lighting with the window exposure so both the room and the view outside hold detail.",
    composition: "Compose square to the room with a clear leading line into the space and the focal area centred.",
    colour: "Natural daylight white balance with warm interior accents, avoiding heavy grading.",
    atmosphere: "Bright, honest and lived-in rather than staged.",
    typography: "A clear grotesque with specifications in a fixed label and value grid, figures right aligned in tabular style.",
    material: "Render floor, wall and worktop surfaces as they actually are, with true texture and no gloss enhancement.",
    insight: "They have seen renders that flattered and want to know what they are actually buying.",
    idea: "What you will actually live in",
  },
};

const FALLBACK = CATEGORY_CONVENTIONS.technology;

/**
 * The single prompt a generic AI creative tool would send.
 *
 * One call does concept and art direction together, from the brief alone. That
 * is the workflow, not a simplification of it: the absence of a retrieval step
 * and a decision step is precisely what distinguishes this baseline from CIOS.
 */
function buildPrompt(c: BenchmarkCase): string {
  const b = c.brief;
  return [
    "You are a senior creative director. Produce a campaign concept and art direction from this brief.",
    "",
    `Brand: ${b.brand}`,
    `Product: ${b.product}`,
    `Audience: ${b.audience}`,
    `Objective: ${b.objective}`,
    `Channel: ${b.channel}`,
    `Tone: ${b.tone}`,
    `Industry: ${b.industry}`,
    b.concept ? `Creative direction: ${b.concept}` : "",
    b.brandInfo ? `Brand context: ${b.brandInfo}` : "",
    "",
    "Return ONLY valid JSON with exactly this shape, no prose around it:",
    "{",
    '  "big_idea": "one sentence",',
    '  "core_message": "one sentence",',
    '  "consumer_insight": "one sentence naming a real tension this audience has",',
    '  "differentiation": "one sentence on what makes this ownable",',
    '  "camera": "a specific, executable camera instruction",',
    '  "lighting": "a specific, executable lighting instruction",',
    '  "composition": "a specific, executable composition instruction",',
    '  "colour": "a specific colour direction",',
    '  "atmosphere": "the overall mood in one sentence",',
    '  "typography": "a specific typographic instruction",',
    '  "material": "how surfaces and materials should render"',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

export class LegacyCreativeProvider {
  private readonly backend: LegacyBackend;
  private readonly llm: LLMProviderService;

  constructor(options: { backend?: LegacyBackend; llm?: LLMProviderService } = {}) {
    this.backend = options.backend || "template";
    this.llm = options.llm || new LLMProviderService();
  }

  public getBackend(): LegacyBackend {
    return this.backend;
  }

  public async generate(c: BenchmarkCase): Promise<LegacyCreativeOutput> {
    if (this.backend === "llm") {
      try {
        return await this.viaLLM(c);
      } catch (err: any) {
        // Degrade rather than fail the run, but say so on the output itself. A
        // benchmark that silently substituted a weaker baseline when the network
        // blinked would report a CIOS win it did not earn.
        return {
          ...this.viaTemplate(c),
          degraded_reason: `llm backend failed (${String(err?.message || err).slice(0, 120)}); template used instead`,
        };
      }
    }
    return this.viaTemplate(c);
  }

  private async viaLLM(c: BenchmarkCase): Promise<LegacyCreativeOutput> {
    // One call, one round trip, brief to finished direction. Explicit timeout and
    // token ceiling because the campaign pipeline learned the hard way that a
    // default 15s timeout silently turns a working feature into a dead one.
    const text = await this.llm.generateChatCompletion(
      [{ role: "user", content: buildPrompt(c) }],
      "benchmark_legacy_baseline",
      { temperature: 0.7, max_tokens: 1200, timeoutMs: 60000 }
    );
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON object in model response");
    const j = JSON.parse(match[0]) as Record<string, string>;
    const s = (k: string) => String(j[k] || "").trim();

    return {
      concept: {
        big_idea: s("big_idea"),
        core_message: s("core_message"),
        consumer_insight: s("consumer_insight"),
        differentiation: s("differentiation"),
      },
      direction: {
        camera: s("camera"),
        lighting: s("lighting"),
        composition: s("composition"),
        colour: s("colour"),
        atmosphere: s("atmosphere"),
        typography: s("typography"),
        material: s("material"),
      },
      backend: "llm",
    };
  }

  /**
   * Deterministic generic workflow.
   *
   * Composes a concept from the brief's own terms and art direction from category
   * convention. Every field is filled, because a real generic tool fills every
   * field — leaving one empty here would manufacture a CIOS win on coverage that
   * the architecture did not earn.
   */
  private viaTemplate(c: BenchmarkCase): LegacyCreativeOutput {
    const b = c.brief;
    const conv = CATEGORY_CONVENTIONS[c.industry] || FALLBACK;
    const audience = (b.audience || "the audience").replace(/\.$/, "");
    const tone = (b.tone || "").split(",")[0].trim().toLowerCase();

    return {
      concept: {
        // Built from the brief's own words, which is what a workflow with no
        // knowledge layer has available to it.
        big_idea: b.concept ? b.concept : `${conv.idea} for ${b.brand}`,
        core_message: `${b.product} for ${audience}${tone ? `, ${tone}` : ""}.`,
        consumer_insight: conv.insight,
        differentiation: `${b.brand} is the ${tone || "considered"} choice in ${String(b.industry || "the category").toLowerCase()}.`,
      },
      // Fields listed explicitly rather than spread: the convention record also
      // carries `insight` and `idea`, and spreading would put both onto a
      // direction object that has no business holding them.
      direction: {
        camera: conv.camera,
        lighting: conv.lighting,
        composition: conv.composition,
        colour: conv.colour,
        atmosphere: conv.atmosphere,
        typography: conv.typography,
        material: conv.material,
      },
      backend: "template",
    };
  }
}
