import fs from "fs";
import path from "path";
import { LocalGeneratedImageStorage } from "./storage/LocalGeneratedImageStorage";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function sanitizeFilename(brandName?: string, productName?: string): string {
  const cleanBrand = (brandName || "TIDO")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const cleanProduct = (productName || "Commercial_Image")
    .trim()
    .replace(/[^A-Z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${cleanBrand}_${cleanProduct}_Commercial_Image_2K.png`;
}

async function runDownloadFunctionTests() {
  console.log("========================================================================");
  console.log("TIDO LAYER 1 — PHASE 2 PICTURE ENGINE DOWNLOAD FUNCTION AUDIT & TEST");
  console.log("========================================================================");

  // TEST 1: Filename Formatting (Meaningful & Clean)
  console.log("\n[TEST 1] Filename Sanitize & Formatting");
  const filename1 = sanitizeFilename("SKIN1004", "CENTELLA");
  assert(filename1 === "SKIN1004_CENTELLA_Commercial_Image_2K.png", `Expected 'SKIN1004_CENTELLA_Commercial_Image_2K.png', got '${filename1}'`);

  const filename2 = sanitizeFilename("TIDO Premium Tea", "Trà Việt Nam Cao Cấp!");
  assert(filename2 === "TIDO_PREMIUM_TEA_Tr_Vi_t_Nam_Cao_C_p_Commercial_Image_2K.png", `Filename correctly sanitized: '${filename2}'`);

  // TEST 2: Local Storage Asset Integrity
  console.log("\n[TEST 2] Storage Asset Integrity (Original Resolution Preservation)");
  const storage = new LocalGeneratedImageStorage();
  const dummyGenId = `test_download_${Date.now()}`;
  const dummyBuffer = Buffer.from("PNG_RAW_IMAGE_DATA_2K_PRO");
  
  const saveRes = await storage.saveAsset({
    generation_id: dummyGenId,
    imageBuffer: dummyBuffer,
    mimeType: "image/png",
    masterPrompt: "# Test Prompt",
    metadata: { test: true },
  });

  assert(saveRes.url === `/api/image/generated/${dummyGenId}`, `Asset saved at URL '${saveRes.url}'`);

  const assetPath = storage.getAssetPath(dummyGenId);
  assert(fs.existsSync(assetPath!), "Asset file exists on local storage disk");

  const readBuffer = fs.readFileSync(assetPath!);
  assert(readBuffer.equals(dummyBuffer), "Downloaded binary buffer matches stored buffer 100% (Zero quality loss)");

  // Clean up dummy test asset folder
  const targetDir = path.dirname(assetPath!);
  fs.rmSync(targetDir, { recursive: true, force: true });

  console.log("\n========================================================================");
  console.log("🎉 ALL DOWNLOAD FUNCTION TESTS PASSED SUCCESSFULLY (100%)");
  console.log("========================================================================");
}

runDownloadFunctionTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
