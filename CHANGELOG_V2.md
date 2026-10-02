# CHANGELOG_V2 — Prompt Engine v2

Branch `feat/prompt-engine-v2`, tag `pre-v2-baseline` at the state before any of it.
**Default is still v1. Nothing was deleted. Nothing was pushed, merged or deployed.**

---

## 1. Cách bật, chạy và quay lại

```bash
# bật v2 (mặc định là v1 nếu không đặt biến)
PROMPT_ENGINE=v2

# A/B chữ trên nhãn sản phẩm (mặc định bật)
V2_INCLUDE_LABEL_TEXT=false

# tripwire so nhãn sau render (mặc định tắt, miễn phí khi bật)
V2_LABEL_CHECK=true
```

```bash
cd tido-ai-video-factory-claude-code-pack/apps/web

npm test                                                      # 53 suite, dừng ở lỗi đầu
npx tsx lib/image-engine/run-all-tests.ts --keep-going         # chạy hết 53 suite (để đo baseline)
npm run typecheck

npx tsx lib/image-engine/run-prompt-v2-eval.ts                 # eval mock, 23 brief, 0đ
npx tsx lib/image-engine/run-prompt-v2-eval.ts --label-text=off # A/B nhãn
npx tsx lib/image-engine/run-prompt-v2-eval.ts --case=centella_pair_poster_1x1_326chars --show

npx tsx --env-file=.env.local lib/image-engine/run-prompt-v2-eval-live.ts   # IN HOÁ ĐƠN, không gọi gì
# chỉ khi anh đồng ý tốn tiền:
npx tsx --env-file=.env.local lib/image-engine/run-prompt-v2-eval-live.ts --yes-i-approve-spending

npx tsx lib/image-engine/run-prompt-engine-golden-tests.ts --update  # cập nhật golden, CÓ Ý THỨC
```

**Rollback.** Ba mức, từ nhẹ đến dứt khoát:

1. Bỏ biến `PROMPT_ENGINE` → v1 ngay, không cần deploy code.
2. `git revert <commit>` — mỗi commit độc lập, revert được riêng.
3. `git checkout pre-v2-baseline` — về đúng trạng thái trước toàn bộ việc này.

Ảnh và prompt do eval sinh ra nằm ở `lib/image-engine/prompt-v2/eval/out/` và
`eval/live/<timestamp>/`, đều gitignored.

---

## 2. Danh sách commit

| # | Commit | Nội dung |
|---|---|---|
| 1 | `ba79564` | `chore(v2)`: commit nền — trạng thái bắt đầu + `AUDIT_REPORT.md`. Không commit gì trong `scratch/` |
| 2 | `b0b4a42` | `test(baseline)`: `--keep-going` cho runner, để đo được hết 51 suite |
| 3 | `a8b1c56` | `test(v1)`: golden 3 fixture cho prompt thật sự gửi đi |
| 4 | `d1c1dbe` | `feat(flag)`: `PROMPT_ENGINE` selector, mặc định v1 |
| 5 | `f7aaf8f` | `feat(v2)`: creative spec, 5×3 playbook, linter + 25 test offline |
| 6 | `8e69f0b` | `fix(v1)`: lỗi nhân 100 ở share sản phẩm, + test, + golden cập nhật có ý thức |
| 7 | `53a2a28` | `feat(v2)`: creative director call + build (1 call, 1 repair, rồi fallback) |
| 8 | `bbaf551` | `feat(v2)`: đấu dây sau flag; ẩn nút "ý tưởng hóa" khi v2; cổng copy so `copy_final` |
| 9 | `2972b26` | `test(v2)`: eval 23 brief, v1 vs v2, mock mặc định |
| 10 | `077284c` | `feat(v2)`: script eval thật (chưa chạy) + tripwire so nhãn sản phẩm |

---

## 3. Test / lint / typecheck so với BASELINE

| | BASELINE (trước) | SAU | |
|---|---|---|---|
| suite | 51/51 · **1546 passed, 6 failed** | 53/53 · **1590 passed, 6 failed** | +2 suite, +44 test, **cùng 6 lỗi** |
| suite lỗi | `visual-controls-integration`, `content-message`, `vision-loop`, `creative-director` | **y nguyên 4 suite đó** | không thêm, không bớt |
| typecheck | 4 lỗi, **toàn bộ trong `scratch/` untracked** | 4 lỗi, cùng chỗ | không đổi |
| lint | 1332 problems (1120 errors) | không đổi (không sửa lint trong lượt này) | |

**Quy thuộc 6 lỗi baseline** (không sửa, theo chỉ dẫn 12):

| Suite | Lỗi | Nguyên nhân |
|---|---|---|
| `run-visual-controls-integration-tests:102` | 1 | assertion về **thứ tự dòng trong file UI** — hệ quả rework frontend |
| `run-content-message-tests` | 2 | cùng loại: thứ tự dòng trong `CreativeBriefPanel.tsx` |
| `run-vision-loop-tests:437` | 1 | grep nguồn đòi `ExperimentPipeline.ts` **không chứa** chữ `reviewRender`; nó có trong một dòng log của RenderTracer. Có trước |
| `run-creative-director-tests` | 2 | 1 lỗi có trước (grep đường director); **1 lỗi là của tôi**: nó đòi `ExperimentPipeline.ts` chứa nguyên văn `const finalPrompt = directive ? ...`, và dòng đó đã thành `const finalPrompt = v2?.ok ? ... : optical ? ...` khi đấu dây one-pass |

Lỗi cuối là một assertion grep-nguồn trên một dòng đã đổi hợp lệ. Sửa nó là sửa test
của v1, nằm ngoài phạm vi chỉ dẫn 7 ("không sửa gì khác của v1"), nên tôi **ghi lại
chứ không sửa**.

---

## 4. Số lần gọi LLM mỗi job: v1 vs v2

| | v1 | v2 |
|---|---|---|
| Marketing Brain | 1 | — |
| Creative Director judgment | 1 | — |
| Creative Blueprint | 1 | — |
| Vision review (sau render) | 1 | 1 (giữ nguyên, không thuộc v2) |
| Nút "ý tưởng hóa" (nếu user bấm) | +1 | ẩn khi v2 |
| **Creative Director v2** | — | **1** (+1 nếu linter từ chối lần đầu) |
| **Tổng trên đường tạo prompt** | **~4.9 đo được** trên benchmark 12 case | **1.00 đo được** trên eval 23 case (mock) |

Token ước tính cho call v2: ~1.500 token vào + 600–900 token ra, **cộng ảnh sản phẩm**.
Giá mỗi token phụ thuộc tài khoản của anh — script **không đoán**, chỉ in số call.

Render: không đổi, 1 ảnh mỗi job (+1 nếu vòng vision quyết định render lại).

---

## 5. Đã đổi gì

### Mới (không chạm v1)
- `lib/image-engine/prompt-v2/` — `engine-selector`, `spec`, `playbooks`, `linter`,
  `director`, `build`, `label-check`, `golden-fixtures`, `eval/cases`.
- `run-prompt-engine-golden-tests.ts`, `run-prompt-engine-v2-tests.ts`,
  `run-prompt-v2-eval.ts`, `run-prompt-v2-eval-live.ts`.

### Đã chạm vào code đang chạy
| File | Thay đổi | Rủi ro |
|---|---|---|
| `evolution/ExperimentPipeline.ts` | thêm tham số `v2For`, builder lazy, `attachV2`; `finalPrompt` ưu tiên v2 khi `ok` | **Không chạy gì khi `PROMPT_ENGINE` không phải `v2`**: `v2For` là `undefined`, `v2` là `null`, nhánh prompt giống hệt trước (golden chứng minh) |
| `evolution/VisionReviewLayer.ts` | cổng copy so `promptV2.copy_final` **khi có** | Không có trên mọi render v1 → đọc request y như cũ |
| `evolution/PipelineRouter.ts` | tripwire nhãn sau `reviewRender`, trong `try/catch` | Chỉ chạy khi `V2_LABEL_CHECK=true`; lỗi trong nó không làm fail render |
| `app/api/image/concept-professionalize/route.ts` | thêm `GET` trả `{available}` | Thêm, không đổi `POST` |
| `features/.../CreativeBriefPanel.tsx` | hỏi `GET` một lần, `hidden` khối nút khi v2 | Với v1 `available: true` → UI y như cũ |
| `experiment/OpticalCompiler.ts`, `experiment/CinematographyLayer.ts` | **sửa lỗi nhân 100** | Đổi hành vi v1 **có chủ đích**, golden diff ghi trong commit `8e69f0b` |
| `compiler/linter`-adjacent: không chạm | — | — |
| `run-all-tests.ts` | `--keep-going` + 2 suite mới | Mặc định giữ hành vi cũ |

### Giữ nguyên, đánh dấu deprecated-for-v2 (chỉ dẫn 2)
`CinematographyLayer.ts`, `FinishLayer.ts`, và phần số của `AssetProfile.ts`
**vẫn là đường v1 và vẫn chạy mặc định**. Chúng không tham gia v2 vì kiến trúc đích
cấm mọi thông số kỹ thuật trong prompt.

> **Lý do là một GIẢ THUYẾT MẠNH, chưa phải kết luận đã chứng minh.** Quan sát của
> anh trên ảnh thật cho thấy các con số (`4/255`, `haze 7%`, `key:fill 4:1`,
> `luminance 51%`, `specular ≤8%`) không tạo ra khác biệt mong muốn. Nhưng phép thử
> đối chứng L2-vs-L3 (cùng brief, chỉ đổi Block 4/5 giữa mô tả và thông số) **chưa
> được chạy** — nó bị đưa ra khỏi phạm vi. Nên câu đúng là: *bằng chứng quan sát
> được đủ mạnh để đổi hướng, chưa đủ để nói là đã chứng minh.*

---

## 6. Rủi ro còn lại

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| 1 | **Chất lượng prompt v2 thật chưa ai thấy.** Eval mock chỉ đo bộ khung (playbook, linter, copy policy, fallback), không đo model | **cao** | Chạy `run-prompt-v2-eval-live.ts` (24 render, ~2400 VND) và xem bằng mắt |
| 2 | `ExactCopyIntegrityValidator.validate` trong compiler **vẫn so copy gốc với compiled prompt của v1** (`MasterPromptCompilerService.ts:1122`). Trên đường v2 nó vẫn chạy và vẫn pass, vì compiled prompt của v1 vẫn được dựng trước đó — nhưng nó đang bảo vệ một chuỗi **không còn được gửi đi** | trung bình | Cổng sau render (`checkRenderedText`) đã so `copy_final`. Nếu muốn gọn, bỏ hẳn bước compile v1 trên đường v2 — là một thay đổi lớn hơn, chưa làm |
| 3 | `copy_policy: adapt` để **model** rút gọn copy. Model có thể rút sai nghĩa hoặc sai dấu | trung bình | Warning trong `promptV2.warnings` + `copy_original` lưu kèm; linter kiểm NFC và "mỗi chuỗi đúng một lần", nhưng **không** kiểm nghĩa |
| 4 | Linter là regex. Một prompt lách được nó vẫn có thể dở | trung bình | 38 test cố định các ca đã quan sát; thêm ca khi thấy ca mới |
| 5 | Tripwire nhãn dựa vào vision model tự liệt kê chữ → false mismatch nếu nó đọc sai | thấp | `confidence: "none"` khi không có quan sát; mặc định tắt |
| 6 | 4 suite đỏ sẵn (6 test) che mất hồi quy tương lai ở chính 4 suite đó | trung bình | `--keep-going` để thấy hết; sửa 4 assertion đó là một lượt riêng |
| 7 | v2 chưa đi qua `ProviderPromptOptimizer`/`PromptBudgetManager`, nên nếu model trả prompt dài bất thường thì chỉ linter chặn (200–500 từ + trần provider) | thấp | Linter chặn trước khi gọi render |

---

## 7. Thứ CÓ THỂ xóa sau, kèm bằng chứng

| Ứng viên | Bằng chứng | Kết luận |
|---|---|---|
| `ConceptProfessionalizerService` + route `concept-professionalize` | consumers: `app/api/image/concept-professionalize/route.ts`, `lib/image-engine/test-concept-professionalizer.ts`, `lib/image-engine/test-inspiration-reference-layer.ts` | **KHÔNG XÓA.** Vẫn là tính năng của v1 (nút hiện khi v1). Xóa được chỉ sau khi v2 thành mặc định **và** UI bỏ nút hẳn |
| `CinematographyLayer`, `FinishLayer`, phần số `AssetProfile` | importers: `OpticalCompiler`, `ExperimentPipeline`, `PromptOwnership`, `CompositionPlan`, `AssetProfile`, 2 suite test | **KHÔNG XÓA.** Là đường v1 đang chạy mặc định |
| Nhánh assembly cũ trong `wrapProvider` (`withBlueprint`, `directive`) | là fallback của cả v2 và chế độ editable | **KHÔNG XÓA** |
| Đường editable post-render (`TIDO_ENABLE_EDITABLE_POST_RENDER`) | chỉ 1 consumer: `ExperimentPipeline.ts`; biến **không có** trong `.env.local` nên đang tắt | **KHÔNG XÓA** — chưa chứng minh được không ai bật nó ở môi trường khác |

Không có mục nào đủ bằng chứng để xóa trong lượt này.

---

## 8. CHƯA XÁC MINH

| # | Điều | Cách xác minh |
|---|---|---|
| 1 | Nano Banana 2 phản ứng thế nào với prompt v2 (văn xuôi, không thông số) so với v1 | `run-prompt-v2-eval-live.ts`, 24 render |
| 2 | Thứ tự ảnh provider nhận **có khớp** "photo N" trong prompt | Provider append theo thứ tự mảng (`ImgStudioImageGenerationProvider.ts:368-384`, key telemetry `images[i:ref]`), và v2 sinh "photo N" từ **cùng mảng đó** (`build.ts` → `products[i].ref_index = i+1`). Khớp **theo cấu trúc**; chưa xác nhận bằng một trace thật |
| 3 | `V2_INCLUDE_LABEL_TEXT` bật hay tắt cho ảnh tốt hơn | eval thật, chạy cả hai chế độ |
| 4 | `copy_policy: adapt` có giữ đúng nghĩa tiếng Việt | đọc `promptV2.copy_final` của vài job thật |
| 5 | Vòng `reviewRender` **có** chạy trên đường one-pass | Chuỗi flag là kết luận: `vision_iteration_v1` nằm trong `CORE_FEATURES` (`feature-flags.ts:446`), gate ở `VisionReviewLayer.ts:254`, gọi ở `PipelineRouter.ts:199`. Chưa xác nhận bằng log của một job thật |
| 6 | Mô hình chi phí token thật của v2 | một job thật, đọc telemetry của `LLMProviderService` |

### Đã xác minh (chỉ dẫn 10)
- **(b) Client LLM nhận được ảnh**: `LLMContentPart` có `image_url`
  (`lib/image-engine/llm/llm-provider.service.ts:5-7`), `LLMChatMessage.content`
  nhận `LLMContentPart[]`. Đã dùng sẵn ở `VisionAnalyzerService` và
  `CreativeQualityJudge`. **Không phải điều kiện dừng.**
- **Tỷ lệ khung**: provider chỉ nhận `1:1`, `9:16`, `16:9`
  (`ImgStudioImageGenerationProvider.ts:96-98`). Playbook v2 chỉ có ba cặp đó, và
  prompt **luôn** kết bằng câu nêu tỷ lệ — v1 **không bao giờ** nêu (23/23 case).
