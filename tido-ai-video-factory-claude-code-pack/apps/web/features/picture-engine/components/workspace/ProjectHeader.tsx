"use client";

import React from "react";
import { Layers, Sparkles, CheckCircle2, RotateCcw } from "lucide-react";
import { CreativeSession } from "../../types/picture-engine.types";
import { VmcTallyDot, VmcButton } from "@/components/vmc";

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
    <header className="bg-surface border-b border-border px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Brand & Project Identity */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-[2px] bg-surface2 border border-borderStrong flex items-center justify-center text-text shrink-0">
          <span className="font-mono font-bold text-[13px]">VMC</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10.5px] tracking-wider text-text-telemetry uppercase font-semibold flex items-center gap-1">
              <Layers size={11} />
              <span>PICTURE ENGINE</span>
            </span>
            <span className="bg-surface2 border border-border text-text-muted text-[10px] font-mono px-1.5 py-0.2 rounded-[2px]">
              V4 PRO STUDIO
            </span>
          </div>
          <h1 className="text-[16px] font-bold text-text tracking-tight flex items-center gap-2 mt-0.5 font-sans">
            <span>{session.projectName || "Dự án mới"}</span>
            {session.campaignName && (
              <span className="text-[13px] text-text-muted font-normal">
                / {session.campaignName}
              </span>
            )}
          </h1>
        </div>
      </div>

      {/* Control Actions & Status Deck */}
      <div className="flex items-center gap-2.5">
        {/* Autosave Indicator */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-text-muted bg-surface2 border border-border px-2.5 py-1 rounded-[2px] font-mono">
          <CheckCircle2 size={12} className="text-tally-success" />
          <span>AUTOSAVED</span>
        </div>

        {/* Status Badge with Tally Dot */}
        <div className="flex items-center gap-2 bg-surface2 border border-border px-3 py-1 rounded-[2px] text-[11px] font-mono text-text">
          <VmcTallyDot status={isGenerating ? "live" : "success"} />
          <span>{isGenerating ? "RENDERING..." : "STUDIO SẴN SÀNG"}</span>
        </div>

        {/* Reset Session Action */}
        {onResetSession && (
          <VmcButton
            variant="ghost"
            size="sm"
            onClick={onResetSession}
            icon={<RotateCcw size={13} />}
            title="Tạo dự án mới"
          >
            Làm mới
          </VmcButton>
        )}
      </div>
    </header>
  );
}
