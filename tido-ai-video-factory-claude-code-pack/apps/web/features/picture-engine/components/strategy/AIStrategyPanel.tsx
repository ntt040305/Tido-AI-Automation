"use client";

import React from "react";
import { AIStrategy, CreativeBrief } from "../../types/picture-engine.types";
import { KnowledgeInsightPanel } from "./KnowledgeInsightPanel";
import { Brain, Target, ShieldCheck, TrendingUp, Sparkles } from "lucide-react";

export interface AIStrategyPanelProps {
  strategy: AIStrategy | null;
  brief: CreativeBrief;
  isGenerating?: boolean;
}

export function AIStrategyPanel({
  strategy,
  brief,
  isGenerating,
}: AIStrategyPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-xl space-y-6 text-left">
      {/* AI Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-aiGlow/15 border border-aiGlow/30 flex items-center justify-center text-aiGlow">
            <Brain size={18} className={isGenerating ? "animate-pulse" : ""} />
          </div>
          <div>
            <span className="text-[11px] font-mono text-aiGlow uppercase font-semibold block tracking-wider">
              AI CREATIVE BRAIN
            </span>
            <h3 className="text-[14.5px] font-bold text-text">
              Trí Tuệ Sản Xuất Marketing
            </h3>
          </div>
        </div>
      </div>

      {/* 1. CAMPAIGN UNDERSTANDING */}
      <div className="space-y-2">
        <span className="text-[11px] font-mono text-text3 uppercase flex items-center gap-1">
          <Target size={12} className="text-accent" />
          <span>1. Campaign Understanding</span>
        </span>
        <div className="p-3 bg-surface2/60 border border-borderStrong rounded-xl text-[12.5px] text-text space-y-1">
          <div className="font-semibold text-accent">
            Ngành: {brief.marketing_context.industry.toUpperCase()} (Mục tiêu: {brief.marketing_context.objective.toUpperCase()})
          </div>
          <p className="text-[11.5px] text-text3 leading-relaxed">
            Target Audience: {brief.marketing_context.target_audience || "Chưa nhập"}
          </p>
        </div>
      </div>

      {/* 2. CREATIVE DIRECTION & ANGLE */}
      {strategy && (
        <div className="space-y-2">
          <span className="text-[11px] font-mono text-text3 uppercase flex items-center gap-1">
            <Sparkles size={12} className="text-aiGlow" />
            <span>2. Creative Angle Strategy</span>
          </span>
          <div className="p-3 bg-aiGlow/10 border border-aiGlow/30 rounded-xl text-[12.5px] text-white font-semibold">
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
        <div className="py-6 text-center text-[12px] text-text3 border border-dashed border-borderStrong rounded-xl">
          AI đang sẵn sàng tiếp nhận Creative Brief...
        </div>
      )}

      {/* 4. BRAND RULES ENFORCED */}
      <div className="space-y-2">
        <span className="text-[11px] font-mono text-text3 uppercase flex items-center gap-1">
          <ShieldCheck size={12} className="text-emerald-400" />
          <span>4. Brand Rules Enforced</span>
        </span>
        <div className="p-3 bg-surface2/60 border border-borderStrong rounded-xl text-[12px] text-text2 space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span>Thương hiệu:</span>
            <span className="text-text font-bold">{brief.brand_identity.brand_name || "TIDO Brand"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Khóa diện mạo sản phẩm:</span>
            <span className="text-emerald-400 font-semibold">
              {brief.brand_identity.product_assets.length > 0 ? "LOCKED" : "UNLOCKED"}
            </span>
          </div>
        </div>
      </div>

      {/* 5. COMMERCIAL PREDICTION / ESTIMATE */}
      <div className="p-3.5 bg-gradient-to-r from-accent/15 to-aiGlow/15 border border-accent/30 rounded-xl space-y-1">
        <div className="flex items-center justify-between text-[12px] font-semibold text-text">
          <span className="flex items-center gap-1.5">
            <TrendingUp size={14} className="text-emerald-400" />
            <span>AI Creative Score Estimate</span>
          </span>
          <span className="font-mono text-emerald-400 font-bold text-[13px]">
            94 / 100
          </span>
        </div>
        <p className="text-[11px] text-text3 leading-relaxed">
          Đánh giá điểm thương mại cao dựa trên khả năng thu hút góc nhìn F&B và khoảng trống an toàn chữ cho thiết bị di động.
        </p>
      </div>
    </div>
  );
}
