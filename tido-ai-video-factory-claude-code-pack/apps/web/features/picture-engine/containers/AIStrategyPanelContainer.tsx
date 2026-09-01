"use client";

import React from "react";
import { usePictureEngineStore } from "../stores/picture-engine.store";
import { AIStrategyPanel } from "../components/strategy/AIStrategyPanel";

export function AIStrategyPanelContainer() {
  const brief = usePictureEngineStore((state) => state.creativeBrief);
  const strategy = usePictureEngineStore((state) => state.aiStrategy);
  const isGenerating = usePictureEngineStore(
    (state) => state.generationJob.status === "rendering"
  );

  return (
    <AIStrategyPanel
      strategy={strategy}
      brief={brief}
      isGenerating={isGenerating}
    />
  );
}
