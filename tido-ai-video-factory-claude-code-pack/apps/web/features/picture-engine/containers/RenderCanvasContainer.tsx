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

  // Step descriptions name the stage that is actually running. They previously
  // described an iced-tea F&B campaign — rim light on droplets, a top 30% safe zone
  // for a "HÈ BAY LÊN" headline — on every generation, whatever the brief was.
  const step = (
    id: string,
    label: string,
    description: string,
    doneAt: number,
    startsAt: number
  ): TimelineStepItem => ({
    id,
    label,
    description,
    status:
      jobState.progress_percent >= doneAt
        ? 'completed'
        : jobState.progress_percent >= startsAt
        ? 'active'
        : 'pending',
  });

  const reasoningSteps: TimelineStepItem[] = [
    step('1', 'Đọc brief', 'Phân tích ý tưởng của bạn thành chủ thể, bối cảnh, góc máy và ánh sáng', 15, 0),
    step('2', 'Chiến lược chiến dịch', 'Xác định góc tiếp cận thương mại và tâm lý khách hàng mục tiêu', 30, 15),
    step('3', 'Phân tích ảnh tham khảo', 'Khoá nhận diện sản phẩm, logo và phong cách từ ảnh bạn tải lên', 45, 30),
    step('4', 'Truy xuất tri thức', 'Chọn khối tri thức nhiếp ảnh và thiết kế thương mại phù hợp', 60, 45),
    step('5', 'Chốt art direction', 'Giải quyết xung đột góc máy / ánh sáng / bố cục thành một quyết định duy nhất', 75, 60),
    step('6', 'Biên dịch prompt', 'Ghép brief, khoá nhận diện, art direction và bố cục thành prompt cuối', 88, 75),
    step('7', 'Render', 'Gửi tới provider và lưu ảnh gốc', 100, 88),
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
