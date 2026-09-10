import assert from "assert";
import fs from "fs";
import path from "path";
import { CreativeConceptEngine } from "./reasoning/CreativeConceptEngine";
import { CreativeContextExtractor } from "./reasoning/CreativeContextExtractor";
import { CreativeDecisionEngine } from "./reasoning/CreativeDecisionEngine";
import { ConceptQualityGate } from "./reasoning/ConceptQualityGate";
import { KnowledgeQualityGate } from "./reasoning/KnowledgeQualityGate";
import { LLM_QUALITY_CRITERIA, LLMKnowledgeEvaluator } from "./reasoning/LLMKnowledgeEvaluator";
import { ReasoningKnowledgeRepository } from "./reasoning/ReasoningKnowledgeRepository";
import { ReasoningKnowledgeRetriever } from "./reasoning/ReasoningKnowledgeRetriever";
import { ReasoningKnowledgeValidator } from "./reasoning/ReasoningKnowledgeValidator";
import { REASONING_DOMAINS } from "./reasoning/reasoning-knowledge.types";
import { MIN_ATTRIBUTION_CONFIDENCE, MIN_SAMPLES_FOR_PERFORMANCE_SIGNAL } from "./reasoning/knowledge-evolution.types";
import { ArtDirectionResolverService } from "./service/ArtDirectionResolverService";
import { LockedIntent } from "./service/CreativeInterpretationService";

/**
 * Phase 2.1 verification — Creative Knowledge Brain expansion.
 *
 * Runs against the real corpus on disk, not fixtures. At this scale the corpus is
 * the thing under test: a gate that only holds against knowledge written to pass
 * it has proved nothing.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
const section = (t: string) => console.log(`\n🔹 ${t}`);

const repo = new ReasoningKnowledgeRepository();
const corpus = repo.getAll();
const report = KnowledgeQualityGate.evaluateCorpus(corpus);

console.log("=".repeat(72));
console.log("CIOS PHASE 2.1 — CREATIVE KNOWLEDGE BRAIN EXPANSION");
console.log("=".repeat(72));

// ── 1. Corpus scale and integrity ─────────────────────────────────────
section("1. Corpus scale and integrity");

check("Corpus meets the 100-object minimum", () => {
  assert.ok(corpus.length >= 100, `expected at least 100 objects, found ${corpus.length}`);
  console.log(`      ${corpus.length} objects across ${Object.keys(repo.stats().byDomain).length} domains`);
});

check("No parse errors, no duplicate ids, no broken relations", () => {
  assert.strictEqual(repo.getLoadErrors().length, 0, JSON.stringify(repo.getLoadErrors()));
  assert.deepStrictEqual(repo.findDuplicateIds(), []);
  assert.deepStrictEqual(repo.findBrokenRelations(), []);
});

check("Every object is structurally valid against the unchanged V2 schema", () => {
  const summary = ReasoningKnowledgeValidator.validateAll(corpus);
  assert.strictEqual(summary.errors, 0, JSON.stringify(summary.issues.filter((i) => i.severity === "ERROR").slice(0, 5), null, 2));
});

check("Schema was extended, not replaced — core V2 fields still required", () => {
  const schemaPath = path.join(repo.getRootDir(), "_schema/reasoning_knowledge_schema_v2.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  for (const f of ["knowledge_id", "domain", "context", "decision", "reasoning", "why_this_works", "use_when", "avoid_when", "impact", "impact_score", "priority", "confidence"]) {
    assert.ok(schema.required.includes(f), `V2 required field "${f}" was dropped`);
  }
  assert.strictEqual(schema.additionalProperties, false, "schema must stay closed");
});

// ── 2. Domain expansion ───────────────────────────────────────────────
section("2. Domain architecture expansion");

check("All 14 requested intelligence areas are represented", () => {
  const stats = repo.stats().byDomain;
  const required = [
    ["strategy intelligence", "strategy"],
    ["audience psychology", "audience"],
    ["concept intelligence", "concept"],
    ["differentiation intelligence", "differentiation"],
    ["photography intelligence", "photography"],
    ["lighting intelligence", "lighting"],
    ["camera language intelligence", "camera"],
    ["composition intelligence", "composition"],
    ["color intelligence", "color"],
    ["material intelligence", "material"],
    ["layout intelligence", "layout"],
    ["typography intelligence", "typography"],
    ["channel intelligence", "channel"],
    ["industry intelligence", "industry"],
  ];
  for (const [label, domain] of required) {
    assert.ok((REASONING_DOMAINS as readonly string[]).includes(domain), `${label}: domain "${domain}" not declared`);
    assert.ok((stats[domain] || 0) > 0, `${label}: domain "${domain}" has no knowledge`);
  }
  console.log(`      ${Object.entries(stats).sort().map(([d, n]) => `${d}=${n}`).join(" ")}`);
});

check("New domains split what was previously conflated", () => {
  for (const d of ["lighting", "camera", "composition", "industry"]) {
    assert.ok((REASONING_DOMAINS as readonly string[]).includes(d), `${d} missing from domain list`);
  }
  // The predecessor domain is retained so earlier objects stay valid.
  assert.ok((REASONING_DOMAINS as readonly string[]).includes("category"), "category must be retained for compatibility");
});

check("Priority industries are covered", () => {
  const byIndustry: Record<string, number> = {};
  for (const o of corpus) {
    const inds = Array.isArray(o.context?.industry) ? o.context.industry : [o.context?.industry];
    for (const i of inds) if (i && i !== "*") byIndustry[String(i)] = (byIndustry[String(i)] || 0) + 1;
  }
  for (const ind of ["beauty", "food_beverage", "fashion", "hospitality"]) {
    assert.ok((byIndustry[ind] || 0) >= 3, `industry "${ind}" has only ${byIndustry[ind] || 0} objects`);
  }
  console.log(`      ${Object.entries(byIndustry).sort((a, b) => b[1] - a[1]).map(([i, n]) => `${i}=${n}`).join(" ")}`);
});

// ── 3. Quality gate at scale ──────────────────────────────────────────
section("3. Quality gate at scale");

check("Entire corpus passes the gate", () => {
  const rejected = report.reports.filter((r) => !r.admitted);
  assert.strictEqual(rejected.length, 0, rejected.map((r) => `${r.knowledge_id}: ${r.rejection_reasons[0]}`).join(" | "));
  console.log(`      ${report.admitted}/${report.total} admitted · average ${report.average_overall}/10`);
});

check("Average quality is well clear of the admission floor", () => {
  assert.ok(report.average_overall >= 8, `average ${report.average_overall} should exceed 8 at this scale`);
});

check("Hedging in a decision still fails, hedging in reasoning does not", () => {
  const base = corpus.find((o) => o.knowledge_id === "strategy.identity_preservation.mature_skincare.001")!;
  const hedgedDecision = { ...base, decision: "Lighting may be adjusted as appropriate according to the needs of the frame." };
  const hedgedReasoning = { ...base, reasoning: "This could be tested and can be verified, though results may vary by market." };
  assert.ok(KnowledgeQualityGate.evaluate(hedgedDecision as any).rejection_reasons.length > 0, "hedged decision should fail");
  assert.ok(KnowledgeQualityGate.evaluate(hedgedReasoning as any).admitted, "hedging in reasoning alone should not fail an object");
});

check("A hedge inside a test condition is not counted against the decision", () => {
  const rule = corpus.find((o) => o.knowledge_id === "differentiation.universal.sameness_test.001")!;
  const spec = KnowledgeQualityGate.evaluate(rule).dimensions.find((d) => d.dimension === "specificity")!;
  assert.ok(spec.score >= 5, `"reject any concept whose frame could carry..." scored ${spec.score}; the verb is Reject`);
});

check("Universal scope is allowed for craft and meta, refused for strategy", () => {
  const wildcard = { industry: "*", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: "*" };
  const base = corpus.find((o) => o.domain === "strategy" && o.knowledge_type === "decision_rule")!;
  const craft = KnowledgeQualityGate.evaluate({ ...base, domain: "lighting", context: wildcard } as any);
  const strategic = KnowledgeQualityGate.evaluate({ ...base, domain: "strategy", context: wildcard } as any);
  assert.ok(craft.dimensions.find((d) => d.dimension === "context_completeness")!.score >= 5, "craft may be universal");
  assert.strictEqual(strategic.dimensions.find((d) => d.dimension === "context_completeness")!.score, 0, "strategy must declare context");
});

check("Hard failures still reject generic, subjective and non-actionable content", () => {
  const base = corpus[0];
  const generic = KnowledgeQualityGate.evaluate({ ...base, decision: "Use high quality eye-catching visuals." } as any);
  const subjective = KnowledgeQualityGate.evaluate({ ...base, decision: "Choose a beautiful layout because it looks good." } as any);
  const inert = KnowledgeQualityGate.evaluate({ ...base, decision: "Younger audiences are more active on video platforms." } as any);
  assert.ok(generic.hard_failures.some((h) => h.failure === "GENERIC_ADVICE"));
  assert.ok(subjective.hard_failures.some((h) => h.failure === "SUBJECTIVE_STATEMENT"));
  assert.ok(inert.hard_failures.some((h) => h.failure === "NON_ACTIONABLE"));
});

// ── 4. Domain profiles ────────────────────────────────────────────────
section("4. Layout and visual intelligence foundations");

check("Layout profiles carry the required framework fields", () => {
  const layouts = corpus.filter((o) => (o.domain_profile as any)?.kind === "layout");
  assert.ok(layouts.length >= 5, `expected at least 5 layout profiles, found ${layouts.length}`);
  for (const o of layouts) {
    const p = o.domain_profile as any;
    for (const f of ["purpose", "structure", "visual_hierarchy", "eye_movement", "failure_pattern"]) {
      assert.ok(p[f] && (Array.isArray(p[f]) ? p[f].length : String(p[f]).length > 5), `${o.knowledge_id} layout profile missing ${f}`);
    }
    // use_when / avoid_when / trade_off come from the core schema.
    assert.ok(o.use_when && o.avoid_when && o.trade_off, `${o.knowledge_id} missing core framework fields`);
  }
});

check("Photography profiles carry lens, framing or angle psychology", () => {
  const photos = corpus.filter((o) => (o.domain_profile as any)?.kind === "photography");
  assert.ok(photos.length >= 5, `expected at least 5, found ${photos.length}`);
  for (const o of photos) {
    const p = o.domain_profile as any;
    assert.ok(p.lens_psychology || p.framing_psychology || p.camera_angle || p.depth_of_field,
      `${o.knowledge_id} photography profile carries no psychology field`);
  }
});

check("Lighting profiles carry emotional perception and commercial usage", () => {
  const lights = corpus.filter((o) => (o.domain_profile as any)?.kind === "lighting");
  assert.ok(lights.length >= 4, `expected at least 4, found ${lights.length}`);
  for (const o of lights) {
    const p = o.domain_profile as any;
    assert.ok(p.emotional_perception?.length > 10, `${o.knowledge_id} missing emotional_perception`);
    assert.ok(p.commercial_usage?.length > 10, `${o.knowledge_id} missing commercial_usage`);
  }
});

check("Color profiles carry brand perception and emotional association", () => {
  const colors = corpus.filter((o) => (o.domain_profile as any)?.kind === "color");
  assert.ok(colors.length >= 4, `expected at least 4, found ${colors.length}`);
  for (const o of colors) {
    const p = o.domain_profile as any;
    assert.ok(p.brand_perception?.length > 10, `${o.knowledge_id} missing brand_perception`);
    assert.ok(p.emotional_association?.length > 10, `${o.knowledge_id} missing emotional_association`);
  }
});

check("Vietnamese market knowledge is present in colour and typography", () => {
  const viet = corpus.filter((o) => /vietnam|diacritic/i.test(JSON.stringify(o.domain_profile || "") + o.knowledge_id));
  assert.ok(viet.length >= 2, `expected Vietnamese-specific knowledge, found ${viet.length}`);
});

// ── 5. Optional LLM evaluation layer ──────────────────────────────────
section("5. Optional LLM evaluation layer");

check("Four criteria are defined and the layer is constructible", () => {
  assert.deepStrictEqual([...LLM_QUALITY_CRITERIA].sort(), ["expert_usability", "originality", "strategic_value", "transferability"]);
  assert.ok(new LLMKnowledgeEvaluator() instanceof LLMKnowledgeEvaluator);
});

check("The layer is optional — the rule gate decides admission alone", () => {
  const gateSource = fs.readFileSync("lib/image-engine/reasoning/KnowledgeQualityGate.ts", "utf-8");
  assert.ok(!/LLMKnowledgeEvaluator|LLMProviderService/.test(gateSource),
    "the rule gate must not depend on the LLM layer, or corpus builds stop being deterministic");
  const retrieverSource = fs.readFileSync("lib/image-engine/reasoning/ReasoningKnowledgeRetriever.ts", "utf-8");
  assert.ok(!/LLMKnowledgeEvaluator/.test(retrieverSource), "retrieval must not depend on the LLM layer");
});

// ── 6. Knowledge evolution schema ─────────────────────────────────────
section("6. Knowledge evolution schema (structure only)");

check("Evolution schema is defined but not implemented anywhere", () => {
  assert.strictEqual(MIN_SAMPLES_FOR_PERFORMANCE_SIGNAL, 30);
  assert.strictEqual(MIN_ATTRIBUTION_CONFIDENCE, 0.6);
  const importers = ["reasoning/CreativeConceptEngine.ts", "reasoning/CreativeDecisionEngine.ts", "reasoning/ReasoningKnowledgeRetriever.ts", "reasoning/KnowledgeQualityGate.ts"]
    .filter((f) => /knowledge-evolution/.test(fs.readFileSync(path.join("lib/image-engine", f), "utf-8")));
  assert.deepStrictEqual(importers, [], `evolution schema must stay unimplemented; imported by ${importers}`);
});

// ── 7. Expanded brain drives the existing engines ─────────────────────
section("7. Expanded brain drives Phase 1.5 and Phase 1 unchanged");

function campaign(label: string, brief: any, assetType: string) {
  const retriever = new ReasoningKnowledgeRetriever(new ReasoningKnowledgeRepository(), { admission: "strict" });
  const query = CreativeContextExtractor.extract(brief, { asset_type: assetType });
  const { concept, evaluation } = CreativeConceptEngine.generate(query, retriever, { brand: brief.brand });
  const { set, creativeDirection } = CreativeDecisionEngine.run(query, retriever, concept);
  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: { subject: [], environment: [], mood: [], style: [], camera_requirements: [], lighting_requirements: [], non_negotiable_constraints: [], important_user_requirements: [] } as unknown as LockedIntent,
    knowledgeDirection: creativeDirection,
    assetType,
  });
  console.log(`\n      ══ ${label} ══`);
  console.log(`      retrieved : ${concept.derived_from.length} objects`);
  console.log(`      concept   : ${concept.big_idea.slice(0, 90)}`);
  console.log(`      insight   : ${concept.consumer_insight.slice(0, 90)}`);
  console.log(`      evaluation: ${evaluation.overall}/10 ${evaluation.accepted ? "ACCEPTED" : "REJECTED"}`);
  set.art_direction.forEach((d) => console.log(`      decision  : ${String(d.direction_slot).padEnd(21)} ${d.decision.slice(0, 56)}`));
  console.log(`      art dir   : ${Object.entries(resolved.fields).map(([k, v]) => `${k}=${(v as any).source}`).join(" ")}`);
  return { query, concept, evaluation, set, resolved };
}

const skin = campaign("Skin1004 — premium ampoule launch", {
  brand: "Skin1004", product: "Tone Brightening Capsule Ampoule", industry: "beauty_skincare",
  audience: "Women 35-50", objective: "Premium skincare launch", channel: "instagram", tone: "Premium Korean skincare",
}, "poster");

const cafe = campaign("Cà phê Bến Nghé — khai trương", {
  brand: "Bến Nghé", product: "Cà phê rang xay", audience: "Phụ nữ 25-35 tuổi",
  objective: "Khai trương quán", channel: "instagram", tone: "Ấm áp, gần gũi",
}, "social_ad");

const fashion = campaign("Atelier Six — social", {
  brand: "Atelier Six", product: "Silk scarf collection", industry: "fashion",
  audience: "Gen Z", objective: "Brand awareness", channel: "tiktok", tone: "Editorial, confident",
}, "social_ad");

check("Expanded corpus retrieves substantially more knowledge per campaign", () => {
  for (const r of [skin, cafe, fashion]) {
    assert.ok(r.concept.derived_from.length >= 6, `${r.concept.concept_name} used only ${r.concept.derived_from.length} objects`);
  }
});

check("No concept is contaminated by art direction (Phase 3.1.8.1)", () => {
  // Replaces an acceptance assertion that passed while twenty of thirty big
  // ideas were layout rules. What matters is that the concept layer stays a
  // concept layer; whether the corpus can currently fill it is a separate,
  // openly reported gap.
  for (const c of [skin, cafe, fashion]) {
    const v = ConceptQualityGate.validate(c.concept);
    const contamination = v.violations.filter((x: { kind: string }) => x.kind !== "MISSING_BIG_IDEA");
    assert.deepStrictEqual(contamination.map((x: { kind: string }) => x.kind), [], ConceptQualityGate.format(v));
  }
});

check("A concept is accepted when the corpus supports one, and rejected clearly when it does not", () => {
  // Phase 3.1.8.1. This asserted all three concepts were accepted, and it passed
  // while two of the three were layout rules labelled as ideas. With the concept
  // layer confined to concept-bearing domains, acceptance now depends on whether
  // the corpus holds a usable object for that brief — 11 `decision_rule` objects
  // across the six concept domains, out of 368. Where it does not, the engine
  // must say so rather than fill the gap from art direction.
  for (const r of [skin, cafe, fashion]) {
    if (r.evaluation.accepted) {
      assert.ok(r.concept.big_idea, `${r.concept.concept_name}: accepted with no big idea`);
    } else {
      assert.ok(
        r.evaluation.rejection_reasons.length > 0,
        `${r.concept.concept_name}: rejected without a stated reason`
      );
    }
  }
  // Distinctness is asserted only over the concepts that exist. Two absent ideas
  // being equal says nothing about whether the engine differentiates campaigns.
  const ideas = [skin, cafe, fashion].map((r) => r.concept.big_idea).filter(Boolean);
  assert.strictEqual(new Set(ideas).size, ideas.length, "two campaigns produced the same big idea");
});

check("Industry-locked knowledge does not cross campaigns", () => {
  const locked = (id: string) => /^(differentiation|industry)\./.test(id);
  const crossed = skin.concept.derived_from.filter((id) => locked(id) && fashion.concept.derived_from.includes(id));
  assert.strictEqual(crossed.length, 0, `leakage: ${crossed.join(", ")}`);
});

check("Art direction still resolves at the KNOWLEDGE tier", () => {
  for (const r of [skin, cafe, fashion]) {
    const sources = Object.values(r.resolved.fields).map((f: any) => f.source);
    assert.ok(sources.length > 0, "no art direction produced");
    assert.ok(sources.every((s) => s === "KNOWLEDGE"));
  }
});

check("Layer separation holds at 105 objects", () => {
  for (const r of [skin, cafe, fashion]) {
    assert.strictEqual(CreativeConceptEngine.findTechnicalLeaks(r.concept).length, 0, `${r.concept.concept_name} leaked technical detail`);
  }
});

// ── 8. Phase 2.1B — layout intelligence corpus ────────────────────────
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

check("Layout decisions score well on the gate's own specificity measure", () => {
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

console.log("\n" + "=".repeat(72));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(72));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
