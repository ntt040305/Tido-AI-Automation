"use client";

import React from "react";

export type TallyStatus = "live" | "success" | "warning" | "idle";

export interface VmcTallyDotProps {
  status: TallyStatus;
  className?: string;
  pulse?: boolean;
}

export function VmcTallyDot({ status, className = "", pulse }: VmcTallyDotProps) {
  const statusStyles: Record<TallyStatus, string> = {
    live: "bg-tally-live shadow-[0_0_6px_var(--color-tally-live)]",
    success: "bg-tally-success",
    warning: "bg-tally-warning",
    idle: "bg-text-telemetry",
  };

  const shouldPulse = pulse ?? status === "live";

  return (
    <span
      className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${statusStyles[status]} ${
        shouldPulse ? "animate-pulse" : ""
      } ${className}`}
      aria-label={`Status: ${status}`}
    />
  );
}

export default VmcTallyDot;
