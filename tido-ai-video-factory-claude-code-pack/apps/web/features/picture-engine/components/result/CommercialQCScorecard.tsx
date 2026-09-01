"use client";

import React from "react";
import { ImageQCScorecard } from "../../types/picture-engine.types";
import { CheckCircle2, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";

export interface CommercialQCScorecardProps {
  scorecard: ImageQCScorecard;
}

export function CommercialQCScorecard({ scorecard }: CommercialQCScorecardProps) {
  const categories = [
    {
      name: "Visual Quality (Chất lượng thị giác)",
      score: scorecard.technical_quality_score,
    },
    {
      name: "Brand Consistency (Nhất quán thương hiệu)",
      score: scorecard.brand_alignment_score,
    },
    {
      name: "Product Accuracy (Chính xác sản phẩm)",
      score: scorecard.overall_score,
    },
    {
      name: "Commercial Readiness (Sẵn sàng Quảng cáo)",
      score: scorecard.commercial_impact_score,
    },
  ];

  return (
    <div className="bg-surface2/60 border border-borderStrong rounded-2xl p-4 space-y-3 text-left">
      <div className="flex items-center justify-between border-b border-borderStrong pb-2">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
          <ShieldCheck size={16} className="text-emerald-400" />
          <span>Bảng điểm Đánh giá Quảng cáo (Commercial QC)</span>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/30">
          QC {scorecard.validation_result.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {categories.map((cat, idx) => {
          const percent = Math.round(cat.score * 100);
          return (
            <div
              key={idx}
              className="p-2.5 bg-surface border border-borderStrong/60 rounded-xl space-y-1"
            >
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-text2 font-medium line-clamp-1">
                  {cat.name}
                </span>
                <span className="font-mono text-text font-bold">
                  {percent}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-surface2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {scorecard.issues.length > 0 && (
        <div className="pt-1">
          <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
            <AlertCircle size={12} />
            <span>Lưu ý tối ưu: {scorecard.issues.join(", ")}</span>
          </span>
        </div>
      )}
    </div>
  );
}
