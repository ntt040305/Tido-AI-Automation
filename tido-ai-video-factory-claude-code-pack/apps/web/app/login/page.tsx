import { Suspense } from "react";
import { AuthScreen } from "@/features/auth/components/AuthScreen";

export const metadata = {
  title: "Đăng nhập — VMC Studio",
  description: "Cổng xác thực VMC Studio Auth Gateway • VIC Marketing Pro",
};

/**
 * `AuthScreen` reads `?next=` with `useSearchParams`, which Next requires be
 * wrapped in Suspense so the rest of the page can prerender.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-container-lowest" />}>
      <AuthScreen />
    </Suspense>
  );
}
