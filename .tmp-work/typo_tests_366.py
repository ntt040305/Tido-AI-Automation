# -*- coding: utf-8 -*-
"""Phase 3.1.6.6 — update the slot propagation suite for first-class typography."""
import io

p = "lib/image-engine/run-slot-propagation-tests.ts"
s = io.open(p, encoding="utf-8").read()

OLD = '''check("typography_strategy has no path into the resolver block — reported, not hidden", () => {
  // Typography is not an ArtDirectionDimension: the resolver arbitrates seven
  // visual dimensions and typography is not among them. Its prompt line is built
  // by the Layer 1 service's own guidance text, which the reasoning path does not
  // supply. So the slot fills, the resolver never sees it, and this test records
  // that boundary rather than letting a later phase discover it by surprise.
  const set = decideFrom([
    K({ knowledge_id: "typography.hierarchy.three.001", domain: "typography", decision: "Limit the asset to three type levels separated by a 1.5 size ratio." }),
  ]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  assert.ok(direction.typography_strategy.includes("three type levels"), "the slot must still be filled");

  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: emptyIntent,
    knowledgeDirection: direction,
    assetType: "poster",
  });
  const report = SlotPropagationValidator.validate(set, direction, resolved.promptBlock);
  assert.strictEqual(report.records[0].compiler_received, "NOT_IN_PROMPT");
  assert.ok(report.broken_hops.some((b) => b.startsWith("typography_strategy")));
});'''

NEW = '''check("typography_strategy reaches the resolver block", () => {
  // Phase 3.1.6.6. This assertion is the exact inverse of the one it replaces:
  // until typography became an ArtDirectionDimension the slot filled and the
  // resolver never saw it, which 3.1.6.5 recorded as a boundary rather than
  // letting a later phase find it by surprise.
  const set = decideFrom([
    K({ knowledge_id: "typography.hierarchy.three.001", domain: "typography", decision: "Limit the asset to three type levels separated by a 1.5 size ratio." }),
  ]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  assert.ok(direction.typography_strategy.includes("three type levels"), "the slot must be filled");

  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: emptyIntent,
    knowledgeDirection: direction,
    assetType: "poster",
  });
  assert.strictEqual(resolved.fields.typography?.source, "KNOWLEDGE", "typography did not resolve at the KNOWLEDGE tier");
  assert.ok(resolved.promptBlock.includes("TYPOGRAPHY"), "the TYPOGRAPHY label is missing from the block");
  assert.ok(resolved.promptBlock.includes("three type levels"), "the decision text did not reach the block");

  const report = SlotPropagationValidator.validate(set, direction, resolved.promptBlock);
  assert.strictEqual(report.records[0].compiler_received, "RECEIVED");
  assert.deepStrictEqual(report.broken_hops, []);
});

check("Typography is routed by dimension, like every other visual domain", () => {
  const routing = CreativeDecisionEngine.route(
    K({ knowledge_id: "typography.a.b.001", domain: "typography", decision: "Limit the asset to three type levels." })
  );
  assert.strictEqual(routing.target, "ART_DIRECTION");
  assert.strictEqual(routing.dimension, "typography", "typography must now claim a resolver dimension");
  const set = decideFrom([
    K({ knowledge_id: "typography.a.b.001", domain: "typography", decision: "Limit the asset to three type levels." }),
  ]);
  assert.strictEqual(set.art_direction[0].direction_slot, "typography_strategy");
  assert.strictEqual(set.art_direction[0].art_direction_dimension, "typography");
});

check("A client typographic instruction is arbitrated against retrieved typography", () => {
  // The point of making typography a dimension rather than a private channel: it
  // is now arbitrated. A decision that could not be outranked would hold a
  // stronger authority than a client instruction, which no tier below USER has.
  const set = decideFrom([
    K({ knowledge_id: "typography.a.b.001", domain: "typography", decision: "Limit the asset to three type levels separated by a 1.5 size ratio." }),
  ]);
  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: { ...emptyIntent, important_user_requirements: ["Set every headline in all capitals, tracked wide"] },
    knowledgeDirection: CreativeDecisionEngine.toCreativeDirection(set),
    assetType: "poster",
  });
  assert.ok(resolved.fields.typography, "typography did not resolve at all");
  const occurrences = resolved.promptBlock.split("TYPOGRAPHY").length - 1;
  assert.strictEqual(occurrences, 1, "TYPOGRAPHY printed " + occurrences + " times");
});

check("Backward compatibility: no typography knowledge still resolves and renders", () => {
  // Task 6. An asset whose retrieval produced no typographic decision must not
  // gain an empty TYPOGRAPHY line, and must not fail to resolve.
  const set = decideFrom([
    K({ knowledge_id: "camera.angle.hero.001", domain: "camera", decision: "Shoot at eye level on a 50mm lens." }),
  ]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  assert.strictEqual(direction.typography_strategy, "", "no typography knowledge means an empty slot");

  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: emptyIntent,
    knowledgeDirection: direction,
    assetType: "poster",
  });
  assert.strictEqual(resolved.fields.typography, undefined, "an empty slot must not resolve a dimension");
  assert.ok(!resolved.promptBlock.includes("TYPOGRAPHY"), "an empty typography slot must print no line");
  assert.ok(resolved.promptBlock.includes("CAMERA"), "the rest of the block must still render");
});'''

assert OLD in s, "typography boundary test anchor missing"
s = s.replace(OLD, NEW)

OLD5 = '''    // Everything except typography must also reach the prompt block.
    const strandedBeyondTypography = report.records.filter(
      (r) => r.compiler_received === "NOT_IN_PROMPT" && r.direction_slot !== "typography_strategy"
    );
    assert.deepStrictEqual(
      strandedBeyondTypography.map((r) => `${r.direction_slot}:${r.knowledge_id}`),
      [],
      "a resolver-backed slot did not reach the prompt block"
    );
'''

NEW5 = '''    // Phase 3.1.6.6: no slot is stranded any more. The typography carve-out this
    // assertion used to carry is gone, which is the whole point of the phase.
    assert.deepStrictEqual(
      report.records.filter((r) => r.compiler_received === "NOT_IN_PROMPT").map((r) => `${r.direction_slot}:${r.knowledge_id}`),
      [],
      "a decision reached CreativeDirection but not the prompt block"
    );
    assert.strictEqual(
      report.summary.received_by_compiler,
      report.summary.decisions,
      "every decision must reach the prompt block"
    );
'''

assert OLD5 in s, "five-case anchor missing"
s = s.replace(OLD5, NEW5)

io.open(p, "w", encoding="utf-8").write(s)
print("slot propagation tests updated for typography")
