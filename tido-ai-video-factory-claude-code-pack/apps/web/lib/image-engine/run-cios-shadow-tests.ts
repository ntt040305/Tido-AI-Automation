import assert from "assert";
import { CiosReasoningShadowService } from "./reasoning/CiosReasoningShadowService";
import { CiosShadowResult, SHADOW_DIMENSIONS } from "./reasoning/cios-shadow.types";
import { ConceptQualityGate } from "./reasoning/ConceptQualityGate";
import { CONCEPT_LEAD_DOMAINS } from "./reasoning/concept-validation.types";
import { CONCEPT_GROUP, retrievalGroup } from "./reasoning/reasoning-knowledge.types";
import { ConceptRetrievalScorer } from "./reasoning/ConceptRetrievalScorer";
import { ConceptConflictResolver } from "./reasoning/ConceptConflictResolver";
import { CreativeConceptGenerator } from "./reasoning/CreativeConceptGenerator";
import { CONCEPT_FORBIDDEN_FIELDS } from "./reasoning/concept-generation.types";
import { REASONING_ONLY_KNOWLEDGE_FIELDS } from "./reasoning/creative-decision.types";
import { ReasoningKnowledgeRepository } from "./reasoning/ReasoningKnowledgeRepository";
import { CampaignBriefInput } from "./campaign/campaign.types";
import { IMAGE_ENGINE_CONFIG } from "./config";

/**
 * CIOS Phase 3.1 verification — reasoning integration in shadow mode.
 *
 * Two properties dominate this suite, because they are what make the phase safe:
 * with the flag off nothing runs at all, and with it on nothing the reasoning
 * layer produces can reach a prompt. Everything else is diagnostics quality.
 *
 * Runs against the real 368-object corpus rather than fixtures. Shadow mode's
 * entire purpose is first contact with real briefs, so a fixture-only test would
 * verify the one thing that was never in doubt.
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
console.log("CIOS PHASE 3.1 — REASONING INTEGRATION (SHADOW MODE)");
console.log("=".repeat(72));

const repo = new ReasoningKnowledgeRepository();

const SKINCARE: CampaignBriefInput = {
  brand: "Lumière",
  product: "Tone Brightening Capsule Ampoule",
  audience: "Women 30-45 who buy premium skincare",
  objective: "Product launch",
  channel: "Instagram",
  tone: "Premium, clinical, quietly luxurious",
  industry: "Beauty and skincare",
  concept: "Proof you can see, in a form you want to hold",
  assetTypes: ["poster"],
};

const COFFEE: CampaignBriefInput = {
  brand: "Nhà Rang",
  product: "Single origin cold brew",
  audience: "Gen Z office workers in Ho Chi Minh City",
  objective: "New store launch, drive footfall",
  channel: "TikTok",
  tone: "Warm, local, unpretentious",
  industry: "Food and beverage, coffee shop",
  concept: "The street corner that got good at coffee",
  assetTypes: ["social_ad"],
};

const THIN: CampaignBriefInput = { brand: "X", product: "Y" };

const run = (brief: CampaignBriefInput, extra: Record<string, unknown> = {}) =>
  CiosReasoningShadowService.run({ brief, repository: repo, ...extra }, true);

const asResult = (brief: CampaignBriefInput, extra: Record<string, unknown> = {}): CiosShadowResult => {
  const r = run(brief, extra);
  assert.ok(r.enabled, `shadow run was skipped: ${!r.enabled ? r.reason + " " + (r.message || "") : ""}`);
  return r as CiosShadowResult;
};

// ── 1. The flag ───────────────────────────────────────────────────────────
section("1. Feature flag — default off, off means off");

check("CIOS_REASONING_ENABLED defaults to false", () => {
  // Read the config rather than the env var: a default that only holds when the
  // variable is unset is not a default, and this is the guard that keeps Phase
  // 3.1 from changing production behaviour on deploy.
  assert.strictEqual(
    IMAGE_ENGINE_CONFIG.CIOS_REASONING_ENABLED,
    process.env.CIOS_REASONING_ENABLED === "true",
    "flag must be driven solely by the env var"
  );
  if (!process.env.CIOS_REASONING_ENABLED) {
    assert.strictEqual(IMAGE_ENGINE_CONFIG.CIOS_REASONING_ENABLED, false);
  }
});

check("isEnabled honours an explicit override in both directions", () => {
  assert.strictEqual(CiosReasoningShadowService.isEnabled(true), true);
  assert.strictEqual(CiosReasoningShadowService.isEnabled(false), false);
  assert.strictEqual(
    CiosReasoningShadowService.isEnabled(undefined),
    IMAGE_ENGINE_CONFIG.CIOS_REASONING_ENABLED
  );
});

check("Disabled returns a skipped report and does no work", () => {
  const r = CiosReasoningShadowService.run({ brief: SKINCARE, repository: repo }, false);
  assert.strictEqual(r.enabled, false);
  assert.ok(!r.enabled && r.reason === "FLAG_DISABLED");
  // No trace, no concept, no retrieval: the disabled path must not be a "run it
  // and hide it" path, or the flag buys nothing in cost or risk.
  assert.strictEqual((r as any).concept, undefined);
  assert.strictEqual((r as any).retrieved_knowledge_ids, undefined);
});

// ── 2. The parallel path runs end to end ──────────────────────────────────
section("2. Brief → context → retrieval → concept → decision → direction");

check("A premium skincare brief produces a complete shadow result", () => {
  const r = asResult(SKINCARE);
  assert.ok(r.retrieved_knowledge_ids.length > 0, "retrieved nothing");
  // Phase 3.1.8.1 changed what "complete" means here. This used to assert a big
  // idea existed, and it passed on a layout rule wearing the label. A big idea is
  // now either genuinely present or explicitly absent — what must never happen is
  // an art direction decision promoted into the concept layer.
  assert.ok(
    ConceptQualityGate.validate(r.concept).violations.every((v) => v.kind === "MISSING_BIG_IDEA"),
    "the concept carries execution language"
  );
  assert.ok(r.summary.art_direction_decisions > 0, "no art direction decisions");
  console.log(
    `      ${r.retrieved_knowledge_ids.length} retrieved · ${r.summary.art_direction_decisions} AD · ` +
      `${r.summary.strategy_decisions} strategy · ${r.duration_ms}ms`
  );
});

check("Context extraction resolves the axes a full brief states", () => {
  const r = asResult(SKINCARE);
  assert.ok(r.context_coverage.resolved.includes("industry"), "industry unresolved");
  assert.ok(r.context_coverage.resolved.includes("objective"), "objective unresolved");
  assert.strictEqual(r.query.industry, "beauty");
  console.log(`      resolved: ${r.context_coverage.resolved.join(", ")}`);
});

check("A thin brief still runs, and says the context was thin", () => {
  // The failure mode worth guarding is a two-word brief silently producing
  // confident-looking decisions. It must produce a warning instead.
  const r = asResult(THIN);
  assert.ok(
    r.warnings.some((w) => w.startsWith("THIN_CONTEXT")),
    `expected a THIN_CONTEXT warning, got: ${r.warnings.join(" | ")}`
  );
});

check("Two different briefs produce different reasoning", () => {
  const a = asResult(SKINCARE);
  const b = asResult(COFFEE);
  assert.notDeepStrictEqual(a.query, b.query, "both briefs resolved to the same query");
  const overlap = a.retrieved_knowledge_ids.filter((id) => b.retrieved_knowledge_ids.includes(id));
  assert.ok(
    overlap.length < a.retrieved_knowledge_ids.length,
    "identical retrieval for a beauty brief and a coffee brief"
  );
  // Big ideas are compared only where both briefs produced one. With the concept
  // layer confined to concept-bearing domains, most briefs in this corpus produce
  // none — and two absent ideas being equal is not evidence of anything.
  if (a.concept.big_idea && b.concept.big_idea) {
    assert.notStrictEqual(a.concept.big_idea, b.concept.big_idea, "identical big idea for two categories");
  }
});

check("Shadow mode makes no network call and completes quickly", () => {
  const r = asResult(SKINCARE);
  // Retrieval is local files and both engines are deterministic. A slow run here
  // means something started making calls, which would make the flag unsafe to
  // leave on in staging.
  assert.ok(r.duration_ms < 5000, `shadow run took ${r.duration_ms}ms; expected a local-only run`);
});

// ── 3. Governance §1 — the membrane ───────────────────────────────────────
section("3. Layer separation (Governance §1)");

check("No reasoning-only field reaches the emitted direction", () => {
  for (const brief of [SKINCARE, COFFEE, THIN]) {
    const r = asResult(brief);
    assert.ok(
      r.layer_separation.clean,
      `${brief.brand}: leaked ${r.layer_separation.leaked_fields.join(", ")} — ${r.layer_separation.evidence[0]}`
    );
  }
});

check("The direction carries only decision text, never argument text", () => {
  // Checked independently of the service's own audit. The audit compares against
  // the objects it retrieved; this compares against the whole corpus, so a leak
  // through an object the trace failed to record is still caught.
  const r = asResult(SKINCARE);
  const emitted = [
    r.cios_direction.visual_style,
    r.cios_direction.camera_direction,
    r.cios_direction.lighting_direction,
    r.cios_direction.composition_strategy,
    r.cios_direction.color_strategy,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();

  if (!emitted.trim()) return;
  for (const obj of repo.getAll()) {
    for (const field of REASONING_ONLY_KNOWLEDGE_FIELDS) {
      const raw = (obj as any)[field];
      const texts = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
      for (const t of texts) {
        if (t.length >= 40) {
          assert.ok(
            !emitted.includes(t.toLowerCase()),
            `${obj.knowledge_id}.${field} appeared verbatim in the emitted direction`
          );
        }
      }
    }
  }
});

check("Every art direction decision lands in a real CreativeDirection slot", () => {
  // Phase 3.1.6 replaced "must have a resolver dimension" with "must have a
  // destination slot". Typography has a field on CreativeDirection and no
  // ArtDirectionDimension, so the old assertion rejected the very routing that
  // fixed 48 wasted retrievals per benchmark run.
  const valid = new Set([
    "camera_direction",
    "lighting_direction",
    "composition_strategy",
    "color_strategy",
    "visual_style",
    "typography_strategy",
    "material_direction",
  ]);
  const r = asResult(SKINCARE);
  for (const d of r.decision_trace.decisions.art_direction) {
    assert.ok(d.direction_slot, `${d.decision_id} routed to ART_DIRECTION with no destination slot`);
    assert.ok(valid.has(d.direction_slot!), `${d.decision_id} has unknown slot "${d.direction_slot}"`);
    // Only typography is allowed to reach a slot without a resolver dimension.
    if (!d.art_direction_dimension) {
      assert.strictEqual(d.direction_slot, "typography_strategy", `${d.decision_id} has no dimension and is not typography`);
    }
  }
});

// ── 4. The comparison ─────────────────────────────────────────────────────
section("4. Comparison against the legacy Layer 1 path");

check("All five dimensions are compared, every time", () => {
  const r = asResult(SKINCARE);
  assert.strictEqual(r.comparison.length, SHADOW_DIMENSIONS.length);
  assert.deepStrictEqual(
    r.comparison.map((c) => c.dimension),
    SHADOW_DIMENSIONS
  );
});

check("Each comparison carries both values and a classification", () => {
  const r = asResult(SKINCARE);
  const valid = ["BOTH_EMPTY", "CIOS_ONLY", "LEGACY_ONLY", "ALIGNED", "DIVERGENT"];
  for (const c of r.comparison) {
    assert.ok(valid.includes(c.agreement), `${c.dimension}: bad agreement "${c.agreement}"`);
    assert.strictEqual(typeof c.cios_value, "string");
    assert.strictEqual(typeof c.legacy_value, "string");
    if (c.agreement === "ALIGNED") {
      assert.ok(c.shared_terms.length >= 2, `${c.dimension}: ALIGNED with ${c.shared_terms.length} shared terms`);
    }
    if (c.agreement === "DIVERGENT") {
      assert.ok(c.cios_value && c.legacy_value, `${c.dimension}: DIVERGENT needs both values present`);
    }
  }
  console.log("      " + r.comparison.map((c) => `${c.dimension}=${c.agreement}`).join(" "));
});

check("Resolved art direction is folded in when it is supplied", () => {
  // The distinction the comparison exists to draw: a CIOS proposal on a dimension
  // a USER lock already owns changes nothing, however different it looks.
  const r = asResult(SKINCARE, {
    resolvedArtDirection: [
      { dimension: "camera", value: "top-down flat lay", source: "USER", confidence: 1, specificity: "high", score: 1, client_locked: true },
      { dimension: "lighting", value: "soft window light", source: "KNOWLEDGE", confidence: 0.5, specificity: "medium", score: 0.4, client_locked: false },
    ],
  });
  const camera = r.comparison.find((c) => c.dimension === "camera")!;
  const lighting = r.comparison.find((c) => c.dimension === "lighting")!;
  assert.strictEqual(camera.resolved_source, "USER");
  assert.strictEqual(camera.outranked_by_higher_tier, true, "a USER-locked dimension must be marked outranked");
  assert.strictEqual(lighting.resolved_source, "KNOWLEDGE");
  assert.strictEqual(lighting.outranked_by_higher_tier, false, "a KNOWLEDGE dimension is replaceable");
});

check("would-change count excludes dimensions owned by a higher tier", () => {
  const locked = ["camera", "lighting", "composition", "colour", "atmosphere"].map((dimension) => ({
    dimension,
    value: "client instruction",
    source: "USER",
    confidence: 1,
    specificity: "high",
    score: 1,
    client_locked: true,
  }));
  const r = asResult(SKINCARE, { resolvedArtDirection: locked });
  assert.strictEqual(
    r.summary.dimensions_that_would_change_output,
    0,
    "every dimension is client-locked, so switching the pipeline can change nothing"
  );
});

check("Concept comparison reports both sides and the CIOS verdict", () => {
  const r = asResult(SKINCARE, {
    strategySource: "MARKETING_BRAIN",
    legacyBigIdea: "Visible proof, quietly delivered",
    legacyCoreMessage: "See the difference in 14 days",
    strategy: { consumer_insight: "She has stopped believing claims" } as any,
  });
  assert.strictEqual(r.concept_comparison.legacy_strategy_source, "MARKETING_BRAIN");
  assert.strictEqual(r.concept_comparison.legacy_big_idea, "Visible proof, quietly delivered");
  assert.strictEqual(r.concept_comparison.legacy_consumer_insight, "She has stopped believing claims");
  assert.strictEqual(typeof r.concept_comparison.cios_accepted, "boolean");
});

// ── 5. Trace completeness ─────────────────────────────────────────────────
section("5. Trace completeness");

check("The trace answers all four questions a reviewer will ask", () => {
  const r = asResult(SKINCARE);
  // what was retrieved / how it was routed / what was decided / what it maps to
  assert.ok(r.decision_trace.retrieved.length > 0, "no retrieval trace");
  assert.ok(r.decision_trace.reasoning_applied.length > 0, "no routing trace");
  assert.ok(r.decision_trace.candidates_evaluated >= r.decision_trace.retrieved.length);
  assert.ok(r.decision_trace.art_direction_input, "no art direction input recorded");
  assert.ok(r.concept_trace.concept_sources.length > 0, "no concept field provenance");
});

check("Every concept field names where it came from", () => {
  const r = asResult(SKINCARE);
  const fields = new Set(r.concept_trace.concept_sources.map((s) => s.field));
  for (const required of ["big_idea", "core_message", "consumer_insight", "emotional_goal"]) {
    assert.ok(fields.has(required as any), `concept field ${required} has no recorded source`);
  }
});

check("Summary counts agree with the underlying trace", () => {
  const r = asResult(SKINCARE);
  assert.strictEqual(r.summary.retrieved, r.decision_trace.retrieved.length);
  assert.strictEqual(r.summary.art_direction_decisions, r.decision_trace.decisions.art_direction.length);
  assert.strictEqual(r.summary.strategy_decisions, r.decision_trace.decisions.strategy.length);
  assert.strictEqual(r.summary.superseded, r.decision_trace.decisions.superseded.length);
  assert.strictEqual(
    r.summary.dimensions_divergent,
    r.comparison.filter((c) => c.agreement === "DIVERGENT").length
  );
});

check("formatSummary renders both states without throwing", () => {
  const on = CiosReasoningShadowService.formatSummary(asResult(SKINCARE));
  assert.ok(on.includes("CIOS shadow:"));
  assert.ok(on.includes("layer separation"));
  const off = CiosReasoningShadowService.formatSummary(
    CiosReasoningShadowService.run({ brief: SKINCARE, repository: repo }, false)
  );
  assert.ok(off.includes("FLAG_DISABLED"));
});

// ── 6. It cannot break production ─────────────────────────────────────────
section("6. Failure containment");

check("A broken repository degrades to a skipped report, not a throw", () => {
  const broken = {
    getAll() {
      throw new Error("corpus unreadable");
    },
    getById() {
      return null;
    },
  } as unknown as ReasoningKnowledgeRepository;

  const r = CiosReasoningShadowService.run({ brief: SKINCARE, repository: broken }, true);
  assert.strictEqual(r.enabled, false, "a failing shadow run must not report success");
  assert.ok(!r.enabled && r.reason === "ERROR", "expected reason ERROR");
  assert.ok(!r.enabled && /corpus unreadable/.test(r.message || ""), "the cause must be reported");
});

check("An empty brief does not throw", () => {
  const r = CiosReasoningShadowService.run({ brief: { brand: "", product: "" }, repository: repo }, true);
  assert.ok(r.enabled === true || r.reason === "ERROR", "must return a report either way");
});

// ── 7. Concept / art direction separation (Phase 3.1.8.1) ────────────────
section("7. Concept / art direction separation");

check("No concept carries layout, camera, lighting or typography instruction", () => {
  // The defect this phase repaired: measured across the thirty benchmark cases,
  // twenty of thirty big ideas were layout rules and only four came from a
  // strategy object. The gate rejects that class of output outright.
  for (const brief of [SKINCARE, COFFEE, THIN]) {
    const r = asResult(brief);
    const v = ConceptQualityGate.validate(r.concept);
    const contamination = v.violations.filter((x) => x.kind !== "MISSING_BIG_IDEA");
    assert.deepStrictEqual(
      contamination.map((x) => `${x.kind}:${x.field}:${x.evidence}`),
      [],
      `${brief.brand}: concept contaminated by execution language`
    );
  }
});

check("A big idea, when present, comes from a concept-bearing domain", () => {
  for (const brief of [SKINCARE, COFFEE]) {
    const r = asResult(brief);
    if (!r.concept.big_idea) continue;
    const source = r.concept_trace.concept_sources.find((s) => s.field === "big_idea");
    const domain = String(source?.knowledge_id || "").split(".")[0];
    assert.ok(
      CONCEPT_LEAD_DOMAINS.has(domain),
      `${brief.brand}: big idea led by "${domain}", which describes execution rather than a reason to care`
    );
  }
});

check("An absent big idea is reported, not fabricated", () => {
  // A corpus gap must surface as a gap. Filling it from an art direction object
  // is what made the gap invisible for the whole of Phase 3.1.
  const r = asResult(SKINCARE);
  if (r.concept.big_idea) return;
  const v = ConceptQualityGate.validate(r.concept);
  assert.ok(v.violations.some((x) => x.kind === "MISSING_BIG_IDEA"), "an absent idea must be reported");
  assert.strictEqual(v.valid, false);
});

check("The gate rejects a contaminated concept and accepts a clean one", () => {
  const dirty = {
    big_idea: "The subject within the upper 65 percent and reserve the lower 35 percent for platform interface",
    consumer_insight: "Reserving the band means the composition survives playback.",
    core_message: "",
    differentiation: "",
  } as any;
  const dv = ConceptQualityGate.validate(dirty, "layout");
  assert.strictEqual(dv.valid, false);
  assert.ok(dv.violations.some((v) => v.kind === "LAYOUT_INSTRUCTION"));
  assert.ok(dv.violations.some((v) => v.kind === "ART_DIRECTION_SOURCE"));
  assert.ok(dv.separation_score <= 3, `contaminated concept scored ${dv.separation_score}`);

  const clean = {
    big_idea: "The step you skip that costs the most",
    consumer_insight: "She has stopped believing brightening claims after a decade of them.",
    core_message: "Proof you can see, in a form you want to hold.",
    differentiation: "The only one that shows its working.",
  } as any;
  const cv = ConceptQualityGate.validate(clean, "strategy");
  assert.strictEqual(cv.valid, true, ConceptQualityGate.format(cv));
  assert.strictEqual(cv.separation_score, 10);
});

check("The gate allows a number that is content, not a specification", () => {
  // The first version of this gate rejected any digit, which would have thrown
  // out "twelve courses" and "two units only" — facts about the offer, not
  // instructions about the frame.
  const okNumbers = {
    big_idea: "Twelve decisions, made for you",
    consumer_insight: "There are two units and everyone knows it.",
    core_message: "A four hundred dollar cream that explains itself.",
    differentiation: "",
  } as any;
  const v = ConceptQualityGate.validate(okNumbers, "strategy");
  assert.strictEqual(v.valid, true, ConceptQualityGate.format(v));
});

check("Every prohibited instruction class is detected", () => {
  const cases: [string, string][] = [
    ["LAYOUT_INSTRUCTION", "Hold the product on the centre axis at 40 percent of frame height"],
    ["CAMERA_INSTRUCTION", "Shoot at eye level on a 50mm lens"],
    ["LIGHTING_INSTRUCTION", "One large diffused key light at 45 degrees"],
    ["TYPOGRAPHY_INSTRUCTION", "Limit the asset to three type levels in a grotesque"],
    ["MATERIAL_INSTRUCTION", "Render the surface texture with a matte finish"],
  ];
  for (const [kind, text] of cases) {
    const v = ConceptQualityGate.validate(
      { big_idea: text, consumer_insight: "", core_message: "", differentiation: "" } as any
    );
    assert.ok(
      v.violations.some((x) => x.kind === kind || x.kind === "MEASUREMENT"),
      `"${text}" was not detected as ${kind}`
    );
  }
});

// ── 8. Creative Concept Intelligence (Phase 4.0) ─────────────────────────
section("8. Creative Concept Intelligence");

check("The concept layer has knowledge to lead from", () => {
  // Phase 3.1.8.1 measured 11 usable concept-bearing objects across 368, which
  // is why the layer produced nothing. This asserts the gap was actually closed.
  const conceptDomains = ["human_tension", "consumer_insight", "campaign_territory", "idea_pattern"];
  const objects = repo.getAll().filter((o) => conceptDomains.includes(String(o.domain)));
  assert.ok(objects.length >= 100, `expected at least 100 concept objects, found ${objects.length}`);
  const leadable = objects.filter((o) => String(o.knowledge_type) === "decision_rule");
  assert.strictEqual(leadable.length, objects.length, "every concept object must be able to lead");
  const industries = new Set(objects.flatMap((o) => (o.domain_profile as any)?.industries || []));
  assert.ok(industries.size >= 6, `concept knowledge spans only ${industries.size} industries`);
  console.log(`      ${objects.length} objects · ${new Set(objects.map((o) => o.domain)).size} domains · ${industries.size} industries`);
});

check("Every concept object carries the full pattern profile", () => {
  const required = ["human_tension", "consumer_insight", "emotional_trigger", "belief_shift", "campaign_territory"];
  const objects = repo.getAll().filter(
    (o) => (o.domain_profile as any)?.kind === "creative_concept_pattern"
  );
  assert.ok(objects.length >= 100, `expected at least 100 pattern profiles, found ${objects.length}`);
  for (const o of objects) {
    const prof = o.domain_profile as any;
    for (const f of required) {
      assert.ok(prof[f] && String(prof[f]).length > 25, `${o.knowledge_id}: thin or missing ${f}`);
    }
  }
});

check("No concept object carries execution language in its decision", () => {
  // The decision becomes a big idea verbatim, so it must clear the concept gate.
  // Authoring-time and runtime rejection have to agree or objects pass one and
  // fail the other.
  const objects = repo.getAll().filter(
    (o) => (o.domain_profile as any)?.kind === "creative_concept_pattern"
  );
  for (const o of objects) {
    const asIdea = { big_idea: o.decision, consumer_insight: "", core_message: "", differentiation: "" } as any;
    const bad = ConceptQualityGate.validate(asIdea).violations.filter((v) => v.kind !== "MISSING_BIG_IDEA");
    assert.deepStrictEqual(
      bad.map((v) => `${v.kind}:${v.evidence}`),
      [],
      `${o.knowledge_id} would produce a contaminated big idea`
    );
  }
});

check("A real brief now produces a big idea from a concept domain", () => {
  const conceptDomains = ["human_tension", "consumer_insight", "campaign_territory", "idea_pattern"];
  for (const brief of [SKINCARE, COFFEE]) {
    const r = asResult(brief);
    assert.ok(r.concept.big_idea, `${brief.brand}: still no big idea`);
    const source = r.concept_trace.concept_sources.find((s) => s.field === "big_idea");
    const domain = String(source?.knowledge_id || "").split(".")[0];
    assert.ok(
      conceptDomains.includes(domain),
      `${brief.brand}: big idea led by "${domain}" rather than a concept domain`
    );
  }
});

check("The reasoning chain records tension, insight, territory and idea", () => {
  // Task 4. Recorded so a weak concept can be traced to the step that failed
  // rather than blamed on synthesis.
  const r = asResult(SKINCARE);
  const chain = r.concept_trace.reasoning_chain;
  assert.ok(chain, "no reasoning chain recorded");
  for (const step of ["human_tension", "consumer_insight", "campaign_territory", "big_idea"] as const) {
    assert.ok(chain![step], `chain is missing ${step}`);
    assert.strictEqual(typeof chain![step].value, "string");
  }
  assert.ok(chain!.human_tension.value, "the chain records no tension");
  assert.ok(chain!.big_idea.source, "the big idea has no recorded source");
  console.log(`      ${chain!.human_tension.source} → ${chain!.big_idea.source}`);
});

check("The human layer is drawn from the pattern, not reverse-engineered", () => {
  // Before Phase 4.0 the insight came from `why_this_works`, which is why it read
  // as a rationale rather than as an observation about a person.
  const r = asResult(SKINCARE);
  const source = r.concept_trace.concept_sources.find((s) => s.field === "consumer_insight");
  // Phase 4.0.1 moved this one step further: the insight is now selected by the
  // chain rather than taken from the lead's own profile, so the derivation label
  // changed from `concept_pattern.consumer_insight` to `chain.consumer_insight`.
  // Both are correct; only the reverse-engineered `why_this_works` is not.
  assert.ok(
    source?.derivation === "chain.consumer_insight" || source?.derivation === "concept_pattern.consumer_insight",
    `insight derived from "${source?.derivation}" rather than from concept material`
  );
});

check("The completeness gate requires all four elements", () => {
  // Task 5, asserted in both directions so the gate is not merely permissive.
  const complete = {
    big_idea: "The step you skip that costs the most",
    audience_tension: "She knows what she should do and has no time in which to do it.",
    consumer_insight: "The competitor is the decision to skip it entirely.",
    emotional_goal: "Relief at permission to do less.",
    differentiation: "The only one that argues for less.",
    core_message: "Less, done properly.",
  } as any;
  assert.strictEqual(ConceptQualityGate.validate(complete, "human_tension", true).valid, true);

  for (const missing of ["audience_tension", "consumer_insight", "emotional_goal", "differentiation"]) {
    const partial = { ...complete, [missing]: "" };
    const v = ConceptQualityGate.validate(partial, "human_tension", true);
    assert.strictEqual(v.valid, false, `a concept with no ${missing} must be rejected`);
    assert.ok(v.violations.some((x) => x.kind === "INCOMPLETE_CONCEPT" && x.field === missing));
  }
  // And the requirement is opt-in, so existing callers are unaffected.
  assert.strictEqual(ConceptQualityGate.validate({ ...complete, emotional_goal: "" } as any, "human_tension").valid, true);
});

check("Concept domains have their own retrieval group", () => {
  // Task 3. Before this they shared `non_visual` with channel and production, and
  // the single quota slot went elsewhere on 26 of 30 briefs.
  assert.strictEqual(retrievalGroup("human_tension"), CONCEPT_GROUP);
  assert.strictEqual(retrievalGroup("campaign_territory"), CONCEPT_GROUP);
  assert.strictEqual(retrievalGroup("strategy"), CONCEPT_GROUP);
  assert.strictEqual(retrievalGroup("layout"), "composition_strategy");
  assert.notStrictEqual(retrievalGroup("channel"), CONCEPT_GROUP);
});

check("Two briefs in different categories get different tensions", () => {
  const a = asResult(SKINCARE);
  const b = asResult(COFFEE);
  assert.notStrictEqual(
    a.concept_trace.reasoning_chain?.human_tension.source,
    b.concept_trace.reasoning_chain?.human_tension.source,
    "a beauty brief and a coffee brief drew the same tension"
  );
});

// ── 9. Concept reasoning chain (Phase 4.0.1) ─────────────────────────────
section("9. Concept reasoning chain");

const FASHION: CampaignBriefInput = {
  brand: "Khô",
  product: "Oversized linen shirting collection",
  audience: "Women 25-35 who buy considered basics",
  objective: "Collection launch",
  channel: "Instagram",
  tone: "Understated, tactile, unbranded",
  industry: "Fashion",
  concept: "Clothes that get better wrong",
  assetTypes: ["poster"],
};

// Task 6 — the three named industries, asserted on the same three properties.
for (const [label, brief] of [["Beauty", SKINCARE], ["Food", COFFEE], ["Fashion", FASHION]] as const) {
  check(`${label}: concept exists, contamination is zero, trace is present`, () => {
    const r = asResult(brief);

    // 1. A concept exists.
    assert.ok(r.concept.big_idea, `${label}: no big idea`);
    assert.ok(r.concept.consumer_insight, `${label}: no consumer insight`);

    // 2. Contamination is zero.
    const v = ConceptQualityGate.validate(r.concept, undefined, true);
    const contamination = v.violations.filter(
      (x) => !["MISSING_BIG_IDEA", "INCOMPLETE_CONCEPT"].includes(x.kind)
    );
    assert.deepStrictEqual(
      contamination.map((x) => `${x.kind}:${x.field}:${x.evidence}`),
      [],
      `${label}: concept contaminated by execution language`
    );

    // 3. A reasoning trace exists, with all four steps sourced.
    const chain = r.concept_trace.reasoning_chain;
    assert.ok(chain, `${label}: no reasoning chain`);
    for (const step of ["human_tension", "consumer_insight", "campaign_territory", "big_idea"] as const) {
      assert.ok(chain![step].value, `${label}: chain step ${step} has no value`);
      assert.ok(chain![step].source, `${label}: chain step ${step} has no source`);
    }
    const sources = new Set(
      [chain!.human_tension.source, chain!.consumer_insight.source, chain!.campaign_territory.source, chain!.big_idea.source]
    );
    console.log(`      ${label.padEnd(8)} ${sources.size} distinct source(s) · ${chain!.big_idea.value.slice(0, 56)}`);
  });
}

check("The chain draws on more than one object", () => {
  // The defect this phase repaired: every step used to derive from a single
  // `pickLead` object, so a four-step trace described a one-step derivation.
  let multi = 0;
  for (const brief of [SKINCARE, COFFEE, FASHION]) {
    const chain = asResult(brief).concept_trace.reasoning_chain!;
    const sources = new Set(
      [chain.human_tension.source, chain.consumer_insight.source, chain.campaign_territory.source, chain.big_idea.source].filter(Boolean)
    );
    if (sources.size >= 2) multi++;
  }
  assert.strictEqual(multi, 3, "at least one brief still derives its whole chain from one object");
});

check("Concept relevance scores on five independent signals", () => {
  // Task 3. Asserted per signal rather than on the composite, because a composite
  // can look healthy while one signal is dead — which is how a scorer starts
  // ranking on noise without anyone noticing.
  const repoObjects = repo.getAll().filter((o) => String(o.domain) === "human_tension");
  assert.ok(repoObjects.length > 0, "no tension objects to score");
  const query = { industry: "beauty", audience: "women_35_50", brand_position: "premium" };
  const scored = repoObjects.map((o) =>
    ConceptRetrievalScorer.score(o, query as any, "She is afraid of no longer recognising herself, premium clinical skincare")
  );
  for (const key of ["human_problem", "audience", "brand_position", "industry", "emotional"] as const) {
    assert.ok(
      scored.some((s) => s.signals[key] > 0),
      `signal "${key}" never fired across ${scored.length} objects`
    );
  }
  const best = scored.sort((a, b) => b.total - a.total)[0];
  assert.ok(best.total > 0, "no object scored above zero");
  assert.ok(best.matched.length > 0, "the winner matched no named signal");
});

check("An industry-matched object outranks a universal one", () => {
  const beauty = repo.getAll().find(
    (o) => String(o.domain) === "human_tension" && String(o.context?.industry) === "beauty"
  );
  const universal = repo.getAll().find(
    (o) => String(o.domain) === "human_tension" && String(o.context?.industry) === "*"
  );
  if (!beauty || !universal) {
    console.log("      (no comparable pair in the corpus; skipped)");
    return;
  }
  const q = { industry: "beauty" } as any;
  const a = ConceptRetrievalScorer.score(beauty, q, "beauty brief");
  const b = ConceptRetrievalScorer.score(universal, q, "beauty brief");
  assert.ok(a.signals.industry > b.signals.industry, "industry signal did not discriminate");
});

check("The conflict resolver settles close candidates by priority, not rounding", () => {
  // Task 5. Two candidates within the contention threshold must be decided by a
  // named criterion; picking on a fourth decimal place makes the campaign's
  // central thought an artefact of arithmetic.
  const tensions = repo.getAll().filter((o) => String(o.domain) === "human_tension").slice(0, 6);
  const candidates = tensions.map((o) => ({ object: o, context_relevance: 1, score: 0.5, matches: [] })) as any[];
  const query = { industry: "beauty", audience: "women_35_50", brand_position: "premium" } as any;
  const ranked = ConceptRetrievalScorer.rank(candidates, query, "premium clinical skincare for women who distrust claims");
  const { winner, resolution } = ConceptConflictResolver.resolve("big_idea", ranked, query);
  assert.ok(winner, "no winner selected");
  if (resolution) {
    assert.ok(
      ["AUDIENCE_TRUTH", "BRAND_POSITIONING", "DIFFERENTIATION", "EMOTIONAL_STRENGTH"].includes(resolution.decided_by),
      `unknown priority level ${resolution.decided_by}`
    );
    assert.ok(resolution.rationale.length > 20, "a resolution must explain itself");
    assert.notStrictEqual(resolution.winner, resolution.loser);
    console.log(`      settled by ${resolution.decided_by}`);
  } else {
    console.log("      leader won outright; no conflict to settle");
  }
});

check("The generator can only emit the five permitted fields", () => {
  // Task 4, asserted structurally. Execution fields are absent by construction
  // rather than by validation — a generator with nowhere to put a camera
  // instruction cannot leak one, which is what the Phase 3.1.8.1 contamination
  // proved a gate alone does not guarantee.
  const query = { industry: "beauty" } as any;
  const candidates = repo
    .getAll()
    .filter((o) => CONCEPT_LEAD_DOMAINS.has(String(o.domain)))
    .slice(0, 12)
    .map((o) => ({ object: o, context_relevance: 1, score: 0.5, matches: [] })) as any[];
  const out = CreativeConceptGenerator.generate(candidates, query, "premium skincare, clinical, sceptical audience");
  assert.deepStrictEqual(
    Object.keys(out.concept).sort(),
    ["belief_shift", "big_idea", "campaign_territory", "consumer_insight", "emotional_trigger"]
  );
  for (const forbidden of CONCEPT_FORBIDDEN_FIELDS) {
    assert.ok(!(forbidden in out.concept), `the generator emitted a "${forbidden}" field`);
  }
  // And nothing it emits may read as an instruction.
  const asConcept = {
    big_idea: out.concept.big_idea,
    consumer_insight: out.concept.consumer_insight,
    core_message: "",
    differentiation: "",
  } as any;
  const bad = ConceptQualityGate.validate(asConcept).violations.filter((x) => x.kind !== "MISSING_BIG_IDEA");
  assert.deepStrictEqual(bad.map((x) => x.kind), [], "generator output carries execution language");
});

check("Art direction candidates cannot reach the generator's output", () => {
  // The candidate set is filtered before selection rather than after, so a layout
  // object in the pool cannot become a big idea even by accident.
  const layoutObjects = repo
    .getAll()
    .filter((o) => String(o.domain) === "layout")
    .slice(0, 8)
    .map((o) => ({ object: o, context_relevance: 1, score: 0.9, matches: [] })) as any[];
  const out = CreativeConceptGenerator.generate(layoutObjects, { industry: "beauty" } as any, "a beauty brief");
  assert.strictEqual(out.complete, false, "a layout-only pool must not produce a complete concept");
  assert.strictEqual(out.concept.big_idea, "", "a layout object became a big idea");
  assert.ok(out.trace.warnings.some((w) => w.startsWith("NO_CONCEPT_MATERIAL")));
});

console.log("\n" + "=".repeat(72));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(72));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
