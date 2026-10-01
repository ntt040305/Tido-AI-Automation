"use client";

import React from "react";
import {
  AIStrategy,
  CreativeBrief,
  CreativeIntelligence,
  VisionAnalysis,
  DesignDecisionResult,
} from "../../types/picture-engine.types";
import { KnowledgeInsightPanel } from "./KnowledgeInsightPanel";
import { CreativeDirectionPanel } from "./CreativeDirectionPanel";
import { Brain, Target, Sparkles } from "lucide-react";

export interface AIStrategyPanelProps {
  strategy: AIStrategy | null;
  intelligence?: CreativeIntelligence | null;
  vision?: VisionAnalysis | null;
  decisions?: DesignDecisionResult | null;
  onApplySuggestions?: (suggestions: string[]) => void;
  brief: CreativeBrief;
  isGenerating?: boolean;
}

export function AIStrategyPanel({
  strategy,
  intelligence,
  vision,
  decisions,
  onApplySuggestions,
  brief,
  isGenerating,
}: AIStrategyPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-[2px] p-5 shadow-card space-y-5 text-left select-none">
      {/* AI Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[2px] bg-surface2 border border-borderStrong flex items-center justify-center text-ai-gold">
            <Brain size={16} className={isGenerating ? "animate-pulse" : ""} />
          </div>
          <div>
            <span className="text-[10.5px] font-mono text-ai-gold uppercase font-semibold block tracking-wider">
              AI CREATIVE BRAIN
            </span>
            <h3 className="text-[14px] font-bold text-text font-sans">
              Trí Tuệ Sản Xuất Marketing
            </h3>
          </div>
        </div>
      </div>

      {/* The AI's own account of what it decided and suggestions */}
      <CreativeDirectionPanel
        intelligence={intelligence ?? null}
        vision={vision ?? null}
        decisions={decisions ?? null}
        onApplySuggestions={onApplySuggestions}
      />

      {/* 1. CAMPAIGN UNDERSTANDING */}
      <div className="space-y-1.5">
        <span className="text-[10.5px] font-mono text-text-telemetry uppercase tracking-wider flex items-center gap-1.5">
          <Target size={12} className="text-text-muted" />
          <span>1. CAMPAIGN UNDERSTANDING</span>
        </span>
        <div className="p-3 bg-surface2 border border-border rounded-[2px] text-[12.5px] text-text space-y-1 font-sans">
          <div className="font-semibold text-text font-mono text-[11.5px]">
            Ngành: {brief.marketing_context.industry ? brief.marketing_context.industry.toUpperCase() : "CHƯA CHỌN"} 
            {brief.marketing_context.objective && ` • (Mục tiêu: ${brief.marketing_context.objective.toUpperCase()})`}
          </div>
          <p className="text-[11.5px] text-text-muted leading-relaxed font-sans">
            Target Audience: {brief.marketing_context.target_audience || "Chưa nhập đối tượng cụ thể"}
          </p>
        </div>
      </div>

      {/* 2. CREATIVE DIRECTION & ANGLE */}
      {strategy && (
        <div className="space-y-1.5">
          <span className="text-[10.5px] font-mono text-text-telemetry uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={12} className="text-ai-gold" />
            <span>2. CREATIVE ANGLE STRATEGY</span>
          </span>
          <div className="p-3 bg-surface2 border border-ai-gold/40 rounded-[2px] text-[12.5px] text-ai-gold font-medium font-sans leading-relaxed">
            {strategy.creative_angle}
          </div>
        </div>
      )}

      {/* 3. KNOWLEDGE APPLIED */}
      {strategy ? (
        <KnowledgeInsightPanel
          appliedKnowledgeNodes={strategy.applied_knowledge_nodes}
          appliedTechniqueCards={strategy.applied_technique_cards}
        />
      ) : (
        <div className="py-6 text-center text-[11px] font-mono text-text-telemetry border border-dashed border-border rounded-[2px]">
          Tri thức nhiếp ảnh thương mại sẽ kích hoạt khi chạy chiến dịch.
        </div>
      )}
    </div>
  );
}
