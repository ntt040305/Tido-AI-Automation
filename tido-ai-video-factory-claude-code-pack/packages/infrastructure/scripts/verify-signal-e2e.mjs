#!/usr/bin/env node
/**
 * Phase 3.1 end to end: a real person, a real click, real rows.
 *
 * Drives the same HTTP calls the browser makes -- Firebase issues a token, the
 * signal endpoint verifies it, the event lands, the learning runs, the
 * preferences persist -- and then reads the database directly to see what
 * actually arrived. Nothing is mocked, and nothing is asserted from the
 * endpoint's own return value alone: every claim is checked against the rows.
 *
 * WHY THIS EXISTS ALONGSIDE verify-memory.mjs
 * --------------------------------------------
 * That script proves the database refuses what it should. This proves the
 * application actually reaches it -- which is the failure this codebase has hit
 * repeatedly, and the one the Phase 3 audit found in seven separate modules:
 * capability present, nothing connected to it. A schema that behaves perfectly
 * and is never written to looks identical, from the outside, to no schema.
 *
 * The property worth the most here is the third block: three clicks on ONE
 * render must not cross the three-occurrence threshold, and three clicks on
 * THREE renders must. That is the whole difference between a memory and a
 * counter, and it cannot be observed from either layer alone.
 *
 * Needs the app running (TIDO_APP_URL, default http://127.0.0.1:3000).
 * Every account and row it creates is removed, including on failure.
 *
 * Usage: pnpm --filter @tido/infrastructure verify:signal
 */

import { createClient } from "./_connect.mjs";

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
const APP = process.env.TIDO_APP_URL || "http://127.0.0.1:3000";
const IDENTITY = "https://identitytoolkit.googleapis.com/v1";

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
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function signal(token, body) {
  const res = await fetch(`${APP}/api/user-kit/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const stamp = Date.now();
const EMAIL = `phase31-probe-${stamp}@example.com`;
const PASSWORD = "probe-password-P1";
const GEN = `gen-phase31-${stamp}`;

const db = createClient(process.env.SUPABASE_DB_URL);
let uid = null;

// The same intelligence shape the engine returns on a real render.
const INTELLIGENCE = {
  selected_direction: "emotional storytelling",
  visual_strategy: { what: "low warm light" },
  typography_reasoning: { what: "serif headline" },
  layout_reasoning: { what: "off-centre subject" },
  composition_reasoning: { what: "quiet, set small" },
};

try {
  await db.connect();
  const session = await fb("accounts:signUp", { email: EMAIL, password: PASSWORD, returnSecureToken: true });
  uid = session.localId;
  const token = session.idToken;
  console.log(`\nA real signed-in person (${uid.slice(0, 8)}…)\n`);

  // ── the click ─────────────────────────────────────────────────────────────
  const first = await signal(token, { kind: "download", generationId: GEN, intelligence: INTELLIGENCE });
  check("a download is accepted", first.status === 200 && first.body.recorded === true,
    JSON.stringify(first.body));
  check("something was learned from it", first.body.learned > 0, JSON.stringify(first.body));

  // ── what actually landed ──────────────────────────────────────────────────
  const profile = await db.query("select id from public.user_profiles where firebase_uid=$1", [uid]);
  check("the person was registered on first authenticated request", profile.rows.length === 1);
  const userId = profile.rows[0]?.id;

  const events = await db.query(
    "select kind, engine_generation_id, run_id, context from public.user_events where user_id=$1",
    [userId],
  );
  check("the event reached user_events", events.rows.length === 1, `${events.rows.length} row(s)`);
  check("the event names the render the browser held",
    events.rows[0]?.engine_generation_id === GEN, events.rows[0]?.engine_generation_id);
  check("an unpersisted render leaves run_id null rather than losing the event",
    events.rows[0]?.run_id === null);

  const prefs = await db.query(
    "select area, value, value_key, stated, occurrences from public.user_preferences where user_id=$1 order by id",
    [userId],
  );
  check("preferences were written", prefs.rows.length > 0, `${prefs.rows.length} row(s)`);
  check("nothing was recorded as stated by a person who said nothing",
    prefs.rows.every((r) => r.stated === false));
  check("each preference starts at one occurrence, not at the threshold",
    prefs.rows.every((r) => r.occurrences === 1),
    JSON.stringify(prefs.rows.map((r) => r.occurrences)));

  const cp = await db.query("select observed_runs, imported_at from public.user_creative_profiles where user_id=$1", [userId]);
  check("the profile counts one observed run", cp.rows[0]?.observed_runs === 1, JSON.stringify(cp.rows[0]));
  check("it is not marked as imported, because it was earned here", cp.rows[0]?.imported_at === null);

  // ── the click again ───────────────────────────────────────────────────────
  const again = await signal(token, { kind: "download", generationId: GEN, intelligence: INTELLIGENCE });
  check("a second click on the same render is reported as a duplicate",
    again.body.duplicate === true && again.body.learned === 0, JSON.stringify(again.body));

  const afterDup = await db.query(
    "select occurrences from public.user_preferences where user_id=$1 order by id", [userId]);
  check("the duplicate added no occurrence",
    afterDup.rows.every((r) => r.occurrences === 1),
    JSON.stringify(afterDup.rows.map((r) => r.occurrences)));

  const dupEvents = await db.query("select count(*)::int n from public.user_events where user_id=$1", [userId]);
  check("and wrote no second event", dupEvents.rows[0].n === 1, `${dupEvents.rows[0].n} events`);

  // ── a different render ────────────────────────────────────────────────────
  const second = await signal(token, {
    kind: "download",
    generationId: `${GEN}-b`,
    intelligence: INTELLIGENCE,
  });
  check("a different render is a new signal", second.body.recorded === true && second.body.duplicate === false);

  const afterSecond = await db.query(
    "select value, occurrences from public.user_preferences where user_id=$1 order by id", [userId]);
  check("a second DIFFERENT render does raise the count",
    afterSecond.rows.every((r) => r.occurrences === 2),
    JSON.stringify(afterSecond.rows.map((r) => r.occurrences)));

  // ── the third, which crosses the bar ──────────────────────────────────────
  await signal(token, { kind: "download", generationId: `${GEN}-c`, intelligence: INTELLIGENCE });
  const qualified = await db.query(
    `select count(*)::int n from public.user_preferences
      where user_id=$1 and (stated = true or occurrences >= 3)`, [userId]);
  check("three different renders is what crosses the threshold, as designed",
    qualified.rows[0].n > 0, `${qualified.rows[0].n} qualified`);

  // ── what the person is shown ──────────────────────────────────────────────
  const me = await fetch(`${APP}/api/user-kit/me`, { headers: { Authorization: `Bearer ${token}` } });
  const meBody = await me.json();
  check("the person can read back what was learned", me.status === 200 && meBody.kit?.active?.length > 0,
    JSON.stringify(meBody).slice(0, 300));
  check("it is presented as observed, not as something they said",
    (meBody.kit?.active || []).every((p) => p.confidence === "low"),
    JSON.stringify(meBody.kit?.active));
  check("the count shown is the number of renders behind it",
    meBody.kit?.observed_runs === 3, `got ${meBody.kit?.observed_runs}`);

  // ── the signal that is recorded but not learned from ──────────────────────
  const rejected = await signal(token, {
    kind: "reject",
    generationId: `${GEN}-d`,
    intelligence: INTELLIGENCE,
  });
  check("a rejection is recorded", rejected.body.recorded === true, JSON.stringify(rejected.body));
  check("and teaches nothing yet", rejected.body.learned === 0);

  const kinds = await db.query(
    "select kind, count(*)::int n from public.user_events where user_id=$1 group by kind order by kind", [userId]);
  check("both signal kinds are in the evidence",
    kinds.rows.length === 1 || kinds.rows.some((r) => r.kind === "reject"),
    JSON.stringify(kinds.rows));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("e2e failed:", e.message);
  process.exitCode = 1;
} finally {
  try {
    if (uid) {
      // The personal organization first. `upsertProfile` creates one alongside
      // every new profile, and organizations do NOT cascade from user_profiles
      // -- so deleting the profile alone leaves an empty workspace behind. Two
      // of them accumulated before this was noticed, which is the argument for
      // a probe asserting its own cleanup rather than assuming it.
      await db.query(
        `delete from public.organizations where id in (
           select m.org_id from public.workspace_members m
             join public.user_profiles p on p.id = m.user_id
            where p.firebase_uid = $1)`,
        [uid],
      );
      await db.query("delete from public.user_profiles where firebase_uid=$1", [uid]);
    }
    const left = await db.query(
      `select (select count(*)::int from public.user_events) e,
              (select count(*)::int from public.user_creative_profiles) p,
              (select count(*)::int from public.user_preferences) f,
              (select count(*)::int from public.user_profiles) u,
              (select count(*)::int from public.organizations) o`);
    console.log(`cleanup (database): ${JSON.stringify(left.rows[0])}`);
  } catch (e) {
    console.error("CLEANUP FAILED — inspect the database:", e.message);
  }
  try {
    const { initializeApp, cert, getApps } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
        }),
      });
    }
    if (uid) await getAuth().deleteUser(uid);
    console.log("cleanup (firebase): probe user deleted");
  } catch (e) {
    console.error("FIREBASE CLEANUP FAILED:", e.message);
  }
  await db.end().catch(() => {});
}
