import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { InspirationStyleIntelligenceService } from "./service/InspirationStyleIntelligenceService";
import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import { MasterPromptCompilerInput, RoutingResultSchema, SimpleInputRequestV1 } from "./types";

async function runAudit() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE V1 — PHASE 3.6 REAL OUTPUT DEBUG AUDIT");
  console.log("========================================================================\n");

  const inspirationService = new InspirationStyleIntelligenceService();
  const compiler = new MasterPromptCompilerService();

  // Mock Request with 1 Product Image (REF_01) and 1 Inspiration Image (REF_02)
  const mockRoutingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "SINGLE_PRODUCT" as any,
    routing_summary: "Single product with inspiration reference",
    global_retrieval_queries: [],
    requires_universal_core: false,
    products: [
      {
        product_id: "PRODUCT_BEVERAGE_CAN",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.98,
        summary: "Orange citrus sparkling water beverage aluminum can",
        categories: [{ value: "Beverage", confidence: 0.95, evidence_type: "DIRECT_VISUAL" as any, evidence_summary: "audit fixture" }],
        industry_domains: [{ value: "FMCG", confidence: 0.95, evidence_type: "DIRECT_VISUAL" as any, evidence_summary: "audit fixture" }],
        likely_functions: [{ value: "Hydration", confidence: 0.95, evidence_type: "DIRECT_VISUAL" as any, evidence_summary: "audit fixture" }],
        materials: [{ value: "Aluminum", confidence: 0.95, evidence_type: "DIRECT_VISUAL" as any, evidence_summary: "audit fixture" }],
        contents: [{ value: "Sparkling liquid", confidence: 0.95, evidence_type: "DIRECT_VISUAL" as any, evidence_summary: "audit fixture" }],
        surface_properties: [{ value: "Metallic condensation", confidence: 0.95, evidence_type: "DIRECT_VISUAL" as any, evidence_summary: "audit fixture" }],
        geometry_traits: [{ value: "Cylindrical", confidence: 0.95, evidence_type: "DIRECT_VISUAL" as any, evidence_summary: "audit fixture" }],
        packaging_types: [{ value: "Can", confidence: 0.95, evidence_type: "DIRECT_VISUAL" as any, evidence_summary: "audit fixture" }],
        branding_features: [{ value: "Orange Slice Logo", confidence: 0.95, evidence_type: "DIRECT_VISUAL" as any, evidence_summary: "audit fixture" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.98 },
      { reference_id: "REF_02", role: "INSPIRATION_REFERENCE", confidence: 0.95 },
    ],
  };

  const mockKnowledgePackage = {
    package_version: "1.0",
    routing_version: "1.0",
    universal_blocks: [],
    specialist_blocks: [],
    recipe_blocks: [],
  };

  // 1. Extract Inspiration Manifest
  console.log("=== 1. INSPIRATION STYLE MANIFEST OUTPUT ===");
  const testInspirationBuffer = Buffer.from("mock_inspiration_image_bytes_dark_neon_studio");
  const manifest = await inspirationService.analyzeStyle({
    imageBuffer: testInspirationBuffer,
    mimeType: "image/png",
    hintText: "Dark moody neon orange backlight with floating water splash droplets",
  });
  console.log(JSON.stringify(manifest, null, 2));

  // 2. Run Adapter & Compile Prompt
  const request: SimpleInputRequestV1 = {
    concept: "Tạo poster quảng cáo sản phẩm theo phong cách ảnh ý tưởng",
    useCase: "Poster",
    aspectRatio: "4:5",
    brandName: "Tido Citrus",
    images: [
      { reference_id: "REF_01", buffer: Buffer.from("product_bytes"), mimeType: "image/png" },
      { reference_id: "REF_02", buffer: testInspirationBuffer, mimeType: "image/png" },
    ],
  };

  const adapted = SimpleInputAdapterService.adapt(request, mockRoutingResult);

  const compilerInput: MasterPromptCompilerInput = {
    ...(adapted.compilerInput as MasterPromptCompilerInput),
    routingResult: mockRoutingResult,
    knowledgePackage: mockKnowledgePackage as any,
    hasInspirationReference: true,
    inspirationStyleManifest: manifest,
  };

  const compileRes = await compiler.compile(compilerInput);
  const finalPrompt = compileRes.package?.compiled_prompt || "";

  console.log("\n=== 2. MASTER PROMPT COMPILER FINAL OUTPUT (INSPIRATION SECTION) ===");
  const inspirationBlockStart = finalPrompt.indexOf("[INSPIRATION REFERENCE RULES]");
  if (inspirationBlockStart !== -1) {
    console.log(finalPrompt.slice(inspirationBlockStart, inspirationBlockStart + 900));
  } else {
    console.log("NOT FOUND: [INSPIRATION REFERENCE RULES] block is missing!");
  }

  // 3. Provider Payload Ordering Check
  console.log("\n=== 3. PROVIDER PAYLOAD ORDERING & ROLES ===");
  const supportRefs = adapted.supportReferences;
  const prodRefs = adapted.productCandidates;

  console.log("Attachment Index 1 (Image 1):", prodRefs[0]?.reference_id, "-> Role:", "PRODUCT");
  console.log("Attachment Index 2 (Image 2):", supportRefs[0]?.reference_id, "-> Role:", "INSPIRATION_REFERENCE");

  // 4. Mapping Verification in Prompt
  console.log("\n=== 4. EXPLICIT IMAGE-TO-ROLE MAPPING IN PROMPT ===");
  const isImage1MappedToProduct = finalPrompt.includes("Image 1 (REF_01): PRODUCT") || finalPrompt.includes("Image 1 (REF_01): PRODUCT_BEVERAGE_CAN identity reference");
  const isImage2MappedToStyle = finalPrompt.includes("Image 2 (REF_02): Supporting visual reference") || finalPrompt.includes("Image 2 (REF_02) is STYLE SOURCE");

  console.log("Does prompt map Image 1 explicitly as Product Source?:", isImage1MappedToProduct);
  console.log("Does prompt map Image 2 explicitly as Style Source?:", isImage2MappedToStyle);

  // 5. Generic vs Useful Evaluation
  console.log("\n=== 5. EXTRACTED STYLE DESCRIPTORS QUALITY EVALUATION ===");
  console.log("Composition:", manifest.composition);
  console.log("Lighting:", manifest.lighting);
  console.log("Camera:", manifest.camera);
  console.log("Color Mood:", manifest.colorMood);
  console.log("Environment:", manifest.environment);
  console.log("Visual Mood:", manifest.visualMood);

  console.log("\n========================================================================");
  console.log("AUDIT COMPLETE");
  console.log("========================================================================");
}

runAudit().catch(console.error);
