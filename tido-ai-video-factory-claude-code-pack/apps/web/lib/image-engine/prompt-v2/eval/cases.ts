/**
 * The eval set: 23 briefs chosen to cover the shapes that behave differently.
 *
 * Five asset types, all three ratios the provider accepts, copy from none to 326
 * characters, one product and several, Vietnamese and English, and the two cases
 * the audit named: the Centella pair at 1:1 with 326 characters as one string, and
 * a brand whose name is not the product line.
 *
 * Industry spread is deliberate but secondary. What makes a case earn a row is a
 * different SHAPE -- a different ratio, a different copy load, a different number
 * of products -- because that is what the engine branches on.
 */
import { CENTELLA_COPY } from "../golden-fixtures";

export interface EvalCase {
  id: string;
  assetType: string;
  aspectRatio: "1:1" | "9:16" | "16:9";
  concept: string;
  /** Exactly as a client would type it, newlines included. */
  contentMessage: string;
  brand: string;
  productLine?: string;
  products: Array<{ description: string; labelText?: string }>;
  notes?: string;
}

export const EVAL_CASES: EvalCase[] = [
  // ── the audit's own case ─────────────────────────────────────────────────
  {
    id: "centella_pair_poster_1x1_326chars",
    assetType: "Poster",
    aspectRatio: "1:1",
    concept: "Hai chai serum Centella trên nền đá sáng, ánh sáng dịu, cảm giác sạch và dịu da cho người da nhạy cảm.",
    contentMessage: CENTELLA_COPY,
    brand: "SKIN1004",
    productLine: "Centella",
    products: [
      { description: "30ml frosted glass serum bottle with dropper cap", labelText: "SKIN1004 Centella Ampoule" },
      { description: "100ml clear toner bottle with pump", labelText: "SKIN1004 Centella Toning Toner" },
    ],
    notes: "The case that produced the measured spelling failure. 326 characters as ONE string.",
  },

  // ── poster ───────────────────────────────────────────────────────────────
  {
    id: "coffee_poster_1x1",
    assetType: "Poster",
    aspectRatio: "1:1",
    concept: "A quiet morning ritual: a glass bottle of cold brew on stone, low directional light.",
    contentMessage: "Slow mornings\nCold brew, done properly\nĐặt ngay",
    brand: "Origin Blend",
    products: [{ description: "amber glass bottle, turned wood cap", labelText: "ORIGIN BLEND" }],
  },
  {
    id: "watch_poster_9x16",
    assetType: "Poster",
    aspectRatio: "9:16",
    concept: "A steel watch on brushed metal, shot like an object in a museum case.",
    contentMessage: "Thời gian của bạn\nMeridian 1904",
    brand: "Meridian",
    products: [{ description: "stainless steel wristwatch, black dial", labelText: "MERIDIAN" }],
  },
  {
    id: "bakery_poster_16x9",
    assetType: "Poster",
    aspectRatio: "16:9",
    concept: "Bread just out of the oven on a floured wooden bench, morning light through a side window.",
    contentMessage: "Nướng mỗi sáng\nBánh mì bột chua\nGhé tiệm",
    brand: "Lò Bánh Mộc",
    products: [{ description: "sourdough loaf with a dark crust" }],
  },
  {
    id: "detergent_poster_1x1_trust",
    assetType: "Poster",
    aspectRatio: "1:1",
    concept: "A detergent bottle beside folded white cotton, plain daylight, nothing dramatised.",
    contentMessage: "Sạch là đủ\nKhông hương liệu tạo mùi",
    brand: "Minh Clean",
    products: [{ description: "1L opaque white detergent bottle with a blue cap", labelText: "MINH CLEAN" }],
  },
  {
    id: "lipstick_poster_9x16_editorial",
    assetType: "Poster",
    aspectRatio: "9:16",
    concept: "A lipstick standing on a torn paper ground, one hard light, an editorial page rather than an ad.",
    contentMessage: "Màu của buổi tối",
    brand: "Rouge Hà Nội",
    products: [{ description: "matte black lipstick case, brass ring" }],
  },

  // ── banner ───────────────────────────────────────────────────────────────
  {
    id: "earbuds_banner_16x9",
    assetType: "Web Banner",
    aspectRatio: "16:9",
    concept: "Earbuds and their case on a pale desk, clean and quiet, nothing futuristic.",
    contentMessage: "Nghe rõ hơn\nGiảm 20%\nMua ngay",
    brand: "Sona",
    products: [{ description: "white wireless earbuds with charging case", labelText: "SONA" }],
  },
  {
    id: "toothpaste_banner_16x9_family",
    assetType: "Web Banner",
    aspectRatio: "16:9",
    concept: "A toothpaste tube standing on a bathroom shelf, ordinary morning light.",
    contentMessage: "Cả nhà dùng được\nMua ngay",
    brand: "Ngọc Lan",
    products: [{ description: "blue and white toothpaste tube", labelText: "NGOC LAN" }],
  },
  {
    id: "insurance_banner_1x1_text_heavy",
    assetType: "Web Banner",
    aspectRatio: "1:1",
    concept: "A house key on a plain table, nothing else, as calm as a document.",
    contentMessage: "Bảo vệ ngôi nhà của bạn trước mọi rủi ro cháy nổ và thiên tai\nChỉ từ 99.000đ mỗi tháng\nTìm hiểu thêm\nĐiều khoản áp dụng",
    brand: "An Tâm",
    products: [{ description: "a single brass house key" }],
    notes: "Four strings on a banner that carries two. Must adapt and warn.",
  },
  {
    id: "juice_banner_9x16_motion",
    assetType: "Web Banner",
    aspectRatio: "9:16",
    concept: "Orange juice poured into a glass, the splash caught mid-air.",
    contentMessage: "Tươi mỗi ngày\nUống ngay",
    brand: "Vườn Cam",
    products: [{ description: "clear glass bottle of orange juice", labelText: "VUON CAM" }],
  },

  // ── social ───────────────────────────────────────────────────────────────
  {
    id: "serum_social_9x16",
    assetType: "Social Ad",
    aspectRatio: "9:16",
    concept: "A serum bottle held in a hand against a bathroom tile wall, phone-lit, close.",
    contentMessage: "Da dịu sau 7 ngày\nThử ngay",
    brand: "Thanh Mộc",
    products: [{ description: "30ml amber serum bottle with dropper" }],
  },
  {
    id: "sneaker_social_1x1",
    assetType: "Social Ad",
    aspectRatio: "1:1",
    concept: "One sneaker on wet asphalt at night, the city reflected in the puddle.",
    contentMessage: "Chạy đêm\nBộ sưu tập mới",
    brand: "Bước",
    products: [{ description: "white running sneaker with a black sole" }],
  },
  {
    id: "coffee_social_16x9_thumbnail",
    assetType: "Social Ad",
    aspectRatio: "16:9",
    concept: "An iced coffee on a café table, condensation running down the glass.",
    contentMessage: "Mát cả buổi chiều",
    brand: "Cà Phê Cũ",
    products: [{ description: "tall glass of iced coffee with a paper straw" }],
  },
  {
    id: "snack_social_9x16_two_products",
    assetType: "Social Ad",
    aspectRatio: "9:16",
    concept: "Two snack bags standing side by side on a school desk, bright and plain.",
    contentMessage: "Hai vị mới\nMua thử",
    brand: "Giòn",
    products: [
      { description: "green snack bag, seaweed flavour", labelText: "GION rong biển" },
      { description: "red snack bag, chilli flavour", labelText: "GION ớt" },
    ],
  },

  // ── product hero ─────────────────────────────────────────────────────────
  {
    id: "watch_hero_1x1_no_copy",
    assetType: "Product Hero",
    aspectRatio: "1:1",
    concept: "The watch alone, examined the way a collector examines it.",
    contentMessage: "",
    brand: "Meridian",
    products: [{ description: "stainless steel wristwatch, black dial, leather strap" }],
  },
  {
    id: "perfume_hero_9x16_no_copy",
    assetType: "Product Hero",
    aspectRatio: "9:16",
    concept: "A perfume bottle on glass, lit so the liquid reads as a colour and not as a reflection.",
    contentMessage: "",
    brand: "Nhã",
    products: [{ description: "square glass perfume bottle, gold cap" }],
  },
  {
    id: "laptop_hero_16x9_one_line",
    assetType: "Product Hero",
    aspectRatio: "16:9",
    concept: "A thin laptop three-quarters open on a bare desk, the screen dark.",
    contentMessage: "Mỏng hơn",
    brand: "Vệt",
    products: [{ description: "thin aluminium laptop, closed hinge visible" }],
  },
  {
    id: "jar_hero_1x1_three_products",
    assetType: "Product Hero",
    aspectRatio: "1:1",
    concept: "Three jars of honey in a row, lit so each one reads a different shade.",
    contentMessage: "Ba vùng hoa",
    brand: "Mật Rừng",
    products: [
      { description: "250g glass honey jar, light amber", labelText: "MAT RUNG hoa nhãn" },
      { description: "250g glass honey jar, mid amber", labelText: "MAT RUNG hoa cà phê" },
      { description: "250g glass honey jar, dark amber", labelText: "MAT RUNG hoa rừng" },
    ],
  },

  // ── UGC ──────────────────────────────────────────────────────────────────
  {
    id: "serum_ugc_9x16",
    assetType: "UGC",
    aspectRatio: "9:16",
    concept: "Someone holding the serum in a real bathroom, towel on the rail, morning.",
    contentMessage: "",
    brand: "Thanh Mộc",
    products: [{ description: "30ml amber serum bottle with dropper" }],
  },
  {
    id: "snack_ugc_1x1_caption",
    assetType: "UGC",
    aspectRatio: "1:1",
    concept: "A snack bag open on a sofa, TV light on the wall, a hand reaching in.",
    contentMessage: "Hết nửa gói rồi",
    brand: "Giòn",
    products: [{ description: "green snack bag, seaweed flavour" }],
  },
  {
    id: "coffee_ugc_16x9_desk",
    assetType: "UGC",
    aspectRatio: "16:9",
    concept: "A coffee cup beside a laptop on a messy desk, afternoon light from a window.",
    contentMessage: "",
    brand: "Cà Phê Cũ",
    products: [{ description: "paper coffee cup with a plastic lid" }],
  },

  // ── edges ────────────────────────────────────────────────────────────────
  {
    id: "english_poster_16x9_long_headline",
    assetType: "Poster",
    aspectRatio: "16:9",
    concept: "A bicycle leaning on a wall at dusk, the street lights just coming on.",
    contentMessage:
      "The ride home is the best part of the day, and it starts the moment you leave the office behind\nMade for the commute\nFind a store",
    brand: "Đạp",
    products: [{ description: "steel city bicycle, leather saddle" }],
    notes: "A headline well over the poster budget. Must adapt and warn.",
  },
  {
    id: "no_product_poster_1x1",
    assetType: "Poster",
    aspectRatio: "1:1",
    concept: "An empty chair by a window, afternoon light across the floor. A service, not an object.",
    contentMessage: "Nghỉ một chút\nĐặt lịch",
    brand: "Tĩnh",
    products: [],
    notes: "No product photo at all: the engine must not invent one.",
  },
];

export const EVAL_CASE_COUNT = EVAL_CASES.length;
