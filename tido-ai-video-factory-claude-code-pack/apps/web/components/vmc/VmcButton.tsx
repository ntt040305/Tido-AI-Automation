"use client";

import React from "react";

export type ButtonVariant = "primary" | "ghost" | "outline" | "danger" | "icon";
export type ButtonSize = "sm" | "md" | "lg";

export interface VmcButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function VmcButton({
  variant = "primary",
  size = "md",
  isLoading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: VmcButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center gap-2 font-sans font-medium transition-colors duration-150 rounded-[2px] cursor-pointer outline-none select-none disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.99]";

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      "bg-text text-bg hover:bg-white border border-transparent font-semibold shadow-sm",
    ghost:
      "bg-surface2 text-text-muted hover:text-text hover:bg-surface3 border border-border",
    outline:
      "bg-transparent text-text-muted hover:text-text border border-borderStrong hover:border-text",
    danger:
      "bg-tally-live text-white hover:bg-red-600 border border-transparent font-semibold",
    icon:
      "bg-surface2 text-text-muted hover:text-text hover:bg-surface3 border border-border p-0 aspect-square",
  };

  const sizeStyles: Record<ButtonSize, string> = {
    sm: variant === "icon" ? "w-7 h-7 text-[12px]" : "h-8 px-3 text-[12px]",
    md: variant === "icon" ? "w-9 h-9 text-[14px]" : "h-10 px-4 text-[13.5px]",
    lg: variant === "icon" ? "w-11 h-11 text-[16px]" : "h-11 px-5 text-[14.5px]",
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon && <span className="shrink-0 flex items-center">{icon}</span>
      )}
      {children && <span>{children}</span>}
    </button>
  );
}

export default VmcButton;
