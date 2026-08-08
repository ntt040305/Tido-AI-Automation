# TIDO Production Brain

## Purpose

Biến kinh nghiệm production của TIDO thành dữ liệu có cấu trúc để Claude và Production Planner chọn đúng kỹ thuật cho từng scene.

## Core libraries

- Cinematography
- Lighting
- F&B Shot
- Directing
- Editing
- Audio
- AI Production

## Profile extensions

### Short Vertical
Vertical framing, hook, retention, mobile text, platform UI, UGC/social-native.

### TVC Horizontal
Wide composition, brand narrative, premium lighting, cinematic pacing, delivery profile.

## Retrieval

Input:
- scene purpose
- product type
- production profile
- visual style
- emotion
- budget
- provider limits

Output:
- 5–15 Technique Cards phù hợp;
- lý do chọn;
- constraints;
- fallback.

## Governance

- card có version và owner;
- card mới cần review;
- archive thay vì delete;
- lưu card IDs trong SceneSpecification;
- đo pass rate/cost/retry/approval theo card;
- Version 1 dùng retrieval + rule, chưa train model riêng.

## Minimum fields

- technique ID/version/name/category
- purpose
- suitable/not suitable
- profile tags
- camera/lighting/action setup
- expected result
- common failures
- QC criteria
- provider hints
- fallback
- status/owner
