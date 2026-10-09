import { CopyItemInput } from "../types";

export type LayoutZoneRole =
  | "HEADLINE"
  | "SUBHEAD"
  | "CTA"
  | "LOGO"
  | "PRODUCT_FOCAL"
  | "LEGAL";

export interface LayoutZone {
  role: LayoutZoneRole;
  /** Percentages of canvas, origin top-left. Consumed later by the compositor. */
  x: number;
  y: number;
  width: number;
  height: number;
  align: "left" | "center" | "right";
  note: string;
}

/**
 * How much of the viewer's attention an element is entitled to, 0–100.
 *
 * These are not decorations on the zone list — they are the reason the zones are
 * shaped the way they are. An element with importance 90 gets the optical centre
 * and the strongest contrast; one with importance 30 gets read last and must not
 * compete for either.
 */
export interface VisualPriorityEntry {
  element: "product" | "headline" | "cta" | "logo" | "supporting";
  importance: number;
  role: string;
}

/**
 * The path a viewer's eye is expected to take. Named rather than free text so it
 * stays comparable across formats and can be asserted in tests.
 */
export type EyeFlow =
  | "center_out_product_first"
  | "top_to_bottom_message_first"
  | "top_to_bottom_product_first"
  | "left_to_right_message_first"
  | "left_to_right_product_first"
  | "center_lock_product_only";

export interface CommercialLayoutPlan {
  format: string;
  aspectRatio: string;
  safeMarginPercent: number;
  zones: LayoutZone[];
  hierarchy: string[];
  /** Attention budget per element, strongest first. */
  visual_priority: VisualPriorityEntry[];
  /** Expected scan path through the composition. */
  eye_flow: EyeFlow;
  /** What the empty areas are for, and why they must stay empty. */
  negative_space_strategy: string;
  /** True when authorized copy exists and may be rendered as visible typography. */
  rendersCopy: boolean;
  promptBlock: string;
}

interface FormatSpec {
  safeMargin: number;
  zones: LayoutZone[];
  hierarchy: string[];
  intent: string;
  readability: string;
  visualPriority: VisualPriorityEntry[];
  eyeFlow: EyeFlow;
  negativeSpaceStrategy: string;
  /** One sentence on how a viewer actually consumes this format. */
  consumptionModel: string;
}

/**
 * What each format asks a designer to think about.
 *
 * Kept deliberately free of geometry. The reserved zones in this same file
 * already say where the headline and the product go for this format; these lines
 * say why that format is hard and what makes an execution good rather than
 * merely correct. Measured before this existed, five asset types produced
 * prompts that were 42.5% byte-identical and whose strategy section varied at
 * the same rate as two runs of the SAME format — the layout differed and the
 * thinking behind it did not.
 *
 * Typography appears here as behaviour rather than as a position, which is the
 * one thing the prompt previously said identically for every format.
 */
const DESIGN_CONSIDERATIONS: Record<string, string> = {
  poster:
    "Impact at first glance, before a word has been read. A hierarchy the eye follows without being instructed. A real relationship between picture and words \u2014 not words laid over a photograph. Type scaled for the distance this will actually be read from.",
  billboard:
    "One idea, resolved before the viewer has passed. Everything that is not that idea removed rather than made smaller. Type scaled for the distance and the speed.",
  banner:
    "A message that resolves faster than the intention to scroll past it. Information flowing across the horizontal rather than down it. Type that survives being short in height. Enough quiet for the message to occupy without fighting the product.",
  website_banner:
    "A message that resolves faster than the intention to scroll past it. Information flowing across the horizontal rather than down it. Type that survives being short in height. Enough quiet for the message to occupy without fighting the product.",
  social_ad:
    "A reason to stop that is visible before the image is understood. Legibility at arm's length on a phone. Type that reads as native to the feed rather than typeset. One idea \u2014 a second one will not be read.",
  product_hero:
    "The object's material and surface carrying the persuasion. Light that describes form rather than decorating it. Restraint in everything that is not the product. Type kept subordinate: the object is the argument.",
  ugc_thumbnail:
    "The whole idea legible at small size and at a glance. Human reaction reading before any detail does. At most a few words, heavy enough to survive scaling. No art-directed polish \u2014 it competes with real photographs and loses on polish.",
  thumbnail_ugc:
    "The whole idea legible at small size and at a glance. Human reaction reading before any detail does. At most a few words, heavy enough to survive scaling. No art-directed polish \u2014 it competes with real photographs and loses on polish.",
};

/**
 * Commercial Layout Service.
 *
 * Turns "reserve upper third clearance" into an actual rectangle.
 *
 * The engine previously described layout only in adjectives — a clearance-zone
 * name and a focal-weight percentage — which gave the image model nothing to
 * place against and gave a future typography compositor nothing to consume. Each
 * format now carries real geometry: where the headline sits, where the CTA sits,
 * where the logo sits, how much safe margin the format needs, and which of those
 * areas must stay visually quiet.
 *
 * The plan is emitted as prompt guidance AND returned as structured zones, so
 * compositing real type over the render later is a matter of reading `zones`
 * rather than re-deriving layout from prose.
 */
export class CommercialLayoutService {
  /**
   * How an image's commercial job shifts the attention it should spend.
   *
   * The format spec sets the baseline — a thumbnail and a poster budget attention
   * differently whatever the campaign. What the baseline could not see is that a
   * campaign built to be REMEMBERED and one built to be ACTED ON want different
   * allocations inside the same format. Measured across six industries on one
   * format, the attention budget came out byte-identical every time, including
   * for an image whose own stated objective was "provoke action, not build
   * recall" and whose CTA was nevertheless weighted 35/100 "present but
   * subordinate", the same as a luxury poster built explicitly not to be acted on.
   *
   * This is a modulation, not a template: it nudges the format's own numbers by a
   * few points and never replaces them, so a poster stays a poster. Both the
   * shift and its size are deliberately small, because the layout spec knows more
   * about the format than a keyword match knows about the campaign.
   */
  private static objectiveShift(shift?: string): { element: string; delta: number; note: string }[] {
    switch (String(shift || "none").trim().toLowerCase()) {
      case "cta":
        return [
          { element: "cta", delta: 20, note: "This image is meant to be acted on, so the offer is not decoration." },
          { element: "headline", delta: 5, note: "" },
          { element: "product", delta: -5, note: "" },
        ];
      case "headline":
        return [
          { element: "headline", delta: 15, note: "This image has something to say in words, so they carry more of the load." },
          { element: "cta", delta: -5, note: "" },
        ];
      case "product":
        return [
          { element: "product", delta: 10, note: "This image rests on the product itself." },
          { element: "cta", delta: -5, note: "" },
        ];
      default:
        // The format's own allocation, unchanged. This is the usual answer.
        return [];
    }
  }

  /** Retained for callers with no reasoned shift: a weak signal, and labelled as one. */
  private static objectiveShiftFromText(objective?: string): { element: string; delta: number; note: string }[] {
    const t = String(objective || "").toLowerCase();
    if (!t.trim()) return [];
    // Matched loosely and in both languages, because this arrives as free text
    // from a brief rather than as a controlled value.
    // Unicode lookarounds, not `\b`. `\b` is ASCII-only, so a trailing diacritic
    // ends the match: "thúc đẩy dùng thử" never matched /\bdùng thử\b/ and the one
    // brief that most needed a conversion shift silently received none.
    const any = (terms: string[]) =>
      new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.join("|")})(?![\\p{L}\\p{N}])`, "iu").test(t);
    const conversion = any([
      "conversion", "convert", "action", "act now", "sale", "sales", "purchase", "buy", "order",
      "promo", "promotion", "offer", "discount", "trial",
      "dùng thử", "mua", "khuyến mãi", "ưu đãi", "giảm giá", "đặt hàng", "chuyển đổi", "hành động",
    ]);
    const awareness = any([
      "awareness", "branding", "brand", "recall", "remember", "memorable", "launch", "reveal", "identity",
      "thương hiệu", "nhận diện", "ra mắt", "ghi nhớ",
    ]);
    const education = any([
      "education", "educate", "explain", "inform", "how it works", "demo", "understood",
      "hướng dẫn", "giải thích", "thông tin",
    ]);

    // Conversion is tested first: a launch that is also a promotion is trying to
    // sell today, and "ra mắt ... giảm 20%" should not be read as pure awareness.
    if (conversion) {
      return [
        { element: "cta", delta: 20, note: "This image is meant to be acted on, so the offer is not decoration." },
        { element: "headline", delta: 5, note: "" },
        { element: "product", delta: -5, note: "" },
      ];
    }
    if (awareness) {
      return [
        { element: "product", delta: 5, note: "This image is meant to be remembered rather than acted on." },
        { element: "cta", delta: -10, note: "" },
      ];
    }
    if (education) {
      return [
        { element: "headline", delta: 10, note: "This image has something to explain, so the words carry more of the load." },
        { element: "cta", delta: -5, note: "" },
      ];
    }
    return [];
  }

  public static plan(input: {
    assetType?: string;
    aspectRatio?: string;
    copyItems?: (CopyItemInput | string)[];
    hasLogoAsset?: boolean;
    objective?: string;
    targetChannel?: string;
    /** The reasoned shift, when the strategy layer produced one. */
    attentionShift?: string;
  }): CommercialLayoutPlan {
    const format = (input.assetType || "poster").toLowerCase().replace(/[\s-]+/g, "_");
    const aspectRatio = input.aspectRatio || "1:1";
    const copyItems = (input.copyItems || []).filter(Boolean);
    const rendersCopy = copyItems.length > 0;

    const spec = this.specFor(format, aspectRatio);
    const zones = input.hasLogoAsset ? spec.zones : spec.zones.filter((z) => z.role !== "LOGO");

    // Elements that were dropped from the layout carry no attention budget either.
    const priority = spec.visualPriority.filter(
      (p) => p.element !== "logo" || input.hasLogoAsset
    );
    // Without authorized copy nothing textual will be rendered, so the attention
    // that would have gone to a headline returns to the product.
    // The campaign's job shifts the format's baseline before the copy check does,
    // so that an image with no authorized copy still loses its CTA weight rather
    // than being handed a conversion boost it cannot spend.
    const shifts = input.attentionShift
      ? this.objectiveShift(input.attentionShift)
      : this.objectiveShiftFromText(input.objective);
    const objectiveNotes: string[] = [];
    const shifted = shifts.length
      ? priority.map((p) => {
          const s = shifts.find((x) => x.element === p.element);
          if (!s) return p;
          if (s.note) objectiveNotes.push(s.note);
          const importance = Math.max(5, Math.min(100, p.importance + s.delta));
          // Only rewrite the role when the shift is large enough to have changed
          // what the element is for. A few points is a nudge, not a new job.
          const role =
            s.delta >= 15
              ? `${p.role.replace(/\s*(?:Present but subordinate|subordinate)\.?\s*$/i, "").trim()} Raised for this campaign: it has real work to do here, not a corner.`
              : s.delta <= -10
              ? `${p.role} Deliberately quiet in this campaign.`
              : p.role;
          return { ...p, importance, role };
        })
      : priority;

    const effectivePriority = rendersCopy
      ? shifted
      : shifted.map((p) =>
          p.element === "product"
            ? { ...p, importance: Math.min(100, p.importance + 10) }
            : p.element === "headline" || p.element === "cta"
            ? { ...p, importance: Math.max(10, Math.round(p.importance * 0.4)), role: `${p.role} (reserved space only — no text is rendered in this pass)` }
            : p
        );

    const lines: string[] = [
      "[COMMERCIAL LAYOUT PLAN]",
      `FORMAT: ${format.replace(/_/g, " ")} at ${aspectRatio}. ${spec.intent}`,
      `HOW THIS IS VIEWED: ${spec.consumptionModel}`,
      `SAFE MARGIN: keep all meaningful content, product edges and any text at least ${spec.safeMargin}% in from every edge.`,
      "",
      "ATTENTION BUDGET (0–100). This is the order a viewer must read the frame in. Give the strongest element the optical emphasis — contrast, focus, scale and placement — and make sure nothing below it competes for that emphasis:",
      ...effectivePriority.map((p) => `- ${p.element.toUpperCase()} — ${p.importance}/100. ${p.role}`),
      ...(objectiveNotes.length ? [objectiveNotes[0]] : []),
      "",
      `EYE FLOW: ${spec.eyeFlow.replace(/_/g, " ")}. Build the composition so the eye enters, travels and settles in that order; leading lines, focus falloff and tonal contrast should all reinforce it rather than fight it.`,
      "",
      `NEGATIVE SPACE STRATEGY: ${spec.negativeSpaceStrategy}`,
      "",
      "RESERVED ZONES (percentages of the canvas, origin top-left). These areas must stay visually calm — even tone, low detail, no competing highlight, no part of the product crossing into them:",
      ...zones.map(
        (z) =>
          `- ${z.role}: x ${z.x}%, y ${z.y}%, w ${z.width}%, h ${z.height}%, ${z.align}-aligned. ${z.note}`
      ),
      "",
      // The ordered hierarchy is not printed: the ATTENTION BUDGET above already
      // ranks the same elements, with numbers. Saying it twice is prompt padding.
      `READABILITY: ${spec.readability}`,
    ];

    // The model is a bad typesetter and a worse proofreader, especially with
    // Vietnamese diacritics. It is asked to leave room, not to set type — unless
    // the client authorised exact strings, in which case those strings and only
    // those may appear.
    if (rendersCopy) {
      lines.push(
        "",
        "TYPOGRAPHY: only the exact authorized copy strings listed elsewhere in this prompt may be rendered, placed inside the zones above with the stated hierarchy. Reproduce them character-for-character including accents and punctuation. Render no other words."
      );
    } else {
      lines.push(
        "",
        "TYPOGRAPHY: render NO text. The zones above are kept clear for typography that will be composited afterwards. Do not invent headlines, prices, badges, slogans, watermarks or placeholder lettering."
      );
    }

    return {
      format,
      aspectRatio,
      safeMarginPercent: spec.safeMargin,
      zones,
      hierarchy: spec.hierarchy,
      visual_priority: effectivePriority,
      eye_flow: spec.eyeFlow,
      negative_space_strategy: spec.negativeSpaceStrategy,
      rendersCopy,
      promptBlock: lines.join("\n"),
    };
  }

  /**
   * The design considerations for an asset type, or null when the type is not
   * one this service knows. Null rather than a poster default on purpose: an
   * unrecognised format should say nothing rather than quietly assert poster
   * thinking, which is how every unhandled path in this engine ends up looking
   * like a poster.
   */
  public static designConsiderations(assetType?: string): { format: string; considerations: string } | null {
    const format = String(assetType || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const considerations = DESIGN_CONSIDERATIONS[format];
    return considerations ? { format, considerations } : null;
  }

  private static specFor(format: string, aspectRatio: string): FormatSpec {
    const isWide = aspectRatio === "16:9" || aspectRatio === "4:3" || aspectRatio === "5:4";
    const isTallStory = aspectRatio === "9:16";

    switch (format) {
      case "poster":
      case "billboard": {
        const big = format === "billboard";
        return {
          safeMargin: big ? 10 : 6,
          intent: big
            ? "Read at distance and at speed: one message, one hero, nothing subtle."
            : "Editorial commercial poster: a strong hero image carrying a headline above it and an offer beneath it.",
          hierarchy: ["HEADLINE", "PRODUCT_FOCAL", "CTA", "LOGO"],
          consumptionModel: big
            ? "Seen once, from distance, by someone in motion. One idea lands or none does."
            : "Approached, then read. The image earns the pause and the headline pays it off.",
          visualPriority: big
            ? [
                { element: "headline", importance: 90, role: "The single idea. Must resolve before the viewer has passed." },
                { element: "product", importance: 75, role: "Instantly identifiable at distance; silhouette does the work, not detail." },
                { element: "logo", importance: 40, role: "Attribution. Read last, never competing with the headline." },
                { element: "cta", importance: 20, role: "Optional at this distance; omit rather than shrink it into illegibility." },
              ]
            : [
                { element: "product", importance: 85, role: "Hero. Carries desire through material quality and light." },
                { element: "headline", importance: 65, role: "Names the idea the product is illustrating." },
                { element: "cta", importance: 35, role: "Closes the read. Present but subordinate." },
                { element: "logo", importance: 25, role: "Attribution only." },
              ],
          eyeFlow: big ? "top_to_bottom_message_first" : "center_out_product_first",
          negativeSpaceStrategy: big
            ? "Aggressive emptiness. At least half the frame carries nothing, so the one idea has somewhere to land."
            : "Reserve a calm, tonally even band above the product for the headline, and keep the area immediately around the product silhouette free of props or highlights so its edge stays crisp.",
          readability: big
            ? "Headline must survive being read in under two seconds from far away; keep the headline zone near-flat in tone and high in contrast against the type that will sit there."
            : "Keep the headline zone tonally even so display type holds contrast without an outline or scrim.",
          zones: [
            { role: "HEADLINE", x: 6, y: 7, width: 88, height: 18, align: "center", note: "Primary message. Highest contrast area of the composition." },
            { role: "PRODUCT_FOCAL", x: 12, y: 27, width: 76, height: 52, align: "center", note: "Hero product sits here, fully inside the frame, not cropped by any zone edge." },
            { role: "CTA", x: 6, y: 81, width: 88, height: 9, align: "center", note: "Offer or action line. Must not overlap product silhouette." },
            { role: "LOGO", x: 40, y: 91, width: 20, height: 6, align: "center", note: "Brand mark with clear space on all sides equal to half its height." },
          ],
        };
      }

      case "banner":
      case "website_banner": {
        // A banner is a conversion unit, not a picture. Copy stack and product are
        // side by side so neither is cropped when the placement is letterboxed.
        return {
          safeMargin: 5,
          intent: "Display advertising unit read in peripheral vision: message left, product right, one unmistakable action.",
          hierarchy: ["HEADLINE", "CTA", "PRODUCT_FOCAL", "LOGO"],
          consumptionModel: "Seen in peripheral vision beside content the viewer actually came for. It gets under a second and no second look.",
          visualPriority: [
            { element: "headline", importance: 85, role: "The offer or reason. A banner that is only a picture converts nothing." },
            { element: "cta", importance: 70, role: "The click target. Must read as pressable at a glance." },
            { element: "product", importance: 60, role: "Proof and recognition, not the hero here." },
            { element: "logo", importance: 30, role: "Trust signal. Small, consistent, out of the copy's way." },
          ],
          eyeFlow: isWide ? "left_to_right_message_first" : "top_to_bottom_message_first",
          negativeSpaceStrategy: "The copy column is the negative space. Keep it a flat, uninterrupted field — no gradient banding, no product edge, no highlight — so type sits on it without a scrim.",
          readability:
            "Copy column must hold at least a 4.5:1 tonal separation from whatever sits behind it. Keep the product out of the copy column entirely — banners are frequently cropped from the edges and overlapping content is the first thing lost.",
          zones: isWide
            ? [
                { role: "HEADLINE", x: 5, y: 18, width: 40, height: 24, align: "left", note: "Left copy column. Background here stays quiet and even." },
                { role: "CTA", x: 5, y: 58, width: 26, height: 14, align: "left", note: "Action element directly under the message, inside the same quiet column." },
                { role: "PRODUCT_FOCAL", x: 52, y: 10, width: 43, height: 80, align: "center", note: "Product occupies the right half and never crosses x=48%." },
                { role: "LOGO", x: 5, y: 78, width: 16, height: 10, align: "left", note: "Bottom of the copy column." },
              ]
            : [
                { role: "HEADLINE", x: 6, y: 10, width: 88, height: 16, align: "center", note: "Message band across the top." },
                { role: "PRODUCT_FOCAL", x: 12, y: 30, width: 76, height: 48, align: "center", note: "Product centred below the message band." },
                { role: "CTA", x: 20, y: 81, width: 60, height: 10, align: "center", note: "Action element." },
                { role: "LOGO", x: 42, y: 92, width: 16, height: 6, align: "center", note: "Brand mark." },
              ],
        };
      }

      case "social_ad": {
        // Platform chrome eats the extremes of a vertical feed unit. Reserving for
        // it is the difference between a CTA that converts and one hidden behind a
        // username and a progress bar.
        return {
          safeMargin: isTallStory ? 8 : 6,
          intent:
            "Mobile feed unit competing against a thumb: it must stop the scroll in the first half-second, then say one thing.",
          hierarchy: ["PRODUCT_FOCAL", "HEADLINE", "CTA", "LOGO"],
          consumptionModel: "Encountered mid-scroll at thumb speed. The first half-second decides whether the rest is seen at all.",
          visualPriority: [
            { element: "product", importance: 90, role: "The scroll-stopper. Must be recognisable at thumbnail size before any text is read." },
            { element: "headline", importance: 60, role: "The hook, read only after the image has already stopped the thumb." },
            { element: "cta", importance: 30, role: "Read last, by the minority who got that far. Present, not loud." },
            { element: "logo", importance: 20, role: "Persistent small mark; never competes with the hook." },
          ],
          eyeFlow: "top_to_bottom_product_first",
          negativeSpaceStrategy: "Keep the platform chrome bands genuinely empty, and leave a quiet zone directly around the product so it separates from a busy feed rather than blending into it.",
          readability: isTallStory
            ? "Story and Reels chrome overlays roughly the top 12% and bottom 18% of a 9:16 frame. Nothing that must be seen may sit there."
            : "Feed crops and caption overlays bite into the lower edge. Keep the action element above y=88%.",
          zones: isTallStory
            ? [
                { role: "HEADLINE", x: 8, y: 14, width: 84, height: 16, align: "center", note: "Hook line, below platform chrome." },
                { role: "PRODUCT_FOCAL", x: 10, y: 32, width: 80, height: 42, align: "center", note: "Product large enough to read at thumbnail size — the scroll-stopper." },
                { role: "CTA", x: 12, y: 76, width: 76, height: 8, align: "center", note: "Action element above the bottom chrome band." },
                { role: "LOGO", x: 8, y: 15, width: 14, height: 6, align: "left", note: "Small persistent brand mark, top-left." },
              ]
            : [
                { role: "HEADLINE", x: 7, y: 8, width: 86, height: 17, align: "center", note: "Hook line in the upper third where the eye lands first." },
                { role: "PRODUCT_FOCAL", x: 10, y: 27, width: 80, height: 50, align: "center", note: "Product dominant and instantly recognisable at thumbnail scale." },
                { role: "CTA", x: 14, y: 79, width: 72, height: 9, align: "center", note: "Action element, above the caption crop line." },
                { role: "LOGO", x: 7, y: 9, width: 13, height: 6, align: "left", note: "Brand mark, top-left, out of the headline's way." },
              ],
        };
      }

      case "ugc_thumbnail":
      case "thumbnail_ugc": {
        return {
          safeMargin: 6,
          intent: "Creator-style frame that must not look art-directed, while still reading at thumbnail size.",
          hierarchy: ["PRODUCT_FOCAL", "HEADLINE", "LOGO"],
          consumptionModel: "Judged as a person's own photo, at small size, against other people's photos. Polish reads as an ad and loses.",
          visualPriority: [
            { element: "product", importance: 85, role: "Recognisable at 120px wide, held or used rather than displayed." },
            { element: "headline", importance: 45, role: "Optional overlay line in the creator's own voice." },
            { element: "logo", importance: 15, role: "Corner mark at most. A prominent logo breaks the format." },
          ],
          eyeFlow: "center_out_product_first",
          negativeSpaceStrategy: "Incidental rather than designed. Space comes from a real room, not a studio sweep, and may be slightly off-balance.",
          readability: "Product must be identifiable at 120px wide. Avoid studio-perfect symmetry; keep it plausibly hand-held.",
          zones: [
            { role: "HEADLINE", x: 7, y: 8, width: 86, height: 16, align: "center", note: "Optional overlay line, upper third." },
            { role: "PRODUCT_FOCAL", x: 12, y: 26, width: 76, height: 62, align: "center", note: "Product held or placed naturally, dominant in frame." },
            { role: "LOGO", x: 76, y: 88, width: 17, height: 7, align: "right", note: "Small corner mark only." },
          ],
        };
      }

      case "product_hero":
      default: {
        return {
          safeMargin: 10,
          intent: "Catalogue-grade product photograph: the product is the entire subject and its surfaces carry the story.",
          hierarchy: ["PRODUCT_FOCAL", "LOGO"],
          consumptionModel: "Looked at deliberately by someone already considering the purchase. It answers 'what exactly am I buying'.",
          visualPriority: [
            { element: "product", importance: 95, role: "The entire subject. Surfaces, edges and label legibility carry all the persuasion." },
            { element: "logo", importance: 20, role: "Optional. Omit rather than crowd the product." },
          ],
          eyeFlow: "center_lock_product_only",
          negativeSpaceStrategy: "Generous, even and deliberately uneventful. Emptiness here signals confidence and price; anything placed in it competes with the product.",
          readability:
            "Label text on the product itself must be sharp and unobstructed. No graphic overlay competes with the product.",
          zones: [
            { role: "PRODUCT_FOCAL", x: 15, y: 12, width: 70, height: 76, align: "center", note: "Product fills the frame with even breathing room; label faces camera and stays fully legible." },
            { role: "LOGO", x: 40, y: 90, width: 20, height: 6, align: "center", note: "Optional brand mark; omit entirely rather than crowd the product." },
          ],
        };
      }
    }
  }
}
