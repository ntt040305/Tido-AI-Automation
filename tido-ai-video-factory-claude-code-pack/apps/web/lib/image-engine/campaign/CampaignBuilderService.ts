import { MarketingBrainService } from "../llm/marketing-brain.service";
import { MarketingBrainStrategy } from "../llm/prompt-strategy.schema";
import { CreativeInterpretation } from "../service/CreativeInterpretationService";
import {
  ALL_CAMPAIGN_ASSET_TYPES,
  CampaignAssetType,
  CampaignBriefInput,
  CampaignConcept,
  VisualDNA,
} from "./campaign.types";

/**
 * Campaign Builder.
 *
 * Sits ABOVE the image pipeline. It turns a client brief into one campaign
 * concept — a name, a big idea, a core message, a set of visual rules and an
 * asset plan — which every asset in the campaign is then generated against.
 *
 * It adds no new reasoning of its own. The thinking already exists:
 * MarketingBrainService produces the consumer insight, emotional response,
 * creative message and visual translation, and CreativeInterpretationService has
 * already read the client's own words. This layer's whole job is to assemble
 * those into a campaign-shaped object and fill any gaps deterministically, so a
 * missing LLM degrades the output rather than breaking the workflow.
 */
export class CampaignBuilderService {
  private marketingBrain: MarketingBrainService;

  constructor(marketingBrain?: MarketingBrainService) {
    this.marketingBrain = marketingBrain || new MarketingBrainService();
  }

  /**
   * Builds the campaign concept. One LLM call at most — the same marketing-brain
   * call the single-image pipeline already makes, reused for the whole campaign
   * instead of repeated per asset.
   */
  public async build(
    brief: CampaignBriefInput,
    context?: { interpretation?: CreativeInterpretation; strategy?: MarketingBrainStrategy }
  ): Promise<{ campaign: CampaignConcept; strategy: MarketingBrainStrategy }> {
    const strategy =
      context?.strategy ||
      (await this.marketingBrain.generateStrategy({
        concept: this.conceptLine(brief),
        useCase: "campaign",
        brandName: brief.brand,
        brandInfo: brief.brandInfo,
        productName: brief.product,
        targetAudience: brief.audience,
        marketingGoal: brief.objective,
        copyItems: (brief.copyItems || []).map((c) => (typeof c === "string" ? c : c.text)),
      }));

    const derived: string[] = [];
    const vt = strategy.visual_translation;
    const interpretation = context?.interpretation;
    const li = interpretation?.locked_intent;

    // Visual DNA prefers, in order: the strategy's visual translation, then what
    // the client actually said, then a neutral statement. It never invents a
    // photographic recipe — that is the art director's job, one layer down.
    const dna: VisualDNA = {
      mood: this.pick(
        [vt?.atmosphere, li?.mood?.join(", "), brief.tone, strategy.emotional_response],
        "Confident and uncluttered",
        "mood",
        derived
      ),
      colour_logic: this.pick(
        [vt?.colour_direction],
        "Restrained palette led by the product's own colours; no colour introduced that the product does not already contain.",
        "colour_logic",
        derived
      ),
      lighting_logic: this.pick(
        [vt?.lighting_character, li?.lighting_requirements?.join("; ")],
        "Light that describes form and material honestly, without hiding surface detail in glare or shadow.",
        "lighting_logic",
        derived
      ),
      composition_logic: this.pick(
        [vt?.composition_principle, li?.composition_requirements?.join("; ")],
        "One clear subject, deliberate emptiness around it, nothing competing for the same attention.",
        "composition_logic",
        derived
      ),
      typography_logic: this.typographyLogic(brief),
      product_presentation: this.pick(
        [vt?.subject_representation, li?.subject?.join(", ")],
        `${brief.product} presented as the hero, unmodified and clearly identifiable.`,
        "product_presentation",
        derived
      ),
    };

    // The offline fallback strategy deliberately asserts almost nothing, and its
    // placeholder angle ("… built directly from the client concept") must never
    // become the campaign's idea or its name. Only reasoning that actually
    // happened — signalled by a consumer insight — is allowed to name the work.
    const strategyIsReasoned = Boolean(strategy.consumer_insight?.trim());
    const ideaCandidates = strategyIsReasoned
      ? [strategy.creative_message, strategy.creative_angle]
      : [];

    const bigIdea = this.pick(
      ideaCandidates,
      this.deterministicBigIdea(brief),
      "big_idea",
      derived
    );

    const campaign: CampaignConcept = {
      campaign_id: brief.campaignId || `camp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      campaign_name: this.campaignName(brief, bigIdea, strategyIsReasoned),
      big_idea: bigIdea,
      core_message: this.pick(
        strategyIsReasoned ? [strategy.creative_angle, strategy.creative_message] : [],
        bigIdea,
        "core_message",
        derived
      ),
      consumer_insight: strategy.consumer_insight,
      emotional_response: strategy.emotional_response,
      visual_dna: dna,
      asset_plan: this.resolveAssetPlan(brief),
      provenance: {
        strategy_source: strategy.consumer_insight ? "MARKETING_BRAIN" : "DETERMINISTIC_FALLBACK",
        interpretation_source: interpretation?.interpretation_source,
        derived_fields: derived,
      },
    };

    console.log("[CAMPAIGN_BUILDER]", {
      campaign_name: campaign.campaign_name,
      big_idea: campaign.big_idea,
      asset_plan: campaign.asset_plan,
      strategy_source: campaign.provenance.strategy_source,
      deterministically_filled: derived,
    });

    return { campaign, strategy };
  }

  /**
   * Renders the campaign DNA as the block every asset prompt carries. This is
   * what keeps five different formats recognisably one campaign.
   */
  public static renderDnaBlock(campaign: CampaignConcept): string {
    const d = campaign.visual_dna;
    return [
      `CAMPAIGN: ${campaign.campaign_name}`,
      `BIG IDEA: ${campaign.big_idea}`,
      `CORE MESSAGE: ${campaign.core_message}`,
      "CAMPAIGN VISUAL DNA — every asset in this campaign shares these rules. They are what make a poster, a banner and a social ad read as one piece of work rather than three unrelated pictures. Adapt the format, never the DNA:",
      `- Mood: ${d.mood}`,
      `- Colour logic: ${d.colour_logic}`,
      `- Lighting logic: ${d.lighting_logic}`,
      `- Composition logic: ${d.composition_logic}`,
      `- Typography logic: ${d.typography_logic}`,
      `- Product presentation: ${d.product_presentation}`,
    ].join("\n");
  }

  /** First non-empty candidate; records when the fallback had to be used. */
  private pick(candidates: (string | undefined)[], fallback: string, field: string, derived: string[]): string {
    for (const c of candidates) {
      const v = (c || "").trim();
      if (v) return v;
    }
    derived.push(field);
    return fallback;
  }

  /**
   * Typography rules follow from whether the client authorised copy, not from
   * taste. With no authorised strings the correct instruction is to leave room,
   * because the model is a poor typesetter and a worse proofreader.
   */
  private typographyLogic(brief: CampaignBriefInput): string {
    const hasCopy = (brief.copyItems || []).length > 0;
    return hasCopy
      ? "Only client-authorised strings appear, set in one consistent hierarchy across every asset: message first, offer second, action third. Reproduce them character-for-character including accents."
      : "No text is rendered into pixels in this pass. Every asset reserves the same clear, tonally even area for typography to be composited afterwards, in the same relative position across the set.";
  }

  /**
   * The big idea when no reasoning layer was available.
   *
   * Built from what the client actually wrote — never from a template sentence
   * about the campaign being built. A deterministic idea should read like a short
   * brief line, because that is exactly what it is.
   */
  private deterministicBigIdea(brief: CampaignBriefInput): string {
    const concept = (brief.concept || "").trim();
    if (concept) {
      const firstClause = concept.split(/[.!?\n]/)[0].trim();
      if (firstClause.length >= 12) return firstClause;
    }
    return brief.audience
      ? `${brief.product} for ${brief.audience}.`
      : `${brief.product} by ${brief.brand}.`;
  }

  /**
   * A short, human campaign name. Deterministic: the same brief produces the same
   * name, which matters because the name becomes the delivery folder.
   *
   * The product is preferred over the idea whenever the idea is long, non-Latin,
   * or simply less recognisable than the product itself — a folder called
   * "Centella — Hydrating serum" is more use to an account manager than one named
   * after a sentence fragment.
   */
  private campaignName(brief: CampaignBriefInput, bigIdea: string, strategyIsReasoned: boolean): string {
    if (!strategyIsReasoned) {
      return `${brief.brand} — ${brief.product}`.replace(/\s+/g, " ").trim();
    }

    const idea = bigIdea
      .replace(/["'"'']/g, "")
      .split(/[.—–:;!?]/)[0]
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(" ");
    const label = idea.length >= 8 && idea.length <= 60 ? idea : brief.product;
    return `${brief.brand} — ${label}`.replace(/\s+/g, " ").trim();
  }

  private resolveAssetPlan(brief: CampaignBriefInput): CampaignAssetType[] {
    const requested = brief.assetTypes && brief.assetTypes.length > 0 ? brief.assetTypes : ALL_CAMPAIGN_ASSET_TYPES;
    // De-duplicate while holding the canonical production order, so a delivery
    // package always lists assets in the same sequence.
    return ALL_CAMPAIGN_ASSET_TYPES.filter((t) => requested.includes(t));
  }

  private conceptLine(brief: CampaignBriefInput): string {
    if (brief.concept && brief.concept.trim()) return brief.concept.trim();
    // Only real fields are joined; nothing is invented to pad the line out.
    return [brief.product, brief.tone, brief.channel ? `for ${brief.channel}` : ""]
      .map((s) => (s || "").trim())
      .filter(Boolean)
      .join(", ");
  }
}
