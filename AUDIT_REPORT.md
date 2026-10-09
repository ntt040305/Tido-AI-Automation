# AUDIT REPORT — Master Prompt Engine (chuẩn bị cho `feat/prompt-engine-v2`)

Ngày: 2026-10-02 · Phạm vi: chỉ đọc. Không sửa code, không gọi API trả phí.
Mọi nhận định đều dẫn `file:dòng`. Chỗ chưa kiểm được ghi **CHƯA XÁC MINH** kèm cách kiểm.

Gốc repo git là `D:\Tido`; toàn bộ hệ thống nằm trong `tido-ai-video-factory-claude-code-pack/`.
Trong báo cáo này mọi đường dẫn tương đối đều tính từ `tido-ai-video-factory-claude-code-pack/apps/web/`
trừ khi ghi khác.

---

## A. BẢN ĐỒ HỆ THỐNG

### A1. Tech stack và cách chạy

| Hạng mục | Thực tế | Bằng chứng |
|---|---|---|
| Monorepo | pnpm workspace + turbo | `package.json` (gốc pack): `dev/build/lint/test/typecheck` đều là `turbo <task>` |
| App | Next.js (bản mới, có cảnh báo API đổi) | `apps/web/AGENTS.md` — *"This is NOT the Next.js you know"* |
| Engine ảnh | TypeScript thuần trong `lib/image-engine/` | — |
| Test runner | **Không có Jest/Vitest.** 51 script `run-*-tests.ts` tự in `"N passed, M failed"`, gộp bởi một runner | `lib/image-engine/run-all-tests.ts:16-...`; `apps/web/package.json`: `"test": "npx tsx lib/image-engine/run-all-tests.ts"` |
| Typecheck | `npx tsc --noEmit` | `apps/web/package.json` |
| Lint | `eslint` | `apps/web/package.json` |

Lệnh chạy (từ `apps/web/`): `npm test` · `npm run typecheck` · `npx eslint .`

### A2. BASELINE (đo hôm nay, trước khi sửa bất cứ gì)

| Phép đo | Kết quả | Ghi chú |
|---|---|---|
| **typecheck** | **3 lỗi**, toàn bộ trong `scratch/trace_pipeline_synthesis.ts` (dòng 9 và 110) | File scratch **untracked**, không thuộc build Next. Lỗi có trước, không liên quan nhiệm vụ này |
| **test** (`npm test`) | **Dừng ở suite 27/51.** `run-visual-controls-integration-tests`: 15 passed / **1 failed**. Tổng tới điểm dừng: **743 passed / 1 failed**; **24 suite chưa được chạy** | Lỗi là một assertion về **thứ tự dòng trong file UI**: `lib/image-engine/run-visual-controls-integration-tests.ts:102` đòi `{/* Submit CTA */}` xuất hiện sau `<VisualDirectionControlPanel` trong `features/picture-engine/components/brief/CreativeBriefPanel.tsx`. Đây là hệ quả của lần rework frontend (campaign-site/stitch), **không** phải engine prompt |
| **lint** | **1332 problems (1120 errors, 212 warnings)** | Phần lớn `@typescript-eslint/no-explicit-any`, rất nhiều ở `scratch/`. Có trước |

> **Hệ quả cho nguyên tắc 3:** "so với BASELINE" ở repo này nghĩa là *so với 743 passed / 1 failed ở suite 27* và *3 lỗi tsc trong scratch*. Vì runner **dừng ở suite lỗi đầu tiên**, 24 suite cuối hiện **không được bảo vệ**. Trước Giai đoạn 1 nên sửa đúng một assertion UI này (hoặc chạy runner với cờ bỏ qua) để baseline phủ hết 51 suite — nếu không, mọi hồi quy ở 24 suite cuối sẽ vô hình. **Tôi chưa sửa gì** (giai đoạn 0 chỉ đọc).

### A3. Luồng dữ liệu end-to-end

```
[UI]  CreativeBriefPanel.tsx
      ├─ concept (textarea)                               :295
      ├─ (tùy chọn) nút "ý tưởng hóa" ──► POST /api/image/concept-professionalize
      │     "Đang phát triển ý tưởng..."                  :310
      │     "[ Áp dụng ý tưởng ] / [ Giữ ý tưởng ban đầu ]" :404/:411
      │     gọi tại                                        :128
      └─ submit
            │
            ▼
[API] app/api/image/generate-simple/route.ts
      nhận JSON hoặc multipart: contentMessage :70/:90 · copyItems :75/:105
      brandName :73/:93 · aspectRatio :72/:92 (mặc định "1:1")
            │
            ▼
[ORCH] lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts
      SmartKnowledgeRetriever.retrieve(...)               :412
      RenderTracer checkpoint "A" = output compiler       :684
            │
            ▼
[COMPILE] lib/image-engine/compiler/MasterPromptCompilerService.ts
      template: data/prompts/master_prompt_v2.md
      thay placeholder {{...}}                            :1019-1032
      vòng cắt knowledge cho vừa trần                     :1056-1090
      ProviderPromptOptimizer.optimize(...)               :1136
      PromptBudgetManagerService.enforceBudget(...)        :1143
            │
            ▼
[ROUTER] lib/image-engine/evolution/PipelineRouter.ts
      ExperimentPipeline.run(...)                         :185
      sau khi có ảnh: reviewRender(...)                   :199
            │
            ▼
[PIPELINE] lib/image-engine/evolution/ExperimentPipeline.ts
      wrapProvider(...)                                   :375
      NanoBananaPromptComposer.compose(...)               :450
      blueprintFor(...)                                   :491
      opticalScriptFor(...)  ◄── ĐƯỜNG CHÍNH HIỆN NAY     :496
      finalPrompt = optical.prompt                        :497-501
            │
            ▼
[8-BLOCK] lib/image-engine/evolution/experiment/OpticalCompiler.ts
      BLOCK_ORDER 1..8                                    :81-90
      compileOnePassPrompt(...)                           (cuối file)
            │
            ▼
[PROVIDER] lib/image-engine/provider/ImgStudioImageGenerationProvider.ts
      providerId = "flow-nano-banana-2"                   :75
      kiểm tỷ lệ trước khi gọi                            :96-105
      effectivePrompt (chuỗi THẬT gửi đi)                 :216
      formData.append("prompt", effectivePrompt)          :355
      formData.append("aspect_ratio", ...)                :359
```

### A4. Mỗi BLOCK do đâu sinh ra

| Block | Nội dung đến từ | File |
|---|---|---|
| 1 OUTPUT CONTRACT | `AUTHORITY_RULE` + `OUTPUT_RULE` (code, hằng chuỗi) + `CHANNEL` (code) + các section routed (ROLE, COMMERCIAL FRAMING, ASSET CONTEXT) | `OpticalCompiler.ts` (AUTHORITY_RULE/OUTPUT_RULE), `AssetProfile.ts:114` |
| 2 IDENTITY LOCK | template compiler + routing sản phẩm | `MasterPromptCompilerService.ts:351-367`, `:990-1012` |
| 3 SUBJECT & STAGING | `IdeaLayer` (câu THE IDEA) + `CompositionPlan` (staging) + văn xuôi routed | `IdeaLayer.ts`, `CompositionPlan.ts:810+` |
| 4 LIGHT | **preset code** từ `CinematographyLayer.projectToSetup` | `CinematographyLayer.ts` (`renderLightForPrompt`) |
| 5 LENS | như trên | `CinematographyLayer.ts` (`renderLensForPrompt`) |
| 6 ENVIRONMENT | như trên | `CinematographyLayer.ts` (`renderEnvironmentForPrompt`) |
| 7 GRADE & MATERIAL | `FinishLayer` + `renderSurfaceForPrompt` + thẻ knowledge + brand | `FinishLayer.ts`, `CinematographyLayer.ts` |
| 8 TYPOGRAPHY | `TextLedgerSystem` + `TypographyDNA` + `AssetProfile` | `TextLedgerSystem.ts`, `OpticalCompiler.ts` (`buildTypographyBlock`) |

**Không block nào do LLM viết.** Mọi block là code/preset/template. LLM chỉ tham gia ở tầng *quyết định* phía trước (Marketing Brain, Creative Director, blueprint) và ở nút "ý tưởng hóa".

### A5. Model và cấu hình

| Vai trò | Model | Nơi cấu hình |
|---|---|---|
| Ảnh (đang dùng) | `flow-nano-banana-2` qua ImgStudio | `ImgStudioImageGenerationProvider.ts:75` (`IMGSTUDIO_PROVIDER_ID`) |
| Ảnh (provider khác, có trong repo) | `gemini-3.1-flash-image` | `GeminiImageGenerationProvider.ts:122`, `.env.local: TIDO_IMAGE_MODEL` |
| Text (toàn pipeline sáng tạo) | `gemini-3.7-flash-high` | `.env.local: LLM_MODEL`; dùng ở `marketing-brain.service.ts:281` |
| Tỷ lệ khung được hỗ trợ | `IMAGE_ENGINE_CONFIG.IMGSTUDIO_SUPPORTED_ASPECT_RATIOS`, mặc định **`1:1`, `9:16`, `16:9`** | `ImgStudioImageGenerationProvider.ts:96-98` |

→ Kiến trúc đích mục 7 ("chỉ dùng cặp tỷ lệ provider hỗ trợ") = **1:1 / 9:16 / 16:9**. `4:5` **không** được hỗ trợ (khớp ghi chép cũ của dự án).

### A6. Ai phụ thuộc định dạng master prompt

| Phụ thuộc | Dạng phụ thuộc | File |
|---|---|---|
| `ProviderPromptOptimizer` | tách section theo `\n## `, bảng tier theo TÊN section | `ProviderPromptOptimizer.ts:584-591`, `prompt-section-policy.ts:77-135` |
| `PromptBudgetManagerService` | cắt theo section + trần ký tự | `service/PromptBudgetManagerService.ts:61-62` |
| `ExactCopyIntegrityValidator.validate` | đòi mọi chuỗi copy **có mặt trong compiledPrompt**, sai thì **FAIL cả render** | `MasterPromptCompilerService.ts:1122` |
| `OpticalCompiler` router | tách section theo heading `#{1,4}` và tên section | `OpticalCompiler.ts` (`SECTION_ROUTE`, `splitNamedSections`) |
| `auditSections` (ownership) | topic ↔ owner theo section | `PromptOwnership.ts` |
| `PromptGrader` | đo chính chuỗi gửi đi | `benchmark/PromptGrader.ts` |
| `master_prompt.md` trong benchmark | file ghi lại prompt để so sánh | `data/benchmarks/creative-quality/*/cases/*/master_prompt.md` |

→ **Đổi định dạng prompt sẽ chạm 7 chỗ này.** Đây là lý do engine v2 phải nằm sau flag và v1 phải giữ nguyên.

---

## B. CHẨN ĐOÁN 8 LỖI

### Lỗi 1 — "block sau ghi đè block trước" đè ý đồ sáng tạo — **CÓ**

Gốc: `OpticalCompiler.ts` hằng `AUTHORITY_RULE`:
> *"Everything else: where two blocks describe the same thing differently, execute the LATER block's version."*

Và BLOCK 4/5/6 (preset) nằm **sau** BLOCK 3 (ý tưởng/cảnh) trong `BLOCK_ORDER` (`OpticalCompiler.ts:81-90`). Nên preset ánh sáng **luật thắng** mô tả sáng tạo.

Mâu thuẫn anh quan sát có nguồn chính xác:
- *"nắng sớm sau-trái vs key 3200K camera-left"*: BLOCK 3 giữ văn xuôi của brief, BLOCK 4 ghi `key_azimuth_deg` **camera-left** cố định — `CinematographyLayer.ts` (`key_azimuth_deg = 55 − 25·intimacy`, **không có trục nào cho bên phải/sau**). Tức hướng đèn là *hằng số theo thiết kế*, không đọc từ brief.
- *"cấm bloom/flare trong khi concept cần chất lỏng rực"*: `FinishLayer.ts` phát `flare: "no flare or bloom of any kind"` cho medium `digital medium format` và `8x10`, và `renderFinishForPrompt` in nguyên câu đó vào BLOCK 7.

Ảnh hưởng: **cao** — đây là cơ chế biến mọi concept thành cùng một setup.

### Lỗi 2 — thông số số học vô nghĩa với model ảnh — **CÓ**

| Thông số anh thấy | Nơi sinh |
|---|---|
| `4/255` (black level) | `FinishLayer.ts` `black_level` + `renderFinishForPrompt` (*"darkest value ... sits at 4/255"*) |
| `haze 7%` | `CinematographyLayer.ts` `atmosphere_percent` → *"haze costing about N% of the frame's contrast"* |
| `key:fill 4:1` | `CinematographyLayer.ts` `key_fill_ratio` → `renderLightForPrompt` |
| `luminance 51%` | `CinematographyLayer.ts` `surface_luminance` → `renderEnvironmentForPrompt` |
| `specular ≤ 8%` | `CinematographyLayer.ts` `specular_width_pct` → `renderSurfaceForPrompt` |

**Đây là hệ quả trực tiếp của tầng vật lý tôi xây trong các lượt trước** (hạng mục 2 và 3). Lúc đó tôi đã ghi rõ trong header hai file rằng *"Whether Nano Banana 2 renders '4:1 at 3200K' more faithfully than 'warm side light' is UNVERIFIED"* và đề nghị một phép thử 400 VND để kiểm — phép thử đó bị đưa ra khỏi phạm vi. **Quan sát của anh trên ảnh thật chính là câu trả lời: thông số không có tác dụng.**

Ảnh hưởng: **cao** — chiếm ~1.300 ký tự/prompt và đẩy prompt sang ngôn ngữ mà model không hành động theo.

### Lỗi 3 — template lỗi rò vào prompt — **CÓ, bốn lỗi riêng biệt**

| Biểu hiện | Gốc | Bằng chứng |
|---|---|---|
| **"fills about 3600% of the frame"** | Nhân 100 cho một giá trị **đã là phần trăm** | `CompositionPlan.ts:626-633` `distanceShare()` trả về **55/38/20/9** (phần trăm); `OpticalCompiler.ts:1109` làm `Math.round(share * 100)` → `36×100 = 3600` |
| Cùng lỗi đơn vị, chỗ thứ hai | `CinematographyLayer.ts:519` `Math.round(context.product_share * 100)` → `subject_share_pct` sai 100 lần; kéo theo `distance_class` luôn rơi vào `macro` (ngưỡng ≥45) | — |
| **một vùng có 2 bộ tọa độ** | `CompositionPlan.ts:863` nói *"where the words go"* + `:867` nói *"keep clear: ... about W% by H%"*; cộng thêm BLOCK 8 T3 nói lại vùng chữ lần nữa | 3 phát biểu, 2 hệ số |
| **trường bị cắt bằng "…"** | `shorten()` dùng ký tự `…`: `CompositionPlan.ts:175`, `TypographyDNA.ts:943`, `VisionReview.ts:108`, `LayoutContextBridge.ts:208`, `IdeaLayer.ts:111` | — |
| **"BUSINESS GOAL: in beauty_skincare"** | `MasterPromptCompilerService.ts:613-620` nối `strategy.commercial_goal` mà không kiểm rỗng | — |
| **"Commercial Brand (Item 1)"** | `KnowledgeRouterService.ts:343` `const brand = input.brandName \|\| "Commercial Brand"` | — |
| **"Who is in frame: Authentic reflection of..."** dù không có người | `ExperimentPipeline.ts:217` `human_presence: consumer?.viewer ? \`Authentic reflection of ${consumer.viewer}\` : undefined` — gắn người vào khung chỉ vì có chân dung khách hàng | — |

Ảnh hưởng: **cao**. Riêng `3600%` là một chỉ dẫn vô nghĩa đặt ở vị trí quan trọng nhất (kích cỡ sản phẩm).

### Lỗi 4 — data binding sai — **CÓ (một phần CHƯA XÁC MINH)**

- **brand nhận "Centella" trong khi nhãn thật là SKIN1004**: input chỉ có **một** trường `brandName` (`route.ts:73/:93`) — **không có `product_line`**. Mọi tầng dưới (`KnowledgeRouterService.ts:343`, BrandKit, prompt) nhận đúng một chuỗi đó. **Gốc: thiếu trường, không phải lỗi ghi.** Kiến trúc đích mục 1 (tách `brand` và `product_line`) là bản sửa đúng.
- **mô tả sản phẩm chứa nguyên đoạn concept**: `CompositionPlan.ts:245-247` — `hero_subject` lấy `shorten(visualStory)`, và khi không có visual story thì lấy *"the product as supplied: …"*. Concept của user chảy vào mô tả sản phẩm qua đường blueprint → `hero_subject`. **CHƯA XÁC MINH** chính xác đoạn nào in ra `PRODUCT_01 description` trong prompt anh thấy; cách kiểm: `TIDO_RENDER_TRACE=1` rồi đọc checkpoint `A` và `F_HTTP` của đúng job đó (`RenderTracer.ts`), hoặc `data/generated/image-renders/<id>/master_prompt.md`.
- **PRODUCT_02 không có mô tả riêng**: `MasterPromptCompilerService.ts:351-355` chỉ lấy `prod = products[0]` (`prod.product_id`) rồi nói "N instances of the SAME product identity". Không có vòng lặp mô tả từng sản phẩm. Với 2 chai khác nhau, cấu trúc hiện tại **không có chỗ** để đặt mô tả thứ hai.

Ảnh hưởng: **cao** — sai nhãn thương hiệu là lỗi không sửa được ở hậu kỳ.

### Lỗi 5 — 326 ký tự copy dồn vào một trường `headline` — **CÓ**

Gốc: `TypographySystem.ts:242-258` `assignTextRoles()` gán vai **theo DÒNG**: `i === 0 → headline`. `resolveTextRequirement` (`ExactCopyIntegrityValidator.ts`) tách `contentMessage` theo `\n`. Nếu user dán copy thành **một đoạn** (hoặc UI gửi một chuỗi), toàn bộ 326 ký tự trở thành **một dòng** → một `headline`.

Hậu quả nối tiếp, đều có gốc trong code:
- Vùng chữ bị ép: `AssetProfile`/BLOCK 8 T3 phát `cap-height ≥ 2.2%` và vùng `22.5%` chiều cao cho **một** khối chữ khổng lồ.
- Sai chính tả ("sỉ"): model phải vẽ 326 ký tự trong vùng nhỏ. Mô hình chi phí tôi đã ghi ở lượt trước: xác suất đúng giảm theo **số chuỗi**, và đây là trường hợp xấu nhất (một chuỗi quá dài).
- Nhãn sản phẩm méo: BLOCK 8 T4 cấm chữ chiến dịch lên sản phẩm, nhưng khi vùng chữ chồng sản phẩm thì model phải chọn — và nó chọn vẽ đè.

Ảnh hưởng: **cao**. `copyFitsChannel` (`AssetProfile.ts:131`) hiện **chỉ cảnh báo**, không chặn.

### Lỗi 6 — big idea mặc định cho mọi concept — **CÓ**

Gốc: `AssetContext.ts:236` — hằng chuỗi `"iconic product composition — the object itself is the idea"`, nằm trong danh sách route của asset context. Đây là một *route mặc định*, và vì `IdeaLayer` (lượt trước) chỉ **trích** ý tưởng có sẵn chứ không bịa, khi upstream không sinh được cơ chế thì chuỗi này là thứ duy nhất còn lại.

Khớp với số đo tôi đã ghi: `idea_mechanism` **0/12** case, `mood_only` **12/12**. Tức **không brief nào từng có ý tưởng**; "iconic product composition" là hệ quả, không phải nguyên nhân.

Ảnh hưởng: **cao** — đúng chiều yếu nhất mà judge chấm (`creative_concept` 4.6/10).

### Lỗi 7 — prompt ~3500 từ, lặp FORBID, trộn tiếng Việt — **CÓ**

- **Độ dài**: prompt gửi đi đo được **24.961–25.568 ký tự** ≈ **3.500–4.000 từ** (`PromptGrader` chạy trên 12 case).
- **Lặp FORBID**: `EXCLUSIONS` từ art direction + BLOCK 8 T4 + `render_constraints`. `PromptGrader` đo `restated_sentences` **4/12 case vẫn vượt ngưỡng**.
- **Tiếng Việt trộn vào**: `CreativeOpportunity.ts:149,153,171` sinh `strategicAngle` **bằng tiếng Việt** (*"Phá vỡ quy ước rập khuôn…"*, *"Biến sản phẩm thành giải pháp trung tâm…"*) và chuỗi này chảy vào prompt tiếng Anh. Ngoài ra `ImgStudioImageGenerationProvider.ts:105` trả lỗi tiếng Việt (chỉ là message, không vào prompt).

Ảnh hưởng: **trung bình-cao**.

### Lỗi 8 — không có bước kiểm tra đầu ra — **SAI MỘT PHẦN: hạ tầng CÓ, nhưng không phải OCR**

- Có vòng review sau render: `PipelineRouter.ts:199` gọi `reviewRender(...)` (`VisionReviewLayer.ts:245`), và nó có thể render lại.
- Có so chữ: `checkRenderedText()` (`compiler/ExactCopyIntegrityValidator.ts:234`) so **từng dòng copy** với `visible_text` mà vision model đọc được, phân loại `missing / incorrect / case_styled / unwanted`, dùng Levenshtein trên dạng lược dấu.
- **Thiếu thật sự**: (a) không có **OCR chuyên dụng** — phụ thuộc vision model tự liệt kê chữ; (b) **không có** phép so **nhãn sản phẩm** với ảnh tham chiếu — `judgeBrand` trong `VisionReview.ts` tự khai `from_observation: true`, và ghi chép dự án đã có một ca model **bịa ra logo "Tide"** mà vision không báo; (c) **CHƯA XÁC MINH** vòng review có chạy trên đường one-pass hiện tại hay không: cách kiểm là tìm `[VISION_REVIEW]` trong log của một job thật.

Ảnh hưởng: **trung bình** (có lưới nhưng lưới có lỗ đúng chỗ anh cần).

### B+. Lỗi khác tôi tìm thêm

| # | Phát hiện | Bằng chứng | Ảnh hưởng |
|---|---|---|---|
| 9 | **Hướng đèn không bao giờ đọc từ brief.** Không có trục nào biểu diễn "sau-trái/sau-phải"; `key_azimuth_deg` chỉ phụ thuộc `intimacy` | `CinematographyLayer.ts` (`key_azimuth_deg`) | cao — là gốc của mâu thuẫn ở lỗi 1 |
| 10 | **Logic theo loại asset chỉ khác ở 4 con số.** `AssetProfile` đổi `read_time/dominance/cap-height/max_strings`; nhưng *ý tưởng, bố cục, số vùng chữ* không khác theo asset | `AssetProfile.ts:57-93` | cao — Banner và Poster vẫn nhận cùng một bố cục |
| 11 | **`ExactCopyIntegrityValidator.validate` fail cả render** nếu copy không có mặt nguyên văn trong compiled prompt. Nếu v2 viết lại copy (policy `adapt`) sẽ **chặn render** | `MasterPromptCompilerService.ts:1122-1131` | **chặn Giai đoạn 2** nếu không xử lý |
| 12 | **Chưa chuẩn hóa NFC ở đầu vào.** `TextLedgerSystem` đếm grapheme bằng NFD, `loose()` lược dấu để so; nhưng **không có** bước `normalize("NFC")` khi nhận copy từ API | `route.ts:70/:90`; `TextLedgerSystem.ts` | trung bình — hai chuỗi "giống nhau" có thể khác bytes |
| 13 | **Runner test dừng ở lỗi đầu tiên** → 24/51 suite không chạy | `run-all-tests.ts` (exit-on-first-fail) | cao cho an toàn refactor |
| 14 | **Prompt vẫn hứa thứ không có**: `PromptGrader` đo `category_labels` **12/12 fail**, `verdict_words` **6/12 fail** — nhãn thể loại và từ phán xét nằm trong văn xuôi của Marketing Brain/blueprint | đo bằng `run-prompt-grader.ts` | trung bình |

---

## C. RỦI RO — THỨ KHÔNG ĐƯỢC PHÁ

1. **Hợp đồng API** `POST /api/image/generate-simple` (JSON **và** multipart) — `route.ts:60-130`, `:400-445`.
2. **`ExactCopyIntegrityValidator.validate`** — đang là cổng chặn render; đổi hành vi copy mà không xử lý cổng này = chặn toàn bộ render (rủi ro #11).
3. **Trần ngân sách prompt 3 nơi phải khớp**: `PromptBudgetValidator.DEFAULT_PROVIDER_HARD_LIMIT`, `PromptBudgetManagerService.HARD_MAXIMUM`, `ProviderPromptOptimizer.HARD_LIMIT` — cả ba đọc `PROMPT_HARD_MAXIMUM_CHARS`.
4. **Tỷ lệ khung chỉ 1:1 / 9:16 / 16:9** — provider từ chối trước khi gọi (`ImgStudioImageGenerationProvider.ts:96-105`).
5. **`PromptOwnership` + `prompt-section-policy`** — nếu v2 đổi tên/section, hai bảng này và 2 suite test sẽ sai.
6. **Luồng khác**: video, voice, music, billing, auth — v2 **không chạm**; chỉ chạm nhánh tạo prompt ảnh.
7. **Thiếu test**: không có test nào cho `OpticalCompiler`, `CinematographyLayer`, `FinishLayer`, `IdeaLayer`, `AssetProfile`, `TextLedgerSystem`, `PromptGrader` (6 module mới + grader). Đây là **chỗ cần characterization test trước tiên** ở Giai đoạn 1.

---

## D. KẾ HOẠCH GIAI ĐOẠN 1–3 (điều chỉnh theo repo thật)

### Điều chỉnh so với kiến trúc đích, kèm lý do

| Mục đích | Điều chỉnh | Lý do (có bằng chứng) |
|---|---|---|
| "MỘT lời gọi LLM đóng vai Creative Director và viết luôn master prompt" | Giữ nguyên, nhưng v2 **bỏ qua** `MasterPromptCompilerService` + `ProviderPromptOptimizer` + `PromptBudgetManager` + 8-block, **không** chèn thêm vào chúng | Prompt v1 đã 25k ký tự và bị 3 lớp cắt; thêm một tầng nữa sẽ bị cắt mất. v2 nên là **đường riêng** từ input → LLM → linter → provider |
| "cấm thuật ngữ kỹ thuật, cấm %" | Giữ nguyên — và nghĩa là **toàn bộ `CinematographyLayer` + `FinishLayer` không tham gia v2** | Đây là **đảo chiều** so với việc vừa xây (hạng mục 2–3). Quan sát ảnh thật của anh (lỗi 2) là bằng chứng ưu tiên hơn giả thuyết của tôi. Hai file đó **giữ nguyên cho v1**, đánh dấu deprecated-for-v2 |
| "copy_policy adapt" | Phải xử lý rủi ro #11 trước: hoặc v2 không đi qua validator đó, hoặc validator nhận chuỗi đã adapt | `MasterPromptCompilerService.ts:1122` |
| Tỷ lệ khung | Chỉ `1:1`, `9:16`, `16:9` | `ImgStudioImageGenerationProvider.ts:96-98` |
| Playbook 5 loại | Đặt ở `lib/image-engine/prompt-v2/playbooks/*.ts` (file cấu hình riêng), **không** nhập vào `AssetProfile` của v1 | giữ v1 bất biến |

### Giai đoạn 1 — nền tảng an toàn (dự kiến 4 commit)

1. `test(v1): characterization cho luồng tạo master prompt` — snapshot 3 fixture (poster 1 sản phẩm, banner, poster 2 sản phẩm + copy 326 ký tự) qua `compileOnePassPrompt` và qua compiler, lưu golden file. Dùng mock, không gọi API.
2. `test(baseline): mở rộng run-all-tests để không dừng sớm` (hoặc một runner thứ hai chạy hết 51 suite và báo tổng) → baseline phủ hết.
3. `feat(flag): PROMPT_ENGINE=v1|v2 + lớp chọn engine` — `lib/image-engine/prompt-v2/engine-selector.ts`, đọc `process.env.PROMPT_ENGINE`, **mặc định `v1`**; v1 gọi đúng đường hiện tại.
4. `test(flag): v1 giống hệt trước` — so golden file ở bước 1 với flag=v1.

### Giai đoạn 2 — engine v2 (dự kiến 6 commit)

1. Schema input + Creative Spec (**Zod** — kiểm xem repo đã có Zod chưa, nếu chưa thì validate bằng TypeScript thuần để không thêm dependency; nguyên tắc 8).
2. Tách dữ liệu: `brand` ≠ `product_line`, `product_description[]` theo từng ref, `copy[]` có role.
3. 5 playbook + selector + unit test.
4. System prompt Creative Director (ảnh sản phẩm làm input, JSON có thứ tự trường như mục 2 kiến trúc đích).
5. Linter (độ dài 200–500 từ, regex thuật ngữ/từ cấm, mỗi chuỗi copy đúng 1 lần, NFC, số dòng theo playbook, có tỷ lệ khung, không placeholder/"…"/% bất thường) + 1 lần nhờ LLM sửa + fallback v1.
6. UI: chỉ ẩn nút "ý tưởng hóa" **khi flag=v2** (`CreativeBriefPanel.tsx:404/:411`), không xóa.

### Giai đoạn 3 — đo lường và bàn giao (dự kiến 3 commit)

1. Bộ eval 20–30 concept trong `lib/image-engine/prompt-v2/eval/cases/`, một lệnh chạy, **mặc định mock**; có ca Centella 2 chai 1:1 + copy 326 ký tự.
2. Script so v1/v2: lint pass rate, độ dài, số mâu thuẫn, chi phí ước tính/job, độ trễ. Tái dùng `PromptGrader` cho phần "mâu thuẫn/đặc tả".
3. QA sau render: **đã có chỗ cắm** (`PipelineRouter.ts:199`) → thêm so nhãn sản phẩm sau flag riêng; `CHANGELOG_V2.md` + tài liệu bật/tắt/rollback.

---

## HAI ĐIỂM TÔI PHẢI DỪNG VÀ HỎI (nguyên tắc 9)

### 1. Cây làm việc đang có 17 thay đổi chưa commit — tôi không được tự quyết

`git status` hiện có **11 file sửa + 6 file mới chưa commit**, trong đó có đúng những module sinh ra lỗi 1, 2, 3:

```
 M .../compiler/MasterPromptCompilerService.ts        M .../experiment/CompositionPlan.ts
 M .../compiler/prompt-section-policy.ts              M .../experiment/OpticalCompiler.ts
 M .../evolution/ExperimentPipeline.ts                M .../experiment/PromptOwnership.ts
 M .../run-budget-manager-tests.ts                    M .../run-prompt-ownership-tests.ts
 M .../budget-characterization.current.json           M scratch/healthy_checkpoints.json
 M scratch/healthy_final_provider_prompt.txt
?? .../benchmark/PromptGrader.ts            ?? .../experiment/AssetProfile.ts
?? .../experiment/CinematographyLayer.ts    ?? .../experiment/FinishLayer.ts
?? .../experiment/IdeaLayer.ts              ?? .../run-prompt-grader.ts
```

Tạo `feat/prompt-engine-v2` bây giờ sẽ **mang theo toàn bộ** số này (git checkout -b giữ working tree), nên "mỗi bước một commit nhỏ, revert độc lập" sẽ không thực hiện được: commit đầu tiên sẽ là một khối 17 file lẫn lộn giữa việc cũ và việc mới.

**Ba lựa chọn, tôi cần anh chọn một:**

| | Cách làm | Hệ quả |
|---|---|---|
| **A** | Commit 17 file này lên `main` trước (một commit "state before v2"), rồi mới tạo branch | Lịch sử sạch nhất; `main` mang kiến trúc hiện tại kèm các lỗi 1/2/3 |
| **B** | Tạo `feat/prompt-engine-v2` rồi commit 17 file này làm commit đầu **trên branch** | `main` không đổi; branch có một commit nền lớn |
| **C** | `git stash` phần chưa commit, branch từ `main` sạch | **Rủi ro cao**: `main` sẽ thiếu `OpticalCompiler`/`CinematographyLayer`… nên pipeline hiện tại sẽ không build. **Tôi không khuyến nghị** |

Tôi khuyến nghị **B** — `main` không bị chạm, và nếu v2 bị bỏ thì branch bỏ theo.

### 2. Một xác nhận về đảo chiều kiến trúc

Kiến trúc đích cấm mọi thuật ngữ kỹ thuật và mọi con số (%, mm, Kelvin, tỷ lệ sáng). Điều đó có nghĩa `CinematographyLayer`, `FinishLayer` và phần số của `AssetProfile` — xây xong 2 ngày trước theo chỉ đạo trước đó — **không tham gia v2**. Tôi đồng ý với quyết định này (anh có bằng chứng ảnh thật; tôi chỉ có giả thuyết chưa kiểm). Tôi chỉ cần anh xác nhận rằng **giữ chúng cho v1 + đánh dấu deprecated-for-v2** là đúng ý, chứ không phải xóa (nguyên tắc 5 cấm xóa trong lượt này).

---

**Trạng thái:** Giai đoạn 0 hoàn tất. Chưa tạo branch, chưa commit, chưa sửa một dòng code nào. `AUDIT_REPORT.md` là file duy nhất được tạo. Đang chờ anh trả lời 2 câu trên để bắt đầu Giai đoạn 1.
