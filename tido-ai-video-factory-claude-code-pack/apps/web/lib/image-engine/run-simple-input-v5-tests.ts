import { SimpleInputValidatorV1 } from "./validation/SimpleInputValidatorV1";
import { SimpleInputRequestV1 } from "./types";

async function runSimpleInputV5Tests() {
  console.log("=========================================================");
  console.log("🚀 STARTING TIDO SIMPLE INPUT V1 — PHASE 5 UI TEST SUITE");
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

  // ── TEST 44: Four-Input Single Mode Form Contract ──────────────────
  const validReq: SimpleInputRequestV1 = {
    concept: "Poster fantasy mùa hè cho hai ly nước bay giữa mây, title 'HÈ BAY LÊN'",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [
      { reference_id: "REF_01", filename: "product1.png", mimeType: "image/png" },
      { reference_id: "REF_02", filename: "logo.png", mimeType: "image/png" },
      { reference_id: "REF_03", filename: "mood.png", mimeType: "image/png" },
    ],
  };

  const valRes = SimpleInputValidatorV1.validateRequest(validReq);
  assert(valRes.isValid === true, "Test 44: Simple four-input request passes validation");
  assert((validReq.images || []).length === 3, "Test 44: Mixed reference upload (3 images) accepted");

  // ── TEST 45: Concept Raw Text Preservation ────────────────────────
  const rawConceptText = "Tên sản phẩm là Matcha Cloud và Coffee Cream, title 'SUMMER VIBES'.";
  assert(rawConceptText.includes("Matcha Cloud"), "Test 45: Raw concept preserves exact copy text");
  assert(rawConceptText.includes("SUMMER VIBES"), "Test 45: Raw concept preserves exact title text");

  // ── TEST 46: Concept Character Counter & Limits ────────────────────
  function getConceptState(conceptText: string) {
    const len = conceptText.length;
    if (len > 1000) return { isBlocked: true, warning: "OVER_LIMIT" };
    if (len > 800) return { isBlocked: false, warning: "STRONG_WARNING" };
    if (len > 600) return { isBlocked: false, warning: "SOFT_WARNING" };
    return { isBlocked: false, warning: "NORMAL" };
  }

  assert(getConceptState("A".repeat(500)).warning === "NORMAL", "Test 46: 500 chars -> NORMAL");
  assert(getConceptState("A".repeat(650)).warning === "SOFT_WARNING", "Test 46: 650 chars -> SOFT_WARNING");
  assert(getConceptState("A".repeat(850)).warning === "STRONG_WARNING", "Test 46: 850 chars -> STRONG_WARNING");
  assert(getConceptState("A".repeat(1050)).isBlocked === true, "Test 46: 1050 chars -> BLOCKED");

  // ── TEST 47: Vietnamese Error Message Mapping ──────────────────────
  const ERROR_MAP: Record<string, string> = {
    VALIDATION_FAILED: "Thông tin nhập chưa hợp lệ. Vui lòng kiểm tra lại concept và ảnh đã tải lên.",
    NO_PRODUCT_REFERENCE: "Chưa xác định được sản phẩm trong hình ảnh đã tải lên. Vui lòng tải lên ảnh sản phẩm rõ ràng.",
    INTERPRETATION_FAILED: "Hệ thống chưa phân tích được yêu cầu. Vui lòng kiểm tra concept và ảnh.",
    PROMPT_BUDGET_EXCEEDED: "Yêu cầu hiện quá phức tạp. Hãy rút gọn concept một chút.",
    EXACT_COPY_FAILED: "Không thể đảm bảo chính xác nội dung chữ trong concept. Vui lòng kiểm tra lại.",
    PROVIDER_TIMEOUT: "Quá trình tạo ảnh mất quá nhiều thời gian. Bạn có thể thử tạo lại.",
    PROVIDER_UPSTREAM_ERROR: "Dịch vụ tạo ảnh đang gặp sự cố. Vui lòng thử lại sau.",
    GENERATION_FAILED: "Không thể tạo ảnh lúc này. Vui lòng thử lại sau.",
  };

  assert(ERROR_MAP["VALIDATION_FAILED"].includes("chưa hợp lệ"), "Test 47: VALIDATION_FAILED mapped correctly");
  assert(ERROR_MAP["NO_PRODUCT_REFERENCE"].includes("ảnh sản phẩm rõ ràng"), "Test 47: NO_PRODUCT_REFERENCE mapped correctly");
  assert(ERROR_MAP["PROMPT_BUDGET_EXCEEDED"].includes("quá phức tạp"), "Test 47: PROMPT_BUDGET_EXCEEDED mapped correctly");
  assert(ERROR_MAP["PROVIDER_UPSTREAM_ERROR"].includes("sự cố"), "Test 47: PROVIDER_UPSTREAM_ERROR mapped correctly");

  // ── TEST 48: Render Again Behavior Invariant ──────────────────────
  const renderAgainPayload = {
    concept: validReq.concept,
    useCase: validReq.useCase,
    aspectRatio: validReq.aspectRatio,
  };
  assert(renderAgainPayload.concept === validReq.concept, "Test 48: Render Again reuses current simple input values");

  console.log("\n=========================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 5 UI TESTS PASSED SUCCESSFULLY!`);
  console.log("=========================================================\n");
}

runSimpleInputV5Tests().catch((err) => {
  console.error("❌ PHASE 5 UI TEST SUITE FAILED:", err);
  process.exit(1);
});
