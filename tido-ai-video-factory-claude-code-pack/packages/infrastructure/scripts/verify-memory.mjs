#!/usr/bin/env node
/**
 * Proves the Phase 3.1 memory tables behave the way the learning rules assume.
 *
 * The properties checked here are not schema trivia. Each one is something the
 * application already depends on and cannot verify for itself:
 *
 *   - A duplicate approval is refused.   Without this, three clicks on one
 *     render clear the three-occurrence threshold and a preference starts
 *     steering renders on the strength of one picture.
 *   - An event cannot be rewritten.      The evidence the learning rules will
 *     be re-run against has to be the evidence that was recorded.
 *   - `lower(value)` is the merge key.   `recordPreference` matches case-
 *     insensitively; if the database disagreed, "Cinematic" and "cinematic"
 *     would each sit at one occurrence forever, present in the store and
 *     permanently unable to influence anything.
 *   - RLS isolates one person's memory.  A creative profile is the most
 *     identifying thing this system holds.
 *   - Deleting an account takes it all.  Erasure has to actually erase.
 *
 * Everything it creates is removed, including on failure.
 *
 * Usage:
 *   node scripts/verify-memory.mjs [--db-url postgresql://...]
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

const UID_A = "memory-probe-alice";
const UID_B = "memory-probe-bob";
const GEN_ID = "gen-memory-probe-0001";

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

/** True when the statement was refused. */
async function refused(sql, params = []) {
  try {
    await client.query(sql, params);
    return false;
  } catch {
    return true;
  }
}

try {
  await client.connect();
  console.log("Human feedback and user memory, against the live schema\n");

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

  // ── user_events ───────────────────────────────────────────────────────────
  console.log("Events");

  const first = await client.query(
    `insert into public.user_events (user_id, kind, engine_generation_id, context)
     values ($1,'download',$2,'{"surface":"result-panel"}'::jsonb) returning id, occurred_at, run_id`,
    [a, GEN_ID],
  );
  check("an approval is recorded", first.rows.length === 1);
  check("an event with no persisted run still lands", first.rows[0].run_id === null);

  const duplicate = await refused(
    `insert into public.user_events (user_id, kind, engine_generation_id)
     values ($1,'download',$2)`,
    [a, GEN_ID],
  );
  check("the same person downloading the same render twice is refused", duplicate);

  const otherKind = await client.query(
    `insert into public.user_events (user_id, kind, engine_generation_id)
     values ($1,'favorite',$2) returning id`,
    [a, GEN_ID],
  );
  check("a different kind of approval for the same render is allowed", otherKind.rows.length === 1);

  const otherPerson = await client.query(
    `insert into public.user_events (user_id, kind, engine_generation_id)
     values ($1,'download',$2) returning id`,
    [b, GEN_ID],
  );
  check("a different person downloading the same render is allowed", otherPerson.rows.length === 1);

  // Repetition is the signal for these two, so the rule must not apply.
  await client.query(
    `insert into public.user_events (user_id, kind, engine_generation_id) values ($1,'repeat_edit',$2)`,
    [a, GEN_ID],
  );
  const repeated = await client.query(
    `insert into public.user_events (user_id, kind, engine_generation_id) values ($1,'repeat_edit',$2) returning id`,
    [a, GEN_ID],
  );
  check("repeat_edit is exempt from the rule, because recurrence is its point", repeated.rows.length === 1);

  const rejection = await client.query(
    `insert into public.user_events (user_id, kind, engine_generation_id) values ($1,'reject',$2) returning id`,
    [a, GEN_ID],
  );
  check("a rejection is recordable — the external correction the audit found missing", rejection.rows.length === 1);

  check(
    "an unknown kind is refused by the database",
    await refused(`insert into public.user_events (user_id, kind) values ($1,'vibes')`, [a]),
  );
  check(
    "an unattributed event is refused: there is nobody for it to teach",
    await refused(`insert into public.user_events (user_id, kind) values (null,'download')`),
  );

  check(
    "a recorded event cannot be rewritten",
    await refused(`update public.user_events set kind = 'approve' where id = $1`, [first.rows[0].id]),
  );

  // ── user_creative_profiles and user_preferences ──────────────────────────
  console.log("\nProfile memory");

  await client.query(
    "insert into public.user_creative_profiles (user_id, observed_runs) values ($1, 4)",
    [a],
  );
  await client.query(
    `insert into public.user_preferences (user_id, area, value, stated, occurrences, negative)
     values ($1,'visual','Cinematic',false,3,false)`,
    [a],
  );

  const key = await client.query(
    "select value_key from public.user_preferences where user_id=$1 and value='Cinematic'",
    [a],
  );
  check("the merge key is lower(value), as recordPreference matches on", key.rows[0]?.value_key === "cinematic");

  check(
    "the same preference in different casing cannot land twice",
    await refused(
      `insert into public.user_preferences (user_id, area, value, occurrences) values ($1,'visual','CINEMATIC',1)`,
      [a],
    ),
  );

  const negative = await client.query(
    `insert into public.user_preferences (user_id, area, value, negative) values ($1,'visual','cinematic',true) returning id`,
    [a],
  );
  check("wanting a thing and avoiding it are two preferences, not one", negative.rows.length === 1);

  check(
    "an area outside the four the engine defines is refused",
    await refused(`insert into public.user_preferences (user_id, area, value) values ($1,'mood','warm')`, [a]),
  );
  check(
    "a preference with no profile is refused",
    await refused(`insert into public.user_preferences (user_id, area, value) values ($1,'visual','x')`, [b]),
  );

  // The property the whole threshold rests on, asked as the engine asks it.
  const qualified = await client.query(
    `select count(*)::int n from public.user_preferences
      where user_id = $1 and (stated = true or occurrences >= 3)`,
    [a],
  );
  check("the qualification predicate matches preferenceDecisions", qualified.rows[0].n === 1,
    `got ${qualified.rows[0].n}`);

  // ── isolation ─────────────────────────────────────────────────────────────
  console.log("\nIsolation");

  const ownEvents = await asUser(UID_A, "select count(*)::int n from public.user_events");
  check("a person sees their own events", ownEvents[0].n > 0, `saw ${ownEvents[0].n}`);

  const bobSeesAlice = await asUser(
    UID_B,
    "select count(*)::int n from public.user_events where user_id = $1",
    [a],
  );
  check("nobody sees another person's events", bobSeesAlice[0].n === 0, `saw ${bobSeesAlice[0].n}`);

  const bobSeesProfile = await asUser(
    UID_B,
    "select count(*)::int n from public.user_creative_profiles where user_id = $1",
    [a],
  );
  check("nobody sees another person's creative profile", bobSeesProfile[0].n === 0);

  const bobSeesPrefs = await asUser(
    UID_B,
    "select count(*)::int n from public.user_preferences where user_id = $1",
    [a],
  );
  check("nobody sees another person's preferences", bobSeesPrefs[0].n === 0);

  let forged = true;
  try {
    await asUser(UID_B, `insert into public.user_events (user_id, kind) values ($1,'approve')`, [b]);
  } catch {
    forged = false;
  }
  check("nobody can fabricate their own approval history", forged === false);

  // Not a throw. With no UPDATE policy the rows are simply invisible to the
  // statement, so Postgres reports success having changed nothing -- which is
  // the same protection wearing a quieter face, and worth asserting in the
  // form it actually takes rather than the form one might expect.
  const edited = await asUser(
    UID_A,
    `update public.user_preferences set occurrences = 99 where user_id = $1 returning id`,
    [a],
  );
  check(
    "nobody can hand themselves a preference the engine would act on",
    edited.length === 0,
    `${edited.length} row(s) were rewritten`,
  );

  const stillThree = await client.query(
    "select occurrences from public.user_preferences where user_id=$1 and value='Cinematic'",
    [a],
  );
  check("the occurrence count is what the evidence says, not what was asked for",
    stillThree.rows[0]?.occurrences === 3, `got ${stillThree.rows[0]?.occurrences}`);

  // ── erasure ───────────────────────────────────────────────────────────────
  console.log("\nErasure");

  await client.query("delete from public.user_profiles where id = $1", [a]);
  const left = await client.query(
    `select (select count(*)::int from public.user_events where user_id=$1) e,
            (select count(*)::int from public.user_creative_profiles where user_id=$1) p,
            (select count(*)::int from public.user_preferences where user_id=$1) f`,
    [a],
  );
  const l = left.rows[0];
  check("deleting an account erases their events, profile and preferences",
    l.e === 0 && l.p === 0 && l.f === 0, JSON.stringify(l));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("verification failed:", e.message);
  process.exitCode = 1;
} finally {
  try {
    await client.query("delete from public.user_profiles where firebase_uid = any($1)", [[UID_A, UID_B]]);
    const rest = await client.query(
      `select (select count(*)::int from public.user_events) e,
              (select count(*)::int from public.user_creative_profiles) p,
              (select count(*)::int from public.user_preferences) f`,
    );
    console.log(
      `cleanup: user_events=${rest.rows[0].e} profiles=${rest.rows[0].p} preferences=${rest.rows[0].f}`,
    );
  } catch (e) {
    console.error("CLEANUP FAILED — inspect the database:", e.message);
  }
  await client.end().catch(() => {});
}
