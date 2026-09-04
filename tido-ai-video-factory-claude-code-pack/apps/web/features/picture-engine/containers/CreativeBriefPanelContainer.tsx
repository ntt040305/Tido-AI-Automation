"use client";

import React from "react";
import { usePictureEngineStore } from "../stores/picture-engine.store";
import { CreativeBriefPanel } from "../components/brief/CreativeBriefPanel";
import { createPictureAsset } from "../services/picture-engine.api";
import { AssetType } from "../types/picture-engine.types";

export function CreativeBriefPanelContainer() {
  const brief = usePictureEngineStore((state) => state.creativeBrief);
  const isGenerating = usePictureEngineStore(
    (state) => state.generationJob.status === "rendering"
  );
  const canGenerate = usePictureEngineStore((state) => state.canGenerate());

  const updateBrief = usePictureEngineStore((state) => state.updateBrief);
  const updateCreativeConcept = usePictureEngineStore(
    (state) => state.updateCreativeConcept
  );
  const updateAssetConfiguration = usePictureEngineStore(
    (state) => state.updateAssetConfiguration
  );
  const updateMarketingContext = usePictureEngineStore(
    (state) => state.updateMarketingContext
  );
  const updateSalesContext = usePictureEngineStore(
    (state) => state.updateSalesContext
  );
  const updateCreativeDirection = usePictureEngineStore(
    (state) => state.updateCreativeDirection
  );
  const updateBrandIdentity = usePictureEngineStore(
    (state) => state.updateBrandIdentity
  );

  async function handleGenerate() {
    if (!canGenerate || isGenerating) return;
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

  return (
    <CreativeBriefPanel
      brief={brief}
      canGenerate={canGenerate}
      isGenerating={isGenerating}
      onUpdateAssetType={(type: AssetType) => updateBrief({ asset_type: type })}
      onUpdateCreativeConcept={updateCreativeConcept}
      onUpdateAssetConfiguration={updateAssetConfiguration}
      onUpdateMarketingContext={updateMarketingContext}
      onUpdateSalesContext={updateSalesContext}
      onUpdateCreativeDirection={updateCreativeDirection}
      onUpdateBrandIdentity={updateBrandIdentity}
      onGenerate={handleGenerate}
    />
  );
}
