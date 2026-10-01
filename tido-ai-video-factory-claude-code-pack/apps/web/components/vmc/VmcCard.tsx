"use client";

import React from "react";

export interface VmcCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
  className?: string;
}

export function VmcCard({
  children,
  interactive = false,
  className = "",
  ...props
}: VmcCardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-[4px] p-5 shadow-card transition-all duration-150 ${
        interactive
          ? "cursor-pointer hover:border-borderStrong hover:bg-surface-container hover:-translate-y-0.5 active:translate-y-0"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface VmcMediaCardProps {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  aspectRatio?: "9/16" | "16/9" | "1:1";
  statusText: string;
  statusType: "live" | "success" | "warning" | "idle";
  resolution?: string;
  seed?: string | number;
  onClick?: () => void;
  className?: string;
}

export function VmcMediaCard({
  id,
  title,
  subtitle,
  imageUrl,
  aspectRatio = "9/16",
  statusText,
  statusType,
  resolution = "3840 × 2160",
  seed,
  onClick,
  className = "",
}: VmcMediaCardProps) {
  const aspectClass =
    aspectRatio === "9/16"
      ? "aspect-[9/16]"
      : aspectRatio === "16/9"
      ? "aspect-[16/9]"
      : "aspect-square";

  return (
    <div
      onClick={onClick}
      className={`group flex flex-col bg-surface border border-border rounded-[4px] p-4 transition-all duration-150 cursor-pointer hover:border-borderStrong hover:bg-surface-container hover:-translate-y-1 ${className}`}
    >
      {/* Media Viewport */}
      <div
        className={`relative w-full ${aspectClass} rounded-[2px] overflow-hidden bg-surface2 border border-border flex items-center justify-center`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-telemetry font-mono text-[12px]">
            <span className="w-8 h-8 border border-borderStrong flex items-center justify-center rounded-[2px]">
              {aspectRatio}
            </span>
            <span>NO PREVIEW</span>
          </div>
        )}

        {/* Status Indicator Tag on top left - Solid Flat Background */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-surface border border-border shadow-sm">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              statusType === "live"
                ? "bg-tally-live animate-pulse"
                : statusType === "success"
                ? "bg-tally-success"
                : statusType === "warning"
                ? "bg-tally-warning"
                : "bg-text-telemetry"
            }`}
          />
          <span className="text-text font-mono text-[10.5px] uppercase tracking-wider">
            {statusText}
          </span>
        </div>

        {/* Aspect Ratio Tag on top right - Solid Flat Background */}
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-[2px] bg-surface border border-border font-mono text-[10.5px] text-text-muted">
          {aspectRatio}
        </div>
      </div>

      {/* Card Metadata Section */}
      <div className="flex flex-col gap-2.5 pt-4">
        <div className="flex items-center justify-between text-text-telemetry font-mono text-[11px]">
          <span>{id}</span>
          <span>{resolution}</span>
        </div>

        <div>
          <h3 className="text-text font-medium text-[14px] leading-snug line-clamp-1 group-hover:text-white transition-colors">
            {title}
          </h3>
          {subtitle && (
            <p className="text-text-muted text-[12.5px] mt-0.5 line-clamp-1">
              {subtitle}
            </p>
          )}
        </div>

        {seed !== undefined && (
          <div className="flex items-center justify-between pt-1 border-t border-surface2 text-text-telemetry font-mono text-[10.5px]">
            <span>SEED {seed}</span>
            <span className="text-text-muted hover:text-text">CHI TIẾT →</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default VmcCard;
