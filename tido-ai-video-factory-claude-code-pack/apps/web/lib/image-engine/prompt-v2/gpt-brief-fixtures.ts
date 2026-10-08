/**
 * The briefs the GPT-dialect golden suite pins, and the one place they are defined.
 *
 * WHY A SECOND FIXTURE FILE
 * -------------------------
 * `golden-fixtures.ts` holds three briefs shaped for the v1 eight-block assembly — one
 * product, no copy, and the 326-character single-string case. They are the right three
 * for that compiler and the wrong set for this one: nothing in them packs a reference
 * sheet, none of them is 9:16, and none carries a brand kit that fights the product.
 *
 * These fourteen are chosen for the shapes that make the GPT brief BEHAVE differently:
 * the product count crossing the sheet-packing thresholds (1, 2, 3, 4, 5, 8), each
 * canvas, an empty concept, no copy at all, a style reference showing a different
 * product, and a brand kit whose colour collides with the product's own.
 *
 * Deliberately NOT one per industry. The industry label may only ever reach the prompt
 * as a spelling, so a fixture per industry would pin fourteen copies of one behaviour.
 *
 * Pure data plus one pure builder. No I/O, no clock, no model call.
 */
import {
  allocateReferences,
  type Allocation,
  type AllocationInput,
} from "../provider/reference-packing/reference-allocation";
import { SUNBURST } from "../models/image-model-profiles";
import type { GptBriefInput, GptReference } from "./gpt-brief";

export interface FixtureProduct {
  description: string;
  /** Two images sharing this are two angles of ONE product. Absent means distinct. */
  productId?: string;
  /** Pixel size of the upload. Decides the panel arithmetic, so it is explicit. */
  width?: number;
  height?: number;
}

export interface GptBriefFixture {
  id: string;
  assetType: string;
  aspectRatio: "1:1" | "9:16" | "16:9";
  /** The RAW enum, exactly as the brief panel stores it. The leak this suite watches. */
  industry?: string;
  intendedUse?: string;
  concept: string;
  brand: string;
  /** The client's strings, in order, exactly as typed. */
  copy: string[];
  products: FixtureProduct[];
  /** A supplied logo image. */
  logo?: boolean;
  /** A mood / inspiration reference. Never travels as an image. */
  styleRef?: { description: string };
  productFacts?: string[];
  brandKit?: GptBriefInput["brandKit"];
  strategy?: { label: string; text: string }[];
  /** Why this fixture exists. Read by a human, never by the code. */
  notes: string;
}

/** 1024×1024 uploads unless a fixture says otherwise: the common case from a phone crop. */
const SQ = { width: 1024, height: 1024 };

export const GPT_BRIEF_FIXTURES: GptBriefFixture[] = [
  {
    id: "01_one_product_square",
    assetType: "Poster",
    aspectRatio: "1:1",
    industry: "coffee_tea",
    intendedUse: "an in-store poster",
    concept:
      "A quiet morning ritual: one bottle of cold brew on stone, low directional light, calm and unhurried.",
    brand: "Origin Blend",
    copy: ["Slow mornings", "Cold brew, done properly", "Đặt ngay"],
    products: [{ description: "amber glass bottle of cold brew with a turned wood cap", ...SQ }],
    productFacts: ['the front label reads "ORIGIN BLEND / COLD BREW"', "glass, matte wood cap"],
    notes: "One product, one slot, no packing. The simplest shape the dialect handles.",
  },
  {
    id: "02_two_products_square",
    assetType: "Poster",
    aspectRatio: "1:1",
    industry: "beauty_skincare",
    intendedUse: "a social post",
    concept: "Two serums side by side on pale stone, clean and clinical, nothing decorative.",
    brand: "Centella Co",
    copy: ["Dịu da sau 14 ngày", "Mua 2 tặng 1"],
    products: [
      { description: "30ml frosted glass serum bottle with a dropper", ...SQ },
      { description: "50ml white pump bottle of moisturiser", ...SQ },
    ],
    notes: "Two distinct products, both fit as full slots at the two-reference ceiling.",
  },
  {
    id: "03_three_products_square",
    assetType: "Social Ad",
    aspectRatio: "1:1",
    industry: "fmcg",
    concept: "Three cans standing in a row, bright and graphic, flat afternoon light.",
    brand: "Tonic",
    copy: ["Ba vị mới", "Có mặt tại mọi cửa hàng"],
    products: [
      { description: "slim can, citrus", ...SQ },
      { description: "slim can, berry", ...SQ },
      { description: "slim can, ginger", ...SQ },
    ],
    notes: "Three products against a two-slot ceiling: the first case that must pack a sheet.",
  },
  {
    id: "04_four_dishes_fast_food",
    assetType: "Poster",
    aspectRatio: "1:1",
    industry: "food_beverage",
    intendedUse: "a menu board",
    concept:
      "Four dishes on a warm wooden counter, shot from just above, generous and appetising, steam still rising.",
    brand: "Mì Bảy",
    copy: ["Combo trưa", "Bốn món, một giá", "Chỉ 59K", "Gọi ngay"],
    products: [
      { description: "a bowl of beef noodle soup", ...SQ },
      { description: "a plate of grilled pork rice", ...SQ },
      { description: "a basket of fried spring rolls", ...SQ },
      { description: "a glass of iced lemon tea", ...SQ },
    ],
    productFacts: ["the bowl is white ceramic", "the glass is clear, tall, with a straw"],
    notes: "The reviewer's second required golden. Four panels is one full sheet.",
  },
  {
    id: "05_five_drinks_prices_florian",
    assetType: "Social Ad",
    aspectRatio: "1:1",
    industry: "coffee_tea",
    intendedUse: "a Tết promotional post",
    concept:
      "A warm, inviting festive cafe celebrating Tết: the five signature drinks together on a wooden tabletop, delicate yellow apricot blossom in the background, a cosy holiday gathering mood.",
    brand: "Florian",
    copy: [
      "Florian Cafe",
      "Nơi giúp bạn giải tỏa căng thẳng",
      "Bằng những ly nước ngọt ngào",
      "Chỉ từ 30K",
      "Caramel coffee - 35K",
      "Trà cam - 40K",
      "Trà việt quất - 40K",
      "Matcha hạt sen - 45K",
      "Matcha Latte - 40K",
    ],
    products: [
      { description: "a tall clear cup of iced caramel coffee", ...SQ },
      { description: "a clear cup of iced orange tea with fruit slices", ...SQ },
      { description: "a clear cup of iced blueberry tea", ...SQ },
      { description: "a cup of iced matcha with lotus seed", ...SQ },
      { description: "a cup of iced matcha latte, layered", ...SQ },
    ],
    notes:
      "The reviewer's first required golden, taken from the live render gen_1791450163915_8eocz. Five products across two sheets; every panel falls below the 512px identity floor.",
  },
  {
    id: "06_eight_products_square",
    assetType: "Poster",
    aspectRatio: "1:1",
    industry: "home_lifestyle",
    concept: "The whole range laid out on linen, seen from above, orderly and calm.",
    brand: "Thao Home",
    copy: ["Trọn bộ tám món"],
    products: [
      { description: "a ceramic mug", ...SQ },
      { description: "a stoneware plate", ...SQ },
      { description: "a glass tumbler", ...SQ },
      { description: "a linen napkin", ...SQ },
      { description: "a wooden tray", ...SQ },
      { description: "a small bowl", ...SQ },
      { description: "a teapot", ...SQ },
      { description: "a brass spoon", ...SQ },
    ],
    notes: "The intake ceiling. Eight panels across two sheets, four to a sheet.",
  },
  {
    id: "07_vertical_three_products",
    assetType: "Social Ad",
    aspectRatio: "9:16",
    industry: "food_beverage",
    intendedUse: "an Instagram story",
    concept: "Three cups held up against evening light, movement and warmth, shot on a phone.",
    brand: "Rót",
    copy: ["Giờ vàng 3 - 5 giờ chiều", "Mua 1 tặng 1"],
    products: [
      { description: "a cup of iced milk tea", ...SQ },
      { description: "a cup of peach tea", ...SQ },
      { description: "a cup of black coffee", ...SQ },
    ],
    notes: "The vertical canvas, where the platform's own interface eats the top and bottom.",
  },
  {
    id: "08_wide_one_product",
    assetType: "Banner",
    aspectRatio: "16:9",
    industry: "electronics_tech",
    intendedUse: "a website hero banner",
    concept: "The speaker alone on a dark surface, one hard light raking across it, nothing else.",
    brand: "Nghe",
    copy: ["Âm thanh thật", "Đặt trước"],
    products: [{ description: "a matte black cylindrical bluetooth speaker", width: 2048, height: 1365 }],
    notes: "The wide canvas and the banner profile, whose legibility floor is nearly double a poster's.",
  },
  {
    id: "09_culturally_specific_concept",
    assetType: "Poster",
    aspectRatio: "1:1",
    industry: "food_beverage",
    intendedUse: "a Trung thu campaign poster",
    concept:
      "Trung thu in a northern Vietnamese courtyard: a star-shaped paper lantern, a plate of traditional mooncakes cut open to show the salted egg yolk, lacquered wood, late evening light. Not Chinese Mid-Autumn iconography and not Japanese lanterns.",
    brand: "Bánh Xưa",
    copy: ["Trung thu đoàn viên", "Đặt bánh trước 20/8"],
    products: [{ description: "a traditional baked mooncake, cut to show the salted egg yolk", ...SQ }],
    notes:
      "A concept naming a culture and the confusion to exclude. The brief must carry the client's own exclusion rather than consult any table.",
  },
  {
    id: "10_empty_concept",
    assetType: "Product Hero",
    aspectRatio: "1:1",
    industry: "fashion_apparel",
    concept: "",
    brand: "Hai Mươi",
    copy: ["Bộ sưu tập mới"],
    products: [{ description: "a tan leather crossbody bag", ...SQ }],
    notes: "Nothing to derive an idea from. The sheet must still resolve every field.",
  },
  {
    id: "11_no_copy",
    assetType: "Product Hero",
    aspectRatio: "1:1",
    industry: "electronics_tech",
    intendedUse: "a catalogue packshot",
    concept: "The watch alone on brushed steel, examined the way a collector examines it.",
    brand: "Meridian",
    copy: [],
    products: [{ description: "a stainless steel wristwatch, black dial, leather strap", ...SQ }],
    notes: "No copy at all: the TEXT section must declare that, and nothing may be quoted.",
  },
  {
    id: "12_industry_other",
    assetType: "Poster",
    aspectRatio: "1:1",
    industry: "other",
    concept: "A single object on a plain surface, honest and plain, no styling.",
    brand: "Khác",
    copy: ["Sản phẩm mới"],
    products: [{ description: "a small unbranded cardboard box", ...SQ }],
    notes: 'Industry "other" — the label a brief uses when it refuses to be categorised.',
  },
  {
    id: "13_mood_image_of_another_product",
    assetType: "Poster",
    aspectRatio: "1:1",
    industry: "beauty_skincare",
    concept: "The bottle lit the way the reference is lit: one side light, deep shadow, matte stone.",
    brand: "Lụa",
    copy: ["Dưỡng ẩm ban đêm"],
    products: [{ description: "a frosted glass bottle of night cream", ...SQ }],
    styleRef: { description: "a photograph of a wristwatch on slate, single hard side light" },
    notes:
      "The mood image shows a DIFFERENT product. Its light and composition may travel; its objects may not.",
  },
  {
    id: "14_brand_kit_clashes_with_product",
    assetType: "Poster",
    aspectRatio: "1:1",
    industry: "fmcg",
    concept: "The bottle on a flat ground, graphic and bold, one colour doing all the work.",
    brand: "Đỏ",
    copy: ["Vị mới", "Thử ngay"],
    products: [{ description: "a bright red plastic bottle of chilli sauce", ...SQ }],
    productFacts: ["the bottle is bright red", "the cap is black"],
    brandKit: {
      colors: [
        { hex: "#e01b24", role: "primary" },
        { hex: "#111111", role: "text" },
      ],
      fonts: { heading: "a tall condensed sans", body: "a plain grotesque" },
      stylePreferred: ["graphic", "high contrast"],
      styleForbidden: ["pastel", "watercolour"],
      hasLogoImage: true,
    },
    logo: true,
    notes:
      "The kit's primary is the product's own colour. The background may not be it, or the product disappears.",
  },
];

/** The allocation this fixture produces on the active model's ceilings. */
export function allocationFor(fx: GptBriefFixture): Allocation {
  const inputs: AllocationInput[] = [];
  let index = 0;
  for (const p of fx.products) {
    index += 1;
    inputs.push({
      id: String(index),
      kind: "product",
      productId: p.productId ?? null,
      width: p.width ?? SQ.width,
      height: p.height ?? SQ.height,
      filename: `product_${index}.png`,
    });
  }
  if (fx.logo) {
    index += 1;
    inputs.push({ id: String(index), kind: "logo", width: 512, height: 512, filename: "logo.png" });
  }
  if (fx.styleRef) {
    index += 1;
    inputs.push({ id: String(index), kind: "style", width: 1024, height: 1024, filename: "mood.png" });
  }
  return allocateReferences(inputs, {
    limit: SUNBURST.maxReferences,
    maxPanelsPerSheet: SUNBURST.maxPanelsPerSheet,
    sheetSizePx: SUNBURST.sheetSizePx,
  });
}

/** The references in the order the provider appends them. */
export function referencesFor(fx: GptBriefFixture): GptReference[] {
  const out: GptReference[] = [];
  let index = 0;
  for (const p of fx.products) {
    index += 1;
    out.push({ index, role: "PRODUCT", filename: `product_${index}.png`, description: p.description });
  }
  if (fx.logo) {
    index += 1;
    out.push({ index, role: "LOGO", filename: "logo.png", description: "the supplied logo" });
  }
  if (fx.styleRef) {
    index += 1;
    out.push({
      index,
      role: "INSPIRATION_REFERENCE",
      filename: "mood.png",
      description: fx.styleRef.description,
    });
  }
  return out;
}

/**
 * The brief input, exactly as the pipeline adapter builds it TODAY.
 *
 * No art-director fields. This is the flag-OFF shape, and the golden suite depends on it
 * staying that shape: the moment this function starts populating a new field, flag OFF
 * stops being flag OFF.
 */
export function briefInputFor(fx: GptBriefFixture): GptBriefInput {
  return {
    assetType: fx.assetType,
    aspectRatio: fx.aspectRatio,
    industry: fx.industry,
    intendedUse: fx.intendedUse,
    productCount: fx.products.length,
    concept: fx.concept,
    brand: fx.brand,
    copy: fx.copy,
    references: referencesFor(fx),
    allocation: allocationFor(fx),
    minPanelLongestSidePx: SUNBURST.minPanelLongestSidePx,
    productFacts: fx.productFacts,
    brandKit: fx.brandKit ?? null,
    strategy: fx.strategy,
    productCountRule:
      fx.products.length > 1
        ? "Several products: group them with a clear hierarchy, the main product largest, none deformed or duplicated."
        : "One product: one focal point.",
  };
}

export function fixtureById(id: string): GptBriefFixture {
  const fx = GPT_BRIEF_FIXTURES.find((f) => f.id === id);
  if (!fx) throw new Error(`no GPT brief fixture named ${id}`);
  return fx;
}
