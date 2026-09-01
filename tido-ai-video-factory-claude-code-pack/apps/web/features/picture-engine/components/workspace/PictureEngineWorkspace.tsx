"use client";

import React from "react";

export interface PictureEngineWorkspaceProps {
  headerNode: React.ReactNode;
  briefNode: React.ReactNode;
  canvasNode: React.ReactNode;
  brainNode: React.ReactNode;
}

export function PictureEngineWorkspace({
  headerNode,
  briefNode,
  canvasNode,
  brainNode,
}: PictureEngineWorkspaceProps) {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col font-sans selection:bg-accent/30 selection:text-white">
      {/* HEADER ZONE */}
      {headerNode}

      {/* 3-ZONE CREATIVE STUDIO MAIN WORKSPACE */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-[380px_1fr_320px] xl:grid-cols-[420px_1fr_320px] gap-6 items-start">
        {/* LEFT ZONE: CREATIVE BRIEF PANEL */}
        <section className="w-full space-y-6">
          {briefNode}
        </section>

        {/* CENTER ZONE: RENDER CANVAS WORKSPACE (Sticky) */}
        <section className="w-full sticky top-20 space-y-6">
          {canvasNode}
        </section>

        {/* RIGHT ZONE: AI CREATIVE BRAIN PANEL (Sticky) */}
        <section className="w-full sticky top-20 space-y-6">
          {brainNode}
        </section>
      </main>
    </div>
  );
}
