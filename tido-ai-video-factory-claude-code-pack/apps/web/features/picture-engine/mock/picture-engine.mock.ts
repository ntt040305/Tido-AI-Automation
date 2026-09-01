import {
  CreativeBrief,
  AIStrategy,
  GeneratedAsset,
  CreativeSession,
} from "../types/picture-engine.types";

export const mockCreativeSession: CreativeSession = {
  projectId: "proj_tido_1772129000",
  projectName: "Chiến dịch Hè TIDO Cafe 2026",
  campaignName: "Hè Bay Lên - Conversion Sales",
  created_at: new Date().toISOString(),
};

export const mockCreativeBrief: CreativeBrief = {
  asset_type: "poster",
  marketing_context: {
    industry: "food_beverage",
    objective: "conversion",
    target_channel: "facebook_ads",
    target_audience: "Gen-Z Professionals & Trẻ em (18-28 tuổi)",
  },
  sales_context: {
    product_name: "Trà Trái Cây Nhiệt Đới TIDO",
    offer_text: "Mua 1 Tặng 1 Giờ Vàng (14h - 17h)",
    pain_point: "Thời tiết nắng nóng gay gắt cần đồ uống giải nhiệt lập tức",
    benefit: "Chiết xuất 100% trái cây tươi, xua tan cái nóng ngay 3 giây",
    cta_text: "Đặt Ngay Nhận Ưu Đãi",
  },
  creative_direction: {
    visual_style: "premium_luxury",
    emotional_tone: "vibrant_refreshing",
    aspect_ratio: "9:16",
    composition_layout: "Hero center splash product macro with text safe zone top 30%",
  },
  brand_identity: {
    brand_name: "TIDO Cafe",
    primary_colors: ["#090A0F", "#3B82F6"],
    product_assets: [
      {
        asset_id: "asset_prod_01",
        type: "product_hero",
        file_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop",
        filename: "tra_trai_cay_hero.png",
      },
    ],
  },
  user_notes: "Cần hiệu ứng giọt nước đọng trên ly trà tươi mát.",
};

export const mockAIStrategy: AIStrategy = {
  creative_angle: "High-contrast commercial splash macro render with dynamic rim lighting",
  applied_knowledge_nodes: [
    "mk_food_conversion_01 (High CTR Visual Framing)",
    "cg_lighting_dramatic (Commercial Rim Light)",
    "brand_dna_tido (Color Harmony Lock)",
  ],
  applied_technique_cards: [
    "card_hero_close_up (Macro Beverage Composition)",
    "card_copy_hierarchy (CTA Safe Zone Optimization)",
  ],
  compiled_prompt:
    "[COMMERCIAL DIRECTIVE] Premium luxury commercial visual for TIDO Cafe fruit tea. Dynamic splash action, droplets on glass, vibrant tropical fruits, dramatic lighting, high conversion visual framing.",
  negative_prompt: "blurry, distorted, dull colors, bad text alignment, low resolution",
};

export const mockGeneratedAsset: GeneratedAsset = {
  asset_id: "asset_gen_1772129000_99",
  image_url:
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1080&auto=format&fit=crop",
  aspect_ratio: "9:16",
  qc_scorecard: {
    overall_score: 0.94,
    brand_alignment_score: 0.92,
    technical_quality_score: 0.96,
    commercial_impact_score: 0.94,
    validation_result: "pass",
    issues: [],
  },
  ai_explanation:
    "Visual được thiết kế chuyên biệt cho Ngành F&B (Chuyển đổi). Ánh sáng chiếu góc 45° tôn vinh màu sắc quả tươi, vùng an toàn top 30% sẵn sàng cho Headline 'HÈ BAY LÊN'.",
  created_at: new Date().toISOString(),
};
