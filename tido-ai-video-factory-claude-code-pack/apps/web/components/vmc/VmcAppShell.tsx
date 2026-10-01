"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { VmcSidebar } from "./VmcSidebar";
import { VmcHeader } from "./VmcHeader";

export function VmcAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/login/");

  if (isAuthPage) {
    return <main className="w-full min-h-screen bg-surface-container-lowest text-text">{children}</main>;
  }

  // Dynamic breadcrumb label based on route
  const getSectionTitle = () => {
    if (pathname === "/") return "Dự án Hình ảnh";
    if (pathname.startsWith("/render-image")) return "Studio Render Trực Tuyến";
    if (pathname.startsWith("/campaign-site")) return "Quản lý Campaign Render";
    if (pathname.startsWith("/projects")) return "Chi tiết Dự án";
    return "Không gian Sáng tạo";
  };

  const getActionConfig = () => {
    if (pathname.startsWith("/render-image")) {
      return {
        label: "+ Tạo Dự án Mới",
        href: "/",
      };
    }
    return {
      label: "+ Tạo Dự án Mới",
      href: "/render-image",
    };
  };

  return (
    <div className="min-h-screen w-full bg-surface-container-lowest text-text">
      <VmcSidebar />
      <div className="pl-64">
        <VmcHeader currentSection={getSectionTitle()} actionButton={getActionConfig()} />
        <main className="relative pt-16 w-full min-h-screen bg-surface-container-lowest">
          {children}
        </main>
      </div>
    </div>
  );
}

export default VmcAppShell;
