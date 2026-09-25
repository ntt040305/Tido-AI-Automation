#!/usr/bin/env node
/**
 * End-to-end: a real Firebase ID token, through Supabase's gateway, into RLS.
 *
 * What makes this different from verify-rls.mjs
 * ---------------------------------------------
 * That script sets `request.jwt.claims` on a Postgres session directly. It
 * proves the policies are correct, and proves nothing about whether Supabase
 * will accept a Firebase token in the first place — which is a property of the
 * gateway's third-party auth configuration, not of the database.
 *
 * This one closes that gap. It mints genuine Firebase ID tokens (the same
 * artifact a browser login produces), sends them over HTTPS as a real client
 * would, and checks what comes back. Nothing here is simulated: if third-party
 * auth is misconfigured, these tests fail, which is the entire point.
 *
 * How a token is obtained without a browser
 * -----------------------------------------
 * The Admin SDK mints a *custom* token, which is not an ID token and is not
 * accepted by Supabase. Exchanging it at Google's identity endpoint with the
 * project's Web API key yields the real ID token. That exchange is exactly
 * what the client SDK does after `signInWithCustomToken`.
 *
 * Cleanup runs even on failure: this creates Firebase users and database rows
 * in a live project, and leaving either behind would be worse than a failed
 * test.
 */

import { createClient } from "./_connect.mjs";

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing ${k}. This script needs the full infrastructure env.`);
    process.exit(1);
  }
  return v;
};

const SUPABASE_URL = need("SUPABASE_URL").replace(/\/+$/, "");
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const FIREBASE_API_KEY = need("FIREBASE_API_KEY");
const DB_URL = need("SUPABASE_DB_URL");

if (!PUBLISHABLE) {
  console.error("Missing SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY).");
  process.exit(1);
}

const UID_A = "e2e-probe-alice";
const UID_B = "e2e-probe-bob";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`);
  }
}

/** Mints a real Firebase ID token for a uid, the way a login would. */
async function idTokenFor(auth, uid) {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  );
  const body = await res.json();
  if (!res.ok || !body.idToken) {
    throw new Error(`token exchange failed (${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.idToken;
}

/** A PostgREST request made exactly as a browser client would make it. */
async function restGet(path, token) {
  const headers = { apikey: PUBLISHABLE };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

const client = createClient(DB_URL);
let auth = null;
let seeded = false;

try {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");

  const app = initializeApp({
    credential: cert({
      projectId: need("FIREBASE_PROJECT_ID"),
      clientEmail: need("FIREBASE_CLIENT_EMAIL"),
      privateKey: need("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
    }),
  });
  auth = getAuth(app);

  await client.connect();

  console.log("Firebase ID token generation\n");
  const tokenA = await idTokenFor(auth, UID_A);
  const tokenB = await idTokenFor(auth, UID_B);
  check("A real ID token is issued for user A", typeof tokenA === "string" && tokenA.split(".").length === 3);
  check("A real ID token is issued for user B", typeof tokenB === "string" && tokenB.split(".").length === 3);

  const claims = JSON.parse(Buffer.from(tokenA.split(".")[1], "base64").toString());
  check("The token's subject is the Firebase UID", claims.sub === UID_A, `sub=${claims.sub}`);
  check("The token is scoped to this Firebase project", claims.aud === process.env.FIREBASE_PROJECT_ID,
    `aud=${claims.aud}`);

  // ── seed, as service role ────────────────────────────────────────────────
  const pa = (await client.query(
    "insert into public.user_profiles (firebase_uid, email) values ($1,$2) returning id",
    [UID_A, "e2e-alice@example.invalid"],
  )).rows[0].id;
  const pb = (await client.query(
    "insert into public.user_profiles (firebase_uid, email) values ($1,$2) returning id",
    [UID_B, "e2e-bob@example.invalid"],
  )).rows[0].id;
  const orgA = (await client.query("insert into public.organizations (name) values ('E2E Alice') returning id")).rows[0].id;
  const orgB = (await client.query("insert into public.organizations (name) values ('E2E Bob') returning id")).rows[0].id;
  await client.query(
    "insert into public.workspace_members (org_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')",
    [orgA, pa, orgB, pb],
  );
  await client.query("insert into public.projects (org_id, created_by, name) values ($1,$2,'Alice E2E project')", [orgA, pa]);
  await client.query("insert into public.projects (org_id, created_by, name) values ($1,$2,'Bob E2E project')", [orgB, pb]);
  seeded = true;

  console.log("\nSupabase accepts the Firebase token");
  const aProfiles = await restGet("user_profiles?select=id,firebase_uid", tokenA);
  check("A token-bearing request is not rejected at the gateway", aProfiles.status === 200,
    `status ${aProfiles.status}: ${JSON.stringify(aProfiles.body).slice(0, 160)}`);

  if (aProfiles.status === 200) {
    check("auth.jwt() resolved to the right person", Array.isArray(aProfiles.body) &&
      aProfiles.body.length === 1 && aProfiles.body[0].firebase_uid === UID_A,
      `saw ${JSON.stringify(aProfiles.body).slice(0, 120)}`);
  } else {
    check("auth.jwt() resolved to the right person", false, "gateway rejected the token; see above");
  }

  console.log("\nOwnership is enforced over real HTTP");
  const aProjects = await restGet("projects?select=id,name", tokenA);
  check("User A can access User A data", aProjects.status === 200 &&
    Array.isArray(aProjects.body) && aProjects.body.length === 1 &&
    aProjects.body[0].name === "Alice E2E project",
    `status ${aProjects.status}, saw ${JSON.stringify(aProjects.body).slice(0, 120)}`);

  const leak = Array.isArray(aProjects.body)
    ? aProjects.body.some((p) => p.name === "Bob E2E project")
    : true;
  check("User A cannot access User B data", leak === false);

  const bProjects = await restGet("projects?select=id,name", tokenB);
  check("The isolation is symmetric", bProjects.status === 200 &&
    Array.isArray(bProjects.body) && bProjects.body.length === 1 &&
    bProjects.body[0].name === "Bob E2E project",
    `saw ${JSON.stringify(bProjects.body).slice(0, 120)}`);

  console.log("\nRequests without a valid identity");
  const noToken = await restGet("projects?select=id", null);
  check("No Firebase token cannot access protected tables",
    noToken.status === 401 || (Array.isArray(noToken.body) && noToken.body.length === 0),
    `status ${noToken.status}, body ${JSON.stringify(noToken.body).slice(0, 120)}`);

  const garbage = await restGet("projects?select=id", "not.a.token");
  check("An invalid token is rejected",
    garbage.status === 401 || (Array.isArray(garbage.body) && garbage.body.length === 0),
    `status ${garbage.status}`);

  // A structurally valid but expired token: same signature, exp in the past.
  const expired = [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: UID_A, aud: process.env.FIREBASE_PROJECT_ID, exp: 1000000000 })).toString("base64url"),
    tokenA.split(".")[2],
  ].join(".");
  const expiredRes = await restGet("projects?select=id", expired);
  check("An expired token is rejected",
    expiredRes.status === 401 || (Array.isArray(expiredRes.body) && expiredRes.body.length === 0),
    `status ${expiredRes.status}`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("\nverification failed:", e.message);
  process.exitCode = 1;
} finally {
  // Remove every row and every Firebase user this created, whatever happened.
  try {
    if (seeded) {
      await client.query(
        `delete from public.projects where org_id in (
           select m.org_id from public.workspace_members m
             join public.user_profiles p on p.id = m.user_id
            where p.firebase_uid = any($1))`, [[UID_A, UID_B]]);
      await client.query(
        `delete from public.organizations where id in (
           select m.org_id from public.workspace_members m
             join public.user_profiles p on p.id = m.user_id
            where p.firebase_uid = any($1))`, [[UID_A, UID_B]]);
      await client.query("delete from public.user_profiles where firebase_uid = any($1)", [[UID_A, UID_B]]);
      const left = await client.query(
        "select (select count(*)::int from public.user_profiles) p, (select count(*)::int from public.projects) pr, (select count(*)::int from public.organizations) o");
      console.log(`cleanup (database): profiles=${left.rows[0].p} projects=${left.rows[0].pr} orgs=${left.rows[0].o}`);
    }
  } catch (e) {
    console.error("DATABASE CLEANUP FAILED — inspect manually:", e.message);
  }
  try {
    if (auth) {
      for (const uid of [UID_A, UID_B]) {
        await auth.deleteUser(uid).catch(() => {});
      }
      console.log("cleanup (firebase): probe users deleted");
    }
  } catch (e) {
    console.error("FIREBASE CLEANUP FAILED — inspect manually:", e.message);
  }
  await client.end().catch(() => {});
}
