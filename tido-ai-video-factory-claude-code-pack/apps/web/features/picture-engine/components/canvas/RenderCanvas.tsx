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
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { VmcButton, VmcTallyDot } from "@/components/vmc";

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
  onApproveAsset?: () => void;
  onRejectAsset?: () => void;
  feedback?: "approve" | "reject" | null;
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
  onApproveAsset,
  onRejectAsset,
  feedback = null,
}: RenderCanvasProps) {
  function getAspectRatioClass(ratio: AspectRatioType) {
    switch (ratio) {
      case "1:1":
        return "aspect-square max-w-[440px]";
      case "4:5":
        return "aspect-[4/5] max-w-[390px]";
      case "9:16":
        return "aspect-[9/16] max-w-[340px]";
      case "16:9":
        return "aspect-[16/9] max-w-[540px]";
      default:
        return "aspect-square max-w-[440px]";
    }
  }

  return (
    <div className="bg-surface border border-border rounded-[2px] p-5 shadow-card space-y-4 text-center min-h-[580px] flex flex-col justify-between select-none">
      {/* Canvas Top Bar */}
      <div className="flex items-center justify-between border-b border-border pb-3 text-[11px] font-mono text-text-telemetry">
        <div className="flex items-center gap-2">
          <VmcTallyDot status={status === "rendering" ? "live" : "success"} />
          <span className="font-semibold text-text uppercase">CANVAS VIEWPORT MONITOR</span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="bg-surface2 border border-border px-2 py-0.5 rounded-[2px] text-text font-bold">
            {aspectRatio}
          </span>
          {status === "success" && (
            <button
              type="button"
              className="text-text-telemetry hover:text-text p-1 rounded-[2px] hover:bg-surface2 transition-colors cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn size={14} />
            </button>
          )}
        </div>
      </div>

      {/* CANVAS MAIN VIEW STAGE */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 my-1 w-full">
        {/* STATE 1: EMPTY */}
        {status === "idle" && !currentAsset && (
          <EmptyCanvasState
            hasProductAssets={hasProductAssets}
            canGenerate={canGenerate}
          />
        )}

        {/* STATE 2: RENDERING (SHOW TIMELINE IN VIEWPORT STAGE) */}
        {status === "rendering" && (
          <div className="w-full max-w-[500px] my-auto">
            <AIReasoningTimeline
              currentStepIndex={0}
              steps={reasoningSteps}
              progressPercent={progressPercent}
            />
          </div>
        )}

        {/* STATE 3 & 4: READY OR SUCCESS (SHOW IMAGE IN VIEWPORT) */}
        {(status === "success" || (status === "idle" && currentAsset)) && currentAsset && (
          <div className="w-full space-y-4 flex flex-col items-center">
            <div
              className={`relative rounded-[2px] overflow-hidden border border-borderStrong mx-auto bg-surface-container-lowest shadow-card flex items-center justify-center group ${getAspectRatioClass(
                currentAsset.aspect_ratio
              )}`}
            >
              <img
                src={currentAsset.image_url}
                alt="Commercial output"
                className="w-full h-full object-cover"
              />

              {/* Technical Status Overlay Capsule (Flat Solid, No Blur) */}
              <div className="absolute bottom-2.5 left-2.5 bg-surface border border-border px-2.5 py-1 rounded-[2px] text-[10.5px] font-mono text-text flex items-center gap-1.5 shadow-card">
                <VmcTallyDot status="success" />
                <span>
                  {currentAsset.diagnostics.generation_parameters.resolution} · {currentAsset.aspect_ratio}
                </span>
              </div>

              {/* Camera / Shutter overlay guide marks */}
              <div className="absolute inset-2.5 pointer-events-none flex flex-col justify-between opacity-35 font-mono text-[9px] text-text-telemetry">
                <div className="flex justify-between">
                  <span>[+0.0 EV]</span>
                  <span>[ISO 100]</span>
                </div>
                <div className="flex justify-between">
                  <span>1/250s</span>
                  <span>f/2.8</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STATE 5: ERROR */}
        {status === "error" && error && (
          <div className="w-full max-w-md p-5 bg-surface2 border border-tally-live rounded-[2px] text-left space-y-2.5">
            <div className="flex items-center gap-2 text-tally-live font-bold text-[14px] font-sans">
              <AlertTriangle size={16} />
              <span>Không thể tạo Visual Commercial</span>
            </div>
            <p className="text-[12.5px] text-text leading-relaxed font-sans">
              {error.message}
            </p>
            <div className="text-[10.5px] font-mono text-text-telemetry uppercase">
              Nguồn lỗi: {error.source} | Mã lỗi: {error.code}
            </div>
            <VmcButton
              variant="outline"
              size="sm"
              onClick={onGenerate}
              icon={<RefreshCw size={13} />}
            >
              Thử lại với Brief này
            </VmcButton>
          </div>
        )}
      </div>

      {/* Canvas Bottom Action Bar */}
      <div className="border-t border-border pt-3.5 flex items-center justify-between gap-2.5">
        <VmcButton
          variant="outline"
          size="md"
          disabled={!canGenerate || status === "rendering"}
          onClick={onGenerate}
          icon={<RefreshCw size={14} />}
          className="flex-1"
        >
          Tạo Biến thể Mới
        </VmcButton>

        {currentAsset && (onApproveAsset || onRejectAsset) && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Hướng sáng tạo này phù hợp"
              aria-label="Hướng sáng tạo này phù hợp"
              aria-pressed={feedback === "approve"}
              disabled={Boolean(feedback)}
              onClick={onApproveAsset}
              className={`p-2.5 rounded-[2px] border transition-colors cursor-pointer outline-none disabled:cursor-default ${
                feedback === "approve"
                  ? "bg-surface3 border-tally-success text-tally-success"
                  : "bg-surface2 hover:bg-surface3 border-border text-text disabled:opacity-40"
              }`}
            >
              <ThumbsUp size={14} />
            </button>
            <button
              type="button"
              title="Hướng sáng tạo này không phù hợp"
              aria-label="Hướng sáng tạo này không phù hợp"
              aria-pressed={feedback === "reject"}
              disabled={Boolean(feedback)}
              onClick={onRejectAsset}
              className={`p-2.5 rounded-[2px] border transition-colors cursor-pointer outline-none disabled:cursor-default ${
                feedback === "reject"
                  ? "bg-surface3 border-tally-live text-tally-live"
                  : "bg-surface2 hover:bg-surface3 border-border text-text disabled:opacity-40"
              }`}
            >
              <ThumbsDown size={14} />
            </button>
          </div>
        )}

        {currentAsset && (
          <VmcButton
            variant="primary"
            size="md"
            isLoading={isDownloading}
            onClick={onDownloadAsset}
            icon={<Download size={14} />}
          >
            Tải Ảnh PNG
          </VmcButton>
        )}
      </div>
    </div>
  );
}
