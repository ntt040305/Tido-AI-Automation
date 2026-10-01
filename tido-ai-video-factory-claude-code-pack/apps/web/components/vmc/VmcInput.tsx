"use client";

import React from "react";

export interface VmcInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  telemetry?: string;
  icon?: React.ReactNode;
}

export function VmcInput({
  label,
  helperText,
  error,
  telemetry,
  icon,
  className = "",
  id,
  ...props
}: VmcInputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {(label || telemetry) && (
        <div className="flex items-center justify-between">
          {label && (
            <label htmlFor={inputId} className="font-sans text-[12.5px] font-medium text-text">
              {label}
            </label>
          )}
          {telemetry && (
            <span className="font-mono text-[11px] text-text-telemetry tracking-wide">
              {telemetry}
            </span>
          )}
        </div>
      )}

      <div className="relative flex items-center w-full">
        {icon && (
          <span className="absolute left-3 text-text-telemetry flex items-center pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={`w-full h-10 bg-surface2 text-text placeholder:text-text-telemetry border ${
            error ? "border-tally-live" : "border-border"
          } rounded-[2px] ${
            icon ? "pl-9 pr-3.5" : "px-3.5"
          } font-sans text-[13.5px] focus:border-borderStrong focus:bg-surface3 transition-colors duration-150 outline-none disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
      </div>

      {error ? (
        <span className="font-mono text-[11px] text-tally-live">{error}</span>
      ) : helperText ? (
        <span className="font-sans text-[11.5px] text-text-muted">{helperText}</span>
      ) : null}
    </div>
  );
}

export interface VmcTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  telemetry?: string;
}

export function VmcTextarea({
  label,
  helperText,
  error,
  telemetry,
  className = "",
  id,
  rows = 4,
  ...props
}: VmcTextareaProps) {
  const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {(label || telemetry) && (
        <div className="flex items-center justify-between">
          {label && (
            <label htmlFor={textareaId} className="font-sans text-[12.5px] font-medium text-text">
              {label}
            </label>
          )}
          {telemetry && (
            <span className="font-mono text-[11px] text-text-telemetry tracking-wide">
              {telemetry}
            </span>
          )}
        </div>
      )}

      <textarea
        id={textareaId}
        rows={rows}
        className={`w-full bg-surface2 text-text placeholder:text-text-telemetry border ${
          error ? "border-tally-live" : "border-border"
        } rounded-[2px] p-3 font-sans text-[13.5px] leading-relaxed focus:border-borderStrong focus:bg-surface3 transition-colors duration-150 outline-none resize-none disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
        {...props}
      />

      {error ? (
        <span className="font-mono text-[11px] text-tally-live">{error}</span>
      ) : helperText ? (
        <span className="font-sans text-[11.5px] text-text-muted">{helperText}</span>
      ) : null}
    </div>
  );
}

export default VmcInput;
