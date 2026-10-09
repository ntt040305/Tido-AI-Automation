# Art-director upgrade — handoff

Updated after every commit. Read this first if you are picking the work up cold.

## Where it stands

**Round 1 (done, four commits ending `c856a84`).** The `GPT_ART_DIRECTOR` path: Art
Direction Sheet (Zod), `words.ts` translation, precedence, print rule, text manifest,
realism block, nine flag-gated linter rules, v2 templates, 14 golden briefs ON and OFF.

**Round 2 Step 1 (done, `72c7951`).** Defect fixes from the Round 1 report.

**Round 2 Step 2 (done, this commit).** Per-product vision facts behind
`GPT_PRODUCT_VISION`: one call over the packed sheets, universal material physics,
print-rule branch (c) now reachable. No real call made.

**Next: Step 3** — Phase 5 post-render vision QC behind `GPT_VISION_QC`. Starts with the
one authorised in-place bug fix: `VisionReview.ts:353` filters on `f.blocking` while
findings carry `severity`, so the re-render path has never fired.

## Flags

| Flag | Default | What it does |
|---|---|---|
| `GPT_ART_DIRECTOR` | OFF | The sheet writes the Sunburst brief. Rollback = unset. |
| `GPT_NUMERIC_WORDS` | `words_only` | `words_plus_percent` spells percentages in the layout sections. |
| `GPT_PRODUCT_VISION` | OFF | One vision call reads the packed sheets; material drives the light. Needs `GPT_ART_DIRECTOR` too. |
| `GPT_VISION_QC` | — | Step 3. Not built yet. |

## Step 1, item by item

| Item | State | Where |
|---|---|---|
| 1a contrast guard | done | `words.ts` (`relativeLuminance`, `contrastRatio`, `accentSeparates`, `readableNeutralFor`), `art-direction-sheet.ts` `derivePalette` |
| 1b numeric hygiene | done | `roundNumbers()` applied once before the Zod parse |
| 1c mood image reaches the sheet | done | one write-back in `SimpleImageGenerationOrchestratorService.ts`; `set.mood_reference` on the sheet |
| 1d order-dependency guard | done | `sheet_fallback_reason` + a source test that fails if the call order reverses |
| 1e culture signals | done | `request.v2.md` names the apricot/cherry blossom failure; asserted present |
| 1f prompt length | **partial** | mean 932 → 763 words. 10 of 16 code-built prompts still exceed 700. See below. |
| 1g quoted-digit exemption | done | three tests: prices pass, a stray `85mm` fails, invented discount copy fails |
| 1h full sweep | done | see the commit message |
| 1i evidence | done | `golden/gpt-ad/*.txt` carries prompt + sheet per brief |

## Step 2, item by item

| Item | State | Where |
|---|---|---|
| 2a one vision call, Zod output | done | `art-direction/product-vision.ts`. Reuses `LLMProviderService` with `image_url`, the transport the inspiration layer already uses. No new provider. |
| 2b wired into the sheet | done | `material-physics.ts` → `deriveLighting`, `deriveCamera`, `deriveProducts`. Dominant material by visible area; secondary gets a fill rule. |
| 2c reliability | done | hash cache (bytes + prompt version), raced timeout, every failure returns `vision: null` and the sheet keeps today's defaults |
| 2d mocked tests | done | `run-product-vision-tests.ts`, 46 checks, five material cases, no real call |
| 2e guarded script | done | `scripts/eval-product-vision.ts`. **Not run.** |

Two bugs the tests caught, both mine: `sizeFor` matched "two-handed" against its
one-handed `hand` pattern (so a two-handed box got the +25mm meant for a palm-sized
thing), and the golden comparison broke on CRLF after a branch switch.

## Open risks

1. **1f is not fully met.** The target is 500–700 words. The DIRECTOR is told that and its
   bounds allow it (2,800–4,800 chars ≈ 470–800 words). The CODE-BUILT fallback runs
   623–923 words because it states the sheet literally and cannot compress like prose;
   `gptFallbackMaxChars` gives it 7,500 chars for that reason. Cutting the remaining ~200
   words means dropping the realism block, the manifest or the zones — all contract items.
   **A human should decide** whether the fallback is allowed its own word budget.
2. **A saturated field carries no type at AA.** `readableNeutralFor` returns the best
   available and the shortfall is recorded, but a brand whose primary is a saturated red
   has specified a field small type cannot sit on. The sheet does not yet refuse it.
3. **Editable mode does not get the mood image.** `renderSource` shallow-copies the request
   there, so the orchestrator's write-back lands on the copy. Editable renders the scene
   only and does not use this path today. `ponytail:` comment at the write-back.
4. **No real vision call has ever been made.** Every assertion about the vision pass is
   against a mocked reply. If a real model misreads a glass cup as matte plastic, the
   lighting plan inverts — backlight becomes raking light — and nothing in the logs says
   so beyond the recorded conflict line. `scripts/eval-product-vision.ts`, ~50 VND, unrun.
5. **Branch (c) trusts `legible`.** A model that reports a label as legible when it
   guessed is how invented lettering reaches a real product. The prompt pushes hard against
   it and `legible: false` keeps branch (b), but this is unverified against a real model.
6. **466px label-lock still unverified.** `scripts/eval-gpt-label-lock.ts`, ~1,000 VND,
   unrun.
7. **The D2 A/B is unrun** and its render loop is deliberately unwritten.
   `scripts/eval-gpt-density.ts`.

## Rules in force

- Additive only. Nothing deleted. The one in-place bug fix authorised for Round 2 is
  `VisionReview.ts:353` (Step 3a) — not yet done.
- No paid calls. Mocks and recorded fixtures only.
- No creative value keyed on industry, product type or occasion. There is a static source
  test and a behavioural test; extend both for every new code path.
- Digits and units stay out of the master prompt. Quoted client strings are exempt.
- Do not touch `apps/web/scratch/healthy_checkpoints.json` or
  `apps/web/scratch/healthy_final_provider_prompt.txt`.
- tsc 0 errors outside `scratch/`; lint at baseline 1339.

## Commands

```bash
npx tsx lib/image-engine/run-art-direction-tests.ts
npx tsx lib/image-engine/run-gpt-golden-tests.ts            # add --update to rewrite
npx tsx lib/image-engine/run-product-vision-tests.ts
npx tsx lib/image-engine/run-all-tests.ts --keep-going
```

## Full sweep, 2026-10-09

`63/63 suites · 2077 passed, 20 failed`. Four suites red, and all four are
**pre-existing**: verified by running them at `19556d9`, the commit before any
art-director work, where the counts are identical. They are source-assertion tests about
`ExperimentPipeline` call ordering — `run-vision-loop-tests` (1),
`run-creative-director-tests` (2), `run-design-output-tests` (1). Not investigated
further; out of scope for this work.
