import fs from "fs";
import path from "path";
import sharp from "sharp";

// Load .env.local if not already in process.env
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

// Ensure LLM model is set for tsx execution
if (!process.env.LLM_MODEL) {
  process.env.LLM_MODEL = "gemini-3.7-flash-high";
}

import { PipelineRouter } from "../evolution/PipelineRouter";
import { LLMProviderService } from "../llm/llm-provider.service";

interface QualityTestCase {
  id: string;
  categoryName: string;
  concept: string;
  contentMessage: string;
  useCase: string;
  aspectRatio: string;
  brandName: string;
  productImage?: string;
  logoImage?: string;
}

const TEST_CASES: QualityTestCase[] = [
  {
    id: "01_premium_skincare",
    categoryName: "Premium Skincare",
    concept: "Tinh chất phục hồi da ban đêm cao cấp chiết xuất thực vật. Chai serum thủy tinh mờ đặt trên phiến đá tự nhiên trong ánh sáng hoàng hôn dịu nhẹ, tạo cảm giác sang trọng, tinh khiết và an yên.",
    contentMessage: "LUMIÈRE BOTANIQUE\nTinh Chất Phục Hồi Ban Đêm\nĐánh thức làn da rạng rỡ mỗi sớm mai",
    useCase: "Poster",
    aspectRatio: "9:16",
    brandName: "Lumière Botanique",
  },
  {
    id: "02_premium_coffee",
    categoryName: "Premium Coffee",
    concept: "Cà phê ủ lạnh thủ công cao cấp dành cho người sành điệu. Chai cà phê thủy tinh đặt trên bề mặt đá bazan mộc mạc, ánh nắng sớm chiếu nghiêng tạo bóng đổ nghệ thuật, không gian tĩnh lặng và tinh tế.",
    contentMessage: "ORIGIN BLEND\nCold Brew Thuần Khiết\nNghệ thuật thưởng thức nguyên bản",
    useCase: "Poster",
    aspectRatio: "1:1",
    brandName: "Origin Blend",
    productImage: "test-assets/real_product_bottle.png",
  },
  {
    id: "03_minimal_editorial",
    categoryName: "Minimal Editorial",
    concept: "Chiến dịch thời trang gốm sứ tối giản. Bình gốm kiến trúc mộc mạc trên bục đá phiến đen, ánh sáng studio góc thấp sắc nét, phong cách tạp chí kiến trúc Châu Âu.",
    contentMessage: "ATELIER FORME\nKhắc Họa Không Gian\nBộ sưu tập gốm thủ công 2026",
    useCase: "Poster",
    aspectRatio: "9:16",
    brandName: "Atelier Forme",
  },
  {
    id: "04_vietnamese_typography_stress",
    categoryName: "Vietnamese Typography Stress Test",
    concept: "Quảng cáo trà thảo mộc cổ truyền thượng hạng. Hộp trà và tách trà men ngọc trên bàn gỗ lũa cổ thụ, hơi nước bốc lên ấm áp giữa sương sớm vùng cao Tây Bắc.",
    contentMessage: "TRÀ THẢO MỘC CỔ THỤ\nVị ngọt lắng sâu, giữ trọn hương rừng\nChắt lọc tinh hoa từ vùng núi cao",
    useCase: "Poster",
    aspectRatio: "1:1",
    brandName: "Dược Liệu Việt",
  },
  {
    id: "05_multiproduct_composition",
    categoryName: "Multi-product Composition",
    concept: "Bộ ba sản phẩm chăm sóc nam giới cao cấp: sáp vuốt tóc, dầu dưỡng râu và nước hoa cổ điển. Sắp đặt hài hòa trên bàn gỗ sồi già và khay da thuộc, ánh sáng ấm áp lịch lãm.",
    contentMessage: "GENTLEMEN'S CARE\nBộ Ba Đẳng Cấp Phái Mạnh\nHoàn thiện phong thái lịch lãm mỗi ngày",
    useCase: "Poster",
    aspectRatio: "1:1",
    brandName: "Gentlemen's Care",
  },
  {
    id: "06_promotional_campaign",
    categoryName: "Promotional Campaign",
    concept: "Chiến dịch khuyến mãi hè rực rỡ cho kem chống nắng sinh học thế hệ mới. Chai kem chống nắng trên nền cát trắng tinh khiết cạnh làn nước biển trong vắt lấp lánh ánh nắng vàng.",
    contentMessage: "RỰC RỠ NẮNG HÈ\nƯu Đãi Đặc Biệt 20%\nBảo vệ toàn diện suốt 24 giờ",
    useCase: "Poster",
    aspectRatio: "9:16",
    brandName: "SunShield Pro",
  },
];

function countLlmCalls(): { stop: () => number } {
  const proto = LLMProviderService.prototype;
  const original = proto.generateChatCompletion;
  let n = 0;
  proto.generateChatCompletion = function (...args: unknown[]) {
    n++;
    return original.apply(this, args);
  };
  return {
    stop: () => {
      proto.generateChatCompletion = original;
      return n;
    },
  };
}

async function runTypographyTest() {
  console.log("========================================================================");
  console.log("TIDO TYPOGRAPHY ART DIRECTION QUALITY TEST — 6 PRODUCTION CATEGORIES");
  console.log("========================================================================");
  console.log(`LLM Model:    ${process.env.LLM_MODEL || "gemini-3.7-flash-high"}`);
  console.log(`Base URL:     ${process.env.IMGSTUDIO_BASE_URL || "https://imgstudio.site"}`);
  console.log(`Provider ID:  ${process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2"}`);
  console.log(`Resolution:   ${process.env.TIDO_IMAGE_OUTPUT_RESOLUTION || "1K"}`);
  console.log("Editable Post-Render compositing: DISABLED (Direct Nano Banana 2 flat render)");
  console.log("------------------------------------------------------------------------\n");

  const results: any[] = [];
  const outDir = path.resolve(process.cwd(), "data/benchmarks/typography-evaluation");
  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`[CATEGORY ${i + 1}/${TEST_CASES.length}] ${tc.categoryName} (${tc.id})`);
    console.log(`Concept: "${tc.concept.slice(0, 60)}..."`);
    console.log(`Content Message:\n${tc.contentMessage.split("\n").map(l => "  > " + l).join("\n")}`);

    const images: any[] = [];
    if (tc.productImage) {
      const p = path.resolve(process.cwd(), tc.productImage);
      if (fs.existsSync(p)) {
        images.push({
          reference_id: "REF_01_PROD",
          buffer: fs.readFileSync(p),
          mimeType: "image/png",
          filename: path.basename(p),
          role: "PRODUCT",
        });
      }
    }
    if (tc.logoImage) {
      const p = path.resolve(process.cwd(), tc.logoImage);
      if (fs.existsSync(p)) {
        images.push({
          reference_id: "REF_02_LOGO",
          buffer: fs.readFileSync(p),
          mimeType: "image/png",
          filename: path.basename(p),
          role: "LOGO",
        });
      }
    }

    const request = {
      images,
      concept: tc.concept,
      contentMessage: tc.contentMessage,
      useCase: tc.useCase,
      aspectRatio: tc.aspectRatio,
      brandName: tc.brandName,
      requestId: `typo_${tc.id}_${Date.now()}`,
    };

    const counter = countLlmCalls();
    const startTime = Date.now();
    let result: any = null;
    let llmCallCount = 0;

    try {
      result = await PipelineRouter.run(request as any, undefined, { deadlineAt: Date.now() + 280_000 });
    } catch (err: any) {
      console.error(`  ✗ Execution error:`, err?.message || err);
    } finally {
      llmCallCount = counter.stop();
    }

    const totalDurationMs = Date.now() - startTime;
    const genId = result?.generationId;

    let typographySection = "";
    let promptLength = 0;
    let imagePath = "";

    if (genId) {
      const srcDir = path.resolve(process.cwd(), "data/generated/image-renders", genId);
      const targetDir = path.join(outDir, tc.id);
      fs.mkdirSync(targetDir, { recursive: true });

      // Read master prompt
      const promptFile = path.join(srcDir, "master_prompt.md");
      if (fs.existsSync(promptFile)) {
        const promptContent = fs.readFileSync(promptFile, "utf-8");
        promptLength = promptContent.length;
        const match = promptContent.match(/## TYPOGRAPHY ART DIRECTION[\s\S]*?(?=\n## |\n---|$)/);
        if (match) {
          typographySection = match[0].trim();
        }
        fs.copyFileSync(promptFile, path.join(targetDir, "master_prompt.md"));
      }

      // Check output images
      const pngFile = path.join(srcDir, "output.png");
      const webpFile = path.join(srcDir, "output.webp");
      if (fs.existsSync(pngFile)) {
        imagePath = path.join(targetDir, "output.png");
        fs.copyFileSync(pngFile, imagePath);
      } else if (fs.existsSync(webpFile)) {
        imagePath = path.join(targetDir, "output.webp");
        fs.copyFileSync(webpFile, imagePath);
        // Also convert to PNG for easy viewing
        const pngTarget = path.join(targetDir, "output.png");
        try {
          await sharp(imagePath).png().toFile(pngTarget);
          imagePath = pngTarget;
        } catch (_) {}
      }
    }

    const isSuccess = Boolean(result?.success && (result?.imageUrl || result?.imageBuffer));

    console.log(`  ✓ Status:       ${isSuccess ? "SUCCESS" : "FAILED"}`);
    console.log(`  ✓ Duration:     ${(totalDurationMs / 1000).toFixed(2)}s`);
    console.log(`  ✓ LLM Calls:    ${llmCallCount}`);
    console.log(`  ✓ Prompt Size:  ${promptLength} chars`);
    console.log(`  ✓ Image Path:   ${imagePath || "None"}`);
    if (typographySection) {
      console.log(`  ✓ Typography Art Direction extracted (${typographySection.length} chars):`);
      console.log(typographySection.split("\n").slice(0, 8).map(l => "    | " + l).join("\n") + "\n    | ...");
    }

    results.push({
      id: tc.id,
      categoryName: tc.categoryName,
      success: isSuccess,
      durationMs: totalDurationMs,
      llmCalls: llmCallCount,
      promptLength,
      imagePath,
      imageUrl: result?.imageUrl,
      typographySection,
    });

    // Pause between renders
    if (i < TEST_CASES.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Save report
  fs.writeFileSync(
    path.join(outDir, "evaluation-summary.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2),
    "utf-8"
  );

  console.log("\n========================================================================");
  console.log("EVALUATION RUN COMPLETE");
  console.log(`Total Categories Tested: ${results.length}`);
  console.log(`Successes:               ${results.filter(r => r.success).length}`);
  console.log(`Summary written to:      ${path.join(outDir, "evaluation-summary.json")}`);
  console.log("========================================================================");
}

runTypographyTest().catch(err => {
  console.error("Test runner fatal error:", err);
  process.exit(1);
});
