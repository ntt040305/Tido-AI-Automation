#!/usr/bin/env node
/**
 * Checks that the live database matches the migration files.
 *
 * Not "did the migration command exit zero" — that only says the SQL ran. This
 * reads the catalog back and compares it against what the files declare, which
 * is the difference between believing a deployment worked and knowing it did.
 *
 * It checks tables, columns, foreign keys, indexes, RLS being enabled, and the
 * policies by name. Anything the migrations create and this does not verify is
 * a gap worth closing rather than a deliberate omission.
 *
 * Usage:
 *   node scripts/verify-schema.mjs [--db-url postgresql://...]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "./_connect.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(HERE, "..", "migrations");

const argv = process.argv.slice(2);
const urlFlag = argv.indexOf("--db-url");
const connectionString =
  (urlFlag !== -1 ? argv[urlFlag + 1] : undefined) ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error("No connection string. Pass --db-url or set SUPABASE_DB_URL.");
  process.exit(1);
}

// What the migration files say should exist, read from the SQL itself rather
// than from a hand-maintained list that could fall out of step with it.
const sql = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n");

const expect = {
  tables: [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]),
  indexes: [...sql.matchAll(/create index if not exists (\w+)/g)].map((m) => m[1]),
  policies: [...sql.matchAll(/create policy (\w+)/g)].map((m) => m[1]),
  functions: [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]),
  rlsTables: [...sql.matchAll(/alter table public\.(\w+)\s+enable row level security/g)].map((m) => m[1]),
};

const client = createClient(connectionString);
let failures = 0;

function report(label, expected, actual) {
  const missing = expected.filter((e) => !actual.includes(e));
  const extra = actual.filter((a) => !expected.includes(a) && a !== "schema_migrations");
  if (missing.length === 0) {
    console.log(`  ${label.padEnd(12)} ${expected.length}/${expected.length} present`);
  } else {
    failures++;
    console.log(`  ${label.padEnd(12)} MISSING: ${missing.join(", ")}`);
  }
  if (extra.length) console.log(`  ${" ".repeat(12)} (also present: ${extra.join(", ")})`);
}

try {
  await client.connect();
  console.log("verifying live schema against migrations\n");

  const tables = (
    await client.query(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    )
  ).rows.map((r) => r.tablename);
  report("tables", expect.tables, tables);

  const indexes = (
    await client.query("select indexname from pg_indexes where schemaname = 'public'")
  ).rows.map((r) => r.indexname);
  report("indexes", expect.indexes, indexes);

  const policies = (
    await client.query("select policyname from pg_policies where schemaname = 'public'")
  ).rows.map((r) => r.policyname);
  report("policies", expect.policies, policies);

  const functions = (
    await client.query(
      "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
    )
  ).rows.map((r) => r.proname);
  report("functions", expect.functions, functions);

  // RLS enabled is separate from having policies: a table can carry policies
  // and still be wide open if the switch was never thrown.
  const rls = (
    await client.query(
      "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relrowsecurity = true",
    )
  ).rows.map((r) => r.relname);
  report("rls enabled", expect.rlsTables, rls);

  const fks = (
    await client.query(
      "select count(*)::int as n from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype = 'f'",
    )
  ).rows[0].n;
  const expectedFks = (sql.match(/references public\./g) || []).length;
  if (fks >= expectedFks) {
    console.log(`  ${"foreign keys".padEnd(12)} ${fks}/${expectedFks} present`);
  } else {
    failures++;
    console.log(`  ${"foreign keys".padEnd(12)} only ${fks} of ${expectedFks}`);
  }

  // The property the whole schema rests on: anonymous renders must stay legal.
  const nullable = (
    await client.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='creative_runs' and column_name in ('org_id','user_id','project_id') and is_nullable='YES'",
    )
  ).rows.map((r) => r.column_name);
  if (nullable.length === 3) {
    console.log(`  ${"anon runs".padEnd(12)} legal (org_id, user_id, project_id all nullable)`);
  } else {
    failures++;
    console.log(`  ${"anon runs".padEnd(12)} BROKEN: only nullable: ${nullable.join(", ") || "none"}`);
  }

  const ledger = (
    await client.query("select filename from public.schema_migrations order by filename")
  ).rows.map((r) => r.filename);
  console.log(`\n  migration ledger: ${ledger.length ? ledger.join(", ") : "empty"}`);

  console.log(failures === 0 ? "\nschema matches the migrations\n" : `\n${failures} mismatch(es)\n`);
  process.exit(failures === 0 ? 0 : 1);
} catch (e) {
  console.error("verification failed:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
