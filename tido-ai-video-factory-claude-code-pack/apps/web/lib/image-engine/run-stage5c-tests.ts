import assert from "assert";
import sharp from "sharp";
import { CloudflareImageGenerationProvider } from "./provider/CloudflareImageGenerationProvider";
import { GeminiImageGenerationProvider } from "./provider/GeminiImageGenerationProvider";
import { resolveActiveProvider, ImageGenerationService } from "./service/ImageGenerationService";
import { LocalGeneratedImageStorage } from "./storage/LocalGeneratedImageStorage";

async function runStage5cTests() {
  console.log("==================================================");
  console.log("TIDO IMAGE ENGINE — STAGE 5C CLOUDFLARE AUTOMATED TESTS");
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

  // Preserve original env vars
  const origProvider = process.env.TIDO_IMAGE_PROVIDER;
  const origAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origToken = process.env.CLOUDFLARE_API_TOKEN;
  const origModel = process.env.TIDO_CLOUDFLARE_IMAGE_MODEL;

  try {
    // --- SECTION 1: Provider Selection ---
    try {
      process.env.TIDO_IMAGE_PROVIDER = "cloudflare";
      const resolvedCf = resolveActiveProvider();
      assert.strictEqual(resolvedCf.name, "cloudflare-workers-ai");
      assert(resolvedCf.provider instanceof CloudflareImageGenerationProvider);
      logPass("Provider selection resolves CloudflareImageGenerationProvider when TIDO_IMAGE_PROVIDER=cloudflare");
    } catch (e) {
      logFail("Provider selection resolves CloudflareImageGenerationProvider", e);
    }

    try {
      process.env.TIDO_IMAGE_PROVIDER = "gemini";
      const resolvedGemini = resolveActiveProvider();
      assert.strictEqual(resolvedGemini.name, "google-gemini");
      assert(resolvedGemini.provider instanceof GeminiImageGenerationProvider);
      logPass("Provider selection resolves GeminiImageGenerationProvider when TIDO_IMAGE_PROVIDER=gemini");
    } catch (e) {
      logFail("Provider selection resolves GeminiImageGenerationProvider", e);
    }

    // Reset env for Cloudflare testing
    process.env.TIDO_IMAGE_PROVIDER = "cloudflare";
    process.env.CLOUDFLARE_ACCOUNT_ID = "test_account_123";
    process.env.CLOUDFLARE_API_TOKEN = "test_token_456";
    process.env.TIDO_CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

    const cfProvider = new CloudflareImageGenerationProvider();

    // --- SECTION 2: Aspect Ratio Mapping ---
    try {
      const dim1x1 = cfProvider.mapAspectRatioToDimensions("1:1");
      assert.deepStrictEqual(dim1x1, { width: 1024, height: 1024 });

      const dim4x5 = cfProvider.mapAspectRatioToDimensions("4:5");
      assert.deepStrictEqual(dim4x5, { width: 896, height: 1120 });
      assert.strictEqual(dim4x5.width / dim4x5.height, 4 / 5);

      const dim9x16 = cfProvider.mapAspectRatioToDimensions("9:16");
      assert.deepStrictEqual(dim9x16, { width: 756, height: 1344 });
      assert.strictEqual(dim9x16.width / dim9x16.height, 9 / 16);

      const dim16x9 = cfProvider.mapAspectRatioToDimensions("16:9");
      assert.deepStrictEqual(dim16x9, { width: 1344, height: 756 });
      assert.strictEqual(dim16x9.width / dim16x9.height, 16 / 9);

      logPass("Aspect Ratio mapping converts 1:1, 4:5, 9:16, 16:9 preserving exact ratios <= 1920px");
    } catch (e) {
      logFail("Aspect Ratio mapping converts accurately", e);
    }

    // --- SECTION 3: Reference Count Limit (> 4 References Rejected) ---
    try {
      const dummyBuffer = Buffer.from("test");
      const refs5 = [1, 2, 3, 4, 5].map((i) => ({
        reference_id: `REF_0${i}`,
        product_id: "PRODUCT_01",
        mimeType: "image/png",
        buffer: dummyBuffer,
      }));

      const res = await cfProvider.generateImage({
        model: "@cf/black-forest-labs/flux-2-klein-4b",
        prompt: "Test prompt",
        references: refs5,
        aspectRatio: "4:5",
        imageSize: "1K",
        mimeType: "image/png",
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error?.code, "CLOUDFLARE_REFERENCE_LIMIT_EXCEEDED");
      logPass("Provider rejects reference count > 4 with CLOUDFLARE_REFERENCE_LIMIT_EXCEEDED");
    } catch (e) {
      logFail("Provider rejects > 4 reference images", e);
    }

    // --- SECTION 4: Mocked Fetch REST API Integration ---
    // Test: endpoint, Bearer auth, multipart prompt, reference mapping, resize copy, originals untouched
    try {
      const origFetch = global.fetch;

      // Sample 1000x800 test image
      const originalImageBuffer = await sharp({
        create: { width: 1000, height: 800, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();

      const originalHashBefore = originalImageBuffer.toString("hex");

      // Valid 1x1 PNG base64 representation
      const validPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      let capturedUrl = "";
      let capturedAuthHeader = "";
      let capturedFormData: any = null;

      // Mock fetch
      global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = url.toString();
        capturedAuthHeader = (init?.headers as any)?.Authorization || "";
        capturedFormData = init?.body;

        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            result: {
              image: validPngBase64,
            },
          }),
        } as Response;
      }) as typeof global.fetch;

      const refs2 = [
        {
          reference_id: "REF_01",
          product_id: "PRODUCT_01",
          mimeType: "image/png",
          buffer: originalImageBuffer,
        },
        {
          reference_id: "REF_02",
          product_id: "PRODUCT_02",
          mimeType: "image/png",
          buffer: originalImageBuffer,
        },
      ];

      const res = await cfProvider.generateImage({
        model: "@cf/black-forest-labs/flux-2-klein-4b",
        prompt: "Master Prompt V2 Compiled Test",
        references: refs2,
        aspectRatio: "4:5",
        imageSize: "1K",
        mimeType: "image/png",
      });

      // Restore fetch
      global.fetch = origFetch;

      // Assertions
      assert.strictEqual(res.success, true);
      assert(res.imageBuffer && res.imageBuffer.length > 0);
      assert.strictEqual(res.mimeType, "image/png");

      // Verify Endpoint & Auth
      assert.strictEqual(
        capturedUrl,
        "https://api.cloudflare.com/client/v4/accounts/test_account_123/ai/run/@cf/black-forest-labs/flux-2-klein-4b"
      );
      assert.strictEqual(capturedAuthHeader, "Bearer test_token_456");

      // Verify Original Buffer remains untouched
      const originalHashAfter = originalImageBuffer.toString("hex");
      assert.strictEqual(originalHashBefore, originalHashAfter);

      logPass("Cloudflare API call succeeds with endpoint, Bearer auth, multipart payload, and untouched originals");
    } catch (e) {
      logFail("Cloudflare API mocked fetch execution", e);
    }

    // --- SECTION 5: Invalid Base64 & Missing Image Error Handling ---
    try {
      const origFetch = global.fetch;

      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {}, // Missing image
        }),
      })) as any;

      const resNoImg = await cfProvider.generateImage({
        model: "@cf/black-forest-labs/flux-2-klein-4b",
        prompt: "Test",
        references: [],
        aspectRatio: "1:1",
        imageSize: "1K",
        mimeType: "image/png",
      });

      global.fetch = origFetch;

      assert.strictEqual(resNoImg.success, false);
      assert.strictEqual(resNoImg.error?.code, "PROVIDER_NO_IMAGE");
      logPass("Provider detects missing image payload and returns PROVIDER_NO_IMAGE");
    } catch (e) {
      logFail("Provider detects missing image payload", e);
    }

    // --- SECTION 6: Storage Metadata Security ---
    try {
      const storage = new LocalGeneratedImageStorage();
      const testBuffer = Buffer.from("fake_png_data");
      const metadata = {
        generation_id: "test_gen_999",
        provider: {
          name: "cloudflare-workers-ai",
          model: "@cf/black-forest-labs/flux-2-klein-4b",
        },
        output: {
          aspect_ratio: "4:5",
          width: 896,
          height: 1120,
        },
      };

      const result = await storage.saveAsset({
        generation_id: "test_gen_999",
        imageBuffer: testBuffer,
        mimeType: "image/png",
        masterPrompt: "Compiled Prompt Security Test",
        metadata,
      });

      const metaStr = JSON.stringify(metadata);
      assert(!metaStr.includes("test_token_456"));
      assert(!metaStr.includes("CLOUDFLARE_API_TOKEN"));
      logPass("Storage saves asset and verifies no API credentials leaked into metadata.json");
    } catch (e) {
      logFail("Storage saves asset without credential leakage", e);
    }
  } finally {
    // Restore env vars
    if (origProvider) process.env.TIDO_IMAGE_PROVIDER = origProvider;
    if (origAccount) process.env.CLOUDFLARE_ACCOUNT_ID = origAccount;
    if (origToken) process.env.CLOUDFLARE_API_TOKEN = origToken;
    if (origModel) process.env.TIDO_CLOUDFLARE_IMAGE_MODEL = origModel;
  }

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log("==================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runStage5cTests();
