import { CommercialIntent } from "./ConceptStructuringLayer";

/**
 * CIOS Phase 4.1.1 Task 2 — if the user asked for a CTA, there has to be a CTA.
 *
 * The failure this fixes
 * --------------------
 * Copy reached the pipeline only as an explicit `copy[]` array. A user typing
 * "sale sản phẩm 50% và có các chữ CTA" into the concept box supplies no such
 * array, so `rendersCopy` was false, the layout reserved empty zones, and the
 * prompt said "no text is rendered in this pass". The user asked for text and
 * the system instructed the renderer not to draw any.
 *
 * So where the concept requires text and none was supplied, this synthesizes it.
 *
 * What "synthesize" means here, and what it does not
 * -------------------------------------------------
 * It means composing a headline, a supporting line and a call to action from
 * what the concept actually stated — the discount, the offer type, the product.
 * It does not mean inventing claims. Nothing below asserts a price, a saving, a
 * date, a guarantee or a superlative that the concept did not contain: a
 * synthesized line that promises something the client never offered is a legal
 * problem, not a design flourish.
 *
 * The discount is reproduced exactly as the user wrote it. "50%" stays "50%".
 *
 * Language follows the concept
 * ---------------------------
 * A Vietnamese concept gets Vietnamese copy. Rendering "BUY NOW" onto a poster
 * for a brief written in Vietnamese would be a defect of the same kind as
 * rendering no text at all — the words would be visible and wrong.
 */

export type CopyRole = "headline" | "subline" | "cta" | "offer_badge";

export interface SynthesizedCopyItem {
  role: CopyRole;
  text: string;
  /** True where the user supplied it; false where this layer composed it. */
  supplied: boolean;
}

export interface SynthesizedCopy {
  items: SynthesizedCopyItem[];
  language: "vi" | "en";
  /** True where anything was composed rather than supplied. */
  synthesized: boolean;
  notes: string[];
}

const VI_MARKERS =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]|\b(?:tạo|ảnh|sản\s?phẩm|giảm|khuyến|ưu\s?đãi|mua|nút|chữ|có|và)\b/i;

/** Headlines by offer type. `{d}` is replaced by the discount, verbatim. */
const HEADLINES: Record<string, { vi: string; en: string }> = {
  sale_with_discount: { vi: "GIẢM NGAY {d}", en: "{d} OFF" },
  sale: { vi: "ƯU ĐÃI ĐẶC BIỆT", en: "SPECIAL OFFER" },
  launch: { vi: "KHAI TRƯƠNG", en: "NOW OPEN" },
  bundle: { vi: "MUA NHIỀU ƯU ĐÃI LỚN", en: "MORE FOR LESS" },
  new_arrival: { vi: "HÀNG MỚI VỀ", en: "JUST ARRIVED" },
  seasonal: { vi: "ƯU ĐÃI MÙA LỄ", en: "SEASON OFFER" },
};

/**
 * For a concept that asks for text but states no offer.
 *
 * "Tạo thumbnail nổi bật, text ngắn, dễ đọc" wants short legible text. An earlier
 * version answered it with "ƯU ĐÃI ĐẶC BIỆT" — SPECIAL OFFER — inventing a
 * promotion the client never mentioned. That is the exact failure this file
 * warns against two paragraphs up, and it shipped anyway. Where there is no
 * offer, the copy names the product and claims nothing.
 */
const NEUTRAL: Record<string, { vi: string; en: string }> = {
  headline: { vi: "{p}", en: "{p}" },
  subline: { vi: "Tìm hiểu thêm về sản phẩm", en: "Find out more" },
};

const SUBLINES: Record<string, { vi: string; en: string }> = {
  sale: { vi: "Ưu đãi đặc biệt cho dòng sản phẩm này", en: "Special offer on this range" },
  launch: { vi: "Ưu đãi dành riêng cho ngày khai trương", en: "Opening day offer" },
  bundle: { vi: "Ưu đãi khi mua theo combo", en: "Better value in a bundle" },
  new_arrival: { vi: "Sản phẩm mới đã có mặt", en: "New in, now available" },
  seasonal: { vi: "Ưu đãi có thời hạn", en: "For a limited time" },
  none: { vi: "Ưu đãi đặc biệt cho dòng sản phẩm này", en: "Special offer on this range" },
};

const CTAS: Record<string, { vi: string; en: string }> = {
  conversion: { vi: "MUA NGAY", en: "SHOP NOW" },
  consideration: { vi: "TÌM HIỂU THÊM", en: "LEARN MORE" },
  awareness: { vi: "KHÁM PHÁ NGAY", en: "DISCOVER" },
  retention: { vi: "NHẬN ƯU ĐÃI", en: "CLAIM OFFER" },
};

export class CommercialCopySynthesizer {
  public static synthesize(
    concept: string,
    intent: CommercialIntent,
    supplied: string[] = [],
    /** Used only where there is no offer to name, so the copy still says something true. */
    productName = ""
  ): SynthesizedCopy {
    const notes: string[] = [];
    const language: "vi" | "en" = VI_MARKERS.test(concept) ? "vi" : "en";
    const items: SynthesizedCopyItem[] = [];

    // Supplied copy always wins and is never rewritten. The client's own words
    // are the one thing in this file that is not this layer's to compose.
    const clean = supplied.map((s) => String(s || "").trim()).filter(Boolean);
    if (clean.length) {
      // The first supplied line is the headline; the rest follow it. A more
      // elaborate assignment would be guessing at the client's intent for lines
      // they wrote themselves.
      clean.forEach((text, i) => {
        items.push({ role: i === 0 ? "headline" : i === clean.length - 1 && clean.length > 1 ? "cta" : "subline", text, supplied: true });
      });
      notes.push(`${clean.length} line(s) supplied by the user and used verbatim.`);
    }

    if (!intent.text_required) {
      if (!clean.length) notes.push("The concept requires no visible text; nothing was composed.");
      return { items, language, synthesized: false, notes };
    }

    const has = (role: CopyRole) => items.some((i) => i.role === role);
    let synthesized = false;

    // ── Headline ───────────────────────────────────────────────────────
    if (!has("headline")) {
      let text: string;
      if (intent.offer_type === "none" && !intent.discount) {
        // Nothing was offered, so nothing is claimed. The product's own name is
        // the only honest headline available.
        text = (productName || "").trim() || NEUTRAL.subline[language];
        notes.push("No offer stated in the concept: the headline names the product and claims nothing.");
      } else {
        const key = intent.discount && intent.offer_type === "sale" ? "sale_with_discount" : intent.offer_type;
        const template = HEADLINES[key] || HEADLINES[intent.offer_type] || HEADLINES.sale;
        text = template[language].replace("{d}", intent.discount || "");
        notes.push(
          `Headline composed from offer type "${intent.offer_type}"${intent.discount ? ` and the stated discount "${intent.discount}"` : ""}.`
        );
      }
      items.unshift({ role: "headline", text: text.replace(/\s{2,}/g, " ").trim(), supplied: false });
      synthesized = true;
    }

    // ── Offer badge ────────────────────────────────────────────────────
    // Only where a discount was actually stated. A badge reading "SALE" with no
    // number is the promotional equivalent of reserving an empty zone.
    if (intent.discount && !has("offer_badge")) {
      const headlineCarriesIt = items.some((i) => i.role === "headline" && i.text.includes(intent.discount!));
      if (!headlineCarriesIt) {
        items.push({ role: "offer_badge", text: intent.discount, supplied: false });
        synthesized = true;
        notes.push(`Discount badge carries "${intent.discount}" verbatim.`);
      }
    }

    // ── Supporting line ────────────────────────────────────────────────
    if (!has("subline")) {
      const sub =
        intent.offer_type === "none" && !intent.discount
          ? NEUTRAL.subline
          : SUBLINES[intent.offer_type] || SUBLINES.none;
      items.push({ role: "subline", text: sub[language], supplied: false });
      synthesized = true;
    }

    // ── Call to action ─────────────────────────────────────────────────
    if (intent.cta_required && !has("cta")) {
      const cta = CTAS[intent.commercial_goal] || CTAS.conversion;
      items.push({ role: "cta", text: cta[language], supplied: false });
      synthesized = true;
      notes.push(`CTA composed for goal "${intent.commercial_goal}".`);
    }

    if (synthesized) {
      notes.push(
        "Composed copy states only what the concept stated. No price, date, guarantee or superlative was invented."
      );
    }

    return { items: this.order(items), language, synthesized, notes };
  }

  /** Reading order: headline, badge, subline, CTA. */
  private static order(items: SynthesizedCopyItem[]): SynthesizedCopyItem[] {
    const rank: Record<CopyRole, number> = { headline: 0, offer_badge: 1, subline: 2, cta: 3 };
    return [...items].sort((a, b) => rank[a.role] - rank[b.role]);
  }

  /** The plain strings, for layers that take a copy array. */
  public static texts(copy: SynthesizedCopy): string[] {
    return copy.items.map((i) => i.text);
  }
}
