# -*- coding: utf-8 -*-
import io
p = "lib/image-engine/reasoning/KnowledgeQualityGate.ts"
s = io.open(p, encoding="utf-8").read()

# ── FIX A: the action-verb list was far too narrow ───────────────────────
old = '''/** A decision must begin by telling someone to do something. */
const ACTION_VERB = /^(use|apply|choose|select|adopt|frame|anchor|lead|set|build|place|hold|render|prioriti[sz]e|avoid|replace|reject|limit|restrict|reserve|shoot|light|compose|crop|keep|treat|show|cast|ground|isolate|separate|align|scale|reduce|increase|remove|open|close|push|pull|hide|reveal|balance|weight|stage|direct|allow|require|start|end|carry|drop|raise|lower)\\b/i;'''

new = '''/**
 * A decision must begin by telling someone to do something.
 *
 * The first version of this list was written against a dozen fixtures and
 * rejected a third of the real corpus: "Identify the veto holder", "Route the
 * claim through a peer", "Verify red against local association" and "Score
 * strategic fit by asking" are all imperatives, and all were failed as
 * non-actionable. A detector that rejects correct knowledge is worse than no
 * detector, because it is trusted.
 */
const ACTION_VERB = /^(use|apply|choose|select|adopt|frame|anchor|lead|set|build|place|hold|render|prioriti[sz]e|avoid|replace|reject|limit|restrict|reserve|shoot|light|compose|crop|keep|treat|show|cast|ground|isolate|separate|align|scale|reduce|increase|remove|open|close|push|pull|hide|reveal|balance|weight|stage|direct|allow|require|start|end|carry|drop|raise|lower|identify|route|match|supply|verify|capture|retain|score|extend|divide|establish|include|add|split|assign|define|name|map|generate|introduce|present|position|design|construct|derive|confirm|check|test|measure|track|document|distinguish|prefer|favour|favor|default|constrain|bound|cap|fix|lock|pair|combine|order|rank|sequence|stack|layer|space|offset|rotate|invert|mirror|repeat|break|interrupt|surround|enclose|expose|dim|brighten|soften|sharpen|warm|cool|desaturate|saturate|tighten|loosen|widen|narrow|deepen|flatten|elevate|lift|lower)\\b/i;'''
assert old in s, "verb anchor missing"
s = s.replace(old, new)

# ── FIX B: universal scope is legitimate for craft and meta knowledge ─────
old2 = """    // A `principle` is universal by definition — "one organising idea per campaign"
    // is true in every industry, and demanding it name one would be asking it to
    // lie. Judging it by the same rule as a decision_rule rejected exactly the
    // knowledge that should apply everywhere, so scope is graded against the
    // object's declared type.
    const isPrinciple = o.knowledge_type === "principle";

    let score: number;
    if (n === 0) score = isPrinciple ? 7 : 0;"""

new2 = """    // Universal scope is legitimate for two kinds of knowledge, and penalising
    // them rejected most of the craft corpus at Phase 2.1 scale.
    //
    //   A `principle` or `evaluation_rule` is universal by definition — "one
    //   organising idea per campaign" and "reject interchangeable work" are true
    //   in every industry, and asking them to name one would be asking them to lie.
    //
    //   Craft domains describe how an instrument behaves. Selective focus directs
    //   attention identically in beauty and in automotive; what is situational is
    //   WHEN to reach for it, and that choice happens at decision time, not in the
    //   knowledge. Strategic domains are the opposite: context is what makes them
    //   correct or wrong, so they must still declare it.
    const universalByType = ["principle", "evaluation_rule"].includes(String(o.knowledge_type));
    const CRAFT_DOMAINS = ["camera", "lighting", "composition", "color", "material", "typography", "photography", "layout"];
    const META_DOMAINS = ["critic", "concept"];
    const universalByDomain =
      CRAFT_DOMAINS.includes(String(o.domain)) || META_DOMAINS.includes(String(o.domain));
    const mayBeUniversal = universalByType || universalByDomain;

    let score: number;
    if (n === 0) score = mayBeUniversal ? 7 : 0;"""
assert old2 in s, "scope anchor missing"
s = s.replace(old2, new2)

old3 = """      finding: n === 0
        ? isPrinciple
          ? "Universal scope, accepted because the object is declared a principle."
          : "Every axis is a wildcard — the object never says when it applies."
        : `${n}/7 axes specified: ${specific.join(", ")}`,"""
new3 = """      finding: n === 0
        ? mayBeUniversal
          ? `Universal scope, accepted for ${universalByType ? "a " + o.knowledge_type : "the " + o.domain + " domain"}.`
          : "Every axis is a wildcard — the object never says when it applies."
        : `${n}/7 axes specified: ${specific.join(", ")}`,"""
assert old3 in s, "finding anchor missing"
s = s.replace(old3, new3)

io.open(p, "w", encoding="utf-8").write(s)
print("FIX A: action-verb list widened from 60 to 130 imperatives")
print("FIX B: universal scope allowed for principles, evaluation rules, craft and meta domains")
