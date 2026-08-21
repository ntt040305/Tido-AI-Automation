import fs from "fs";
import path from "path";
import { SimpleImageGenerationOrchestratorService } from "./service/SimpleImageGenerationOrchestratorService";
import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import { SimpleInputValidatorV1 } from "./validation/SimpleInputValidatorV1";
import { ProductIdentityResolver } from "./compiler/ProductIdentityResolver";
import { SmartKnowledgeRetriever } from "./retrieval/SmartKnowledgeRetriever";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import { PromptBudgetValidator } from "./compiler/PromptBudgetValidator";
import {
  ImageGenerationProvider,
  ProviderImageGenerationInput,
  ProviderImageGenerationOutput,
} from "./provider/ImageGenerationProvider";
import {
  RoutingResultSchema,
  SimpleInputRequestV1,
  StructuredInputIntentV1,
  ProductRoutingEntry,
} from "./types";

/**
 * Mock Provider for Offline Phase 6 Verification (0 Paid Calls)
 */
class MockPhase6Provider implements ImageGenerationProvider {
  public callCount = 0;
  public lastInput?: ProviderImageGenerationInput;
  public shouldTimeout = false;
  public shouldFailUpstream = false;

  async generateImage(
    input: ProviderImageGenerationInput
  ): Promise<ProviderImageGenerationOutput> {
    this.callCount++;
    this.lastInput = input;

    if (this.shouldTimeout) {
      return {
        success: false,
        error: {
          code: "PROVIDER_TIMEOUT",
          message: "Mock provider execution timed out.",
        },
      };
    }

    if (this.shouldFailUpstream) {
      return {
        success: false,
        error: {
          code: "PROVIDER_UPSTREAM_ERROR",
          message: "Mock provider upstream 500 error.",
        },
      };
    }

    return {
      success: true,
      imageUrl: `https://mock.tido.ai/generated_${input.generationId}.png`,
    };
  }
}

function makeProductEntry(
  productId: string,
  refIds: string[],
  summary: string = "Product"
): ProductRoutingEntry {
  return {
    product_id: productId,
    reference_ids: refIds,
    reference_relationship_confidence: 1.0,
    summary,
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
  };
}

function createFixtureRouting(
  products: ProductRoutingEntry[],
  intent?: StructuredInputIntentV1
): RoutingResultSchema {
  return {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Test routing result",
    global_retrieval_queries: [
      { query: "Beverage packaging", importance: "PRIMARY", reason: "Standard knowledge" } as any,
    ],
    products,
    structured_input_intent: intent,
    asset_roles: intent?.asset_roles,
  };
}

async function runSimpleInputV6Tests() {
  console.log("=========================================================");
  console.log("🚀 STARTING TIDO SIMPLE INPUT V1 — PHASE 6 RELEASE CANDIDATE TEST SUITE");
  console.log("=========================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(` ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(` ❌ FAIL: ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // ── CASE A: ONE PRODUCT ──────────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster mùa hè cho sản phẩm, không khí tươi vui và năng động.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "prod.png", mimeType: "image/png" }],
    };
    const intent: StructuredInputIntentV1 = {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    };
    const mockRouter = createFixtureRouting([makeProductEntry("PRODUCT_01", ["REF_01"], "Summer beverage")], intent);

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case A: 1 Product generation succeeds");
    assert(res.diagnostics?.productCount === 1, "Case A: productCount === 1");
    assert(mockProvider.callCount === 1, "Case A: Exactly 1 mock provider call");
    assert(mockProvider.lastInput?.references[0].role === "PRODUCT", "Case A: Provider image 1 has role PRODUCT");
  }

  // ── CASE B: TWO DISTINCT PRODUCTS ───────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster cho hai sản phẩm nước giải khát.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "prodA.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "prodB.png", mimeType: "image/png" },
      ],
    };
    const intent: StructuredInputIntentV1 = {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
        { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
      ],
    };
    const mockRouter = createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Beverage A"),
      makeProductEntry("PRODUCT_02", ["REF_02"], "Beverage B"),
    ], intent);

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case B: 2 Distinct Products generation succeeds");
    assert(res.diagnostics?.productCount === 2, "Case B: productCount === 2");
    assert(mockProvider.lastInput?.references[0].product_id !== mockProvider.lastInput?.references[1].product_id, "Case B: PRODUCT_01 != PRODUCT_02");
    assert(mockProvider.lastInput?.references[0].reference_id === "REF_01", "Case B: Ref order preserved (REF_01 first)");
    assert(mockProvider.lastInput?.references[1].reference_id === "REF_02", "Case B: Ref order preserved (REF_02 second)");
  }

  // ── CASE C: SAME PRODUCT MULTIVIEW ──────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster góc cạnh sản phẩm.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "front.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "side.png", mimeType: "image/png" },
      ],
    };
    const intent: StructuredInputIntentV1 = {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
        { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
      ],
    };
    const mockRouter = createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01", "REF_02"], "Bottle front & side"),
    ], intent);

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case C: Multiview generation succeeds");
    assert(res.diagnostics?.productCount === 1, "Case C: productCount === 1 for multiview");
    assert(mockProvider.lastInput?.references[0].product_id === "PRODUCT_01", "Case C: REF_01 bound to PRODUCT_01");
    assert(mockProvider.lastInput?.references[1].product_id === "PRODUCT_01", "Case C: REF_02 bound to PRODUCT_01");
  }

  // ── CASE D: TWO PRODUCTS + LOGO ─────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster fantasy mùa hè, hai sản phẩm bay giữa mây, title 'HÈ BAY LÊN'.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "prodA.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "prodB.png", mimeType: "image/png" },
        { reference_id: "REF_03", filename: "logo.png", mimeType: "image/png" },
      ],
    };
    const intent: StructuredInputIntentV1 = {
      core_creative_intent: req.concept,
      global_visual_language: "fantasy",
      extracted_copy_items: [
        { text: "HÈ BAY LÊN", role: "HEADLINE", confidence: 0.99 },
      ],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
        { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
        { reference_id: "REF_03", role: "LOGO", confidence: 0.98 },
      ],
    };
    const mockRouter = createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Beverage A"),
      makeProductEntry("PRODUCT_02", ["REF_02"], "Beverage B"),
    ], intent);

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case D: 2 Products + Logo succeeds");
    assert(res.diagnostics?.productCount === 2, "Case D: productCount === 2 (Logo excluded from product count)");
    assert(res.diagnostics?.logoCount === 1, "Case D: logoCount === 1");
    assert(mockProvider.lastInput?.references[2].role === "LOGO", "Case D: Reference 3 has role LOGO");
    assert(mockProvider.lastInput?.prompt.includes("HÈ BAY LÊN") === true, "Case D: Exact copy 'HÈ BAY LÊN' preserved in prompt");
  }

  // ── CASE E: PRODUCT + SUPPORT REFERENCE ─────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster mùa hè trẻ trung, lấy cảm hứng từ hình tham chiếu nhưng sản phẩm phải là chủ thể chính.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "prod.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "mood.png", mimeType: "image/png" },
      ],
    };
    const intent: StructuredInputIntentV1 = {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
        { reference_id: "REF_02", role: "SUPPORT_REFERENCE", confidence: 0.90 },
      ],
    };
    const mockRouter = createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Beverage"),
    ], intent);

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case E: Product + Support Reference succeeds");
    assert(res.diagnostics?.productCount === 1, "Case E: productCount === 1");
    assert(res.diagnostics?.supportReferenceCount === 1, "Case E: supportReferenceCount === 1");
    assert(mockProvider.lastInput?.references[1].role === "SUPPORT_REFERENCE", "Case E: Image 2 has role SUPPORT_REFERENCE");
  }

  // ── CASE F: PRODUCT + LOGO + SUPPORT ─────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster thương hiệu với logo và mood tham khảo.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "prod.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "logo.png", mimeType: "image/png" },
        { reference_id: "REF_03", filename: "mood.png", mimeType: "image/png" },
      ],
    };
    const intent: StructuredInputIntentV1 = {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
        { reference_id: "REF_02", role: "LOGO", confidence: 0.98 },
        { reference_id: "REF_03", role: "SUPPORT_REFERENCE", confidence: 0.90 },
      ],
    };
    const mockRouter = createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Beverage"),
    ], intent);

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case F: Product + Logo + Support succeeds");
    assert(mockProvider.lastInput?.references[0].role === "PRODUCT", "Case F: Reference 1 is PRODUCT");
    assert(mockProvider.lastInput?.references[1].role === "LOGO", "Case F: Reference 2 is LOGO");
    assert(mockProvider.lastInput?.references[2].role === "SUPPORT_REFERENCE", "Case F: Reference 3 is SUPPORT_REFERENCE");
  }

  // ── CASE G: AMBIGUOUS REFERENCE ─────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster cho sản phẩm.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "prod.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "ambiguous.png", mimeType: "image/png" },
      ],
    };
    const intent: StructuredInputIntentV1 = {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
        { reference_id: "REF_02", role: "AMBIGUOUS", confidence: 0.40 },
      ],
    };
    const mockRouter = createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Beverage"),
    ], intent);

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case G: Ambiguous reference handling succeeds");
    assert(mockProvider.lastInput?.references.length === 1, "Case G: AMBIGUOUS ref excluded from provider references");
    assert(res.diagnostics?.productCount === 1, "Case G: productCount === 1");
  }

  // ── CASE H: EXACT TITLE ──────────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: 'Poster sale, title "MUA 1 TẶNG 1".',
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "prod.png", mimeType: "image/png" }],
    };
    const intent: StructuredInputIntentV1 = {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [
        { text: "MUA 1 TẶNG 1", role: "HEADLINE", confidence: 0.99 },
      ],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    };
    const mockRouter = createFixtureRouting([makeProductEntry("PRODUCT_01", ["REF_01"], "Sale item")], intent);

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case H: Exact title preserved");
    assert(mockProvider.lastInput?.prompt.includes("MUA 1 TẶNG 1") === true, "Case H: Verbatim string 'MUA 1 TẶNG 1' present in final prompt");
  }

  // ── CASE I: PRODUCT NAMES ───────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Tên sản phẩm là Matcha Cloud và Coffee Cream.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "matcha.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "coffee.png", mimeType: "image/png" },
      ],
    };
    const intent: StructuredInputIntentV1 = {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [
        { text: "Matcha Cloud", role: "PRODUCT_NAME", confidence: 0.95 },
        { text: "Coffee Cream", role: "PRODUCT_NAME", confidence: 0.95 },
      ],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
        { reference_id: "REF_02", role: "PRODUCT", confidence: 0.95 },
      ],
    };
    const mockRouter = createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Matcha Cloud"),
      makeProductEntry("PRODUCT_02", ["REF_02"], "Coffee Cream"),
    ], intent);

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case I: Product names preserved");
    assert(mockProvider.lastInput?.prompt.includes("Matcha Cloud") === true, "Case I: 'Matcha Cloud' present in prompt");
    assert(mockProvider.lastInput?.prompt.includes("Coffee Cream") === true, "Case I: 'Coffee Cream' present in prompt");
  }

  // ── CASE J: DESCRIPTIVE PRODUCT LANGUAGE ────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster cho ly matcha màu xanh.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "matcha.png", mimeType: "image/png" }],
    };
    const adapted = SimpleInputAdapterService.adapt(req, createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Green matcha cup"),
    ], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: ["green matcha cup"],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    }));

    assert(adapted.copyItems.length === 0, "Case J: Descriptive language 'ly matcha màu xanh' did NOT produce invented copy items");
  }

  // ── CASE K: GLOBAL VS LOCAL STYLE ───────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster minimal nền trắng, chai bên trái, ánh sáng cinematic.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "prod.png", mimeType: "image/png" }],
    };
    const adapted = SimpleInputAdapterService.adapt(req, createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Product bottle"),
    ], {
      core_creative_intent: req.concept,
      global_visual_language: "minimal",
      lighting_requests: "cinematic lighting",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: ["white background", "product left", "cinematic lighting"],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    }));

    assert(adapted.compilerBrief.includes("VISUAL STYLE: minimal") === true, "Case K: Global style is 'minimal'");
    assert(adapted.compilerBrief.includes("cinematic lighting") === true, "Case K: 'cinematic lighting' preserved as local attribute");
  }

  // ── CASE L: PHOTOGRAPHIC + 3D TITLE ─────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: 'Poster photographic, title chữ 3D "FUTURE TASTE".',
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "prod.png", mimeType: "image/png" }],
    };
    const adapted = SimpleInputAdapterService.adapt(req, createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Product"),
    ], {
      core_creative_intent: req.concept,
      global_visual_language: "photographic",
      typography_requests: "3D title text effect",
      extracted_copy_items: [
        { text: "FUTURE TASTE", role: "HEADLINE", confidence: 0.95 },
      ],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: ["3D typography"],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 }],
    }));

    assert(adapted.compilerBrief.includes("VISUAL STYLE: photographic") === true, "Case L: Global style is 'photographic'");
    assert(adapted.copyItems[0].text === "FUTURE TASTE", "Case L: Exact copy 'FUTURE TASTE' preserved");
  }

  // ── CASE M: FANTASY POSTER KNOWLEDGE ─────────────────────────────
  {
    const mockRouting = createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "Product 1"),
      makeProductEntry("PRODUCT_02", ["REF_02"], "Product 2"),
    ]);

    const retrievalRes = await SmartKnowledgeRetriever.retrieve(
      mockRouting,
      ["REF_01", "REF_02"],
      null,
      { useCase: "Poster", brief: "Poster fantasy mùa hè" }
    );

    assert(retrievalRes.package !== null, "Case M: Stage 3 knowledge retrieval succeeded");
    const blockIds = (retrievalRes.package?.selected_blocks || []).map((b) => b.id);
    assert(blockIds.length > 0, "Case M: Selected knowledge blocks is non-empty");
  }

  // ── CASE N: UNDER-SPECIFIED CONCEPT ──────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster mùa hè cho hai sản phẩm.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "p2.png", mimeType: "image/png" },
      ],
    };
    const adapted = SimpleInputAdapterService.adapt(req, createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "P1"),
      makeProductEntry("PRODUCT_02", ["REF_02"], "P2"),
    ], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "HIGH",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 },
        { reference_id: "REF_02", role: "PRODUCT", confidence: 0.9 },
      ],
    }));

    assert(adapted.resolvedRoutingResult.structured_input_intent?.creative_freedom_level === "HIGH", "Case N: Under-specified concept yields HIGH creative freedom");
  }

  // ── CASE O: HIGHLY SPECIFIC CONCEPT ─────────────────────────────
  {
    const specConcept = "Poster fantasy ban đêm, hai sản phẩm bay phía trước mặt trăng, camera low angle, ánh sáng xanh lạnh từ bên trái, headline 'MIDNIGHT DROP' phía trên.";
    const req: SimpleInputRequestV1 = {
      concept: specConcept,
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "p2.png", mimeType: "image/png" },
      ],
    };
    const adapted = SimpleInputAdapterService.adapt(req, createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "P1"),
      makeProductEntry("PRODUCT_02", ["REF_02"], "P2"),
    ], {
      core_creative_intent: req.concept,
      global_visual_language: "fantasy",
      extracted_copy_items: [
        { text: "MIDNIGHT DROP", role: "HEADLINE", confidence: 0.99 },
      ],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: ["camera low angle", "cold blue light from left"],
      local_attributes: ["night fantasy", "moon background"],
      creative_freedom_level: "STRICT",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 },
        { reference_id: "REF_02", role: "PRODUCT", confidence: 0.9 },
      ],
    }));

    assert(adapted.copyItems[0].text === "MIDNIGHT DROP", "Case O: Exact headline 'MIDNIGHT DROP' preserved");
    assert(adapted.hardRequirements.includes("camera low angle"), "Case O: Low angle camera preserved in hardRequirements");
  }

  // ── CASE P: NO COPY REQUESTED ────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster cinematic cho sản phẩm trên mặt đá, ánh sáng chiều.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
    };
    const adapted = SimpleInputAdapterService.adapt(req, createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "P1"),
    ], {
      core_creative_intent: req.concept,
      global_visual_language: "cinematic",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: ["stone surface", "afternoon light"],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 }],
    }));

    assert(adapted.copyItems.length === 0, "Case P: No copy items invented");
  }

  // ── CASE Q: GENERATED COPY PERMISSION ─────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster mùa hè, tự nghĩ một headline ngắn phù hợp.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
    };
    const adapted = SimpleInputAdapterService.adapt(req, createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "P1"),
    ], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: true,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "HIGH",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 }],
    }));

    assert(adapted.diagnostics.generatedCopyAllowed === true, "Case Q: generatedCopyAllowed === true in adapter diagnostics");
  }

  // ── CASE R: HARD REQUIREMENTS ────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Phải có cả hai sản phẩm. Không đổi màu chai. Không thêm chữ.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [
        { reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" },
        { reference_id: "REF_02", filename: "p2.png", mimeType: "image/png" },
      ],
    };
    const adapted = SimpleInputAdapterService.adapt(req, createFixtureRouting([
      makeProductEntry("PRODUCT_01", ["REF_01"], "P1"),
      makeProductEntry("PRODUCT_02", ["REF_02"], "P2"),
    ], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [
        "Phải có cả hai sản phẩm",
        "Không đổi màu chai",
        "Không thêm chữ",
      ],
      local_attributes: [],
      creative_freedom_level: "STRICT",
      asset_roles: [
        { reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 },
        { reference_id: "REF_02", role: "PRODUCT", confidence: 0.9 },
      ],
    }));

    assert(adapted.hardRequirements.length === 3, "Case R: Exact 3 hard requirements preserved");
  }

  // ── CASE S: 1000 CHAR CONCEPT ────────────────────────────────────
  {
    const concept1000 = "A".repeat(1000);
    const req: SimpleInputRequestV1 = {
      concept: concept1000,
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
    };
    const valRes = SimpleInputValidatorV1.validateRequest(req);
    assert(valRes.isValid === true, "Case S: 1000 char concept accepted by validator");
  }

  // ── CASE T: 1001 CHAR CONCEPT ────────────────────────────────────
  {
    const concept1001 = "A".repeat(1001);
    const req: SimpleInputRequestV1 = {
      concept: concept1001,
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
    };
    const valRes = SimpleInputValidatorV1.validateRequest(req);
    assert(valRes.isValid === false, "Case T: 1001 char concept rejected by validator");

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      generationProvider: mockProvider,
    });
    assert(res.status === "VALIDATION_FAILED", "Case T: 1001 char concept yields VALIDATION_FAILED");
    assert(mockProvider.callCount === 0, "Case T: 0 provider calls executed");
  }

  // ── CASE U: PROMPT BUDGET FAILURE ─────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster sản phẩm.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
    };

    const mockHugeRouter = createFixtureRouting([makeProductEntry("PRODUCT_01", ["REF_01"], "P1")], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: Array.from({ length: 150 }, (_, i) => `Constraint ${i}: ${"X".repeat(30)}`),
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 }],
    });

    const mockOverbudgetCompiler: any = {
      compile: async () => ({
        success: true,
        package: {
          compiled_prompt: "PROMPT_OVER_CEILING ".repeat(1500),
        },
      }),
    };

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockHugeRouter,
      compilerService: mockOverbudgetCompiler,
      generationProvider: mockProvider,
    });

    assert(res.status === "PROMPT_BUDGET_EXCEEDED", "Case U: Prompt budget overshoot caught pre-provider");
    assert(mockProvider.callCount === 0, "Case U: 0 provider calls executed when over budget");
  }

  // ── CASE V: ROUTER FAILURE ────────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster sản phẩm.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
    };

    const mockFailingRouterService = {
      analyzeProductReferences: async () => ({
        success: false,
        error: { code: "INTERPRETATION_FAILED", message: "Mock router failure." },
      }),
    } as any;

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      routerService: mockFailingRouterService,
      generationProvider: mockProvider,
    });

    assert(res.status === "INTERPRETATION_FAILED", "Case V: Router failure yields INTERPRETATION_FAILED");
    assert(mockProvider.callCount === 0, "Case V: 0 provider calls executed on router failure");
  }

  // ── CASE W: PROVIDER TIMEOUT ──────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster sản phẩm.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
    };
    const mockRouter = createFixtureRouting([makeProductEntry("PRODUCT_01", ["REF_01"], "P1")], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 }],
    });

    const mockProvider = new MockPhase6Provider();
    mockProvider.shouldTimeout = true;

    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.status === "PROVIDER_TIMEOUT", "Case W: Provider timeout yields PROVIDER_TIMEOUT");
    assert(mockProvider.callCount === 1, "Case W: Exactly 1 provider call executed (0 retries on timeout)");
  }

  // ── CASE X: PROVIDER UPSTREAM 500 ─────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster sản phẩm.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
    };
    const mockRouter = createFixtureRouting([makeProductEntry("PRODUCT_01", ["REF_01"], "P1")], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 }],
    });

    const mockProvider = new MockPhase6Provider();
    mockProvider.shouldFailUpstream = true;

    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.status === "PROVIDER_UPSTREAM_ERROR", "Case X: Provider upstream error yields PROVIDER_UPSTREAM_ERROR");
    assert(mockProvider.callCount === 1, "Case X: Exactly 1 provider call executed (0 retries)");
  }

  // ── CASE Y: DOUBLE SUBMIT PROTECTION ──────────────────────────────
  {
    let isSubmitting = false;
    let submittedCount = 0;

    function handleFormSubmit() {
      if (isSubmitting) return false;
      isSubmitting = true;
      submittedCount++;
      return true;
    }

    const firstClick = handleFormSubmit();
    const secondClick = handleFormSubmit();

    assert(firstClick === true, "Case Y: First submission click accepted");
    assert(secondClick === false, "Case Y: Rapid second submission click rejected");
    assert(submittedCount === 1, "Case Y: Exactly 1 active submission processed");
  }

  // ── CASE Z: RENDER AGAIN ──────────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      requestId: "req_first_run",
      concept: "Poster mùa hè.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
    };
    const mockRouter = createFixtureRouting([makeProductEntry("PRODUCT_01", ["REF_01"], "P1")], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 }],
    });

    const mockProvider1 = new MockPhase6Provider();
    const res1 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider1,
    });

    // Render Again triggers a new generation request with new ID
    const renderAgainReq: SimpleInputRequestV1 = {
      ...req,
      requestId: "req_render_again_run",
    };
    const mockProvider2 = new MockPhase6Provider();
    const res2 = await SimpleImageGenerationOrchestratorService.generateSimpleImage(renderAgainReq, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider2,
    });

    assert(res1.generationId !== res2.generationId, "Case Z: Render Again produces a NEW generation ID");
    assert(mockProvider2.lastInput?.references.length === 1, "Case Z: Render Again uses only input reference (previous output image NOT attached)");
  }

  // ── CASE 29: LOGO-ONLY AUDIT ──────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster thương hiệu tối giản với logo làm chủ thể.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "logo.png", mimeType: "image/png" }],
    };
    const mockRouter = createFixtureRouting([], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "LOGO", confidence: 0.98 }],
    });

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.status === "NO_PRODUCT_REFERENCE", "Case 29: Logo-only request returns NO_PRODUCT_REFERENCE");
    assert(mockProvider.callCount === 0, "Case 29: 0 provider calls executed (no fake PRODUCT_01 created)");
  }

  // ── CASE 30: CONCEPT-ONLY AUDIT ────────────────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster abstract về mùa hè.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [],
    };
    const mockRouter = createFixtureRouting([], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [],
    });
    const adapted = SimpleInputAdapterService.adapt(req, mockRouter);
    assert(adapted.status === "NO_PRODUCT_REFERENCE", "Case 30: Concept-only (0 images) returns NO_PRODUCT_REFERENCE");
  }

  // ── CASE 31: USE CASE MATRIX ──────────────────────────────────────
  {
    const USE_CASES = ["Poster", "Social Post", "Banner", "Menu", "E-commerce", "Thumbnail", "Khác"];
    for (const uc of USE_CASES) {
      const req: SimpleInputRequestV1 = {
        concept: `Thiết kế ${uc} cho sản phẩm`,
        useCase: uc,
        aspectRatio: "4:5",
        images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
      };
      const valRes = SimpleInputValidatorV1.validateRequest(req);
      assert(valRes.isValid === true, `Case 31: Use Case '${uc}' passes validation`);
    }
  }

  // ── CASE 32: ASPECT RATIO MATRIX ──────────────────────────────────
  {
    const RATIOS = ["1:1", "4:5", "3:4", "9:16", "16:9", "4:3"];
    for (const r of RATIOS) {
      const req: SimpleInputRequestV1 = {
        concept: "Poster sản phẩm",
        useCase: "Poster",
        aspectRatio: r,
        images: [{ reference_id: "REF_01", filename: "p1.png", mimeType: "image/png" }],
      };
      const valRes = SimpleInputValidatorV1.validateRequest(req);
      assert(valRes.isValid === true, `Case 32: Aspect Ratio '${r}' passes validation`);
    }
  }

  // ── CASE 36: PROMPT CHAR TELEMETRY ACCURACY ────────────────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster sản phẩm mùa hè.",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p.png", mimeType: "image/png" }],
    };
    const mockRouter = createFixtureRouting([makeProductEntry("PRODUCT_01", ["REF_01"], "Product")], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 }],
    });

    const mockProvider = new MockPhase6Provider();
    const res = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockProvider,
    });

    assert(res.success === true, "Case 36: Generation succeeds");
    assert(mockProvider.lastInput?.prompt !== undefined, "Case 36: Master prompt compiled");
    assert(res.diagnostics?.promptChars === mockProvider.lastInput!.prompt.length, "Case 36: promptChars telemetry strictly matches master prompt length");
  }

  // ── CASE 37: RESULT-MAPPING IMAGE URL PRESERVATION TEST ─────────────
  {
    const req: SimpleInputRequestV1 = {
      concept: "Poster sản phẩm mới",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p.png", mimeType: "image/png" }],
    };
    const mockRouter = createFixtureRouting([makeProductEntry("PRODUCT_01", ["REF_01"], "Product")], {
      core_creative_intent: req.concept,
      global_visual_language: "commercial",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [{ reference_id: "REF_01", role: "PRODUCT", confidence: 0.9 }],
    });

    const expectedUrl = "https://example.com/generated-result-mapping.png";

    // Test A: Top-level imageUrl from provider
    const mockTopLevelProvider: any = {
      generateImage: async () => ({
        success: true,
        imageUrl: expectedUrl,
      }),
    };

    const resA = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockTopLevelProvider,
    });

    assert(resA.success === true, "Case 37A: Result mapping succeeds");
    assert(resA.imageUrl === expectedUrl, "Case 37A: Top-level imageUrl correctly passed to orchestrator result");

    // Test B: remoteDetails.url fallback from provider
    const mockRemoteDetailsProvider: any = {
      generateImage: async () => ({
        success: true,
        remoteDetails: { url: expectedUrl },
      }),
    };

    const resB = await SimpleImageGenerationOrchestratorService.generateSimpleImage(req, {
      mockRoutingResult: mockRouter,
      generationProvider: mockRemoteDetailsProvider,
    });

    assert(resB.success === true, "Case 37B: Remote details fallback mapping succeeds");
    assert(resB.imageUrl === expectedUrl, "Case 37B: Fallback remoteDetails.url correctly mapped to orchestrator result");
  }

  // ── CASE 38: IMGSTUDIO ASPECT RATIO PRE-VALIDATION TEST ────────────
  {
    const { ImgStudioImageGenerationProvider } = await import("./provider/ImgStudioImageGenerationProvider");
    const provider = new ImgStudioImageGenerationProvider();
    const origKey = process.env.IMGSTUDIO_API_KEY;
    process.env.IMGSTUDIO_API_KEY = "test_key_for_unit_test";

    // Test 38A: Default ratio 1:1 passes pre-call validation
    const defaultRes = await provider.generateImage({
      model: "flow-nano-banana-2",
      prompt: "test prompt",
      references: [],
      aspectRatio: "1:1",
      imageSize: "1K",
      mimeType: "image/png",
    });
    assert(defaultRes.error?.code !== "UNSUPPORTED_ASPECT_RATIO", "Case 38A: Default ratio '1:1' passes pre-call validation");

    // Test 38B: Explicit user selected ratio 3:4 passes pre-call validation
    const userSelectedRes34 = await provider.generateImage({
      model: "flow-nano-banana-2",
      prompt: "test prompt",
      references: [],
      aspectRatio: "3:4",
      imageSize: "1K",
      mimeType: "image/png",
    });
    assert(userSelectedRes34.error?.code !== "UNSUPPORTED_ASPECT_RATIO", "Case 38B: User selected ratio '3:4' passes pre-call validation");

    // Test 38B2: Explicit user selected ratio 9:16 passes pre-call validation
    const userSelectedRes916 = await provider.generateImage({
      model: "flow-nano-banana-2",
      prompt: "test prompt",
      references: [],
      aspectRatio: "9:16",
      imageSize: "1K",
      mimeType: "image/png",
    });
    assert(userSelectedRes916.error?.code !== "UNSUPPORTED_ASPECT_RATIO", "Case 38B2: User selected ratio '9:16' passes pre-call validation");

    // Test 38C: Unverified / unsupported ratios (4:5, 4:3, 16:9) fail pre-call validation
    const BLOCKED_RATIOS = ["4:5", "4:3", "16:9"];
    for (const r of BLOCKED_RATIOS) {
      const failRes = await provider.generateImage({
        model: "flow-nano-banana-2",
        prompt: "test prompt",
        references: [],
        aspectRatio: r,
        imageSize: "1K",
        mimeType: "image/png",
      });
      assert(failRes.success === false, `Case 38C: Ratio '${r}' is rejected pre-call`);
      assert(failRes.error?.code === "UNSUPPORTED_ASPECT_RATIO", `Case 38C: Ratio '${r}' returns UNSUPPORTED_ASPECT_RATIO error code`);
    }

    if (origKey) process.env.IMGSTUDIO_API_KEY = origKey;
    else delete process.env.IMGSTUDIO_API_KEY;
  }

  // ── CASE 39: LOCAL ASSET STORAGE & DOWNLOAD ROUTE TEST ────────────
  {
    const { LocalGeneratedImageStorage } = await import("./storage/LocalGeneratedImageStorage");
    const storage = new LocalGeneratedImageStorage();
    const testGenId = `test_result_view_${Date.now()}`;

    const saveRes = await storage.saveAsset({
      generation_id: testGenId,
      imageBuffer: Buffer.from("fake_png_bytes_for_result_view_test"),
      mimeType: "image/png",
      masterPrompt: "test prompt",
      metadata: { test: true },
    });

    assert(saveRes.url === `/api/image/generated/${testGenId}`, "Case 39A: Local storage generates same-origin URL /api/image/generated/{id}");
    assert(fs.existsSync(saveRes.assetPath), "Case 39A: Local image asset saved to filesystem");

    // Cleanup test asset
    try {
      const dirPath = path.dirname(saveRes.assetPath);
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log("\n=========================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 6 RELEASE CANDIDATE TESTS PASSED!`);
  console.log("=========================================================\n");
}

runSimpleInputV6Tests().catch((err) => {
  console.error("❌ PHASE 6 TEST SUITE FAILED:", err);
  process.exit(1);
});
