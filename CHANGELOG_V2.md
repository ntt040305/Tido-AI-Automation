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

# chọn version file meta-prompt / playbook (mặc định v1)
PROMPT_V2_TEMPLATE_VERSION=v1

# khi v2 lỗi: mặc định render bằng v1. "off" để lỗi hiện ra thay vì bị che
V2_FALLBACK=off

# copy của khách: exact (mặc định, KHÔNG BAO GIỜ cắt) | adapt_when_over_budget (hành vi cũ)
V2_COPY_POLICY=exact

# model riêng cho call viết prompt (mặc định: model hiện tại của provider)
V2_DIRECTOR_MODEL=

# đọc lại file template mỗi job — bật khi đang sửa meta-prompt
V2_TEMPLATE_RELOAD=true
```

```bash
cd tido-ai-video-factory-claude-code-pack/apps/web

npm test                                                      # 54 suite, dừng ở lỗi đầu
npx tsx lib/image-engine/run-all-tests.ts --keep-going         # chạy hết 54 suite (để đo baseline)
npm run typecheck

npx tsx lib/image-engine/run-prompt-v2-eval.ts                 # eval mock, 23 brief, 0đ
npx tsx lib/image-engine/run-prompt-v2-eval.ts --label-text=off # A/B nhãn
npx tsx lib/image-engine/run-prompt-v2-eval.ts --case=centella_pair_poster_1x1_326chars --show

npx tsx --env-file=.env.local lib/image-engine/run-prompt-v2-eval-live.ts   # IN HOÁ ĐƠN, không gọi gì
# chỉ khi anh đồng ý tốn tiền:
npx tsx --env-file=.env.local lib/image-engine/run-prompt-v2-eval-live.ts --yes-i-approve-spending

npx tsx lib/image-engine/run-prompt-v2-simple-tests.ts          # engine đã đơn giản hoá, 103 test
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

---

## 9. Đơn giản hoá engine v2 (lượt này)

Workflow bây giờ đúng bốn bước: **gom input nguyên văn → 1 call LLM với meta-prompt
(kèm ảnh sản phẩm) → 3 kiểm tra bằng code → gửi Nano Banana 2.** Tối đa **1 lần sửa**,
sau đó dừng và báo lỗi (hoặc render bằng v1 nếu `V2_FALLBACK` còn bật — mặc định bật).

### Meta-prompt và playbook là FILE, không phải code

```
lib/image-engine/prompt-v2/templates/
  meta-prompt.v1.txt
  playbooks/{poster,banner,social,hero,ugc}.v1.txt
```

- Sửa nội dung = sửa file `.txt`. Không đổi code, không build, không deploy.
- Chỗ chèn playbook vào meta-prompt là `{{PLAYBOOK}}`. **Nội dung cuối cùng do anh
  cung cấp** — bản v1 hiện tại là bản nháp để bộ khung chạy được và test được.
- Version nằm trong tên file. Bản mới = file mới (`meta-prompt.v2.txt` + 5 playbook
  `*.v2.txt`), `PROMPT_V2_TEMPLATE_VERSION=v2` để đổi, **file cũ vẫn còn trên đĩa và
  vẫn chạy được**. Version dùng cho mỗi lần build được ghi vào telemetry.
- Slot chưa điền thì **throw**, không im lặng thành chuỗi rỗng. Đây đúng là cách
  `BUSINESS GOAL: in beauty_skincare` từng lọt vào một render thật.
- Một chuỗi version không đúng dạng `vN` bị bỏ qua (nó là một phần tên file).

### Output dùng thẻ, không dùng JSON

`<plan>` `<copy_final>` `<warnings>` `<image_prompt>` — parser trong `tags.ts` chịu
được: fence bọc cả câu trả lời, chữ thừa trước/sau thẻ, thẻ **không đóng**, thẻ sai
thứ tự, thẻ rỗng, thuộc tính trên thẻ mở. Chữ ngoài thẻ được **báo lại** (`stray`)
chứ không bị dùng làm nội dung.

Một điều parser **không** làm: tự bịa `<image_prompt>` khi thiếu. Đó là trường hợp
duy nhất không có giá trị mặc định hợp lý, và bịa ra nó sẽ biến một call thất bại
thành một render sai đầy tự tin.

### Đúng 3 kiểm tra

| Code | Kiểm gì |
|---|---|
| `copy` | `exact`: `copy_final` khớp copy gốc **từng ký tự** (so sau NFC). Cả hai policy: mỗi chuỗi cuối xuất hiện trong prompt **đúng 1 lần** |
| `ratio` | prompt có nêu đúng tỷ lệ user chọn, và **không** nêu tỷ lệ khác |
| `shape` | 200–500 từ, dưới trần ký tự của provider, không có từ cấm, không có thông số kỹ thuật |

`shape` quét **sau khi** đã bỏ: chuỗi trong ngoặc kép, các chuỗi copy, và tỷ lệ đã
khai báo. `"Giảm 50% — chỉ 14 ngày"` là headline, không phải thông số. Danh sách từ
cấm là **một mảng duy nhất** trong `checks.ts`, và được chèn vào meta-prompt — model
được cho biết chính xác cái gì sẽ loại nó.

11 rule của linter cũ → 3. Chín rule trong số đó mô tả **cùng một lỗi** (prompt viết
bằng thông số thay vì bằng hình ảnh); hai rule còn lại (placeholder, `…`) là triệu
chứng của việc *template ghép chuỗi*, không còn template nữa.

### Ba lỗi thật mà test tìm ra

| Lỗi | Hậu quả | Chỗ sửa |
|---|---|---|
| `ISO\s?\d` + `\b` ở cuối cả nhóm alternation | **mọi ISO ba chữ số lọt qua**: `\b` sau `4` đòi ký tự không-phải-chữ, nhưng sau nó là `0` | `checks.ts` — mỗi nhánh tự mang boundary của nó |
| `\b100%\b` | `%` không phải word char nên `\b` đòi một chữ cái phía sau → **"Hết mụn 100%" không bị báo** | `build-simple.ts` `claimWarnings` |
| `"two stops"` không có chữ số | thuật ngữ phơi sáng viết bằng chữ lọt qua | thêm nhánh `(one|two|…|half)\s+stops?` |

Cả ba là lỗi của tôi, test tìm ra trước khi báo cáo, không phải sau.

### Đã chạm vào code đang chạy

| File | Thay đổi | Rủi ro |
|---|---|---|
| `evolution/ExperimentPipeline.ts` | `v2For` gọi `buildSimplePrompt` thay `buildV2Prompt`; `capturedV2`/`attachV2` nhận `SimpleResult`; log dùng `simpleTelemetry` | **Không chạy gì khi `PROMPT_ENGINE` ≠ `v2`** — `v2For` vẫn là `undefined`, nhánh prompt y nguyên |
| `prompt-v2/engine-selector.ts` | thêm `fallbackToV1()` (`V2_FALLBACK`, mặc định bật) | Mặc định = hành vi cũ |
| `run-all-tests.ts` | thêm suite `run-prompt-v2-simple-tests` | Mặc định giữ hành vi cũ |

### Mất một thứ, và nói rõ là mất

`promptV2.labels` bây giờ **rỗng** trên đường đã đơn giản hoá. Model trả 4 thẻ và
không thẻ nào là danh sách chữ-trên-nhãn từng sản phẩm. Tripwire so nhãn
(`V2_LABEL_CHECK`, **mặc định tắt**) đọc trường này; với mảng rỗng nó **không có gì
để so** — nó không báo sai lệch giả. Lấy lại được bằng một thẻ thứ 5, nhưng anh chốt
đúng 4 thẻ, nên tôi ghi lại chứ không tự thêm.

### Giữ nguyên, đánh dấu SUPERSEDED — không xóa

| File | Thay bởi | Bằng chứng không còn ai gọi từ production |
|---|---|---|
| `spec.ts` | `tags.ts` + `checks.ts` | `grep -rn "prompt-v2/spec" --include=*.ts lib app` → chỉ `build.ts`, `run-prompt-engine-v2-tests.ts` |
| `director.ts` | `templates/meta-prompt.v1.txt` + `build-simple.ts` | → chỉ `build.ts`, `run-prompt-engine-v2-tests.ts`, `run-prompt-v2-eval.ts` |
| `linter.ts` | `checks.ts` | → chỉ `build.ts`, 2 runner test/eval |
| `build.ts` | `build-simple.ts` | → chỉ `run-prompt-engine-v2-tests.ts`, `run-prompt-v2-eval.ts`, `run-prompt-v2-eval-live.ts` |
| `playbooks.ts` | `templates/playbooks/*.v1.txt` | → chỉ `build.ts`, `director.ts`, `linter.ts`, 2 runner |

`ExperimentPipeline.ts` giờ import `build-simple` và `templates`, **không** import
`build` hay `playbooks` nữa. Mỗi file trên có một khối header ghi rõ lý do giữ: eval
so hai engine trên cùng bộ brief, và đường JSON là chỗ quay về **nếu** đường thẻ tệ
hơn trên ảnh thật — điều **chưa ai đo**. Xóa trước khi đo là bỏ mất phép so sánh.

`label-check.ts`, `engine-selector.ts`, `golden-fixtures.ts`: **vẫn đang dùng**.

### Test / typecheck

| | Trước lượt này | Sau |
|---|---|---|
| suite | 53/53 · **1590 passed, 6 failed** | 54/54 · **1657 passed, 6 failed** |
| suite lỗi | 4 suite nói ở mục 3 | **y nguyên 4 suite đó, y nguyên 6 test** |
| typecheck | 4 lỗi, toàn bộ trong `scratch/` | 4 lỗi, cùng chỗ, cùng nội dung |

Suite mới `run-prompt-v2-simple-tests`: **67 test, 0 lỗi** — template (8), copy policy
(7), parser (11), 3 kiểm tra (16), build + 1 repair (14), telemetry (4), flag (1) và
các ca còn lại. Không ca nào gọi API; mọi câu trả lời của model là fixture viết tay.
Suite cũ `run-prompt-engine-v2-tests` vẫn **38/38** — đường JSON vẫn xanh.

### Còn lại chưa làm (chưa duyệt)

1. **Nội dung thật của meta-prompt và 5 playbook** — anh nói sẽ cung cấp.
2. **Eval chưa trỏ sang đường mới** — `run-prompt-v2-eval*.ts` vẫn đo đường JSON.
3. **Chưa có render nào qua engine này.** Chất lượng prompt thật vẫn **CHƯA XÁC MINH**,
   kể cả khung 200–500 từ có đúng hay không.
4. **Mặc định vẫn là `v1`.** Không đổi cho đến khi anh duyệt.

---

## 10. Copy là của khách, logo không được rơi (lượt này)

### A. Mặc định `exact` — KHÔNG tự rút gọn

Lỗi đã đo được: một render trả về với **câu của khách bị xóa**. `decidePolicy` thấy copy
vượt ngân sách của playbook, **tự** chuyển sang `adapt`, model cắt. Rồi cổng hậu-render
đọc `copy_final` — tức **bản đã cắt** — so ảnh với bản đó, và báo `compliant: true`.
Khách gõ một thứ, nhận một thứ ngắn hơn, và **mọi tín hiệu trong hệ thống nói là đúng**.

| Biến | Giá trị | Hành vi |
|---|---|---|
| `V2_COPY_POLICY` | `exact` **(mặc định)** | ngân sách chữ của playbook **không còn là lý do để cắt**. Copy dài là vấn đề bố cục |
| | `adapt_when_over_budget` | hành vi cũ, phải tự bật |

Log ghi rõ nguồn: `copy_policy=exact(default)` hay `exact(env)`. Một biến gõ sai thì về
policy **không** chạm vào copy, không phải policy chạm vào.

`system.v1.md` thêm khối **COPY RULES**: từng ký tự theo đúng thứ tự gốc, chỉ được chia
tier ở ranh giới câu/mệnh đề, không bịa CTA, và *"long copy is a layout problem, not a
reason to cut"*. Bước 4 của HOW YOU WORK đổi từ "quyết định text" thành "quyết định cách
**chia tier và set** text".

`request.v1.md` thay dòng ngân sách bằng **đo lường**: `- Text: N words, N sentences, N
characters.` Trên 25 từ thì thêm hình học theo từng tỷ lệ để dành tới nửa khung cho chữ.
Ngân sách là lý do để xóa; đo lường là lý do để thiết kế.

`measureCopy` tính mỗi dòng khách gõ là một câu khi không có dấu kết thúc — đó là cách
gần như mọi brief tiếng Việt được viết, và đếm 0 câu sẽ sai ở ca phổ biến nhất.

### B. Kiểm tra copy: so **toàn văn**, và bắt chuỗi bịa

Kiểm tra cũ hỏi "mọi chuỗi trong `copy_final` có nằm trong copy gốc không" — **một reply
xóa cả một câu vẫn qua**, vì những câu nó giữ đều có mặt. Nối lại là phép so duy nhất bắt
được **thiếu, đảo thứ tự và thêm** cùng lúc: các tier ghép lại phải **bằng** copy gốc sau
NFC + gộp khoảng trắng.

Chỉ nới khoảng trắng và NFC. Dấu câu, chữ hoa/thường, số, dấu thanh đều phải sống sót.
Chỗ **cắt tier ở đâu** là quyết định bố cục, kiểm tra không can thiệp — test chứng minh
một lát cắt giữa mệnh đề vẫn được chấp nhận nếu ghép lại đúng.

Thông báo lỗi nói **lệch chiều nào**: *"the end was cut: the client's text continues ..."*

**Chuỗi bịa:** mọi chuỗi trong ngoặc kép của `<image_prompt>` phải là một lát cắt của
copy gốc. Đây là kiểm tra bắt `"MUA NGAY"` — một CTA không ai viết, đọc vào tưởng là chủ ý.

Nhưng nó **xung đột** với `system.v1.md`, vốn bảo director trích chữ in trên nhãn. Nên
prompt sẽ hợp pháp chứa chữ khách không gõ, và **repo không có danh sách chữ nhãn nào**
để đối chiếu (`promptV2.labels` rỗng trên đường này). Không giả vờ là có: khi
`V2_INCLUDE_LABEL_TEXT` bật, một chuỗi lạ chỉ **FAIL khi câu chứa nó không gắn với bề mặt
sản phẩm**. Nhãn được trích thì qua; CTA lơ lửng thì không. Test cả hai chiều.

**`adapt` giữ lại các con số:** mọi dãy chữ số và mọi token VIẾT HOA / mã sản phẩm —
`500`, `100`, `K70`, `XXL` — phải còn. Đó đúng là thứ một cái máy rút gọn bỏ trước nhất.

**Cổng hậu-render đọc lại copy GỐC.** `VisionReviewLayer` chỉ thay bằng `copy_final` khi
policy thật sự là `adapt`. Đọc nó vô điều kiện chính là nửa sau của lỗi cắt-âm-thầm.

### C. Logo không được rơi

v2 **lọc** ảnh xuống chỉ còn role PRODUCT trước khi gửi cho director. Một logo người dùng
cung cấp vì thế đến **renderer** dưới dạng ảnh đính kèm, trong khi prompt nói *"no extra
logos or brand marks"* — nên **chỉ dẫn duy nhất nhắc tới logo lại bảo model bỏ nó đi**.

Giờ mọi ảnh đều đi, đúng thứ tự provider nhận, kèm role và tên file:

```
references (photos attached in this order):
  photo 1: PRODUCT (Corsair-Keyboard.jpg)
  photo 2: LOGO (Corsair-logo.png)
```

`system.v1.md` thêm **REFERENCE ROLES**. Luật cuối prompt đổi từ *"no extra logos or brand
marks"* thành *"no logos or brand marks **other than the supplied logo photo** and what is
printed on the products"* — câu cũ cấm đúng cái thứ khách vừa đưa.

### D. Quan sát được

```
[PROMPT_V2][version] system=system.v1.md@a1b2c3d4 request=request.v1.md@e5f6a7b8
                     playbook=poster@1:1 gold=poster.md copy_policy=exact(default)
                     refs_sent_to_director=[PRODUCT,LOGO]
[PROMPT_V2][assumption] ...   (tối đa 8 dòng, rút gọn)
[PROMPT_V2][plan] ...         (tối đa 8 dòng, rút gọn)
[PROMPT_V2][warning] ...
```

Có **sha256 8 ký tự của nội dung file**, nên nó trả lời được cả khi ai đó sửa template tại
chỗ mà không bump version.

**File template được cache theo process** (`read()` trong `templates.ts`). Đúng cho server,
sai cho một buổi chiều sửa meta-prompt: không có cache-bust thì sửa file phải restart mới
có tác dụng. `V2_TEMPLATE_RELOAD=true` để đọc lại mỗi job.

### E. Input v1 nhận mà v2 VẪN chưa nhận

| Trường | `types.ts` | Ghi chú |
|---|---|---|
| `brandInfo` | 1168 | mô tả brand; chỉ tên brand được gửi |
| `marketingContext.*` | 1174–1179 | `request.v1.md` bảo director **suy ra** audience/occasion/offer. Nếu khách đã khai `target_audience` thật thì ta đang bảo nó đi đoán |
| `salesContext.*` | 1191–1196 | product_name, offer_text, benefit, cta_text. **CHƯA XÁC MINH** UI có điền |
| `inspirationStyleManifest` | 1197 | đọc style từ ảnh tham chiếu |
| `copyItems[].role` | 1170 | **cố ý** gộp thành chuỗi phẳng — director tự gán role |
| `description` từng ảnh | — | **cố ý** — director đọc sản phẩm từ ảnh |

### F. CHƯA XÁC MINH

1. **Chưa render lần nào** với bộ sửa này. Không gọi API trả phí.
2. Heuristic `readsAsLabel` (câu có nhắc label/bottle/printed...) chưa đo trên prompt thật
   — có thể vẫn bắt oan chữ nhãn, hoặc tha một CTA được mô tả cạnh sản phẩm.
3. `salesContext` / `marketingContext` có dữ liệu thật hay không.
4. Model nào tốt cho `V2_DIRECTOR_MODEL`.
