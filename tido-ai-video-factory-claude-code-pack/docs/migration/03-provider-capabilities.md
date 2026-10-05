# 03 — Provider capabilities (Phase 1 probe)

**Result: the Sunburst `provider_id` was not found. Every other step depends on it, so
the probe stopped after two calls.** Nothing below about Sunburst is known yet.

Run `2026-10-05T15-52-14-510Z`. Script: `apps/web/scripts/probe-imgstudio.ts`
(commit `4bc7c5a`). Raw records, redacted:
`apps/web/data/probe/2026-10-05T15-52-14-510Z/` — gitignored, not committed.

---

## 1. What was sent

Both calls were identical except for `provider_id`: text-only, so the JSON branch of
`POST https://imgstudio.site/api/v1/images/generate`, with

```json
{ "provider_id": "<candidate>", "aspect_ratio": "1:1", "resolution": "1K", "quality": "standard",
  "prompt": "A photorealistic product photograph of a plain white ceramic coffee cup …" }
```

headers `Authorization: Bearer <REDACTED>`, `Idempotency-Key: probe-<run>-<n>-<random>`,
`Content-Type: application/json`.

The two candidates are exactly the ones you specified, in your order. No other id was
tried.

## 2. What came back

| # | `provider_id` | HTTP | body | time |
|---|---|---|---|---|
| 01 | `gpt-image-2.5-sunburst` | **404** | `{"error": "Provider không tồn tại", "status": "error"}` | 1,081 ms |
| 02 | `GPT-Image-2.5-Sunburst` | **404** | `{"error": "Provider không tồn tại", "status": "error"}` | 150 ms |

Response headers were ordinary (`server: nginx`, `content-type: application/json`, HSTS,
`x-frame-options: SAMEORIGIN`, and Next.js `vary: rsc, next-router-*` headers — the API
appears to be served by a Next.js app). **No header or body field lists the valid
provider ids.**

## 3. Money

| | |
|---|---|
| calls | 2 |
| `cost_vnd` reported | none — neither response carried the field |
| `balance_vnd` reported | none — so the balance before and after is **not known** |
| spent, by the probe's ledger | **0 VND** |

Whether a 404 for an unknown provider is charged is **UNVERIFIED**, because no response
in this run reported a balance. It is very probably free — the server answered in
150 ms, i.e. it rejected the id before any rendering — but that is an inference, not a
measurement. The next successful call will report `balance_vnd`, and comparing it with
your dashboard will settle it.

## 4. What this run did establish

Small, but recorded rather than assumed:

1. **An unknown `provider_id` is rejected with HTTP 404 and a JSON body
   `{"error", "status": "error"}`**, before any rendering (150 ms). The id is validated
   server-side against a list the API does not expose in its error.
2. **Neither the lowercase slug nor the display name is the id.** The working id for
   Nano Banana 2 is `flow-nano-banana-2` (recorded evidence in plan K4), a slug with a
   `flow-` prefix that is not derived from the display name "Flow · Nano Banana 2" by
   any rule I could infer — so the Sunburst id cannot be derived from its display name
   either.
3. **The app's adapter already handles this correctly.** A 404 falls into "any other
   4xx" in `ProviderErrorClassifier.classify` → `INVALID_REQUEST`, `STOP`: a wrong
   `IMGSTUDIO_PROVIDER_ID` fails once with the server's message and is not retried.

## 5. Still unknown — everything Phase 2 needs

| # | Unknown | Blocks |
|---|---|---|
| U1 | **the Sunburst `provider_id`** | everything below |
| U2 | whether `aspect_ratio` 1:1 / 9:16 / 16:9 are accepted for Sunburst, and the **pixel dimensions** each produces at the 1K tier | size mapping, the profile entry |
| U3 | whether 4:5 is accepted | (informational only; it is already removed from the form) |
| U4 | Vietnamese text quality and product-label fidelity with a reference | the core quality question |
| U5 | whether reference **order and numbered roles** survive the edit endpoint | reference binding (R2) |
| U6 | Sunburst **latency** — the input to the 60 s goal and to every timeout | timeouts, the latency report |
| U7 | the **reference-count limit** for Sunburst | `ReferencePackingService` decision |
| U8 | which **`quality`** values are accepted (`low`/`medium`/`high`?) | the profile entry |
| U9 | whether a **pixel-size** field is accepted, and what it does | size mode |
| U10 | **sync vs job id** — the two responses are errors, so they show nothing about the success shape for Sunburst | timeout design |
| U11 | the **price** of a Sunburst call, and whether a rejected call is charged | — |
| U12 | the Sunburst-Quality-Slow id | step 7 |

## 6. How to get U1, and what happens next

The id has to come from ImgStudio, not from guessing. In order of preference:

1. **You read it from the ImgStudio dashboard or its API docs** — the exact string the
   API accepts as `provider_id`, as `flow-nano-banana-2` is for Nano Banana 2. Fill the
   placeholder you left in decision 1.
2. **You authorise one free call to a listing endpoint.** The API is a Next.js app with a
   provider registry server-side; it may expose a list (for example `GET /api/v1/providers`
   or `GET /api/v1/models`). That would be a guess at an endpoint, not at an id, and a GET
   costs nothing — but it is outside the steps you authorised, so I have not made it.

With the id in hand, the rest of the probe runs unchanged with `--provider-id <id>`
(the discovery step is skipped and the 1:1 ratio call is made as part of step 2):

```bash
npx tsx --env-file=.env.local scripts/probe-imgstudio.ts --yes-i-approve-spending --max-vnd 4000 --provider-id <id>
```

Estimated cost at 150 VND per render: about 12–13 calls, **≈ 1,800–2,000 VND**, within
the cap. The probe re-checks the cap before every call and stops on any balance error.
