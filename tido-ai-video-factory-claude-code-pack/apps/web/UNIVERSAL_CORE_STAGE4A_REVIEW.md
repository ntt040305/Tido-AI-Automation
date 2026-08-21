# UNIVERSAL COMMERCIAL KNOWLEDGE CORE V1 — STAGE 4A HUMAN REVIEW DOCUMENT

**Date:** August 2026  
**Subsystem:** TIDO Image Engine — Stage 4A Universal Knowledge Core  
**Current Status:** ⚠️ ALL BLOCKS REMAIN DRAFT PENDING HUMAN REVIEW  

---

## 1. Universal Core Philosophy

The Universal Commercial Knowledge Core V1 injects foundational professional visual principles into downstream commercial image generation models. It provides **reusable professional domain intelligence** (explaining visual hierarchy, perspective coherence, material readability, typography legibility, and physical scene realism) rather than **prescriptive creative recipes**.

The downstream model retains absolute creative authority over unlocked variables (such as camera choice, lens selection, background props, lighting rigs, and styling templates).

---

## 2. Universal Core Overview

- **Total Universal Core Blocks:** 5
- **Total Estimated Token Budget:** 1,202 tokens (Target: 1,000–1,600 tokens | Ceiling: ≤ 1,800 tokens)
- **Schema Compliance:** 100% compliant with `knowledge_block_schema_v1.json`
- **Knowledge Type:** `UNIVERSAL`
- **Scope:** `GLOBAL`
- **Creative Recipe Flag:** `false`
- **Status:** `DRAFT`

---

## 3. Block Specifications

### Block 1: `universal.commercial_visual_hierarchy`
- **ID:** `universal.commercial_visual_hierarchy`
- **Title:** Universal Commercial Visual Hierarchy Principles
- **Estimated Tokens:** 232 tokens (767 characters)
- **Purpose:** Professional visual principles for establishing clear focal hierarchy, figure-ground separation, and balanced visual weight without prescribing compositional templates.
- **Main Principles:**
  1. Hero Product Priority & Focal Anchor.
  2. Figure-Ground Separation & Contrast legibility.
  3. Balance & Purposeful Negative Space for copy integration.

### Block 2: `universal.camera_perspective_coherence`
- **ID:** `universal.camera_perspective_coherence`
- **Title:** Universal Camera & Perspective Spatial Coherence
- **Estimated Tokens:** 240 tokens (799 characters)
- **Purpose:** Professional visual principles governing perspective consistency, foreshortening, scale relationships, and spatial depth for believable product representation.
- **Main Principles:**
  1. Unified Horizon Line & Vanishing Point Integrity.
  2. Foreshortening & Form Legibility without spatial warping.
  3. Scale Proportionality across depth planes.

### Block 3: `universal.lighting_material_readability`
- **ID:** `universal.lighting_material_readability`
- **Title:** Universal Illumination & Material Surface Readability
- **Estimated Tokens:** 247 tokens (826 characters)
- **Purpose:** Professional principles for using light and shade to reveal 3D volume, material texture, surface reflectivity, and subject separation.
- **Main Principles:**
  1. 3D Form Revelation & Volume Shading.
  2. Specular Reflection Coherence following surface finish.
  3. Soft Occlusion Shadows & Rim Separation.

### Block 4: `universal.typography_graphic_integration`
- **ID:** `universal.typography_graphic_integration`
- **Title:** Universal Commercial Typography & Graphic Integration
- **Estimated Tokens:** 235 tokens (779 characters)
- **Purpose:** Professional design principles for integrating text, logos, and graphic copy legibly and harmoniously into advertising visuals.
- **Main Principles:**
  1. Typographic Legibility & High Contrast Backing.
  2. Hierarchy & Layout Alignment across copy levels.
  3. Product Protection (preventing copy from obscuring hero brand features).

### Block 5: `universal.physical_scene_coherence`
- **ID:** `universal.physical_scene_coherence`
- **Title:** Universal Physical Scene & Environmental Coherence
- **Estimated Tokens:** 248 tokens (831 characters)
- **Purpose:** Professional principles for ensuring physical interaction, gravitational grounding, surface contact, occlusion, and environmental reflection logic.
- **Main Principles:**
  1. Gravitational Grounding & Natural Base Contact.
  2. Spatial Occlusion & Physical Overlap Boundaries.
  3. Positional Alignment of Cast Shadows & Surface Reflections.

---

## 4. Architectural & Safety Audits

### A. Redundancy Audit
- **Findings:** Inspected potential overlaps between `visual_hierarchy` vs `typography_integration`, and `lighting_material` vs `physical_scene`.
- **Action Taken:** Separated responsibilities cleanly. `visual_hierarchy` owns composition & figure-ground; `typography_integration` owns text copy readability; `lighting_material` owns surface shading/texture; `physical_scene` owns base grounding & occlusion order. Duplicate explanations were removed.

### B. Master Prompt Overlap Audit
- **Findings:** Inspected Master Prompt V2 system rules (`single-reference policy`, `exact copy preservation`, `brand knowledge priority`).
- **Action Taken:** Intentionally excluded all prompt-control logic from Universal Core. Universal Core contains exclusively professional visual intelligence.

### C. Creative Neutrality Audit
- **Findings:** Audited all 5 blocks for fixed creative defaults (e.g., specific lenses, softboxes, background colors, composition templates).
- **Action Taken:** Verified 0 occurrences of prescriptive creative choices. All blocks are 100% creative-neutral.

### D. Open-World Compatibility Audit
- **Findings:** Verified that no block assumes specific product categories (e.g., bottles, shoes, phones).
- **Action Taken:** Principles are stated using open-world visual domain terminology applicable to any physical commercial product.

---

## 5. Repository Validation & Test Results

- **LocalKnowledgeRepository Structural Validation:** ✅ PASSED (0 errors)
- **Universal Core Audit Script (`run-universal-core-audit.ts`):** ✅ PASSED (All 5 blocks valid)
- **Stage 1 Test Suite (`run-tests.ts`):** ✅ PASSED (21/21)
- **Stage 2 Test Suite (`run-router-tests.ts`):** ✅ PASSED (21/21)
- **Stage 3 Test Suite (`run-stage3-tests.ts`):** ✅ PASSED (22/22)
- **Stage 3.1 Test Suite (`run-stage3-1-tests.ts`):** ✅ PASSED (27/27)

---

## 6. Activation Status Notice

> [!IMPORTANT]
> **ALL 5 UNIVERSAL CORE BLOCKS REMAIN IN `DRAFT` STATUS.**  
> They are excluded from production retrieval and vector index creation until human domain experts review and formally approve them.
