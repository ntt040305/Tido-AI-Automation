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
conflicts with anything below, it wins.

## C — REFERENCES

{{REFERENCES}}

## D — PRODUCT FACTS

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

## J — ASSET PLAYBOOK

{{PLAYBOOK}}

Industry module: {{INDUSTRY_MODULE}}
Product-count rule: {{PRODUCT_COUNT_RULE}}

## K — TARGET MODEL NOTES

{{MODEL_NOTES}}

## L — OUTPUT CONTRACT

Write the master prompt in English prose, {{MIN_CHARS}}–{{MAX_CHARS}} characters, as nine
labelled sections in exactly this order and with exactly these headings:

OUTPUT:
REFERENCE IMAGES:
SCENE & CONCEPT:
SUBJECT ARRANGEMENT:
COMPOSITION & LAYOUT:
LIGHT / CAMERA / MATERIALS:
COLOR & BRAND STYLE:
TEXT:
CONSTRAINTS:

**OUTPUT** states the asset type, the brand, the industry, the intended use and the canvas
ORIENTATION in words. No ratio digits.

**REFERENCE IMAGES** names every attached image by number — "Image 1 is …" — with its role,
a short visual descriptor, and what must be preserved. For a product: preserve its shape,
proportions, colours, materials and label layout; do not redesign it and do not re-letter
it. For a logo: reproduce it as supplied, exactly once, at the stated position, and do not
redraw or restyle it. For a contact sheet: say that the panel letters, the separating
borders and the flat grey ground are annotations and must not appear in the image.

**TEXT** sets each required string verbatim inside straight double quotes, with its
position and how it is set. Vietnamese keeps every diacritic, in NFC. For a brand name
that is not a dictionary word, spell it letter by letter beside the quoted form, unquoted.
End with: "No other text, numbers, watermarks or extra logos." If section F says there is
no copy, the whole TEXT section is exactly: "No text of any kind anywhere in the image."

**CONSTRAINTS** lists concrete exclusions only.

Nowhere in the master prompt may there appear: a colour temperature in Kelvin, an
f-number, a focal length in millimetres, an aspect ratio as digits, a percentage, or a
count of stops.

## M — GOLD EXAMPLE (illustrative only)

{{GOLD_EXAMPLE}}

## SELF-CHECK before you answer

- All nine headings present, in order, spelled as above.
- Every string from section F appears verbatim, in straight double quotes, exactly once.
- No quoted string that section F did not list.
- Every attached image named by its number, and no number named that is not attached.
- No Kelvin, f-number, millimetres, ratio digits, percentage or stop count anywhere.
- No `{{` left anywhere, and no section letter, heading name or the words "brief",
  "playbook" or "reference data" leaking into the prompt.
- Length within the stated bounds.
- The orientation word matches the canvas in section A.
- If no logo image was supplied, the prompt does not ask for a logo to be drawn.
- If a panel was flagged as below the trusted size, the prompt does not ask for its
  lettering to be reproduced.

## ANSWER FORMAT

<decisions>
What you chose and why, in a few lines: the route you took, any conflict you resolved and
which side won, and every default you filled because the brief was silent.
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
