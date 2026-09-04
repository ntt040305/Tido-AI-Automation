"use client";

import React from "react";
import { GeneratedAsset } from "../../types/picture-engine.types";
import { CommercialQCScorecard } from "./CommercialQCScorecard";
import { VariantActions } from "./VariantActions";
import { Sparkles, Download, Share2, Award, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";

export interface ResultReviewPanelProps {
  asset: GeneratedAsset;
  isDownloading?: boolean;
  onDownload: () => void;
  onIterationAction: (actionType: string) => void;
}

export function ResultReviewPanel({
  asset,
  isDownloading = false,
  onDownload,
  onIterationAction,
}: ResultReviewPanelProps) {
  // Structured AI Decision Explanation
  const aiDecisions = [
    {
      decision: "Bố cục Food Hero Macro (Góc quay 45°)",
      reason: "Sản phẩm cần nổi bật tối đa khi người dùng lướt nhanh trên di động",
      impact: "Tăng mức độ nhận diện sản phẩm ngay 0.5 giây đầu tiên",
    },
    {
      decision: "Ánh sáng Studio High-Contrast Rim Light",
      reason: "Tôn vinh sự tươi mát của giọt nước đọng trên sản phẩm đồ uống F&B",
      impact: "Tạo cảm giác giải nhiệt tức thì, kích thích khao khát mua hàng",
    },
    {
      decision: "Vùng An Toàn Chữ Top 30%",
      reason: "Dành không gian rõ ràng cho Headline & Offer 'Mua 1 Tặng 1'",
      impact: "Đảm bảo thông điệp bán hàng không bị đè lên hình ảnh sản phẩm",
    },
  ];

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xl space-y-6 text-left">
      {/* Panel Header & Creative Score Estimate */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="text-[11px] font-mono text-accent uppercase font-semibold flex items-center gap-1.5">
            <Award size={14} />
            <span>RESULT REVIEW & CREATIVE EVALUATION</span>
          </div>
          <h2 className="text-[18px] font-bold text-text tracking-tight mt-0.5">
            Kết Quả Sản Xuất Visual
          </h2>
        </div>

        <div className="text-right">
          <span className="text-[10.5px] font-mono text-text3 uppercase block">
            Creative Score Estimate
          </span>
          <span className="text-[20px] font-mono font-extrabold text-emerald-400">
            {Math.round(asset.qc_scorecard.overall_score * 100)}/100
          </span>
        </div>
      </div>

      {/* QC Scorecard Breakdown */}
      <CommercialQCScorecard scorecard={asset.qc_scorecard} />

      {/* AI Strategy Explanation: Decision -> Reason -> Impact */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text border-b border-border pb-2">
          <Sparkles size={15} className="text-aiGlow" />
          <span>Giải Thích Quyết Định AI (AI Strategic Decision Breakdown)</span>
        </div>

        <div className="space-y-2.5">
          {aiDecisions.map((item, idx) => (
            <div
              key={idx}
              className="p-3 bg-surface2/60 border border-borderStrong rounded-xl text-[12px] space-y-1"
            >
              <div className="font-semibold text-accent flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span>Quyết định {idx + 1}: {item.decision}</span>
              </div>
              <div className="text-text2 pl-4">
                <span className="text-text3 font-medium">Lý do: </span>
                <span>{item.reason}</span>
              </div>
              <div className="text-emerald-400/90 font-mono text-[11px] pl-4 flex items-center gap-1">
                <ArrowRight size={11} />
                <span>Tác động: {item.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Creative Iteration Actions */}
      <VariantActions onActionClick={onIterationAction} />

      {/* Export & Download Action Bar */}
      <div className="pt-3 border-t border-border flex items-center gap-3">
        <button
          type="button"
          disabled={isDownloading}
          onClick={onDownload}
          className="flex-1 py-3 px-4 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold text-[14px] rounded-xl transition-all shadow-lg shadow-accent/25 flex items-center justify-center gap-2 cursor-pointer outline-none"
        >
          {isDownloading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          <span>{isDownloading ? "Đang tải ảnh 2K..." : "Tải Xuất Visual 2K (PNG)"}</span>
        </button>

        <button
          type="button"
          className="p-3 bg-surface2 hover:bg-surface3 border border-borderStrong text-text2 hover:text-text rounded-xl transition-colors cursor-pointer outline-none"
          title="Chia sẻ liên kết"
        >
          <Share2 size={16} />
        </button>
      </div>
    </div>
  );
}
