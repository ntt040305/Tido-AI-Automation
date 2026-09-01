"use client";

import React from "react";
import { CreativeDirection, AspectRatioType } from "../../types/picture-engine.types";
import { Palette, Sparkles, Heart, Sun, Sparkle, ShieldCheck } from "lucide-react";

export interface CreativeStyleOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

export const CREATIVE_STYLE_OPTIONS: CreativeStyleOption[] = [
  {
    id: "premium_luxury",
    label: "Premium Studio",
    description: "Ánh sáng studio cao cấp, high contrast",
    icon: Sparkles,
  },
  {
    id: "ugc_natural",
    label: "UGC Natural",
    description: "Chân thực, gần gũi như ảnh chụp thật",
    icon: Heart,
  },
  {
    id: "festival_promo",
    label: "Rực Rỡ Lễ Hội",
    description: "Nhiều màu sắc, bứt phá năng lượng",
    icon: Sun,
  },
  {
    id: "minimalist_clean",
    label: "Minimal Clean",
    description: "Tối giản, tinh tế, không gian thở",
    icon: Sparkle,
  },
  {
    id: "corporate_pro",
    label: "Corporate Pro",
    description: "Chuyên nghiệp, tin cậy, doanh nghiệp",
    icon: ShieldCheck,
  },
];

export const ASPECT_RATIOS: AspectRatioType[] = ["1:1", "4:5", "9:16", "16:9"];

export interface CreativeDirectionSelectorProps {
  direction: CreativeDirection;
  onChange: (updates: Partial<CreativeDirection>) => void;
}

export function CreativeDirectionSelector({
  direction,
  onChange,
}: CreativeDirectionSelectorProps) {
  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
          <Palette size={15} className="text-accent" />
          <span>Bước 4: Định hướng Nghệ thuật & Phong cách</span>
        </label>
      </div>

      {/* Visual Style Cards */}
      <div>
        <label className="block text-[12.5px] font-medium text-text2 mb-2">
          Phong cách Visual (Visual Style)
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          {CREATIVE_STYLE_OPTIONS.map((style) => {
            const Icon = style.icon;
            const isActive = direction.visual_style === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onChange({ visual_style: style.id })}
                className={`p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer outline-none ${
                  isActive
                    ? "bg-accent/10 border-accent text-white shadow-md ring-1 ring-accent/40"
                    : "bg-surface2/60 border-borderStrong hover:bg-surface2 hover:border-text3 text-text2 hover:text-text"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon
                    size={16}
                    className={isActive ? "text-accent" : "text-text3"}
                  />
                  <span className="text-[12.5px] font-semibold">
                    {style.label}
                  </span>
                </div>
                <p className="text-[10.5px] text-text3 line-clamp-1">
                  {style.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Aspect Ratio Selector */}
      <div>
        <label className="block text-[12.5px] font-medium text-text2 mb-2">
          Tỷ lệ khung hình (Aspect Ratio)
        </label>
        <div className="grid grid-cols-4 gap-2">
          {ASPECT_RATIOS.map((r) => {
            const isActive = direction.aspect_ratio === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onChange({ aspect_ratio: r })}
                className={`py-2 px-3 rounded-xl border font-mono text-[12px] transition-all cursor-pointer outline-none text-center ${
                  isActive
                    ? "bg-text text-bg border-text font-bold shadow-md"
                    : "bg-surface2 text-text2 border-borderStrong hover:text-text hover:border-text3"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Emotional Tone Input */}
      <div>
        <label className="block text-[12.5px] font-medium text-text2 mb-1">
          Tông Cảm xúc (Emotional Tone)
        </label>
        <input
          type="text"
          value={direction.emotional_tone}
          onChange={(e) => onChange({ emotional_tone: e.target.value })}
          placeholder="Ví dụ: Tươi mát, tràn đầy năng lượng, giải nhiệt..."
          className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none"
        />
      </div>

      {/* Phase 2.5: Product Control UI */}
      <div className="pt-3 border-t border-border/60 space-y-4">
        <label className="text-[12.5px] font-semibold text-accent block">
          Cấu hình Nhận diện Sản phẩm (Product Control)
        </label>

        {/* Product Composition Mode */}
        <div>
          <label className="block text-[12px] font-medium text-text2 mb-1.5">
            Bố cục Sản phẩm (Composition Mode)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "single", label: "Hero Đơn lẻ", desc: "1 Sản phẩm chính" },
              { id: "multi", label: "Bộ Combo", desc: "Nhiều sản phẩm" },
              { id: "catalog", label: "Catalog", desc: "Bộ sưu tập" },
            ].map((mode) => {
              const isActive = (direction.product_composition_mode || "single") === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      product_composition_mode: mode.id as any,
                      target_product_count: mode.id === "single" ? 1 : Math.max(2, direction.target_product_count || 2),
                    })
                  }
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    isActive
                      ? "bg-accent/15 border-accent text-white font-semibold"
                      : "bg-surface2 text-text2 border-borderStrong hover:text-text"
                  }`}
                >
                  <div className="text-[12px] font-medium">{mode.label}</div>
                  <div className="text-[10px] opacity-75">{mode.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Identity Strength */}
        <div>
          <label className="block text-[12px] font-medium text-text2 mb-1.5">
            Độ khóa Nhận diện (Identity Strength)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "standard", label: "Standard", desc: "Linh hoạt" },
              { id: "strict", label: "Strict", desc: "Khóa 100% bao bì" },
              { id: "absolute", label: "Absolute", desc: "Khóa tuyệt đối logo" },
            ].map((str) => {
              const isActive = (direction.product_identity_strength || "strict") === str.id;
              return (
                <button
                  key={str.id}
                  type="button"
                  onClick={() => onChange({ product_identity_strength: str.id as any })}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    isActive
                      ? "bg-accent/15 border-accent text-white font-semibold"
                      : "bg-surface2 text-text2 border-borderStrong hover:text-text"
                  }`}
                >
                  <div className="text-[12px] font-medium">{str.label}</div>
                  <div className="text-[10px] opacity-75">{str.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Product Count */}
        <div>
          <label className="block text-[12px] font-medium text-text2 mb-1">
            Số lượng Sản phẩm Mục tiêu (Target Product Count)
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={direction.target_product_count || 1}
            onChange={(e) => onChange({ target_product_count: parseInt(e.target.value, 10) || 1 })}
            className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2 focus:border-accent outline-none font-mono"
          />
        </div>
      </div>
    </div>
  );
}
