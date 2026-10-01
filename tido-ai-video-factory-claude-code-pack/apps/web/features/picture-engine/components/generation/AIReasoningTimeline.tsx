"use client";

import React from "react";
import { VmcTallyDot } from "@/components/vmc";

export interface TimelineStepItem {
  id: string;
  label: string;
  description: string;
  status: "pending" | "active" | "completed" | "failed";
}

export interface AIReasoningTimelineProps {
  currentStepIndex: number;
  steps: TimelineStepItem[];
  progressPercent: number;
}

export function AIReasoningTimeline({
  currentStepIndex,
  steps,
  progressPercent,
}: AIReasoningTimelineProps) {
  return (
    <div className="w-full bg-surface border border-border rounded-[2px] p-4 shadow-card space-y-3.5 text-left select-none">
      {/* Timeline Header & Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-text-telemetry uppercase font-semibold tracking-wider flex items-center gap-1.5">
            <VmcTallyDot status="live" />
            <span>AI REASONING TIMELINE</span>
          </span>
          <span className="text-[11px] font-mono text-text font-bold">
            {progressPercent}%
          </span>
        </div>
        <div className="w-full h-1 bg-surface3 rounded-[1px] overflow-hidden border border-border">
          <div
            className="h-full bg-text transition-all duration-300 rounded-[1px]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-1.5 pt-1">
        {steps.map((step, idx) => {
          const isCompleted = step.status === "completed";
          const isActive = step.status === "active";
          const isFailed = step.status === "failed";

          return (
            <div
              key={step.id}
              className={`flex items-start gap-2.5 p-2 rounded-[2px] border transition-colors ${
                isActive
                  ? "bg-surface2 border-borderStrong text-text"
                  : isCompleted
                  ? "bg-surface border-border text-text-muted"
                  : isFailed
                  ? "bg-surface border-tally-live text-tally-live"
                  : "bg-surface/40 border-transparent text-text-telemetry"
              }`}
            >
              {/* Hardware Tally Dot Indicator */}
              <div className="mt-1 shrink-0">
                {isCompleted && <VmcTallyDot status="success" />}
                {isActive && <VmcTallyDot status="live" />}
                {isFailed && <VmcTallyDot status="warning" />}
                {!isCompleted && !isActive && !isFailed && <VmcTallyDot status="idle" />}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[12.5px] font-medium tracking-tight font-sans ${
                      isActive ? "text-text font-bold" : isCompleted ? "text-text-muted" : "text-text-telemetry"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[10px] font-mono text-text-telemetry">
                    Bước {idx + 1}/7
                  </span>
                </div>
                <p className="text-[11px] text-text-telemetry mt-0.5 line-clamp-1 font-sans">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
