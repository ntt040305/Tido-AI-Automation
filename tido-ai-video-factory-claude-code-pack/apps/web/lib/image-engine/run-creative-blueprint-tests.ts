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
  assert.ok(/blueprintFor\?: \(judgment: CreativeJudgment \| null\)/.test(src), "the wrapper takes no blueprint");
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
  assert.strictEqual(r.scores.length, 5);
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


console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
