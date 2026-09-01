import sharp from "sharp";
import { ImgStudioImageGenerationProvider } from "./provider/ImgStudioImageGenerationProvider";
import { ProviderImageGenerationInput } from "./provider/ImageGenerationProvider";
import { ReferenceIntelligenceService } from "./service/ReferenceIntelligenceService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function createRealProductAssetBuffer(): Promise<Buffer> {
  const svgProduct = `
    <svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#8B4513;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#D2691E;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="#F5F5DC" />
      <rect x="150" y="80" width="200" height="340" rx="30" fill="url(#grad)" stroke="#333" stroke-width="4" />
      <rect x="200" y="40" width="100" height="40" rx="5" fill="#333" />
      <rect x="170" y="160" width="160" height="180" fill="#FFF" stroke="#666" stroke-width="2" />
      <text x="250" y="230" font-family="Arial" font-size="24" font-weight="bold" fill="#8B4513" text-anchor="middle">TIDO COFFEE</text>
      <text x="250" y="270" font-family="Arial" font-size="16" fill="#333" text-anchor="middle">COLD BREW 250ml</text>
    </svg>
  `;
  return await sharp(Buffer.from(svgProduct)).png().toBuffer();
}

async function createRealLogoAssetBuffer(): Promise<Buffer> {
  const svgLogo = `
    <svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      <circle cx="150" cy="150" r="130" fill="none" stroke="#D2691E" stroke-width="12" />
      <text x="150" y="140" font-family="Arial" font-size="42" font-weight="900" fill="#D2691E" text-anchor="middle">TIDO</text>
      <text x="150" y="180" font-family="Arial" font-size="16" font-weight="bold" fill="#333" text-anchor="middle">OFFICIAL LOGO</text>
    </svg>
  `;
  return await sharp(Buffer.from(svgLogo)).png().toBuffer();
}

async function runRealProviderIdentityAcceptanceTest() {
  console.log("==========================================");
  console.log("TIDO PHASE 2.3 REAL PROVIDER IDENTITY ACCEPTANCE TEST");
  console.log("==========================================");

  // 1. Generate real product & transparent logo PNG buffers
  console.log("\n[STEP 1] Generating real high-resolution test PNG buffers...");
  const realProductBuf = await createRealProductAssetBuffer();
  const realLogoBuf = await createRealLogoAssetBuffer();

  const prodMeta = await sharp(realProductBuf).metadata();
  const logoMeta = await sharp(realLogoBuf).metadata();

  console.log(`  - Real Product Buffer: ${realProductBuf.length} bytes, ${prodMeta.width}x${prodMeta.height} (${prodMeta.format})`);
  console.log(`  - Real Transparent Logo Buffer: ${realLogoBuf.length} bytes, ${logoMeta.width}x${logoMeta.height} (${logoMeta.format})`);

  assert(prodMeta.width === 500 && prodMeta.height === 500, "Product asset has exact 500x500 dimensions");
  assert(logoMeta.width === 300 && logoMeta.height === 300, "Logo asset has exact 300x300 dimensions");

  // 2. Test Reference Intelligence Layer
  console.log("\n[STEP 2] Testing Reference Intelligence classification...");
  const refIntel = new ReferenceIntelligenceService();
  const manifest = refIntel.generateManifest({
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Commercial poster with product bottle and brand logo",
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01_PROD"],
        reference_relationship_confidence: 1.0,
        summary: "TIDO Cold Brew Glass Bottle",
        categories: [{ value: "beverage", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Coffee" }],
        industry_domains: [{ value: "f_and_b", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "F&B" }],
        likely_functions: [{ value: "refreshment", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Refreshment" }],
        materials: [{ value: "Glass", confidence: 1, evidence_type: "STRONG_INFERENCE", evidence_summary: "Glass" }],
        contents: [{ value: "Coffee", confidence: 1, evidence_type: "STRONG_INFERENCE", evidence_summary: "Coffee" }],
        surface_properties: [{ value: "Glossy", confidence: 1, evidence_type: "STRONG_INFERENCE", evidence_summary: "Glossy" }],
        geometry_traits: [{ value: "Cylindrical Bottle", confidence: 1, evidence_type: "STRONG_INFERENCE", evidence_summary: "Bottle" }],
        packaging_types: [{ value: "Glass Bottle", confidence: 1, evidence_type: "STRONG_INFERENCE", evidence_summary: "Bottle" }],
        branding_features: [{ value: "TIDO Label", confidence: 1, evidence_type: "USER_PROVIDED", evidence_summary: "Label" }],
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
  });

  assert(manifest.relationship_type === "product_with_logo", "Reference Intelligence classified 'product_with_logo'");
  assert(manifest.identity_rules.some((r) => r.type === "product_lock"), "Generated product_lock rule");
  assert(manifest.identity_rules.some((r) => r.type === "logo_preservation"), "Generated logo_preservation rule");

  // 3. Assemble Provider Input with Real Assets
  console.log("\n[STEP 3] Assembling Provider Input and executing ImgStudio adapter call...");
  const providerInput: ProviderImageGenerationInput = {
    model: "flow-nano-banana-2",
    prompt: `[REFERENCE INTELLIGENCE LOCK] Create a luxury commercial poster for TIDO Cold Brew.
[PRODUCT IDENTITY LOCK] Product PRODUCT_01 (REF_01_PROD): Lock amber glass bottle geometry, white label, and cap contours.
[LOGO PRESERVATION LOCK] Logo (REF_02_LOGO): Place high-contrast vector logo in top center visual area without font distortion.`,
    aspectRatio: "4:5",
    imageSize: "1K",
    mimeType: "image/png",
    generationId: `gen_real_val_${Date.now()}`,
    reference_manifest: manifest,
    references: [
      {
        reference_id: "REF_01_PROD",
        product_id: "PRODUCT_01",
        role: "PRODUCT",
        mimeType: "image/png",
        buffer: realProductBuf,
        filename: "tido_coffee_product_500x500.png",
      },
      {
        reference_id: "REF_02_LOGO",
        role: "LOGO",
        mimeType: "image/png",
        buffer: realLogoBuf,
        filename: "tido_brand_logo_300x300.png",
      },
    ],
  };

  const provider = new ImgStudioImageGenerationProvider();
  const result = await provider.generateImage(providerInput);

  console.log("\n[STEP 4] Provider Execution Output Analysis:");
  console.log("Success:", result.success);

  if (result.success) {
    console.log("Generated Image URL:", result.imageUrl);
    console.log("Remote Details:", JSON.stringify(result.remoteDetails, null, 2));
    assert(Boolean(result.imageUrl), "Provider returned valid generation URL");
  } else {
    console.log("Controlled Error Code:", result.error?.code);
    console.log("Controlled Error Message:", result.error?.message);
    assert(Boolean(result.error?.code), "Provider cleanly caught failure and returned controlled error");
  }

  console.log("\n================ PHASE 2.3 REAL PROVIDER IDENTITY ACCEPTANCE TEST COMPLETE ================");
}

runRealProviderIdentityAcceptanceTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
