# TIDO CREATIVE OS — REPOSITORY BASELINE AUDIT REPORT

> **Document Type:** System Technical Audit & Architecture Baseline Report  
> **Target Platform:** TIDO CREATIVE OS (AI Marketing Production Operating System)  
> **Auditors:** Senior AI System Architect | Senior Full-stack Engineer | Senior MLOps Engineer | Senior SaaS Product Architect | Senior Marketing Technology Architect  
> **Date:** August 27, 2026  
> **Status:** AUDIT COMPLETE — AWAITING REVIEW & PHASE 1 APPROVAL  

---

## 1. CURRENT FOLDER STRUCTURE

```
TIDO AI AUTOMATION REPOSITORY
│
├── .gitignore
├── Bảng giá API đề xuất.docx                   # Document đề xuất chi phí API
├── FRONTEND_DESIGN_BRIEF.md                 # Design Brief cho giao diện Frontend
├── TIDO_AI_VIDEO_FACTORY_MASTER_FOR_CLAUDE_CODE.md # Master System Specification
├── TIDO_SYSTEM_BASELINE_AUDIT.md           # Technical System Baseline Audit trước đó
├── TIDO_Voice_Sample_Guidelines.md         # Quy chuẩn ghi âm & dữ liệu Voice mẫu
├── tido.png                                # Product Asset / Logo
│
├── Assets/                                 # Kho tài nguyên dự án (Audio samples, Voices, Demo)
│   ├── Demo/
│   └── Voices/
│
├── temp/                                   # Thư mục chứa temporary artifacts & runtime caches
│   ├── jieba.cache                         # Cache phân tách từ tiếng Trung/Việt
│   ├── torch/                              # Cache PyTorch models
│   ├── tmp*.wav                            # Các file âm thanh tạm từ quá trình test Voice Engine
│   └── tmp*wandb-media/                    # Nhật ký & media từ Weights & Biases
│
├── F5-TTS-Vietnamese/                      # PYTHON VOICE PERFORMANCE ENGINE V2
│   ├── Dockerfile                          # Docker containerization cho Voice Service
│   ├── LICENSE                             # Giấy phép phần mềm MIT
│   ├── README.md                           # Hướng dẫn vận hành F5-TTS
│   ├── fine_tuning.sh                      # Shell script fine-tuning mô hình F5-TTS
│   ├── infer.sh                            # Shell script chạy inference CLI
│   ├── pyproject.toml                      # Cấu hình dự án Python & Dependencies
│   ├── run_phase7_listening_audit.py       # Script audit nghe thực nghiệm âm thanh Phase 7
│   ├── tido_voice_engine.py                # Wrapper chính kiểm thử Voice Engine
│   ├── _archive_unused/                    # [DEPRECATED] Các file test & script cũ
│   │   ├── experiment_scripts/
│   │   ├── folders/
│   │   ├── legacy_tests/
│   │   └── reports/
│   ├── ckpt_1000h/                         # Checkpoint huấn luyện 1000 giờ
│   ├── ckpt_vi/                            # Checkpoint tiếng Việt cơ bản
│   ├── ckpt_vivoice/                       # Checkpoint giọng đọc Vivoice cao cấp
│   └── tido_engine/                        # CORE VOICE PERFORMANCE ENGINE MODULE
│       ├── api_service.py                  # FastAPI REST Service cho Voice Engine
│       ├── audio_boundary.py               # Xử lý ranh giới khung âm thanh (Audio boundaries)
│       ├── audio_mastering.py              # Mastering âm thanh tự động (EQ, Compressor, Limiter)
│       ├── auto_qc.py                      # Chấm điểm chất lượng âm thanh tự động (SNR, Clipping)
│       ├── context_overlap_fallback.py     # Fallback khi ngữ cảnh câu bị chồng lấp
│       ├── continuity_engine.py            # Duy trì tính liên tục của chất giọng
│       ├── emotion_modulator.py            # Điều phối & chuyển đổi biểu cảm giọng nói
│       ├── emphasis_processor.py           # Nhấn giọng và xử lý từ trọng tâm
│       ├── f5_config.py                    # Cấu hình siêu tham số F5-TTS
│       ├── f5_tts_adapter.py               # Adapter bọc mô hình PyTorch F5-TTS Core
│       ├── global_performance_arc.py       # Cấu trúc cung bậc diễn xuất tổng thể toàn bài
│       ├── legacy_migrator.py              # Module di chuyển dữ liệu phiên bản cũ
│       ├── natural_breath_controller.py    # Điều khiển chèn nhịp thở tự nhiên
│       ├── observability.py                # Logging & Telemetry cho Voice Engine
│       ├── paths.py                        # Quản lý đường dẫn hệ thống
│       ├── performance_director_v2.py      # Đạo diễn diễn xuất giọng đọc V2
│       ├── pronunciation_accuracy_analyzer.py # Phân tích độ chính xác phát âm
│       ├── pronunciation_engine.py         # Xử lý phát âm từ khó / từ nước ngoài
│       ├── prosody_alignment_analyzer.py   # Phân tích độ căn chỉnh nhịp điệu
│       ├── prosody_director.py             # Đạo diễn tiết tấu & nhịp điệu (Prosody Director)
│       ├── prosody_engine_v2.py            # Engine nhịp điệu V2
│       ├── prosody_state.py                # Lưu trữ trạng thái nhịp điệu
│       ├── recommendation_learner.py       # Học máy đưa ra khuyến nghị cải thiện giọng
│       ├── reference_pipeline.py           # Quản lý & trích xuất Speaker Embedding giọng mẫu
│       ├── regression_suite.py             # Bộ kiểm thử hồi quy chất lượng âm thanh
│       ├── render_optimizer.py             # Tối ưu hóa tốc độ render audio
│       ├── rendering_controller.py         # Phân đoạn text, điều phối render & ghép audio
│       ├── repair_manager.py               # Tự động sửa lỗi audio khi phát hiện vỡ tiếng
│       ├── semantic_chunker.py             # Chia câu theo ngữ nghĩa NLP
│       ├── semantic_phrase_planner.py      # Lập kế hoạch cụm từ ngữ nghĩa
│       ├── speaker_embedding_analyzer.py   # Phân tích đặc trưng giọng nói (Speaker Embedding)
│       ├── speaker_persona.py              # Định nghĩa tính cách giọng đọc (Persona)
│       ├── tido_voice_performance_engine.py # Core Orchestrator kiểm soát Voice Performance
│       ├── tts_adapter_interface.py        # Interface chuẩn cho TTS Adapter
│       ├── user_preference_model.py        # Mô hình hóa sở thích người dùng
│       ├── v2_schemas.py                   # Pydantic Schemas cho Voice Engine V2
│       ├── vietnamese_text_normalizer.py   # Chuẩn hóa văn bản tiếng Việt (Số, ký tự, từ mượn)
│       ├── voice_ab_testing.py             # Module kiểm thử A/B giọng đọc
│       ├── voice_analytics.py              # Phân tích chỉ số hiệu năng giọng nói
│       ├── voice_enrollment.py             # Đăng ký & huấn luyện giọng đọc mới
│       ├── voice_feedback_system.py        # Hệ thống phản hồi chất lượng giọng
│       ├── voice_library_manager.py        # Quản lý thư viện giọng công ty
│       ├── voice_metadata_analyzer.py      # Phân tích metadata file âm thanh
│       ├── voice_performance_matrix.py     # Ma trận đo lường hiệu năng giọng
│       ├── voice_profile.py / v3 / v4      # Định nghĩa hồ sơ giọng nói qua các phiên bản
│       ├── voice_quality_analyzer.py / v2  # Phân tích chuyên sâu chất lượng âm thanh
│       ├── voice_recommendation_engine.py  # Đề xuất giọng phù hợp với kịch bản
│       ├── voice_search_engine.py          # Tìm kiếm giọng đọc theo yêu cầu
│       ├── voice_service.py                # Facade Service chính điều phối Voice Engine
│       ├── voice_style_profiles.py         # Hồ sơ phong cách đọc (Soles, Marketing, Narrative)
│       ├── voice_usage_history.py          # Lịch sử sử dụng giọng đọc
│       └── humanization/                   # LAYER LÀM TỰ NHIÊN GIỌNG NÓI (HUMANIZATION LAYER)
│           ├── adaptive_profile_selector.py # Tự động chọn profile làm tự nhiên
│           ├── conversational_pause_planner.py # Lập kế hoạch khoảng nghỉ giao tiếp
│           ├── emotion_timeline.py         # Xây dựng mảng cảm xúc theo mốc thời gian
│           ├── expression_controller.py    # Điều khiển sắc thái biểu cảm giọng nói
│           ├── humanization_ab_test.py     # A/B Testing tính năng humanization
│           ├── humanization_context_resolver.py # Giải quyết ngữ cảnh tự nhiên
│           ├── humanization_pipeline.py    # Orchestrator cho Humanization Layer
│           ├── humanization_strategy.py    # Chiến lược làm tự nhiên hóa
│           ├── safety_guard.py             # Kiểm soát an toàn (chống clipping, biến dạng)
│           ├── spoken_style_adapter.py     # Chuyển đổi văn bản viết sang văn phong nói
│           ├── voice_behavior_dna.py       # DNA hành vi giọng đọc
│           ├── acoustic/                   # Xử lý âm học vi mô
│           ├── micro_dynamics/             # Xử lý vi biến đổi tần số & biên độ
│           └── semantic/                   # Trích xuất ý định ngữ nghĩa
│
└── tido-ai-video-factory-claude-code-pack/ # TYPESCRIPT MONOREPO (TURBOREPO)
    ├── package.json                        # Monorepo root config
    ├── pnpm-workspace.yaml                 # Định nghĩa workspace packages
    ├── turbo.json                          # Turbo build & test pipeline
    ├── docker-compose.yml                  # Cấu hình Docker Compose môi trường dev
    ├── contracts/                          # Contract definitions (Provider Adapter, Domain)
    │   ├── domain.ts
    │   └── provider-adapter.ts
    ├── schemas/                            # JSON Schemas cho hệ thống
    │   └── scene-specification.schema.json
    ├── apps/
    │   ├── web/                            # NEXT.JS FRONTEND + EMBEDDED PICTURE ENGINE
    │   │   ├── package.json
    │   │   ├── next.config.ts
    │   │   ├── app/                        # Next.js 16 App Router Pages & API Routes
    │   │   │   ├── page.tsx                # Home / Dashboard
    │   │   │   ├── layout.tsx              # Root Layout
    │   │   │   ├── projects/               # Workspace Projects UI
    │   │   │   │   ├── page.tsx            # Project list
    │   │   │   │   ├── new/page.tsx        # New project creation wizard
    │   │   │   │   └── [id]/page.tsx       # Project Studio (ScriptStudio, VoiceStudio)
    │   │   │   ├── render-image/page.tsx   # Render Image Studio (Nano Banana 2 tester)
    │   │   │   ├── cost/page.tsx           # Cost tracking dashboard
    │   │   │   └── api/                    # Web API Routes (image edit, provider, mock projects)
    │   │   │       ├── image/edit/route.ts
    │   │   │       ├── image/provider/route.ts
    │   │   │       └── projects/route.ts
    │   │   ├── components/                 # Frontend UI Components
    │   │   │   ├── ProjectComponents.tsx
    │   │   │   ├── RenderImageComponents.tsx
    │   │   │   ├── ScriptStudio.tsx
    │   │   │   ├── Sidebar.tsx
    │   │   │   ├── SimpleRenderImageComponents.tsx
    │   │   │   ├── UI.tsx
    │   │   │   └── VoiceStudio.tsx
    │   │   └── lib/image-engine/           # CORE PICTURE ENGINE V1 (TypeScript)
    │   │       ├── config.ts               # Cấu hình Image Engine
    │   │       ├── types.ts                # TypeScript Types cho Image Engine
    │   │       ├── compiler/               # Trình biên dịch Prompt & tiêm Brand/Technique
    │   │       ├── provider/               # Providers: ImgStudio (Nano Banana 2), Gemini, Cloudflare
    │   │       │   ├── ImgStudioImageGenerationProvider.ts
    │   │       │   ├── GeminiImageGenerationProvider.ts
    │   │       │   └── CloudflareImageGenerationProvider.ts
    │   │       ├── repository/             # In-memory storage cho Presets & Identities
    │   │       ├── retrieval/              # Index tri thức quay chụp & Bố cục commercial
    │   │       ├── schema/                 # Valibot/Zod Schemas cho Image Engine
    │   │       ├── service/                # Core Orchestrator Services
    │   │       │   ├── ImageGenerationService.ts
    │   │       │   ├── ImageEditService.ts
    │   │       │   ├── KnowledgeRouterService.ts
    │   │       │   └── SimpleImageGenerationOrchestratorService.ts
    │   │       └── validation/             # Validation logic cho Image Input/Output
    │   ├── api/                            # STUB — Thư mục mục tiêu cho Standalone Backend API (NestJS/FastAPI)
    │   │   └── README.md
    │   └── composer/                       # STUB — Thư mục mục tiêu cho Remotion Composer Engine
    │       └── README.md
    └── services/
        ├── ai-worker/                      # STUB — Thư mục mục tiêu cho Python AI Worker Pipeline
        │   └── README.md
        └── media-worker/                   # STUB — Thư mục mục tiêu cho FFmpeg Media Worker Pipeline
            └── README.md
```

---

## 2. EXISTING APPLICATIONS

1. **`apps/web` (Next.js 16 Web Application):**
   - **Vai trò:** Giao diện điều hành nội bộ (Internal Operator Workspace UI) và nơi nhúng trực tiếp core logic của Picture Engine V1 (`lib/image-engine`).
   - **Trạng thái:** Hoạt động tốt dưới dạng Prototype monolith. Đang chạy dev server tại cổng mặc định.

2. **`F5-TTS-Vietnamese` (Python Voice Engine Standalone App):**
   - **Vai trò:** Ứng dụng xử lý và tổng hợp giọng nói tiếng Việt chuyên sâu (Tido Voice Performance Engine V2).
   - **Trạng thái:** Hoạt động dưới dạng script kiểm thử độc lập (`run_phase7_listening_audit.py`) và ứng dụng REST API FastAPI đơn giản (`api_service.py`).

3. **Applications chưa triển khai (Stub Directories):**
   - `apps/api`: Stub directory (Mục tiêu xây dựng Standalone SaaS Domain API Service).
   - `apps/composer`: Stub directory (Mục tiêu xây dựng Remotion Video Assembly Studio).
   - `services/ai-worker`: Stub directory (Mục tiêu xây dựng Background AI Processing Worker).
   - `services/media-worker`: Stub directory (Mục tiêu xây dựng FFmpeg Processing Engine).

---

## 3. EXISTING ENGINES

1. **Voice Engine V2 (Tido Voice Performance Engine V2):**
   - **Vị trí:** `F5-TTS-Vietnamese/tido_engine`
   - **Công nghệ:** PyTorch + F5-TTS Base + Librosa + Custom Prosody & Humanization Pipeline.
   - **Thành phần:** F5-TTS Adapter, Voice Service, Vietnamese Text Normalizer, Humanization Layer (Pause Planner, Emotion Timeline, Spoken Style Adapter, Micro Dynamics, Safety Guard), Prosody Director V2, Audio Mastering, Auto QC Scoring.
   - **Đánh giá:** Rất mạnh mẽ về thuật toán xử lý giọng nói tiếng Việt tự nhiên và biểu cảm.

2. **Picture Engine V1 (Commercial Image Production Engine V1):**
   - **Vị trí:** `tido-ai-video-factory-claude-code-pack/apps/web/lib/image-engine`
   - **Công nghệ:** TypeScript / Node.js embedded trong Next.js.
   - **Thành phần:** ImgStudio Adapter (`flow-nano-banana-2` / Nano Banana 2 API), Prompt Compiler, Brand DNA Injector, Identity Resolver (nhân vật/sản phẩm), Knowledge Base Index & Retrieval Service, Image Edit & Render Orchestrator.
   - **Đánh giá:** Logic xử lý prompt và giữ tính nhất quán nhân vật thương mại tốt, nhưng đang bị bó chặt trong ứng dụng Web Frontend.

3. **Video Engine:**
   - **Trạng thái:** **NOT IMPLEMENTED** (Chưa có provider adapter cho Video AI như Runway, Kling, Pika; chưa có pipeline sinh chuyển động).

4. **Composer Engine:**
   - **Trạng thái:** **NOT IMPLEMENTED** (Chưa có module Remotion hoặc FFmpeg media pipeline để dựng video hoàn chỉnh).

---

## 4. EXISTING APIs

1. **Internal Next.js Web API Routes (`apps/web/app/api/`):**
   - `POST /api/image/edit`: API route xử lý chỉnh sửa / sinh ảnh với ImgStudio (`flow-nano-banana-2`).
   - `GET /api/image/provider`: API route trả về thông tin cấu hình provider hiện tại.
   - `GET /POST /api/projects`: API routes giả định (mock) cho danh sách dự án.

2. **Python Voice Engine FastAPI (`F5-TTS-Vietnamese/tido_engine/api_service.py`):**
   - `POST /generate`: Endpoint nhận JSON kịch bản thoại và trả về đường dẫn file `.wav`.
   - `GET /healthcheck`: Endpoint kiểm tra trạng thái hoạt động của Voice Engine.

3. **External Provider Integration APIs (Đã khai báo SDK / Adapter):**
   - **Nano Banana 2 API / ImgStudio Provider:** Model ID `flow-nano-banana-2`.
   - **Anthropic Claude API:** `@anthropic-ai/sdk` (Dùng cho lập kịch bản & quy hoạch kịch bản).
   - **Google Gemini API:** `@google/genai` (Provider hình ảnh / suy luận bổ trợ).
   - **ElevenLabs API:** `@elevenlabs/elevenlabs-js` (Provider giọng nói quốc tế bổ trợ).
   - **OpenAI API:** `openai` (Provider bổ trợ).
   - **Groq API:** `groq-sdk` (Inference tốc độ cao bổ trợ).

---

## 5. EXISTING DEPENDENCIES

### Node.js / TypeScript Stack (`apps/web/package.json`):
- `next`: `16.3.0`
- `react` & `react-dom`: `19.2.8`
- `tailwindcss`: `^4`
- `typescript`: `^5`
- `framer-motion`: `^12.43.0`
- `lucide-react`: `^1.28.0`
- `@anthropic-ai/sdk`: `^0.115.0`
- `@google/genai`: `^2.17.0`
- `@elevenlabs/elevenlabs-js`: `^2.60.0`
- `openai`: `^7.4.0`
- `groq-sdk`: `^1.5.0`
- `turbo`: Build system cho Monorepo

### Python Stack (`F5-TTS-Vietnamese/pyproject.toml`):
- `torch` & `torchaudio`: `>=2.0.0`
- `accelerate`: `>=0.33.0`
- `transformers` & `safetensors`: HuggingFace ecosystem
- `librosa`, `soundfile`, `pydub`: Xử lý tín hiệu âm thanh
- `jieba`, `pypinyin`: Xử lý ngôn ngữ tự nhiên
- `fastapi`, `uvicorn`: Web API framework
- `vocos`: Neural Vocoder cho tổng hợp tiếng nói
- `bitsandbytes`: Tối ưu hóa GPU memory

---

## 6. EXISTING WORKING FEATURES

1. **Phát âm & Diễn xuất tiếng Việt đỉnh cao (Voice Engine V2):**
   - Chuẩn hóa các câu thoại tiếng Việt chứa từ nước ngoài, số, ngày tháng, tên thương hiệu.
   - Thêm nhịp thở tự nhiên (`natural_breath_controller`), ngắt nghỉ chuẩn giao tiếp và kiểm soát biểu cảm giọng đọc theo thời gian (`emotion_timeline`).
   - Tự động chấm điểm QC âm thanh và mastering tần số âm thanh đầu ra.

2. **Sinh & Chỉnh sửa Ảnh Thương mại (Picture Engine V1):**
   - Biên dịch prompt từ thông tin đơn giản thành prompt thương mại chi tiết cho Nano Banana 2 API (`flow-nano-banana-2`).
   - Giữ tính nhất quán khuôn mặt nhân vật và chi tiết sản phẩm (Identity Preservation).
   - Giao diện UI Render Image tương tác trực quan cho phép điều chỉnh siêu tham số render ảnh.

3. **Giao diện làm việc cơ bản (Frontend Prototype):**
   - Các trang làm việc nội bộ: Nhập brief dự án, xem kịch bản (ScriptStudio), nghe thử giọng nói (VoiceStudio) và kiểm thử sinh ảnh.

---

## 7. UNUSED CODE

1. **Thư mục lưu trữ cũ `F5-TTS-Vietnamese/_archive_unused/`:**
   - Chứa các script thử nghiệm cũ (`experiment_scripts`), bài kiểm thử cũ (`legacy_tests`), và báo cáo đã qua sử dụng (`reports`).
2. **File rác & cache tạm thời trong `temp/`:**
   - Hơn 200 file âm thanh tạm `.wav` (ví dụ `tmp00dz7ql6.wav`), cache `jieba.cache`, cache torch và media từ wandb.
3. **Các thư mục Stub chưa sử dụng:**
   - `apps/api`, `apps/composer`, `services/ai-worker`, `services/media-worker` chỉ mới có file `README.md` rỗng.

---

## 8. TECHNICAL DEBT

1. **Tight Coupling giữa Picture Engine và Frontend:**
   - Toàn bộ logic của `image-engine` nằm trong `apps/web/lib/image-engine`, khiến ứng dụng Next.js gánh cả logic xử lý AI nặng.
2. **Thiếu Persistence Layer (Database):**
   - Hệ thống chưa kết nối cơ sở dữ liệu thật (PostgreSQL). Dữ liệu project, scene, asset hiện đang nằm hoàn toàn ở dạng **In-memory JSON Objects**, sẽ mất sạch khi restart server.
3. **Thiếu Async Queue Bridge cho Voice Engine:**
   - Voice Engine Python chạy độc lập và xử lý đồng bộ (synchronous). Khi có nhiều người dùng SaaS gọi cùng lúc sẽ gây nghẽn (blocking).
4. **Mock Data trong API Routes:**
   - `apps/web/app/api/projects/route.ts` đang trả về dữ liệu giả lập hard-code.

---

## 9. RISK AREAS

1. **Rủi ro Quá tải GPU & Latency của Voice Engine:**
   - F5-TTS PyTorch model tiêu tốn nhiều tài nguyên GPU. Việc xử lý không có hàng chờ (Queue) dễ dẫn đến Out-Of-Memory (OOM) hoặc timeout rải rác.
2. **Rủi ro Phụ thuộc vào External Provider APIs:**
   - Picture Engine phụ thuộc vào Nano Banana 2 API (`flow-nano-banana-2`). Nếu provider bị nghẽn rate-limit hoặc ngưng dịch vụ, hệ thống không có fallback cơ chế tự động chuyển đổi mô hình ảnh khác.
3. **Rủi ro Mất mát Dữ liệu (State Loss):**
   - Việc không có Database làm Source of Truth đồng nghĩa với việc mọi phiên làm việc của user không thể duy trì dài hạn.
4. **Rủi ro Bảo mật Multi-tenant:**
   - Chưa có lớp phân quyền (RBAC), cách ly dữ liệu giữa các Agency/Client (Workspace Isolation) hay quản lý API Keys bảo mật.

---

## 10. FILES CẦN GIỮ NGUYÊN (DO NOT MODIFY)

Các file chứa core algorithm và quy chuẩn kiến trúc hiện tại **TUYỆT ĐỐI KHÔNG SỬA ĐỔI**:

1. **Voice Engine Core (`F5-TTS-Vietnamese/tido_engine/`):**
   - `f5_tts_adapter.py`
   - `rendering_controller.py`
   - `reference_pipeline.py`
   - `prosody_director.py` & `prosody_engine_v2.py`
   - `vietnamese_text_normalizer.py`
   - `humanization/*` (Toàn bộ các file trong thư mục humanization)
   - `tido_voice_performance_engine.py`

2. **Picture Engine Core Logic (`apps/web/lib/image-engine/`):**
   - `compiler/*` (Prompt compiler logic)
   - `retrieval/*` (Knowledge index retrieval)
   - `provider/ImgStudioImageGenerationProvider.ts` (Nano Banana 2 adapter)

3. **Core Specification Documents & Schemas:**
   - `schemas/scene-specification.schema.json`
   - `contracts/provider-adapter.ts`
   - `TIDO_AI_VIDEO_FACTORY_MASTER_FOR_CLAUDE_CODE.md`

---

## 11. FILES CÓ THỂ REFACTOR (ELIGIBLE FOR REFACTORING)

Các file thuộc lớp giao tiếp hoặc trung gian có thể tái cấu trúc từng bước:

1. **Frontend API Routes (`apps/web/app/api/`):**
   - `apps/web/app/api/image/edit/route.ts` -> Chuyển giao nhiệm vụ gọi AI sang Standalone API Service hoặc Worker.
   - `apps/web/app/api/projects/route.ts` -> Thay thế dữ liệu mock bằng PostgreSQL ORM query.

2. **Voice Engine API Wrapper (`F5-TTS-Vietnamese/tido_engine/api_service.py`):**
   - Bổ sung gRPC/Redis BullMQ Consumer interface để nhận job bất đồng bộ thay vì chỉ chạy REST API đồng bộ.

3. **Picture Engine Orchestrator Services (`apps/web/lib/image-engine/service/`):**
   - Tách dần out khỏi `apps/web` để chuyển sang `services/ai-worker` hoặc `apps/api`.

---

## 12. ĐỀ XUẤT KIẾN TRÚC TƯƠNG LAI (TIDO CREATIVE OS)

Để nâng cấp hệ thống hiện tại thành một **AI Marketing Production Operating System (TIDO CREATIVE OS)** thương mại, kiến trúc tương lai được đề xuất thiết kế theo mô hình **3-Layer Operating System Architecture**:

```
                               ┌──────────────────────────────────────────────────────────┐
                               │                    CLIENT LAYER                          │
                               │   Marketing Agency | Brand Team | Production House       │
                               └────────────────────────────┬─────────────────────────────┘
                                                            │
┌───────────────────────────────────────────────────────────▼───────────────────────────────────────────────────────────┐
│                                          LAYER 2: CREATIVE INTELLIGENCE                                               │
│ ┌───────────────────────────────┐  ┌───────────────────────────────┐  ┌────────────────────────────────────────────┐ │
│ │ Marketing Knowledge Base      │  │ Creative Strategy Router      │  │ Campaign & Brief Planner                   │ │
│ │ (Brand DNA, Angle, Target)    │  │ (Hook, Angle, Visual Style)   │  │ (Multi-asset Plan, Storyboard)             │ │
│ └───────────────────────────────┘  └───────────────────────────────┘  └────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┘
                                                            │
┌───────────────────────────────────────────────────────────▼───────────────────────────────────────────────────────────┐
│                                       LAYER 1: CREATIVE PRODUCTION ENGINE                                             │
│ ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │                                  UNIFIED CORE SCHEMA CONTRACTS (packages/contracts)                               │ │
│ │                                  Project ──► Campaign ──► Scene ──► Asset ──► Render Job                          │ │
│ └───────────────────────┬───────────────────────────┬───────────────────────────┬───────────────────────────────────┘ │
│                         │                           │                           │                                     │
│ ┌───────────────────────▼───────┐   ┌───────────────▼───────────────┐   ┌───────▼───────────────────────────┐ │
│ │ PICTURE ENGINE V1             │   │ VOICE ENGINE V2               │   │ VIDEO ENGINE (Future Ready)       │ │
│ │ - Nano Banana 2 Adapter       │   │ - F5-TTS Vietnamese Core      │   │ - Provider Model Router           │ │
│ │ - Prompt Compiler             │   │ - Humanization Layer          │   │ - Text-to-Video / Img-to-Video    │ │
│ │ - Product/Character Identity  │   │ - Prosody & Emotion Director  │   │ - Motion Dynamics Control         │ │
│ └───────────────────────────────┘   └───────────────────────────────┘   └───────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┘
                                                            │
┌───────────────────────────────────────────────────────────▼───────────────────────────────────────────────────────────┐
│                                        LAYER 3: PRODUCTION AUTOMATION                                                 │
│ ┌───────────────────────────────┐  ┌───────────────────────────────┐  ┌────────────────────────────────────────────┐ │
│ │ Composer Engine               │  │ Background Worker Queues      │  │ PostgreSQL + S3 Storage                    │ │
│ │ (Remotion + FFmpeg Assembly)  │  │ (Redis + BullMQ / Celery)     │  │ (Multi-tenant State & Asset Ledger)        │ │
│ └───────────────────────────────┘  └───────────────────────────────┘  └────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Chi tiết lộ trình nâng cấp (Evolution Roadmap):

1. **Giai đoạn nền tảng (Phase 1 — Schema & Contract Foundation):**
   - Xây dựng thư mục `packages/contracts` chứa các định nghĩa JSON Schema / TypeScript Types chuẩn化: `Project`, `Campaign`, `Scene`, `Asset`, `RenderJob`.
   - Mọi Engine (Picture, Voice, Video, Composer) sẽ bắt buộc giao tiếp thông qua Schema chung này mà không phụ thuộc trực tiếp vào nhau.

2. **Giai đoạn tách biệt Service & Worker (Phase 2 — Service Isolation):**
   - Đưa Voice Engine vào Docker container, tạo worker consumer nhận job từ Redis Queue.
   - Trích xuất Picture Engine từ `apps/web` thành module dịch vụ chuẩn.
   - Xây dựng `apps/api` làm trung tâm lưu trữ trạng thái (PostgreSQL).

3. **Giai đoạn tích hợp Video & Composer Engine (Phase 3 — Multi-Engine Production):**
   - Tích hợp Video Engine Router kết nối với các provider API bên ngoài.
   - Xây dựng `apps/composer` với Remotion để tự động dựng âm thanh, hình ảnh, subtitle và logo thương hiệu thành video thương mại hoàn chỉnh.

---

## TỔNG KẾT PHASE 0 AUDIT

Hệ thống **TIDO AI AUTOMATION** đã sở hữu nền tảng thuật toán rất mạnh mẽ ở **Voice Engine V2** và **Picture Engine V1**. Việc chuyển đổi sang **TIDO CREATIVE OS** hoàn toàn khả thi bằng con đường phát triển cuốn chiếu (incremental development), tuân thủ 10 nguyên tắc bắt buộc của sản phẩm và **KHÔNG BỊ PHÁ VỠ** bất kỳ module hiện có nào.

```
==================================================
PHASE 0 — REPOSITORY BASELINE AUDIT COMPLETE.
AWAITING REVIEW & APPROVAL BEFORE PROCEEDING TO PHASE 1.
==================================================
```
