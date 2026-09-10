import { ReasoningRetrievalQuery } from "./reasoning-knowledge.types";

/**
 * Turns a client brief into the retrieval axes Layer 2 selects on.
 *
 * This closes the gap the audit identified: the brief already carries industry,
 * audience, objective and channel, but they were read by the LLM and then thrown
 * away before retrieval ran, so every campaign retrieved identical knowledge.
 * Governance §12 makes these axes the basis of retrieval — keyword matching alone
 * is explicitly insufficient.
 *
 * Deliberately deterministic. Normalising a brief field to a controlled token is
 * a mapping problem, not a reasoning problem, and a rules-based mapping is free,
 * instant and testable. An LLM-assisted pass can be layered on later for briefs
 * that use wording no rule covers; the seam is `overrides`.
 *
 * Reads nothing from and writes nothing to the image generation pipeline.
 */

export interface BriefContextInput {
  brand?: string;
  product?: string;
  industry?: string;
  audience?: string;
  objective?: string;
  channel?: string;
  tone?: string;
  concept?: string;
  brandInfo?: string;
  assetType?: string;
}

/**
 * Vietnamese and English surface forms both appear in real briefs.
 *
 * Two rules about this table, both learned from it being wrong.
 *
 * Anchor every alternative. `/car/` was unanchored, so it matched "primary
 * *car*e clinic", "elder *car*e service", "*car*eer guidance" — every one of the
 * hundred-brief benchmark's ten healthcare briefs was sent to retrieval as
 * automotive, which hard-excluded all ten healthcare objects in the corpus and
 * left the chain composing from whatever survived. That is where the benchmark's
 * healthcare score and a large share of its WRONG_SUBJECT attacks came from.
 *
 * Order longest-match first. `healthcare` has to be tested before `care`, and
 * `care` before `car`, because the first rule that matches wins.
 *
 * Note what is deliberately *absent*: there is no `local_business` rule. The axis
 * is a hard exclusion, so naming an industry the corpus has no objects for
 * retrieves nothing at all, which is strictly worse than retrieving broadly. The
 * rule belongs here the day local_business knowledge exists, and not before. *
 * One more trap: `\b` is ASCII-only, so a trailing `\b` after a Vietnamese vowel
 * can never match — `/\bphở\b/` matches nothing at all. The Vietnamese
 * alternatives therefore sit outside the bounded group.
 */
const INDUSTRY_RULES: [RegExp, string][] = [
  [/\b(?:skincare|serum|ampoule|cosmetics?|beauty)\b|mỹ phẩm|dưỡng da/i, "beauty"],
  [/\b(?:fashion|apparel|clothing|garment)\b|thời trang|quần áo/i, "fashion"],
  [/\b(?:coffee|food|beverage|restaurant|drink)\b|phở|cà phê|đồ ăn|thức uống|nhà hàng/i, "food_beverage"],
  // Before technology: a "patient app" is a healthcare brief.
  [/\b(?:healthcare|health care|clinic|clinical|patients?|medical|medication|doctors?|dental|dentist|surgery|treatment|therapy|diagnosis|elder care)\b|y tế|phòng khám|bệnh nhân|bác sĩ|nha khoa/i, "healthcare"],
  [/\b(?:education|school|tutoring|tuition|curriculum|students?|classroom|learning centre|learning center)\b|giáo dục|trường học|học sinh/i, "education"],
  // `tech` is a prefix on purpose — technology, technical, fintech. Anchoring it
  // as a whole word silently dropped nine of the benchmark's ten technology
  // briefs, which is the same class of mistake in the opposite direction.
  [/\b(?:tech\w*|electronics?|software|apps?|platforms?|devices?|gadgets?|dashboards?|analytics|automation|workflows?|integrations?)\b|công nghệ|thiết bị/i, "technology"],
  [/\b(?:cars?|automotive|vehicles?|dealership)\b|ô tô|xe hơi/i, "automotive"],
  [/\b(?:hotel|resort|travel|hospitality)\b|khách sạn|du lịch/i, "hospitality"],
  [/\b(?:property|real estate|apartment|townhouse)\b|bất động sản|căn hộ/i, "real_estate"],
];

const AUDIENCE_RULES: [RegExp, string][] = [
  [/gen[\s-]?z|18\s*-\s*2[0-4]|thế hệ z/i, "gen_z"],
  [/(wom[ae]n|nữ|phụ nữ)[^0-9]{0,20}(3[5-9]|4\d|50)/i, "women_35_50"],
  [/(wom[ae]n|nữ|phụ nữ)[^0-9]{0,20}(2[5-9]|3[0-4])/i, "women_25_35"],
  [/premium|luxury|affluent|high[\s-]?value|cao cấp|thượng lưu/i, "premium_consumers"],
  [/mass|everyday|general|phổ thông|đại chúng/i, "mass_market_consumers"],
];

const OBJECTIVE_RULES: [RegExp, string][] = [
  [/launch|ra mắt|khai trương|giới thiệu/i, "product_launch"],
  [/awareness|nhận diện|nhận biết|phủ sóng/i, "awareness"],
  [/convert|conversion|sale|discount|promo|bán hàng|khuyến mãi|giảm giá/i, "conversion"],
  [/retention|loyalty|giữ chân|trung thành/i, "retention"],
  [/rebrand|reposition|tái định vị/i, "rebranding"],
  [/seasonal|tet|holiday|mùa|lễ/i, "seasonal"],
];

const CHANNEL_RULES: [RegExp, string][] = [
  [/instagram|ig\b/i, "instagram"],
  [/tiktok/i, "tiktok"],
  [/facebook|fb\b|meta/i, "facebook"],
  [/website|web|landing/i, "website"],
  [/billboard|ooh|outdoor|biển quảng cáo/i, "billboard"],
  [/print|magazine|brochure|in ấn|tạp chí/i, "print"],
];

/**
 * Product category, as a controlled token.
 *
 * Passing raw product text through this axis looks harmless and is not: knowledge
 * declaring `category: skincare` was excluded from a skincare brief because the
 * query carried "Tone Brightening Capsule Ampoule". An axis is only useful if both
 * sides speak the same vocabulary, so an unrecognised product resolves to
 * undefined and simply stops constraining the match.
 */
const CATEGORY_RULES: [RegExp, string][] = [
  [/serum|ampoule|essence|moisturi[sz]er|cleanser|toner|skincare|dưỡng da|tinh chất/i, "skincare"],
  [/lipstick|foundation|mascara|makeup|son môi|trang điểm/i, "makeup"],
  [/perfume|fragrance|nước hoa/i, "fragrance"],
  [/coffee|espresso|latte|cà phê/i, "coffee"],
  [/tea|trà/i, "tea"],
  [/beer|wine|spirit|bia|rượu/i, "alcohol"],
  [/scarf|dress|shirt|jacket|apparel|clothing|khăn|áo|quần/i, "apparel"],
  [/bag|handbag|shoe|sneaker|túi|giày/i, "accessories"],
  [/phone|laptop|headphone|earbud|speaker|tai nghe|điện thoại/i, "consumer_electronics"],
  [/apartment|condo|townhouse|villa|căn hộ|nhà phố/i, "residential_property"],
];

/**
 * Brand position, widened in Phase 3.1.6.
 *
 * The V1 benchmark left this axis unresolved on 25 of 30 briefs, because the
 * original six patterns only matched briefs that used the word "premium" or
 * "luxury" outright. Real briefs state position through what they are proud of:
 * a price, a restraint, a maker count, an audience. The additions below read
 * those. Order matters — luxury before premium, since a luxury brief usually
 * says both.
 */
const BRAND_POSITION_RULES: [RegExp, string][] = [
  [/luxury|xa xỉ|sang trọng|ultra high net worth|penthouse/i, "luxury"],
  [/premium|high[\s-]?end|cao cấp|affluent|investment|refined|restrained|severe|considered|chef[- ]owned|atelier|hand[- ]finished|private/i, "premium"],
  [/budget|cheap|affordable|giá rẻ|bình dân|value|discount|price[- ]accessible|marketplace/i, "budget"],
  [/innovat|disrupt|startup|đột phá|sáng tạo|bootstrapped|developer tool|technical/i, "innovative"],
  [/heritage|traditional|classic|truyền thống|lâu đời|artisan|craft|family|provenance|maker/i, "traditional"],
  [/mass|everyday|phổ thông|practical|honest|plain|unpretentious|straightforward|no[- ]nonsense/i, "mass"],
];

/**
 * Asset type, as a controlled token.
 *
 * Unresolved on 30 of 30 briefs in the V1 benchmark for a duller reason than the
 * others: the campaign brief carries `assetTypes`, and the caller was never
 * passing it. The rules here handle the case where it arrives as free text.
 */
const ASSET_TYPE_RULES: [RegExp, string][] = [
  [/poster/i, "poster"],
  [/banner/i, "banner"],
  [/social[\s_-]?ad|social/i, "social_ad"],
  [/product[\s_-]?hero|hero/i, "product_hero"],
  [/thumbnail|thumb/i, "thumbnail"],
  [/menu/i, "menu"],
  [/packaging|pack\b/i, "packaging"],
];

/**
 * Creative stage, inferred from what the brief is asking for.
 *
 * NOT applied to a campaign query by default, and that is a deliberate reversal.
 *
 * `creative_stage` is a hard exclusion in the retriever, not a preference. A
 * campaign brief spans the whole job — strategy, concept, visual direction and
 * design — so pinning it to the single stage its wording most resembles excludes
 * every object belonging to the other four. Measured on the skincare fixture the
 * moment this was wired in: retrieval fell from 12 objects to 1, and the lighting
 * and layout decisions the campaign needed disappeared.
 *
 * So the capability exists and is testable through `inferCreativeStage`, and a
 * caller working within one stage can pass it through `overrides`. What it does
 * not do is narrow a whole-campaign query on a guess. An axis that is unresolved
 * costs breadth; an axis that is wrongly resolved costs the right knowledge.
 */
const CREATIVE_STAGE_RULES: [RegExp, string][] = [
  [/reposition|rebrand|market entry|positioning|tái định vị/i, "strategy"],
  [/awareness|launch|campaign idea|big idea|ra mắt/i, "concept"],
  [/mood|look and feel|visual direction|art direction/i, "visual_direction"],
  [/poster|banner|menu|layout|thumbnail|listing|packaging|signage/i, "design"],
  [/print|production|artwork|pre[- ]?press|in ấn/i, "production"],
];

function firstMatch(rules: [RegExp, string][], haystack: string): string | undefined {
  for (const [pattern, value] of rules) if (pattern.test(haystack)) return value;
  return undefined;
}

export class CreativeContextExtractor {
  /**
   * Builds a retrieval query from a brief.
   *
   * Unresolved axes are left undefined rather than guessed. An undefined axis
   * does not constrain retrieval; a wrongly guessed one silently selects the
   * wrong knowledge, which is worse than selecting broadly.
   */
  public static extract(
    brief: BriefContextInput,
    overrides: Partial<ReasoningRetrievalQuery> = {}
  ): ReasoningRetrievalQuery {
    // Free-text fields are searched together: a brief often states its
    // positioning inside the tone or the creative direction, not a labelled field.
    const blob = [
      brief.industry,
      brief.product,
      brief.audience,
      brief.objective,
      brief.channel,
      brief.tone,
      brief.concept,
      brief.brandInfo,
    ]
      .filter(Boolean)
      .join(" \n ");

    const query: ReasoningRetrievalQuery = {
      industry: brief.industry ? firstMatch(INDUSTRY_RULES, brief.industry) || undefined : undefined,
      category: undefined,
      audience: brief.audience ? firstMatch(AUDIENCE_RULES, brief.audience) : undefined,
      objective: brief.objective ? firstMatch(OBJECTIVE_RULES, brief.objective) : undefined,
      channel: brief.channel ? firstMatch(CHANNEL_RULES, brief.channel) : undefined,
      asset_type: brief.assetType ? firstMatch(ASSET_TYPE_RULES, brief.assetType) || brief.assetType : undefined,
      brand_position: firstMatch(BRAND_POSITION_RULES, [brief.tone, brief.brandInfo].filter(Boolean).join(" ")),
    };

    // Fall back to the whole brief for any axis a labelled field did not resolve.
    query.industry ||= firstMatch(INDUSTRY_RULES, blob);
    query.audience ||= firstMatch(AUDIENCE_RULES, blob);
    query.objective ||= firstMatch(OBJECTIVE_RULES, blob);
    query.channel ||= firstMatch(CHANNEL_RULES, blob);
    query.brand_position ||= firstMatch(BRAND_POSITION_RULES, blob);
    query.asset_type ||= firstMatch(ASSET_TYPE_RULES, blob);
    // creative_stage is intentionally NOT set here — see CREATIVE_STAGE_RULES.
    // A caller that genuinely works within one stage passes it via `overrides`.

    // Controlled token only. An unrecognised product leaves the axis undefined,
    // which stops it constraining retrieval rather than excluding the very
    // knowledge that was authored for it.
    query.category = brief.product ? firstMatch(CATEGORY_RULES, brief.product) : undefined;
    query.category ||= firstMatch(CATEGORY_RULES, blob);

    return { ...query, ...overrides };
  }

  /**
   * The creative stage a brief's wording implies.
   *
   * Exposed separately from `extract` so a stage-scoped caller can opt in through
   * `overrides` without a campaign-wide query silently inheriting it. Returns
   * undefined when nothing reads clearly, which is the safe answer: an unresolved
   * stage retrieves broadly, a wrong one retrieves nothing useful.
   */
  public static inferCreativeStage(brief: BriefContextInput): ReasoningRetrievalQuery["creative_stage"] {
    const haystack = [brief.objective, brief.concept, brief.product, brief.channel, brief.brandInfo]
      .filter(Boolean)
      .join(" | ");
    return firstMatch(CREATIVE_STAGE_RULES, haystack) as ReasoningRetrievalQuery["creative_stage"];
  }

  /** Which of the eight axes the extractor could resolve — useful in diagnostics. */
  public static coverage(query: ReasoningRetrievalQuery): { resolved: string[]; unresolved: string[] } {
    const axes = [
      "industry",
      "category",
      "audience",
      "objective",
      "channel",
      "asset_type",
      "brand_position",
      "creative_stage",
    ] as const;
    const resolved: string[] = [];
    const unresolved: string[] = [];
    for (const a of axes) ((query as any)[a] ? resolved : unresolved).push(a);
    return { resolved, unresolved };
  }
}
