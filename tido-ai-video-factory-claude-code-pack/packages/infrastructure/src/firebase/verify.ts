import type { VerifiedIdentity, IdentityProvider } from "@tido/shared";
import { getFirebaseApp, isFirebaseConfigured } from "./admin";

/**
 * Who is making this request.
 *
 * This is the only place in the application that decides identity, and it does
 * it in exactly one way: by handing a bearer token to Firebase and asking.
 *
 * Three rules it follows
 * ----------------------
 * NOTHING IS TRUSTED FROM THE CLIENT BUT THE TOKEN. A `userId` in a request
 * body, a UID in a header, an email in a query string -- none of these are
 * identity, they are claims anyone can type. The only accepted input is a
 * signed token, and the only thing that reads it is Firebase.
 *
 * FAILURE MEANS ANONYMOUS, NOT ERROR. A missing, expired, malformed or revoked
 * token all resolve to null. This product renders for signed-out visitors, so
 * "no identity" is an ordinary state the whole application already handles --
 * turning it into a 401 at this layer would break anonymous generation.
 *
 * REVOCATION IS CHECKED. `verifyIdToken(token, true)` costs a lookup but means
 * that disabling an account or revoking its sessions takes effect on the next
 * request rather than whenever the token happens to expire. For an identity
 * layer that is worth the round trip.
 */

/** Pulls a bearer token out of an Authorization header. */
export function bearerToken(header: string | null | undefined): string | null {
  const h = String(header || "").trim();
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

/**
 * Verifies a token. Returns null for every failure mode.
 *
 * Never throws: a caller on the render path must be able to ask "who is this"
 * without wrapping it, because an exception here would fail a generation that
 * does not need an account in the first place.
 */
export async function verifyToken(token: string | null | undefined): Promise<VerifiedIdentity | null> {
  if (!token) return null;

  const app = await getFirebaseApp();
  if (!app) return null;

  try {
    const { getAuth } = await import("firebase-admin/auth");
    // `true` -> also check whether the token has been revoked.
    const decoded = await getAuth(app).verifyIdToken(token, true);
    if (!decoded?.uid) return null;

    return {
      firebaseUid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      displayName: typeof decoded.name === "string" ? decoded.name : undefined,
      emailVerified: Boolean(decoded.email_verified),
    };
  } catch {
    // Expired, malformed, wrong project, revoked. All of these mean the same
    // thing to the caller and none of them is worth a log line containing a
    // token.
    return null;
  }
}

/**
 * The convenience the routes actually call.
 *
 * Takes the request rather than a token so no call site has to remember which
 * header carries it or how it is formatted.
 */
export async function identifyRequest(req: {
  headers: { get(name: string): string | null };
}): Promise<VerifiedIdentity | null> {
  return verifyToken(bearerToken(req.headers.get("authorization")));
}
