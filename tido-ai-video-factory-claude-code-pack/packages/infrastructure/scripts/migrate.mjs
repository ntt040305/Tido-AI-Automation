#!/usr/bin/env node
/**
 * Applies the SQL in `migrations/` to a Postgres database, in order, once each.
 *
 * Why this exists rather than `supabase db push`
 * ----------------------------------------------
 * The CLI reads migrations from a `supabase/` project directory. These
 * migrations deliberately live inside `@tido/infrastructure`, next to the code
 * that depends on them, so that a package which owns the database owns its
 * schema too. Copying them into a second location to satisfy a tool would
 * create two sources of truth and guarantee they drift.
 *
 * So this runner reads them where they are. It is small on purpose: ordering,
 * a ledger, a transaction, and a report. Anything more is the CLI's job.
 *
 * What it guarantees
 * ------------------
 * EACH FILE RUNS ONCE. A `schema_migrations` ledger records every applied
 * filename with its checksum. Re-running is a no-op, which is what makes it
 * safe to run on every deploy.
 *
 * A CHANGED FILE IS AN ERROR, NOT A RE-RUN. If a migration's checksum differs
 * from what was recorded, the run stops. An edited migration means the
 * database and the repository disagree about history, and silently applying
 * the new version would leave environments permanently inconsistent.
 *
 * ALL OR NOTHING, PER FILE. Each migration runs inside a transaction with its
 * ledger row, so a failure half way through leaves no partial schema and no
 * false record of success.
 *
 * Usage:
 *   node scripts/migrate.mjs            # apply
 *   node scripts/migrate.mjs --dry-run  # report what would run
 *
 * Connection, in order of precedence:
 *   --db-url <url>  |  SUPABASE_DB_URL  |  DATABASE_URL
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "./_connect.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(HERE, "..", "migrations");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const urlFlag = argv.indexOf("--db-url");
const connectionString =
  (urlFlag !== -1 ? argv[urlFlag + 1] : undefined) ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    [
      "No database connection string.",
      "",
      "Supply one of:",
      "  node scripts/migrate.mjs --db-url postgresql://...",
      "  SUPABASE_DB_URL=postgresql://...  node scripts/migrate.mjs",
      "",
      "For Supabase, use the pooler URI from:",
      "  Project Settings -> Database -> Connection string -> URI",
    ].join("\n"),
  );
  process.exit(1);
}

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`No .sql files in ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const checksum = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

// Supabase terminates connections without TLS. `rejectUnauthorized: false`
// because the pooler presents a certificate for a different host than the one
// dialled; the transport is still encrypted.
const client = createClient(connectionString);

try {
  await client.connect();
  const who = await client.query("select current_database() as db, current_user as usr");
  console.log(`connected: ${who.rows[0].db} as ${who.rows[0].usr}\n`);

  // The ledger itself is created outside the per-file transactions, because
  // every one of them needs it to already exist.
  await client.query(`
    create table if not exists public.schema_migrations (
      filename    text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    );
  `);

  const applied = new Map(
    (await client.query("select filename, checksum from public.schema_migrations")).rows.map((r) => [
      r.filename,
      r.checksum,
    ]),
  );

  let ran = 0;
  for (const filename of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
    const sum = checksum(sql);
    const previous = applied.get(filename);

    if (previous) {
      if (previous !== sum) {
        console.error(
          `\n${filename} has changed since it was applied (recorded ${previous}, now ${sum}).`,
        );
        console.error(
          "Refusing to continue: the database and this repository disagree about history.",
        );
        console.error("Write a new migration rather than editing an applied one.");
        process.exit(1);
      }
      console.log(`  skip   ${filename}  (already applied)`);
      continue;
    }

    if (dryRun) {
      console.log(`  would apply  ${filename}  (${sql.length} chars)`);
      ran++;
      continue;
    }

    process.stdout.write(`  apply  ${filename} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into public.schema_migrations (filename, checksum) values ($1, $2)",
        [filename, sum],
      );
      await client.query("commit");
      console.log("ok");
      ran++;
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      console.error(`\n${filename} failed and was rolled back:\n  ${e.message}`);
      process.exit(1);
    }
  }

  console.log(
    `\n${dryRun ? "would apply" : "applied"} ${ran} of ${files.length} migration${files.length === 1 ? "" : "s"}`,
  );
} finally {
  await client.end().catch(() => {});
}
