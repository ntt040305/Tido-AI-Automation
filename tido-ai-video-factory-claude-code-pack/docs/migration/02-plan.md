# 02 — Migration Plan (Step A)

Plan only. **Nothing in this document has been implemented.** Phase 0 starts after you
approve it.

Branch `feat/gpt-image-migration`, created from `feat/prompt-engine-v2` at `b986e33`.
Decisions D1–D11 are taken as binding. Where one of them conflicts with the code or the
audit, it is listed in §2 with evidence and a proposed resolution, and **I have not
chosen a side** — each needs your answer.

Paths are relative to `tido-ai-video-factory-claude-code-pack/` unless stated.

---

## Contents

1. [Baseline](#1-baseline)
2. [Conflicts with the decisions — need your answer](#2-conflicts-with-the-decisions--need-your-answer)
3. [Authentication and image access — the gap the audit did not cover](#3-authentication-and-image-access--the-gap-the-audit-did-not-cover)
4. [Phase 0 — seams and safe fixes](#4-phase-0--seams-and-safe-fixes)
5. [Phase 1 — provider probe](#5-phase-1--provider-probe)
6. [Phase 2 — registry and provider](#6-phase-2--registry-and-provider)
7. [Phase 3 — GPT-dialect engine v2](#7-phase-3--gpt-dialect-engine-v2)
8. [Phase 4 — latency and concurrency](#8-phase-4--latency-and-concurrency)
9. [Phase 5 — UI](#9-phase-5--ui)
10. [CLAUDE.md diff (rules 5, 8, 10)](#10-claudemd-diff-rules-5-8-10)
11. [Rollback](#11-rollback)
12. [Order, stop points, and what each commit must keep green](#12-order-stop-points-and-what-each-commit-must-keep-green)

---

## 1. Baseline

Recorded on this branch before any change, 2026-10-05.

| Check | Command | Result |
|---|---|---|
| tests | `npx tsx lib/image-engine/run-all-tests.ts --keep-going` | **54/54 suites · 1693 passed, 6 failed** — the same six pre-existing failures in the same four suites (`run-visual-controls-integration-tests`, `run-content-message-tests`, `run-vision-loop-tests`, `run-creative-director-tests`) |
| typecheck | `npx tsc --noEmit` | **4 errors, all in untracked `scratch/`** (`scratch/test_healthy_trace.ts` ×2, `scratch/trace_pipeline_synthesis.ts` ×2) |
| lint | `npx eslint .` | **1339 problems (1123 errors, 216 warnings)** |

Lint was 1332 when `CHANGELOG_V2.md` §3 was written; it is 1339 now. The audit did not
record lint, so **1339 is the number this migration must not exceed.**

Every commit runs all three. A commit that raises any count does not land.

---

## 2. Conflicts with the decisions — need your answer

Fifteen items. The first six block work; the rest are clarifications I can proceed on
once you nod.

### Blocking

**K1 — The 60-second target versus what is already measured (D5 with D4).**
Fifteen recorded renders on today's model (`apps/web/data/evolution/generation-log.jsonl`,
2026-10-01 → 10-03):

| | p50 | max |
|---|---|---|
| image call alone (`provider_wait_ms`) | **61.9 s** | 94.4 s |
| whole request (`duration_ms`) | **97.3 s** | 155.0 s |
| everything that is not the image call | **31.8 s** | 99.1 s |

The image call alone is already over 60 s at the median on Nano Banana 2. To finish under
60 s, Sunburst's image call must be roughly ≤ 40 s **and** everything else ≤ 20 s — while
D4 keeps every upstream LLM layer and Phase 3 adds the GPT-dialect director call. Moving
the vision review off the path saves the 9–14 s it measured. Nothing here is a
contradiction yet, because Sunburst has never been measured; Phase 1 h) decides it. But
you should know now that the target is not reachable by optimisation alone unless Sunburst
is much faster than today's model. **Please confirm: is 60 s a p50 target or a p95 target?**

**K2 — Making `resolveActiveProvider` the seam imports the files D10 says to leave alone.**
`resolveActiveProvider` (`apps/web/lib/image-engine/service/ImageGenerationService.ts:22`)
constructs `GeminiImageGenerationProvider` and `CloudflareImageGenerationProvider`
(`:41-58`), and the module imports both at the top. Routing the hot path through it puts
both — and `@google/genai` — into the live module graph, which D10 forbids.

- **Option A**: rewrite `resolveActiveProvider`'s body to be registry-driven and remove the
  Gemini/Cloudflare branches and imports from `ImageGenerationService.ts`. The provider
  files themselves stay untouched. Touches a file on the dead path.
- **Option B (recommended)**: a new seam, `apps/web/lib/image-engine/provider/render-provider.ts`
  → `resolveRenderProvider(row)`, which constructs only the ImgStudio transport (D1). Leave
  `ImageGenerationService.ts` exactly as it is. The Phase 0 test asserts the render path uses
  this seam.

You named `resolveActiveProvider` explicitly, so I will not substitute B without your OK.

**K3 — `TIDO_IMAGE_PROVIDER` is defined twice in `apps/web/.env.local`.**
Lines 60 and 70. I read names only, so I do not know either value, nor which one your
loader keeps. Today the render path ignores this variable (audit F1). If the new seam
honours it and the effective value is not `imgstudio`, Phase 0 would switch providers —
which "no behavior change" forbids. With K2 option B the seam ignores it entirely and the
question goes away. With option A, I need either the two values from you or permission to
read those two lines.

**K4 — With every `providerModelId` null, nothing is selectable.**
D11 sets `providerModelId = null until Phase 1 confirms it`, and Phase 1 only probes
Sunburst (and Flare if budget allows). If both Sunburst candidates fail, **zero rows are
selectable and the app cannot render.** Nano Banana 2's id is already confirmed by recorded
responses, not memory:

- `.tmp-work/render.json` (repository root, 2026-09-05): `provider.provider_name =
  "Flow · Nano Banana 2"`, `provider.model = "flow-nano-banana-2"`, `cost_vnd = 100`
- dev-server log quoted in this session (2026-10-02): the same two fields

**Proposal:** seed the NB2 row with `flow-nano-banana-2` and cite that evidence in the row.
Default model = Sunburst when selectable, otherwise NB2.

**K5 — The probe cap is above the probable account balance.**
Cap 4,000 VND. Last recorded `balance_vnd` was **4,500** (2026-10-02 16:01 UTC). The
generation log shows **8 more completed renders** after that, so about **3,700 VND remains
if nobody topped up** (UNVERIFIED — the log does not carry the balance). The probe is
estimated at 2,100–3,300 VND (§5.3). It will very likely run out of balance before it
reaches the cap. Either top up before Phase 1, or approve the priority order in §5.3 so the
most important answers are bought first. The probe aborts on the cap **or** on an
insufficient-balance error, whichever comes first.

**K6 — The two locked documents outside `CLAUDE.md` still name Nano Banana 2 as the only
image model.** `CLAUDE.md` `@`-includes them, and its rule 3 forbids me changing a locked
decision on my own. D9 authorises rules 5, 8 and 10 only.

| File | Text |
|---|---|
| `docs/00-master-system-spec.md`, Locked decisions #4 | "Nano Banana 2 là image model duy nhất." |
| `docs/00-master-system-spec.md`, Responsibility table | "AI images \| Nano Banana 2" |
| `docs/10-acceptance-criteria.md`, Product | "Nano Banana 2 là AI image provider duy nhất." |
| `docs/01-core-architecture.md`, diagram | `AIW --> NB[Nano Banana 2]` |
| `docs/09-implementation-roadmap.md` | "Phase 3 — Nano Banana 2" |

**Proposal:** authorise amending the first three (proposed text in §10.4); leave the
diagram and the roadmap as history. Otherwise the constitution will contradict itself.

### Clarifications — I will proceed as stated unless you object

**K7 — D3 "remove 4:5 from config": config already has none.**
`apps/web/lib/image-engine/config.ts:157` is already `["1:1","9:16","16:9"]`. 4:5 actually
lives here, and these are the files Phase 0.3 changes:

| File | What | Live? |
|---|---|---|
| `apps/web/features/picture-engine/stores/picture-engine.store.ts:106` | `aspect_ratio: "4:5"` — **the real source of the 4:5 default** | live |
| `apps/web/features/picture-engine/components/brief/CreativeBriefPanel.tsx:54`, `:89` | fallback `"4:5"`, options list | live |
| `apps/web/features/picture-engine/components/brief/CreativeDirectionSelector.tsx:47` | options list | live |
| `apps/web/features/picture-engine/types/picture-engine.types.ts:33` | `AspectRatioType` union | live |
| `apps/web/features/picture-engine/schemas/creative-brief.schema.ts:36` | zod enum | live |
| `apps/web/lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts:128,280,345,385,441` | `|| "4:5"` fallbacks | live |
| `apps/web/lib/image-engine/service/CommercialLayoutService.ts:229` | `|| "4:5"` | live |
| `apps/web/lib/image-engine/director/CreativeFormatPlanner.ts:52` | `default_ratio: "4:5"` | live |
| `apps/web/lib/image-engine/service/ImageGenerationService.ts:221-223`, `CloudflareImageGenerationProvider.ts:23` | allow-lists with 4:5 | **dead — leave** |
| `packages/contracts/src/common/enums.ts`, `.../engines/picture-engine.contract.ts` | enums | not on the render path — **leave**, report |
| `apps/web/lib/image-engine/benchmark/layout-render-dataset.ts` | 8 benchmark cases at 4:5 | benchmark — **leave**, report |

**K8 — "1K vs 2K": the live path already sends 1K.**
`SimpleImageGenerationOrchestratorService.ts:871` hardcodes `imageSize: "1K"`; the provider
sends `TIDO_IMAGE_OUTPUT_RESOLUTION || input.imageSize || "1K"`
(`ImgStudioImageGenerationProvider.ts:76`). `config.ts:128`'s `"2K"` feeds only the dead
`ImageGenerationService`. **`TIDO_IMAGE_OUTPUT_RESOLUTION` is set in your `.env.local` and
overrides both**; I do not know its value. Phase 0.3 aligns the config default to `"1K"`;
Phase 2 moves the tier into the registry, at which point that env var stops being read
(I will log a warning if it is set). Also: **output pixel dimensions have never been
measured** — `.tmp-work/render.json` reports 1152×2048 for a 1K 9:16 render, but the same
record says `measured: "DERIVED_FROM_RATIO"`. Phase 1 c) measures them for the first time.

**K9 — The pricing document contradicts D1 and contains nothing usable.**
`Bảng giá API đề xuất.docx` covers Claude, Gemini Developer API, Seedance and ElevenLabs. It
has **no ImgStudio, GPT-Image, Sunburst or Flare entry, no provider id, no VND image price**,
and it recommends *Gemini Developer API direct* ($90 / 90 days) as the default image route.
D1 is binding, so I note it and move on; Phase 1's "extract ids and prices from the docx"
step yields nothing. No ImgStudio API documentation exists anywhere in the repository.

**K10 — D4 "reuse ALL upstream layers" means wiring them in, because v2 uses none of them today.**
The v2 brief reads only request fields and the visual controls
(`apps/web/lib/image-engine/prompt-v2/brief-compiler.ts`, `compileBrief`). The upstream
layers still run on every v2 request — Marketing Brain is called at
`ExperimentPipeline.ts:1167` and handed down as `precomputedStrategy` — and their output is
thrown away. So D4 means *feed their outputs into the GPT-dialect brief*, and then Phase
4.2's "skip layers the brief does not use" skips nothing on the GPT path. I will read it
that way. Side finding: `RenderTracer`'s `model_calls` **undercounts** — the measured
render reported 2 calls while Marketing Brain had also run — so Phase 4 instrumentation
will not use it.

**K11 — D6: per-request state is held in static fields today.**
`RenderTracer` keeps `traceId`, `stagesExecuted`, `modelCalls`, `checkpoints` in static
fields (`apps/web/lib/image-engine/observability/RenderTracer.ts:43-48`), and tracing is on
in your environment. Under concurrency, traces from different requests interleave. Nothing
reads these fields to make a decision (only `isTraceEnabled`, `stage`, `recordCheckpoint`,
`logPrompt`, `logResponse`, `summary` are called), so **renders are not corrupted — logs
are.** Phase 4.5 moves it to per-request `AsyncLocalStorage`.
Second instance: the client mints `requestId = job_pic_${Date.now()}`
(`features/picture-engine/services/picture-engine.api.ts:26`, sent at `:154`), and
`SimpleImageGenerationOrchestratorService.ts:82` would adopt it as the generation id —
which is also the storage directory. Two users in the same millisecond would write into the
same folder (`LocalGeneratedImageStorage.ts:15-23`). Recorded renders show server-minted
`gen_<ms>_<5 chars>` ids, so on the measured path the client value did not become the key —
UNVERIFIED for every path. Phase 4.8 makes the server mint every id with
`crypto.randomUUID()` and never adopt a client id as a storage key.

**K12 — Two rules in the Phase 3 contract collide, and one of today's checks must not apply.**
"Add a letter-by-letter spelling for non-dictionary brand names" vs. "no other quoted
strings": I will require the spelling **unquoted** (`S-K-I-N-1-0-0-4`) and the check will
treat an unquoted hyphenated spelling of a required string as permitted. And because the
ratio travels as a parameter and the prompt states *orientation*, the Gemini-dialect `ratio`
check (ratio digits at the end) is **not** applied to the GPT dialect; the GPT check
verifies the orientation words instead.

**K13 — Today's provider retries after a timeout, which can pay twice.**
`ProviderErrorClassifier.ts:16` documents "timeouts … Retry", and `:159-165` classifies
timeouts as retryable. Phase 4.3 forbids this. Because it is a money risk *now*, I propose
moving it into **Phase 0 as task 0.4** — a behaviour change you did not list for Phase 0, so
it needs your yes.

**K14 — "Fail closed" must not trigger a paid re-render.**
Phase 0.2 makes a failed vision call `unverified` and not shippable. A "not shippable" result
must not be read as a defect that the correction loop then pays to fix. Today correction is
driven by `improvement_actions`, not by `shippable`; Phase 0.2's test pins that an
`unverified` review never causes a second render.

**K15 — Gold examples I write are not "proven".**
Phase 3 asks for at least two gold examples per asset type. I cannot prove a prompt without
rendering it. They will be marked `status: seed — unproven` in their header until the paid
live eval renders them, and the brief compiler will label them "illustrative" rather than
"quality bar" while that marker is present.

---

## 3. Authentication and image access — the gap the audit did not cover

### 3.1 What exists

| Piece | Evidence |
|---|---|
| Firebase email/password auth in the browser | `apps/web/features/auth/AuthProvider.tsx:5-11`; screen at `app/login/page.tsx` |
| ID token attached as `Authorization: Bearer` by the client | `features/auth/AuthProvider.tsx:168`, `:176`; `features/auth/firebase-client.ts:107` |
| Server-side verification, **with revocation check** | `packages/infrastructure/src/firebase/verify.ts:44-53` (`verifyIdToken(token, true)`), reached through `getIdentityProvider().identify(req)` |
| Routes that **require** a user (return 401) | only `app/api/brand-kits/route.ts`, `app/api/brand-kits/[id]/route.ts` |
| Admin route | `app/api/admin/pipeline/route.ts:25` — a shared header token `x-tido-admin-token` |
| `middleware.ts` / `proxy.ts` | **none** |

### 3.2 The gaps

**G1 — Rendering is anonymous by design.** `app/api/image/generate-simple/route.ts:30-31`:
"Anonymous rendering is deliberate on this route and stays that way." Identity is optional
and used only for the rate-limit bucket (`:37`), the user kit and persistence (`:294-321`).
For a public launch where every render costs money, an anonymous caller is limited only by
an in-memory per-IP window.

**G2 — Generated images are public, forever, to anyone with the URL.**
`app/api/image/generated/[id]/route.ts:8-45` performs no authentication and no ownership
check, and serves every image with `Cache-Control: public, max-age=31536000, immutable`
(`:42`), so any shared cache or CDN in front of it keeps a copy for a year. The stored record
has no owner field (`LocalGeneratedImageStorage.ts:12-16` copies metadata; no user id is
written). The only protection is the unguessability of `gen_<ms>_<5 base36 chars>`, minted
with `Math.random` (`SimpleImageGenerationOrchestratorService.ts:82`) — not cryptographic.

**G3 — The planned recovery endpoint would inherit G2.** `GET /api/image/jobs/[id]` (Phase
4.7) returns prompts, assumptions and the result URL. Without an ownership rule it would
publish every brief.

### 3.3 Proposal — not implemented now

1. **Every job records its owner.** `render_jobs.user_id` (nullable) and, for anonymous jobs,
   a random 32-byte `access_token_hash`.
2. **One access rule for both read endpoints.** Serve `/api/image/generated/[id]` and
   `/api/image/jobs/[id]` only when the verified Firebase uid equals the job's `user_id`, or
   when an anonymous job's capability token is presented and its hash matches. Otherwise 404
   (not 403, so existence does not leak).
3. **`Cache-Control: private, max-age=…, immutable`**, never `public`.
4. **Server-minted ids only**, `crypto.randomUUID()` (also closes K11).
5. **Decide whether anonymous rendering survives the public launch.** My recommendation:
   require sign-in to render once a paid model is the default; keep anonymous viewing of a
   result only through its capability link.

Items 1–4 fit inside Phase 4.7 at small cost, because the table and both endpoints are being
built anyway. Item 5 is your call. **Phase 4 will not ship the jobs endpoint without at least
items 1, 2 and 4.**

---

## 4. Phase 0 — seams and safe fixes

No behaviour change except where listed. One commit per task.

| # | Task | Files | Test (written first) | Behaviour change |
|---|---|---|---|---|
| **0.1** | One provider seam on the render path (K2 decides A or B) | B: new `apps/web/lib/image-engine/provider/render-provider.ts`; `evolution/ExperimentPipeline.ts:2258`, `:2370`; `service/SimpleImageGenerationOrchestratorService.ts:864`; `app/api/campaign/render-asset/route.ts:146` | new `run-render-seam-tests.ts`: (a) source-level: no `new ImgStudioImageGenerationProvider(` outside the seam; (b) runtime: an injected fake provider receives the call when no `options.generationProvider` is given | none — still ImgStudio, still `IMGSTUDIO_PROVIDER_ID` |
| **0.2** | Vision review fails closed | `evolution/experiment/TypographyCritique.ts:302-319`; `evolution/VisionReviewLayer.ts` | extend `run-typography-composition-tests.ts` and `run-vision-review-tests.ts`: no observation ⇒ every score `null`, verdict `"unverified"`, `shippable: false`; a failed vision call never yields 10/10; an `unverified` review never triggers a correction render (K14) | **listed**: a failed review now says `unverified` instead of 10/10 |
| **0.3** | Remove 4:5; default 1:1; config size default `"1K"` | the live rows of K7's table; `config.ts:128` | new `run-ratio-parity-tests.ts`: the form's option list equals `IMAGE_ENGINE_CONFIG.SUPPORTED_ASPECT_RATIOS` (re-pointed at the registry in 2.3); the store default is `"1:1"`; no live server fallback returns `"4:5"` | **listed**: 4:5 disappears, default 1:1 |
| **0.4** | *(needs your yes — K13)* never retry after a timeout | `provider/ProviderErrorClassifier.ts:16`, `:159-165` | extend `run-render-rate-limit-tests.ts` or a new classifier test: `PROVIDER_TIMEOUT` ⇒ `retryable: false`; 429 and pre-processing 5xx still retry | **if approved**: a timed-out render is reported once, not paid up to three times |

---

## 5. Phase 1 — provider probe

### 5.1 Before spending anything

- **ImgStudio docs in the repo:** none exist (K9). The docx has no usable data (K9).
- **The probe script**: `apps/web/scripts/probe-imgstudio.ts`. It refuses to run unless both
  `--yes-i-approve-spending` and `--max-vnd <n>` are present and `n ≤ 4000`. It keeps a
  running total of `cost_vnd` from every response and **checks the next call's expected
  price against the cap before sending it**, so it never crosses the cap rather than noticing
  afterwards. It also stops on any balance error.
- **Records**: every request and response, headers included, to `apps/web/data/probe/<run>/`
  — `apps/web/data/` is gitignored, so nothing is committed. `Authorization`, `Cookie`,
  `Set-Cookie` and any field named like `key|token|secret` are replaced with `<REDACTED>`
  before writing. The key is read from the environment and never printed.
- **Test images for d)**: a red square, a blue circle and a green triangle generated locally
  with `sharp`. Free.
- **Output dimensions** are measured with `sharp().metadata()` on the downloaded file — the
  first time this has been measured rather than derived (K8).

### 5.2 Steps, exactly as specified

a) free: look for a list-models / capabilities endpoint (GET only)
b) Sunburst id: try `"gpt-image-2.5-sunburst"`, then `"GPT-Image-2.5-Sunburst"`, stop at the
   first success, confirm with the response's `provider_name`. No other guesses. Same for
   Flare only if the budget allows.
c) 1K tier: aspect ratios 1:1, 9:16, 16:9 with measured pixel dimensions; quality
   `low`/`medium`/`high` besides `standard`; whether a pixel-size field is accepted, and what
   it does
d) reference order: three shapes, roles assigned by number in the prompt
e) reference count: 4, then more, recording the limit
f) synchronous or job id — read from the responses already collected (free)
g) one Sunburst poster with "Khởi động ngày mới" / "Cold brew đậm vị, tươi mỗi sáng", image
   saved for you
h) latency: 3 samples each, Sunburst and Flare, identical settings; p50 / max
i) two simultaneous requests; record 429s, queueing and headers

### 5.3 Budget — estimate, and the order if the balance is short

At D11 prices (Sunburst 150, Flare 150). Whether a rejected call is charged is UNVERIFIED;
the adapter's comment says a definitively-rejected attempt is refunded
(`ImgStudioImageGenerationProvider.ts:445-446`).

| Priority | Step | Calls | Estimate (VND) |
|---|---|---|---|
| 1 | b) Sunburst id | ≤ 2 | 0–300 |
| 2 | c) three ratios, dimensions | 3 | 450 |
| 3 | g) Vietnamese poster | 1 | 150 |
| 4 | d) reference order | 1 | 150 |
| 5 | h) Sunburst latency (reuses c)'s 1:1 sample) | 2 | 300 |
| 6 | i) concurrency | 2 | 300 |
| 7 | e) reference count | 1–2 | 0–300 |
| 8 | c) quality values + pixel size | ≤ 4 | 0–600 |
| 9 | b) + h) Flare id and latency | ≤ 5 | 450–750 |
| | **total** | | **≈ 1,800 – 3,300** |

With ~3,700 VND in the account (K5, unverified) everything up to priority 8 fits; Flare
probably does not.

### 5.4 Output

`docs/migration/03-provider-capabilities.md`: confirmed ids with the response that confirms
each, measured dimensions per ratio, accepted quality values, the reference limit and whether
order survived, sync vs job id, latency samples, concurrency behaviour, the actual VND spent,
and an explicit "still unknown" list. **Then I stop.**

---

## 6. Phase 2 — registry and provider

| # | Task | Files | Tests |
|---|---|---|---|
| **2.1** | `ModelRegistry`: typed, validated at load, one JSON seed per D11 | new `apps/web/lib/image-engine/models/model-registry.ts`, `models/registry.v1.json` | `run-model-registry-tests.ts`: schema; only rows with a `providerModelId` **and** an `evidence` reference are `selectable`; default = Sunburst if selectable else NB2 (K4); every price is a number; ratio lists ⊆ provider-confirmed lists |
| **2.2** | Row fields | same | each row: `id`, `displayName`, `providerModelId \| null`, `evidence`, `promptDialect: "gpt-image" \| "gemini"`, `priceVnd`, `ratios`, `sizeMode: "aspect_tier" \| "pixels"`, `sizes[tier][ratio]`, `qualities`, `defaultQuality`, `tiers` (default `"1K"`), `maxReferenceImages`, `latencyMs: { p50, p95 }`, `timeoutMs` |
| **2.3** | Constants C11–C15 and audit §8.3 read from the registry | `config.ts:127-132`, `:145`, `:156-157`, `:172-175` become derived; `ImgStudioImageGenerationProvider.ts:73-77`, `:96-107`, `:135-175` | existing provider tests stay green; ratio-parity test now compares form ↔ registry |
| **2.4** | The ImgStudio transport takes a registry row (`provider_id`, size mode, quality values, max references). No new vendor client unless Phase 1 proves the API differs | `ImgStudioImageGenerationProvider.ts`, the seam from 0.1 | recorded-fixture tests: the multipart/JSON body for an NB2 row is **byte-identical to today's**; for a Sunburst row it carries the probe-confirmed fields |
| **2.5** | Size mapping. Pixel sizes only if Phase 1 shows they are accepted, and then validated: multiples of 16, edge ≤ 3840, ratio ≤ 3:1, ≤ 3,686,400 px. Fallback candidates as given (1K: 1024², 720×1280, 1280×720; 2K: 1920², 1440×2560, 2560×1440) — all four constraints check out for every candidate | `models/size-mapping.ts` | property test over every row × ratio × tier |
| **2.6** | Request contract: FormData gains `modelId`, `qualityTier`; validated against the registry; unknown ⇒ 400 with the allowed values; absent ⇒ default model and its default quality | `app/api/image/generate-simple/route.ts:87-216` | route-level test with a fake provider |
| **2.7** | Reference binding (R2), **GPT dialect only** — the Gemini templates are not touched: each reference is named by number **and** a short descriptor from the existing product manifest | prompt-v2 GPT files (Phase 3) | covered by the GPT checks |
| **2.8** | `ReferencePackingService` only when the row's limit requires it | `provider/reference-packing/ReferencePackingService.ts` call site | packing test parameterised by row |
| **2.9** | `/api/image/provider` returns models, prices, capabilities, `selectable`, default; hardcoded display names removed (C10) | `app/api/image/provider/route.ts` | response snapshot |
| **2.10** | Dialect routing: GPT rows → v2 GPT dialect, always; Gemini rows → today's `PROMPT_ENGINE` behaviour, unchanged | `prompt-v2/engine-selector.ts`, `ExperimentPipeline.ts:1261`, `:553` | the NB2 path produces the same prompt as today (golden suite unchanged) |

---

## 7. Phase 3 — GPT-dialect engine v2

New files only. The Gemini-dialect templates are not edited.

```
apps/web/lib/image-engine/prompt-v2/templates/gpt/
  system.v1.md
  request.v1.md
  playbooks/{poster,banner,social,hero,ugc}.v1.txt
  gold-examples/<asset>.with-copy.md, <asset>.no-copy.md     (10 files, K15)
apps/web/lib/image-engine/prompt-v2/
  gpt-brief.ts          upstream outputs + REFERENCE DATA block (D4, D8)
  gpt-checks.ts         the deterministic checks below
  gpt-fallback.ts       the code-only builder used after a failed repair
```

| # | Task | Detail |
|---|---|---|
| **3.1** | Dialect selection | from the registry row (2.10); `PROMPT_V2_TEMPLATE_VERSION` versions the GPT files independently |
| **3.2** | Brief | everything the Gemini v2 brief has, plus the upstream outputs (D4): Marketing Brain strategy, Creative Director selection, Visual DNA, inspiration style manifest, creative interpretation, blueprint, composition plan, typography DNA, resolved visual controls. **Physical numbers** from `CinematographyLayer` / `FinishLayer` go in a block headed `REFERENCE DATA — translate into plain description; never copy a number` (D8) |
| **3.3** | Master-prompt contract | the nine labelled sections in your order; 1,200–3,500 characters, configurable; OUTPUT states orientation, not the ratio digits (K12) |
| **3.4** | `gpt-checks.ts` | sections present and ordered · every required string verbatim, NFC, exactly once, inside TEXT · no other quoted strings (unquoted letter-spelling permitted, K12) · reference count and numbering equal what is attached · no physical-number tokens (`\d+K`, `f/`, `\d+mm`, `%`, `stops`, `\d+:\d+`) scanned **after** removing quoted strings · no unfilled `{{…}}` and no `[B1]`-style ledger token · length within bounds · orientation words match the ratio · verdict-word ban configurable, **off** by default |
| **3.5** | Failure policy | one repair call (existing); then `gpt-fallback.ts` builds a prompt in code from the same brief data. **Never v1.** `ProviderPromptOptimizer` is not applied |
| **3.6** | Playbook rules | poster: hero 55–65 % of frame, strict hierarchy, ~6 % margins · social_ad: one message, one CTA, high contrast, 9:16 safe zones top ~14 % / bottom ~20 % (configurable) · product_hero: product 50–70 %, studio light, contact shadows, minimal text · ugc_thumbnail: candid, real skin texture, no heavy retouching, 3–5 word text · banner: subject ~40 % on one side, clean negative space opposite. These percentages live in the playbooks as **instructions to the director**; the director must express them in words, and the number check forbids them in the final prompt |
| **3.7** | Tests | goldens per asset × ratio = **15 files**, from hand-written model replies, on the `run-prompt-engine-golden-tests.ts` pattern · `gpt-checks` unit tests · free mock eval · paid live eval behind `--yes-i-approve-spending` |

---

## 8. Phase 4 — latency and concurrency

### 8.1 Latency

| # | Task | Detail |
|---|---|---|
| **4.1** | Instrument first | a per-request timing collector in `AsyncLocalStorage`: route start, each LLM layer by name, the v2 call, the image call, storage, vision review. Written to the generation log and returned in the response as `timings`. Not derived from `RenderTracer` (K10, K11) |
| **4.2** | Measure before optimising | a breakdown from real renders — your own, or the live eval under its flag. Table in `04-result.md` |
| **4.3** | Optimise | parallelise independent upstream calls (the dependency graph is taken from the code, not assumed); a model per planning layer from config; vision review **after** the response via `after()` — supported on a Node.js server in this Next version (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`, Platform Support), stored as advisory, fail-closed per 0.2 |
| **4.4** | Timeouts and retries | per-model timeouts from the registry's measured p95; route and client ceilings raised to match; retries only for 429 and 5xx that arrive before processing; never on timeout (0.4); idempotency rules unchanged |
| **4.5** | If 60 s is infeasible | say so with the numbers, and give the options: Flare, a lower quality tier, fewer upstream layers. Not hidden (K1) |

### 8.2 Concurrency

| # | Task | Detail |
|---|---|---|
| **4.6** | No per-request module state | `RenderTracer` to `AsyncLocalStorage` (K11); audit every remaining static/module `let` on the render path and list it in `04-result.md` |
| **4.7** | Rate-limit store behind an interface | `lib/security/render-rate-limit.ts:42` `WINDOWS` becomes `InMemoryRateStore`; interface ready for Redis |
| **4.8** | Concurrency limiter | a global semaphore for ImgStudio calls (limit from Phase 1 i)) plus a per-user limit; excess waits up to a configurable maximum, then 429 or 503 with `Retry-After` and a plain-language message |
| **4.9** | `render_jobs`, migration `0014` | id, user_id, `access_token_hash` (§3.3), status, stage timings, model id, idempotency key, provider job id if any, output storage key, cost_vnd, balance_vnd, error. Behind a `JobStore` interface with two implementations — Supabase, and a local file store used when the database is not configured — so a render never fails because the database is down. **The migration file is written and tested; it is applied to your database only with your explicit go-ahead** |
| **4.10** | Recovery endpoint | `GET /api/image/jobs/[id]`, with the access rule from §3.3 |
| **4.11** | Storage behind an interface | `LocalGeneratedImageStorage` becomes one implementation of a `BlobStore`; an S3/R2-compatible one later. Server-minted `crypto.randomUUID()` ids only (K11) |
| **4.12** | Multi-instance notes | what must change: the limiter and rate store are per-process; `after()` work dies with its instance; local disk storage is per-machine |

### 8.3 Streaming or plain JSON — I pick streaming

**NDJSON on the same POST**: first line `{ job_id }`, then one line per stage, then the
result. A client that sends `Accept: application/json` gets today's single JSON response,
unchanged — that is the rollback path and keeps every existing caller working.

Why not 202 + polling: with no queue (D6), something still has to run the render after the
202 is sent. That something would be `after()` — the same process holding the same work, just
with no connection to report progress on. Streaming keeps the render inside the request
lifecycle exactly as today, adds progress for free, and the `render_jobs` row plus 4.10 cover
a disconnect. When a queue arrives, the POST becomes enqueue-and-stream-the-job's-events, and
the client does not change.

**UNVERIFIED, checked in 4.9 before relying on it:** whether this Next version aborts a route
handler when the client disconnects mid-stream. If it does, the render must be decoupled from
`req.signal` so a closed tab does not abandon a render the reseller has already charged for.

---

## 9. Phase 5 — UI

Live components only: `features/picture-engine/components/brief/CreativeBriefPanel.tsx`,
`CreativeDirectionSelector.tsx`, `stores/picture-engine.store.ts`,
`services/picture-engine.api.ts`. The dead components (D10) are not touched.

| # | Task |
|---|---|
| **5.1** | Model selector from `/api/image/provider`; price shown as information; Sunburst default (K4 rule) |
| **5.2** | Quality tier and ratio options from the selected model's capabilities; unsupported options disabled, not hidden |
| **5.3** | 4:5 gone (done in 0.3; this re-checks it against the registry) |
| **5.4** | Progress states from the NDJSON stream; recovery through `/api/image/jobs/[id]` after a reload |
| **5.5** | `modelId` and `qualityTier` sent in the FormData (2.6) |

---

## 10. CLAUDE.md diff (rules 5, 8, 10)

Applied only after you approve this plan, in its own commit.

### 10.1 Rule 5

```diff
- 5. Không thêm image provider ngoài Nano Banana 2.
+ 5. Mỗi job render dùng đúng MỘT image provider/model, chọn từ ModelRegistry; không trộn
+    model trong một job. Họ GPT-Image-2.5 (qua ImgStudio) là mặc định. Nano Banana vẫn
+    chọn được và giữ prompt dialect riêng (engine v1/v2 Gemini). Thêm một model = thêm một
+    hàng registry có providerModelId đã được xác minh bằng probe; không sửa code render.
```

### 10.2 Rule 8

```diff
- 8. One-pass: AI image được render Copy chiến dịch, Headline, Giá tiền và CTA, nhưng CHỈ các
-    chuỗi có trong Sổ chuỗi (Ledger) của `TextLedgerSystem`, nguyên văn từng ký tự, mỗi
-    chuỗi đúng một lần, do `OpticalCompiler` phát ra ở Block 8. VẪN CẤM AI tự sinh logo
-    hoặc nhãn hiệu giả: logo chỉ xuất hiện từ asset người dùng cung cấp. Subtitle và legal
-    text của video vẫn dựng deterministic ở Composer.
+ 8. One-pass: AI image được render Copy chiến dịch, Headline, Giá tiền và CTA, nhưng CHỈ các
+    chuỗi người dùng cung cấp, nguyên văn từng ký tự (NFC), mỗi chuỗi đúng một lần. Nơi
+    chuỗi được phát ra tùy dialect: dialect Gemini — Sổ chuỗi của `TextLedgerSystem` ở
+    Block 8 của `OpticalCompiler` (engine v1) hoặc `copy_final` (engine v2); dialect GPT —
+    mục TEXT của master prompt, kiểm bằng `gpt-checks.ts`. VẪN CẤM AI tự sinh logo hoặc
+    nhãn hiệu giả: logo chỉ từ ảnh LOGO người dùng cung cấp, đặt nguyên trạng. Subtitle và
+    legal text của video vẫn dựng deterministic ở Composer.
```

### 10.3 Rule 10

```diff
- 10. Không hard-code model name, giá, quota hoặc capability.
+ 10. Không hard-code model name, giá, quota hoặc capability. Model id, giá tham khảo
+     (price_vnd), tỷ lệ và kích thước, số ảnh tham chiếu tối đa, mức chất lượng, độ trễ và
+     timeout nằm trong ModelRegistry; code chỉ đọc registry.
```

### 10.4 Proposed, only if you authorise K6

```diff
  docs/00-master-system-spec.md — Locked decisions
- 4. Nano Banana 2 là image model duy nhất.
+ 4. Mỗi job dùng một image model chọn từ ModelRegistry; GPT-Image-2.5 là mặc định,
+    Nano Banana chọn được.

  docs/00-master-system-spec.md — Responsibility
- | AI images | Nano Banana 2 |
+ | AI images | Image model chọn từ ModelRegistry (mặc định GPT-Image-2.5) |

  docs/10-acceptance-criteria.md — Product
- - Nano Banana 2 là AI image provider duy nhất.
+ - Mỗi job render bằng đúng một image model từ ModelRegistry.
```

---

## 11. Rollback

| Level | How | Effect |
|---|---|---|
| per commit | `git revert <sha>` — every task is its own commit | removes one task |
| per model | registry row `selectable: false`, or point the default at NB2 | GPT models disappear; NB2 renders as today |
| GPT dialect | none needed — choosing NB2 routes to today's engines unchanged (2.10). By decision there is **no** v1 fallback for GPT rows | |
| streaming | the client sends `Accept: application/json` | today's single JSON response |
| jobs table | the `JobStore` falls back to the local file store when the database is not configured | renders do not depend on the migration |
| everything | `git checkout feat/prompt-engine-v2` | the state before this branch |

---

## 12. Order, stop points, and what each commit must keep green

```
Step A  this plan ────────────────────────────────────── STOP — your approval + answers to K1–K6
Phase 0 0.1 → 0.2 → 0.3 → (0.4 if approved)
        CLAUDE.md amendment (§10), separate commit
Phase 1 probe ────────────────────────────────────────── STOP — your review of 03-provider-capabilities.md
Phase 2 2.1 → 2.10
Phase 3 3.1 → 3.7
Phase 4 4.1 → 4.2 (measure) → 4.3 → 4.4 → 4.6 → 4.12
Phase 5 5.1 → 5.5
Final   04-result.md ─────────────────────────────────── STOP
```

Phases 2–5 run continuously. Every commit: typecheck stays at 4 errors (all in `scratch/`),
lint stays at or below 1339, the test suite keeps every currently passing test passing and
adds its own. No real image or LLM call except the Phase 1 probe and the flag-guarded live
eval. No key printed or committed. Nothing under `scratch/` committed. The Gemini-dialect
templates, `packages/picture-engine`, the dead UI components and
`GeminiImageGenerationProvider.ts` are not touched.

### What I need from you to start Phase 0

1. **K1** — is 60 s a p50 or a p95 target?
2. **K2** — option A or B for the seam?
3. **K3** — only if A: the two `TIDO_IMAGE_PROVIDER` values, or permission to read them
4. **K4** — may the NB2 row carry `flow-nano-banana-2` on the recorded evidence?
5. **K5** — top up before Phase 1, or run the probe in the §5.3 priority order?
6. **K6** — may I amend the three lines in `docs/00` and `docs/10`?
7. **K13** — move "no retry on timeout" into Phase 0 as 0.4?
8. **§3.3 item 5** — keep anonymous rendering after launch, or require sign-in?
