# 07 — Creative direction: what was built

Implements Option 2 of `docs/migration/06-creative-direction-analysis.md`.
Branch `feat/gpt-image-migration`. No image or LLM API was called; no paid eval was run.

**Step 1 is complete. Step 2 did not start: the gate fails.** See §6.
**A fix round followed on 2026-10-07** — six fixes on Step 1, at the end of this document.

---

## Contents

1. [Baseline, recorded before anything changed](#1-baseline-recorded-before-anything-changed)
2. [What Step 1 changed](#2-what-step-1-changed)
3. [The inference rules, as built](#3-the-inference-rules-as-built)
4. [Numbers chosen, and where they come from](#4-numbers-chosen-and-where-they-come-from)
5. [Deviations from the task](#5-deviations-from-the-task)
6. [The gate: Step 2 is blocked](#6-the-gate-step-2-is-blocked)
7. [Known limits, and what is still unverified](#7-known-limits-and-what-is-still-unverified)
8. [Fix round (2026-10-07)](#fix-round-2026-10-07)

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
| `run-vision-loop-tests` | "The review happens once, above both pipelines" | pre-existing; cause established in the Fix round, F6 |
| `run-creative-director-tests` | "both director paths evaluate before anything renders" | pre-existing; **predates** the migration — see Fix round F6 |
| `run-creative-director-tests` | "the experiment prompt appends the directive last, after the blueprint" | pre-existing; introduced by the **earlier v2 one-pass wiring**, not by this migration — see Fix round F6 |

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

> **Superseded in part.** L1, L2 and L3 below were addressed in the Fix round at the end
> of this document; see "Still open after this round" for the current status.

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

---

# Fix round (2026-10-07)

Six fixes on Step 1. **Step 2 was not started: the gate still fails** — `prompt-v2/gpt-brief.ts`
does not exist and no Phase 3 file was created. No image or LLM API was called.

## F0. Numbers for this round

Baseline = the post-Step-1 figures in §1.

| | Step 1 baseline | After the fix round | |
|---|---|---|---|
| Suites | 56 | **57** | +1 (`run-tone-fixture-tests`) |
| Tests passed | 1,750 | **1,785** | **+35** |
| Tests failed | 6 | **3** | **−3** (the three stale assertions) |
| Failing suites | 4 | **2** | `run-vision-loop-tests`, `run-creative-director-tests` |
| `tsc --noEmit` | 4 | **4** | unchanged, all in `scratch/` |
| `eslint .` | 1,339 (1,123 / 216) | **1,339 (1,123 / 216)** | unchanged |

Seven commits, each green when made:

| Commit | Fix |
|---|---|
| `8a8a3c8` | F1 — tone precision (and F4, same module and table) |
| `1936999` | F2 — word-count veto |
| `1d0f709` | F3 — brand style reaches the client |
| `f131ab3` | F5 — vision review fails closed |
| `8a750e3` | F6 — three stale assertions |
| `c417b08` | lint: four `any` casts I had added, removed |

**One procedural note, stated rather than hidden.** My first attempt at `8a8a3c8` staged only the
new files and left the wiring out, so the commit as first written would not have had a green suite.
I amended it rather than leave a broken commit in the history, and split F2 back out so that both
commits are independently green. No other commit was amended, and nothing was pushed, pulled,
rebased, reset or stashed.

---

## F1. Tone precision

### The full TONES table, as it is in the code

Read from `director/ConceptStructuringLayer.ts:117-122`. 27 terms, 5 groups. The Vietnamese terms
are spelled with diacritics in the source; `vn()` wraps each alternation in Unicode-aware
boundaries.

| Group | Terms (verbatim) |
|---|---|
| `premium` | sang trọng · cao cấp · luxury · premium · elegant |
| `energetic` | vui · tươi · năng động · fun · playful · vibrant · nổi bật |
| `minimal` | tối giản · minimal · sạch · clean · đơn giản |
| `bold` | mạnh · bold · ấn tượng · striking · gây chú ý |
| `warm` | ấm áp · thân thiện · warm · friendly · gần gũi |

### The strong/weak split

The principle, applied to all 27: a term decides only when it states a **desired treatment**. It
does not when it is a generic adjective, a product attribute, or a goal the brief would have had
anyway.

**STRONG — 12 terms. These decide.**

| Group | Terms |
|---|---|
| `premium` | sang trọng · luxury · elegant |
| `minimal` | tối giản · đơn giản · minimal |
| `energetic` | năng động · playful · vibrant |
| `bold` | **táo bạo** · bold · striking |

**WEAK — 16 terms, moved out, each with its reason.**

| Term | Group | Why it no longer decides |
|---|---|---|
| cao cấp | premium | product tier, not treatment — it is the form's own placeholder, "Chai serum cao cấp" |
| premium | premium | the English of "cao cấp", used the same way: "premium ingredients", "premium serum" |
| sạch | minimal | product attribute — "da sạch", "sạch mụn", "sạch khuẩn" |
| clean | minimal | the English of "sạch", dominant in beauty as a claim: "clean beauty", "clean formula" |
| vui | energetic | generic adjective, one syllable |
| tươi | energetic | product attribute — "rau má tươi", "tươi mát", "tươi mỗi ngày" |
| fun | energetic | the English of "vui"; generic |
| nổi bật | energetic | a goal every advertisement has — "sản phẩm nổi bật" |
| mạnh | bold | generic, one syllable, usually a product claim — "công thức mạnh", "mùi mạnh" |
| ấn tượng | bold | a desired *effect*, not a treatment; the same kind of word as "nổi bật" |
| gây chú ý | bold | a goal — attract attention — which says nothing about light or composition |
| ấm áp · thân thiện · warm · friendly · gần gũi | warm | the warm group never signalled a level in the first place; weak by construction |

Two judgement calls worth your eye, since neither was among your examples:

- **"ấn tượng" and "gây chú ý" were weakened.** You named "nổi bật" as weak, and these are the same
  kind of word: a desired effect or a goal, not an instruction about the frame. Treating "nổi bật"
  as weak while "ấn tượng" stayed strong would have been inconsistent. It does cost recall — a user
  who writes only "tôi muốn ảnh ấn tượng" now gets no signal. **Say so if you disagree**; it is one
  line to move back.
- **"premium" and "clean" were weakened** to match "cao cấp" and "sạch". In this product's briefs
  the English term is used as a product claim at least as often as a styling one.

### One term added

**"táo bạo" is not in the TONES table and never was.** It is the exact phrase the control puts in
front of the user — "Táo bạo & sáng tạo" — so a user typing our own label back at us matched
nothing. This is also why the strong set is its own table rather than a filter over `TONES`: a
filter cannot contain a term the table lacks. `parse()`, `tonesIn()` and the table itself are
untouched, and tests pin that `parse()` still reports `premium` for "cao cấp" and `energetic` for
"tươi" for its other readers.

### Fixture results

`run-tone-fixture-tests.ts`. **37 concepts** (you asked for at least 30), every expectation written
down before the detector was run against it, and none edited afterwards.

| Class | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| restrained | 10 | 0 | 0 | **100.0%** | **100.0%** |
| bold | 7 | 0 | 0 | **100.0%** | **100.0%** |
| no signal | 20 | 0 | — | **100.0%** | — |

**37/37 agree. Zero disagreements.** `ALLOWED_DISAGREEMENTS` is empty, and the suite fails on any
new disagreement rather than reporting a tolerance — it is a named list with a reason per entry, not
a threshold.

Coverage: 14 Vietnamese with diacritics, 6 unaccented, 12 English, 2 mixed-language, plus the two
real strings. The cases you required:

| Case | Expected | Got |
|---|---|---|
| (a) the live UI Saturn / weightlessness concept | no signal | no signal ✓ |
| (b) the form placeholder, "Chai serum **cao cấp**…" | no signal | no signal ✓ — this used to infer **restrained** |
| (c) "rau má **tươi**", "**tươi mát**", "độ **tuổi** 25-34", "**vui**", "**nổi bật**" | no signal | no signal ✓ (5 fixtures) |
| (d) "sang trọng nhưng năng động" | no signal | no signal ✓ |

Two honest notes on the fixtures:

- **Your example phrase for a mixed tone, "bùng nổ", is not in the real keyword table** and matches
  nothing, so it could not demonstrate the mixed-group rule. The fixtures use "năng động" as the
  energetic term instead. The table was not extended to add it.
- The Saturn concept (a) yielded no signal **before** this fix too — it contains no table term at
  all. "mất **trọng** lượng" does not match `sang\s?trọng`, and "chuyển từ trắng **sang** xanh" is
  the preposition. It is kept because it is a real brief, and because it is the exact shape the
  accent-folding guard in F4 had to survive.

---

## F2. Copy density now counts words

### The measured distribution

Total on-image words per asset family across every existing fixture —
`prompt-v2/golden-fixtures.ts` (3 cases) and `prompt-v2/eval/cases.ts` (23). Non-empty copy only;
5 fixtures carry none.

| Family | n | min | p50 | p75 | max | every value, sorted |
|---|---|---|---|---|---|---|
| poster | 11 | 4 | 8 | 9 | 76 | 4, 4, 5, 6, 8, 8, 8, 9, **27, 76, 76** |
| banner | 4 | 5 | 6 | 7 | 27 | 5, 6, 7, **27** |
| social | 4 | 4 | 5 | 6 | 7 | 4, 5, 6, 7 |
| hero | 2 | 2 | 2 | 2 | 3 | 2, 3 |

The shape is clean: a cluster of layout copy, a gap, then prose pasted into the field. Poster jumps
9 → 27 → 76 (the two 76s are the Centella case the audit named as the measured spelling failure);
banner jumps 7 → 27 (`insurance_banner_1x1_text_heavy`, named for exactly that).

### The chosen thresholds, and the rule

**The rule: the budget is the sum of the per-role word budgets `prompt-v2/playbooks.ts` already
declares for that channel** — `headline_max_words + subline_max_words + cta_max_words`.

No number was chosen by me. These budgets have been in the codebase since the v2 playbooks, the two
files already agreed on `max_strings` (poster 3/3, banner 2/2, social 3/3, hero 1/1), and this makes
them agree on words as well. A test asserts the sums still match, so the two cannot drift apart.

| Family | playbook sum | `max_words` | veto fires at |
|---|---|---|---|
| poster | 8 + 15 + 4 | **27** | 28 words |
| banner | 7 + 12 + 3 | **22** | 23 |
| social | 6 + 10 + 3 | **19** | 20 |
| hero | 5 + 0 + 0 | **5** | 6 |

Validated against the distribution: every piece of real layout copy sits below its budget, and both
prose cases (69 and 76 words) sit above. The 27-word `english_poster_16x9_long_headline` lands
exactly **at** the poster budget and so is not dense — defensible, since 8 + 15 + 4 is precisely the
long-headline-plus-subline-plus-CTA shape the playbook declares legal.

### Both anchors

| Anchor | Strings | Words | Result |
|---|---|---|---|
| **ANCHOR DENSE** — your headline + 51-word paragraph + "Freeship mọi đơn hàng từ 500k!" | 3 | **69** | **dense** ✓ |
| **ANCHOR OK** — 5 samples, headline + CTA | 2–3 | 5, 6, 6, 8, **12** | **not dense** ✓ |

The dense test first asserts that the **string** rule does *not* catch it — three strings is inside a
poster's allowance of three — so it cannot pass for the wrong reason. A third test isolates the
original string rule on four short strings (10 words, far inside the word budget) to pin its old
behaviour independently.

`copyFitsChannel` is unchanged and every other caller is unaffected: `ExperimentPipeline` and the v2
linter still ask only about strings. The veto's message and behaviour are unchanged — restrained
becomes balanced with the same Vietnamese reason, shown inline.

**One of my own fixtures was wrong and the test caught it.** I labelled a sample "12 words"; it was
15. The veto behaviour was right (15 ≤ 27, not dense) — the label was not, and the range assertion
failed on it. Replaced with a genuine 12-word sample.

### L2 is now closed

The Step 1 report listed "no word budget" as a known limit. It is resolved, and a single very long
headline now trips the veto on its own: 28 or more words on a poster is dense regardless of how few
strings carry them.

---

## F3. The badge can no longer contradict the server (L1 closed)

`BrandKitPanel` reports the selected kit's `style.preferred` upward through an optional callback,
`CreativeBriefPanel` holds it, and `CreativeApproachControl` runs the same rules on the same inputs
the server will use. The effect is keyed on the joined string rather than the array, so a fresh
array identity per render cannot loop it, and the `selected` lookup moved above the early return
because a hook cannot sit after one.

**The server remains the authority, and that is asserted rather than assumed.** A test checks that
the client sends no `brandStylePreferred`, no inferred level, no source and no reason —
`creative_approach` carries only the user's explicit *choice* — and that both components say in
comments that this is a preview which the server recomputes from the kit it loads itself
(`generate-simple/route.ts:94`).

Your test case passes: kit says "tối giản", concept says nothing → source `brand_style`, level
`restrained`, label "Tối giản & sang trọng".

---

## F4. Unaccented Vietnamese (L3 closed for the folded terms)

Inside `strongTonesIn` only. **Five** multi-syllable strong terms fold: sang trọng · tối giản ·
đơn giản · năng động · táo bạo. `parse()` and the table are untouched, so `intent.tone` still
reports nothing for unaccented input — the two are now different questions, and the test formerly
named "RECORDED BEHAVIOUR" was rewritten to say which is which.

**Single syllables are never folded.** That is the safety property, not a detail: folding "tươi"
would match both "tuoi" and "tuổi", so "độ tuổi 25-34" would have inferred bold. Folding "mạnh"
would match "manh" and "mảnh", and "kết cấu mỏng, mảnh" is ordinary in skincare briefs. A test
asserts that no folded term has one syllable.

**Folding is not free, and I found a real collision.** Unaccented "sang trong" also begins
"sang trong suốt" (becomes transparent) and "sang trong nhà" (to indoors) — "trong" as a
preposition, both ordinary in a product brief. Without a guard, "nền chuyển từ trắng sang trong
suốt" would have inferred *restrained* from a sentence about a background. It is guarded by a
stop-phrase list and tested, and I verified the guard changes the outcome rather than passing by
accident:

| Input | Result |
|---|---|
| "phong cach sang trong, nen toi mau" | premium, unaccented ✓ |
| "nen phia sau chuyen tu trang sang trong suot" | **no match** ✓ |
| "chuyen sang trong nha" | **no match** ✓ |
| "khong gian sang trong va hien dai" | premium, unaccented ✓ |
| "do tuoi 25-34" · "nuoc rau ma tuoi mat" | no match ✓ |
| "bo cuc toi gian" · "can mot y tuong tao bao" | minimal · bold ✓ |

L3 is closed for the five folded terms. It stays open for everything else: a user writing "cao cap"
or "an tuong" without diacritics gets nothing — but those are weak terms now, so they would get
nothing with diacritics either.

---

## F5. The vision review fails closed (task 0.2)

`worst()` returned 10 for an area with no findings, and a failed vision call produces no findings —
so a review that never looked scored a flawless 10/10 and reported `shippable: true`. "Never
checked" and "checked and clean" rendered identically, which is the one pair of states this system
most needed to keep apart.

| | Before | After |
|---|---|---|
| scores, no observation | 10 / 10 / 10 / 10 / 10 | **null** × 5 |
| verdict | *did not exist* | **"unverified"** |
| `shippable` | **true** | **false** |
| can recommend a re-render | yes | **no** — `judgeTypography` short-circuits on it |
| UI | ticks and findings as if checked | **"Chưa kiểm tra được"** plus a plain explanation; ✓ suppressed |

Scores are now `number | null`. Null is not zero and not "fine": it means the dimension was not
checked. Telemetry carries the verdict too, so a log line full of 10s cannot be misread.

**An empty `visibleText` array is deliberately *verified*.** A model reporting that it read no text
is a real answer about a real frame; only a null or absent list means the call did not happen.
Measured findings over the design are still returned — that arithmetic is real — but the verdict is
withheld, because the half that reads pixels never ran.

The verdict already travelled to the browser inside `visionAnalysis` (`route.ts:413`); only the
client type declaration was missing. An unverified review cannot trigger a re-render, because paying
for a second render on the strength of our own outage would charge the user for it.

**Two things found in passing, reported and not fixed** — both pre-existing and both out of scope:

1. `VisionReview.ts:353` casts the critique to a shape with `blocking?: boolean`, but
   `TypographyFinding` carries **`severity`**, not `blocking`. So `filter((f) => f.blocking)` has
   always matched nothing and the critique's re-render recommendation has **never fired**. My guard
   sits above a path that is already dead. Worth a decision: fix the field name and let it fire, or
   delete the path.
2. `run-vision-loop-tests` reports that `ExperimentPipeline` still reviews renders, so the loop can
   run twice. Pre-existing — see F6.

8 new tests; `run-typography-composition-tests` 37 → **45 passed, 0 failed**.

---

## F6. The six old failures

### Fixed — three stale UI strings (test files only, no app code)

All three had been asserting against `-1`, so they were failing on a renamed string rather than on
the behaviour they exist to protect. The intent of each is preserved, and the orderings are now
genuinely checked — including across this round's insertion of the new control and the
campaign-context block between the concept and the content message.

| Suite | Test | What had drifted |
|---|---|---|
| `run-content-message-tests` | "The field is rendered in the real brief panel" | the label is now "NỘI DUNG CHỮ TRÊN ẢNH (CONTENT MESSAGE)" (`CreativeBriefPanel.tsx:524`) |
| `run-content-message-tests` | "It sits above the visual direction panel" | the same label; the ordering was being decided by two `-1`s |
| `run-visual-controls-integration-tests` | "The panel sits at the end of the flow, just before Generate" | the comment is now `{/* 8. Submit CTA */}` |

`run-content-message-tests` 10 → **12 passed, 0 failed**.
`run-visual-controls-integration-tests` 15 → **16 passed, 0 failed**.

### Not changed — three, with the cause of each

Attribution evidence: `CHANGELOG_V2.md` §3 lists all four suites and all six failures as the
**baseline of the v2 round**, and `docs/migration/01-system-analysis.md` §10.1 independently
measured **54 suites, 1693 passed, 6 failed on 2026-10-05** — before this migration branch —
attributing them to that same changelog section. So **none of the three was introduced by the
GPT-image migration.**

| Suite · test | Cause | Origin |
|---|---|---|
| `run-vision-loop-tests` · "The review happens once, above both pipelines" | grep over source: `ExperimentPipeline.ts` must not contain `reviewRender`; it appears in a RenderTracer log line | **Predates the migration**, and predates the v2 round. `CHANGELOG_V2.md` §3: *"Có trước"* |
| `run-creative-director-tests` · "both director paths evaluate before anything renders" | wants `direct(await new CreativeDirectorV1().judge(...))` inline; the call is now `: await new CreativeDirectorV1().judge(brief, judgmentFlags)` (`ExperimentPipeline.ts:2323`) | **Predates the migration.** §3 lists it as the pre-existing one of this suite's two |
| `run-creative-director-tests` · "the experiment prompt appends the directive last, after the blueprint" | wants `const finalPrompt = directive ? …`; the line is now `const finalPrompt = v2?.ok && v2.prompt` (`ExperimentPipeline.ts:561`) | **Introduced by the earlier v2 one-pass wiring**, not by this migration. §3 says so in its own words: *"1 lỗi là của tôi"* |

All three are grep-over-source assertions on lines that were legitimately reworded. Fixing them
means deciding what the test should now expect, which is your call rather than a drive-by edit.

---

## Still open after this round

| # | Item | Status |
|---|---|---|
| L1 | badge disagreeing with the server on brand style | **closed** (F3) |
| L2 | no word budget | **closed** (F2) |
| L3 | unaccented Vietnamese | **closed for the five folded strong terms**; weak terms are unmatched either way |
| L4 | the level reaches no prompt | **open by design** — that is Step 2, blocked by the gate |
| L5 | whether GPT-Image-2.5-Sunburst honours a restraint directive at all | **UNVERIFIED.** Only the ~900–1,500 VND three-level comparison can answer it, and it was not run — you asked to review the directive text first |
| L6 | whether a populated audience and objective shift the director's route choice | **UNVERIFIED**, unmeasured |
| new | `VisionReview.ts:353` reads `f.blocking` on findings that carry `severity`, so that re-render path is dead | **reported, not fixed** |
| new | "ấn tượng" and "gây chú ý" weakened beyond your named examples | **flag it if you disagree** — one line each to move back |

## Skipped, and why

| Item | Why |
|---|---|
| Step 2 in full (2.1–2.7) | the gate fails. `prompt-v2/gpt-brief.ts`, `gpt-checks.ts`, `gpt-fallback.ts`, `templates/gpt/` and the dialect switch in `engine-selector.ts` all still do not exist; `find lib app -iname "*gpt*"` returns nothing |
| The three remaining test failures | instructed not to change them; causes itemised above |
| Fixing `VisionReview.ts:353`'s `blocking`/`severity` mismatch | out of scope, pre-existing, and it changes whether a re-render fires — your decision |
| Extending the TONES table with "bùng nổ" | it would change what every layer reading `intent.tone` sees |
| The paid three-level comparison | you asked to review the directive text first |
