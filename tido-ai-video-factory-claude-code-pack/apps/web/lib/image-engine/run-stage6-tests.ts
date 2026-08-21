import assert from "assert";
import crypto from "crypto";
import { ImageGenerationService } from "./service/ImageGenerationService";
import { ImageEditService } from "./service/ImageEditService";
import { EditPromptCompilerService } from "./compiler/EditPromptCompilerService";
import { ImageGenerationProvider, ProviderImageGenerationInput, ProviderImageGenerationOutput } from "./provider/ImageGenerationProvider";
import { LocalGeneratedImageStorage } from "./storage/LocalGeneratedImageStorage";
import {
  CompiledGenerationPackageV1,
  KnowledgePackageV1,
  RoutingResultSchema,
} from "./types";

// Mock Provider for Zero-Paid-Call Testing
class MockImageGenerationProvider implements ImageGenerationProvider {
  public callCount = 0;
  public lastInput?: ProviderImageGenerationInput;

  async generateImage(input: ProviderImageGenerationInput): Promise<ProviderImageGenerationOutput> {
    this.callCount++;
    this.lastInput = input;

    // Create a 1x1 dummy PNG buffer
    const dummyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    return {
      success: true,
      imageBuffer: dummyPng,
      mimeType: "image/png",
      remoteDetails: {
        remote_image_id: `mock_remote_${Date.now()}_${this.callCount}`,
        cost_vnd: 100,
        balance_vnd: 50000,
        provider_name: "MockFlow",
        model: input.model || "flow-nano-banana-2",
        url: "/data/generated/image-renders/mock.png",
      },
    };
  }
}

async function runStage6Tests() {
  console.log("==================================================");
  console.log("TIDO IMAGE ENGINE — STAGE 6.0 INTEGRATION TEST SUITE");
  console.log("==================================================\n");

  const mockProvider = new MockImageGenerationProvider();
  const mockStorage = new LocalGeneratedImageStorage();
  const editCompiler = new EditPromptCompilerService();

  const genService = new ImageGenerationService(mockProvider, mockStorage);
  const editService = new ImageEditService(mockProvider, mockStorage, editCompiler);

  // Sample Mock Setup Data
  const sampleRouting: RoutingResultSchema = {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 1.0,
        summary: "Beverage product",
        categories: [{ value: "Beverage", confidence: 1.0, evidence_type: "OBSERVED", evidence_summary: "Tea cup" }],
        industry_domains: [{ value: "F&B", confidence: 1.0, evidence_type: "OBSERVED", evidence_summary: "Drink" }],
        likely_functions: [],
        materials: [{ value: "Glass", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Clear glass" }],
        contents: [{ value: "Milk Tea", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Brown liquid" }],
        surface_properties: [],
        geometry_traits: [],
        packaging_types: [],
        branding_features: [],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
    routing_summary: "Single beverage product",
  };

  const sampleKnowledge: KnowledgePackageV1 = {
    package_version: "1.0",
    routing_version: "1.0",
    retrieval_mode: "HYBRID",
    requires_universal_core: true,
    universal_blocks: [],
    selected_blocks: [],
    rejected_candidates: [],
    warnings: [],
    stats: {
      repository_blocks: 10,
      metadata_candidates: 2,
      semantic_candidates: 2,
      fused_candidates: 2,
      selected_blocks: 2,
      estimated_tokens: 500,
      duration_ms: 10,
    },
  };

  const samplePromptPackage: CompiledGenerationPackageV1 = {
    package_version: "1.0",
    template: { id: "master_prompt_v2", version: "2.0.9", hash: "hash209" },
    routing: { version: "1.0", mode: "HIGH_CONFIDENCE" },
    knowledge: { universal_block_ids: [], specialist_block_ids: [], knowledge_versions: {} },
    references: [{ reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0 }],
    output_config: { aspect_ratio: "4:5", use_case: "Social Ad" },
    compiled_prompt: "Render coffee cup naturally.",
    compiler_warnings: [],
    stats: {
      prompt_characters: 500,
      estimated_prompt_tokens: 125,
      universal_knowledge_tokens: 50,
      specialist_knowledge_tokens: 50,
      compile_duration_ms: 5,
    },
    input_fingerprint: "fingerprint_v1_aaa",
    compiled_prompt_hash: "prompt_hash_aaa",
  };

  const sampleRefBuffer = Buffer.from("sample_reference_image_bytes_123");

  // ─────────────────────────────────────────────────────────────
  console.log("🔹 1. Mode A: Render Again & Same/Changed Input Fingerprint Tests");

  const resG1 = await genService.generateImage({
    requestId: "req_g1",
    productReferences: [
      { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0, mimeType: "image/png", buffer: sampleRefBuffer },
    ],
    routingResult: sampleRouting,
    knowledgePackage: sampleKnowledge,
    masterPromptPackage: samplePromptPackage,
  });

  assert.strictEqual(resG1.status, "SUCCEEDED", "G1 generation should succeed");
  assert.ok(resG1.generation_id, "G1 must have generation_id");
  const g1Id = resG1.generation_id;
  const g1IdempotencyKey = resG1.trace.idempotency_key;
  console.log("  ✓ PASSED: G1 initial generation succeeded (generation_id:", g1Id, ")");

  // Render Again with SAME input
  const resG2 = await genService.generateImage({
    requestId: "req_g2",
    productReferences: [
      { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0, mimeType: "image/png", buffer: sampleRefBuffer },
    ],
    routingResult: sampleRouting,
    knowledgePackage: sampleKnowledge,
    masterPromptPackage: samplePromptPackage, // Same input fingerprint
  });

  assert.strictEqual(resG2.status, "SUCCEEDED", "G2 generation should succeed");
  assert.notStrictEqual(resG2.generation_id, g1Id, "G2 must create NEW generation_id");
  assert.notStrictEqual(resG2.trace.idempotency_key, g1IdempotencyKey, "G2 must create NEW idempotency key");
  assert.strictEqual(resG2.trace.input_fingerprint, samplePromptPackage.input_fingerprint, "G2 reuses input fingerprint");
  console.log("  ✓ PASSED: Same-input Render Again reuses fingerprint preparation but creates NEW generation_id & idempotency key");

  // Render Again with CHANGED input
  const changedPromptPackage: CompiledGenerationPackageV1 = {
    ...samplePromptPackage,
    input_fingerprint: "fingerprint_v2_bbb",
    compiled_prompt_hash: "prompt_hash_bbb",
  };

  const resG3 = await genService.generateImage({
    requestId: "req_g3",
    productReferences: [
      { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0, mimeType: "image/png", buffer: sampleRefBuffer },
    ],
    routingResult: sampleRouting,
    knowledgePackage: sampleKnowledge,
    masterPromptPackage: changedPromptPackage,
  });

  assert.strictEqual(resG3.status, "SUCCEEDED", "G3 generation should succeed");
  assert.strictEqual(resG3.trace.input_fingerprint, "fingerprint_v2_bbb", "G3 reflects changed fingerprint");
  console.log("  ✓ PASSED: Changed input Render Again invalidates stale preparation snapshot");

  // ─────────────────────────────────────────────────────────────
  console.log("\n🔹 2. Mode B: Targeted Edit & Lineage Hierarchy Tests");

  const parentImageBuffer = Buffer.from("parent_image_rendered_bytes_456");

  // Edit E2.1 from parent G2
  const resE2_1 = await editService.editImage({
    requestId: "req_e2_1",
    parentImageId: resG2.generation_id,
    parentImageBuffer,
    rootGenerationId: resG2.generation_id,
    editInstruction: "Đổi headline thành: Mùa thu đến",
    copyItems: ["Mùa thu đến"],
    supportingReferences: [
      { reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0, mimeType: "image/png", buffer: sampleRefBuffer },
    ],
  });

  assert.strictEqual(resE2_1.status, "SUCCEEDED", "E2.1 edit should succeed");
  assert.strictEqual(resE2_1.parent_image_id, resG2.generation_id, "E2.1 parent must be G2");
  assert.strictEqual(resE2_1.root_generation_id, resG2.generation_id, "E2.1 root generation must be G2");
  const e2_1Id = resE2_1.edit_id;
  console.log("  ✓ PASSED: E2.1 created with parent_image_id = G2 (edit_id:", e2_1Id, ")");

  // Edit E2.2 from parent E2.1 (Editing an Edit)
  const resE2_2 = await editService.editImage({
    requestId: "req_e2_2",
    parentImageId: e2_1Id,
    parentImageBuffer: Buffer.from("e2_1_rendered_image_bytes"),
    rootGenerationId: resG2.generation_id,
    editInstruction: "Bỏ quả cam bên trái.",
  });

  assert.strictEqual(resE2_2.status, "SUCCEEDED", "E2.2 edit should succeed");
  assert.strictEqual(resE2_2.parent_image_id, e2_1Id, "E2.2 parent must be E2.1");
  assert.strictEqual(resE2_2.root_generation_id, resG2.generation_id, "E2.2 root generation must be G2");
  console.log("  ✓ PASSED: E2.2 editing an Edit correctly preserves lineage (parent = E2.1, root = G2)");

  // Verify G3 has no dependency on E2.x
  assert.notStrictEqual(resG3.generation_id, e2_1Id);
  assert.notStrictEqual(resG3.generation_id, resE2_2.edit_id);
  console.log("  ✓ PASSED: G3 generation is independent of E2.x edits");

  // ─────────────────────────────────────────────────────────────
  console.log("\n🔹 3. Edit Reference Ordering & Contract Rules");

  // Verify mock provider received parent image as image 0
  const lastCallInput = mockProvider.lastInput;
  assert.ok(lastCallInput, "Provider received input");
  assert.ok(lastCallInput.references && lastCallInput.references.length > 0, "References provided");
  assert.strictEqual(lastCallInput.references[0].reference_id, "PARENT_IMAGE", "Image 0 MUST be current parent image");
  console.log("  ✓ PASSED: Edit request places current parent generated image as Image 0 in provider payload");

  // ─────────────────────────────────────────────────────────────
  console.log("\n🔹 4. Edit Classification & Compact Prompt Compiler Tests");

  const catText = editCompiler.classifyEditInstruction("Đổi headline thành: Mùa thu đến");
  assert.strictEqual(catText, "TEXT_EDIT");

  const catObj = editCompiler.classifyEditInstruction("Bỏ quả cam bên trái");
  assert.strictEqual(catObj, "OBJECT_EDIT");

  const catLight = editCompiler.classifyEditInstruction("Làm ánh sáng ấm hơn một chút");
  assert.strictEqual(catLight, "LIGHTING_EDIT");

  console.log("  ✓ PASSED: EditPromptCompiler accurately classifies edit instructions (TEXT_EDIT, OBJECT_EDIT, LIGHTING_EDIT)");

  const compileRes = await editCompiler.compile({
    parentImageId: "img_test",
    editInstruction: "Đổi headline thành: Mùa thu đến",
    copyItems: ["Mùa thu đến"],
  });

  assert.ok(compileRes.success && compileRes.package);
  assert.ok(compileRes.package.compiled_edit_prompt.includes("Mùa thu đến"), "Includes visible string");
  assert.ok(!compileRes.package.compiled_edit_prompt.includes("Headline:"), "No metadata label 'Headline:'");
  assert.ok(!compileRes.package.compiled_edit_prompt.includes("Role:"), "No metadata label 'Role:'");
  assert.ok(compileRes.package.stats.prompt_characters < 4000, "Edit prompt is compact (< 4,000 chars)");
  console.log("  ✓ PASSED: Edit prompt is compact (", compileRes.package.stats.prompt_characters, "chars) and respects Readable Text Firewall");

  // ─────────────────────────────────────────────────────────────
  console.log("\n🔹 5. Duplicate In-Flight Protection Tests");

  // Attempt duplicate in-flight edit
  const inFlightPromise1 = editService.editImage({
    requestId: "duplicate_test_req",
    parentImageId: "img_test",
    parentImageBuffer,
    editInstruction: "Slow edit test 1",
  });

  const inFlightPromise2 = editService.editImage({
    requestId: "duplicate_test_req",
    parentImageId: "img_test",
    parentImageBuffer,
    editInstruction: "Slow edit test 2",
  });

  const [dupRes1, dupRes2] = await Promise.all([inFlightPromise1, inFlightPromise2]);
  const failedDup = dupRes1.status === "FAILED" ? dupRes1 : dupRes2;
  assert.strictEqual(failedDup.status, "FAILED");
  assert.strictEqual(failedDup.error?.code, "GENERATION_FAILED");
  assert.ok(failedDup.warnings.includes("DUPLICATE_IN_FLIGHT_REQUEST"));
  console.log("  ✓ PASSED: Duplicate in-flight request protection prevents multiple concurrent executions");

  console.log("\n==================================================");
  console.log("🎉 ALL STAGE 6.0 REGRESSION TESTS PASSED (100%)");
  console.log("==================================================\n");
}

runStage6Tests().catch((err) => {
  console.error("❌ Stage 6.0 Tests Failed:", err);
  process.exit(1);
});
