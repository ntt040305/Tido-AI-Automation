# Prompt engine v2

One LLM call writes the master prompt. `PROMPT_ENGINE=v2` turns it on; **the default
is v1** and nothing here runs without the flag.

## The shape of it

```
the request, as the client left it
        │
        ▼
compileBrief(...)                 brief-compiler.ts  fields handed over, not written
   concept + copy inside """fences""", NFC, untouched
   the visual-direction panel's own choices, as binding preferences
        │
        ▼
loadTemplates(assetType)          templates.ts       four files off disk
   system.v1.md  no slots          request.v1.md  every slot
   playbooks/<asset>.v1.txt        gold-examples/<asset>.md
        │
        ▼
ONE model call ─► five tags       tags.ts   <assumptions> <plan> <copy_final>
   system = system.v1.md, unchanged                  <warnings> <image_prompt>
   user   = the filled request + the photos, in reference order
        │
        ▼
checkPrompt(prompt, ...)          checks.ts          exactly three checks
        │
        ├─ ok ──────────────────────► this prompt is sent
        ├─ fails ─► ONE repair call ─► check again
        └─ fails again ─────────────► stop and report (v1 renders if V2_FALLBACK is on)
```

Two model calls is the ceiling, and the second one only happens after a failure.

## The three checks

Only three, because these are the ones whose failure cannot be recovered after the
render is paid for.

| Code | What it requires |
|---|---|
| `copy` | under `exact`, `copy_final` repeats the client's strings character for character; under both policies each final string appears in the prompt **exactly once** |
| `ratio` | the prompt states the ratio the user chose, **at the end**, and no other ratio anywhere |
| `shape` | not empty, under the provider's character ceiling, no forbidden words and no technical parameters |

**There is no word limit.** There was a 200–500 window and it was a target dressed up
as a check: a poster with one product needs a few paragraphs and three products with a
layered scene need many, so the window would have truncated the second. The word count
is measured and reported — a thing to watch, not a thing to fail.

`shape` is scanned **after the quoted strings, the copy and the declared ratio are
removed**. `"Giảm 50% — chỉ 14 ngày"` is a headline, not a technical parameter, and a
check that cannot tell the difference rejects good briefs.

The forbidden-word list lives in two places that must agree: the array in `checks.ts`
and the sentence in `system.v1.md` that names them. It is not a slot, because
`system.v1.md` has none — so a test asserts the two agree **in both directions**, and
adding a word means editing both. A rule the director cannot see is a trap, not a
specification; a rule stated and not enforced has no teeth.

Known gap: `luxurious` is stated only as `luxury`, and `\bluxury\b` does not match it.

## Files

| File | What it owns |
|---|---|
| `templates/system.v1.md` | the standing instructions: role, agency standard, writing rules, the five tags. **No slots.** Edit this, not code |
| `templates/request.v1.md` | this job's brief. **All the slots** |
| `templates/playbooks/*.v1.txt` | what each channel asks of the frame, and its copy budget |
| `templates/gold-examples/*.md` | a proven prompt per asset type, as a quality bar. `TODO:` means "no example yet" and the block is dropped |
| `brief-compiler.ts` | the client's fields, gathered verbatim; the client-preferences block; the language; the text budget |
| `templates.ts` | loading, the version, the ratio→layout sentence, slot filling |
| `tags.ts` | the tolerant parser for the five tags |
| `checks.ts` | the three checks and the forbidden-word list |
| `build-simple.ts` | the orchestration: one call, one repair, then stop |
| `engine-selector.ts` | the four flags, and the defaults. One place reads the env |
| `label-check.ts` | the post-render product-label tripwire. Off by default |
| `golden-fixtures.ts` | the three briefs the v1 golden suite pins, shared with the eval |
| `eval/cases.ts` | 23 briefs for the comparison |
| `golden/v1/*.txt` | what the v1 assembly produces today, byte for byte |
| ~~`playbooks.ts`~~ ~~`director.ts`~~ ~~`spec.ts`~~ ~~`linter.ts`~~ ~~`build.ts`~~ | **superseded, not deleted.** The JSON path. Each file states why it is kept and the grep that shows no production importer |

## Changing the meta-prompt or a playbook

Edit the file. No code change, no build.

Which file:

| To change | Edit |
|---|---|
| what an agency-standard prompt must contain | `system.v1.md` |
| what this job's brief looks like, or add a slot | `request.v1.md` |
| a copy budget, or what a channel must win | `playbooks/<asset>.v1.txt` |
| the quality bar for an asset type | `gold-examples/<asset>.md` |

A gold example still holding `TODO: paste a proven prompt here` is dropped from the
brief entirely. A director shown that line under the heading "quality bar" has been
given a quality bar made of the word TODO.

The praise-word list is enforced from `checks.ts` and stated in `system.v1.md`, and a
test asserts the two agree **in both directions**. Adding a word means editing both.

Every slot in `request.v1.md` is filled by `brief-compiler.ts`, and a slot left
unfilled **throws** — the alternative is briefing a model about a placeholder, which is
how `BUSINESS GOAL: in beauty_skincare` once reached a render. Slot names are matched
in either case, because the playbooks use `{{ASPECT_RATIO}}` and the request template
uses `{{aspect_ratio}}`.

`{{playbook_for_asset_and_ratio}}` is where the asset's playbook goes, and the
playbook's own `{{ASPECT_RATIO}}` and `{{LAYOUT}}` are filled first.

A new version is a **new set of files**: `system.v2.md`, `request.v2.md` and
`playbooks/*.v2.txt`. `PROMPT_V2_TEMPLATE_VERSION=v2` switches all of them together,
the old files stay on disk and stay runnable, and the version used is reported on every
build — "which meta-prompt produced this image" is the first question a bad render
raises. A version string that is not `vN` is ignored, because it becomes part of a
filename. The gold examples are deliberately **not** versioned.

The copy budget a playbook states is **read back out of the text** by
`budgetFromPlaybook` to decide `exact` vs `adapt`. Keep the wording ("at most 3
separate lines of text — a headline of at most 8 words") or the test that checks
every playbook states a readable budget will tell you.

After an edit: `npx tsx lib/image-engine/run-prompt-v2-simple-tests.ts`.

## Why tags and not JSON

What comes back is mostly prose. JSON makes a model escape every newline and
quotation mark inside it, and one missed escape invalidates all five fields. A broken
tag loses one field.

The parser tolerates a fence around the whole reply, prose before and after, a tag
closed with the wrong name or not at all, tags in any order, and an empty
`<copy_final>`. It will **not** invent a missing `<image_prompt>`: that is the one
field with no sensible default, and fabricating it would turn a failed call into a
confident bad render.

## Flags

| Flag | Default | Effect |
|---|---|---|
| `PROMPT_ENGINE` | `v1` | `v2` runs this engine. Anything else, including a typo, is v1 |
| `PROMPT_V2_TEMPLATE_VERSION` | `v1` | which `.txt` files are read |
| `V2_INCLUDE_LABEL_TEXT` | on | **inert on this path** — see below |
| `V2_FALLBACK` | on | `off` lets a v2 failure surface instead of rendering through v1 |
| `V2_LABEL_CHECK` | off | the post-render label tripwire |
| `V2_DIRECTOR_MODEL` | provider default | the model for this one call. A model choice inside the configured provider, **never** a provider switch |

`V2_INCLUDE_LABEL_TEXT` is **inert on this path**: `system.v1.md` protects the label
unconditionally and carries no slot to flip.

`V2_FALLBACK=off` is what you want while tuning the meta-prompt: a silent fallback
hides exactly the failures you are trying to see.

## Running the eval

```bash
npx tsx lib/image-engine/run-prompt-v2-eval.ts                  # mock, free
npx tsx lib/image-engine/run-prompt-v2-eval.ts --label-text=off # the A/B
npx tsx lib/image-engine/run-prompt-v2-eval.ts --case=<id> --show
```

The eval still measures the **JSON** path — it has not been re-pointed at the
simplified build. A mock run measures the harness and proves the rules are
satisfiable; it cannot say a real model writes a better brief. For that,
`run-prompt-v2-eval-live.ts`, which prints the bill and refuses without
`--yes-i-approve-spending`.

## Why v1 stays

It is the fallback for every v2 failure: a timeout, a refusal, a reply with no
`<image_prompt>`, a check the one repair did not fix. The worst outcome of a v2 bug is
a v1 render. `run-prompt-engine-golden-tests.ts` pins what v1 produces so that stays
true.

## What the request does NOT carry

These exist on `SimpleInputRequestV1` and reach v1, and the v2 brief does not send
them. Listed so the gap is a decision rather than an oversight:

| Field | `types.ts` | Why not |
|---|---|---|
| `brandInfo` | 1168 | no slot in `request.v1.md`; the brand name goes, the description does not |
| `marketingContext.*` | 1174–1179 | `request.v1.md` lists audience, occasion and offer among the things the director must **infer**. Where the client actually stated `target_audience`, the director is told to guess it instead |
| `salesContext.*` | 1191–1196 | product name, offer, benefit and CTA. **UNVERIFIED** whether the UI populates these |
| `inspirationStyleManifest` | 1197 | a reference-image style read; no slot for it |
| `copyItems[].role` | 1170 | collapsed to plain strings. By design: `system.v1.md` has the director assign roles |
| per-photo `description` | — | by design: `request.v1.md` asks the director to read the product off the photo |

What the brief **does** carry that it did not before: the visual-direction panel's
controls, the free-text style, tone and composition fields, and the hard requirements.

## Not yet measured

Whether a model-written brief beats the eight-block assembly on a real image is
**unverified**. One v2 render has been produced: it fixed the Vietnamese diacritics and
the type/product balance, and it regressed the product label into misspellings.
