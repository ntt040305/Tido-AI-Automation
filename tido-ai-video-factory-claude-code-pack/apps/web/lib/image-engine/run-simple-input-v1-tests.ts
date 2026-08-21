import {
  AssetRoleV1,
  ExtractedAssetRoleV1,
  ExtractedCopyItemV1,
  ExtractedCopyRoleV1,
  SimpleInputRequestV1,
  StructuredInputIntentV1,
} from "./types";
import { SimpleInputValidatorV1 } from "./validation/SimpleInputValidatorV1";

async function runSimpleInputV1Tests() {
  console.log("=========================================================");
  console.log("🚀 STARTING TIDO SIMPLE INPUT V1 — PHASE 1 TEST SUITE");
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

  // ── TEST 1: Valid 4-Input Request ──────────────────────────────
  const validRequest: SimpleInputRequestV1 = {
    referenceIds: ["REF_01", "REF_02", "REF_03"],
    concept: "Poster fantasy mùa hè cho hai ly nước bay giữa mây.",
    useCase: "Poster",
    aspectRatio: "4:5",
  };
  const validRes = SimpleInputValidatorV1.validateRequest(validRequest);
  assert(validRes.isValid, "Valid 4-input SimpleInputRequestV1 passed validation");
  assert(validRes.errors.length === 0, "Zero errors for valid request");

  // ── TEST 2: Concept Length Limits (Soft / Warn / Hard Limit) ────
  const softOverRequest: SimpleInputRequestV1 = {
    ...validRequest,
    concept: "A".repeat(650),
  };
  const softRes = SimpleInputValidatorV1.validateRequest(softOverRequest);
  assert(softRes.isValid, "Soft-limit (650 chars) concept is valid");
  assert(softRes.warnings.some((w) => w.includes("soft guidance")), "Soft guidance warning emitted for 650 chars");

  const warnOverRequest: SimpleInputRequestV1 = {
    ...validRequest,
    concept: "A".repeat(850),
  };
  const warnRes = SimpleInputValidatorV1.validateRequest(warnOverRequest);
  assert(warnRes.isValid, "Warning-threshold (850 chars) concept is valid");
  assert(warnRes.warnings.some((w) => w.includes("warning threshold")), "Warning threshold warning emitted for 850 chars");

  const invalidOverRequest: SimpleInputRequestV1 = {
    ...validRequest,
    concept: "A".repeat(1050),
  };
  const invalidRes = SimpleInputValidatorV1.validateRequest(invalidOverRequest);
  assert(!invalidRes.isValid, "Hard-limit (1050 chars) concept correctly fails validation");
  assert(invalidRes.errors.some((e) => e.includes("exceeds hard maximum limit")), "Hard maximum limit error returned");

  // ── TEST 3: Copy Role Validation ────────────────────────────────
  const validRoles: ExtractedCopyRoleV1[] = ["HEADLINE", "SUBHEADLINE", "PRODUCT_NAME", "PRICE", "CTA", "GENERAL"];
  for (const role of validRoles) {
    assert(SimpleInputValidatorV1.isValidCopyRole(role), `Copy role '${role}' is valid`);
  }
  assert(!SimpleInputValidatorV1.isValidCopyRole("UNSUPPORTED_ROLE"), "Unsupported copy role correctly rejected");

  // ── TEST 4: Asset Role Gating & Ambiguous Asset Rule ────────────
  const mockAssetRoles: ExtractedAssetRoleV1[] = [
    { reference_id: "REF_01", role: "PRODUCT", confidence: 0.95 },
    { reference_id: "REF_02", role: "PRODUCT", confidence: 0.92 },
    { reference_id: "REF_03", role: "LOGO", confidence: 0.99 },
    { reference_id: "REF_04", role: "SUPPORT_REFERENCE", confidence: 0.88 },
    { reference_id: "REF_05", role: "AMBIGUOUS", confidence: 0.50 },
    { reference_id: "REF_06", role: "UNKNOWN", confidence: 0.30 },
  ];

  const productCandidates = SimpleInputValidatorV1.filterProductCandidates(mockAssetRoles);
  assert(productCandidates.length === 2, "Extracted exactly 2 PRODUCT candidates from asset pool");
  assert(
    productCandidates.every((p) => p.role === "PRODUCT"),
    "All filtered candidates have role === 'PRODUCT'"
  );
  assert(
    !productCandidates.some((p) => (p.role as string) === "AMBIGUOUS" || (p.role as string) === "UNKNOWN"),
    "Enforced Invariant: AMBIGUOUS != PRODUCT and UNKNOWN != PRODUCT"
  );
  assert(
    !productCandidates.some((p) => (p.role as string) === "LOGO"),
    "Standalone LOGO asset is excluded from PRODUCT candidate pool"
  );

  // ── TEST 5: Synthetic Fixture Test ─────────────────────────────
  const syntheticFixtureIntent: StructuredInputIntentV1 = {
    core_creative_intent: "Summer fantasy poster featuring two beverages floating among clouds",
    global_visual_language: "Fantasy summer poster",
    scene_environment: "Soft pastel clouds in golden hour sky",
    camera_requests: "Low-angle viewpoint looking up at hero beverages",
    lighting_requests: "Warm golden-hour sunset lighting",
    extracted_copy_items: [
      { role: "HEADLINE", text: "HÈ BAY LÊN", confidence: 1.0, evidence: "Explicit user title" },
      { role: "PRODUCT_NAME", text: "Matcha Cloud", confidence: 0.95, evidence: "User text name" },
      { role: "PRODUCT_NAME", text: "Coffee Cream", confidence: 0.95, evidence: "User text name" },
    ],
    generated_copy_allowed: false,
    brand_mentions: ["TIDO"],
    explicit_hard_requirements: ["Preserve two distinct product identities"],
    local_attributes: ["clouds", "golden hour", "floating drinks"],
    creative_freedom_level: "BALANCED",
    asset_roles: [
      { reference_id: "REF_01", role: "PRODUCT", confidence: 0.98, evidence: "Matcha drink bottle" },
      { reference_id: "REF_02", role: "PRODUCT", confidence: 0.96, evidence: "Coffee drink bottle" },
      { reference_id: "REF_03", role: "LOGO", confidence: 0.99, evidence: "Brand logo mark" },
    ],
  };

  assert(syntheticFixtureIntent.core_creative_intent.length > 0, "Synthetic fixture StructuredInputIntentV1 is valid");
  assert(syntheticFixtureIntent.extracted_copy_items.length === 3, "Synthetic fixture contains 3 copy items");

  // ── TEST 6: Empty Field Omission in Generation Brief ───────────
  const minimalIntent: StructuredInputIntentV1 = {
    core_creative_intent: "Poster fantasy mùa hè cho hai ly bay giữa mây",
    global_visual_language: "Fantasy summer poster",
    scene_environment: "Floating among clouds",
    extracted_copy_items: [],
    generated_copy_allowed: false,
    brand_mentions: [],
    explicit_hard_requirements: [],
    local_attributes: [],
    asset_roles: [],
  };

  const brief = SimpleInputValidatorV1.formatGenerationIntentBrief(minimalIntent);
  assert(brief.formatted_brief_text.includes("CREATIVE CONCEPT:"), "Contains CREATIVE CONCEPT header");
  assert(brief.formatted_brief_text.includes("VISUAL STYLE:"), "Contains VISUAL STYLE header");
  assert(!brief.formatted_brief_text.includes("VIEWPOINT & CAMERA:"), "Omitted camera header when unspecified");
  assert(!brief.formatted_brief_text.includes("LIGHTING DESIGN:"), "Omitted lighting header when unspecified");
  assert(!brief.formatted_brief_text.includes("COLOR PALETTE:"), "Omitted color header when unspecified");

  console.log("\n=========================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 1 TESTS PASSED SUCCESSFULLY!`);
  console.log("=========================================================\n");
}

runSimpleInputV1Tests().catch((err) => {
  console.error("❌ PHASE 1 TEST SUITE FAILED:", err);
  process.exit(1);
});
