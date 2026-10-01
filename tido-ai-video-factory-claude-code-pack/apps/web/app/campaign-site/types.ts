export type AssetType = "poster" | "banner" | "social_ad" | "product_hero" | "thumbnail";

export const ASSET_TYPES: { id: AssetType; label: string }[] = [
  { id: "poster", label: "Poster" },
  { id: "banner", label: "Banner" },
  { id: "social_ad", label: "Social Ad" },
  { id: "product_hero", label: "Product Hero" },
  { id: "thumbnail", label: "Thumbnail" },
];

export interface ArtDecision {
  dimension: string;
  value: string;
  source: string;
  confidence: number;
  specificity: string;
  score: number;
  client_locked: boolean;
  qualifiers?: string[];
}

export interface Asset {
  asset_type: AssetType;
  use_case: string;
  aspect_ratio: string;
  asset_goal: string;
  layout_logic: {
    eye_flow: string;
    negative_space_strategy: string;
    safe_margin_percent: number;
    zones: { role: string; x: number; y: number; width: number; height: number }[];
  };
  visual_priority: { element: string; importance: number; role: string }[];
  prompt_plan: {
    campaign_dna_applied: string[];
    asset_adaptations: string[];
    art_direction_sources: Record<string, string>;
    art_direction_decisions: ArtDecision[];
    knowledge_blocks: string[];
    client_locked_dimensions: string[];
  };
  final_prompt?: string;
  prompt_chars: number;
  warnings: string[];
  error?: { code: string; message: string };
}

export interface CampaignResponse {
  success: boolean;
  campaign?: any;
  strategy?: any;
  assets?: Asset[];
  delivery?: { package_root: string; file_count: number };
  diagnostics?: any;
  error?: { code: string; message: string };
}

export const SAMPLE_BRIEF = {
  brand: "Skin1004",
  product: "Tone Brightening Capsule Ampoule",
  industry: "beauty_skincare",
  audience: "Phụ nữ 25-40 tuổi",
  objective: "Ra mắt dòng skincare cao cấp",
  channel: "instagram",
  tone: "Skincare Hàn Quốc cao cấp",
  concept:
    "Chai ampoule làm chủ thể trên nền sạch, ánh sáng chếch dịu, cảm giác skincare Hàn Quốc cao cấp và tĩnh tại.",
};

export const BRIEF_FIELDS: {
  key: keyof typeof SAMPLE_BRIEF;
  label: string;
  textarea?: boolean;
  hint?: string;
}[] = [
  { key: "brand", label: "Thương hiệu" },
  { key: "product", label: "Sản phẩm / dịch vụ" },
  { key: "industry", label: "Ngành hàng" },
  { key: "audience", label: "Đối tượng mục tiêu" },
  { key: "objective", label: "Mục tiêu chiến dịch" },
  { key: "channel", label: "Kênh / nền tảng" },
  { key: "tone", label: "Tông thương hiệu" },
  {
    key: "concept",
    label: "Định hướng sáng tạo",
    textarea: true,
    hint: "Bất kỳ yêu cầu cụ thể nào: góc máy, ánh sáng, bối cảnh. Yêu cầu đã nêu rõ sẽ được khoá và không lớp nào ghi đè được.",
  },
];

export const SOURCE_LABEL: Record<string, string> = {
  USER: "Khách hàng",
  REFERENCE: "Ảnh tham chiếu",
  STRATEGY: "Chiến lược chiến dịch",
  KNOWLEDGE: "Kiến thức chuyên môn",
  ASSET_DEFAULT: "Mặc định định dạng",
};

export const DIMENSION_LABEL: Record<string, string> = {
  camera: "Góc máy",
  lighting: "Ánh sáng",
  composition: "Bố cục",
  colour: "Màu sắc",
  environment: "Bối cảnh",
  materials: "Chất liệu",
  atmosphere: "Không khí",
};
