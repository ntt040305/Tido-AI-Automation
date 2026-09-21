import type { CreativeJudgment } from "../evolution/experiment/CreativeDirectorV1";
import type { CompiledTemplate, Phase0Flags, Phase0Scenario } from "./phase0-benchmark.types";

/**
 * Phase 0.4 — the six scenarios, written before any number exists.
 *
 * Everything in this file is authored by hand. That is not a shortcut, it is the
 * measurement design, and the distinction it forces is the one this benchmark
 * lives or dies on:
 *
 *   A fixture judgment measures whether the composer TRANSMITS a decision.
 *   It says nothing about whether the director would PRODUCE that decision.
 *
 * Those are different claims and the second one needs a live director run. Every
 * report generated from this file repeats that label, because the last five
 * phases of this project each produced a number that was true and a sentence
 * about it that was not.
 *
 * What the two arms actually isolate
 * ----------------------------------
 * Phase 0.1 is NOT flag-gated. `resolveSelectedDirection` replaced four ad-hoc
 * readers unconditionally, so there is no arm of this benchmark in which the old
 * behaviour still exists — the code that failed is deleted. It therefore shows up
 * as high in BOTH arms, and a reader who expects Phase 0.1 to appear as a delta
 * will conclude it did nothing. It did; it is simply not switchable.
 *
 * Phase 0.2 is likewise unconditional on the resolver side: a strategy candidate
 * carrying `visual_language` transmits it in both arms. What gates it is whether
 * the director filled the field, which only a live run shows.
 *
 * Phase 0.3 IS flag-gated, and it is the only one of the three that can be paired:
 *
 *   OFF  control mode on, bridge off  — non-scene reasoning suppressed, the
 *                                       behaviour every controlled render had
 *                                       before Phase 0.3.
 *   ON   control mode on, bridge on   — brand, audience, semantics and the
 *                                       anti-generic justification carried back.
 *
 * So the OFF/ON delta in this benchmark is a Phase 0.3 measurement. Phases 0.1
 * and 0.2 are measured as absolute properties of both arms instead, which is
 * what the `creative_concept_strength` dimension is reading.
 */

// ── flag arms ─────────────────────────────────────────────────────────────

/** Control mode on, bridge off. The pre-Phase-0.3 controlled render. */
const ARM_OFF: Phase0Flags = {
  creative_director_control_v1: true,
  creative_bridge_v1: false,
  creative_exploration_v1: false,
  creative_strategy_selection_v1: true,
  multi_product_staging_v1: false,
};

/** The same, with Phase 0.3's carry switched on. Nothing else moves. */
const ARM_ON: Phase0Flags = { ...ARM_OFF, creative_bridge_v1: true };

const withStaging = (f: Phase0Flags): Phase0Flags => ({ ...f, multi_product_staging_v1: true });

const explorationArm = (f: Phase0Flags): Phase0Flags => ({
  ...f,
  creative_exploration_v1: true,
  creative_strategy_selection_v1: false,
});

// ── compiled prompt fixture ───────────────────────────────────────────────

/**
 * A compiled prompt in the shape the stable template emits.
 *
 * FIXTURE. The real `MasterPromptCompilerService` is async and repository-backed,
 * and every benchmark and test in this codebase treats it as a stable file whose
 * bytes are asserted rather than a service to drive. Phase 0 changed the
 * COMPOSER, which consumes a compiled prompt and appends to it, so a fixture
 * input measures the thing that actually changed.
 *
 * The section headings are the real ones from `PRIORITY_ORDER`, because the
 * composer reorders by heading and a fixture with invented headings would
 * exercise the fallback path instead of the real one.
 */
export function compileFixture(
  args: CompiledTemplate,
  /**
   * The concept as the request carries it AT COMPILE TIME.
   *
   * In control mode this is the rewritten concept from `applyCreativeDecision`,
   * carrying SCENE / CAMERA / LIGHTING / COMPOSITION lines. That is the whole
   * point of passing it in rather than baking a string: control mode's carrier
   * is the brief, not an appended block, and a fixture that ignored the rewrite
   * would measure a prompt the pipeline never emits.
   */
  concept: string,
  hardRequirements: string[]
): string {
  return [
    "## ROLE",
    args.role,
    "",
    "## CREATIVE INTENT",
    concept,
    "",
    "## CAMPAIGN STRATEGY",
    args.strategy,
    "Where the sections below conflict with this one, they win.",
    "",
    "## PRODUCT IDENTITY",
    ...args.identity.map((l) => `- ${l}`),
    "- Render the attached product exactly as supplied. Do not restyle, recolour or redesign it.",
    "- Do not invent a product, variant or package that is not attached.",
    "",
    "## USER HARD REQUIREMENTS",
    ...(hardRequirements.length ? hardRequirements.map((l) => `- ${l}`) : ["- none"]),
    "",
    "## ART DIRECTION",
    args.artDirection,
    "",
    "## COMMERCIAL LAYOUT",
    ...args.layout.map((l) => `- ${l}`),
    "",
    "## TYPOGRAPHY & READABLE COPY",
    ...args.typography.map((l) => `- ${l}`),
    "- Do not draw any text, wordmark, price, badge or watermark. All copy is composited later.",
    "",
    "## FINAL OUTPUT",
    "Return one photograph.",
  ].join("\n");
}

// ── judgment fixtures ─────────────────────────────────────────────────────

/**
 * A strategy-branch judgment carrying Phase 0.2's `visual_language`.
 *
 * The strategy branch is the one Phase 0.1 repaired, so four of the six
 * scenarios use it. `visual_language` on the candidate is the Phase 0.2 field.
 */
function strategyJudgment(args: {
  route: string;
  coreIdea: string;
  visualLanguage: string;
  whyRoute: string;
  selectionReason: string;
  runnerUp: string;
  whyNotRunnerUp: string;
  brand: { personality: string; positioning: string; emotional_territory: string; audience_perception: string };
  consumer: { viewer: string; first_feeling: string; trust_driver: string; desire_driver: string; intended_action: string };
  composition: string;
  semantics?: { element: string; meaning: string }[];
  staging?: CreativeJudgment["staging"];
}): CreativeJudgment {
  return {
    directions: [],
    selected: "",
    selection_reason: "",
    strategy: {
      candidates: [
        {
          route: args.route,
          core_idea: args.coreIdea,
          visual_language: args.visualLanguage,
          why_this_route: args.whyRoute,
          assessment: {
            product: "supports",
            audience: "supports",
            objective: "supports",
            brand: "supports",
            channel: "supports",
            feasibility: "supports",
          },
        },
      ],
      selected: args.route,
      selection_reason: args.selectionReason,
      runner_up: args.runnerUp,
      why_not_runner_up: args.whyNotRunnerUp,
      routes_offered: [args.route, args.runnerUp, "product-as-hero"],
      routes_developed: [args.route, args.runnerUp],
    },
    brand: { ...args.brand, inferred: "from the brief's tone and stated position" },
    consumer: {
      ...args.consumer,
      attention: { first_second: "the product", then: "the surface it sits on", finally: "the reserved copy area" },
    },
    reasoning: {
      camera: { choice: "85mm, chest height", reason: "the product reads at its own scale" },
      lighting: { choice: "one key, one bounce", reason: "material over mood" },
      composition: { choice: args.composition, reason: "the eye has one place to land" },
      typography: { choice: "no drawn type", reason: "copy is composited" },
      colour: { choice: "the product's own palette leads", reason: "identity before decoration" },
    },
    semantics: args.semantics as any,
    staging: args.staging,
    generic_check: {
      flagged: ["the category's default studio sweep"],
      justification: "replaced by a real surface from the brand's own premises",
      revised: true,
    },
  // The fixture supplies simplified assessment values on purpose: these
  // scenarios exercise the composer, not the director's verdict schema.
  // Asserted through `unknown` so the narrowing is explicit rather than
  // silently accepted.
  } as unknown as CreativeJudgment;
}

/** An exploration-branch judgment. Two scenarios use it, to cover both arms of the director. */
function explorationJudgment(args: {
  name: string;
  coreIdea: string;
  visualLanguage: string;
  whyItFits: string;
  selectionReason: string;
  rejected: string;
  brand: { personality: string; positioning: string; emotional_territory: string; audience_perception: string };
  consumer: { viewer: string; first_feeling: string; trust_driver: string; desire_driver: string; intended_action: string };
  composition: string;
  semantics?: { element: string; meaning: string }[];
}): CreativeJudgment {
  return {
    directions: [
      {
        name: args.name,
        core_idea: args.coreIdea,
        visual_language: args.visualLanguage,
        why_it_fits: args.whyItFits,
      },
    ],
    selected: args.name,
    selection_reason: args.selectionReason,
    rejected_reason: args.rejected,
    brand: { ...args.brand, inferred: "from the brief's tone and stated position" },
    consumer: {
      ...args.consumer,
      attention: { first_second: "the face", then: "the product in hand", finally: "the copy area" },
    },
    reasoning: {
      camera: { choice: "35mm, eye height", reason: "the viewer stands where the photographer stood" },
      lighting: { choice: "available light", reason: "the scene must look found, not built" },
      composition: { choice: args.composition, reason: "the eye has one place to land" },
      typography: { choice: "no drawn type", reason: "copy is composited" },
      colour: { choice: "unsaturated, daylight white balance", reason: "a phone camera does not grade" },
    },
    semantics: args.semantics as any,
    generic_check: {
      flagged: ["the category's default smiling-model shot"],
      justification: "replaced by an unposed moment with the product incidental",
      revised: true,
    },
  } as CreativeJudgment;
}

// ── the six scenarios ─────────────────────────────────────────────────────

export const PHASE0_SCENARIOS: Phase0Scenario[] = [
  // ── A. Product Hero ─────────────────────────────────────────────────────
  {
    id: "A_product_hero",
    kind: "product_hero",
    title: "A — Product Hero, premium commercial product shot",
    challenge: "BARE_SUBJECT",
    transmission_challenge:
      "Nothing in the frame but the product and a surface. With no scene to hide in, a direction that failed to transmit produces a competent, characterless studio shot — the exact output that reads as success.",
    brief: {
      concept: "Chai cold brew đóng chai của Cafe Florian, dòng pha lạnh 18 giờ",
      brandName: "Cafe Florian",
      brandTone: "điềm đạm, thủ công, không phô trương",
      objective: "Xây dựng niềm tin vào nguồn gốc hạt và quy trình rang",
      audience: "Khách quen của quán, 25-40",
      useCase: "product_hero",
      // 1:1, not 4:5. `IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS` is
      // ["1:1","9:16","16:9"], and a 4:5 request fails the provider with
      // UNSUPPORTED_ASPECT_RATIO before a single credit is spent. Found by the
      // first live render, not by reading the config.
      aspectRatio: "1:1",
    },
    products: {
      count: 1,
      items: ["Chai thủy tinh 250ml, nhãn giấy kraft, nắp đồng"],
      identityAnchors: ["nhãn giấy kraft", "hình dáng chai vai vuông", "nắp đồng"],
    },
    constraints: {
      reservedZones: ["dải trên 12% cho logo", "dải dưới 18% cho dòng sản phẩm"],
      copyItems: ["Cold Brew 18h", "Cafe Florian"],
      forbidden: ["chữ do model vẽ", "logo do model vẽ", "giá", "huy hiệu giải thưởng"],
    },
    baseConcept: "Chai cold brew đóng chai của Cafe Florian, dòng pha lạnh 18 giờ, chụp sản phẩm cao cấp",
    baseHardRequirements: ["Copy is composited later: Cold Brew 18h, Cafe Florian."],
    template: {
      role: "You are photographing a single bottled cold brew for a premium commercial product shot.",
      strategy: "Build trust in origin and roast process for regulars who already know the shop.",
      identity: [
        "Kraft paper label, square-shouldered glass bottle, copper cap.",
        "The label artwork is supplied and must render unchanged.",
      ],
      artDirection: "Controlled studio lighting. One key, one bounce. Material truth over mood.",
      layout: [
        "Top 12% reserved for the logo. Keep it clear.",
        "Bottom 18% reserved for the product line. Keep it clear.",
        "The bottle is the single focal element.",
      ],
      typography: ["A clean area is reserved at the bottom for composited copy."],
    },
    judgment: strategyJudgment({
      route: "process evidence — the photograph proves the claim",
      coreIdea: "chai đặt trên mặt gỗ của quầy pha, vài hạt rang rải quanh chân chai",
      visualLanguage: "ánh sáng xiên từ một phía, nhãn nửa trong bóng, mặt gỗ mòn sát ống kính",
      whyRoute: "khách quen đã tin quán; thứ họ chưa thấy là quy trình",
      selectionReason: "vì lời hứa về nguồn gốc phải kiểm chứng được bằng mắt",
      runnerUp: "product-as-hero trên nền vô trùng",
      whyNotRunnerUp: "nó lặp lại đúng thứ kệ hàng đã nói",
      brand: {
        personality: "điềm đạm, thủ công",
        positioning: "quán cà phê khu phố, không phải chuỗi",
        emotional_territory: "quán quen của khu phố",
        audience_perception: "nơi người ta biết tên mình",
      },
      consumer: {
        viewer: "khách quen buổi sáng",
        first_feeling: "nhận ra chỗ quen",
        trust_driver: "thấy hạt thật và mặt gỗ thật",
        desire_driver: "hơi lạnh đọng trên vỏ chai",
        intended_action: "ghé mua trước 9h",
      },
      composition: "chai lệch trái một phần ba, mặt gỗ dẫn mắt từ dưới lên",
      semantics: [
        { element: "hạt rang rải quanh chân chai", meaning: "nguồn gốc kiểm chứng được" },
        { element: "mặt gỗ mòn", meaning: "quán đã ở đây lâu" },
      ],
    }),
    flags: { off: ARM_OFF, on: ARM_ON },
    renderCriteria: [
      "Is there exactly one bottle in each frame?",
      "In ON, is there evidence of origin or process in the frame — beans, roast colour, a real surface — rather than the bottle against a sweep?",
      "Does the bottle hold the strongest contrast in both frames?",
      "Are the top 12% and bottom 18% clear of anything important in both?",
    ],
    regressions: [
      "ON invents a second bottle or a variant that was never attached.",
      "ON renders text, a price or a badge.",
      "The label artwork differs from the attached reference in either frame.",
    ],
  },

  // ── B. UGC ──────────────────────────────────────────────────────────────
  {
    id: "B_ugc",
    kind: "ugc",
    title: "B — UGC, realistic user-generated content",
    challenge: "HUMAN_CONTEXT",
    transmission_challenge:
      "A person and a real room compete with the product for the frame. Creative direction that transmits as decoration produces a staged advertisement wearing UGC clothing, which is the failure mode this format has.",
    brief: {
      concept: "Khách tự chụp chai cold brew trên bàn làm việc buổi sáng",
      brandName: "Cafe Florian",
      brandTone: "thật, không dàn dựng, hơi lộn xộn",
      objective: "Chứng minh sản phẩm sống trong đời thật, không chỉ trên kệ",
      audience: "Người đi làm 24-35, hay mua mang đi",
      useCase: "ugc",
      // 9:16 — a phone photograph, and the only portrait ratio the provider takes.
      aspectRatio: "9:16",
    },
    products: {
      count: 1,
      items: ["Chai thủy tinh 250ml, nhãn giấy kraft, nắp đồng"],
      identityAnchors: ["nhãn giấy kraft", "hình dáng chai vai vuông"],
    },
    constraints: {
      reservedZones: ["không có vùng dành riêng — đây là ảnh tự chụp"],
      copyItems: [],
      forbidden: ["chữ do model vẽ", "logo do model vẽ", "ánh sáng studio", "bố cục quảng cáo"],
    },
    baseConcept: "Khách tự chụp chai cold brew trên bàn làm việc buổi sáng, ảnh điện thoại",
    baseHardRequirements: ["No copy will be composited. Leave the frame as found."],
    template: {
      role: "You are producing a photograph that looks taken by a customer on a phone, not by a studio.",
      strategy: "Prove the product lives in a real day, not on a shelf.",
      identity: [
        "Kraft paper label, square-shouldered glass bottle.",
        "The label artwork is supplied and must render unchanged.",
      ],
      artDirection: "Available light only. Phone camera rendering. No studio shaping.",
      layout: [
        "No reserved zones. This is a found photograph.",
        "The product may be incidental to the frame.",
      ],
      typography: ["No copy will be composited. Leave the frame as found."],
    },
    judgment: explorationJudgment({
      name: "Found Moment",
      coreIdea: "chai đứng cạnh bàn phím, tay người vừa rời khỏi khung, giấy tờ lộn xộn quanh",
      visualLanguage: "ánh sáng cửa sổ buổi sáng, cân bằng trắng hơi lạnh, lấy nét không hoàn hảo",
      whyItFits: "khách không dàn cảnh trước khi chụp; sự lộn xộn chính là bằng chứng",
      selectionReason: "vì thứ khiến UGC đáng tin là cái nó quên dọn",
      rejected: "Lifestyle Staged — người mẫu cầm chai nhìn vào ống kính",
      brand: {
        personality: "thật, không phô trương",
        positioning: "quán cà phê khu phố",
        emotional_territory: "một buổi sáng bình thường",
        audience_perception: "thứ mình vẫn mua",
      },
      consumer: {
        viewer: "người đi làm đang cuộn điện thoại",
        first_feeling: "thấy quen",
        trust_driver: "bàn làm việc lộn xộn như bàn của mình",
        desire_driver: "buổi sáng đó trông dễ chịu",
        intended_action: "nhớ tới quán khi đi ngang",
      },
      composition: "chai lệch phải, bàn phím cắt ngang cạnh dưới",
      semantics: [{ element: "giấy tờ lộn xộn", meaning: "không ai dọn dẹp để chụp" }],
    }),
    flags: { off: explorationArm(ARM_OFF), on: explorationArm(ARM_ON) },
    renderCriteria: [
      "Would you believe a customer took this, if nobody told you otherwise?",
      "Is the light from a window rather than from a softbox in both frames?",
      "In ON, is there anything in the frame nobody would have tidied — and does it read as accident rather than as styling?",
      "Is the product incidental rather than centred and lit, in both?",
    ],
    regressions: [
      "ON produces a staged advertisement: centred product, shaped light, clean surface.",
      "A person's hands or face render with visible model artefacts.",
      "The label artwork differs from the attached reference.",
    ],
  },

  // ── C. Poster ───────────────────────────────────────────────────────────
  {
    id: "C_poster",
    kind: "poster",
    title: "C — Campaign poster, strong concept plus a typographic area",
    challenge: "TYPE_AREA",
    transmission_challenge:
      "A reserved type area and a strong visual concept want the same space. A direction that transmits without respecting geometry fills the frame and the copy lands on top of the idea.",
    brief: {
      concept: "Chiến dịch 'Rang mỗi sáng' — poster treo trong quán và dán cửa kính",
      brandName: "Cafe Florian",
      brandTone: "điềm đạm, thủ công, một chút thơ",
      objective: "Gắn tên quán với thói quen rang mỗi sáng",
      audience: "Người đi bộ qua cửa quán, 22-45",
      useCase: "poster",
      // 9:16. `CreativeFormatPlanner` defaults a poster to 4:5, which this
      // provider cannot render — see the note on scenario A.
      aspectRatio: "9:16",
    },
    products: {
      count: 1,
      items: ["Chai thủy tinh 250ml, nhãn giấy kraft"],
      identityAnchors: ["nhãn giấy kraft", "hình dáng chai vai vuông"],
    },
    constraints: {
      reservedZones: ["40% dưới dành cho tiêu đề chiến dịch", "góc trên phải cho logo"],
      copyItems: ["Rang mỗi sáng", "Cafe Florian", "từ 6h"],
      forbidden: ["chữ do model vẽ", "logo do model vẽ"],
    },
    baseConcept: "Chiến dịch 'Rang mỗi sáng' của Cafe Florian, poster treo trong quán và dán cửa kính",
    baseHardRequirements: ["Copy is composited later: Rang mỗi sáng, Cafe Florian, từ 6h."],
    template: {
      role: "You are photographing for a campaign poster with a large reserved headline area.",
      strategy: "Tie the shop's name to the act of roasting every morning.",
      identity: ["Kraft paper label, square-shouldered glass bottle.", "Label artwork is supplied and renders unchanged."],
      artDirection: "One strong idea. Restraint over abundance. The frame may be mostly empty.",
      layout: [
        "Bottom 40% reserved for the campaign headline. It must stay clean and low-contrast.",
        "Top-right corner reserved for the logo.",
        "The image must read at three metres.",
      ],
      typography: [
        "The bottom 40% must be visually quiet enough for large type to sit on it.",
        "Do not compose anything important below the midline.",
      ],
    },
    judgment: strategyJudgment({
      route: "editorial advertising — a photograph with a point of view",
      coreIdea: "hơi nóng bốc lên từ mẻ hạt vừa đổ ra khay, chai đứng mờ phía sau",
      visualLanguage: "ngược sáng buổi sớm, hơi nóng bắt sáng, hai phần ba trên là khói và ánh sáng, nửa dưới tối và trống",
      whyRoute: "thói quen rang không nhìn thấy được qua sản phẩm; nó nhìn thấy được qua khoảnh khắc",
      selectionReason: "vì chiến dịch nói về một hành động, không phải một vật",
      runnerUp: "product-as-hero với dòng chữ lớn",
      whyNotRunnerUp: "nó biến một thói quen thành một món hàng",
      brand: {
        personality: "điềm đạm, thủ công",
        positioning: "quán cà phê khu phố",
        emotional_territory: "buổi sáng của khu phố",
        audience_perception: "chỗ mở sớm nhất phố",
      },
      consumer: {
        viewer: "người đi bộ qua cửa kính",
        first_feeling: "ngửi thấy trước khi đọc",
        trust_driver: "hơi nóng thật từ mẻ hạt thật",
        desire_driver: "cảm giác sáng sớm",
        intended_action: "đẩy cửa bước vào",
      },
      composition: "khối sáng dồn lên hai phần ba trên, nửa dưới để trống cho chữ",
      semantics: [{ element: "hơi nóng bốc lên", meaning: "vừa xong, không phải hàng tồn" }],
    }),
    flags: { off: ARM_OFF, on: ARM_ON },
    renderCriteria: [
      "Is the bottom 40% quiet enough that large type would be readable on it, in both frames?",
      "Does anything important sit below the midline in either frame?",
      "Does the image still read as one idea at three metres in ON, or did the added reasoning fill the frame?",
      "Is the top-right corner clear of anything important in both?",
    ],
    regressions: [
      "ON composes detail into the reserved bottom 40%.",
      "ON renders headline text of its own.",
      "The idea becomes two ideas — smoke AND a styled product shot competing.",
    ],
  },

  // ── D. Social Ad ────────────────────────────────────────────────────────
  {
    id: "D_social_ad",
    kind: "social_ad",
    title: "D — Social ad, stop-scroll and conversion",
    challenge: "ATTENTION_HOSTILE",
    transmission_challenge:
      "The asset is judged at thumbnail size in a hostile feed. A direction that transmits as subtlety is invisible here, and one that transmits as noise converts nobody.",
    brief: {
      concept: "Ưu đãi sáng: mua 2 chai cold brew tặng 1 ly espresso",
      brandName: "Cafe Florian",
      brandTone: "điềm đạm nhưng dứt khoát",
      objective: "Thúc đẩy mua trong ngày, đo bằng lượt đổi mã",
      audience: "Người đi làm 24-35 trong bán kính 2km",
      useCase: "social_ad",
      aspectRatio: "1:1",
    },
    products: {
      count: 2,
      items: ["Chai cold brew 250ml ×2", "Ly espresso giấy"],
      identityAnchors: ["nhãn giấy kraft", "ly giấy có vòng bìa"],
    },
    constraints: {
      reservedZones: ["dải dưới 25% cho dòng ưu đãi và nút", "góc trên trái cho logo"],
      copyItems: ["Mua 2 tặng 1", "trước 10h", "Cafe Florian"],
      forbidden: ["chữ do model vẽ", "logo do model vẽ", "giá do model vẽ"],
    },
    baseConcept: "Ưu đãi sáng của Cafe Florian: mua 2 chai cold brew tặng 1 ly espresso",
    baseHardRequirements: ["Copy is composited later: Mua 2 tặng 1, trước 10h, Cafe Florian."],
    template: {
      role: "You are photographing a promotional social advertisement that must stop a scroll at thumbnail size.",
      strategy: "Drive same-day purchase, measured by code redemption.",
      identity: [
        "Two kraft-label bottles and one paper espresso cup.",
        "Label artwork is supplied and renders unchanged. Do not merge the two bottles into one.",
      ],
      artDirection: "High separation. The subject must survive being shrunk to a thumbnail.",
      layout: [
        "Bottom 25% reserved for the offer line and button. Keep it clean.",
        "Top-left corner reserved for the logo.",
        "One clear focal mass, readable at 100px.",
      ],
      typography: ["The bottom 25% must be flat enough for an offer line and a button."],
    },
    judgment: strategyJudgment({
      route: "immediate desire — the picture makes you want it now",
      coreIdea: "hai chai đọng hơi lạnh đặt cạnh ly espresso còn bốc khói, tương phản lạnh và nóng",
      visualLanguage: "nền tối, ánh sáng mạnh từ trên, hơi nước và khói bắt sáng, khối chủ thể dồn vào giữa",
      whyRoute: "ưu đãi trong ngày cần thèm muốn tức thì, không cần thuyết phục",
      selectionReason: "vì tương phản lạnh-nóng đọc được ở kích thước thumbnail",
      runnerUp: "process evidence",
      whyNotRunnerUp: "bằng chứng quy trình cần thời gian đọc mà feed không cho",
      brand: {
        personality: "điềm đạm nhưng dứt khoát",
        positioning: "quán cà phê khu phố",
        emotional_territory: "buổi sáng của khu phố",
        audience_perception: "chỗ tiện đường đi làm",
      },
      consumer: {
        viewer: "người đang cuộn feed lúc 8h",
        first_feeling: "khát",
        trust_driver: "hơi lạnh thật trên vỏ chai",
        desire_driver: "tương phản lạnh và nóng trong một khung",
        intended_action: "lưu mã, ghé trước 10h",
      },
      composition: "khối chủ thể dồn giữa khung, nền tối để tách khỏi feed sáng",
      semantics: [{ element: "khói và hơi lạnh trong một khung", meaning: "hai thứ, một lần ghé" }],
    }),
    flags: { off: ARM_OFF, on: ARM_ON },
    renderCriteria: [
      "Shrink both frames to 100px. Does either still read? Which one reads better?",
      "Are there exactly two bottles and one cup in each frame?",
      "Is the bottom 25% flat enough for an offer line and a button in both?",
      "In ON, does the added reasoning make the frame busier at thumbnail size, or more separated?",
    ],
    regressions: [
      "ON adds scene detail that destroys thumbnail legibility.",
      "The two bottles become one, or become three.",
      "ON renders an offer line, price or button of its own.",
    ],
  },

  // ── E. Banner ───────────────────────────────────────────────────────────
  {
    id: "E_banner",
    kind: "banner",
    title: "E — Wide banner, CTA placement and text hierarchy",
    challenge: "WIDE_FORMAT",
    transmission_challenge:
      "A 16:9 banner reads left to right and the CTA sits right. A direction that transmits without format awareness centres the subject and leaves the CTA on top of it.",
    brief: {
      concept: "Banner đầu trang web: dòng cold brew đóng chai",
      brandName: "Cafe Florian",
      brandTone: "điềm đạm, sạch sẽ",
      objective: "Dẫn người xem tới trang đặt hàng",
      audience: "Khách truy cập web, 25-45",
      useCase: "banner",
      aspectRatio: "16:9",
    },
    products: {
      count: 1,
      items: ["Chai thủy tinh 250ml, nhãn giấy kraft"],
      identityAnchors: ["nhãn giấy kraft", "hình dáng chai vai vuông"],
    },
    constraints: {
      reservedZones: ["nửa phải cho tiêu đề, phụ đề và nút", "góc trên trái cho logo"],
      copyItems: ["Cold Brew 18h", "Đặt hàng", "giao trong 2h"],
      forbidden: ["chữ do model vẽ", "logo do model vẽ", "nút do model vẽ"],
    },
    baseConcept: "Banner đầu trang web của Cafe Florian, dòng cold brew đóng chai",
    baseHardRequirements: ["Copy is composited later: Cold Brew 18h, Đặt hàng, giao trong 2h."],
    template: {
      role: "You are photographing a wide website hero banner with copy and a call to action on the right.",
      strategy: "Move the visitor to the ordering page.",
      identity: ["Kraft paper label, square-shouldered glass bottle.", "Label artwork is supplied and renders unchanged."],
      artDirection: "Wide, calm, horizontal. The subject sits left of centre.",
      layout: [
        "Right half reserved for headline, subhead and button. It must stay clean.",
        "Top-left corner reserved for the logo.",
        "Reading order runs left to right and ends at the button.",
      ],
      typography: [
        "The right half must be low-contrast and uncluttered enough for three levels of type.",
        "Do not compose anything important right of centre.",
      ],
    },
    judgment: strategyJudgment({
      route: "quiet product portrait — the object, well seen",
      coreIdea: "chai đặt lệch trái trên mặt đá, khoảng trống rộng bên phải",
      visualLanguage: "ánh sáng ngang dịu, nền chuyển nhẹ từ trái sang phải, bên phải sáng và trống",
      whyRoute: "banner web cần một chủ thể và một khoảng nghỉ, không cần một câu chuyện",
      selectionReason: "vì thứ tự đọc trái sang phải phải kết thúc ở nút, không ở sản phẩm",
      runnerUp: "editorial advertising",
      whyNotRunnerUp: "một góc nhìn mạnh sẽ giành chỗ với ba cấp chữ",
      brand: {
        personality: "điềm đạm, sạch sẽ",
        positioning: "quán cà phê khu phố",
        emotional_territory: "quán quen của khu phố",
        audience_perception: "đặt được online",
      },
      consumer: {
        viewer: "người vừa mở trang chủ",
        first_feeling: "thấy gọn gàng",
        trust_driver: "sản phẩm được chụp rõ ràng",
        desire_driver: "khoảng trống dễ chịu",
        intended_action: "bấm nút đặt hàng",
      },
      composition: "chủ thể một phần ba trái, nửa phải để trống, độ sáng tăng dần sang phải",
      semantics: [{ element: "khoảng trống bên phải", meaning: "chỗ để hành động" }],
    }),
    flags: { off: ARM_OFF, on: ARM_ON },
    renderCriteria: [
      "Is the right half clean enough for a headline, a subhead and a button in both frames?",
      "Does the subject sit left of centre in both?",
      "Does the eye finish on the right in both, or does the subject pull it back left?",
      "In ON, did the added reasoning put anything into the right half?",
    ],
    regressions: [
      "ON centres the subject, which puts the CTA on top of it.",
      "ON composes detail into the reserved right half.",
      "ON renders a button, headline or arrow of its own.",
    ],
  },

  // ── F. Multi-product ────────────────────────────────────────────────────
  {
    id: "F_multi_product",
    kind: "multi_product",
    title: "F — Four products, identity preservation and hierarchy",
    challenge: "IDENTITY_UNDER_GROUPING",
    transmission_challenge:
      "Four products must read as one photograph without any of the four losing its own label. The isolation instructions that protect identity are the same ones that stop the four becoming a group.",
    brief: {
      concept: "Bốn chai cold brew cùng một hạt, bốn mức đậm nhạt",
      brandName: "Cafe Florian",
      brandTone: "điềm đạm, thủ công",
      objective: "Giới thiệu cả dòng sản phẩm tới khách quen",
      audience: "Khách quen của quán, 25-40",
      useCase: "poster",
      // 1:1. Four bottles in a row need width more than height.
      aspectRatio: "1:1",
    },
    products: {
      count: 4,
      items: [
        "Chai 250ml nhãn kraft — Light",
        "Chai 250ml nhãn kraft — Medium",
        "Chai 250ml nhãn kraft — Dark",
        "Chai 250ml nhãn kraft — Decaf",
      ],
      identityAnchors: [
        "bốn nhãn khác nhau, đọc được từng cái",
        "cùng hình dáng chai",
        "màu nước khác nhau theo mức rang",
      ],
    },
    constraints: {
      reservedZones: ["dải trên 12% cho logo", "dải dưới 20% cho tên dòng"],
      copyItems: ["Bốn mức rang", "Cafe Florian"],
      forbidden: ["chữ do model vẽ", "logo do model vẽ", "nhân bản chai", "trung bình hóa nhãn"],
    },
    baseConcept: "Bốn chai cold brew của Cafe Florian, cùng một hạt, bốn mức đậm nhạt",
    baseHardRequirements: ["Copy is composited later: Bốn mức rang, Cafe Florian."],
    template: {
      role: "You are photographing four bottled cold brews that must read as one group without losing individual identity.",
      strategy: "Introduce the full range to customers who already trust the beans.",
      identity: [
        "Four distinct kraft labels: Light, Medium, Dark, Decaf. Each is a separate physical identity.",
        "Do NOT clone one bottle four times. Do NOT average the four labels into one design.",
        "Liquid colour differs by roast level and must differ in the frame.",
      ],
      artDirection: "One surface, one light direction, one photograph.",
      layout: [
        "Top 12% reserved for the logo.",
        "Bottom 20% reserved for the range name.",
        "One product leads; the other three support.",
      ],
      typography: ["The bottom 20% must stay clean for the range name."],
    },
    judgment: strategyJudgment({
      route: "the range, photographed once",
      coreIdea: "bốn chai đứng trên cùng một mặt gỗ, chai Medium nhô lên trước nửa bước",
      visualLanguage: "một nguồn sáng xiên từ trái, bóng đổ cùng hướng, màu nước đậm dần từ trái sang phải",
      whyRoute: "khách đã tin hạt; thứ họ chưa biết là có bốn mức",
      selectionReason: "vì một dải chỉ đọc được khi bốn thứ nằm trong cùng một ánh sáng",
      runnerUp: "bốn ảnh sản phẩm ghép lại",
      whyNotRunnerUp: "ghép bốn ảnh biến một dòng sản phẩm thành một bảng giá",
      brand: {
        personality: "điềm đạm, thủ công",
        positioning: "quán cà phê khu phố",
        emotional_territory: "quán quen của khu phố",
        audience_perception: "nơi biết rõ hạt mình bán",
      },
      consumer: {
        viewer: "khách quen đã uống một loại",
        first_feeling: "tò mò về ba loại kia",
        trust_driver: "cùng một nhãn, bốn mức rang thật",
        desire_driver: "màu nước đậm dần nhìn thấy được",
        intended_action: "thử mức khác vào lần sau",
      },
      composition: "bốn chai một hàng hơi lệch, chai Medium nhô lên trước",
      semantics: [{ element: "màu nước đậm dần", meaning: "một dải, không phải bốn món rời" }],
      staging: {
        relationship: {
          relationship_type: "một dải bốn mức từ cùng một hạt",
          strategic_reason: "khách đã tin hạt, chưa biết có bốn mức",
          visual_implication: "bốn chai đọc như một dải liên tục",
          hierarchy_implication: "chai Medium dẫn, ba chai còn lại đỡ",
        },
        grouping: "cùng một mặt gỗ, khoảng cách đều, chạm vai nhau",
        depth_order: "Medium trước nửa bước, Light và Dark hai bên, Decaf lùi sau",
      } as any,
    }),
    flags: { off: withStaging(ARM_OFF), on: withStaging(ARM_ON) },
    renderCriteria: [
      "Are there exactly four bottles in each frame?",
      "Are all four labels distinct and individually readable in each frame?",
      "Do the four stand on one continuous surface under one light direction, or in four pockets of space?",
      "Does one bottle lead in each frame, or do all four carry equal weight?",
      "Does the liquid colour differ across the four in each frame?",
    ],
    regressions: [
      "Fewer or more than four bottles.",
      "Two or more bottles become copies of each other.",
      "The four are arranged in a grid, which means a reference sheet was read as a layout.",
      "ON groups them successfully but loses one label to shadow.",
    ],
  },
];

/**
 * The cross-scenario check, which is not a per-image judgement.
 *
 * Phase 0.2's whole claim is that a strategy route now carries HOW the frame is
 * rendered, not only what is in it. If that is true, four renders driven by four
 * different routes should be sortable by someone who never read this file. If it
 * is false they will be four competent photographs of the same bottle, which is
 * the Phase 5.0 result surviving into pixels.
 */
export const PHASE0_CROSS_CHECK = {
  id: "cross_route_legibility",
  title: "Cross-scenario — is the route visible in the picture?",
  steps: [
    "Take the ON renders for A, C, D and E. Remove every label.",
    "Ask someone who has not read this file to sort them into: process evidence, editorial, immediate desire, quiet portrait.",
    "Record what they said before telling them the answer.",
  ],
  pass: "Three of four sorted correctly with no context.",
  fail:
    "The four are interchangeable. That means Phase 0.2's visual_language reached the prompt and not the picture, and Phase 1 would be adding intelligence on top of a channel that does not carry.",
};

/** True of every render in this benchmark, whatever the scenario. */
export const PHASE0_UNIVERSAL_CHECKS = [
  "No invented text, price, badge, slogan or watermark anywhere in the frame.",
  "No logo drawn by the model.",
  "Product identity unchanged from the attached reference: same label, same shape, same colour.",
  "Nothing important crosses into a reserved zone.",
  "The render completed without falling back to the stable pipeline (check features_enabled in the log).",
  "The OFF and ON renders used the same seed, same references and same aspect ratio.",
];

export const PHASE0_DATASET = {
  dataset_id: "phase0-render-validation",
  version: "0.4.0",
  scenarios: PHASE0_SCENARIOS,
};
