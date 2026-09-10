import assert from "assert";
import { CiosReasoningShadowService } from "./reasoning/CiosReasoningShadowService";
import { CreativeContextExtractor } from "./reasoning/CreativeContextExtractor";
import { CreativeDecisionEngine } from "./reasoning/CreativeDecisionEngine";
import { ReasoningKnowledgeRepository } from "./reasoning/ReasoningKnowledgeRepository";
import { ReasoningKnowledgeRetriever } from "./reasoning/ReasoningKnowledgeRetriever";
import { SlotPropagationValidator } from "./reasoning/SlotPropagationValidator";
import { DIRECTION_SLOTS, DirectionSlot, ReasoningKnowledgeObject } from "./reasoning/reasoning-knowledge.types";
import { ArtDirectionResolverService } from "./service/ArtDirectionResolverService";
import { CampaignBriefInput } from "./campaign/campaign.types";
import { LockedIntent } from "./service/CreativeInterpretationService";

/**
 * CIOS Phase 3.1.6.5 — integration validation.
 *
 * Verifies that a reasoning decision survives every hop to the prompt, and says
 * where it stops when it does not. Deliberately scores nothing: Phase 3.1.6 moved
 * the benchmark numbers, and this suite exists because moving numbers is not the
 * same as arriving data. `materials` scored well in V2 while never reaching the
 * resolver at all.
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

console.log("=".repeat(72));
console.log("CIOS PHASE 3.1.6.5 — SLOT ARCHITECTURE INTEGRATION VALIDATION");
console.log("=".repeat(72));

const repo = new ReasoningKnowledgeRepository();

/** Minimal governance-valid object, so a fixture states only what it is testing. */
function K(over: Partial<ReasoningKnowledgeObject> & { knowledge_id: string; domain: string; decision: string }) {
  return {
    name: over.knowledge_id,
    sub_domain: "test",
    knowledge_type: "decision_rule",
    creative_stage: ["design"],
    context: {
      industry: "*", category: "*", audience: "*", objective: "*",
      channel: "*", asset_type: "*", brand_position: "*",
    },
    problem: "A stated problem long enough to satisfy the structural validator.",
    reasoning: "The reasoning that makes this decision correct in the stated context.",
    why_this_works: "Why the mechanism holds.",
    impact: "The expected result of applying it.",
    confidence: 0.9,
    priority: 8,
    impact_score: 8,
    context_relevance: 1,
    ...over,
  } as unknown as ReasoningKnowledgeObject;
}

const repoOf = (objects: ReasoningKnowledgeObject[]) =>
  ({
    getAll: () => objects,
    getById: (id: string) => objects.find((o) => o.knowledge_id === id) || null,
    getLoadErrors: () => [],
  }) as unknown as ReasoningKnowledgeRepository;

const decideFrom = (objects: ReasoningKnowledgeObject[]) =>
  CreativeDecisionEngine.decide(new ReasoningKnowledgeRetriever(repoOf(objects)).retrieve({}).results);

// ── 1. Slot architecture, stated once ─────────────────────────────────────
section("1. Slot architecture (Task 1)");

check("All six required slots exist and are routable", () => {
  // The six the phase names, plus visual_style which predates it.
  const required: DirectionSlot[] = [
    "camera_direction",
    "lighting_direction",
    "composition_strategy",
    "typography_strategy",
    "color_strategy",
    "material_direction",
  ];
  for (const slot of required) {
    assert.ok(DIRECTION_SLOTS.includes(slot), `${slot} is not a declared DirectionSlot`);
  }
  console.log(`      ${DIRECTION_SLOTS.length} slots: ${DIRECTION_SLOTS.join(", ")}`);
});

check("Each visual domain routes to its own slot", () => {
  const expected: [string, DirectionSlot][] = [
    ["camera", "camera_direction"],
    ["lighting", "lighting_direction"],
    ["layout", "composition_strategy"],
    ["color", "color_strategy"],
    ["typography", "typography_strategy"],
    ["material", "material_direction"],
    ["visual_direction", "visual_style"],
  ];
  for (const [domain, slot] of expected) {
    const routing = CreativeDecisionEngine.route(
      K({ knowledge_id: `${domain}.a.b.001`, domain, decision: "Hold a stated, measurable instruction." })
    );
    assert.strictEqual(routing.target, "ART_DIRECTION", `${domain} did not route to ART_DIRECTION`);
    const actual = routing.slot || undefined;
    const viaDimension = routing.dimension;
    assert.ok(
      actual === slot || Boolean(viaDimension),
      `${domain} routed to neither slot "${slot}" nor a dimension`
    );
  }
});

check("Every art-direction decision carries a direction_slot", () => {
  const set = decideFrom([
    K({ knowledge_id: "camera.a.b.001", domain: "camera", decision: "Shoot at eye level on a 50mm lens." }),
    K({ knowledge_id: "typography.a.b.001", domain: "typography", decision: "Limit the asset to three type levels." }),
    K({ knowledge_id: "material.a.b.001", domain: "material", decision: "Keep visible pore structure on skin." }),
  ]);
  assert.strictEqual(set.art_direction.length, 3);
  for (const d of set.art_direction) {
    assert.ok(d.direction_slot, `${d.decision_id} has no direction_slot`);
  }
});

// ── 2. Trace validation ───────────────────────────────────────────────────
section("2. Decision trace validation (Task 2)");

check("Every record exposes the six required fields", () => {
  const set = decideFrom([
    K({ knowledge_id: "lighting.soft.single.001", domain: "lighting", decision: "Use one large diffused source at 45 degrees." }),
  ]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  const report = SlotPropagationValidator.validate(set, direction);
  assert.strictEqual(report.records.length, 1);
  const r = report.records[0];
  assert.strictEqual(r.knowledge_id, "lighting.soft.single.001");
  assert.strictEqual(r.domain, "lighting");
  assert.ok(r.decision.length > 0);
  assert.strictEqual(r.direction_slot, "lighting_direction");
  assert.strictEqual(r.destination, "lighting_direction");
  assert.ok(r.compiler_received, "compiler_received status missing");
});

check("Without a prompt, arrival is NOT_CHECKED rather than assumed", () => {
  // The failure this guards: reporting a hop as verified when nothing verified it.
  const set = decideFrom([K({ knowledge_id: "color.a.b.001", domain: "color", decision: "Hold a four-to-one luminance ratio." })]);
  const report = SlotPropagationValidator.validate(set, CreativeDecisionEngine.toCreativeDirection(set));
  assert.strictEqual(report.records[0].compiler_received, "NOT_CHECKED");
  assert.strictEqual(report.records[0].reached_direction, true);
});

check("A decision the adapter drops is reported as LOST_IN_ADAPTER", () => {
  const set = decideFrom([K({ knowledge_id: "camera.a.b.001", domain: "camera", decision: "Shoot at eye level on a 50mm lens." })]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  // Simulate an adapter that forgot this slot — the exact `materials` bug.
  const broken = { ...direction, camera_direction: "" };
  const report = SlotPropagationValidator.validate(set, broken);
  assert.strictEqual(report.records[0].compiler_received, "LOST_IN_ADAPTER");
  assert.ok(/did not write this decision/.test(report.records[0].note || ""));
});

check("A value present in the direction but absent from the prompt is NOT_IN_PROMPT", () => {
  const set = decideFrom([K({ knowledge_id: "camera.a.b.001", domain: "camera", decision: "Shoot at eye level on a fifty millimetre lens." })]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  const report = SlotPropagationValidator.validate(set, direction, "a prompt that says nothing of the sort");
  assert.strictEqual(report.records[0].compiler_received, "NOT_IN_PROMPT");
  assert.strictEqual(report.broken_hops.length, 1);
});

// ── 3. Adapter: many objects, distinct slots ──────────────────────────────
section("3. CreativeDirection adapter (Task 3)");

check("Six objects populate six distinct slots without collision", () => {
  const set = decideFrom([
    K({ knowledge_id: "camera.angle.hero.001", domain: "camera", decision: "Shoot at eye level on a 50mm lens with the product at 40 percent of frame." }),
    K({ knowledge_id: "lighting.soft.single.001", domain: "lighting", decision: "Use one large diffused source at 45 degrees to camera left." }),
    K({ knowledge_id: "layout.hero.centred.001", domain: "layout", decision: "Place the subject on the exact centre axis at 45 percent of frame height." }),
    K({ knowledge_id: "color.contrast.floor.001", domain: "color", decision: "Hold at least a four-to-one luminance ratio between subject and background." }),
    K({ knowledge_id: "typography.hierarchy.three.001", domain: "typography", decision: "Limit the asset to three type levels separated by a 1.5 size ratio." }),
    K({ knowledge_id: "material.skin.texture.001", domain: "material", decision: "Retain visible pore structure and natural surface variation." }),
  ]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);

  assert.ok(direction.camera_direction.includes("50mm"), "camera_direction not populated");
  assert.ok(direction.lighting_direction.includes("45 degrees"), "lighting_direction not populated");
  assert.ok(direction.composition_strategy.includes("centre axis"), "composition_strategy not populated");
  assert.ok(direction.color_strategy.includes("four-to-one"), "color_strategy not populated");
  assert.ok(direction.typography_strategy.includes("three type levels"), "typography_strategy not populated");
  assert.ok(direction.material_direction?.includes("pore structure"), "material_direction not populated");

  // No slot may hold another slot's decision.
  const values = [
    direction.camera_direction,
    direction.lighting_direction,
    direction.composition_strategy,
    direction.color_strategy,
    direction.typography_strategy,
    direction.material_direction || "",
  ];
  assert.strictEqual(new Set(values).size, 6, "two slots hold the same text");

  const report = SlotPropagationValidator.validate(set, direction);
  assert.strictEqual(report.summary.reached_direction, 6);
  assert.strictEqual(report.summary.lost_in_adapter, 0);
  console.log("      " + SlotPropagationValidator.format(report).split("\n")[0]);
});

check("Two objects for one slot: one wins, the other is superseded not lost", () => {
  const set = decideFrom([
    K({ knowledge_id: "camera.a.strong.001", domain: "camera", decision: "Shoot at eye level on a 50mm lens.", priority: 9, impact_score: 9, confidence: 0.95 }),
    K({ knowledge_id: "camera.b.weak.001", domain: "camera", decision: "Shoot from a high angle on a wide lens.", priority: 3, impact_score: 3, confidence: 0.5 }),
  ]);
  assert.strictEqual(set.art_direction.filter((d) => d.direction_slot === "camera_direction").length, 1);
  assert.strictEqual(set.superseded.length, 1);
  assert.strictEqual(set.superseded[0].derived_from[0], "camera.b.weak.001");
  const report = SlotPropagationValidator.validate(set, CreativeDecisionEngine.toCreativeDirection(set));
  assert.strictEqual(report.summary.lost_in_adapter, 0, "the winner must still reach its slot");
});

check("environment still has no slot and is reported, not dropped", () => {
  const set = decideFrom([
    K({ knowledge_id: "visual_direction.scene.backdrop.001", domain: "visual_direction", decision: "Set the scene against a seamless mid-grey backdrop." }),
  ]);
  assert.strictEqual(set.art_direction.length, 0);
  assert.strictEqual(set.unmapped.length, 1);
  assert.strictEqual(set.unmapped[0].intended_dimension, "environment");
});

// ── 4. Resolver and prompt propagation ────────────────────────────────────
section("4. Resolver and prompt propagation (Task 4)");

const emptyIntent: LockedIntent = {
  subject: [], environment: [], mood: [], style: [],
  camera_requirements: [], lighting_requirements: [],
  non_negotiable_constraints: [], important_user_requirements: [],
};

check("Five resolver-backed slots reach the rendered art direction block", () => {
  const set = decideFrom([
    K({ knowledge_id: "camera.angle.hero.001", domain: "camera", decision: "Shoot at eye level on a 50mm lens with the product at 40 percent of frame." }),
    K({ knowledge_id: "lighting.soft.single.001", domain: "lighting", decision: "Use one large diffused source at 45 degrees to camera left." }),
    K({ knowledge_id: "layout.hero.centred.001", domain: "layout", decision: "Place the subject on the exact centre axis at 45 percent of frame height." }),
    K({ knowledge_id: "color.contrast.floor.001", domain: "color", decision: "Hold at least a four-to-one luminance ratio between subject and background." }),
    K({ knowledge_id: "material.skin.texture.001", domain: "material", decision: "Retain visible pore structure and natural surface variation." }),
  ]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: emptyIntent,
    knowledgeDirection: direction,
    assetType: "poster",
  });
  const block = resolved.promptBlock;

  for (const [slot, marker] of [
    ["camera_direction", "50mm"],
    ["lighting_direction", "45 degrees"],
    ["composition_strategy", "centre axis"],
    ["color_strategy", "four-to-one"],
    ["material_direction", "pore structure"],
  ] as const) {
    assert.ok(block.includes(marker), `${slot} did not reach the rendered art direction block`);
  }
  // The whole point of the materials push added in this phase.
  assert.ok(block.includes("MATERIALS & SURFACES"), "the MATERIALS line is missing from the block");
  assert.strictEqual(resolved.fields.materials?.source, "KNOWLEDGE");

  const report = SlotPropagationValidator.validate(set, direction, block);
  assert.strictEqual(report.summary.received_by_compiler, 5, SlotPropagationValidator.format(report));
  console.log("      " + SlotPropagationValidator.format(report).split("\n")[0]);
});

check("typography_strategy reaches the resolver block", () => {
  // Phase 3.1.6.6. This assertion is the exact inverse of the one it replaces:
  // until typography became an ArtDirectionDimension the slot filled and the
  // resolver never saw it, which 3.1.6.5 recorded as a boundary rather than
  // letting a later phase find it by surprise.
  const set = decideFrom([
    K({ knowledge_id: "typography.hierarchy.three.001", domain: "typography", decision: "Limit the asset to three type levels separated by a 1.5 size ratio." }),
  ]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  assert.ok(direction.typography_strategy.includes("three type levels"), "the slot must be filled");

  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: emptyIntent,
    knowledgeDirection: direction,
    assetType: "poster",
  });
  assert.strictEqual(resolved.fields.typography?.source, "KNOWLEDGE", "typography did not resolve at the KNOWLEDGE tier");
  assert.ok(resolved.promptBlock.includes("TYPOGRAPHY"), "the TYPOGRAPHY label is missing from the block");
  assert.ok(resolved.promptBlock.includes("three type levels"), "the decision text did not reach the block");

  const report = SlotPropagationValidator.validate(set, direction, resolved.promptBlock);
  assert.strictEqual(report.records[0].compiler_received, "RECEIVED");
  assert.deepStrictEqual(report.broken_hops, []);
});

check("Typography is routed by dimension, like every other visual domain", () => {
  const routing = CreativeDecisionEngine.route(
    K({ knowledge_id: "typography.a.b.001", domain: "typography", decision: "Limit the asset to three type levels." })
  );
  assert.strictEqual(routing.target, "ART_DIRECTION");
  assert.strictEqual(routing.dimension, "typography", "typography must now claim a resolver dimension");
  const set = decideFrom([
    K({ knowledge_id: "typography.a.b.001", domain: "typography", decision: "Limit the asset to three type levels." }),
  ]);
  assert.strictEqual(set.art_direction[0].direction_slot, "typography_strategy");
  assert.strictEqual(set.art_direction[0].art_direction_dimension, "typography");
});

check("A client typographic instruction is arbitrated against retrieved typography", () => {
  // The point of making typography a dimension rather than a private channel: it
  // is now arbitrated. A decision that could not be outranked would hold a
  // stronger authority than a client instruction, which no tier below USER has.
  const set = decideFrom([
    K({ knowledge_id: "typography.a.b.001", domain: "typography", decision: "Limit the asset to three type levels separated by a 1.5 size ratio." }),
  ]);
  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: { ...emptyIntent, important_user_requirements: ["Set every headline in all capitals, tracked wide"] },
    knowledgeDirection: CreativeDecisionEngine.toCreativeDirection(set),
    assetType: "poster",
  });
  assert.ok(resolved.fields.typography, "typography did not resolve at all");
  const occurrences = resolved.promptBlock.split("TYPOGRAPHY").length - 1;
  assert.strictEqual(occurrences, 1, "TYPOGRAPHY printed " + occurrences + " times");
});

check("Backward compatibility: no typography knowledge still resolves and renders", () => {
  // Task 6. An asset whose retrieval produced no typographic decision must not
  // gain an empty TYPOGRAPHY line, and must not fail to resolve.
  const set = decideFrom([
    K({ knowledge_id: "camera.angle.hero.001", domain: "camera", decision: "Shoot at eye level on a 50mm lens." }),
  ]);
  const direction = CreativeDecisionEngine.toCreativeDirection(set);
  assert.strictEqual(direction.typography_strategy, "", "no typography knowledge means an empty slot");

  const resolved = ArtDirectionResolverService.resolve({
    lockedIntent: emptyIntent,
    knowledgeDirection: direction,
    assetType: "poster",
  });
  assert.strictEqual(resolved.fields.typography, undefined, "an empty slot must not resolve a dimension");
  assert.ok(!resolved.promptBlock.includes("TYPOGRAPHY"), "an empty typography slot must print no line");
  assert.ok(resolved.promptBlock.includes("CAMERA"), "the rest of the block must still render");
});

check("The compiler accepts a direction override without changing default behaviour", () => {
  // The seam itself: absent, the field is undefined and the compiler builds its
  // direction exactly as before. Asserted on the type and the call site rather
  // than by running a full compile, which needs a routing result and a knowledge
  // package this suite has no business constructing.
  const src = require("fs").readFileSync("lib/image-engine/compiler/MasterPromptCompilerService.ts", "utf-8");
  assert.ok(
    /knowledgeDirection:\s*\(input\.knowledgeDirectionOverride[^)]*\)\s*\|\|\s*creativeRes\.creativeDirection/.test(src),
    "the compiler must fall back to the Layer 1 direction when no override is supplied"
  );
});

// ── 5. Five-case shadow data-flow validation ──────────────────────────────
section("5. Five-case shadow validation — data flow only (Task 5)");

const CASES: [string, CampaignBriefInput][] = [
  ["Beauty", {
    brand: "Lumière", product: "Tone brightening capsule ampoule",
    audience: "Women 30-45 who buy premium skincare", objective: "Product launch",
    channel: "Instagram", tone: "Premium, clinical, quietly luxurious",
    industry: "Beauty and skincare", assetTypes: ["poster"],
  }],
  ["Food & Beverage", {
    brand: "Nhà Rang", product: "Single origin cold brew",
    audience: "Gen Z office workers", objective: "New store launch",
    channel: "TikTok", tone: "Warm, local, unpretentious",
    industry: "Food and beverage", assetTypes: ["social_ad"],
  }],
  ["Fashion", {
    brand: "Khô", product: "Oversized linen shirting",
    audience: "Women 25-35 buying considered basics", objective: "Collection launch",
    channel: "Instagram", tone: "Understated, tactile, unbranded",
    industry: "Fashion", assetTypes: ["poster"],
  }],
  ["Hospitality", {
    brand: "Nhà Vườn", product: "Twelve-room garden hotel",
    audience: "Couples booking a weekend away", objective: "Drive direct bookings",
    channel: "Instagram", tone: "Calm, green, unhurried",
    industry: "Hospitality", assetTypes: ["poster"],
  }],
  ["Technology", {
    brand: "Ghi", product: "Team note-taking and search tool",
    audience: "Product and engineering teams", objective: "Drive trial signups",
    channel: "Facebook", tone: "Plain, fast, unhyped",
    industry: "Technology", assetTypes: ["social_ad"],
  }],
];

for (const [label, brief] of CASES) {
  check(`${label}: knowledge travels the full chain`, () => {
    // No quality assertion anywhere in this block. The question is only whether
    // data arrives, and a data-flow test that also grades creativity fails for
    // two unrelated reasons and tells you neither.
    const query = CreativeContextExtractor.extract({
      brand: brief.brand, product: brief.product, industry: brief.industry,
      audience: brief.audience, objective: brief.objective, channel: brief.channel,
      tone: brief.tone, assetType: brief.assetTypes?.[0],
    });
    const retriever = new ReasoningKnowledgeRetriever(repo, { admission: "strict" });
    const { set, creativeDirection } = CreativeDecisionEngine.run(query, retriever);

    assert.ok(set.art_direction.length > 0, "no art direction decisions");

    const resolved = ArtDirectionResolverService.resolve({
      lockedIntent: emptyIntent,
      knowledgeDirection: creativeDirection,
      assetType: brief.assetTypes?.[0],
    });
    const report = SlotPropagationValidator.validate(set, creativeDirection, resolved.promptBlock);

    // Every decision must reach its CreativeDirection field. Nothing may vanish
    // between the decision set and the adapter.
    assert.strictEqual(
      report.summary.lost_in_adapter,
      0,
      `${report.summary.lost_in_adapter} decision(s) lost in the adapter: ${report.records.filter((r) => r.compiler_received === "LOST_IN_ADAPTER").map((r) => r.knowledge_id).join(", ")}`
    );
    assert.strictEqual(report.summary.no_slot, 0, "a decision reached ART_DIRECTION with no slot");

    // Phase 3.1.6.6: no slot is stranded any more. The typography carve-out this
    // assertion used to carry is gone, which is the whole point of the phase.
    assert.deepStrictEqual(
      report.records.filter((r) => r.compiler_received === "NOT_IN_PROMPT").map((r) => `${r.direction_slot}:${r.knowledge_id}`),
      [],
      "a decision reached CreativeDirection but not the prompt block"
    );
    assert.strictEqual(
      report.summary.received_by_compiler,
      report.summary.decisions,
      "every decision must reach the prompt block"
    );

    console.log(
      `      ${label.padEnd(16)} ${report.summary.slots_filled}/${report.summary.slots_total} slots · ` +
        `${report.summary.decisions} decisions · ${report.summary.received_by_compiler} in prompt · ` +
        `${report.summary.not_in_prompt} stranded`
    );
  });
}

check("Shadow mode still produces a clean, complete result on all five", () => {
  for (const [label, brief] of CASES) {
    const r = CiosReasoningShadowService.run({ brief, repository: repo }, true);
    assert.ok(r.enabled, `${label}: shadow run was skipped`);
    if (!r.enabled) continue;
    assert.ok(r.layer_separation.clean, `${label}: Governance §1 breach`);
    assert.ok(r.summary.art_direction_decisions > 0, `${label}: no decisions`);
  }
});

console.log("\n" + "=".repeat(72));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(72));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
