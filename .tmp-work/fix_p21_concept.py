# -*- coding: utf-8 -*-
"""Phase 2.1 regressions in CreativeConceptEngine, both caused by corpus growth."""
import io

p = "lib/image-engine/reasoning/CreativeConceptEngine.ts"
s = io.open(p, encoding="utf-8").read()

# ── FIX 1: camera and lighting are technical domains too ─────────────────
old = '''/** Domains whose decisions are technical execution, excluded from concept text. */
const TECHNICAL_DOMAINS = new Set(["photography", "material", "production"]);'''

new = '''/**
 * Domains whose decisions are technical execution, excluded from concept text.
 *
 * Phase 2.1 split `camera` and `lighting` out of `photography`. This set was not
 * updated with them, so lens and lighting decisions began arriving in
 * `execution_direction` and carried technical vocabulary into the concept — the
 * exact leak the layer separation test exists to catch. Splitting a domain means
 * revisiting every set that named its parent.
 */
const TECHNICAL_DOMAINS = new Set([
  "photography",
  "camera",
  "lighting",
  "material",
  "production",
  "typography",
]);'''
assert old in s, "technical domains anchor missing"
s = s.replace(old, new)

# ── FIX 2: cliche detection must match phrases, not scattered words ──────
old2 = """    const clicheHits = knownCliches.filter((c) => {
      const words = c.toLowerCase().split(/[\\s,]+/).filter((w) => w.length > 4);
      const overlap = words.filter((w) => positive.includes(w)).length;
      return words.length > 0 && overlap / words.length > 0.6;
    });"""

new2 = """    // Scattered-word overlap was workable against a dozen objects and produced
    // false positives as soon as the corpus reached a hundred: with twelve
    // objects retrieved, the positive prose is long enough that six unrelated
    // words from a cliche appear somewhere in it by chance. Restating a cliche
    // means reproducing its phrase, so three consecutive significant words is the
    // signal — far harder to trip accidentally and far closer to what it means to
    // actually repeat a category default.
    const clicheHits = knownCliches.filter((c) => {
      const words = c.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4);
      if (words.length < 3) return false;
      for (let i = 0; i + 2 < words.length; i++) {
        const phrase = words.slice(i, i + 3);
        const pattern = phrase.join("[^a-z0-9]+");
        if (new RegExp(pattern, "i").test(positive)) return true;
      }
      return false;
    });"""
assert old2 in s, "cliche anchor missing"
s = s.replace(old2, new2)

io.open(p, "w", encoding="utf-8").write(s)
print("FIX 1: camera, lighting, typography added to TECHNICAL_DOMAINS")
print("FIX 2: cliche detection now requires a three-word phrase, not scattered words")
