/**
 * Creative approach — when to be restrained, and when to be bold.
 *
 * The decision this replaces
 * -------------------------
 * `docs/migration/06-creative-direction-analysis.md` measured how the system
 * chose its level of boldness before this module existed: it did not. The route
 * catalogue (`evolution/experiment/AssetContext.ts:234-265`) offers six options
 * per asset type including "conceptual metaphor — the idea is carried by
 * something the product is not", the list is shuffled with `Math.random()`
 * (`AssetContext.ts:127-134`), and the evaluator then spends 0.20 of its weight
 * on audience and 0.20 on objective (`DirectionEvaluator.ts:137-144`) while a
 * missing verdict scores a neutral 0.5 (`:151-156`). With both fields empty, two
 * fifths of the decision discriminated between nothing and the shuffle decided
 * the rest. A user who wanted quiet and expensive had no way to say so.
 *
 * What this is
 * -----------
 * One pure function over signals the system already has. It invents no input:
 * the tone table is the one `ConceptStructuringLayer` has always used, the copy
 * budget is the one `AssetProfile` already declares, and the objective values
 * are the real `CampaignObjective` union.
 *
 * Isomorphic by requirement
 * ------------------------
 * The browser shows the suggestion under the control and the server recomputes
 * the identical result, so this file and everything it imports must stay free of
 * node built-ins. Its only non-type imports are `ConceptStructuringLayer` and
 * `AssetProfile`, both of which import nothing at all. The one feature-layer
 * import is `import type`, erased at compile time.
 *
 * Pure. No model call, no I/O, no clock, no randomness.
 */
import type { CampaignObjective } from "@/features/picture-engine/types/picture-engine.types";

import { ConceptStructuringLayer } from "./ConceptStructuringLayer";
import { copyFitsChannel, profileFor, assetFamilyOf } from "../evolution/experiment/AssetProfile";

/** The three levels a frame can be directed at. */
export type ApproachLevel = "restrained" | "balanced" | "bold";

/** What the control holds. "auto" and absent both mean "let the AI decide". */
export type ApproachChoice = ApproachLevel | "auto";

/**
 * Where the level came from. Mirrors the convention of
 * `director/VisualDirectionResolver.ts:19`, so the panel can explain itself in
 * the same words it already uses for the six visual controls.
 */
export type ApproachSource = "user_selected" | "concept_tone" | "brand_style" | "objective" | "default";

export interface ApproachAdjustment {
  from: ApproachLevel;
  to: ApproachLevel;
  /** Shown to the user. Always shown — an adjustment the user cannot see is a lie. */
  reason_vi: string;
}

export interface ApproachDecision {
  level: ApproachLevel;
  source: ApproachSource;
  reason_vi: string;
  /** Empty when nothing was capped or vetoed. */
  adjustments: ApproachAdjustment[];
}

export interface ApproachInput {
  /** `creative_direction.creative_approach`. Absent or "auto" means infer. */
  choice?: ApproachChoice | null;
  /** The creative concept, as typed. */
  concept?: string | null;
  /** `BrandKit.style.preferred` (`evolution/experiment/BrandKit.ts:30-37`). */
  brandStylePreferred?: string[] | null;
  /**
   * `BrandKit.style.forbidden`. Accepted and deliberately ignored — see
   * `forbiddenIsIgnored` below.
   */
  brandStyleForbidden?: string[] | null;
  objective?: CampaignObjective | "" | null;
  /** `CreativeBrief.asset_type`. Drives the ceiling and the copy budget. */
  assetType?: string | null;
  /** The on-image text the client supplied, one entry per string to be drawn. */
  copyStrings?: string[] | null;
}

export const APPROACH_LEVELS: readonly ApproachLevel[] = ["restrained", "balanced", "bold"];

export const LEVEL_LABEL_VI: Record<ApproachLevel, string> = {
  restrained: "Tối giản & sang trọng",
  balanced: "Cân bằng",
  bold: "Táo bạo & sáng tạo",
};

/** One line under each option, in the user's language, never in design jargon. */
export const LEVEL_HINT_VI: Record<ApproachChoice, string> = {
  auto: "Hệ thống đọc ý tưởng, Brand Kit và mục tiêu để tự chọn",
  restrained: "Ít chi tiết, nhiều khoảng trống, một điểm nhấn",
  balanced: "Sản phẩm dẫn dắt, một yếu tố hỗ trợ, bố cục rõ ràng",
  bold: "Ý tưởng bất ngờ, bố cục động, tương phản mạnh",
};

export const AUTO_LABEL_VI = "Để AI quyết định";

/**
 * Where the level came from, in the user's words.
 *
 * Deliberately the same vocabulary as `VisualDirectionPlanner.SOURCE_LABELS:40-47`
 * — "User điều chỉnh" and "Phát hiện từ Concept" already mean these things on
 * this screen, and inventing a second phrasing for the same idea would teach the
 * user that two badges mean two different things when they do not.
 */
export const APPROACH_SOURCE_LABEL_VI: Record<ApproachSource, string> = {
  user_selected: "User điều chỉnh",
  concept_tone: "Phát hiện từ Concept",
  brand_style: "Từ Brand Kit",
  objective: "Từ mục tiêu chiến dịch",
  default: "Tự chọn",
};

/** The two messages the user sees when the system overrules the level. */
export const ADJUSTMENT_VI = {
  /** Legibility beats taste, so this one overrules an explicit choice too. */
  copyDensity: "Nội dung chữ dài nên bố cục không thể tối giản hoàn toàn.",
  productHero: "Product Hero cần sản phẩm rõ ràng nên mức táo bạo bị giới hạn.",
} as const;

/**
 * Which tones argue for which level.
 *
 * `warm` appears in neither on purpose: a warm brief says something about
 * temperature, not about how much the frame should dare. Reading it either way
 * would be inventing a signal.
 */
const RESTRAINED_TONES = ["premium", "minimal"] as const;
const BOLD_TONES = ["bold", "energetic"] as const;

export interface ToneSignal {
  level: ApproachLevel;
  /** The tone group that matched, for the reason line. */
  tone: string;
  /** The words that matched, verbatim, so a surprising reading can be traced. */
  match: string;
}

/**
 * The tone of a piece of text, where it has one unambiguously.
 *
 * Deliberately conservative. A brief that says both "sang trọng" and "năng
 * động" has not asked for restraint or for boldness; it has described a tension
 * that only the person who wrote it can resolve. Guessing in that case would
 * produce exactly the unexplained route choices this module exists to end, so
 * mixed groups return no signal and the next step in the precedence gets its
 * turn.
 */
export function toneSignal(text: string | null | undefined): ToneSignal | null {
  const hits = ConceptStructuringLayer.tonesIn(String(text || ""));
  if (hits.length === 0) return null;

  const restrained = hits.filter((h) => (RESTRAINED_TONES as readonly string[]).includes(h.tone));
  const bold = hits.filter((h) => (BOLD_TONES as readonly string[]).includes(h.tone));

  // Both groups present, or neither (warm only): nothing can be concluded.
  if (restrained.length > 0 && bold.length > 0) return null;
  const group = restrained.length > 0 ? restrained : bold;
  if (group.length === 0) return null;

  return {
    level: restrained.length > 0 ? "restrained" : "bold",
    tone: group[0].tone,
    match: group.map((h) => h.match).join(", "),
  };
}

/**
 * Whether the copy is denser than the channel can carry.
 *
 * The threshold is not a number chosen here. `AssetProfile` already declares how
 * many strings each channel supports — poster 3, social 3, banner 2, hero 1
 * (`evolution/experiment/AssetProfile.ts:58-92`) — and `copyFitsChannel` already
 * decides when that is exceeded. This asks that existing question rather than
 * inventing a second answer to it.
 *
 * Strings only. `AssetProfile` declares no word budget, so none is assumed here:
 * a single very long headline is one string and does not trip the veto. Recorded
 * as a known limit in `docs/migration/07-creative-direction-result.md` rather
 * than papered over with a guessed word count.
 */
export function copyIsDense(assetType: string | null | undefined, copyStrings: string[] | null | undefined): boolean {
  const strings = (copyStrings || []).filter((s) => String(s || "").trim().length > 0).length;
  if (strings === 0) return false;
  return !copyFitsChannel(profileFor(assetType), strings).fits;
}

/**
 * `style.forbidden` is not read by the inference, and that is the decision.
 *
 * A forbidden style is a negative constraint, and reading it positively would
 * invert its meaning: "forbidden: minimal" would argue *for* restraint.
 * `DirectionEvaluator.ts:265-276` already marks a route down for hitting a
 * forbidden style, which is where that signal belongs.
 */
export const forbiddenIsIgnored = true;

/**
 * The level, and why.
 *
 * First match wins, then the ceiling and the veto apply to whatever came out —
 * including to a level the user chose by hand, because a frame that cannot be
 * read is not a frame they wanted.
 */
export function inferCreativeApproach(input: ApproachInput): ApproachDecision {
  const decision = choose(input);
  const adjustments: ApproachAdjustment[] = [];
  let level = decision.level;

  // Ceiling. A product hero's job is surface truth — the material, the edges and
  // the markings holding up under inspection (`AssetProfile.ts:85-92`). An idea
  // carried by something the product is not cannot also do that job.
  if (level === "bold" && assetFamilyOf(input.assetType) === "hero") {
    adjustments.push({ from: "bold", to: "balanced", reason_vi: ADJUSTMENT_VI.productHero });
    level = "balanced";
  }

  // Veto. Restraint means most of the frame stays empty; four strings on a poster
  // means it cannot. Legibility wins, and the user is told so.
  if (level === "restrained" && copyIsDense(input.assetType, input.copyStrings)) {
    adjustments.push({ from: "restrained", to: "balanced", reason_vi: ADJUSTMENT_VI.copyDensity });
    level = "balanced";
  }

  return { level, source: decision.source, reason_vi: decision.reason_vi, adjustments };
}

function choose(input: ApproachInput): { level: ApproachLevel; source: ApproachSource; reason_vi: string } {
  // 1. The user said so.
  const choice = input.choice;
  if (choice && choice !== "auto" && (APPROACH_LEVELS as readonly string[]).includes(choice)) {
    return {
      level: choice as ApproachLevel,
      source: "user_selected",
      reason_vi: `Bạn đã chọn ${LEVEL_LABEL_VI[choice as ApproachLevel]}.`,
    };
  }

  // 2. The concept said so.
  const fromConcept = toneSignal(input.concept);
  if (fromConcept) {
    return {
      level: fromConcept.level,
      source: "concept_tone",
      reason_vi: `Ý tưởng của bạn nhắc tới “${fromConcept.match}” nên AI chọn ${LEVEL_LABEL_VI[fromConcept.level]}.`,
    };
  }

  // 3. The Brand Kit said so. Same detector, same rule, so a kit saying
  //    "tối giản, sang trọng" reads exactly as a concept saying it would.
  const fromBrand = toneSignal((input.brandStylePreferred || []).join(", "));
  if (fromBrand) {
    return {
      level: fromBrand.level,
      source: "brand_style",
      reason_vi: `Brand Kit ưu tiên phong cách “${fromBrand.match}” nên AI chọn ${LEVEL_LABEL_VI[fromBrand.level]}.`,
    };
  }

  // 4. The objective said so — but only one of them does.
  //
  //    `branding` is literally "Định vị Cao cấp (Luxury Branding)"
  //    (`MarketingContextForm.tsx:30`), which is a statement about taste.
  //    `promotion` is not its opposite: an offer needs to be clear and
  //    high-contrast, and clarity is not creative boldness. Reading promotion as
  //    a licence to be inventive would push the offer off the poster.
  if (input.objective === "branding") {
    return {
      level: "restrained",
      source: "objective",
      reason_vi: "Mục tiêu “Định vị Cao cấp (Luxury Branding)” nên AI chọn Tối giản & sang trọng.",
    };
  }

  // 5. Nothing was said. Balanced is today's behaviour, so an untouched brief
  //    renders exactly as it did before this module existed.
  return {
    level: "balanced",
    source: "default",
    reason_vi: "Chưa có tín hiệu rõ ràng nên AI dùng mức Cân bằng.",
  };
}
