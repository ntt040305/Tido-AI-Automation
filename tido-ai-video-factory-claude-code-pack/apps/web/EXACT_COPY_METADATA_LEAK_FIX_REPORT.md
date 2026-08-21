# TIDO IMAGE ENGINE — STAGE 5.9.1 EXACT COPY METADATA LEAK FIX REPORT

> **Status:** COMPLETE & VERIFIED  
> **Version:** `Master Prompt v2.0.6`  
> **Test Integrity:** 15/15 Stage 4B Compiler Tests PASSED | 15/15 Stage 5 Integration Tests PASSED  
> **API Spend:** $0.00 (Zero paid image generation API calls executed)

---

## 1. Root Cause Analysis

In prior versions, `MasterPromptCompilerService.ts` serialized user copy items into the final provider prompt using a bracketed metadata prefix format:

```
- [HEADLINE]: "Mùa thu đến"
- [SUBHEADLINE]: "Trải nghiệm món mới"
- [PRODUCT_NAME]: "Trà sữa Caramel"
- [PRICE]: "49.000đ"
- [CTA]: "Mua ngay"
```

While intended as **internal layout classification metadata**, downstream vision-language image generation models (such as Flow · Nano Banana 2 or Gemini 3.1 Flash Image) misinterpreted the leading bracketed labels (`[HEADLINE]:`, `[SUBHEADLINE]:`, `[PRODUCT_NAME]:`) as literal text to be painted onto the visual canvas. This resulted in generated images visibly rendering unwanted UI labels like `"Headline: Mùa thu đến"` or `"Subheadline: Trải nghiệm món mới"`.

Furthermore, `master_prompt_v2.md` lacked an explicit **Visible-Text Whitelist contract** instructing downstream models that internal field role names and metadata tags must never be drawn on the image canvas.

---

## 2. Old vs New Compiler Representation

| Aspect | Old Compiler Representation (`v2.0.5`) | New Compiler Representation (`v2.0.6`) |
| :--- | :--- | :--- |
| **Serialization Pattern** | `- [TYPE]: "TEXT"` | `${index + 1}. Exact Visible String: "${text}" (Role: ${role})` |
| **Headline Output** | `- [HEADLINE]: "Mùa thu đến"` | `1. Exact Visible String: "Mùa thu đến" (Role: headline)` |
| **Subheadline Output** | `- [SUBHEADLINE]: "Trải nghiệm món mới"` | `2. Exact Visible String: "Trải nghiệm món mới" (Role: subheadline)` |
| **Product Name Output**| `- [PRODUCT_NAME]: "Trà sữa Caramel"` | `3. Exact Visible String: "Trà sữa Caramel" (Role: product_name)` |
| **Price Output** | `- [PRICE]: "49.000đ"` | `4. Exact Visible String: "49.000đ" (Role: price)` |
| **CTA Output** | `- [CTA]: "Mua ngay"` | `5. Exact Visible String: "Mua ngay" (Role: cta)` |
| **Whitelist Header** | None | `VISIBLE-TEXT WHITELIST: Only strings listed under AUTHORIZED VISIBLE COPY below may appear as readable text on the visual canvas. Role labels are internal non-visible metadata.` |

---

## 3. Master Prompt Wording Changes (`master_prompt_v2.md`)

1. **Version Header Bump**:
   ```markdown
   <!-- ID: master_prompt_v2 | VERSION: 2.0.6 -->
   ```

2. **Refined `## TYPOGRAPHY` Section**:
   ```markdown
   ## TYPOGRAPHY
   Integrate authorized copy into layout preserving exact text wording, capitalization, punctuation, numbers, and accents without character alteration. Render ONLY authorized visible copy values. Never render internal metadata field role labels onto the visual canvas unless explicitly part of the user's visible text value.
   ```

3. **Updated `## INTERNAL FINAL CHECK` Section**:
   ```markdown
   - [ ] Is exact copy rendered without spelling/diacritic errors or internal metadata field role labels?
   ```

---

## 4. Visible-Text Whitelist & User Value Integrity

### A. Visible-Text Whitelist Behavior
- Only strings explicitly enclosed inside quotes under `AUTHORIZED VISIBLE COPY` are authorized to appear as readable typography on the final image.
- Role names (`headline`, `subheadline`, `product_name`, `price`, `cta`, `other`) exist solely as parenthetical layout hints `(Role: headline)` for visual hierarchy decisions, and are explicitly classified as non-visible metadata.

### B. User-Supplied Prefix Handling (User Value Integrity)
- **Rule:** The compiler does **not** silently alter user-supplied text values.
- **Example:** If a user intentionally types `"Headline: Siêu sale"` into the input box, the compiler produces:
  `1. Exact Visible String: "Headline: Siêu sale" (Role: headline)`
- The complete string `"Headline: Siêu sale"` is preserved as intended user copy content because it was supplied by the user rather than generated as system metadata.

---

## 5. Prompt Character Budget Compliance

| Metric | Before Fix (`v2.0.5`) | After Fix (`v2.0.6`) | Budget Limit | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Template Size** | 8,510 chars | 8,506 chars | — | `-4 chars` |
| **Full Benchmark Compiled Prompt** | 18,910 chars | 18,962 chars | **< 19,000 chars** | **PASS (Compliant)** |

---

## 6. Regression Test Results

Added Section 15 (`Stage 5.9.1 Exact Copy Metadata Leak Invariant Tests`) to `run-stage4b-tests.ts`:

```typescript
// CASE A: HEADLINE role ("Mùa thu đến")
assert(copyAText.includes('Exact Visible String: "Mùa thu đến"'));
assert(!copyAText.includes('[HEADLINE]: "Mùa thu đến"'));
assert(!copyAText.includes('Headline: Mùa thu đến')); // [PASS]

// CASE B: SUBHEADLINE role ("Trải nghiệm món mới")
assert(copyBText.includes('Exact Visible String: "Trải nghiệm món mới"'));
assert(!copyBText.includes('Subheadline: Trải nghiệm món mới')); // [PASS]

// CASE C: PRODUCT_NAME role ("Trà sữa Caramel")
assert(copyCText.includes('Exact Visible String: "Trà sữa Caramel"'));
assert(!copyCText.includes('Tên sản phẩm:'));
assert(!copyCText.includes('[PRODUCT_NAME]:')); // [PASS]

// CASE D: CTA role ("Mua ngay")
assert(copyDText.includes('Exact Visible String: "Mua ngay"')); // [PASS]

// CASE E: User intentionally types "Headline: Siêu sale"
assert(copyEText.includes('Exact Visible String: "Headline: Siêu sale"')); // [PASS]
```

### Full Test Suite Summary

- `run-stage4b-tests.ts`: **15/15 Test Sections Passed (100%)**
- `run-stage5-tests.ts`: **15/15 Integration Tests Passed (100%)**

---

## 7. Files Modified

1. `apps/web/data/prompts/master_prompt_v2.md`
   - Updated template version to `2.0.6`.
   - Updated `## TYPOGRAPHY` and `## INTERNAL FINAL CHECK` with anti-metadata leak contracts.
2. `apps/web/lib/image-engine/compiler/MasterPromptCompilerService.ts`
   - Refactored `copyItems` compiler serialization to use `AUTHORIZED VISIBLE COPY` whitelist format.
3. `apps/web/lib/image-engine/run-stage4b-tests.ts`
   - Updated template version assertion to `2.0.6`.
   - Added 5 new deterministic invariant tests (Section 15 Cases A–E).

---

## 8. Zero Paid Renders Confirmation

> **Confirmation:** Zero paid image generation API calls were executed ($0.00 spent). All compiler formatting and invariant tests were compiled and validated 100% locally via synthetic test suites.
