import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client that carries the caller's own identity.
 *
 * Why this exists alongside the service-role client
 * -------------------------------------------------
 * `client.ts` holds the service-role key, which bypasses Row Level Security
 * completely. Everything the application has done so far goes through it, so
 * the RLS policies in `0002` have — correctly — protected nothing yet: they
 * only apply to connections that arrive as `anon` or `authenticated`.
 *
 * That was fine while tenancy rested on the repository layer, which authorises
 * before it queries. But one layer is one mistake away from a leak, and the
 * whole point of writing the policies was to have a second. This client is how
 * a request reaches Postgres *as the user*, so those policies finally apply.
 *
 * How the token gets there
 * ------------------------
 * Supabase's gateway needs two things: an `apikey` identifying the project,
 * and an `Authorization` bearer token identifying the person. The apikey is
 * the publishable/anon key — safe to hold, grants nothing on its own, since
 * `anon` does not bypass RLS. The bearer token is the user's Firebase ID
 * token, which Supabase validates itself once Firebase is registered as a
 * third-party auth provider.
 *
 * The raw token is passed as an argument and never stored on
 * `VerifiedIdentity`. That is deliberate: `VerifiedIdentity` gets logged,
 * returned and passed around, and a credential riding along inside it would
 * eventually end up somewhere it should not be. The claims travel widely; the
 * token does not.
 */

if (typeof window !== "undefined") {
  throw new Error("lib/db user-client is server-only.");
}

/**
 * The project key sent as `apikey`.
 *
 * Accepts either naming: new projects issue `sb_publishable_…`, older ones a
 * JWT-shaped anon key. Both identify the project without granting anything.
 */
function publishableKey(): string | undefined {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

/**
 * True when a user-scoped request is possible at all.
 *
 * False means RLS cannot be exercised, because there is no key to present at
 * the gateway. Callers fall back to the service-role path, where the
 * repository layer is the only thing enforcing tenancy.
 */
export function isUserScopedDbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && publishableKey());
}

/**
 * Builds a client that speaks for one person.
 *
 * Returns null rather than throwing when unconfigured or when no token was
 * supplied — the same degradation rule the rest of this package follows, so a
 * caller can ask for a user-scoped client and quietly get nothing.
 *
 * NOT cached. The service-role client is a singleton because it is the same
 * for everyone; this one is per-request by definition, and caching it keyed on
 * anything would be a way to hand one person's session to another.
 */
export async function getUserScopedDb(accessToken: string | null | undefined): Promise<SupabaseClient | null> {
  const token = String(accessToken || "").trim();
  if (!token) return null;

  const key = publishableKey();
  const url = process.env.SUPABASE_URL;
  if (!url || !key) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(url, key, {
      auth: {
        // No session to persist and nothing to refresh: the token came from
        // Firebase and this client lives for one request.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        // The header that makes RLS apply. Without it the request arrives as
        // `anon`, every policy denies, and the caller sees an empty result
        // rather than an error — which is why the absence of this header is a
        // silent failure worth naming here.
        headers: { Authorization: `Bearer ${token}` },
      },
    });
  } catch (e) {
    console.error(
      "[DB] user-scoped client failed to initialise:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

/**
 * What is missing before RLS can be exercised, in plain terms.
 *
 * Returned as data rather than logged so a health endpoint or a startup check
 * can report it. An empty array means a user-scoped request is possible.
 */
export function userScopedDbRequirements(): string[] {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!publishableKey()) {
    missing.push("SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)");
  }
  return missing;
}
