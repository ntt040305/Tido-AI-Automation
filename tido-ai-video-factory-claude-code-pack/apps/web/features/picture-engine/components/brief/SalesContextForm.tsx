"use client";

import React from "react";
import { SalesContext } from "../../types/picture-engine.types";
import { ShoppingCart, Gift, HelpCircle, CheckCircle, MousePointerClick } from "lucide-react";

export interface SalesContextFormProps {
  salesContext: SalesContext;
  onChange: (updates: Partial<SalesContext>) => void;
}

export function SalesContextForm({
  salesContext,
  onChange,
}: SalesContextFormProps) {
  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
          <ShoppingCart size={15} className="text-accent" />
          <span>Bước 3: Ngôn ngữ Bán hàng (Sales & Offer)</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3.5">
        {/* Product Name (Required) */}
        <div>
          <label className="block text-[12.5px] font-medium text-text mb-1 flex items-center gap-1">
            <span>Tên Sản phẩm / Dịch vụ</span>
            <span className="text-accent">*</span>
          </label>
          <input
            type="text"
            value={salesContext.product_name}
            onChange={(e) => onChange({ product_name: e.target.value })}
            placeholder="Ví dụ: Trà Trái Cây Nhiệt Đới TIDO"
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none font-medium"
          />
        </div>

        {/* Offer Text */}
        <div>
          <label className="block text-[12.5px] font-medium text-text2 mb-1 flex items-center gap-1">
            <Gift size={13} />
            <span>Ưu đãi Special Offer</span>
          </label>
          <input
            type="text"
            value={salesContext.offer_text || ""}
            onChange={(e) => onChange({ offer_text: e.target.value })}
            placeholder="Ví dụ: Mua 1 Tặng 1 Giờ Vàng (14h - 17h)"
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none"
          />
        </div>

        {/* Customer Pain Point */}
        <div>
          <label className="block text-[12.5px] font-medium text-text2 mb-1 flex items-center gap-1">
            <HelpCircle size={13} />
            <span>Nỗi đau Khách hàng (Pain Point)</span>
          </label>
          <input
            type="text"
            value={salesContext.pain_point || ""}
            onChange={(e) => onChange({ pain_point: e.target.value })}
            placeholder="Ví dụ: Nắng nóng oi bức làm kiệt sức..."
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none"
          />
        </div>

        {/* Key Benefit */}
        <div>
          <label className="block text-[12.5px] font-medium text-text2 mb-1 flex items-center gap-1">
            <CheckCircle size={13} />
            <span>Giải pháp / Lợi ích vượt trội</span>
          </label>
          <input
            type="text"
            value={salesContext.benefit || ""}
            onChange={(e) => onChange({ benefit: e.target.value })}
            placeholder="Ví dụ: Giải nhiệt tức thì trong 3 giây với trái cây tươi..."
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none"
          />
        </div>

        {/* CTA Text */}
        <div>
          <label className="block text-[12.5px] font-medium text-text2 mb-1 flex items-center gap-1">
            <MousePointerClick size={13} />
            <span>Lời kêu gọi hành động (CTA)</span>
          </label>
          <input
            type="text"
            value={salesContext.cta_text || ""}
            onChange={(e) => onChange({ cta_text: e.target.value })}
            placeholder="Ví dụ: Đặt Ngay Nhận Ưu Đãi"
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none"
          />
        </div>
      </div>
    </div>
  );
}
