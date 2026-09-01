"use client";

import React from "react";
import { Lock, Palette, Sun, Layout, Sparkles } from "lucide-react";

export interface VariantActionsProps {
  onActionClick: (actionType: string) => void;
  disabled?: boolean;
}

export function VariantActions({ onActionClick, disabled }: VariantActionsProps) {
  const actions = [
    {
      id: "keep_product",
      label: "Giữ Khóa Sản phẩm",
      description: "Bảo toàn 100% chi tiết sản phẩm",
      icon: Lock,
      color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
    },
    {
      id: "change_style",
      label: "Đổi Phong cách Visual",
      description: "Thử tone UGC hoặc Premium",
      icon: Palette,
      color: "text-accent border-accent/30 bg-accent/10",
    },
    {
      id: "change_lighting",
      label: "Điều chỉnh Ánh sáng",
      description: "High contrast hoặc Rim light",
      icon: Sun,
      color: "text-amber-400 border-amber-400/30 bg-amber-400/10",
    },
    {
      id: "change_composition",
      label: "Đổi Bố cục Safe Zone",
      description: "Căn lề chữ cho Mobile Feed",
      icon: Layout,
      color: "text-aiGlow border-aiGlow/30 bg-aiGlow/10",
    },
  ];

  return (
    <div className="space-y-3 text-left">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-[12px] font-mono text-text uppercase font-semibold flex items-center gap-1.5">
          <Sparkles size={14} className="text-accent" />
          <span>TỐI ƯU & LẶP LẠI SÁNG TẠO (CREATIVE ITERATION)</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              type="button"
              disabled={disabled}
              onClick={() => onActionClick(act.id)}
              className={`p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer outline-none hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${act.color}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={15} />
                <span className="text-[12.5px] font-semibold">{act.label}</span>
              </div>
              <p className="text-[10.5px] text-text3 line-clamp-1">
                {act.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
