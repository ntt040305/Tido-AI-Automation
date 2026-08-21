# TIDO Image Engine — Stage 4B Completion Report
## Master Prompt Compiler V2

**Status:** Complete  
**Date:** August 13, 2026  
**Subsystem:** Stage 4B — Master Prompt Compiler V2  
**Target Next Stage:** Stage 5 (Nano Banana API Integration & Image Generation — Not Started)

---

### 1. Executive Summary

Stage 4B of the TIDO Image Intelligence Engine establishes the **Master Prompt Compiler V2**. The Compiler is a deterministic, server-side assembly engine that fuses user intent, direct product reference mappings, exact copy strings, verified constraints, output media context, and retrieved professional visual knowledge into a single production-ready **Master Prompt V2** and structured `CompiledGenerationPackageV1`.

**CRITICAL PRINCIPLE:**  
> **The Master Prompt Compiler is a COMPILER, not a Creative Director.**  
> It does not call generative AI models (Gemini, Nano Banana, OpenAI, or Claude) to rewrite prompts. It does not independently choose lenses, camera angles, softboxes, background colors, or font aesthetics. TIDO supplies facts, constraints, and visual principles; downstream Nano Banana retains full creative authority over execution.

---

### 2. Core Architecture & Compiler Flow

```
[ User Input / Brief / Copy / Brand ]
                 +
    [ Validated Stage 2 RoutingResult ]
                 +
    [ Validated Stage 3 KnowledgePackage ]
                 │
                 ▼
 ┌────────────────────────────────────────────────────────┐
 │            MasterPromptCompilerService                 │
 │  - Validates input contracts & routing versions        │
 │  - Loads Master Prompt V2 Template (Single Truth)      │
 │  - Resolves Active Knowledge Blocks server-side        │
 │  - Maps product references & instance requirements     │
 │  - Assembles dynamic placeholders deterministically   │
 │  - Validates Exact Copy Unicode integrity              │
 │  - Verifies no unresolved placeholders remain         │
 │  - Computes SHA-256 template & input fingerprints      │
 └────────────────────────────────────────────────────────┘
                 │
                 ▼
     [ CompiledGenerationPackageV1 ]
  - master_prompt_v2 (v2.0.0, Hash: e5a1f2c...)
  - Exact Master Prompt MD text
  - Provenance & Knowledge version traceability
  - Prompt stats & token budget estimate
```

---

### 3. Master Prompt V2 Template Governance

- **Single Source of Truth:** `data/prompts/master_prompt_v2.md`
- **Template ID:** `master_prompt_v2`
- **Template Version:** `2.0.0`
- **Supported Placeholders:**
  - `{{USER_BRIEF}}`
  - `{{PRODUCT_INSTANCE_REQUIREMENTS}}`
  - `{{USER_HARD_CONSTRAINTS}}`
  - `{{EXACT_COPY}}`
  - `{{BRAND_KNOWLEDGE}}`
  - `{{OUTPUT_CONTEXT}}`
  - `{{RELEVANT_KNOWLEDGE}}`
- **Placeholder Validation:** `MasterPromptTemplateValidator` enforces required placeholders during compilation and fails with `UNRESOLVED_PLACEHOLDER` if any `{{...}}` tags remain after substitution.

---

### 4. Key Architectural Policies Implemented

#### A. Product Reference Mapping & Identity Principle
- Product references (`REF_01`, `REF_02`, etc.) define authentic physical identity (silhouette, materials, finish, label design, visible contents).
- References do **NOT** dictate fixed camera angles, original backgrounds, or original framing.
- Downstream models are instructed to preserve recognizable product identity while reconstructing unobserved angles conservatively.

#### B. Single-Reference Policy
- When a product possesses only 1 reference image, unseen surfaces must be reconstructed conservatively without hallucinating unverified branding, controls, or text.

#### C. Deterministic Product Instance Requirements
- Reconciles user `productCount`, Stage 2 routed products, and reference mappings into unambiguous quantity instructions (e.g., *"The final image MUST contain exactly 2 product instances across 2 distinct product identities: PRODUCT_01 (REF_01) and PRODUCT_02 (REF_02)"*).
- Detects ambiguous or conflicting quantity specifications and returns `PRODUCT_INSTANCE_CONFLICT` / `PRODUCT_INSTANCE_AMBIGUITY`.

#### D. Exact Copy Integrity & Vietnamese Diacritics
- Exact Copy text items supplied via `copyItems` are marked strictly **IMMUTABLE**.
- Preserves exact spelling, diacritics, numbers, prices, capitalization, and symbols (e.g. *"Bộ đôi Signature"*, *"49.000đ"*, *"Thử ngay hôm nay!"*).
- Checked post-compilation via `ExactCopyIntegrityValidator`. Any omission or diacritic stripping causes immediate compilation failure (`EXACT_COPY_INTEGRITY_FAILED`).
- If no copy is provided, the prompt explicitly instructs the downstream model **not** to invent decorative advertising copy or pseudo-readable slogans.

#### E. Brand Provenance Accuracy
- User-supplied brand context (`brandName`, `brandInfo`) is labeled accurately as user-provided background. The compiler does not invent unsupplied brand guidelines or official claims.

#### F. Server-Side Knowledge Resolution & Tiering
- Only blocks present in the validated `KnowledgePackageV1` and verified as `status: ACTIVE` in `LocalKnowledgeRepository` are injected.
- Injected order:
  1. Universal Core Blocks (All 5 Active blocks when required)
  2. PRIMARY Specialist Knowledge
  3. SUPPORTING Specialist Knowledge
  4. DEPENDENCY Knowledge
- Excludes rejected candidates, raw JSON scores, retrieval confidence breakdown, and routing query metadata to prevent prompt pollution.

#### G. Open-World Fallback Handling
- When no specialist Knowledge exists (`routing_mode = OPEN_WORLD`), the compiler proceeds successfully with Universal Core principles, issuing a `NO_SPECIALIST_KNOWLEDGE` / `OPEN_WORLD_REASONING_ONLY` warning without breaking generation.

#### H. Conflict Priority Hierarchy (7 Levels)
1. Real Product Identity & Direct Reference Evidence (Highest)
2. Verified Factual & Official Brand Information
3. Exact Supplied Copy Text Accuracy
4. User Hard Requirements
5. Campaign Intent & User Brief
6. Professional Knowledge Physical Principles
7. Creative Authority & Artistic Execution (Lowest when in conflict)

---

### 5. Data Contracts & Output Package

#### Input Contract: `MasterPromptCompilerInput`
- `productReferences`: Array of reference image identifiers or mapping objects.
- `brief`: Creative user brief text.
- `productCount`: Total required product instances.
- `copyItems`: Typed text copy array (`headline`, `price`, `cta`, etc.).
- `brandName` & `brandInfo`: Provenance-aware brand information.
- `hardRequirements`: Bulleted list of non-negotiable user rules.
- `useCase`: Intended use case (e.g. Social Post, Poster).
- `aspectRatio`: Technical aspect ratio (e.g. 4:5, 9:16).
- `routingResult`: Validated Stage 2 `RoutingResultSchema`.
- `knowledgePackage`: Validated Stage 3 `KnowledgePackageV1`.

#### Output Contract: `CompiledGenerationPackageV1`
- `package_version`: `"1.0"`
- `template`: `{ id: "master_prompt_v2", version: "2.0.0", hash: "..." }`
- `routing`: `{ version: "1.0", mode: "HIGH_CONFIDENCE" }`
- `knowledge`: `{ universal_block_ids: [...], specialist_block_ids: [...], knowledge_versions: {...} }`
- `references`: `[{ reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0 }, ...]`
- `output_config`: `{ use_case: "Social Post", aspect_ratio: "4:5" }`
- `compiled_prompt`: Full string of compiled Master Prompt MD.
- `compiler_warnings`: Warning codes array.
- `stats`: `{ prompt_characters, estimated_prompt_tokens, universal_knowledge_tokens, specialist_knowledge_tokens, compile_duration_ms }`
- `provenance`: Detailed internal provenance tracking.
- `input_fingerprint`: Deterministic SHA-256 fingerprint for UI staleness detection.

---

### 6. API Endpoint & Tester UI Integration

- **API Endpoint:** `POST /api/image/prompt/compile`
  - Accepts form data + Stage 2 Routing + Stage 3 Knowledge Package.
  - Performs deterministic server-side compilation without calling any generative LLMs.
  - Returns `CompiledGenerationPackageV1` or structured `CompilerError`.

- **Tester Panel Update (`components/RenderImageComponents.tsx`):**
  - **Group 3 (Master Prompt V2):** Activated in `SystemInfoPanel`.
  - Button **"Tạo Master Prompt"**: Executes server-side compilation.
  - Displays template version (`v2.0.0`), template hash, estimated token counters, warning badges, and block breakdown.
  - **Prompt Inspector ("Xem Master Prompt"):** Scrollable viewer for the complete compiled prompt and metadata.
  - **Staleness Tracking:** SHA-256 input fingerprint detects changes in brief, copy, or parameters after prompt creation.

---

### 7. Sample Artifacts Generated

1. [`sample_compiled_generation_package.json`](file:///d:/Tido/tido-ai-video-factory-claude-code-pack/apps/web/sample_compiled_generation_package.json): Full production-ready compilation output package containing metadata, references, token stats, and template hash.
2. [`sample_compiled_master_prompt.md`](file:///d:/Tido/tido-ai-video-factory-claude-code-pack/apps/web/sample_compiled_master_prompt.md): Human-readable final Master Prompt MD ready for downstream Nano Banana image generation.

---

### 8. Verification & Test Suite Results

All 6 test and audit suites passed cleanly with **100% success rate (Exit code 0)**:

| Test / Audit Suite | Command / File | Status | Score |
| :--- | :--- | :---: | :---: |
| **Stage 1 Infrastructure** | `lib/image-engine/run-tests.ts` | ✅ PASS | **21 / 21** |
| **Stage 2 Router Contract** | `lib/image-engine/run-router-tests.ts` | ✅ PASS | **21 / 21** |
| **Stage 3 Smart Retrieval** | `lib/image-engine/run-stage3-tests.ts` | ✅ PASS | **22 / 22** |
| **Stage 3.1 Quality Hardening** | `lib/image-engine/run-stage3-1-tests.ts` | ✅ PASS | **27 / 27** |
| **Stage 4A Universal Core Audit** | `lib/image-engine/run-universal-core-audit.ts` | ✅ PASS | **27 / 27** |
| **Stage 4B Master Prompt Compiler** | `lib/image-engine/run-stage4b-tests.ts` | ✅ PASS | **16 / 16** |
| **Repository Validation** | `LocalKnowledgeRepository.validateRepository()` | ✅ PASS | **0 Errors** |
| **Next.js Production Build** | `npm run build` | ✅ PASS | **Success** |

---

### 9. Known Limitations & Next Stage Boundary

- **Nano Banana API Not Connected:** Stage 4B compiles and packages the Master Prompt V2. It does not call image-generation APIs or render image files.
- **Image Generation Boundary:** Generation execution is strictly reserved for Stage 5.

---

### 10. Definition of Done Checklist

- [x] Master Prompt V2 is a single template source of truth (`master_prompt_v2.md`).
- [x] Compiler is 100% deterministic (no generative LLM used).
- [x] Product reference mapping (`REF_01` -> `PRODUCT_01`) preserved.
- [x] Single-reference policy enforced.
- [x] Product instance count is deterministic.
- [x] Exact Copy text is immutable and preserves Vietnamese diacritics.
- [x] Brand provenance is truthful.
- [x] Output context (`useCase`, `aspectRatio`) included.
- [x] All 5 ACTIVE Universal Core blocks included when required.
- [x] Only selected specialist Knowledge included; rejected candidates excluded.
- [x] DRAFT Knowledge rejected for production compilation.
- [x] Knowledge versions and template version/hash are traceable.
- [x] Routing debug data and retrieval scores do not pollute prompt.
- [x] Knowledge remains supportive, not prescriptive.
- [x] TIDO does not invent Creative decisions (full authority granted to downstream model).
- [x] 7-level conflict priority hierarchy implemented.
- [x] Open-world generation supported without specialist Knowledge.
- [x] Exact Copy Integrity Validator passes.
- [x] No unresolved `{{...}}` placeholders remain.
- [x] Tester UI displays compiled Master Prompt and tracks staleness.
- [x] All Stage 4B tests pass (16/16).
- [x] All regression test suites pass.
- [x] Production build (`npm run build`) succeeds cleanly.
