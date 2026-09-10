import assert from "assert";
import { ArtDirectionResolverService } from "./service/ArtDirectionResolverService";
import { CreativeContextExtractor } from "./reasoning/CreativeContextExtractor";
import { CreativeDecisionEngine } from "./reasoning/CreativeDecisionEngine";
import { ReasoningKnowledgeRepository } from "./reasoning/ReasoningKnowledgeRepository";
import { ReasoningKnowledgeRetriever } from "./reasoning/ReasoningKnowledgeRetriever";
import { ReasoningKnowledgeValidator } from "./reasoning/ReasoningKnowledgeValidator";
import { REASONING_ONLY_KNOWLEDGE_FIELDS } from "./reasoning/creative-decision.types";
import { ReasoningKnowledgeObject } from "./reasoning/reasoning-knowledge.types";
import { LockedIntent } from "./service/CreativeInterpretationService";

/**
 * Phase 1 verification — the Creative Decision Engine.
 *
 * Knowledge lives in fixtures, not in data/cios-knowledge. Two reasons: authoring
 * the production corpus is a later phase, and a test that depends on corpus
 * content becomes a test of that content rather than of the engine.
 *
 * The three end-to-end cases run the REAL ArtDirectionResolverService, so what is
 * asserted is the actual integration, not a stand-in for it.
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

// ── Fixture corpus ────────────────────────────────────────────────────

function K(o: Partial<ReasoningKnowledgeObject> & Pick<ReasoningKnowledgeObject, "knowledge_id" | "domain" | "decision">): ReasoningKnowledgeObject {
  return {
    name: o.knowledge_id,
    sub_domain: "fixture",
    knowledge_type: "decision_rule",
    creative_stage: "visual_direction",
    context: {
      industry: "*", category: "*", audience: "*", objective: "*",
      channel: "*", asset_type: "*", brand_position: "*",
    },
    problem: "Fixture problem statement long enough to pass validation.",
    reasoning: "Fixture reasoning explaining why this decision is correct in context.",
    why_this_works: "Fixture explanation of the underlying mechanism.",
    use_when: ["fixture condition"],
    avoid_when: ["fixture exclusion"],
    impact: "Fixture expected impact.",
    impact_score: 7,
    priority: 7,
    confidence: 0.8,
    ...o,
  } as ReasoningKnowledgeObject;
}

/** Premium skincare — beauty, women 35-50, launch, premium. */
const SKINCARE = [
  K({
    knowledge_id: "strategy.identity_preservation.mature_skincare.001",
    domain: "strategy",
    sub_domain: "identity_preservation",
    creative_stage: ["strategy", "concept"],
    context: { industry: "beauty", category: "*", audience: "women_35_50", objective: "product_launch", channel: "*", asset_type: "*", brand_position: ["premium", "luxury"] },
    problem: "Category messaging defaults to fear of ageing, which mature buyers reject.",
    decision: "Frame the campaign around identity preservation rather than correction or reversal.",
    reasoning: "This segment buys continuity of self-image, not repair of a defect.",
    why_this_works: "Continuity language removes the implied criticism that suppresses purchase intent.",
    human_insight: { functional_need: "Visible tone improvement", emotional_need: "Still recognise herself", social_need: "Read as self-possessed, not anxious" },
    avoid_when: ["Discount-led promotion"],
    anti_patterns: [{ problem: "Generic model holding serum on white", why_it_fails: "Identical to every competitor", replacement: "Identity-based storytelling" }],
    trade_off: { advantage: "emotional relevance", limitation: "slower benefit communication", suitable_conditions: "launch and awareness", unsuitable_conditions: "flash sales" },
    impact: "Increases emotional relevance and premium perception.",
    impact_score: 9, priority: 9, confidence: 0.9,
  }),
  K({
    knowledge_id: "photography.soft_directional.premium_skincare.001",
    domain: "photography",
    sub_domain: "soft_directional",
    context: { industry: "beauty", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: ["premium", "luxury"] },
    decision: "Light the product with a single soft directional key at roughly 45 degrees, allowing one controlled specular highlight.",
    reasoning: "A single key preserves surface reading on glass while keeping shadow structure legible.",
    impact: "Premium material rendering.", impact_score: 8, priority: 8, confidence: 0.88,
  }),
  K({
    knowledge_id: "layout.negative_space.luxury_hero.001",
    domain: "layout",
    sub_domain: "negative_space",
    // Applies across awareness AND launch: restraint is a positioning signal, not
    // an objective-specific tactic. Declaring only "awareness" caused the retriever
    // to correctly exclude it from a launch brief.
    context: { industry: "*", category: "*", audience: "*", objective: ["awareness", "product_launch"], channel: "*", asset_type: "*", brand_position: ["premium", "luxury"] },
    decision: "Hold the product on a centred axis with generous negative space and no competing props.",
    reasoning: "Restraint signals confidence, which premium buyers read as quality.",
    impact: "Raises perceived value.", impact_score: 8, priority: 9, confidence: 0.85,
  }),
  K({
    knowledge_id: "critic.generic_detection.category_sameness.001",
    domain: "critic",
    sub_domain: "generic_detection",
    knowledge_type: "evaluation_rule",
    creative_stage: "evaluation",
    decision: "Reject any concept whose visual could carry a competitor's logo without alteration.",
    reasoning: "Interchangeability is the clearest measurable signal of a generic concept.",
    impact: "Prevents category-average output.", impact_score: 9, priority: 9, confidence: 0.9,
  }),
];

/** Coffee shop launch — food_beverage, local, launch. */
const COFFEE = [
  K({
    knowledge_id: "strategy.ritual_framing.local_coffee.001",
    domain: "strategy",
    sub_domain: "ritual_framing",
    creative_stage: ["strategy", "concept"],
    context: { industry: "food_beverage", category: "*", audience: "*", objective: "product_launch", channel: "*", asset_type: "*", brand_position: "*" },
    problem: "Coffee launches default to product beauty shots with no reason to care.",
    decision: "Anchor the launch in a specific daily ritual rather than the drink itself.",
    reasoning: "Coffee purchase is habitual and identity-linked; the ritual is the differentiator, not the bean.",
    why_this_works: "A named moment is ownable; a beautiful cup is not.",
    human_insight: { functional_need: "Caffeine and convenience", emotional_need: "A moment of control", social_need: "Belong to a place" },
    anti_patterns: [{ problem: "Beans, steam, wooden table, morning sunlight", why_it_fails: "The most saturated visual set in the category", replacement: "A specific person in a specific ritual" }],
    trade_off: { advantage: "ownable territory", limitation: "less immediate product appetite appeal", suitable_conditions: "brand launch", unsuitable_conditions: "menu promotion" },
    impact: "Creates an ownable brand territory.", impact_score: 9, priority: 9, confidence: 0.85,
  }),
  K({
    knowledge_id: "photography.texture_first.food_beverage.001",
    domain: "photography",
    sub_domain: "texture_first",
    context: { industry: "food_beverage", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: "*" },
    decision: "Use a close working distance with shallow depth of field so crema and steam read as texture.",
    reasoning: "Appetite response is driven by surface detail, which collapses at wider framing.",
    impact: "Stronger appetite appeal.", impact_score: 8, priority: 8, confidence: 0.82,
  }),
  K({
    knowledge_id: "color.warm_neutral.hospitality_welcome.001",
    domain: "color",
    sub_domain: "warm_neutral",
    context: { industry: "food_beverage", category: "*", audience: "*", objective: "*", channel: "*", asset_type: "*", brand_position: "*" },
    decision: "Build the palette from warm neutrals with a single saturated accent drawn from the product itself.",
    reasoning: "Warm neutrals read as welcome; a product-derived accent keeps the palette honest.",
    impact: "Approachable, coherent brand feel.", impact_score: 7, priority: 7, confidence: 0.8,
  }),
];

/** Fashion social ad — fashion, gen_z, instagram/tiktok, social_ad. */
const FASHION = [
  K({
    knowledge_id: "strategy.self_expression.fashion_genz.001",
    domain: "strategy",
    sub_domain: "self_expression",
    creative_stage: ["strategy", "concept"],
    context: { industry: "fashion", category: "*", audience: "gen_z", objective: "*", channel: ["instagram", "tiktok"], asset_type: "*", brand_position: "*" },
    problem: "Fashion social ads read as catalogue pages and are scrolled past.",
    decision: "Lead with a character and an attitude, not with the garment laid flat.",
    reasoning: "This audience buys expression of identity; the garment is evidence, not the subject.",
    why_this_works: "A person with a stance stops a scroll; a product does not.",
    human_insight: { functional_need: "Clothing that fits an occasion", emotional_need: "Feel like the intended self", social_need: "Be read as distinctive" },
    anti_patterns: [{ problem: "Flat-lay catalogue product on plain ground", why_it_fails: "No human signal, nothing to identify with", replacement: "Character-led editorial with attitude" }],
    trade_off: { advantage: "scroll-stopping distinctiveness", limitation: "less literal product clarity", suitable_conditions: "social advertising", unsuitable_conditions: "e-commerce listing imagery" },
    impact: "Higher stop rate and brand recall.", impact_score: 9, priority: 9, confidence: 0.87,
  }),
  K({
    knowledge_id: "visual_direction.editorial_attitude.fashion_social.001",
    domain: "visual_direction",
    sub_domain: "editorial_attitude",
    context: { industry: "fashion", category: "*", audience: "*", objective: "*", channel: ["instagram", "tiktok"], asset_type: "*", brand_position: "*" },
    decision: "Set a confident editorial mood with high tonal contrast and a decisive, uncrowded frame.",
    reasoning: "Editorial confidence differentiates from catalogue flatness at thumbnail size.",
    impact: "Distinctive brand presence in feed.", impact_score: 8, priority: 8, confidence: 0.84,
  }),
  K({
    knowledge_id: "layout.mobile_first.social_ad_hierarchy.001",
    domain: "layout",
    sub_domain: "mobile_first",
    context: { industry: "*", category: "*", audience: "*", objective: "*", channel: ["instagram", "tiktok"], asset_type: "social_ad", brand_position: "*" },
    decision: "Place the subject in the upper two thirds and keep the lower third clear for platform chrome.",
    reasoning: "Platform UI overlays the lower third; content placed there is reliably obscured.",
    impact: "Preserves the message in-feed.", impact_score: 8, priority: 8, confidence: 0.9,
  }),
];

function repoOf(objects: ReasoningKnowledgeObject[]): ReasoningKnowledgeRepository {
  const repo = new ReasoningKnowledgeRepository("/nonexistent-phase1");
  (repo as any).cache = objects;
  return repo;
}

/** Runs the real resolver so integration is proven, not simulated. */
function resolveWith(creativeDirection: any, assetType: string) {
  const emptyIntent: LockedIntent = {
    subject: [], environment: [], mood: [], style: [],
    camera_requirements: [], lighting_requirements: [],
    non_negotiable_constraints: [], important_user_requirements: [],
  } as any;
  return ArtDirectionResolverService.resolve({
    lockedIntent: emptyIntent,
    knowledgeDirection: creativeDirection,
    assetType,
  });
}

console.log("=".repeat(62));
console.log("CIOS PHASE 1 — CREATIVE DECISION ENGINE");
console.log("=".repeat(62));

// ── Unit: routing ─────────────────────────────────────────────────────
section("1. Reasoning-to-Decision routing");

check("Strategy domains route to STRATEGY, never to a camera instruction", () => {
  for (const d of ["strategy", "audience", "category", "concept", "differentiation"]) {
    const r = CreativeDecisionEngine.route(K({ knowledge_id: `${d}.x.y.001`, domain: d, decision: "Do the strategic thing." }));
    assert.strictEqual(r.target, "STRATEGY", `${d} routed to ${r.target}`);
    assert.strictEqual(r.dimension, undefined);
  }
});

check("Critic and channel route to ADVISORY (never any prompt)", () => {
  for (const d of ["critic", "channel", "production", "examples"]) {
    assert.strictEqual(CreativeDecisionEngine.route(K({ knowledge_id: `${d}.x.y.001`, domain: d, decision: "Evaluate." })).target, "ADVISORY");
  }
});

check("Photography splits camera vs lighting by wording", () => {
  const cam = CreativeDecisionEngine.route(K({ knowledge_id: "photography.a.b.001", domain: "photography", decision: "Use a longer lens at eye level." }));
  const lit = CreativeDecisionEngine.route(K({ knowledge_id: "photography.a.b.002", domain: "photography", decision: "Use a single soft key light with controlled shadow." }));
  assert.strictEqual(cam.dimension, "camera");
  assert.strictEqual(lit.dimension, "lighting");
});

check("layout→composition, color→colour, visual_direction→atmosphere", () => {
  assert.strictEqual(CreativeDecisionEngine.route(K({ knowledge_id: "layout.a.b.001", domain: "layout", decision: "Hold a centred axis." })).dimension, "composition");
  assert.strictEqual(CreativeDecisionEngine.route(K({ knowledge_id: "color.a.b.001", domain: "color", decision: "Warm neutral palette." })).dimension, "colour");
  assert.strictEqual(CreativeDecisionEngine.route(K({ knowledge_id: "visual_direction.a.b.001", domain: "visual_direction", decision: "A calm, restrained feeling." })).dimension, "atmosphere");
});

section("2. Decision set construction");

check("Two decisions on one dimension: higher score wins, loser recorded", () => {
  const a = K({ knowledge_id: "layout.a.b.001", domain: "layout", decision: "Centred axis, generous space.", priority: 9, impact_score: 9, confidence: 0.9 });
  const b = K({ knowledge_id: "layout.c.d.001", domain: "layout", decision: "Dense promotional grid.", priority: 3, impact_score: 3, confidence: 0.5 });
  const set = CreativeDecisionEngine.decide(new ReasoningKnowledgeRetriever(repoOf([a, b])).retrieve({}).results);
  assert.strictEqual(set.art_direction.filter((d) => d.direction_slot === "composition_strategy").length, 1);
  assert.strictEqual(set.superseded.length, 1);
  assert.strictEqual(set.superseded[0].derived_from[0], "layout.c.d.001");
  assert.strictEqual(set.superseded[0].reason, "OUTRANKED_ON_DIMENSION");
});

check("materials now reach material_direction (Phase 3.1.6)", () => {
  // Until 3.1.6 `materials` passed the dimension whitelist and then had no field
  // on CreativeDirection, so every material decision was recorded as unmapped —
  // 10 of them across the V1 benchmark. It now has a slot.
  const m = K({ knowledge_id: "material.glass.surface.001", domain: "material", decision: "Render glass with edge-compressed reflections." });
  const set = CreativeDecisionEngine.decide(new ReasoningKnowledgeRetriever(repoOf([m])).retrieve({}).results);
  assert.strictEqual(set.unmapped.length, 0, "materials must no longer be unmapped");
  assert.strictEqual(set.art_direction.length, 1);
  assert.strictEqual(set.art_direction[0].art_direction_dimension, "materials");
  assert.strictEqual(set.art_direction[0].direction_slot, "material_direction");
  assert.ok(
    CreativeDecisionEngine.toCreativeDirection(set).material_direction?.includes("edge-compressed"),
    "the decision must arrive on CreativeDirection.material_direction"
  );
});

check("environment is still recorded as unmapped, not silently dropped", () => {
  // environment remains the one dimension with no CreativeDirection field. The
  // unmapped record is what keeps that visible rather than looking like a bug.
  const e = K({
    knowledge_id: "visual_direction.scene.backdrop.001",
    domain: "visual_direction",
    decision: "Set the scene against a seamless mid-grey backdrop with no props.",
  });
  const set = CreativeDecisionEngine.decide(new ReasoningKnowledgeRetriever(repoOf([e])).retrieve({}).results);
  assert.strictEqual(set.art_direction.length, 0);
  assert.strictEqual(set.unmapped.length, 1);
  assert.strictEqual(set.unmapped[0].intended_dimension, "environment");
  assert.ok(set.warnings.some((w) => w.includes("UNMAPPED_DIMENSIONS")));
});

check("typography is a first-class dimension reaching typography_strategy", () => {
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
});

check("camera and lighting domains route to their own dimensions", () => {
  // The Phase 2.1 domain split left these two with no case in the switch, so both
  // fell to the default and were held as advisory: lighting absent from 30 of 30
  // benchmark cases, camera from 25 of 30.
  const cam = CreativeDecisionEngine.route(
    K({ knowledge_id: "camera.angle.hero.001", domain: "camera", decision: "Shoot at eye level on a 50mm lens." })
  );
  const lit = CreativeDecisionEngine.route(
    K({ knowledge_id: "lighting.soft.single.001", domain: "lighting", decision: "Use one large diffused source at 45 degrees." })
  );
  assert.strictEqual(cam.target, "ART_DIRECTION");
  assert.strictEqual(cam.dimension, "camera");
  assert.strictEqual(lit.target, "ART_DIRECTION");
  assert.strictEqual(lit.dimension, "lighting");
});

check("Decision carries full traceability (Core §15)", () => {
  const set = CreativeDecisionEngine.decide(new ReasoningKnowledgeRetriever(repoOf([SKINCARE[1]])).retrieve({ industry: "beauty" }).results);
  const d = set.art_direction[0];
  assert.ok(d.decision && d.reasoning && d.expected_impact, "decision/reasoning/impact required");
  assert.deepStrictEqual(d.derived_from, ["photography.soft_directional.premium_skincare.001"]);
  assert.ok(d.context_relevance > 0 && d.confidence > 0);
});

section("3. Layer separation (Governance §1, §5)");

check("CreativeDirection carries ONLY decision text — no reasoning leaks", () => {
  const { creativeDirection } = CreativeDecisionEngine.run(
    { industry: "beauty", brand_position: "premium", audience: "women_35_50", objective: "product_launch" },
    new ReasoningKnowledgeRetriever(repoOf(SKINCARE))
  );
  const emitted = JSON.stringify(creativeDirection);
  for (const obj of SKINCARE) {
    for (const field of REASONING_ONLY_KNOWLEDGE_FIELDS) {
      const value = (obj as any)[field];
      if (typeof value !== "string" || value.length < 15) continue;
      assert.ok(!emitted.includes(value), `Reasoning field "${field}" of ${obj.knowledge_id} leaked into CreativeDirection`);
    }
  }
});

check("Strategic decisions never become visual instructions", () => {
  const { creativeDirection, set } = CreativeDecisionEngine.run(
    { industry: "beauty", brand_position: "premium", audience: "women_35_50", objective: "product_launch" },
    new ReasoningKnowledgeRetriever(repoOf(SKINCARE))
  );
  const strategic = set.strategy.map((d) => d.decision);
  assert.ok(strategic.length > 0, "expected at least one strategic decision");
  for (const s of strategic) {
    assert.ok(!JSON.stringify(creativeDirection).includes(s), `Strategic decision leaked into art direction: ${s}`);
  }
});

check("Advisory (critic) decisions reach no prompt surface", () => {
  const { creativeDirection, set } = CreativeDecisionEngine.run(
    { industry: "beauty", brand_position: "premium" },
    new ReasoningKnowledgeRetriever(repoOf(SKINCARE))
  );
  const critic = set.advisory.find((d) => d.derived_from[0].startsWith("critic."));
  assert.ok(critic, "critic rule should be retrieved as advisory");
  assert.ok(!JSON.stringify(creativeDirection).includes(critic!.decision));
});

// ── End-to-end ────────────────────────────────────────────────────────

function e2e(label: string, brief: any, corpus: ReasoningKnowledgeObject[], assetType: string) {
  const query = CreativeContextExtractor.extract(brief, { asset_type: assetType });
  const { set, creativeDirection, trace } = CreativeDecisionEngine.run(query, new ReasoningKnowledgeRetriever(repoOf(corpus)));
  const resolved = resolveWith(creativeDirection, assetType);

  console.log(`\n  ── ${label} ──`);
  console.log(`  context   : ${JSON.stringify(query)}`);
  console.log(`  retrieved : ${trace.retrieved.map((r) => r.knowledge_id).join(", ") || "(none)"}`);
  console.log(`  routing   : ${trace.reasoning_applied.map((r) => `${r.domain}→${r.routed_to}${r.art_direction_dimension ? ":" + r.art_direction_dimension : ""}`).join(", ")}`);
  set.art_direction.forEach((d) => console.log(`    AD  ${String(d.direction_slot).padEnd(21)} ${d.decision.slice(0, 66)}`));
  set.strategy.forEach((d) => console.log(`    STR ${"".padEnd(12)} ${d.decision.slice(0, 74)}`));
  console.log(`  resolver  : ${Object.entries(resolved.fields).map(([k, v]) => `${k}=${(v as any).source}`).join(" ")}`);

  return { query, set, creativeDirection, trace, resolved };
}

section("4. End-to-end: Premium skincare campaign");
const skin = e2e("Skin1004 — Tone Brightening Capsule Ampoule", {
  brand: "Skin1004", product: "Tone Brightening Capsule Ampoule",
  industry: "beauty_skincare", audience: "Women 35-50",
  objective: "Premium skincare launch", channel: "instagram", tone: "Premium Korean skincare",
}, SKINCARE, "poster");

check("Context resolves to beauty / women_35_50 / product_launch / premium", () => {
  assert.strictEqual(skin.query.industry, "beauty");
  assert.strictEqual(skin.query.audience, "women_35_50");
  assert.strictEqual(skin.query.objective, "product_launch");
  assert.strictEqual(skin.query.brand_position, "premium");
});

check("Produces lighting + composition decisions and a strategic decision", () => {
  const slots = skin.set.art_direction.map((d) => d.direction_slot);
  assert.ok(slots.includes("lighting_direction"), `expected lighting_direction, got ${slots}`);
  assert.ok(slots.includes("composition_strategy"), `expected composition_strategy, got ${slots}`);
  assert.ok(skin.set.strategy.some((d) => d.derived_from[0].includes("identity_preservation")));
});

check("Resolver accepts them at the KNOWLEDGE tier", () => {
  assert.strictEqual((skin.resolved.fields as any).lighting?.source, "KNOWLEDGE");
  assert.strictEqual((skin.resolved.fields as any).composition?.source, "KNOWLEDGE");
  assert.ok(skin.resolved.promptBlock.length > 0);
});

check("Client instruction still outranks Layer 2", () => {
  const withClient = ArtDirectionResolverService.resolve({
    lockedIntent: {
      subject: [], environment: [], mood: [], style: [],
      camera_requirements: [], non_negotiable_constraints: [], important_user_requirements: [],
      lighting_requirements: ["hard direct sunlight from camera left, deep shadows"],
    } as any,
    knowledgeDirection: skin.creativeDirection,
    assetType: "poster",
  });
  assert.strictEqual((withClient.fields as any).lighting?.source, "USER", "client lighting must win over Layer 2");
});

section("5. End-to-end: Coffee shop launch campaign");
const coffee = e2e("Cà phê Bến Nghé — quán mới khai trương", {
  brand: "Bến Nghé", product: "Cà phê rang xay",
  audience: "Phụ nữ 25-35 tuổi", objective: "Khai trương quán",
  channel: "instagram", tone: "Ấm áp, gần gũi",
}, COFFEE, "social_ad");

check("Vietnamese brief resolves to food_beverage / product_launch", () => {
  assert.strictEqual(coffee.query.industry, "food_beverage");
  assert.strictEqual(coffee.query.objective, "product_launch");
  assert.strictEqual(coffee.query.audience, "women_25_35");
});

check("Produces camera + colour decisions and the ritual strategy", () => {
  const slots = coffee.set.art_direction.map((d) => d.direction_slot);
  assert.ok(slots.includes("camera_direction"), `expected camera_direction, got ${slots}`);
  assert.ok(slots.includes("color_strategy"), `expected color_strategy, got ${slots}`);
  assert.ok(coffee.set.strategy.some((d) => d.derived_from[0].includes("ritual_framing")));
});

check("Anti-pattern is captured as a guardrail, not a visual instruction", () => {
  const ritual = coffee.set.strategy.find((d) => d.derived_from[0].includes("ritual_framing"))!;
  assert.ok(ritual.avoid.some((a) => /beans, steam, wooden table/i.test(a)), "anti-pattern missing from avoid");
  assert.ok(!JSON.stringify(coffee.creativeDirection).includes("wooden table"), "anti-pattern leaked into art direction");
});

check("Resolver accepts coffee decisions at KNOWLEDGE tier", () => {
  assert.strictEqual((coffee.resolved.fields as any).camera?.source, "KNOWLEDGE");
  assert.strictEqual((coffee.resolved.fields as any).colour?.source, "KNOWLEDGE");
});

section("6. End-to-end: Fashion social advertisement");
const fashion = e2e("ATELIER SIX — social ad", {
  brand: "Atelier Six", product: "Silk scarf collection",
  industry: "fashion", audience: "Gen Z", objective: "Brand awareness",
  channel: "tiktok", tone: "Editorial, confident",
}, FASHION, "social_ad");

check("Context resolves to fashion / gen_z / tiktok", () => {
  assert.strictEqual(fashion.query.industry, "fashion");
  assert.strictEqual(fashion.query.audience, "gen_z");
  assert.strictEqual(fashion.query.channel, "tiktok");
});

check("Channel-specific layout rule is retrieved and applied", () => {
  assert.ok(fashion.trace.retrieved.some((r) => r.knowledge_id.includes("mobile_first")), "mobile_first should match tiktok + social_ad");
  const comp = fashion.set.art_direction.find((d) => d.direction_slot === "composition_strategy");
  assert.ok(comp && /lower third/i.test(comp.decision), "expected platform-chrome composition decision");
});

check("Produces atmosphere + composition and the expression strategy", () => {
  const slots = fashion.set.art_direction.map((d) => d.direction_slot);
  assert.ok(slots.includes("visual_style"), `expected visual_style, got ${slots}`);
  assert.ok(slots.includes("composition_strategy"), `expected composition_strategy, got ${slots}`);
  assert.ok(fashion.set.strategy.some((d) => d.derived_from[0].includes("self_expression")));
});

check("Resolver accepts fashion decisions at KNOWLEDGE tier", () => {
  assert.strictEqual((fashion.resolved.fields as any).atmosphere?.source, "KNOWLEDGE");
  assert.strictEqual((fashion.resolved.fields as any).composition?.source, "KNOWLEDGE");
});

section("7. Cross-campaign differentiation");

check("Three briefs produce three different decision sets", () => {
  const sets = [skin, coffee, fashion].map((r) => JSON.stringify(r.set.art_direction.map((d) => d.decision).sort()));
  assert.strictEqual(new Set(sets).size, 3, "decision sets must differ per campaign");
});

check("Knowledge from one industry does not surface for another", () => {
  const mixed = new ReasoningKnowledgeRetriever(repoOf([...SKINCARE, ...COFFEE, ...FASHION]));
  const { trace } = CreativeDecisionEngine.run(
    { industry: "beauty", brand_position: "premium", audience: "women_35_50" },
    mixed
  );
  const ids = trace.retrieved.map((r) => r.knowledge_id);
  assert.ok(!ids.some((id) => id.includes("food") || id.includes("coffee")), `coffee knowledge leaked: ${ids}`);
  assert.ok(!ids.some((id) => id.includes("fashion") || id.includes("genz")), `fashion knowledge leaked: ${ids}`);
});

section("8. Diagnostics completeness");

check("Trace covers all four required stages", () => {
  assert.ok(skin.trace.retrieved.length > 0, "retrieved knowledge missing");
  assert.ok(skin.trace.reasoning_applied.length > 0, "reasoning applied missing");
  assert.ok(skin.trace.decisions.art_direction.length > 0, "decisions missing");
  assert.ok(skin.trace.art_direction_input && Object.keys(skin.trace.art_direction_input).length > 0, "art direction input missing");
  for (const r of skin.trace.reasoning_applied) assert.ok(r.rule.length > 0, "each routing must state its rule");
});

check("All fixture knowledge is governance-valid", () => {
  const summary = ReasoningKnowledgeValidator.validateAll([...SKINCARE, ...COFFEE, ...FASHION]);
  assert.strictEqual(summary.errors, 0, JSON.stringify(summary.issues.filter((i) => i.severity === "ERROR"), null, 2));
});

console.log("\n" + "=".repeat(62));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(62));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
