# -*- coding: utf-8 -*-
"""Phase 3.1.8.1 — differentiation must also stay inside the concept layer."""
import io

p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

OLD = '''    // ── Differentiation, drawn from what the category already does ──
    const allAntiPatterns = retrieved.flatMap((r) =>
      (r.object.anti_patterns || []).map((ap) => ({ id: r.object.knowledge_id, ap }))
    );'''

NEW = '''    // ── Differentiation, drawn from what the category already does ──
    //
    // Anti-patterns are collected from concept-bearing domains only. A layout
    // anti-pattern's `replacement` is a layout instruction, so drawing
    // differentiation from one produced "in favour of the subject within the
    // upper 65 percent" — the same contamination as the big idea, one field
    // over, and it survived the first pass of this repair because only the lead
    // had been confined. Any field built from retrieved text needs the same
    // domain restriction, not just the one that was noticed first.
    const conceptual = retrieved.filter((r) => CONCEPT_LEAD_DOMAINS.has(String(r.object.domain)));
    const allAntiPatterns = (conceptual.length ? conceptual : []).flatMap((r) =>
      (r.object.anti_patterns || []).map((ap) => ({ id: r.object.knowledge_id, ap }))
    );'''
assert OLD in s, "anti-pattern anchor missing"
s = s.replace(OLD, NEW)
io.open(p, "w", encoding="utf-8").write(s)
print("differentiation confined to concept-bearing domains")

# ── Expansion test: correct variable names and add the import ──
p = "lib/image-engine/run-knowledge-expansion-tests.ts"
s = io.open(p, encoding="utf-8").read()
s = s.replace("  for (const c of [skincare, coffee, fashion]) {\n    const v = ConceptQualityGate.validate(c.concept.concept);",
              "  for (const c of [skin, cafe, fashion]) {\n    const v = ConceptQualityGate.validate(c.concept);")
s = s.replace('const contamination = v.violations.filter((x) => x.kind !== "MISSING_BIG_IDEA");',
              'const contamination = v.violations.filter((x: { kind: string }) => x.kind !== "MISSING_BIG_IDEA");')
s = s.replace('assert.deepStrictEqual(contamination.map((x) => x.kind), [], ConceptQualityGate.format(v));',
              'assert.deepStrictEqual(contamination.map((x: { kind: string }) => x.kind), [], ConceptQualityGate.format(v));')
s = s.replace('import { KnowledgeQualityGate } from "./reasoning/KnowledgeQualityGate";',
              'import { ConceptQualityGate } from "./reasoning/ConceptQualityGate";\nimport { KnowledgeQualityGate } from "./reasoning/KnowledgeQualityGate";')
io.open(p, "w", encoding="utf-8").write(s)
print("expansion test corrected")
