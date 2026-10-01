"use client";

import React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { VmcButton } from "./VmcButton";

export interface VmcHeaderProps {
  currentSection?: string;
  actionButton?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function VmcHeader({
  currentSection = "Dự án Hình ảnh",
  actionButton = {
    label: "+ Tạo Dự án Mới",
    href: "/render-image",
  },
}: VmcHeaderProps) {
  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-surface border-b border-border z-40 flex items-center justify-between px-6 select-none">
      {/* Left: Clean Apple Technical Breadcrumb */}
      <div className="flex items-center gap-2 font-mono text-[11px] text-text-telemetry uppercase tracking-wider">
        <span>TRẠM MÁY</span>
        <span className="text-borderStrong">/</span>
        <span>HỆ THỐNG SẢN XUẤT</span>
        <span className="text-borderStrong">/</span>
        <span className="text-text font-sans font-medium capitalize text-[13px] tracking-normal">
          {currentSection}
        </span>
      </div>

      {/* Right: Focused Primary CTA (Zero junk stats) */}
      <div className="flex items-center gap-3">
        {actionButton && (
          actionButton.href ? (
            <Link href={actionButton.href}>
              <VmcButton variant="primary" size="sm" icon={<Plus size={15} />}>
                {actionButton.label.replace(/^\+\s*/, "")}
              </VmcButton>
            </Link>
          ) : (
            <VmcButton
              variant="primary"
              size="sm"
              icon={<Plus size={15} />}
              onClick={actionButton.onClick}
            >
              {actionButton.label.replace(/^\+\s*/, "")}
            </VmcButton>
          )
        )}
      </div>
    </header>
  );
}

export default VmcHeader;
