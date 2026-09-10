# -*- coding: utf-8 -*-
"""Attach the separation gate to concept generation."""
import io

p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

s = s.replace(
    'import { CONCEPT_LEAD_DOMAINS } from "./concept-validation.types";',
    'import { ConceptQualityGate } from "./ConceptQualityGate";\n'
    'import { CONCEPT_LEAD_DOMAINS } from "./concept-validation.types";'
)

OLD = '''    const leaks = this.findTechnicalLeaks(concept);
    if (leaks.length) {
      warnings.push(`TECHNICAL_LEAK_IN_CONCEPT: ${leaks.length} technical marker(s) found; a concept must stay direction-level.`);
    }'''

NEW = '''    const leaks = this.findTechnicalLeaks(concept);
    if (leaks.length) {
      warnings.push(`TECHNICAL_LEAK_IN_CONCEPT: ${leaks.length} technical marker(s) found; a concept must stay direction-level.`);
    }

    // Phase 3.1.8.1 — the concept/art-direction separation gate.
    //
    // `findTechnicalLeaks` above only ever warned, and its marker list covered
    // lenses and apertures but not frame percentages, so twenty of thirty
    // benchmark concepts passed it while being layout rules. This gate rejects
    // rather than annotates, and it checks the lead's domain as well as the
    // wording — a concept built from a layout object is wrong at the root even
    // when its sentence happens to carry no numbers.
    const leadDomain = leadObj ? String(leadObj.domain) : undefined;
    const separation = ConceptQualityGate.validate(concept, leadDomain);
    if (!separation.valid) {
      for (const v of separation.violations.slice(0, 4)) {
        warnings.push(`CONCEPT_SEPARATION(${v.kind}): ${v.reason}${v.evidence ? ` — "${v.evidence}"` : ""}`);
      }
    }'''
assert OLD in s, "leaks anchor missing"
s = s.replace(OLD, NEW)

# Surface the validation on the generation result so callers can act on it.
OLD_RET = '''    return {
      concept,
      evaluation,
      warnings,
      trace,
    };'''
if OLD_RET not in s:
    # Locate the actual return of generate().
    idx = s.index("    const trace: CreativeConceptTrace = {")
    tail = s[idx:]
    print("NOTE: generate() return shape differs; inspect manually")
else:
    s = s.replace(OLD_RET, '''    return {
      concept,
      evaluation,
      separation,
      warnings,
      trace,
    };''')

io.open(p, "w", encoding="utf-8").write(s)
print("gate wired into concept generation")
