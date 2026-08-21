# TIDO IMAGE ENGINE — STAGE 2 PROVIDER HARDENING REPORT

## 1. Legacy SDK Migration Result
* **Migration Target:** Successfully migrated from legacy `@google/generative-ai` to current official Google GenAI SDK: `@google/genai` (`^0.1.1`).
* **Dependency Clean-up:** Uninstalled `@google/generative-ai` completely as no other subsystem in the codebase uses it. Verified clean `package.json` dependencies.
* **Preserved Architecture:** Preserved all higher-level abstractions including `KnowledgeRouterService`, `RoutingRuntimeSchemaAdapter`, `RoutingValidator`, `CreativeLeakDetector`, API endpoint `/api/image/router/analyze`, tester UI in `/render-image`, error models, and retry policy.

---

## 2. Files Changed
* `apps/web/package.json`: Installed `@google/genai`, removed `@google/generative-ai`.
* `apps/web/lib/image-engine/service/KnowledgeRouterService.ts`: Refactored to instantiate `GoogleGenAI` from `@google/genai` and invoke `ai.models.generateContent({ model, contents, config })`.
* `apps/web/lib/image-engine/schema/RoutingRuntimeSchemaAdapter.ts`: Updated to use `Type` from `@google/genai` for building `responseSchema`.
* `apps/web/lib/image-engine/run-router-tests.ts`: Updated imports and assertions to use `@google/genai`.
* `apps/web/lib/image-engine/run-live-router-test.ts`: Updated live runner test to use `@google/genai`.
* `IMAGE_ENGINE_STAGE2_REPORT.md`: Updated project report documenting hardening results.

---

## 3. Gemini 3.6 Flash Configuration & Sampling Parameters
* **Model ID:** Centralized as `gemini-3.6-flash` in `IMAGE_ENGINE_CONFIG.GEMINI_MODEL`.
* **Sampling Parameters Removed:** Removed deprecated sampling controls (`temperature`, `topP`, `topK`) from `KnowledgeRouterService.ts`.
* **Reliability Foundation:** Model outputs rely strictly on system rules in `knowledge_router_v1.md`, structured output response schema, canonical schema validation, evidence rules, and local creative boundary checks.

---

## 4. Structured Output Status
* **Format:** Uses true Gemini Structured Output via `config: { responseMimeType: "application/json", responseSchema }`.
* **Schema Integrity:** Canonical `routing_schema_v1.json` is preserved without modifications; `RoutingRuntimeSchemaAdapter` translates it into Gemini SDK `Type` definitions at runtime.
* **No Free-Text Parsing:** Output is strictly schema-enforced by Gemini 3.6 Flash prior to application-side validation.

---

## 5. Server Boundary & Security
* **Server-Only SDK Calls:** All calls to `@google/genai` execute exclusively within Next.js server route handlers and Node.js services.
* **Secrets Protection:** `GEMINI_API_KEY` is loaded from `process.env.GEMINI_API_KEY` and is never sent or leaked to client components.
* **Request-Scoped Media:** Uploaded reference images are converted to in-memory `Buffer` instances (`inlineData`) and released after request execution. No temporary files are stored on disk.

---

## 6. CreativeLeakDetector Review
* **Prescription Targeting:** Confirmed that `CreativeLeakDetector` specifically targets prescriptive keys (e.g. `"recommended_camera"`, `"recommended_lighting"`) and explicit imperative phrases (e.g. `"use camera angle"`, `"dramatic lighting recommendation"`).
* **Factual Terminology Allowance:** Harmless professional descriptors (e.g. `"reflective material requires knowledge about illumination interaction"`) are permitted.
* **Result:** No modification was necessary as the detector already avoids false-positive keyword matching.

---

## 7. Regression & Test Results
* **Stage 1 Test Suite (`npx tsx lib/image-engine/run-tests.ts`):** `21 / 21 Assertions Passed` (Zero regressions).
* **Stage 2 Router Test Suite (`npx tsx lib/image-engine/run-router-tests.ts`):** `All Router Unit & Negative Tests Passed` using `@google/genai`.
* **Next.js Production Build (`npm run build`):** Compiled successfully in `1770ms`, TypeScript check passed in `2.1s`, 13 static pages generated. Zero build errors or warnings.

---

## 8. Live Test Readiness
* **SDK & Model:** `run-live-router-test.ts` is fully updated to test `@google/genai` with `gemini-3.6-flash`.
* **API Key Status:** When `GEMINI_API_KEY` is set in `.env.local`, live API calls execute and save `sample_routing_output.json`. If `GEMINI_API_KEY` is unconfigured, the runner logs a clear warning without throwing errors.

---

*Stage 2 Provider Hardening Complete. Stopped before Stage 3.*
