/**
 * The bytes that leave for the provider, pinned.
 *
 * WHY
 * ---
 * Nano Banana 2 is the rollback. Switching back must put the request back exactly
 * as it is today — not approximately, and not "the fields look right". The existing
 * `run-imgstudio-tests.ts` captures the POST url and headers but never the BODY, so
 * nothing stopped a refactor from changing a field name, dropping `quality`, or
 * sending a different `resolution` while every test stayed green.
 *
 * This suite records the body. It is deliberately a fixture, not a behaviour test:
 * the assertions are the literal field names and values, so any change to them
 * fails here and has to be made on purpose.
 *
 * Both dialects are pinned, because the Sunburst row has to send the values the
 * probe proved and nothing else — in particular NOT `background` or `count`, which
 * 03 §2.2 measured as accepted and inert.
 *
 * No network: `fetch` is replaced. No model call, no provider call, no cost.
 */
import assert from "assert";

import { ImgStudioImageGenerationProvider } from "./provider/ImgStudioImageGenerationProvider";
import { SUNBURST, NANO_BANANA_2 } from "./models/image-model-profiles";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    const msg = (e as Error).message.split("\n")[0];
    failures.push(`${name}\n    ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${msg}`);
  }
}

interface Captured {
  url: string;
  headerNames: string[];
  /** Field names in append order, images collapsed to "images". */
  fieldNames: string[];
  /** Scalar field values. Never a buffer. */
  fields: Record<string, string>;
  imageCount: number;
  imageFilenames: string[];
  isMultipart: boolean;
}

/**
 * Runs one generation against a stubbed provider and records what was sent.
 *
 * The response is the shape 03 §1 recorded for a real success, so the adapter
 * follows its normal path rather than an error path.
 */
async function capture(opts: {
  providerId: string;
  references?: { reference_id: string; buffer: Buffer; mimeType: string; filename: string }[];
  aspectRatio?: string;
}): Promise<Captured> {
  const prev = {
    key: process.env.IMGSTUDIO_API_KEY,
    base: process.env.IMGSTUDIO_BASE_URL,
    id: process.env.IMGSTUDIO_PROVIDER_ID,
    res: process.env.TIDO_IMAGE_OUTPUT_RESOLUTION,
    qual: process.env.TIDO_IMAGE_OUTPUT_QUALITY,
    fetch: global.fetch,
  };

  process.env.IMGSTUDIO_API_KEY = "test_key_not_a_real_key";
  process.env.IMGSTUDIO_BASE_URL = "https://imgstudio.site";
  process.env.IMGSTUDIO_PROVIDER_ID = opts.providerId;
  // Cleared so the test reads the PROFILE, not a developer's local override.
  delete process.env.TIDO_IMAGE_OUTPUT_RESOLUTION;
  delete process.env.TIDO_IMAGE_OUTPUT_QUALITY;

  const out: Captured = {
    url: "",
    headerNames: [],
    fieldNames: [],
    fields: {},
    imageCount: 0,
    imageFilenames: [],
    isMultipart: false,
  };

  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString();
    if (init?.method === "POST") {
      out.url = u;
      out.headerNames = Object.keys((init.headers || {}) as Record<string, string>).sort();
      const body = init.body as unknown;
      if (body instanceof FormData) {
        out.isMultipart = true;
        for (const [k, v] of body.entries()) {
          if (k === "images") {
            out.imageCount++;
            out.imageFilenames.push((v as File).name);
            if (!out.fieldNames.includes("images")) out.fieldNames.push("images");
          } else {
            out.fieldNames.push(k);
            out.fields[k] = String(v);
          }
        }
      } else {
        out.isMultipart = false;
        const parsed = JSON.parse(String(body));
        for (const [k, v] of Object.entries(parsed)) {
          out.fieldNames.push(k);
          out.fields[k] = String(v);
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "fixture-id",
          status: "completed",
          cost_vnd: 150,
          balance_vnd: 1000,
          url: "/api/v1/images/fixture-id/file",
          provider_name: "fixture",
          model: "fixture",
        }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "image/webp" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response;
  }) as typeof fetch;

  try {
    await new ImgStudioImageGenerationProvider().generateImage({
      prompt: "A fixture prompt. No text anywhere in the image.",
      aspectRatio: opts.aspectRatio || "1:1",
      references: opts.references || [],
      generationId: "fixture",
      idempotencyKey: "fixture-key",
    } as never);
  } finally {
    global.fetch = prev.fetch;
    if (prev.key === undefined) delete process.env.IMGSTUDIO_API_KEY;
    else process.env.IMGSTUDIO_API_KEY = prev.key;
    if (prev.base === undefined) delete process.env.IMGSTUDIO_BASE_URL;
    else process.env.IMGSTUDIO_BASE_URL = prev.base;
    if (prev.id === undefined) delete process.env.IMGSTUDIO_PROVIDER_ID;
    else process.env.IMGSTUDIO_PROVIDER_ID = prev.id;
    if (prev.res !== undefined) process.env.TIDO_IMAGE_OUTPUT_RESOLUTION = prev.res;
    if (prev.qual !== undefined) process.env.TIDO_IMAGE_OUTPUT_QUALITY = prev.qual;
  }

  return out;
}

const png = (name: string) => ({
  reference_id: name.toUpperCase(),
  // A 1x1 PNG. Real bytes, so the normalisation path runs.
  buffer: Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
      "0d0a2db40000000049454e44ae426082",
    "hex",
  ),
  mimeType: "image/png",
  filename: `${name}.png`,
});

async function main() {
  console.log("\n=== PROVIDER REQUEST FIXTURES ===\n");

  // ── Nano Banana 2: the rollback must be byte-identical ──────────────────
  console.log("-- Nano Banana 2 (rollback) --");

  await check("JSON body: exactly the five fields, with today's values", async () => {
    const c = await capture({ providerId: NANO_BANANA_2.providerId });
    assert.strictEqual(c.isMultipart, false, "a reference-free render must send JSON");
    assert.deepStrictEqual(c.fieldNames, ["prompt", "provider_id", "aspect_ratio", "resolution", "quality"]);
    assert.strictEqual(c.fields.provider_id, "flow-nano-banana-2");
    assert.strictEqual(c.fields.aspect_ratio, "1:1");
    assert.strictEqual(c.fields.resolution, "1K");
    // The value today's code sends. If this ever becomes "high" for NB2, the
    // rollback is no longer a rollback.
    assert.strictEqual(c.fields.quality, "standard");
    assert.ok(!("background" in c.fields), "background is not part of today's request");
    assert.ok(!("count" in c.fields), "count is not part of today's request");
    assert.strictEqual(c.url, "https://imgstudio.site/api/v1/images/generate");
  });

  await check("multipart body: the same five fields, in the same order, plus images", async () => {
    const c = await capture({ providerId: NANO_BANANA_2.providerId, references: [png("ref_a")] });
    assert.strictEqual(c.isMultipart, true);
    assert.deepStrictEqual(c.fieldNames, [
      "prompt",
      "provider_id",
      "aspect_ratio",
      "resolution",
      "quality",
      "images",
    ]);
    assert.strictEqual(c.fields.provider_id, "flow-nano-banana-2");
    assert.strictEqual(c.fields.resolution, "1K");
    assert.strictEqual(c.fields.quality, "standard");
    assert.strictEqual(c.imageCount, 1);
    assert.strictEqual(c.url, "https://imgstudio.site/api/v1/images/edit");
  });

  await check("the Authorization and Idempotency-Key headers are unchanged", async () => {
    const c = await capture({ providerId: NANO_BANANA_2.providerId });
    assert.deepStrictEqual(c.headerNames, ["Authorization", "Content-Type", "Idempotency-Key"]);
  });

  await check("three references still fit Nano Banana 2's own ceiling", async () => {
    const c = await capture({
      providerId: NANO_BANANA_2.providerId,
      references: [png("a"), png("b"), png("c")],
    });
    assert.strictEqual(c.imageCount, 3, "NB2 accepts 3; packing must not have been triggered");
  });

  // ── Sunburst: only what the probe proved ────────────────────────────────
  console.log("\n-- GPT-Image-2.5-Sunburst --");

  await check("the provider id and the profile's values are what is sent", async () => {
    const c = await capture({ providerId: SUNBURST.providerId });
    assert.strictEqual(c.fields.provider_id, "0927e191-1aef-4c56-a3ac-df0c47d84e80");
    assert.strictEqual(c.fields.resolution, SUNBURST.resolutionTier);
    assert.strictEqual(c.fields.resolution, "1K");
    // Sent exactly as the ImgStudio web UI sends it, per the profile.
    assert.strictEqual(c.fields.quality, SUNBURST.quality);
    assert.strictEqual(c.fields.quality, "high");
  });

  await check("background and count are NOT sent: measured accepted and inert", async () => {
    const c = await capture({ providerId: SUNBURST.providerId, references: [png("a")] });
    assert.ok(!c.fieldNames.includes("background"), "03 §2.2 measured no effect; do not send it");
    assert.ok(!c.fieldNames.includes("count"), "03 §2.2 measured no effect; do not send it");
    assert.ok(!c.fieldNames.includes("size"), "03 §2.2: the size field is accepted and ignored");
  });

  await check("the field set is identical between the two models — only values differ", async () => {
    const nb2 = await capture({ providerId: NANO_BANANA_2.providerId, references: [png("a")] });
    const sun = await capture({ providerId: SUNBURST.providerId, references: [png("a")] });
    assert.deepStrictEqual(sun.fieldNames, nb2.fieldNames, "the two models must use one request shape");
    assert.notStrictEqual(sun.fields.provider_id, nb2.fields.provider_id);
    assert.notStrictEqual(sun.fields.quality, nb2.fields.quality);
  });

  await check("every ratio the profile allows is sent through unchanged", async () => {
    for (const ratio of SUNBURST.ratios) {
      const c = await capture({ providerId: SUNBURST.providerId, aspectRatio: ratio });
      assert.strictEqual(c.fields.aspect_ratio, ratio);
    }
  });

  await check("a ratio the profile forbids is refused before the wire", async () => {
    // 4:5 was answered with HTTP 400 "Tỷ lệ ảnh không hợp lệ" (03 §2.2). It must
    // never reach the provider.
    const c = await capture({ providerId: SUNBURST.providerId, aspectRatio: "4:5" });
    assert.strictEqual(c.url, "", "a 4:5 render reached the provider");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  if (failed) process.exit(1);
}

main();
