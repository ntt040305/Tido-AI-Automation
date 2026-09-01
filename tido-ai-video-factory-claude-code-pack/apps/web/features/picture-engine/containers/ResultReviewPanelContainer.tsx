"use client";

import React from "react";
import { usePictureEngineStore } from "../stores/picture-engine.store";
import { ResultReviewPanel } from "../components/result/ResultReviewPanel";
import { createPictureAsset } from "../services/picture-engine.api";

export function ResultReviewPanelContainer() {
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

  function handleDownload() {
    if (currentAsset?.image_url) {
      window.open(currentAsset.image_url, "_blank");
    }
  }

  return (
    <ResultReviewPanel
      asset={currentAsset}
      onDownload={handleDownload}
      onIterationAction={handleIterationAction}
    />
  );
}
