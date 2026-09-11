/**
 * CIOS Phase 4.1.5 — Visual Direction Control System.
 *
 * What this is for
 * ---------------
 * A user who knows they want a low angle should be able to say so in one click,
 * and a user who does not should not be made to choose. Both are served by the
 * same mechanism: every control defaults to "Tự chọn", and an unset control
 * leaves the decision exactly where Phase 4.1 put it — with the director.
 *
 * The rule that makes this safe
 * ----------------------------
 * A control is a *constraint*, not a suggestion. When a user picks Low Angle the
 * camera angle is low, full stop; the director does not get a vote and cannot
 * override it with something it considers better. That is the whole point of a
 * control, and a system that quietly improves on an explicit instruction is
 * worse than one with no controls at all.
 *
 * Precedence, highest first:
 *
 *   user_selected      the user clicked it
 *   concept_detected   the user wrote it in the concept box
 *   reference_image    read from an uploaded reference
 *   ai_decision        the Visual Director derived it
 *   default            the format's own fallback
 *
 * Simple words in, professional direction out
 * ------------------------------------------
 * The UI says "Ánh sáng mềm sang trọng". The prompt says "soft directional key
 * light, controlled highlights, premium advertising lighting". Users should not
 * have to know the second phrasing to get the first result, and the renderer
 * cannot act on the first. The mapping is this file's job.
 */

export const AUTO = "auto";

export type ControlKey = "camera" | "lens" | "lighting" | "composition" | "typography" | "color_mood";

export const CONTROL_KEYS: ControlKey[] = [
  "camera",
  "lens",
  "lighting",
  "composition",
  "typography",
  "color_mood",
];

export type ControlSource =
  | "user_selected"
  | "concept_detected"
  | "reference_image"
  /**
   * The Visual Direction Plan shown in the panel before Generate.
   *
   * Ranked below a reference read and above the director's free decision: it is
   * a recommendation the user has seen and not objected to, which is weaker
   * evidence than something they said and stronger than something they never
   * saw.
   */
  | "ai_suggested"
  | "ai_decision"
  | "default";

/** Highest first. Index is the precedence rank. */
export const SOURCE_PRECEDENCE: ControlSource[] = [
  "user_selected",
  "concept_detected",
  "reference_image",
  "ai_suggested",
  "ai_decision",
  "default",
];

export interface ControlOption {
  id: string;
  /** What the user sees. Plain language, no technical vocabulary. */
  label: string;
  /** What the renderer is told. Professional, specific, executable. */
  instruction: string;
  /** Words in a concept that mean this option was asked for. */
  detect?: RegExp;
}

export interface ControlSpec {
  key: ControlKey;
  /** Section label in the UI. */
  label: string;
  /** Shown beside the label. Plain emoji, no icon dependency. */
  icon: string;
  /** One line under the label explaining what the control does. */
  help: string;
  options: ControlOption[];
}

/** The note every control carries beside its default. */
export const AUTO_HELP =
  "Chọn Tự chọn nếu bạn nhập yêu cầu trong Concept hoặc muốn AI tự quyết định.";

/**
 * Detection built on Unicode boundaries, not `\b`.
 *
 * `\b` is ASCII-only and fails on any Vietnamese term ending in a diacritic —
 * the bug that made "giảm giá" invisible to the concept parser in Phase 4.1.1.
 * Every pattern here goes through the same helper so it cannot recur.
 */
function vn(body: string): RegExp {
  return new RegExp("(?<![\\p{L}\\p{N}])(?:" + body + ")(?![\\p{L}\\p{N}])", "iu");
}

export const VISUAL_CONTROLS: ControlSpec[] = [
  {
    key: "camera",
    icon: "📷",
    label: "Góc máy",
    help: "Vị trí máy ảnh so với sản phẩm.",
    options: [
      {
        id: "low_angle",
        label: "Góc thấp",
        instruction: "low-angle hero perspective, camera below the subject looking up, so the subject reads as important and aspirational — the viewer looks up at it",
        detect: vn("góc\\s?thấp|low\\s?angle|từ\\s?dưới\\s?lên|hất\\s?lên"),
      },
      {
        id: "eye_level",
        label: "Ngang tầm mắt",
        instruction: "eye-level camera, straight-on, so the subject meets the viewer as an equal — honest and approachable rather than staged",
        detect: vn("ngang\\s?tầm\\s?mắt|eye\\s?level|chính\\s?diện"),
      },
      {
        id: "high_angle",
        label: "Góc cao",
        instruction: "elevated camera looking down, opening the scene out so the viewer takes in the whole situation — inviting, unintimidating",
        detect: vn("góc\\s?cao|high\\s?angle|từ\\s?trên\\s?nhìn\\s?xuống"),
      },
      {
        id: "top_down",
        label: "Nhìn từ trên xuống",
        instruction: "directly overhead, perpendicular to the surface, turning the arrangement itself into the subject — deliberate, curated, editorial",
        detect: vn("từ\\s?trên\\s?xuống|top\\s?down|flat\\s?lay|nhìn\\s?thẳng\\s?từ\\s?trên"),
      },
      {
        id: "three_quarter",
        label: "Góc chéo 3/4",
        instruction: "three-quarter angle showing front and side planes together, so the object reads as solid and physically present rather than as a flat image",
        detect: vn("góc\\s?chéo|3/4|ba\\s?phần\\s?tư|three\\s?quarter"),
      },
    ],
  },
  {
    key: "lens",
    icon: "🔍",
    label: "Ống kính & độ nét",
    help: "Mức độ xoá phông và cảm giác ống kính.",
    options: [
      {
        id: "shallow",
        label: "Xoá phông mạnh",
        instruction: "shallow depth of field, background falling into smooth defocus, 85mm equivalent — isolates the subject and tells the viewer exactly where to look",
        detect: vn("xoá\\s?phông|xóa\\s?phông|bokeh|shallow|mờ\\s?hậu\\s?cảnh"),
      },
      {
        id: "deep",
        label: "Nét toàn bộ",
        instruction: "deep focus, foreground to background tack sharp, f/11 equivalent — the whole situation matters, nothing in the scene is incidental",
        detect: vn("nét\\s?toàn\\s?bộ|deep\\s?focus|rõ\\s?hết|sắc\\s?nét\\s?toàn"),
      },
      {
        id: "wide",
        label: "Góc rộng",
        instruction: "wide-angle 24-35mm equivalent with air around the subject, so the place the subject is in becomes part of the story",
        detect: vn("góc\\s?rộng|wide\\s?angle|rộng"),
      },
      {
        id: "telephoto",
        label: "Nén hậu cảnh",
        instruction: "telephoto compression, 135mm equivalent, background flattened into a clean field — calm, composed, nothing competing",
        detect: vn("nén\\s?hậu\\s?cảnh|telephoto|tele"),
      },
      {
        id: "macro",
        label: "Cận cảnh chi tiết",
        instruction: "macro detail, extreme close focus on surface and material — close enough that the viewer can almost feel the texture",
        detect: vn("macro|cận\\s?cảnh|chi\\s?tiết\\s?bề\\s?mặt"),
      },
    ],
  },
  {
    key: "lighting",
    icon: "💡",
    label: "Ánh sáng",
    help: "Cách sản phẩm được chiếu sáng.",
    options: [
      {
        id: "luxury_soft",
        label: "Ánh sáng mềm sang trọng",
        instruction: "soft directional key light with controlled highlights and gentle shadow falloff — expensive-feeling and calm, the light of something made carefully",
        detect: vn("mềm\\s?sang\\s?trọng|luxury\\s?soft|ánh\\s?sáng\\s?mềm|dịu\\s?sang\\s?trọng"),
      },
      {
        id: "studio",
        label: "Studio chuyên nghiệp",
        instruction: "controlled studio lighting, large softbox key with balanced fill — clean, deliberate, everything visible and nothing hidden",
        detect: vn("studio|đèn\\s?studio|chuyên\\s?nghiệp"),
      },
      {
        id: "natural",
        label: "Ánh sáng tự nhiên",
        instruction: "natural window light, single directional source with visible falloff — real, unstaged, a moment that happened rather than one that was built",
        detect: vn("tự\\s?nhiên|natural\\s?light|ánh\\s?sáng\\s?ban\\s?ngày|cửa\\s?sổ"),
      },
      {
        id: "dramatic",
        label: "Tương phản mạnh",
        instruction: "high-contrast lighting, hard key with deep intentional shadow — bold and confident, the subject as an event rather than an object",
        detect: vn("tương\\s?phản\\s?mạnh|dramatic|gắt|contrast\\s?cao"),
      },
      {
        id: "backlit",
        label: "Ngược sáng",
        instruction: "backlit rim lighting with luminous edge definition and soft frontal fill — the subject glows out of its background, singled out",
        detect: vn("ngược\\s?sáng|backlit|rim\\s?light|viền\\s?sáng"),
      },
      {
        id: "bright_airy",
        label: "Sáng thoáng",
        instruction: "high-key bright and airy, near-shadowless — fresh, light, easy, nothing to be wary of",
        detect: vn("sáng\\s?thoáng|high\\s?key|tươi\\s?sáng|thoáng"),
      },
    ],
  },
  {
    key: "composition",
    icon: "🎨",
    label: "Bố cục",
    help: "Cách sắp xếp sản phẩm trong khung hình.",
    options: [
      {
        id: "centered",
        label: "Sản phẩm ở giữa",
        instruction: "centred symmetrical composition on the vertical axis — stable, authoritative, the subject as the settled centre of its world",
        detect: vn("ở\\s?giữa|trung\\s?tâm|centred|centered|chính\\s?giữa"),
      },
      {
        id: "rule_of_thirds",
        label: "Lệch theo bố cục 1/3",
        instruction: "rule-of-thirds composition, subject offset to one third with counterweight opposite — alive and unposed, the frame implies more beyond it",
        detect: vn("1/3|rule\\s?of\\s?thirds|bố\\s?cục\\s?ba\\s?phần|lệch"),
      },
      {
        id: "negative_space",
        label: "Nhiều khoảng trống",
        instruction: "generous negative space with the subject a minority of the frame — confidence: it does not need to shout to be seen",
        detect: vn("khoảng\\s?trống|negative\\s?space|tối\\s?giản\\s?khung|nhiều\\s?chỗ\\s?trống"),
      },
      {
        id: "full_bleed",
        label: "Sản phẩm chiếm trọn khung",
        instruction: "subject filling the frame edge to edge, cropped confidently — immediate and physical, impossible to scroll past",
        detect: vn("chiếm\\s?trọn|full\\s?bleed|đầy\\s?khung|kín\\s?khung"),
      },
      {
        id: "flat_lay",
        label: "Xếp phẳng có bố cục",
        instruction: "arranged flat-lay on a single plane with intentional spacing — order and care, the sense of a considered selection",
        detect: vn("xếp\\s?phẳng|flat\\s?lay|bày\\s?phẳng"),
      },
    ],
  },
  {
    key: "typography",
    icon: "🔤",
    label: "Kiểu chữ",
    help: "Phong cách chữ hiển thị trên ảnh.",
    options: [
      {
        id: "bold_impact",
        label: "Đậm & nổi bật",
        instruction: "heavy condensed display typography, maximum weight and contrast, promotional impact typography",
        detect: vn("chữ\\s?đậm|đậm\\s?nổi\\s?bật|bold|impact|to\\s?rõ"),
      },
      {
        id: "minimal",
        label: "Tối giản",
        instruction: "minimal typography, light weight, generous letter spacing, restrained and quiet",
        detect: vn("chữ\\s?tối\\s?giản|minimal\\s?type|đơn\\s?giản\\s?chữ"),
      },
      {
        id: "elegant",
        label: "Thanh lịch",
        instruction: "elegant high-contrast serif typography, refined proportions, premium editorial typesetting",
        detect: vn("thanh\\s?lịch|elegant|serif|sang\\s?trọng\\s?chữ"),
      },
      {
        id: "modern",
        label: "Hiện đại",
        instruction: "clean geometric sans-serif typography, even weight, contemporary commercial typesetting",
        detect: vn("hiện\\s?đại|modern|sans|gọn\\s?gàng"),
      },
      {
        id: "none",
        label: "Không có chữ",
        instruction: "no rendered typography anywhere in the image; the frame carries no words, letters or numerals",
        detect: vn("không\\s?chữ|không\\s?có\\s?chữ|no\\s?text|không\\s?text"),
      },
    ],
  },
  {
    key: "color_mood",
    icon: "🌈",
    label: "Tông màu",
    help: "Cảm giác màu sắc tổng thể.",
    options: [
      {
        id: "warm",
        label: "Ấm áp",
        instruction: "warm colour grade, amber highlights and soft warm midtones, inviting commercial warmth",
        detect: vn("ấm\\s?áp|warm|tông\\s?ấm|vàng\\s?ấm"),
      },
      {
        id: "cool",
        label: "Mát lạnh",
        instruction: "cool colour grade, blue-leaning neutrals and clean white highlights, crisp and clinical",
        detect: vn("mát\\s?lạnh|cool|tông\\s?lạnh|xanh\\s?lạnh"),
      },
      {
        id: "neutral",
        label: "Trung tính",
        instruction: "neutral colour grade, accurate whites, no colour cast in highlights or shadows",
        detect: vn("trung\\s?tính|neutral|màu\\s?thật"),
      },
      {
        id: "vibrant",
        label: "Rực rỡ",
        instruction: "high-chroma vibrant palette, saturated colour carrying the frame, bold graphic commercial colour",
        detect: vn("rực\\s?rỡ|vibrant|nổi\\s?bật\\s?màu|sặc\\s?sỡ"),
      },
      {
        id: "dark_luxury",
        label: "Tối sang trọng",
        instruction: "dark low-key palette, deep neutrals with a single metallic accent, restrained luxury colour",
        detect: vn("tối\\s?sang\\s?trọng|dark\\s?luxury|tông\\s?tối|đen\\s?sang"),
      },
      {
        id: "pastel",
        label: "Pastel nhẹ",
        instruction: "soft pastel palette, low saturation, pale harmonious tones with no hard blacks",
        detect: vn("pastel|màu\\s?nhạt|nhẹ\\s?nhàng\\s?màu"),
      },
    ],
  },
];

/** What the user picked. `auto` or absent means the control is unset. */
export type VisualDirectionControls = Partial<Record<ControlKey, string>>;

export interface ResolvedControl {
  key: ControlKey;
  /** Option id, or null where nothing resolved it. */
  option: string | null;
  /** The user-facing label, for reporting back to the UI. */
  label: string;
  /** The professional instruction, or "" where nothing resolved it. */
  instruction: string;
  source: ControlSource;
  /** Why this source won, for tracing a surprising result. */
  reason: string;
}

export interface ResolvedVisualControls {
  controls: Record<ControlKey, ResolvedControl>;
  /** Controls set by the user or detected in the concept — the binding ones. */
  explicit: ResolvedControl[];
  /** True where the user left everything on Tự chọn and wrote no direction. */
  fully_auto: boolean;
}

export function optionFor(key: ControlKey, id: string | null | undefined): ControlOption | undefined {
  if (!id || id === AUTO) return undefined;
  return VISUAL_CONTROLS.find((c) => c.key === key)?.options.find((o) => o.id === id);
}

export function specFor(key: ControlKey): ControlSpec {
  const spec = VISUAL_CONTROLS.find((c) => c.key === key);
  if (!spec) throw new Error(`Unknown visual control: ${key}`);
  return spec;
}
