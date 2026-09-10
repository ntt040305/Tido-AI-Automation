/**
 * CIOS Phase 4.1.1 Task 1 — the concept is a requirement, not a mood.
 *
 * The failure this fixes
 * --------------------
 * Concept: "Tạo ảnh poster, sale sản phẩm 50% và có các chữ CTA".
 * Output: a clean product shot. No sale message, no CTA, no promotional
 * hierarchy, no visible text.
 *
 * Traced end to end, the cause is that nothing ever read the concept for
 * *requirements*. The text was fed to keyword tables that look for emotional
 * register and visual opportunity, so "poster", "sale", "50%" and "CTA" were
 * scanned for mood and then discarded. Two consequences followed:
 *
 *   1. The words "50%" and "CTA" never appeared anywhere in the final prompt.
 *   2. With no `copy[]` array supplied alongside the concept, the pipeline set
 *      `rendersCopy = false` and emitted "no rendered type in this pass" and
 *      "reserved and left empty". The system was actively instructing the
 *      renderer not to draw the text the user had just asked for.
 *
 * A user who writes "có các chữ CTA" has stated a hard requirement. This layer
 * reads it as one.
 *
 * Bilingual by necessity
 * ---------------------
 * The briefs are Vietnamese. Matching English only would leave the production
 * case failing exactly as it does now, so every pattern below carries both. The
 * Vietnamese terms are the ones that actually appear in the failing input:
 * "giảm giá", "khuyến mãi", "ưu đãi", "mua ngay", "nút CTA", "khai trương".
 */

export type OfferType = "sale" | "launch" | "bundle" | "new_arrival" | "seasonal" | "none";
export type CommercialGoal = "conversion" | "awareness" | "consideration" | "retention";

export interface CommercialIntent {
  /** Asset type named in the concept, where it names one. */
  asset_type: string | null;
  offer_type: OfferType;
  /** "50%", "2-for-1", "30k" — as written, so it can be reproduced verbatim. */
  discount: string | null;
  cta_required: boolean;
  text_required: boolean;
  commercial_goal: CommercialGoal;
  branding_required: boolean;
  tone: string | null;
  /** Phrases the parser matched, so a surprising reading can be traced. */
  evidence: string[];
  /** True where the concept asks for a promotional execution rather than a product shot. */
  promotional: boolean;
}

interface Rule {
  pattern: RegExp;
  label: string;
}

/**
 * A word boundary that works on Vietnamese.
 *
 * `\b` is ASCII-only: it looks for a transition between [A-Za-z0-9_] and
 * anything else. "giam gia" written properly ends in a non-ASCII letter, so
 * there is no boundary at the end of the string and a pattern wrapped in `\b`
 * never matches it. The production concept in case 3 was parsed as having no
 * offer at all for exactly this reason, which is the same class of failure this
 * phase exists to fix. Verified: `\b` fails on both of the offer terms that
 * matter most.
 *
 * Unicode lookarounds test for an adjacent letter or digit in any script, which
 * is what "word boundary" was always meant to mean here.
 */
function vn(body: string): RegExp {
  return new RegExp("(?<![\\p{L}\\p{N}])(?:" + body + ")(?![\\p{L}\\p{N}])", "iu");
}

const ASSET_TYPES: { pattern: RegExp; type: string }[] = [
  { pattern: vn("poster|áp\\s?phích"), type: "poster" },
  { pattern: vn("banner|băng\\s?rôn"), type: "banner" },
  { pattern: vn("thumbnail|hình\\s?thu\\s?nhỏ|ảnh\\s?đại\\s?diện"), type: "thumbnail" },
  { pattern: vn("social\\s?ad|quảng\\s?cáo\\s?(?:mạng\\s?xã\\s?hội|facebook|instagram)|bài\\s?đăng"), type: "social_ad" },
  { pattern: vn("packaging|bao\\s?bì|packshot"), type: "packaging" },
  { pattern: vn("landing|hero|trang\\s?chủ"), type: "landing_hero" },
];

/**
 * Ordered most specific first, generic last.
 *
 * "uu dai khai truong" is an opening promotion, not a generic sale. With the
 * umbrella term tested first it resolved to `sale` and the headline came out as
 * a generic special-offer line instead of the opening one — the parser had the
 * more informative word and threw it away. An occasion beats the umbrella term,
 * because the occasion is what the poster is actually about.
 */
const OFFERS: { pattern: RegExp; type: OfferType }[] = [
  { pattern: vn("khai\\s?trương|ra\\s?mắt|launch|opening|khởi\\s?động"), type: "launch" },
  { pattern: vn("tết|noel|christmas|black\\s?friday|lễ|holiday|summer|hè"), type: "seasonal" },
  { pattern: vn("combo|bundle|mua\\s?\\d+\\s?tặng|buy\\s?\\d+\\s?get"), type: "bundle" },
  { pattern: vn("new\\s?arrival|hàng\\s?mới|sản\\s?phẩm\\s?mới"), type: "new_arrival" },
  { pattern: vn("sale|giảm\\s?giá|giảm\\s?ngay|khuyến\\s?mãi|ưu\\s?đãi|discount|off"), type: "sale" },
];

const CTA_RULES: Rule[] = [
  { pattern: /\bCTA\b/i, label: "CTA" },
  { pattern: vn("mua\\s?ngay|đặt\\s?ngay|đặt\\s?hàng|order\\s?now|buy\\s?now|shop\\s?now"), label: "buy-now phrasing" },
  { pattern: vn("nút|button|call\\s?to\\s?action"), label: "button" },
  { pattern: vn("đăng\\s?ký|sign\\s?up|liên\\s?hệ|contact"), label: "sign-up phrasing" },
];

const TEXT_RULES: Rule[] = [
  { pattern: vn("chữ|text|typography|copy|headline|tiêu\\s?đề|dòng\\s?chữ|caption"), label: "text requested" },
  { pattern: vn("hook|slogan|tagline|thông\\s?điệp"), label: "message requested" },
];

const BRANDING_RULES: Rule[] = [
  { pattern: vn("logo|thương\\s?hiệu|brand(?:ing)?|nhận\\s?diện"), label: "branding" },
];

const TONES: { pattern: RegExp; tone: string }[] = [
  { pattern: vn("sang\\s?trọng|cao\\s?cấp|luxury|premium|elegant"), tone: "premium" },
  { pattern: vn("vui|tươi|năng\\s?động|fun|playful|vibrant|nổi\\s?bật"), tone: "energetic" },
  { pattern: vn("tối\\s?giản|minimal|sạch|clean|đơn\\s?giản"), tone: "minimal" },
  { pattern: vn("mạnh|bold|ấn\\s?tượng|striking|gây\\s?chú\\s?ý"), tone: "bold" },
  { pattern: vn("ấm\\s?áp|thân\\s?thiện|warm|friendly|gần\\s?gũi"), tone: "warm" },
];

/**
 * Discount, as written.
 *
 * Captured verbatim rather than normalised to a number: the poster has to print
 * "50%", and a parser that stores `0.5` has thrown away the string the design
 * needs. Ordered longest-form first so "mua 1 tặng 1" is not shortened to "1".
 */
const DISCOUNT_PATTERNS: RegExp[] = [
  /\bmua\s?(\d+)\s?tặng\s?(\d+)\b/i,
  /\bbuy\s?(\d+)\s?get\s?(\d+)\b/i,
  /\b(\d{1,3})\s?%\s?(?:off|giảm)?/i,
  /\bgiảm\s?(\d{1,3})\s?%/i,
  vn("(?:giảm|off)\\s?\\d+\\s?(?:k|nghìn|triệu|đ|vnd|usd|\\$)"),
];

export class ConceptStructuringLayer {
  public static parse(concept: string): CommercialIntent {
    const text = String(concept || "");
    const evidence: string[] = [];

    // ── Asset type ─────────────────────────────────────────────────────
    let asset_type: string | null = null;
    for (const a of ASSET_TYPES) {
      const m = text.match(a.pattern);
      if (m) {
        asset_type = a.type;
        evidence.push(`asset_type "${m[0]}" → ${a.type}`);
        break;
      }
    }

    // ── Offer ──────────────────────────────────────────────────────────
    let offer_type: OfferType = "none";
    for (const o of OFFERS) {
      const m = text.match(o.pattern);
      if (m) {
        offer_type = o.type;
        evidence.push(`offer "${m[0]}" → ${o.type}`);
        break;
      }
    }

    // ── Discount ───────────────────────────────────────────────────────
    let discount: string | null = null;
    for (const p of DISCOUNT_PATTERNS) {
      const m = text.match(p);
      if (m) {
        discount = m[0].trim();
        evidence.push(`discount "${discount}"`);
        break;
      }
    }

    const cta_required = this.any(text, CTA_RULES, evidence, "cta");
    const textAsked = this.any(text, TEXT_RULES, evidence, "text");
    const branding_required = this.any(text, BRANDING_RULES, evidence, "branding");

    // A concept asking for a CTA, a discount or an offer is asking for text,
    // whether or not it used the word. A CTA is text by definition, and a sale
    // that does not state its number is not a sale poster.
    const text_required = textAsked || cta_required || Boolean(discount) || offer_type !== "none";

    let tone: string | null = null;
    for (const t of TONES) {
      const m = text.match(t.pattern);
      if (m) {
        tone = t.tone;
        evidence.push(`tone "${m[0]}" → ${t.tone}`);
        break;
      }
    }

    // ── Commercial goal ────────────────────────────────────────────────
    // Conversion is the strong reading and needs a reason: an offer, a discount
    // or an explicit call to action. Everything else is softer.
    let commercial_goal: CommercialGoal = "awareness";
    if (cta_required || discount || offer_type === "sale" || offer_type === "bundle") {
      commercial_goal = "conversion";
    } else if (offer_type === "launch" || offer_type === "new_arrival") {
      commercial_goal = "consideration";
    }

    const promotional = commercial_goal === "conversion" || offer_type !== "none" || cta_required;

    return {
      asset_type,
      offer_type,
      discount,
      cta_required,
      text_required,
      commercial_goal,
      branding_required,
      tone,
      evidence,
      promotional,
    };
  }

  private static any(text: string, rules: Rule[], evidence: string[], kind: string): boolean {
    for (const r of rules) {
      const m = text.match(r.pattern);
      if (m) {
        evidence.push(`${kind} "${m[0]}" → ${r.label}`);
        return true;
      }
    }
    return false;
  }

  /** One line, for logs and for the prompt's own intent statement. */
  public static describe(intent: CommercialIntent): string {
    const parts: string[] = [];
    if (intent.asset_type) parts.push(intent.asset_type);
    if (intent.offer_type !== "none") parts.push(intent.offer_type);
    if (intent.discount) parts.push(intent.discount);
    if (intent.cta_required) parts.push("CTA required");
    if (intent.text_required) parts.push("visible text required");
    parts.push(`goal: ${intent.commercial_goal}`);
    return parts.join(" · ");
  }
}
