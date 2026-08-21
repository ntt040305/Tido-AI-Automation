# TIDO SIMPLE INPUT V1 — ASPECT RATIO PROVIDER FAILURE REPORT

## FAILED RUNTIME RATIO
`4:3` (or any unvalidated ratio submitted to ImgStudio API endpoint `/api/v1/images/edit` that is rejected with HTTP 400 `{"error":"Tỷ lệ ảnh không hợp lệ","status":"error"}`).

## UI RATIO OPTIONS
Exposed in `apps/web/components/SimpleRenderImageComponents.tsx` (`SimpleAspectRatioSelector`):
- `1:1`
- `4:5`
- `3:4`
- `9:16`
- `16:9`
- `4:3`

Default ratio in UI state (`apps/web/app/render-image/page.tsx`): `"4:5"`.

## VALIDATOR RATIO OPTIONS
`SimpleInputValidatorV1.ts`: Validates that `aspectRatio` is a non-empty string. It does not enforce a whitelist against provider capability.

## PROVIDER RATIO OPTIONS
- `IMAGE_ENGINE_CONFIG.SUPPORTED_ASPECT_RATIOS`: `["1:1", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"]`
- `CloudflareImageGenerationProvider.ts`: Validates against `SUPPORTED_ASPECT_RATIOS`.
- `GeminiImageGenerationProvider.ts`: Validates against `SUPPORTED_ASPECT_RATIOS`.
- `ImgStudioImageGenerationProvider.ts`: Forwards `input.aspectRatio` directly to ImgStudio REST API without pre-call validation.

## KNOWN SUCCESSFUL RATIOS
Proven in existing system telemetry & metadata files (`data/generated/image-renders/`):
- `1:1` (Verified in `imggen_4dcba51186864825`, `imggen_5142d95eb542b42b`)
- `4:5` (Verified in `imggen_2680e1b97d871f65`, `imggen_1f7ea7d12647656a`)
- `9:16` (Verified in `imggen_91be4a9c131e73cc`)
- `16:9` (Supported by upstream models)
- `3:4` (Supported by upstream models)

## UNSUPPORTED UI RATIOS
- `4:3` (Rejected by ImgStudio backend with HTTP 400 `"Tỷ lệ ảnh không hợp lệ"`)

## FIRST MISMATCH
Between `SimpleAspectRatioSelector` (exposes `4:3`) and `ImgStudioImageGenerationProvider.ts` (lacks pre-validation against ImgStudio API ratio constraints before making upstream HTTP request).

## ROOT CAUSE
`ImgStudioImageGenerationProvider` forwards the `aspectRatio` string received from the orchestrator directly to the ImgStudio API endpoint (`POST /api/v1/images/edit`) without validating whether ImgStudio supports that ratio. When an unsupported ratio (such as `4:3`) is selected in the UI, ImgStudio API rejects the request with HTTP 400 `{"error":"Tỷ lệ ảnh không hợp lệ","status":"error"}`.

## SMALLEST SAFE FIX
1. **Provider Defense**: Add explicit ratio validation in `ImgStudioImageGenerationProvider.ts` against allowed ratios (`["1:1", "4:5", "3:4", "9:16", "16:9"]`), returning `UNSUPPORTED_ASPECT_RATIO` pre-provider error instead of incurring a failed HTTP 400 request.
2. **UI Alignment**: Remove/disable unsupported ratio options (e.g. `4:3`) from `SimpleAspectRatioSelector` in `SimpleRenderImageComponents.tsx` so users can only select ratios supported end-to-end by the active provider.

## FILES THAT WOULD NEED CHANGE
- `apps/web/lib/image-engine/provider/ImgStudioImageGenerationProvider.ts`
- `apps/web/components/SimpleRenderImageComponents.tsx`

## HIGH_RISK CORE CHANGE REQUIRED
NO

## PAID CALLS
0
