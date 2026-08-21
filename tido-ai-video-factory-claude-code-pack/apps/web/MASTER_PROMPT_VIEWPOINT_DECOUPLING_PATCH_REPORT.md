# TIDO IMAGE ENGINE — STAGE 5.7
# CAMERA DECOUPLING & PRODUCT PHOTOGRAPHIC REFRAMING PATCH REPORT

> [!IMPORTANT]
> **Status:** Stage 5.7 Surgical Master Prompt Patch Complete.
> **Template Version:** `2.0.3`
> **Template Hash:** `a1e1fbcc13d2511c`
> **Regression Status:** 15/15 Stage 5 Tests Passed | 12/12 Stage 4B Compiler Test Sections Passed
> **Paid API Renders Executed:** 0 (Zero paid calls made)

---

## 1. Executive Summary

Stage 5.7 addresses the visual artifact issue where generated outputs over-preserved the source reference's camera angle, height, perspective, framing, and shot distance. Without changing the system architecture, reference transport, or provider integration, Stage 5.7 surgically patches the **Master Prompt V2** template (`v2.0.3`) to establish explicit **Viewpoint Decoupling**, place camera geometry under **Re-synthesized Scene Execution**, extend **Full Creative Authority** over photographic reframing, and prioritize **Concept-Appropriate Photography** over source-photo camera preservation.

---

## 2. Root Cause Framing

Previous prompt versions protected Product Identity ("What the product is"), but did not explicitly decouple the **source photograph's camera geometry** ("How the source reference photo was shot") from the protected identity evidence. Consequently, downstream diffusion models (such as Flow · Nano Banana 2) interpreted reference images as structural camera templates, inheriting original angles, heights, and crops.

Stage 5.7 explicitly decouples reference evidence from source camera geometry, directing the model to treat reference images purely as physical identity evidence while freely choosing concept-native camera angles, framing, hero scale, and depth.

---

## 3. Exact Sections Added & Modified

### A. Added `## VIEWPOINT DECOUPLING` Section (NEW)
Inserted immediately following `## REFERENCE SEMANTICS`:
```markdown
## VIEWPOINT DECOUPLING
Reference images define physical product identity, not required camera viewpoint.

The final visual may use any camera angle, height, framing, crop, perspective strategy, hero scale, or viewpoint that best delivers the requested concept. Do not preserve the source photograph's camera geometry or shot distance by default. Only preserve or mimic the source viewpoint if explicitly requested in the user brief or constraints.
```

### B. Refined `## REFERENCE SEMANTICS` Section
Added camera setup and shot distance to non-protected source photo attributes:
```markdown
## REFERENCE SEMANTICS
Reference images are evidence of PRODUCT IDENTITY, not source canvases or photographic setup templates for the final composition.

Interpret reference images as information about the physical product. Do not treat source-image pixels, crop boundaries, background, studio illumination, camera angle, shot distance, perspective, cast shadows, reflections, exposure, white balance, sharpness, or depth of field as protected product identity.

Do not composite or preserve the source photograph as a visual layer. The final product should be newly rendered inside the final scene while remaining recognizably faithful to the reference-supported identity.
```

### C. Refined `## PRODUCT IDENTITY` Section
Explicitly categorized camera angle, height, framing, crop, perspective, and hero scale as **RE-SYNTHESIZED**:
```markdown
## PRODUCT IDENTITY
Maintain product identity continuity across visual scenes.

- **PROTECTED (What the product is):** Geometry, structural proportions, container form, logo, label text, authentic colors, materials, liquid identity, and toppings/garnish.
- **RE-SYNTHESIZED (How the product is photographed & framed):** Camera angle, viewpoint height, framing, crop, perspective, hero scale, light direction, environmental reflections, contact and cast shadows, ambient color response, focus, and surface interactions.

The rendered product must remain recognizable as the physical item supported by the reference evidence. Source viewpoint, framing, and focus pattern belong to creative scene execution, not protected product identity.
```

### D. Refined `## FULL CREATIVE AUTHORITY` Section
Added explicit authority over camera angle, height, perspective strategy, framing, crop, subject scale, placement, and spatial relationships:
```markdown
## FULL CREATIVE AUTHORITY
TIDO provides knowledge routing and constraints, but **YOU HAVE FULL CREATIVE AUTHORITY**. You independently decide and execute all creative decisions:
- Camera angle, height, perspective strategy, framing, and crop
- Subject scale, placement, and spatial relationships
- Composition and viewpoint
- Lighting design
- Environment and props
- Color
- Typography layout
- Atmosphere
- Stylistic execution

The downstream model retains full authority over camera geometry and reframing unless explicitly locked by user constraints. This creative freedom must be exercised while maintaining 100% protection over product identity.
```

### E. Refined `## CONFLICT PRIORITY` Section
Added source camera angle, framing, and crop to Priority #1 exclusions, and added explicit camera/viewpoint tension resolution logic:
```markdown
## CONFLICT PRIORITY
If a conflict arises during image generation, adhere strictly to the following priority hierarchy:
1. **Real Product Identity & Reference-Supported Identity Evidence** (Highest priority — includes structural geometry, proportions, authentic colors, materials, liquid contents, toppings/garnish identity, labels, logos, and characteristic details; excludes reference background, source lighting, source camera angle, original framing/crop, baked shadows, environmental reflections, exposure, white balance, depth of field, or photographic crop)
2. **Verified Factual & Official Brand Information**
3. **Exact Supplied Copy Text Accuracy**
4. **User Hard Requirements**
5. **Campaign Intent & User Brief**
6. **Professional Knowledge Physical Principles**
7. **Creative Authority & Artistic Execution** (Lowest priority when in conflict with facts)

If there is tension between preserving the source photo's camera viewpoint and achieving a more believable, concept-appropriate photograph, preserve product identity while allowing the camera angle, framing, and perspective to adapt to the new concept, unless the user explicitly requested the original angle.
```

### F. Refined `## INTERNAL FINAL CHECK` Section
Added a dedicated verification checkbox for camera decoupling:
```markdown
## INTERNAL FINAL CHECK
Before rendering, verify mentally:
- [ ] Does the product remain faithful to the identity supported by the reference evidence?
- [ ] Does each referenced product look physically photographed inside the final environment rather than pasted or composited from its source reference?
- [ ] Does the final visual preserve the product identity without unnecessarily inheriting the source photo's original camera angle, framing, crop, or perspective?
- [ ] Are all User Hard Constraints fulfilled?
- [ ] Is exact copy rendered without spelling errors or diacritic alterations?
- [ ] Do optical behavior and scene structure align with the intended visual logic and Professional Knowledge?
- [ ] Is the overall image visually striking, commercial-grade, and creative?
```

---

## 4. Before & After Key Wording Comparison

| Rule Area | Before (v2.0.2) | After (v2.0.3) |
| :--- | :--- | :--- |
| **Camera Viewpoint** | Implied under Creative Authority list item `"Camera and viewpoint"`. | Explicit section `## VIEWPOINT DECOUPLING` forbidding default source camera geometry preservation. |
| **Product Identity** | `RE-SYNTHESIZED (How the product is photographed): Light direction, shadows, focus...` | `RE-SYNTHESIZED (How the product is photographed & framed): Camera angle, viewpoint height, framing, crop, perspective, hero scale...` |
| **Conflict Priority #1** | Excluded `reference background, source lighting, baked shadows...` | Explicitly excludes `source camera angle, original framing/crop, reference background, source lighting...` |
| **Viewpoint Tension** | No explicit rule for camera viewpoint vs concept tension. | Explicit rule resolving camera tension in favor of concept-appropriate reframing. |
| **Final Checklist** | Checked physical integration ("photographed inside final environment"). | Added explicit check: `"Does the final visual preserve product identity without unnecessarily inheriting source photo's original camera angle, framing, crop, or perspective?"` |

---

## 5. Version, Hash & Files Changed

- **Prompt Template File**: `apps/web/data/prompts/master_prompt_v2.md`
- **Template ID**: `master_prompt_v2`
- **Template Version**: `2.0.3`
- **Template Hash**: `a1e1fbcc13d2511c`
- **Test File**: `apps/web/lib/image-engine/run-stage4b-tests.ts`
- **Report File**: `apps/web/MASTER_PROMPT_VIEWPOINT_DECOUPLING_PATCH_REPORT.md`

---

## 6. Regression & Verification Results

```
=================================================
⚡ STAGE 4B — MASTER PROMPT COMPILER V2 TEST SUITE
=================================================
🔹 1. Template Validation (v2.0.3, hash: a1e1fbcc13d2511c) -> PASSED
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
> All prompt compilation and regression tests ran locally offline.
