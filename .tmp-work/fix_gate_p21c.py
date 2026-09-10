# -*- coding: utf-8 -*-
import io
p = "lib/image-engine/reasoning/KnowledgeQualityGate.ts"
s = io.open(p, encoding="utf-8").read()

old = """  private static specificity(o: ReasoningKnowledgeObject): QualityDimensionScore {
    const decisionHedges = matches(HEDGE, o.decision || "");"""

new = """  private static specificity(o: ReasoningKnowledgeObject): QualityDimensionScore {
    // A hedge inside a relative clause describes the CONDITION being tested, not
    // the instruction. "Reject any asset that could belong to another campaign"
    // is fully decisive — the verb is Reject, and "could" defines what to look
    // for. Counting it failed two of the sharpest evaluation rules in the corpus,
    // so only the leading clause is measured for commitment.
    const leadingClause = (o.decision || "").split(/\b(?:that|which|whose|who|where|when|whether)\b/i)[0];
    const decisionHedges = matches(HEDGE, leadingClause);"""
assert old in s, "anchor missing"
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("FIX G: hedges counted in the decision's leading clause only")
