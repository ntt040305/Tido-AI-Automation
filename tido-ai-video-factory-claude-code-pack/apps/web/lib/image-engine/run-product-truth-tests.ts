import assert from "assert";
import fs from "fs";
import path from "path";
import {
  BRAND_DNA_PROVENANCE,
  Provenance,
  ProductTruth,
  absent,
  buildProductTruth,
  productTruthTelemetry,
  summarizeProductTruth,
} from "./evolution/experiment/ProductTruth";
import { buildContext, toDirectorBrief } from "./evolution/experiment/CreativeDecisionContext";
import { DEFAULT_FLAGS } from "./evolution/feature-flags";
import type { VisualDNA } from "./evolution/experiment/VisualDNAAnalyzer";

/**
 * Phase 1.1A — Product Truth assembly.
 *
 *   npx tsx lib/image-engine/run-product-truth-tests.ts
 *
 * The property most of these defend is not that the object is full. It is that
 * the object never claims more than it can show. Phase 1.0's first attempt
 * failed because a component returned nothing while everything downstream
 * reported success, and a truth layer that guesses is that failure with better
 * vocabulary.
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

const req = (extra: Record<string, unknown> = {}) =>
  ({ concept: "c", useCase: "poster", aspectRatio: "1:1", ...extra }) as any;

const dna = (product?: Record<string, unknown>): VisualDNA =>
  ({
    observed: product ? { product } : {},
    inferred: [],
    provenance: { derived_from_image: true, analyzed_roles: ["PRODUCT"], source_hashes: [] },
  }) as any;

const OBSERVED_BOTTLE = {
  form: "Cylindrical amber glass bottle with rounded sloping shoulders",
  materials: ["Translucent amber glass", "wood"],
  palette: ["amber", "walnut"],
  finish: "matte label, glossy glass",
  surface_detail: "condensation",
  scale_cues: "handheld",
  condition: "new",
};

console.log("\n=== Phase 1.1A — Product Truth ===\n");

// ── the vocabulary is extended, not replaced ──────────────────────────────

check("Provenance is BrandDNA's three levels plus OBSERVED", () => {
  const all: Provenance[] = ["OBSERVED", "DECLARED", "DERIVED", "ABSENT"];
  for (const p of BRAND_DNA_PROVENANCE) {
    assert.ok(all.includes(p), `${p} is in BrandDNA's union but not in Provenance`);
  }
  assert.strictEqual(BRAND_DNA_PROVENANCE.length, 3, "BrandDNA's union changed size");
});

check("BrandDNA's own union was NOT modified by this phase", () => {
  // Extending means adding a level here, not editing an unwired subsystem.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "reasoning", "brand-dna.types.ts"),
    "utf-8"
  );
  assert.ok(
    /"DECLARED" \| "DERIVED" \| "ABSENT"/.test(src),
    "brand-dna.types.ts was edited — this phase must not touch the reasoning subsystem"
  );
  assert.ok(!/OBSERVED/.test(src), "OBSERVED leaked into BrandDNA");
});

check("No parallel TruthProvenance type was created", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "ProductTruth.ts"),
    "utf-8"
  );
  assert.ok(!/TruthProvenance/.test(src), "a parallel provenance noun was introduced");
  assert.ok(/export type Provenance/.test(src), "the shared vocabulary is not exported");
});

// ── sensory is OBSERVED or nothing ────────────────────────────────────────

check("SENSORY — OBSERVED when VisualDNA saw the product", () => {
  const t = buildProductTruth({ request: req(), visualDNA: dna(OBSERVED_BOTTLE) });
  assert.strictEqual(t.sensory.provenance, "OBSERVED");
  assert.ok(t.sensory.value.includes("amber glass"), "the observation did not reach the value");
  assert.strictEqual(t.sensory.basis, "VisualDNA.observed.product");
  assert.deepStrictEqual(t.sensory.observed, OBSERVED_BOTTLE, "the raw observation was not carried");
});

check("SENSORY — ABSENT when no VisualDNA ran, and says so", () => {
  const t = buildProductTruth({ request: req(), visualDNA: null });
  assert.strictEqual(t.sensory.provenance, "ABSENT");
  assert.strictEqual(t.sensory.value, "");
  assert.ok(/no VisualDNA analysis/.test(t.sensory.basis), "the reason is not stated");
});

check("SENSORY — ABSENT when VisualDNA ran but saw no product", () => {
  // The Phase 1.0 failure mode: the component ran and returned nothing. That
  // must be distinguishable from never having run.
  const t = buildProductTruth({ request: req(), visualDNA: dna() });
  assert.strictEqual(t.sensory.provenance, "ABSENT");
  assert.ok(/ran but reported no product/.test(t.sensory.basis), "the two absences are conflated");
});

check("SENSORY — can never be DECLARED or DERIVED, whatever the request says", () => {
  const t = buildProductTruth({
    request: req({
      concept: "a matte ceramic jar in sage green",
      salesContext: { benefit: "made of hand-thrown stoneware" },
      creativeDirection: { visual_style: "glossy porcelain" },
    }),
    visualDNA: null,
  });
  assert.strictEqual(t.sensory.provenance, "ABSENT", "a material was inferred from text");
  assert.strictEqual(t.sensory.value, "", "a sensory value was invented from the concept");
});

// ── functional truth is declared, never guessed ───────────────────────────

check("FUNCTIONAL — DECLARED from salesContext.benefit, with the quote as basis", () => {
  const t = buildProductTruth({
    request: req({ salesContext: { benefit: "cold brewed for 18 hours, never heated" } }),
  });
  assert.strictEqual(t.functional_truth.provenance, "DECLARED");
  assert.strictEqual(t.functional_truth.value, "cold brewed for 18 hours, never heated");
  assert.ok(t.functional_truth.basis.includes("salesContext.benefit"), "the basis is not checkable");
  assert.ok(t.functional_truth.basis.includes("18 hours"), "the basis does not quote the source");
});

check("FUNCTIONAL — falls back to product_name, and prefers benefit when both exist", () => {
  const nameOnly = buildProductTruth({ request: req({ salesContext: { product_name: "Cold Brew 18h" } }) });
  assert.strictEqual(nameOnly.functional_truth.provenance, "DECLARED");
  assert.strictEqual(nameOnly.functional_truth.value, "Cold Brew 18h");
  const both = buildProductTruth({
    request: req({ salesContext: { product_name: "Cold Brew 18h", benefit: "never heated" } }),
  });
  assert.strictEqual(both.functional_truth.value, "never heated", "the weaker source won");
});

check("FUNCTIONAL — ABSENT when nothing was declared, never taken from the concept", () => {
  const t = buildProductTruth({ request: req({ concept: "a premium artisanal small-batch cold brew" }) });
  assert.strictEqual(t.functional_truth.provenance, "ABSENT", "the concept was mined for a function");
  assert.strictEqual(t.functional_truth.value, "");
});

// ── the three that would need a judgement ─────────────────────────────────

check("DERIVED fields stay ABSENT, and each says why", () => {
  const t = buildProductTruth({
    request: req({
      creativeDirection: { emotional_tone: "warm and nostalgic" },
      marketingContext: { target_channel: "instagram", target_audience: "office workers 24-35" },
    }),
    visualDNA: dna(OBSERVED_BOTTLE),
  });
  for (const k of ["differentiation", "emotional_value", "usage_context"] as const) {
    assert.strictEqual(t[k].provenance, "ABSENT", `${k} was filled without a DERIVED tier`);
    assert.strictEqual(t[k].value, "", `${k} carries a value it cannot justify`);
    assert.ok(/DERIVED tier not implemented/.test(t[k].basis), `${k} does not explain its absence`);
  }
});

check("emotional_tone is not relabelled as the product's emotional value", () => {
  const t = buildProductTruth({
    request: req({ creativeDirection: { emotional_tone: "warm and nostalgic" } }),
  });
  assert.ok(
    !t.emotional_value.value.includes("nostalgic"),
    "an aesthetic choice was promoted to a product truth"
  );
});

check("marketingContext is not relabelled as usage context", () => {
  const t = buildProductTruth({
    request: req({ marketingContext: { target_audience: "office workers", target_channel: "instagram" } }),
  });
  assert.ok(!t.usage_context.value.includes("office"), "the ad audience became the product's user");
  assert.ok(!t.usage_context.value.includes("instagram"), "the ad channel became a usage context");
});

// ── completeness tells the truth about itself ─────────────────────────────

check("completeness counts only what is known", () => {
  const nothing = buildProductTruth({ request: req() });
  assert.strictEqual(nothing.completeness, 0, "an empty request reported known fields");

  const sensoryOnly = buildProductTruth({ request: req(), visualDNA: dna(OBSERVED_BOTTLE) });
  assert.strictEqual(sensoryOnly.completeness, 0.2);

  const both = buildProductTruth({
    request: req({ salesContext: { benefit: "never heated" } }),
    visualDNA: dna(OBSERVED_BOTTLE),
  });
  assert.strictEqual(both.completeness, 0.4, "the best case today is 2 of 5");
});

check("A value is non-empty exactly when its provenance is not ABSENT", () => {
  for (const input of [
    { request: req() },
    { request: req({ salesContext: { benefit: "b" } }), visualDNA: dna(OBSERVED_BOTTLE) },
    { request: req(), visualDNA: dna() },
  ]) {
    const t = buildProductTruth(input as any);
    for (const k of ["functional_truth", "differentiation", "sensory", "emotional_value", "usage_context"] as const) {
      const c = t[k];
      assert.strictEqual(
        c.value.length > 0,
        c.provenance !== "ABSENT",
        `${k}: value and provenance disagree (${c.provenance}, "${c.value}")`
      );
      assert.ok(c.basis.length > 0, `${k} has no basis`);
    }
  }
});

check("absent() is the only shape an unknown takes", () => {
  const a = absent("because");
  assert.deepStrictEqual(a, { value: "", provenance: "ABSENT", basis: "because" });
});

// ── purity ────────────────────────────────────────────────────────────────

check("buildProductTruth is pure and does not mutate the request", () => {
  const r = req({ salesContext: { benefit: "never heated" } });
  const before = JSON.stringify(r);
  const a = buildProductTruth({ request: r, visualDNA: dna(OBSERVED_BOTTLE) });
  const b = buildProductTruth({ request: r, visualDNA: dna(OBSERVED_BOTTLE) });
  assert.strictEqual(JSON.stringify(r), before, "the request was mutated");
  assert.deepStrictEqual(a, b, "two identical calls produced different objects");
});

// ── the flag is a real switch ─────────────────────────────────────────────

check("OFF — the context has no product_truth KEY at all", () => {
  // Not undefined: absent. `deepStrictEqual` distinguishes them and the
  // equivalence test the previous phases rest on depends on that.
  const ctx = buildContext({ request: req(), assetIntent: null });
  assert.ok(!("product_truth" in ctx), "the key exists with the flag off");
});

check("OFF — the director brief is what it always was", () => {
  // Superseded in 1.1B for the ON arm: the whole point of that phase is that
  // the flag now changes the brief. What must still hold is that the OFF arm is
  // untouched, and that ON differs by exactly one key — asserted in the 1.1B
  // block below.
  const base = { request: req({ salesContext: { benefit: "never heated" } }), assetIntent: null };
  const off = toDirectorBrief(buildContext(base as any)) as any;
  assert.ok(!("productTruth" in off), "the key exists with the flag off");
  assert.ok(!("product_truth" in off), "the raw object leaked into the brief");
});

check("ON — the context carries the object, and the rest of the context is unchanged", () => {
  const base = { request: req({ salesContext: { benefit: "never heated" } }), assetIntent: null };
  const off = buildContext(base as any);
  const on = buildContext({ ...base, productTruth: true } as any);
  assert.ok(on.product_truth, "the object is missing with the flag on");
  const { product_truth, ...rest } = on as any;
  assert.deepStrictEqual(rest, off, "enabling the flag changed something other than product_truth");
});

check("The flag exists, defaults off, and rides on the decision context", () => {
  assert.strictEqual((DEFAULT_FLAGS.features as any).product_truth_v1, false, "it does not default off");
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(
    /const productTruthOn = contextV1 && Boolean\(f\.product_truth_v1\)/.test(src),
    "the gate is wrong"
  );
  assert.ok(/PRODUCT_TRUTH\] enabled without creative_decision_context_v1/.test(src), "an inert run is not warned about");
  assert.ok(/"product_truth_v1",/.test(src), "the flag would warn as unimplemented");
});

// ── telemetry leaks nothing ───────────────────────────────────────────────

check("Telemetry reports provenance labels, never the client's words", () => {
  const t = buildProductTruth({
    request: req({ salesContext: { benefit: "cold brewed for 18 hours" } }),
    visualDNA: dna(OBSERVED_BOTTLE),
  });
  const tel = JSON.stringify(productTruthTelemetry(t));
  assert.ok(!tel.includes("18 hours"), "declared client text leaked into telemetry");
  assert.ok(!tel.includes("amber"), "observed product text leaked into telemetry");
  assert.ok(tel.includes("DECLARED") && tel.includes("OBSERVED"), "the labels are missing");
  assert.deepStrictEqual(productTruthTelemetry(null), { product_truth: false });
});

// ── nothing else moved ────────────────────────────────────────────────────

check("Phase 0 contract files were not touched", () => {
  // CreativeDirectorV1 is deliberately excluded: 1.1B adds one optional string
  // to `DirectorBriefInput` and one conditional line to the user prompt, which
  // is the same shape `assetContext`, `visualDNA` and `routes` already took.
  // The three below carry the Phase 0 contracts and must stay clear.
  const base = path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment");
  for (const f of ["CreativeDecision.ts", "CreativeDirectionResolver.ts", "NanoBananaPromptComposer.ts"]) {
    const src = fs.readFileSync(path.join(base, f), "utf-8");
    assert.ok(!/ProductTruth|product_truth/.test(src), `${f} was drawn into this phase`);
  }
});

check("The director was EXTENDED, not rewritten", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  // Additive only: an optional field beside the ones already there, and one
  // conditional line beside the one that emits visualDNA.
  assert.ok(/productTruth\?: string;/.test(src), "the optional field is missing");
  assert.ok(/brief\.visualDNA \?/.test(src), "the visualDNA line was disturbed");
  assert.ok(/judge\(/.test(src), "judge() signature is gone");
  // No judgment-shape change: this phase adds to what the director is TOLD,
  // never to what it returns. Matched as a JSON key, because the flag name
  // legitimately appears in the doc comment explaining when the field is sent.
  assert.ok(!/"product_truth"\s*:/.test(src), "product truth leaked into the judgment shape");
  assert.ok(!/"productTruth"\s*:/.test(src), "product truth leaked into the judgment shape");
});

// ── Phase 1.1B — rendering into the brief ────────────────────────────────

check("1.1B — the brief carries product truth when the flag is on, and not when off", () => {
  const base = { request: req({ salesContext: { benefit: "cold brewed 18 hours" } }), assetIntent: null };
  const off = toDirectorBrief(buildContext(base as any)) as any;
  const on = toDirectorBrief(buildContext({ ...base, productTruth: true } as any)) as any;
  assert.ok(!("productTruth" in off), "the key exists with the flag off");
  assert.ok(typeof on.productTruth === "string" && on.productTruth.length > 0, "nothing reached the brief");
  const { productTruth, ...restOn } = on;
  assert.deepStrictEqual(restOn, off, "enabling the flag changed something other than productTruth");
});

check("1.1B — DECLARED reaches the brief as a fact, with the client's own words", () => {
  const b = summarizeProductTruth(
    buildProductTruth({ request: req({ salesContext: { benefit: "cold brewed 18 hours, never heated" } }) })
  )!;
  assert.ok(/DECLARED BY THE CLIENT/.test(b), "declared information is not labelled as declared");
  assert.ok(b.includes("cold brewed 18 hours, never heated"), "the declared value did not reach the brief");
  assert.ok(/not a claim to improve on/.test(b), "the director is not told to treat it as fact");
});

check("1.1B — the OBSERVED sensory line is NOT repeated: visualDNA owns it", () => {
  // The duplicate-carrier rule. `summarizeVisualDNA` already puts form,
  // materials, finish and palette in the same brief; saying it twice is the
  // defect this project has paid for twice.
  const t = buildProductTruth({ request: req(), visualDNA: dna(OBSERVED_BOTTLE) });
  assert.strictEqual(t.sensory.provenance, "OBSERVED", "precondition: the observation exists");
  const b = summarizeProductTruth(t) || "";
  assert.ok(!/amber/.test(b), "the material observation was repeated into the brief");
  assert.ok(!/Cylindrical/.test(b), "the form observation was repeated into the brief");
});

check("1.1B — an observed product is NOT listed as not-established", () => {
  const b = summarizeProductTruth(
    buildProductTruth({ request: req(), visualDNA: dna(OBSERVED_BOTTLE) })
  )!;
  assert.ok(
    !/what the product physically is/.test(b),
    "the brief tells the director the product is unknown while visualDNA describes it"
  );
});

check("1.1B — ABSENT fields are named so the director does not invent them", () => {
  const b = summarizeProductTruth(buildProductTruth({ request: req() }))!;
  assert.ok(/NOT ESTABLISHED/.test(b), "absences are not stated");
  assert.ok(/different from others in its category/.test(b), "differentiation absence not named");
  assert.ok(/worth to someone/.test(b), "emotional value absence not named");
  assert.ok(/actually used/.test(b), "usage context absence not named");
  assert.ok(/Do not invent them/.test(b), "the director is not told what to do about an absence");
});

check("1.1B — no interpretation is generated; that is 1.1C", () => {
  const b = summarizeProductTruth(
    buildProductTruth({
      request: req({ salesContext: { benefit: "cold brewed 18 hours" } }),
      visualDNA: dna(OBSERVED_BOTTLE),
    })
  )!;
  // Every non-heading line is either a copy of a declared value or a named
  // absence. Nothing asserts what any of it MEANS.
  for (const word of ["premium", "luxury", "craftsmanship", "ritual", "artisanal", "heritage"]) {
    assert.ok(!new RegExp(word, "i").test(b), `the renderer interpreted the product as "${word}"`);
  }
});

check("1.1B — the renderer is pure and returns undefined for nothing", () => {
  assert.strictEqual(summarizeProductTruth(null), undefined);
  assert.strictEqual(summarizeProductTruth(undefined), undefined);
  const t = buildProductTruth({ request: req({ salesContext: { benefit: "b" } }) });
  assert.strictEqual(summarizeProductTruth(t), summarizeProductTruth(t), "two calls differ");
});

check("1.1B — the director prompt actually emits the field", () => {
  // The Phase 0 defect class: a field on the brief that no prompt line reads.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  assert.ok(/productTruth\?: string;/.test(src), "the brief contract does not declare the field");
  assert.ok(/brief\.productTruth \?/.test(src), "the user prompt never reads brief.productTruth");
});

// ── 1.1B — every stated claim carries its source ────────────────────────────

check("1.1B — a declared fact is printed with the evidence that entitles it", () => {
  const b = summarizeProductTruth(
    buildProductTruth({ request: req({ salesContext: { benefit: "ủ lạnh 18 tiếng, không dùng nhiệt" } }) })
  )!;
  assert.ok(b.includes("ủ lạnh 18 tiếng, không dùng nhiệt"), "the claim did not reach the brief");
  assert.ok(/Known because the client wrote:/.test(b), "the claim reaches the brief with no source");
  // The source has to sit with the claim, not in a footnote the director may
  // never reach.
  const lines = b.split("\n");
  const claimAt = lines.findIndex((l) => /WHAT IT DOES:/.test(l));
  assert.ok(claimAt >= 0);
  assert.match(lines[claimAt + 1], /Known because the client wrote:/, "the source is not on the next line");
});

check("1.1B — the source quotes the client rather than paraphrasing", () => {
  const benefit = "rang mỗi sáng tại quán";
  const t = buildProductTruth({ request: req({ salesContext: { benefit } }) });
  const b = summarizeProductTruth(t)!;
  assert.ok(t.functional_truth.basis.includes(benefit), "the stored basis is not the client's words");
  assert.ok(b.includes(t.functional_truth.basis), "the brief prints a basis other than the stored one");
});

check("1.1B — a claim with no basis is withheld rather than asserted unsourced", () => {
  // An unsourced assertion in a creative brief cannot be told apart from an
  // invention, which is the whole failure mode ProductTruth exists to prevent.
  const t = buildProductTruth({ request: req({ salesContext: { benefit: "cold brewed 18 hours" } }) });
  const stripped = { ...t, functional_truth: { ...t.functional_truth, basis: "   " } };
  const b = summarizeProductTruth(stripped as any) || "";
  assert.ok(!/WHAT IT DOES:/.test(b), "an unsourced claim was printed as a fact");
  assert.ok(!/DECLARED BY THE CLIENT/.test(b), "an empty declared section was printed");
});

check("1.1B — provenance survives the round trip into the brief", () => {
  const t = buildProductTruth({ request: req({ salesContext: { benefit: "ủ lạnh 18 tiếng" } }) });
  assert.strictEqual(t.functional_truth.provenance, "DECLARED", "provenance was lost before the brief");
  const b = summarizeProductTruth(t)!;
  assert.ok(/DECLARED BY THE CLIENT/.test(b), "the brief does not say how the claim is known");
  assert.ok(/NOT ESTABLISHED/.test(b), "the brief no longer distinguishes known from unknown");
});

check("1.1B — rendering the brief adds no model call and no agent", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "ProductTruth.ts"),
    "utf-8"
  );
  assert.ok(!/await |fetch\(|generateChatCompletion|LLMProvider/.test(src), "ProductTruth performs I/O");
  assert.ok(!/class .*Service|class .*Agent/.test(src), "ProductTruth introduces a service");
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
