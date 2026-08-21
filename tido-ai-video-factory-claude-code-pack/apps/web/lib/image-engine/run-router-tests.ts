import fs from "fs";
import { IMAGE_ENGINE_CONFIG } from "./config";
import { RoutingRuntimeSchemaAdapter } from "./schema/RoutingRuntimeSchemaAdapter";
import { RoutingValidator } from "./validation/RoutingValidator";
import { CreativeLeakDetector } from "./validation/CreativeLeakDetector";
import { RoutingResultSchema } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(` ❌ FAIL: ${message}`);
    throw new Error(`Test failed: ${message}`);
  }
  console.log(` ✅ PASS: ${message}`);
}

export async function runStage2RouterTests() {
  console.log("\n=================================================");
  console.log("🚀 STARTING TIDO IMAGE ENGINE STAGE 2 ROUTER CONTRACT TESTS");
  console.log("=================================================\n");

  // ── TEST 1: Knowledge Router Prompt Loading & Alignment ────────
  assert(
    fs.existsSync(IMAGE_ENGINE_CONFIG.KNOWLEDGE_ROUTER_V1_PATH),
    "Knowledge Router Prompt V1 file exists"
  );
  const promptText = fs.readFileSync(IMAGE_ENGINE_CONFIG.KNOWLEDGE_ROUTER_V1_PATH, "utf-8");
  assert(
    promptText.includes("CLASSIFICATION ITEMS") &&
      promptText.includes("VISUAL CHALLENGES") &&
      promptText.includes("UNKNOWNS") &&
      promptText.includes("RETRIEVAL QUERIES"),
    "Router prompt contains required V1 contract shape specifications"
  );

  // ── TEST 2: Runtime Schema Adapter (Single Source of Truth) ──────
  const geminiSchema = RoutingRuntimeSchemaAdapter.getGeminiResponseJsonSchema();
  assert(geminiSchema !== null, "Gemini Response Schema created via adapter");
  assert(geminiSchema.type === "object", "Gemini Response Schema is valid object schema");

  // Verify runtime schema derived object properties for Visual Challenges
  const productProps = geminiSchema.properties?.products?.items?.properties;
  assert(
    productProps?.visual_challenges?.items?.properties?.id !== undefined &&
      productProps?.visual_challenges?.items?.properties?.description !== undefined &&
      productProps?.visual_challenges?.items?.properties?.confidence !== undefined,
    "Runtime schema derived visual_challenges object shape { id, description, confidence }"
  );

  // Verify runtime schema derived object properties for Unknowns
  assert(
    productProps?.unknowns?.items?.properties?.subject !== undefined &&
      productProps?.unknowns?.items?.properties?.reason !== undefined &&
      productProps?.unknowns?.items?.properties?.importance !== undefined,
    "Runtime schema derived unknowns object shape { subject, reason, importance }"
  );

  // Verify runtime schema derived object properties for Retrieval Queries
  assert(
    productProps?.retrieval_queries?.items?.properties?.query !== undefined &&
      productProps?.retrieval_queries?.items?.properties?.importance !== undefined &&
      productProps?.retrieval_queries?.items?.properties?.reason !== undefined,
    "Runtime schema derived retrieval_queries object shape { query, importance, reason }"
  );

  // Verify confidence min/max constraints retention
  assert(
    productProps?.reference_relationship_confidence?.minimum === 0 &&
      productProps?.reference_relationship_confidence?.maximum === 1,
    "Runtime schema retained minimum: 0 and maximum: 1 constraints"
  );

  // ── TEST 3: Sample Routing Output File Pass ─────────────────────
  const samplePath = "sample_routing_output.json";
  assert(fs.existsSync(samplePath), "sample_routing_output.json exists");
  const sampleJson = JSON.parse(fs.readFileSync(samplePath, "utf-8"));
  const sampleValidation = RoutingValidator.validate(sampleJson, ["REF_01"]);
  assert(sampleValidation.isValid, "sample_routing_output.json passes RoutingValidator");

  // ── TEST 4: Valid Canonical Routing Result Validation ──────────
  const mockValidRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.98,
        summary: "Clear glass cold brew coffee bottle with dark liquid and ice.",
        categories: [
          {
            value: "Cold Beverage",
            confidence: 0.99,
            evidence_type: "OBSERVED",
            evidence_summary: "Visible clear bottle containing liquid beverage.",
          },
        ],
        industry_domains: [
          {
            value: "Food & Beverage",
            confidence: 0.98,
            evidence_type: "OBSERVED",
            evidence_summary: "Commercial RTD beverage packaging.",
          },
        ],
        likely_functions: [
          {
            value: "Ready-to-drink coffee",
            confidence: 0.95,
            evidence_type: "STRONG_INFERENCE",
            evidence_summary: "Dark coffee liquid visible inside bottle.",
          },
        ],
        materials: [
          {
            value: "glass",
            confidence: 0.97,
            evidence_type: "OBSERVED",
            evidence_summary: "Transparent rigid glass bottle body.",
          },
        ],
        contents: [
          {
            value: "liquid",
            confidence: 0.99,
            evidence_type: "OBSERVED",
            evidence_summary: "Dark brown fluid inside volume.",
          },
        ],
        surface_properties: [
          {
            value: "transparent",
            confidence: 0.98,
            evidence_type: "OBSERVED",
            evidence_summary: "Light passes through clear container wall.",
          },
        ],
        geometry_traits: [
          {
            value: "cylindrical",
            confidence: 0.95,
            evidence_type: "OBSERVED",
            evidence_summary: "Symmetrical round bottle body.",
          },
        ],
        packaging_types: [
          {
            value: "bottle",
            confidence: 0.99,
            evidence_type: "OBSERVED",
            evidence_summary: "Glass beverage bottle.",
          },
        ],
        branding_features: [
          {
            value: "front label wrap",
            confidence: 0.92,
            evidence_type: "OBSERVED",
            evidence_summary: "Paper label attached to middle section.",
          },
        ],
        visual_challenges: [
          {
            id: "transparent_glass_realism",
            description: "Transparent glass container requires accurate optical refraction, specular highlights, and edge definition.",
            confidence: 0.95,
          },
        ],
        unknowns: [
          {
            subject: "Rear label text & barcode",
            reason: "Only front-facing product reference image REF_01 is provided.",
            importance: "MEDIUM",
          },
        ],
        retrieval_queries: [
          {
            query: "professional visual realism for transparent branded glass containers",
            importance: "PRIMARY",
            reason: "Glass container is the primary physical product material.",
          },
        ],
      },
    ],
    global_retrieval_queries: [
      {
        query: "commercial visual principles for beverage packaging",
        importance: "PRIMARY",
        reason: "Target industry domain is RTD commercial beverage packaging.",
      },
    ],
    routing_summary: "High confidence routing for single glass beverage bottle.",
  };

  const valResult = RoutingValidator.validate(mockValidRouting, ["REF_01"]);
  assert(valResult.isValid, "Valid canonical mock routing passed RoutingValidator");

  // ── TEST 5: Negative & Legacy Shape Rejection Tests ─────────────
  console.log("\n🧪 Running Negative & Legacy Contract Rejection Tests...");

  // Legacy string array for Unknowns must be REJECTED
  const legacyUnknowns = JSON.parse(JSON.stringify(mockValidRouting));
  legacyUnknowns.products[0].unknowns = ["Rear label text"];
  const legUnkCheck = RoutingValidator.validate(legacyUnknowns, ["REF_01"]);
  assert(!legUnkCheck.isValid, "Validator correctly rejected legacy string array for unknowns");

  // Legacy string array for Retrieval Queries must be REJECTED
  const legacyQueries = JSON.parse(JSON.stringify(mockValidRouting));
  legacyQueries.products[0].retrieval_queries = ["glass knowledge"];
  const legQCheck = RoutingValidator.validate(legacyQueries, ["REF_01"]);
  assert(!legQCheck.isValid, "Validator correctly rejected legacy string array for retrieval_queries");

  // Visual challenge using generic classification shape must be REJECTED
  const legacyVisualChallenge = JSON.parse(JSON.stringify(mockValidRouting));
  legacyVisualChallenge.products[0].visual_challenges = [
    {
      value: "Glass realism",
      confidence: 0.9,
      evidence_type: "OBSERVED",
      evidence_summary: "Glass visible",
    },
  ];
  const legVcCheck = RoutingValidator.validate(legacyVisualChallenge, ["REF_01"]);
  assert(!legVcCheck.isValid, "Validator correctly rejected classification shape for visual_challenges");

  // requires_universal_core: false must be REJECTED
  const falseCore = JSON.parse(JSON.stringify(mockValidRouting));
  falseCore.requires_universal_core = false;
  const coreCheck = RoutingValidator.validate(falseCore, ["REF_01"]);
  assert(!coreCheck.isValid, "Validator correctly rejected requires_universal_core === false");

  // Duplicate Product ID
  const mockDuplicateProd = JSON.parse(JSON.stringify(mockValidRouting));
  mockDuplicateProd.products.push(JSON.parse(JSON.stringify(mockValidRouting.products[0])));
  const dupCheck = RoutingValidator.validate(mockDuplicateProd, ["REF_01"]);
  assert(!dupCheck.isValid, "Validator correctly rejected duplicate product_id");

  // Unknown Reference ID
  const mockUnknownRef = JSON.parse(JSON.stringify(mockValidRouting));
  mockUnknownRef.products[0].reference_ids = ["REF_99"];
  const refCheck = RoutingValidator.validate(mockUnknownRef, ["REF_01"]);
  assert(!refCheck.isValid, "Validator correctly rejected unknown reference_id 'REF_99'");

  // Confidence out of bounds
  const mockBadConf = JSON.parse(JSON.stringify(mockValidRouting));
  mockBadConf.products[0].materials[0].confidence = 1.5;
  const confCheck = RoutingValidator.validate(mockBadConf, ["REF_01"]);
  assert(!confCheck.isValid, "Validator correctly rejected out-of-bounds confidence (1.5)");

  // ── TEST 6: Creative Leak Detector ──────────────────────────────
  console.log("\n🧪 Running Creative Leak Safety Net Tests...");

  const mockCreativeLeakField: any = JSON.parse(JSON.stringify(mockValidRouting));
  mockCreativeLeakField.products[0].recommended_camera = "85mm lens at f/2.8";
  const leakCheck1 = CreativeLeakDetector.validateNonCreativeRouting(mockCreativeLeakField);
  assert(leakCheck1.hasLeak, "Detected forbidden creative field 'recommended_camera'");

  const mockCreativeLeakPhrase: any = JSON.parse(JSON.stringify(mockValidRouting));
  mockCreativeLeakPhrase.products[0].summary = "Product placed on cyberpunk background recommendation";
  const leakCheck2 = CreativeLeakDetector.validateNonCreativeRouting(mockCreativeLeakPhrase);
  assert(leakCheck2.hasLeak, "Detected forbidden creative phrase 'cyberpunk background recommendation'");

  const cleanCheck = CreativeLeakDetector.validateNonCreativeRouting(mockValidRouting);
  assert(!cleanCheck.hasLeak, "Valid factual routing passed Creative Leak Detector cleanly");

  console.log("\n=================================================");
  console.log("🎉 ALL STAGE 2 ROUTER CONTRACT TESTS PASSED!");
  console.log("=================================================\n");
}

// Auto-run if executed directly
if (require.main === module) {
  runStage2RouterTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
