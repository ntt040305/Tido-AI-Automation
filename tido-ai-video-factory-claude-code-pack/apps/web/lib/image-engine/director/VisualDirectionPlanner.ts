import { ControlKey, specFor } from "./visual-controls.types";

/**
 * CIOS Phase 4.1.5 (revised) — the plan the user sees before pressing Generate.
 *
 * Why a planner separate from the director
 * ---------------------------------------
 * The Visual Director Engine decides in prose — "one restrained key with a black
 * negative fill opposite" — which is right for a prompt and useless in a select
 * box. This maps the same reasoning onto the menu options the panel offers, so
 * the user is shown a real recommendation they can accept or change rather than
 * six empty dropdowns.
 *
 * Determinism is the contract
 * --------------------------
 * The panel runs this in the browser to display suggestions; the adapter runs it
 * on the server to bind them. Both are given the same concept and format, so
 * both derive the same plan without the suggestions having to travel in the
 * request. If this function were non-deterministic, or if the two sides passed
 * different inputs, the user would approve one plan and receive another — which
 * is a worse failure than showing nothing, because it looks like it worked.
 *
 * Only the overrides travel. Everything else is re-derived.
 */

export type PlanSource = "concept_detected" | "ai_suggested";

export interface PlannedControl {
  key: ControlKey;
  option: string;
  source: PlanSource;
  /** Shown under the control so the user can see where it came from. */
  source_label: string;
  /** The user-facing option label. */
  label: string;
}

export type VisualDirectionPlan = Partial<Record<ControlKey, PlannedControl>>;

export const SOURCE_LABELS: Record<string, string> = {
  user_selected: "User điều chỉnh",
  concept_detected: "Phát hiện từ Concept",
  ai_suggested: "AI đề xuất",
  ai_decision: "AI đề xuất",
  reference_image: "Từ ảnh tham khảo",
  default: "Tự chọn",
};

export interface PlannerInput {
  concept?: string;
  /** Normalised format id: poster, banner, thumbnail, social_ad, packaging, landing_hero. */
  format?: string;
  /** Free text asset type from the UI, used when no format id is available. */
  assetType?: string;
}

/** Format → the camera and composition that format actually needs. */
const BY_FORMAT: Record<string, Partial<Record<ControlKey, string>>> = {
  poster: { camera: "three_quarter", lens: "telephoto", composition: "rule_of_thirds", typography: "bold_impact" },
  banner: { camera: "eye_level", lens: "wide", composition: "rule_of_thirds", typography: "modern" },
  thumbnail: { camera: "eye_level", lens: "shallow", composition: "full_bleed", typography: "bold_impact" },
  social_ad: { camera: "low_angle", lens: "shallow", composition: "rule_of_thirds", typography: "bold_impact" },
  packaging: { camera: "eye_level", lens: "telephoto", composition: "centered", typography: "minimal" },
  landing_hero: { camera: "eye_level", lens: "wide", composition: "negative_space", typography: "minimal" },
};

/** Concept register → lighting and colour, which are mood decisions rather than format ones. */
const BY_REGISTER: { match: RegExp; lighting: string; color_mood: string }[] = [
  { match: /cao\s?cấp|sang\s?trọng|luxury|premium|đắt|thượng\s?hạng/iu, lighting: "luxury_soft", color_mood: "dark_luxury" },
  { match: /tươi|fresh|tự\s?nhiên|organic|healthy|sạch/iu, lighting: "natural", color_mood: "neutral" },
  { match: /sale|giảm|khuyến\s?mãi|ưu\s?đãi|deal|hot/iu, lighting: "studio", color_mood: "vibrant" },
  { match: /dịu|nhẹ|gentle|sensitive|em\s?bé|baby|chăm\s?sóc/iu, lighting: "bright_airy", color_mood: "pastel" },
  { match: /mạnh|bold|thể\s?thao|sport|năng\s?lượng|energy/iu, lighting: "dramatic", color_mood: "vibrant" },
  { match: /công\s?nghệ|tech|hiện\s?đại|modern|digital/iu, lighting: "studio", color_mood: "cool" },
];

const FALLBACK = { lighting: "studio", color_mood: "neutral" };

export class VisualDirectionPlanner {
  /**
   * The plan for this brief.
   *
   * A control the concept already named is reported as `concept_detected` and
   * outranks the format-derived suggestion, because the user writing "chụp góc
   * thấp" has already made that decision and the panel should show it as theirs
   * rather than as the machine's idea.
   */
  public static plan(input: PlannerInput): VisualDirectionPlan {
    const concept = String(input.concept || "");
    const format = this.normalizeFormat(input.format || input.assetType);
    const plan: VisualDirectionPlan = {};

    const formatDefaults = BY_FORMAT[format] || BY_FORMAT.poster;
    const register = BY_REGISTER.find((r) => r.match.test(concept));

    const suggestions: Partial<Record<ControlKey, string>> = {
      ...formatDefaults,
      lighting: register?.lighting || FALLBACK.lighting,
      color_mood: register?.color_mood || FALLBACK.color_mood,
    };

    for (const key of Object.keys(suggestions) as ControlKey[]) {
      const detected = this.detect(key, concept);
      const option = detected || suggestions[key];
      if (!option) continue;
      const spec = specFor(key);
      const optionSpec = spec.options.find((o) => o.id === option);
      if (!optionSpec) continue;
      const source: PlanSource = detected ? "concept_detected" : "ai_suggested";
      plan[key] = {
        key,
        option,
        source,
        source_label: SOURCE_LABELS[source],
        label: optionSpec.label,
      };
    }

    return plan;
  }

  /** The option a concept explicitly asks for, if any. */
  private static detect(key: ControlKey, concept: string): string | null {
    if (!concept.trim()) return null;
    for (const option of specFor(key).options) {
      if (option.detect && option.detect.test(concept)) return option.id;
    }
    return null;
  }

  /**
   * Format ids and the loose asset-type strings the UI actually sends.
   *
   * The picture-engine asset selector emits values like "Poster", "Social Ad"
   * and "E-commerce"; the director uses normalised ids. Mapping here rather than
   * at the call sites keeps the browser and the server reading the same input.
   */
  public static normalizeFormat(raw?: string): string {
    const key = String(raw || "poster").toLowerCase().trim().replace(/[\s-]+/g, "_");
    if (key.includes("poster") || key.includes("billboard") || key.includes("print")) return "poster";
    if (key.includes("banner")) return "banner";
    if (key.includes("thumbnail")) return "thumbnail";
    if (key.includes("social") || key.includes("instagram") || key.includes("story")) return "social_ad";
    if (key.includes("packaging") || key.includes("packshot") || key.includes("bao_bì")) return "packaging";
    if (key.includes("landing") || key.includes("hero") || key.includes("website")) return "landing_hero";
    if (key.includes("commerce") || key.includes("ecommerce")) return "packaging";
    return "poster";
  }
}
