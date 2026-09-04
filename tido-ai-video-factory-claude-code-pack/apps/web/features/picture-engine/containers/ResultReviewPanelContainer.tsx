"use client";

import React, { useState } from "react";
import { usePictureEngineStore } from "../stores/picture-engine.store";
import { ResultReviewPanel } from "../components/result/ResultReviewPanel";
import { createPictureAsset, downloadPictureAsset } from "../services/picture-engine.api";

export function ResultReviewPanelContainer() {
  const [isDownloading, setIsDownloading] = useState(false);
  const brief = usePictureEngineStore((state) => state.creativeBrief);
  const currentAsset = usePictureEngineStore((state) => state.currentAsset);

  if (!currentAsset) return null;

  async function handleIterationAction(actionType: string) {
    if (actionType === "change_style") {
      usePictureEngineStore.getState().updateCreativeDirection({
        visual_style: "ugc_natural",
      });
    } else if (actionType === "change_lighting") {
      usePictureEngineStore.getState().updateCreativeDirection({
        emotional_tone: "High Contrast Commercial Rim Light",
      });
    }
    await createPictureAsset(usePictureEngineStore.getState().creativeBrief);
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

  return (
    <ResultReviewPanel
      asset={currentAsset}
      isDownloading={isDownloading}
      onDownload={handleDownload}
      onIterationAction={handleIterationAction}
    />
  );
}
