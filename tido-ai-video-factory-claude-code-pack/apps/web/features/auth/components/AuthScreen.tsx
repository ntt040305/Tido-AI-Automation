"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "../AuthProvider";

/**
 * The way into TIDO.
 *
 * Built from the product's own vocabulary rather than a login template: the
 * same `bg-surface` cards, `border-borderStrong` inputs, `focus:border-accent`
 * rings, `rounded-xl` corners, mono uppercase eyebrows and `text-[12.5px]`
 * body that every other panel uses. Someone who has seen the studio should
 * recognise this as the same product before reading a word.
 *
 * Two panels, and why
 * -------------------
 * Left says what this is, because most people arriving here have been sent a
 * link and have never heard of it. Right is the form, kept deliberately short:
 * an email, a password, and for signup a name. Every additional field is a
 * reason to leave, and none of the others are needed to make a poster.
 *
 * One screen, two modes. Signing in and signing up are the same layout with a
 * different verb, so switching between them does not feel like navigating.
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
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-bg">
      {/* ── Left: what this is ──────────────────────────────────────────── */}
      <section className="relative lg:w-[46%] shrink-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-border">
        {/* Two soft pools of colour rather than a gradient wash: the product's
            own accent and the AI gold, at low opacity so type stays readable. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full blur-3xl opacity-[0.18]"
          style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[-140px] right-[-80px] h-[380px] w-[380px] rounded-full blur-3xl opacity-[0.14]"
          style={{ background: "radial-gradient(circle, var(--color-aiGlow) 0%, transparent 70%)" }}
        />

        <div className="relative h-full flex flex-col justify-between p-8 sm:p-12 lg:p-14">
          <div className="flex items-center gap-3">
            <img src="/tido.png" alt="" className="w-9 h-9 object-contain" />
            <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-text2">
              TIDO Studio
            </span>
          </div>

          <div className="py-12 lg:py-0">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-aiGlow flex items-center gap-1.5">
              <Sparkles size={12} />
              AI Creative Studio
            </span>
            <h1 className="mt-4 text-[30px] sm:text-[38px] lg:text-[42px] font-bold leading-[1.12] tracking-tight text-text text-balance max-w-[16ch]">
              Một giám đốc sáng tạo, trong một màn hình.
            </h1>
            <p className="mt-5 text-[14px] leading-relaxed text-text2 max-w-[46ch]">
              Mô tả ý tưởng bằng lời của bạn. TIDO hiểu sản phẩm, chọn hướng sáng tạo,
              quyết định bố cục và chữ — rồi giải thích vì sao.
            </p>

            <ul className="mt-8 space-y-2.5">
              {[
                "Hiểu sản phẩm từ ảnh bạn tải lên",
                "Quyết định thiết kế có lý do, không đoán",
                "Tự xem lại ảnh và đề xuất cải thiện",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[13px] text-text2">
                  <span className="mt-[7px] h-1 w-1 rounded-full bg-aiGlow shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="font-mono text-[11px] text-text3 hidden lg:block">
            Poster · Banner · Social · UGC · Product hero
          </p>
        </div>
      </section>

      {/* ── Right: the form ─────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          <div className="bg-surface border border-border rounded-2xl shadow-card p-7 sm:p-8">
            <h2 className="text-[19px] font-bold tracking-tight text-text">
              {mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
            </h2>
            <p className="mt-1.5 text-[13px] text-text2">
              {mode === "signin"
                ? "Tiếp tục với không gian sáng tạo của bạn."
                : "Bắt đầu tạo visual thương mại trong vài phút."}
            </p>

            {!configured && (
              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warnDim/60 p-3">
                <AlertCircle size={15} className="text-warn mt-[1px] shrink-0" />
                <p className="text-[12.5px] leading-relaxed text-text2">
                  Đăng nhập chưa được cấu hình trên máy chủ này.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {mode === "signup" && (
                <Field label="Tên của bạn" htmlFor="auth-name" optional>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className={INPUT}
                  />
                </Field>
              )}

              <Field label="Email" htmlFor="auth-email">
                <input
                  id="auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@congty.com"
                  className={INPUT}
                />
              </Field>

              <Field label="Mật khẩu" htmlFor="auth-password">
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Ít nhất 6 ký tự" : "••••••••"}
                    className={`${INPUT} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-lg text-text3 hover:text-text2 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>

              {/* Reserved space would be nicer than a jump, but the error is
                  rare and short; a permanently empty row reads as a bug. */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accentDim/40 p-3"
                >
                  <AlertCircle size={15} className="text-accent mt-[1px] shrink-0" />
                  <p className="text-[12.5px] leading-relaxed text-text">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !configured}
                className="w-full h-11 rounded-xl bg-accent text-white font-semibold text-[13.5px] transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {busy ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>{mode === "signin" ? "Đang đăng nhập…" : "Đang tạo tài khoản…"}</span>
                  </>
                ) : (
                  <>
                    <span>{mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-border text-center">
              <p className="text-[12.5px] text-text2">
                {mode === "signin" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                  }}
                  className="text-accent font-semibold hover:brightness-125 transition-all cursor-pointer outline-none focus-visible:underline"
                >
                  {mode === "signin" ? "Tạo tài khoản" : "Đăng nhập"}
                </button>
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-[11.5px] leading-relaxed text-text3">
            Phiên đăng nhập được ghi nhớ trên thiết bị này.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Matches the input treatment used across the brief and strategy panels. */
const INPUT =
  "w-full h-11 px-3.5 bg-surface2/70 border border-borderStrong rounded-xl text-[13.5px] text-text " +
  "placeholder:text-text3/60 outline-none transition-all " +
  "focus:border-accent focus:ring-1 focus:ring-accent";

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[11px] uppercase tracking-wider text-text3 flex items-center gap-2"
      >
        <span>{label}</span>
        {optional && <span className="normal-case tracking-normal text-text3/70">không bắt buộc</span>}
      </label>
      {children}
    </div>
  );
}
