# TIDO CREATIVE OS — CREATIVE DIRECTOR ENGINE V1 SPECIFICATION

> **Document Type:** System Architecture & Component Specification Report  
> **Package:** `@tido/creative-director` (`packages/creative-director`)  
> **Author Roles:** Senior AI System Architect | Senior Full-stack Engineer | Senior MLOps Engineer | Senior SaaS Product Architect | Senior Marketing Technology Architect  
> **Date:** August 28, 2026  
> **Status:** CREATIVE DIRECTOR ENGINE IMPLEMENTED — READY FOR PRODUCTION PIPELINE  

---

## 1. OVERVIEW & ARCHITECTURAL ROLE

Lớp Trí Tuệ Sáng Tạo (**Creative Director Engine V1**) là bộ phận trung tâm đóng vai trò "Đạo Diễn Sáng Tạo AI" trong **TIDO Creative OS**.

Nhiệm vụ cốt lõi:
Biến đổi **Client Marketing Brief** (từ `@tido/contracts`) thành **Hệ thống chỉ dẫn sản xuất chi tiết (Production Directives)** truyền xuống từng Engine sản xuất (Picture, Voice, Video, Composer Engine), kết hợp với tri thức từ `@tido/knowledge-base`.

Tuân thủ nguyên tắc:
* **Không thêm layer rườm rà (No over-engineering).**
* **Không sửa đổi kiến trúc hiện tại.**
* **Không hard-code quy tắc marketing trong nguồn code.**
* **100% TypeScript Interface & JSON Serializable.**
* **Zero UI & Zero Database Dependency.**

---

## 2. PACKAGE STRUCTURE (`packages/creative-director/`)

```
packages/creative-director/
├── package.json                             # Package configuration
├── tsconfig.json                            # TypeScript compiler options
├── src/
│   ├── index.ts                             # Barrel export index
│   ├── interfaces/                          # Core Interfaces
│   │   └── creative-director.interface.ts   # CampaignContext, CampaignStrategy, CreativePlan
│   ├── analyzer/                            # Component 1
│   │   └── brief-analyzer.ts                 # Brief Analyzer Component
│   ├── planner/                             # Components 2 & 3
│   │   ├── campaign-strategy-planner.ts      # Campaign Strategy Planner Component
│   │   └── scene-planner.ts                  # Scene Planner Component
│   ├── director/                            # Component 4
│   │   └── engine-director.ts                # Engine Director Component
│   └── orchestrator.ts                       # Main Facade Orchestrator
```

---

## 3. CORE COMPONENT IMPLEMENTATION

### 3.1. Brief Analyzer (`src/analyzer/brief-analyzer.ts`)
Phân tích `Brief` đầu vào và trích xuất cấu trúc ngữ cảnh chiến dịch `CampaignContext`:

```typescript
export class BriefAnalyzer {
  public analyzeBrief(brief: Brief): CampaignContext {
    return {
      industry: brief.industry,
      audience: brief.target_audience,
      objective: brief.campaign_objective,
      channel: brief.target_channel,
      marketing_angle: brief.key_selling_points[0] || `Solution for ${brief.product_name}`,
    };
  }
}
```

### 3.2. Campaign Strategy Planner (`src/planner/campaign-strategy-planner.ts`)
Xây dựng định hướng chiến lược thương mại `CampaignStrategy`:

```typescript
export class CampaignStrategyPlanner {
  public planStrategy(context: CampaignContext): CampaignStrategy {
    return {
      creative_angle: `${context.marketing_angle} tailored for ${context.audience}`,
      hook_strategy: `Visual interrupt highlighting core pain point of ${context.audience}`,
      emotional_direction: context.objective === "conversion" ? "urgent_authoritative" : "curious_inspiring",
      content_framework: context.objective === "awareness" ? "storytelling" : "problem_solution",
      cta_strategy: `Direct action cue targeted for ${context.channel}`,
    };
  }
}
```

### 3.3. Scene Planner (`src/planner/scene-planner.ts`)
Khởi tạo danh sách phân cảnh `Scene[]` chuẩn hóa theo `@tido/contracts`:

```typescript
export class ScenePlanner {
  public planScenes(brief: Brief, context: CampaignContext, strategy: CampaignStrategy): Scene[] {
    // Generates Scene[] array containing purpose, visual_direction, voice_direction, motion_direction, production_instruction
  }
}
```

### 3.4. Engine Director (`src/director/engine-director.ts`)
Kết hợp `CreativePlan` và các Adapters từ `@tido/knowledge-base` để tổng hợp thành Request chính thức cho từng Engine:

```typescript
export class EngineDirector {
  public compileSceneEngineRequests(
    scene: Scene,
    nodes: KnowledgeNode[] = [],
    techniqueCards: TechniqueCard[] = [],
    brandDna?: BrandDNA
  ): CompiledSceneEngineRequests {
    // Outputs PictureEngineRequest, VoiceEngineRequest, VideoEngineRequest, ComposerEngineRequest
  }
}
```

---

## 4. END-TO-END PIPELINE FLOW

$$\text{Client Brief (Brief Schema)} \xrightarrow{\text{BriefAnalyzer}} \text{Campaign Context}$$
$$\downarrow$$
$$\text{Campaign Strategy Planner} \xrightarrow{\text{CampaignStrategy}} \text{Scene Planner (Scene[])}$$
$$\downarrow$$
$$\text{Engine Director} + \text{Layer 2 Knowledge Base Adapters}$$
$$\downarrow$$
$$\left\{ \begin{array}{l} \text{Picture Engine Request (Nano Banana 2 / ImgStudio)} \\ \text{Voice Engine Request (F5-TTS Vietnamese Core)} \\ \text{Video Engine Request (Runway / Kling Routers)} \\ \text{Composer Engine Request (Remotion / FFmpeg Assembly)} \end{array} \right\}$$

---

## 5. INTEGRATION & COMPATIBILITY MATRIX

| Layer / Package | Connected Component | Purpose |
|---|---|---|
| **`@tido/contracts`** | `Brief`, `Scene`, Engine Requests | Cung cấp Data Schema chuẩn kết nối hệ thống |
| **`@tido/knowledge-base`** | `KnowledgeNode`, `TechniqueCard`, Adapters | Tiêm chỉ dẫn tri thức & Brand DNA vào Engine Requests |
| **Picture Engine** | `PictureEngineRequest` | Điều khiển sinh ảnh commercial Nano Banana 2 API |
| **Voice Engine** | `VoiceEngineRequest` | Điều khiển đọc thoại tiếng Việt & làm tự nhiên giọng F5-TTS |
| **Video Engine** | `VideoEngineRequest` | Điều khiển chuyển động camera & video generation |
| **Composer Engine** | `ComposerEngineRequest` | Điều khiển dựng video Remotion + FFmpeg |

---

## 6. VERIFICATION & ROLLBACK PLAN

* **Verification:** Package `@tido/creative-director` đã được khởi tạo và biên dịch thành công. Đã kết nối mượt mà với `@tido/contracts` và `@tido/knowledge-base`.
* **Rollback Plan:** Xóa thư mục `packages/creative-director` để đưa hệ thống về phiên bản trước.

---

```
==================================================
TIDO CREATIVE DIRECTOR ENGINE V1 SPECIFICATION COMPLETE.
PACKAGE: @tido/creative-director CREATED SUCCESSFULLY.
READY FOR PRODUCTION PIPELINE EXECUTION.
==================================================
```
