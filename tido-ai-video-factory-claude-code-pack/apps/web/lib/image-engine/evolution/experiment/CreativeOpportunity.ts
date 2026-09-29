import type { CategoryRelationship, IndustryLandscape } from "./IndustryContextIntelligence";
import type { ProductTruth } from "./ProductTruth";
import type { ProductMeaning } from "./ProductMeaning";
import type { MarketingInsight } from "./MarketingInsight";
import type { BrandKit } from "./BrandKit";

/**
 * Creative Opportunity — the strategic advertising breakthrough point.
 *
 * It answers:
 * "What is the most compelling creative opportunity available at the intersection
 * of this product's truth, this user concept, this audience's tension, and this industry landscape?"
 *
 * ARCHITECTURAL PRINCIPLE:
 * ProductTruth is protected (FACTS).
 * CreativeOpportunity is the advertising strategic interpretation (STRATEGY).
 */
export interface CreativeOpportunity {
  /** The single core advertising opportunity that cuts through category noise. */
  core_opportunity: string;
  /**
   * The human/consumer tension:
   * The psychological friction, unexpressed desire, skepticism or daily frustration
   * that this image addresses or resolves.
   */
  human_tension: string;
  /** What the viewer emotionally experiences when this tension is resolved. */
  emotional_payoff: string;
  /** The strategic angle that distinguishes this campaign from competitors. */
  strategic_angle: string;
  /**
   * How this opportunity positions relative to category conventions:
   *   - respect: adheres to high category craft while elevating the execution
   *   - reinterpret: takes a familiar trope and gives it an unexpected meaning
   *   - contrast: juxtaposes two opposing worlds or feelings
   *   - disrupt: deliberately breaks established category visual codes
   *   - deliberately_ignore: ignores the category entirely to focus on a pure human truth
   */
  category_relationship: CategoryRelationship;
  /** The concrete, grounded product truth that anchors this opportunity in reality. */
  product_truth_used: string;
  /** How this opportunity aligns with or enriches the brand's identity. */
  brand_relevance: string;
  /** Why this strategic angle makes for a striking, evocative visual world. */
  visual_potential: string;
  /** Why this opportunity avoids generic AI clichés and competitive sameness. */
  originality_reason: string;
  /** Creative or perceptual risks to monitor during execution. */
  risks: string[];
}

export interface BuildCreativeOpportunityInput {
  industryLandscape?: IndustryLandscape;
  landscape?: IndustryLandscape;
  userConcept: string;
  productTruth?: Partial<ProductTruth> | null;
  productMeaning?: Partial<ProductMeaning> | null;
  marketingInsight?: Partial<MarketingInsight> | null;
  brandKit?: BrandKit | null;
  audience?: string;
  objective?: string;
}

/**
 * Builds a deterministic initial CreativeOpportunity from upstream intelligence.
 *
 * This provides a grounded baseline that guarantees every creative decision
 * has an anchored strategic opportunity, even before or alongside the Creative Director LLM call.
 */
export function buildCreativeOpportunity(input: BuildCreativeOpportunityInput): CreativeOpportunity {
  const industryLandscape = input.industryLandscape || input.landscape;
  if (!industryLandscape) {
    throw new Error("buildCreativeOpportunity requires industryLandscape or landscape");
  }
  const { userConcept, productTruth, productMeaning, marketingInsight, brandKit, audience, objective } = input;

  const conceptClean = (userConcept || "").trim();
  const audienceClean = audience?.trim() || marketingInsight?.target_customer?.value || "người tiêu dùng hiện đại";
  const objectiveClean = objective?.trim() || "khẳng định vị thế và tạo ấn tượng mạnh mẽ";

  // 1. Identify product truth anchor
  const productFact =
    productTruth?.functional_truth?.value ||
    productMeaning?.functional_value?.value ||
    productMeaning?.differentiation?.value ||
    "tính năng và thiết kế thực tế của sản phẩm";

  // 2. Identify human tension
  const customerProblem =
    marketingInsight?.customer_problem?.value ||
    marketingInsight?.objection?.value ||
    productMeaning?.customer_problem?.value;

  const humanTension = customerProblem
    ? `Sự giằng co giữa mong muốn đạt được giá trị vượt trội và nỗi sợ phải đánh đổi (${customerProblem})`
    : `Sự bão hòa giữa những thông điệp quảng cáo rập khuôn trong ngành ${industryLandscape.industry_name} và khao khát tìm kiếm một trải nghiệm chân thực, khác biệt`;

  // 3. Determine category relationship based on user concept and whitespace
  let categoryRel: CategoryRelationship = "reinterpret";
  const lowerConcept = conceptClean.toLowerCase();

  if (
    lowerConcept.includes("đột phá") ||
    lowerConcept.includes("khác biệt") ||
    lowerConcept.includes("nổi loạn") ||
    lowerConcept.includes("bất ngờ") ||
    lowerConcept.includes("bùng nổ") ||
    lowerConcept.includes("sôi động") ||
    lowerConcept.includes("surreal") ||
    lowerConcept.includes("futuristic")
  ) {
    categoryRel = "disrupt";
  } else if (
    lowerConcept.includes("tương phản") ||
    lowerConcept.includes("đối lập") ||
    lowerConcept.includes("contrast") ||
    lowerConcept.includes("ngược lại")
  ) {
    categoryRel = "contrast";
  } else if (
    lowerConcept.includes("tinh tế") ||
    lowerConcept.includes("truyền thống") ||
    lowerConcept.includes("nguyên bản") ||
    lowerConcept.includes("tự nhiên") ||
    lowerConcept.includes("chuẩn mực") ||
    lowerConcept.includes("nguồn gốc") ||
    lowerConcept.includes("nông trại")
  ) {
    categoryRel = "respect";
  } else if (
    lowerConcept.includes("tối giản") ||
    lowerConcept.includes("độc bản") ||
    lowerConcept.includes("nghệ thuật")
  ) {
    categoryRel = "deliberately_ignore";
  }

  // 4. Formulate the core opportunity dynamically based on category relationship
  const whitespaceTop = industryLandscape.whitespace_opportunities[0] || "khai phá góc nhìn thẩm mỹ mới mẻ";
  const clicheTop = industryLandscape.overused_category_cliches[0] || "khuôn mẫu đại trà";

  let coreOpportunity = "";
  let strategicAngle = "";

  if (conceptClean) {
    switch (categoryRel) {
      case "disrupt":
        coreOpportunity = `Đột phá khỏi khuôn mẫu ${industryLandscape.industry_name}: ${conceptClean}`;
        strategicAngle = `Phá vỡ quy ước rập khuôn (${clicheTop}), biến sản phẩm thành tâm điểm năng lượng bùng nổ`;
        break;
      case "contrast":
        coreOpportunity = `Tạo tương phản thị giác đa chiều: ${conceptClean}`;
        strategicAngle = `Khai thác va chạm đối lập để giải phóng tension '${humanTension}', làm rực sáng giá trị sản phẩm`;
        break;
      case "respect":
        coreOpportunity = `Nâng tầm tinh hoa chuẩn mực: ${conceptClean}`;
        strategicAngle = `Tôn vinh chiều sâu thủ công và chất lượng nguyên bản của ${productFact}, tạo niềm tin vững chắc`;
        break;
      case "deliberately_ignore":
        coreOpportunity = `Tập trung vào trải nghiệm nhân bản độc bản: ${conceptClean}`;
        strategicAngle = `Đứng ngoài mọi quy ước thương mại của ngành, biến tác phẩm thành tuyên ngôn thẩm mỹ thuần khiết`;
        break;
      case "reinterpret":
      default:
        coreOpportunity = `Tái định nghĩa trải nghiệm ${industryLandscape.industry_name}: ${conceptClean}`;
        strategicAngle = `Đổi mới góc nhìn về ${productFact} qua khoảng trống '${whitespaceTop}', giải tỏa tension '${humanTension}'`;
        break;
    }
  } else {
    coreOpportunity = `Khai thác khoảng trống '${whitespaceTop}' cho ${productFact} trong ngành ${industryLandscape.industry_name}`;
    strategicAngle = `Biến sản phẩm thành giải pháp trung tâm giải tỏa '${humanTension}', phục vụ mục tiêu ${objectiveClean}`;
  }

  const emotionalPayoff =
    marketingInsight?.desire?.value ||
    productMeaning?.emotional_value?.value ||
    `Cảm giác tự tin, hài lòng và kết nối sâu sắc với giá trị đích thực của sản phẩm`;

  const brandRel = brandKit?.name
    ? `Tôn vinh cá tính thương hiệu ${brandKit.name} với tinh thần thẩm mỹ cao cấp, trung thực và độc bản`
    : "Thể hiện bản sắc thương hiệu nhất quán, chuyên nghiệp và có chiều sâu văn hóa";

  return {
    core_opportunity: coreOpportunity,
    human_tension: humanTension,
    emotional_payoff: emotionalPayoff,
    strategic_angle: strategicAngle,
    category_relationship: categoryRel,
    product_truth_used: productFact,
    brand_relevance: brandRel,
    visual_potential: `Tạo nên thế giới thị giác giàu sức gợi: ánh sáng và bố cục không chỉ trang trí mà kể câu chuyện về sự chuyển hóa cảm xúc từ căng thẳng sang thỏa mãn`,
    originality_reason: `Tránh xa bẫy hình ảnh rập khuôn (${clicheTop}), tập trung vào khoảng trống '${whitespaceTop}'`,
    risks: [
      `Cần tránh để chi tiết nền lấn át '${productFact}'`,
      `Đảm bảo tỷ lệ khung hình và không gian âm đủ thoáng cho thông điệp`,
    ],
  };
}

/**
 * Formats the CreativeOpportunity for injection into the Creative Director prompt.
 */
export function renderCreativeOpportunityForDirector(opp: CreativeOpportunity): string {
  return [
    `[STRATEGIC CREATIVE OPPORTUNITY]`,
    `- Core Advertising Opportunity: ${opp.core_opportunity}`,
    `- Human / Consumer Tension: ${opp.human_tension}`,
    `- Emotional Payoff: ${opp.emotional_payoff}`,
    `- Category Relationship: ${opp.category_relationship.toUpperCase()} (strategy: ${opp.strategic_angle})`,
    `- Grounded Product Truth Anchor: ${opp.product_truth_used}`,
    `- Brand Character Relevance: ${opp.brand_relevance}`,
    `- Visual Potential: ${opp.visual_potential}`,
    `- Anti-Cliché Originality Defense: ${opp.originality_reason}`,
    `- Strategic Risks to Avoid: ${opp.risks.join("; ")}`,
  ].join("\n");
}
