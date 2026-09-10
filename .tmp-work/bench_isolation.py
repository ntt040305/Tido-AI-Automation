# -*- coding: utf-8 -*-
"""Add the baseline-isolation assertions (Phase 3.1.7 requirement 3)."""
import io

p = "lib/image-engine/run-creative-benchmark-tests.ts"
s = io.open(p, encoding="utf-8").read()

ANCHOR = '''  check("The benchmark makes no provider or LLM call in offline mode", () => {'''

NEW = '''  check("The baseline never touches the system under test", () => {
    // Requirement 3, enforced by reading the file rather than by intention. A
    // baseline that imported CreativeDecisionEngine or the reasoning retriever
    // would be partly the thing it is measuring, and every number in the report
    // would be worth nothing.
    const src = fs.readFileSync("lib/image-engine/benchmark/LegacyCreativeProvider.ts", "utf-8");
    const imports = src.match(/^import .*$/gm) || [];
    const forbidden = [
      "CreativeDecisionEngine",
      "CreativeConceptEngine",
      "ReasoningKnowledgeRetriever",
      "ReasoningKnowledgeRepository",
      "CreativeContextExtractor",
      "CiosReasoningShadowService",
      "CreativeKnowledgeService",
      "CreativeDirection",
      "SlotPropagationValidator",
      "reasoning-knowledge.types",
      "creative-decision.types",
    ];
    for (const name of forbidden) {
      assert.ok(
        !imports.some((line) => line.includes(name)),
        `the baseline imports ${name}; it must not use any part of the CIOS architecture`
      );
    }
    // And it must reach nothing from the reasoning layer by path either.
    assert.ok(!/from "\\.\\.\\/reasoning\\//.test(src), "the baseline imports from the reasoning layer");
  });

  check("The baseline output is structurally comparable to the CIOS output", () => {
    // Both sides must carry the same fields, or a dimension silently measures
    // presence-of-field rather than quality-of-answer.
    const ciosFields = Object.keys(results[0].cios.direction).sort();
    const legacyFields = Object.keys(results[0].legacy.direction).sort();
    assert.deepStrictEqual(legacyFields, ciosFields, "the two sides expose different direction fields");
    assert.deepStrictEqual(
      Object.keys(results[0].legacy.concept).sort(),
      Object.keys(results[0].cios.concept).sort(),
      "the two sides expose different concept fields"
    );
  });

  check("The benchmark makes no provider or LLM call in offline mode", () => {'''

assert ANCHOR in s, "isolation anchor missing"
s = s.replace(ANCHOR, NEW, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("isolation assertions added")
