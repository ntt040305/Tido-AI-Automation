"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { VmcTallyDot, VmcButton } from "@/components/vmc";

/**
 * The way into VMC Studio (Apple Technical Dark Mode).
 *
 * Keeps 100% of the original state, hooks, and API integration,
 * wrapped in the Obsidian flat design system:
 * - Solid surfaces (#151517, #1C1C1F), 0 gradients, 0 backdrop-blur.
 * - Corners locked to 2px - 4px.
 * - Monospace telemetry labels & Tally Dot hardware lights.
 */

type Mode = "signin" | "signup";

export function AuthScreen({ initialMode = "signin" }: { initialMode?: Mode }) {
  const { signIn, signUp, configured } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where the guard wanted to send them before it stopped here. Kept relative
  // so this cannot be used to bounce someone to another origin.
  const rawNext = params.get("next") || "/render-image";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/render-image";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (!email.trim() || !password) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Mật khẩu cần ít nhất 6 ký tự.");
      return;
    }

    setBusy(true);
    const result =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, name);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(next);
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-surface-container-lowest text-text select-none">
      {/* ── Left: What this is (Industrial VMC Presentation) ─────────── */}
      <section className="relative lg:w-[48%] shrink-0 overflow-hidden bg-surface border-b lg:border-b-0 lg:border-r border-border">
        <div className="relative h-full flex flex-col justify-between p-8 sm:p-12 lg:p-14">
          {/* Top Brand Deck */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[2px] bg-surface2 border border-borderStrong flex items-center justify-center shrink-0">
                <span className="font-mono font-bold text-[14px] text-text tracking-tight">
                  VMC
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-sans font-bold text-[14px] text-text leading-tight uppercase tracking-tight">
                  VIC MARKETING PRO
                </span>
                <span className="font-mono text-[10px] text-text-telemetry tracking-widest uppercase">
                  ENTERPRISE CREATIVE ENGINE
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[2px] bg-surface2 border border-border">
              <VmcTallyDot status="live" />
              <span className="font-mono text-[10.5px] text-text-muted">NODE 01 ONLINE</span>
            </div>
          </div>

          {/* Core Message */}
          <div className="py-12 lg:py-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-surface2 border border-border mb-4">
              <Sparkles size={12} className="text-ai-gold" />
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-muted">
                AI CREATIVE STUDIO
              </span>
            </div>

            <h1 className="text-[30px] sm:text-[36px] lg:text-[40px] font-bold leading-[1.15] tracking-tight text-text max-w-[18ch]">
              Một giám đốc sáng tạo, trong một màn hình.
            </h1>

            <p className="mt-4 text-[13.5px] leading-relaxed text-text-muted max-w-[48ch]">
              Mô tả ý tưởng bằng lời của bạn. VMC Studio hiểu sản phẩm, chọn hướng sáng tạo,
              quyết định bố cục và typography — rồi giải thích vì sao.
            </p>

            <ul className="mt-7 space-y-3">
              {[
                "Hiểu sản phẩm từ ảnh chụp tham chiếu bạn tải lên",
                "Quyết định thiết kế và bố cục có lý do, không đoán ngẫu nhiên",
                "Tự động rà soát QC, phân tích mắt nhìn và đề xuất tối ưu",
              ].map((line) => (
                <li key={line} className="flex items-center gap-2.5 text-[13px] text-text">
                  <span className="w-1.5 h-1.5 rounded-[1px] bg-tally-success shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Telemetry Footer */}
          <div className="pt-4 border-t border-border flex items-center justify-between font-mono text-[11px] text-text-telemetry">
            <span>POSTER · BANNER · SOCIAL · UGC · PRODUCT HERO</span>
            <span>v4.2 PRO</span>
          </div>
        </div>
      </section>

      {/* ── Right: The Form (Industrial Card) ────────────────────────── */}
      <section className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-surface-container-lowest">
        <div className="w-full max-w-[420px]">
          <div className="bg-surface border border-border rounded-[4px] shadow-card p-7 sm:p-8 flex flex-col gap-5">
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-wider text-text-telemetry mb-1">
                GATEWAY AUTHENTICATION
              </div>
              <h2 className="text-[20px] font-bold tracking-tight text-text">
                {mode === "signin" ? "Đăng nhập Trạm máy" : "Tạo tài khoản Operator"}
              </h2>
              <p className="mt-1 text-[13px] text-text-muted">
                {mode === "signin"
                  ? "Tiếp tục với không gian làm việc của bạn."
                  : "Bắt đầu sản xuất visual thương mại chuẩn Enterprise."}
              </p>
            </div>

            {/* Server Not Configured Warning */}
            {!configured && (
              <div className="flex items-start gap-2.5 rounded-[2px] border border-tally-warning bg-surface2 p-3">
                <AlertCircle size={15} className="text-tally-warning mt-0.5 shrink-0" />
                <p className="text-[12.5px] leading-relaxed text-text">
                  Đăng nhập chưa được cấu hình trên máy chủ này.
                </p>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-[2px] border border-tally-live bg-surface2 p-3"
              >
                <AlertCircle size={15} className="text-tally-live mt-0.5 shrink-0" />
                <p className="text-[12.5px] leading-relaxed text-tally-live font-medium">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-name"
                    className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry flex items-center gap-2"
                  >
                    <span>Tên của bạn</span>
                    <span className="text-[10px] text-text-muted lowercase">(không bắt buộc)</span>
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full bg-surface2 border border-border rounded-[2px] px-3.5 py-2.5 text-[13px] font-sans text-text placeholder:text-text-telemetry focus:outline-none focus:border-borderStrong transition-colors"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="auth-email"
                  className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry"
                >
                  Email Doanh nghiệp
                </label>
                <input
                  id="auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@vmc.io"
                  className="w-full bg-surface2 border border-border rounded-[2px] px-3.5 py-2.5 text-[13px] font-sans text-text placeholder:text-text-telemetry focus:outline-none focus:border-borderStrong transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auth-password"
                    className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry"
                  >
                    Mật khẩu
                  </label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => alert("Vui lòng liên hệ Quản trị viên hệ thống VMC để đặt lại mật khẩu.")}
                      className="font-sans text-[11px] text-text-telemetry hover:text-text transition-colors cursor-pointer"
                    >
                      Quên mật khẩu?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Ít nhất 6 ký tự" : "••••••••••••"}
                    className="w-full bg-surface2 border border-border rounded-[2px] px-3.5 py-2.5 pr-10 text-[13px] font-sans text-text placeholder:text-text-telemetry focus:outline-none focus:border-borderStrong transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-telemetry hover:text-text transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <VmcButton
                type="submit"
                variant="primary"
                size="lg"
                isLoading={busy}
                disabled={busy || !configured}
                className="w-full mt-2"
                icon={mode === "signin" ? <ArrowRight size={15} /> : undefined}
              >
                {busy
                  ? mode === "signin"
                    ? "Đang xác thực…"
                    : "Đang tạo tài khoản…"
                  : mode === "signin"
                  ? "Đăng nhập Trạm máy"
                  : "Tạo tài khoản Operator"}
              </VmcButton>
            </form>

            <div className="pt-4 border-t border-border text-center font-sans text-[12.5px] text-text-muted">
              <span>{mode === "signin" ? "Chưa có tài khoản?" : "Đã có tài khoản trạm máy?"}{" "}</span>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                className="font-medium text-text hover:underline cursor-pointer ml-1"
              >
                {mode === "signin" ? "Tạo tài khoản" : "Đăng nhập"}
              </button>
            </div>
          </div>

          <p className="mt-4 text-center font-mono text-[11px] text-text-telemetry">
            Phiên làm việc được mã hoá và lưu trữ cục bộ trên trạm máy.
          </p>
        </div>
      </section>
    </div>
  );
}
