import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbResult } from "@tido/shared";

/**
 * The connection to Supabase.
 *
 * Server only. This module reads `SUPABASE_SERVICE_ROLE_KEY`, which bypasses
 * Row Level Security completely, so importing it into anything that reaches a
 * browser bundle would hand every visitor unrestricted read and write on the
 * whole database. The guard below is not decorative -- it throws on import in
 * a browser rather than letting that mistake ship quietly.
 *
 * Why service role at all, given 0002 writes RLS policies
 * -------------------------------------------------------
 * Because some writes have no user. A render by a signed-out visitor still
 * produces a row, and no policy can authorise a request that carries no
 * identity. The server therefore holds the privileged key and the repository
 * layer supplies the tenancy that RLS cannot.
 *
 * That makes the two layers complementary rather than redundant: RLS protects
 * anything reached with a user's own token, and the repository protects
 * everything reached with this key. Neither is sufficient alone, and the
 * repository layer is written so that forgetting the scope is a type error
 * rather than a silent leak.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "lib/db/client is server-only: it holds the service role key, which bypasses RLS.",
  );
}

let cached: SupabaseClient | null = null;
const GLOBAL_KEY = "__tido_supabase__";

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Returns the client, or null when the database is not configured.
 *
 * Null rather than a throw, for the same reason the identity layer returns
 * null: this application rendered pictures for its whole life before it had a
 * database, and it must keep doing so when the database is unreachable. Every
 * repository below treats a null client as "persistence unavailable" and says
 * so, instead of failing the request that was only incidentally going to be
 * recorded.
 */
export async function getDb(): Promise<SupabaseClient | null> {
  if (cached) return cached;

  const g = globalThis as unknown as Record<string, SupabaseClient | undefined>;
  if (g[GLOBAL_KEY]) {
    cached = g[GLOBAL_KEY]!;
    return cached;
  }

  if (!isDatabaseConfigured()) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    cached = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          // There is no browser session here and nothing to refresh; this
          // client is a server process holding a static key.
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
    g[GLOBAL_KEY] = cached;
    return cached;
  } catch (e: any) {
    console.error("[DB] Supabase client failed to initialise:", e?.message || String(e));
    return null;
  }
}

export function unavailable<T>(): DbResult<T> {
  return { ok: false, error: "database not configured", unavailable: true };
}

/**
 * Turns whatever went wrong into a message a person can act on.
 *
 * The `String(e)` fallback alone was a real bug, not a rough edge. Supabase
 * reports failures as a `PostgrestError` — a plain object, not an `Error` —
 * so every database failure in this application rendered as the string
 * `[object Object]`. A caller logging that learns nothing: not which table,
 * not which constraint, not whether it was a permission problem or a missing
 * relation. It was found by making one real call against a live project and
 * reading the output, which is why probes are worth running against the real
 * thing rather than a mock.
 *
 * The Postgres error code is kept alongside the message because it is the part
 * that is stable enough to branch on — `42P01` (undefined table) and `42501`
 * (insufficient privilege) mean very different things to an operator.
 */
export function failed<T>(e: unknown): DbResult<T> {
  if (e instanceof Error) return { ok: false, error: e.message };

  if (e && typeof e === "object") {
    const err = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts = [
      typeof err.message === "string" ? err.message : null,
      typeof err.details === "string" && err.details ? `(${err.details})` : null,
      typeof err.hint === "string" && err.hint ? `hint: ${err.hint}` : null,
    ].filter(Boolean);
    if (parts.length) {
      const code = typeof err.code === "string" ? `[${err.code}] ` : "";
      return { ok: false, error: `${code}${parts.join(" ")}` };
    }
    // Nothing recognisable on it. JSON beats "[object Object]".
    try {
      return { ok: false, error: JSON.stringify(e) };
    } catch {
      /* fall through to String() */
    }
  }

  return { ok: false, error: String(e) };
}
