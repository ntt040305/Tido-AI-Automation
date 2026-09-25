import { Suspense } from "react";
import { AuthScreen } from "@/features/auth/components/AuthScreen";

export const metadata = {
  title: "Đăng nhập — TIDO Studio",
};

/**
 * `AuthScreen` reads `?next=` with `useSearchParams`, which Next requires be
 * wrapped in Suspense so the rest of the page can prerender.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <AuthScreen />
    </Suspense>
  );
}
