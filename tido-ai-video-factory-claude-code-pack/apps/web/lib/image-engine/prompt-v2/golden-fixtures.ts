/**
 * The briefs the golden tests pin, and the one place they are defined.
 *
 * Three, chosen to cover the shapes that behave differently rather than to cover
 * many industries: one product with short copy, no copy at all, and the case the
 * audit named -- two products, 1:1, and 326 characters of copy arriving as ONE
 * string, which is what produced the measured spelling failure.
 *
 * Shared by the v1 golden suite and the v2 eval so both sides of a comparison are
 * answering the same brief.
 */

export interface GoldenFixture {
  id: string;
  assetType: string;
  aspectRatio: "1:1" | "9:16" | "16:9";
  concept: string;
  /** What the client typed into the copy field, exactly, newlines included. */
  contentMessage: string;
  /** What the client calls the brand. The audit found this field carrying a product line. */
  brandName: string;
  /** The product line, which the current input schema has nowhere to put. */
  productLine?: string;
  products: Array<{ ref: number; description: string; labelText?: string }>;
  notes?: string;
}

/** 326 characters as one unbroken string: the shape that broke the render. */
const CENTELLA_COPY =
  "Tinh chất Centella giúp làm dịu da nhanh, giảm mẩn đỏ rõ rệt sau 14 ngày sử dụng đều đặn mỗi tối, phục hồi hàng rào bảo vệ da và cấp ẩm sâu cho da khô ráp, nhạy cảm, dễ kích ứng; kết cấu mỏng nhẹ thấm nhanh không gây bết dính, phù hợp mọi loại da kể cả da mụn, dùng được cho cả nam và nữ, mua 2 tặng 1 chỉ trong tuần này";

export const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    id: "poster_one_product_short_copy",
    assetType: "Poster",
    aspectRatio: "1:1",
    concept:
      "A quiet morning ritual for young professionals: a glass bottle of cold brew on stone, low directional light, calm and sophisticated.",
    contentMessage: "Slow mornings\nCold brew, done properly\nĐặt ngay",
    brandName: "Origin Blend",
    products: [{ ref: 1, description: "amber glass bottle, turned wood cap, cold brew coffee", labelText: "ORIGIN BLEND" }],
  },
  {
    id: "hero_no_copy",
    assetType: "Product Hero",
    aspectRatio: "1:1",
    concept: "The watch alone on brushed steel, examined the way a collector examines it.",
    contentMessage: "",
    brandName: "Meridian",
    products: [{ ref: 1, description: "stainless steel wristwatch, black dial, leather strap" }],
  },
  {
    id: "centella_two_bottles_326_chars",
    assetType: "Poster",
    aspectRatio: "1:1",
    // The audit case. The copy arrives as ONE line, which is what made
    // `assignTextRoles` type all 326 characters as a single headline.
    concept:
      "Hai chai serum Centella đặt cạnh nhau trên nền đá sáng, ánh sáng dịu, cảm giác sạch và dịu da cho người da nhạy cảm.",
    contentMessage: CENTELLA_COPY,
    brandName: "Centella",
    productLine: "Centella",
    products: [
      { ref: 1, description: "30ml frosted glass serum bottle with dropper cap", labelText: "SKIN1004 Centella Ampoule" },
      { ref: 2, description: "100ml clear toner bottle with pump", labelText: "SKIN1004 Centella Toning Toner" },
    ],
    notes: "Brand is SKIN1004; Centella is the product line. The current input schema has one field for both.",
  },
];

export const CENTELLA_COPY_LENGTH = CENTELLA_COPY.length;
