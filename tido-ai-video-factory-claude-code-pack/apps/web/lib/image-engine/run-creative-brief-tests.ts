import assert from "assert";
import fs from "fs";
import path from "path";
import {
  ALL_BRIEF_SOURCES,
  BRIEF_FIELDS,
  BRIEF_SOURCES,
  CreativeBrief,
  briefTelemetry,
  summarizeCreativeBrief,
  validateBrief,
} from "./evolution/experiment/CreativeBrief";
import { CreativeBriefBuilderService } from "./evolution/experiment/CreativeBriefBuilderService";
import { buildProductTruth } from "./evolution/experiment/ProductTruth";
import { buildContext, toDirectorBrief } from "./evolution/experiment/CreativeDecisionContext";
import { DEFAULT_FLAGS } from "./evolution/feature-flags";

/**
 * Phase 1.1B — ProductTruth + VisualDNA + Strategy → Creative Brief.
 *
 *   npx tsx lib/image-engine/run-creative-brief-tests.ts
 *
 * Offline and free. The builder is a deterministic transformation, which is the
 * property most of these defend: the moment it needs a model to fill a field it
 * has started authoring, and authoring is the one thing it may not do.
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

const req = (over: any = {}): any => ({
  concept: "Giới thiệu cold brew pha mỗi sáng",
  brandName: "Cafe Florian",
  useCase: "Poster",
  aspectRatio: "9:16",
  images: [{ role: "PRODUCT" }],
  marketingContext: { objective: "ra mắt sản phẩm", target_audience: "người đi làm" },
  ...over,
});

const visualDNA = (over: any = {}): any => ({
  observed: {
    product: {
      form: "a straight-sided glass bottle with a wooden cap",
      materials: ["amber glass", "wood"],
      palette: ["amber", "cream"],
      finish: "matte label paper",
      surface_detail: "a printed paper band",
    },
  },
  inferred: [],
  provenance: {
    derived_from_image: true,
    analyzed_roles: ["product"],
    source_hashes: ["h"],
    model_calls: 1,
    analyzed_at: "2026-09-19T00:00:00.000Z",
  },
  ...over,
});

const strategy = (over: any = {}): any => ({
  creative_angle: "the shop that is already awake",
  commercial_goal: "footfall before 8am",
  target_customer_psychology: "commuters decide in three seconds",
  prompt_guidance: "keep it unstyled",
  consumer_insight: "they do not want a better coffee, they want to stop being late",
  emotional_response: "recognition, not aspiration",
  creative_message: "the shop opens before you do",
  ...over,
});

const truthWith = (benefit?: string, dna?: any) =>
  buildProductTruth({
    request: req(benefit ? { salesContext: { benefit } } : {}),
    visualDNA: dna,
  } as any);

console.log("\n=== Phase 1.1B — Creative Brief ===\n");

// ── 1. ProductTruth correctly creates a CreativeBrief ───────────────────────

check("A declared benefit becomes the product story", () => {
  const b = CreativeBriefBuilderService.build({
    productTruth: truthWith("ủ lạnh 18 tiếng, không dùng nhiệt"),
  });
  assert.ok(b.product_story, "no story was built from a declared benefit");
  assert.ok(b.product_story!.value.includes("ủ lạnh 18 tiếng"), "the client's words did not reach the story");
  assert.deepStrictEqual(b.product_story!.derived_from, [BRIEF_SOURCES.FUNCTIONAL_TRUTH]);
});

check("An analysed image becomes the visual opportunity, read off the image", () => {
  const b = CreativeBriefBuilderService.build({
    productTruth: truthWith("ủ lạnh 18 tiếng", visualDNA()),
    visualDNA: visualDNA(),
  });
  assert.ok(b.visual_opportunity, "nothing was built from the observation");
  assert.match(b.visual_opportunity!.value, /amber glass/);
  assert.deepStrictEqual(b.visual_opportunity!.derived_from, [BRIEF_SOURCES.OBSERVED_PRODUCT]);
});

check("Strategy supplies the consumer problem when it is available", () => {
  const b = CreativeBriefBuilderService.build({
    productTruth: truthWith("ủ lạnh 18 tiếng"),
    strategy: strategy(),
  });
  assert.ok(b.consumer_problem, "strategy was supplied and the problem is still missing");
  assert.match(b.consumer_problem!.value, /stop being late/);
  assert.deepStrictEqual(b.consumer_problem!.derived_from, [
    BRIEF_SOURCES.CONSUMER_INSIGHT,
    BRIEF_SOURCES.CUSTOMER_PSYCHOLOGY,
  ]);
});

check("avoid_direction is derived from what is ABSENT, not from what is known", () => {
  // The most useful thing this layer produces, and it costs no new information.
  const b = CreativeBriefBuilderService.build({ productTruth: truthWith("ủ lạnh 18 tiếng") });
  assert.ok(b.avoid_direction, "nothing was said about what not to build on");
  assert.match(b.avoid_direction!.value, /Do not build the idea on/);
  assert.match(b.avoid_direction!.value, /different from others in its category/);
  assert.deepStrictEqual(b.avoid_direction!.derived_from, [BRIEF_SOURCES.ABSENT_CLAIMS]);
  assert.ok(
    !b.avoid_direction!.value.includes("ủ lạnh"),
    "a known fact was listed as something not to build on"
  );
});

check("The full input set produces a complete, valid brief", () => {
  const b = CreativeBriefBuilderService.build({
    productTruth: truthWith("ủ lạnh 18 tiếng", visualDNA()),
    visualDNA: visualDNA(),
    strategy: strategy(),
  });
  assert.deepStrictEqual(validateBrief(b), []);
  assert.strictEqual(b.completeness, 1);
  assert.deepStrictEqual(b.missing, []);
});

// ── 2. every creative field has provenance ──────────────────────────────────

check("No field exists without naming what produced it", () => {
  const b = CreativeBriefBuilderService.build({
    productTruth: truthWith("ủ lạnh 18 tiếng", visualDNA()),
    visualDNA: visualDNA(),
    strategy: strategy(),
  });
  for (const name of BRIEF_FIELDS) {
    const f = b[name];
    if (!f) continue;
    assert.ok(f.value.trim(), `${name} has no value`);
    assert.ok(f.derived_from.length > 0, `${name} is creative output with no source`);
  }
});

check("Every cited source is one this phase can actually read", () => {
  const b = CreativeBriefBuilderService.build({
    productTruth: truthWith("ủ lạnh 18 tiếng", visualDNA()),
    visualDNA: visualDNA(),
    strategy: strategy(),
  });
  for (const name of BRIEF_FIELDS) {
    for (const s of b[name]?.derived_from || []) {
      assert.ok(ALL_BRIEF_SOURCES.includes(s), `${name} cites an unreadable source: ${s}`);
    }
  }
});

check("A source that contributed nothing is not cited", () => {
  // A provenance list naming inputs the value does not rest on is a worse lie
  // than no list, because it survives review.
  const b = CreativeBriefBuilderService.build({ productTruth: truthWith("ủ lạnh 18 tiếng") });
  assert.ok(
    !b.product_story!.derived_from.includes(BRIEF_SOURCES.USAGE_CONTEXT),
    "an ABSENT claim was cited as a source"
  );
});

check("validateBrief rejects a field with an empty source list", () => {
  const b = CreativeBriefBuilderService.build({ productTruth: truthWith("ủ lạnh 18 tiếng") });
  (b.product_story as any).derived_from = [];
  const v = validateBrief(b);
  assert.ok(v.some((x) => /creative output with no source/.test(x.rule)), "an unsourced field validated clean");
});

check("validateBrief rejects a source invented outside the known set", () => {
  const b = CreativeBriefBuilderService.build({ productTruth: truthWith("ủ lạnh 18 tiếng") });
  (b.product_story as any).derived_from = ["Director.intuition"];
  assert.ok(validateBrief(b).some((x) => /cannot read/.test(x.rule)));
});

check("validateBrief reports every violation, not just the first", () => {
  const b = CreativeBriefBuilderService.build({
    productTruth: truthWith("ủ lạnh 18 tiếng", visualDNA()),
    visualDNA: visualDNA(),
  });
  (b.product_story as any).derived_from = [];
  (b.visual_opportunity as any).derived_from = [];
  assert.strictEqual(validateBrief(b).length, 2, "the validator stopped early");
});

check("validateBrief catches a completeness figure that lies", () => {
  const b = CreativeBriefBuilderService.build({ productTruth: truthWith("ủ lạnh 18 tiếng") });
  b.completeness = 1;
  assert.ok(validateBrief(b).some((x) => /completeness says/.test(x.rule)));
});

// ── 3. missing data never crashes ───────────────────────────────────────────

check("No ProductTruth at all: a brief is still returned", () => {
  const b = CreativeBriefBuilderService.build({});
  assert.ok(b, "the builder returned nothing");
  assert.strictEqual(b.completeness, 0);
  assert.deepStrictEqual(b.missing, [...BRIEF_FIELDS]);
  assert.deepStrictEqual(validateBrief(b), [], "an empty brief is not valid");
});

check("Null and undefined inputs are survived, not thrown on", () => {
  for (const input of [{}, { productTruth: null }, { productTruth: undefined, visualDNA: null, strategy: null }]) {
    const b = CreativeBriefBuilderService.build(input as any);
    assert.strictEqual(typeof b.completeness, "number");
  }
});

check("A malformed VisualDNA does not take the brief down", () => {
  const b = CreativeBriefBuilderService.build({
    productTruth: truthWith("ủ lạnh 18 tiếng"),
    visualDNA: { observed: {} } as any,
  });
  assert.ok(b.product_story, "one bad input suppressed an unrelated field");
});

check("Partial inputs report real completeness, not a flattering one", () => {
  // Truth only: story, visual opportunity (from sensory) and avoid_direction
  // can ground; the two strategy fields cannot.
  const b = CreativeBriefBuilderService.build({ productTruth: truthWith("ủ lạnh 18 tiếng", visualDNA()) });
  assert.ok(b.missing.includes("consumer_problem"), "consumer_problem was not reported missing");
  assert.ok(b.completeness < 1 && b.completeness > 0, `expected partial completeness, got ${b.completeness}`);
  assert.strictEqual(
    b.completeness,
    Math.round(((5 - b.missing.length) / 5) * 100) / 100,
    "completeness does not match the missing list"
  );
});

check("Missing fields are named, and the director is told not to fill them", () => {
  const text = summarizeCreativeBrief(
    CreativeBriefBuilderService.build({ productTruth: truthWith("ủ lạnh 18 tiếng") })
  )!;
  assert.match(text, /NOT ANSWERED/);
  assert.match(text, /consumer problem/);
  assert.match(text, /resting on something nobody/);
});

check("A brief with nothing in it renders as nothing, not as an empty heading", () => {
  assert.strictEqual(summarizeCreativeBrief(CreativeBriefBuilderService.build({})), undefined);
  assert.strictEqual(summarizeCreativeBrief(null), undefined);
});

// ── 4. no new LLM call, no new agent ────────────────────────────────────────

const BUILDER = path.join(
  process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeBriefBuilderService.ts"
);
const SCHEMA = path.join(
  process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeBrief.ts"
);

check("The builder performs no I/O and calls no model", () => {
  for (const p of [BUILDER, SCHEMA]) {
    const src = fs.readFileSync(p, "utf-8");
    assert.ok(!/await |async |fetch\(|LLMProvider|generateChatCompletion/.test(src), `${path.basename(p)} performs I/O`);
    assert.ok(!/process\.env|isEnabled\(|DEFAULT_FLAGS/.test(src), `${path.basename(p)} reads flags or env`);
    assert.ok(!/Math\.random|Date\.now|new Date\(/.test(src), `${path.basename(p)} is not deterministic`);
  }
});

check("The transformation is deterministic: same input, same brief", () => {
  const args = {
    productTruth: truthWith("ủ lạnh 18 tiếng", visualDNA()),
    visualDNA: visualDNA(),
    strategy: strategy(),
  };
  assert.deepStrictEqual(
    CreativeBriefBuilderService.build(args),
    CreativeBriefBuilderService.build(args)
  );
});

check("No new agent was introduced", () => {
  const src = fs.readFileSync(BUILDER, "utf-8");
  assert.ok(!/Agent|judge\(|prompt\s*=/.test(src), "the builder looks like an agent");
  // One class, with one static method. Not a service that holds state.
  assert.strictEqual((src.match(/export class/g) || []).length, 1);
  assert.ok(/static build\(/.test(src), "the builder is not a pure static transformation");
});

check("No category, industry or house-style table exists", () => {
  const code = fs
    .readFileSync(BUILDER, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    !/\b(skincare|cosmetic|beauty|fashion|apparel|beverage|electronics|automotive)\b/i.test(code),
    "a product category appears in the builder's code"
  );
  assert.ok(!/CATEGORY_|INDUSTRY_|STYLE_PRESET/.test(code), "a preset table exists");
});

check("The brief does not duplicate an existing provenance vocabulary", () => {
  // The words may appear in a source PATH (`OBSERVED_PRODUCT` points at
  // `VisualDNA.observed.product`) and in the prose explaining why no fifth
  // vocabulary exists. What must not exist is a declaration of one.
  const code = fs
    .readFileSync(SCHEMA, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    !/"OBSERVED"|"DECLARED"|"DERIVED"|"ABSENT"/.test(code),
    "a fifth provenance enum was declared"
  );
  assert.ok(!/type \w*Provenance\b/.test(code), "the brief declares its own provenance type");
  // It must reuse the paths into the four existing schemas instead.
  assert.ok(/ProductTruth\./.test(code) && /VisualDNA\./.test(code), "the brief does not cite existing schemas");
});

// ── 5. the regression surface: flag off changes nothing ─────────────────────

check("The flag exists and defaults to off", () => {
  assert.strictEqual((DEFAULT_FLAGS.features as any).creative_brief_v1, false);
});

check("With the flag off the context has no brief key at all", () => {
  const ctx = buildContext({ request: req(), assetIntent: null, productTruth: true } as any);
  assert.ok(!("creative_brief" in ctx), "the key exists with the flag off");
});

check("With the flag off the director brief is byte-identical", () => {
  const args: any = { request: req({ salesContext: { benefit: "ủ lạnh 18 tiếng" } }), assetIntent: null, productTruth: true };
  const off = toDirectorBrief(buildContext({ ...args }));
  const on = toDirectorBrief(buildContext({ ...args, creativeBrief: true }));
  assert.ok(!("creativeBrief" in off), "the brief key leaked with the flag off");
  assert.ok(typeof on.creativeBrief === "string" && on.creativeBrief.length > 0, "nothing reached the director");
  const { creativeBrief, ...restOn } = on as any;
  assert.deepStrictEqual(restOn, off, "enabling the flag changed something other than creativeBrief");
});

check("A brief cannot run without ProductTruth, and the pipeline enforces it", () => {
  const ctx = buildContext({ request: req(), assetIntent: null, creativeBrief: true } as any);
  assert.ok(!("creative_brief" in ctx), "a brief was built with no truth object to read");
  const pipeline = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    /productTruthOn && Boolean\(f\.creative_brief_v1\)/.test(pipeline),
    "the pipeline does not state the dependency"
  );
});

check("The director reads the brief below the facts it was read from", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  assert.ok(/creativeBrief\?: string;/.test(src), "the contract does not declare the field");
  assert.ok(/brief\.creativeBrief \?/.test(src), "the prompt never reads brief.creativeBrief");
  assert.ok(
    src.indexOf("brief.productTruth ?") < src.indexOf("brief.creativeBrief ?"),
    "the reading is printed above the facts it rests on"
  );
});

// ── telemetry ───────────────────────────────────────────────────────────────

check("Telemetry reports sources and completeness, and leaks no brief text", () => {
  const b = CreativeBriefBuilderService.build({
    productTruth: truthWith("ủ lạnh 18 tiếng", visualDNA()),
    visualDNA: visualDNA(),
    strategy: strategy(),
  });
  const t: any = briefTelemetry(b);
  const s = JSON.stringify(t);
  assert.ok(!s.includes("ủ lạnh"), "a brief value leaked into telemetry");
  assert.ok(!s.includes("stop being late"), "strategy text leaked into telemetry");
  assert.strictEqual(t.filled, 5);
  assert.ok(t.sources_cited.includes(BRIEF_SOURCES.OBSERVED_PRODUCT));
  assert.deepStrictEqual(briefTelemetry(null), { brief: false });
});

check("Telemetry names the missing fields, which is the number to watch", () => {
  const t: any = briefTelemetry(CreativeBriefBuilderService.build({ productTruth: truthWith("ủ lạnh 18 tiếng") }));
  assert.ok(t.missing.includes("consumer_problem"));
  assert.ok(t.completeness < 1);
});

// ── the boundaries of this phase ────────────────────────────────────────────

check("No Art Director, Photographer or Typography layer was added", () => {
  const dir = path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment");
  for (const n of fs.readdirSync(dir)) {
    assert.ok(!/ArtDirector|Photographer|TypographyDirector/.test(n), `out-of-scope module added: ${n}`);
  }
});

check("The brief does not reach the compiler or the renderer", () => {
  for (const f of [
    "compiler/MasterPromptCompilerService.ts",
    "service/ArtDirectionResolverService.ts",
    "evolution/experiment/NanoBananaPromptComposer.ts",
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", f), "utf-8");
    assert.ok(!/CreativeBrief/.test(src), `${f} references the brief`);
  }
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
