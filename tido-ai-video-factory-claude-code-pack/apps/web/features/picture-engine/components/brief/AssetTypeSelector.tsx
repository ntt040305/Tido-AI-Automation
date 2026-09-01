"use client";

import React from "react";
import { AssetType } from "../../types/picture-engine.types";
import { Layout, Image, ShoppingBag, Tv, Megaphone, Smartphone } from "lucide-react";

export interface AssetTypeOption {
  id: AssetType;
  label: string;
  description: string;
  icon: React.ElementType;
}

export const ASSET_TYPE_OPTIONS: AssetTypeOption[] = [
  {
    id: "poster",
    label: "Poster",
    description: "Ấn phẩm quảng cáo thương mại dọc",
    icon: Layout,
  },
  {
    id: "social_ad",
    label: "Social Ad",
    description: "Quảng cáo Facebook / Instagram",
    icon: Megaphone,
  },
  {
    id: "product_hero",
    label: "Product Hero",
    description: "Visual sản phẩm chủ đạo high-end",
    icon: ShoppingBag,
  },
  {
    id: "banner",
    label: "Banner Website",
    description: "Banner trang chủ & Marketplace",
    icon: Tv,
  },
  {
    id: "ugc_thumbnail",
    label: "Thumbnail / UGC",
    description: "Ảnh bìa video TikTok & Reels",
    icon: Smartphone,
  },
];

export interface AssetTypeSelectorProps {
  selected: AssetType;
  onChange: (type: AssetType) => void;
}

export function AssetTypeSelector({
  selected,
  onChange,
}: AssetTypeSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span>Bước 1: Loại tài sản sản xuất</span>
        </label>
        <span className="text-[11px] font-mono text-accent uppercase">
          {selected}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {ASSET_TYPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer outline-none flex flex-col justify-between h-[92px] ${
                isActive
                  ? "bg-accent/10 border-accent text-white shadow-md shadow-accent/10 ring-1 ring-accent/40"
                  : "bg-surface2/60 border-borderStrong hover:bg-surface2 hover:border-text3 text-text2 hover:text-text"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <Icon
                  size={18}
                  className={isActive ? "text-accent" : "text-text3"}
                />
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                )}
              </div>
              <div>
                <div className="text-[13px] font-semibold tracking-tight">
                  {opt.label}
                </div>
                <div className="text-[10.5px] text-text3 line-clamp-1 mt-0.5">
                  {opt.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
