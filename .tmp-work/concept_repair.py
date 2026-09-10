# -*- coding: utf-8 -*-
"""Phase 3.1.8.1 — stop the concept layer leading from art direction objects."""
import io

p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

OLD = '''  private static pickLead(retrieved: ScoredReasoningKnowledge[]): ScoredReasoningKnowledge | undefined {
    // A `framework` or `principle` describes HOW to build a concept; an
    // `anti_pattern` describes what to avoid. None of the three is a campaign
    // idea, and letting one lead produced the same big idea for a skincare launch
    // and a fashion social ad — methodology restated as creative.
    const eligible = (r: ScoredReasoningKnowledge) =>
      !["anti_pattern", "framework", "principle", "evaluation_rule", "production_rule"].includes(
        String(r.object.knowledge_type)
      );

    for (const domain of ["strategy", "concept", "audience"]) {
      const hit = retrieved.filter((r) => String(r.object.domain) === domain && eligible(r))[0];
      if (hit) return hit;
    }
    return this.pickStrategic(retrieved).filter(eligible)[0] || retrieved.filter(eligible)[0] || retrieved[0];
  }'''

NEW = '''  private static pickLead(retrieved: ScoredReasoningKnowledge[]): ScoredReasoningKnowledge | undefined {
    // A `framework` or `principle` describes HOW to build a concept; an
    // `anti_pattern` describes what to avoid. None of the three is a campaign
    // idea, and letting one lead produced the same big idea for a skincare launch
    // and a fashion social ad — methodology restated as creative.
    const eligible = (r: ScoredReasoningKnowledge) =>
      !["anti_pattern", "framework", "principle", "evaluation_rule", "production_rule"].includes(
        String(r.object.knowledge_type)
      );

    for (const domain of ["strategy", "concept", "audience"]) {
      const hit = retrieved.filter((r) => String(r.object.domain) === domain && eligible(r))[0];
      if (hit) return hit;
    }

    // Phase 3.1.8.1. This function used to end with
    //
    //     ... || retrieved.filter(eligible)[0] || retrieved[0];
    //
    // Two fallbacks that accepted ANY domain. Measured across the thirty
    // benchmark cases, they made the campaign's central thought a layout rule
    // twenty times out of thirty — "the subject within the upper 65 percent and
    // reserve the lower 35 percent for platform interface" as a big idea — and
    // only four ideas came from `strategy` at all.
    //
    // The lead is now confined to domains that answer "why should anyone care".
    // When none was retrieved there is no idea to have, and the engine says so
    // rather than promoting an execution decision into the concept layer. An
    // absent idea is a corpus gap that shows up as one; a fabricated idea is a
    // corpus gap that hides.
    const leadable = retrieved.filter(
      (r) => CONCEPT_LEAD_DOMAINS.has(String(r.object.domain)) && eligible(r)
    );
    return leadable[0];
  }'''
assert OLD in s, "pickLead anchor missing"
s = s.replace(OLD, NEW)

s = s.replace(
    'import {\n  AntiPattern,',
    'import { CONCEPT_LEAD_DOMAINS } from "./concept-validation.types";\nimport {\n  AntiPattern,'
)
if "CONCEPT_LEAD_DOMAINS" not in s.split("export class")[0]:
    # Import anchor differed; fall back to inserting after the first import line.
    lines = s.split("\n")
    for i, l in enumerate(lines):
        if l.startswith("import "):
            lines.insert(i, 'import { CONCEPT_LEAD_DOMAINS } from "./concept-validation.types";')
            break
    s = "\n".join(lines)

io.open(p, "w", encoding="utf-8").write(s)
print("pickLead confined to concept-bearing domains")
