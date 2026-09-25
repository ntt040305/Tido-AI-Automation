import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Phase 3.1 — human feedback, and the memory built from it.
 *
 * WHAT THIS SUITE COVERS AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------
 * Everything here runs without a database, so it covers the half of Phase 3.1
 * that is application logic: the mapping across the storage boundary, the two
 * vocabularies agreeing, the authority model surviving the move, and the rules
 * the migration is supposed to encode actually being in the migration.
 *
 * The other half -- that a duplicate approval is refused, that an event cannot
 * be rewritten, that one person cannot read another's preferences -- is a
 * property of Postgres and is proved against a live database by
 * `scripts/verify-memory.mjs`. Asserting it here against a mock would test the
 * mock, which is the failure this codebase has already made once.
 *
 * Paths are redirected to a temp directory and the database is left
 * unconfigured before anything is imported, so a run of this suite cannot read
 * or write a real person's memory.
 */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "tido-memory-"));
process.env.TIDO_KITS_PATH = path.join(TMP, "kits");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { emptyKit, recordPreference, preferenceDecisions } = require("./evolution/experiment/UserKit");
const { APPROVAL_KINDS } = require("./evolution/experiment/UserKitLearning");
const { toSnapshot, fromSnapshot, recordApproval } = require("../user-kit/kit-memory");
const { USER_EVENT_KINDS, DEDUPLICATED_EVENT_KINDS, USER_PREFERENCE_AREAS } = require("@tido/shared");

const WEB = path.join(__dirname, "..", "..");
const MIGRATION = fs.readFileSync(
  path.join(WEB, "..", "..", "packages", "infrastructure", "migrations", "0005_human_feedback_and_memory.sql"),
  "utf-8",
);

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  const done = () => {
    passed++;
    console.log(`  ✓ ${name}`);
  };
  const fail = (e: any) => {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  };
  try {
    const r = fn();
    if (r && typeof (r as Promise<void>).then === "function") {
      return (r as Promise<void>).then(done, fail);
    }
    done();
  } catch (e: any) {
    fail(e);
  }
}

async function main() {
  console.log("\nThe storage boundary");

  check("a kit survives the round trip through the storage shape", () => {
    let kit = emptyKit("uid-round-trip");
    kit = recordPreference(kit, { area: "visual", value: "Cinematic", stated: false, occurrences: 3, negative: false });
    kit = recordPreference(kit, { area: "design", value: "serif headlines", stated: true, occurrences: 1, negative: false });
    kit = recordPreference(kit, { area: "quality", value: "plastic AI look", stated: false, occurrences: 2, negative: true });
    kit.observed_runs = 7;

    const back = fromSnapshot("uid-round-trip", toSnapshot(kit));
    assert.strictEqual(back.observed_runs, 7);
    assert.strictEqual(back.preferences.length, 3);
    for (const original of kit.preferences) {
      const match = back.preferences.find((p: any) => p.value === original.value && p.negative === original.negative);
      assert.ok(match, `${original.value} did not survive`);
      assert.strictEqual(match.stated, original.stated, `stated changed for ${original.value}`);
      assert.strictEqual(match.occurrences, original.occurrences, `occurrences changed for ${original.value}`);
      assert.strictEqual(match.area, original.area);
    }
  });

  check("`stated` cannot be invented by the round trip", () => {
    // The field the authority ladder reads. A mapping that defaulted it to true
    // would silently promote every guess about a person to something they said.
    let kit = emptyKit("uid-stated");
    kit = recordPreference(kit, { area: "visual", value: "warm light", stated: false, occurrences: 1, negative: false });
    const back = fromSnapshot("uid-stated", toSnapshot(kit));
    assert.strictEqual(back.preferences[0].stated, false);
  });

  check("an empty snapshot becomes an empty kit, not a null one", () => {
    const kit = fromSnapshot("uid-empty", null);
    assert.strictEqual(kit.user_id, "uid-empty");
    assert.deepStrictEqual(kit.preferences, []);
    assert.strictEqual(kit.observed_runs, 0);
  });

  console.log("\nThe two vocabularies agree");

  check("every kind the learning code acts on is recordable", () => {
    for (const kind of APPROVAL_KINDS) {
      assert.ok(USER_EVENT_KINDS.includes(kind), `${kind} cannot be recorded`);
    }
  });

  check("the recording vocabulary is wider, and includes the external correction", () => {
    // The audit's central finding: a loop that only observes approvals
    // reinforces whatever it already produces.
    assert.ok(USER_EVENT_KINDS.includes("reject"), "a rejection cannot be recorded");
    assert.ok(!APPROVAL_KINDS.includes("reject"), "a rejection must not be learned from yet");
  });

  check("the recording vocabulary matches the database check constraint", () => {
    const constraint = MIGRATION.match(/kind\s+text not null check \(kind in \(([\s\S]*?)\)\)/);
    assert.ok(constraint, "no kind constraint found in 0005");
    const declared = [...constraint[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(declared, [...USER_EVENT_KINDS].sort());
  });

  check("the preference areas match the ones the engine defines", () => {
    const constraint = MIGRATION.match(/area\s+text not null check \(area in \(([\s\S]*?)\)\)/);
    assert.ok(constraint, "no area constraint found in 0005");
    const declared = [...constraint[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(declared, [...USER_PREFERENCE_AREAS].sort());
  });

  check("the kinds exempt from deduplication match the index that enforces it", () => {
    const index = MIGRATION.match(/user_events_once_per_render_idx[\s\S]*?kind not in \(([\s\S]*?)\)/);
    assert.ok(index, "no uniqueness index found in 0005");
    const exempt = [...index[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    const deduplicated = USER_EVENT_KINDS.filter((k: string) => !exempt.includes(k)).sort();
    assert.deepStrictEqual(deduplicated, [...DEDUPLICATED_EVENT_KINDS].sort());
  });

  console.log("\nThe authority model survived the move");

  check("three occurrences is still the bar, and it is still in one place", () => {
    const src = fs.readFileSync(path.join(__dirname, "evolution/experiment/UserKit.ts"), "utf-8");
    assert.ok(/minOccurrences = 3/.test(src), "the threshold moved or changed");
    // A threshold encoded in SQL as well as TypeScript is two thresholds, and
    // they will eventually disagree. The migration may INDEX on the predicate;
    // it must not be the thing that decides it.
    assert.ok(
      !/occurrences\s*>=\s*3/.test(MIGRATION.replace(/create index[\s\S]*?;/g, "")),
      "the threshold was duplicated into the schema outside an index",
    );
  });

  check("an observed preference below the bar still influences nothing", () => {
    let kit = emptyKit("uid-bar");
    kit = recordPreference(kit, { area: "visual", value: "muted palette", stated: false, occurrences: 2, negative: false });
    const back = fromSnapshot("uid-bar", toSnapshot(kit));
    assert.strictEqual(preferenceDecisions(back).length, 0);
  });

  check("a stated preference still enters at user tier after storage", () => {
    let kit = emptyKit("uid-tier");
    kit = recordPreference(kit, { area: "visual", value: "cinematic", stated: true, occurrences: 1, negative: false });
    const decisions = preferenceDecisions(fromSnapshot("uid-tier", toSnapshot(kit)));
    assert.strictEqual(decisions.length, 1);
    assert.strictEqual(decisions[0].decision.derived_from, "user");
    assert.strictEqual(decisions[0].decision.confidence, "high");
  });

  check("an observed preference at the bar still enters at strategy tier and low confidence", () => {
    let kit = emptyKit("uid-tier-2");
    kit = recordPreference(kit, { area: "visual", value: "cinematic", stated: false, occurrences: 3, negative: false });
    const decisions = preferenceDecisions(fromSnapshot("uid-tier-2", toSnapshot(kit)));
    assert.strictEqual(decisions.length, 1);
    assert.strictEqual(decisions[0].decision.derived_from, "strategy");
    assert.strictEqual(decisions[0].decision.confidence, "low");
  });

  console.log("\nThe flow, with no database configured");

  await check("an approval still teaches something when persistence is unavailable", async () => {
    const identity = { firebaseUid: "uid-fallback", emailVerified: true };
    const outcome = await recordApproval(identity, {
      kind: "download",
      generationId: "gen-fallback-1",
      intelligence: { selected_direction: "emotional storytelling" },
    });
    assert.strictEqual(outcome.storage, "file", "the fallback did not run");
    assert.strictEqual(outcome.recorded, true);
    assert.strictEqual(outcome.learned, 1, "nothing was extracted");
  });

  await check("a kind outside the approval set is not learned from", async () => {
    const identity = { firebaseUid: "uid-reject", emailVerified: true };
    const outcome = await recordApproval(identity, {
      kind: "reject",
      generationId: "gen-fallback-2",
      intelligence: { selected_direction: "emotional storytelling" },
    });
    assert.strictEqual(outcome.learned, 0, "a rejection taught the system a preference");
  });

  await check("an unknown kind teaches nothing and is not recorded", async () => {
    const identity = { firebaseUid: "uid-unknown", emailVerified: true };
    const outcome = await recordApproval(identity, { kind: "vibes" as any, generationId: "g" });
    assert.strictEqual(outcome.recorded, false);
    assert.strictEqual(outcome.learned, 0);
  });

  console.log("\nWhat the migration is required to say");

  check("all three tables have row level security enabled", () => {
    for (const table of ["user_events", "user_creative_profiles", "user_preferences"]) {
      assert.ok(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`).test(MIGRATION),
        `${table} has RLS off`,
      );
    }
  });

  check("no client can write to any of them", () => {
    // A client able to write here could teach the system a taste nobody has,
    // which is worse than corrupting a row.
    const policies = [...MIGRATION.matchAll(/create policy (\w+) on public\.(\w+)\s+for (\w+)/g)];
    assert.ok(policies.length >= 3, `only ${policies.length} policies found`);
    for (const [, name, , verb] of policies) {
      assert.strictEqual(verb, "select", `${name} grants ${verb}`);
    }
  });

  check("an event cannot be rewritten once recorded", () => {
    assert.ok(/create trigger user_events_no_update/.test(MIGRATION), "no append-only trigger");
    assert.ok(/before update on public\.user_events/.test(MIGRATION), "the trigger does not cover update");
  });

  check("erasure is still possible", () => {
    // A trigger blocking DELETE would make `on delete cascade` from
    // user_profiles fail, and deleting an account impossible.
    assert.ok(
      !/before (delete|update or delete|delete or update) on public\.user_events/.test(MIGRATION),
      "delete is blocked; an account could never be erased",
    );
    assert.ok(
      /user_id\s+uuid not null references public\.user_profiles\(id\) on delete cascade/.test(MIGRATION),
      "events do not cascade from the profile",
    );
  });

  check("an event survives a render that was never persisted", () => {
    assert.ok(
      /run_id\s+uuid references public\.creative_runs\(id\) on delete set null/.test(MIGRATION),
      "run_id is not nullable; a click would be lost when the render record is",
    );
  });

  console.log("\nThe boundaries Phase 3.1 must not cross");

  check("the engine still cannot reach a database", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.startsWith("run-")) continue;
        const src = fs.readFileSync(full, "utf-8");
        if (/from ["']@tido\/infrastructure["']|from ["']@supabase|firebase-admin|user-kit\/kit-memory/.test(src)) {
          offenders.push(path.relative(WEB, full));
        }
      }
    };
    walk(path.join(WEB, "lib", "image-engine"));
    assert.deepStrictEqual(offenders, [], `the engine reached persistence: ${offenders.join(", ")}`);
  });

  check("memory retrieval is not wired into the engine (Phase 3.4, not 3.1)", () => {
    // The route resolves preferences and passes sentences down. The engine has
    // no account, no store and no way to look anything up, which is what keeps
    // a render bug away from a person's data.
    const router = fs.readFileSync(path.join(__dirname, "evolution/PipelineRouter.ts"), "utf-8");
    assert.ok(
      !/^import .*(kit-memory|UserKit|memory\.repository)/m.test(router),
      "the router now imports the memory layer",
    );
    // The one channel that exists stays a list of plain sentences resolved by
    // the caller. A router that could look something up would need an account.
    const context = router.match(/export interface RoutingContext \{[\s\S]*?\n\}/);
    assert.ok(context, "RoutingContext is gone");
    assert.ok(
      !/userId|firebaseUid|kit|profile/i.test(context ? context[0] : ""),
      "the router was given an identifier for a person",
    );
  });

  check("the memory bridge lives above the engine boundary", () => {
    const bridge = path.join(WEB, "lib", "user-kit", "kit-memory.ts");
    assert.ok(fs.existsSync(bridge), "kit-memory.ts is missing");
    assert.ok(
      !fs.existsSync(path.join(__dirname, "kit-memory.ts")),
      "the bridge was placed inside the engine",
    );
  });

  check("only the API layer records signals", () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const src = fs.readFileSync(full, "utf-8");
        if (/from ["']@\/lib\/user-kit\/kit-memory["']/.test(src)) {
          callers.push(path.relative(WEB, full).replace(/\\/g, "/"));
        }
      }
    };
    walk(path.join(WEB, "app"));
    walk(path.join(WEB, "lib"));
    walk(path.join(WEB, "features"));
    for (const caller of callers) {
      assert.ok(
        // Live-database verification harnesses drive the real signal path on
        // purpose; they are never imported by anything that serves a request.
        caller.startsWith("app/api/") || /^lib\/persistence\/verify-[\w-]+\.ts$/.test(caller),
        `${caller} reaches the memory layer from outside the API boundary`,
      );
    }
    assert.ok(callers.length > 0, "nothing calls the memory layer");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
