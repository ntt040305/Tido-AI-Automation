# -*- coding: utf-8 -*-
"""Add a Phase 2.1B section to the expansion suite."""
import io

p = "lib/image-engine/run-knowledge-expansion-tests.ts"
s = io.open(p, encoding="utf-8").read()

anchor = "console.log(\"\\n\" + \"=\".repeat(72));\nconsole.log(`${passed} passed, ${failed} failed`);"

new_section = '''// ── 8. Phase 2.1B — layout intelligence corpus ────────────────────────
section("8. Layout intelligence corpus (Phase 2.1B)");

const layouts = corpus.filter((o) => o.domain === "layout");
const layoutSubs = new Set(layouts.map((o) => o.sub_domain));

check("Layout corpus meets the 100-object target", () => {
  assert.ok(layouts.length >= 100, `expected at least 100 layout objects, found ${layouts.length}`);
  console.log(`      ${layouts.length} layout objects across ${layoutSubs.size} layout families`);
});

check("All sixteen requested layout families exist", () => {
  const required = [
    "hero_product", "problem_solution", "comparison", "testimonial", "offer", "announcement",
    "thumb_stop", "mobile_first", "tiktok_hook", "carousel", "facebook_ad",
    "luxury_minimal", "magazine_cover", "swiss_grid", "fashion_editorial", "hospitality_editorial",
  ];
  const missing = required.filter((f) => !layoutSubs.has(f));
  assert.deepStrictEqual(missing, [], `missing layout families: ${missing.join(", ")}`);
  const counts = required.map((f) => `${f}=${layouts.filter((o) => o.sub_domain === f).length}`);
  console.log(`      ${counts.join(" ")}`);
});

check("Every layout object carries a complete layout profile", () => {
  for (const o of layouts) {
    const prof = o.domain_profile as any;
    assert.ok(prof, `${o.knowledge_id} has no domain_profile`);
    assert.strictEqual(prof.kind, "layout", `${o.knowledge_id} profile is not a layout profile`);
    for (const f of ["purpose", "structure", "eye_movement", "failure_pattern"]) {
      assert.ok(prof[f] && String(prof[f]).length > 20, `${o.knowledge_id} thin ${f}`);
    }
    assert.ok(Array.isArray(prof.visual_hierarchy) && prof.visual_hierarchy.length >= 2,
      `${o.knowledge_id} needs at least two ranked hierarchy entries`);
  }
});

check("Every layout object carries use_when, avoid_when and a structured trade-off", () => {
  for (const o of layouts) {
    assert.ok(o.use_when && (Array.isArray(o.use_when) ? o.use_when.length : 1), `${o.knowledge_id} missing use_when`);
    assert.ok(o.avoid_when && (Array.isArray(o.avoid_when) ? o.avoid_when.length : 1), `${o.knowledge_id} missing avoid_when`);
    assert.ok(o.trade_off, `${o.knowledge_id} missing trade_off`);
    if (typeof o.trade_off !== "string") {
      assert.ok(o.trade_off.advantage && o.trade_off.limitation, `${o.knowledge_id} incomplete trade_off`);
    }
    assert.ok((o.anti_patterns || []).length >= 1, `${o.knowledge_id} needs an anti-pattern`);
  }
});

check("The whole layout corpus passes the quality gate", () => {
  const layoutReports = report.reports.filter((r) => r.domain === "layout");
  const rejected = layoutReports.filter((r) => !r.admitted);
  assert.strictEqual(rejected.length, 0, rejected.map((r) => `${r.knowledge_id}: ${r.rejection_reasons[0]}`).join(" | "));
  const avg = layoutReports.reduce((s, r) => s + r.overall, 0) / layoutReports.length;
  console.log(`      ${layoutReports.length}/${layoutReports.length} admitted · average ${avg.toFixed(2)}/10`);
  assert.ok(avg >= 8, `layout average ${avg.toFixed(2)} should exceed 8`);
});

check("Layout knowledge is retrievable by channel and asset type", () => {
  const retriever = new ReasoningKnowledgeRetriever(new ReasoningKnowledgeRepository(), { admission: "strict" });
  const tiktok = retriever.retrieve({ channel: "tiktok", asset_type: "social_ad", domains: ["layout"], limit: 30 });
  const poster = retriever.retrieve({ asset_type: "poster", brand_position: "luxury", domains: ["layout"], limit: 30 });
  assert.ok(tiktok.results.length >= 3, `tiktok retrieved only ${tiktok.results.length} layouts`);
  assert.ok(poster.results.length >= 3, `luxury poster retrieved only ${poster.results.length} layouts`);
  const tiktokIds = tiktok.results.map((r) => r.object.knowledge_id);
  assert.ok(!tiktokIds.some((id) => id.includes("magazine_cover")), "print cover layouts must not surface for tiktok");
});

check("Layout decisions carry concrete, checkable specifications", () => {
  const CONCRETE = /(\\b\\d+\\s?(percent|%|degrees?|points?|pixels?|by)\\b)|(\\bone\\b|\\bsingle\\b|\\btwo\\b|\\bthree\\b|\\bfour\\b|\\bupper\\b|\\blower\\b)/i;
  const vague = layouts.filter((o) => !CONCRETE.test(o.decision));
  assert.ok(vague.length <= 5, `${vague.length} layout decisions carry no concrete specification: ${vague.slice(0, 4).map((o) => o.knowledge_id).join(", ")}`);
});

'''

assert anchor in s, "summary anchor missing"
s = s.replace(anchor, new_section + anchor)
io.open(p, "w", encoding="utf-8").write(s)
print("added Phase 2.1B section to the expansion suite")
