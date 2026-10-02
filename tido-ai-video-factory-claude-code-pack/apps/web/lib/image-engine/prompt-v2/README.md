# Prompt engine v2

One LLM call writes the master prompt. `PROMPT_ENGINE=v2` turns it on; **the default
is v1** and nothing here runs without the flag.

## The shape of it

```
input (asset type, ratio, concept, brand + product line, copy, product photos)
        │
        ▼
playbookFor(assetType, ratio)        playbooks.ts     5 asset types x 3 ratios
        │
        ▼
decideCopyPolicy(copy, playbook)     director.ts      exact unless it cannot fit
        │
        ▼
ONE model call ─► CreativeSpec JSON  spec.ts          validated by hand, no new dep
        │                                             field order IS the design
        ▼
lintMasterPrompt(prompt, ...)        linter.ts        the gate before a paid render
        │
        ├─ ok ──────────────────────► this prompt is sent
        ├─ fails once ─► ONE repair call ─► lint again
        └─ fails again ─────────────► v1 produces the prompt
```

## Files

| File | What it owns |
|---|---|
| `engine-selector.ts` | the three flags, and the default. One place reads the env |
| `playbooks.ts` | what each channel asks of the frame, **per asset type × ratio** |
| `director.ts` | the system prompt, the user message with the photos, the repair message, the copy policy, claim warnings |
| `spec.ts` | the JSON contract and its validation |
| `linter.ts` | length, technical terms, verdict words, copy exactly once, NFC, placeholders, ellipsis, impossible percentages, the ratio sentence, strings per channel |
| `build.ts` | the orchestration: one call, one repair, then fallback. Returns the call count |
| `label-check.ts` | the post-render product-label tripwire. Off by default, free when on |
| `golden-fixtures.ts` | the three briefs the v1 golden suite pins, shared with the eval |
| `eval/cases.ts` | 23 briefs for the comparison |
| `golden/v1/*.txt` | what the v1 assembly produces today, byte for byte |

## Changing a playbook

`playbooks.ts` is a configuration table with no logic in it. A word budget or a
layout rule is one edit by someone looking at an image. The three layout strings per
asset type are **not** interchangeable: the ratio decides where copy can physically
go, which is why 16:9 describes two horizontal zones and 9:16 stacks vertically.

After an edit: `npx tsx lib/image-engine/run-prompt-engine-v2-tests.ts`.

## Changing a linter rule

Every rule in `linter.ts` refuses something that reached a real render. Before
adding one, add the case to `run-prompt-engine-v2-tests.ts` first — a rule with no
test is a rule nobody can change safely later.

The one rule to keep in mind: **everything inside double quotes is the client's
words and is exempt from the content checks.** `"Giảm 20% — chỉ 14 ngày"` is a
headline, not a technical parameter.

## Running the eval

```bash
npx tsx lib/image-engine/run-prompt-v2-eval.ts                  # mock, free
npx tsx lib/image-engine/run-prompt-v2-eval.ts --label-text=off # the A/B
npx tsx lib/image-engine/run-prompt-v2-eval.ts --case=<id> --show
```

The mock director is a template that obeys the v2 rules, so a mock run measures the
**harness** and proves the rules are satisfiable. It cannot say a real model writes
a better brief. For that, `run-prompt-v2-eval-live.ts`, which prints the bill and
refuses without `--yes-i-approve-spending`.

## Why v1 stays

It is the fallback for every v2 failure: a timeout, a refusal, broken JSON, a schema
violation, a linter failure the one repair did not fix. The worst outcome of a v2 bug
is a v1 render. `run-prompt-engine-golden-tests.ts` pins what v1 produces so that
stays true.
