"use client";

import React from "react";
import { GenerationDiagnostics } from "../../types/picture-engine.types";
import { Activity, AlertTriangle, Layers, Ruler, Camera } from "lucide-react";

export interface GenerationDiagnosticsPanelProps {
  diagnostics: GenerationDiagnostics;
}

const TIER_LABEL: Record<string, string> = {
  USER: "Yêu cầu của bạn",
  REFERENCE: "Ảnh tham khảo",
  STRATEGY: "Chiến lược chiến dịch",
  KNOWLEDGE: "Kho tri thức",
  ASSET_DEFAULT: "Mặc định theo định dạng",
};

const DIMENSION_LABEL: Record<string, string> = {
  camera: "Góc máy",
  lighting: "Ánh sáng",
  composition: "Bố cục",
  colour: "Màu sắc",
  environment: "Bối cảnh",
  materials: "Chất liệu",
  atmosphere: "Không khí",
};

/**
 * Generation diagnostics.
 *
 * This panel used to be a "Commercial QC" scorecard showing 94/100, 96% brand
 * consistency and an always-green PASS badge — all hardcoded constants. No stage
 * of the pipeline looks at the rendered image, so those numbers described nothing.
 * What is shown now is what the run actually did, including what it dropped.
 */
export function GenerationDiagnosticsPanel({ diagnostics }: GenerationDiagnosticsPanelProps) {
  const provenance = diagnostics.art_direction_provenance || {};
  const provenanceRows = Object.entries(provenance);
  const removed = diagnostics.prompt_sections_removed || [];

  const facts: { label: string; value: string }[] = [
    { label: "Ảnh tham khảo đã phân tích", value: String(diagnostics.references_analyzed) },
    { label: "Sản phẩm nhận diện", value: String(diagnostics.products_detected) },
    { label: "Logo nhận diện", value: String(diagnostics.logos_detected) },
    { label: "Ảnh cảm hứng", value: String(diagnostics.inspiration_references) },
    { label: "Độ dài prompt", value: `${diagnostics.prompt_chars.toLocaleString()} ký tự` },
    { label: "Khối tri thức áp dụng", value: String(diagnostics.knowledge_blocks_applied.length) },
  ];

  return (
    <div className="bg-surface2/60 border border-borderStrong rounded-2xl p-4 space-y-4 text-left">
      <div className="flex items-center justify-between border-b border-borderStrong pb-2">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
          <Activity size={16} className="text-accent" />
          <span>Nhật ký sản xuất (Generation Diagnostics)</span>
        </div>
        {diagnostics.interpretation_source && (
          <span className="text-[10.5px] font-mono text-text3 border border-borderStrong px-2 py-0.5 rounded-full">
            {diagnostics.interpretation_source}
          </span>
        )}
      </div>

      {/* Measured facts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {facts.map((f) => (
          <div key={f.label} className="p-2.5 bg-surface border border-borderStrong/60 rounded-xl">
            <span className="text-[10.5px] text-text3 block leading-tight">{f.label}</span>
            <span className="font-mono text-[13px] text-text font-semibold">{f.value}</span>
          </div>
        ))}
      </div>

      {/* Who decided what — the resolved art direction */}
      {provenanceRows.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-mono text-text3 uppercase flex items-center gap-1">
            <Camera size={12} className="text-accent" />
            <span>Quyết định art direction đến từ đâu</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {provenanceRows.map(([dim, tier]) => {
              const decision = diagnostics.art_direction_decisions?.find((d) => d.dimension === dim);
              const locked = decision?.client_locked;
              return (
                <span
                  key={dim}
                  title={
                    decision
                      ? `confidence ${decision.confidence.toFixed(2)} · specificity ${decision.specificity} · score ${decision.score}`
                      : undefined
                  }
                  className={`text-[11px] font-mono px-2 py-1 rounded-lg border ${
                    locked
                      ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
                      : tier === "USER"
                      ? "text-emerald-400/70 border-emerald-400/25 bg-emerald-400/5"
                      : "text-text2 border-borderStrong bg-surface"
                  }`}
                >
                  {DIMENSION_LABEL[dim] || dim} ← {TIER_LABEL[tier] || tier}
                  {decision ? ` · ${decision.specificity}` : ""}
                  {locked ? " 🔒" : ""}
                </span>
              );
            })}
          </div>
          <p className="text-[10.5px] text-text3 leading-relaxed">
            🔒 = chỉ dẫn cụ thể của bạn, khoá cứng, không lớp nào ghi đè được.
          </p>
        </div>
      )}

      {/* Knowledge actually applied */}
      {diagnostics.knowledge_blocks_applied.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-mono text-text3 uppercase flex items-center gap-1">
            <Layers size={12} className="text-aiGlow" />
            <span>Tri thức chuyên môn đã đưa vào prompt</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {diagnostics.knowledge_blocks_applied.map((id) => (
              <span key={id} className="text-[10.5px] font-mono text-text2 bg-surface border border-borderStrong px-2 py-0.5 rounded">
                {id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Layout intelligence: what gets attention, and in what order */}
      {diagnostics.layout_zones && diagnostics.layout_zones.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-mono text-text3 uppercase flex items-center gap-1">
            <Ruler size={12} className="text-accent" />
            <span>Bố cục &amp; thứ tự thu hút thị giác</span>
          </span>
          {diagnostics.layout_visual_priority && diagnostics.layout_visual_priority.length > 0 && (
            <div className="space-y-1">
              {diagnostics.layout_visual_priority.map((entry) => {
                const [element, weight] = entry.split(":");
                const pct = Math.max(0, Math.min(100, Number(weight) || 0));
                return (
                  <div key={entry} className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono text-text2 w-20 shrink-0 uppercase">{element}</span>
                    <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10.5px] font-mono text-text3 w-8 text-right">{pct}</span>
                  </div>
                );
              })}
            </div>
          )}
          {diagnostics.layout_eye_flow && (
            <p className="text-[11px] text-text3">
              Hướng đọc: <span className="font-mono text-text2">{diagnostics.layout_eye_flow.replace(/_/g, " ")}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {diagnostics.layout_zones.map((z) => (
              <span key={z} className="text-[10.5px] font-mono text-text2 bg-surface border border-borderStrong px-2 py-0.5 rounded">
                {z}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Anything the budget reducer dropped, stated plainly */}
      {(removed.length > 0 || diagnostics.prompt_hard_truncated) && (
        <div className="p-2.5 bg-amber-400/10 border border-amber-400/30 rounded-xl space-y-1">
          <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1 font-semibold">
            <AlertTriangle size={12} />
            <span>Prompt vượt ngưỡng — đã lược bỏ</span>
          </span>
          {removed.map((r) => (
            <p key={r.section} className="text-[11.5px] text-text2">
              {r.section} (ưu tiên {r.priority}, −{r.chars.toLocaleString()} ký tự)
            </p>
          ))}
          {diagnostics.prompt_hard_truncated && (
            <p className="text-[11.5px] text-amber-400">Prompt bị cắt cứng ở giới hạn tối đa.</p>
          )}
        </div>
      )}

      {diagnostics.pipeline_warnings.length > 0 && (
        <div className="pt-0.5">
          <span className="text-[11px] font-mono text-amber-400 flex items-start gap-1">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>Cảnh báo pipeline: {diagnostics.pipeline_warnings.join(", ")}</span>
          </span>
        </div>
      )}

      <p className="text-[11px] text-text3 leading-relaxed border-t border-borderStrong pt-2">
        Hệ thống chưa chấm điểm ảnh đã tạo. Các số liệu trên mô tả quá trình sản xuất, không phải chất lượng hình ảnh.
      </p>
    </div>
  );
}
