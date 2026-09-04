"use client";

import React from "react";
import {
  GeneratedAsset,
  PictureEngineError,
  AspectRatioType,
} from "../../types/picture-engine.types";
import { EmptyCanvasState } from "./EmptyCanvasState";
import { AIReasoningTimeline, TimelineStepItem } from "../generation/AIReasoningTimeline";
import {
  Sparkles,
  RefreshCw,
  Download,
  AlertTriangle,
  ZoomIn,
  CheckCircle,
  Loader2,
} from "lucide-react";

export interface RenderCanvasProps {
  status: "idle" | "rendering" | "success" | "error";
  canGenerate: boolean;
  hasProductAssets: boolean;
  aspectRatio: AspectRatioType;
  currentAsset: GeneratedAsset | null;
  error: PictureEngineError | null;
  reasoningSteps: TimelineStepItem[];
  progressPercent: number;
  isDownloading?: boolean;
  onGenerate: () => void;
  onDownloadAsset?: () => void;
}

export function RenderCanvas({
  status,
  canGenerate,
  hasProductAssets,
  aspectRatio,
  currentAsset,
  error,
  reasoningSteps,
  progressPercent,
  isDownloading = false,
  onGenerate,
  onDownloadAsset,
}: RenderCanvasProps) {
  // ASPECT RATIO CLASS HELPER
  function getAspectRatioClass(ratio: AspectRatioType) {
    switch (ratio) {
      case "1:1":
        return "aspect-square max-w-[440px]";
      case "4:5":
        return "aspect-[4/5] max-w-[400px]";
      case "9:16":
        return "aspect-[9/16] max-w-[340px]";
      case "16:9":
        return "aspect-[16/9] max-w-[540px]";
      default:
        return "aspect-square max-w-[440px]";
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xl space-y-4 text-center min-h-[560px] flex flex-col justify-between">
      {/* Canvas Top Bar */}
      <div className="flex items-center justify-between border-b border-border pb-3 text-[12px] font-mono text-text3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span>CANVAS STAGE</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="bg-surface2 border border-borderStrong px-2.5 py-1 rounded-md text-text font-bold">
            {aspectRatio}
          </span>
          {status === "success" && (
            <button
              type="button"
              className="text-text3 hover:text-text p-1 rounded hover:bg-surface2 transition-colors cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn size={15} />
            </button>
          )}
        </div>
      </div>

      {/* CANVAS MAIN VIEW STAGE */}
      <div className="flex-1 flex items-center justify-center p-2 my-2">
        {/* STATE 1: EMPTY */}
        {status === "idle" && !currentAsset && (
          <EmptyCanvasState
            hasProductAssets={hasProductAssets}
            canGenerate={canGenerate}
          />
        )}

        {/* STATE 2: READY (BRIEF COMPLETE, READY TO RENDER) */}
        {status === "idle" && currentAsset && (
          <div className="w-full space-y-4">
            <div
              className={`relative rounded-2xl overflow-hidden border border-borderStrong mx-auto bg-black shadow-2xl flex items-center justify-center ${getAspectRatioClass(
                currentAsset.aspect_ratio
              )}`}
            >
              <img
                src={currentAsset.image_url}
                alt="Commercial output"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 bg-surface/90 backdrop-blur-md border border-borderStrong px-3 py-1.5 rounded-lg text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1.5 shadow-lg">
                <CheckCircle size={13} />
                <span>QC PASS {currentAsset.qc_scorecard.overall_score * 100}%</span>
              </div>
            </div>
          </div>
        )}

        {/* STATE 3: GENERATING (AI REASONING TIMELINE) */}
        {status === "rendering" && (
          <AIReasoningTimeline
            currentStepIndex={0}
            steps={reasoningSteps}
            progressPercent={progressPercent}
          />
        )}

        {/* STATE 4: SUCCESS */}
        {status === "success" && currentAsset && (
          <div className="w-full space-y-4">
            <div
              className={`relative rounded-2xl overflow-hidden border-2 border-accent/40 mx-auto bg-black shadow-2xl flex items-center justify-center ${getAspectRatioClass(
                currentAsset.aspect_ratio
              )}`}
            >
              <img
                src={currentAsset.image_url}
                alt="Commercial output"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 bg-surface/95 backdrop-blur-md border border-borderStrong px-3 py-1.5 rounded-lg text-[11.5px] font-mono text-emerald-400 font-semibold flex items-center gap-1.5 shadow-lg">
                <CheckCircle size={14} />
                <span>QC SCORE {currentAsset.qc_scorecard.overall_score * 100}%</span>
              </div>
            </div>
          </div>
        )}

        {/* STATE 5: ERROR */}
        {status === "error" && error && (
          <div className="w-full max-w-md p-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-left space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-[15px]">
              <AlertTriangle size={18} />
              <span>Không thể tạo Visual Commercial</span>
            </div>
            <p className="text-[13px] text-rose-200/90 leading-relaxed">
              {error.message}
            </p>
            <div className="text-[11px] font-mono text-rose-300/60 uppercase">
              Nguồn lỗi: {error.source} | Mã lỗi: {error.code}
            </div>
            <button
              type="button"
              onClick={onGenerate}
              className="mt-2 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-[13px] font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer outline-none"
            >
              <RefreshCw size={14} />
              <span>Thử lại với Brief này</span>
            </button>
          </div>
        )}
      </div>

      {/* Canvas Bottom Action Bar */}
      <div className="border-t border-border pt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={!canGenerate || status === "rendering"}
          onClick={onGenerate}
          className="flex-1 py-3 px-4 bg-surface2 hover:bg-surface3 disabled:opacity-50 border border-borderStrong text-text font-semibold text-[13.5px] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer outline-none"
        >
          <RefreshCw size={15} />
          <span>Tạo Biến thể Mới</span>
        </button>

        {currentAsset && (
          <button
            type="button"
            disabled={isDownloading}
            onClick={onDownloadAsset}
            className="py-3 px-5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold text-[13.5px] rounded-xl transition-all shadow-md shadow-accent/20 flex items-center justify-center gap-2 cursor-pointer outline-none"
          >
            {isDownloading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            <span>{isDownloading ? "Đang tải..." : "Tải Ảnh 2K"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
