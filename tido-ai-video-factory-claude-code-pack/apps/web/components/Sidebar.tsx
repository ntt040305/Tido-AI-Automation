"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Grid, Settings, TrendingUp, Image as ImageIcon, Layers, LogOut, LogIn } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";

export default function Sidebar() {
  const pathname = usePathname();

  // The sign-in screen owns the whole viewport. Hiding here rather than
  // branching in the root layout keeps the decision next to the thing being
  // hidden, and avoids turning the layout into a client component.
  const hidden = pathname === "/login" || pathname?.startsWith("/login/");

  const router = useRouter();
  const { user, signOut } = useAuth();

  // Initials from whatever the account actually has. This used to read "MH"
  // for everyone -- a placeholder that looked like real data, which is the one
  // kind of placeholder worth removing on sight.
  const label = user?.displayName || user?.email || "";
  const initials =
    label
      .replace(/@.*$/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (hidden) return null;

  return (
    <aside className="w-[64px] shrink-0 bg-bg border-r border-border flex flex-col items-center py-5 sticky top-0 h-screen z-50">
      {/* Logo */}
      <Link href="/" className="flex items-center justify-center mb-7 outline-none group">
        <img
          src="/tido.png"
          alt="TIDO Logo"
          className="w-9 h-9 object-contain group-hover:scale-105 transition-transform"
        />
      </Link>

      {/* Nav */}
      <div className="flex flex-col gap-1.5 flex-1 w-full px-3 items-center">
        <Link
          href="/"
          title="Không gian chiến dịch"
          className={`w-10 h-10 rounded-pill flex items-center justify-center cursor-pointer border relative transition-colors ${
            pathname === "/" || pathname.startsWith("/projects")
              ? "text-text bg-surface2 border-border"
              : "text-text3 bg-transparent border-transparent hover:text-text2 hover:bg-surface"
          }`}
        >
          {(pathname === "/" || pathname.startsWith("/projects")) && (
            <div className="absolute -left-[9px] w-[3px] h-[14px] bg-accent rounded-[2px]" />
          )}
          <Grid size={19} strokeWidth={1.6} />
        </Link>

        <Link
          href="/render-image"
          title="Render ảnh"
          className={`w-10 h-10 rounded-pill flex items-center justify-center cursor-pointer border relative transition-colors ${
            pathname === "/render-image" || pathname.startsWith("/render-image")
              ? "text-text bg-surface2 border-border"
              : "text-text3 bg-transparent border-transparent hover:text-text2 hover:bg-surface"
          }`}
        >
          {(pathname === "/render-image" || pathname.startsWith("/render-image")) && (
            <div className="absolute -left-[9px] w-[3px] h-[14px] bg-accent rounded-[2px]" />
          )}
          <ImageIcon size={19} strokeWidth={1.6} />
        </Link>

        <Link
          href="/campaign-site"
          title="Studio Chiến Dịch"
          className={`w-10 h-10 rounded-pill flex items-center justify-center cursor-pointer border relative transition-colors ${
            pathname.startsWith("/campaign-site")
              ? "text-text bg-surface2 border-border"
              : "text-text3 bg-transparent border-transparent hover:text-text2 hover:bg-surface"
          }`}
        >
          {pathname.startsWith("/campaign-site") && (
            <div className="absolute -left-[9px] w-[3px] h-[14px] bg-accent rounded-[2px]" />
          )}
          <Layers size={19} strokeWidth={1.6} />
        </Link>
      </div>

      {/* Bottom Profile Popover */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          title={user ? label : "Chưa đăng nhập"}
          className="w-[34px] h-[34px] rounded-full bg-surface2 border border-borderStrong flex items-center justify-center font-mono text-[12px] text-text2 cursor-pointer hover:border-text2 transition-colors outline-none"
        >
          {user ? initials : <LogIn size={15} strokeWidth={1.6} />}
        </button>

        {menuOpen && (
          <div className="absolute bottom-0 left-[52px] bg-surface2 border border-borderStrong rounded-DEFAULT p-1.5 w-[170px] shadow-card">
            <div className="px-2.5 py-2.5 text-[12.5px] text-text2 border-b border-border mb-1.5">
              <b className="text-text block font-medium text-[13.5px] mb-px truncate">
                {user ? user.displayName || user.email?.split("@")[0] : "Khách"}
              </b>
              <span className="truncate block">{user ? user.email : "Chưa đăng nhập"}</span>
            </div>
            <Link
              href="/cost"
              onClick={() => setMenuOpen(false)}
              className="px-2.5 py-2.5 text-[13.5px] text-text2 rounded-[5px] cursor-pointer flex items-center gap-2 hover:bg-surface3 hover:text-text transition-colors"
            >
              <TrendingUp size={15} strokeWidth={1.6} className="shrink-0" />
              Chi phí
            </Link>
            <div
              className="px-2.5 py-2.5 text-[13.5px] text-text2 rounded-[5px] cursor-pointer flex items-center gap-2 hover:bg-surface3 hover:text-text transition-colors"
            >
              <Settings size={15} strokeWidth={1.6} className="shrink-0" />
              Cài đặt
            </div>

            {user ? (
              <button
                type="button"
                onClick={async () => {
                  setMenuOpen(false);
                  await signOut();
                  // Home rather than /login: signing out should land somewhere
                  // usable, and rendering still works without an account.
                  router.replace("/");
                }}
                className="w-full px-2.5 py-2.5 text-[13.5px] text-text2 rounded-[5px] cursor-pointer flex items-center gap-2 hover:bg-surface3 hover:text-text transition-colors text-left outline-none"
              >
                <LogOut size={15} strokeWidth={1.6} className="shrink-0" />
                Đăng xuất
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="px-2.5 py-2.5 text-[13.5px] text-text2 rounded-[5px] cursor-pointer flex items-center gap-2 hover:bg-surface3 hover:text-text transition-colors"
              >
                <LogIn size={15} strokeWidth={1.6} className="shrink-0" />
                Đăng nhập
              </Link>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
