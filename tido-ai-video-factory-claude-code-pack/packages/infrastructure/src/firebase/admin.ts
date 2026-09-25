import type { App } from "firebase-admin/app";

/**
 * The Firebase Admin app, created once per process.
 *
 * Why lazy and why cached
 * -----------------------
 * Next dev reloads modules on edit, and `initializeApp` throws if it is called
 * twice for the same name. Caching on `globalThis` rather than in a module
 * variable survives that reload, which is the difference between a working dev
 * server and one that fails on the second save.
 *
 * Lazy because most requests to this application never authenticate anything.
 * Rendering works signed out and must keep working; loading the admin SDK on
 * import would make every anonymous render pay for a dependency it does not
 * use.
 *
 * Configuration
 * -------------
 * Credentials come from the environment. `FIREBASE_SERVICE_ACCOUNT_JSON`
 * (the whole service account, as JSON) is the explicit path; absent that, the
 * SDK's application default credentials are used, which is what runs on Google
 * infrastructure. Nothing here has a development fallback that fabricates an
 * identity -- a verifier that can be made to say yes without a real token is
 * not a verifier.
 */

let cached: App | null = null;

const GLOBAL_KEY = "__tido_firebase_admin__";

/**
 * The three-variable form of a service account.
 *
 * This is how Firebase credentials are usually carried in a deployment --
 * project id, client email, private key -- rather than as one blob of JSON.
 * Returns null when any part is missing, because two of the three is not a
 * usable credential.
 *
 * The private key is stored with literal backslash-n in most environments,
 * since a .env file cannot hold a real newline inside a value. It has to be
 * expanded before the SDK will parse the PEM.
 */
function splitServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !raw) return null;
  return {
    projectId,
    clientEmail,
    privateKey: raw.replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
  };
}

/**
 * Whether a COMPLETE credential is present.
 *
 * This used to return true on `FIREBASE_PROJECT_ID` alone, which was a real
 * bug rather than a loose check: a deployment carrying the ordinary
 * three-variable service account satisfied that test, then fell through to
 * `applicationDefault()` -- which has nothing to read outside Google
 * infrastructure -- and failed. The result was a system that reported itself
 * configured, logged one error at startup, and silently treated every signed-in
 * user as anonymous.
 *
 * So the check now requires enough to actually authenticate. Claiming to be
 * configured while being unable to verify a single token is worse than
 * admitting there are no credentials.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      splitServiceAccount(),
  );
}

/**
 * Returns the admin app, or null when Firebase is not configured.
 *
 * Null rather than a throw: an unconfigured environment should mean "nobody is
 * signed in", not "every request is a 500". The product renders for signed-out
 * visitors, and a missing key must degrade to exactly that.
 */
export async function getFirebaseApp(): Promise<App | null> {
  if (cached) return cached;

  const g = globalThis as unknown as Record<string, App | undefined>;
  if (g[GLOBAL_KEY]) {
    cached = g[GLOBAL_KEY]!;
    return cached;
  }

  if (!isFirebaseConfigured()) return null;

  try {
    const { initializeApp, getApps, getApp, cert, applicationDefault } = await import(
      "firebase-admin/app"
    );

    if (getApps().length > 0) {
      cached = getApp();
      g[GLOBAL_KEY] = cached;
      return cached;
    }

    // Three ways to be configured, in order of explicitness. The split form
    // is checked before application-default because a deployment that sets it
    // clearly means it, and falling through to ADC there is what produced the
    // silent-anonymous bug described above.
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const split = splitServiceAccount();
    const credential = raw
      ? cert(JSON.parse(raw))
      : split
        ? cert({
            projectId: split.projectId,
            clientEmail: split.clientEmail,
            privateKey: split.privateKey,
          })
        : applicationDefault();

    cached = initializeApp({
      credential,
      ...(process.env.FIREBASE_PROJECT_ID ? { projectId: process.env.FIREBASE_PROJECT_ID } : {}),
    });
    g[GLOBAL_KEY] = cached;
    return cached;
  } catch (e: any) {
    // A malformed service account is a configuration error, not a per-request
    // one. It is logged once and treated as "not configured" so the render
    // path stays up while someone fixes the key.
    console.error("[IDENTITY] Firebase Admin failed to initialise:", e?.message || String(e));
    return null;
  }
}
