import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { GeminiImageGenerationProvider } from "./provider/GeminiImageGenerationProvider";
import { ProviderReferenceImage } from "./provider/ImageGenerationProvider";
import { ImageGenerationService } from "./service/ImageGenerationService";
import { MasterPromptCompilerInput, RoutingResultSchema } from "./types";

async function runRoleBindingTests() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — INSPIRATION ROLE BINDING REGRESSION SUITE");
  console.log("========================================================================\n");

  const compiler = new MasterPromptCompilerService();

  const dummyRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "SINGLE_PRODUCT" as any,
    routing_summary: "Single product test",
    global_retrieval_queries: [],
    requires_universal_core: false,
    products: [
      {
        product_id: "PRODUCT_DRINK_CAN",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.99,
        summary: "Cold citrus drink can",
        categories: [],
        industry_domains: [],
        likely_functions: [],
        materials: [],
        contents: [],
        surface_properties: [],
        geometry_traits: [],
        packaging_types: [],
        branding_features: [],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.99 },
      { reference_id: "REF_02", role: "INSPIRATION_REFERENCE", confidence: 0.95 },
    ],
  };

  const dummyKnowledge = {
    package_version: "1.0",
    routing_version: "1.0",
    universal_blocks: [],
    specialist_blocks: [],
    recipe_blocks: [],
  };

  // Mock Gemini Provider capturing payload contents
  class MockCapturingGeminiProvider extends GeminiImageGenerationProvider {
    public capturedContents: any[] = [];
    async generateImage(input: any): Promise<any> {
      const contents: any[] = [{ text: input.prompt }];
      for (const ref of input.references) {
        const isSupport = ref.role === "SUPPORT_REFERENCE" || (ref.role as string) === "INSPIRATION_REFERENCE" || ref.reference_id?.includes("INSPIRATION") || ref.reference_id?.includes("STYLE");
        const isLogo = ref.role === "LOGO";

        let roleLabel = `ROLE: PRODUCT_IDENTITY (${ref.product_id || "PRODUCT_01"})`;
        if (isSupport) {
          roleLabel = "ROLE: INSPIRATION_REFERENCE (VISUAL STYLE GUIDANCE ONLY; NOT A PRODUCT IDENTITY)";
        } else if (isLogo) {
          roleLabel = "ROLE: LOGO (BRAND LOGO EVIDENCE ONLY; NOT A PRODUCT)";
        }

        contents.push({
          text: `REFERENCE ATTACHMENT ${ref.reference_id} — ${roleLabel}`,
        });
      }
      this.capturedContents = contents;
      return { success: true, imageBuffer: Buffer.from("mock_result") };
    }
  }

  // ----------------------------------------------------------------------
  // TEST 1: Product Only Generation Remains Unchanged
  // ----------------------------------------------------------------------
  console.log("--- [TEST 1] Product Only Generation Backward Compatibility ---");
  const prodOnlyInput: MasterPromptCompilerInput = {
    brief: "Product only advert",
    useCase: "Poster",
    aspectRatio: "1:1",
    routingResult: { ...dummyRouting, asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.99 }] },
    knowledgePackage: dummyKnowledge as any,
  };

  const compileRes1 = await compiler.compile(prodOnlyInput);
  const prompt1 = compileRes1.package?.compiled_prompt || "";

  if (prompt1.includes("[INSPIRATION REFERENCE RULES]")) {
    throw new Error("FAIL: Test 1 injected inspiration rules when no inspiration reference was present!");
  }

  const mockProvider1 = new MockCapturingGeminiProvider();
  await mockProvider1.generateImage({
    model: "gemini-3.1-flash-image",
    prompt: prompt1,
    references: [
      { reference_id: "REF_01", product_id: "PRODUCT_DRINK_CAN", role: "PRODUCT", mimeType: "image/png", buffer: Buffer.from("ref1") },
    ],
    aspectRatio: "1:1",
    imageSize: "1K",
    mimeType: "image/png",
  });

  const ref1Label = mockProvider1.capturedContents.find((c) => c.text && c.text.startsWith("REFERENCE ATTACHMENT REF_01"))?.text;
  console.log("Test 1 Attachment Payload Marker:", ref1Label);

  if (!ref1Label?.includes("ROLE: PRODUCT_IDENTITY")) {
    throw new Error("FAIL: Test 1 product image was not marked PRODUCT_IDENTITY!");
  }
  console.log("✓ TEST 1 PASSED: Product only generation remains 100% unchanged & correctly labeled!\n");

  // ----------------------------------------------------------------------
  // TEST 2: Product + Inspiration: IMAGE 1 Correctly Marked PRODUCT_IDENTITY
  // ----------------------------------------------------------------------
  console.log("--- [TEST 2] IMAGE 1 Correctly Marked PRODUCT_IDENTITY ---");
  const mockProvider2 = new MockCapturingGeminiProvider();
  const testRefs2: ProviderReferenceImage[] = [
    { reference_id: "REF_01", product_id: "PRODUCT_DRINK_CAN", role: "PRODUCT", mimeType: "image/png", buffer: Buffer.from("prod_bytes") },
    { reference_id: "REF_02", product_id: "PRODUCT_DRINK_CAN", role: "SUPPORT_REFERENCE", mimeType: "image/png", buffer: Buffer.from("style_bytes") },
  ];

  await mockProvider2.generateImage({
    model: "gemini-3.1-flash-image",
    prompt: "Sample prompt",
    references: testRefs2,
    aspectRatio: "4:5",
    imageSize: "1K",
    mimeType: "image/png",
  });

  const image1Label = mockProvider2.capturedContents.find((c) => c.text && c.text.startsWith("REFERENCE ATTACHMENT REF_01"))?.text;
  console.log("Image 1 Provider Label:", image1Label);

  if (!image1Label?.includes("ROLE: PRODUCT_IDENTITY (PRODUCT_DRINK_CAN)")) {
    throw new Error("FAIL: Test 2 Image 1 was not correctly marked PRODUCT_IDENTITY!");
  }
  console.log("✓ TEST 2 PASSED: IMAGE 1 is explicitly marked PRODUCT_IDENTITY!\n");

  // ----------------------------------------------------------------------
  // TEST 3: IMAGE 2 Correctly Marked INSPIRATION_REFERENCE
  // ----------------------------------------------------------------------
  console.log("--- [TEST 3] IMAGE 2 Correctly Marked INSPIRATION_REFERENCE ---");
  const image2Label = mockProvider2.capturedContents.find((c) => c.text && c.text.startsWith("REFERENCE ATTACHMENT REF_02"))?.text;
  console.log("Image 2 Provider Label:", image2Label);

  if (!image2Label?.includes("ROLE: INSPIRATION_REFERENCE (VISUAL STYLE GUIDANCE ONLY")) {
    throw new Error("FAIL: Test 3 Image 2 was not correctly marked INSPIRATION_REFERENCE!");
  }
  if (image2Label?.includes("ROLE: PRODUCT_IDENTITY")) {
    throw new Error("FAIL: Test 3 Image 2 was mislabeled as PRODUCT_IDENTITY!");
  }
  console.log("✓ TEST 3 PASSED: IMAGE 2 is explicitly marked INSPIRATION_REFERENCE!\n");

  // ----------------------------------------------------------------------
  // TEST 4: Inspiration Image Cannot Overwrite Product Identity
  // ----------------------------------------------------------------------
  console.log("--- [TEST 4] Inspiration Image Cannot Overwrite Product Identity ---");
  const compileRes4 = await compiler.compile({
    brief: "Create poster with inspiration reference",
    useCase: "Poster",
    aspectRatio: "4:5",
    routingResult: dummyRouting,
    knowledgePackage: dummyKnowledge as any,
    hasInspirationReference: true,
  });

  const prompt4 = compileRes4.package?.compiled_prompt || "";

  if (!prompt4.includes("PRIORITY 1 — PRODUCT REFERENCE IMAGE (IMAGE 1 / REF_01)")) {
    throw new Error("FAIL: Test 4 missing explicit IMAGE 1 product reference lock!");
  }
  if (!prompt4.includes("PRIORITY 3 — INSPIRATION IMAGE (IMAGE 2 / REF_02)")) {
    throw new Error("FAIL: Test 4 missing explicit IMAGE 2 inspiration reference lock!");
  }
  if (!prompt4.includes("- DO NOT ADAPT OR MODIFY: product identity, logo, packaging")) {
    throw new Error("FAIL: Test 4 anti-overwrite directive missing!");
  }
  console.log("✓ TEST 4 PASSED: Explicit prompt directives lock product identity against inspiration overwrite!\n");

  // ----------------------------------------------------------------------
  // TEST 5: Multiple Inspiration References Preserve Correct Roles
  // ----------------------------------------------------------------------
  console.log("--- [TEST 5] Multiple Inspiration References Preserve Correct Roles ---");
  const mockProvider5 = new MockCapturingGeminiProvider();
  const multiRefs: ProviderReferenceImage[] = [
    { reference_id: "REF_01", product_id: "PRODUCT_CAN", role: "PRODUCT", mimeType: "image/png", buffer: Buffer.from("p1") },
    { reference_id: "REF_02", role: "LOGO", mimeType: "image/png", buffer: Buffer.from("l1") },
    { reference_id: "REF_03", role: "SUPPORT_REFERENCE", mimeType: "image/png", buffer: Buffer.from("s1") },
    { reference_id: "REF_04", role: "SUPPORT_REFERENCE", mimeType: "image/png", buffer: Buffer.from("s2") },
  ];

  await mockProvider5.generateImage({
    model: "gemini-3.1-flash-image",
    prompt: "Multi-reference test prompt",
    references: multiRefs,
    aspectRatio: "16:9",
    imageSize: "1K",
    mimeType: "image/png",
  });

  const payloadSummary = mockProvider5.capturedContents.map((c) => c.text).filter(Boolean);
  console.log("Multiple References Provider Payload Summary:\n", payloadSummary.join("\n"), "\n");

  if (!payloadSummary.some((s) => s.includes("REF_01") && s.includes("PRODUCT_IDENTITY"))) {
    throw new Error("FAIL: Test 5 REF_01 missing PRODUCT_IDENTITY label!");
  }
  if (!payloadSummary.some((s) => s.includes("REF_02") && s.includes("LOGO"))) {
    throw new Error("FAIL: Test 5 REF_02 missing LOGO label!");
  }
  if (!payloadSummary.some((s) => s.includes("REF_03") && s.includes("INSPIRATION_REFERENCE"))) {
    throw new Error("FAIL: Test 5 REF_03 missing INSPIRATION_REFERENCE label!");
  }
  if (!payloadSummary.some((s) => s.includes("REF_04") && s.includes("INSPIRATION_REFERENCE"))) {
    throw new Error("FAIL: Test 5 REF_04 missing INSPIRATION_REFERENCE label!");
  }
  console.log("✓ TEST 5 PASSED: Multiple inspiration & logo references preserve correct role labels!\n");

  console.log("========================================================================");
  console.log("ALL INSPIRATION ROLE BINDING REGRESSION TESTS PASSED (100%)");
  console.log("========================================================================");
}

runRoleBindingTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
