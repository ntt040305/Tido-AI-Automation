import fs from "fs";
import path from "path";
import { defaultKnowledgeRouterService } from "./service/KnowledgeRouterService";
import { RouterInput } from "./types";

export async function runLiveRouterTest() {
  console.log("\n=================================================");
  console.log("🌐 RUNNING STAGE 2 LIVE GEMINI ROUTER TEST");
  console.log("=================================================\n");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey.includes("xxxxxxxx")) {
    console.log("⚠️  GEMINI_API_KEY not configured in .env.local.");
    console.log("    Skipping live API call. Unit tests verified all offline logic.\n");
    return;
  }

  // Create a minimal valid 1x1 PNG image buffer for live router testing
  // PNG header + IHDR + IDAT + IEND
  const samplePngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const sampleBuffer = Buffer.from(samplePngBase64, "base64");

  const testInput: RouterInput = {
    images: [
      {
        buffer: sampleBuffer,
        mimeType: "image/png",
        filename: "test_sample_glass_bottle.png",
      },
    ],
    brief: "Sample beverage testing brief: Cold brew coffee in clear glass bottle",
    brandName: "TIDO Coffee",
    productCount: 1,
    useCase: "Social Post",
  };

  console.log("Calling Gemini 3.6 Flash Knowledge Router API...");
  const result = await defaultKnowledgeRouterService.analyzeProductReferences(testInput);

  if (!result.success) {
    console.error("❌ Live Router Call Failed:", result.error);
    return;
  }

  console.log("\n✅ LIVE ROUTER CALL SUCCESSFUL!");
  console.log(`   Model: ${result.meta?.model}`);
  console.log(`   Duration: ${result.meta?.durationMs}ms`);
  console.log(`   Routing Mode: ${result.routing?.routing_mode}`);
  console.log(`   Products Detected: ${result.routing?.products?.length}`);

  if (result.routing) {
    const prod = result.routing.products[0];
    console.log(`\n   Product 01 ID: ${prod?.product_id}`);
    console.log(`   Summary: ${prod?.summary}`);
    console.log(`   Materials: ${prod?.materials?.map((m) => `${m.value} (${Math.round(m.confidence * 100)}%)`).join(", ")}`);
    console.log(`   Contents: ${prod?.contents?.map((c) => `${c.value} (${Math.round(c.confidence * 100)}%)`).join(", ")}`);
    console.log(`   Visual Challenges: ${prod?.visual_challenges?.map((vc) => `${vc.id}: ${vc.description}`).join("; ")}`);
    console.log(`   Unknowns: ${prod?.unknowns?.map((unk) => `${unk.subject} (${unk.importance})`).join("; ")}`);
    console.log(`   Retrieval Queries: ${prod?.retrieval_queries?.map((q) => `"${q.query}" [${q.importance}]`).join(" | ")}`);

    // Save sample_routing_output.json
    const sampleOutputPath = path.resolve(process.cwd(), "sample_routing_output.json");
    fs.writeFileSync(sampleOutputPath, JSON.stringify(result.routing, null, 2), "utf-8");
    console.log(`\n📁 Saved live sample routing output to: ${sampleOutputPath}`);
  }

  console.log("\n=================================================\n");
}

if (require.main === module) {
  runLiveRouterTest().catch((err) => {
    console.error(err);
  });
}
