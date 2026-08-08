# Implementation Roadmap

## Phase 0 — Foundation
Monorepo, Docker Compose, CI, lint/typecheck/test, OpenAPI, schema validation, mock providers, ADR, secrets.

Exit: services boot, CI pass, fake queued job chạy end-to-end.

## Phase 1 — Domain Core
Project, profiles, brief versions, approval, state machine, scene spec, cost skeleton, audit.

Exit: create/confirm brief, approve mocked creative, invalid transitions rejected.

## Phase 2 — Claude + Production Brain
Claude adapter, structured output, prompt versioning/cache, technique cards, retrieval, treatment/script/scenes.

Exit: locked brief tạo output valid; revision flow hoạt động.

## Phase 3 — Nano Banana 2
Adapter, references, versions, cache/dedupe, image QC, compositing fallback.

Exit: scene tạo approved keyframe và ghi cost.

## Phase 4 — Video Framework
Registry, adapter contract, mock provider, real provider 1, fallback provider, reconciliation, scene QC, footage selection.

Exit: scene complete/fail/retry/fallback độc lập.

## Phase 5 — Voice
Audit kho giọng, profiles, scoring, preview, performance direction, rendering, QC/cache.

Exit: approved script tạo timed voice file.

## Phase 6 — Music/SFX
Library ingestion, metadata, license, scoring, edit points, cues.

Exit: nhạc/SFX được chọn riêng từng project.

## Phase 7 — Composer
Remotion, FFmpeg, subtitles, graphics, profile layout, mix, master/variants.

Exit: output MP4 cho cả hai profile.

## Phase 8 — Final QC/Pilot
Profile QC, analytics, admin debug, alert, manual review, benchmark/pilot.

Exit: KPI nội bộ đạt ngưỡng.
