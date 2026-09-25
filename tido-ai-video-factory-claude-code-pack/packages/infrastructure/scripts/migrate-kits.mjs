#!/usr/bin/env node
/**
 * Moves `data/accounts/kits/*.json` into `user_creative_profiles`.
 *
 * The one-time import for Phase 3.1. The file store was the smallest honest
 * thing that made the memory real when there was no database; there is one now,
 * and a person's preferences sitting on one container's disk are preferences
 * nothing can query, no policy can protect, and a redeploy discards.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It does not create accounts. A kit whose Firebase UID has no row in
 * `user_profiles` is REPORTED AND SKIPPED, not imported under a profile
 * invented for it. A fabricated account is a claim that somebody exists, and
 * the memory it would carry would be attributed to a person who never signed
 * in.
 *
 * It does not synthesise events. The imported counts came from a file and have
 * no matching rows in `user_events`, and they never will. `imported_at` records
 * that distinction so a later audit can see which profiles earned their counts
 * here and which arrived with them.
 *
 * It does not delete the files. They stay as the rollback, and as the evidence
 * that what landed in the database matches what was on disk.
 *
 * SAFE TO RUN TWICE
 * -----------------
 * Every write below merges with `greatest(...)` rather than adding, so a second
 * run changes nothing. Importing with `occurrences + excluded.occurrences`
 * would double every count on a re-run and push preferences over the
 * three-occurrence threshold that no render ever earned.
 *
 * Usage:
 *   node scripts/migrate-kits.mjs [--dry-run] [--kits <dir>] [--db-url <url>]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "./_connect.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..", "..", "..");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};

const KITS_DIR =
  flag("--kits") ||
  process.env.TIDO_KITS_PATH ||
  path.join(REPO, "apps", "web", "data", "accounts", "kits");

const connectionString =
  flag("--db-url") || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("No connection string. Pass --db-url or set SUPABASE_DB_URL.");
  process.exit(1);
}

const AREAS = ["visual", "design", "workflow", "quality"];

/**
 * Reads one kit file, rejecting anything that is not the shape UserKit defines.
 *
 * Strict on purpose: these files were written by an earlier version of this
 * application and are the only record of what they contain. A malformed one is
 * worth a report rather than a partial import that silently drops half a
 * person's memory.
 */
function readKit(file) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!parsed || typeof parsed !== "object") throw new Error("not an object");
  if (typeof parsed.user_id !== "string" || !parsed.user_id) throw new Error("no user_id");
  if (!Array.isArray(parsed.preferences)) throw new Error("no preferences array");

  const preferences = [];
  for (const p of parsed.preferences) {
    if (!p || typeof p !== "object") continue;
    const value = typeof p.value === "string" ? p.value.trim() : "";
    if (!value || value.length > 200) continue;
    if (!AREAS.includes(p.area)) continue;
    preferences.push({
      area: p.area,
      value,
      stated: Boolean(p.stated),
      occurrences: Math.max(0, Math.trunc(Number(p.occurrences) || 1)),
      negative: Boolean(p.negative),
    });
  }

  return {
    firebase_uid: parsed.user_id,
    observed_runs: Math.max(0, Math.trunc(Number(parsed.observed_runs) || 0)),
    preferences,
    dropped: parsed.preferences.length - preferences.length,
  };
}

const client = createClient(connectionString);

let imported = 0;
let skipped = 0;
let malformed = 0;
let preferenceRows = 0;

try {
  if (!fs.existsSync(KITS_DIR)) {
    console.log(`no kits directory at ${KITS_DIR} — nothing to import`);
    process.exit(0);
  }

  const files = fs.readdirSync(KITS_DIR).filter((f) => f.endsWith(".json"));
  console.log(`${files.length} kit file(s) in ${KITS_DIR}${dryRun ? "  (dry run)" : ""}\n`);
  if (files.length === 0) process.exit(0);

  await client.connect();

  for (const filename of files) {
    let kit;
    try {
      kit = readKit(path.join(KITS_DIR, filename));
    } catch (e) {
      malformed++;
      console.log(`  ✗ ${filename}  malformed: ${e.message}`);
      continue;
    }

    const profile = await client.query(
      "select id from public.user_profiles where firebase_uid = $1",
      [kit.firebase_uid],
    );

    if (profile.rows.length === 0) {
      skipped++;
      console.log(
        `  – ${filename}  no account for this uid; left on disk rather than imported under an invented one`,
      );
      continue;
    }

    const userId = profile.rows[0].id;

    if (dryRun) {
      imported++;
      preferenceRows += kit.preferences.length;
      console.log(
        `  would import ${filename}  ${kit.preferences.length} preference(s), observed_runs=${kit.observed_runs}`,
      );
      continue;
    }

    try {
      await client.query("begin");

      // `greatest` rather than assignment: a profile that has since recorded
      // real events must not be walked backwards to a file's count.
      await client.query(
        `insert into public.user_creative_profiles (user_id, observed_runs, imported_at)
         values ($1, $2, now())
         on conflict (user_id) do update
           set observed_runs = greatest(public.user_creative_profiles.observed_runs, excluded.observed_runs),
               imported_at   = coalesce(public.user_creative_profiles.imported_at, excluded.imported_at),
               updated_at    = now()`,
        [userId, kit.observed_runs],
      );

      for (const p of kit.preferences) {
        await client.query(
          `insert into public.user_preferences (user_id, area, value, stated, occurrences, negative)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (user_id, area, value_key, negative) do update
             set stated      = public.user_preferences.stated or excluded.stated,
                 occurrences = greatest(public.user_preferences.occurrences, excluded.occurrences),
                 updated_at  = now()`,
          [userId, p.area, p.value, p.stated, p.occurrences, p.negative],
        );
        preferenceRows++;
      }

      await client.query("commit");
      imported++;
      console.log(
        `  ✓ ${filename}  ${kit.preferences.length} preference(s)` +
          (kit.dropped ? `, ${kit.dropped} unreadable entry(ies) left behind` : ""),
      );
    } catch (e) {
      await client.query("rollback");
      malformed++;
      console.log(`  ✗ ${filename}  failed and was rolled back: ${e.message}`);
    }
  }

  console.log(
    `\n${dryRun ? "would import" : "imported"} ${imported} kit(s), ` +
      `${preferenceRows} preference row(s); ${skipped} skipped (no account), ${malformed} failed`,
  );
  console.log("kit files left in place as the rollback");
  process.exitCode = malformed === 0 ? 0 : 1;
} catch (e) {
  console.error("import failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
