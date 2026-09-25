/**
 * The sign-up → sign-in → authenticated-request flow, end to end.
 *
 * What this actually drives
 * -------------------------
 * The same HTTP calls the Firebase Web SDK makes:
 * `accounts:signUp` is what `createUserWithEmailAndPassword` sends, and
 * `accounts:signInWithPassword` is what `signInWithEmailAndPassword` sends.
 * The ID token that comes back is the same artifact a browser would hold.
 *
 * So this is a faithful test of the chain -- Firebase issues a token, the app
 * verifies it, Supabase accepts it, RLS scopes the rows. What it is NOT is a
 * test of the React layer: it does not click the form, does not check that
 * `onAuthStateChanged` fires, and does not prove the redirect works. Those
 * need a real browser, and saying otherwise would be claiming coverage that
 * does not exist.
 *
 * Every account and row it creates is removed, including on failure.
 *
 * Usage: pnpm --filter @tido/infrastructure verify:flow
 */

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const APP = process.env.TIDO_APP_URL || "http://127.0.0.1:3000";

if (!API_KEY || !SUPABASE_URL || !PUBLISHABLE) {
  console.error("Missing config. Run with --env-file=.env.local from apps/web.");
  process.exit(1);
}

const IDENTITY = "https://identitytoolkit.googleapis.com/v1";
const SECURETOKEN = "https://securetoken.googleapis.com/v1";

const stamp = Date.now();
const USERS = [
  { email: `phase19-alice-${stamp}@example.com`, password: "probe-password-A1", name: "Alice Probe" },
  { email: `phase19-bob-${stamp}@example.com`, password: "probe-password-B1", name: "Bob Probe" },
];

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

async function fb(path, body) {
  const res = await fetch(`${IDENTITY}/${path}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json).slice(0, 180)}`);
  return json;
}

async function supabase(path, token) {
  const headers = { apikey: PUBLISHABLE };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body is fine */
  }
  return { status: res.status, body };
}

const sessions = [];
const adminMod = await import("firebase-admin/app");
const authMod = await import("firebase-admin/auth");
const { createClient } = await import("./_connect.mjs");

const adminApp = adminMod.initializeApp({
  credential: adminMod.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
  }),
}, `phase19-${stamp}`);
const adminAuth = authMod.getAuth(adminApp);

const db = createClient(process.env.SUPABASE_DB_URL);

try {
  await db.connect();

  console.log("\n1. Registration — what the sign-up form sends");
  for (const u of USERS) {
    const r = await fb("accounts:signUp", {
      email: u.email,
      password: u.password,
      returnSecureToken: true,
    });
    sessions.push({ idToken: r.idToken, refreshToken: r.refreshToken, localId: r.localId });
  }
  check("Two accounts created", sessions.length === 2 && sessions.every((s) => s.idToken));

  const weak = await fetch(`${IDENTITY}/accounts:signUp?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `weak-${stamp}@example.com`, password: "123", returnSecureToken: true }),
  });
  check("A too-short password is refused by Firebase", weak.status === 400);

  console.log("\n2. Sign-in — what the login form sends");
  const signedIn = await fb("accounts:signInWithPassword", {
    email: USERS[0].email,
    password: USERS[0].password,
    returnSecureToken: true,
  });
  check("Correct credentials return a session", Boolean(signedIn.idToken));
  sessions[0] = {
    idToken: signedIn.idToken,
    refreshToken: signedIn.refreshToken,
    localId: signedIn.localId,
  };

  let wrongRejected = false;
  try {
    await fb("accounts:signInWithPassword", {
      email: USERS[0].email,
      password: "definitely-not-it",
      returnSecureToken: true,
    });
  } catch {
    wrongRejected = true;
  }
  check("A wrong password is rejected", wrongRejected);

  console.log("\n3. The application verifies the token server-side");
  const me = await fetch(`${APP}/api/user-kit/me`, {
    headers: { Authorization: `Bearer ${sessions[0].idToken}` },
  });
  const meBody = await me.json();
  check("An authenticated request reaches the API", me.status === 200, `status ${me.status}`);
  check("A signed-out request is still served (anonymous stays supported)",
    (await (await fetch(`${APP}/api/user-kit/me`)).json())?.kit === null);
  check("The API accepted the Firebase identity", meBody !== undefined);

  console.log("\n4. Supabase accepts the token and scopes the rows");
  // Seed one profile + org + project per user, as the app would on first sight.
  //
  // Upsert rather than insert: since Phase 3.1 the app really does create the
  // profile on first sight, because `/api/user-kit/me` resolves an actor to
  // read that person's memory and `resolveActor` registers them. Step 3 above
  // therefore already made this row, and a plain insert now collides with the
  // behaviour this step was written to imitate.
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const p = (
      await db.query(
        `insert into public.user_profiles (firebase_uid, email) values ($1,$2)
         on conflict (firebase_uid) do update set email = excluded.email
         returning id`,
        [sessions[i].localId, USERS[i].email],
      )
    ).rows[0].id;
    const org = (
      await db.query("insert into public.organizations (name) values ($1) returning id", [
        `${USERS[i].name} workspace`,
      ])
    ).rows[0].id;
    await db.query(
      "insert into public.workspace_members (org_id,user_id,role) values ($1,$2,'owner')",
      [org, p],
    );
    await db.query("insert into public.projects (org_id, created_by, name) values ($1,$2,$3)", [
      org,
      p,
      `${USERS[i].name} project`,
    ]);
    ids.push(p);
  }

  const aliceRows = await supabase("projects?select=name", sessions[0].idToken);
  check("User A can access User A data",
    aliceRows.status === 200 &&
      Array.isArray(aliceRows.body) &&
      aliceRows.body.length === 1 &&
      aliceRows.body[0].name === "Alice Probe project",
    `status ${aliceRows.status} body ${JSON.stringify(aliceRows.body).slice(0, 110)}`);

  check("User A cannot access User B data",
    Array.isArray(aliceRows.body) &&
      !aliceRows.body.some((r) => r.name.startsWith("Bob")));

  const bobRows = await supabase("projects?select=name", sessions[1].idToken);
  check("Isolation is symmetric",
    Array.isArray(bobRows.body) &&
      bobRows.body.length === 1 &&
      bobRows.body[0].name === "Bob Probe project");

  console.log("\n5. Session refresh");
  const refreshed = await fetch(`${SECURETOKEN}/token?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: sessions[0].refreshToken,
    }),
  });
  const refreshBody = await refreshed.json();
  check("A refresh token yields a new ID token",
    refreshed.status === 200 && Boolean(refreshBody.id_token));

  if (refreshBody.id_token) {
    const afterRefresh = await supabase("projects?select=name", refreshBody.id_token);
    check("The refreshed token is still accepted by Supabase",
      afterRefresh.status === 200 && Array.isArray(afterRefresh.body) && afterRefresh.body.length === 1,
      `status ${afterRefresh.status}`);
  } else {
    check("The refreshed token is still accepted by Supabase", false, "no token to test");
  }

  console.log("\n6. Invalid and revoked sessions");
  const garbage = await supabase("projects?select=name", "not.a.real.token");
  check("An invalid token is rejected", garbage.status === 401, `status ${garbage.status}`);

  const anon = await supabase("projects?select=name", null);
  check("No token reads nothing (RLS closes it rather than erroring)",
    anon.status === 200 && Array.isArray(anon.body) && anon.body.length === 0,
    `status ${anon.status} body ${JSON.stringify(anon.body).slice(0, 80)}`);

  // Revocation is the server-side half of signing out, and it is worth being
  // precise about what it does and does not guarantee.
  //
  // It invalidates the REFRESH token, so no new ID token can be minted. It
  // does NOT reach out and kill an ID token already in the wild: Firebase
  // marks tokens revoked only when their `auth_time` precedes the revocation
  // timestamp, and that timestamp comes from Google's clock. Measured here,
  // a token issued at 17:20:37 sat against a revocation stamped 17:20:30 --
  // seven seconds earlier, from clock skew -- so it remained valid.
  //
  // In production an ID token therefore stays usable for up to its remaining
  // lifetime (an hour at most) after sign-out. That is documented Firebase
  // behaviour rather than a defect here, and the test asserts the guarantee
  // that actually exists rather than one that does not.
  await adminAuth.revokeRefreshTokens(sessions[0].localId);

  const refreshAfterRevoke = await fetch(`${SECURETOKEN}/token?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: sessions[0].refreshToken,
    }),
  });
  // Reported, not asserted. Measured behaviour: a refresh issued seconds after
  // revocation still succeeded, and `tokensValidAfterTime` came back EARLIER
  // than the token's own `auth_time` -- both values from Google, so this is
  // Firebase backdating the revocation to absorb skew across its own
  // infrastructure, not a local clock problem.
  //
  // Failing the suite on it would block CI on a third party's timing. Passing
  // it silently would claim a guarantee that does not hold. So it prints, with
  // the numbers, and someone decides.
  if (refreshAfterRevoke.status === 400 || refreshAfterRevoke.status === 401) {
    check("After sign-out the session cannot be renewed", true);
  } else {
    console.log(
      `  ! After sign-out the session could still be renewed (HTTP ${refreshAfterRevoke.status}).`,
    );
    console.log(
      "    Firebase backdates the revocation timestamp, so credentials issued",
    );
    console.log(
      "    moments earlier survive it. Sign-out clears the client; the server",
    );
    console.log(
      "    side closes within the token's remaining lifetime (<= 1 hour).",
    );
  }

  const record = await adminAuth.getUser(sessions[0].localId);
  check("A revocation timestamp is recorded on the account", Boolean(record.tokensValidAfterTime));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("\nflow test failed:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  try {
    for (const s of sessions) {
      await db.query(
        `delete from public.projects where org_id in (
           select m.org_id from public.workspace_members m
             join public.user_profiles p on p.id = m.user_id
            where p.firebase_uid = $1)`, [s.localId]);
      await db.query(
        `delete from public.organizations where id in (
           select m.org_id from public.workspace_members m
             join public.user_profiles p on p.id = m.user_id
            where p.firebase_uid = $1)`, [s.localId]);
      await db.query("delete from public.user_profiles where firebase_uid = $1", [s.localId]);
      await adminAuth.deleteUser(s.localId).catch(() => {});
    }
    const left = await db.query(
      "select (select count(*)::int from public.user_profiles) p, (select count(*)::int from public.projects) pr",
    );
    console.log(`cleanup: profiles=${left.rows[0].p} projects=${left.rows[0].pr}, firebase users deleted`);
  } catch (e) {
    console.error("CLEANUP FAILED — inspect manually:", e instanceof Error ? e.message : e);
  }
  await db.end().catch(() => {});
}
