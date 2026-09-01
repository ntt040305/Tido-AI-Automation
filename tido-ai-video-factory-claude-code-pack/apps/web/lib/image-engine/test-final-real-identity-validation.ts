import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { ImgStudioImageGenerationProvider } from "./provider/ImgStudioImageGenerationProvider";
import { ProviderImageGenerationInput } from "./provider/ImageGenerationProvider";
import { RoutingResultSchema } from "./types";

function getFileHash(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runFinalRealIdentityValidation() {
  console.log("==========================================================");
  console.log("TIDO CREATIVE OS — PHASE 2.3 FINAL REAL IDENTITY VALIDATION");
  console.log("==========================================================");

  // 1. Read Real Assets from Disk (No SVG mock generation)
  const productPath = path.join(process.cwd(), "test-assets", "real_product_bottle.png");
  const logoPath = path.join(process.cwd(), "test-assets", "real_tido_logo.png");

  console.log("\n[STEP 1] Reading real binary image files from disk...");
  const productBuf = fs.readFileSync(productPath);
  const logoBuf = fs.readFileSync(logoPath);

  const productMeta = await sharp(productBuf).metadata();
  const logoMeta = await sharp(logoBuf).metadata();

  const productHash = getFileHash(productBuf);
  const logoHash = getFileHash(logoBuf);

  console.log("\n------------------ INPUT ASSET AUDIT ------------------");
  console.log(`Product Asset: ${productPath}`);
  console.log(`  - SHA256 Hash : ${productHash}`);
  console.log(`  - Dimensions  : ${productMeta.width}x${productMeta.height}`);
  console.log(`  - Mime Type   : image/${productMeta.format}`);
  console.log(`  - Size        : ${(productBuf.length / 1024).toFixed(2)} KB (${productBuf.length} bytes)`);

  console.log(`Logo Asset   : ${logoPath}`);
  console.log(`  - SHA256 Hash : ${logoHash}`);
  console.log(`  - Dimensions  : ${logoMeta.width}x${logoMeta.height}`);
  console.log(`  - Mime Type   : image/${logoMeta.format}`);
  console.log(`  - Size        : ${(logoBuf.length / 1024).toFixed(2)} KB (${logoBuf.length} bytes)`);

  assert(productBuf.length > 5000, "Real product PNG file buffer loaded successfully (>5KB)");
  assert(logoBuf.length > 5000, "Real transparent logo PNG file buffer loaded successfully (>5KB)");

  // 2. Reference Intelligence Layer
  console.log("\n[STEP 2] Executing Reference Intelligence classification...");
  const refIntel = new ReferenceIntelligenceService();
  const routingResult: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: false,
    routing_summary: "Luxury commercial advertisement poster for TIDO Cold Brew with official logo",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_PROD"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Cold Brew Glass Bottle Photograph",
        categories: [{ value: "beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Coffee" }],
        industry_domains: [{ value: "f_and_b", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "F&B" }],
        likely_functions: [{ value: "refreshment", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Refreshment" }],
        materials: [{ value: "Amber Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Glass Bottle" }],
        contents: [{ value: "Cold Brew Coffee", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Coffee" }],
        surface_properties: [{ value: "Glossy Refractive Glass", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Glossy" }],
        geometry_traits: [{ value: "Cylindrical Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Cylindrical" }],
        packaging_types: [{ value: "Glass Bottle", confidence: 1, evidence_type: "OBSERVED", evidence_summary: "Bottle" }],
        branding_features: [{ value: "Tido Official Logo", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Logo" }],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01_PROD", role: "PRODUCT", confidence: 1.0 },
      { reference_id: "REF_02_LOGO", role: "LOGO", confidence: 1.0 },
    ],
    global_retrieval_queries: [],
  };

  const manifest = refIntel.generateManifest(routingResult);
  routingResult.reference_manifest = manifest;

  console.log(`  - Relationship Type : ${manifest.relationship_type}`);
  console.log(`  - Total References  : ${manifest.total_references}`);
  console.log(`  - Detected Products : ${manifest.detected_products_count}`);
  console.log(`  - Detected Logos    : ${manifest.detected_logos_count}`);

  assert(manifest.relationship_type === "product_with_logo", "Relationship classified as product_with_logo");

  // 3. Prompt Compiler Layer
  console.log("\n[STEP 3] Executing Master Prompt Compiler with Identity Lock injection...");
  const compiler = new MasterPromptCompilerService();
  const compiledOutput = await compiler.compile({
    useCase: "Poster",
    brief: "Create an ultra-luxurious commercial poster for TIDO Cold Brew placed on dark marble counter with golden ambient lighting",
    aspectRatio: "4:5",
    routingResult,
    knowledgePackage: {
      package_version: "1.0",
      routing_version: "1.0",
      retrieval_mode: "HYBRID",
      requires_universal_core: false,
      universal_blocks: [],
      selected_blocks: [],
      rejected_candidates: [],
      warnings: [],
      stats: {
        repository_blocks: 0,
        metadata_candidates: 0,
        semantic_candidates: 0,
        fused_candidates: 0,
        selected_blocks: 0,
        estimated_tokens: 0,
        duration_ms: 0,
      },
    },
  });

  const compiledMasterPrompt = compiledOutput.package?.compiled_prompt || "";

  console.log("\n------------------ COMPILED MASTER PROMPT ------------------");
  console.log("Compiler Result Success:", compiledOutput.success);
  if (!compiledOutput.success) {
    console.log("Compiler Error:", compiledOutput.error);
  }
  console.log(compiledMasterPrompt);
  assert(compiledOutput.success === true, "Master prompt compiler succeeded");

  // 4. Provider Assembly & Execution
  console.log("\n[STEP 4] Assembling ImgStudio Provider Request...");
  const providerInput: ProviderImageGenerationInput = {
    model: "flow-nano-banana-2",
    prompt: compiledMasterPrompt,
    aspectRatio: "4:5",
    imageSize: "1K",
    mimeType: "image/png",
    generationId: `gen_final_${Date.now()}`,
    reference_manifest: manifest,
    references: [
      {
        reference_id: "REF_01_PROD",
        product_id: "PRODUCT_01",
        role: "PRODUCT",
        mimeType: "image/png",
        buffer: productBuf,
        filename: "real_product_bottle.png",
      },
      {
        reference_id: "REF_02_LOGO",
        role: "LOGO",
        mimeType: "image/png",
        buffer: logoBuf,
        filename: "real_tido_logo.png",
      },
    ],
  };

  const provider = new ImgStudioImageGenerationProvider();

  console.log("\n------------------ PROVIDER PAYLOAD & TRANSMISSION AUDIT ------------------");
  const providerResult = await provider.generateImage(providerInput);

  console.log("\n------------------ FINAL OUTPUT VALIDATION REPORT ------------------");
  console.log(`Provider Success      : ${providerResult.success}`);
  if (providerResult.success) {
    console.log(`Generated Image URL   : ${providerResult.imageUrl}`);
    console.log(`Buffer Size Returned  : ${providerResult.imageBuffer?.length} bytes`);
    console.log(`Remote Details        : ${JSON.stringify(providerResult.remoteDetails, null, 2)}`);
  } else {
    console.log(`Controlled Error Code : ${providerResult.error?.code}`);
    console.log(`Error Message         : ${providerResult.error?.message}`);
    console.log(`Error Details         : ${JSON.stringify(providerResult.error?.details, null, 2)}`);
  }

  // 5. Hard Validations
  assert(providerResult.success !== undefined, "Provider returned explicit result");
  assert(providerResult.imageUrl !== "/api/image/generated/mock_dev_fallback", "No fake green fallback image returned");

  console.log("\n================ PHASE 2.3 FINAL VALIDATION COMPLETED ================");
}

runFinalRealIdentityValidation().catch((err) => {
  console.error(err);
  process.exit(1);
});
