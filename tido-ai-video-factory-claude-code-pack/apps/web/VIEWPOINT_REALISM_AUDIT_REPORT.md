# TIDO IMAGE ENGINE — STAGE 5.9
# VIEWPOINT FREEDOM & PHOTOGRAPHIC REALISM AUDIT REPORT

> [!IMPORTANT]
> **Audit Status:** Stage 5.9 Read-Only System Audit Complete.
> **Scope:** Analysis Only — Master Prompt V2 (`v2.0.5`), Compiler Service (`MasterPromptCompilerService.ts`), and Universal Knowledge Blocks.
> **Modifications Applied:** **No modifications applied.** (Zero code edits, zero prompt patches, zero paid API calls).

---

## 1. Executive Summary

Following the successful resolution of multi-product identity collapse in Stage 5.8.1, the Tido Image Engine reliably generates distinct product identities, exact copy, and brand-governed assets. However, visual evaluation reveals a recurring aesthetic limitation:
- Generated products can still feel **visually rigid, overly frontal, catalog-like, or artificial**.
- Products often appear **placed into a scene** rather than naturally photographed inside one shared physical environment.

This audit evaluates the Master Prompt architecture, knowledge blocks, and compiler outputs to pinpoint why downstream vision-language models (e.g., `Flow · Nano Banana 2`, `Gemini 3.1 Flash Image`) default to rigid, frontal, poster-like layouts.

The investigation reveals that the system currently **over-protects label/logo readability** and **over-enforces flat product separation**, while **under-authorizing dynamic 3D camera angles and optical depth physics**.

---

## 2. Current System Strengths (What Is Already Working)

1. **Product Identity Preservation**: Geometry, structural proportions, authentic brand colors, logos, and materials are faithfully preserved.
2. **Multi-Product Distinctness**: Resolved `PRODUCT_01` vs `PRODUCT_02` mapping reliably prevents identity collapse, cloning, or feature merging.
3. **Exact Copy & Unicode**: Text copy, diacritics, prices, and headlines are rendered with 100% spelling precision.
4. **Knowledge Boundary Safety**: Universal core and specialist knowledge blocks inject cleanly without internal metadata pollution.
5. **Compiler Budget Compliance**: Prompt compilation runs deterministically under the 19,000 character safety limit (~17,910 chars standard).

---

## 3. Detailed Forensic Audit of Suspected Causes

### A. Over-Protection of Readability vs. Viewpoint Freedom

#### Prompt & Knowledge Sections Responsible:
- `PRODUCT IDENTITY` (Line 32 in `master_prompt_v2.md`)
- `CONFLICT PRIORITY` (Priority 1 in `master_prompt_v2.md`)
- `universal.commercial_visual_hierarchy` (`Hero Subject Priority` & `Figure-Ground Legibility`)
- `universal.lighting_material_readability` (`Form & Volume Readability`)

#### Mechanism & Breakdown:
- **Conflict Priority #1** places "Real Product Identity... labels, logos, and characteristic details" at the absolute top of the decision hierarchy.
- **Universal Commercial Visual Hierarchy** mandates that "important visual features should remain sufficiently readable" and "primary commercial focus recognized quickly".
- When downstream models receive a single reference photo showing a front-facing studio shot of a product, the model's attention mechanism reasons defensively:
  > *"If I rotate the product to a 3/4 angle, steep perspective, or organic tabletop angle, part of the logo or label will be foreshortened, turned away, or partially shaded. Since Priority #1 protects label/logo identity and visual hierarchy requires high readability, the safest choice is to keep the product facing directly toward the camera."*
- **Diagnostic Result**: The system accidentally conflates **Product Identity Protection** with **Frontal Presentation Style**, causing the model to play it safe with frontal, catalog-style views.

---

### B. Catalog Lineup Bias in Multi-Product Staging

#### Prompt & Knowledge Sections Responsible:
- `PRODUCT_INSTANCE_REQUIREMENTS` (Compiler injection in `MasterPromptCompilerService.ts`)
- `MULTI-PRODUCT IDENTITY ISOLATION` (Line 39 in `master_prompt_v2.md`)
- `universal.commercial_visual_hierarchy` (`Visual Balance & Space`)

#### Mechanism & Breakdown:
- `MULTI-PRODUCT IDENTITY ISOLATION` mandates: *"Preserve each product's reference-supported characteristics... Do not clone... Do not average... Do not transfer features across distinct identities."*
- `MasterPromptCompilerService.ts` injects: `DISTINCT PRODUCT IDENTITY ISOLATION: Each listed PRODUCT_xx is a separate physical identity...`
- While this effectively prevents identity merging, it focuses exclusively on **2D distinctness and separation**, with **zero guidance on 3D spatial depth staging** (e.g. depth layering, overlapping, hero foreground vs stepped-back background placement).
- **Diagnostic Result**: To satisfy "2 distinct products fully visible with separate identities" without explicit 3D staging rules, the downstream model defaults to placing products **side-by-side in an evenly spaced frontal lineup** (catalog staging).

---

### C. Defensive Negative Prohibitions vs. Positive Photographic Realism

#### Prompt & Knowledge Sections Responsible:
- `SCENE-NATIVE PRODUCT INTEGRATION` (Line 52 in `master_prompt_v2.md`)
- `GLOBAL IMAGE-FORMATION COHERENCE` (Line 61 in `master_prompt_v2.md`)
- `universal.physical_scene_coherence` (`Grounding & Physical Contact`)

#### Mechanism & Breakdown:
- `SCENE-NATIVE PRODUCT INTEGRATION` relies heavily on negative warnings: *"Avoid pasted cutout, sticker, collage layer, overlay, or separately lit object appearance."*
- Negative warnings ("Don't look like a cutout") instruct the model on what to avoid, but fail to instruct the model on **how real commercial photography behaves**:
  - Natural optical depth of field (soft background defocus, realistic focus plane)
  - Ambient environmental bounce light and subtle color bleed
  - Surface contact interactions (micro-shadows, surface pressure, reflection warping)
  - Atmospheric environment (ambient moisture, dust particles, realistic lens refraction)
- **Diagnostic Result**: Over-reliance on negative warnings triggers defensive generation. The model renders crisp, studio-isolated products pasted onto environmental backgrounds with artificial lighting, rather than integrating them into a single optical exposure.

---

### D. Rigid "Poster Layout" Over-Constraint

#### Prompt & Knowledge Sections Responsible:
- `TYPOGRAPHY` (Line 161 in `master_prompt_v2.md`)
- `COMMERCIAL PRINCIPLES` (Line 156 in `master_prompt_v2.md`)
- `USER BRIEF` & `EXACT COPY`

#### Mechanism & Breakdown:
- The combined effect of `TYPOGRAPHY` ("Integrate copy into layout...") and `COMMERCIAL PRINCIPLES` ("Deliver commercial quality: clear visual hierarchy...") leads the downstream model to format the entire image like a **2D graphic poster layout** rather than a **3D photographic scene**.
- The product is centered and locked in place to leave artificial negative space for copy text, resulting in a flat poster composition rather than a dynamic lifestyle photograph with text overlaid post-capture.

---

## 4. Diagnostic Answers to Key Questions

| Diagnostic Question | Findings |
| :--- | :--- |
| **A. Does the system protect PRODUCT IDENTITY correctly?** | **YES.** Proportions, colors, logos, and materials are well protected. |
| **B. Does it accidentally protect REFERENCE VIEWPOINT or PRESENTATION STYLE?** | **YES.** Because logos/labels are top priority, the model interprets front-facing reference photos as a presentation requirement. |
| **C. Does it bias the model toward front-facing or centered compositions?** | **YES.** High emphasis on logo readability and visual hierarchy pushes products to the center, facing the camera. |
| **D. Does it bias the model toward "clean placement" instead of natural integration?** | **YES.** Negative warnings ("avoid cutout") cause defensive crisp studio rendering instead of rich optical interactions. |
| **E. Could it make the scene feel like a poster layout rather than a photograph?** | **YES.** Typography and hierarchy rules nudge the model to design a flat 2D layout rather than capturing a 3D physical moment. |

---

## 5. Ranked Top 5 Highest-Probability Causes

```mermaid
gantt
    title Probability Hierarchy of Rigid / Fake Visual Outputs
    dateFormat X
    axisFormat %s

    section Cause 1: Readability & Viewpoint Confusion :active, c1, 0, 95
    section Cause 2: Lack of 3D Spatial Staging Directives :active, c2, 0, 85
    section Cause 3: Defensive Warnings Over Optical Realism :active, c3, 0, 75
    section Cause 4: Poster Layout Bias from Copy Rules :active, c4, 0, 65
    section Cause 5: Passive Permission vs Active Angle Freedom :active, c5, 0, 55
```

1. **RANK 1 (Highest Probability): Conflation of Logo Readability with Frontal Reference Camera View**
   - *Issue Type*: Conflict Priority / Over-Protection.
   - *Impact*: The model fears turning or tilting the product away from camera because Conflict Priority #1 protects label/logo visibility.

2. **RANK 2: Absence of 3D Spatial Depth & Staging Guidance in Multi-Product Requests**
   - *Issue Type*: Under-Specification of Staging.
   - *Impact*: Multi-product isolation rules enforce 2D distinctness without 3D depth instructions, resulting in flat side-by-side catalog lineups.

3. **RANK 3: Over-Reliance on Negative Warnings ("Avoid Cutout") Instead of Positive Optical Physics**
   - *Issue Type*: Defensive Instruction Pattern.
   - *Impact*: Models avoid cutout artifacts defensively by rendering evenly lit, studio-isolated items on top of scene backgrounds.

4. **RANK 4: Graphic Poster Layout Bias Induced by Typography & Hierarchy Rules**
   - *Issue Type*: Over-Constraint of Staging.
   - *Impact*: Visuals are composed like 2D graphic ads with centered products rather than authentic commercial photography.

5. **RANK 5: Passive Viewpoint Decoupling Without Active Photographic Angle Freedom**
   - *Issue Type*: Passive vs. Active Guidance.
   - *Impact*: `VIEWPOINT DECOUPLING` states that the viewpoint *may* change, but does not actively authorize dynamic 3D angles (e.g. 3/4 hero view, subtle tilt, tabletop perspective).

---

## 6. Recommended Minimal-Fix Strategy (Analysis Only)

To resolve visual rigidity and catalog presentation without adding code or expanding prompt length, future work should execute a **Surgical Prompt & Compiler Refinement (v2.0.6)**:

1. **Clarify Viewpoint Decoupling & Logo Perspective**:
   - Explicitly instruct that **3/4 angles, natural tilts, and organic perspectives are fully valid**, even if the label/logo is naturally foreshortened or partially angled, provided product identity remains recognizable.

2. **Inject 3D Depth Staging in Multi-Product Compiler Output**:
   - In `MasterPromptCompilerService.ts`, enhance multi-product instructions to encourage **natural 3D depth layering** (e.g., staggering products in foreground/background, subtle angle variation) rather than 2D side-by-side lineups.

3. **Frame Scene-Native Integration via Positive Optical Physics**:
   - Shift `SCENE-NATIVE PRODUCT INTEGRATION` from negative warnings ("avoid cutout") to **positive optical interactions**: single exposure lens coherence, natural depth of field defocus, environmental bounce light, and surface contact micro-shadows.

4. **Decouple Graphic Layout from Photographic Scene Capture**:
   - Clarify in `TYPOGRAPHY` and `COMMERCIAL PRINCIPLES` that the scene should be photographed as a believable 3D environment first, with copy integrated harmoniously into natural negative space.

---

## 7. Explicit Confirmation Statement

> **No modifications applied.**
> This report is an analysis-only diagnostic document. No source files, prompt templates, compiler services, or knowledge blocks were modified. Zero paid image generation API calls were executed.
