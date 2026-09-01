"use client";

import React from "react";
import { usePictureEngineStore } from "../stores/picture-engine.store";
import { ProjectHeader } from "../components/workspace/ProjectHeader";
import { PictureEngineWorkspace } from "../components/workspace/PictureEngineWorkspace";
import { CreativeBriefPanelContainer } from "./CreativeBriefPanelContainer";
import { RenderCanvasContainer } from "./RenderCanvasContainer";
import { AIStrategyPanelContainer } from "./AIStrategyPanelContainer";

export function PictureEngineContainer() {
  const session = usePictureEngineStore((state) => state.creativeSession);
  const isGenerating = usePictureEngineStore(
    (state) => state.generationJob.status === "rendering"
  );
  const resetSession = usePictureEngineStore((state) => state.resetSession);

  return (
    <PictureEngineWorkspace
      headerNode={
        <ProjectHeader
          session={session}
          isGenerating={isGenerating}
          onResetSession={resetSession}
        />
      }
      briefNode={<CreativeBriefPanelContainer />}
      canvasNode={<RenderCanvasContainer />}
      brainNode={<AIStrategyPanelContainer />}
    />
  );
}
