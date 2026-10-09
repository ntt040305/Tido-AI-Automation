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

**Round 2 Step 3a (done, `e1baaa4`).** The authorised in-place bug fix:
`judgeTypography` filtered on `f.blocking` while a `TypographyFinding` carries `severity`,
so the re-render path had never fired once.

**Round 2 Step 3b-3e (done, this commit).** Post-render vision QC behind `GPT_VISION_QC`:
the render is compared against the same Art Direction Sheet that produced it, auto-fails
outrank scores, `unverified` is delivered and never looped on, and at most two retries are
bounded by both a count and a hard VND ceiling. No real call made.

**Round 2 is complete.** Nothing in Steps 1-3 is left unstarted. Two things are
deliberately NOT done and are listed under Open risks: the 500-700 word target is met for
the director and not for the code-built fallback, and no paid call of any kind has been
made, so every assertion about a vision model is against a mocked reply.

## Flags

| Flag | Default | What it does |
|---|---|---|
| `GPT_ART_DIRECTOR` | OFF | The sheet writes the Sunburst brief. Rollback = unset. |
| `GPT_NUMERIC_WORDS` | `words_only` | `words_plus_percent` spells percentages in the layout sections. |
| `GPT_PRODUCT_VISION` | OFF | One vision call reads the packed sheets; material drives the light. Needs `GPT_ART_DIRECTOR` too. |
| `GPT_VISION_QC` | OFF | The render is QC'd against its sheet; at most 2 retries, capped in VND. Needs `GPT_ART_DIRECTOR`. |
| `GPT_VISION_QC_THRESHOLD` | `8.5` | Mean score a verified render must reach. |
| `GPT_VISION_QC_MAX_RETRIES` | `1` | Hard maximum 2, whatever is set. |
| `GPT_RENDER_COST_CAP_VND` | `600` | Total per request, every attempt and QC call counted. |

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

## Step 3, item by item

| Item | State | Where |
|---|---|---|
| 3a bug fix | done, `e1baaa4` | `VisionReview.ts` — `f.blocking` → `f.severity === "blocking"`. Before/after in that commit message. |
| 3b QC against the sheet | done | `art-direction/vision-qc.ts`. Seven auto-fail codes, six 1-10 scores, Zod-validated. |
| 3c fail-closed | done | `verdict: "unverified"` reused from `TypographyCritique` rather than invented. Delivered and flagged; never looped on. |
| 3d one targeted retry | done | `correctionFor` per code, appended to the same prompt. Count + VND cap, both checked before the attempt. Wired at both `wrapProvider` call sites. |
| 3e mocked tests | done | `run-vision-qc-tests.ts`, 35 checks |

One smell my own test caught: `text_not_verbatim` and `text_missing` produced an identical
correction, which would make a retry impossible to attribute to the fault that caused it.
Now each leads with the thing that actually went wrong.

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
4. **The QC model's honesty about `unverified` is unverified.** A model that claims it can
   read small text it cannot is how a correct render gets retried and a wrong one gets
   shipped. The question puts the escape hatch before the fault list and says in three
   places not to guess, but nothing has tested it against a real model. This is the single
   biggest open risk in Step 3.
5. **No real vision call has ever been made.** Every assertion about the vision pass is
   against a mocked reply. If a real model misreads a glass cup as matte plastic, the
   lighting plan inverts — backlight becomes raking light — and nothing in the logs says
   so beyond the recorded conflict line. `scripts/eval-product-vision.ts`, ~50 VND, unrun.
6. **Branch (c) trusts `legible`.** A model that reports a label as legible when it
   guessed is how invented lettering reaches a real product. The prompt pushes hard against
   it and `legible: false` keeps branch (b), but this is unverified against a real model.
7. **466px label-lock still unverified.** `scripts/eval-gpt-label-lock.ts`, ~1,000 VND,
   unrun.
8. **The D2 A/B is unrun** and its render loop is deliberately unwritten.
   `scripts/eval-gpt-density.ts`.

## Rules in force

- Additive only. Nothing deleted across all of Round 2. The one in-place bug fix
  authorised for Round 2 was `VisionReview.ts:353`, done in Step 3a with before/after in
  that commit message and a regression test in `run-vision-review-tests`.
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
npx tsx lib/image-engine/run-vision-qc-tests.ts
npx tsx lib/image-engine/run-all-tests.ts --keep-going
```

## Full sweep, 2026-10-09 (final)

`65/65 suites · 2176 passed, 4 failed`, confirmed by two independent runs on the final
tree.

All 4 failures are in 3 **pre-existing** suites, verified by running them at `19556d9` —
the commit before any art-director work — where the counts are identical:
`run-vision-loop-tests` (1), `run-creative-director-tests` (2), `run-design-output-tests`
(1). They are source-assertion tests about `ExperimentPipeline` call ordering. Not
investigated further; out of scope for this work.

A mid-Round-2 sweep read 20 failures. Fourteen of those were `run-gpt-golden-tests`
failing on CRLF after a branch switch (now normalised on both sides) and one was
`run-typography-composition-tests`, which the Step 3a fix turned green.
