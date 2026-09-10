# -*- coding: utf-8 -*-
"""Phase 3.1.6.6 — typography now claims a resolver dimension."""
import io

p = "lib/image-engine/run-creative-decision-tests.ts"
s = io.open(p, encoding="utf-8").read()

OLD = '''check("typography reaches typography_strategy without a resolver dimension", () => {
  // Typography has a CreativeDirection field and no ArtDirectionDimension. Before
  // 3.1.6 it was listed as an advisory domain, so 48 retrievals across the V1
  // benchmark produced nothing. It now routes by slot instead of by dimension.
  const t = K({
    knowledge_id: "typography.hierarchy.three_level.001",
    domain: "typography",
    decision: "Limit the asset to three type levels separated by a 1.5 size ratio.",
  });
  const routing = CreativeDecisionEngine.route(t);
  assert.strictEqual(routing.target, "ART_DIRECTION");
  assert.strictEqual(routing.dimension, undefined, "typography must not claim a resolver dimension");
  assert.strictEqual(routing.slot, "typography_strategy");
  const set = CreativeDecisionEngine.decide(new ReasoningKnowledgeRetriever(repoOf([t])).retrieve({}).results);
  assert.strictEqual(set.unmapped.length, 0);
  assert.ok(CreativeDecisionEngine.toCreativeDirection(set).typography_strategy.includes("three type levels"));
});'''

NEW = '''check("typography is a first-class dimension reaching typography_strategy", () => {
  // Three states in three phases, so the history is worth stating: before 3.1.6
  // typography was an advisory domain and 48 retrievals across the V1 benchmark
  // produced nothing; 3.1.6 gave it a slot but no dimension, so it filled the
  // field and never reached the resolver; 3.1.6.6 made it a dimension, so it is
  // now arbitrated and printed like every other visual decision.
  const t = K({
    knowledge_id: "typography.hierarchy.three_level.001",
    domain: "typography",
    decision: "Limit the asset to three type levels separated by a 1.5 size ratio.",
  });
  const routing = CreativeDecisionEngine.route(t);
  assert.strictEqual(routing.target, "ART_DIRECTION");
  assert.strictEqual(routing.dimension, "typography", "typography must claim its resolver dimension");
  const set = CreativeDecisionEngine.decide(new ReasoningKnowledgeRetriever(repoOf([t])).retrieve({}).results);
  assert.strictEqual(set.unmapped.length, 0);
  assert.strictEqual(set.art_direction[0].direction_slot, "typography_strategy");
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  assert.ok(direction.typography_strategy.includes("three type levels"));

  // And it survives the resolver, which is the hop 3.1.6 left open.
  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: {
      subject: [], environment: [], mood: [], style: [],
      camera_requirements: [], lighting_requirements: [],
      non_negotiable_constraints: [], important_user_requirements: [],
    },
    knowledgeDirection: direction,
    assetType: "poster",
  });
  assert.strictEqual(resolved.fields.typography?.source, "KNOWLEDGE");
  assert.ok(resolved.promptBlock.includes("three type levels"));
});'''

assert OLD in s, "typography decision test anchor missing"
s = s.replace(OLD, NEW)
io.open(p, "w", encoding="utf-8").write(s)
print("decision test updated for first-class typography")
