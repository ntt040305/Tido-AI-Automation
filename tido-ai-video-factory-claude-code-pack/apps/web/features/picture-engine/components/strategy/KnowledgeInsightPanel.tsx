"use client";

import React from "react";
import { BookOpen, CheckCircle, Sparkles, Layers } from "lucide-react";

export interface KnowledgeCardRule {
  title: string;
  items: string[];
}

export interface KnowledgeInsightPanelProps {
  appliedKnowledgeNodes: string[];
  appliedTechniqueCards: string[];
}

export function KnowledgeInsightPanel({
  appliedKnowledgeNodes,
  appliedTechniqueCards,
}: KnowledgeInsightPanelProps) {
  return (
    <div className="space-y-4 text-left">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-[12px] font-mono text-aiGlow uppercase font-semibold flex items-center gap-1.5">
          <BookOpen size={14} />
          <span>KNOWLEDGE CARDS APPLIED</span>
        </span>
        <span className="text-[11px] font-mono text-text3">
          {appliedKnowledgeNodes.length + appliedTechniqueCards.length} Cards
        </span>
      </div>

      {/* Applied Knowledge Nodes List */}
      <div className="space-y-2">
        <span className="text-[11px] font-mono text-text3 uppercase block">
          Knowledge Base Strategy
        </span>
        {appliedKnowledgeNodes.map((node, i) => (
          <div
            key={i}
            className="p-3 bg-surface2/60 border border-borderStrong rounded-xl space-y-1.5"
          >
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
              <Sparkles size={14} className="text-aiGlow" />
              <span>{node}</span>
            </div>
            <ul className="space-y-1 text-[11.5px] text-text3 pl-4 list-disc">
              <li>Macro product focus với góc quay 45° tôn vinh chi tiết</li>
              <li>High-contrast rim light tạo độ nổi bật trên di động</li>
              <li>Khóa tỷ lệ màu sắc chuẩn thương hiệu</li>
            </ul>
          </div>
        ))}
      </div>

      {/* Applied Technique Cards List */}
      <div className="space-y-2 pt-1">
        <span className="text-[11px] font-mono text-text3 uppercase block">
          Technique Cards Directives
        </span>
        {appliedTechniqueCards.map((card, i) => (
          <div
            key={i}
            className="p-3 bg-accent/10 border border-accent/30 rounded-xl space-y-1.5"
          >
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-accent">
              <Layers size={14} />
              <span>{card}</span>
            </div>
            <ul className="space-y-1 text-[11.5px] text-text2/90 pl-4 list-disc font-mono">
              <li>Safe Zone Top 30% cho Headline & Offer Text</li>
              <li>Tối ưu độ tương phản cho Feed Mobile Facebook/TikTok</li>
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
