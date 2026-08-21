# TIDO IMAGE ENGINE — STAGE 5.6
# REFERENCE SEMANTICS & PROMPT ATTENTION OPTIMIZATION REPORT

> [!IMPORTANT]
> **Status:** Stage 5.6 Surgical Master Prompt Optimization Complete.
> **Template Version:** `2.0.2`
> **Template Hash:** `06bf263617a1a5be`
> **Regression Status:** 15/15 Stage 5 Tests Passed | 11/11 Stage 4B Compiler Test Sections Passed
> **Paid API Renders Executed:** 0 (Zero paid calls made)

---

## 1. Executive Summary

Stage 5.6 addresses the visual integration gap where referenced products appeared like separately photographed reference images composited into generated scenes. Without modifying provider code, knowledge logic, or reference transport, Stage 5.6 surgically optimizes the **Master Prompt V2** template (`v2.0.2`) to establish clear **Reference Semantics**, distinguish **Protected Identity** from **Re-synthesized Scene Attributes**, refine **Priority #1**, and eliminate **Duplicated Control Text**.

---

## 2. Before & After Metrics

| Metric | Before (v2.0.1) | After (v2.0.2) | Change / Impact |
| :--- | :--- | :--- | :--- |
| **Master Prompt Version** | `2.0.1` | `2.0.2` | Bumped patch version |
| **Template Character Count** | `7,299` chars | `8,003` chars | +704 chars (added Reference Semantics & Global Coherence sections) |
| **Template Token Estimate** | `~1,460` tokens | `~1,600` tokens | Crisp, well-structured token distribution |
| **"Fidelity" Word Repetitions** | `6` occurrences | `0` occurrences | **100% eliminated** (removed vague fidelity loops) |
| **Total Control Repetitions** | `28` occurrences | `22` occurrences | **21.4% reduction** in duplicated control text |
| **Paid Renders Cost** | `$0.00` | `$0.00` | Zero paid image API calls executed |

---

## 3. Summary of Master Prompt V2.0.2 Structural Changes

### 1. New `## REFERENCE SEMANTICS` Section Added
Inserted immediately following `## REFERENCE INTERPRETATION`:
```markdown
## REFERENCE SEMANTICS
Reference images are evidence of PRODUCT IDENTITY, not source canvases for the final composition.

Interpret reference images as information about the physical product. Do not treat source-image pixels, crop boundaries, background, studio illumination, cast shadows, reflections, exposure, white balance, sharpness, or depth of field as protected product identity.

Do not composite or preserve the source photograph as a visual layer. The final product should be newly rendered inside the final scene while remaining recognizably faithful to the reference-supported identity.
```

### 2. Refined `## PRODUCT IDENTITY` Section
Explicitly separates immutable product identity from flexible photographic attributes:
```markdown
## PRODUCT IDENTITY
Maintain product identity continuity across visual scenes.

- **PROTECTED (What the product is):** Geometry, structural proportions, container form, logo, label text, authentic colors, materials, liquid identity, and toppings/garnish.
- **RE-SYNTHESIZED (How the product is photographed):** Light direction, environmental reflections, contact and cast shadows, ambient color response, focus, and surface interactions.

The rendered product must remain recognizable as the physical item supported by the reference evidence.
```

### 3. Consolidated `## SCENE-NATIVE PRODUCT INTEGRATION` Section
Streamlined redundant feature lists while preserving strict physical integration mandates:
```markdown
## SCENE-NATIVE PRODUCT INTEGRATION
Re-render each required product inside the final environment so it appears physically present and photographed within the scene.

Re-synthesize naturally according to the new environment:
- illumination, highlights, reflections, and refraction
- contact shadows and cast shadows matching receiving surfaces
- ambient environmental color influence, contrast, and depth
- focus behavior and physical surface interactions

Do not preserve original background, studio lighting, reference shadows, color cast, or depth of field. The final result must not resemble a pasted cutout, sticker, collage layer, separately lit object, or composite overlay.

This is a physical integration requirement, not a Creative Direction constraint. The downstream model retains full Creative Authority over camera, lighting, composition, and style.
```

### 4. New `## GLOBAL IMAGE-FORMATION COHERENCE` Section
Adds a single compact rule for spatial image-formation coherence:
```markdown
## GLOBAL IMAGE-FORMATION COHERENCE
When the intended visual execution is photographic, all products and surrounding scene elements must appear captured under coherent image-formation conditions. Spatial coherence should exist across illumination, exposure, environmental color response, shadow behavior, reflection/refraction, spatial depth, focus behavior, edge sharpness, and surface interaction.
```

### 5. Refined Priority #1 Wording (`## CONFLICT PRIORITY`)
Eliminated overly broad "Direct Reference Evidence" phrasing to prevent protecting source-photo artifacts:

* **Before (v2.0.1):**
  `1. **Real Product Identity & Direct Reference Evidence** (Highest priority)`

* **After (v2.0.2):**
  `1. **Real Product Identity & Reference-Supported Identity Evidence** (Highest priority — includes structural geometry, proportions, authentic colors, materials, liquid contents, toppings/garnish identity, labels, logos, and characteristic details; excludes reference background, source lighting, baked shadows, environmental reflections, exposure, white balance, depth of field, or photographic crop)`

---

## 4. Regression & Verification Results

```
=================================================
⚡ STAGE 4B — MASTER PROMPT COMPILER V2 TEST SUITE
=================================================
🔹 1. Template Validation (v2.0.2, hash: 06bf263617a1a5be) -> PASSED
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

## 5. Next Steps

1. **Human Evaluation**: The system is ready for the user to trigger **ONE benchmark render** via the UI to inspect the improved scene integration on Flow · Nano Banana 2.
2. **Zero Paid Renders Triggered**: System remains idle awaiting user confirmation.
