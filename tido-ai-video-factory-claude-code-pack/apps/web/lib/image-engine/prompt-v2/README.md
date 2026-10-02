# Prompt engine v2

One LLM call writes the master prompt. `PROMPT_ENGINE=v2` turns it on; **the default
is v1** and nothing here runs without the flag.

## The shape of it

```
input, verbatim (asset type, ratio, concept, brand + product line, copy, photos)
        │
        ▼
loadTemplates(assetType)             templates.ts     two .txt files off disk
fillSlots(...)                                        {{PLAYBOOK}} into the meta-prompt
        │
        ▼
ONE model call ─► four tags          tags.ts          <plan> <copy_final>
   system = the filled meta-prompt                    <warnings> <image_prompt>
   user   = the product photos, in reference order
        │
        ▼
checkPrompt(prompt, ...)             checks.ts        exactly three checks
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
| `ratio` | the prompt states the ratio the user chose, and no other |
| `shape` | 200–500 words, under the provider's character ceiling, no forbidden words and no technical parameters |

`shape` is scanned **after the quoted strings, the copy and the declared ratio are
removed**. `"Giảm 50% — chỉ 14 ngày"` is a headline, not a technical parameter, and a
check that cannot tell the difference rejects good briefs.

The forbidden-word list is a single array in `checks.ts` and is substituted into the
meta-prompt, so the model is shown exactly what will reject it. A rule the model
cannot see is a trap, not a specification.

## Files

| File | What it owns |
|---|---|
| `templates/meta-prompt.v1.txt` | the system prompt. **Edit this, not code** |
| `templates/playbooks/*.v1.txt` | what each channel asks of the frame, and its copy budget |
| `templates.ts` | loading, the version, the ratio→layout sentence, slot filling |
| `tags.ts` | the tolerant parser for the four tags |
| `checks.ts` | the three checks and the forbidden-word list |
| `build-simple.ts` | the orchestration: one call, one repair, then stop |
| `engine-selector.ts` | the four flags, and the defaults. One place reads the env |
| `label-check.ts` | the post-render product-label tripwire. Off by default |
| `golden-fixtures.ts` | the three briefs the v1 golden suite pins, shared with the eval |
| `eval/cases.ts` | 23 briefs for the comparison |
| `golden/v1/*.txt` | what the v1 assembly produces today, byte for byte |
| ~~`playbooks.ts`~~ ~~`director.ts`~~ ~~`spec.ts`~~ ~~`linter.ts`~~ ~~`build.ts`~~ | **superseded, not deleted.** The JSON path. Each file states why it is kept and the grep that shows no production importer |

## Changing the meta-prompt or a playbook

Edit the `.txt` file. No code change, no build.

Everything the prompt needs is a `{{SLOT}}`, and a slot left unfilled **throws** —
the alternative is briefing a model about a placeholder, which is how
`BUSINESS GOAL: in beauty_skincare` once reached a render.

`{{PLAYBOOK}}` in the meta-prompt is where the asset's playbook is inserted. The
playbook's own `{{ASPECT_RATIO}}` and `{{LAYOUT}}` are filled first.

A new version is a **new file**: `meta-prompt.v2.txt` plus
`playbooks/poster.v2.txt` and the rest. `PROMPT_V2_TEMPLATE_VERSION=v2` switches
both, the old files stay on disk and stay runnable, and the version used is reported
on every build — "which meta-prompt produced this image" is the first question a bad
render raises. A version string that is not `vN` is ignored, because it becomes part
of a filename.

The copy budget a playbook states is **read back out of the text** by
`budgetFromPlaybook` to decide `exact` vs `adapt`. Keep the wording ("at most 3
separate lines of text — a headline of at most 8 words") or the test that checks
every playbook states a readable budget will tell you.

After an edit: `npx tsx lib/image-engine/run-prompt-v2-simple-tests.ts`.

## Why tags and not JSON

What comes back is mostly prose. JSON makes a model escape every newline and
quotation mark inside it, and one missed escape invalidates all four fields. A broken
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
| `V2_INCLUDE_LABEL_TEXT` | on | whether the prompt quotes lettering read off the label |
| `V2_FALLBACK` | on | `off` lets a v2 failure surface instead of rendering through v1 |
| `V2_LABEL_CHECK` | off | the post-render label tripwire |

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

## Not yet measured

No render has been produced through this engine. Whether a model-written brief beats
the eight-block assembly on a real image is **unverified**, and so is whether the
200–500 word window is the right one.
