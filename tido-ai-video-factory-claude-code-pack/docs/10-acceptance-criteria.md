# Acceptance Criteria

## Product
- Tạo project Short hoặc TVC.
- Stage 1 không AI reasoning.
- User confirm brief.
- Claude output versioned/reviewable.
- Approval bắt buộc trước production.
- Nano Banana 2 là AI image provider duy nhất.
- Voice chọn từ kho công ty.
- Music chọn per-project.
- Scene retry độc lập.
- Brand graphics deterministic.

## Reliability
- Resume sau restart.
- Không duplicate provider submit/cost.
- Một scene lỗi không fail project.
- Provider URLs được ingest.
- Dead-letter/reconciliation hoạt động.

## Quality targets
- first-pass scene ≥ 65% sau benchmark;
- after fallback ≥ 90%;
- product accuracy ≥ 90%;
- logo/price/CTA error = 0;
- no-manual-edit ≥ 80%;
- estimate variance ≤ 15%;
- technical completion ≥ 95%;
- approval within two versions ≥ 80%.

## Short
1080×1920, vertical-native, safe zones, mobile text, first-frame/hook/retention QC, Vertical Master + variants.

## TVC
1920×1080, wide composition, cinematic continuity, hero QC, Horizontal Master + variants.

## Security
Server-side keys, signed URLs, workspace isolation, roles, audit, no secret logs, preserve license metadata.
