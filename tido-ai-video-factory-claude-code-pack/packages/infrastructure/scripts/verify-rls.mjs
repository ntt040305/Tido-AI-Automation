#!/usr/bin/env node
/**
 * Proves Row Level Security actually isolates tenants.
 *
 * Why this is separate from the repository tests
 * ----------------------------------------------
 * The repository tests prove the *application* refuses a cross-tenant read.
 * That is the first line of defence and it works. This proves the *database*
 * would refuse it too, even if the application forgot to ask — which is the
 * entire reason for writing policies rather than trusting one layer.
 *
 * How it tests without needing a real Firebase token
 * --------------------------------------------------
 * PostgREST sets two things per request before touching a table: the role, and
 * `request.jwt.claims`. `auth.jwt()` reads the latter. Both can be set
 * directly on a session, so this reproduces exactly what a real request does
 * to the database, without needing the gateway or a live token in between.
 *
 * That is a faithful test of the policies. What it does NOT test is whether
 * Supabase will accept a Firebase token at the edge — that depends on
 * third-party auth being configured, is not a property of the database, and is
 * reported separately rather than faked here.
 *
 * Every row it creates is removed, including on failure.
 */

import { createClient } from "./_connect.mjs";

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

const client = createClient(connectionString);

const UID_A = "rls-probe-alice";
const UID_B = "rls-probe-bob";

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`);
  }
}

/** Runs a query as PostgREST would for a given Firebase uid. */
async function asUser(uid, sql, params = []) {
  await client.query("begin");
  try {
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const r = await client.query(sql, params);
    return r.rows;
  } finally {
    await client.query("rollback");
  }
}

try {
  await client.connect();
  console.log("Row Level Security, exercised against the live policies\n");

  // ── setup, as service role (bypasses RLS) ────────────────────────────────
  const a = (
    await client.query(
      "insert into public.user_profiles (firebase_uid, email) values ($1,$2) returning id",
      [UID_A, "alice@example.invalid"],
    )
  ).rows[0].id;
  const b = (
    await client.query(
      "insert into public.user_profiles (firebase_uid, email) values ($1,$2) returning id",
      [UID_B, "bob@example.invalid"],
    )
  ).rows[0].id;

  const orgA = (
    await client.query("insert into public.organizations (name) values ('Alice Co') returning id")
  ).rows[0].id;
  const orgB = (
    await client.query("insert into public.organizations (name) values ('Bob Co') returning id")
  ).rows[0].id;

  await client.query(
    "insert into public.workspace_members (org_id, user_id, role) values ($1,$2,'owner'), ($3,$4,'owner')",
    [orgA, a, orgB, b],
  );
  const projA = (
    await client.query(
      "insert into public.projects (org_id, created_by, name) values ($1,$2,'Alice project') returning id",
      [orgA, a],
    )
  ).rows[0].id;
  await client.query(
    "insert into public.projects (org_id, created_by, name) values ($1,$2,'Bob project')",
    [orgB, b],
  );
  await client.query(
    "insert into public.creative_runs (id, org_id, user_id, status, pipeline, success) values (gen_random_uuid(),$1,$2,'COMPLETED','stable',true)",
    [orgA, a],
  );
  // An orphan run: belongs to nobody, the shape an anonymous render produces.
  await client.query(
    "insert into public.creative_runs (id, status, pipeline, success) values (gen_random_uuid(),'COMPLETED','stable',true)",
  );

  console.log("Identity resolution");
  const resolved = await asUser(UID_A, "select public.current_profile_id() as id");
  check("A Firebase uid resolves to its own profile", resolved[0].id === a);
  const unknown = await asUser("nobody-at-all", "select public.current_profile_id() as id");
  check("An unknown uid resolves to nobody", unknown[0].id === null);

  console.log("\nProjects");
  const aProjects = await asUser(UID_A, "select id, name from public.projects");
  check("Alice sees exactly her own project", aProjects.length === 1 && aProjects[0].id === projA,
    `saw ${aProjects.length}`);
  const bProjects = await asUser(UID_B, "select id from public.projects");
  check("Bob sees exactly his own", bProjects.length === 1 && bProjects[0].id !== projA,
    `saw ${bProjects.length}`);
  const targeted = await asUser(UID_B, "select id from public.projects where id = $1", [projA]);
  check("Bob cannot read Alice's project even by id", targeted.length === 0);

  console.log("\nOrganizations and membership");
  const aOrgs = await asUser(UID_A, "select id from public.organizations");
  check("Alice sees only her workspace", aOrgs.length === 1 && aOrgs[0].id === orgA);
  const aMembers = await asUser(UID_A, "select org_id from public.workspace_members");
  check("Membership rows are scoped too", aMembers.length === 1 && aMembers[0].org_id === orgA);

  console.log("\nProfiles");
  const profiles = await asUser(UID_A, "select id from public.user_profiles");
  check("A person sees only their own profile", profiles.length === 1 && profiles[0].id === a,
    `saw ${profiles.length}`);

  console.log("\nCreative runs");
  const aRuns = await asUser(UID_A, "select id, org_id from public.creative_runs");
  check("Alice sees her org's run and nothing else", aRuns.length === 1);
  const bRuns = await asUser(UID_B, "select id from public.creative_runs");
  check("Bob sees none of Alice's runs", bRuns.length === 0, `saw ${bRuns.length}`);
  check("Anonymous runs belong to nobody and are invisible to everyone",
    aRuns.length === 1 && bRuns.length === 0);

  console.log("\nWrites");
  let wrote = true;
  try {
    await asUser(UID_B, "insert into public.projects (org_id, name) values ($1,'intrusion')", [orgA]);
  } catch {
    wrote = false;
  }
  check("Bob cannot create a project inside Alice's workspace", wrote === false);

  let forged = true;
  try {
    await asUser(UID_B, "insert into public.creative_runs (id,status,pipeline,success) values (gen_random_uuid(),'FAKE','stable',true)");
  } catch {
    forged = false;
  }
  check("Nobody can fabricate a creative run (no insert policy exists)", forged === false);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("verification failed:", e.message);
  process.exitCode = 1;
} finally {
  // Cleanup runs even on failure: this is a real database.
  try {
    await client.query(
      `delete from public.creative_runs where org_id in (
         select m.org_id from public.workspace_members m
           join public.user_profiles p on p.id = m.user_id
          where p.firebase_uid = any($1)
       ) or (org_id is null and user_id is null and status = 'COMPLETED' and concept is null)`,
      [[UID_A, UID_B]],
    );
    await client.query(
      `delete from public.projects where org_id in (
         select m.org_id from public.workspace_members m
           join public.user_profiles p on p.id = m.user_id
          where p.firebase_uid = any($1))`,
      [[UID_A, UID_B]],
    );
    await client.query(
      `delete from public.organizations where id in (
         select m.org_id from public.workspace_members m
           join public.user_profiles p on p.id = m.user_id
          where p.firebase_uid = any($1))`,
      [[UID_A, UID_B]],
    );
    await client.query(
      "delete from public.user_profiles where firebase_uid = any($1)",
      [[UID_A, UID_B]],
    );
    const left = await client.query(
      "select (select count(*)::int from public.user_profiles) p, (select count(*)::int from public.creative_runs) r",
    );
    console.log(`cleanup: profiles=${left.rows[0].p} runs=${left.rows[0].r}`);
  } catch (e) {
    console.error("CLEANUP FAILED — inspect the database:", e.message);
  }
  await client.end().catch(() => {});
}
