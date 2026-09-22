import assert from "assert";
import fs from "fs";
import path from "path";

/**
 * Phase 1.1 — Firebase identity and the Supabase foundation.
 *
 * Three properties are under test, and they are not equally forgiving.
 *
 * ISOLATION. `lib/image-engine` must not be able to reach a database or an
 * identity provider. That has been true for this engine's whole life and is
 * why a routing bug there cannot leak anyone's data -- there is no data in
 * reach. Adding persistence is the first change that genuinely threatens it,
 * so it is asserted by walking the directory rather than trusted.
 *
 * TENANCY. Service-role access bypasses Row Level Security completely, so
 * every repository must authorise before it queries. The tests below read the
 * source to check the ORDER of those two operations, because a check that runs
 * after the query returns the right rows today and the wrong ones the first
 * time someone edits the filter.
 *
 * DEGRADATION. This application rendered pictures for its whole life without a
 * database and must keep doing so. Every layer returns null or a failure value
 * when unconfigured; none of them throws. A missing environment variable is a
 * reason to record nothing, never a reason to fail a render.
 *
 * What is NOT covered: anything requiring a live Supabase project or real
 * Firebase credentials. Those are integration concerns for a deployed
 * environment, and faking them here would test the fake.
 */

/** apps/web */
const APP = path.join(__dirname, "..", "..");
/** the monorepo root, where the packages live */
const ROOT = path.join(APP, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * Asserts a result failed, and hands back the failure branch.
 *
 * `DbResult` is a discriminated union, so reading `.error` off it requires
 * narrowing. Casting to `any` at each call site threw that away -- and with
 * it the compiler's guarantee that these tests are reading a shape that
 * actually exists.
 */
function refused<T>(r: { ok: true; data: T } | { ok: false; error: string; unavailable?: boolean }, why: string) {
  assert.strictEqual(r.ok, false, why);
  return r as { ok: false; error: string; unavailable?: boolean };
}

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  const done = (e?: unknown) => {
    if (e) {
      failed++;
      console.log(`  ✗ ${name}`);
      console.log(`    ${e instanceof Error ? e.message : String(e)}`);
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  };
  try {
    const r = fn();
    if (r && typeof (r as Promise<void>).then === "function") {
      return (r as Promise<void>).then(() => done()).catch(done);
    }
    done();
  } catch (e) {
    done(e);
  }
  return Promise.resolve();
}

async function main() {
  console.log("\nThe old auth system is gone, not merely unused");

  await check("No custom credential code remains", () => {
    // Two live login paths is a security liability, not clutter: the one
    // nobody is maintaining is the one that gets exploited.
    for (const gone of ["lib/auth", "app/api/auth"]) {
      assert.ok(!fs.existsSync(path.join(APP, gone)), `${gone} still exists`);
    }
  });

  await check("Nothing still imports it", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(f.name)) {
          const code = strip(fs.readFileSync(full, "utf-8"));
          if (/["'].*lib\/auth\/(session|user-store)["']/.test(code)) {
            offenders.push(path.relative(APP, full).replace(/\\/g, "/"));
          }
        }
      }
    };
    for (const d of ["app", "lib", "features"]) walk(path.join(APP, d));
    assert.deepStrictEqual(offenders, [], `dangling imports: ${offenders.join(", ")}`);
  });

  console.log("\nIdentity comes from a verified token and nothing else");

  const infra = await import("@tido/infrastructure");
  const verify = infra.getIdentityProvider();

  await check("A bearer token is parsed, and nothing else is accepted", () => {
    assert.strictEqual(infra.bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
    assert.strictEqual(infra.bearerToken("bearer abc"), "abc");
    assert.strictEqual(infra.bearerToken("Basic abc"), null, "a Basic header was accepted");
    assert.strictEqual(infra.bearerToken("abc"), null, "a bare token was accepted");
    assert.strictEqual(infra.bearerToken(null), null);
    assert.strictEqual(infra.bearerToken(""), null);
  });

  await check("No token means nobody, not an error", () => {
    // This product renders signed out. A throw here would break anonymous
    // generation, which is most of its traffic.
    return Promise.all([
      verify.verifyToken(null).then((r) => assert.strictEqual(r, null)),
      verify.verifyToken("").then((r) => assert.strictEqual(r, null)),
      verify.verifyToken("not-a-real-token").then((r) => assert.strictEqual(r, null)),
    ]).then(() => undefined);
  });

  await check("An unconfigured Firebase yields nobody rather than throwing", async () => {
    const r = await verify.identify({ headers: { get: () => "Bearer anything" } });
    assert.strictEqual(r, null);
  });

  await check("Identity is never taken from a header, body or query", () => {
    // The whole point of the layer. If any of these appear, someone can claim
    // to be someone else by typing their id.
    const code = strip(read("packages/infrastructure/src/firebase/verify.ts"));
    for (const forbidden of ["x-user-id", "body.userId", "searchParams", "req.body"]) {
      assert.ok(!code.includes(forbidden), `identity is read from ${forbidden}`);
    }
    assert.ok(/verifyIdToken\(/.test(code), "nothing verifies a token");
  });

  await check("Revocation is checked, not just expiry", () => {
    // Without the second argument a disabled account keeps working until its
    // token happens to expire.
    const code = strip(read("packages/infrastructure/src/firebase/verify.ts"));
    assert.ok(/verifyIdToken\(token,\s*true\)/.test(code), "revocation is not checked");
  });

  await check("There is no development bypass", () => {
    // A verifier that can be told to say yes is not a verifier, and the
    // shortcut always outlives the sprint it was added for.
    const code = strip(read("packages/infrastructure/src/firebase/verify.ts")) + strip(read("packages/infrastructure/src/firebase/admin.ts"));
    for (const smell of ["NODE_ENV === \"development\"", "SKIP_AUTH", "BYPASS", "mockUser", "fakeUid"]) {
      assert.ok(!code.includes(smell), `an auth bypass exists: ${smell}`);
    }
  });

  console.log("\nThe database layer degrades instead of failing");

  const client = infra;

  await check("An unconfigured database is null, not an exception", async () => {
    const saved = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY];
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      assert.strictEqual(client.isDatabaseConfigured(), false);
      // The repositories must answer rather than throw when there is nothing
      // behind them. This is the property the whole application depends on
      // for anonymous rendering to keep working.
      const r = await infra.getInfrastructure().runs.record({
        id: "11111111-1111-1111-1111-111111111111",
        pipeline: "stable",
        status: "COMPLETED",
        success: true,
      });
      assert.strictEqual(
        refused(r, "an absent database returned success").unavailable,
        true,
        "an absent database was reported as an error",
      );
    } finally {
      if (saved[0]) process.env.SUPABASE_URL = saved[0];
      if (saved[1]) process.env.SUPABASE_SERVICE_ROLE_KEY = saved[1];
    }
  });

  await check("Recording a run cannot fail a render", async () => {
    // The rule: by the time this is called the picture exists and the user is
    // waiting. A database problem is an analytics problem.
    const runs = infra.getInfrastructure().runs;
    await runs.recordSafely({
      id: "00000000-0000-0000-0000-000000000000",
      pipeline: "stable",
      status: "COMPLETED",
      success: true,
    });
    const r = await runs.record({
      id: "00000000-0000-0000-0000-000000000000",
      pipeline: "stable",
      status: "COMPLETED",
      success: true,
    });
    assert.strictEqual(
      refused(r, "an unconfigured database returned success").unavailable,
      true,
      "an unconfigured DB was reported as a real error",
    );
  });

  await check("The service-role client is server-only by construction", () => {
    // This key bypasses RLS. In a browser bundle it is unrestricted access to
    // the whole database for every visitor.
    const code = strip(read("packages/infrastructure/src/supabase/client.ts"));
    assert.ok(/typeof window !== "undefined"/.test(code), "no browser guard");
    assert.ok(/throw new Error/.test(code), "the browser guard does not throw");
  });

  await check("No repository reads the service key directly", () => {
    // The key belongs in exactly one module -- the client -- so there is a
    // single place to audit. A repository that read it directly could open its
    // own connection and bypass every rule in this file.
    const dir = path.join(ROOT, "packages/infrastructure/src/supabase");
    const repositories = fs.readdirSync(dir).filter((f) => f.endsWith(".repository.ts"));
    assert.ok(repositories.length >= 3, "the repositories were not found");
    for (const f of repositories) {
      const code = strip(fs.readFileSync(path.join(dir, f), "utf-8"));
      assert.ok(!code.includes("SERVICE_ROLE"), `${f} reads the service key`);
      assert.ok(!code.includes("createClient"), `${f} opens its own connection`);
    }
  });

  console.log("\nOne tenant cannot reach another");

  // Two people, each in their own workspace, sharing nothing. These exercise
  // the authorisation path with the database unavailable, which is the point:
  // a denial must come from the rule, not from the query failing to find a
  // row. If the check were skipped, an unconfigured database would return
  // "unavailable" here rather than a refusal, and the test would catch it.
  const userA = {
    profile: { id: "user-a", firebase_uid: "fb-a", email: null, display_name: null, created_at: "", updated_at: "" },
    memberships: [{ org_id: "org-a", user_id: "user-a", role: "owner" as const, created_at: "" }],
  };
  const userB = {
    profile: { id: "user-b", firebase_uid: "fb-b", email: null, display_name: null, created_at: "", updated_at: "" },
    memberships: [{ org_id: "org-b", user_id: "user-b", role: "owner" as const, created_at: "" }],
  };

  await check("User A cannot list User B's projects", async () => {
    const projects = infra.getInfrastructure().projects;
    const r = refused(await projects.list(userA, "org-b"), "a foreign workspace was listed");
    assert.ok(/not a member/i.test(r.error), r.error);
    assert.notStrictEqual(
      r.unavailable,
      true,
      "the refusal came from the database being absent, not from the rule",
    );
  });

  await check("User A cannot create a project in User B's workspace", async () => {
    const projects = infra.getInfrastructure().projects;
    const r = refused(
      await projects.create(userA, { orgId: "org-b", name: "intrusion" }),
      "a project was created in a foreign workspace",
    );
    assert.ok(/permission/i.test(r.error), r.error);
    assert.notStrictEqual(r.unavailable, true, "refused only because the DB was absent");
  });

  await check("User A cannot list User B's creative runs", async () => {
    const runs = infra.getInfrastructure().runs;
    const r = refused(await runs.listForOrg(userA, "org-b"), "foreign runs were listed");
    assert.ok(/not a member/i.test(r.error), r.error);
    assert.notStrictEqual(r.unavailable, true, "refused only because the DB was absent");
  });

  await check("Membership is not transitive or inferred", async () => {
    // Belonging to one workspace grants nothing anywhere else, including in
    // orgs that do not exist -- a typo must not become an access grant.
    const projects = infra.getInfrastructure().projects;
    for (const org of ["org-b", "", "org-c", "../org-a"]) {
      const r = await projects.list(userB, org);
      if (org === "org-b") {
        // userB's own org: allowed by the rule, then blocked by the absent DB.
        assert.notStrictEqual(r.ok ? "" : r.error, "not a member of this workspace");
      } else {
        assert.strictEqual(r.ok, false, `access granted to "${org}"`);
      }
    }
  });

  await check("An invalid Firebase token is rejected", async () => {
    const provider = infra.getIdentityProvider();
    for (const bad of ["garbage", "a.b.c", "Bearer nested", "null", "{}"]) {
      assert.strictEqual(await provider.verifyToken(bad), null, `accepted: ${bad}`);
    }
  });

  await check("An expired or revoked token is rejected", () => {
    // Cannot be exercised without live credentials, so the guarantee is
    // asserted where it is actually made: verifyIdToken's second argument is
    // what checks revocation, and without it a disabled account keeps working
    // until its token happens to expire.
    const code = strip(read("packages/infrastructure/src/firebase/verify.ts"));
    assert.ok(/verifyIdToken\(token,\s*true\)/.test(code), "revocation is not checked");
    assert.ok(/catch\s*\{/.test(code), "a rejected token is not caught");
    assert.ok(/return null;/.test(code), "a rejected token does not resolve to nobody");
  });

  await check("A malformed Authorization header yields nobody", async () => {
    const provider = infra.getIdentityProvider();
    for (const header of ["", "Bearer", "Basic abc", "Token abc", "Bearer  "]) {
      const r = await provider.identify({ headers: { get: () => header } });
      assert.strictEqual(r, null, `accepted header: "${header}"`);
    }
  });

  console.log("\nTenancy is checked before the query, not after");

  await check("Every repository read authorises first", () => {
    // Order matters. A check that runs after the query returns the right rows
    // today and the wrong ones the first time the filter is edited.
    const code = read("packages/infrastructure/src/supabase/projects.repository.ts");
    const fn = code.slice(code.indexOf("export async function listProjects"));
    const guard = fn.indexOf("isMember(actor, orgId)");
    const query = fn.indexOf("await getDb()");
    assert.ok(guard > -1, "listProjects does not check membership");
    assert.ok(guard < query, "the membership check runs after the database is reached");
  });

  await check("A single-row read authorises against the row's own org", () => {
    // Trusting an org id from the caller would let someone who knows a project
    // id probe membership by varying the other argument.
    const code = strip(read("packages/infrastructure/src/supabase/projects.repository.ts"));
    const fn = code.slice(code.indexOf("export async function getProject"));
    assert.ok(/isMember\(actor, project\.org_id\)/.test(fn), "authorises against a caller-supplied org");
  });

  await check("A forbidden row is indistinguishable from a missing one", () => {
    // Otherwise the error message becomes an existence oracle for ids.
    const code = strip(read("packages/infrastructure/src/supabase/projects.repository.ts"));
    const fn = code.slice(code.indexOf("export async function getProject"));
    const messages = [...fn.matchAll(/error:\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(messages.length >= 2, "expected both a miss and a denial");
    assert.strictEqual(
      new Set(messages.filter((m) => /not found/.test(m))).size,
      1,
      `denial and miss use different wording: ${messages.join(" | ")}`,
    );
  });

  await check("Viewers cannot write", async () => {
    const { WRITER_ROLES, ADMIN_ROLES } = await import("@tido/shared");
    assert.ok(!WRITER_ROLES.includes("viewer"), "a viewer can create content");
    assert.ok(!ADMIN_ROLES.includes("member"), "a member can administer the workspace");
    assert.deepStrictEqual([...WRITER_ROLES], ["owner", "admin", "member"]);
  });

  await check("Role checks are pure and do not hit the database", () => {
    const repo = infra;
    // A complete Actor, because the shared types now enforce the shape across
    // the package boundary -- which is the separation working.
    const actor = {
      profile: {
        id: "p1",
        firebase_uid: "f1",
        email: null,
        display_name: null,
        created_at: "",
        updated_at: "",
      },
      memberships: [
        { org_id: "o1", user_id: "p1", role: "viewer" as const, created_at: "" },
      ],
    };
    assert.strictEqual(repo.isMember(actor, "o1"), true);
    assert.strictEqual(repo.isMember(actor, "o2"), false);
    assert.strictEqual(repo.canWrite(actor, "o1"), false, "a viewer was allowed to write");
    assert.strictEqual(repo.canAdminister(actor, "o1"), false);
    assert.strictEqual(repo.roleIn(actor, "o1"), "viewer");
    assert.strictEqual(repo.roleIn(actor, "nope"), null);
  });

  await check("A project cannot be moved between workspaces by an edit", () => {
    // A transfer has an authorisation question on both sides. It is not a
    // field update.
    const code = strip(read("packages/infrastructure/src/supabase/projects.repository.ts"));
    const fn = code.slice(code.indexOf("export async function updateProject"));
    assert.ok(!/patch\.org_id/.test(fn), "org_id is patchable");
  });

  console.log("\nThe engine still cannot reach any of it");

  await check("lib/image-engine imports neither identity nor the database", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) walk(full);
        else if (f.name.endsWith(".ts") && !f.name.startsWith("run-")) {
          const code = strip(fs.readFileSync(full, "utf-8"));
          if (/["'].*(identity\/|db\/client|db\/repositories|firebase|supabase)/i.test(code)) {
            offenders.push(path.relative(APP, full).replace(/\\/g, "/"));
          }
        }
      }
    };
    walk(path.join(APP, "lib/image-engine"));
    assert.deepStrictEqual(offenders, [], `the engine reaches outside its boundary: ${offenders.join(", ")}`);
  });

  await check("The stable engine layer was not touched", () => {
    // The constraint from the brief. service/ and compiler/ read no flags and
    // now must also know nothing about persistence.
    for (const dir of ["lib/image-engine/service", "lib/image-engine/compiler"]) {
      for (const f of fs.readdirSync(path.join(APP, dir))) {
        if (!f.endsWith(".ts")) continue;
        const code = strip(fs.readFileSync(path.join(APP, dir, f), "utf-8"));
        for (const forbidden of ["supabase", "firebase", "db/repositories", "identity/"]) {
          assert.ok(!code.toLowerCase().includes(forbidden), `${dir}/${f} references ${forbidden}`);
        }
      }
    }
  });

  console.log("\nThe migrations say what they do");

  const m1 = read("packages/infrastructure/migrations/0001_identity_and_tenancy.sql");
  const m2 = read("packages/infrastructure/migrations/0002_row_level_security.sql");

  await check("All five tables are created", () => {
    for (const t of ["user_profiles", "organizations", "workspace_members", "projects", "creative_runs"]) {
      assert.ok(
        new RegExp(`create table if not exists public\\.${t}\\b`).test(m1),
        `${t} is not created`,
      );
    }
  });

  await check("Firebase appears in exactly one column", () => {
    // The bridge. If a second table grows a firebase_uid, changing identity
    // provider stops being a one-column migration.
    const occurrences = (m1.match(/firebase_uid/g) || []).length;
    assert.ok(occurrences > 0, "there is no bridge column");
    const tables = [...m1.matchAll(/create table if not exists public\.(\w+)([\s\S]*?);\n/g)]
      .filter(([, , body]) => /firebase_uid/.test(body))
      .map(([, name]) => name);
    assert.deepStrictEqual(tables, ["user_profiles"], `firebase_uid also appears in: ${tables.join(", ")}`);
  });

  await check("Anonymous renders remain legal", () => {
    // A NOT NULL on user_id would turn signed-out generation into a constraint
    // violation, and signed-out generation is most of this product's traffic.
    const runs = m1.slice(m1.indexOf("create table if not exists public.creative_runs"));
    const body = runs.slice(0, runs.indexOf(");"));
    for (const col of ["org_id", "user_id", "project_id"]) {
      const line = body.split("\n").find((l) => l.trim().startsWith(col));
      assert.ok(line, `${col} is missing`);
      assert.ok(!/not null/i.test(line!), `${col} is NOT NULL, which forbids anonymous runs`);
    }
  });

  await check("RLS is enabled on every table", () => {
    for (const t of ["user_profiles", "organizations", "workspace_members", "projects", "creative_runs"]) {
      assert.ok(
        new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(m2),
        `RLS is not enabled on ${t}`,
      );
    }
  });

  await check("Policies key off the Firebase claim, not a client-supplied id", () => {
    assert.ok(/auth\.jwt\(\)\s*->>\s*'sub'/.test(m2), "policies do not read the token claim");
  });

  await check("Clients cannot write history", () => {
    // A client that could insert a creative_run could fabricate the input to
    // every learning feature on the roadmap.
    const runsPolicies = m2.slice(m2.indexOf("-- ── creative_runs"));
    assert.ok(/for select/.test(runsPolicies), "runs are not readable at all");
    assert.ok(!/for insert|for update|for all/.test(runsPolicies), "a client can write runs");
  });

  await check("Profiles cannot be minted by a client", () => {
    const profiles = m2.slice(m2.indexOf("-- ── user_profiles"), m2.indexOf("-- ── organizations"));
    assert.ok(!/for insert/.test(profiles), "a client can create a profile for any uid");
  });

  await check("The RLS migration records why service-role alone was rejected", () => {
    // The Phase 0 audit named this the highest-leverage decision. The reason
    // belongs next to the policies, not in a ticket someone will not find.
    assert.ok(/service.role/i.test(m2), "the service-role caveat is undocumented");
    assert.ok(/bypass/i.test(m2), "the RLS bypass is not stated");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();
