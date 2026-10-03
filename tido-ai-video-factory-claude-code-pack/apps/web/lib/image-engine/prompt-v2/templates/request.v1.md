# CONTEXT: THE CLIENT REQUEST
asset_type: {{asset_type}}
aspect_ratio: {{aspect_ratio}}
text_language: {{text_language}}
brand: {{brand}}
references (photos attached in this order):
{{references}}
concept (client's words, verbatim): """{{concept}}"""
copy (client's words, verbatim): """{{copy}}"""
{{client_preferences_block}}
Not provided by the client (infer them and list them in <assumptions>): audience, tone,
occasion or season, offer, per-photo product descriptions.

# TASK
Design and write the image prompt for ONE {{asset_type}}. Raise the client's concept into a
sharper, more specific idea while keeping everything they asked for.

# CONSTRAINTS
- Aspect ratio: {{aspect_ratio}} (end the prompt with it exactly).
- Copy policy: {{copy_policy}}. {{copy_policy_rules}}
- Text: {{n_words}} words, {{n_sentences}} sentences, {{n_chars}} characters. {{text_layout_note}}
- Products are exactly as in the attached photos. Do not redesign, recolour or add writing
  to them. Campaign text never touches a product. Any LOGO photo is placed exactly as
  supplied, per REFERENCE ROLES.
- No invented claims, numbers, certifications or logos.

# ASSET PLAYBOOK ({{asset_type}} at {{aspect_ratio}})
{{playbook_for_asset_and_ratio}}

{{gold_example_block}}

# DESIRED OUTPUT
Return the five tags exactly as specified.
