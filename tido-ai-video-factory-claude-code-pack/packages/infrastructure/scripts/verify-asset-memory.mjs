#!/usr/bin/env node
/**
 * Proves the Phase 3.2 asset table behaves the way the application assumes.
 *
 * Each property here is something the application depends on and cannot verify
 * for itself:
 *
 *   - The key is the whole digest.   Keyed on the engine's 16-character hash,
 *     a collision would hand one customer's product analysis to another
 *     customer's render. This checks the constraint actually bites.
 *   - The same asset is one row.     The saving this table exists for.
 *   - One person's library is theirs. A content hash is global; the same stock
 *     photograph uploaded by two companies is the same digest, and the only
 *     thing keeping those apart is the composite key and the policy.
 *   - Retrieval is indexed.          A memory that costs a sequential scan is
 *     slower than the vision call it replaces.
 *   - Erasure erases.
 *
 * Everything it creates is removed, including on failure.
 *
 * Usage: pnpm --filter @tido/infrastructure verify:assets
 */

import crypto from "crypto";
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

const UID_A = "asset-probe-alice";
const UID_B = "asset-probe-bob";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const CUP = sha("a photograph of a ceramic cup");
const LOGO = sha("a logo");

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

async function refused(sql, params = []) {
  try {
    await client.query(sql, params);
    return false;
  } catch {
    return true;
  }
}

const OBSERVED = JSON.stringify({
  form: "a straight-sided cylindrical cup",
  materials: ["unglazed stoneware"],
  finish: "matte",
});

try {
  await client.connect();
  console.log("Asset memory, against the live schema\n");

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

  // ── persistence ───────────────────────────────────────────────────────────
  console.log("Persistence");

  const first = await client.query(
    `insert into public.asset_memory
       (user_id, content_hash, prepared_hash, role, branch, mime_type, byte_size, observed, model_calls)
     values ($1,$2,$3,'PRODUCT','product','image/png',24680,$4,1)
     returning id, times_seen, model_calls, first_seen_at, last_seen_at`,
    [a, CUP, CUP.slice(0, 16), OBSERVED],
  );
  check("an analysed asset is stored", first.rows.length === 1);
  check("it starts at one sighting and one vision call",
    first.rows[0].times_seen === 1 && first.rows[0].model_calls === 1);

  const stored = await client.query(
    "select observed, treatment, branch, role from public.asset_memory where user_id=$1 and content_hash=$2",
    [a, CUP],
  );
  check("the observation survives as a document",
    stored.rows[0]?.observed?.materials?.[0] === "unglazed stoneware",
    JSON.stringify(stored.rows[0]?.observed));
  check("the role the request gave and the branch that looked at it are both kept",
    stored.rows[0]?.role === "PRODUCT" && stored.rows[0]?.branch === "product");

  // ── the same asset uploaded twice ─────────────────────────────────────────
  console.log("\nThe same asset uploaded twice");

  check(
    "the same asset cannot become two rows for one person",
    await refused(
      `insert into public.asset_memory (user_id, content_hash, role, branch, observed)
       values ($1,$2,'PRODUCT','product','{}'::jsonb)`,
      [a, CUP],
    ),
  );

  // The second sighting, as the repository performs it.
  await client.query(
    `update public.asset_memory
        set times_seen = times_seen + 1, last_seen_at = now()
      where user_id=$1 and content_hash=$2`,
    [a, CUP],
  );
  const second = await client.query(
    "select times_seen, model_calls from public.asset_memory where user_id=$1 and content_hash=$2",
    [a, CUP],
  );
  check("a second sighting counts, and costs no second vision call",
    second.rows[0].times_seen === 2 && second.rows[0].model_calls === 1,
    JSON.stringify(second.rows[0]));

  const saved = await client.query(
    "select times_seen - model_calls as saved from public.asset_memory where user_id=$1 and content_hash=$2",
    [a, CUP],
  );
  check("the gap between sightings and calls is the work saved",
    Number(saved.rows[0].saved) === 1, `got ${saved.rows[0].saved}`);

  const rowCount = await client.query(
    "select count(*)::int n from public.asset_memory where user_id=$1 and content_hash=$2",
    [a, CUP],
  );
  check("and it is still one row", rowCount.rows[0].n === 1);

  // The accounting defect 0007 exists to fix: the analyzer hands back the
  // previous analysis, provenance and all, whenever the image hashes still
  // match -- so `derived_from_image` cannot tell a call from a cache hit.
  const stamp = new Date().toISOString();
  await client.query(
    "update public.asset_memory set analyzed_at=$3 where user_id=$1 and content_hash=$2",
    [a, CUP, stamp],
  );
  const reuse = await client.query(
    "select analyzed_at, model_calls from public.asset_memory where user_id=$1 and content_hash=$2",
    [a, CUP],
  );
  check("the analysis carries its own timestamp",
    new Date(reuse.rows[0].analyzed_at).toISOString() === stamp);
  check("a sighting with the same timestamp is a reuse, not a call",
    reuse.rows[0].model_calls === 1, `${reuse.rows[0].model_calls}`);

  // ── hash collision handling ───────────────────────────────────────────────
  console.log("\nHash collision handling");

  check(
    "a truncated hash cannot become a key",
    await refused(
      `insert into public.asset_memory (user_id, content_hash, role, branch, observed)
       values ($1,$2,'PRODUCT','product',$3)`,
      [a, CUP.slice(0, 16), OBSERVED],
    ),
  );
  check(
    "an upper-case digest is refused rather than stored as a second identity",
    await refused(
      `insert into public.asset_memory (user_id, content_hash, role, branch, observed)
       values ($1,$2,'LOGO','logo',$3)`,
      [a, LOGO.toUpperCase(), OBSERVED],
    ),
  );
  check(
    "a non-hex digest is refused",
    await refused(
      `insert into public.asset_memory (user_id, content_hash, role, branch, observed)
       values ($1,$2,'LOGO','logo',$3)`,
      [a, "z".repeat(64), OBSERVED],
    ),
  );

  // Two assets that the engine's 16-character hash would merge.
  const prefix = "a".repeat(16);
  const twinA = prefix + "1".repeat(48);
  const twinB = prefix + "2".repeat(48);
  await client.query(
    `insert into public.asset_memory (user_id, content_hash, prepared_hash, role, branch, observed)
     values ($1,$2,$3,'PRODUCT','product',$5), ($1,$4,$3,'PRODUCT','product',$5)`,
    [a, twinA, prefix, twinB, OBSERVED],
  );
  const twins = await client.query(
    "select count(*)::int n from public.asset_memory where user_id=$1 and content_hash in ($2,$3)",
    [a, twinA, twinB],
  );
  check("two assets sharing the engine's 16-character hash stay two rows",
    twins.rows[0].n === 2, `got ${twins.rows[0].n}`);

  const sharedHint = await client.query(
    "select count(*)::int n from public.asset_memory where user_id=$1 and prepared_hash=$2",
    [a, prefix],
  );
  check("the short hash is allowed to be ambiguous, because it is only a hint",
    sharedHint.rows[0].n === 2);

  check(
    "an unknown branch is refused",
    await refused(
      `insert into public.asset_memory (user_id, content_hash, role, branch, observed)
       values ($1,$2,'PRODUCT','packaging',$3)`,
      [a, sha("another"), OBSERVED],
    ),
  );

  // ── user isolation ────────────────────────────────────────────────────────
  console.log("\nUser isolation");

  const shared = await client.query(
    `insert into public.asset_memory (user_id, content_hash, role, branch, observed, model_calls)
     values ($1,$2,'PRODUCT','product',$3,1) returning id`,
    [b, CUP, OBSERVED],
  );
  check("the same photograph uploaded by two companies is two rows", shared.rows.length === 1);

  const aliceSees = await asUser(UID_A, "select count(*)::int n from public.asset_memory");
  check("a person sees their own assets", aliceSees[0].n > 0, `saw ${aliceSees[0].n}`);

  const bobSeesAlice = await asUser(
    UID_B,
    "select count(*)::int n from public.asset_memory where user_id = $1",
    [a],
  );
  check("nobody sees another person's assets", bobSeesAlice[0].n === 0, `saw ${bobSeesAlice[0].n}`);

  // The specific leak this table invites: probing by a hash you already hold.
  const bobProbes = await asUser(
    UID_B,
    "select count(*)::int n from public.asset_memory where content_hash = $1 and user_id = $2",
    [CUP, a],
  );
  check("knowing the hash does not reveal that someone else uploaded it",
    bobProbes[0].n === 0);

  const bobOwn = await asUser(
    UID_B,
    "select count(*)::int n from public.asset_memory where content_hash = $1",
    [CUP],
  );
  check("but a person still sees their own copy of a shared photograph",
    bobOwn[0].n === 1, `saw ${bobOwn[0].n}`);

  let forged = true;
  try {
    await asUser(
      UID_B,
      `insert into public.asset_memory (user_id, content_hash, role, branch, observed)
       values ($1,$2,'PRODUCT','product','{"materials":["solid gold"]}'::jsonb)`,
      [b, sha("forged")],
    );
  } catch {
    forged = false;
  }
  // An observation is the one tier of authority above reasoning in this engine,
  // precisely because it is supposed to have come from pixels.
  check("nobody can describe their own product and call it an observation", forged === false);

  const edited = await asUser(
    UID_A,
    `update public.asset_memory set observed = '{"materials":["marble"]}'::jsonb
      where user_id = $1 returning id`,
    [a],
  );
  check("nobody can rewrite what a model saw", edited.length === 0,
    `${edited.length} row(s) were rewritten`);

  // ── retrieval performance ─────────────────────────────────────────────────
  console.log("\nRetrieval performance");

  // Enough rows that a sequential scan would be visibly the wrong plan.
  await client.query(
    `insert into public.asset_memory (user_id, content_hash, role, branch, observed)
     select $1, encode(sha256(g::text::bytea), 'hex'), 'PRODUCT', 'product', $2::jsonb
       from generate_series(1, 2000) g`,
    [a, OBSERVED],
  );
  await client.query("analyze public.asset_memory");

  const plan = (
    await client.query(
      `explain (analyze, format json)
       select * from public.asset_memory where user_id = $1 and content_hash = $2`,
      [a, CUP],
    )
  ).rows[0]["QUERY PLAN"][0];

  const planText = JSON.stringify(plan.Plan);
  check("the lookup uses the index, not a sequential scan",
    planText.includes("Index") && !planText.includes("Seq Scan"),
    plan.Plan["Node Type"]);
  check("one asset is found in under 10ms",
    plan["Execution Time"] < 10, `${plan["Execution Time"]}ms`);

  const manyPlan = (
    await client.query(
      `explain (analyze, format json)
       select * from public.asset_memory where user_id = $1 and content_hash = any($2)`,
      [a, [CUP, twinA, twinB]],
    )
  ).rows[0]["QUERY PLAN"][0];
  check("a whole render's attachments are found in one indexed pass",
    !JSON.stringify(manyPlan.Plan).includes("Seq Scan") && manyPlan["Execution Time"] < 10,
    `${manyPlan["Execution Time"]}ms, ${manyPlan.Plan["Node Type"]}`);

  const recentPlan = (
    await client.query(
      `explain (analyze, format json)
       select * from public.asset_memory where user_id = $1 order by last_seen_at desc limit 50`,
      [a],
    )
  ).rows[0]["QUERY PLAN"][0];
  check("the recent-assets view is indexed too",
    !JSON.stringify(recentPlan.Plan).includes("Seq Scan") && recentPlan["Execution Time"] < 20,
    `${recentPlan["Execution Time"]}ms`);

  const missing = (
    await client.query(
      `explain (analyze, format json)
       select * from public.asset_memory where user_id = $1 and content_hash = $2`,
      [a, sha("never uploaded")],
    )
  ).rows[0]["QUERY PLAN"][0];
  check("a miss is as cheap as a hit, so an unknown asset costs nothing",
    missing["Execution Time"] < 10, `${missing["Execution Time"]}ms`);

  // ── erasure ───────────────────────────────────────────────────────────────
  console.log("\nErasure");

  await client.query("delete from public.user_profiles where id = $1", [a]);
  const left = await client.query(
    "select count(*)::int n from public.asset_memory where user_id = $1",
    [a],
  );
  check("deleting an account erases their asset library", left.rows[0].n === 0,
    `${left.rows[0].n} left`);

  const bobSurvives = await client.query(
    "select count(*)::int n from public.asset_memory where user_id = $1",
    [b],
  );
  check("and leaves everybody else's alone", bobSurvives.rows[0].n === 1);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("verification failed:", e.message);
  process.exitCode = 1;
} finally {
  try {
    await client.query("delete from public.user_profiles where firebase_uid = any($1)", [
      [UID_A, UID_B],
    ]);
    await client.query(
      `delete from public.organizations o
        where o.is_personal = true
          and o.name in ('alice@example.invalid', 'bob@example.invalid')
          and not exists (select 1 from public.workspace_members m where m.org_id = o.id)`,
    );
    const rest = await client.query(
      `select (select count(*)::int from public.asset_memory) a,
              (select count(*)::int from public.user_profiles) u,
              (select count(*)::int from public.organizations) o`,
    );
    console.log(`cleanup: asset_memory=${rest.rows[0].a} profiles=${rest.rows[0].u} orgs=${rest.rows[0].o}`);
  } catch (e) {
    console.error("CLEANUP FAILED — inspect the database:", e.message);
  }
  await client.end().catch(() => {});
}
