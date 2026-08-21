import fs from "fs";
import path from "path";
import assert from "assert";
import sharp from "sharp";

const envPath = path.resolve(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}
import { defaultKnowledgeRouterService } from "./service/KnowledgeRouterService";
import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { ImageGenerationService } from "./service/ImageGenerationService";
import { IMAGE_ENGINE_CONFIG } from "./config";

async function runLiveCloudflareRender() {
  console.log("==================================================");
  console.log("TIDO IMAGE ENGINE — STAGE 5C LIVE CLOUDFLARE RENDER TEST");
  console.log("==================================================\n");

  // 1. Create realistic Product Reference Image
  console.log("[1/6] Preparing product reference image...");
  const refImageBuffer = await sharp({
    create: { width: 800, height: 1000, channels: 3, background: { r: 180, g: 120, b: 60 } },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="800" height="1000"><rect x="200" y="200" width="400" height="600" rx="30" fill="#3b2314"/><text x="400" y="500" font-size="48" fill="#fff" text-anchor="middle">COLD BREW</text></svg>'
        ),
      },
    ])
    .png()
    .toBuffer();

  const productReferences = [
    {
      reference_id: "REF_01",
      product_id: "PRODUCT_01",
      input_index: 0,
      mimeType: "image/png",
      buffer: refImageBuffer,
      filename: "cold_brew_product.png",
    },
  ];

  // 2. Step A: Knowledge Router Analysis
  console.log("[2/6] Running Stage 2 Knowledge Router Analysis...");
  const routerResult = await defaultKnowledgeRouterService.analyzeProductReferences({
    images: [
      {
        buffer: refImageBuffer,
        mimeType: "image/png",
        filename: "cold_brew_product.png",
      },
    ],
    brief: "Sản phẩm cà phê đóng chai thủy tinh cao cấp trên bàn gỗ sồi sương mù buổi sáng",
    brandName: "TIDO COFFEE",
    productCount: 1,
  });

  if (!routerResult.success || !routerResult.routing) {
    throw new Error(`Router failed: ${routerResult.error?.message}`);
  }

  // 3. Step B: Smart Knowledge Retrieval
  console.log("[3/6] Running Stage 3 Smart Knowledge Retrieval...");
  const retrievalResult = await SmartKnowledgeRetriever.retrieve(routerResult.routing);

  if (!retrievalResult.success || !retrievalResult.package) {
    throw new Error(`Retrieval failed: ${retrievalResult.error?.message}`);
  }

  // 4. Step C: Master Prompt Compilation V2
  console.log("[4/6] Running Stage 4B Master Prompt Compiler...");
  const compilerService = new MasterPromptCompilerService();
  const compilerInput = {
    brief: "Sản phẩm cà phê đóng chai thủy tinh cao cấp trên bàn gỗ sồi sương mù buổi sáng",
    brandName: "TIDO COFFEE",
    productCount: 1,
    aspectRatio: "4:5",
    productReferences,
    routingResult: routerResult.routing,
    knowledgePackage: retrievalResult.package,
  };

  const compileResult = await compilerService.compile(compilerInput);
  if (!compileResult.success || !compileResult.package) {
    throw new Error(`Compiler failed: ${compileResult.error?.message}`);
  }

  // 5. Step D: Execute Live Cloudflare Workers AI Render
  console.log("[5/6] Calling Live Cloudflare Workers AI Provider (@cf/black-forest-labs/flux-2-klein-4b)...");
  process.env.TIDO_IMAGE_PROVIDER = "cloudflare";

  const imageService = new ImageGenerationService();
  const genResult = await imageService.generateImage({
    productReferences,
    routingResult: routerResult.routing,
    knowledgePackage: retrievalResult.package,
    masterPromptPackage: compileResult.package,
    compilerInput,
  });

  if (genResult.status !== "SUCCEEDED" || !genResult.asset?.url) {
    throw new Error(`Image Generation Failed: ${genResult.error?.code} - ${genResult.error?.message}`);
  }

  console.log("\n==================================================");
  console.log("LIVE CLOUDFLARE RENDER SUCCEEDED!");
  console.log("==================================================");
  console.log("Generation ID:", genResult.generation_id);
  console.log("Provider:", genResult.provider.name);
  console.log("Model:", genResult.provider.model);
  console.log("Asset URL:", genResult.asset.url);
  console.log("Duration (ms):", genResult.timing.generation_duration_ms);
  console.log("Dimensions:", `${genResult.output?.width}x${genResult.output?.height} (${genResult.output?.aspect_ratio})`);

  // Verify saved files on disk
  const assetDir = path.join(IMAGE_ENGINE_CONFIG.GENERATED_DIR, genResult.generation_id);
  const pngPath = path.join(assetDir, "output.png");
  const metaPath = path.join(assetDir, "metadata.json");
  const promptPath = path.join(assetDir, "master_prompt.md");

  assert(fs.existsSync(pngPath), "output.png must exist on filesystem");
  assert(fs.existsSync(metaPath), "metadata.json must exist on filesystem");
  assert(fs.existsSync(promptPath), "master_prompt.md must exist on filesystem");

  const imageStats = fs.statSync(pngPath);
  console.log("Output PNG File Size:", imageStats.size, "bytes");
  console.log("Saved Asset Directory:", assetDir);

  return {
    generationId: genResult.generation_id,
    provider: genResult.provider.name,
    model: genResult.provider.model,
    durationMs: genResult.timing.generation_duration_ms,
    width: genResult.output?.width,
    height: genResult.output?.height,
    aspectRatio: genResult.output?.aspect_ratio,
    pngSize: imageStats.size,
    assetDir,
    url: genResult.asset.url,
  };
}

runLiveCloudflareRender().catch((err) => {
  console.error("LIVE RENDER FAILED:", err);
  process.exit(1);
});
