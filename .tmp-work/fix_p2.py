import io

# ── FIX 1: context completeness must respect knowledge_type ──────────────
p = "lib/image-engine/reasoning/KnowledgeQualityGate.ts"
s = io.open(p, encoding="utf-8").read()

old = """    const n = specific.length;
    let score: number;
    if (n === 0) score = 0;
    else if (n <= 2) score = 5;
    else if (n <= 4) score = 9;
    else if (n <= 5) score = 10;
    else score = 7;

    return {
      dimension: "context_completeness",
      score,
      finding: n === 0
        ? "Every axis is a wildcard — the object never says when it applies."
        : `${n}/7 axes specified: ${specific.join(", ")}`,"""

new = """    const n = specific.length;

    // A `principle` is universal by definition — "one organising idea per campaign"
    // is true in every industry, and demanding it name one would be asking it to
    // lie. Judging it by the same rule as a decision_rule rejected exactly the
    // knowledge that should apply everywhere, so scope is graded against the
    // object's declared type.
    const isPrinciple = o.knowledge_type === "principle";

    let score: number;
    if (n === 0) score = isPrinciple ? 7 : 0;
    else if (n <= 2) score = 5;
    else if (n <= 4) score = 9;
    else if (n <= 5) score = 10;
    else score = 7;

    return {
      dimension: "context_completeness",
      score,
      finding: n === 0
        ? isPrinciple
          ? "Universal scope, accepted because the object is declared a principle."
          : "Every axis is a wildcard — the object never says when it applies."
        : `${n}/7 axes specified: ${specific.join(", ")}`,"""
assert old in s, "fix1 anchor missing"
s = s.replace(old, new)

old2 = """      improvement: score < this.MIN_CONTEXT_COMPLETENESS
        ? "Name at least the industry and brand position this applies to."
        : n > 5"""
new2 = """      improvement: score < this.MIN_CONTEXT_COMPLETENESS
        ? "Name at least the industry and brand position this applies to, or declare it a principle."
        : n > 5"""
assert old2 in s, "fix1b anchor missing"
s = s.replace(old2, new2)
io.open(p, "w", encoding="utf-8").write(s)
print("FIX 1 applied: principles may be universally scoped")

# ── FIX 2: differentiation must not become the big idea ──────────────────
p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

old = """  private static pickStrategic(retrieved: ScoredReasoningKnowledge[]): ScoredReasoningKnowledge[] {
    return retrieved.filter((r) => STRATEGIC_DOMAINS.has(String(r.object.domain)));
  }"""
new = """  private static pickStrategic(retrieved: ScoredReasoningKnowledge[]): ScoredReasoningKnowledge[] {
    return retrieved.filter((r) => STRATEGIC_DOMAINS.has(String(r.object.domain)));
  }

  /**
   * Chooses the object the big idea is built from.
   *
   * Score alone picks the wrong lead. A differentiation object says what NOT to
   * do, and an anti_pattern is an avoidance rule; either can outscore a strategy
   * object and turn the campaign's central thought into a prohibition. The lead is
   * therefore chosen by what a domain is FOR, and only ranked by score within that.
   * Differentiation still shapes the concept — through `differentiation` and
   * `avoid_direction`, which is where a rejection belongs.
   */
  private static pickLead(retrieved: ScoredReasoningKnowledge[]): ScoredReasoningKnowledge | undefined {
    const eligible = (r: ScoredReasoningKnowledge) => r.object.knowledge_type !== "anti_pattern";
    for (const domain of ["strategy", "concept", "audience"]) {
      const hit = retrieved.filter((r) => String(r.object.domain) === domain && eligible(r))[0];
      if (hit) return hit;
    }
    return this.pickStrategic(retrieved).filter(eligible)[0] || retrieved.filter(eligible)[0] || retrieved[0];
  }"""
assert old in s, "fix2 anchor missing"
s = s.replace(old, new)

old2 = """    const lead = strategic[0] || retrieved[0];"""
new2 = """    const lead = this.pickLead(retrieved);"""
assert old2 in s, "fix2b anchor missing"
s = s.replace(old2, new2)
io.open(p, "w", encoding="utf-8").write(s)
print("FIX 2 applied: big idea leads from strategy/concept/audience, never an anti-pattern")

# ── FIX 3: correct the leakage assertion ─────────────────────────────────
p = "lib/image-engine/run-knowledge-quality-tests.ts"
s = io.open(p, encoding="utf-8").read()
old = """check("Different industries retrieve different knowledge and produce different concepts", () => {
  assert.notStrictEqual(skin.concept.big_idea, fashion.concept.big_idea);
  const overlap = skin.concept.derived_from.filter((id) => fashion.concept.derived_from.includes(id));
  assert.strictEqual(overlap.length, 0, `industry leakage: ${overlap.join(", ")}`);
});"""
new = """check("Different industries produce different concepts, with no industry-locked leakage", () => {
  assert.notStrictEqual(skin.concept.big_idea, fashion.concept.big_idea);

  // Cross-industry knowledge is SUPPOSED to appear in both — a principle that
  // applies everywhere is not leakage. What must never cross is knowledge locked
  // to one industry.
  const industryLocked = (id: string) => /^(differentiation)\\./.test(id);
  const crossed = skin.concept.derived_from.filter(
    (id) => industryLocked(id) && fashion.concept.derived_from.includes(id)
  );
  assert.strictEqual(crossed.length, 0, `industry-locked leakage: ${crossed.join(", ")}`);

  const shared = skin.concept.derived_from.filter((id) => fashion.concept.derived_from.includes(id));
  assert.ok(shared.every((id) => !industryLocked(id)), "only cross-industry knowledge may be shared");
});"""
assert old in s, "fix3 anchor missing"
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("FIX 3 applied: assertion now distinguishes leakage from legitimate universality")
