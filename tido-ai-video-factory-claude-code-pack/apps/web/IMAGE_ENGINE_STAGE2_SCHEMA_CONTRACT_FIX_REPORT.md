# TIDO IMAGE ENGINE — STAGE 2 SCHEMA CONTRACT FIX REPORT

## 1. Root Cause Analysis
Previous implementations had a duplicate, hardcoded schema in `RoutingRuntimeSchemaAdapter.ts` that drifted from the canonical `routing_schema_v1.json`. Specifically:
* `visual_challenges` was treated as generic classification items (`value`, `confidence`, `evidence_type`, `evidence_summary`) instead of `{ id, description, confidence }`.
* `unknowns` was reduced to `string[]` instead of `{ subject, reason, importance }`.
* `retrieval_queries` was reduced to `string[]` instead of `{ query, importance, reason }`.

---

## 2. Canonical Contract (Single Source of Truth)
The canonical JSON Schema at `data/schemas/routing_schema_v1.json` is now the **SINGLE SOURCE OF TRUTH**. The authoritative nested shapes are:

* **Classification Item:** `{ value: string, confidence: number (0..1), evidence_type: "USER_PROVIDED" | "OBSERVED" | "STRONG_INFERENCE" | "WEAK_INFERENCE", evidence_summary: string }`
* **Visual Challenge:** `{ id: string, description: string, confidence: number (0..1) }`
* **Unknown:** `{ subject: string, reason: string, importance: "LOW" | "MEDIUM" | "HIGH" }`
* **Retrieval Query:** `{ query: string, importance: "PRIMARY" | "SUPPORTING", reason: string }`
* **Product Entry:** Contains required arrays for classifications, visual_challenges, unknowns, and retrieval_queries with `additionalProperties: false`.
* **Top Level:** Required `routing_version: "1.0"`, `requires_universal_core: true`, `routing_mode`, `products`, `global_retrieval_queries`, and `routing_summary` with `additionalProperties: false`.

---

## 3. Runtime Adapter Refactoring
`RoutingRuntimeSchemaAdapter.ts` was refactored to eliminate hardcoded TypeScript schemas. It dynamically loads `routing_schema_v1.json` and performs a generic compatibility transformation:
1. Inlines `$ref` pointers from `definitions`/`$defs`.
2. Strips draft-07 meta keys (`$schema`, `$id`, `title`, `definitions`).
3. Retains all validation rules, `minimum: 0`, `maximum: 1` constraints, enums, property types, and `additionalProperties: false`.

---

## 4. Structured Output
* **Config Form:** Uses `responseJsonSchema` derived directly from `RoutingRuntimeSchemaAdapter.getGeminiResponseJsonSchema()`.
* **SDK:** `@google/genai` (`^0.1.1`).

---

## 5. Files Changed
* `data/schemas/routing_schema_v1.json`: Updated canonical schema definitions for `visual_challenge`, `unknown_item`, and `retrieval_query` with strict constraints.
* `lib/image-engine/schema/RoutingRuntimeSchemaAdapter.ts`: Refactored to dynamically derive Gemini schema from canonical JSON schema without duplicate TypeScript literals.
* `lib/image-engine/types.ts`: Updated domain interfaces (`VisualChallenge`, `RoutingUnknown`, `RetrievalQuery`, `ProductRoutingEntry`, `RoutingResultSchema`).
* `lib/image-engine/validation/RoutingValidator.ts`: Updated to strictly validate all canonical object shapes, enum ranges, confidence bounds, and `requires_universal_core === true`.
* `data/prompts/knowledge_router_v1.md`: Updated system prompt instructions to explicitly specify the canonical JSON shapes.
* `components/RenderImageComponents.tsx`: Updated `SystemInfoPanel` to display Visual Challenge `{ id, description, confidence }`, Unknown `{ subject, reason, importance }`, and Retrieval Query `{ query, importance, reason }`.
* `sample_routing_output.json`: Updated sample file to match the authoritative V1 contract shape.
* `lib/image-engine/run-router-tests.ts`: Updated test runner with 21 contract consistency, adapter derivation, sample validation, negative rejection, and creative leak tests.
* `lib/image-engine/run-live-router-test.ts`: Updated live test script to log canonical object properties.

---

## 6. Validator & Prompt Alignment
* **RoutingValidator:** Rejects malformed objects, legacy `string[]` arrays for unknowns/queries, missing `requires_universal_core`, and out-of-bounds confidence values.
* **Knowledge Router Prompt V1:** Instructs Gemini 3.6 Flash on the exact required shapes for visual challenges, unknowns, and retrieval queries, explicitly noting that visual challenges represent knowledge needs rather than creative direction.

---

## 7. UI Contract Changes
* **Visual Challenges:** Renders `id` badge, `description`, and `confidence %`.
* **Unknowns:** Renders `subject`, `reason`, and color-coded `importance` badge (`LOW` | `MEDIUM` | `HIGH`).
* **Retrieval Queries:** Renders `query`, `importance` badge (`PRIMARY` | `SUPPORTING`), and `reason` under the debug header `Chưa tìm Knowledge — Stage 3`.

---

## 8. Sample Output & Test Validation
* **`sample_routing_output.json`:** Conforms 100% to `routing_schema_v1.json` and passes `RoutingValidator`.
* **Stage 2 Router Contract Tests (`npx tsx lib/image-engine/run-router-tests.ts`):** `21 / 21 Tests Passed`.
  * Verified schema derivation from canonical file (single source of truth).
  * Verified legacy string arrays and invalid classification shapes are rejected.
  * Verified creative leak detector passes factual routing and blocks creative prescriptions.
* **Stage 1 Test Suite (`npx tsx lib/image-engine/run-tests.ts`):** `21 / 21 Tests Passed`.
* **Next.js Production Build (`npm run build`):** Compiled successfully in `953ms`, TypeScript check passed in `1.78s`, 13 static pages generated. Zero build errors or warnings.

---

## 9. Remaining Limitations
* **Stage 3 Isolation:** Knowledge retrieval, vector search, ranking, Master Prompt compilation, and Nano Banana generation remain strictly unimplemented.

---

*Stage 2 Schema Contract Fix Complete. Single Source of Truth Enforced.*
