"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isAuthConfigured, authErrorMessage } from "./firebase-client";

/**
 * Who is signed in, for the whole application.
 *
 * Three states, and the third is the one that matters
 * --------------------------------------------------
 * `loading` is not a nicety. Firebase resolves persisted sessions
 * asynchronously, so for the first moment after a page load a returning user
 * is indistinguishable from a signed-out one. Any guard that treats "no user
 * yet" as "not signed in" will bounce that person to the login screen on every
 * refresh. Everything downstream must wait for `loading` to clear before
 * deciding anything.
 *
 * On tokens
 * ---------
 * The ID token is never held in state. It expires hourly, and a copy in React
 * state is a copy that goes stale, gets logged in a devtools snapshot, or
 * survives a sign-out. `getToken()` asks the SDK each time, which returns the
 * cached token until it is close to expiry and refreshes it silently otherwise.
 * That is the automatic refresh — there is no timer here to get wrong.
 */

export interface AuthState {
  user: User | null;
  /** True until Firebase has resolved whether a session exists. */
  loading: boolean;
  /** False when the browser config is missing; the UI says so rather than hanging. */
  configured: boolean;
  signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }>;
  signUp(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  signOut(): Promise<void>;
  /** A fresh ID token, or null when signed out. Refreshes itself. */
  getToken(): Promise<string | null>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isAuthConfigured();

  // Held in a ref rather than state: reading it must never schedule a render,
  // because `getToken` is called from inside request paths.
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      // Nothing will ever resolve, so stop waiting rather than spinning
      // forever behind a loading screen.
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        userRef.current = u;
        setUser(u);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      configured,

      async signIn(email, password) {
        const auth = getFirebaseAuth();
        if (!auth) return { ok: false, error: "Đăng nhập chưa được cấu hình." };
        try {
          await signInWithEmailAndPassword(auth, email.trim(), password);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: authErrorMessage((e as { code?: string })?.code) };
        }
      },

      async signUp(email, password, displayName) {
        const auth = getFirebaseAuth();
        if (!auth) return { ok: false, error: "Đăng ký chưa được cấu hình." };
        try {
          const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
          const name = displayName?.trim();
          if (name) {
            // Best effort. A failed display name is not a failed signup, and
            // throwing here would leave an account created but unreported.
            await updateProfile(cred.user, { displayName: name }).catch(() => {});
          }
          return { ok: true };
        } catch (e) {
          return { ok: false, error: authErrorMessage((e as { code?: string })?.code) };
        }
      },

      async signOut() {
        const auth = getFirebaseAuth();
        if (!auth) return;
        await fbSignOut(auth).catch(() => {});
        userRef.current = null;
      },

      async getToken() {
        const current = userRef.current;
        if (!current) return null;
        try {
          // No `true` here: forcing a refresh on every call would mean a
          // network round trip per request. The SDK refreshes on its own when
          // the token is near expiry, which is what "automatic" should mean.
          return await current.getIdToken();
        } catch {
          return null;
        }
      },
    }),
    [user, loading, configured],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * A fetch that carries the signed-in user's identity.
 *
 * The one way the application should talk to its own API once accounts exist.
 * Signed out it simply omits the header, which every route already handles —
 * anonymous rendering is a supported state, not an error.
 *
 * A 401 triggers exactly one retry with a force-refreshed token. That covers
 * the real case (a token that expired between being read and being received)
 * without turning a genuinely rejected request into a retry loop.
 */
export function useAuthedFetch() {
  const { getToken, user } = useAuth();

  return useMemo(
    () =>
      async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
        const token = await getToken();
        const headers = new Headers(init.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);

        const res = await fetch(input, { ...init, headers });
        if (res.status !== 401 || !user) return res;

        const fresh = await user.getIdToken(true).catch(() => null);
        if (!fresh) return res;
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set("Authorization", `Bearer ${fresh}`);
        return fetch(input, { ...init, headers: retryHeaders });
      },
    [getToken, user],
  );
}
