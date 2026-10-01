"use client";

import React from "react";
import { Layers, Gauge } from "lucide-react";
import { VmcTallyDot } from "@/components/vmc";

export function CampaignKpiDeck() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
      {/* Card 1 */}
      <div className="bg-surface border border-border rounded-[2px] p-5 flex flex-col justify-between hover:border-borderStrong transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-text-muted font-sans text-[13px] font-medium">
            Chiến dịch hoạt động
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-telemetry">
            <VmcTallyDot status="live" /> RUNNING
          </span>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="font-mono text-[30px] font-bold tracking-tight text-text leading-none">
            06
          </span>
          <span className="font-mono text-[12px] text-text-muted">/ 18 Tổng số</span>
        </div>
        <div className="mt-3.5 w-full bg-surface3 h-1 rounded-[1px] overflow-hidden">
          <div className="bg-text h-full rounded-[1px] w-[33%]" />
        </div>
      </div>

      {/* Card 2 */}
      <div className="bg-surface border border-border rounded-[2px] p-5 flex flex-col justify-between hover:border-borderStrong transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-text-muted font-sans text-[13px] font-medium">
            Ảnh trong hàng đợi
          </span>
          <Layers size={16} className="text-text-telemetry" />
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="font-mono text-[30px] font-bold tracking-tight text-text leading-none">
            142
          </span>
          <span className="font-mono text-[12px] text-text-muted">+24 mới nhận</span>
        </div>
        <div className="mt-3.5 w-full bg-surface3 h-1 rounded-[1px] overflow-hidden">
          <div className="bg-text-muted h-full rounded-[1px] w-[72%]" />
        </div>
      </div>

      {/* Card 3 */}
      <div className="bg-surface border border-border rounded-[2px] p-5 flex flex-col justify-between hover:border-borderStrong transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-text-muted font-sans text-[13px] font-medium">
            Tỷ lệ QC đạt chuẩn
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-telemetry">
            <VmcTallyDot status="success" /> AI-PASS
          </span>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="font-mono text-[30px] font-bold tracking-tight text-text leading-none">
            98.4%
          </span>
          <span className="font-mono text-[12px] text-text-muted">Target: &gt;97%</span>
        </div>
        <div className="mt-3.5 w-full bg-surface3 h-1 rounded-[1px] overflow-hidden">
          <div className="bg-tally-success h-full rounded-[1px] w-[98.4%]" />
        </div>
      </div>

      {/* Card 4 */}
      <div className="bg-surface border border-border rounded-[2px] p-5 flex flex-col justify-between hover:border-borderStrong transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-text-muted font-sans text-[13px] font-medium">
            Thời gian trung bình
          </span>
          <Gauge size={16} className="text-text-telemetry" />
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="font-mono text-[30px] font-bold tracking-tight text-text leading-none">
            3.8s
          </span>
          <span className="font-mono text-[12px] text-text-muted">-0.4s vs tuần trước</span>
        </div>
        <div className="mt-3.5 w-full bg-surface3 h-1 rounded-[1px] overflow-hidden">
          <div className="bg-text h-full rounded-[1px] w-[85%]" />
        </div>
      </div>
    </div>
  );
}
