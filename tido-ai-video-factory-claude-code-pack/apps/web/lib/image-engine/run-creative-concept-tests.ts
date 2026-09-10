import assert from "assert";
import { ArtDirectionResolverService } from "./service/ArtDirectionResolverService";
import { CreativeContextExtractor } from "./reasoning/CreativeContextExtractor";
import { CreativeConceptEngine } from "./reasoning/CreativeConceptEngine";
import { CreativeDecisionEngine } from "./reasoning/CreativeDecisionEngine";
import { ReasoningKnowledgeRepository } from "./reasoning/ReasoningKnowledgeRepository";
import { ReasoningKnowledgeRetriever } from "./reasoning/ReasoningKnowledgeRetriever";
import { REASONING_ONLY_KNOWLEDGE_FIELDS } from "./reasoning/creative-decision.types";
import { CreativeConcept } from "./reasoning/creative-concept.types";
import { ReasoningKnowledgeObject } from "./reasoning/reasoning-knowledge.types";
import { LockedIntent } from "./service/CreativeInterpretationService";

/**
 * Phase 1.5 verification — the Creative Concept Engine.
 *
 * Same fixture discipline as Phase 1: knowledge lives in the test, and the real
 * ArtDirectionResolverService is invoked so integration is proven end to end.
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

function K(o: Partial<ReasoningKnowledgeObject> & Pick<ReasoningKnowledgeObject, "knowledge_id" | "domain" | "decision">): ReasoningKnowledgeObject {
  return {
    name: o.knowledge_id, sub_domain: "fixture", knowledge_type: "decision_rule",
    creative_stage: "visual_direction",
    context: { industry: "*", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: "*" },
    problem: "Fixture problem statement long enough to pass validation.",
    reasoning: "Fixture reasoning explaining why this decision is correct in context.",
    why_this_works: "Fixture explanation of the underlying mechanism.",
    use_when: ["fixture condition"], avoid_when: ["fixture exclusion"],
    impact: "Fixture expected impact.", impact_score: 7, priority: 7, confidence: 0.8,
    ...o,
  } as ReasoningKnowledgeObject;
}

// ── Fixture corpora ───────────────────────────────────────────────────

const SKINCARE = [
  K({
    knowledge_id: "strategy.identity_preservation.mature_skincare.001",
    domain: "strategy", sub_domain: "identity_preservation", creative_stage: ["strategy", "concept"],
    context: { industry: "beauty", category: "*", audience: "women_35_50", objective: "product_launch", channel: "*", asset_type: "*", brand_position: ["premium", "luxury"] },
    problem: "Category messaging defaults to fear of ageing, which mature buyers quietly resent.",
    decision: "Frame the campaign around identity preservation rather than correction or reversal.",
    reasoning: "This segment buys continuity of self-image, not repair of a defect.",
    why_this_works: "Continuity language removes the implied criticism that suppresses purchase intent.",
    human_insight: { functional_need: "Visible tone improvement", emotional_need: "Confidence that she still recognises herself", social_need: "Read as self-possessed rather than anxious" },
    anti_patterns: [{ problem: "Generic beauty model holding serum against white background", why_it_fails: "Identical to every competitor in the category", replacement: "Identity-based storytelling from a lived moment" }],
    trade_off: { advantage: "emotional relevance", limitation: "slower benefit communication", suitable_conditions: "launch and awareness", unsuitable_conditions: "flash sales" },
    impact: "Increases emotional relevance and premium perception.",
    impact_score: 9, priority: 9, confidence: 0.9,
  }),
  K({
    knowledge_id: "visual_direction.quiet_authority.premium_beauty.001",
    domain: "visual_direction", sub_domain: "quiet_authority",
    context: { industry: "beauty", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: ["premium", "luxury"] },
    decision: "Build a still, unhurried world where restraint carries the authority.",
    reasoning: "Stillness reads as confidence; confidence is what premium buyers price.",
    impact: "Elevated brand perception.", impact_score: 8, priority: 8, confidence: 0.86,
  }),
  K({
    knowledge_id: "photography.soft_directional.premium_skincare.001",
    domain: "photography", sub_domain: "soft_directional",
    context: { industry: "beauty", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: ["premium", "luxury"] },
    decision: "Light the product with a single soft directional key at roughly 45 degrees with one controlled specular highlight.",
    reasoning: "A single key preserves surface reading on glass while keeping shadow structure legible.",
    impact: "Premium material rendering.", impact_score: 8, priority: 8, confidence: 0.88,
  }),
];

const COFFEE = [
  K({
    knowledge_id: "strategy.ritual_framing.local_coffee.001",
    domain: "strategy", sub_domain: "ritual_framing", creative_stage: ["strategy", "concept"],
    context: { industry: "food_beverage", category: "*", audience: "*", objective: "product_launch", channel: "*", asset_type: "*", brand_position: "*" },
    problem: "Coffee launches default to product beauty shots that give nobody a reason to care.",
    decision: "Anchor the launch in one specific daily ritual rather than the drink itself.",
    reasoning: "Coffee purchase is habitual and identity-linked; the ritual is the differentiator, not the bean.",
    why_this_works: "A named moment is ownable; a beautiful cup is not.",
    human_insight: { functional_need: "Caffeine and convenience", emotional_need: "A moment of control in a crowded day", social_need: "Belong to a particular place" },
    anti_patterns: [{ problem: "Coffee beans, steam, wooden table and morning sunlight", why_it_fails: "The most saturated visual set in the entire category", replacement: "One person inside one specific ritual" }],
    trade_off: { advantage: "ownable territory", limitation: "less immediate appetite appeal", suitable_conditions: "brand launch", unsuitable_conditions: "menu promotion" },
    impact: "Creates an ownable brand territory.", impact_score: 9, priority: 9, confidence: 0.85,
  }),
  K({
    knowledge_id: "visual_direction.warm_belonging.local_hospitality.001",
    domain: "visual_direction", sub_domain: "warm_belonging",
    context: { industry: "food_beverage", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: "*" },
    decision: "Build a lived-in neighbourhood world that feels like somewhere regulars already belong.",
    reasoning: "Local trade is won on familiarity, not aspiration.",
    impact: "Builds local trust.", impact_score: 8, priority: 8, confidence: 0.83,
  }),
];

const FASHION = [
  K({
    knowledge_id: "strategy.self_expression.fashion_genz.001",
    domain: "strategy", sub_domain: "self_expression", creative_stage: ["strategy", "concept"],
    context: { industry: "fashion", category: "*", audience: "gen_z", objective: "*", channel: ["instagram", "tiktok"], asset_type: "*", brand_position: "*" },
    problem: "Fashion social advertising reads as catalogue and is scrolled past without registering.",
    decision: "Lead with a character and an attitude rather than the garment laid flat.",
    reasoning: "This audience buys expression of identity; the garment is evidence, not the subject.",
    why_this_works: "A person with a stance stops a scroll; a product does not.",
    human_insight: { functional_need: "Clothing that fits an occasion", emotional_need: "Pride in being read correctly", social_need: "Be seen as distinctive, not styled by an algorithm" },
    anti_patterns: [{ problem: "Flat-lay catalogue product on a plain ground", why_it_fails: "No human signal and nothing to identify with", replacement: "Character-led editorial carrying real attitude" }],
    trade_off: { advantage: "scroll-stopping distinctiveness", limitation: "less literal product clarity", suitable_conditions: "social advertising", unsuitable_conditions: "e-commerce listings" },
    impact: "Higher stop rate and brand recall.", impact_score: 9, priority: 9, confidence: 0.87,
  }),
  K({
    knowledge_id: "visual_direction.editorial_attitude.fashion_social.001",
    domain: "visual_direction", sub_domain: "editorial_attitude",
    context: { industry: "fashion", category: "*", audience: "*", objective: "*", channel: ["instagram", "tiktok"], asset_type: "*", brand_position: "*" },
    decision: "Set a confident editorial world with decisive tonal contrast and an uncrowded frame.",
    reasoning: "Editorial confidence differentiates from catalogue flatness at thumbnail size.",
    impact: "Distinctive presence in feed.", impact_score: 8, priority: 8, confidence: 0.84,
  }),
  K({
    knowledge_id: "layout.mobile_first.social_ad_hierarchy.001",
    domain: "layout", sub_domain: "mobile_first",
    context: { industry: "*", category: "*", audience: "*", objective: "*", channel: ["instagram", "tiktok"], asset_type: "social_ad", brand_position: "*" },
    decision: "Place the subject in the upper two thirds and keep the lower third clear for platform chrome.",
    reasoning: "Platform UI overlays the lower third; content placed there is reliably obscured.",
    impact: "Preserves the message in-feed.", impact_score: 8, priority: 8, confidence: 0.9,
  }),
];

function repoOf(objects: ReasoningKnowledgeObject[]): ReasoningKnowledgeRetriever {
  const repo = new ReasoningKnowledgeRepository("/nonexistent-phase15");
  (repo as any).cache = objects;
  return new ReasoningKnowledgeRetriever(repo);
}

const emptyIntent = {
  subject: [], environment: [], mood: [], style: [],
  camera_requirements: [], lighting_requirements: [],
  non_negotiable_constraints: [], important_user_requirements: [],
} as unknown as LockedIntent;

console.log("=".repeat(64));
console.log("CIOS PHASE 1.5 — CREATIVE CONCEPT ENGINE");
console.log("=".repeat(64));

/** Full pipeline: brief → context → knowledge → concept → decisions → art direction. */
function pipeline(label: string, brief: any, corpus: ReasoningKnowledgeObject[], assetType: string) {
  const retriever = repoOf(corpus);
  const query = CreativeContextExtractor.extract(brief, { asset_type: assetType });
  const { concept, evaluation, trace } = CreativeConceptEngine.generate(query, retriever, { brand: brief.brand });
  const { set, creativeDirection } = CreativeDecisionEngine.run(query, retriever, concept);
  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: emptyIntent, knowledgeDirection: creativeDirection, assetType,
  });

  console.log(`\n  ══ ${label} ══`);
  console.log(`  BRIEF      ${JSON.stringify(query)}`);
  console.log(`  RETRIEVED  ${trace.retrieved.map((r) => r.knowledge_id).join(", ")}`);
  console.log(`  CONCEPT    "${concept.concept_name}"`);
  console.log(`    big idea    ${concept.big_idea}`);
  console.log(`    insight     ${concept.consumer_insight}`);
  console.log(`    tension     ${concept.audience_tension}`);
  console.log(`    hook        ${concept.creative_hook}`);
  console.log(`    world       ${concept.visual_world}`);
  console.log(`    differentn  ${concept.differentiation}`);
  console.log(`    avoid       ${concept.avoid_direction.slice(0, 2).join(" | ")}`);
  console.log(`  EVALUATION ${evaluation.scores.map((s) => `${s.criterion}=${s.score}`).join(" ")} → overall ${evaluation.overall}/10 ${evaluation.accepted ? "ACCEPTED" : "REJECTED"}`);
  set.art_direction.forEach((d) =>
    console.log(`  DECISION   ${String(d.direction_slot).padEnd(21)} ×${d.concept_alignment} ${d.decision.slice(0, 62)}`)
  );
  console.log(`  ART DIR    ${Object.entries(resolved.fields).map(([k, v]) => `${k}=${(v as any).source}`).join(" ")}`);

  return { query, concept, evaluation, set, creativeDirection, resolved, trace };
}

section("1. End-to-end: Beauty skincare campaign");
const skin = pipeline("Skin1004 — premium ampoule launch", {
  brand: "Skin1004", product: "Tone Brightening Capsule Ampoule",
  industry: "beauty_skincare", audience: "Women 35-50",
  objective: "Premium skincare launch", channel: "instagram", tone: "Premium Korean skincare",
}, SKINCARE, "poster");

check("Concept carries all 15 required fields", () => {
  const required: (keyof CreativeConcept)[] = [
    "big_idea", "concept_name", "core_message", "emotional_goal", "audience_tension",
    "consumer_insight", "brand_role", "story_angle", "visual_world", "creative_hook",
    "differentiation", "execution_direction", "avoid_direction", "derived_from", "confidence",
  ];
  for (const f of required) {
    const v = skin.concept[f];
    assert.ok(v !== undefined && v !== null && (Array.isArray(v) ? true : String(v).length > 0), `${f} is empty`);
  }
  assert.ok(typeof skin.concept.score === "number");
});

check("Insight and tension are drawn from concept material, not reconstructed", () => {
  // Phase 4.0.1: both are now selected by the chain rather than lifted from the
  // lead's `human_insight` and `problem`. What must hold is that each names
  // something about a person and cites the object it came from — not that either
  // contains a particular phrase.
  assert.ok(skin.concept.consumer_insight.length > 30, skin.concept.consumer_insight);
  assert.ok(skin.concept.audience_tension.length > 30, skin.concept.audience_tension);
  const chain = skin.trace.reasoning_chain;
  assert.ok(chain?.human_tension.source, "the tension cites no source");
  assert.ok(chain?.consumer_insight.source, "the insight cites no source");
});

check("Concept is accepted with strong differentiation and depth", () => {
  assert.ok(skin.evaluation.accepted, JSON.stringify(skin.evaluation.rejection_reasons));
  const by = (c: string) => skin.evaluation.scores.find((s) => s.criterion === c)!.score;
  assert.ok(by("differentiation") >= 7, `differentiation ${by("differentiation")}`);
  assert.ok(by("emotional_depth") >= 7, `emotional_depth ${by("emotional_depth")}`);
  assert.ok(by("genericness") <= 2, `genericness ${by("genericness")}`);
});

section("2. End-to-end: Coffee shop launch campaign");
const coffee = pipeline("Cà phê Bến Nghé — khai trương", {
  brand: "Bến Nghé", product: "Cà phê rang xay",
  audience: "Phụ nữ 25-35 tuổi", objective: "Khai trương quán",
  channel: "instagram", tone: "Ấm áp, gần gũi",
}, COFFEE, "social_ad");

check("Vietnamese brief produces a grounded food and beverage concept", () => {
  assert.strictEqual(coffee.query.industry, "food_beverage");
  // The chain selects on concept relevance, so which tension wins depends on the
  // brief text rather than on a fixed lead. What must hold is that the concept is
  // grounded in food and beverage material and is accepted.
  const chain = coffee.trace.reasoning_chain!;
  const sources = [chain.human_tension.source, chain.consumer_insight.source, chain.big_idea.source].filter(Boolean);
  assert.strictEqual(sources.length, 3, "a chain step cites no source");
  // Matched on the fixture's own naming rather than on a domain prefix: this
  // suite runs against a four-object fixture corpus, not the production one, so
  // its ids read `strategy.ritual_framing.local_coffee` rather than carrying an
  // industry segment. With that few objects the chain legitimately reuses one
  // source across steps — the fallback that prefers a repeated source over an
  // empty step, working as intended.
  assert.ok(
    sources.some((id) => /coffee|ritual/.test(String(id))),
    `no coffee material in the chain: ${sources.join(", ")}`
  );
  assert.ok(coffee.evaluation.accepted, JSON.stringify(coffee.evaluation.rejection_reasons));
});

check("Category cliché is captured as avoid territory", () => {
  assert.ok(
    coffee.concept.avoid_direction.some((a) => /beans, steam, wooden table/i.test(a)),
    JSON.stringify(coffee.concept.avoid_direction)
  );
});

section("3. End-to-end: Fashion social campaign");
const fashion = pipeline("ATELIER SIX — social", {
  brand: "Atelier Six", product: "Silk scarf collection",
  industry: "fashion", audience: "Gen Z", objective: "Brand awareness",
  channel: "tiktok", tone: "Editorial, confident",
}, FASHION, "social_ad");

check("Fashion concept is grounded in fashion material and accepted", () => {
  const chain = fashion.trace.reasoning_chain!;
  const sources = [chain.human_tension.source, chain.consumer_insight.source, chain.big_idea.source].filter(Boolean);
  assert.ok(
    sources.some((id) => /fashion/.test(String(id))),
    `no fashion material in the chain: ${sources.join(", ")}`
  );
  assert.ok(fashion.concept.big_idea.length > 20, fashion.concept.big_idea);
  assert.ok(fashion.evaluation.accepted, JSON.stringify(fashion.evaluation.rejection_reasons));
});

section("4. Different briefs produce different concepts");

check("All three concepts are distinct across every narrative field", () => {
  const fields: (keyof CreativeConcept)[] = ["big_idea", "concept_name", "consumer_insight", "audience_tension", "creative_hook", "visual_world"];
  for (const f of fields) {
    const values = [skin, coffee, fashion].map((r) => String(r.concept[f]));
    assert.strictEqual(new Set(values).size, 3, `field "${f}" is not distinct: ${JSON.stringify(values)}`);
  }
});

check("Concept names are campaign-specific", () => {
  const names = [skin, coffee, fashion].map((r) => r.concept.concept_name);
  assert.ok(names[0].includes("Skin1004"));
  assert.ok(names[1].includes("Bến Nghé"));
  assert.ok(names[2].includes("Atelier Six"));
});

section("5. Generic concept detection");

check("Knowledge with no insight and no anti-patterns yields a rejected concept", () => {
  const weak = [
    K({
      knowledge_id: "strategy.generic.quality_claim.001",
      domain: "strategy", sub_domain: "generic", creative_stage: ["strategy"],
      problem: "Brand wants to look good in market.",
      decision: "Show high quality and premium quality so the product looks eye-catching.",
      reasoning: "Quality matters.",
      impact: "Better perception.", impact_score: 3, priority: 3, confidence: 0.4,
    }),
  ];
  const q = CreativeContextExtractor.extract({ brand: "Acme", product: "Thing" });
  const { concept, evaluation } = CreativeConceptEngine.generate(q, repoOf(weak), { brand: "Acme" });
  // Phase 4.0.1.5 changed the mechanism of rejection, not the outcome. The big
  // idea is now composed from the tension and territory rather than lifted from
  // the object's `decision`, so a weak object's filler — "high quality",
  // "eye-catching" — no longer reaches the concept verbatim for the cliché
  // detector to find. That is an improvement, and it means this test can no
  // longer assert on the detector. What must still hold is that weak knowledge
  // produces a rejected concept with a stated reason.
  assert.ok(!evaluation.accepted, `should be rejected, got ${JSON.stringify(evaluation)}`);
  assert.ok(evaluation.rejection_reasons.length > 0, "a rejection must state its reason");
  assert.ok(concept.differentiation === "", "no anti-patterns should mean no differentiation claim");
});

check("Empty corpus produces a rejected concept, not a silent success", () => {
  const q = CreativeContextExtractor.extract({ brand: "Nobody", product: "Nothing" });
  const { evaluation, warnings } = CreativeConceptEngine.generate(q, repoOf([]), {});
  assert.ok(!evaluation.accepted);
  assert.ok(warnings.some((w) => w.includes("NO_KNOWLEDGE_FOR_CONCEPT")));
});

check("Rejection states reasons and improvements", () => {
  const weak = [K({ knowledge_id: "strategy.thin.idea.001", domain: "strategy", decision: "Be premium.", impact: "Good.", priority: 2, impact_score: 2, confidence: 0.3 })];
  const { evaluation } = CreativeConceptEngine.generate(CreativeContextExtractor.extract({}), repoOf(weak), {});
  assert.ok(evaluation.rejection_reasons.length > 0);
  assert.ok(evaluation.scores.some((s) => s.improvement), "at least one criterion should suggest an improvement");
});

section("6. Concept influences visual decisions");

check("Concept alignment is recorded on every art direction decision", () => {
  for (const d of skin.set.art_direction) {
    assert.ok(typeof d.concept_alignment === "number", `${d.decision_id} has no alignment`);
    assert.ok(d.concept_note && d.concept_note.length > 0);
  }
});

check("Decisions reinforcing the concept are boosted above neutral", () => {
  const boosted = skin.set.art_direction.filter((d) => (d.concept_alignment ?? 1) > 1);
  assert.ok(boosted.length > 0, "expected at least one concept-reinforced decision");
});

check("A decision inside the concept's avoid territory is vetoed", () => {
  const conflicting = [
    ...COFFEE,
    K({
      knowledge_id: "visual_direction.category_default.coffee_cliche.001",
      domain: "visual_direction", sub_domain: "category_default",
      context: { industry: "food_beverage", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: "*" },
      decision: "Show coffee beans, steam, a wooden table and morning sunlight.",
      reasoning: "Familiar category signals read instantly.",
      impact: "Immediate category recognition.", impact_score: 6, priority: 6, confidence: 0.6,
    }),
  ];
  const retriever = repoOf(conflicting);
  const q = CreativeContextExtractor.extract({ product: "Cà phê rang xay", objective: "Khai trương quán" }, { asset_type: "social_ad" });
  const { concept } = CreativeConceptEngine.generate(q, retriever, {});
  const withConcept = CreativeDecisionEngine.run(q, retriever, concept);
  const withoutConcept = CreativeDecisionEngine.run(q, retriever);

  const vetoed = withConcept.set.unmapped.find((u) => u.derived_from[0].includes("coffee_cliche"));
  assert.ok(vetoed, "cliché decision should be vetoed by the concept");
  assert.ok(/Vetoed by concept/.test(vetoed!.reason), vetoed!.reason);

  // Control: without a concept the cliché must NOT be vetoed. It may still lose on
  // score to a stronger decision — being outranked is ordinary competition, and
  // conflating it with a veto would make this assertion prove nothing.
  const vetoedWithout = withoutConcept.set.unmapped.some((u) => u.derived_from[0].includes("coffee_cliche"));
  assert.ok(!vetoedWithout, "without a concept the decision must not be vetoed — that is what isolates the concept's effect");
});

check("Concept changes the final art direction, not just the score", () => {
  const conflicting = [
    ...COFFEE,
    K({
      knowledge_id: "visual_direction.category_default.coffee_cliche.001",
      domain: "visual_direction", sub_domain: "category_default",
      context: { industry: "food_beverage", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: "*" },
      decision: "Show coffee beans, steam, a wooden table and morning sunlight.",
      reasoning: "Familiar category signals read instantly.",
      impact: "Immediate category recognition.", impact_score: 10, priority: 10, confidence: 0.95,
    }),
  ];
  const retriever = repoOf(conflicting);
  const q = CreativeContextExtractor.extract({ product: "Cà phê rang xay", objective: "Khai trương quán" }, { asset_type: "social_ad" });
  const { concept } = CreativeConceptEngine.generate(q, retriever, {});

  const withCd = CreativeDecisionEngine.run(q, retriever, concept).creativeDirection;
  const withoutCd = CreativeDecisionEngine.run(q, retriever).creativeDirection;
  assert.notStrictEqual(withCd.visual_style, withoutCd.visual_style, "concept should change the atmosphere handed to the resolver");
  assert.ok(!/wooden table/i.test(JSON.stringify(withCd)), "cliché reached art direction despite the concept");
  assert.ok(/wooden table/i.test(JSON.stringify(withoutCd)), "control case should contain the cliché");
});

section("7. Layer separation unchanged");

check("Concept contains no technical instruction", () => {
  for (const r of [skin, coffee, fashion]) {
    const leaks = CreativeConceptEngine.findTechnicalLeaks(r.concept);
    assert.strictEqual(leaks.length, 0, `${r.concept.concept_name} leaked: ${leaks.join(", ")}`);
  }
  // The skincare corpus contains a "45 degrees / specular highlight" photography
  // rule; it must become a decision, never concept text.
  assert.ok(!/45 degrees|specular/i.test(JSON.stringify(skin.concept)), "photography detail leaked into concept");
});

check("Reasoning-only knowledge fields still never reach art direction", () => {
  for (const [r, corpus] of [[skin, SKINCARE], [coffee, COFFEE], [fashion, FASHION]] as const) {
    const emitted = JSON.stringify(r.creativeDirection);
    for (const obj of corpus) {
      for (const field of REASONING_ONLY_KNOWLEDGE_FIELDS) {
        const value = (obj as any)[field];
        if (typeof value !== "string" || value.length < 15) continue;
        assert.ok(!emitted.includes(value), `${field} of ${obj.knowledge_id} leaked into CreativeDirection`);
      }
    }
  }
});

check("Concept text itself never reaches the image prompt surface", () => {
  const emitted = JSON.stringify(skin.creativeDirection);
  for (const field of ["audience_tension", "consumer_insight", "story_angle", "brand_role"] as const) {
    const v = String(skin.concept[field]);
    if (v.length < 15) continue;
    assert.ok(!emitted.includes(v), `concept.${field} leaked into CreativeDirection`);
  }
});

check("Resolver still receives Layer 2 at the KNOWLEDGE tier", () => {
  for (const r of [skin, coffee, fashion]) {
    const sources = Object.values(r.resolved.fields).map((f: any) => f.source);
    assert.ok(sources.length > 0, "no art direction resolved");
    assert.ok(sources.every((s) => s === "KNOWLEDGE"), `unexpected tiers: ${sources}`);
  }
});

section("8. Diagnostics chain");

check("Trace spans brief → retrieved → concept → decisions → art direction", () => {
  assert.ok(Object.keys(skin.trace.brief_query).length > 0, "brief missing");
  assert.ok(skin.trace.retrieved.length > 0, "retrieved missing");
  assert.ok(skin.trace.concept.big_idea, "concept missing");
  assert.ok(skin.trace.evaluation.scores.length === 4, "evaluation must score 4 criteria");
  assert.ok(skin.set.art_direction.length > 0, "decisions missing");
  assert.ok(Object.keys(skin.resolved.fields).length > 0, "art direction missing");
});

check("Every concept field names the knowledge it came from", () => {
  const traced = new Set(skin.trace.concept_sources.map((s) => s.field));
  for (const f of ["big_idea", "consumer_insight", "audience_tension", "differentiation", "visual_world"] as const) {
    assert.ok(traced.has(f), `no source recorded for ${f}`);
  }
  for (const s of skin.trace.concept_sources) assert.ok(s.derivation.length > 0, `${s.field} has no derivation note`);
});

console.log("\n" + "=".repeat(64));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(64));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
