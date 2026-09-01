# TIDO CREATIVE OS — CORE CONTRACT LAYER V1 SPECIFICATION

> **Document Type:** System Architecture Specification & Schema Contract Report  
> **Package:** `@tido/contracts` (`packages/contracts`)  
> **Author Roles:** Senior AI System Architect | Senior Full-stack Engineer | Senior MLOps Engineer | Senior SaaS Product Architect | Senior Marketing Technology Architect  
> **Date:** August 28, 2026  
> **Status:** CORE CONTRACT LAYER IMPLEMENTED — APPROVED FOR INTEGRATION  

---

## 1. OVERVIEW & ARCHITECTURAL DECISION

Lớp Hợp Đồng Cốt Lõi (**Core Contract Layer V1**) kết nối toàn bộ các Engine sản xuất trong **TIDO Creative OS** đã được triển khai tại package `@tido/contracts`.

Quyết định kiến trúc trọng tâm:
* **TypeScript-First & 100% JSON-Serializable:** Mọi entity đều có TypeScript Interface chuẩn và JSON Schema tương ứng (Draft 2020-12) giúp serialization, caching (Redis), và truyền tin qua REST/gRPC an toàn.
* **Unified Engine Integration per Scene:** Mỗi `Scene` đóng vai trò là một container chứa chỉ dẫn độc lập cho từng Engine: `visual_direction`, `voice_direction`, `motion_direction`, và `production_instruction`.
* **Zero UI & Zero DB Dependency:** Không tạo UI, không phụ thuộc Database ORM cụ thể, sẵn sàng cho hạ tầng SaaS Multi-tenant trong tương lai.

---

## 2. PACKAGE STRUCTURE (`packages/contracts/`)

```
packages/contracts/
├── package.json                             # Package configuration
├── tsconfig.json                            # TypeScript compiler options
├── src/
│   ├── index.ts                             # Barrel export index
│   ├── models/                              # Domain Data Models
│   │   ├── project.model.ts                 # CreativeProject Interface & ProjectStatus
│   │   ├── brief.model.ts                   # Brief Interface & CampaignObjectives
│   │   ├── scene.model.ts                   # Unified Scene Interface & ScenePurpose
│   │   ├── asset.model.ts                   # Asset Interface & AssetType
│   │   └── render-job.model.ts              # RenderJob Interface & EngineType
│   └── engines/                             # Engine Contracts
│       ├── picture-engine.contract.ts       # Picture Engine Request/Response Contracts
│       ├── voice-engine.contract.ts         # Voice Engine Request/Response Contracts
│       ├── video-engine.contract.ts         # Video Engine Request/Response Contracts
│       └── composer-engine.contract.ts      # Composer Engine Request/Response Contracts
└── schemas/                                 # JSON Schemas (Draft 2020-12)
    ├── creative-project.schema.json
    ├── brief.schema.json
    ├── scene.schema.json
    ├── asset.schema.json
    └── render-job.schema.json
```

---

## 3. CORE DOMAIN DATA MODELS

### 3.1. CreativeProject (`src/models/project.model.ts`)
Thực thể quản lý trạng thái tổng thể của dự án sáng tạo qua các Stage sản xuất:

```typescript
export type ProjectStatus =
  | "DRAFT"
  | "AWAITING_BRIEF_CONFIRMATION"
  | "CREATIVE_PLANNING"
  | "AWAITING_CREATIVE_APPROVAL"
  | "PRODUCTION_IN_PROGRESS"
  | "COMPOSING"
  | "FINAL_QC"
  | "COMPLETED"
  | "FAILED";

export interface CreativeProject {
  project_id: string;
  tenant_id: string; // SaaS Multi-tenant isolation
  title: string;
  status: ProjectStatus;
  brief_id: string;
  campaign_id?: string;
  scene_ids: string[];
  asset_ids?: string[];
  created_at: string;
  updated_at?: string;
}
```

### 3.2. Brief (`src/models/brief.model.ts`)
Thực thể chứa thông tin yêu cầu đầu vào từ phía người dùng / khách hàng:

```typescript
export interface Brief {
  brief_id: string;
  project_id: string;
  product_name: string;
  industry: string;
  target_audience: string;
  campaign_objective: "awareness" | "consideration" | "conversion" | "retention";
  target_channel: "tiktok" | "facebook_reels" | "youtube_shorts" | "tvc_broadcast" | "digital_tvc";
  brand_tone?: string;
  key_selling_points: string[];
  brand_dna_id?: string;
  production_profile_id?: "SHORT_VERTICAL_9_16_V1" | "TVC_HORIZONTAL_16_9_V1";
  budget_cap_usd?: number;
  created_at: string;
}
```

### 3.3. Unified Scene (`src/models/scene.model.ts`)
Thực thể trung tâm điều phối 4 Engine sản xuất cho từng phân cảnh:

```typescript
export interface Scene {
  scene_id: string;
  project_id: string;
  sequence_number: number;
  purpose: "hook" | "problem" | "solution" | "hero" | "proof" | "cta";
  duration_seconds?: number;

  visual_direction: PictureEngineRequest;       // Directed to Picture Engine
  voice_direction: VoiceEngineRequest;         // Directed to Voice Engine
  motion_direction: VideoEngineRequest;         // Directed to Video Engine
  production_instruction: ComposerEngineRequest;// Directed to Composer Engine

  technique_card_ids?: string[];                // Integration with @tido/knowledge-base
  knowledge_node_ids?: string[];                // Integration with @tido/knowledge-base
}
```

---

## 4. ENGINE DIRECTIVE CONTRACTS

### 4.1. Picture Engine Contract (`src/engines/picture-engine.contract.ts`)
Tương thích trực tiếp với **Nano Banana 2 API (`flow-nano-banana-2`)** và ImgStudio Provider:

```typescript
export interface PictureEngineRequest {
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: "9:16" | "16:9" | "1:1" | "4:5";
  model: string; // E.g., "flow-nano-banana-2"
  seed?: number;
  reference_image_urls?: string[];
  identity_preservation?: {
    character_id?: string;
    product_id?: string;
  };
  style_modifiers?: string[];
}
```

### 4.2. Voice Engine Contract (`src/engines/voice-engine.contract.ts`)
Tương thích trực tiếp với **F5-TTS Vietnamese Core (`tido_engine`)**:

```typescript
export interface VoiceEngineRequest {
  script_text: string;
  speaker_id?: string;
  reference_audio_url?: string;
  language: "vi" | "en";
  speed_factor?: number; // E.g., 1.0
  emotion?: "neutral" | "excited" | "warm" | "authoritative" | "sad";
  pause_duration_ms?: number;
  enable_humanization?: boolean;
  normalize_vietnamese?: boolean;
}
```

### 4.3. Video Engine Contract (`src/engines/video-engine.contract.ts`)
Thiết kế mở cho các Provider Routers (Runway Gen-3 / Kling AI / Pika / CogVideo):

```typescript
export interface VideoEngineRequest {
  prompt?: string;
  source_image_url?: string;
  camera_motion?: "static" | "pan_right" | "tilt_up" | "push_in" | "orbit" | "whip_pan";
  motion_strength?: number;
  duration_seconds: number;
  fps?: number;
  aspect_ratio: "9:16" | "16:9" | "1:1";
  provider?: "runway" | "kling" | "pika" | "cogvideo" | "mock";
}
```

### 4.4. Composer Engine Contract (`src/engines/composer-engine.contract.ts`)
Tương thích với **Remotion + FFmpeg Video Assembly Engine**:

```typescript
export interface ComposerEngineRequest {
  resolution: { width: number; height: number };
  fps: number;
  background_color?: string;
  elements: Array<{
    type: "video" | "image" | "audio" | "text" | "watermark";
    start_time_seconds: number;
    duration_seconds: number;
    source_url: string;
    style?: Record<string, unknown>;
  }>;
  audio_mix?: {
    voice_track_url?: string;
    music_track_url?: string;
    music_volume?: number;
    ducking_enabled?: boolean;
  };
}
```

---

## 5. COMPATIBILITY MATRIX

| Engine / Subsystem | Contract Compatibility | Standard Payload Adapter |
|---|---|---|
| **`@tido/knowledge-base`** | FULL (Layer 2 Knowledge) | References `technique_card_ids` & `knowledge_node_ids` in Scene Model |
| **F5-TTS Voice Engine** | FULL (Python `tido_engine`) | Maps to `VoiceEngineRequest` (`script_text`, `normalize_vietnamese`, `enable_humanization`) |
| **Nano Banana 2 Picture Engine** | FULL (`flow-nano-banana-2`) | Maps to `PictureEngineRequest` (`model`, `aspect_ratio`, `identity_preservation`) |
| **Remotion Composer** | FULL (`apps/composer`) | Maps to `ComposerEngineRequest` (`elements`, `audio_mix`, `resolution`) |

---

## 6. VERIFICATION & ROLLBACK PLAN

* **Verification:** Package `@tido/contracts` đã được biên dịch sạch sẽ không có lỗi TypeScript. Không can thiệp vào mã nguồn gốc của Voice Engine hay Picture Engine.
* **Rollback Plan:** Xóa thư mục `packages/contracts` nếu muốn quay về trạng thái chưa cài đặt hợp đồng cốt lõi.

---

```
==================================================
TIDO CREATIVE OS CORE CONTRACT LAYER V1 COMPLETE.
PACKAGE: @tido/contracts CREATED SUCCESSFULLY.
READY FOR STAGE INTEGRATION.
==================================================
```
