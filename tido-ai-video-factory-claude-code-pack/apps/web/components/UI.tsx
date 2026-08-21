import React from "react";
import { PlayCircle } from "lucide-react";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  size?: "sm" | "md";
}) {
  const baseStyles =
    "inline-flex items-center justify-center gap-2 rounded-pill font-semibold font-sans transition-all active:scale-[0.97] cursor-pointer outline-none";
  
  const variants = {
    primary: "bg-text text-bg hover:opacity-90 border border-transparent",
    ghost: "bg-surface text-text2 border border-borderStrong hover:text-text hover:border-text2",
  };
  
  const sizes = {
    sm: "py-2 px-4 text-[13px]",
    md: "py-[11px] px-[22px] text-[14px]",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Chip({
  active = false,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[12.5px] py-[7px] px-[15px] rounded-pill border transition-colors outline-none cursor-pointer ${
        active
          ? "bg-text text-bg border-text"
          : "bg-transparent text-text2 border-borderStrong hover:text-text hover:border-text2"
      }`}
    >
      {children}
    </button>
  );
}

export function TallyDot({
  status,
}: {
  status: "live" | "ok" | "idle" | "warn";
}) {
  const styles = {
    live: "bg-accent shadow-[0_0_6px_var(--color-accent)] animate-pulse",
    ok: "bg-ok",
    idle: "bg-text3",
    warn: "bg-warn",
  };

  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles[status]}`} />;
}

export function Card({
  title,
  statusLabel,
  tallyStatus,
  duration,
  aspectRatio = "9/16",
  onClick,
}: {
  title: string;
  statusLabel: string;
  tallyStatus: "live" | "ok" | "idle" | "warn";
  duration?: string;
  aspectRatio?: "9/16" | "16/9";
  onClick?: () => void;
}) {
  return (
    <div className="cursor-pointer group outline-none" onClick={onClick}>
      <div
        className={`relative bg-surface border border-border rounded-lg overflow-hidden flex items-center justify-center shadow-card transition-transform duration-150 group-hover:-translate-y-[3px]`}
        style={{ aspectRatio: aspectRatio === "9/16" ? "9/16" : "16/9" }}
      >
        {duration && (
          <span className="absolute top-3 left-3 font-mono text-[10.5px] text-text2 bg-black/55 backdrop-blur-[4px] px-[9px] py-1 rounded-pill z-10">
            {duration}
          </span>
        )}
        <PlayCircle size={24} className="text-text3" strokeWidth={1.5} />
      </div>
      <div className="text-[14px] font-medium mt-3 leading-[1.4] text-text">{title}</div>
      <div className="flex items-center gap-[7px] mt-[5px]">
        <TallyDot status={tallyStatus} />
        <span className="text-[12.5px] text-text2">{statusLabel}</span>
      </div>
    </div>
  );
}
