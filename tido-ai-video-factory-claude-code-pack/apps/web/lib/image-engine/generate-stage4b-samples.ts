import fs from "fs";
import path from "path";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import {
  KnowledgePackageV1,
  MasterPromptCompilerInput,
  RoutingResultSchema,
  SelectedBlockEntry,
} from "./types";

const mockRoutingResult: RoutingResultSchema = {
  routing_version: "1.0",
  routing_mode: "HIGH_CONFIDENCE",
  requires_universal_core: true,
  products: [
    {
      product_id: "PRODUCT_01",
      reference_ids: ["REF_01", "REF_02"],
      reference_relationship_confidence: 0.98,
      summary: "Glass bottle containing cold brew coffee with printed paper label",
      categories: [
        { value: "Beverages", confidence: 0.98, evidence_type: "OBSERVED", evidence_summary: "Bottle label and coffee liquid visible" },
      ],
      industry_domains: [
        { value: "Food & Beverage", confidence: 0.98, evidence_type: "OBSERVED", evidence_summary: "Commercial beverage product" },
      ],
      likely_functions: [],
      materials: [
        { value: "Glass", confidence: 0.96, evidence_type: "OBSERVED", evidence_summary: "Clear glass bottle" },
        { value: "Paper", confidence: 0.92, evidence_type: "OBSERVED", evidence_summary: "Label material" },
      ],
      contents: [
        { value: "Liquid", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Dark coffee liquid" },
      ],
      surface_properties: [
        { value: "Transparent", confidence: 0.94, evidence_type: "OBSERVED", evidence_summary: "Clear glass bottle wall" },
      ],
      geometry_traits: [],
      packaging_types: [
        { value: "Bottle", confidence: 0.98, evidence_type: "OBSERVED", evidence_summary: "Cylindrical beverage bottle" },
      ],
      branding_features: [
        { value: "Logo", confidence: 0.95, evidence_type: "OBSERVED", evidence_summary: "Cafe Florian printed logo" },
      ],
      visual_challenges: [
        { id: "glass_refraction", description: "Complex light refraction and caustic highlights through transparent dark liquid", confidence: 0.95 },
      ],
      unknowns: [
        { subject: "Rear surface printed copy", reason: "Rear of bottle not shown in reference photos", importance: "HIGH" },
      ],
      retrieval_queries: [
        { query: "glass optics refraction liquid", importance: "PRIMARY", reason: "Glass beverage bottle rendering" },
      ],
    },
  ],
  global_retrieval_queries: [],
  routing_summary: "Single premium cold brew coffee product in a glass bottle.",
};

const mockUniversalBlocks: SelectedBlockEntry[] = [
  { id: "universal.commercial_visual_hierarchy", version: "1.0.1", title: "Universal Commercial Visual Hierarchy Principles", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: ["Mandatory Universal Core Block"], estimated_tokens: 232 },
  { id: "universal.camera_perspective_coherence", version: "1.0.1", title: "Universal Camera & Perspective Spatial Coherence", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: ["Mandatory Universal Core Block"], estimated_tokens: 240 },
  { id: "universal.lighting_material_readability", version: "1.0.1", title: "Universal Illumination & Material Surface Readability", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: ["Mandatory Universal Core Block"], estimated_tokens: 247 },
  { id: "universal.typography_graphic_integration", version: "1.0.1", title: "Universal Commercial Typography & Graphic Integration", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: ["Mandatory Universal Core Block"], estimated_tokens: 235 },
  { id: "universal.physical_scene_coherence", version: "1.0.1", title: "Universal Physical Scene & Environmental Coherence", knowledge_type: "UNIVERSAL", selection_tier: "UNIVERSAL", final_score: 1.0, scores: { metadata: 1, semantic: 1, signal_confidence: 1, information_value: 1, priority: 1, query_importance: 1, redundancy_penalty: 0 }, matched_signals: [], selection_reasons: ["Mandatory Universal Core Block"], estimated_tokens: 248 },
];

const mockSpecialistBlocks: SelectedBlockEntry[] = [
  { id: "material.glass", version: "1.0.0", title: "Glass Material Optics", knowledge_type: "MATERIAL", selection_tier: "PRIMARY", final_score: 0.88, scores: { metadata: 0.9, semantic: 0.85, signal_confidence: 0.9, information_value: 0.9, priority: 0.8, query_importance: 0.9, redundancy_penalty: 0 }, matched_signals: ["materials:Glass", "packaging_types:Bottle"], selection_reasons: ["High metadata and semantic match score"], estimated_tokens: 210 },
];

const mockKnowledgePackage: KnowledgePackageV1 = {
  package_version: "1.0",
  routing_version: "1.0",
  retrieval_mode: "HYBRID",
  requires_universal_core: true,
  universal_blocks: mockUniversalBlocks,
  selected_blocks: mockSpecialistBlocks,
  rejected_candidates: [
    { id: "property.transparent", final_score: 0.72, reason_code: "COVERED_BY_SELECTED_BLOCK", reason: "Covered by material.glass" },
  ],
  warnings: [],
  stats: { repository_blocks: 7, metadata_candidates: 2, semantic_candidates: 2, fused_candidates: 2, selected_blocks: 6, estimated_tokens: 1412, duration_ms: 14 },
};

export async function generateStage4BSamples() {
  const compiler = new MasterPromptCompilerService();

  const sampleInput: MasterPromptCompilerInput = {
    productReferences: [
      { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0 },
      { reference_id: "REF_02", product_id: "PRODUCT_01", input_index: 1 },
    ],
    brief: "Bộ đôi đồ uống Signature mùa hè, phong cách premium gần gũi dùng cho chiến dịch quảng cáo social post.",
    productCount: 1,
    copyItems: [
      { text: "Bộ đôi Signature", type: "headline" },
      { text: "49.000đ", type: "price" },
      { text: "Thử ngay hôm nay!", type: "cta" },
    ],
    brandName: "Cafe Florian",
    brandInfo: "Thương hiệu cà phê thủ công cao cấp dành cho giới trẻ.",
    hardRequirements: [
      "Giữ nguyên màu sắc và nhãn chai sản phẩm",
      "Logo Cafe Florian phải xuất hiện rõ nét",
      "Sản phẩm xuất hiện chính xác 1 chai hero",
    ],
    useCase: "Social Post",
    aspectRatio: "4:5",
    routingResult: mockRoutingResult,
    knowledgePackage: mockKnowledgePackage,
  };

  const result = await compiler.compile(sampleInput);

  if (!result.success || !result.package) {
    console.error("Failed to generate sample package:", result.error);
    process.exit(1);
  }

  const webAppRoot = process.cwd();

  // Save sample_compiled_generation_package.json
  const packageJsonPath = path.join(webAppRoot, "sample_compiled_generation_package.json");
  fs.writeFileSync(packageJsonPath, JSON.stringify(result.package, null, 2), "utf-8");
  console.log(`Saved sample package JSON to ${packageJsonPath}`);

  // Save sample_compiled_master_prompt.md
  const masterPromptMdPath = path.join(webAppRoot, "sample_compiled_master_prompt.md");
  fs.writeFileSync(masterPromptMdPath, result.package.compiled_prompt, "utf-8");
  console.log(`Saved sample Master Prompt MD to ${masterPromptMdPath}`);
}

if (require.main === module) {
  generateStage4BSamples().catch(console.error);
}
