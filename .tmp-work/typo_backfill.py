# -*- coding: utf-8 -*-
"""Backfill the five pre-Batch-4 typography objects with the Batch 4 profile fields.

Additive only: nothing existing in these files is altered. These objects predate
the profile contract Batch 4 introduced, so the corpus-wide check would otherwise
have to carve out an exception for them.
"""
import io

BASE = "data/cios-knowledge/typography/"

FIELDS = {
 "typography_hierarchy_three_level_limit_001.yaml": [
   ("purpose", "Cap how many type levels an asset carries so each level stays distinguishable."),
   ("visual_effect", "Three clearly separated levels read as rank; a fourth level collapses the difference between all of them."),
   ("psychological_signal", "Disciplined and confident; the layout knows what matters."),
   ("hierarchy_rule", "Three levels maximum, each separated by at least a 1.5 size ratio or a full weight step."),
   ("spacing_rule", "Space above each level scales with its rank so spacing reinforces the size separation."),
   ("failure_pattern", "Adding a fourth level for one extra message, after which no level reads as clearly dominant."),
 ],
 "typography_sans_contemporary_neutrality_001.yaml": [
   ("purpose", "Choose a face that supplies credibility without contributing personality of its own."),
   ("visual_effect", "Even stroke weight and closed apertures produce a uniform page with no letterform character."),
   ("psychological_signal", "Competent, current, unobtrusive."),
   ("hierarchy_rule", "Weight and size carry the hierarchy, since the face itself contributes no contrast."),
   ("spacing_rule", "Zero tracking at body with 1.5 leading; hierarchy separation comes from size rather than spacing."),
   ("failure_pattern", "Relying on the face for distinctiveness, which it was specifically chosen not to supply."),
 ],
 "typography_scale_headline_minimum_social_001.yaml": [
   ("purpose", "Set a headline floor that survives the reduction feed viewing applies."),
   ("visual_effect", "A headline at a twentieth of frame height stays legible where a smaller one dissolves at feed scale."),
   ("psychological_signal", "Legibility before expression."),
   ("hierarchy_rule", "The headline floor is set proportionally to frame height, not in absolute points."),
   ("spacing_rule", "The headline keeps its own gap above at 1.5 base units so the floor is not eroded by crowding."),
   ("failure_pattern", "Approving the headline at full canvas size, where the feed-scale failure is invisible."),
 ],
 "typography_serif_heritage_authority_001.yaml": [
   ("purpose", "Use letterform history to support a claim of longevity or institutional standing."),
   ("visual_effect", "High stroke contrast and bracketed serifs read as printed and established rather than as current."),
   ("psychological_signal", "Established, authoritative, printed; carries institutional memory."),
   ("hierarchy_rule", "Serif at headline with a neutral sans for supporting text keeps the hierarchy clear."),
   ("spacing_rule", "Serif headline tracked 20 units at display; supporting sans at zero tracking and 1.5 leading."),
   ("failure_pattern", "Using the high-contrast serif below 24 points, where the hairlines vanish and authority turns to fragility."),
 ],
 "typography_vietnamese_diacritic_clearance_001.yaml": [
   ("purpose", "Reserve the vertical room stacked Vietnamese tone marks actually occupy."),
   ("visual_effect", "Roughly 20 percent additional leading keeps stacked marks clear of the line above."),
   ("psychological_signal", "Correctness in diacritics is read as respect for the reader."),
   ("hierarchy_rule", "Headline leading needs proportionally more increase than body, since marks scale with the type."),
   ("spacing_rule", "Latin leading multiplied by at least 1.2 at every level, verified against the tallest stacked character."),
   ("failure_pattern", "Setting Vietnamese at Latin leading, where stacked marks collide with descenders from the line above."),
 ],
}


def quote(v):
    # seed_lib writes plain scalars; match that, quoting only where YAML needs it.
    if v[:1] in "'\"" or ": " in v or v.endswith(":"):
        return "'" + v.replace("'", "''") + "'"
    return v


for fname, fields in FIELDS.items():
    p = BASE + fname
    lines = io.open(p, encoding="utf-8").read().split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith("domain_profile:"))
    end = start + 1
    while end < len(lines) and (lines[end].startswith("  ") or lines[end].strip() == ""):
        end += 1
    block = lines[start:end]
    present = set()
    for l in block:
        if l.startswith("  ") and ":" in l:
            present.add(l.strip().split(":", 1)[0])
    added = ["  %s: %s" % (k, quote(v)) for k, v in fields if k not in present]
    if not added:
        print("  already complete: " + fname)
        continue
    lines[start:end] = block + added
    io.open(p, "w", encoding="utf-8").write("\n".join(lines))
    print("  +%d fields -> %s" % (len(added), fname))
