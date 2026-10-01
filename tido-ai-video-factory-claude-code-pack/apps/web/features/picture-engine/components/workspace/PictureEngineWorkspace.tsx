"use client";

import React from "react";

export interface PictureEngineWorkspaceProps {
  headerNode: React.ReactNode;
  briefNode: React.ReactNode;
  canvasNode: React.ReactNode;
  brainNode: React.ReactNode;
}

/**
 * 3-Column Industrial Console Layout for VMC Studio Obsidian:
 * - Col 1: Parameter Console (Creative Brief, Industry, Brand Identity, Visual Direction)
 * - Col 2: Main Viewport Stage & AI Reasoning Timeline
 * - Col 3: AI Creative Brain (Strategy, Knowledge, Vision Diagnostics)
 */
export function PictureEngineWorkspace({
  headerNode,
  briefNode,
  canvasNode,
  brainNode,
}: PictureEngineWorkspaceProps) {
  return (
    <div className="min-h-screen bg-surface-container-lowest text-text flex flex-col font-sans select-none">
      {/* Top Workspace Header */}
      {headerNode}

      {/* 3-Column Workspace Grid */}
      <main className="flex-1 max-w-[1750px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-[400px_1fr_340px] xl:grid-cols-[430px_1fr_360px] gap-5 items-start">
        {/* Col 1: Parameter Console */}
        <section className="w-full space-y-5">
          {briefNode}
        </section>

        {/* Col 2: Center Viewport Canvas & AI Timeline (Sticky) */}
        <section className="w-full sticky top-20 space-y-5">
          {canvasNode}
        </section>

        {/* Col 3: Right AI Strategy Deck (Sticky) */}
        <section className="w-full sticky top-20 space-y-5">
          {brainNode}
        </section>
      </main>
    </div>
  );
}
