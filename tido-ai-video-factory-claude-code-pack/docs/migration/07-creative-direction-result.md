# 07 — Creative direction: what was built

Implements Option 2 of `docs/migration/06-creative-direction-analysis.md`.
Branch `feat/gpt-image-migration`. No image or LLM API was called; no paid eval was run.

**Step 1 is complete. Step 2 did not start: the gate fails.** See §6.

---

## Contents

1. [Baseline, recorded before anything changed](#1-baseline-recorded-before-anything-changed)
2. [What Step 1 changed](#2-what-step-1-changed)
3. [The inference rules, as built](#3-the-inference-rules-as-built)
4. [Numbers chosen, and where they come from](#4-numbers-chosen-and-where-they-come-from)
5. [Deviations from the task](#5-deviations-from-the-task)
6. [The gate: Step 2 is blocked](#6-the-gate-step-2-is-blocked)
7. [Known limits, and what is still unverified](#7-known-limits-and-what-is-still-unverified)

---

## 1. Baseline, recorded before anything changed

Measured at `854cb75`, before the first edit. The migration had added commits since the
last recorded numbers, so this is a fresh baseline, not the one in `02-plan.md`.

| | Baseline (`854cb75`) | After Step 1 (`4e6f2fa`) | |
|---|---|---|---|
| Test suites | 55 | **56** | +1 (the new suite) |
| Tests passed | 1,702 | **1,750** | **+48** |
| Tests failed | **6** | **6** | unchanged |
| Failing suites | 4 | 4 | the same four |
| `tsc --noEmit` errors | **4** | **4** | unchanged |
| `eslint .` problems | **1,339** (1,123 errors, 216 warnings) | **1,339** (1,123 / 216) | unchanged |

All 4 tsc errors are in `scratch/` — 2 in `scratch/test_healthy_trace.ts`, 2 in
`scratch/trace_pipeline_synthesis.ts`. None in app code.

### The 6 pre-existing failures, and why each fails

Recorded because three of them assert on the very file this task edits, so they had to be
understood before inserting anything. **All six are stale string assertions, not behaviour
failures**, and all six predate this work. None was fixed: fixing them means changing what a
test expects, which is a separate decision.

| Suite | Test | Cause |
|---|---|---|
| `run-visual-controls-integration-tests` | "The panel sits at the end of the flow, just before Generate" | looks for the comment `{/* Submit CTA */}`; the panel says `{/* 8. Submit CTA */}`, so the index is −1 |
| `run-content-message-tests` | "The field is rendered in the real brief panel" | looks for the label "Nội dung muốn xuất hiện trên ảnh"; the panel now says "NỘI DUNG CHỮ TRÊN ẢNH (CONTENT MESSAGE)" |
| `run-content-message-tests` | "It sits above the visual direction panel" | same missing label, so the ordering comparison runs on −1 |
| `run-vision-loop-tests` | 1 test | pre-existing, not in a file this task touches |
| `run-creative-director-tests` | "both director paths evaluate before anything renders" | pre-existing, from the migration |
| `run-creative-director-tests` | "the experiment prompt appends the directive last, after the blueprint" | pre-existing, from the migration |

The two ordering assertions still hold on the real order after the insertion: the new
control and the campaign-context block sit between the concept and the content message, so
`VisualDirectionControlPanel` is still after `BrandIdentityUploader` and still before the
submit button.

---

## 2. What Step 1 changed

Three commits, each green at the point it was made.

| Commit | What |
|---|---|
| `985bd6f` | the pure inference function, and one additive export on the tone detector |
| `dfcf678` | the field, its zod enum, the client's serialisation, and the `intent.tone` read |
| `4e6f2fa` | the control, the mount, 48 tests, suite registration |

### Files

| File | Change |
|---|---|
| `lib/image-engine/director/CreativeApproach.ts` | **new.** The pure function, the level/source types, the Vietnamese labels, hints, source labels and the two adjustment messages |
| `lib/image-engine/director/ConceptStructuringLayer.ts` | **+1 export**, `tonesIn`. `parse()` untouched |
| `features/picture-engine/components/brief/CreativeApproachControl.tsx` | **new.** The control |
| `features/picture-engine/components/brief/MarketingContextForm.tsx` | `fields` and `showHeader` props; conditional rendering; an empty option on both selects |
| `features/picture-engine/components/brief/CreativeBriefPanel.tsx` | mounts both; derives `contentMessageLines` |
| `features/picture-engine/types/picture-engine.types.ts` | `creative_approach?: ApproachChoice` on `CreativeDirection` |
| `features/picture-engine/schemas/creative-brief.schema.ts` | the optional zod enum |
| `features/picture-engine/services/picture-engine.api.ts` | `creative_approach` in the serialisation allow-list |
| `lib/image-engine/service/SimpleInputAdapterService.ts` | logs `intent.tone` instead of discarding it |
| `lib/image-engine/run-creative-approach-tests.ts` | **new.** 48 tests |
| `lib/image-engine/run-all-tests.ts` | registers the suite |

**Not touched:** every engine and prompt file. `ExperimentPipeline.ts`,
`marketing-brain.service.ts`, `AssetContext.ts` and `DirectionEvaluator.ts` are unchanged,
and a test asserts that none of them so much as names the level
(`run-creative-approach-tests.ts`, "STEP 1 BOUNDARY"). The Gemini-dialect templates are
untouched, and the route shuffle and the evaluator's weights are untouched.

### Backward compatibility

The field is optional and **absent by default** — `defaultCreativeBrief` does not set it, and a
test asserts it never will. Absent and `"auto"` both mean "let the AI decide", and `"auto"` is
dropped client-side before sending, so the two reach the server identically. Saved projects,
Brand Kits and the Phase 4 eval inputs are unchanged. No prompt reads the level yet, so no
golden could move even if it were set.

### What a user sees

Under the concept box, four options defaulting to **Để AI quyết định (mặc định)**, each with
one line of plain Vietnamese. On the default row, the system's own conclusion and the words
it drew it from: *"AI gợi ý: Tối giản & sang trọng — Ý tưởng của bạn nhắc tới "sang trọng" nên
AI chọn Tối giản & sang trọng."* Below that, collapsed, **Bối cảnh chiến dịch (không bắt
buộc)** holding objective and target audience. Neither gates the render button.

When a ceiling or veto fires, an amber row: **AI đã điều chỉnh: Tối giản & sang trọng → Cân
bằng. Nội dung chữ dài nên bố cục không thể tối giản hoàn toàn.** Always shown, including
when it overrules a level the user picked by hand.

---

## 3. The inference rules, as built

`inferCreativeApproach(input)` → `{ level, source, reason_vi, adjustments[] }`. Pure: no I/O,
no clock, no randomness. First match wins.

| # | Signal | Result | Source |
|---|---|---|---|
| 1 | an explicit level | that level | `user_selected` |
| 2 | the concept's tone | `premium`/`minimal` ⇒ restrained · `bold`/`energetic` ⇒ bold | `concept_tone` |
| 3 | Brand Kit `style.preferred`, same detector, same rule | same | `brand_style` |
| 4 | objective `branding` | restrained | `objective` |
| 5 | nothing | balanced | `default` |

Then, always, and including over an explicit choice:

- **Ceiling.** Hero-family asset + bold ⇒ balanced, *"Product Hero cần sản phẩm rõ ràng nên
  mức táo bạo bị giới hạn."*
- **Veto.** Restrained + copy denser than the channel carries ⇒ balanced, *"Nội dung chữ dài
  nên bố cục không thể tối giản hoàn toàn."*

**Mixed groups are no signal.** A brief saying both "sang trọng" and "năng động" has not asked
for restraint or for boldness; it has described a tension only its author can resolve.
Guessing there would reproduce exactly the unexplained route choices this work exists to end,
so the next step in the precedence takes its turn instead. `warm` alone is also no signal: it
says something about temperature, not about how much the frame should dare.

**`promotion`, `conversion` and `awareness` do not move the level.** An offer needs to be clear
and high-contrast, and clarity is not creative boldness; reading promotion as a licence to be
inventive would push the offer off the poster.

**`style.forbidden` is accepted and deliberately ignored.** Reading it positively would invert
its meaning — "forbidden: minimal" would argue *for* restraint — and
`DirectionEvaluator.ts:265-276` already marks a route down for hitting a forbidden style,
which is where a negative constraint belongs. A test pins this.

---

## 4. Numbers chosen, and where they come from

**None were invented**, as required.

### The copy-density threshold

Taken from `AssetProfile`'s existing `max_strings`, asked through its existing
`copyFitsChannel()` (`evolution/experiment/AssetProfile.ts:128-141`) rather than re-derived:

| Family | `max_strings` | Veto fires at | Asset types |
|---|---|---|---|
| poster | **3** | 4 strings | `poster`, `billboard`, and anything unmatched |
| social | **3** | 4 strings | `social_ad`, `ugc_thumbnail` |
| banner | **2** | 3 strings | `banner` |
| hero | **1** | 2 strings | `product_hero` |

A string is one non-blank line of the on-image text. Blank lines are not counted — they are
not strings the renderer has to draw. A test asserts these four numbers are the ones
`AssetProfile` actually declares, so a change there breaks the test rather than silently
moving the veto.

**`AssetProfile` declares no word budget**, so none is assumed. One very long headline is one
string and does not trip the veto. See §7.

### The ceiling

`assetFamilyOf(assetType) === "hero"` (`AssetProfile.ts:96-101`), which is `product_hero`
today and will cover any hero-family type added later. Chosen over a literal
`=== "product_hero"` so the rule follows the existing family mapping rather than a second
list that could drift from it.

---

## 5. Deviations from the task

Five, all stated rather than absorbed.

### D1 — `creative_direction` is **not** serialised whole, so `picture-engine.api.ts` did change

The task said to verify that no api/route change was needed. Verified, and the premise is
half right:

- `app/api/image/generate-simple/route.ts:117-120` parses `creativeDirection` with one
  `JSON.parse`. **No route change was needed**, as expected.
- `features/picture-engine/services/picture-engine.api.ts:93-100` is an explicit **four-key
  allow-list**, not a spread. A field absent from it never leaves the browser. **One line was
  required.** A test now asserts the key is present in that `compact()` call, because this is
  a defect that would have been invisible: the control would have worked, the field would have
  been stored, and nothing would have reached the server.

### D2 — the tone detector was not extracted; it gained one additive export

The task allowed extracting the keyword table *if* importing the detector into the client
bundle pulled heavy dependencies. **It does not** — `ConceptStructuringLayer.ts` has no
imports at all and is already safe for the browser, so extraction would have been churn.

But `intent.tone` could not serve rule 2 as written. `parse()` **breaks on its first tone
match** (`ConceptStructuringLayer.ts:188-195`) and so reports a single tone chosen by table
order: for *"sang trọng nhưng năng động"* it returns `premium` and the conflict is invisible.
The mixed-group rule requires seeing that the brief said both. So the class gained
`tonesIn()`, which reads the **same `TONES` table** a second way and returns every group
present. `parse()` is untouched, and a test asserts its single-tone contract is unchanged.

### D3 — `intent.tone` is read for observability, not as the inference's input

Item 1.5 asked for the `SimpleInputAdapterService.ts:317` read. Done — it is now in the
`[SIMPLE][CONTENT_MESSAGE]` log. Two things to be clear about:

- that call parses **`contentMessage`**, not the concept, so its tone is not the signal rule 2
  wants. The inference reads the **concept**, through `tonesIn`, via the shared table.
- copy-role inference is unchanged, as required.

### D4 — the brief's example phrase for a mixed tone is not in the real keyword table

The task's example was "sang trọng" together with "bùng nổ". **"bùng nổ" matches nothing** in
the real table (`:117-122`); the energetic group's Vietnamese terms are *vui, tươi, năng động,
nổi bật*. Rather than add a keyword — which would change what every existing layer reading
`intent.tone` sees — the mixed-group tests use **"năng động"**. The table is unchanged.

### D5 — `MarketingContextForm` needed two props, and both selects needed an empty option

- A `fields` prop, because the panel has had **its own inline industry selector** since Phase
  4.1 (`CreativeBriefPanel.tsx:71`, rendered at `:196`) and mounting the form whole would have
  put two industry controls on one screen writing to the same field. Excluded fields are not
  rendered at all rather than `hidden`, since a hidden duplicate is still a duplicate in the
  DOM. A test asserts exactly one industry control.
- A `showHeader` prop, because the form's own heading reads "Bước 2: Bối cảnh Marketing" and
  the collapsible supplies the title the task specified.
- **An empty `<option>` on industry and objective.** Not requested, but required for honesty:
  `defaultCreativeBrief` ships both as `""` (`picture-engine.store.ts:90-91`), and a `<select>`
  whose value matches no option displays the **first** one — so the panel would have shown
  "Tăng tỷ lệ Chuyển đổi" to every user who never touched it, and an inferred `objective`
  signal would have looked like a choice they made. A test pins the empty option.

---

## 6. The gate: Step 2 is blocked

**`lib/image-engine/prompt-v2/gpt-brief.ts` does not exist.** Nor does any other Phase 3
artefact. `find lib app -iname "*gpt*"` returns nothing.

Measured against the Phase 3 manifest in `02-plan.md:378-392`:

| Phase 3 artefact | Status |
|---|---|
| `prompt-v2/gpt-brief.ts` | **missing** (task 2.1 binds here) |
| `prompt-v2/gpt-checks.ts` | **missing** |
| `prompt-v2/gpt-fallback.ts` | **missing** |
| `prompt-v2/templates/gpt/system.v1.md` | **missing** (task 2.2's restrained line goes here) |
| `prompt-v2/templates/gpt/request.v1.md` | **missing** (sections G and H live here) |
| `prompt-v2/templates/gpt/playbooks/*.v1.txt` | **missing** (5 files) |
| `prompt-v2/templates/gpt/gold-examples/*.md` | **missing** (10 files, K15) |
| dialect selection in `prompt-v2/engine-selector.ts` | **missing** — the file contains no occurrence of `dialect` or `gpt` |
| a Phase 3 GPT-dialect test suite | **missing** — there is none to run |

`prompt-v2/templates/` today holds only the Gemini dialect: `system.v1.md`, `request.v1.md`,
`meta-prompt.v1.txt`, `playbooks/`, `gold-examples/`. There is no `gpt/` subdirectory.

**So every part of Step 2 is blocked**, because all of it binds into files that do not exist
yet: 2.1 and 2.2 (the brief and the directive text), 2.3 (which must be emitted *only* for the
GPT dialect — and there is no dialect switch to gate it on), 2.4 (resolved controls into
section H), 2.5 and 2.7 (which should carry the level through the same brief), and the GPT
golden suite in TESTS.

Per the instruction — *"If it is missing or Phase 3 is incomplete, STOP after Step 1 and tell
me exactly what is missing. Do not build the GPT brief yourself in this task."* — **nothing in
Step 2 was built.**

### What was deliberately not done as a workaround

Binding the level into the **Gemini** templates would have reached a prompt today. It was not
done: the task restricts Step 2 to the GPT dialect and requires the Gemini path to stay
byte-identical with its golden suite unchanged. One line in the Gemini system template would
have broken exactly that guarantee.

---

## 7. Known limits, and what is still unverified

| # | Limit | Consequence |
|---|---|---|
| L1 | **The browser cannot see Brand Kit `style.preferred`.** The brief carries only `brand_kit_id`; `BrandKitPanel` keeps fetched kits in its own state; the server loads the kit at `route.ts:94`. | For a brand whose kit says "tối giản" and whose concept says nothing, the badge reads *Cân bằng* while the server would infer *restrained*. Everything above brand style — an explicit choice, the concept's own tone — is identical on both sides. The fix is ~6 lines: `BrandKitPanel` lifting the selected kit's style to the panel. Not done, because it was not asked for and the asymmetry is invisible until Step 2 makes the server's inference matter. |
| L2 | **No word budget.** `AssetProfile` declares `max_strings` and no words-per-string figure, so the veto counts strings only. | One 40-word headline on a poster is one string and does not trip the veto. Inventing a word threshold was explicitly out of bounds; if you want one, it should be added to `AssetProfile` where the other budgets live, not to the veto. |
| L3 | **Unaccented Vietnamese does not match.** The table spells its terms with diacritics (`sang\s?trọng`), so "sang trong" matches nothing; the English half (`luxury`, `minimal`, `bold`) still does. | Recorded in a test named "RECORDED BEHAVIOUR" rather than changed, since altering the table changes what every layer reading `intent.tone` sees. Vietnamese users typing without diacritics get no tone signal and fall through to objective or balanced. |
| L4 | **The level reaches no prompt.** By design, this step. | Nothing about a rendered image changes yet. |
| L5 | **UNVERIFIED: whether GPT-Image-2.5-Sunburst honours a restraint directive at all.** | Nothing in the code can answer it. Only the three-level comparison from `06`'s §10 can (~900–1,500 VND), and it was **not run** — you asked to review the directive text first. |
| L6 | **UNVERIFIED: whether a populated audience and objective actually shift the director's route choice.** Plausible, since they are 0.40 of the weight, but unmeasured. | The route shuffle (`AssetContext.ts:127`) remains, as required; whether it should stay once the axes carry information is worth revisiting, out of scope here. |

### Skipped, and why

| Item | Why |
|---|---|
| Step 2, in full (2.1–2.7) | the gate fails — §6 |
| Input-sensitivity test, GPT golden briefs (3 levels × 5 asset types × 3 ratios) | they assert on the GPT brief, which does not exist. The free input-sensitivity test is the first thing to write when Phase 3 lands |
| 2.6, vision-review adherence | depends on the GPT brief, and on Phase 0 task 0.2: `TypographyCritique.ts:302-319` has `worst()` return 10 for an area with no findings, so a failed review still scores 10/10. An adherence score added before that fix would report perfect adherence on every failed call |
| Fixing the 6 pre-existing test failures | out of scope, and each means changing what a test expects. Causes are itemised in §1 |
| Brand tier, emotion keywords, `SalesContextForm` | out of scope by instruction, and `06` recommended against the first two: `style.preferred`/`forbidden` already do that job and are already scored |
| The paid three-level comparison | you asked to review the directive text first |

### The directive text, for your review

Not yet written into any file — it belongs in the GPT request template, which does not exist.
It is specified verbatim in the task (2.2) and in `06` §7.2, and unchanged by anything found
here. One amendment from `06` §7.3 still stands and should land with it: `system.v1.md:20-21`
says *"Reject the most obvious cliché for the category"*, which argues against the restrained
answer, so the GPT system template needs the softening line *"Under a restrained approach, the
simplest composition is a legitimate answer; what must not be generic is the execution"* —
active only under restrained, and in the GPT template only.
