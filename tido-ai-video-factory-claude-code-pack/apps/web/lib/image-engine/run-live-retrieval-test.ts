import fs from "fs";
import path from "path";
import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import { EmbeddingService } from "./retrieval/EmbeddingService";

export async function runLiveRetrievalTest() {
  console.log("\n=================================================");
  console.log("⚡ STAGE 3 — LIVE KNOWLEDGE RETRIEVAL TEST & SAMPLE GENERATOR");
  console.log("=================================================\n");

  // Load Stage 2 routing output sample if available, or build benchmark sample
  const sampleRoutingPath = path.resolve(process.cwd(), "sample_routing_output.json");
  let routingInput: any = null;

  if (fs.existsSync(sampleRoutingPath)) {
    try {
      const raw = fs.readFileSync(sampleRoutingPath, "utf-8");
      routingInput = JSON.parse(raw);
      console.log("📄 Loaded Stage 2 'sample_routing_output.json'");
    } catch {
      console.log("⚠️ Could not parse sample_routing_output.json, using benchmark routing result.");
    }
  }

  if (!routingInput) {
    routingInput = {
      routing_version: "1.0",
      routing_mode: "HIGH_CONFIDENCE",
      requires_universal_core: true,
      routing_summary: "Transparent premium beverage glass bottle with liquid refraction challenges",
      products: [
        {
          product_id: "PROD_01",
          reference_ids: ["REF_01", "REF_02", "REF_03"],
          reference_relationship_confidence: 0.98,
          summary: "Glass cold brew coffee bottle",
          categories: [{ value: "beverage", confidence: 0.96, evidence_type: "OBSERVED" }],
          industry_domains: [{ value: "food_and_beverage", confidence: 0.95, evidence_type: "OBSERVED" }],
          likely_functions: [{ value: "container", confidence: 0.90, evidence_type: "OBSERVED" }],
          materials: [{ value: "glass", confidence: 0.96, evidence_type: "OBSERVED" }],
          contents: [{ value: "liquid", confidence: 0.92, evidence_type: "OBSERVED" }],
          surface_properties: [{ value: "transparent", confidence: 0.95, evidence_type: "OBSERVED" }],
          geometry_traits: [{ value: "cylindrical", confidence: 0.90, evidence_type: "OBSERVED" }],
          packaging_types: [{ value: "bottle", confidence: 0.95, evidence_type: "OBSERVED" }],
          branding_features: [],
          visual_challenges: [
            {
              id: "transparent_glass_realism",
              description: "Glass transparency, surface reflections, and liquid light refraction",
              confidence: 0.94,
            },
          ],
          unknowns: [],
          retrieval_queries: [
            {
              query: "Glass transparency optical principles edge definition refraction",
              importance: "PRIMARY",
              reason: "Core glass challenge",
            },
          ],
        },
      ],
      global_retrieval_queries: [],
    };
  }

  // If GEMINI_API_KEY is not set, use deterministic mock embeddings
  if (!process.env.GEMINI_API_KEY) {
    console.log("ℹ️ GEMINI_API_KEY not set: Using mock embedding provider for sample generation.");
    EmbeddingService.setMockProvider(async (text: string) => {
      const vec = new Array(768).fill(0);
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }
      for (let i = 0; i < 768; i++) {
        vec[i] = Math.sin(hash + i * 0.1);
      }
      return vec;
    });
  }

  const result = await SmartKnowledgeRetriever.retrieve(routingInput);

  if (!result.success || !result.package) {
    console.error("❌ Knowledge retrieval failed:", result.error);
    process.exit(1);
  }

  console.log("\n✅ Knowledge Package generated successfully:");
  console.log(`   Mode:             ${result.package.retrieval_mode}`);
  console.log(`   Selected Blocks:  ${result.package.stats.selected_blocks}`);
  console.log(`   Estimated Tokens: ${result.package.stats.estimated_tokens}`);
  console.log(`   Duration:         ${result.package.stats.duration_ms}ms`);

  const samplePackagePath = path.resolve(process.cwd(), "sample_knowledge_package.json");
  fs.writeFileSync(samplePackagePath, JSON.stringify(result.package, null, 2), "utf-8");
  console.log(`\n💾 Saved sanitized package to: ${samplePackagePath}`);
}

if (require.main === module) {
  runLiveRetrievalTest().catch((err) => {
    console.error("Live test failed:", err);
    process.exit(1);
  });
}
