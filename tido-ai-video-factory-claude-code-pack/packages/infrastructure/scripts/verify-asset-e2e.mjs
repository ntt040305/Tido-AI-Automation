#!/usr/bin/env node
/**
 * Phase 3.2 end to end: a real image, uploaded twice, remembered once.
 *
 * WHY THIS EXISTS ALONGSIDE verify-asset-memory.mjs
 * --------------------------------------------------
 * That script proves the table behaves. This proves the application actually
 * reaches it -- which is the failure this codebase keeps finding rather than
 * the one it keeps fearing. The Phase 3 audit found seven modules in exactly
 * this state: correct, complete, and connected to nothing.
 *
 * It matters especially here because `buildAssetDNA` is called inside
 * `if (productionOn)` in the pipeline, gated on `design_production_v1`, which
 * is off. Asset memory that only filled while that flag happened to be on
 * would look fine in every test and be empty in production forever.
 *
 * The claim: two renders of the SAME photograph produce one row, two
 * sightings, and no second vision call.
 *
 * Needs the app running (TIDO_APP_URL, default http://127.0.0.1:3000).
 * Every account and row it creates is removed, including on failure.
 *
 * Usage: pnpm --filter @tido/infrastructure verify:assets:e2e
 */

import crypto from "crypto";
import { createClient } from "./_connect.mjs";

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const APP = process.env.TIDO_APP_URL || "http://127.0.0.1:3000";
/** Must appear in `internal_testers` in the feature flags, or this routes to stable. */
const TESTER = process.env.TIDO_TESTER_ID || "internal-01";

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

/**
 * A small real PNG, generated rather than committed.
 *
 * Deterministic bytes, so the hash this script expects is the hash the server
 * computes -- which is the whole property under test. A committed fixture would
 * work equally well and would be one more binary in the repository.
 */
function png() {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour
  const raw = Buffer.concat(
    Array.from({ length: 8 }, (_, y) =>
      Buffer.concat([
        Buffer.from([0]),
        Buffer.concat(Array.from({ length: 8 }, (_, x) => Buffer.from([180 - y * 8, 140 - x * 4, 110]))),
      ]),
    ),
  );
  const zlib = require("zlib");
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const { createRequire } = await import("module");
const require = createRequire(import.meta.url);

const IMAGE = png();
const HASH = crypto.createHash("sha256").update(IMAGE).digest("hex");

/**
 * One render, as the browser sends it.
 *
 * The image goes in as an INSPIRATION reference rather than a product, and the
 * tester header is set. Both are deliberate, and both are working around
 * defects that pre-date this phase:
 *
 *   - `internal_only` rollout means an ordinary request routes to the STABLE
 *     pipeline, where VisualDNA never runs. The header is what reaches the
 *     experiment path where the analyzer lives.
 *   - The upload route tags inspiration images with a role and leaves product
 *     images bare, and `VisualDNAAnalyzer.select` skips anything whose role it
 *     does not recognise. So a product upload is never looked at.
 *
 * Neither is fixed here: the first is a rollout decision and the second changes
 * which images a model sees, and therefore what gets rendered. This proves the
 * chain from upload to stored memory works wherever the analysis actually runs.
 */
async function render(token, concept) {
  const form = new FormData();
  form.set("concept", concept);
  form.set("contentMessage", "Slow mornings");
  form.set("useCase", "Poster");
  form.set("aspectRatio", "1:1");
  form.append("inspirationImages", new Blob([IMAGE], { type: "image/png" }), "reference.png");
  const started = Date.now();
  const res = await fetch(`${APP}/api/image/generate-simple`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-tido-tester-id": TESTER },
    body: form,
  });
  const body = await res.json();
  return { status: res.status, body, ms: Date.now() - started };
}

const stamp = Date.now();
const EMAIL = `phase32-probe-${stamp}@example.com`;
const db = createClient(process.env.SUPABASE_DB_URL);
let uid = null;

/** Persistence is fire-and-forget, so the row lands shortly after the response. */
async function waitForRows(userId, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const r = await db.query("select * from public.asset_memory where user_id=$1", [userId]);
    if (r.rows.length) return r.rows;
    await new Promise((done) => setTimeout(done, 500));
  }
  return [];
}

try {
  await db.connect();
  const signUp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: "probe-password-A2", returnSecureToken: true }),
    },
  );
  const session = await signUp.json();
  if (!session.idToken) throw new Error(`sign-up failed: ${JSON.stringify(session).slice(0, 200)}`);
  uid = session.localId;

  console.log(`\nA real upload (${IMAGE.length} bytes, sha-256 ${HASH.slice(0, 12)}…)\n`);

  console.log("First render");
  const one = await render(session.idToken, "A ceramic pour-over dripper on pale linen, morning light");
  check("the render succeeded", one.status === 200 && one.body?.success === true,
    `HTTP ${one.status} in ${(one.ms / 1000).toFixed(1)}s`);
  console.log(`    ${(one.ms / 1000).toFixed(1)}s`);

  const profile = await db.query("select id from public.user_profiles where firebase_uid=$1", [uid]);
  const userId = profile.rows[0]?.id;
  check("the person was registered", Boolean(userId));

  const afterFirst = await waitForRows(userId);
  check("the uploaded asset reached asset_memory", afterFirst.length === 1,
    `${afterFirst.length} row(s)`);

  const row = afterFirst[0] || {};
  check("it is keyed by the bytes, as the server hashed them",
    row.content_hash === HASH, `${String(row.content_hash).slice(0, 16)}… vs ${HASH.slice(0, 16)}…`);
  check("the key is a whole digest, not the engine's truncation",
    String(row.content_hash || "").length === 64, `${String(row.content_hash || "").length} chars`);
  check("the byte size matches the file", row.byte_size === IMAGE.length,
    `${row.byte_size} vs ${IMAGE.length}`);
  check("it is filed under the branch that looked at it", row.branch === "reference", row.branch);
  check("it starts at one sighting", row.times_seen === 1, `${row.times_seen}`);

  const analysed = row.model_calls > 0;
  console.log(
    `    analyser ran: ${analysed ? "yes" : "no"}` +
      (analysed ? `, observed: ${Object.keys(row.observed || {}).join(", ") || "(nothing)"}` : ""),
  );
  if (analysed) {
    check("what the model saw was stored", Object.keys(row.observed || {}).length > 0,
      JSON.stringify(row.observed).slice(0, 160));
    check("the engine's short hash was kept as a hint",
      typeof row.prepared_hash === "string" && row.prepared_hash.length === 16,
      String(row.prepared_hash));
  }

  console.log("\nSecond render, same photograph");
  const two = await render(session.idToken, "The same dripper, a wider frame");
  check("the second render succeeded", two.status === 200 && two.body?.success === true,
    `HTTP ${two.status}`);
  console.log(`    ${(two.ms / 1000).toFixed(1)}s`);

  let after = [];
  for (let i = 0; i < 20; i++) {
    after = (await db.query("select * from public.asset_memory where user_id=$1", [userId])).rows;
    if (after[0]?.times_seen > 1) break;
    await new Promise((done) => setTimeout(done, 500));
  }

  check("the same photograph did not become a second row", after.length === 1,
    `${after.length} rows`);
  check("it counted as a second sighting", after[0]?.times_seen === 2, `${after[0]?.times_seen}`);
  check("the first render's observation was not erased by the second",
    JSON.stringify(after[0]?.observed || {}).length >= JSON.stringify(row.observed || {}).length,
    "the memory got worse");
  check("first_seen_at did not move", String(after[0]?.first_seen_at) === String(row.first_seen_at));
  check("last_seen_at did move", String(after[0]?.last_seen_at) !== String(row.last_seen_at));

  const saved = (after[0]?.times_seen || 0) - (after[0]?.model_calls || 0);
  console.log(`    sightings ${after[0]?.times_seen}, vision calls ${after[0]?.model_calls}, saved ${saved}`);
  // The claim the whole table rests on. The analyzer's own log says
  // `reusing analysis for unchanged images` on the second render; the row has
  // to agree with it, or the saving is a number nobody should trust.
  check("the second render reused the analysis rather than paying for it again",
    after[0]?.model_calls === 1, `${after[0]?.model_calls} vision calls for 2 sightings`);
  check("so the memory can show real work saved", saved >= 1, `saved ${saved}`);

  // ── phase 3.2.5: the asset also gets a position in meaning-space ──────────
  console.log("\nSemantic index");
  let vectors = [];
  for (let i = 0; i < 20; i++) {
    vectors = (
      await db.query(
        `select facet, model, dims, length(source_text) as chars
           from public.asset_embeddings where asset_id = $1 order by facet`,
        [after[0]?.id],
      )
    ).rows;
    if (vectors.length) break;
    await new Promise((done) => setTimeout(done, 500));
  }
  check("the remembered asset was indexed for meaning", vectors.length > 0,
    "no vector was written — indexing did not reach the database");
  if (vectors.length) {
    console.log(`    ${vectors.map((v) => `${v.facet} (${v.chars} chars)`).join(", ")}`);
    check("every vector has the width the column declares",
      vectors.every((v) => v.dims === 768), JSON.stringify(vectors.map((v) => v.dims)));
    check("and records which model produced it",
      vectors.every((v) => typeof v.model === "string" && v.model.length > 0));
    check("the text that was embedded was kept, so a result can be explained",
      vectors.every((v) => v.chars > 0));
  }

  // ── the generation path is unchanged ──────────────────────────────────────
  console.log("\nThe generation path");
  check("both renders returned an image",
    Boolean(one.body?.imageUrl) && Boolean(two.body?.imageUrl));
  check("no engine internals rode into the response",
    !JSON.stringify(one.body).includes("visualDna") &&
      !JSON.stringify(one.body).includes("assetDna"),
    "an internal structure leaked");

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("e2e failed:", e.message);
  process.exitCode = 1;
} finally {
  try {
    if (uid) {
      await db.query(
        `delete from public.creative_runs where user_id in
           (select id from public.user_profiles where firebase_uid = $1)`,
        [uid],
      );
      await db.query(
        `delete from public.creative_requests where user_id in
           (select id from public.user_profiles where firebase_uid = $1)`,
        [uid],
      );
      await db.query(
        `delete from public.organizations where id in (
           select m.org_id from public.workspace_members m
             join public.user_profiles p on p.id = m.user_id
            where p.firebase_uid = $1)`,
        [uid],
      );
      await db.query("delete from public.user_profiles where firebase_uid = $1", [uid]);
    }
    const left = await db.query(
      `select (select count(*)::int from public.asset_embeddings) v,
              (select count(*)::int from public.asset_memory) a,
              (select count(*)::int from public.user_profiles) u,
              (select count(*)::int from public.organizations) o,
              (select count(*)::int from public.creative_runs) r`,
    );
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
