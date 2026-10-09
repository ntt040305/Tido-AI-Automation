import assert from "assert";
import sharp from "sharp";
import {
  ImageNormalizationService,
  NORMALIZATION_DEFAULTS,
  PROVIDER_LIMIT_BYTES,
} from "./service/ImageNormalizationService";
import { ProviderErrorClassifier, RETRY_BUDGET } from "./provider/ProviderErrorClassifier";
import { ReferenceImageProcessorService } from "./service/ReferenceImageProcessorService";

/**
 * CIOS Phase 4.0.7.1 — image transport reliability.
 *
 * The two failures under test are the ones that actually shipped: a preprocessor
 * that reported `compression_applied: false` on payloads that then 413'd, and a
 * retry loop that treated a 413 as a network blip and sent the identical bytes
 * three times.
 *
 * Images here are generated rather than fixtured. A real photograph committed to
 * the repository would make the byte thresholds depend on a JPEG nobody can
 * inspect in a diff; noise generated at a known size is reproducible and its
 * incompressibility is the property the test actually needs.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

/**
 * An image that does not compress away.
 *
 * Random pixels defeat JPEG's entropy coding, so the encoded size stays close to
 * the pixel count. A flat colour would compress to a few kilobytes at any
 * dimension and every size assertion below would pass for the wrong reason.
 */
async function noisyJpeg(width: number, height: number, quality = 100): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  let seed = 12345;
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = seed & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels } }).jpeg({ quality }).toBuffer();
}

/** A PNG with a real alpha channel. */
async function transparentPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 30, b: 40, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
}

async function main() {
  console.log("\nCIOS Phase 4.0.7.1 — image transport\n");

  // ── Normalization ────────────────────────────────────────────────────

  await check("A large JPEG is brought inside the per-image budget", async () => {
    const big = await noisyJpeg(5000, 3000);
    assert.ok(big.length > NORMALIZATION_DEFAULTS.maxImageBytes, `fixture only ${big.length} bytes`);
    const out = await ImageNormalizationService.normalizeOne({ reference_id: "REF_01", buffer: big });
    assert.strictEqual(out.compression_applied, true, "nothing was applied");
    assert.ok(
      out.after_size <= NORMALIZATION_DEFAULTS.maxImageBytes,
      `still ${out.after_size} bytes, over ${NORMALIZATION_DEFAULTS.maxImageBytes}`
    );
    const [w, h] = out.after_dimensions.split("x").map(Number);
    assert.ok(Math.max(w, h) <= NORMALIZATION_DEFAULTS.maxDimension, `longest side ${Math.max(w, h)}`);
  });

  await check("A small JPEG is left alone", async () => {
    const small = await noisyJpeg(400, 300, 80);
    const out = await ImageNormalizationService.normalizeOne({ reference_id: "REF_02", buffer: small });
    assert.strictEqual(out.compression_applied, false, "a small image was re-encoded for no reason");
    assert.strictEqual(out.after_size, small.length);
    assert.strictEqual(out.after_dimensions, "400x300");
  });

  await check("Aspect ratio survives normalization", async () => {
    const wide = await noisyJpeg(4000, 1000);
    const out = await ImageNormalizationService.normalizeOne({ reference_id: "REF_03", buffer: wide });
    const [w, h] = out.after_dimensions.split("x").map(Number);
    const before = 4000 / 1000;
    const after = w / h;
    assert.ok(Math.abs(before - after) < 0.02, `ratio moved from ${before} to ${after} (${out.after_dimensions})`);
  });

  await check("A small image is never enlarged to the cap", async () => {
    const tiny = await noisyJpeg(320, 240, 100);
    const out = await ImageNormalizationService.normalizeOne(
      { reference_id: "REF_04", buffer: tiny },
      { maxImageBytes: 1024 } // force the compression path
    );
    const [w, h] = out.after_dimensions.split("x").map(Number);
    assert.ok(w <= 320 && h <= 240, `enlarged to ${out.after_dimensions}`);
  });

  await check("Transparency is preserved rather than flattened onto black", async () => {
    const png = await transparentPng(3000, 3000);
    const out = await ImageNormalizationService.normalizeOne({ reference_id: "REF_05", buffer: png });
    assert.strictEqual(out.transparency_preserved, true, "alpha was not detected");
    assert.strictEqual(out.mimeType, "image/webp", `encoded as ${out.mimeType}, which drops alpha`);
    const meta = await sharp(out.buffer).metadata();
    assert.strictEqual(meta.hasAlpha, true, "the alpha channel did not survive the encode");
  });

  await check("Several images are normalized together", async () => {
    const images = await Promise.all([noisyJpeg(3000, 2000), noisyJpeg(2600, 2600), noisyJpeg(4000, 1500)]);
    const result = await ImageNormalizationService.normalizePayload(
      images.map((buffer, i) => ({ reference_id: `REF_${i + 1}`, buffer }))
    );
    assert.strictEqual(result.images.length, 3);
    for (const img of result.images) {
      assert.ok(img.after_size <= NORMALIZATION_DEFAULTS.maxImageBytes, `${img.reference_id} is ${img.after_size}`);
    }
  });

  // ── Payload guard ────────────────────────────────────────────────────

  await check("A payload already under the limit passes untouched", async () => {
    const images = await Promise.all([noisyJpeg(600, 400, 80), noisyJpeg(500, 500, 80)]);
    const result = await ImageNormalizationService.normalizePayload(
      images.map((buffer, i) => ({ reference_id: `REF_${i + 1}`, buffer }))
    );
    assert.strictEqual(result.guard.status, "PASS", result.guard.reason);
    assert.strictEqual(result.guard.original_total, result.guard.final_total);
  });

  await check("The payload the old rule let through is now compressed", async () => {
    // The exact shipped failure: four references, each ~3.1MB and so comfortably
    // under the old 10MB per-image ceiling, together 12.5MB — well over the
    // provider's 9.5MB body limit. Every one of these passed the old check.
    const images = await Promise.all([
      noisyJpeg(3400, 2600, 70),
      noisyJpeg(3400, 2600, 70),
      noisyJpeg(3400, 2600, 70),
      noisyJpeg(3400, 2600, 70),
    ]);
    const originalTotal = images.reduce((t, b) => t + b.length, 0);
    assert.ok(originalTotal > PROVIDER_LIMIT_BYTES, `fixture total only ${originalTotal}`);
    for (const b of images) {
      assert.ok(b.length < 10 * 1024 * 1024, "a fixture image would have tripped the old per-image rule");
    }

    const result = await ImageNormalizationService.normalizePayload(
      images.map((buffer, i) => ({ reference_id: `REF_${i + 1}`, buffer }))
    );
    assert.strictEqual(result.guard.status, "COMPRESSED", result.guard.reason);
    assert.ok(
      result.guard.final_total <= NORMALIZATION_DEFAULTS.maxTotalBytes,
      `final total ${result.guard.final_total} over budget`
    );
    assert.ok(result.guard.final_total < PROVIDER_LIMIT_BYTES, "still over the provider's own ceiling");
    assert.ok(
      result.images.every((i) => i.compression_applied),
      "compression_applied is false on an image that had to shrink"
    );
  });

  await check("An impossible payload is BLOCKED rather than sent", async () => {
    const images = await Promise.all([noisyJpeg(2000, 2000), noisyJpeg(2000, 2000)]);
    const result = await ImageNormalizationService.normalizePayload(
      images.map((buffer, i) => ({ reference_id: `REF_${i + 1}`, buffer })),
      { maxTotalBytes: 4096, maxImageBytes: 2048, maxDimension: 2048 }
    );
    assert.strictEqual(result.guard.status, "BLOCKED", result.guard.reason);
    assert.ok(result.guard.final_total > result.guard.limit);
  });

  await check("The preprocessor now reports the compression it actually did", async () => {
    // The symptom in the shipped logs was `compression_applied: false` beside a
    // 413. This is the same call the orchestrator makes.
    const images = await Promise.all([
      noisyJpeg(3400, 2600, 70),
      noisyJpeg(3400, 2600, 70),
      noisyJpeg(3400, 2600, 70),
      noisyJpeg(3400, 2600, 70),
    ]);
    const processor = new ReferenceImageProcessorService();
    const out = await processor.processReferenceImages(
      images.map((buffer, i) => ({ reference_id: `REF_0${i + 1}`, buffer, mimeType: "image/jpeg" }))
    );
    assert.strictEqual(out.processedImages.length, 4);
    assert.ok(
      out.diagnostics.every((d) => d.compression_applied),
      `compression_applied false: ${JSON.stringify(out.diagnostics)}`
    );
    const total = out.processedImages.reduce((t, p) => t + p.buffer.length, 0);
    assert.ok(total < PROVIDER_LIMIT_BYTES, `preprocessor emitted ${total} bytes, over the provider limit`);
  });

  // ── Error classification ─────────────────────────────────────────────

  await check("413 is PAYLOAD_TOO_LARGE and is not retried as sent", () => {
    const v = ProviderErrorClassifier.classify(413);
    assert.strictEqual(v.classification, "PAYLOAD_TOO_LARGE");
    assert.strictEqual(v.action, "NORMALIZE_AND_RETRY_ONCE");
    assert.strictEqual(v.retryable, false, "413 is marked retryable, which is the bug this replaces");
    assert.strictEqual(v.error_code, "IMAGE_PAYLOAD_TOO_LARGE");
    assert.strictEqual(v.stage, "IMAGE_PREPROCESSOR");
    assert.strictEqual(v.suggestion, "Images were compressed automatically");
  });

  await check("429 is RATE_LIMIT and retries with backoff", () => {
    const v = ProviderErrorClassifier.classify(429);
    assert.strictEqual(v.classification, "RATE_LIMIT");
    assert.strictEqual(v.action, "RETRY_WITH_BACKOFF");
    assert.strictEqual(v.retryable, true);
  });

  await check("500 is UPSTREAM_FAILURE with the documented response shape", () => {
    const v = ProviderErrorClassifier.classify(500);
    assert.strictEqual(v.classification, "UPSTREAM_FAILURE");
    assert.strictEqual(v.action, "RETRY_WITH_BACKOFF");
    assert.strictEqual(v.error_code, "PROVIDER_UPSTREAM_FAILURE");
    assert.strictEqual(v.stage, "IMG_PROVIDER");
    assert.strictEqual(v.suggestion, "Provider unavailable, retry later");
  });

  await check("400 stops", () => {
    const v = ProviderErrorClassifier.classify(400);
    assert.strictEqual(v.classification, "INVALID_REQUEST");
    assert.strictEqual(v.action, "STOP");
    assert.strictEqual(v.retryable, false);
  });

  await check("401 and 403 stop as auth errors", () => {
    for (const status of [401, 403]) {
      const v = ProviderErrorClassifier.classify(status);
      assert.strictEqual(v.classification, "AUTH_ERROR", `status ${status}`);
      assert.strictEqual(v.action, "STOP", `status ${status}`);
    }
  });

  await check("A thrown transport error is classified without a status", () => {
    const timeout = ProviderErrorClassifier.classifyThrown(new Error("PROVIDER_TIMEOUT"));
    assert.strictEqual(timeout.classification, "NETWORK_ERROR");
    assert.strictEqual(timeout.error_code, "PROVIDER_TIMEOUT");
    const dead = ProviderErrorClassifier.classifyThrown(new Error("fetch failed"));
    assert.strictEqual(dead.error_code, "PROVIDER_NETWORK_ERROR");
    assert.strictEqual(dead.retryable, true);
  });

  await check("A timeout is final: classified as not retryable", () => {
    // The reseller may already be rendering -- and charging for -- the request that
    // timed out on our side. A retry can pay for the same image twice, and a slower
    // model makes timeouts likelier. A connection that never opened is different:
    // nothing reached the provider, so that one may still be retried.
    const timeout = ProviderErrorClassifier.classifyThrown(new Error("PROVIDER_TIMEOUT"));
    assert.strictEqual(timeout.retryable, false);
    assert.strictEqual(timeout.action, "STOP");
    assert.strictEqual(ProviderErrorClassifier.mayRetry(timeout, 1), false);
    const dead = ProviderErrorClassifier.classifyThrown(new Error("fetch failed"));
    assert.strictEqual(dead.retryable, true, "a connection that never opened must stay retryable");
  });

  await check("The provider sends a timed-out render exactly once", async () => {
    const { ImgStudioImageGenerationProvider } = await import("./provider/ImgStudioImageGenerationProvider");
    const saved = {
      key: process.env.IMGSTUDIO_API_KEY,
      timeout: process.env.IMG_PROVIDER_TIMEOUT_MS,
      fetch: global.fetch,
    };
    let calls = 0;
    try {
      process.env.IMGSTUDIO_API_KEY = "test_key_not_real";
      process.env.IMG_PROVIDER_TIMEOUT_MS = "50";
      // Never answers, so every attempt ends in PROVIDER_TIMEOUT.
      global.fetch = (async () => {
        calls++;
        return new Promise<Response>(() => {});
      }) as typeof fetch;
      const out = await new ImgStudioImageGenerationProvider().generateImage({
        model: "flow-nano-banana-2",
        prompt: "test",
        references: [],
        aspectRatio: "1:1",
        imageSize: "1K",
        mimeType: "image/png",
        generationId: "gen_test_timeout",
      });
      assert.strictEqual(out.success, false);
      assert.strictEqual(calls, 1, `the provider was called ${calls} times for one timed-out render`);
      assert.strictEqual(out.error?.code, "PROVIDER_TIMEOUT");
    } finally {
      if (saved.key === undefined) delete process.env.IMGSTUDIO_API_KEY;
      else process.env.IMGSTUDIO_API_KEY = saved.key;
      if (saved.timeout === undefined) delete process.env.IMG_PROVIDER_TIMEOUT_MS;
      else process.env.IMG_PROVIDER_TIMEOUT_MS = saved.timeout;
      global.fetch = saved.fetch;
    }
  });

  // ── Retry policy ─────────────────────────────────────────────────────

  await check("413 is worth exactly one further attempt, and 400 none", () => {
    const payload = ProviderErrorClassifier.classify(413);
    assert.strictEqual(RETRY_BUDGET.PAYLOAD_TOO_LARGE, 1);
    assert.strictEqual(ProviderErrorClassifier.mayRetry(payload, 1), true, "no repair attempt allowed");
    assert.strictEqual(ProviderErrorClassifier.mayRetry(payload, 2), false, "413 retried more than once");

    const invalid = ProviderErrorClassifier.classify(400);
    assert.strictEqual(ProviderErrorClassifier.mayRetry(invalid, 1), false, "400 was retried");
  });

  await check("500 retries, then stops inside its budget", () => {
    const v = ProviderErrorClassifier.classify(500);
    assert.strictEqual(ProviderErrorClassifier.mayRetry(v, 1), true);
    assert.strictEqual(ProviderErrorClassifier.mayRetry(v, 2), true);
    assert.strictEqual(ProviderErrorClassifier.mayRetry(v, 3), false, "500 retried past its budget");
  });

  await check("Auth failures are never retried at any attempt number", () => {
    for (const status of [401, 403]) {
      const v = ProviderErrorClassifier.classify(status);
      for (let attempt = 1; attempt <= 5; attempt++) {
        assert.strictEqual(ProviderErrorClassifier.mayRetry(v, attempt), false, `status ${status}, attempt ${attempt}`);
      }
    }
  });

  await check("Every classification has a retry budget", () => {
    // A classification missing from the table reads `undefined` and every
    // comparison against it is false, which silently disables its retries.
    for (const status of [400, 401, 403, 413, 429, 500, 502, 418, 0]) {
      const v = ProviderErrorClassifier.classify(status);
      assert.strictEqual(
        typeof RETRY_BUDGET[v.classification],
        "number",
        `${v.classification} (status ${status}) has no budget`
      );
    }
  });

  console.log("\n" + "=".repeat(74));
  console.log(`${passed} passed, ${failed} failed`);
  console.log("=".repeat(74));
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main();
