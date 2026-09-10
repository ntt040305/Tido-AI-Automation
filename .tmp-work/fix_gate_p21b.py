# -*- coding: utf-8 -*-
import io, re
p = "lib/image-engine/reasoning/KnowledgeQualityGate.ts"
s = io.open(p, encoding="utf-8").read()

# ── FIX C: remaining verb gaps ───────────────────────────────────────────
s = s.replace("|elevate|lift|lower)\\b/i;",
              "|elevate|lift|lower|review|give|work|photograph|rake|claim|treat|shape|reserve|withhold|surrender|state|declare|record|attribute|separate|route|anchor|hold)\\b/i;")

# ── FIX D: hedging in the decision is the fault; elsewhere it is discourse ─
old = """  // ── Dimension 1: specificity ────────────────────────────────────────
  private static specificity(o: ReasoningKnowledgeObject): QualityDimensionScore {
    const text = [o.decision, o.reasoning, o.why_this_works].filter(Boolean).join(" ");
    const hedges = matches(HEDGE, text);
    const concrete = CONCRETE.test(o.decision || "");

    let score = 5;
    if (concrete) score += 3;
    if ((o.decision || "").length > 60) score += 1;
    if ((o.decision || "").length > 110) score += 1;
    score -= hedges.length * 2;
    score = Math.max(0, Math.min(10, score));

    return {
      dimension: "specificity",
      score,
      finding: hedges.length
        ? `${hedges.length} hedge word(s) in the decision chain: ${[...new Set(hedges)].join(", ")}`
        : concrete
        ? "Decision names a concrete, checkable specification."
        : "Decision is committed but carries no measurable specification.","""

new = """  // ── Dimension 1: specificity ────────────────────────────────────────
  /**
   * Hedging is weighted by where it occurs.
   *
   * A hedge in `decision` is the defining Layer 2 failure — the object declined
   * to choose. The same word in `reasoning` is usually ordinary discourse: "a
   * frame that COULD carry a competitor's logo" states a test condition, and
   * "can be tested objectively" states a capability. Scoring both alike failed
   * several of the sharpest objects in the corpus for describing possibility.
   */
  private static specificity(o: ReasoningKnowledgeObject): QualityDimensionScore {
    const decisionHedges = matches(HEDGE, o.decision || "");
    const supportHedges = matches(HEDGE, [o.reasoning, o.why_this_works].filter(Boolean).join(" "));
    const concrete = CONCRETE.test(o.decision || "");

    let score = 5;
    if (concrete) score += 3;
    if ((o.decision || "").length > 60) score += 1;
    if ((o.decision || "").length > 110) score += 1;
    score -= decisionHedges.length * 3;
    score -= Math.floor(supportHedges.length / 3);
    score = Math.max(0, Math.min(10, score));

    const hedges = [...decisionHedges, ...supportHedges];
    return {
      dimension: "specificity",
      score,
      finding: decisionHedges.length
        ? `${decisionHedges.length} hedge word(s) in the DECISION: ${[...new Set(decisionHedges)].join(", ")}`
        : concrete
        ? "Decision names a concrete, checkable specification."
        : "Decision is committed but carries no measurable specification.","""
assert old in s, "specificity anchor missing"
s = s.replace(old, new)

# ── FIX E: a framework is methodology and may be universal ───────────────
s = s.replace('const universalByType = ["principle", "evaluation_rule"].includes(String(o.knowledge_type));',
              'const universalByType = ["principle", "evaluation_rule", "framework"].includes(String(o.knowledge_type));')

io.open(p, "w", encoding="utf-8").write(s)
print("FIX C: 20 more imperatives")
print("FIX D: hedge weighting split between decision and supporting prose")
print("FIX E: frameworks may be universally scoped")

# ── FIX F: reword my own knowledge, not the detector ─────────────────────
kp = "data/cios-knowledge/critic/critic_evaluation_strategic_fit_001.yaml"
t = io.open(kp, encoding="utf-8").read()
before = "Beautiful work can serve the wrong objective perfectly."
after = "Well-crafted work can serve the wrong objective perfectly."
assert before in t, "knowledge anchor missing"
t = t.replace(before, after)
io.open(kp, "w", encoding="utf-8").write(t)
print("FIX F: reworded the one knowledge object using 'Beautiful' descriptively")
print("       (the detector was right to flag the word; the content was clearer without it)")
