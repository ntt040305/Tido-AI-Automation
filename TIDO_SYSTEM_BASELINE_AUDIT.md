# TIDO CREATIVE OS — TECHNICAL SYSTEM BASELINE AUDIT

> **Audit Date:** August 27, 2026  
> **Auditor Role:** Senior Python Architect | Senior AI System Architect | MLOps Engineer | Product Engineer  
> **Repository:** `ntt040305/Tido-AI-Automation`  
> **Audit Status:** COMPLETED — Baseline Established  

---

## 1. Current Architecture Overview

Hệ thống hiện tại là sự kết hợp giữa **2 phần độc lập** chưa được kết nối hoàn chỉnh thành một SaaS Monolith unified:

```
TIDO AI AUTOMATION REPOSITORY
│
├── 1. F5-TTS-Vietnamese (Python Backend Engine)
│   └── Voice Performance Engine V2 (Standalone PyTorch + FastAPI pipeline)
│
└── 2. tido-ai-video-factory-claude-code-pack (TypeScript Monorepo)
    ├── apps/web (Next.js 15 App - Frontend UI + Embedded Picture Engine V1)
    ├── apps/api (STUB - Chưa triển khai)
    ├── apps/composer (STUB - Chưa triển khai)
    ├── services/ai-worker (STUB - Chưa triển khai)
    ├── services/media-worker (STUB - Chưa triển khai)
    ├── packages/contracts & packages/config (Contract definitions)
    └── schemas/ (JSON Schemas for Scene Specifications)
```

### Key Technical Parameters:
- **Monorepo Manager:** pnpm + Turborepo (`pnpm-workspace.yaml`, `turbo.json`).
- **Frontend Stack:** Next.js 15 (React 19, TypeScript, Tailwind CSS, Lucide React).
- **Voice Stack:** Python 3.10+, PyTorch, F5-TTS Base, librosa, scipy, FastAPI.
- **Picture Engine Stack:** TypeScript embedded in Next.js (`apps/web/lib/image-engine`) connecting to `flow-nano-banana-2` (Nano Banana 2 API / ImgStudio Provider).
- **Database Status:** In-memory / Mock JSON states (PostgreSQL DB architecture defined in spec docs, but **0 migration files / ORM models implemented**).
- **Queue / Event Bus:** BullMQ / Redis specs present, but **0 active queues connected**.

---

## 2. Existing Modules & Code Structure

### 2.1. Module Voice Engine (`F5-TTS-Vietnamese/tido_engine`)
Bộ Voice Performance Engine V2 bằng Python hỗ trợ xử lý tiếng Việt chuyên sâu:
- `f5_tts_adapter.py`: Wrapper kết nối F5-TTS PyTorch model.
- `voice_service.py`: Service chính điều phối pipeline sinh giọng nói, đọc kịch bản thoại.
- `tido_voice_performance_engine.py`: Orchestration cấp cao điều hướng diễn cảm và kiểm soát chất lượng voice.
- `reference_pipeline.py`: Quản lý speaker embedding và chọn sample audio tham chiếu.
- `rendering_controller.py`: Phân đoạn text, rendering và ghép file audio.
- `prosody_director.py` & `prosody_engine_v2.py`: Kiểm soát ngữ điệu, độ ngắt nghỉ và cao độ.
- `vietnamese_text_normalizer.py`: Chuyển đổi số, ngày tháng, từ mượn tiếng Việt sang dạng đọc chuẩn.
- `audio_mastering.py` & `auto_qc.py`: Mastering âm thanh tự động và chấm điểm chất lượng audio (snr, clipping, prosody score).
- `humanization/`: Layer làm tự nhiên giọng nói với pause planner, emotion timeline, spoken style adapter, micro-dynamics và safety guard.

### 2.2. Module Picture Engine V1 (`apps/web/lib/image-engine`)
Bộ sinh và biên tập hình ảnh thương mại tích hợp trong Next.js:
- `provider/ImgStudioImageGenerationProvider.ts`: Adapter gọi `flow-nano-banana-2` (Nano Banana 2 API).
- `provider/GeminiImageGenerationProvider.ts` & `CloudflareImageGenerationProvider.ts`: Provider dự phòng/bổ trợ.
- `service/SimpleImageGenerationOrchestratorService.ts` & `ImageGenerationService.ts`: Core orchestrator quản lý pipeline render ảnh.
- `compiler/`: Trình biên dịch prompt, tiêm Technique Cards và Brand DNA.
- `retrieval/`: Index tri thức quay chụp, thư viện poster và quy tắc bố cục.
- `repository/`: Lưu trữ preset, identity nhân vật/sản phẩm dạng in-memory.

### 2.3. Frontend & Mock Interfaces (`apps/web`)
- `/projects` & `/projects/new`: Luồng tạo brief dự án video và xem danh sách.
- `/projects/[id]`: Project Studio (ScriptStudio & VoiceStudio UI).
- `/render-image`: Render Image Studio UI (Giao diện điều khiển Nano Banana 2 API).
- `/cost`: Giao diện theo dõi chi phí (sử dụng dữ liệu giả định/mock).

---

## 3. Working Features (Tính năng thực tế hoạt động)

1. **Sinh giọng nói tiếng Việt cao cấp (Voice V2):**
   - Đã chạy thực tế thông qua các script test như `run_phase7_listening_audit.py`.
   - Chuẩn hóa văn bản tiếng Việt phức tạp.
   - Thêm nhịp thở (`natural_breath_controller.py`), ngắt nghỉ thoại tự nhiên, điều chỉnh cảm xúc.
   - Tự động QC chất lượng đầu ra audio và mastering âm thanh.

2. **Sinh & Edit ảnh Commercial với Nano Banana 2 (Picture V1):**
   - Đã kết nối live render với Nano Banana 2 API (`flow-nano-banana-2`).
   - Hỗ trợ biên dịch prompt từ yêu cầu đơn giản thành prompt sản xuất chuyên nghiệp.
   - Hỗ trợ giữ tính nhất quán nhân vật/sản phẩm (Identity Resolver).
   - Có giao diện UI Render Image hoàn chỉnh để test và preview ảnh.

3. **Giao diện làm việc cơ bản (Frontend Prototype):**
   - Giao diện Next.js hiện đại, đáp ứng luồng nhập Brief -> Kịch bản -> Chọn Voice -> Render Ảnh.

---

## 4. Missing Features (Tính năng còn thiếu)

1. **Video Engine:** **NOT IMPLEMENTED** (Chưa có provider adapter cho Runway/Kling/CogVideo, chưa có module animation hay video router).
2. **Composer Engine:** **NOT IMPLEMENTED** (Chưa có Remotion setup hay FFmpeg media worker để ghép thoại + ảnh/video + nhạc + caption + logo thành file MP4 hoàn chỉnh).
3. **Database Persistent Layer:** Chưa có PostgreSQL DB schema, chưa có Prisma/Drizzle ORM để lưu trữ Projects, Workspaces, Assets, Users.
4. **Backend API Isolation:** Chưa có NestJS / FastAPI standalone API service (`apps/api` đang rỗng).
5. **Background Task Queue:** Chưa có Redis + BullMQ worker để xử lý render bất đồng bộ (async jobs).
6. **Creative Intelligence Layer (Layer 2):** Chưa có Marketing Knowledge Base tích hợp vào pipeline suy luận tự động của Claude.
7. **SaaS Multi-tenancy & Authentication:** Chưa có hệ thống User, Role, Workspace Isolation, API Key management, Billing/Quotas.

---

## 5. Technical Debt (Nợ kỹ thuật)

1. **Coupled Architecture:** Engine sinh ảnh (`image-engine`) đang nằm trực tiếp bên trong code Frontend Next.js (`apps/web`), gây phình to bundle và khó scale độc lập.
2. **Disconnected Voice & Web Engines:** Python Voice Engine (`F5-TTS-Vietnamese`) đứng độc lập hoàn toàn với Next.js Web App, chưa có gRPC/REST bridge chuẩn化 giữa 2 hệ thống.
3. **Lack of Persistence:** Toàn bộ dữ liệu dự án hiện đang lưu in-memory hoặc mock JSON, mất dữ liệu khi restart server.
4. **Empty Sub-projects:** Các thư mục micro-services (`apps/api`, `apps/composer`, `services/ai-worker`, `services/media-worker`) chỉ chứa file `README.md`.
5. **Resource Heavy Voice Dependencies:** Module Python phụ thuộc nhiều vào PyTorch local, chưa được container hóa (Docker build) tối ưu cho SaaS deployment.

---

## 6. Recommended Evolution Path (Lộ trình tiến hóa đề xuất)

Để biến repository hiện tại thành **TIDO CREATIVE OS (Creative Production Operating System)** cho Agency/Brand, lộ trình tiến hóa như sau:

```
[Phase 1: Foundation Clean-up & Persistence]
Extract Image Engine -> Backend API | Setup PostgreSQL + Redis | Connect App State

[Phase 2: Worker Architecture & Voice Bridge]
Containerize Voice Engine V2 -> Python AI Worker | Integrated BullMQ Queue

[Phase 3: Video Engine & Composer Build-out]
Build Video Provider Adapters (Runway/Kling) | Implement Remotion/FFmpeg Composer

[Phase 4: Creative Intelligence Integration]
Implement Layer 2 (Marketing KB, Creative Strategy Router, Campaign Director)

[Phase 5: Commercial SaaS Layer]
Multi-tenant Workspaces | Brand Kit Management | Collaboration & Export Tools
```

---

## 7. Risk Assessment (Đánh giá rủi ro)

| Rủi ro | Mức độ | Biện pháp giảm thiểu |
|---|---|---|
| **Audio Rendering Latency** (F5-TTS PyTorch tốn nhiều GPU/thời gian) | HIGH | Tách thành Async Worker Pool, cache speaker embeddings và audio segments. |
| **API Provider Rate Limits & Costs** (Nano Banana 2 / Video APIs) | HIGH | Xây dựng Provider Model Registry, Budget Cap, Retry/Fallback strategy chuẩn. |
| **Monolithic Refactoring Friction** (Dịch chuyển logic từ `apps/web` sang `apps/api`) | MEDIUM | Tách từng module theo Clean Architecture & Hexagonal Ports/Adapters. |
| **Asset Storage Scaling** | MEDIUM | Dùng S3/R2 compatible object storage ngay từ đầu, không lưu local disk. |
