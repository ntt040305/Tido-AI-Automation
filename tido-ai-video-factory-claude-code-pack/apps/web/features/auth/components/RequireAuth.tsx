"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "../AuthProvider";

/**
 * Keeps a page behind a sign-in.
 *
 * The important line is the `loading` guard. Firebase resolves a persisted
 * session asynchronously, so for a moment after every page load a returning
 * user looks exactly like a signed-out one. Redirecting on that would bounce
 * people to the login screen on every refresh -- the single most common bug in
 * client-side route protection, and the reason `loading` is a first-class
 * state in the provider rather than an internal detail.
 *
 * This is a client guard, which means it hides UI rather than protecting data.
 * That is honest about where the real boundary is: the API verifies the token
 * server-side and the database enforces RLS. Someone who disables JavaScript
 * sees an empty shell and still cannot read a row.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || user) return;
    // Unconfigured means nobody can sign in at all. Redirecting would trap
    // someone in a loop against a login screen that cannot work, so the page
    // is left alone and the app behaves as it did before accounts existed.
    if (!configured) return;
    const next = encodeURIComponent(pathname || "/");
    router.replace(`/login?next=${next}`);
  }, [loading, user, configured, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Loader2 size={20} className="animate-spin text-text3" />
      </div>
    );
  }

  if (!user && configured) {
    // The redirect is in flight. Rendering the page for an instant would flash
    // protected content.
    return <div className="min-h-screen bg-bg" />;
  }

  return <>{children}</>;
}
