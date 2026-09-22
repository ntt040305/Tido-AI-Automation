"use client";

import React from "react";
import { usePictureEngineStore } from "../stores/picture-engine.store";
import { AIStrategyPanel } from "../components/strategy/AIStrategyPanel";

export function AIStrategyPanelContainer() {
  const brief = usePictureEngineStore((state) => state.creativeBrief);
  const strategy = usePictureEngineStore((state) => state.aiStrategy);
  const intelligence = usePictureEngineStore((state) => state.creativeIntelligence);
  const vision = usePictureEngineStore((state) => state.visionAnalysis);
  const decisions = usePictureEngineStore((state) => state.designDecisions);
  const isGenerating = usePictureEngineStore(
    (state) => state.generationJob.status === "rendering"
  );
  const updateCreativeConcept = usePictureEngineStore((state) => state.updateCreativeConcept);
  const currentConcept = brief.creative_concept || brief.user_notes || "";

  /**
   * The AI's own corrections, folded back into the idea the user owns.
   *
   * It edits the visible concept rather than applying a hidden correction, so
   * the change is inspectable and reversible -- the user can see exactly what
   * the AI asked for and delete any line they disagree with before rendering
   * again. Nothing regenerates on its own; the next render is still their
   * decision.
   */
  const handleApplySuggestions = React.useCallback(
    (suggestions: string[]) => {
      const lines = suggestions.map((s) => s.trim()).filter(Boolean);
      if (lines.length === 0) return;
      const addition = lines.map((s) => `- ${s}`).join("\n");
      // Appending rather than replacing: the original idea is the user's and
      // is never overwritten by a machine's notes on it.
      updateCreativeConcept(
        currentConcept ? `${currentConcept}\n\nĐiều chỉnh:\n${addition}` : addition
      );
    },
    [currentConcept, updateCreativeConcept]
  );

  return (
    <AIStrategyPanel
      strategy={strategy}
      intelligence={intelligence}
      vision={vision}
      decisions={decisions}
      brief={brief}
      isGenerating={isGenerating}
      onApplySuggestions={handleApplySuggestions}
    />
  );
}
