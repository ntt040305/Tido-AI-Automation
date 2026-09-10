# -*- coding: utf-8 -*-
"""Phase 4.0 Tasks 3-5 — retrieval group, lead domains, concept gate."""
import io

# ── Task 3a: concept domains get their own retrieval group ──────────────
p = "lib/image-engine/reasoning/reasoning-knowledge.types.ts"
s = io.open(p, encoding="utf-8").read()

OLD = '''/** Grouping key for the retrieval budget: a slot name, or the non-visual bucket. */
export const NON_VISUAL_GROUP = "non_visual";

export function retrievalGroup(domain: string): string {
  return DOMAIN_DIRECTION_SLOT[domain] || NON_VISUAL_GROUP;
}'''

NEW = '''/** Grouping key for the retrieval budget: a slot name, or one of two buckets. */
export const NON_VISUAL_GROUP = "non_visual";

/**
 * Phase 4.0 — concept-bearing domains get their own retrieval group.
 *
 * Before this they shared `non_visual` with channel, production, critic and
 * examples. Measured across the thirty benchmark cases, that group's single
 * quota slot went to an `industry` or `channel` object on 26 of 30 briefs, so
 * the concept layer had nothing to lead from and produced no idea at all.
 *
 * A separate group guarantees the coverage pass reaches a concept object on
 * every brief that retrieves one. It does not guarantee a good idea — only that
 * the layer is given something to work with.
 */
export const CONCEPT_GROUP = "concept_intelligence";

export const CONCEPT_RETRIEVAL_DOMAINS = new Set([
  "human_tension",
  "consumer_insight",
  "campaign_territory",
  "idea_pattern",
  "strategy",
  "audience",
  "concept",
  "category",
  "differentiation",
]);

export function retrievalGroup(domain: string): string {
  if (DOMAIN_DIRECTION_SLOT[domain]) return DOMAIN_DIRECTION_SLOT[domain];
  if (CONCEPT_RETRIEVAL_DOMAINS.has(domain)) return CONCEPT_GROUP;
  return NON_VISUAL_GROUP;
}'''
assert OLD in s, "retrievalGroup anchor missing"
s = s.replace(OLD, NEW)
io.open(p, "w", encoding="utf-8").write(s)
print("Task 3a: concept retrieval group added")

# ── Task 3b: the new domains may lead a concept ─────────────────────────
p = "lib/image-engine/reasoning/concept-validation.types.ts"
s = io.open(p, encoding="utf-8").read()
OLD = '''export const CONCEPT_LEAD_DOMAINS = new Set([
  "strategy",
  "concept",
  "audience",
  "category",
  "differentiation",
  "industry",
]);'''
NEW = '''export const CONCEPT_LEAD_DOMAINS = new Set([
  // Phase 4.0 — the Creative Concept Intelligence domains, authored specifically
  // to lead. Listed first because `pickLead` walks this order and a tension or a
  // territory is a better source for a big idea than a strategy rule is.
  "human_tension",
  "consumer_insight",
  "campaign_territory",
  "idea_pattern",
  "strategy",
  "concept",
  "audience",
  "category",
  "differentiation",
  "industry",
]);

/**
 * Preference order for the concept lead.
 *
 * A human tension is the strongest starting point for a campaign idea, a
 * territory the next. `industry` sits last: a category communication model can
 * ground an idea but rarely is one.
 */
export const CONCEPT_LEAD_PRIORITY = [
  "human_tension",
  "campaign_territory",
  "consumer_insight",
  "idea_pattern",
  "strategy",
  "concept",
  "audience",
  "differentiation",
  "category",
  "industry",
];'''
assert OLD in s, "lead domains anchor missing"
s = s.replace(OLD, NEW)
io.open(p, "w", encoding="utf-8").write(s)
print("Task 3b: concept lead domains extended")

# ── Task 3c + 4: pickLead walks the priority, trace records the chain ───
p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

OLD = '''    for (const domain of ["strategy", "concept", "audience"]) {
      const hit = retrieved.filter((r) => String(r.object.domain) === domain && eligible(r))[0];
      if (hit) return hit;
    }'''
NEW = '''    // Phase 4.0 — walk the concept-lead priority rather than a fixed triple. A
    // human tension is a better origin for a campaign idea than a strategy rule,
    // and the priority order is stated once in concept-validation.types.
    for (const domain of CONCEPT_LEAD_PRIORITY) {
      const hit = retrieved.filter((r) => String(r.object.domain) === domain && eligible(r))[0];
      if (hit) return hit;
    }'''
assert OLD in s, "pickLead loop anchor missing"
s = s.replace(OLD, NEW)
s = s.replace('import { CONCEPT_LEAD_DOMAINS } from "./concept-validation.types";',
              'import { CONCEPT_LEAD_DOMAINS, CONCEPT_LEAD_PRIORITY } from "./concept-validation.types";')
io.open(p, "w", encoding="utf-8").write(s)
print("Task 3c: pickLead walks the concept priority")
