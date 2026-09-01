"use client";

import React from "react";
import { Layers, Sparkles, CheckCircle2, Save } from "lucide-react";
import { CreativeSession } from "../../types/picture-engine.types";

export interface ProjectHeaderProps {
  session: CreativeSession;
  isGenerating?: boolean;
  onResetSession?: () => void;
}

export function ProjectHeader({
  session,
  isGenerating,
  onResetSession,
}: ProjectHeaderProps) {
  return (
    <header className="bg-surface border-b border-border px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-30 shadow-md">
      {/* Brand & Project Identity */}
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
          <Sparkles size={20} className="animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase font-semibold flex items-center gap-1">
              <Layers size={12} />
              <span>TIDO PICTURE ENGINE</span>
            </span>
            <span className="bg-surface2 border border-borderStrong text-text2 text-[10.5px] font-mono px-2 py-0.5 rounded-full">
              V1 PRO STUDIO
            </span>
          </div>
          <h1 className="text-[19px] font-bold text-text tracking-tight flex items-center gap-2 mt-0.5">
            <span>{session.projectName || "Dự án mới"}</span>
            {session.campaignName && (
              <span className="text-[14px] text-text3 font-normal">
                / {session.campaignName}
              </span>
            )}
          </h1>
        </div>
      </div>

      {/* Control Actions & Status */}
      <div className="flex items-center gap-3">
        {/* Autosave Indicator */}
        <div className="hidden md:flex items-center gap-1.5 text-[12px] text-text3 bg-surface2/60 border border-borderStrong/60 px-3 py-1.5 rounded-lg font-mono">
          <CheckCircle2 size={13} className="text-emerald-400" />
          <span>Autosaved</span>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 bg-surface2 border border-borderStrong px-3.5 py-1.5 rounded-full text-[12.5px] font-mono text-text2 shadow-sm">
          <span
            className={`w-2 h-2 rounded-full ${
              isGenerating ? "bg-accent animate-ping" : "bg-emerald-400"
            }`}
          />
          <span>{isGenerating ? "Rendering..." : "Studio Ready"}</span>
        </div>

        {/* Reset Session Action */}
        {onResetSession && (
          <button
            type="button"
            onClick={onResetSession}
            className="text-[12px] text-text3 hover:text-text px-2.5 py-1.5 rounded-lg hover:bg-surface2 transition-colors outline-none cursor-pointer"
            title="Tạo dự án mới"
          >
            Mới
          </button>
        )}
      </div>
    </header>
  );
}
