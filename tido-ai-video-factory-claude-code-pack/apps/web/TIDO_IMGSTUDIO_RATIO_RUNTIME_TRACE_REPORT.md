# TIDO SIMPLE INPUT — ASPECT RATIO RUNTIME TRACE REPORT

## CURRENT UI VALUE
`"4:5"` (Logged dynamically at form submit time via `[SIMPLE RATIO][UI]` in `apps/web/app/render-image/page.tsx`).

## ROUTE PARSED VALUE
`"4:5"` (Logged dynamically after `req.formData()` parsing via `[SIMPLE RATIO][ROUTE]` in `apps/web/app/api/image/generate-simple/route.ts`).

## ORCHESTRATOR VALUE
`"4:5"` (Logged dynamically in `[SIMPLE RATIO][ORCHESTRATOR]` in `apps/web/lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts`).

## PROVIDER INPUT VALUE
`"4:5"` (Logged dynamically in `[SIMPLE RATIO][PROVIDER]` in `apps/web/lib/image-engine/provider/ImgStudioImageGenerationProvider.ts`).

## FINAL IMGSTUDIO aspect_ratio VALUE
`"4:5"` (Appended to `FormData` under key `"aspect_ratio"` and logged via `[SIMPLE RATIO][IMGSTUDIO PAYLOAD]`).

## STRING LENGTH / CHAR CODES
- String Length: `3` (for `"4:5"`)
- ASCII Character Codes: `[52, 58, 53]` (`'4'`, `':'`, `'5'`)
- Character Integrity Check: Pure ASCII, zero unicode colon or whitespace corruption detected.

## CURRENT PROVIDER_ID
`flow-nano-banana-2` (Configured in `ImgStudioImageGenerationProvider.ts` via `process.env.IMGSTUDIO_PROVIDER_ID || "flow-nano-banana-2"`).

## CURRENT ENDPOINT WITH REFERENCES
`https://imgstudio.site/api/v1/images/edit` (POST `multipart/form-data`)

## CURRENT ENDPOINT WITHOUT REFERENCES
`https://imgstudio.site/api/v1/images/edit` (POST `multipart/form-data`)

## CURRENT REQUEST MODE
EDIT (`POST /api/v1/images/edit`)

## PREVIOUS 1:1 SUCCESS MODE
EDIT (`POST /api/v1/images/edit`, empirically verified in `data/generated/image-renders/imggen_4dcba51186864825/metadata.json`)

## PREVIOUS 3:4 SUCCESS MODE
EDIT (`POST /api/v1/images/edit`, empirically verified in `data/generated/image-renders/imggen_325d560b36a028ba/provider_response_raw.json`)

## PREVIOUS 4:5 SUCCESS MODE
UNKNOWN / GEMINI MOCK (`data/generated/image-renders/imggen_2680e1b97d871f65` used provider `google-gemini`, NOT ImgStudio `/images/edit`)

## PREVIOUS 9:16 SUCCESS MODE
UNKNOWN / GEMINI MOCK (`data/generated/image-renders/imggen_91be4a9c131e73cc` used provider `google-gemini`, NOT ImgStudio `/images/edit`)

## IMGSTUDIO RATIO CONFIG CURRENTLY MODE-SPECIFIC
NO (Configured provider-wide in `config.ts` via `IMGSTUDIO_SUPPORTED_ASPECT_RATIOS`, not partitioned by `/images/edit` vs `/images/generate`).

## FIELD NAME CORRECT
YES (`aspect_ratio` key in multipart/form-data payload).

## VALUE MUTATED BETWEEN UI AND PROVIDER
NO (Ratio remains identical string `"4:5"` with ASCII charCodes `[52, 58, 53]` from UI through API route, orchestrator, and provider payload).

## LIKELY FAILURE CATEGORY
ENDPOINT_CAPABILITY_MISMATCH / PROVIDER_MODEL_CAPABILITY_MISMATCH (ImgStudio REST API endpoint `/api/v1/images/edit` with provider model `flow-nano-banana-2` empirically supports `1:1` and `3:4`, but returns HTTP 400 `{"error":"Tỷ lệ ảnh không hợp lệ"}` when `4:5` or `4:3` is submitted under EDIT mode).

## FILES MODIFIED
- `apps/web/app/render-image/page.tsx`
- `apps/web/app/api/image/generate-simple/route.ts`
- `apps/web/lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts`
- `apps/web/lib/image-engine/provider/ImgStudioImageGenerationProvider.ts`

## BUSINESS LOGIC CHANGED
NO

## PAID CALLS
0
