# -*- coding: utf-8 -*-
"""Append the Phase 2.1B Batch 4 typography section to the expansion suite."""
import io

p = "lib/image-engine/run-knowledge-expansion-tests.ts"
s = io.open(p, encoding="utf-8").read()

ANCHOR = '\nconsole.log("\\n" + "=".repeat(72));\nconsole.log(`${passed} passed, ${failed} failed`);'
assert ANCHOR in s, "summary anchor missing"

SECTION = r'''
// -- 9. Phase 2.1B -- typography intelligence corpus -------------------
section("9. Typography intelligence corpus (Phase 2.1B)");

const typo = corpus.filter((o) => o.domain === "typography");
const typoSubs = new Set(typo.map((o) => o.sub_domain));
const typoReports = report.reports.filter((r) => r.domain === "typography");

check("Typography corpus meets the 150-object minimum", () => {
  assert.ok(typo.length >= 150, `expected at least 150 typography objects, found ${typo.length}`);
  console.log(`      ${typo.length} typography objects across ${typoSubs.size} families`);
});

check("All six requested typography groups are represented", () => {
  // The brief named six groups. Each is covered by a set of sub-domains rather
  // than one, since "font psychology" is a claim about five classifications and
  // "industry typography" is a claim about seven categories.
  const groups: [string, string[]][] = [
    ["font psychology", ["serif_authority", "modern_sans", "display_emotion", "humanist", "geometric"]],
    ["hierarchy", ["hero_hierarchy", "conversion_hierarchy", "luxury_hierarchy", "editorial_hierarchy", "information_hierarchy"]],
    ["font pairing", ["luxury_pairing", "editorial_pairing", "technology_pairing", "beauty_pairing", "hospitality_pairing"]],
    ["spacing", ["negative_space", "tracking", "leading", "density_control", "premium_restraint"]],
    ["industry", ["beauty_typography", "food_typography", "fashion_typography", "hospitality_typography", "technology_typography", "real_estate_typography", "healthcare_typography"]],
    ["vietnamese", ["vietnamese_diacritics", "vietnamese_compatibility", "vietnamese_readability", "vietnamese_brand_voice"]],
  ];
  for (const [group, subs] of groups) {
    const missing = subs.filter((sub) => !typoSubs.has(sub));
    assert.deepStrictEqual(missing, [], `${group} group missing sub-domains: ${missing.join(", ")}`);
    const n = typo.filter((o) => subs.includes(o.sub_domain)).length;
    assert.ok(n >= 16, `${group} group has only ${n} objects`);
    console.log(`      ${group}: ${n} objects across ${subs.length} families`);
  }
});

check("Every typography object carries the full six-field reasoning profile", () => {
  // These six fields are what separate a typography corpus from a font
  // recommendation list: purpose and signal say why, hierarchy_rule and
  // spacing_rule say how, failure_pattern says when it stops working.
  const required = ["purpose", "visual_effect", "psychological_signal", "hierarchy_rule", "spacing_rule", "failure_pattern"];
  for (const o of typo) {
    const prof = o.domain_profile as any;
    assert.ok(prof, `${o.knowledge_id} has no domain_profile`);
    assert.strictEqual(prof.kind, "typography", `${o.knowledge_id} profile is not a typography profile`);
    for (const f of required) {
      assert.ok(
        prof[f] && String(prof[f]).length > 20,
        `${o.knowledge_id} typography profile missing or thin on ${f}`
      );
    }
  }
});

check("Every typography object carries use_when, avoid_when, trade-off and an anti-pattern", () => {
  for (const o of typo) {
    assert.ok(o.use_when && (Array.isArray(o.use_when) ? o.use_when.length : 1), `${o.knowledge_id} missing use_when`);
    assert.ok(o.avoid_when && (Array.isArray(o.avoid_when) ? o.avoid_when.length : 1), `${o.knowledge_id} missing avoid_when`);
    assert.ok(o.trade_off, `${o.knowledge_id} missing trade_off`);
    if (typeof o.trade_off !== "string") {
      assert.ok(o.trade_off.advantage && o.trade_off.limitation, `${o.knowledge_id} incomplete trade_off`);
    }
    assert.ok((o.anti_patterns || []).length >= 1, `${o.knowledge_id} needs an anti-pattern`);
  }
});

check("The whole typography corpus passes the quality gate", () => {
  const rejected = typoReports.filter((r) => !r.admitted);
  assert.strictEqual(rejected.length, 0, rejected.map((r) => `${r.knowledge_id}: ${r.rejection_reasons[0]}`).join(" | "));
  const avg = typoReports.reduce((s, r) => s + r.overall, 0) / typoReports.length;
  console.log(`      ${typoReports.length}/${typoReports.length} admitted - average ${avg.toFixed(2)}/10`);
  assert.ok(avg >= 8, `typography average ${avg.toFixed(2)} should exceed 8`);
});

check("Typography decisions score well on the gate's own specificity measure", () => {
  // Same discipline as the layout section: ask the gate rather than carrying a
  // second definition of what counts as specific.
  const weak = typoReports.filter((r) => r.dimensions.find((d) => d.dimension === "specificity")!.score < 6);
  assert.ok(
    weak.length <= 8,
    `${weak.length} typography decisions scored under 6 for specificity: ${weak.slice(0, 5).map((r) => r.knowledge_id).join(", ")}`
  );
  const avg =
    typoReports.reduce((t, r) => t + r.dimensions.find((d) => d.dimension === "specificity")!.score, 0) /
    typoReports.length;
  console.log(`      mean typography specificity ${avg.toFixed(2)}/10`);
  assert.ok(avg >= 6.5, `mean specificity ${avg.toFixed(2)} is too low for a craft corpus`);
});

check("Typography knowledge is retrievable by industry and position", () => {
  const retriever = new ReasoningKnowledgeRetriever(new ReasoningKnowledgeRepository(), { admission: "strict" });
  const luxury = retriever.retrieve({ brand_position: "luxury", domains: ["typography"], limit: 40 });
  const clinical = retriever.retrieve({ industry: "healthcare", domains: ["typography"], limit: 40 });
  assert.ok(luxury.results.length >= 3, `luxury retrieved only ${luxury.results.length} typography objects`);
  assert.ok(clinical.results.length >= 3, `healthcare retrieved only ${clinical.results.length} typography objects`);
  const clinicalIds = clinical.results.map((r) => r.object.knowledge_id);
  assert.ok(
    !clinicalIds.some((id) => id.includes("fashion_typography")),
    "fashion-scoped typography must not surface for a healthcare brief"
  );
  console.log(`      luxury ${luxury.results.length} - healthcare ${clinical.results.length}`);
});

check("Vietnamese typography knowledge covers diacritics, compatibility and readability", () => {
  // The single most common local failure is vertical: a stacked tone mark needs
  // room Latin leading does not reserve. The corpus has to say so in more than
  // one place, because the constraint reaches leading, size and face selection.
  const viet = typo.filter((o) => o.sub_domain.startsWith("vietnamese"));
  assert.ok(viet.length >= 16, `expected at least 16 Vietnamese typography objects, found ${viet.length}`);
  const withNote = typo.filter((o) => (o.domain_profile as any)?.vietnamese_note);
  assert.ok(withNote.length >= 16, `only ${withNote.length} typography objects carry a Vietnamese note`);
  const mentionsLeading = viet.filter((o) => /leading|clearance|vertical/i.test(JSON.stringify(o)));
  assert.ok(mentionsLeading.length >= 4, "Vietnamese typography must address the vertical constraint");
  console.log(`      ${viet.length} Vietnamese objects - ${withNote.length} objects carry a Vietnamese note`);
});
'''

s = s.replace(ANCHOR, SECTION + ANCHOR)
io.open(p, "w", encoding="utf-8").write(s)
print("appended section 9 (%d chars)" % len(SECTION))
