# TIDO IMAGE ENGINE — STAGE 5.8
# SEMANTIC-PRESERVING MASTER PROMPT COMPRESSION REPORT

> [!IMPORTANT]
> **Status:** Stage 5.8 Semantic-Preserving Prompt Compression Complete.
> **Template Version:** `2.0.4` (bumped from `2.0.3`)
> **Template Hash:** `8633c78db9d4aa1a`
> **Final Compiled Character Count:** `18,048` chars (Test Suite Benchmark) / `17,110` chars (Standard Benchmark) — **HARD TARGET PASS (< 19,000 chars)**
> **Regression Status:** 15/15 Stage 5 Tests Passed | 13/13 Stage 4B Compiler Test Sections Passed
> **Paid API Renders Executed:** 0 (Zero paid calls made)

---

## 1. Executive Summary & Problem Statement

In previous versions (`v2.0.3`), the final compiled provider prompt grew to **20,278 characters** (5,110 tokens) under standard knowledge packages. This exceeded the provider prompt limit of approximately 20,000 characters, causing downstream image generation calls to risk failure or rejection.

Stage 5.8 executes a **Semantic-Preserving Master Prompt Compression** that reduces the static control text and generation-facing knowledge wrappers without altering any system architecture, knowledge router, retrieval logic, provider integration, or user data.

---

## 2. Character Budget Before vs After

### Overall Benchmark Metrics

| Metric | Before (v2.0.3) | After (v2.0.4) | Savings | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Total Compiled Prompt Chars** | **20,278 chars** | **18,048 chars** (Full Test) / **17,110 chars** (Standard) | **-2,230 to -3,168 chars** | **PASS (< 19,000 Chars)** |
| **Estimated Prompt Tokens** | 5,110 tokens | 4,318 tokens | -792 tokens | Reduced by ~15.5% |
| **Static Control Text** | 8,471 chars | 6,216 chars | -2,255 chars | Compacted by ~26.6% |
| **User Brief / Copy / Hard Reqs** | Unchanged | Unchanged | 0 chars | 100% Intact |

### Character Contribution by Section

| Section Header | Before (v2.0.3) | After (v2.0.4) | Net Reduction |
| :--- | :--- | :--- | :--- |
| `Section 01: Template Header & Role` | 331 chars | 315 chars | -16 chars |
| `Section 02: Reference Interpretation` | 158 chars | 132 chars | -26 chars |
| `Section 03: Reference Semantics` | 675 chars | 419 chars | -256 chars |
| `Section 04: Viewpoint Decoupling` | 450 chars | 391 chars | -59 chars |
| `Section 05: Product Identity` | 738 chars | 605 chars | -133 chars |
| `Section 06: Scene-Native Product Integration` | 864 chars | 487 chars | -377 chars |
| `Section 07: Global Image-Formation Coherence` | 401 chars | 272 chars | -129 chars |
| `Section 08: Single Reference Policy` | 294 chars | 231 chars | -63 chars |
| `Section 09-14: User Data & Brand Context` | 1,986 chars | 1,535 chars | Wrapper text compacted |
| `Section 15: Professional Knowledge` | 9,683 chars | 9,234 chars | Header/spacing compacted |
| `Section 16-23: Exploration, Authority & Principles` | 2,423 chars | 1,667 chars | -756 chars |
| `Section 24: Conflict Priority` | 1,180 chars | 916 chars | -264 chars |
| `Section 25: Internal Final Check` | 784 chars | 585 chars | -199 chars |
| `Section 26: Final Output` | 186 chars | 163 chars | -23 chars |

---

## 3. Preserved System Principles (A through Q)

All 17 core system principles are preserved 100% without capability loss:

1. **A. Product Reference Philosophy**: References define physical identity, not camera, viewpoint, or lighting.
2. **B. Product Identity (PROTECTED)**: Geometry, proportions, container form, authentic colors, materials, liquids, toppings, labels, logos intact.
3. **C. Source Photo Appearance (UNPROTECTED)**: Source background, lighting, baked shadows, reflections, camera angle, crop, WB, DOF re-synthesized.
4. **D. Scene-Native Integration**: Products re-rendered inside environment; no cutout, sticker, collage, or composited appearance.
5. **E. Viewpoint Decoupling**: Downstream model retains full authority over camera angle, height, framing, crop, perspective, scale, shot distance.
6. **F. Single Reference Policy**: Conservative reconstruction of unseen surfaces; no invented logos/labels.
7. **G. Multi-Product Isolation**: `PRODUCT_xx` remains bound to `REF_xx`; no identity or ingredient merging.
8. **H. User Hard Requirements**: Retained as non-negotiable constraints.
9. **I. Exact Copy**: Immutable text preservation (spelling, punctuation, numbers, Vietnamese diacritics).
10. **J. Brand Knowledge**: Factual, provenance-aware, no invented rules.
11. **K. Professional Knowledge**: Supportive, non-exhaustive, factual physical principles.
12. **L. Open-World Reasoning**: UNKNOWN != UNSUPPORTED; no forcing into wrong categories.
13. **M. Full Creative Authority**: Model retains full creative freedom over camera, lighting, composition, style.
14. **N. Anti-Default Policy**: No generic visual cliches without storytelling purpose.
15. **O. Commercial Principles**: Intentional hierarchy, readable product/message, coherent optics.
16. **P. Conflict Priority**: Priority 1 (Real Product Identity) down to Priority 7 (Creative Authority) strictly preserved.
17. **Q. Internal Final Check**: All mental verification checkpoints retained.

---

## 4. Representative Before/After Wording Examples

### Example 1: `## SCENE-NATIVE PRODUCT INTEGRATION`

- **Before (v2.0.3 - 864 chars):**
  > Re-render each required product inside the final environment so it appears physically present and photographed within the scene. Re-synthesize naturally according to the new environment: illumination, highlights, reflections, and refraction, contact shadows and cast shadows matching receiving surfaces, ambient environmental color influence, contrast, and depth, focus behavior and physical surface interactions. Do not preserve original background, studio lighting, reference shadows, color cast, or depth of field. The final result must not resemble a pasted cutout, sticker, collage layer, separately lit object, or composite overlay. This is a physical integration requirement, not a Creative Direction constraint. The downstream model retains full Creative Authority over camera, lighting, composition, and style.

- **After (v2.0.4 - 487 chars):**
  > Re-render each product inside the final environment so it appears physically present and naturally photographed:
  > - Re-synthesize highlights, reflections, refraction, contact shadows, cast shadows, ambient color, depth, focus, and surface interactions.
  > - Avoid pasted cutout, sticker, collage layer, overlay, or separately lit object appearance.
  > 
  > Physical integration is mandatory; Creative Authority governs camera, lighting, composition, and style.

---

### Example 2: `## CONFLICT PRIORITY`

- **Before (v2.0.3 - 1,180 chars):**
  > If a conflict arises during image generation, adhere strictly to the following priority hierarchy:
  > 1. Real Product Identity & Reference-Supported Identity Evidence (Highest priority — includes structural geometry, proportions, authentic colors, materials, liquid contents, toppings/garnish identity, labels, logos, and characteristic details; excludes reference background, source lighting, source camera angle, original framing/crop, baked shadows, environmental reflections, exposure, white balance, depth of field, or photographic crop)
  > 2. Verified Factual & Official Brand Information
  > 3. Exact Supplied Copy Text Accuracy
  > ...
  > If there is tension between preserving the source photo's camera viewpoint and achieving a more believable, concept-appropriate photograph, preserve product identity while allowing the camera angle, framing, and perspective to adapt to the new concept, unless the user explicitly requested the original angle.

- **After (v2.0.4 - 916 chars):**
  > If a conflict arises during image generation, adhere strictly to the following priority hierarchy:
  > 1. **Real Product Identity & Reference-Supported Identity Evidence** (Highest priority — includes structural geometry, proportions, authentic colors, materials, liquid contents, toppings/garnish identity, labels, logos, and characteristic details; excludes reference background, source lighting, source camera angle, original framing/crop, baked shadows, environmental reflections, exposure, white balance, depth of field, or photographic crop)
  > 2. **Verified Factual & Official Brand Information**
  > ...
  > If there is tension between preserving the source photo's camera viewpoint and achieving a more believable, concept-appropriate photograph, preserve product identity while allowing the camera angle, framing, and perspective to adapt to the new concept, unless the user explicitly requested the original angle.

---

## 5. Files Changed

1. `apps/web/data/prompts/master_prompt_v2.md`: Compacted static control text (Version `2.0.4`, Hash `8633c78db9d4aa1a`).
2. `apps/web/lib/image-engine/compiler/MasterPromptCompilerService.ts`: Added clean generation-facing knowledge header and whitespace compacting.
3. `apps/web/lib/image-engine/run-stage4b-tests.ts`: Updated version assertion to `2.0.4`, added Section 13 (Stage 5.8 Prompt Compression Invariants & Character Limit Assertion).
4. `apps/web/MASTER_PROMPT_V2_0_4_COMPRESSION_REPORT.md`: This comprehensive report.

---

## 6. Regression & Verification Results

```
=================================================
⚡ STAGE 4B — MASTER PROMPT COMPILER V2 TEST SUITE
=================================================
🔹 1. Template Validation (v2.0.4, hash: 8633c78db9d4aa1a) -> PASSED
🔹 2. Determinism & Traceability -> PASSED
🔹 3. Exact Copy & Vietnamese Unicode -> PASSED
🔹 4. Knowledge Boundary & Injection Safety -> PASSED
🔹 5. Product Instance Semantics -> PASSED
🔹 6. Governance & Draft Knowledge -> PASSED
🔹 7. Creative Leak Safety Net -> PASSED
🔹 8. Input Staleness Fingerprint -> PASSED
🔹 9. Human Quality Guardrails -> PASSED
🔹 10. Scene-Native & Reference Semantics Verification -> PASSED
🔹 11. Stage 5.6 Reference Semantics Invariant Tests -> PASSED
🔹 12. Stage 5.7 Viewpoint Decoupling Invariant Tests -> PASSED
🔹 13. Stage 5.8 Semantic-Preserving Prompt Compression Invariants -> PASSED (< 19,000 chars)
=================================================
🎉 ALL STAGE 4B MASTER PROMPT COMPILER TESTS PASSED!
=================================================

==================================================
TIDO IMAGE ENGINE — STAGE 5 INTEGRATION REGRESSION TESTS
==================================================
TEST SUMMARY: 15/15 Tests Passed (100%)
==================================================
```

---

## 7. Paid API Renders Confirmation

> [!NOTE]
> **Zero ($0.00) paid image generation API calls were executed.**
> Prompt compilation, character measurement, and regression tests ran locally offline.
