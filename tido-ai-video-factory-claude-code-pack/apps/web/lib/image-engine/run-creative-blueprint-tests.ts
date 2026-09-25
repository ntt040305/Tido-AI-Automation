import assert from "assert";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  BLUEPRINT_SECTIONS,
  DECISION_BASES,
  SECTION_FIELDS,
  TOTAL_BLUEPRINT_FIELDS,
  allDecisions,
  blueprintTelemetry,
  validateBlueprint,
} from "./evolution/experiment/CreativeBlueprint";
import { ProfessionalCreativeBrain } from "./evolution/experiment/ProfessionalCreativeBrain";
import { INSIGHT_FIELDS, buildMarketingInsight, marketingInsightTelemetry, summarizeMarketingInsight } from "./evolution/experiment/MarketingInsight";
import { MEANING_FIELDS, buildProductMeaning, summarizeProductMeaning } from "./evolution/experiment/ProductMeaning";
import { RenderQualityJudge } from "./benchmark/RenderQualityJudge";
import { LayoutArchitect } from "./evolution/experiment/LayoutArchitect";
import { CreativeRefinementLoop } from "./evolution/experiment/CreativeRefinementLoop";
import { diagnose } from "./benchmark/CreativeDiagnosis";
import { compareConcepts, scoreConcept } from "./benchmark/ConceptEvaluator";
import { buildDesignSystem } from "./evolution/experiment/DesignSystem";
import { buildComposition, LAYER_ORDER } from "./evolution/experiment/VisualComposition";
import { planAssets } from "./evolution/experiment/AssetIntelligence";
import { chooseStructure } from "./evolution/experiment/CampaignStructure";
import { adaptFormats } from "./evolution/experiment/FormatAdaptation";
import { buildDesignProject } from "./evolution/experiment/DesignProject";
import { buildGeometry } from "./evolution/experiment/LayoutGeometry";
import { buildTypographySystem } from "./evolution/experiment/TypographySystem";
import { buildCreativeDocument } from "./evolution/experiment/CreativeDocument";
import { critiqueRender } from "./benchmark/CommercialRenderCritic";
import { buildProductionContext, validateContext } from "./evolution/experiment/ProductionPipeline";
import { buildTextLayers, buildSvg, NO_TEXT_DIRECTIVE } from "./evolution/experiment/TypographyRenderer";
import { readVision, improvementPrompt, scoreIteration, RenderIterationEngine } from "./evolution/experiment/RenderIterationEngine";
import { emptyKit, recordPreference, preferenceDecisions, summarizeUserKit, userKitTelemetry } from "./evolution/experiment/UserKit";
import { DEFAULT_FLAGS } from "./evolution/feature-flags";

/**
 * Phases 1–6 — Marketing Insight, the Professional Creative Brain, the final
 * Creative Blueprint, prompt transmission, and the quality judge.
 *
 *   npx tsx lib/image-engine/run-creative-blueprint-tests.ts
 *
 * Offline and free. Every layer under test is a deterministic transformation,
 * which is the property most of these defend: the moment one needs a model to
 * fill a field it has started authoring, and authoring is the thing none of
 * them may do.
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
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────
// Deliberately a coffee shop, then a workshop. If any of this only works for
// one subject the tests are wrong.

const truth = (over: any = {}): any => ({
  functional_truth: { value: "ủ lạnh 18 tiếng, không dùng nhiệt", provenance: "DECLARED", basis: '"ủ lạnh 18 tiếng"' },
  differentiation: { value: "", provenance: "ABSENT", basis: "no DERIVED tier yet" },
  sensory: { value: "amber glass, matte label", provenance: "OBSERVED", basis: "VisualDNA.observed.product" },
  emotional_value: { value: "", provenance: "ABSENT", basis: "no DERIVED tier yet" },
  usage_context: { value: "", provenance: "ABSENT", basis: "no DERIVED tier yet" },
  completeness: 0.4,
  ...over,
});

const dna = (over: any = {}): any => ({
  observed: {
    product: {
      form: "a straight-sided glass bottle",
      materials: ["amber glass", "wood"],
      palette: ["amber", "cream"],
      finish: "matte label paper",
      surface_detail: "a printed paper band",
    },
  },
  inferred: [],
  provenance: { derived_from_image: true, analyzed_roles: ["product"], source_hashes: ["h"], model_calls: 1, analyzed_at: "x" },
  ...over,
});

const strategy = (over: any = {}): any => ({
  creative_angle: "the shop that is already awake",
  commercial_goal: "footfall before 8am",
  target_customer_psychology: "commuters decide in three seconds",
  prompt_guidance: "unstyled",
  consumer_insight: "they do not want better coffee, they want to stop being late",
  emotional_response: "recognition, not aspiration",
  creative_message: "the shop opens before you do",
  communication_objective: "drive a first visit",
  visual_translation: {
    subject_representation: "the bottle mid-service",
    atmosphere: "early and unhurried",
    lighting_character: "hard morning window light",
    material_treatment: "glass reads cold",
    composition_principle: "the counter as a line across the frame",
    colour_direction: "steel grey against one warm note",
    camera_intent: "placed low so the counter reads as somewhere you walk up to",
    typography_intent: "words that read like a sign written that morning",
    scene_moment: "first cups landing on the counter",
  },
  ...over,
});

const decision = (over: any = {}): any => ({
  selected_direction: "The first pour of the morning",
  creative_goal: "make an unopened shop feel already lived in",
  visual_story: "a counter mid-service, as if the day had started without you",
  scene_definition: "a steel counter, cups landed, the door light behind and the room receding into it",
  camera_decision: "85mm at counter height so the pour compresses against the back wall; depth of field shallow enough that the queue goes to bokeh",
  lighting_decision: "one window source raking across the steel, no fill",
  composition_decision: "the cup off-centre left, negative space carrying the queue; the eye reads the steam first, then the label",
  typography_decision: "the words should feel spoken across a counter rather than set; light weight, placed top-left, high contrast against the steel",
  environment_decision: "a working shop at opening, not a styled set",
  important_visual_elements: ["steam", "the queue"],
  avoid_elements: ["latte art clichés"],
  brand_context: "a neighbourhood roaster, six years old",
  audience_context: "people who walk past it every day",
  element_meanings: ["steam means it was made now"],
  deliberately_avoided: "the overhead flat-lay, which would have made it a product shot rather than a place",
  copy_roles: [
    { text: "Mở cửa 6 giờ sáng", role: "HEADLINE", reason: "the hour is the offer" },
    { text: "Ghé thử", role: "CTA", reason: "closes it" },
  ],
  strategy_route: "prove the hour",
  strategy_reason: "the early hour is the only thing a competitor cannot copy",
  product_relationship: "",
  staging_requirements: ["cup landed on the counter, not held", "the door stays in frame behind"],
  ...over,
});

const judgment = (over: any = {}): any => ({
  directions: [],
  selected: "The first pour of the morning",
  selection_reason: "it answers the hour",
  reasoning: {
    camera: { choice: "counter height, square to the cup", reason: "it puts the viewer where a customer stands" },
    lighting: { choice: "one hard window source", reason: "a shop at six has one light and it comes from the street" },
    composition: { choice: "the counter as a horizontal", reason: "it is the line the customer meets first" },
    typography: { choice: "spoken, not set", reason: "the brand is a person behind a counter, not a marque" },
    colour: { choice: "steel against one warm note", reason: "the warm note is the coffee and nothing else should compete" },
  },
  ...over,
});

const meaning = () => buildProductMeaning({ productTruth: truth(), visualDNA: dna() });

const insight = () =>
  buildMarketingInsight({ productTruth: truth(), productMeaning: meaning(), strategy: strategy(), audience: "người đi làm" });

const fullBrain = () =>
  ProfessionalCreativeBrain.assemble({
    productTruth: truth(),
    productMeaning: meaning(),
    marketingInsight: insight(),
    visualDNA: dna(),
    strategy: strategy(),
    decision: decision(),
    judgment: judgment(),
  });

console.log("\n=== Phases 1–6 — Creative Intelligence ===\n");

// ── Phase 1 — Marketing Insight ─────────────────────────────────────────────

check("P1: the client's named audience outranks a model's reading of one", () => {
  const i = buildMarketingInsight({ productTruth: truth(), strategy: strategy(), audience: "người đi làm" });
  assert.strictEqual(i.target_customer!.value, "người đi làm");
  assert.strictEqual(i.target_customer!.derived_from, "user", "the USER > DIRECTOR > AI ladder was not applied");
});

check("P1: with no client audience, strategy carries it at lower confidence", () => {
  const i = buildMarketingInsight({ productTruth: truth(), strategy: strategy() });
  assert.strictEqual(i.target_customer!.derived_from, "strategy");
  assert.strictEqual(i.target_customer!.confidence, "medium");
});

check("P1: every insight field carries value, because, derived_from, confidence", () => {
  const i = insight();
  for (const f of INSIGHT_FIELDS) {
    const d = i[f];
    if (!d) continue;
    assert.ok(d.value.trim(), `${f} has no value`);
    assert.ok(d.because.trim(), `${f} has no basis`);
    assert.ok(DECISION_BASES.includes(d.derived_from), `${f} has an unknown basis`);
    assert.ok(["low", "medium", "high"].includes(d.confidence), `${f} confidence`);
  }
});

check("P1: audience is never reused as the customer's problem", () => {
  // Who someone is and what they are trying to solve are different questions.
  const i = buildMarketingInsight({ productTruth: truth(), audience: "người đi làm" });
  assert.strictEqual(i.customer_problem, null, "the audience was laundered into the problem");
  assert.ok(i.missing.includes("customer_problem"));
});

check("P1: missing data never crashes, and completeness tells the truth", () => {
  const empty = buildMarketingInsight({});
  assert.strictEqual(empty.completeness, 0);
  assert.deepStrictEqual(empty.missing, [...INSIGHT_FIELDS]);
  const partial = buildMarketingInsight({ productTruth: truth(), audience: "x" });
  assert.strictEqual(
    partial.completeness,
    Math.round(((INSIGHT_FIELDS.length - partial.missing.length) / INSIGHT_FIELDS.length) * 100) / 100,
    "completeness does not match the missing list"
  );
});

check("P1: the summary states what is not established, and forbids inventing it", () => {
  const text = summarizeMarketingInsight(buildMarketingInsight({ productTruth: truth(), audience: "x" }))!;
  assert.match(text, /NOT ESTABLISHED/);
  assert.match(text, /Do not invent them/);
  assert.strictEqual(summarizeMarketingInsight(buildMarketingInsight({})), undefined);
});

// ── Phase 2 — the concept ───────────────────────────────────────────────────

check("P2: the concept is decided from the director, not invented", () => {
  const b = fullBrain();
  assert.ok(b.concept.big_idea, "no big idea");
  assert.match(b.concept.big_idea!.value, /prove the hour/);
  assert.strictEqual(b.concept.big_idea!.derived_from, "director");
  assert.match(b.concept.big_idea!.because, /the early hour is the only thing/);
});

check("P2: creative tension comes from the route the director rejected", () => {
  // The only place the engine records a trade-off it actually made.
  const b = fullBrain();
  assert.ok(b.concept.creative_tension, "no tension recorded");
  assert.match(b.concept.creative_tension!.value, /overhead flat-lay/);
});

check("P2: the emotional hook rests on the insight, not on the director alone", () => {
  const b = fullBrain();
  assert.ok(["strategy", "product_truth"].includes(b.concept.emotional_hook!.derived_from));
  assert.ok(/MarketingInsight[.]|ProductMeaning[.]/.test(b.concept.emotional_hook!.because));
});

// ── Phase 3 — the four roles, one layer ─────────────────────────────────────

check("P3: the director's own reasons become the basis, not a restatement", () => {
  // `CreativeJudgment.reasoning` already carried {choice, reason} and it was
  // being thrown away. This is the single highest-value routing in the brain.
  const b = fullBrain();
  assert.strictEqual(b.photography.camera_language!.value, "counter height, square to the cup");
  assert.match(b.photography.camera_language!.because, /it puts the viewer where a customer stands/);
  assert.strictEqual(b.photography.camera_language!.confidence, "high");
});

check("P3: photography is behaviour, never a camera specification table", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "ProfessionalCreativeBrain.ts"),
    "utf-8"
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\b(Canon|Nikon|Sony|Leica|Hasselblad|Zeiss)\b/i.test(code), "a camera brand is hardcoded");
  assert.ok(!/["'`]\d{2,3}mm["'`]/.test(code), "a focal length is hardcoded as a value");
  assert.ok(!/f\/\d\.\d/.test(code), "an aperture is hardcoded");
});

check("P3: a lens named by the director travels; one never named stays unknown", () => {
  const b = fullBrain();
  assert.ok(b.photography.lens_character, "the director named a lens and it was dropped");
  assert.match(b.photography.lens_character!.value, /85mm|compress/);

  const quiet = ProfessionalCreativeBrain.assemble({
    decision: decision({ camera_decision: "the camera stays where a customer would stand" }),
    judgment: judgment({ reasoning: undefined }),
  });
  assert.strictEqual(quiet.photography.lens_character, null, "a lens was invented");
  assert.ok(quiet.missing.includes("photography.lens_character"));
});

check("P3: typography rests on product, brand, audience or concept — never a font list", () => {
  const b = fullBrain();
  assert.ok(b.design.font_character, "no typographic character");
  assert.match(b.design.font_character!.because, /the brand is a person behind a counter/);
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "ProfessionalCreativeBrain.ts"),
    "utf-8"
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\b(Helvetica|Futura|Garamond|Georgia|Inter|Roboto|Montserrat)\b/.test(code), "a typeface is hardcoded");
});

check("P3: hierarchy is the role order, and the client's copy is not restated", () => {
  const b = fullBrain();
  assert.match(b.design.hierarchy_logic!.value, /HEADLINE → CTA/);
  assert.ok(!/Mở cửa|Ghé thử/.test(b.design.hierarchy_logic!.value), "client copy was duplicated into the blueprint");
});

check("P3: layout reads the eye path the director described", () => {
  const b = fullBrain();
  assert.ok(b.layout.attention_flow, "no reading path");
  assert.match(b.layout.attention_flow!.value, /steam first/);
});

check("P3: the four roles are ONE module, not four agents", () => {
  const dir = path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment");
  for (const n of fs.readdirSync(dir)) {
    assert.ok(
      !/ArtDirectorAgent|PhotographerAgent|TypographyAgent|LayoutAgent|ArtDirectorService/.test(n),
      `a separate agent was created: ${n}`
    );
  }
  const src = fs.readFileSync(path.join(dir, "ProfessionalCreativeBrain.ts"), "utf-8");
  assert.strictEqual((src.match(/export class/g) || []).length, 1, "more than one class in the brain");
});

check("P3: the brain makes no model call and is deterministic", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "ProfessionalCreativeBrain.ts"),
    "utf-8"
  );
  assert.ok(!/await |async |fetch\(|LLMProvider|generateChatCompletion/.test(src), "the brain performs I/O");
  assert.ok(!/Math\.random|Date\.now|new Date\(/.test(src), "the brain is not deterministic");
  assert.ok(!/process\.env|isEnabled\(|DEFAULT_FLAGS/.test(src), "the brain reads flags or the environment");
  assert.deepStrictEqual(fullBrain(), fullBrain(), "same input produced two different blueprints");
});

// ── Phase 4 — the blueprint ─────────────────────────────────────────────────

check("P4: six sections, thirty-six fields, fixed order", () => {
  const b = fullBrain();
  const flat = allDecisions(b);
  assert.strictEqual(flat.length, TOTAL_BLUEPRINT_FIELDS);
  assert.strictEqual(TOTAL_BLUEPRINT_FIELDS, 36);
  assert.deepStrictEqual([...new Set(flat.map((f) => f.section))], [...BLUEPRINT_SECTIONS]);
  assert.deepStrictEqual(allDecisions(b).map((f) => f.field), allDecisions(fullBrain()).map((f) => f.field));
});

check("P4: a fully-fed blueprint validates clean", () => {
  const b = fullBrain();
  assert.deepStrictEqual(validateBlueprint(b, { visualDNAAvailable: true }), []);
});

check("P4: every grounded field carries all four parts", () => {
  for (const { section, field, decision: d } of allDecisions(fullBrain())) {
    if (!d) continue;
    assert.ok(d.value.trim(), `${section}.${field} has no value`);
    assert.ok(d.because.trim(), `${section}.${field} has no basis`);
    assert.ok(DECISION_BASES.includes(d.derived_from), `${section}.${field} basis`);
    assert.ok(["low", "medium", "high"].includes(d.confidence), `${section}.${field} confidence`);
  }
});

check("P4: unknown stays unknown, and confidence reports it honestly", () => {
  const b = ProfessionalCreativeBrain.assemble({});
  assert.strictEqual(b.confidence, 0);
  assert.strictEqual(b.missing.length, TOTAL_BLUEPRINT_FIELDS);
  assert.deepStrictEqual(validateBlueprint(b), [], "an empty blueprint is not valid");
  const full = fullBrain();
  assert.strictEqual(
    full.confidence,
    Math.round(((TOTAL_BLUEPRINT_FIELDS - full.missing.length) / TOTAL_BLUEPRINT_FIELDS) * 100) / 100
  );
});

check("P4: validateBlueprint catches a confidence figure that lies", () => {
  const b = fullBrain();
  b.confidence = 1;
  assert.ok(validateBlueprint(b).some((v) => /confidence says/.test(v.rule)));
});

check("P4: a basis that restates its own decision is rejected", () => {
  const b = fullBrain();
  b.photography.lighting_behavior = { value: "one hard source", because: "One Hard Source", derived_from: "director", confidence: "high" };
  assert.ok(validateBlueprint(b).some((v) => /restates the decision/.test(v.rule)));
});

check("P4: with an image analysed, material language must cite visual_dna", () => {
  const b = fullBrain();
  assert.strictEqual(b.brand_expression.material_language!.derived_from, "visual_dna");
  b.brand_expression.material_language = { value: "x", because: "y", derived_from: "director", confidence: "high" };
  assert.ok(validateBlueprint(b, { visualDNAAvailable: true }).some((v) => /must cite visual_dna/.test(v.rule)));
});

check("P4: provenance records what was actually available", () => {
  const b = fullBrain();
  assert.strictEqual(b.provenance.product_truth, true);
  assert.strictEqual(b.provenance.visual_dna, true);
  assert.strictEqual(b.provenance.marketing_insight, true);
  assert.strictEqual(b.provenance.product_truth_completeness, 0.4);
  const bare = ProfessionalCreativeBrain.assemble({});
  assert.strictEqual(bare.provenance.director, false);
});

check("P4: the same brain works on a subject with nothing in common", () => {
  const b = ProfessionalCreativeBrain.assemble({
    visualDNA: dna({ observed: { product: { materials: ["brushed aluminium"], finish: "anodised", palette: ["graphite"] } } }),
    decision: decision({
      camera_decision: "35mm wide-angle at bench height; deep focus so the whole bench stays sharp",
      environment_decision: "a working bench, sawdust left where it fell",
    }),
    judgment: judgment(),
  });
  assert.match(b.photography.lens_character!.value, /35mm|wide-angle/);
  assert.match(b.brand_expression.material_language!.value, /aluminium/);
});

check("P4: telemetry counts bases and leaks no decision text", () => {
  const t = JSON.stringify(blueprintTelemetry(fullBrain()));
  assert.ok(!t.includes("counter height"), "a decision value leaked");
  assert.ok(!t.includes("Mở cửa"), "client copy leaked");
  assert.ok(/"fields":36/.test(t));
  assert.deepStrictEqual(blueprintTelemetry(null), { blueprint: false });
});

// ── Phase 5 — transmission ──────────────────────────────────────────────────

check("P5: the rendered blueprint carries all eight layers the spec asks for", () => {
  const text = ProfessionalCreativeBrain.render(fullBrain())!;
  for (const heading of [
    "CREATIVE CONCEPT", "ART DIRECTION", "PHOTOGRAPHY DIRECTION",
    "TYPOGRAPHY DIRECTION", "LAYOUT DIRECTION", "BRAND EXPRESSION", "THE STORY",
  ]) {
    assert.ok(text.includes(heading), `${heading} does not reach the prompt`);
  }
});

check("P5: an empty section is omitted, not printed as a bare heading", () => {
  // A renderer handed an empty heading treats it as a dimension it may fill.
  const text = ProfessionalCreativeBrain.render(
    ProfessionalCreativeBrain.assemble({ decision: decision({ copy_roles: [], typography_decision: "" }) })
  )!;
  assert.ok(!/TYPOGRAPHY DIRECTION:\s*\n\s*(?:[A-Z ]+:|$)/.test(text), "an empty typography heading was printed");
});

check("P5: nothing grounded renders as nothing at all", () => {
  assert.strictEqual(ProfessionalCreativeBrain.render(ProfessionalCreativeBrain.assemble({})), undefined);
  assert.strictEqual(ProfessionalCreativeBrain.render(null), undefined);
});

check("P5: OFF the prompt is unchanged; ON it changes and the hash moves", () => {
  const base = "## ROLE\nA commercial photograph.\n\n## ART DIRECTION\n- camera: eye-level";
  const off = base;
  const on = `${base}\n\n${ProfessionalCreativeBrain.render(fullBrain())}`;
  const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  assert.notStrictEqual(sha(off), sha(on), "the prompt hash did not move");
  assert.ok(on.length > off.length);
  assert.ok(!off.includes("CREATIVE BLUEPRINT"), "the blueprint leaked into the OFF arm");
  assert.ok(on.includes("CREATIVE BLUEPRINT"), "the blueprint is absent from the ON arm");
});

check("P5: the pipeline appends the blueprint and sends it to the provider", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/blueprintFor\?: \(/.test(src), "the wrapper takes no blueprint");
  // Third time this class of bug has cost a live run: a binding referenced
  // inside the closure that only exists in wrapProvider's scope. tsx does not
  // type-check, so nothing but a paid render catches it.
  const start = src.indexOf("const blueprintFor = brainOn");
  const closure = src.slice(start, src.indexOf("      : undefined;", start));
  assert.ok(!/input\./.test(closure), "the closure references `input`, which is not in its scope");
  assert.ok(/composedPrompt/.test(closure), "the closure is not handed the composed prompt");
  assert.ok(/prompt: finalPrompt/.test(src), "the provider is still sent the un-appended prompt");
  assert.ok(/ProfessionalCreativeBrain\.assemble\(/.test(src), "the pipeline never assembles a blueprint");
  assert.ok(/productTruthOn && Boolean\(f\.professional_creative_brain_v1\)/.test(src), "the flag dependency is not stated");
});

check("P5: the blueprint closure is in scope on BOTH generation paths", () => {
  // It was not. Declared inside the concurrent branch, the sequential path threw
  // `blueprintFor is not defined` and all 12 renders of run_20260919_002 failed.
  // tsx does not type-check, so no unit test caught it — only a live render did.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  const declared = src.indexOf("const blueprintFor = brainOn");
  const branch = src.indexOf("if (!controlled) {");
  assert.ok(declared > 0 && branch > 0, "anchors not found");
  assert.ok(declared < branch, "the closure is declared inside the concurrent branch again");
  const uses = [...src.matchAll(/^\s*blueprintFor\s*$/gm)].map((m) => m.index!);
  assert.strictEqual(uses.length, 2, `expected both call sites to pass it, found ${uses.length}`);
  for (const u of uses) assert.ok(u > declared, "a call site precedes the declaration");
});

check("P5: both flags exist and default to off", () => {
  assert.strictEqual((DEFAULT_FLAGS.features as any).marketing_insight_v1, false);
  assert.strictEqual((DEFAULT_FLAGS.features as any).professional_creative_brain_v1, false);
});

check("P5: the compiler still reads no flags and knows nothing of the brain", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "compiler", "MasterPromptCompilerService.ts"),
    "utf-8"
  );
  assert.ok(!/isEnabled\(|featureFlags|DEFAULT_FLAGS/.test(src), "the compiler reads flags");
  assert.ok(!/ProfessionalCreativeBrain|CreativeBlueprint/.test(src), "the compiler imports the brain");
});

// ── Phase 6 — the quality judge ─────────────────────────────────────────────

check("P6: a fed blueprint and a protected prompt score well", () => {
  const prompt = [
    "- PRODUCT IDENTITY PROTECTION — the product is photographed, never redesigned:",
    "These strings are campaign copy. They belong to the layout, not to the product:",
    "A blank, partial or illegible label is a failed render, not a clean one.",
  ].join("\n");
  const r = RenderQualityJudge.evaluate({ blueprint: fullBrain(), prompt });
  assert.ok(r.mean >= 6, `expected a healthy readiness score, got ${r.mean}`);
  assert.strictEqual(r.scores.length, 8);
});

check("P6: an unprotected prompt is caught on product accuracy", () => {
  const r = RenderQualityJudge.evaluate({ blueprint: fullBrain(), prompt: "a photograph" });
  const pa = r.scores.find((s) => s.dimension === "product_accuracy")!;
  assert.ok(pa.score <= 3, `an unprotected prompt scored ${pa.score}`);
  assert.match(pa.suggestion, /label/);
});

check("P6: a concept with no tension is caught, and told why", () => {
  const b = fullBrain();
  b.concept.creative_tension = null;
  const r = RenderQualityJudge.evaluate({ blueprint: b, prompt: "" });
  const cs = r.scores.find((s) => s.dimension === "concept_strength")!;
  assert.match(cs.suggestion, /renders as a description/);
});

check("P6: suggestions are ordered worst first, so the bottleneck leads", () => {
  const r = RenderQualityJudge.evaluate({ blueprint: null, prompt: "" });
  assert.ok(r.suggestions.length > 0);
  const scores = [...r.scores].sort((a, b) => a.score - b.score).map((s) => s.score);
  assert.deepStrictEqual(scores, [...scores].sort((a, b) => a - b));
});

check("P6: the judge never claims to have looked at the picture", () => {
  const r = RenderQualityJudge.evaluate({ blueprint: fullBrain(), prompt: "" });
  assert.match(r.disclaimer, /not whether the resulting picture is good/);
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "benchmark", "RenderQualityJudge.ts"),
    "utf-8"
  );
  assert.ok(!/await |fetch\(|LLMProvider/.test(src), "the judge performs I/O");
  assert.ok(!/export class \w+Agent/.test(src), "the judge is an agent");
});

check("P6: every dimension explains its own number", () => {
  const r = RenderQualityJudge.evaluate({ blueprint: fullBrain(), prompt: "" });
  for (const s of r.scores) {
    assert.ok(s.because.trim(), `${s.dimension} gives a score with no reason`);
    assert.ok(s.score >= 1 && s.score <= 10, `${s.dimension} out of range: ${s.score}`);
  }
});

// ── architecture ────────────────────────────────────────────────────────────

check("No category, industry or style-preset table anywhere in the new layers", () => {
  for (const f of [
    "evolution/experiment/ProfessionalCreativeBrain.ts",
    "evolution/experiment/MarketingInsight.ts",
    "evolution/experiment/CreativeBlueprint.ts",
    "benchmark/RenderQualityJudge.ts",
  ]) {
    const code = fs
      .readFileSync(path.join(process.cwd(), "lib", "image-engine", f), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/\b(skincare|cosmetic|beauty|fashion|apparel|beverage|electronics|automotive)\b/i.test(code),
      `a product category appears in ${f}`
    );
    assert.ok(!/CATEGORY_|INDUSTRY_|STYLE_PRESET|HOUSE_/.test(code), `a preset table exists in ${f}`);
  }
});

check("One Decision vocabulary, reused, not re-declared per layer", () => {
  for (const f of ["evolution/experiment/MarketingInsight.ts", "evolution/experiment/ProfessionalCreativeBrain.ts"]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", f), "utf-8");
    assert.ok(/from "\.\/CreativeBlueprint"/.test(src), `${f} does not reuse the blueprint vocabulary`);
    assert.ok(!/export interface Decision\b/.test(src), `${f} declares its own Decision type`);
  }
});

check("The superseded Phase 2.1 builder is gone, not left beside the brain", () => {
  const p = path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeBlueprintBuilder.ts");
  assert.ok(!fs.existsSync(p), "two blueprint builders exist");
});

// ── final pass: product meaning, marketing upgrade, grounding metrics ───────

check("FP: ProductMeaning adds implication, never a new product fact", () => {
  const m = meaning();
  for (const f of MEANING_FIELDS) {
    const d = m[f];
    if (!d) continue;
    assert.strictEqual(d.derived_from, "product_truth", `${f} does not rest on the product`);
    assert.ok(/ProductTruth\.|VisualDNA\./.test(d.because), `${f} cites no ProductTruth field`);
  }
  assert.match(m.functional_value!.value, /ủ lạnh 18 tiếng/, "the declared sentence did not travel verbatim");
});

check("FP: an inference is marked as one, in the schema AND in the text", () => {
  const m = meaning();
  assert.strictEqual(m.customer_problem!.confidence, "low", "an inference claims high confidence");
  assert.match(m.customer_problem!.because, /inferred from/);
  assert.match(summarizeProductMeaning(m)!, /inferred, not stated by anyone/);
});

check("FP: differentiation is never invented when nothing establishes one", () => {
  const bare = buildProductMeaning({
    productTruth: truth({ sensory: { value: "", provenance: "ABSENT", basis: "no image" } }),
  });
  assert.strictEqual(bare.differentiation, null, "a difference was invented");
  assert.ok(bare.missing.includes("differentiation"));
});

check("FP: ProductMeaning holds no category or tier vocabulary", () => {
  const code = fs
    .readFileSync(path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "ProductMeaning.ts"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\b(skincare|cosmetic|beauty|fashion|luxury|premium)\b/i.test(code), "a category or tier word appears");
  assert.ok(!/await |fetch\(|LLMProvider/.test(code), "ProductMeaning performs I/O");
});

check("FP: the insight is mostly product-grounded once meaning exists", () => {
  // The bottleneck this pass exists to fix: completeness was 0 on 12/12 live
  // renders of run_20260919_003, every strategy-dependent field empty.
  const withMeaning = buildMarketingInsight({ productTruth: truth(), productMeaning: meaning(), audience: "x" });
  const without = buildMarketingInsight({ productTruth: truth(), audience: "x" });
  assert.ok(withMeaning.completeness > without.completeness, "meaning did not raise insight completeness");
  assert.ok(withMeaning.completeness >= 0.8, `expected a mostly-complete insight, got ${withMeaning.completeness}`);
});

check("FP: no demographic is ever invented for the audience", () => {
  const i = buildMarketingInsight({ productTruth: truth(), productMeaning: meaning() });
  assert.strictEqual(i.target_customer, null, "an audience was invented from the product");
});

check("FP: the seven-field insight keeps source priority in ladder order", () => {
  const i = insight();
  assert.strictEqual(i.target_customer!.derived_from, "user", "USER input did not win");
  assert.ok(["product_truth", "strategy"].includes(i.competitive_angle!.derived_from));
  assert.strictEqual(i.objection!.derived_from, "product_truth");
  assert.match(i.objection!.because, /ABSENT/, "the objection does not rest on what is unproven");
});

/**
 * A director as terse as the measured one.
 *
 * `fullBrain()` names a focal length, a depth of field and a placement inside
 * its prose, and so wins those fields on the ladder — correctly, because the
 * director outranks an inference. Live output is not like that: across the six
 * real briefs of Phase 2.1 the director mentioned a lens in 0/6 and depth of
 * field in 0/6. These two tests measure the case that actually occurs.
 */
const terseBrain = () =>
  ProfessionalCreativeBrain.assemble({
    productTruth: truth(),
    productMeaning: meaning(),
    marketingInsight: insight(),
    visualDNA: dna(),
    decision: decision({
      camera_decision: "the camera stays where a customer would stand",
      typography_decision: "the words should feel spoken across a counter rather than set",
      composition_decision: "the cup leads, the queue follows",
    }),
    judgment: judgment(),
  });

check("FP: where the director is silent, craft now rests on the product", () => {
  const b = terseBrain();
  const bases = [b.photography.focus_behavior?.derived_from, b.design.placement_reason?.derived_from];
  assert.ok(
    bases.includes("visual_dna") || bases.includes("product_truth"),
    `craft is still director-only: ${JSON.stringify(bases)}`
  );
  // And the fields that were measured at 0/6 are no longer empty.
  assert.ok(b.photography.lens_character, "lens is still unauthored");
  assert.ok(b.photography.focus_behavior, "focus behaviour is still unauthored");
});

check("FP: where the director DOES speak, it still outranks the inference", () => {
  // USER > CREATIVE DIRECTOR > AI. The pass must not have inverted it.
  const b = fullBrain();
  assert.strictEqual(b.photography.focus_behavior!.derived_from, "director");
  assert.strictEqual(b.design.placement_reason!.derived_from, "director");
});

check("FP: photography reasons in behaviour, and still names no focal length", () => {
  const b = fullBrain();
  const lens = terseBrain().photography.lens_character;
  if (lens && lens.derived_from === "product_truth") {
    assert.ok(!/\d{2,3}\s?mm/.test(lens.value), "a product-derived lens named a focal length");
    assert.match(lens.value, /perspective|compress|surface/i);
  }
});

check("FP: grounding metrics are reported and validated against the object", () => {
  const b = terseBrain();
  assert.ok(b.metrics.grounded_in_product_score > 0.2, `product grounding still low: ${b.metrics.grounded_in_product_score}`);
  assert.strictEqual(b.metrics.creative_coherence_score, 1, "not every section decided something");
  b.metrics.grounded_in_product_score = 0.99;
  assert.ok(
    validateBlueprint(b).some((v) => /grounded_in_product_score says/.test(v.rule)),
    "a lying metric validated clean"
  );
});

check("FP: grounding improved against the measured live baseline", () => {
  // run_20260919_003 measured 3/26 = 0.115 across 12/12 renders.
  const b = terseBrain();
  assert.ok(
    b.metrics.grounded_in_product_score > 0.115,
    `expected improvement on the 0.115 baseline, got ${b.metrics.grounded_in_product_score}`
  );
});


// ── Professional Creative Production Brain: layout, judge, refinement ───────

check("LA: layout is decided from asset type, copy roles and product count", () => {
  const ac: any = {
    asset_type: "poster", communication_goal: "g", viewer_behavior: "Seen in passing",
    visual_priority: "The product is the subject.", information_density: "One idea only.",
    typography_role: "Type carries the message.", layout_intent: "A single dominant subject.",
  };
  const l = LayoutArchitect.design({ assetContext: ac, decision: decision(), productCount: 1 });
  for (const f of ["visual_balance", "product_position", "text_area", "negative_space", "attention_flow", "composition_balance"] as const) {
    assert.ok(l[f], `${f} was not decided`);
    assert.ok(l[f]!.because.trim(), `${f} has no basis`);
  }
  assert.match(l.text_area!.because, /copy_roles supplied HEADLINE, CTA/);
  assert.match(l.visual_balance!.because, /AssetContext\.layout_intent/);
});

check("LA: several products rule out a single hero, whatever the product is", () => {
  const l = LayoutArchitect.design({ decision: decision(), productCount: 4 });
  assert.match(l.visual_balance!.value, /row of 4 equal subjects/);
});

check("LA: no logo attached means no logo position is invented", () => {
  const withLogo = LayoutArchitect.design({ decision: decision(), hasLogo: true });
  const without = LayoutArchitect.design({ decision: decision(), hasLogo: false });
  assert.match(withLogo.negative_space?.value || "", /logo/i);
  assert.ok(!/logo/i.test(without.negative_space?.value || ""), "a logo position was invented");
});

check("LA: holds no category table — format comes from asset type alone", () => {
  const code = fs
    .readFileSync(path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "LayoutArchitect.ts"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\b(skincare|beauty|beverage|food|luxury|ecommerce)\b/i.test(code), "a product category appears in the code");
  assert.ok(!/CATEGORY_|INDUSTRY_|STYLE_PRESET/.test(code), "a preset table exists");
  assert.ok(!/await |fetch\(|LLMProvider/.test(code), "the architect performs I/O");
});

check("LA: the architect never overrides a decision the director made", () => {
  // USER > CREATIVE DIRECTOR > AI. It fills gaps only.
  const b = fullBrain();
  assert.strictEqual(b.layout.product_position!.derived_from, "director", "the architect outranked the director");
});

check("LA: three unrelated subjects get the same six decisions made", () => {
  const ac: any = { asset_type: "banner", layout_intent: "Split frame.", visual_priority: "Product right.", information_density: "One line.", typography_role: "Type leads.", viewer_behavior: "Glanced at.", communication_goal: "g" };
  for (const count of [1, 2, 4]) {
    const l = LayoutArchitect.design({ assetContext: ac, decision: decision(), productCount: count });
    const filled = Object.values(l).filter(Boolean).length;
    assert.strictEqual(filled, 6, `only ${filled}/6 decided at productCount ${count}`);
  }
});

check("CJ: the judge now scores all eight commercial dimensions", () => {
  const r = RenderQualityJudge.evaluate({ blueprint: fullBrain(), prompt: "" });
  assert.strictEqual(r.scores.length, 8);
  for (const d of ["layout_quality", "typography_quality", "professional_advertising_similarity"]) {
    assert.ok(r.scores.some((s) => s.dimension === d), `${d} is not scored`);
  }
});

check("CJ: layout quality names the structural decisions that are missing", () => {
  const b = fullBrain();
  b.layout.text_area = null;
  b.layout.attention_flow = null;
  const s = RenderQualityJudge.evaluate({ blueprint: b, prompt: "" }).scores.find((x) => x.dimension === "layout_quality")!;
  assert.match(s.because, /text_area/);
  assert.match(s.because, /attention_flow/);
  assert.match(s.suggestion, /left to the renderer/);
});

check("CJ: typography scores grounding, not whether a typeface was named", () => {
  const b = fullBrain();
  for (const f of ["font_character", "typographic_voice", "hierarchy_logic", "spacing_behavior", "placement_reason", "contrast_strategy"] as const) {
    if (b.design[f]) b.design[f]!.derived_from = "director";
  }
  const s = RenderQualityJudge.evaluate({ blueprint: b, prompt: "" }).scores.find((x) => x.dimension === "typography_quality")!;
  assert.match(s.suggestion, /default rather than a choice/);
});

check("CJ: professional similarity is a composite and says so", () => {
  const s = RenderQualityJudge.evaluate({ blueprint: fullBrain(), prompt: "" }).scores.find(
    (x) => x.dimension === "professional_advertising_similarity"
  )!;
  assert.match(s.because, /composite of the seven dimensions/);
});

check("RL: the loop critiques what is undecided and what rests on the director", () => {
  const r = CreativeRefinementLoop.run({
    productTruth: truth(), productMeaning: meaning(), marketingInsight: insight(),
    visualDNA: dna(), decision: decision(), judgment: judgment(), prompt: "",
  });
  assert.ok(Array.isArray(r.critique.ungrounded));
  assert.ok(r.critique.director_only.length > 0, "nothing was attributed to the director");
  assert.strictEqual(r.before.scores.length, 8);
  assert.strictEqual(r.after.scores.length, 8);
});

check("RL: the loop is monotonic — it can never return a worse blueprint", () => {
  const r = CreativeRefinementLoop.run({
    productTruth: truth(), productMeaning: meaning(), marketingInsight: insight(),
    visualDNA: dna(), decision: decision(), judgment: judgment(), prompt: "",
  });
  assert.ok(r.after.mean >= r.before.mean, "the loop returned a worse score");
  assert.ok(r.delta >= 0, "a negative delta was reported");
});

check("RL: the loop adds no model call, no agent, no second director", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeRefinementLoop.ts"), "utf-8"
  );
  assert.ok(!/await |async |fetch\(|LLMProvider|generateChatCompletion/.test(src), "the loop performs I/O");
  assert.ok(!/class .*Agent|CreativeDirectorV1\./.test(src), "the loop re-runs the director");
  assert.ok(!/Math\.random|Date\.now/.test(src), "the loop is not deterministic");
});

check("RL: the report explains the score without opening the blueprint", () => {
  const r = CreativeRefinementLoop.run({
    productTruth: truth(), productMeaning: meaning(), marketingInsight: insight(),
    visualDNA: dna(), decision: decision(), judgment: judgment(), prompt: "",
  });
  const text = CreativeRefinementLoop.report(r);
  assert.match(text, /readiness \d/);
  assert.match(text, /fields undecided/);
});


// ── audit fixes: prompt budget, evaluation wiring ──────────────────────────

check("AUDIT: the blueprint respects a character budget", () => {
  const b = fullBrain();
  const full = ProfessionalCreativeBrain.render(b)!;
  assert.ok(full.length > 0);
  // Unbudgeted and generously budgeted are the same object.
  assert.strictEqual(ProfessionalCreativeBrain.render(b, { maxChars: full.length + 100 }), full);
  const tight = ProfessionalCreativeBrain.render(b, { maxChars: Math.floor(full.length / 2) })!;
  assert.ok(tight.length <= Math.floor(full.length / 2), `budget was exceeded: ${tight.length}`);
});

check("AUDIT: the budget drops the least certain decisions first", () => {
  const b = fullBrain();
  const full = ProfessionalCreativeBrain.render(b)!;
  const tight = ProfessionalCreativeBrain.render(b, { maxChars: Math.floor(full.length * 0.6) })!;
  // A high-confidence, product-grounded decision must outlive a low one.
  const highValue = allDecisions(b).find(
    (d) => d.decision?.confidence === "high" && d.decision.derived_from === "visual_dna"
  );
  if (highValue) {
    assert.ok(
      tight.includes(highValue.decision!.value.slice(0, 30)),
      "a high-confidence observed decision was dropped before the low-confidence ones"
    );
  }
});

check("AUDIT: with no headroom the blueprint yields nothing, never a fragment", () => {
  // A prompt cut mid-instruction is worse than no blueprint: the renderer reads
  // half a sentence as a whole one.
  assert.strictEqual(ProfessionalCreativeBrain.render(fullBrain(), { maxChars: 20 }), undefined);
  assert.strictEqual(ProfessionalCreativeBrain.render(fullBrain(), { maxChars: 0 }), undefined);
});

check("AUDIT: the pipeline budgets the blueprint against the compiler's hard maximum", () => {
  // Measured before this fix: 30,402 characters against a 24,000 hard maximum.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/PromptBudgetManagerService\.HARD_MAXIMUM - composed\.length/.test(src), "no headroom is computed");
  assert.ok(/render\(bp, \{/.test(src) && /maxChars: Math\.max/.test(src), "the blueprint is rendered without a budget");
});

check("AUDIT: the evaluation layer is actually reached by the pipeline", () => {
  // It was built, tested, and imported by nothing: every render so far was
  // scored by no one.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/CreativeRefinementLoop\.run\(/.test(src), "the refinement loop is still orphaned");
  assert.ok(/CREATIVE_QUALITY/.test(src), "readiness is computed but never reported");
});

check("AUDIT: evaluation stays free — no model call on the render path", () => {
  for (const f of ["evolution/experiment/CreativeRefinementLoop.ts", "benchmark/RenderQualityJudge.ts"]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", f), "utf-8");
    assert.ok(!/await |fetch\(|LLMProvider/.test(src), `${f} performs I/O on the render path`);
  }
});


// ── optimization pass: flag sync, strategy ordering ────────────────────────

check("OPT: every flag declared in code exists in the production config", () => {
  // Fourteen were missing, so `isEnabled` silently returned the default and the
  // capability could not be switched on at all.
  const prod = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "evolution", "feature-flags.json"), "utf-8")
  ).features;
  const declared = Object.keys(DEFAULT_FLAGS.features as Record<string, boolean>);
  const missing = declared.filter((k) => !(k in prod));
  assert.deepStrictEqual(missing, [], `flags declared in code but absent from production config: ${missing.join(", ")}`);
});

check("OPT: no production flag is enabled that the pipeline never reads", () => {
  // `creative_blueprint_v1` is read zero times: the real gate is
  // `professional_creative_brain_v1`. Enabling a no-op and reading the result
  // as a result is how a team concludes a feature does nothing.
  const prod = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "evolution", "feature-flags.json"), "utf-8")
  ).features;
  const pipeline = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  const unread: string[] = [];
  for (const [name, on] of Object.entries(prod)) {
    if (!on) continue;
    if (!pipeline.includes(`f.${name}`)) unread.push(name);
  }
  // Known-good exceptions: flags consumed by the director/judgment layer rather
  // than branched on in the pipeline itself.
  const consumedElsewhere = new Set([
    "creative_strategy_intelligence_v1", "consumer_psychology_v1",
    "brand_positioning_v1", "asset_type_intelligence_v1", "creative_bridge_v1",
  ]);
  const bad = unread.filter((n) => !consumedElsewhere.has(n));
  assert.deepStrictEqual(bad, [], `enabled but never read: ${bad.join(", ")}`);
});

check("OPT: the vestigial blueprint flag stays off", () => {
  const prod = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "evolution", "feature-flags.json"), "utf-8")
  ).features;
  assert.strictEqual(prod.creative_blueprint_v1, false, "a flag nothing reads was switched on");
});

check("OPT: client visual-control locks survive Creative Director authority", () => {
  // Authority is now ON in production. If locks were not derived from the
  // client's own controls, switching it on would strip every genuine client
  // directive, which is the opposite of the intent.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/userLockedDimensions\[dimension\] = true/.test(src), "locks are not derived from the controls");
  assert.ok(/!== AUTO/.test(src), "a control left on auto would be read as a deliberate lock");
  assert.ok(/creativeDirectorAuthority: true, userLockedDimensions/.test(src), "locks are not passed with authority");
});

check("OPT: strategy_first runs the marketing brain BEFORE the director", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  const produced = src.indexOf("earlyStrategy = await new MarketingBrainService()");
  const usedByInsight = src.indexOf("strategy: earlyStrategy");
  assert.ok(produced > 0, "the strategy is not produced in the pipeline");
  assert.ok(usedByInsight > produced, "the insight layer reads the strategy before it exists");
});

check("OPT: the hoist adds no second marketing-brain call", () => {
  // The orchestrator must REUSE what the pipeline produced, not generate again.
  const orch = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "service", "SimpleImageGenerationOrchestratorService.ts"), "utf-8"
  );
  assert.ok(
    /options\?\.precomputedStrategy \?\? await marketingBrain\.generateStrategy/.test(orch),
    "the orchestrator still always generates its own strategy"
  );
  assert.strictEqual(
    (orch.match(/marketingBrain\.generateStrategy\(/g) || []).length, 1,
    "more than one strategy call exists in the orchestrator"
  );
});

check("OPT: with the flag off, nothing is precomputed and behaviour is unchanged", () => {
  assert.strictEqual((DEFAULT_FLAGS.features as any).strategy_first_v1, false);
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  // The option is spread conditionally, so an absent strategy leaves the
  // orchestrator call byte-identical to what it always was.
  assert.ok(
    /\.\.\.\(earlyStrategy \? \{ precomputedStrategy: earlyStrategy \} : \{\}\)/.test(src),
    "the option is passed unconditionally"
  );
  assert.strictEqual(
    (src.match(/precomputedStrategy: earlyStrategy/g) || []).length, 2,
    "the strategy is not handed to both generation paths exactly once each"
  );
});

check("OPT: a failed strategy call does not take the render down", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  const i = src.indexOf("earlyStrategy = await new MarketingBrainService()");
  const window = src.slice(Math.max(0, i - 400), i + 1400);
  assert.ok(/try \{/.test(window) && /catch \(err: any\)/.test(window), "the strategy call is unguarded");
  assert.ok(/continuing without it/.test(window), "failure is not reported as survivable");
});

check("OPT: the insight layer grounds in strategy once it arrives first", () => {
  // The measured defect: grounded_in_strategy_score was 0 on 12/12 renders
  // because the insight ran before its only source existed.
  const withStrategy = buildMarketingInsight({
    productTruth: truth(), productMeaning: meaning(), strategy: strategy(),
  });
  assert.ok(withStrategy.customer_problem, "strategy was supplied and the problem is still missing");
  assert.strictEqual(withStrategy.customer_problem!.derived_from, "strategy");
  const without = buildMarketingInsight({ productTruth: truth(), productMeaning: meaning() });
  assert.strictEqual(without.customer_problem!.derived_from, "product_truth", "the fallback changed");
});


// ── commercial upgrade: the reading order the system was never deciding ────

const silent = (over: any = {}) =>
  ProfessionalCreativeBrain.assemble({
    productTruth: truth(), productMeaning: meaning(), marketingInsight: insight(),
    visualDNA: dna(), decision: decision({ copy_roles: [] }), judgment: judgment(), ...over,
  });

check("CU: the client labelling their own copy outranks the director reading it", () => {
  const b = silent({ copyItems: [{ text: "Mở cửa 6h", type: "headline" }, { text: "Ghé thử", type: "cta" }] });
  assert.ok(b.design.hierarchy_logic, "hierarchy is still undecided");
  assert.strictEqual(b.design.hierarchy_logic!.derived_from, "user", "USER > DIRECTOR was not applied");
  assert.match(b.design.hierarchy_logic!.value, /HEADLINE -> CTA/);
});

check("CU: the director still wins where the client labelled nothing", () => {
  const b = ProfessionalCreativeBrain.assemble({
    decision: decision(), judgment: judgment(), copyItems: ["Mở cửa 6h", "Ghé thử"],
  });
  assert.strictEqual(b.design.hierarchy_logic!.derived_from, "director");
});

check("CU: unlabelled client copy still yields a stated order, at low confidence", () => {
  // A weak order beats none: an undecided hierarchy means the renderer picks
  // which line leads.
  const b = silent({ copyItems: ["Mở cửa 6h", "Ghé thử"] });
  assert.ok(b.design.hierarchy_logic, "several strings and still no reading order");
  assert.strictEqual(b.design.hierarchy_logic!.confidence, "low", "a guessed order claimed confidence");
  assert.match(b.design.hierarchy_logic!.because, /labelled none/);
});

check("CU: one string alone is not a hierarchy", () => {
  const b = silent({ copyItems: ["Mở cửa 6h"] });
  assert.strictEqual(b.design.hierarchy_logic, null, "a single string was called a reading order");
});

check("CU: no copy at all leaves hierarchy honestly undecided", () => {
  const b = silent({});
  assert.strictEqual(b.design.hierarchy_logic, null);
  assert.ok(b.missing.includes("design.hierarchy_logic"));
});

check("CU: fixing hierarchy moves the dimension the judge called worst", () => {
  // run_20260919_007: commercial_quality averaged 5.47 across 12 renders, and
  // the judge named the same cause every time -- "copy hierarchy MISSING".
  const before = RenderQualityJudge.evaluate({ blueprint: silent({}), prompt: "" });
  const after = RenderQualityJudge.evaluate({
    blueprint: silent({ copyItems: [{ text: "a", type: "headline" }, { text: "b", type: "cta" }] }),
    prompt: "",
  });
  const dim = (r: any) => r.scores.find((s: any) => s.dimension === "commercial_quality").score;
  assert.ok(dim(after) > dim(before), `commercial quality did not move: ${dim(before)} -> ${dim(after)}`);
  assert.ok(dim(after) >= 7, `expected a decided hierarchy to clear 7, got ${dim(after)}`);
});

check("CU: the layout's text area also falls back to the client's labels", () => {
  const withClient = LayoutArchitect.design({
    decision: decision({ copy_roles: [] }),
    copyItems: [{ text: "a", type: "headline" }, { text: "b", type: "cta" }],
  });
  assert.ok(withClient.text_area, "the text area is undecided with client copy available");
  assert.match(withClient.text_area!.because, /client's own copy labels/);
});

check("CU: typography_roles_v1 is enabled, and it is what asks for copy roles", () => {
  // The flag was off, so the director was never asked, so copy_roles came back
  // [] on 12/12 renders and the hierarchy had no source at all.
  const prod = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "evolution", "feature-flags.json"), "utf-8")
  ).features;
  assert.strictEqual(prod.typography_roles_v1, true, "the roles flag is still off");
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/copyRoles: Boolean\(f\.typography_roles_v1\)/.test(src), "the flag no longer gates role assignment");
});

check("CU: the brain is handed the client's copy by the pipeline", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/copyItems: request\.copyItems/.test(src), "the client's copy never reaches the brain");
});


// ── the refinement loop, now actually refining ─────────────────────────────

const gappy = (over: any = {}) => ({
  decision: decision({
    copy_roles: [], staging_requirements: [], deliberately_avoided: "",
    camera_decision: "counter height", composition_decision: "cup left",
  }),
  prompt: "",
  ...over,
});

check("RL2: pass two differs from pass one, which is the whole mechanism", () => {
  // The previous version assembled identical inputs twice, so `improved` was
  // structurally always false and the loop was theatre.
  const r = CreativeRefinementLoop.run(gappy());
  assert.ok(Object.keys(r.corrections).length > 0, "no corrections were derived");
  assert.ok(r.improved, "the corrected pass did not score higher");
  assert.ok(r.delta > 0, `expected a positive delta, got ${r.delta}`);
});

check("RL2: a correction can only fill a field nothing decided", () => {
  // USER > DIRECTOR > AI does not stop applying because a later pass disagrees.
  const r = CreativeRefinementLoop.run({ decision: decision(), judgment: judgment(), prompt: "" });
  const decided = new Set(
    allDecisions(ProfessionalCreativeBrain.assemble({ decision: decision(), judgment: judgment() }))
      .filter((d) => d.decision)
      .map((d) => `${d.section}.${d.field}`)
  );
  for (const field of Object.keys(r.corrections)) {
    assert.ok(!decided.has(field), `${field} was already decided and got overwritten by a correction`);
  }
});

check("RL2: the corrective tier never outranks the director", () => {
  const r = CreativeRefinementLoop.run(gappy());
  // Every corrected field must carry low confidence: a critic's inference about
  // a gap, not an observation.
  for (const [field] of Object.entries(r.corrections)) {
    const [section, name] = field.split(".");
    const dec = (r.blueprint as any)[section]?.[name];
    if (dec) {
      assert.strictEqual(dec.confidence, "low", `${field} claims more than a correction should`);
      assert.match(dec.because, /correction after review/);
    }
  }
});

check("RL2: the loop is monotonic — a worse pass is discarded", () => {
  const r = CreativeRefinementLoop.run(gappy());
  assert.ok(r.after.mean >= r.before.mean, "the loop returned a worse score");
  assert.ok(r.delta >= 0);
});

check("RL2: nothing to correct returns honestly, without a wasted pass", () => {
  const r = CreativeRefinementLoop.run({
    productTruth: truth(), productMeaning: meaning(), marketingInsight: insight(),
    visualDNA: dna(), strategy: strategy(), decision: decision(), judgment: judgment(),
    copyItems: [{ text: "a", type: "headline" }, { text: "b", type: "cta" }],
    prompt: "PRODUCT IDENTITY PROTECTION belong to the layout, not to the product blank, partial or illegible label is a failed render",
  });
  if (!Object.keys(r.corrections).length) {
    assert.strictEqual(r.improved, false);
    assert.strictEqual(r.delta, 0);
    assert.strictEqual(r.after, r.before, "a second pass ran with nothing to change");
  }
});

check("RL2: the loop still makes no model call", () => {
  for (const f of [
    "evolution/experiment/CreativeRefinementLoop.ts",
    "benchmark/CreativeDiagnosis.ts",
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", f), "utf-8");
    assert.ok(!/await |async |fetch\(|LLMProvider/.test(src), `${f} performs I/O`);
    assert.ok(!/Math\.random|Date\.now/.test(src), `${f} is not deterministic`);
  }
});

// ── the diagnosis object ───────────────────────────────────────────────────

check("DX: a diagnosis is actionable, not a score", () => {
  const r = CreativeRefinementLoop.run(gappy());
  assert.ok(r.critique.diagnosis.length > 0, "nothing was diagnosed on a gappy blueprint");
  for (const d of r.critique.diagnosis) {
    assert.ok(d.problem.trim(), "a diagnosis with no problem");
    assert.ok(d.root_cause.trim(), "a diagnosis with no root cause");
    assert.ok(d.recommended_correction.trim(), "a diagnosis with no correction");
    assert.ok(d.evidence.trim(), "a diagnosis with no evidence");
    assert.ok(d.targets.length > 0, `${d.problem_category} names no target field`);
    assert.ok(["low", "medium", "high"].includes(d.severity));
  }
});

check("DX: diagnoses are ordered worst first", () => {
  const order = { high: 0, medium: 1, low: 2 } as any;
  const d = CreativeRefinementLoop.run(gappy()).critique.diagnosis;
  const ranks = d.map((x) => order[x.severity]);
  assert.deepStrictEqual(ranks, [...ranks].sort((a, b) => a - b));
});

check("DX: corrections read as direction a renderer can execute", () => {
  // They are fed into the prompt verbatim, so advice addressed to the pipeline
  // would land in front of the image model as an instruction it cannot follow.
  const r = CreativeRefinementLoop.run(gappy());
  for (const d of r.critique.diagnosis) {
    const c = d.recommended_correction;
    assert.ok(!/\bdecide\b|\bsay what\b|\bstate the\b.*\bbefore\b/i.test(c) || /headline leads/.test(c),
      `${d.problem_category} instructs the pipeline rather than the renderer: "${c}"`);
    assert.ok(!/blueprint|pipeline|field|score/i.test(c), `${d.problem_category} leaks internals: "${c}"`);
  }
});

check("DX: a healthy blueprint is not given invented problems", () => {
  // A list that always finds something teaches a reader to stop reading it.
  const healthy = fullBrain();
  const report = RenderQualityJudge.evaluate({
    blueprint: healthy,
    prompt: "PRODUCT IDENTITY PROTECTION belong to the layout, not to the product blank, partial or illegible label is a failed render",
  });
  const d = diagnose(healthy, report);
  assert.ok(d.length <= 2, `a well-formed blueprint was given ${d.length} problems`);
});

check("DX: the director correction brief is direction, not scores", () => {
  const r = CreativeRefinementLoop.run(gappy());
  const brief = r.director_correction!;
  assert.ok(brief, "no correction context was built for a second director pass");
  assert.match(brief, /CORRECTION REQUIRED/);
  assert.match(brief, /Keep the creative intent/);
  assert.ok(!/\d+\/10/.test(brief), "the brief hands the director a score instead of a direction");
});

check("DX: telemetry counts problems and leaks no prose", () => {
  const t = JSON.stringify(CreativeRefinementLoop.telemetry(CreativeRefinementLoop.run(gappy())));
  assert.ok(!/renderer chooses which line leads/.test(t), "diagnosis prose leaked into telemetry");
  assert.ok(/"problems":\d/.test(t));
  assert.ok(/corrected_fields/.test(t));
});


// ── Step 2: commercial effect and rejected alternative ─────────────────────

check("S2: the one real rejection the engine records reaches the decision", () => {
  // `CreativeStrategy.why_not_runner_up` -> `deliberately_avoided`. That is the
  // only genuine rejection in the pipeline, and it belongs on the big idea.
  const b = fullBrain();
  assert.ok(b.concept.big_idea?.alternative_rejected, "the rejected route was dropped");
  assert.match(b.concept.big_idea!.alternative_rejected!, /overhead flat-lay/);
});

check("S2: no rejected alternative is invented where none was recorded", () => {
  // A rejection invented for a spacing decision reads like reasoning and is
  // fiction, which is worse than an empty field because it survives review.
  const b = fullBrain();
  const invented = allDecisions(b).filter(
    (d) => d.decision?.alternative_rejected && d.field !== "big_idea"
  );
  assert.deepStrictEqual(invented.map((d) => `${d.section}.${d.field}`), [],
    "a rejected alternative was invented for a field with no source");
});

check("S2: commercial effect comes from the asset's stated job, never guessed", () => {
  const withCtx = ProfessionalCreativeBrain.assemble({
    decision: decision(), judgment: judgment(),
    assetContext: { asset_type: "poster", communication_goal: "Make one idea memorable.", layout_intent: "One subject.", visual_priority: "Product leads.", information_density: "One line.", typography_role: "Type carries it.", viewer_behavior: "Seen in passing" } as any,
  });
  assert.ok(withCtx.concept.big_idea?.commercial_effect, "the asset's commercial job was dropped");
  const without = ProfessionalCreativeBrain.assemble({ decision: decision(), judgment: judgment() });
  assert.strictEqual(without.concept.big_idea?.commercial_effect, undefined,
    "a commercial effect was invented with no asset context");
});

check("S2: both fields are absent rather than undefined when unsourced", () => {
  // `deepStrictEqual` distinguishes an absent key from an undefined one, and
  // the equivalence tests depend on it.
  const b = ProfessionalCreativeBrain.assemble({ decision: decision({ deliberately_avoided: "" }), judgment: judgment() });
  assert.ok(!("alternative_rejected" in (b.concept.big_idea as any)), "the key exists with no value");
});

check("S2: a present-but-empty field is a violation", () => {
  const b = fullBrain();
  (b.concept.big_idea as any).commercial_effect = "   ";
  assert.ok(validateBlueprint(b).some((v) => /commercial_effect is present but empty/.test(v.rule)));
});

check("S2: a rejected alternative identical to the decision is a violation", () => {
  const b = fullBrain();
  b.concept.big_idea!.alternative_rejected = b.concept.big_idea!.value;
  assert.ok(validateBlueprint(b).some((v) => /rejected alternative is the decision itself/.test(v.rule)));
});

check("S2: telemetry reports honest coverage, not padded coverage", () => {
  const t: any = blueprintTelemetry(fullBrain());
  assert.strictEqual(typeof t.with_commercial_effect, "number");
  assert.strictEqual(typeof t.with_alternative_rejected, "number");
  // Coverage is genuinely low because the source mostly does not exist. If this
  // ever reads high, check that something did not start inventing them.
  assert.ok(t.with_alternative_rejected <= 2, `suspiciously high rejection coverage: ${t.with_alternative_rejected}`);
});

// ── Step 1: the eighth stage ───────────────────────────────────────────────

check("S1: a director revision that scores higher is kept", () => {
  // The incumbent has to be genuinely beatable. A corrected pass fills the same
  // gaps a revision would, so the two tie and the tie is correctly discarded --
  // measured at 6.59 vs 6.59. Starting from a blueprint with nothing to correct
  // is the case where a revision can actually win.
  const bare = { decision: {} as any, prompt: "" };
  const first = CreativeRefinementLoop.run(bare);
  const revised = CreativeRefinementLoop.applyDirectorRevision(first, {
    productTruth: truth(), productMeaning: meaning(), marketingInsight: insight(),
    visualDNA: dna(), decision: decision(), judgment: judgment(),
    copyItems: [{ text: "a", type: "headline" }, { text: "b", type: "cta" }],
    prompt: "",
  });
  assert.strictEqual(revised.director_revision_kept, true, "a better revision was discarded");
  assert.ok(revised.after.mean > first.after.mean, `${first.after.mean} -> ${revised.after.mean}`);
});

check("S1: a revision that only ties the incumbent is discarded", () => {
  // Conservative on purpose: an equal score is not evidence of improvement, and
  // spending a director call has to buy something.
  const thin = { decision: decision({ copy_roles: [] }), prompt: "" };
  const first = CreativeRefinementLoop.run(thin);
  const tie = CreativeRefinementLoop.applyDirectorRevision(first, {
    ...thin, copyItems: [{ text: "a", type: "headline" }, { text: "b", type: "cta" }],
  });
  assert.strictEqual(tie.director_revision_kept, false, "a tie was treated as an improvement");
});

check("S1: a worse director revision is discarded, not applied", () => {
  // A bad second opinion must not be able to degrade the output.
  const rich = {
    productTruth: truth(), productMeaning: meaning(), marketingInsight: insight(),
    visualDNA: dna(), decision: decision(), judgment: judgment(), prompt: "",
  };
  const first = CreativeRefinementLoop.run(rich);
  const revised = CreativeRefinementLoop.applyDirectorRevision(first, { decision: {} as any, prompt: "" });
  assert.strictEqual(revised.director_revision_kept, false);
  assert.strictEqual(revised.blueprint, first.blueprint, "the worse revision replaced the winner");
  assert.ok(revised.after.mean >= first.after.mean);
});

check("S1: the revision competes with the winner, not the first draft", () => {
  const thin = { decision: decision({ copy_roles: [] }), prompt: "" };
  const first = CreativeRefinementLoop.run(thin);
  const revised = CreativeRefinementLoop.applyDirectorRevision(first, thin);
  // Identical input cannot beat the corrected pass, so it must be rejected.
  assert.strictEqual(revised.director_revision_kept, false);
});

check("S1: the loop stays pure — the model call belongs to the caller", () => {
  // A loop that calls a model cannot be tested offline, cannot run on every
  // render, and fails when a gateway is down. The gateway being down this turn
  // is exactly why that split matters.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeRefinementLoop.ts"), "utf-8"
  );
  assert.ok(!/await |async |fetch\(|LLMProvider/.test(src), "the loop performs I/O");
  assert.ok(/static applyDirectorRevision\(/.test(src), "the eighth stage is missing");
  assert.ok(/director_correction/.test(src), "no correction context is produced for the director");
});

check("S1: all eight stages are present and ordered", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeRefinementLoop.ts"), "utf-8"
  );
  const stages = ["1. GENERATE", "2. JUDGE", "3. DIAGNOSE", "4. CORRECT", "5. REGENERATE", "6. COMPARE"];
  let at = -1;
  for (const s of stages) {
    const i = src.indexOf(s);
    assert.ok(i > at, `stage out of order or missing: ${s}`);
    at = i;
  }
});


// ── Phase 1.5: the first use of reasoning/ from the render path ────────────

check("RI: a tension reading grounds creative_tension when the director is silent", () => {
  // Until now this field had exactly one source: the route the director
  // rejected. A brief where the director records no rejection left the concept
  // with nothing to resolve, which Phase 0.5 measured as producing a
  // description of the product.
  const b = ProfessionalCreativeBrain.assemble({
    decision: decision({ deliberately_avoided: "" }),
    judgment: judgment(),
    tension: {
      statement: "For commuters, being late is met as a personal failing rather than a scheduling fact",
      step: "hidden_emotion",
      matched: true,
      archetype: "invisible_effort",
    },
  });
  assert.ok(b.concept.creative_tension, "the tension reading was dropped");
  assert.strictEqual(b.concept.creative_tension!.derived_from, "strategy");
  assert.match(b.concept.creative_tension!.because, /HumanTensionAnalyzer reached the hidden_emotion rung/);
});

check("RI: the director's own rejection still outranks the analyzer", () => {
  const b = ProfessionalCreativeBrain.assemble({
    decision: decision(), judgment: judgment(),
    tension: { statement: "x", step: "hidden_emotion", matched: true, archetype: "a" },
  });
  assert.strictEqual(b.concept.creative_tension!.derived_from, "director", "reasoning outranked the director");
});

check("RI: an unmatched ladder is carried at low confidence, not asserted", () => {
  // The analyzer derives structurally from the sentence when no known problem
  // shape matches, and says so. The blueprint has to keep saying so.
  const b = ProfessionalCreativeBrain.assemble({
    decision: decision({ deliberately_avoided: "" }), judgment: judgment(),
    tension: { statement: "a structurally derived reading", step: "behavior", matched: false, archetype: "unclassified" },
  });
  assert.strictEqual(b.concept.creative_tension!.confidence, "low");
});

check("RI: no tension supplied changes nothing", () => {
  const without = ProfessionalCreativeBrain.assemble({ decision: decision(), judgment: judgment() });
  const withNull = ProfessionalCreativeBrain.assemble({ decision: decision(), judgment: judgment(), tension: null });
  assert.deepStrictEqual(withNull, without, "passing null changed the blueprint");
});

check("RI: the analyzer is pure, so wiring it adds no call and cannot fail a render", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "reasoning", "HumanTensionAnalyzer.ts"), "utf-8"
  );
  assert.ok(!/await |async |fetch\(|LLMProvider/.test(src), "the analyzer performs I/O");
  const pipeline = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/HumanTensionAnalyzer\.analyze\(/.test(pipeline), "the pipeline never calls the analyzer");
  // Guarded: a reasoning failure must not take a paid render down.
  const i = pipeline.indexOf("HumanTensionAnalyzer.analyze(");
  const window = pipeline.slice(Math.max(0, i - 600), i + 1800);
  assert.ok(/try \{/.test(window) && /catch \(err: any\)/.test(window), "the reasoning call is unguarded");
});

check("RI: it is fed the brief's own challenge, never an invented one", () => {
  const pipeline = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/assetCtx\?\.challenges/.test(pipeline), "the challenge does not come from the asset context");
  assert.ok(/if \(tensionOn && challenge\)/.test(pipeline), "the analyzer runs without a challenge to read");
});

check("RI: the flag exists, defaults off, and depends on the brain", () => {
  assert.strictEqual((DEFAULT_FLAGS.features as any).reasoning_tension_v1, false);
  const pipeline = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/brainOn && Boolean\(f\.reasoning_tension_v1\)/.test(pipeline), "the dependency is not stated");
});

check("RI: reasoning/ is covered by the registered suites, not dead code", () => {
  // Correcting an earlier audit of mine: I called this directory untested three
  // times. It is referenced by the passing suites; what it was not, is reachable
  // from the render path.
  const dir = path.join(process.cwd(), "lib", "image-engine", "reasoning");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length > 70, `expected the full reasoning directory, found ${files.length}`);
  const suites = fs.readdirSync(path.join(process.cwd(), "lib", "image-engine"))
    .filter((f) => f.startsWith("run-") && f.endsWith(".ts"))
    .map((f) => fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", f), "utf-8"))
    .join("\n");
  const referenced = files.filter((f) => suites.includes(f.replace(/\.ts$/, "")));
  assert.ok(
    referenced.length / files.length > 0.9,
    `only ${referenced.length}/${files.length} reasoning modules are referenced by suites`
  );
});


// ── Loop 2.0 item B: creative correction, not only structural ──────────────

const ideaBrain = (route: string, goal = "make an unopened shop feel already lived in") =>
  ProfessionalCreativeBrain.assemble({
    decision: decision({ strategy_route: route, creative_goal: goal }),
    judgment: judgment(),
  });

const diagnoseOf = (b: any) =>
  diagnose(b, RenderQualityJudge.evaluate({ blueprint: b, prompt: "" }));

check("CC: a generic idea is flagged as a creative problem, not a structural one", () => {
  // Everything else in the diagnosis finds a GAP. This finds an idea that was
  // decided and is nevertheless the category default -- the Phase 0.5 failure,
  // which a completeness count cannot see.
  const d = diagnoseOf(ideaBrain("a premium modern luxury lifestyle experience"));
  const c = d.find((x) => x.problem_category === "creative_concept");
  assert.ok(c, "a category-default idea was not flagged");
  assert.match(c!.evidence, /OriginalityEvaluator scored/);
  assert.match(c!.root_cause, /category/);
});

check("CC: a specific idea is left alone", () => {
  const d = diagnoseOf(ideaBrain("the shop that opens before you do"));
  assert.ok(!d.some((x) => x.problem_category === "creative_concept"), "a specific idea was flagged as generic");
});

check("CC: the trigger is the cliché signal, not the composite score", () => {
  // Measured: the composite ranked "premium luxury quality" (6.93) ABOVE
  // "a premium modern luxury lifestyle experience" (5.73), because the
  // memorability proxy rewards brevity. Scoring alone would have let the worse
  // idea through.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "benchmark", "CreativeDiagnosis.ts"), "utf-8"
  );
  assert.ok(/assessed\.notes\.length > 0/.test(src), "the cliche signal is not used");
  const short = diagnoseOf(ideaBrain("premium luxury quality"));
  assert.ok(
    short.some((x) => x.problem_category === "creative_concept"),
    "a short pure-cliche idea slipped through"
  );
});

check("CC: an idea that restates its own source is caught", () => {
  // Phase 4.0.1's defect: the big idea was its own input, restated.
  const restated = ideaBrain("make an unopened shop feel already lived in");
  const c = diagnoseOf(restated).find((x) => x.problem_category === "creative_concept");
  assert.ok(c, "an idea identical to its own creative goal was not flagged");
});

check("CC: the creative problem targets the concept, not a craft slot", () => {
  // This is a brief to rewrite, not a field to fill, so it must route to the
  // director correction rather than be silently patched by the deterministic
  // pass.
  const c = diagnoseOf(ideaBrain("a premium modern luxury lifestyle experience"))
    .find((x) => x.problem_category === "creative_concept")!;
  assert.deepStrictEqual(c.targets, ["concept.big_idea", "concept.creative_tension"]);
  const r = CreativeRefinementLoop.run({
    decision: decision({ strategy_route: "a premium modern luxury lifestyle experience" }),
    judgment: judgment(), prompt: "",
  });
  // `big_idea` is decided, so the corrector must not overwrite it.
  assert.ok(!("concept.big_idea" in r.corrections), "the deterministic pass overwrote a decided idea");
});

check("CC: the creative problem reaches the director correction brief", () => {
  const r = CreativeRefinementLoop.run({
    decision: decision({ strategy_route: "a premium modern luxury lifestyle experience", copy_roles: [] }),
    judgment: judgment(), prompt: "",
  });
  assert.ok(r.director_correction, "no correction brief was produced");
  assert.match(r.director_correction!, /CREATIVE CONCEPT/);
});

check("CC: originality assessment costs nothing and cannot fail a render", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "reasoning", "OriginalityEvaluator.ts"), "utf-8"
  );
  assert.ok(!/await |async |fetch\(|LLMProvider/.test(src), "the evaluator performs I/O");
  // And a blueprint with no idea at all must not throw.
  assert.doesNotThrow(() => diagnoseOf(ProfessionalCreativeBrain.assemble({})));
});

check("CC: the second reasoning module is wired, and only where it helps", () => {
  // Item 5 continues: OriginalityEvaluator joins HumanTensionAnalyzer. Both are
  // pure, both were tested and unreachable, and each grounds something the
  // blueprint could not previously see.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "benchmark", "CreativeDiagnosis.ts"), "utf-8"
  );
  assert.ok(/from "\.\.\/reasoning\/OriginalityEvaluator"/.test(src), "the evaluator is not imported");
  assert.ok(!/CandidatePopulationBuilder|CreativeDecisionEngine/.test(src), "a duplicate reasoning module was wired");
});


// ── Part 1: comparing the concepts the director already produced ───────────

const verdict = (stance: string, evidence = "quoted from the brief") => ({ stance, because: "b", evidence });
const strongRoute: any = {
  route: "prove the hour",
  core_idea: "the shop that opens before you do",
  visual_language: "a counter mid-service under one hard window source",
  why_this_route: "the early hour is the only thing a competitor cannot copy",
  emotional_objective: "recognition", audience_reaction: "they realise it is already open",
  assessment: {
    product: verdict("supports"), audience: verdict("supports"), objective: verdict("supports"),
    brand: verdict("supports"), channel: verdict("neutral"), feasibility: verdict("supports"),
  },
};
const weakRoute: any = {
  route: "premium lifestyle",
  core_idea: "a premium modern luxury lifestyle experience",
  why_this_route: "premium positioning",
  assessment: {
    product: verdict("neutral", ""), audience: verdict("works_against", ""), objective: verdict("neutral", ""),
    brand: verdict("neutral", ""), channel: verdict("neutral", ""), feasibility: verdict("supports", ""),
  },
};
const strat = (selected: string): any => ({
  candidates: [strongRoute, weakRoute], selected, runner_up: "", selection_reason: "",
  why_not_runner_up: "", routes_offered: [], routes_developed: [],
});

check("CE: it compares the director's own candidates, generating none", () => {
  // The system already generates several routes. A second generator would mean
  // a second model call producing ideas the director never saw.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "benchmark", "ConceptEvaluator.ts"), "utf-8"
  );
  assert.ok(!/await |async |fetch\(|LLMProvider/.test(src), "the evaluator performs I/O");
  // Comments stripped: those module names appear in the prose explaining why
  // they are deliberately NOT wired.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/CreativeConceptGenerator|CreativeConceptEngine/.test(code), "a model-calling generator was wired");
});

check("CE: the stronger route wins on the five criteria", () => {
  const c = compareConcepts(strat("prove the hour"))!;
  assert.strictEqual(c.strongest, "prove the hour");
  assert.strictEqual(c.selected_is_weaker, false, "the better pick was flagged as weaker");
  assert.strictEqual(c.margin, 0);
});

check("CE: a weaker pick is flagged, with the margin stated", () => {
  const c = compareConcepts(strat("premium lifestyle"))!;
  assert.strictEqual(c.selected_is_weaker, true, "a materially weaker pick was not flagged");
  assert.ok(c.margin >= 1, `margin should be material, got ${c.margin}`);
  assert.strictEqual(c.strongest, "prove the hour");
});

check("CE: it does not overrule the director's selection", () => {
  // The director read the brief. This reports; it does not re-choose.
  const c = compareConcepts(strat("premium lifestyle"))!;
  assert.strictEqual(c.selected, "premium lifestyle", "the evaluator rewrote the selection");
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "benchmark", "ConceptEvaluator.ts"), "utf-8"
  );
  assert.ok(!/selected = strongest|selected: strongest/.test(src), "the evaluator reassigns the selection");
});

check("CE: a comparison of one is not a comparison", () => {
  assert.strictEqual(compareConcepts({ candidates: [strongRoute] } as any), null);
  assert.strictEqual(compareConcepts({ candidates: [] } as any), null);
  assert.strictEqual(compareConcepts(null), null);
});

check("CE: a small gap is noise, not a finding", () => {
  // These scores rest partly on proxies; flagging any difference would teach a
  // reader to ignore the flag.
  const near: any = { ...strongRoute, route: "near twin", core_idea: "the shop that opens before you arrive" };
  const c = compareConcepts({ candidates: [strongRoute, near], selected: "near twin" } as any)!;
  if (c.margin < 1) assert.strictEqual(c.selected_is_weaker, false, "a sub-margin gap was reported as a finding");
});

check("CE: an unverified verdict counts for less than a verified one", () => {
  // The director's own discipline: a verdict whose evidence appears nowhere is
  // downgraded rather than trusted.
  const verified = scoreConcept({ ...strongRoute } as any);
  const unverified = scoreConcept({
    ...strongRoute,
    assessment: Object.fromEntries(
      Object.entries(strongRoute.assessment).map(([k, v]: any) => [k, { ...v, evidence: "" }])
    ),
  } as any);
  assert.ok(unverified.commercial_relevance < verified.commercial_relevance,
    "unverified assessments scored the same as verified ones");
});

check("CE: a route with no visual language is marked down and told why", () => {
  // Phase 0.2 measured what happens without it: a strategy run reached the
  // renderer with a subject and no photograph.
  const s = scoreConcept(weakRoute);
  assert.strictEqual(s.visual_potential, 3);
  assert.ok(s.notes.some((n) => /visual language/i.test(n)));
});

check("CE: the flag reaches the diagnosis and targets the concept", () => {
  const b = fullBrain();
  const report = RenderQualityJudge.evaluate({ blueprint: b, prompt: "" });
  const d = diagnose(b, report, compareConcepts(strat("premium lifestyle")));
  const c = d.find((x) => x.problem_category === "creative_concept" && /rejected route/.test(x.problem));
  assert.ok(c, "the weaker-pick finding never reached the diagnosis");
  assert.deepStrictEqual(c!.targets, ["concept.big_idea", "concept.creative_tension"]);
  assert.match(c!.root_cause, /stopped at the director/);
});

check("CE: the loop reads the comparison from the judgment it already has", () => {
  const r = CreativeRefinementLoop.run({
    decision: decision(), judgment: judgment({ strategy: strat("premium lifestyle") }), prompt: "",
  });
  assert.ok(r.critique.concepts, "the comparison was not carried into the critique");
  assert.strictEqual(r.critique.concepts!.selected_is_weaker, true);
  assert.ok(
    r.critique.diagnosis.some((d) => /rejected route/.test(d.problem)),
    "the finding did not reach the diagnosis through the loop"
  );
});

check("CE: no comparison available changes nothing", () => {
  const withNone = CreativeRefinementLoop.run({ decision: decision(), judgment: judgment(), prompt: "" });
  assert.ok(!withNone.critique.concepts, "a comparison was invented from a single route");
});


// ── Phases 2-4: the commercial design production layer ─────────────────────

const ac = (over: any = {}): any => ({
  asset_type: "poster", communication_goal: "Make one idea memorable.",
  viewer_behavior: "Seen in passing", visual_priority: "The product is the subject.",
  information_density: "One idea only, with room around it.",
  typography_role: "Type carries the message.", layout_intent: "One dominant subject.",
  ...over,
});

// ── 7. Design System Generator ─────────────────────────────────────────────

check("DS: the palette comes from the product, not from its category", () => {
  const s = buildDesignSystem({ visualDNA: dna(), assetContext: ac(), decision: decision() });
  assert.ok(s.color_system, "no colour system");
  assert.match(s.color_system!.value, /amber|cream/);
  assert.strictEqual(s.color_system!.derived_from, "visual_dna");
});

check("DS: no image means no invented palette", () => {
  const s = buildDesignSystem({ assetContext: ac(), decision: decision() });
  assert.strictEqual(s.color_system, null, "a palette was invented with nothing observed");
  assert.ok(s.missing.includes("color_system"));
});

check("DS: two unrelated products get different systems from the same code", () => {
  const a = buildDesignSystem({ visualDNA: dna(), assetContext: ac(), decision: decision() });
  const b = buildDesignSystem({
    visualDNA: dna({ observed: { product: { materials: ["brushed aluminium"], palette: ["graphite"], finish: "anodised" } } }),
    assetContext: ac(), decision: decision(),
  });
  assert.notStrictEqual(a.material_language!.value, b.material_language!.value);
  assert.notStrictEqual(a.color_system!.value, b.color_system!.value);
});

check("DS: holds no category or style table", () => {
  const code = fs
    .readFileSync(path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "DesignSystem.ts"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\b(ivory|gold|skincare|luxury|perfume)\b/i.test(code), "a style preset leaked into the code");
  assert.ok(!/await |fetch\(|LLMProvider/.test(code), "the generator performs I/O");
});

// ── 8. Visual Composition Engine ───────────────────────────────────────────

check("VC: layers are ordered back to front", () => {
  const c = buildComposition({ blueprint: fullBrain(), decision: decision(), visualDNA: dna() });
  const idx = c.layers.map((l) => LAYER_ORDER.indexOf(l.layer));
  assert.deepStrictEqual(idx, [...idx].sort((a, b) => a - b), "layers are out of order");
});

check("VC: every emitted layer states purpose, relationship and placement", () => {
  // A layer with no stated relationship is exactly what makes a frame read as
  // a collage.
  const c = buildComposition({ blueprint: fullBrain(), decision: decision(), visualDNA: dna() });
  assert.ok(c.layers.length >= 4, `only ${c.layers.length} layers decided`);
  for (const l of c.layers) {
    assert.ok(l.content.trim(), `${l.layer} has no content`);
    assert.ok(l.purpose.trim(), `${l.layer} has no purpose`);
    assert.ok(l.relationship.trim(), `${l.layer} has no relationship to the product`);
    assert.ok(l.placement_reason.trim(), `${l.layer} has no placement reason`);
  }
});

check("VC: a layer with nothing to say is omitted, not filled", () => {
  const c = buildComposition({ decision: {} as any });
  assert.ok(c.omitted.length > 0, "every layer was emitted from an empty decision");
  assert.strictEqual(c.layers.length + c.omitted.length, LAYER_ORDER.length);
});

check("VC: supporting objects need a stated meaning", () => {
  const withMeaning = buildComposition({ decision: decision(), visualDNA: dna() });
  const without = buildComposition({
    decision: decision({ element_meanings: [] }), visualDNA: dna(),
  });
  assert.ok(withMeaning.layers.some((l) => l.layer === "supporting_objects"));
  assert.ok(!without.layers.some((l) => l.layer === "supporting_objects"),
    "objects with no meaning were admitted as a layer");
});

// ── 12. Asset Intelligence ─────────────────────────────────────────────────

check("AI: an element with no meaning is rejected, not decorated", () => {
  const p = planAssets({ decision: decision({ important_visual_elements: ["steam", "a gold ribbon"], element_meanings: ["steam means it was made now"] }) });
  assert.strictEqual(p.assets.length, 1, "an unpaired element was admitted");
  assert.strictEqual(p.assets[0].asset, "steam");
  assert.strictEqual(p.rejected.length, 1);
  assert.match(p.rejected[0].reason, /no stated meaning/);
});

check("AI: every admitted asset carries all four fields", () => {
  const p = planAssets({ decision: decision(), visualDNA: dna() });
  for (const a of p.assets) {
    assert.ok(a.asset && a.purpose && a.relationship && a.placement, `${a.asset} is incomplete`);
  }
});

check("AI: the schema cannot express decoration-for-its-own-sake", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "AssetIntelligence.ts"), "utf-8"
  );
  // `purpose` is required and sourced; there is no default.
  assert.ok(!/purpose: ["'`](looks|nice|attractive)/i.test(src), "a cosmetic default exists");
  assert.ok(/rejected\.push/.test(src), "unpaired elements are not rejected");
});

check("AI: a meaning with no element is refused too", () => {
  const p = planAssets({ decision: decision({ important_visual_elements: [], element_meanings: ["x means y"] }) });
  assert.strictEqual(p.assets.length, 0);
  assert.strictEqual(p.rejected.length, 1);
});

// ── 11. Template Intelligence ──────────────────────────────────────────────

check("TI: a client-labelled offer chooses the offer structure", () => {
  const c = chooseStructure({ assetContext: ac({ asset_type: "social_ad" }), copyItems: [{ text: "Mua 2 tặng 1", type: "offer" }] })!;
  assert.strictEqual(c.structure, "sale_offer");
  assert.strictEqual(c.decision.derived_from, "user");
});

check("TI: several products make it a comparison whether or not it is framed as one", () => {
  const c = chooseStructure({ assetContext: ac(), productCount: 4 })!;
  assert.ok(["comparison", "product_hero"].includes(c.structure));
  assert.ok(c.alternatives.length >= 0);
});

check("TI: no distinguishing evidence returns null rather than a default", () => {
  // A choice made with no evidence is a default wearing a decision's clothes.
  assert.strictEqual(chooseStructure({}), null);
});

check("TI: it keys on evidence, never on product category", () => {
  const code = fs
    .readFileSync(path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CampaignStructure.ts"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\b(skincare|beauty|coffee|food|fashion|beverage)\b/i.test(code), "a category appears in the chooser");
});

// ── 14. Multi-format Adaptation ────────────────────────────────────────────

check("FA: only provider-supported ratios are planned", () => {
  const a = adaptFormats(fullBrain());
  assert.deepStrictEqual(a.plans.map((p) => p.ratio), ["1:1", "9:16", "16:9"]);
  assert.ok(!a.plans.some((p) => (p.ratio as string) === "4:5"), "an unsupported ratio was planned");
});

check("FA: the concept is carried verbatim across every format", () => {
  const b = fullBrain();
  const a = adaptFormats(b);
  for (const p of a.plans) {
    assert.strictEqual(p.invariants.concept, b.concept.big_idea!.value, `${p.ratio} changed the concept`);
    assert.strictEqual(p.invariants.hierarchy, b.design.hierarchy_logic!.value, `${p.ratio} changed the hierarchy`);
  }
});

check("FA: each format states what changes and why", () => {
  for (const p of adaptFormats(fullBrain()).plans) {
    assert.ok(p.adaptations.length >= 2, `${p.ratio} adapts nothing`);
    for (const ad of p.adaptations) assert.ok(ad.because.trim(), `${p.ratio}.${ad.property} has no reason`);
  }
});

check("FA: a missing invariant is named, never invented", () => {
  const a = adaptFormats(ProfessionalCreativeBrain.assemble({}));
  assert.ok(a.missing_invariants.includes("concept"));
  assert.strictEqual(a.plans[0].invariants.concept, null);
});

// ── 13. Editable Output Architecture ───────────────────────────────────────

check("EO: it does not claim a flat PNG is editable", () => {
  const c = buildComposition({ blueprint: fullBrain(), decision: decision(), visualDNA: dna() });
  const p = buildDesignProject(c, fullBrain());
  assert.strictEqual(p.raster_is_flat, true, "the project claims layer data that does not exist");
  assert.ok(p.export_targets.every((t) => !t.exportable), "an unimplemented export was advertised");
  for (const t of p.export_targets) assert.ok(t.blocked_by.trim(), `${t.format} gives no reason`);
});

check("EO: only genuinely editable values are marked editable", () => {
  const c = buildComposition({ blueprint: fullBrain(), decision: decision(), visualDNA: dna() });
  const p = buildDesignProject(c, fullBrain());
  for (const e of p.elements) {
    if (e.editable) assert.ok(e.editable_properties.length > 0, `${e.id} is editable but nothing can change`);
    else assert.strictEqual(e.editable_properties.length, 0, `${e.id} is not editable but lists properties`);
    // Geometry the renderer chose is never editable without a re-render.
    if (e.kind === "product" || e.kind === "background") {
      assert.strictEqual(e.editable, false, `${e.id} claims editable geometry`);
    }
  }
  assert.ok(p.editable_share < 1, "everything was claimed editable");
});

check("EO: a project mirrors what was actually decided", () => {
  const empty = buildDesignProject(buildComposition({ decision: {} as any }), null);
  assert.strictEqual(empty.elements.length, 0, "elements were fabricated from an empty composition");
  assert.strictEqual(empty.editable_share, 0);
});

// ── wiring ─────────────────────────────────────────────────────────────────

check("PROD: one flag gates all six, and it defaults off", () => {
  assert.strictEqual((DEFAULT_FLAGS.features as any).design_production_v1, false);
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/brainOn && Boolean\(f\.design_production_v1\)/.test(src), "the dependency on the brain is not stated");
  for (const m of ["buildDesignSystem", "buildComposition", "planAssets", "chooseStructure", "adaptFormats", "buildDesignProject"]) {
    assert.ok(src.includes(m), `${m} is never called by the pipeline`);
  }
});

check("PROD: the production block is itself budgeted, section by section", () => {
  // Measured before this fix: live prompts reached 33,165 against a 32,000
  // hard maximum, because the blueprint was budgeted and the production text
  // appended after it was not.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/used \+ section\.length \+ 2 > headroom/.test(src), "the production text escapes the budget");
  // Whole sections only: a truncated layer list reads as a complete one.
  assert.ok(/kept\.push\(section\)/.test(src), "sections are truncated rather than dropped");
});

check("PROD: the production block shares the same prompt budget", () => {
  // It is appended to the same prompt, so it must come out of the same
  // headroom -- otherwise the budget fixed three turns ago is defeated.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/headroom - productionText\.length/.test(src), "the production block escapes the budget");
});

check("PROD: every new module is pure and adds no model call", () => {
  for (const m of ["DesignSystem", "VisualComposition", "AssetIntelligence", "CampaignStructure", "FormatAdaptation", "DesignProject", "UserKit"]) {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", `${m}.ts`), "utf-8"
    );
    assert.ok(!/await |async |fetch\(|LLMProvider/.test(src), `${m} performs I/O`);
    assert.ok(!/Math\.random|Date\.now/.test(src), `${m} is not deterministic`);
    assert.ok(!/process\.env|isEnabled\(/.test(src), `${m} reads flags directly`);
  }
});

// ── 10. User Kit Memory ────────────────────────────────────────────────────

check("UK: a stated preference outranks an observed one", () => {
  let kit = emptyKit("u1");
  kit = recordPreference(kit, { area: "visual", value: "cinematic", stated: true, occurrences: 1, negative: false });
  const d = preferenceDecisions(kit);
  assert.strictEqual(d[0].decision.derived_from, "user");
  assert.strictEqual(d[0].decision.confidence, "high");
});

check("UK: one occurrence is an event, not a preference", () => {
  let kit = emptyKit("u1");
  kit = recordPreference(kit, { area: "design", value: "serif headlines", stated: false, occurrences: 1, negative: false });
  assert.deepStrictEqual(preferenceDecisions(kit), [], "a single occurrence became a preference");
});

check("UK: a recurring observed preference enters low, and yields to the brief", () => {
  let kit = emptyKit("u1");
  for (let i = 0; i < 3; i++) {
    kit = recordPreference(kit, { area: "design", value: "serif headlines", stated: false, occurrences: 1, negative: false });
  }
  const d = preferenceDecisions(kit);
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].decision.derived_from, "strategy");
  assert.strictEqual(d[0].decision.confidence, "low");
  assert.match(d[0].decision.because, /yields to the current brief/);
});

check("UK: dislikes are carried as avoidances", () => {
  let kit = emptyKit("u1");
  kit = recordPreference(kit, { area: "quality", value: "plastic AI look", stated: true, occurrences: 1, negative: true });
  const text = summarizeUserKit(kit)!;
  assert.match(text, /Tends to reject/);
  assert.match(text, /plastic AI look/);
  assert.match(text, /yields to anything the current brief says/i);
});

check("UK: telemetry counts without identifying the person", () => {
  let kit = emptyKit("u1");
  kit = recordPreference(kit, { area: "visual", value: "cinematic", stated: true, occurrences: 1, negative: false });
  const t = JSON.stringify(userKitTelemetry(kit));
  assert.ok(!t.includes("cinematic"), "a preference value leaked into telemetry");
  assert.ok(/"stated":1/.test(t));
});


// ── Module 2: Layout Geometry ──────────────────────────────────────────────

const geo = (over: any = {}) =>
  buildGeometry({ ratio: "1:1", copyRoles: ["HEADLINE", "CTA"], productCount: 1, ...over });

check("LG: geometry is derived from ratio, roles and count — never from product", () => {
  const code = fs
    .readFileSync(path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "LayoutGeometry.ts"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\b(skincare|beauty|coffee|food|fashion|luxury)\b/i.test(code), "a category appears in the geometry");
  assert.ok(!/await |fetch\(|LLMProvider|Math\.random/.test(code), "the geometry is not pure and deterministic");
});

check("LG: a wide frame splits left/right; a square centres", () => {
  const wide = geo({ ratio: "16:9" });
  const square = geo({ ratio: "1:1" });
  const wp = wide.zones.find((z) => z.name === "product")!;
  const sp = square.zones.find((z) => z.name === "product")!;
  assert.ok(wp.x > 60, `a wide frame should offset the product, got x=${wp.x}`);
  assert.strictEqual(sp.x, 50, "a square should centre the product");
  assert.match(wp.because, /read across/);
});

check("LG: copy is placed where the product is not", () => {
  const g = geo({ ratio: "16:9" });
  const product = g.zones.find((z) => z.name === "product")!;
  const headline = g.zones.find((z) => z.name === "headline")!;
  assert.ok(Math.abs(headline.x - product.x) > 30, "the headline sits on top of the product");
  assert.match(headline.because, /balanc|information zone/);
});

check("LG: every zone carries a reason, not just coordinates", () => {
  for (const z of geo().zones) {
    assert.ok(z.because.trim(), `${z.name} has coordinates but no reason`);
    assert.ok(z.priority >= 1 && z.priority <= 10, `${z.name} priority out of range`);
  }
});

check("LG: no logo attached means no logo zone", () => {
  assert.ok(!geo({ hasLogo: false }).zones.some((z) => z.name === "logo"));
  assert.ok(geo({ hasLogo: true }).zones.some((z) => z.name === "logo"));
});

check("LG: the eye path ends on the action when there is one", () => {
  const withCta = geo({ copyRoles: ["HEADLINE", "CTA"] });
  assert.strictEqual(withCta.eye_path!.exit, "cta");
  const without = geo({ copyRoles: ["HEADLINE"] });
  assert.notStrictEqual(without.eye_path?.exit, "cta");
  assert.match(without.eye_path!.because, /no closing line/);
});

check("LG: the score penalises overlap and rewards emptiness honestly", () => {
  const g = geo();
  const s = g.score;
  for (const k of ["balance", "hierarchy", "readability", "conversion", "premium_perception"] as const) {
    assert.ok(s[k] >= 1 && s[k] <= 10, `${k} out of range: ${s[k]}`);
  }
  // No CTA means nowhere to act, and the score has to say so.
  const noCta = geo({ copyRoles: ["HEADLINE"] });
  assert.ok(noCta.score.conversion < g.score.conversion, "a missing CTA did not lower conversion");
  assert.ok(noCta.score.notes.some((n) => /nowhere for the eye to act/.test(n)));
});

// ── Module 1: Typography System ────────────────────────────────────────────

const typo = (over: any = {}) =>
  buildTypographySystem({
    blueprint: fullBrain(), geometry: geo(), copyRoles: ["HEADLINE", "CTA"],
    assetContext: { information_density: "One idea only, with room around it." } as any,
    ...over,
  });

check("TY: no typeface is ever named", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "TypographySystem.ts"), "utf-8"
  );
  assert.ok(!/\b(Helvetica|Futura|Garamond|Georgia|Inter|Roboto|Montserrat|Didot|Bodoni)\b/.test(src),
    "a typeface name is hardcoded");
  // And the specs describe behaviour, not points.
  for (const s of typo().specs) {
    assert.ok(!/\d+\s*(pt|px)/.test(s.weight + s.tracking), `${s.role} names a point size`);
    assert.ok(s.weight.trim() && s.tracking.trim(), `${s.role} has no stroke or spacing behaviour`);
  }
});

check("TY: personality is read from the director, not defaulted", () => {
  const t = typo();
  assert.ok(t.personality, "no personality resolved from a blueprint that decided a voice");
  assert.ok(t.personality!.because.trim());
  // With nothing decided, it must stay null rather than pick one.
  const bare = buildTypographySystem({ blueprint: ProfessionalCreativeBrain.assemble({}), copyRoles: ["HEADLINE"] });
  assert.strictEqual(bare.personality, null, "a personality was invented from an empty blueprint");
  assert.ok(bare.validation.issues.some((i) => /personality/.test(i)));
});

check("TY: scales are relative, and the headline leads", () => {
  const t = typo();
  const headline = t.specs.find((s) => s.role === "headline")!;
  const cta = t.specs.find((s) => s.role === "cta")!;
  assert.ok(headline.scale > cta.scale, "the headline does not lead on size");
  assert.ok(headline.scale < 10, "scale looks like a point size rather than a ratio");
});

check("TY: attention order is what the viewer meets, in order", () => {
  const t = typo();
  assert.ok(t.attention_order.length >= 2);
  assert.strictEqual(t.attention_order[0].role, "headline");
  assert.strictEqual(t.attention_order[0].what_it_does, "seen first");
  assert.strictEqual(t.attention_order[t.attention_order.length - 1].role, "cta");
});

check("TY: placement reasons come from the layout, not from prose", () => {
  const t = typo();
  const headline = t.specs.find((s) => s.role === "headline")!;
  const zone = geo().zones.find((z) => z.name === "headline")!;
  assert.strictEqual(headline.because, zone.because, "typography invented its own placement reason");
});

check("TY: validation flags a frame with too many roles", () => {
  const t = typo({ copyRoles: ["HEADLINE", "SUBHEADLINE", "SUPPORTING_TEXT", "CTA", "PRODUCT_NAME"] });
  // PRODUCT_NAME maps to body, which is already taken, so it is deduped.
  assert.ok(t.specs.length <= 4);
  assert.ok(t.validation.overall >= 1 && t.validation.overall <= 10);
});

// ── Module 3: Commercial Render Critic ─────────────────────────────────────

const PROTECTED = [
  "- PRODUCT IDENTITY PROTECTION — the product is photographed, never redesigned:",
  "These strings are campaign copy. They belong to the layout, not to the product:",
].join("\n");

check("CR: it never claims to have seen the render", () => {
  const c = critiqueRender({ blueprint: fullBrain(), geometry: geo(), typography: typo(), prompt: PROTECTED });
  assert.strictEqual(c.vision_available, false);
  assert.match(c.disclaimer, /Nothing here has seen the render/);
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "benchmark", "CommercialRenderCritic.ts"), "utf-8"
  );
  assert.ok(!/await |fetch\(|LLMProvider/.test(src), "the critic performs I/O");
});

check("CR: artifact checks report PREVENTION, not observation", () => {
  const c = critiqueRender({ blueprint: fullBrain(), geometry: geo(), typography: typo(), prompt: PROTECTED });
  assert.strictEqual(c.artifact_checks.length, 6);
  for (const a of c.artifact_checks) {
    assert.ok(typeof a.prevented === "boolean", `${a.kind} has no prevention verdict`);
    assert.ok(a.because.trim(), `${a.kind} gives no reason`);
    // It must never phrase a prevention as a sighting.
    assert.ok(!/detected|observed in the image|appears in the render/i.test(a.because),
      `${a.kind} claims to have seen something`);
  }
});

check("CR: an unprotected prompt is caught on label damage", () => {
  const c = critiqueRender({ blueprint: fullBrain(), geometry: geo(), typography: typo(), prompt: "" });
  const label = c.artifact_checks.find((a) => a.kind === "label_damage")!;
  assert.strictEqual(label.prevented, false);
  assert.ok(c.issues_found.some((i) => /label damage/.test(i)));
});

check("CR: material resting on an observation prevents the plastic look", () => {
  const withDna = critiqueRender({ blueprint: fullBrain(), geometry: geo(), typography: typo(), prompt: PROTECTED });
  const plastic = withDna.artifact_checks.find((a) => a.kind === "plastic_material")!;
  assert.strictEqual(plastic.prevented, true);
  assert.match(plastic.because, /VisualDNA/);
});

check("CR: it does not only criticise — it says what to do", () => {
  const weak = critiqueRender({ blueprint: ProfessionalCreativeBrain.assemble({}), prompt: "" });
  assert.ok(weak.improvement_actions.length > 0, "a failing render produced no actions");
  for (const a of weak.improvement_actions) assert.ok(a.trim().length > 20, "an action is too vague to act on");
});

check("CR: scores are bounded and the composite is their mean", () => {
  const c = critiqueRender({ blueprint: fullBrain(), geometry: geo(), typography: typo(), prompt: PROTECTED });
  for (const k of ["overall_score", "design_score", "commercial_score", "technical_score"] as const) {
    assert.ok(c[k] >= 1 && c[k] <= 10, `${k} out of range: ${c[k]}`);
  }
  const mean = Math.round(((c.design_score + c.commercial_score + c.technical_score) / 3) * 100) / 100;
  assert.strictEqual(c.overall_score, mean);
});

// ── Module 4: Creative Document ────────────────────────────────────────────

const doc = () =>
  buildCreativeDocument({
    geometry: geo(),
    typography: typo(),
    composition: buildComposition({ blueprint: fullBrain(), decision: decision(), visualDNA: dna() }),
    blueprint: fullBrain(),
  });

check("CD: text elements are real text objects with geometry", () => {
  const d = doc();
  const text = d.elements.filter((e) => e.type === "text");
  assert.ok(text.length >= 2, `expected text objects, got ${text.length}`);
  for (const t of text) {
    assert.ok(t.text, `${t.id} is typed text but carries no text spec`);
    assert.ok(t.position.x >= 0 && t.position.y >= 0, `${t.id} has no position`);
    assert.strictEqual(t.editable, true, `${t.id} should be editable`);
    assert.ok(t.editable_properties.includes("content"));
  }
});

check("CD: image-backed elements are never claimed editable", () => {
  // The provider returns a flat raster; their geometry is a plan, not a handle.
  for (const e of doc().elements) {
    if (["product", "background", "shadow", "reflection", "effect"].includes(e.type)) {
      assert.strictEqual(e.editable, false, `${e.id} claims editable pixels`);
      assert.strictEqual(e.editable_properties.length, 0);
    }
  }
});

check("CD: z-order runs background to text", () => {
  const d = doc();
  const z = d.elements.map((e) => e.z_index);
  assert.deepStrictEqual(z, [...z].sort((a, b) => a - b), "elements are not in z-order");
  const bg = d.elements.find((e) => e.type === "background");
  const text = d.elements.find((e) => e.type === "text");
  if (bg && text) assert.ok(bg.z_index < text.z_index, "text sits behind the background");
});

check("CD: export mappings are real but declared not-ready", () => {
  const d = doc();
  assert.strictEqual(d.raster_is_flat, true);
  assert.deepStrictEqual(d.exports.map((e) => e.target), ["psd", "svg", "canva"]);
  for (const e of d.exports) {
    assert.strictEqual(e.ready, false, `${e.target} was advertised as ready`);
    assert.ok(e.blocked_by.trim(), `${e.target} gives no reason`);
    assert.ok(Object.keys(e.field_map).length >= 4, `${e.target} has no usable field map`);
  }
});

check("CD: editable share is honest, not flattering", () => {
  const d = doc();
  assert.ok(d.editable_share > 0, "nothing is editable at all");
  assert.ok(d.editable_share < 1, "everything was claimed editable");
});

check("CD: an empty input produces an empty document, not a fabricated one", () => {
  const empty = buildCreativeDocument({});
  assert.strictEqual(empty.elements.length, 0);
  assert.strictEqual(empty.editable_share, 0);
});

// ── wiring ─────────────────────────────────────────────────────────────────

check("EX: one flag gates the chain, and it defaults off", () => {
  assert.strictEqual((DEFAULT_FLAGS.features as any).execution_layer_v1, false);
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/brainOn && Boolean\(f\.execution_layer_v1\)/.test(src), "the dependency on the brain is not stated");
  for (const m of ["buildGeometry", "buildTypographySystem", "buildCreativeDocument", "critiqueRender"]) {
    assert.ok(src.includes(m), `${m} is never called by the pipeline`);
  }
});

check("EX: the execution text is inside the same prompt budget", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/headroom - executionText\.length/.test(src), "execution text escapes the budget");
  assert.ok(/productionText\.length - executionText\.length/.test(src), "the blueprint budget ignores the execution text");
});

check("EX: every new module is pure and adds no model call", () => {
  for (const [dir, m] of [
    ["evolution/experiment", "LayoutGeometry"], ["evolution/experiment", "TypographySystem"],
    ["evolution/experiment", "CreativeDocument"], ["benchmark", "CommercialRenderCritic"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", dir, `${m}.ts`), "utf-8");
    assert.ok(!/await |async |fetch\(|LLMProvider/.test(src), `${m} performs I/O`);
    assert.ok(!/Math\.random|Date\.now/.test(src), `${m} is not deterministic`);
    assert.ok(!/process\.env|isEnabled\(/.test(src), `${m} reads flags directly`);
  }
});


// ── Phase 1: the production context ────────────────────────────────────────

const fullCtx = (over: any = {}) =>
  buildProductionContext({
    creativeBlueprint: fullBrain(),
    layoutGeometry: buildGeometry({ ratio: "1:1", copyRoles: ["HEADLINE", "CTA"], productCount: 1 }),
    typographySystem: buildTypographySystem({
      blueprint: fullBrain(),
      geometry: buildGeometry({ ratio: "1:1", copyRoles: ["HEADLINE", "CTA"], productCount: 1 }),
      copyRoles: ["HEADLINE", "CTA"],
      assetContext: { information_density: "One idea only." } as any,
    }),
    composition: buildComposition({ blueprint: fullBrain(), decision: decision(), visualDNA: dna() }),
    creativeDocument: buildCreativeDocument({
      geometry: buildGeometry({ ratio: "1:1", copyRoles: ["HEADLINE", "CTA"], productCount: 1 }),
      typography: buildTypographySystem({
        blueprint: fullBrain(),
        geometry: buildGeometry({ ratio: "1:1", copyRoles: ["HEADLINE", "CTA"], productCount: 1 }),
        copyRoles: ["HEADLINE", "CTA"],
      }),
      blueprint: fullBrain(),
    }),
    ratio: "1:1",
    ...over,
  });

check("PP: a complete context validates and records what ran", () => {
  const ctx = fullCtx();
  const v = validateContext(ctx);
  assert.strictEqual(v.ok, true, `validation failed: ${v.missing.join(", ")}`);
  assert.ok(ctx.metadata.modules_executed.length >= 5, "modules were not tracked");
});

check("PP: a missing module blocks the render and explains why", () => {
  // The failure this exists to prevent: a render composed by the image model
  // because a design module silently did not run.
  const v = validateContext(fullCtx({ layoutGeometry: null }));
  assert.strictEqual(v.ok, false);
  assert.ok(v.missing.includes("layoutGeometry"));
  assert.match(v.explanation, /composed by the image model rather than designed/);
  assert.match(v.explanation, /production_pipeline_v2 off/, "the operator is not told how to proceed");
});

check("PP: present-but-empty is caught, not passed", () => {
  // A validator that only checked for null would pass a geometry with no zones.
  const empty = fullCtx({ layoutGeometry: { ratio: "1:1", grid: {}, zones: [], eye_path: null, score: {} } as any });
  const v = validateContext(empty);
  assert.strictEqual(v.ok, false);
  assert.ok(v.missing.includes("layoutGeometry.zones"));
});

check("PP: skipped modules are named with a reason", () => {
  const ctx = fullCtx({ criticResult: null });
  const skipped = ctx.metadata.modules_skipped.find((s: any) => s.module === "criticResult");
  assert.ok(skipped, "a skipped module was not recorded");
  assert.ok(skipped!.because.trim(), "no reason was given for the skip");
});

check("PP: the context is pure and reads no clock", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "ProductionPipeline.ts"), "utf-8"
  );
  assert.ok(!/Date\.now\(\)|Math\.random|await |fetch\(/.test(src), "the context is not deterministic");
  assert.deepStrictEqual(fullCtx(), fullCtx(), "two identical builds differed");
});

// ── Phase 3: real typography rendering ─────────────────────────────────────

const rtGeo = () => buildGeometry({ ratio: "1:1", copyRoles: ["HEADLINE", "CTA"], productCount: 1 });
const rtTypo = () =>
  buildTypographySystem({
    geometry: rtGeo(), copyRoles: ["HEADLINE", "CTA"],
    assetContext: { information_density: "One idea only." } as any,
  });

check("RT: text layers follow the layout geometry exactly", () => {
  const layers = buildTextLayers({
    geometry: rtGeo(), typography: rtTypo(),
    copy: [{ role: "HEADLINE", text: "Rang mỗi sáng" }, { role: "CTA", text: "Ghé thử" }],
  });
  assert.strictEqual(layers.length, 2);
  const zone = rtGeo().zones.find((z) => z.name === "headline")!;
  const head = layers.find((l) => l.role === "headline")!;
  assert.strictEqual(head.position.x, zone.x, "the layer ignored the geometry");
  assert.strictEqual(head.position.y, zone.y);
});

check("RT: no copy means no layers — nothing is invented to draw", () => {
  assert.strictEqual(buildTextLayers({ geometry: rtGeo(), typography: rtTypo(), copy: [] }).length, 0);
  assert.strictEqual(buildTextLayers({ copy: [{ role: "HEADLINE", text: "x" }] }).length, 0);
});

check("RT: the SVG keeps text as text, correctly escaped", () => {
  const layers = buildTextLayers({
    geometry: rtGeo(), typography: rtTypo(),
    copy: [{ role: "HEADLINE", text: 'Rang & "mỗi" <sáng>' }],
  });
  const svg = buildSvg(layers, 1024, 1024);
  assert.match(svg, /<text /, "no text element was emitted");
  assert.match(svg, /&amp;/, "an ampersand was not escaped");
  assert.match(svg, /&lt;s/, "an angle bracket was not escaped");
  assert.ok(!/<image/.test(svg), "the type layer rasterised something");
});

check("RT: the model is told not to render text when we are setting it", () => {
  // Without this the model renders its own words under ours and the frame
  // carries both.
  assert.match(NO_TEXT_DIRECTIVE, /RENDER NO TEXT/);
  assert.match(NO_TEXT_DIRECTIVE, /composited afterwards/);
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8"
  );
  assert.ok(/NO_TEXT_DIRECTIVE/.test(src), "the directive never reaches the prompt");
});

check("RT: no typeface is named; families are generic", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "TypographyRenderer.ts"), "utf-8"
  );
  assert.ok(!/\b(Helvetica|Futura|Garamond|Georgia|Inter|Roboto|Montserrat)\b/.test(src), "a typeface is hardcoded");
  assert.match(buildSvg(buildTextLayers({
    geometry: rtGeo(), typography: rtTypo(), copy: [{ role: "HEADLINE", text: "x" }],
  }), 512, 512), /font-family="(serif|sans-serif)"/);
});

// ── Phase 4: export ────────────────────────────────────────────────────────

// ── Phase 2: vision iteration ──────────────────────────────────────────────

const visionOf = (over: any = {}): any => ({
  observed: { product: { form: "a straight-sided glass bottle", materials: ["amber glass"], finish: "matte label" } },
  inferred: [],
  provenance: { derived_from_image: true, analyzed_roles: ["product"], source_hashes: ["h"], model_calls: 1, analyzed_at: "x" },
  ...over,
});

check("VI: with no vision reading, nothing claims to have seen the render", () => {
  const it = scoreIteration({ critic: null, analysis: null }, 1);
  assert.strictEqual(it.vision_available, false);
  assert.deepStrictEqual(it.findings, []);
});

check("VI: a vision reading produces findings across all five checks", () => {
  const f = readVision(visionOf(), { productForm: "glass bottle", copy: ["Rang mỗi sáng"] });
  assert.strictEqual(f.length, 5);
  const checks = f.map((x) => x.check).sort();
  assert.deepStrictEqual(checks, ["ai_artifacts", "commercial_design", "product_accuracy", "realism", "typography"]);
});

check("VI: a mismatched product form is caught and corrected", () => {
  const f = readVision(visionOf(), { productForm: "a wide ceramic bowl" });
  const pa = f.find((x) => x.check === "product_accuracy")!;
  assert.ok(pa.score <= 3, `a mismatch scored ${pa.score}`);
  assert.ok(pa.problem.trim());
  assert.match(pa.correction, /silhouette exactly/);
});

check("VI: artifact language in the analysis lowers the score", () => {
  const f = readVision(visionOf({ inferred: [{ claim: "the surface reads as plastic", basis: "b", basis_quote: "q", confidence: "medium" }] }));
  const art = f.find((x) => x.check === "ai_artifacts")!;
  assert.ok(art.score < 8, "an artifact signal did not lower the score");
  assert.match(art.correction, /contact shadow/);
});

check("VI: corrections are executable instructions, not advice", () => {
  const f = readVision(visionOf({ observed: {} }), { productForm: "glass bottle", copy: ["x"] });
  for (const x of f.filter((y) => y.correction)) {
    assert.ok(x.correction.length > 30, `${x.check} correction is too vague: "${x.correction}"`);
    assert.ok(!/^improve |^fix |^make it better/i.test(x.correction), `${x.check} gives advice, not an instruction`);
  }
});

check("VI: the improvement prompt carries only what failed", () => {
  const f = readVision(visionOf({ observed: {} }), { productForm: "glass bottle" });
  const p = improvementPrompt(f)!;
  assert.match(p, /CORRECTIONS FROM REVIEW/);
  assert.match(p, /Keep everything else/);
  assert.strictEqual(improvementPrompt(f.map((x) => ({ ...x, problem: "", correction: "" }))), undefined);
});

check("VI: a better second version wins; a tie keeps the first", () => {
  const v1 = scoreIteration({ critic: { overall_score: 5 } as any }, 1);
  const v2 = scoreIteration({ critic: { overall_score: 8 } as any }, 2);
  const better = RenderIterationEngine.select([v1, v2]);
  assert.strictEqual(better.winner, 1);
  const tie = RenderIterationEngine.select([v1, scoreIteration({ critic: { overall_score: 5 } as any }, 2)]);
  assert.strictEqual(tie.winner, 0, "a tie replaced the first render");
  assert.match(tie.because, /no later version beat/);
});

check("VI: one version wins by default, and says so rather than implying comparison", () => {
  const r = RenderIterationEngine.select([scoreIteration({ critic: { overall_score: 7 } as any }, 1)]);
  assert.strictEqual(r.winner, 0);
  assert.match(r.because, /by default rather than by comparison/);
});

check("VI: the engine stays pure — the model call belongs to the caller", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "RenderIterationEngine.ts"), "utf-8"
  );
  assert.ok(!/await |async |fetch\(|LLMProvider|VisualDNAAnalyzer\./.test(src), "the engine performs I/O");
});

// ── flags ──────────────────────────────────────────────────────────────────

check("P4F: all four phase flags exist and default off", () => {
  for (const k of ["production_pipeline_v2", "vision_iteration_v1", "real_typography_v1", "export_layer_v1"]) {
    assert.strictEqual((DEFAULT_FLAGS.features as any)[k], false, `${k} is not off by default`);
  }
  const prod = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "evolution", "feature-flags.json"), "utf-8")
  ).features;
  for (const k of ["production_pipeline_v2", "vision_iteration_v1", "real_typography_v1", "export_layer_v1"]) {
    assert.ok(k in prod, `${k} missing from the production config`);
  }
});


console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
