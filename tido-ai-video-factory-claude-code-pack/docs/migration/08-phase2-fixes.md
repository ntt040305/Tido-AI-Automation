# 08 — Phase 2, and accepting many reference images

Branch `feat/gpt-image-migration`. **No image or LLM API was called in this task.** Phase 3 was
not started and no `prompt-v2/templates` file was touched.

---

## Contents

1. [Baseline vs after](#1-baseline-vs-after)
2. [What already existed, and what I did not rebuild](#2-what-already-existed-and-what-i-did-not-rebuild)
3. [Fix A — Phase 2: the profile, the transport, the dialect](#3-fix-a--phase-2-the-profile-the-transport-the-dialect)
4. [The exact `.env.local` lines](#4-the-exact-envlocal-lines)
5. [Fix B1 — intake caps, before and after](#5-fix-b1--intake-caps-before-and-after)
6. [Fix B2 — how images map to products](#6-fix-b2--how-images-map-to-products)
7. [Fix B3/B4 — the allocation, and the table for M = 2](#7-fix-b3b4--the-allocation-and-the-table-for-m--2)
8. [Fix B5/C — the guard, and nothing lost silently](#8-fix-b5c--the-guard-and-nothing-lost-silently)
9. [Fix B6 — the section C contract, for Phase 3](#9-fix-b6--the-section-c-contract-for-phase-3)
10. [Deviations](#10-deviations)
11. [Skipped, and why](#11-skipped-and-why)

---

## 1. Baseline vs after

Baseline measured at `2d35901` before the first edit of this task.

| | Baseline | After |
|---|---|---|
| Test suites | 57 | **60** (+3) |
| Tests passed | 1,785 | — see note |
| Tests failed | **3** | — see note |
| `tsc --noEmit` | **4**, all in `scratch/` | **4**, all in `scratch/` |
| `eslint .` | **1,339** (1,123 errors, 216 warnings) | **1,339** (1,123 / 216) |

**Note on test counts.** You asked me to finish the code and test it yourself, so the full suite
was not re-run after the last change. Measured individually along the way: `run-model-profile-tests`
**44 passed / 0 failed**, `run-provider-request-fixture-tests` **9 / 0**, `run-reference-capacity-tests`
**22 / 0**, `run-imgstudio-tests` **3/3**, `run-prompt-engine-golden-tests` **6 / 0** (the Gemini
golden suite, unchanged), `run-prompt-v2-simple-tests` **103 / 0**, `run-prompt-engine-v2-tests`
**38 / 0**, `run-image-transport-tests` **22 / 0**, `run-ratio-parity-tests` **7 / 0**.

`run-reference-sheet-tests` is **new and was last seen at 13 passed / 2 failed** — both failures
were the multi-sheet divergence described in §10 D1, which I then fixed in
`ReferencePackingService`. It has not been re-run since that fix. **That is the one thing worth
running first.**

Commits, in order:

| Commit | What |
|---|---|
| `a1` (`…`) see `git log` | the profile file, `allocateReferences`, 29 tests |
| `a2` | the transport reads the row; dialect routing; the request-body fixture |
| `d953a25` | no model name or resolution tier hardcoded on the live path |
| `b1` | intake caps, client and server, from one constant |
| (uncommitted at the time of writing) | multi-sheet packing, panel sizes, warnings, the count guard, surfacing, this document |

---

## 2. What already existed, and what I did not rebuild

You asked me to verify rather than rebuild. Four things were already there and are reused:

| Already existed | Where | What I did |
|---|---|---|
| Reference packing into a contact sheet | `provider/reference-packing/ReferencePackingService.ts` | **Reused.** Its `fit: "contain"` resize, gutters, neutral ground and label band already satisfied most of B4 |
| Capacity planning and a shedding ladder | `provider/reference-capacity.ts` | **Reused.** Added `DROP_REASON_VI` so every drop reason has a Vietnamese sentence |
| Non-retryable timeouts | `e379b41` | **Kept, untouched** |
| 4:5 removal | Phase 0 | **Kept.** The profile simply does not list it |

Nothing from Phase 2 of `02-plan.md` existed: there was no `models/` directory, no registry, no
dialect switch.

---

## 3. Fix A — Phase 2: the profile, the transport, the dialect

### A.1 The profile — `lib/image-engine/models/image-model-profiles.ts`

Two rows. Not a registry, not a selector, no UI. The active row follows `IMGSTUDIO_PROVIDER_ID`;
an unknown id falls back to the default **and logs a warning**, because a render silently using a
dialect nobody chose is worse than a noisy one.

| Field | Sunburst (default) | Nano Banana 2 (rollback) |
|---|---|---|
| `providerId` | `0927e191-1aef-4c56-a3ac-df0c47d84e80` | `flow-nano-banana-2` |
| `displayName` | GPT-Image-2.5-Sunburst | Nano Banana 2 |
| `promptDialect` | `gpt-image` | `gemini` |
| `ratios` | 1:1, 9:16, 16:9 | 1:1, 9:16, 16:9 |
| `resolutionTier` | `1K` | `1K` |
| `quality` | `high` — **UNVERIFIED-EFFECT** | `standard` |
| `maxReferences` | **2** | 3 |
| `maxPanelsPerSheet` | 4 | 9 |
| `minPanelLongestSidePx` | 512 | 341 |
| `sheetSizePx` | 1024 | 1024 |
| `timeoutMs` | 160,000 | 160,000 |
| `latencyMs` | p50 17,900 · max 76,400 · n 11 | p50 61,900 · max null |

Every Sunburst value carries a comment pointing at its measurement in
`03-provider-capabilities.md`. `background` and `count` are **not fields** — 03 §2.2 measured both
as accepted and inert, and `size` as accepted and actively ignored.

`unverified` lists seven things the probe did not settle, including whether `quality: "high"`
reaches the model at all (the API echoes `standard`) and the maximum prompt length.

**The number that mattered.** `config.ts:172-175` declared a 3-image ceiling for *every* ImgStudio
model, with a comment quoting the provider's "maximum 3 images per edit request". That is true of
Nano Banana 2 and false of Sunburst, which refuses a **third** image. One constant could not be
right for both.

### A.2 The transport

`ImgStudioImageGenerationProvider.ts` now reads `provider_id`, `resolution`, `quality`, the
reference ceiling, the sheet size, the panel cap and the panel floor from the active row. An
explicit environment override still wins, because a value set by hand is a decision.

**Hardcoded values unified** (B/A.2 asked for the grep, with citations):

| Was | Now |
|---|---|
| `ImgStudioImageGenerationProvider.ts:75` `IMGSTUDIO_PROVIDER_ID \|\| "flow-nano-banana-2"` | `profile.providerId` |
| `ImgStudioImageGenerationProvider.ts:69` comment "Model / Provider ID: flow-nano-banana-2" | points at the profile |
| `ImageGenerationService.ts:30` and `:39` | `activeProfile().providerId` |
| `SimpleImageGenerationOrchestratorService.ts:867` and `:978` | `activeProfile().providerId` |
| `CampaignOrchestratorService.ts:214` | `activeProfile().providerId` |
| `CampaignOrchestratorService.ts:218` `TIDO_IMAGE_OUTPUT_RESOLUTION \|\| "2K"` | `activeProfile().resolutionTier` |
| `ExperimentPipeline.ts:713` and `:720` (trace labels) | `activeImageProfile().providerId` |
| `app/api/campaign/render-asset/route.ts:143` and `:144` (`"2K"`) | `activeProfile()` |
| `app/api/image/provider/route.ts:9` | `activeProfile().providerId` |
| `config.ts:157` `IMGSTUDIO_SUPPORTED_ASPECT_RATIOS` | `profile.ratios` |
| `config.ts:172-175` `IMGSTUDIO_MAX_REFERENCE_IMAGES` | `profile.maxReferences` |

**The resolution conflict, stated plainly:** `config.ts:128` defaulted the tier to `"1K"` while
`CampaignOrchestratorService.ts:218` and `render-asset/route.ts:144` defaulted it to `"2K"`. The
same decision had two different answers depending on which path a render took. One answer now.

A test asserts no live-path file names a model or defaults the tier to 2K, and that only the
profile file names a model.

`GeminiImageGenerationProvider.ts:135` still has `input.imageSize || "2K"` — **left alone
deliberately**: it is a different provider on a different path, and touching it is outside this
task.

### A.3 Dialect routing — `prompt-v2/engine-selector.ts`

Four additions: `promptDialect()`, `gptDialectAvailable()`, `engineForActiveModel()` and
`PromptDialectNotBuiltError`.

The dialect follows the **model**, not the `PROMPT_ENGINE` flag, because the two are different
kinds of decision: the flag is a preference about how to write a Gemini prompt, the dialect is a
fact about the model that will read it.

- **Gemini rows:** today's behaviour exactly — `PROMPT_ENGINE` decides, v1 by default.
- **GPT rows:** throws `PromptDialectNotBuiltError`, whose message names the model and carries the
  rollback instruction.

The throw is deliberate and both silent alternatives are worse. Falling back to engine v1 would
send Sunburst a ~26,000-character prompt built for a different model; falling back to the Gemini v2
would send a shorter prompt built for the same wrong model. Either returns an image that looks like
a result, costs 150–250 VND, and tells nobody the dialect was never written — which is exactly how
the `__dirname` failure stayed invisible for a whole phase.

`gptDialectAvailable()` is a file-presence question, not a flag, because a flag can be on while the
files are missing. A test asserts the GPT branch has no `engine: "v1"` return at all.

### A.4 Timeouts

**Unchanged, as instructed:** provider 160 s (`config.ts:131`), route 180 s (`:132`), client 250 s
(`:145`). Observed maximum was 76.4 s at n = 11, so 160 s already covers twice the worst
observation. No retry after a timeout — `e379b41` is untouched.

---

## 4. The exact `.env.local` lines

I did not read or edit `.env.local`. These are the lines to set.

**To run Sunburst (the default):**

```
IMGSTUDIO_PROVIDER_ID=0927e191-1aef-4c56-a3ac-df0c47d84e80
```

**To roll back to Nano Banana 2:**

```
IMGSTUDIO_PROVIDER_ID=flow-nano-banana-2
```

That is the whole switch. Everything else follows the row.

**Lines to REMOVE if present**, because they override the profile and will silently defeat it:

```
TIDO_IMAGE_OUTPUT_RESOLUTION=...
TIDO_IMAGE_OUTPUT_QUALITY=...
TIDO_IMAGE_OUTPUT_SIZE=...
IMGSTUDIO_MAX_REFERENCE_IMAGES=...
```

Each still wins over the row by design (a hand-set value is a decision), but with the profile in
place they are no longer needed, and a stale one is now the most likely cause of a surprise.

**Name-level conflicts I can see without reading any value:**

| Conflict | Why it matters |
|---|---|
| `TIDO_IMAGE_OUTPUT_SIZE` (`config.ts:128`) **and** `TIDO_IMAGE_OUTPUT_RESOLUTION` (provider `:85`) | Two names for one thing. The provider reads `_RESOLUTION`; `config.ts` exposes `_SIZE`. If only `_SIZE` is set, the provider ignores it |
| `IMGSTUDIO_MAX_REFERENCE_IMAGES` | If set to 3 from the Nano Banana 2 era, it overrides Sunburst's 2 and every render with 3 images will 400 |
| `TIDO_IMAGE_PROVIDER` | Selects imgstudio / gemini / cloudflare. If it is not `imgstudio`, none of this profile work applies |
| `IMG_PROVIDER_TIMEOUT_MS` | Overrides the 160 s ceiling |

I cannot tell you which of these are actually present — I did not read the file. Please check those
four names.

---

## 5. Fix B1 — intake caps, before and after

### Before: there were none

| Side | File | Count cap | Size cap | Type check |
|---|---|---|---|---|
| Client | `BrandIdentityUploader.tsx:20-70` | **none** — `Array.from(e.target.files)` appended whatever was selected | **none** | `accept=` attribute only (`:131`, `:187`, `:234`) |
| Server | `generate-simple/route.ts:135-139` | **none** — `formData.getAll()` × 3, all buffered | **none** | none |
| Next | `next.config.ts` | no body-size limit configured | — | — |

So eight 12-megapixel photographs were accepted, buffered and sent, and the first thing to complain
was the provider.

### After: one constant, read by both

`IMAGE_ENGINE_CONFIG.INTAKE_LIMITS` in `config.ts`:

| Limit | Value |
|---|---|
| `maxProductImages` | **8** |
| `maxLogoImages` | **1** |
| `maxStyleImages` | **1** |
| `maxBytesPerImage` | 15 MB |
| `maxTotalBytes` | 60 MB |
| `acceptedMimeTypes` | png, jpeg, webp |
| `acceptedLogoMimeTypes` | png, svg+xml, jpeg, webp |

`service/intake-limits.ts` holds `checkIntake()`, called by **both** the uploader and the route, so
the server can never be stricter than the control that collected the files. Three channels are
checked separately: `images`, `logoImages`, `inspirationImages`.

**Refused, never trimmed.** Over the cap is a 400 with a Vietnamese message naming the number
(`Bạn đang gửi 9 ảnh sản phẩm, vượt quá giới hạn 8…`), so the next attempt can succeed. Keeping the
first eight of nine would be the silent loss this whole task exists to prevent.

An absent MIME type is tolerated (some clients omit it, and normalisation reads the bytes anyway);
a type that is present and wrong is refused.

The intake cap is deliberately **larger** than the provider ceiling, and a test asserts it stays
that way — if the two ever collapse onto each other, packing has become pointless.

---

## 6. Fix B2 — how images map to products

**The system can tell distinct products from extra angles, and the mapping is usable.**

| Mechanism | Where |
|---|---|
| `product_identity_locks[]`, each with `product_id` and `reference_ids[]` | `service/ReferenceIntelligenceService.ts:103-118` |
| Same-product multi-view detection | `:50-54` → `relationshipType = "same_product_multi_view"` at `:61-62` |
| Resolving one reference to its product | `reference-packing/ReferencePackingStrategy.ts:30-34` and `reference-capacity.ts:103-112` — `ref.product_id`, else the manifest lock |

**But the default is "every image is a distinct product", and that is deliberate.** The router
states the policy in its own words at `service/KnowledgeRouterService.ts:369-372`:

> MERGE REQUIRES POSITIVE SAME-IDENTITY EVIDENCE. Requested visible instance count (productCount)
> is NEVER used as evidence to group multiple references.

and its fallback at `:415-417` gives every reference its own `PRODUCT_NN`. So grouping happens only
when the routing step returns positive evidence; otherwise each upload is its own product.

**How the allocator uses it.** `identityKey()` reads `productId` and, when it is absent, falls back
to a per-image key — so unknown is treated as distinct, matching the router's conservative policy.
Distinct products are allocated before any extra angle, and under pressure extra angles are shed
first. A product with two angles never loses its last panel.

---

## 7. Fix B3/B4 — the allocation, and the table for M = 2

### The function

`provider/reference-packing/reference-allocation.ts` — pure, no sharp, no I/O.

```
allocateReferences(inputs, { limit, maxPanelsPerSheet, sheetSizePx })
  -> { slots: [{ index, kind, panels: [{ label, role, sourceImageId, outWidth, outHeight }], width, height }],
       dropped: [{ what, reason_vi }],
       packed: boolean,
       impossible?: { reason_vi, products } }
```

Priority is products > logo > style. The style reference **never** travels as an image — it reaches
the director through its text manifest (`config.ts:144`, default on), because handing the generator
a second photograph is what made it blend two products into one frame.

It is the single source of truth: the transport attaches these slots, section C will describe these
slots, and the checks count these slots.

### The table, generated from the real function at M = 2 (Sunburst: 4 panels, 1024 px sheet)

Products are 2000×2000, the logo 800×400.

| n | logo | slots | Image 1 | Image 2 | dropped | panels < 512px |
|---|---|---|---|---|---|---|
| 1 | no | 1 | single: A 1024×1024 | — | — | 0 |
| 1 | yes | 2 | single: A 1024×1024 | single: A 800×400 | — | 0 |
| 2 | no | 2 | single: A 1024×1024 | single: A 1024×1024 | — | 0 |
| 2 | yes | 2 | single: A 1024×1024 | sheet 2p: A 1024×1024, LOGO 256×128 | — | 0 |
| 3 | no | 2 | sheet 2p: A 512×512, B 512×512 | single: A 1024×1024 | — | 0 |
| 3 | yes | 2 | sheet 2p: A 512×512, B 512×512 | sheet 2p: A 1024×1024, LOGO 256×128 | — | 0 |
| 4 | no | 2 | sheet 2p: A 512×512, B 512×512 | sheet 2p: A 512×512, B 512×512 | — | 0 |
| 4 | yes | 2 | sheet 2p: A 512×512, B 512×512 | sheet 3p: A, B 512×512, LOGO 256×128 | — | 0 |
| 5 | no | 2 | sheet 3p: A, B, C 496×496 | sheet 2p: A, B 512×512 | — | **3** |
| 5 | yes | 2 | sheet 3p: A, B, C 496×496 | sheet 3p: A, B 512×512, LOGO 256×128 | — | **3** |
| 6 | no | 2 | sheet 3p: A, B, C 496×496 | sheet 3p: A, B, C 496×496 | — | **6** |
| 6 | yes | 2 | sheet 3p: A, B, C 496×496 | sheet 4p: A, B, C 496×496, LOGO 256×128 | — | **6** |
| 7 | no | 2 | sheet 4p: A–D 496×496 | sheet 3p: A, B, C 496×496 | — | **7** |
| 7 | yes | 2 | sheet 4p: A–D 496×496 | sheet 4p: A, B, C 496×496, LOGO 256×128 | — | **7** |
| 8 | no | 2 | sheet 4p: A–D 496×496 | sheet 4p: A–D 496×496 | — | **8** |
| 8 | yes | 2 | sheet 4p: A–D 496×496 | sheet 4p: A–D 496×496 | **logo.png** | **8** |
| 9 | no | — | — | — | **refused** | — |

**Read the last two columns.** At 5 products and above, every product panel is **below Sunburst's
512 px identity floor** — 496 px in a 2×2 grid, 341 px in 3×3. The system reports this rather than
hiding it; whether a 496 px panel still locks a label is exactly the kind of thing only your own
test can answer.

At n = 8 with a logo, the logo's **image** is dropped to give its panel back to the eighth product,
and it travels as text only: *"Không còn chỗ cho ảnh logo; logo chỉ được mô tả bằng chữ, không được
vẽ lại."*

At n = 9 distinct products it refuses rather than choosing one to lose:

> Model hiện tại chỉ nhận 2 ảnh mỗi lần, ghép tối đa 4 ô mỗi ảnh (tối đa 8 sản phẩm). Bạn đang gửi
> 9 sản phẩm khác nhau — hãy tách thành nhiều lần tạo.

With **9 images across 3 products** it does not refuse: it sheds one extra angle and carries all
three products.

### B4 — the drawing

`ReferencePackingService` draws what the allocator planned. Already satisfied before this task and
verified rather than rewritten: `fit: "contain"` (never crops, so aspect ratios are preserved and
nothing is stretched), `GUTTER = 8` between cells so panels never overlap, a neutral
`#f5f5f5` ground, and `LABEL_BAND = 34` reserved **above** each cell with the picture offset below
it — so a letter never sits on a product.

Added:

- `sheetSize`, `maxCells` and `minPanelLongestSidePx` now come from the profile. The hardcoded
  values were `PACKING_DEFAULTS` in `ReferencePackingTypes.ts:120-125` (`sheetSize: 1024`,
  `maxCells: 9`); they remain as the fallback for a caller that declares nothing.
- **Per-panel measurement**, so the loss can be judged by numbers: each `PackedCell` now carries
  `original_width/height`, `rendered_width/height` and `downscale` (rendered longest side ÷
  original longest side). Logged per sheet as `[REFERENCE_PACKING][PANELS]`.
- **A warning** when a product panel's longest side falls under the profile's floor:
  `PANEL_BELOW_IDENTITY_FLOOR` with the measured side and the floor. Reported, never corrected —
  making one panel bigger means making another smaller.
- **Multi-sheet rendering.** See §10 D1; this was the one real design gap.

---

## 8. Fix B5/C — the guard, and nothing lost silently

### B5 — the pre-dispatch count guard

`ImgStudioImageGenerationProvider.ts`, immediately before the endpoint is chosen: if the list about
to be sent exceeds `referenceLimit`, it returns `REFERENCE_COUNT_GUARD` and **sends nothing**.

Never a trim. The prompt upstream already describes "Image 1" and "Image 2"; sending fewer images
than the prompt names leaves the model looking for a reference that is not there. Packing is
supposed to make this impossible — the guard exists because "supposed to" is not a guarantee, and a
mismatch between what the prompt describes and what the provider received is the hardest class of
bug to see from an image.

### C.1 — how the logo is attached, and whether it counts

**Answered from the code.** The logo arrives on its **own multipart channel**, `logoImages`
(`generate-simple/route.ts:138`), not with the product photographs — added in Phase 5.4 because in
`images` it defaulted to `PRODUCT` and could be read as the product itself.

But it is then merged into the same `parsedImages` array with `role: "LOGO"`
(`route.ts:188-200`), reaches the provider inside `input.references`, and is counted by
`candidateReferences` like anything else. **So yes: the logo counts toward the provider's per-call
image limit.** That is why `allocateReferences` gives it a panel rather than a slot, and why at
n = 8 it gives that panel up.

### C.2 — surfaced with the render

`remoteDetails.reference_packing` now carries `status`, `packed`, `slots_sent`, `provider_limit`,
`products_in`, `products_out`, `dropped[]` (each with `reason_vi`) and `warnings[]`. The whole
analysis object is already passed through to the client by `route.ts:413`, so this travels without
further plumbing.

`DROP_REASON_VI` in `reference-capacity.ts` gives all five `DropReason` values a Vietnamese
sentence, so no drop can reach a user as an enum name.

### C.3 — the one-line notice

Under the product uploader, shown only when packing will actually happen:

> Model hiện tại nhận tối đa 2 ảnh mỗi lần: 5 ảnh sẽ được ghép thành 2 tấm tham chiếu.

The ceiling comes from `activeProfile().maxReferences`, not from the string, so a model with a
higher limit cannot turn that sentence into a lie on screen. Refusals render in a red row above it.
Well under 20 lines, so it is included.

---

## 9. Fix B6 — the section C contract, for Phase 3

Recorded here, **not implemented**. When `gpt-brief.ts` is built, its section C must:

1. **List exactly the slots `allocateReferences` returned**, by number, in order. "Image 1" means
   `slots[0]`, always. Never a count derived separately — the same function the transport called.
2. **Name each panel by its label** and say which product it shows: *Image 1 is a reference sheet
   with four panels: panel A is <product>, panel B is <product>…*
3. **State that the annotations are not content.** Panel letters, the frames between panels, the
   grey ground and the LOGO strip are labels on a contact sheet. The prompt must say they must
   never appear in the rendered image.
4. **Say when no logo image was attached**, explicitly, and the director must then NOT ask the image
   model to reproduce a logo it was not given — including when the logo travelled as text only
   because its panel was given back to a product. Inventing a mark is the one failure the product
   rules forbid outright.
5. **Carry what is protected per panel**: shape, proportions, colours, materials, label layout; do
   not redesign and do not re-letter.
6. **Mention the downscale when a panel is below the floor**, so the director knows a label on that
   panel may not be legible and can lean on the product manifest's text instead.

---

## 10. Deviations

### D1 — the one real design gap: the renderer could only build ONE sheet

Found by the new sheet test, not by reasoning. `allocateReferences` plans **up to `limit` sheets**
(your B3: *"each slot becomes a sheet of panels"*), but `planPacking` could only ever produce
**one** sheet plus `limit − 1` full-size keepers, and declared `IMPOSSIBLE` when the survivors
exceeded `maxCells`. At M = 2 with 5 products the plan said "fits in two sheets of four" and the
renderer said impossible.

Two modules disagreeing about what fits is worse than either answer, because the user sees the
renderer's. So `pack()` is now allocation-driven: it calls `allocateReferences`, builds one sheet
per slot that has more than one panel, and passes a single-panel slot through as its **original
file at full resolution** (re-encoding one photograph into a one-cell sheet would cost detail for
nothing). The early `IMPOSSIBLE` return from `planPacking` was removed with a comment explaining
why; only the allocator says impossible now.

**Consequence for the rollback, stated plainly.** For Nano Banana 2 with **three or fewer**
references nothing changed — the pass-through branch returns the same array object, and the
recorded-fixture test pins the request bytes. With **four or more** references NB2 now packs
allocation-style (up to 3 slots) instead of one sheet plus two keepers. That is strictly more
capacity, but it **is** a behaviour change on the rollback path for that case. Flagging it rather
than burying it; say the word if you want the old single-sheet strategy preserved for the Gemini
row.

`PackingResult` gained `packed_sheets[]` for the multi-sheet case; `packed` still holds the first
sheet so every existing reader keeps working.

### D2 — two test assertions updated, both because my change made them wrong

- `run-reference-capacity-tests` greps the provider for
  `IMAGE_ENGINE_CONFIG.IMGSTUDIO_MAX_REFERENCE_IMAGES`. Repointed at `profile.maxReferences` and
  tightened: the limit must be resolved once and passed by name, and no literal number may be
  passed as a limit. Its intent — the ceiling is declared, never written into the call — is
  unchanged and now holds per model.
- `run-imgstudio-tests` Test 1 asserted `resolved.model === "flow-nano-banana-2"`. The default model
  is now Sunburst, so a fixed name would assert the old product decision. It now checks both
  directions instead.

### D3 — `02-plan.md`'s Phase 2 was superseded, as you instructed

The plan described a full `ModelRegistry` with a JSON seed, `modelId` and `qualityTier` in the
FormData, a `/api/image/provider` capability response and a UI selector (plan tasks 2.1, 2.6, 2.9).
Your message replaced that with one small profile file and no selector, so those three were **not
built**.

### D4 — `measure()` changed shape

It returned a pixel-area index for ranking; it now returns `{ width, height }` per reference,
because the allocator needs dimensions and the panel report needs the original size. `areaIndex()`
is exported to recover the old value for anything that ranks on detail.

---

## 11. Skipped, and why

| Item | Why |
|---|---|
| **Phase 3** (the GPT brief, templates, checks, fallback, gold examples) | Out of scope for this task, as instructed. `gptDialectAvailable()` still returns false and the GPT dialect throws |
| **Fix D and Fix E** | Dropped by you in this message |
| Any live image or LLM call | Forbidden in this task, and none was made |
| Re-running the full suite after the multi-sheet fix | You asked to finish the code and test it yourself. `run-reference-sheet-tests` is the one to run first — see §1 |
| `GeminiImageGenerationProvider.ts:135` `"2K"` default | A different provider on a different path; outside this task |
| `.env.local` edits | Forbidden. The lines are in §4 |
| Next body-size configuration | No limit is configured today and the intake caps bound the payload at 60 MB; adding a framework-level limit is a separate decision |
