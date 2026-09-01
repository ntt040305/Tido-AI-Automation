"use client";

import React from "react";
import {
  MarketingContext,
  IndustryType,
  CampaignObjective,
} from "../../types/picture-engine.types";
import { Target, Building2, Share2, Users } from "lucide-react";

export interface MarketingContextFormProps {
  context: MarketingContext;
  onChange: (updates: Partial<MarketingContext>) => void;
}

export const INDUSTRY_OPTIONS: { id: IndustryType; label: string }[] = [
  { id: "food_beverage", label: "Ẩm thực & Đồ uống (F&B)" },
  { id: "beauty_skincare", label: "Mỹ phẩm & Skincare" },
  { id: "fashion_apparel", label: "Thời trang & Phụ kiện" },
  { id: "electronics_tech", label: "Công nghệ & Điện tử" },
  { id: "healthcare_wellness", label: "Sức khỏe & Spa" },
  { id: "real_estate", label: "Bất động sản & Kiến trúc" },
  { id: "education", label: "Giáo dục & Tri thức" },
];

export const OBJECTIVE_OPTIONS: { id: CampaignObjective; label: string }[] = [
  { id: "conversion", label: "Tăng tỷ lệ Chuyển đổi (Conversion Sales)" },
  { id: "awareness", label: "Nhận diện Thương hiệu (Brand Awareness)" },
  { id: "promotion", label: "Chương trình Khuyến mãi (Promotion Campaign)" },
  { id: "branding", label: "Định vị Cao cấp (Luxury Branding)" },
];

export function MarketingContextForm({
  context,
  onChange,
}: MarketingContextFormProps) {
  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
          <Target size={15} className="text-accent" />
          <span>Bước 2: Bối cảnh Marketing</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3.5">
        {/* Industry Selector */}
        <div>
          <label className="block text-[12.5px] font-medium text-text2 mb-1 flex items-center gap-1">
            <Building2 size={13} />
            <span>Ngành hàng</span>
          </label>
          <select
            value={context.industry}
            onChange={(e) =>
              onChange({ industry: e.target.value as IndustryType })
            }
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none cursor-pointer"
          >
            {INDUSTRY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Objective Selector */}
        <div>
          <label className="block text-[12.5px] font-medium text-text2 mb-1 flex items-center gap-1">
            <Target size={13} />
            <span>Mục tiêu Chiến dịch</span>
          </label>
          <select
            value={context.objective}
            onChange={(e) =>
              onChange({ objective: e.target.value as CampaignObjective })
            }
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none cursor-pointer"
          >
            {OBJECTIVE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-[12.5px] font-medium text-text2 mb-1 flex items-center gap-1">
            <Users size={13} />
            <span>Đối tượng Khách hàng</span>
          </label>
          <input
            type="text"
            value={context.target_audience}
            onChange={(e) => onChange({ target_audience: e.target.value })}
            placeholder="Ví dụ: Gen-Z Professionals (18-28 tuổi), văn phòng nhiệt huyết..."
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none"
          />
        </div>

        {/* Target Channel */}
        <div>
          <label className="block text-[12.5px] font-medium text-text2 mb-1 flex items-center gap-1">
            <Share2 size={13} />
            <span>Kênh Phân phối (Channel)</span>
          </label>
          <input
            type="text"
            value={context.target_channel}
            onChange={(e) => onChange({ target_channel: e.target.value })}
            placeholder="Ví dụ: facebook_ads, tiktok_feed, shopee_banner..."
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none"
          />
        </div>
      </div>
    </div>
  );
}
