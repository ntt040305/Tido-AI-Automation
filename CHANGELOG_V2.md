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

npx tsx lib/image-engine/run-prompt-v2-simple-tests.ts          # engine đã đơn giản hoá, 67 test
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
