"use client";

import React from "react";
import { GeneratedAsset } from "../../types/picture-engine.types";
import { GenerationDiagnosticsPanel } from "./CommercialQCScorecard";
import { VariantActions } from "./VariantActions";
import { Download, Share2, Award, Loader2, Target } from "lucide-react";

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
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xl space-y-6 text-left">
      {/* Panel header. No score is shown here because none is computed. */}
      <div className="flex items-center justify-between border-b border-border pb-4 gap-4">
        <div>
          <div className="text-[11px] font-mono text-accent uppercase font-semibold flex items-center gap-1.5">
            <Award size={14} />
            <span>RESULT REVIEW</span>
          </div>
          <h2 className="text-[18px] font-bold text-text tracking-tight mt-0.5">
            Kết Quả Sản Xuất Visual
          </h2>
        </div>

        <div className="text-right">
          <span className="text-[10.5px] font-mono text-text3 uppercase block">Tỷ lệ khung hình</span>
          <span className="text-[18px] font-mono font-bold text-text">{asset.aspect_ratio}</span>
        </div>
      </div>

      {/* The campaign angle the strategy layer actually decided on. */}
      {asset.creative_angle && (
        <div className="p-3 bg-surface2/60 border border-borderStrong rounded-xl space-y-1">
          <span className="text-[11px] font-mono text-text3 uppercase flex items-center gap-1">
            <Target size={12} className="text-accent" />
            <span>Góc tiếp cận chiến dịch</span>
          </span>
          <p className="text-[12.5px] text-text leading-relaxed">{asset.creative_angle}</p>
        </div>
      )}

      <GenerationDiagnosticsPanel diagnostics={asset.diagnostics} />

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
