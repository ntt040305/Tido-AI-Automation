"use client";

import React from "react";
import { VmcTallyDot, TallyStatus } from "./VmcTallyDot";

export type BadgeVariant = "default" | "live" | "success" | "warning" | "telemetry" | "ai";

export interface VmcBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  tally?: TallyStatus;
  className?: string;
}

export function VmcBadge({
  children,
  variant = "default",
  tally,
  className = "",
}: VmcBadgeProps) {
  const variantStyles: Record<BadgeVariant, string> = {
    default: "bg-surface2 text-text border-border",
    live: "bg-accentDim text-tally-live border-tally-live/30",
    success: "bg-okDim text-tally-success border-tally-success/30",
    warning: "bg-warnDim text-tally-warning border-tally-warning/30",
    telemetry: "bg-surface text-text-telemetry border-border",
    ai: "bg-aiGlowDim text-ai-gold border-ai-gold/30",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] border font-mono text-[11px] tracking-wider uppercase select-none ${variantStyles[variant]} ${className}`}
    >
      {tally && <VmcTallyDot status={tally} />}
      <span>{children}</span>
    </span>
  );
}

export default VmcBadge;
