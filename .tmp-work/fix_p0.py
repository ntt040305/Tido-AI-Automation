import io
p = "lib/image-engine/run-reasoning-knowledge-tests.ts"
s = io.open(p, encoding="utf-8").read()
old = """check("Empty corpus loads cleanly (no knowledge authored yet)", () => {
  const repo = new ReasoningKnowledgeRepository();
  const all = repo.getAll();
  assert.ok(Array.isArray(all), "getAll must return an array");
  assert.strictEqual(all.length, 0, `Phase 0 must author no knowledge; found ${all.length}`);
  assert.strictEqual(repo.getLoadErrors().length, 0, "empty corpus should produce no load errors");
});"""
new = """check("Corpus loads cleanly from disk", () => {
  // Phase 0 asserted this corpus was empty, which was true until Phase 2 seeded
  // the Core Creative Brain. What Phase 0 was really testing is that the loader
  // reads the real directory without error, so that is what it now asserts.
  const repo = new ReasoningKnowledgeRepository();
  const all = repo.getAll();
  assert.ok(Array.isArray(all), "getAll must return an array");
  assert.strictEqual(repo.getLoadErrors().length, 0, JSON.stringify(repo.getLoadErrors()));
  for (const o of all) assert.ok(o.knowledge_id, "every loaded object must carry a knowledge_id");
});"""
assert old in s, "anchor missing"
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("Phase 0 assertion updated for the seeded corpus")
