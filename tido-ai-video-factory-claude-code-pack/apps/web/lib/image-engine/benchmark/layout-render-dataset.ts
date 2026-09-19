/**
 * Phase 5.1.5 render validation — the cases, not the renders.
 *
 * Everything measured so far has been text. Distinct fingerprints, similarity
 * scores, character counts: all of it says the prompt changed, none of it says
 * the picture did. This file is the smallest set of paired renders that could
 * answer that, written down before any image exists so the criteria cannot be
 * adjusted afterwards to fit whatever comes back.
 *
 * Nothing here renders anything. It emits a run sheet.
 *
 * Why pairs
 * ---------
 * Each case is the same brief rendered twice, with the bridge off and on, and
 * nothing else changed. A single image tells you what one render looked like; a
 * pair tells you what the bridge did. The image model is stochastic, so a pair
 * that differs proves less than it seems — which is why the criteria below are
 * about what is PRESENT or ABSENT in the frame, not about which one is prettier.
 *
 * Reading the results honestly
 * ----------------------------
 * The criteria are deliberately answerable by someone who did not build this.
 * "Do the three bottles share one ground plane" has an answer. "Is the
 * composition more intentional" does not, and a criterion nobody can fail is how
 * the last five phases of this project each looked successful on paper.
 */

export interface RenderCase {
  id: string;
  title: string;
  /** What goes in the brief field, verbatim. */
  concept: string;
  brandName: string;
  useCase: string;
  aspectRatio: string;
  objective: string;
  audience: string;
  productCount: number;
  /** Flags for the OFF render and the ON render. Everything else identical. */
  flags: { off: Record<string, boolean>; on: Record<string, boolean> };
  /** Each answerable yes or no by looking at the two images side by side. */
  criteria: string[];
  /** What would make this case a failure rather than a null result. */
  regressions: string[];
}

/** Phase 5.1.6 adds one flag on top of the 5.1.5 ON set. */
const CONSTRAINT_ON = { creative_constraint_calibration_v1: true };

const BASE_ON = {
  creative_decision_context_v1: true,
  consumer_psychology_v1: true,
  brand_positioning_v1: true,
  layout_context_bridge_v1: true,
  layout_priority_alignment_v1: true,
};
const BASE_OFF = {
  creative_decision_context_v1: true,
  consumer_psychology_v1: true,
  brand_positioning_v1: true,
  layout_context_bridge_v1: false,
  layout_priority_alignment_v1: false,
};

export const RENDER_CASES: RenderCase[] = [
  {
    id: "A_single_product",
    title: "Test A — single product",
    concept: "Chai cold brew đóng chai của Cafe Florian, bán mang đi buổi sáng",
    brandName: "Cafe Florian",
    useCase: "poster",
    aspectRatio: "4:5",
    objective: "Xây dựng niềm tin vào nguồn gốc hạt cà phê và quy trình rang",
    audience: "Khách quen của quán, 25-40",
    productCount: 1,
    flags: { off: BASE_OFF, on: BASE_ON },
    criteria: [
      "Is there exactly one bottle in each frame?",
      "In the ON render, does anything in the frame show evidence of origin or process — beans, roast colour, a hand, a surface from the shop — rather than the bottle alone against a backdrop?",
      "Does the bottle still read as the hero in both, or did the ON render bury it in scene?",
      "Is the reading order clear in both: something catches the eye first, and it is not an accident?",
    ],
    regressions: [
      "The ON render invents a second bottle or a variant that was never uploaded.",
      "The ON render renders text of its own.",
      "The product is cropped by a frame edge in ON but not in OFF.",
    ],
  },
  {
    id: "B_multi_product",
    title: "Test B — three products",
    concept: "Ba chai cold brew cùng một hạt, ba mức đậm nhạt khác nhau",
    brandName: "Cafe Florian",
    useCase: "poster",
    aspectRatio: "4:5",
    objective: "Giới thiệu dòng sản phẩm mới tới khách quen của quán",
    audience: "Khách quen của quán, 25-40",
    productCount: 3,
    flags: {
      off: { ...BASE_OFF, multi_product_staging_v1: true },
      on: { ...BASE_ON, multi_product_staging_v1: true },
    },
    criteria: [
      "Do the three bottles stand on one continuous surface, or does each sit in its own pocket of space?",
      "Is there one light direction across all three, or three separate key lights?",
      "Does any bottle overlap another, or are all three separated with clear air between them?",
      "Is one bottle forward of the others, or are all three on the same plane at the same size?",
      "Do the three read as one group photographed once, or as three product shots assembled?",
    ],
    regressions: [
      "Fewer or more than three bottles.",
      "The three bottles become identical copies rather than three distinct labels.",
      "The ON render arranges them in a grid, which would mean a reference sheet was read as a layout.",
    ],
  },
  {
    id: "C_strategy_trust",
    title: "Test C1 — trust",
    concept: "Chai cold brew đóng chai của Cafe Florian",
    brandName: "Cafe Florian",
    useCase: "poster",
    aspectRatio: "4:5",
    objective: "Xây dựng niềm tin vào nguồn gốc hạt cà phê và quy trình rang",
    audience: "Khách quen của quán, 25-40",
    productCount: 1,
    flags: { off: BASE_OFF, on: BASE_ON },
    criteria: [
      "Does the frame contain evidence a sceptical viewer could check — real beans, real texture, a real surface?",
      "Is the light describing material, or decorating it?",
    ],
    regressions: ["Indistinguishable from C2 and C3 at a glance."],
  },
  {
    id: "C_strategy_desire",
    title: "Test C2 — desire",
    concept: "Chai cold brew đóng chai của Cafe Florian",
    brandName: "Cafe Florian",
    useCase: "poster",
    aspectRatio: "4:5",
    objective: "Tạo thèm muốn, khiến người xem muốn uống ngay khi nhìn thấy",
    audience: "Khách quen của quán, 25-40",
    productCount: 1,
    flags: { off: BASE_OFF, on: BASE_ON },
    criteria: [
      "Is there a physical cue of cold or freshness — condensation, ice, a dark dense pour?",
      "Does the frame reach for appetite before it reaches for brand?",
    ],
    regressions: ["Indistinguishable from C1 and C3 at a glance."],
  },
  {
    id: "C_strategy_purchase",
    title: "Test C3 — immediate purchase",
    concept: "Chai cold brew đóng chai của Cafe Florian",
    brandName: "Cafe Florian",
    useCase: "poster",
    aspectRatio: "4:5",
    objective: "Thúc đẩy mua ngay hôm nay với ưu đãi giảm giá buổi sáng",
    audience: "Khách quen của quán, 25-40",
    productCount: 1,
    flags: { off: BASE_OFF, on: BASE_ON },
    criteria: [
      "Is a clear area reserved low in the frame where an offer line would be composited?",
      "Does the composition leave room to be acted on, rather than filling every corner?",
    ],
    regressions: ["Indistinguishable from C1 and C2 at a glance."],
  },
];

/**
 * Phase 5.1.6 — calibration cases.
 *
 * These pair differently from the cases above. There the comparison was bridge
 * off against bridge on; here the bridge stays ON in both halves and only the
 * constraint flag moves, because the failure being corrected was caused by the
 * bridge working. Comparing against a no-bridge render would answer a question
 * nobody asked.
 *
 * The seasonal case is the one that found the problem, so it is written to fail
 * loudly if the correction did not take — and also if it took too hard, which is
 * the likelier mistake. A renderer told only to remove things produces a bare
 * product on grey, and that is the generic output an earlier phase of this
 * project spent weeks undoing.
 */
export const CALIBRATION_CASES: RenderCase[] = [
  {
    id: "K1_single_hero",
    title: "Calibration 1 — single product hero",
    concept: "Chai cold brew đóng chai của Cafe Florian",
    brandName: "Cafe Florian",
    useCase: "product_hero",
    aspectRatio: "4:5",
    objective: "Xây dựng niềm tin vào nguồn gốc hạt cà phê và quy trình rang",
    audience: "Khách quen của quán, 25-40",
    productCount: 1,
    flags: { off: BASE_ON, on: { ...BASE_ON, ...CONSTRAINT_ON } },
    criteria: [
      "Count every object in each frame that is not the bottle. Write both numbers down before judging anything.",
      "For each of those objects in the ON render, can you say in one sentence what it does for the sale?",
      "Does the bottle hold the strongest contrast in the ON frame?",
      "Is the atmosphere in ON carried by light, colour and surface rather than by added things?",
    ],
    regressions: [
      "ON is a bare bottle on a flat backdrop — the correction overshot into the generic product shot.",
      "ON has more non-product objects than OFF.",
      "The bottle label, shape or colour differs from the uploaded reference.",
    ],
  },
  {
    id: "K2_three_products",
    title: "Calibration 2 — three product promotion",
    concept: "Ba chai cold brew cùng một hạt, ba mức đậm nhạt khác nhau",
    brandName: "Cafe Florian",
    useCase: "poster",
    aspectRatio: "4:5",
    objective: "Giới thiệu dòng sản phẩm mới tới khách quen của quán",
    audience: "Khách quen của quán, 25-40",
    productCount: 3,
    flags: {
      off: { ...BASE_ON, multi_product_staging_v1: true },
      on: { ...BASE_ON, ...CONSTRAINT_ON, multi_product_staging_v1: true },
    },
    criteria: [
      "Are all three labels readable and distinct from each other in ON?",
      "Does one bottle lead, or do all three carry the same weight?",
      "Do the three still read as one group on one surface under one light?",
      "Does anything in the frame hold more contrast than the bottles?",
    ],
    regressions: [
      "Props were removed and the grouping went with them — three bottles now float separately.",
      "Fewer or more than three bottles.",
      "Two bottles became copies of each other.",
    ],
  },
  {
    id: "K3_seasonal",
    title: "Calibration 3 — seasonal campaign",
    concept: "Khuyến mãi Tết của Cafe Florian, chai cold brew đóng chai",
    brandName: "Cafe Florian",
    useCase: "poster",
    aspectRatio: "4:5",
    objective: "Thúc đẩy mua trong dịp Tết, giữ không khí Tết Sài Gòn",
    audience: "Khách quen của quán và người mua quà Tết, 25-45",
    productCount: 1,
    flags: { off: BASE_ON, on: { ...BASE_ON, ...CONSTRAINT_ON } },
    criteria: [
      "Count the seasonal objects in each frame — blossoms, envelopes, lanterns, ornaments. Write both numbers down.",
      "In ON, is the season still legible? It must be. Removing Tết entirely is a failure, not a fix.",
      "Is the season carried more by colour, light and surface in ON than by objects?",
      "Which does the eye reach first in each frame, the bottle or the decoration?",
      "Is the bottle ever overlapped or crowded by a seasonal element in ON?",
    ],
    regressions: [
      "ON has no seasonal signal at all — the correction removed the campaign instead of subordinating it.",
      "ON still has decoration competing with the bottle for the eye — the correction did not take.",
      "Seasonal text, characters or couplets are drawn by the model.",
    ],
  },
];

/**
 * The one comparison that decides Test C, and it is not a per-image judgement.
 *
 * Phase 5.0 found trust and desire producing identical layout numbers; Phase 5.1
 * validation found them differing in text. Whether that difference survives into
 * pixels can only be seen by looking at the three ON renders together, so it is
 * written as its own step rather than left to be noticed.
 */
export const CROSS_CASE_CHECK = {
  id: "C_cross",
  title: "Test C — the comparison that matters",
  steps: [
    "Lay the three ON renders side by side with no labels.",
    "Ask someone who has not read this file to sort them into trust / desire / act-now.",
    "Record what they said before telling them the answer.",
  ],
  pass: "Two of three sorted correctly by someone with no context.",
  fail: "The three are interchangeable — which is the Phase 5.0 result surviving into pixels, and means the text differentiation never reached the image.",
};

/** Everything that must be true of every render, whatever the case. */
export const UNIVERSAL_CHECKS = [
  "No invented text, price, badge, slogan or watermark anywhere in the frame.",
  "No logo drawn by the model.",
  "Product identity unchanged from the uploaded reference: same label, same shape, same colour.",
  "Nothing important crosses into a reserved zone — the top band, the bottom band, the logo corner.",
  "The render completed without falling back to the stable pipeline (check features_enabled in the log).",
];
