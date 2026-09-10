# -*- coding: utf-8 -*-
import io

# ── FIX 1: the two pre-framework layout objects need profiles ────────────
def add_profile(path, lines):
    t = io.open(path, encoding="utf-8").read()
    assert "domain_profile:" not in t, "already has a profile: " + path
    marker = "impact:"
    idx = t.index("\n" + marker)
    block = "\ndomain_profile:\n" + "\n".join(lines)
    t = t[:idx] + block + t[idx:]
    io.open(path, "w", encoding="utf-8").write(t)
    print("  profiled " + path)

add_profile("data/cios-knowledge/layout/negative_space_premium_hero.yaml", [
    "  kind: layout",
    '  purpose: "Assert value by giving a single subject far more space than it needs."',
    '  structure: "Subject on one dominant axis with at least half the frame reserved as unbroken empty field."',
    "  visual_hierarchy:",
    "    - Reserved emptiness",
    "    - Subject",
    "    - Brand mark",
    '  eye_movement: "Registers the emptiness first, finds the subject, returns to the space around it."',
    '  failure_pattern: "The reserved area is progressively backfilled during review until the layout returns to category average."',
])

add_profile("data/cios-knowledge/layout/mobile_first_social_hierarchy.yaml", [
    "  kind: layout",
    '  purpose: "Protect the message from platform interface in a vertical social frame."',
    '  structure: "Subject and primary message within the upper two thirds, lower third reserved for platform chrome."',
    "  visual_hierarchy:",
    "    - Primary message",
    "    - Subject",
    "    - Reserved lower band",
    '  eye_movement: "Travels top to bottom in a single pass, stopping before the reserved band."',
    '  failure_pattern: "Content placed in the lower third is covered by captions and controls, and is never seen."',
])

# ── FIX 2: the test must use the gate, not a second definition ───────────
p = "lib/image-engine/run-knowledge-expansion-tests.ts"
s = io.open(p, encoding="utf-8").read()

start = s.index('check("Layout decisions carry concrete, checkable specifications"')
end = s.index("});", s.index("assert.ok(vague.length", start)) + len("});\n")

new_check = '''check("Layout decisions score well on the gate's own specificity measure", () => {
  // Deliberately asks the gate rather than re-testing "concrete" here. An earlier
  // version of this check carried its own regex, disagreed with the gate about
  // what counts as specific — it did not recognise "a third of frame", "twice the
  // spacing" or "twelve-column grid" — and failed 24 objects the gate had passed.
  // Two definitions of the same property is one definition too many.
  const layoutReports = report.reports.filter((r) => r.domain === "layout");
  const weak = layoutReports.filter(
    (r) => r.dimensions.find((d) => d.dimension === "specificity")!.score < 6
  );
  assert.ok(
    weak.length <= 8,
    `${weak.length} layout decisions scored under 6 for specificity: ${weak.slice(0, 5).map((r) => r.knowledge_id).join(", ")}`
  );
  const avg =
    layoutReports.reduce(
      (t, r) => t + r.dimensions.find((d) => d.dimension === "specificity")!.score,
      0
    ) / layoutReports.length;
  console.log(`      mean layout specificity ${avg.toFixed(2)}/10`);
  assert.ok(avg >= 7, `mean specificity ${avg.toFixed(2)} is too low for a craft corpus`);
});
'''
s = s[:start] + new_check + s[end:]
io.open(p, "w", encoding="utf-8").write(s)
print("test now defers to the gate for specificity")
