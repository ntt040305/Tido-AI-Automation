"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Sparkles, Layers, LogOut, User, ChevronRight } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { VmcTallyDot } from "./VmcTallyDot";

export function VmcSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const handleLogout = async (e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setProfileOpen(false);
    try {
      if (signOut) {
        await signOut();
      }
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      router.push("/login");
    }
  };

  // Hide sidebar on auth pages
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/login/");
  if (isAuthPage) return null;

  const navItems = [
    {
      title: "Dự án Ảnh",
      href: "/",
      icon: <LayoutGrid size={18} strokeWidth={1.8} />,
      isActive: pathname === "/" || pathname.startsWith("/projects"),
    },
    {
      title: "Studio Render",
      href: "/render-image",
      icon: <Sparkles size={18} strokeWidth={1.8} />,
      isActive: pathname === "/render-image",
    },
    {
      title: "Quản lý Campaign",
      href: "/campaign-site",
      icon: <Layers size={18} strokeWidth={1.8} />,
      isActive: pathname === "/campaign-site",
    },
  ];

  // User display metadata
  const userEmail = user?.email || "operator@vmc.io";
  const userDisplayName = user?.displayName || "Creative Operator";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface border-r border-border z-50 flex flex-col justify-between select-none">
      <div className="flex flex-col">
        {/* Top Enterprise Branding Deck */}
        <div className="h-16 px-4 border-b border-border flex items-center justify-center bg-surface">
          <Link href="/" className="flex items-center justify-center min-w-0 group outline-none py-1">
            <img
              src="/vmc-full-logo.png"
              alt="VMC - VIC MARKETING"
              className="h-10 w-auto object-contain shrink-0 group-hover:brightness-110 transition-all"
            />
          </Link>
        </div>

        {/* Node Telemetry Bar */}
        <div className="px-4 py-2 border-b border-border bg-surface-container-lowest/60 flex items-center justify-between">
          <span className="font-mono text-[10.5px] text-text-telemetry uppercase tracking-wider">
            Node Telemetry
          </span>
          <div className="flex items-center gap-2">
            <VmcTallyDot status="success" />
            <span className="font-mono text-[11px] text-text-muted">PRO-SYS 01</span>
          </div>
        </div>

        {/* Navigation Core (Strict 3 items: Projects, Studio Render, Campaign) */}
        <nav className="flex flex-col gap-1 p-2 mt-2">
          {navItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[2px] transition-colors relative font-sans text-[13.5px] ${
                item.isActive
                  ? "bg-surface2 text-text font-semibold border border-borderStrong"
                  : "text-text-muted hover:bg-surface2 hover:text-text border border-transparent"
              }`}
            >
              {/* Active Indicator Strip */}
              {item.isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-tally-live rounded-[1px]" />
              )}
              <span className={item.isActive ? "text-text" : "text-text-telemetry"}>
                {item.icon}
              </span>
              <span>{item.title}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Bottom Profile Section */}
      <div className="p-3 border-t border-border bg-surface relative" ref={profileRef}>
        <div className="flex items-center gap-1.5">
          <div
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex-1 min-w-0 p-2 rounded-[2px] bg-surface2 border border-border flex items-center justify-between cursor-pointer hover:border-borderStrong transition-colors"
            title="Thông tin tài khoản"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-7 h-7 rounded-[2px] bg-surface3 border border-borderStrong flex items-center justify-center shrink-0 text-text">
                <User size={15} />
              </div>
              <div className="flex flex-col truncate">
                <span className="font-sans text-[12.5px] font-medium text-text truncate">
                  {userDisplayName}
                </span>
                <span className="font-mono text-[10.5px] text-text-telemetry truncate">
                  {userEmail}
                </span>
              </div>
            </div>
            <ChevronRight size={14} className="text-text-telemetry shrink-0" />
          </div>

          {/* Quick Logout Button */}
          <button
            type="button"
            title="Đăng xuất"
            onClick={handleLogout}
            className="w-10 h-11 rounded-[2px] bg-surface2 border border-border hover:border-tally-live hover:text-tally-live text-text-muted flex items-center justify-center shrink-0 transition-colors cursor-pointer group"
          >
            <LogOut size={15} className="group-hover:text-tally-live transition-colors" />
          </button>
        </div>

        {/* Profile Popover */}
        {profileOpen && (
          <div className="absolute bottom-16 left-3 right-3 bg-surface border border-borderStrong rounded-[2px] shadow-card p-1.5 z-50 flex flex-col gap-1">
            <div className="px-3 py-2 border-b border-border">
              <div className="font-sans text-[12px] font-semibold text-text">
                {userDisplayName}
              </div>
              <div className="font-mono text-[10.5px] text-text-telemetry">
                Quyền hạn: Lead Creator
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-[2px] text-tally-live hover:bg-surface2 text-[12.5px] transition-colors w-full text-left cursor-pointer"
            >
              <LogOut size={14} />
              <span>Đăng xuất hệ thống</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export default VmcSidebar;
