"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth";

/**
 * The browser half of Firebase.
 *
 * Deliberately separate from `@tido/infrastructure`, which holds the Admin
 * SDK. They are different SDKs solving different halves of the problem: the
 * admin one verifies tokens with a private key and must never reach a browser,
 * this one obtains tokens and must never reach a server. Sharing a module
 * between them would be the fastest way to leak the service account into a
 * client bundle.
 *
 * On the API key being public
 * ---------------------------
 * `NEXT_PUBLIC_FIREBASE_API_KEY` is meant to be visible. It identifies the
 * project and grants nothing by itself — every Firebase client ships it, and
 * access is decided by Firebase Auth rules and by Supabase RLS. Treating it as
 * a secret would mean hiding something that has to be in the bundle to work,
 * which buys nothing and encourages hiding things that genuinely matter.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

/** False when the browser config is absent. Callers show a real message. */
export function isAuthConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

/**
 * The Auth instance, or null when unconfigured.
 *
 * `getApps()` is checked first because Next's dev server re-evaluates modules
 * on edit and `initializeApp` throws on a duplicate name. Null rather than a
 * throw for the same reason everything else in this codebase degrades: a
 * missing key should mean "you cannot sign in", not a white screen.
 */
export function getFirebaseAuth(): Auth | null {
  if (!isAuthConfigured()) return null;
  if (authInstance) return authInstance;

  try {
    app = getApps().length ? getApp() : initializeApp(config);
    authInstance = getAuth(app);

    // "Remember me" as the default, which is what people expect from a tool
    // they return to daily. Local persistence survives a closed tab; the SDK
    // refreshes the ID token on its own roughly hourly, so a returning user is
    // signed in without a round trip we have to write.
    void setPersistence(authInstance, browserLocalPersistence).catch(() => {
      // A browser blocking storage (private mode, blocked cookies) falls back
      // to in-memory persistence by itself. Signing in still works; it just
      // does not outlive the tab, which is the correct behaviour there.
    });

    return authInstance;
  } catch (e) {
    console.error("[AUTH] Firebase failed to initialise:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * The current user's ID token, outside React.
 *
 * The service layer is plain functions, not hooks, so it cannot reach the
 * provider. This reads the SDK's own `currentUser`, which is the same source
 * the provider watches -- there is no second copy of the session to drift.
 *
 * Returns null when signed out, and that is an ordinary answer: every route in
 * this product still works without an account.
 */
export async function currentIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) return null;
  try {
    // Cached until close to expiry, refreshed silently when needed.
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Request headers carrying the signed-in identity, if there is one.
 *
 * Spread into a fetch's headers. Signed out it contributes nothing, so the
 * same call site works for both cases without branching.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await currentIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Firebase error codes, in language a person can act on.
 *
 * The raw codes leak implementation (`auth/invalid-credential`) and the raw
 * messages are worse ("Firebase: Error (auth/...)"). Anything unmapped falls
 * back to a plain sentence rather than the code, because a code a user cannot
 * act on is noise dressed as precision.
 *
 * Sign-in failures deliberately do not say whether the email exists. Firebase
 * itself returns `invalid-credential` for both wrong-password and no-such-user
 * when email enumeration protection is on, and the copy here matches that
 * rather than undoing it.
 */
export function authErrorMessage(code: string | undefined, fallback = "Đã có lỗi xảy ra. Vui lòng thử lại."): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email hoặc mật khẩu không đúng.";
    case "auth/email-already-in-use":
      return "Email này đã được đăng ký. Hãy đăng nhập.";
    case "auth/invalid-email":
      return "Email không hợp lệ.";
    case "auth/weak-password":
      return "Mật khẩu cần ít nhất 6 ký tự.";
    case "auth/too-many-requests":
      return "Quá nhiều lần thử. Vui lòng đợi một lát rồi thử lại.";
    case "auth/network-request-failed":
      return "Không kết nối được. Kiểm tra mạng rồi thử lại.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Cửa sổ đăng nhập đã đóng.";
    case "auth/user-disabled":
      return "Tài khoản này đã bị vô hiệu hóa.";
    default:
      return fallback;
  }
}
