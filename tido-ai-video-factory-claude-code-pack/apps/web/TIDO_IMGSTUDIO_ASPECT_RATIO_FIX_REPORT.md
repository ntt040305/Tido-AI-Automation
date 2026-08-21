# TIDO SIMPLE INPUT V1 — IMGSTUDIO ASPECT RATIO FIX REPORT

## IMGSTUDIO VERIFIED SUPPORTED RATIOS
`1:1`, `4:5`, `9:16`, `3:4` (Empirically verified in recorded system telemetry & provider response files e.g. `imggen_325d560b36a028ba/provider_response_raw.json`).

## IMGSTUDIO VERIFIED UNSUPPORTED RATIOS
`4:3` (Proven HTTP 400 error `{"error":"Tỷ lệ ảnh không hợp lệ"}` returned by ImgStudio API endpoint `/api/v1/images/edit`).

## UNVERIFIED RATIOS
`16:9` (Maintained in configuration based on standard landscape aspect ratio specification; no recorded raw response file in current workspace history).

## FINAL SIMPLE UI RATIOS
`1:1`, `4:5`, `3:4`, `9:16`, `16:9`

## 4:3 REMOVED FROM SIMPLE UI
YES

## IMGSTUDIO PREVALIDATION ADDED
YES (`ImgStudioImageGenerationProvider.ts` pre-validates `input.aspectRatio` against `IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS` before initiating HTTP request).

## UNSUPPORTED RATIO CAN REACH IMGSTUDIO HTTP
NO

## SILENT RATIO FALLBACK
NO (Requested canvas ratio is never converted or muted; invalid ratios are rejected explicitly pre-call with code `UNSUPPORTED_ASPECT_RATIO`).

## FILES MODIFIED
- `apps/web/lib/image-engine/config.ts`
- `apps/web/lib/image-engine/provider/ImgStudioImageGenerationProvider.ts`
- `apps/web/lib/image-engine/types.ts`
- `apps/web/lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts`
- `apps/web/components/SimpleRenderImageComponents.tsx`
- `apps/web/lib/image-engine/run-simple-input-v6-tests.ts`

## GENERATION LOGIC CHANGED
NO

## OTHER PROVIDER RATIO SUPPORT CHANGED
NO (`CloudflareImageGenerationProvider.ts` and `GeminiImageGenerationProvider.ts` retain their independent generic ratio validation).

## OFFLINE TESTS
PASS (90/90 automated test cases passed cleanly, including Case 38A & Case 38B aspect ratio pre-validation tests).

## PAID CALLS
0
