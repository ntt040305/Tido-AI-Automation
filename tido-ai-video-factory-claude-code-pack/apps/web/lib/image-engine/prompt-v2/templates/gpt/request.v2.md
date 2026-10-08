## A — JOB

Deliverable: {{DELIVERABLE}}
Asset type: {{ASSET_TYPE}}
Industry: {{INDUSTRY}}
Canvas: {{ORIENTATION}}
Products in frame: {{PRODUCT_COUNT}}
Intended use: {{INTENDED_USE}}

## B — CLIENT INPUTS (authoritative, verbatim)

Brand name: {{BRAND}}
Concept, exactly as the client wrote it:
{{CONCEPT}}

Nothing in this section may be paraphrased, translated, corrected or improved. Where it
conflicts with anything below, it wins. Where it names a culture, a region, a festival or
an occasion, YOU name the exact visual identifiers of it and the nearest confusion to
exclude — that judgement is yours, not the sheet's.

## C — REFERENCES

{{REFERENCES}}

## C2 — PRINT RULE (exactly one rule; carry this sentence through)

{{PRINT_RULE}}

This is the ONLY statement the master prompt makes about logos or printed branding. Do not
add a second one anywhere, and do not contradict it in CONSTRAINTS.

## D — PRODUCT MAP

{{PRODUCT_MAP}}

Hero: {{HERO}}

Raw product facts, where the client supplied any:
{{PRODUCT_FACTS}}

## E — BRAND KIT

{{BRAND_KIT}}

## F — COPY

{{COPY}}

## G — USER CHOICES (binding)

{{USER_CHOICES}}

## H — STRATEGY (advisory)

{{STRATEGY}}

## I — REFERENCE DATA — translate into plain visual description; never copy a number, unit or ratio into the master prompt

{{REFERENCE_DATA}}

# ═══ THE ART DIRECTION SHEET ═══
#
# Already resolved. Write it; do not re-decide it.

## S1 — BIG IDEA

{{BIG_IDEA}}

Mood: {{MOOD}}

## S2 — LAYOUT AND ZONES

{{LAYOUT_ZONES}}

## S3 — ARRANGEMENT AND DEPTH

{{ARRANGEMENT}}

## S4 — CAMERA

{{CAMERA}}

## S5 — LIGHTING

{{LIGHTING}}

## S6 — SET AND PROPS

{{SET_AND_PROPS}}

## S7 — COLOUR

{{COLOUR}}

## S8 — TYPOGRAPHY AND THE TEXT MANIFEST

{{TYPOGRAPHY}}

## S9 — REALISM AND FINISH

{{REALISM}}

## S10 — CONSTRAINTS

{{CONSTRAINTS_BLOCK}}

## S11 — DERIVED DECISIONS (why the sheet says what it says; never written into the prompt)

{{DERIVED_DECISIONS}}

# ═══ END OF SHEET ═══

## J — ASSET PLAYBOOK (what this channel has to win)

{{PLAYBOOK}}

Industry module: {{INDUSTRY_MODULE}}
Product-count rule: {{PRODUCT_COUNT_RULE}}

## K — TARGET MODEL NOTES

{{MODEL_NOTES}}

## L — OUTPUT CONTRACT

Write the master prompt in English prose, {{MIN_CHARS}}–{{MAX_CHARS}} characters — aim for
five hundred to seven hundred words — as nine labelled sections in exactly this order and
with exactly these headings:

OUTPUT:
REFERENCE IMAGES:
SCENE & CONCEPT:
SUBJECT ARRANGEMENT:
COMPOSITION & LAYOUT:
LIGHT / CAMERA / MATERIALS:
COLOR & BRAND STYLE:
TEXT:
CONSTRAINTS:

The sheet maps onto them like this. Keep the headings; put the content where it belongs.

| Sheet | Section |
|---|---|
| the job, the canvas, the industry as spelled in A | **OUTPUT** |
| C, C2, D — references, the print rule, the product map, the hero | **REFERENCE IMAGES** |
| S1 the big idea, then S6 the set and props | **SCENE & CONCEPT** |
| S3 arrangement and depth | **SUBJECT ARRANGEMENT** |
| S2 layout and zones | **COMPOSITION & LAYOUT** |
| S4 camera, S5 lighting, then S9 realism and finish | **LIGHT / CAMERA / MATERIALS** |
| S7 colour | **COLOR & BRAND STYLE** |
| S8 typography and the manifest | **TEXT** |
| S10 constraints | **CONSTRAINTS** |

**OUTPUT** states the asset type, the brand, the industry as spelled in section A, the
intended use and the canvas ORIENTATION in words. No ratio digits, and never a raw
identifier with an underscore in it.

**REFERENCE IMAGES** names every attached image by number — "Image 1 is …" — with its
role, a short visual descriptor, and what must be preserved. For a product: preserve its
shape, proportions, colours, materials and label layout; do not redesign it and do not
re-letter it. For a contact sheet: say that the panel letters, the separating borders and
the flat grey ground are annotations and must not appear in the image. Then state the
print rule from C2, once. State the fidelity requirement and the exact-text requirement
EARLY, here, and restate both briefly in CONSTRAINTS at the end — they are the two things
a renderer most often drops.

**TEXT** sets every string in the manifest verbatim inside straight double quotes, with
its position, its size floor and how it is set. Nothing outside the manifest is set.
Vietnamese keeps every diacritic, in NFC. For a brand name that is not a dictionary word,
spell it letter by letter beside the quoted form, unquoted. End with: "No other text,
numbers, watermarks or extra logos." If the manifest is empty, the whole TEXT section is
exactly: "No text of any kind anywhere in the image."

**CONSTRAINTS** lists concrete exclusions only, and restates fidelity and exact text in
one line each.

Nowhere in the master prompt may there appear: a colour temperature in Kelvin, an
f-number, a focal length in millimetres, an aspect ratio as digits, a percentage figure, a
count of stops, or a raw identifier such as `coffee_tea`.

Nor may any of these words appear: "auto", "AI decides", "suitable", "tasteful",
"appropriate", "as needed". Every decision is already made; write the decision, not the
fact that one was required.

## M — GOLD EXAMPLE (illustrative only — the sheet above outranks it)

{{GOLD_EXAMPLE}}

## SELF-CHECK before you answer

- All nine headings present, in order, spelled as above.
- Every string from the TEXT MANIFEST appears verbatim, in straight double quotes, exactly
  once, and no quoted string the manifest does not list.
- Every attached image named by its number, and no number named that is not attached.
- The print rule appears once. No second statement about logos or printed branding, and no
  sentence in CONSTRAINTS that contradicts it.
- No Kelvin, f-number, millimetres, ratio digits, percentage figure or stop count anywhere.
- No raw identifier with an underscore. No "auto", "AI decides", "suitable" or "tasteful".
- No `{{` left anywhere, and no section letter, sheet label or the words "brief", "sheet",
  "manifest", "playbook" or "reference data" leaking into the prompt.
- Length within the stated bounds.
- The orientation word matches the canvas in section A.
- Small text is on a card or a flat area, never over texture and never over the hero.
- Where a panel was flagged as below the trusted size, the prompt does not ask for its
  lettering to be reproduced.

## ANSWER FORMAT

<decisions>
What you chose and why, in a few lines: how you wrote the sheet, the cultural identifiers
you named and the confusion you excluded, and anything in the sheet you had to reconcile.
</decisions>
<copy_final>
One line per string, exactly as it must be set. Empty if there is no copy.
</copy_final>
<warnings>
Anything the next person should know. Empty if nothing.
</warnings>
<image_prompt>
The master prompt, and nothing else.
</image_prompt>
