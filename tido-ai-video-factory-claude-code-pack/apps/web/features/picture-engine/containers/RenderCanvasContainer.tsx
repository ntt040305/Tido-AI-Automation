"use client";

import React, { useState } from "react";
import { usePictureEngineStore } from "../stores/picture-engine.store";
import { RenderCanvas } from "../components/canvas/RenderCanvas";
import { createPictureAsset, downloadPictureAsset } from "../services/picture-engine.api";
import { TimelineStepItem } from "../components/generation/AIReasoningTimeline";

export function RenderCanvasContainer() {
  const [isDownloading, setIsDownloading] = useState(false);
  const brief = usePictureEngineStore((state) => state.creativeBrief);
  const jobState = usePictureEngineStore((state) => state.generationJob);
  const currentAsset = usePictureEngineStore((state) => state.currentAsset);
  const error = usePictureEngineStore((state) => state.error);
  const canGenerate = usePictureEngineStore((state) => state.canGenerate());
  const hasProductAssets = usePictureEngineStore((state) => state.hasProductAssets());

  const reasoningSteps: TimelineStepItem[] = [
    {
      id: "1",
      label: "Understanding Campaign Brief",
      description: "Phân tích bối cảnh ngành F&B và mục tiêu Conversion Sales",
      status: jobState.progress_percent >= 15 ? "completed" : "active",
    },
    {
      id: "2",
      label: "Retrieving Knowledge Nodes",
      description: "Tải quy chuẩn visual cho sản phẩm đồ uống giải nhiệt",
      status:
        jobState.progress_percent >= 30
          ? "completed"
          : jobState.progress_percent >= 15
          ? "active"
          : "pending",
    },
    {
      id: "3",
      label: "Applying Creative Strategy",
      description: "Xây dựng góc quay sản phẩm Macro kết hợp rim light",
      status:
        jobState.progress_percent >= 45
          ? "completed"
          : jobState.progress_percent >= 30
          ? "active"
          : "pending",
    },
    {
      id: "4",
      label: "Enforcing Brand Rules",
      description: "Khóa diện mạo ly trà tươi và màu sắc chủ đạo TIDO",
      status:
        jobState.progress_percent >= 60
          ? "completed"
          : jobState.progress_percent >= 45
          ? "active"
          : "pending",
    },
    {
      id: "5",
      label: "Building Composition",
      description: "Tối ưu vùng safe zone top 30% cho Mobile Feed",
      status:
        jobState.progress_percent >= 75
          ? "completed"
          : jobState.progress_percent >= 60
          ? "active"
          : "pending",
    },
    {
      id: "6",
      label: "Rendering Visual",
      description: "Khởi chạy Nano Banana 2 Provider Adapter API...",
      status:
        jobState.progress_percent >= 90
          ? "completed"
          : jobState.progress_percent >= 75
          ? "active"
          : "pending",
    },
    {
      id: "7",
      label: "Quality Checking",
      description: "Đánh giá điểm thương mại ImageQCScorecard",
      status:
        jobState.progress_percent >= 100
          ? "completed"
          : jobState.progress_percent >= 90
          ? "active"
          : "pending",
    },
  ];

  async function handleGenerate() {
    if (!canGenerate || jobState.status === "rendering") return;
    try {
      await createPictureAsset(brief);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unspecified error";
      usePictureEngineStore.getState().setError({
        code: "ERR_RENDER_FAILED",
        message,
        source: "provider",
      });
      usePictureEngineStore.getState().setGenerationJob({ status: "failed" });
    }
  }

  async function handleDownload() {
    if (!currentAsset?.image_url || isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadPictureAsset(
        currentAsset.image_url,
        brief.brand_identity?.brand_name,
        brief.sales_context?.product_name
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Tải ảnh thất bại.";
      usePictureEngineStore.getState().setError({
        code: "ERR_DOWNLOAD_FAILED",
        message,
        source: "system",
      });
    } finally {
      setIsDownloading(false);
    }
  }

  let canvasStatus: "idle" | "rendering" | "success" | "error" = "idle";
  const isRunning =
    jobState.status === "rendering" ||
    jobState.status === "interpreting" ||
    jobState.status === "compiling" ||
    jobState.status === "qc_evaluating";

  if (isRunning) {
    canvasStatus = "rendering";
  } else if (jobState.status === "completed" || (currentAsset && !error)) {
    canvasStatus = "success";
  } else if (jobState.status === "failed" || error) {
    canvasStatus = "error";
  } else if (currentAsset) {
    canvasStatus = "success";
  }

  return (
    <RenderCanvas
      status={canvasStatus}
      canGenerate={canGenerate}
      hasProductAssets={hasProductAssets}
      aspectRatio={brief.creative_direction.aspect_ratio}
      currentAsset={currentAsset}
      error={error}
      reasoningSteps={reasoningSteps}
      progressPercent={jobState.progress_percent}
      isDownloading={isDownloading}
      onGenerate={handleGenerate}
      onDownloadAsset={handleDownload}
    />
  );
}
