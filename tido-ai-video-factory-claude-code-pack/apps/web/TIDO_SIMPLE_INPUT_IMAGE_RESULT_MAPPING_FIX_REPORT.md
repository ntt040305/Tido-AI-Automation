# TIDO SIMPLE INPUT V1 — IMAGE RESULT MAPPING FIX REPORT

## TRACE SUMMARY

| Layer / Stage | Field / Location | Value / Status |
| :--- | :--- | :--- |
| **PROVIDER RESULT URL FIELD** | `ImgStudioImageGenerationProvider.ts` | `remoteDetails.url` (Top-level `imageUrl` was missing) |
| **ORCHESTRATOR EXPECTED FIELD** | `SimpleImageGenerationOrchestratorService.ts` | `providerRes.imageUrl` |
| **API RESPONSE FIELD** | `POST /api/image/generate-simple` | `imageUrl` |
| **FRONTEND EXPECTED FIELD** | `apps/web/app/render-image/page.tsx` | `data.imageUrl` |
| **FIRST POINT IMAGE URL IS LOST** | **`ImgStudioImageGenerationProvider.ts`** | Provider returned `{ success: true, imageBuffer, remoteDetails: { url: json.url } }` without populating top-level `imageUrl`. |

---

## ROOT CAUSE

1. `ImgStudioImageGenerationProvider.generateImage()` constructed `fileUrl` from `json.url`, but attached it **only inside `remoteDetails.url`**, omitting `imageUrl` at the top level of `ProviderImageGenerationOutput`.
2. `SimpleImageGenerationOrchestratorService` assigned `imageUrl: providerRes.imageUrl`. Because `providerRes.imageUrl` was `undefined`, `orchestratorResult.imageUrl` evaluated to `undefined`.
3. `POST /api/image/generate-simple/route.ts` serialized `NextResponse.json({ ..., imageUrl: result.imageUrl })`. JSON stringify omitted the `undefined` `imageUrl` key.
4. `app/render-image/page.tsx` checked `if (data.success && data.imageUrl)`. Because `data.imageUrl` was absent, the frontend fell through to the `else` block and rendered the generic Vietnamese error state despite provider success.

---

## FIXES APPLIED

1. **`ImgStudioImageGenerationProvider.ts`**:
   - Added `imageUrl: fileUrl` to the top-level return object of `generateImage()`.

2. **`ImageGenerationProvider.ts`**:
   - Updated `ProviderImageGenerationOutput` interface to explicitly include `remoteDetails?: { url?: string; [key: string]: any }`.

3. **`SimpleImageGenerationOrchestratorService.ts`**:
   - Implemented fallback defense: `const resolvedImageUrl = providerRes.imageUrl || providerRes.remoteDetails?.url;`.
   - Added safe result logging upon `[SIMPLE][06 PROVIDER] PASS` output: `console.log("[SIMPLE][06 PROVIDER] PASS", { hasImageUrl: Boolean(resolvedImageUrl), resultKeys: Object.keys(providerRes ?? {}), imageUrlType: typeof resolvedImageUrl })`.

4. **`run-simple-input-v6-tests.ts`**:
   - Added Case 37A & Case 37B testing both top-level `imageUrl` and `remoteDetails.url` fallback preservation across Orchestrator mapping.

---

## REQUIRED REPORT AUDIT

- **PROVIDER RESULT URL FIELD**: `remoteDetails.url` (missing top-level `imageUrl` in provider)
- **ORCHESTRATOR EXPECTED FIELD**: `providerRes.imageUrl`
- **API RESPONSE FIELD**: `imageUrl`
- **FRONTEND EXPECTED FIELD**: `data.imageUrl`
- **FIRST POINT IMAGE URL IS LOST**: `ImgStudioImageGenerationProvider.ts` (top-level `imageUrl` omitted in return object)
- **ROOT CAUSE**: Provider omitted top-level `imageUrl`, causing Orchestrator result `imageUrl` to be `undefined`, which `NextResponse.json` dropped, breaking `data.success && data.imageUrl` on frontend.
- **FILES MODIFIED**:
  - `apps/web/lib/image-engine/provider/ImgStudioImageGenerationProvider.ts`
  - `apps/web/lib/image-engine/provider/ImageGenerationProvider.ts`
  - `apps/web/lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts`
  - `apps/web/lib/image-engine/run-simple-input-v6-tests.ts`
- **PROVIDER GENERATION LOGIC CHANGED**: NO
- **CORE ENGINE LOGIC CHANGED**: NO
- **OFFLINE RESULT-MAPPING TEST**: PASS (87/87)
- **PAID CALLS**: 0
