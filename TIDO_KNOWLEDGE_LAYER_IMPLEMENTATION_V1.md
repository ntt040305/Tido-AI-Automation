# TIDO CREATIVE OS — LAYER 2 KNOWLEDGE INTELLIGENCE IMPLEMENTATION V1

> **Document Type:** System Implementation Report & Architectural Blueprint  
> **Package:** `@tido/knowledge-base` (`packages/knowledge-base`)  
> **Author Roles:** Senior AI System Architect | Senior Full-stack Engineer | Senior MLOps Engineer | Senior SaaS Product Architect | Senior Marketing Technology Architect  
> **Date:** August 28, 2026  
> **Status:** FOUNDATION IMPLEMENTED — READY FOR SERVICE INTEGRATION  

---

## 1. OVERVIEW & IMPLEMENTATION SUMMARY

Hệ thống **TIDO Creative OS Layer 2 (Knowledge Intelligence Layer)** đã được khởi tạo thành công dưới dạng một Monorepo Package độc lập tại địa chỉ `packages/knowledge-base`.

Việc triển khai tuân thủ nghiêm ngặt các nguyên tắc:
* **KHÔNG** thêm dữ liệu marketing cứng (No marketing content data yet).
* **KHÔNG** hard-code quy tắc marketing trong nguồn code.
* **KHÔNG** xây dựng giao diện UI (No UI implementation).
* Thiết kế sẵn sàng cho **Vector DB (pgvector / Qdrant)**, **Multi-tenant Enterprise SaaS**, và **Enterprise Private Knowledge Bases**.

---

## 2. CREATED FILES & PACKAGE STRUCTURE

```
packages/knowledge-base/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                             # Barrel export index
│   ├── types/
│   │   └── index.ts                         # Complete TypeScript type definitions
│   ├── retrieval/
│   │   └── retrieval.interface.ts           # Pluggable Retrieval Service & Vector Adapter Interface
│   ├── matcher/
│   │   └── context-matcher.ts               # Rule-free Context Matcher Engine
│   ├── contracts/
│   │   └── knowledge-query.contract.ts      # API Query Contracts cho SaaS Microservices
│   └── adapters/                            # Integration Adapters cho 4 Production Engines
│       ├── picture-engine.adapter.ts        # Nano Banana 2 / ImgStudio Directives Adapter
│       ├── voice-engine.adapter.ts          # F5-TTS Vietnamese Directives Adapter
│       ├── video-engine.adapter.ts          # Video Provider Directives Adapter
│       └── composer-engine.adapter.ts       # Remotion / FFmpeg Assembly Adapter
└── schemas/                                 # Official JSON Schemas (Draft 2020-12)
    ├── knowledge-node.schema.json           # Schema nút tri thức tổng quát
    ├── technique-card.schema.json           # Schema thẻ kỹ thuật sản xuất
    ├── brand-dna.schema.json                # Schema định danh thương hiệu (Brand DNA)
    ├── context-query.schema.json            # Schema truy vấn ngữ cảnh
    ├── creative-decision.schema.json        # Schema quyết định sáng tạo
    └── creative-score.schema.json           # Schema chấm điểm QC sáng tạo
```

---

## 3. JSON SCHEMAS SPECIFICATION

### 3.1. `knowledge-node.schema.json`
Định nghĩa cấu trúc tri thức tổng quát. Hỗ trợ thuộc tính `tenant_id` ("global" hoặc Enterprise Tenant ID), mảng `context_matcher` (industries, objectives, channels), `payload` (core directives, constraints, negative directives) và `metadata` (`confidence_score`, `historical_pass_rate`).

### 3.2. `technique-card.schema.json`
Định nghĩa thẻ kỹ thuật quay dựng sản xuất (Technique Card). Quy định các trường `scene_role` (`hook`, `problem_statement`, `solution_reveal`, `product_hero`, `social_proof`, `cta`), `visual_setup`, `lighting_setup`, `camera_setup`, `qc_rules` và `provider_hints`.

### 3.3. `brand-dna.schema.json`
Định nghĩa hồ sơ DNA thương hiệu (Brand DNA). Quy định `visual_identity` (bảng màu, brand tone, logo assets), `voice_identity` (giọng ưu tiên, tone descriptors, lexicon phát âm) và `forbidden_rules` (từ cấm, hình ảnh cấm, competitor claims cấm).

### 3.4. `context-query.schema.json`
Schema truy vấn ngữ cảnh đầu vào để tìm kiếm tri thức tương thích từ Creative Composer hoặc SaaS API.

### 3.5. `creative-decision.schema.json`
Lưu vết các quyết định chọn lựa Technique Cards và Knowledge Nodes đã áp dụng cho từng dự án/cảnh để làm audit trail và phục vụ Machine Learning feedback loop.

### 3.6. `creative-score.schema.json`
Schema lưu trữ điểm số QC sáng tạo (Brand alignment, Technical quality, Commercial appeal) để tự động cập nhật `historical_pass_rate` cho các nút tri thức.

---

## 4. CONTEXT MATCHER ENGINE (`src/matcher/context-matcher.ts`)

Context Matcher Engine hoạt động dựa trên thuật toán tính điểm tương thích ma trận không phụ thuộc vào quy tắc hard-code:

$$\text{TotalScore} = w_{\text{ind}} \cdot S_{\text{industry}} + w_{\text{obj}} \cdot S_{\text{objective}} + w_{\text{chan}} \cdot S_{\text{channel}} + w_{\text{qual}} \cdot S_{\text{quality}}$$

* **Trọng số:** Industry ($0.35$), Objective ($0.30$), Channel ($0.25$), Metadata Quality ($0.10$).
* **Thuật toán so khớp danh sách:**
  * Exact String Match: $1.0$
  * Wildcard / Global Target (`*` / `all`): $0.7$
  * Default Fallback: $0.1$
* Tự động lọc và xếp hạng (ranking) danh sách Knowledge Nodes và Technique Cards theo điểm tương thích từ cao xuống thấp.

---

## 5. INTEGRATION ADAPTERS

Các Adapter đóng vai trò biên dịch (transpiler) tri thức thô từ Layer 2 thành chỉ dẫn kỹ thuật cụ thể cho từng Engine:

1. **Picture Engine Adapter (`picture-engine.adapter.ts`):**
   * Tổng hợp `prompt_modifiers`, `lighting_instructions`, `composition_instructions`, `color_palette_hex` và `brand_negative_prompts` cho **Nano Banana 2 API / ImgStudio**.

2. **Voice Engine Adapter (`voice-engine.adapter.ts`):**
   * Tổng hợp `preferred_gender`, `target_pacing_wpm`, `tone_descriptors`, `pronunciation_lexicon`, `pause_strategy_hints` và `emotion_profile_hints` cho **F5-TTS Vietnamese Core**.

3. **Video Engine Adapter (`video-engine.adapter.ts`):**
   * Tổng hợp `camera_motion_type`, `motion_speed`, `fps_target`, `temporal_stability_hints` cho **Video Provider Routers (Runway / Kling / CogVideo)**.

4. **Composer Engine Adapter (`composer-engine.adapter.ts`):**
   * Tổng hợp `layout_template_hints`, `brand_logo_watermark_url`, `brand_primary_color_hex`, `forbidden_text_keywords` cho **Remotion / FFmpeg Video Assembly**.

---

## 6. FUTURE-PROOFING & ENTERPRISE ARCHITECTURE

1. **Vector DB Pluggable Interface (`IKnowledgeVectorStoreAdapter`):**
   * Định nghĩa sẵn interface cho phép plug-and-play các Vector Store như **pgvector** hoặc **Qdrant** thông qua phương thức `searchSimilarNodes(tenant_id, vector, limit)`.
2. **Multi-tenant SaaS Isolation:**
   * Mọi Schema và Interface đều có thuộc tính `tenant_id`. Truy vấn tự động phân tách giữa tri thức toàn cục hệ thống (`tenant_id = "global"`) và tri thức riêng tư của từng doanh nghiệp (`tenant_id = "tenant_enterprise_xyz"`).
3. **No Hard-coded Rules:**
   * Không chứa bất kỳ câu thoại, prompt hay luật marketing cố định nào trong mã nguồn. Dữ liệu tri thức sẽ được nạp động từ bên ngoài qua JSON API.

---

## 7. VERIFICATION & ROLLBACK PLAN

* **Verification:** Đã khởi tạo đầy đủ các file TypeScript và JSON Schemas trong `packages/knowledge-base`. Không ảnh hưởng tới các app hiện tại (`apps/web` hay `F5-TTS-Vietnamese`).
* **Rollback Plan:** Do đây là package độc lập mới được thêm vào workspace, việc rollback (nếu cần) chỉ đơn giản là xóa thư mục `packages/knowledge-base`.

---

```
==================================================
TIDO CREATIVE OS LAYER 2 FOUNDATION IMPLEMENTATION COMPLETE.
PACKAGE: @tido/knowledge-base CREATED SUCCESSFULLY.
READY FOR PHASE 1 APPROVAL & NEXT STEPS.
==================================================
```
