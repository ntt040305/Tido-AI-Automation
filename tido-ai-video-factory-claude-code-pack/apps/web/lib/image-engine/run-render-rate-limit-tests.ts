/**
 * Phase 10.3 — a ceiling on paid renders. Offline.
 *
 * What this suite is for
 * ----------------------
 * The audit found that anonymous rendering is DELIBERATE in this product: the
 * main render route resolves an identity when there is a token and renders
 * anyway when there is not. The campaign routes are consistent with that. What
 * was missing is the thing that makes anonymous access survivable — a limit.
 *
 * So these tests check the limit, and they check just as hard that it is NOT
 * an authentication check: a caller with no token must still be able to render,
 * and a signed-in person must not share a bucket with anonymous traffic.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  chargeRender, resetRenderLimits, RENDER_LIMIT, RENDER_WINDOW_MS,
} = require("../security/render-rate-limit");

const WEB = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf-8");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try {
    resetRenderLimits();
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    failures.push(`${name}\n    ${(e as Error).message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

/** A request carrying whatever headers the test needs. */
const req = (headers: Record<string, string> = {}) => ({
  headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
});

function main() {
  console.log("\nPaid render rate limit\n");

  check("an anonymous caller can render — this is a limit, not a login", () => {
    const first = chargeRender(req({ "x-forwarded-for": "203.0.113.9" }), null);
    assert.strictEqual(first.ok, true, "an anonymous caller was refused outright");
    assert.strictEqual(first.bucket, "anonymous");
    assert.strictEqual(first.remaining, RENDER_LIMIT - 1);
  });

  check("the limit stops the caller at the ceiling, and says when to return", () => {
    const r = req({ "x-forwarded-for": "203.0.113.9" });
    for (let i = 0; i < RENDER_LIMIT; i++) {
      assert.strictEqual(chargeRender(r, null).ok, true, `refused at render ${i + 1} of ${RENDER_LIMIT}`);
    }
    const over = chargeRender(r, null);
    assert.strictEqual(over.ok, false, `render ${RENDER_LIMIT + 1} was allowed`);
    assert.strictEqual(over.remaining, 0);
    assert.ok(over.retryAfter >= 1 && over.retryAfter <= RENDER_WINDOW_MS / 1000, `retryAfter ${over.retryAfter}`);
  });

  check("two different callers do not share a budget", () => {
    const a = req({ "x-forwarded-for": "203.0.113.1" });
    const b = req({ "x-forwarded-for": "203.0.113.2" });
    for (let i = 0; i < RENDER_LIMIT; i++) chargeRender(a, null);
    assert.strictEqual(chargeRender(a, null).ok, false, "the exhausted caller was allowed");
    assert.strictEqual(chargeRender(b, null).ok, true, "a second caller inherited the first one's exhaustion");
  });

  check("a signed-in person is not starved by an anonymous flood", () => {
    // The reason identity is read at all. Everyone behind one proxy shares an
    // address; a person with a token gets their own bucket.
    const shared = req({ "x-forwarded-for": "198.51.100.7" });
    for (let i = 0; i < RENDER_LIMIT; i++) chargeRender(shared, null);
    assert.strictEqual(chargeRender(shared, null).ok, false);
    const signedIn = chargeRender(shared, "firebase-uid-abc");
    assert.strictEqual(signedIn.ok, true, "a verified person was refused because of anonymous traffic");
    assert.strictEqual(signedIn.bucket, "identified");
  });

  check("the window reopens", () => {
    const r = req({ "x-forwarded-for": "203.0.113.5" });
    const t0 = 1_000_000;
    for (let i = 0; i < RENDER_LIMIT; i++) chargeRender(r, null, t0);
    assert.strictEqual(chargeRender(r, null, t0).ok, false);
    assert.strictEqual(chargeRender(r, null, t0 + RENDER_WINDOW_MS).ok, true, "the window never reopened");
  });

  check("a caller with no forwarded address is still counted", () => {
    // Otherwise the limit is bypassed by omitting a header.
    for (let i = 0; i < RENDER_LIMIT; i++) chargeRender(req(), null);
    assert.strictEqual(chargeRender(req(), null).ok, false, "an unidentifiable caller had no ceiling");
  });

  check("every paid route charges before it spends", () => {
    for (const route of [
      "app/api/campaign/render-asset/route.ts",
      "app/api/campaign/generate/route.ts",
      // The main render route. The audit's real finding was that this one was
      // unlimited too — the campaign routes were not anomalies, they were
      // consistent with a product that renders for anyone who asks.
      "app/api/image/generate-simple/route.ts",
    ]) {
      const src = read(route);
      assert.ok(/chargeRender\(/.test(src), `${route} can spend without a ceiling`);
      assert.ok(/status: 429/.test(src), `${route} does not refuse with 429`);
      // Before the money: the charge has to precede the provider call.
      const charge = src.indexOf("chargeRender(");
      const spend = Math.min(
        ...["generateImage", "orchestrator.run", "PipelineRouter.run", "generateSimpleImage"].map((m) => {
          const i = src.indexOf(m);
          return i < 0 ? Number.POSITIVE_INFINITY : i;
        }),
      );
      assert.ok(charge < spend, `${route} spends before it counts`);
    }
  });

  check("the limiter authenticates nothing", () => {
    // If this module ever starts deciding who may render, the product's own
    // anonymous-render decision has been overturned by a utility.
    const src = read("lib/security/render-rate-limit.ts");
    for (const forbidden of [/verifyToken/, /resolveActor/, /401/, /Unauthorized/i]) {
      assert.ok(!forbidden.test(src), `the limiter has started authenticating: ${forbidden}`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
