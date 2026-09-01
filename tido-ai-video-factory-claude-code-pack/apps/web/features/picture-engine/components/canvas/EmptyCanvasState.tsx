"use client";

import React from "react";
import { Sparkles, Image, CheckCircle2, ArrowRight } from "lucide-react";

export interface EmptyCanvasStateProps {
  hasProductAssets: boolean;
  canGenerate: boolean;
  onFocusBrief?: () => void;
}

export function EmptyCanvasState({
  hasProductAssets,
  canGenerate,
  onFocusBrief,
}: EmptyCanvasStateProps) {
  return (
    <div className="min-h-[480px] w-full flex flex-col items-center justify-center p-8 text-center bg-surface2/30 border border-dashed border-borderStrong rounded-2xl">
      {/* Icon Badge */}
      <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent mb-5 shadow-lg shadow-accent/10">
        <Sparkles size={32} className="animate-pulse" />
      </div>

      {/* Title & Headline */}
      <h3 className="text-[19px] font-bold text-text tracking-tight mb-2">
        Tạo Visual Marketing Chuyên Nghiệp Đầu Tiên
      </h3>
      <p className="text-[13px] text-text3 max-w-md leading-relaxed mb-6">
        TIDO Picture Engine sẽ phân tích bối cảnh ngành hàng, khóa diện mạo sản phẩm và tự động biên dịch Visual Commercial đạt chuẩn chuyển đổi.
      </p>

      {/* Action Guidance Stepper */}
      <div className="w-full max-w-sm space-y-2.5 mb-6 text-left">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-surface border border-borderStrong/60 text-[12.5px]">
          <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-[11px] font-bold flex items-center justify-center">
            1
          </span>
          <span className="text-text2 flex-1">Điền bối cảnh Marketing & Ưu đãi</span>
          <CheckCircle2 size={15} className="text-emerald-400" />
        </div>

        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-surface border border-borderStrong/60 text-[12.5px]">
          <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-[11px] font-bold flex items-center justify-center">
            2
          </span>
          <span className="text-text2 flex-1">Tải lên Ảnh sản phẩm chủ đạo</span>
          {hasProductAssets ? (
            <CheckCircle2 size={15} className="text-emerald-400" />
          ) : (
            <span className="text-[10.5px] font-mono text-accent">Bắt buộc</span>
          )}
        </div>

        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-surface border border-borderStrong/60 text-[12.5px]">
          <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-[11px] font-bold flex items-center justify-center">
            3
          </span>
          <span className="text-text2 flex-1">Bấm nút &quot;TẠO ẢNH COMMERCIAL&quot;</span>
          {canGenerate && <ArrowRight size={15} className="text-accent animate-bounce" />}
        </div>
      </div>
    </div>
  );
}
