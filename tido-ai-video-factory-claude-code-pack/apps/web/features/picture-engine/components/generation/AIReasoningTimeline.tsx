"use client";

import React from "react";
import { CheckCircle2, AlertCircle, Loader2, Circle } from "lucide-react";

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
    <div className="w-full bg-surface border border-border rounded-2xl p-6 shadow-xl space-y-5 text-left">
      {/* Timeline Header & Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-mono text-aiGlow uppercase font-semibold tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-aiGlow animate-ping" />
            <span>AI REASONING TIMELINE</span>
          </span>
          <span className="text-[12px] font-mono text-text2 font-bold">
            {progressPercent}%
          </span>
        </div>
        <div className="w-full h-2 bg-surface2 rounded-full overflow-hidden border border-borderStrong">
          <div
            className="h-full bg-gradient-to-r from-accent via-aiGlow to-emerald-400 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-3 pt-2">
        {steps.map((step, idx) => {
          const isCompleted = step.status === "completed";
          const isActive = step.status === "active";
          const isFailed = step.status === "failed";

          return (
            <div
              key={step.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                isActive
                  ? "bg-aiGlow/10 border-aiGlow text-white shadow-md shadow-aiGlow/10 ring-1 ring-aiGlow/30"
                  : isCompleted
                  ? "bg-surface2/40 border-borderStrong text-text2"
                  : isFailed
                  ? "bg-rose-500/10 border-rose-500 text-rose-300"
                  : "bg-surface2/20 border-transparent text-text3"
              }`}
            >
              {/* Step Status Icon */}
              <div className="mt-0.5 shrink-0">
                {isCompleted && (
                  <CheckCircle2 size={18} className="text-emerald-400" />
                )}
                {isActive && (
                  <Loader2 size={18} className="text-aiGlow animate-spin" />
                )}
                {isFailed && (
                  <AlertCircle size={18} className="text-rose-400" />
                )}
                {!isCompleted && !isActive && !isFailed && (
                  <Circle size={18} className="text-text3/50" />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[13px] font-semibold tracking-tight ${
                      isActive ? "text-white" : isCompleted ? "text-text" : "text-text3"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[10px] font-mono text-text3">
                    Bước {idx + 1}/7
                  </span>
                </div>
                <p className="text-[11.5px] text-text3 mt-0.5 line-clamp-1">
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
