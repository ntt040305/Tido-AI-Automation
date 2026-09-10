# -*- coding: utf-8 -*-
"""Extend TypographyProfile with the Batch 4 required fields. Additive only."""
import io, json

# ── TS types ──
p = "lib/image-engine/reasoning/reasoning-knowledge.types.ts"
s = io.open(p, encoding="utf-8").read()

old = """export interface TypographyProfile {
  /** What the letterforms say about the brand before the words are read. */
  personality: string;
  /** Pairing and hierarchy guidance. */
  hierarchy?: string;
  /** Vietnamese diacritics need vertical room most Latin faces do not reserve. */
  vietnamese_note?: string;
}"""

new = """export interface TypographyProfile {
  /** What the letterforms say about the brand before the words are read. */
  personality: string;
  /** Pairing and hierarchy guidance. */
  hierarchy?: string;
  /** Vietnamese diacritics need vertical room most Latin faces do not reserve. */
  vietnamese_note?: string;

  // ── Batch 4 additions ──
  // Typography carries more decision surface than the other craft domains: a
  // single choice sets tone, rank and rhythm at once. These fields separate the
  // three so a retrieval can ask about rank without also inheriting tone.
  /** What this typographic choice is FOR. */
  purpose?: string;
  /** What it does to the page optically. */
  visual_effect?: string;
  /** What the reader infers about the brand before decoding a word. */
  psychological_signal?: string;
  /** How rank is established between levels. */
  hierarchy_rule?: string;
  /** Leading, tracking and margin behaviour this choice requires. */
  spacing_rule?: string;
  /** How this choice fails when misapplied. */
  failure_pattern?: string;
}"""
assert old in s, "typography profile anchor missing"
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("TypographyProfile extended with 6 fields")

# ── JSON schema ──
p = "data/cios-knowledge/_schema/reasoning_knowledge_schema_v2.json"
schema = json.load(io.open(p, encoding="utf-8"))
props = schema["properties"]["domain_profile"]["properties"]
for field in ["visual_effect", "psychological_signal", "hierarchy_rule", "spacing_rule"]:
    props[field] = {"type": "string"}
io.open(p, "w", encoding="utf-8").write(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")
print("schema domain_profile now allows %d fields" % len(props))
