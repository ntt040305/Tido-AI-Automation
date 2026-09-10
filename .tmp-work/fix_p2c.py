import io
p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

old = """    const execution_direction = retrieved
      .filter((r) => !TECHNICAL_DOMAINS.has(String(r.object.domain)))
      .filter((r) => r !== lead)
      .map((r) => sentenceCase(toIdea(r.object.decision)))
      .slice(0, 4);
    note("execution_direction", null, "non-technical decisions, direction level only");"""

new = """    const execution_direction = retrieved
      .filter((r) => !TECHNICAL_DOMAINS.has(String(r.object.domain)))
      .filter((r) => r !== lead)
      // A differentiation object's decision is a prohibition ("reject the four
      // saturated beauty defaults - water splash, floating petals..."). Placed in
      // execution_direction it becomes positive concept text that quotes the very
      // cliches it exists to reject, which the genericness scan then counts
      // against the concept. Prohibitions belong in avoid_direction, where they
      // already are.
      .filter((r) => String(r.object.domain) !== "differentiation")
      .filter((r) => String(r.object.knowledge_type) !== "anti_pattern")
      .filter((r) => !/^(reject|avoid|do not|never)\b/i.test((r.object.decision || "").trim()))
      .map((r) => sentenceCase(toIdea(r.object.decision)))
      .slice(0, 4);
    note("execution_direction", null, "positive non-technical decisions only; prohibitions routed to avoid_direction");"""

assert old in s, "anchor missing"
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("FIX 6: prohibitions no longer enter execution_direction")
