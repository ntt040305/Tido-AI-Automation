# TIDO IMAGE ENGINE — MASTER PROMPT V2
# SURGICAL SCENE-INTEGRATION PATCH REPORT

## 1. Executive Summary
A targeted, surgical patch was applied to the **Master Prompt V2** template (`master_prompt_v2.md`) to resolve visual cutout/pasted/sticker artifacts when rendering product references inside newly generated scenes.

The patch clearly establishes the contract between **PRODUCT IDENTITY VARIABLES (Protected)** and **SCENE-DEPENDENT VARIABLES (Re-synthesized)** while strictly maintaining product identity protection, priority hierarchy, Exact Copy integrity, and downstream Creative Authority.

---

## 2. Template Version Change
- **Template Version Before Patch**: `2.0.0`
- **Template Version After Patch**: `2.0.1`
- **Template Hash (After Patch)**: `33f2d26f1fb89ef9`

---

## 3. Exact Section Inserted
```markdown
## SCENE-NATIVE PRODUCT INTEGRATION

Reference images define PRODUCT IDENTITY, not pixels to paste into the final visual.

Preserve the recognizable identity supported by the references, including:
- silhouette
- structural proportions
- container geometry
- authentic product colors
- visible materials
- liquid/content identity
- toppings and garnish
- labels
- logos
- printed graphics
- characteristic product details

However, scene-dependent appearance must be regenerated according to the NEW final environment.

Re-synthesize naturally:
- illumination on the product
- contact and cast shadows
- reflections
- refraction
- ambient environmental color influence
- local contrast
- spatial depth
- focus behavior
- interaction with nearby surfaces and objects

Do NOT preserve scene-dependent artifacts from the original reference such as:
- original background
- original studio lighting
- baked-in reference shadows
- original environmental reflections
- original color cast
- original depth of field

Each required product must appear as if it were physically present
and photographed inside the final scene.

Maintain PRODUCT IDENTITY fidelity,
not REFERENCE-PIXEL fidelity.

The final result must not resemble:
- a pasted cutout
- a sticker
- a collage layer
- a separately lit object
- a product photograph placed over a generated background

This is a PHYSICAL INTEGRATION requirement,
not a Creative Direction requirement.

Do not prescribe:
- camera angle
- lens
- lighting setup
- composition
- background
- props
- palette
- visual style

The downstream image model retains full Creative Authority over all unlocked variables.
```

---

## 4. Exact Location
- **Inserted Immediately After**: `## PRODUCT IDENTITY`
- **Inserted Immediately Before**: `## SINGLE REFERENCE POLICY`

---

## 5. Audit of Existing Fidelity Wording
- Inspected `master_prompt_v2.md` for pixel-level preservation phrases (`"preserve the product exactly as shown"`, `"copy the reference exactly"`).
- **Result**: Existing wording in `## REFERENCE INTERPRETATION` and `## PRODUCT IDENTITY` already focused correctly on identity and structural features without forcing reference-pixel preservation. No existing fidelity text required weakening or alteration.

---

## 6. Internal Final Check Checkbox Added
Added 1 new checkbox under `## INTERNAL FINAL CHECK`:
`- [ ] Does each referenced product look physically photographed inside the final environment rather than pasted or composited from its source reference?`

---

## 7. Files Changed
1. `apps/web/data/prompts/master_prompt_v2.md` (Updated header version to `2.0.1`, added `## SCENE-NATIVE PRODUCT INTEGRATION` section and 1 final check item).
2. `apps/web/lib/image-engine/run-stage4b-tests.ts` (Updated version assertion to `2.0.1` and added Section 10 regression tests for Stage 5.5 scene integration invariants).
3. `apps/web/MASTER_PROMPT_SCENE_INTEGRATION_PATCH_REPORT.md` (This report).

---

## 8. Regression Test Results
- **Stage 4B Test Suite (`run-stage4b-tests.ts`)**: **ALL PASSED (10/10 test sections)**
- **Stage 5 Integration Test Suite (`run-stage5-tests.ts`)**: **ALL PASSED (15/15 tests - 100%)**
- **System Architecture**: **100% UNTOUCHED** (Router, Knowledge Retrieval, ImgStudio Provider, Exact Copy, Brand, Product Instance, and Creative Authority logic remain completely unmodified).
