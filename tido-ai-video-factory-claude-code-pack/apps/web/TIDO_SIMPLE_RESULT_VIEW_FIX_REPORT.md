# TIDO SIMPLE INPUT V1 — RESULT VIEW / DOWNLOAD / RENDER AGAIN FIX REPORT

## BROKEN IMAGE ROOT CAUSE
The ImgStudio generation provider returned raw authenticated remote file URLs (`https://imgstudio.site/api/v1/images/{id}/file`). When rendered directly in the browser's `<img>` tag, the browser issued unauthenticated `GET` requests without the required `Authorization: Bearer <IMGSTUDIO_API_KEY>` header, causing the upstream API to respond with HTTP 401/403 and resulting in a broken image icon in the UI.

## LEGACY WORKING DISPLAY METHOD
The legacy TIDO system saved downloaded provider image buffers into local storage via `LocalGeneratedImageStorage` under `data/generated/image-renders/{generationId}/output.png` and served them via the application endpoint `/api/image/generated/{generationId}`.

## SIMPLE DISPLAY METHOD BEFORE FIX
Raw remote ImgStudio URL passed straight to `setResultState` without persisting the image buffer to application local storage.

## FINAL DISPLAY METHOD
`SimpleImageGenerationOrchestratorService` now persists the provider's downloaded `imageBuffer` using `LocalGeneratedImageStorage` and returns the same-origin application URL `/api/image/generated/{generationId}`. The frontend renders this URL directly using standard `<img>`.

## DOWNLOAD ROOT CAUSE
The previous download handler attempted to navigate directly to the cross-origin remote provider URL via `<a href={state.imageUrl}>`, causing the browser to navigate away from `/render-image`, resulting in a page refresh and complete loss of current form state.

## FINAL DOWNLOAD METHOD
1. The server endpoint `/api/image/generated/[id]` supports `?download=1` which sets `Content-Disposition: attachment; filename="tido-{generationId}.png"`.
2. Frontend `handleDownload` calls `preventDefault()`/`stopPropagation()`, fetches the local same-origin asset blob, creates an in-memory `blobUrl`, and initiates the download without changing location.

---

```
DOWNLOAD NAVIGATES AWAY:
NO

FORM STATE PRESERVED AFTER DOWNLOAD:
YES

RENDER AGAIN USES CURRENT INPUTS:
YES

PREVIOUS GENERATED IMAGE USED AS REFERENCE:
NO

RESULT IMAGE VISIBLE IMMEDIATELY:
YES

FILES MODIFIED:
- apps/web/lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts
- apps/web/app/api/image/generated/[id]/route.ts
- apps/web/components/SimpleRenderImageComponents.tsx
- apps/web/lib/image-engine/run-simple-input-v6-tests.ts

IMAGE ENGINE CORE MODIFIED:
NO

OFFLINE TESTS:
PASS (99/99 test cases passed)

PAID CALLS:
0
```
