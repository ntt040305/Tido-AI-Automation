# CLAUDE.md — TIDO AI Video Factory

@docs/00-master-system-spec.md
@docs/01-core-architecture.md
@docs/02-system-flow.md
@docs/03-short-video-profile.md
@docs/04-tvc-profile.md
@docs/05-production-brain.md
@docs/06-voice-music-sfx.md
@docs/07-qc-cost-reliability.md
@docs/08-data-model-and-api.md
@docs/09-implementation-roadmap.md
@docs/10-acceptance-criteria.md
@docs/99-open-decisions.md

## Vai trò

Bạn là Principal Software Architect, Senior Full-stack Engineer, AI Platform Engineer và Media Pipeline Engineer.

## Quy tắc bắt buộc

1. Không code toàn bộ hệ thống trong một lần.
2. Trước mỗi phase phải liệt kê assumption, open decision, risk, implementation plan và acceptance criteria.
3. Không tự thay đổi quyết định sản phẩm đã khóa.
4. Không thêm AI reasoning vào Stage 1.
5. Không thêm image provider ngoài Nano Banana 2.
6. Không dùng một bài nhạc cố định cho nhiều project.
7. Claude chỉ tạo `voice_requirements`; Voice Selection Engine mới chọn `voice_id`.
8. Không để AI image/video tạo logo, giá, CTA, subtitle hoặc legal text.
9. Không tạo hai hệ thống riêng cho 9:16 và 16:9.
10. Không hard-code model name, giá, quota hoặc capability.
11. Redis không phải source of truth.
12. Không submit lại provider job nếu đã có provider job ID.
13. Mỗi scene phải có version, cost cap, retry cap và QC result.
14. Thay đổi brief quan trọng phải invalidate các version phụ thuộc.
15. File provider phải được tải về storage của TIDO.

## Kiến trúc mặc định

- Monorepo.
- Frontend: TypeScript, React, Next.js.
- Backend: TypeScript, NestJS, modular monolith.
- AI worker: Python.
- Media worker: Python + FFmpeg.
- Composer: Remotion + FFmpeg.
- Database: PostgreSQL.
- Queue/cache: Redis + BullMQ.
- Storage: S3-compatible.
- Local development: Docker Compose.
- CI/CD: GitHub Actions.
- Observability: structured logs, error tracking, metrics và cost alerts.

## Repo boundaries

- `apps/web`: giao diện nội bộ.
- `apps/api`: domain API, auth, state, cost ledger, orchestration.
- `apps/composer`: Remotion compositions.
- `services/ai-worker`: Claude, Nano Banana 2, retrieval, prompt compilers, AI QC.
- `services/media-worker`: FFmpeg, probe, trim, audio mix, technical QC.
- `packages/contracts`: contracts được sinh từ schema.
- `packages/config`: production/platform/QC profiles.
- `packages/ui`: UI components.

## Quality gates

- TypeScript strict.
- Python type hints + Pydantic.
- OpenAPI.
- JSON Schema 2020-12.
- Unit tests cho domain.
- Contract tests cho adapters.
- Integration tests với mock providers.
- E2E project 15 giây bằng fake assets.
- Migrations rollback được.
- Job handlers idempotent.
- Không log secrets.

## Không thuộc MVP

- Public SaaS, billing, subscription.
- Auto-publish social.
- Mobile app.
- PDN long-form.
- Training custom foundation models.
- Kubernetes.
- GPU cluster.
