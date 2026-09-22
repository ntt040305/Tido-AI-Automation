import assert from "assert";
import fs from "fs";
import path from "path";

/**
 * Asset understanding.
 *
 * The property most of these defend is that nothing is looked up.
 *
 * The obvious implementation of "understand the uploaded product" is a category
 * table: classify it, then read off the environments and lighting that suit
 * that category. It demos well and it is the style-preset database this project
 * forbids -- it fails on anything the table has never seen, which for a platform
 * serving every industry is most uploads, and it makes every brand in a
 * category look identical.
 *
 * So the tests below push two products from the SAME category with DIFFERENT
 * surfaces through the reader and require different answers, and push an
 * object from no recognisable category at all and require a real answer. A
 * lookup table cannot pass either.
 *
 * The second property is the one this codebase keeps having to re-enforce:
 * nothing is claimed without an observation behind it.
 */

const {
  buildAssetDNA,
  emptyAssetDNA,
  renderAssetDNA,
  assetDNATelemetry,
} = require("./evolution/experiment/AssetDNA");

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

/** A VisualDNA shaped exactly as the analyzer produces it. */
const dna = (observed: any, inferred: any[] = []) => ({
  observed,
  inferred,
  provenance: {
    derived_from_image: true,
    analyzed_roles: Object.keys(observed),
    source_hashes: ["abc123"],
    model_calls: 1,
    analyzed_at: new Date().toISOString(),
  },
});

const MATTE_MUG = dna({
  product: {
    form: "straight-sided cylinder with a small looped handle",
    materials: ["unglazed stoneware"],
    palette: ["warm off-white", "clay"],
    finish: "matte",
    surface_detail: "visible throwing rings and a slightly gritty rim",
    scale_cues: "sits in a hand",
    condition: "new",
  },
});

const GLOSS_MUG = dna({
  product: {
    form: "straight-sided cylinder with a small looped handle",
    materials: ["glazed porcelain"],
    palette: ["black"],
    finish: "high gloss",
    surface_detail: "a mirror-even glaze",
    scale_cues: "sits in a hand",
    condition: "new",
  },
});

console.log("\nNothing is looked up by category");

check("Two mugs with different surfaces get different treatment", () => {
  // The test a category table cannot pass. Same object, same form, same scale,
  // same words for what it is -- only the surface differs.
  const matte = buildAssetDNA({ visualDNA: MATTE_MUG });
  const gloss = buildAssetDNA({ visualDNA: GLOSS_MUG });

  const m = matte.product.treatment.supports.map((s: any) => s.value).join(" ");
  const g = gloss.product.treatment.supports.map((s: any) => s.value).join(" ");
  assert.notStrictEqual(m, g, "identical treatment for different surfaces -- this is a lookup");
  assert.ok(/falloff|shaping|directional/i.test(m), `matte got: ${m}`);
  assert.ok(/reflect/i.test(g), `gloss got: ${g}`);
});

check("An object in no recognisable category still gets a real reading", () => {
  const odd = buildAssetDNA({
    visualDNA: dna({
      product: {
        form: "an irregular cast shape with no obvious front",
        materials: ["polished brass"],
        palette: ["warm metal"],
        finish: "mirror polish",
      },
    }),
  });
  assert.ok(odd.product, "nothing was read from an unfamiliar object");
  assert.ok(odd.product.treatment.supports.length > 0, "no treatment was derived");
});

check("No category or industry vocabulary appears in the source", () => {
  // The direct check. If a category ever enters this file it will be as a
  // string, and a string is greppable.
  const src = fs.readFileSync(path.join(__dirname, "evolution/experiment/AssetDNA.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const word of [
    "beverage", "cosmetic", "skincare", "jewellery", "jewelry", "fashion",
    "beauty", "snack", "cafe", "restaurant", "luxury", "industry",
  ]) {
    assert.ok(
      !new RegExp(`["'\`][^"'\`]*\\b${word}\\b`, "i").test(code),
      `the category word "${word}" appears in an emitted string`,
    );
  }
});

check("The surface vocabulary is behavioural, not categorical", () => {
  // "matte" is a statement about specular response and is equally true of
  // ceramic, paper and stone. That is why it is allowed to be a constant.
  const paper = buildAssetDNA({
    visualDNA: dna({ product: { form: "folded carton", materials: ["uncoated card"], finish: "matte" } }),
  });
  const stone = buildAssetDNA({
    visualDNA: dna({ product: { form: "a squat vessel", materials: ["raw concrete"], finish: "matte" } }),
  });
  const a = paper.product.treatment.supports[0].value;
  const b = stone.product.treatment.supports[0].value;
  assert.strictEqual(a, b, "the same surface behaviour produced different physics");
});

console.log("\nNothing is claimed without an observation");

check("An analysis that saw no image reads nothing", () => {
  const r = buildAssetDNA({
    visualDNA: {
      observed: { product: { form: "a cylinder", materials: ["stoneware"] } },
      inferred: [],
      provenance: { derived_from_image: false, analyzed_roles: [], source_hashes: [], model_calls: 0, analyzed_at: "" },
    },
  });
  assert.strictEqual(r.product, null, "a product was read from an analysis that never saw a pixel");
  assert.strictEqual(r.provenance.derived_from_image, false);
});

check("No visual DNA at all produces an empty reading", () => {
  assert.deepStrictEqual(buildAssetDNA({}), emptyAssetDNA());
  assert.deepStrictEqual(buildAssetDNA({ visualDNA: null }), emptyAssetDNA());
});

check("An empty product branch is not filled in", () => {
  const r = buildAssetDNA({ visualDNA: dna({ product: {} }) });
  assert.strictEqual(r.product, null, "an empty observation produced a product reading");
});

check("Every decision carries its basis", () => {
  const r = buildAssetDNA({ visualDNA: MATTE_MUG });
  const all = [
    r.product.form, r.product.material, r.product.palette, r.product.texture, r.product.personality,
    ...r.product.treatment.supports, ...r.product.treatment.contradicts,
  ].filter(Boolean);
  assert.ok(all.length > 0);
  for (const d of all) {
    assert.ok(d.because && d.because.length > 10, `a decision has no real basis: ${JSON.stringify(d)}`);
    assert.ok(d.derived_from, "a decision has no provenance");
    assert.ok(["low", "medium", "high"].includes(d.confidence), "a decision has no confidence");
  }
});

check("The basis quotes what was actually observed", () => {
  const r = buildAssetDNA({ visualDNA: MATTE_MUG });
  const supports = r.product.treatment.supports.map((s: any) => s.because).join(" ");
  assert.ok(/matte/.test(supports), "the reasoning does not quote the observation it rests on");
});

check("Colour is read from the image, never from a brand", () => {
  const r = buildAssetDNA({ visualDNA: MATTE_MUG });
  assert.ok(/warm off-white/.test(r.product.palette.value));
  assert.ok(/not inferred from a brand/.test(r.product.palette.because));
});

check("Personality is held at low confidence", () => {
  // The one derived reading in the file. It describes how the object presents,
  // which is visible -- but it is still a reading, so it says so.
  const r = buildAssetDNA({ visualDNA: MATTE_MUG });
  assert.strictEqual(r.product.personality.confidence, "low");
});

check("A visibly used object cannot be staged as pristine", () => {
  const r = buildAssetDNA({
    visualDNA: dna({
      product: { form: "a jar", materials: ["glass"], finish: "matte", condition: "opened, partly used" },
    }),
  });
  const against = r.product.treatment.contradicts.map((c: any) => c.value).join(" ");
  assert.ok(/pristine|untouched/i.test(against), `contradictions were: ${against}`);
});

console.log("\nLogo rules fail safe");

check("Unreadable spacing widens the safe area rather than narrowing it", () => {
  // Being wrong here is a brand-safety failure, not a taste failure.
  const thin = buildAssetDNA({ visualDNA: dna({ logo: { letterform: "geometric sans", weight: "light" } }) });
  const known = buildAssetDNA({
    visualDNA: dna({ logo: { letterform: "geometric sans", weight: "regular", spacing: "generous" } }),
  });
  assert.ok(/full height/.test(thin.logo.safe_area.value), thin.logo.safe_area.value);
  assert.ok(/half/.test(known.logo.safe_area.value), known.logo.safe_area.value);
  assert.strictEqual(thin.logo.safe_area.confidence, "low", "a guessed margin claimed confidence");
});

check("A light mark is protected from reduction", () => {
  const r = buildAssetDNA({ visualDNA: dna({ logo: { letterform: "serif", weight: "hairline" } }) });
  assert.ok(/hold it large/i.test(r.logo.scale_behaviour.value), r.logo.scale_behaviour.value);
});

check("No logo branch means no logo rules invented", () => {
  const r = buildAssetDNA({ visualDNA: MATTE_MUG });
  assert.strictEqual(r.logo, null, "logo rules were produced with no logo observed");
});

console.log("\nSupporting objects are flagged, never deleted");

check("An incoherent support is kept and marked", () => {
  // The director may have chosen the contrast. Deleting it would be this
  // module overruling a decision above its station.
  const r = buildAssetDNA({ visualDNA: MATTE_MUG, supportingRoles: ["polished chrome riser"] });
  assert.strictEqual(r.supporting.length, 1, "the object was dropped rather than flagged");
  assert.strictEqual(r.supporting[0].compatible, false);
  assert.ok(r.supporting[0].relationship.because.includes("stoneware"));
});

check("A substring never inverts a surface reading", () => {
  // "unglazed" contains "glaze". Without word boundaries the matte regex and
  // the specular regex both matched the same surface, so an unglazed mug read
  // as polished and the linen beside it was called incompatible.
  const r = buildAssetDNA({ visualDNA: MATTE_MUG });
  const supports = r.product.treatment.supports.map((s: any) => s.value).join(" ");
  assert.ok(/falloff|shaping|directional/i.test(supports), `unglazed read as: ${supports}`);
  assert.ok(!/worth reflecting/i.test(supports), "an unglazed surface was read as specular");
});

check("A coherent support is not flagged", () => {
  const r = buildAssetDNA({ visualDNA: MATTE_MUG, supportingRoles: ["raw linen cloth"] });
  assert.strictEqual(r.supporting[0].compatible, true);
});

check("Coherence is not assessed when the surface was not read", () => {
  const r = buildAssetDNA({ visualDNA: dna({ product: { form: "a shape", palette: ["grey"] } }), supportingRoles: ["chrome riser"] });
  assert.strictEqual(r.supporting[0].compatible, true, "an unassessable object was marked incompatible");
  assert.strictEqual(r.supporting[0].relationship.confidence, "low");
});

console.log("\nIt reads, and does not look");

check("It makes no model call and touches no bytes", () => {
  // The rule from the brief: do not create another vision system. This module
  // is a pure reading of what VisualDNAAnalyzer already produced.
  const src = fs.readFileSync(path.join(__dirname, "evolution/experiment/AssetDNA.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const forbidden of ["LLMProviderService", "generateChatCompletion", "Buffer", "fetch(", "analyzeImage"]) {
    assert.ok(!code.includes(forbidden), `the reader reaches for ${forbidden}`);
  }
  for (const m of code.matchAll(/^import\s+(?!type)/gm)) {
    assert.fail(`the reader has a runtime import: ${code.slice(m.index!, m.index! + 60)}`);
  }
});

check("The prompt text is absent when nothing was read", () => {
  assert.strictEqual(renderAssetDNA(emptyAssetDNA()), undefined);
  assert.strictEqual(renderAssetDNA(null), undefined);
});

check("The prompt text carries the observations and the reasoning", () => {
  const text = renderAssetDNA(buildAssetDNA({ visualDNA: MATTE_MUG }));
  assert.ok(text.includes("unglazed stoneware"), "the observed surface did not reach the prompt");
  assert.ok(/WHAT THIS SURFACE SUPPORTS/.test(text), "the treatment did not reach the prompt");
  assert.ok(/absorbs specular/.test(text), "the reasoning did not reach the prompt");
});

check("No internal vocabulary reaches the prompt", () => {
  const text = renderAssetDNA(buildAssetDNA({ visualDNA: MATTE_MUG })) || "";
  for (const word of ["VisualDNA", "derived_from", "AssetDNA", "blueprint", "provenance"]) {
    assert.ok(!text.includes(word), `the prompt contains "${word}"`);
  }
});

check("Telemetry counts without leaking what was seen", () => {
  const t = assetDNATelemetry(buildAssetDNA({ visualDNA: MATTE_MUG }));
  const s = JSON.stringify(t);
  assert.ok(!s.includes("stoneware"), "telemetry leaked an observation");
  assert.ok(!s.includes("off-white"), "telemetry leaked the customer's palette");
  assert.strictEqual(t.derived_from_image, true);
  assert.ok(t.product_fields >= 4);
});

check("Unused inferences are recorded rather than discarded", () => {
  const r = buildAssetDNA({
    visualDNA: dna({ product: { form: "a cylinder", materials: ["stoneware"], finish: "matte" } }, [
      { claim: "the brand values craft over polish", basis: "product.finish", basis_quote: "matte", confidence: "medium" },
    ]),
  });
  assert.strictEqual(r.unread.length, 1, "an inference was silently dropped");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
