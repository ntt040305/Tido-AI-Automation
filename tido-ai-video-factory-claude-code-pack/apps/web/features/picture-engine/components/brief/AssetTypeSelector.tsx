"use client";

import React from "react";
import { AssetType } from "../../types/picture-engine.types";
import { Layout, ShoppingBag, Tv, Megaphone, Smartphone } from "lucide-react";

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
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry flex items-center gap-1.5">
          <span>LOẠI TÀI SẢN SẢN XUẤT</span>
        </label>
        <span className="text-[10.5px] font-mono text-text uppercase px-1.5 py-0.2 rounded-[2px] bg-surface2 border border-border">
          {selected}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ASSET_TYPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`p-2.5 rounded-[2px] border text-left transition-colors cursor-pointer outline-none flex flex-col justify-between h-[84px] ${
                isActive
                  ? "bg-surface3 border-borderStrong text-text"
                  : "bg-surface2 border-border hover:border-borderStrong text-text-muted hover:text-text"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <Icon
                  size={16}
                  className={isActive ? "text-text" : "text-text-telemetry"}
                />
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-[1px] bg-tally-live" />
                )}
              </div>
              <div>
                <div className="text-[12.5px] font-semibold tracking-tight font-sans">
                  {opt.label}
                </div>
                <div className="text-[10px] text-text-telemetry line-clamp-1 mt-0.5 font-sans">
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
