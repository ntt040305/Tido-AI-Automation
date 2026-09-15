/**
 * The briefs Phase 5.0 measures the current layout engine against.
 *
 * Chosen to be as unlike each other as real work gets while staying in one
 * format. If a luxury serum, a neighbourhood coffee promotion, a running shoe, a
 * children's toy and a laptop all come out of the layout engine with the same
 * reasoning, the format is deciding and nothing else is — and these five are the
 * cheapest way to find that out.
 *
 * Deliberately no images, no buffers and no LLM. Everything here is an argument
 * list for `CommercialLayoutService.plan()`, which is a pure function of the
 * values below.
 *
 * These are a measuring stick, not a spec. Nothing in this file should ever be
 * read as what a poster for a skincare brand ought to look like.
 */

export interface LayoutBrief {
  id: string;
  label: string;
  /** What the campaign is for, in the words a brief would actually use. */
  objective: string;
  /** Free text, for the specificity test. Never reaches `plan()`. */
  product: string;
  audience: string;
  brand: string;
  /** Present when the client authorized exact strings. */
  copyItems?: string[];
  hasLogoAsset?: boolean;
  /** Distinct products attached. Recorded so the report can show it is ignored. */
  productCount?: number;
}

/** 1 — five different worlds, one format. */
export const FORMAT_BIAS_BRIEFS: LayoutBrief[] = [
  {
    id: "luxury_skincare",
    label: "Luxury skincare",
    objective: "Xây dựng nhận diện thương hiệu cao cấp cho dòng serum mới",
    product: "Serum dưỡng da cao cấp, chai thủy tinh tối màu, 30ml",
    audience: "Phụ nữ 30-45, thu nhập cao, đã dùng mỹ phẩm cao cấp",
    brand: "Maison Lumière",
    copyItems: ["Tinh chất phục hồi", "Ra mắt"],
    hasLogoAsset: true,
    productCount: 1,
  },
  {
    id: "coffee_promo",
    label: "Coffee shop promotion",
    objective: "Khuyến mãi mua 1 tặng 1 cho khung giờ sáng, thúc đẩy mua ngay",
    product: "Cold brew đóng chai, bán mang đi",
    audience: "Nhân viên văn phòng 25-35 đi làm sớm",
    brand: "Cafe Florian",
    copyItems: ["Mua 1 tặng 1", "Chỉ sáng nay"],
    hasLogoAsset: true,
    productCount: 1,
  },
  {
    id: "sports_shoe",
    label: "Sports product",
    objective: "Giới thiệu công nghệ đế giữa mới, để người chạy hiểu nó khác gì",
    product: "Giày chạy bộ, đế giữa đàn hồi cao",
    audience: "Người chạy phong trào 20-35, chạy 3-5 buổi mỗi tuần",
    brand: "Stride",
    copyItems: ["Đế giữa thế hệ mới"],
    hasLogoAsset: true,
    productCount: 1,
  },
  {
    id: "children_toy",
    label: "Children's product",
    objective: "Tạo cảm giác an toàn và tin tưởng cho phụ huynh khi chọn đồ chơi gỗ",
    product: "Bộ xếp hình gỗ tự nhiên, sơn gốc nước",
    audience: "Phụ huynh có con 2-5 tuổi, quan tâm vật liệu an toàn",
    brand: "Gỗ Nhỏ",
    copyItems: ["An toàn cho bé"],
    hasLogoAsset: true,
    productCount: 1,
  },
  {
    id: "tech_laptop",
    label: "Technology product",
    objective: "Ra mắt laptop mỏng nhẹ, nhấn vào thời lượng pin cả ngày",
    product: "Laptop 14 inch, vỏ nhôm, nặng 1.1kg",
    audience: "Người làm việc di động, 25-40",
    copyItems: ["Pin cả ngày", "1.1kg"],
    brand: "Vantek",
    hasLogoAsset: true,
    productCount: 1,
  },
];

/**
 * 2 — one product, four jobs.
 *
 * The same coffee, asked to do four different things. The objective is the one
 * campaign-level value the current engine reads at all, so this is the test it
 * has the best chance of passing.
 */
export const OBJECTIVE_BRIEFS: LayoutBrief[] = [
  {
    id: "coffee_trust",
    label: "A — build trust",
    objective: "Xây dựng niềm tin vào nguồn gốc hạt cà phê và quy trình rang",
    product: "Cold brew đóng chai",
    audience: "Khách quen của quán, 25-40",
    brand: "Cafe Florian",
    hasLogoAsset: true,
  },
  {
    id: "coffee_desire",
    label: "B — create desire",
    objective: "Tạo thèm muốn, khiến người xem muốn uống ngay khi nhìn thấy",
    product: "Cold brew đóng chai",
    audience: "Khách quen của quán, 25-40",
    brand: "Cafe Florian",
    hasLogoAsset: true,
  },
  {
    id: "coffee_purchase",
    label: "C — drive immediate purchase",
    objective: "Thúc đẩy mua ngay hôm nay với ưu đãi giảm giá buổi sáng",
    product: "Cold brew đóng chai",
    audience: "Khách quen của quán, 25-40",
    brand: "Cafe Florian",
    hasLogoAsset: true,
  },
  {
    id: "coffee_memory",
    label: "D — create brand memory",
    objective: "Xây dựng nhận diện thương hiệu để khách nhớ tới quán về lâu dài",
    product: "Cold brew đóng chai",
    audience: "Khách quen của quán, 25-40",
    brand: "Cafe Florian",
    hasLogoAsset: true,
  },
];

/**
 * 3 — one brief, one to four products.
 *
 * Everything else is held constant. Whatever differs in the output differs
 * because of the product count and nothing else.
 */
export const MULTI_PRODUCT_BRIEFS: LayoutBrief[] = [1, 2, 3, 4].map((n) => ({
  id: `products_${n}`,
  label: `${n} product${n === 1 ? "" : "s"}`,
  objective: "Giới thiệu dòng sản phẩm mới của quán",
  product: `${n} chai cold brew khác vị`,
  audience: "Nhân viên văn phòng 25-35",
  brand: "Cafe Florian",
  copyItems: ["Dòng mới"],
  hasLogoAsset: true,
  productCount: n,
}));

/** The formats the current engine claims to know. */
export const FORMATS = [
  "poster",
  "banner",
  "social_ad",
  "product_hero",
  "ugc_thumbnail",
  "billboard",
];

/**
 * Phrases that say nothing about a particular brief.
 *
 * Each would read identically under any of the five briefs above, which is the
 * whole definition being tested. Collected from the layout engine's own output
 * rather than invented, so the specificity test measures what the system says
 * and not what it might have said.
 */
export const GENERIC_MARKERS = [
  "balance",
  "clean composition",
  "premium feeling",
  "visually calm",
  "professional",
  "eye-catching",
  "aesthetically pleasing",
];

/** Words that tie a sentence to one brief rather than to any brief. */
export function briefAnchors(brief: LayoutBrief): string[] {
  return [
    brief.brand,
    ...brief.product.split(/[,\s]+/).filter((w) => w.length > 4),
    ...brief.audience.split(/[,\s]+/).filter((w) => w.length > 4),
    ...brief.objective.split(/[,\s]+/).filter((w) => w.length > 4),
  ].filter(Boolean);
}
