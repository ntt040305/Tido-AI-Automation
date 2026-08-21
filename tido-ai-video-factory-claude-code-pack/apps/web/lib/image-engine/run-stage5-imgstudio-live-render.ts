import fs from "fs";
import path from "path";
import assert from "assert";
import sharp from "sharp";

// Load .env.local
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

async function runLiveImgStudioRender() {
  console.log("==================================================");
  console.log("TIDO IMAGE ENGINE — STAGE 5 IMGSTUDIO LIVE RENDER TEST");
  console.log("==================================================\n");

  const apiKey = process.env.IMGSTUDIO_API_KEY;
  if (!apiKey || apiKey === "YOUR_IMGSTUDIO_API_KEY") {
    console.error("[ERROR] IMGSTUDIO_API_KEY is not set in .env.local.");
    console.error("Please set IMGSTUDIO_API_KEY in .env.local to execute live render.");
    process.exit(1);
  }

  // Force provider to imgstudio
  process.env.TIDO_IMAGE_PROVIDER = "imgstudio";
  process.env.IMGSTUDIO_PROVIDER_ID = process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2";
  process.env.TIDO_IMAGE_OUTPUT_RESOLUTION = process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || "1K";
  process.env.TIDO_IMAGE_OUTPUT_QUALITY = process.env.TIDO_IMAGE_OUTPUT_QUALITY || "standard";

  // 1. Prepare TWO realistic Product Reference Images
  console.log("[1/6] Preparing TWO product reference images (REF_01, REF_02)...");

  const refBuf1 = await sharp({
    create: { width: 800, height: 1000, channels: 3, background: { r: 240, g: 235, b: 220 } },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="800" height="1000"><rect x="250" y="200" width="300" height="600" rx="40" fill="#2d5a27"/><text x="400" y="520" font-size="38" fill="#fff" font-family="sans-serif" text-anchor="middle">MATCHA SERUM</text></svg>'
        ),
      },
    ])
    .png()
    .toBuffer();

  const refBuf2 = await sharp({
    create: { width: 800, height: 1000, channels: 3, background: { r: 220, g: 235, b: 240 } },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="800" height="1000"><circle cx="400" cy="500" r="240" fill="#1e3a8a"/><text x="400" y="515" font-size="36" fill="#fff" font-family="sans-serif" text-anchor="middle">HYDRA CREAM</text></svg>'
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
      buffer: refBuf1,
      filename: "matcha_serum_ref01.png",
    },
    {
      reference_id: "REF_02",
      product_id: "PRODUCT_02",
      input_index: 1,
      mimeType: "image/png",
      buffer: refBuf2,
      filename: "hydra_cream_ref02.png",
    },
  ];

  // 2. Step A: Knowledge Router Analysis
  console.log("[2/6] Running Stage 2 Knowledge Router Analysis...");
  const routerResult = await defaultKnowledgeRouterService.analyzeProductReferences({
    images: [
      { buffer: refBuf1, mimeType: "image/png", filename: "matcha_serum_ref01.png" },
      { buffer: refBuf2, mimeType: "image/png", filename: "hydra_cream_ref02.png" },
    ],
    brief: "Bộ đôi dưỡng da thiên nhiên Serum Matcha & Cream Hydra trên nền đá cẩm thạch trắng sang trọng",
    brandName: "TIDO BEAUTY",
    productCount: 2,
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
    brief: "Bộ đôi dưỡng da thiên nhiên Serum Matcha & Cream Hydra trên nền đá cẩm thạch trắng sang trọng",
    brandName: "TIDO BEAUTY",
    productCount: 2,
    aspectRatio: "4:5",
    productReferences,
    routingResult: routerResult.routing,
    knowledgePackage: retrievalResult.package,
  };

  const compileResult = await compilerService.compile(compilerInput);
  if (!compileResult.success || !compileResult.package) {
    throw new Error(`Compiler failed: ${compileResult.error?.message}`);
  }

  // 5. Step D: Execute Live ImgStudio Render
  console.log("[5/6] Calling Live ImgStudio Provider (flow-nano-banana-2 / POST /api/v1/images/edit)...");

  const imageService = new ImageGenerationService();
  const genResult = await imageService.generateImage({
    productReferences,
    routingResult: routerResult.routing,
    knowledgePackage: retrievalResult.package,
    masterPromptPackage: compileResult.package,
    compilerInput,
  });

  if (genResult.status !== "SUCCEEDED" || !genResult.asset?.url) {
    console.error("\n[LIVE RENDER FAILED]");
    console.error("Error Code:", genResult.error?.code);
    console.error("Error Message:", genResult.error?.message);
    console.error("Error Details:", JSON.stringify(genResult.error?.details, null, 2));

    // Write failure report
    const failureReport = `# TIDO IMAGE ENGINE — STAGE 5 IMGSTUDIO LIVE REPORT (FAILURE)

- **Date/Time**: ${new Date().toISOString()}
- **Provider**: ImgStudio
- **Provider ID**: ${process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2"}
- **Endpoint**: ${process.env.IMGSTUDIO_BASE_URL || "https://imgstudio.site"}/api/v1/images/edit
- **Reference Count**: ${productReferences.length}
- **Status**: FAILED
- **Error Code**: ${genResult.error?.code}
- **Error Message**: ${genResult.error?.message}
- **Details**: ${JSON.stringify(genResult.error?.details || {})}
`;
    fs.writeFileSync(path.resolve(__dirname, "../../IMAGE_ENGINE_STAGE5_IMGSTUDIO_LIVE_REPORT.md"), failureReport);
    throw new Error(`Image Generation Failed: ${genResult.error?.code} - ${genResult.error?.message}`);
  }

  console.log("\n==================================================");
  console.log("LIVE IMGSTUDIO RENDER SUCCEEDED!");
  console.log("==================================================");
  console.log("Generation ID:", genResult.generation_id);
  console.log("Provider Name:", genResult.remote_details?.provider_name || genResult.provider.name);
  console.log("Model / Engine:", genResult.remote_details?.model || genResult.provider.model);
  console.log("Remote Image ID:", genResult.remote_details?.remote_image_id);
  console.log("Cost (VNĐ):", genResult.cost_vnd ?? genResult.remote_details?.cost_vnd);
  console.log("Balance (VNĐ):", genResult.balance_vnd ?? genResult.remote_details?.balance_vnd);
  console.log("Asset URL:", genResult.asset.url);
  console.log("Duration (ms):", genResult.timing.generation_duration_ms);

  // Verify saved files on disk
  const assetDir = path.join(IMAGE_ENGINE_CONFIG.GENERATED_DIR, genResult.generation_id);
  const outputFile = fs.readdirSync(assetDir).find((f) => f.startsWith("output."));
  assert(outputFile, "output file must exist in asset directory");
  const outputPath = path.join(assetDir, outputFile);
  const metaPath = path.join(assetDir, "metadata.json");
  const promptPath = path.join(assetDir, "master_prompt.md");

  assert(fs.existsSync(outputPath), "Output image file must exist on filesystem");
  assert(fs.existsSync(metaPath), "metadata.json must exist on filesystem");
  assert(fs.existsSync(promptPath), "master_prompt.md must exist on filesystem");

  const imageStats = fs.statSync(outputPath);
  console.log("Saved Image File Size:", imageStats.size, "bytes");
  console.log("Saved Asset Directory:", assetDir);

  // Write Success Report (IMAGE_ENGINE_STAGE5_IMGSTUDIO_LIVE_REPORT.md)
  const successReport = `# TIDO IMAGE ENGINE — STAGE 5 IMGSTUDIO LIVE REPORT

- **Provider**: ${genResult.remote_details?.provider_name || "ImgStudio"}
- **Provider ID**: ${process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2"}
- **Endpoint Used**: ${process.env.IMGSTUDIO_BASE_URL || "https://imgstudio.site"}/api/v1/images/edit
- **Reference Count**: ${productReferences.length} (REF_01, REF_02)
- **Generation ID**: \`${genResult.generation_id}\`
- **Remote Image ID**: \`${genResult.remote_details?.remote_image_id || "N/A"}\`
- **Model**: \`${genResult.remote_details?.model || "flow-nano-banana-2"}\`
- **Cost (VNĐ)**: ${genResult.cost_vnd ?? genResult.remote_details?.cost_vnd ?? 0} VNĐ
- **Balance (VNĐ)**: ${genResult.balance_vnd ?? genResult.remote_details?.balance_vnd ?? 0} VNĐ
- **Duration**: ${genResult.timing.generation_duration_ms}ms
- **Output Path**: \`${outputPath}\`
- **Frontend Preview Result**: Real image saved locally and downloadable at \`${genResult.asset.url}\`
- **Technical Result**: SUCCESS
`;

  const reportPath = path.resolve(__dirname, "../../IMAGE_ENGINE_STAGE5_IMGSTUDIO_LIVE_REPORT.md");
  fs.writeFileSync(reportPath, successReport);
  console.log("Report written to:", reportPath);

  return {
    generationId: genResult.generation_id,
    remoteImageId: genResult.remote_details?.remote_image_id,
    costVnd: genResult.cost_vnd,
    balanceVnd: genResult.balance_vnd,
    assetDir,
    reportPath,
  };
}

runLiveImgStudioRender().catch((err) => {
  console.error("\nLIVE RENDER ERROR:", err.message);
  process.exit(1);
});
