import assert from "assert";
import sharp from "sharp";
import { ImgStudioImageGenerationProvider } from "./provider/ImgStudioImageGenerationProvider";
import { resolveActiveProvider } from "./service/ImageGenerationService";
import { LocalGeneratedImageStorage } from "./storage/LocalGeneratedImageStorage";

async function runImgStudioUnitTests() {
  console.log("==================================================");
  console.log("TIDO IMAGE ENGINE — IMGSTUDIO PROVIDER AUTOMATED TESTS");
  console.log("==================================================\n");

  let passed = 0;
  let total = 0;

  function logPass(testName: string) {
    passed++;
    total++;
    console.log(`[PASS] Test ${total}: ${testName}`);
  }

  function logFail(testName: string, err: any) {
    total++;
    console.error(`[FAIL] Test ${total}: ${testName}\n`, err);
  }

  const origProvider = process.env.TIDO_IMAGE_PROVIDER;
  const origKey = process.env.IMGSTUDIO_API_KEY;
  const origBase = process.env.IMGSTUDIO_BASE_URL;
  const origProviderId = process.env.IMGSTUDIO_PROVIDER_ID;

  try {
    // Test 1: Provider resolution
    try {
      process.env.TIDO_IMAGE_PROVIDER = "imgstudio";
      const resolved = resolveActiveProvider();
      assert.strictEqual(resolved.name, "imgstudio");
      assert.strictEqual(resolved.model, "flow-nano-banana-2");
      assert(resolved.provider instanceof ImgStudioImageGenerationProvider);
      logPass("Provider selection resolves ImgStudioImageGenerationProvider when TIDO_IMAGE_PROVIDER=imgstudio");
    } catch (e) {
      logFail("Provider selection resolves ImgStudioImageGenerationProvider", e);
    }

    // Test 2: Missing API Key rejection
    try {
      delete process.env.IMGSTUDIO_API_KEY;
      const provider = new ImgStudioImageGenerationProvider();
      const res = await provider.generateImage({
        model: "flow-nano-banana-2",
        prompt: "test",
        references: [],
        aspectRatio: "4:5",
        imageSize: "1K",
        mimeType: "image/png",
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error?.code, "PROVIDER_NOT_CONFIGURED");
      logPass("Rejects call with PROVIDER_NOT_CONFIGURED when IMGSTUDIO_API_KEY is missing");
    } catch (e) {
      logFail("Missing API key rejection", e);
    }

    // Test 3: Mocked ImgStudio POST /api/v1/images/edit and GET download
    try {
      process.env.IMGSTUDIO_API_KEY = "test_imgstudio_key_123";
      process.env.IMGSTUDIO_BASE_URL = "https://imgstudio.site";
      process.env.IMGSTUDIO_PROVIDER_ID = "flow-nano-banana-2";

      const provider = new ImgStudioImageGenerationProvider();

      const sampleBuf1 = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
      }).png().toBuffer();

      const sampleBuf2 = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } },
      }).png().toBuffer();

      const sampleResultImgBuf = Buffer.from("FAKE_IMAGE_BYTES_FROM_IMGSTUDIO");
      const sampleArrayBuf = sampleResultImgBuf.buffer.slice(
        sampleResultImgBuf.byteOffset,
        sampleResultImgBuf.byteOffset + sampleResultImgBuf.byteLength
      );

      let capturedPostUrl = "";
      let capturedPostHeaders: any = null;
      let capturedGetUrl = "";
      let capturedGetHeaders: any = null;

      const origFetch = global.fetch;
      global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const u = url.toString();
        if (init?.method === "POST") {
          capturedPostUrl = u;
          capturedPostHeaders = init.headers;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: "remote_img_abc123",
              status: "completed",
              cost_vnd: 100,
              balance_vnd: 50000,
              url: "/api/v1/images/remote_img_abc123/file",
              provider_name: "Flow",
              model: "flow-nano-banana-2",
            }),
          } as Response;
        } else if (init?.method === "GET") {
          capturedGetUrl = u;
          capturedGetHeaders = init.headers;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "image/webp" }),
            arrayBuffer: async () => sampleArrayBuf,
          } as Response;
        }
        throw new Error("Unexpected fetch call");
      }) as typeof global.fetch;

      const res = await provider.generateImage({
        model: "flow-nano-banana-2",
        prompt: "Master Prompt V2 Exact Test",
        references: [
          { reference_id: "REF_01", product_id: "PRODUCT_01", mimeType: "image/png", buffer: sampleBuf1, filename: "ref1.png" },
          { reference_id: "REF_02", product_id: "PRODUCT_02", mimeType: "image/png", buffer: sampleBuf2, filename: "ref2.png" },
        ],
        aspectRatio: "4:5",
        imageSize: "1K",
        mimeType: "image/png",
        generationId: "imggen_test_123",
        idempotencyKey: "tido-imggen_test_123",
      });

      global.fetch = origFetch;

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.mimeType, "image/webp");
      assert(res.imageBuffer && res.imageBuffer.equals(sampleResultImgBuf), "Image buffer bytes must match downloaded sample");

      assert.strictEqual(capturedPostUrl, "https://imgstudio.site/api/v1/images/edit");
      assert.strictEqual(capturedPostHeaders["Authorization"], "Bearer test_imgstudio_key_123");
      assert.strictEqual(capturedPostHeaders["Idempotency-Key"], "tido-imggen_test_123");

      assert.strictEqual(capturedGetUrl, "https://imgstudio.site/api/v1/images/remote_img_abc123/file");
      assert.strictEqual(capturedGetHeaders["Authorization"], "Bearer test_imgstudio_key_123");

      assert.strictEqual(res.remoteDetails?.cost_vnd, 100);
      assert.strictEqual(res.remoteDetails?.balance_vnd, 50000);
      assert.strictEqual(res.remoteDetails?.remote_image_id, "remote_img_abc123");

      logPass("Full mock test POST /api/v1/images/edit + authorized GET download succeeds with cost/balance metadata");
    } catch (e) {
      logFail("Mocked ImgStudio POST /api/v1/images/edit and GET download", e);
    }
  } finally {
    if (origProvider) process.env.TIDO_IMAGE_PROVIDER = origProvider;
    if (origKey) process.env.IMGSTUDIO_API_KEY = origKey;
    if (origBase) process.env.IMGSTUDIO_BASE_URL = origBase;
    if (origProviderId) process.env.IMGSTUDIO_PROVIDER_ID = origProviderId;
  }

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log("==================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runImgStudioUnitTests();
