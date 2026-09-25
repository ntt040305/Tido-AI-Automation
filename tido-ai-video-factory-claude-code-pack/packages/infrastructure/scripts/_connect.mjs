import dns from "dns";
import pg from "pg";

/**
 * How the migration tooling reaches Postgres.
 *
 * THE IPv6 PROBLEM, AND WHY THIS IS THE FIX
 * ------------------------------------------
 * Supabase serves direct database connections on IPv6 only -- `db.<ref>.
 * supabase.co` has an AAAA record and no A record. Node's default resolution
 * order (`verbatim` since v17, but effectively IPv4-first on some Windows
 * stacks) asks for an address it cannot get and reports `ENOTFOUND`, which
 * reads like a dead hostname rather than a family mismatch. The host is fine:
 * a `net.connect({ family: 6 })` to it succeeds immediately.
 *
 * `setDefaultResultOrder("ipv6first")` is therefore the whole fix, and it is
 * deliberately scoped to these scripts. The application runtime never opens a
 * Postgres socket -- it talks to PostgREST over HTTPS on IPv4 -- so changing
 * resolution order globally would alter behaviour for a path that has no need
 * of it.
 *
 * If a network genuinely has no IPv6 route, the answer is Supabase's pooler
 * (`aws-N-<region>.pooler.supabase.com`), which is dual-stack. Nothing here
 * needs to change for that: it is a different value in SUPABASE_DB_URL.
 */
dns.setDefaultResultOrder("ipv6first");

/** Resolves the connection string from a flag or the environment. */
export function connectionStringFrom(argv) {
  const i = argv.indexOf("--db-url");
  return (
    (i !== -1 ? argv[i + 1] : undefined) ||
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL
  );
}

/**
 * A client for the migration tools.
 *
 * `rejectUnauthorized: false` because the pooler presents a certificate for a
 * different host than the one dialled; the transport is still encrypted.
 */
export function createClient(connectionString) {
  return new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
}
