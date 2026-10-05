# 03 — Provider capabilities (Phase 1 probe)

**GPT-Image-2.5-Sunburst is confirmed, and measured.** Every number below comes from a
recorded response, not from documentation or memory.

| | |
|---|---|
| `provider_id` | **`0927e191-1aef-4c56-a3ac-df0c47d84e80`** — taken from the ImgStudio web UI request, confirmed by the API |
| confirmed by | response `provider_name: "GPT-Image-2.5-Sunburst"`, `model: "gpt-image-2.5-sunburst"` on every successful call |
| runs | `apps/web/data/probe/2026-10-05T16-27-40-003Z/` (12 calls) and `…/2026-10-05T16-33-38-401Z/` (2 calls, order test) |
| script | `apps/web/scripts/probe-imgstudio.ts` — commits `545eced`, `ceebae3` |
| spent | **1,950 VND** (1,450 + 500), measured from `cost_vnd` and confirmed by the balance delta |
| balance | **3,245 → 1,295 VND** |

Raw request/response records, with headers, are on disk under `apps/web/data/probe/`
(gitignored, not committed). `Authorization` and every credential-shaped field are
redacted.

---

## 1. The success response — synchronous, image by URL

```json
{
  "id": "9c7083c4-02fd-4038-a9d4-60c495f0ac5b",
  "status": "completed",
  "prompt": "<the prompt, echoed>",
  "provider_name": "GPT-Image-2.5-Sunburst",
  "model": "gpt-image-2.5-sunburst",
  "aspect_ratio": "1:1",
  "resolution": "1K",
  "quality": "standard",
  "cost_vnd": 150,
  "balance_vnd": 3095,
  "url": "/api/v1/images/9c7083c4-02fd-4038-a9d4-60c495f0ac5b/file",
  "created_at": "2026-10-05T16:27:32.611Z",
  "reused": false
}
```

- **Synchronous.** The image is finished when the POST returns. No job id, no polling
  field, no queue header on any call.
- **The image comes by URL**, fetched with the same Bearer key: `image/webp`,
  `Cache-Control: private, max-age=31536000, immutable`. No inline base64.
- `reused: false` on every call: the API reports whether it served an idempotent replay.
- **Same shape as Nano Banana 2.** These are exactly the fields the existing adapter
  already reads (`ImgStudioImageGenerationProvider.ts`: `status`, `url`, `id`,
  `cost_vnd`, `balance_vnd`, `provider_name`, `model`). The transport needs no change to
  parse Sunburst.

## 2. Measurements

### 2.1 Every call

| # | Call | Sent | Echoed `quality` | HTTP | Pixels | VND | Request time |
|---|---|---|---|---|---|---|---|
| 1 | first call | 1:1, 1K, `high` | `standard` | 200 | 1024×1024 | 150 | 17.3 s |
| 2 | quality standard | 1:1, 1K, `standard` | `standard` | 200 | 1024×1024 | 150 | 19.8 s |
| 3 | + `background: "opaque"`, `count: 1` | 1:1, 1K, `high` | `standard` | 200 | 1024×1024 | 150 | 17.0 s |
| 4 | ratio 9:16 | `high` | `standard` | 200 | **720×1280** | 150 | 18.3 s |
| 5 | ratio 16:9 | `high` | `standard` | 200 | **1280×720** | 150 | 16.1 s |
| 6 | ratio 4:5 | `high` | — | **400** `"Tỷ lệ ảnh không hợp lệ"` | — | 0 | 0.07 s |
| 7 | Vietnamese poster, 1 reference | 9:16, `high` | `standard` | 200 | 720×1280 | **250** | 19.3 s |
| 8 | reference order, 3 images | `high` | — | **400** `"Provider này chỉ hỗ trợ chỉnh sửa tối đa 2 ảnh mỗi lần."` | — | 0 | 0.07 s |
| 9 | latency sample 2 | = call 1 | `standard` | 200 | 1024×1024 | 150 | 23.6 s |
| 10 | latency sample 3 | = call 1 | `standard` | 200 | 1024×1024 | 150 | 17.9 s |
| 11 | 4 references | `high` | — | **400** `"…tối đa 2 ảnh mỗi lần."` | — | 0 | 0.12 s |
| 12 | + `size: "1280x720"`, ratio 1:1 | `high` | `standard` | 200 | **1024×1024** | 150 | 21.3 s |
| 13 | order test, 2 refs, red then blue | `high` | `standard` | 200 | 1024×1024 | 250 | **76.4 s** |
| 14 | order test, 2 refs, blue then red | `high` | `standard` | 200 | 1024×1024 | 250 | 13.1 s |

"Request time" is the POST alone; the image download added well under a second.

### 2.2 What that establishes

| Question | Answer | Evidence |
|---|---|---|
| Supported ratios at 1K | **1:1 → 1024×1024, 9:16 → 720×1280, 16:9 → 1280×720** | calls 1, 4, 5 — measured with `sharp`, not derived. These are exactly the 1K candidates in your decision |
| 4:5 | **rejected**, HTTP 400, before rendering, not charged | call 6 |
| Price | **150 VND text-only, 250 VND with a reference image** | `cost_vnd` on every call; the edit endpoint costs more |
| Reference limit | **2 images per edit**, rejected before rendering, not charged | calls 8 and 11, server message verbatim |
| Reference binding | **"Image N" binds to the Nth attached file**, in both orders | calls 13–14: the prompt never described the shapes, only where Image 1 and Image 2 go; swapping the attachments swapped the colours in both regions |
| `quality` | **the API echoes `"standard"` whatever is sent.** `"high"` cost the same, produced the same dimensions, and showed no visible difference | calls 1–3, 4–14 all echo `standard`; side-by-side review of calls 1, 2, 3 |
| `background`, `count` | **accepted** (HTTP 200), **no visible or measurable effect** | call 3 |
| Pixel-size field `size` | **accepted and ignored**: asked for 1280×720, got 1024×1024 | call 12 |
| Sync or job | **synchronous**, image URL in the response | every success |

### 2.3 Latency

| Set | Samples | p50 | max |
|---|---|---|---|
| identical settings (calls 1, 9, 10: 1:1, 1K, text-only) | 17.3, 17.9, 23.6 s | **17.9 s** | 23.6 s |
| every successful render (11 calls) | 13.1 – 76.4 s | **18.3 s** | **76.4 s** |

For comparison, today's model measured **61.9 s p50** for the image call
(`docs/migration/02-plan.md` K1). Sunburst is about **3.4× faster at the median.**
But one call in eleven took 76.4 s — four times the median — on an ordinary two-image
edit. A timeout set from the median would have killed it. With n = 11 the tail is not
characterised; the timeout should be set from a larger sample.

## 3. Visual notes

**Vietnamese poster** (call 7, `07-5-vietnamese-poster.webp`, saved for your review):

- Headline **"Khởi động ngày mới"** and sub **"Cold brew đậm vị, tươi mỗi sáng"** rendered
  with **every diacritic correct** — ở, đ, ộ, à, ớ; đ, ậ, ị, ư, ơ, ỗ, á. Placement, size
  hierarchy and colour followed the prompt.
- The reference product's label **"COLD BREW / ARABICA / 250 ML" was reproduced exactly**,
  same layout, no added lettering.
- The **bottle silhouette was reinterpreted**: rounder shoulders and a shorter neck than
  the reference. The reference was a flat synthetic graphic, not a photograph, which
  invites reinterpretation — a real product photo is the better test of shape fidelity.

**Quality** (calls 1, 2, 3 side by side): three photorealistic images of the same subject
with no difference attributable to `high`, `standard` or `background: "opaque"`.

**Order test** (calls 13–14): correct objects in correct corners both times. Faint
light-grey text-like smudges appear in the white background although the prompt said
"No text" — minor, but worth watching on clean studio backgrounds.

## 4. The balance, and the two 404 calls from the earlier run

The balance before today's first call was **3,245 VND**. Working forward from the last
recorded reading (4,500 VND on 2026-10-02 16:01:23Z) and the 8 completed renders the
generation log shows since then at 100 VND each, it should have been **3,700 VND**.
**455 VND is unaccounted for.**

The two 404 calls (2026-10-05 15:52 UTC) are an unlikely cause — they returned no
`cost_vnd` and were rejected in 150 ms — and so are today's three 400s, which the balance
deltas show cost nothing. More likely: renders made in the ImgStudio web UI while finding
the id. **Only the dashboard's transaction history can settle it**; look between
2026-10-03 08:45 UTC and 2026-10-05 16:27 UTC.

## 5. What this changes for Phase 2

1. **Reference limit is 2, not 3.** Product + logo fills it. A style reference can only go
   as text — which is today's default anyway
   (`WITHHOLD_INSPIRATION_IMAGE_FROM_PROVIDER`, `config.ts:144`). More than two products
   need `ReferencePackingService`.
2. **Sizes are aspect-ratio + tier, not pixels.** The `size` field is ignored, so the
   profile uses `aspect_ratio` + `resolution`, exactly as the adapter sends today.
3. **`quality` appears to have no effect through this API.** Sending `"high"` is harmless
   and matches the web UI, but nothing measured says it does anything.
4. **Reference binding by number works**, so the master prompt can name references as
   "Image 1", "Image 2" in attachment order, with a visual descriptor as the second
   anchor.
5. **Timeouts.** The median says ~20 s; the observed maximum says 76 s. The current
   provider timeout is 160 s, which already covers what was seen.
6. **Edits cost 250 VND, not 150.** Most real jobs carry a product reference, so most
   renders will cost 250.

## 6. Still unknown

| # | Unknown | Why it matters |
|---|---|---|
| U1 | **whether `"high"` reaches the model at all.** The web UI sends `"high"`; we do not know what its response echoes | if the web UI gets a different result, the API path is missing something |
| U2 | **the maximum prompt length** Sunburst accepts through ImgStudio. All probe prompts were short; today's v1 prompt is ~26,000 characters | the live app is now sending Gemini-dialect prompts to Sunburst — see §7 |
| U3 | the latency tail: n = 11 is too small for a p95 | timeout setting |
| U4 | shape fidelity with a **real product photograph** | the synthetic reference invited reinterpretation |
| U5 | whether the 2-image limit counts a logo the same as a product | product + logo + style planning |
| U6 | behaviour under concurrent requests (not in this run's steps) | the many-users decision |
| U7 | the 455 VND discrepancy (§4) | billing trust |
| U8 | resolution tiers above 1K: accepted values and prices | later |
| U9 | the Sunburst-Quality-Slow id | step 7 was skipped; no id was supplied |

## 7. Live app warning

`IMGSTUDIO_PROVIDER_ID` in `apps/web/.env.local` now holds the Sunburst id, as requested.
**From the next dev-server restart, the live app renders with Sunburst using today's
engines unchanged:** the Gemini-dialect prompt (engine v2 while `PROMPT_ENGINE=v2`),
`quality` from the environment, and the adapter's **3-reference** limit — so a job
carrying product + logo + style reference will be **refused with HTTP 400** by Sunburst's
2-image limit until Phase 2 sets the profile. Rollback is the previous value, kept in
`apps/web/.env.local.bak-before-sunburst` (gitignored).

There is no Sunburst profile entry in the code yet. It is created in Phase 2 with the id
above.

---

## History — the first run, 2026-10-05 15:52 UTC

Discovery by the two candidate ids specified at the time, in order:

| `provider_id` | HTTP | body | time |
|---|---|---|---|
| `gpt-image-2.5-sunburst` | 404 | `{"error": "Provider không tồn tại", "status": "error"}` | 1,081 ms |
| `GPT-Image-2.5-Sunburst` | 404 | `{"error": "Provider không tồn tại", "status": "error"}` | 150 ms |

Neither is the id. The lowercase slug is, however, what the API now returns as `model`
for the real id — the `provider_id` is an opaque UUID, not the model name. Records:
`apps/web/data/probe/2026-10-05T15-52-14-510Z/`.
