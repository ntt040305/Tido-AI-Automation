import fs from "fs";
import path from "path";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { KnowledgePackageV1, RoutingResultSchema } from "./types";
import { PromptBudgetValidator } from "./compiler/PromptBudgetValidator";

const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "data/indexes/manifest.json"), "utf-8"));

const mockUniversalBlocks = manifest.knowledge_blocks
  .filter((b: any) => b.type === "UNIVERSAL")
  .map((b: any) => ({
    id: b.id,
    version: b.version,
    title: b.id,
    knowledge_type: "UNIVERSAL",
    selection_tier: "UNIVERSAL",
    final_score: 1.0,
    scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 },
    matched_signals: [],
    selection_reasons: [],
    estimated_tokens: 150,
  }));

const mockSpecialistBlocks = manifest.knowledge_blocks
  .filter((b: any) => b.type !== "UNIVERSAL")
  .map((b: any) => ({
    id: b.id,
    version: b.version,
    title: b.id,
    knowledge_type: b.type,
    selection_tier: "PRIMARY",
    final_score: 0.95,
    scores: { metadata: 1, semantic: 0.9, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 },
    matched_signals: [],
    selection_reasons: [],
    estimated_tokens: 200,
  }));

const mockHeavyKnowledge: KnowledgePackageV1 = {
  package_version: "1.0",
  routing_version: "1.0",
  retrieval_mode: "HYBRID",
  requires_universal_core: true,
  universal_blocks: mockUniversalBlocks,
  selected_blocks: mockSpecialistBlocks,
  rejected_candidates: [],
  warnings: [],
  stats: {
    repository_blocks: 7,
    metadata_candidates: 2,
    semantic_candidates: 5,
    fused_candidates: 7,
    selected_blocks: 7,
    estimated_tokens: 1200,
    duration_ms: 5,
  },
};

const mockHeavyRouting: RoutingResultSchema = {
  routing_version: "1.0",
  routing_mode: "HIGH_CONFIDENCE",
  requires_universal_core: true,
  products: [
    {
      product_id: "PRODUCT_01",
      reference_ids: ["REF_01", "REF_02"],
      reference_relationship_confidence: 1.0,
      summary: "Tido Premium Matcha Milk Tea Bottle",
      categories: ["BEVERAGE"],
      industry_domains: ["F&B"],
      likely_functions: ["DRINK"],
      materials: ["GLASS"],
      contents: ["MATCHA_MILK_TEA"],
      surface_properties: ["TRANSPARENT"],
      geometry_traits: ["CYLINDRICAL"],
      packaging_types: ["BOTTLE"],
      branding_features: ["TIDO_LOGO"],
      visual_challenges: [],
      unknowns: [],
      retrieval_queries: [],
    },
    {
      product_id: "PRODUCT_02",
      reference_ids: ["REF_03"],
      reference_relationship_confidence: 1.0,
      summary: "Tido Special Brown Sugar Pearl Boba Cup",
      categories: ["BEVERAGE"],
      industry_domains: ["F&B"],
      likely_functions: ["DRINK"],
      materials: ["PLASTIC"],
      contents: ["BROWN_SUGAR_BOBA"],
      surface_properties: ["TRANSPARENT"],
      geometry_traits: ["CUP"],
      packaging_types: ["CUP"],
      branding_features: ["TIDO_LOGO"],
      visual_challenges: [],
      unknowns: [],
      retrieval_queries: [],
    },
  ],
  global_retrieval_queries: [],
  routing_summary: "Dual beverage product campaign",
};

const productionInput = {
  productReferences: [
    { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0 },
    { reference_id: "REF_02", product_id: "PRODUCT_01", input_index: 1 },
    { reference_id: "REF_03", product_id: "PRODUCT_02", input_index: 2 },
  ],
  productCount: 2,
  brief: "Chiến dịch quảng cáo mùa thu sang trọng cho dòng sản phẩm trà sữa Tido Tea, không khí ấm áp, ánh sáng studio mềm mại.",
  hardRequirements: ["Chỉ sử dụng phông nền màu nâu kem ấm", "Sản phẩm đặt trên bàn gỗ sồi cao cấp"],
  copyItems: [
    { text: "Mùa thu đến", type: "headline" },
    { text: "Trải nghiệm món mới", type: "subheadline" },
    { text: "Trà sữa Caramel", type: "product_name" },
    { text: "49.000đ", type: "price" },
    { text: "Mua ngay", type: "cta" },
  ],
  brandName: "Tido Tea",
  brandInfo: "Thương hiệu trà sữa thủ công hàng đầu với nguyên liệu tự nhiên.",
  routingResult: mockHeavyRouting,
  knowledgePackage: mockHeavyKnowledge,
  outputContext: {
    intendedUseCase: "Social Media Campaign & Billboard",
    targetAspectRatio: "4:5",
  },
};

async function benchmark() {
  const compiler = new MasterPromptCompilerService();
  const res = await compiler.compile(productionInput as any);

  if (!res.success || !res.package) {
    console.error("Compilation failed:", res.error);
    return;
  }

  const prompt = res.package.compiled_prompt;
  console.log("=== V2.0.9 HEAVY PRODUCTION BENCHMARK ===");
  console.log("Total Prompt Characters:", prompt.length);

  const budget = PromptBudgetValidator.validate(prompt, {
    userBrief: productionInput.brief,
    userHardConstraints: productionInput.hardRequirements,
    brandInfo: productionInput.brandInfo,
    copyItems: productionInput.copyItems as any,
    knowledgeText: prompt.slice(prompt.indexOf("## PROFESSIONAL KNOWLEDGE")),
  });

  console.log("\nPrompt Budget Breakdown:");
  console.dir(budget, { depth: null });
}

benchmark();
