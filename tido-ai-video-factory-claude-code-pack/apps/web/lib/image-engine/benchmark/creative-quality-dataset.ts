/**
 * Phase 5.6.1 — the fixed creative benchmark dataset.
 *
 * Twelve briefs across six commercial categories, frozen so that a score
 * measured today and a score measured after the PromptAssembler are comparable.
 * Nothing here may change without invalidating every stored baseline: the
 * dataset IS the control variable.
 *
 * WHY MOST BRIEFS CARRY NO PRODUCT PHOTO
 * --------------------------------------
 * The repository has exactly two real product assets, which cannot represent
 * six categories. A brief that describes its product in words tests the part
 * this benchmark exists to measure -- whether the creative brain reasons -- and
 * removes a dependency on asset files that would make the baseline unreproducible
 * on another machine. Two briefs DO carry the real bottle and logo, because
 * product-identity protection is a quality property in its own right and a
 * shorter prompt could silently drop the identity lock.
 *
 * WHY NO BRIEF USES 4:5
 * ----------------------
 * The UI offers that ratio and falls back to it, but the image provider rejects
 * it (`IMGSTUDIO_SUPPORTED_ASPECT_RATIOS` is 1:1, 9:16, 16:9). Such a brief
 * fails at the provider AFTER the whole director pipeline has run, burning four
 * model calls and returning nothing to score. That mismatch is a real open
 * defect, tracked separately; a benchmark is the wrong place to demonstrate it.
 *
 * WHY THE TEXT VARIES
 * -------------------
 * Four briefs supply no text, four supply English, four supply Vietnamese with
 * diacritics. Typography is the dimension most exposed by prompt reduction, and
 * Vietnamese is where this system has historically failed first.
 */

export type BenchmarkCategory = "food" | "beverage" | "beauty" | "fmcg" | "technology" | "fashion";

export interface BenchmarkBrief {
  id: string;
  category: BenchmarkCategory;
  /** What the client wants, in their own words. */
  concept: string;
  /** Exact lines that must appear, or none. */
  contentMessage?: string;
  useCase: string;
  aspectRatio: string;
  brandName?: string;
  /** Real asset files, relative to apps/web. Absent means a concept-only brief. */
  productImage?: string;
  logoImage?: string;
  /** What a reviewer should weigh most heavily for this brief. Never scored automatically. */
  emphasis: string[];
}

/** Frozen. Changing a brief invalidates every stored baseline. */
export const BENCHMARK_BRIEFS: BenchmarkBrief[] = [
  // ── FOOD ────────────────────────────────────────────────────────────────
  {
    id: "food_hot_sauce_playful",
    category: "food",
    concept:
      "Quảng cáo tương ớt cao cấp, vui nhộn và nhiều năng lượng. Ớt tươi bay quanh chai, cảm giác cay bùng nổ nhưng vẫn sạch sẽ và chuyên nghiệp.",
    contentMessage: "CAY ĐÚNG ĐIỆU\nTương ớt thật, vị thật",
    useCase: "Poster",
    aspectRatio: "1:1",
    brandName: "Vifon",
    emphasis: ["appetite appeal", "ingredient storytelling", "product hero"],
  },
  {
    id: "food_bakery_warm",
    category: "food",
    concept:
      "A warm artisan bakery advertisement. Fresh sourdough on a floured wooden counter at dawn, steam still rising, an unhurried craft feeling.",
    useCase: "Social Ad",
    aspectRatio: "9:16",
    emphasis: ["appetite appeal", "texture", "warmth"],
  },

  // ── BEVERAGE ────────────────────────────────────────────────────────────
  {
    id: "beverage_coffee_premium",
    category: "beverage",
    concept:
      "Premium cold brew coffee advertisement. A quiet morning ritual for young professionals: a glass bottle on stone, low directional light, calm and sophisticated.",
    contentMessage: "Slow mornings\nCold brew, done properly",
    useCase: "Poster",
    aspectRatio: "1:1",
    brandName: "Origin Blend",
    productImage: "test-assets/real_product_bottle.png",
    emphasis: ["mood", "storytelling", "product focus", "product identity preserved"],
  },
  {
    id: "beverage_juice_splash",
    category: "beverage",
    concept:
      "Nước ép trái cây tươi, cảm giác mát lạnh và chuyển động. Trái cây tươi và tia nước bắn quanh sản phẩm, nền sáng sạch.",
    contentMessage: "Tươi mỗi ngày\nGiảm 20% tuần này",
    useCase: "Social Ad",
    aspectRatio: "9:16",
    emphasis: ["freshness", "motion", "ingredient storytelling"],
  },

  // ── BEAUTY ──────────────────────────────────────────────────────────────
  {
    id: "beauty_serum_luxury",
    category: "beauty",
    concept:
      "Luxury skincare serum campaign. Clean negative space, soft directional light across glass, a sense of purity and restraint. Nothing decorative.",
    useCase: "Poster",
    aspectRatio: "9:16",
    emphasis: ["elegance", "clean composition", "luxury feeling", "negative space"],
  },
  {
    id: "beauty_lipstick_editorial",
    category: "beauty",
    concept:
      "Editorial beauty advertisement for a matte lipstick. Bold single colour field, sculptural shadow, confident and modern rather than pretty.",
    contentMessage: "BOLD BY DEFAULT",
    useCase: "Poster",
    aspectRatio: "1:1",
    emphasis: ["elegance", "art direction", "colour discipline"],
  },

  // ── FMCG ────────────────────────────────────────────────────────────────
  {
    id: "fmcg_detergent_trust",
    category: "fmcg",
    concept:
      "Household laundry detergent advertisement. Trustworthy and clear: the packaging is the hero, clean bright light, honest and uncluttered.",
    contentMessage: "Sạch sâu\nAn toàn cho da nhạy cảm",
    useCase: "Poster",
    aspectRatio: "1:1",
    emphasis: ["clarity", "packaging importance", "brand communication"],
  },
  {
    id: "fmcg_toothpaste_family",
    category: "fmcg",
    concept:
      "A family toothpaste advertisement. Reassuring and clinical without being cold: clean surfaces, confident product placement, everyday trust.",
    useCase: "Banner",
    aspectRatio: "16:9",
    emphasis: ["clarity", "packaging importance", "trust"],
  },

  // ── TECHNOLOGY ──────────────────────────────────────────────────────────
  {
    id: "tech_earbuds_modern",
    category: "technology",
    concept:
      "Modern wireless earbuds advertisement. Precision engineering, controlled reflections on brushed metal, a feeling of quiet innovation.",
    contentMessage: "Hear everything\nNothing else",
    useCase: "Poster",
    aspectRatio: "1:1",
    emphasis: ["innovation feeling", "premium design", "material honesty"],
  },
  {
    id: "tech_smart_speaker",
    category: "technology",
    concept:
      "Loa thông minh cho gia đình hiện đại. Thiết kế tối giản, ánh sáng dịu, cảm giác công nghệ thân thiện chứ không lạnh lẽo.",
    useCase: "Social Ad",
    aspectRatio: "16:9",
    emphasis: ["innovation feeling", "premium design", "lifestyle integration"],
  },

  // ── FASHION / LIFESTYLE ─────────────────────────────────────────────────
  {
    id: "fashion_watch_editorial",
    category: "fashion",
    concept:
      "Editorial campaign for a minimalist wristwatch. Strong graphic composition, dramatic single-source light, an image that would hold a full magazine page.",
    contentMessage: "TIME, CONSIDERED",
    useCase: "Poster",
    aspectRatio: "9:16",
    brandName: "TIDO",
    logoImage: "test-assets/real_tido_logo.png",
    emphasis: ["style", "emotional impact", "logo placed once and unaltered"],
  },
  {
    id: "fashion_leather_bag",
    category: "fashion",
    concept:
      "A leather handbag campaign with a sense of travel and quiet luxury. Natural light, considered props, an unposed editorial feeling.",
    useCase: "Social Ad",
    aspectRatio: "16:9",
    emphasis: ["style", "emotional impact", "material quality"],
  },
];

/** The six dimensions a reviewer scores. Fixed alongside the dataset. */
export interface QualityDimensionDefinition {
  key: string;
  title: string;
  question: string;
  /** What a 3, a 6 and a 9 look like, so two runs are scored on the same scale. */
  anchors: { low: string; mid: string; high: string };
}

export const QUALITY_DIMENSIONS: QualityDimensionDefinition[] = [
  {
    key: "creative_concept",
    title: "Creative Concept",
    question: "Is the idea memorable and original, or is this a product on a background?",
    anchors: {
      low: "A product photographed on a surface. No idea beyond 'show the product'.",
      mid: "A recognisable advertising idea, competently executed, but one seen many times.",
      high: "An idea a viewer could describe afterwards. The image says something the brief did not.",
    },
  },
  {
    key: "art_direction",
    title: "Art Direction",
    question: "Does this feel intentionally designed, with decisions behind the light, colour and framing?",
    anchors: {
      low: "Default rendering. Generic studio light, arbitrary colour, no point of view.",
      mid: "Coherent and clean, but the choices could belong to any brand.",
      high: "Every choice reads as deliberate and serves one idea.",
    },
  },
  {
    key: "composition",
    title: "Composition",
    question: "Hierarchy, balance, focal point and negative space.",
    anchors: {
      low: "Everything competes. No clear entry point; space is filled rather than shaped.",
      mid: "Balanced and readable, if conventional.",
      high: "The eye is led deliberately. Empty space is doing work.",
    },
  },
  {
    key: "product_presentation",
    title: "Product Presentation",
    question: "Is the product clear, important, and accurate to what was supplied?",
    anchors: {
      low: "The product is unclear, distorted, or not the hero. A supplied product is unrecognisable.",
      mid: "Clearly shown and correct, but not commanding.",
      high: "Unmistakably the hero, accurate, and shown at its best.",
    },
  },
  {
    key: "typography",
    title: "Typography",
    question: "Readability, hierarchy, integration with the image, and professionalism.",
    anchors: {
      low: "Unreadable, misspelled, colliding with the product, or obviously pasted on.",
      mid: "Correct and readable, but sits on the image rather than belonging to it.",
      high: "Reads instantly, hierarchy is unmistakable, and it looks set rather than added.",
    },
  },
  {
    key: "commercial_quality",
    title: "Commercial Quality",
    question: "Could a brand run this as a professional advertisement without redoing it?",
    anchors: {
      low: "Obviously machine-made. Would not pass a client review.",
      mid: "Usable with edits; would not embarrass the brand.",
      high: "Indistinguishable from professional commercial work.",
    },
  },
];
