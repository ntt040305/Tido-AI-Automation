# -*- coding: utf-8 -*-
"""Phase 4.0 Task 1 — the creative_concept_pattern profile and its domains."""
import io, json

# ── 1. Domains ──────────────────────────────────────────────────────────
p = "lib/image-engine/reasoning/reasoning-knowledge.types.ts"
s = io.open(p, encoding="utf-8").read()

OLD = '''  "concept",
  "differentiation",'''
NEW = '''  "concept",
  "differentiation",
  // Phase 4.0 — the Creative Concept Intelligence layer.
  //
  // Phase 3.1.8.1 confined the concept layer to concept-bearing domains and
  // found the corpus held 11 usable objects across 368: CIOS could reject a
  // wrong idea and could not produce a right one. These four domains are what
  // a concept is actually built from, kept separate because they answer
  // different questions and a brief matches them on different axes.
  "human_tension",
  "consumer_insight",
  "campaign_territory",
  "idea_pattern",'''
assert OLD in s, "domain anchor missing"
s = s.replace(OLD, NEW, 1)

# ── 2. The profile type ─────────────────────────────────────────────────
ANCHOR = "export interface TypographyProfile {"
PROFILE = '''/**
 * Phase 4.0 — a creative concept pattern.
 *
 * The other profiles describe how something should look. This one describes why
 * anyone should care, and its fields are the chain a planner actually walks:
 * a tension a real person carries, the insight that names it, the emotional
 * shift the work is trying to cause, and the territory the campaign can own.
 *
 * Deliberately carries no measurement, no frame reference and no craft
 * vocabulary. A concept object whose text reads as an instruction would be
 * rejected by the concept gate the moment it became a big idea, which is the
 * failure this whole phase exists to remove.
 */
export interface CreativeConceptPatternProfile {
  /** What the person is caught between, before any brand speaks. */
  human_tension: string;
  /** The observation that names the tension in the audience's own terms. */
  consumer_insight: string;
  /** The feeling the work is trying to produce, not describe. */
  emotional_trigger: string;
  /** What the audience should believe afterwards that they did not before. */
  belief_shift: string;
  /** The ownable space this opens up for the brand. */
  campaign_territory: string;
  /** Concrete ways it has been, or could be, expressed. */
  example_applications?: string[];
  /** Executions that would collapse the idea back into category default. */
  avoid_patterns?: string[];
  /** Industries the pattern transfers to. */
  industries?: string[];
}

'''
assert ANCHOR in s, "typography profile anchor missing"
s = s.replace(ANCHOR, PROFILE + ANCHOR, 1)

# Add to the DomainProfile union.
import re
m = re.search(r"export type DomainProfile =\n((?:  \| \w+\n)+)", s)
pass
union = m.group(0)
if "CreativeConceptPatternProfile" not in union:
    s = s.replace(union, union.rstrip("\n") + "\n  | CreativeConceptPatternProfile\n", 1)

io.open(p, "w", encoding="utf-8").write(s)
print("types: +4 domains, +CreativeConceptPatternProfile")

# ── 3. JSON schema ──────────────────────────────────────────────────────
p = "data/cios-knowledge/_schema/reasoning_knowledge_schema_v2.json"
schema = json.load(io.open(p, encoding="utf-8"))
dom = schema["properties"]["domain"]
enum = dom.get("enum") or dom.get("items", {}).get("enum")
for d in ["human_tension", "consumer_insight", "campaign_territory", "idea_pattern"]:
    if d not in enum:
        enum.append(d)

props = schema["properties"]["domain_profile"]["properties"]
for field in ["human_tension", "emotional_trigger", "belief_shift", "campaign_territory"]:
    props.setdefault(field, {"type": "string"})
for field in ["example_applications", "avoid_patterns", "industries"]:
    props.setdefault(field, {"type": "array", "items": {"type": "string"}})
# consumer_insight already exists as a concept field name elsewhere; ensure it is allowed.
props.setdefault("consumer_insight", {"type": "string"})

io.open(p, "w", encoding="utf-8").write(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")
print("schema: %d domains, domain_profile allows %d fields" % (len(enum), len(props)))
