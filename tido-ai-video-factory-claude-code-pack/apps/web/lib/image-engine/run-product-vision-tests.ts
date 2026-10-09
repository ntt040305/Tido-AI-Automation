/**
 * The product-vision pass and the material physics. MOCKED vision, no cost.
 *
 * WHAT THIS PROVES, AND THE ONE THING IT CANNOT
 * ---------------------------------------------
 * It proves the whole chain around the call: the question names the panels the renderer
 * will see, a valid answer changes the lighting and the lens, an invalid one changes
 * nothing, the cache works, a timeout is survivable, and print-rule branch (c) becomes
 * reachable exactly when branding is both present and LEGIBLE.
 *
 * It cannot prove that a real vision model reads a real photograph correctly. Nothing
 * mocked can — a stubbed reply is a fixture I wrote. `scripts/eval-product-vision.ts` is
 * the guarded, unrun script for that, and it costs money.
 *
 * THE LOAD-BEARING TEST IN HERE
 * -----------------------------
 * `the industry cannot change what the material decides`. `material-physics.ts` is the one
 * file in this work that looks most like the thing the design forbids — a table of
 * creative constants — and the difference is only what the key is: optical behaviour that
 * was OBSERVED, not what a product is for. That distinction has to be asserted, not
 * asserted in a comment.
 *
 * No network, no model call, no provider call, no cost.
 */
import assert from "assert";

import { GPT_BRIEF_FIXTURES, allocationFor, fixtureById, type GptBriefFixture } from "./prompt-v2/gpt-brief-fixtures";
import {
  buildArtDirectionSheet,
  printRuleForSheet,
  detectedBrandingFrom,
  type SheetInput,
} from "./prompt-v2/art-direction/art-direction-sheet";
import {
  clearVisionCache,
  panelsToAsk,
  parseProductVision,
  productVisionMessages,
  productVisionPrompt,
  productVisionTelemetry,
  readProductVision,
  visionCacheKey,
  type ProductVision,
} from "./prompt-v2/art-direction/product-vision";
import { familyOf, physicsFor, readMaterials, sizeFor } from "./prompt-v2/art-direction/material-physics";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    const first = (e as Error).message.split("\n").slice(0, 2).join("\n    ");
    failures.push(`${name}\n    ${first}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${first}`);
  }
}

const SHEET_BYTES = [{ buffer: Buffer.from("fake-sheet-one"), mimeType: "image/png" }];

/** A vision answer for one product, with everything else defaulted. */
function visionItem(panel: string, over: Partial<ProductVision["products"][number]> = {}) {
  return {
    panel,
    materials: [],
    size_class: "",
    dominant_colours: [],
    printed_branding: { present: false, description: "", legible: false },
    notes: "",
    ...over,
  };
}

/** The five material cases the spec names, as mocked replies. */
const GLASS_DRINK = visionItem("1", {
  materials: ["clear glass", "liquid", "ice"],
  size_class: "fits in a hand",
  dominant_colours: ["#8a5a2b"],
});
const MATTE_BOX = visionItem("1", { materials: ["matte card", "kraft paper"], size_class: "two-handed" });
const METAL_DEVICE = visionItem("1", { materials: ["brushed metal", "glass"], size_class: "fits in a hand" });
const FABRIC_ITEM = visionItem("1", { materials: ["cotton fabric", "leather"], size_class: "tabletop" });
const MIXED = visionItem("1", { materials: ["clear glass", "matte plastic"], size_class: "fits in a hand" });

/** A sheet built for one fixture with a mocked vision answer attached. */
function sheetWith(fx: GptBriefFixture, products: ProductVision["products"], over: Partial<SheetInput> = {}) {
  return buildArtDirectionSheet({
    assetType: fx.assetType,
    aspectRatio: fx.aspectRatio,
    industry: fx.industry,
    concept: fx.concept,
    brand: fx.brand,
    copy: fx.copy,
    products: fx.products.map((p, i) => ({ id: String(i + 1), description: p.description })),
    allocation: allocationFor(fx),
    productFacts: fx.productFacts,
    productVision: { products },
    ...over,
  });
}

async function main() {
  console.log("\nProduct vision tests (mocked)\n");

  // ── 1. The question ────────────────────────────────────────────────────
  console.log("the question names what the renderer will see");
  await check("panels come from the allocation, not the upload list", () => {
    const five = panelsToAsk(allocationFor(fixtureById("05_five_drinks_prices_florian")));
    assert.strictEqual(five.length, 5, "five products should yield five panels");
    // Two sheets, lettered panels — the language section C uses.
    assert.ok(five.some((p) => p.slot === 1), "nothing on Image 1");
    assert.ok(five.some((p) => p.slot === 2), "nothing on Image 2");
    assert.ok(five.every((p) => /^[A-Z]$/.test(p.panel)), `expected letters, got ${JSON.stringify(five)}`);

    const one = panelsToAsk(allocationFor(fixtureById("01_one_product_square")));
    // A product that travels whole is named by its slot, not by a panel letter.
    assert.deepStrictEqual(one, [{ slot: 1, panel: "1" }]);
  });
  await check("the prompt gives every field a way to say 'I cannot tell'", () => {
    const text = productVisionPrompt([{ slot: 1, panel: "A" }]);
    assert.ok(/Empty array if you cannot tell/i.test(text), "materials has no escape hatch");
    assert.ok(/"" if you cannot tell/i.test(text), "size_class has no escape hatch");
    assert.ok(/Do not guess at letters/i.test(text), "nothing forbids guessing at lettering");
    assert.ok(/legible is FALSE/i.test(text), "the present-but-illegible case is not explained");
    assert.ok(/annotations, not products/i.test(text), "the contact-sheet annotations are not excluded");
  });
  await check("the sheets are attached as images, once each", () => {
    const messages = productVisionMessages([{ slot: 1, panel: "A" }], [
      { buffer: Buffer.from("a") },
      { buffer: Buffer.from("b") },
    ]);
    const content = messages[1].content as Array<{ type: string }>;
    assert.strictEqual(content.filter((c) => c.type === "image_url").length, 2);
    assert.strictEqual(content.filter((c) => c.type === "text").length, 1);
  });

  // ── 2. Parsing is tolerant about place, strict about shape ─────────────
  console.log("\nparsing");
  await check("JSON wrapped in prose or fences is found", () => {
    const wrapped = 'Here you go:\n```json\n{"products":[{"panel":"A","printed_branding":{"present":false,"legible":false}}]}\n```';
    const parsed = parseProductVision(wrapped);
    assert.ok(parsed, "valid JSON inside a fence was not found");
    assert.strictEqual(parsed!.products[0].panel, "A");
    // Defaults fill the fields the model omitted, so a partial answer is still usable.
    assert.deepStrictEqual(parsed!.products[0].materials, []);
  });
  await check("a wrong shape is null, not a half-parsed object", () => {
    // `printed_branding` missing entirely: accepting this would activate the wrong
    // print-rule branch on a product whose branding nobody looked at.
    assert.strictEqual(parseProductVision('{"products":[{"panel":"A"}]}'), null);
    assert.strictEqual(parseProductVision('{"products":[]}'), null, "an empty list is not an answer");
    assert.strictEqual(parseProductVision("not json at all"), null);
    assert.strictEqual(parseProductVision('{"products":"A"}'), null);
    assert.strictEqual(parseProductVision(""), null);
  });

  // ── 3. Reliability: it can never end a render ──────────────────────────
  console.log("\nreliability");
  await check("a valid reply is used and cached", async () => {
    clearVisionCache();
    let calls = 0;
    const chat = async () => {
      calls += 1;
      return JSON.stringify({ products: [GLASS_DRINK] });
    };
    const alloc = allocationFor(fixtureById("01_one_product_square"));
    const first = await readProductVision(alloc, SHEET_BYTES, { chat });
    assert.strictEqual(first.source, "model");
    assert.strictEqual(first.vision?.products.length, 1);
    const second = await readProductVision(alloc, SHEET_BYTES, { chat });
    assert.strictEqual(second.source, "cache", "the second read paid for the same answer again");
    assert.strictEqual(calls, 1, `the client was called ${calls} times`);
  });
  await check("the cache key is the bytes plus the question", () => {
    const a = visionCacheKey([Buffer.from("x")], "pv1");
    assert.strictEqual(a, visionCacheKey([Buffer.from("x")], "pv1"), "not stable");
    assert.notStrictEqual(a, visionCacheKey([Buffer.from("y")], "pv1"), "different bytes, same key");
    assert.notStrictEqual(a, visionCacheKey([Buffer.from("x")], "pv2"), "a new question reused an old answer");
  });
  await check("invalid JSON falls back without throwing", async () => {
    clearVisionCache();
    const result = await readProductVision(allocationFor(fixtureById("01_one_product_square")), SHEET_BYTES, {
      chat: async () => "I am not going to answer that.",
    });
    assert.strictEqual(result.vision, null);
    assert.strictEqual(result.source, "failed");
    assert.ok(result.reason, "no reason was recorded");
  });
  await check("a thrown client falls back without throwing", async () => {
    clearVisionCache();
    const result = await readProductVision(allocationFor(fixtureById("01_one_product_square")), SHEET_BYTES, {
      chat: async () => {
        throw new Error("upstream 503");
      },
    });
    assert.strictEqual(result.vision, null);
    assert.ok(/503/.test(result.reason || ""), `the reason was lost: ${result.reason}`);
  });
  await check("a hanging client times out rather than holding the render open", async () => {
    clearVisionCache();
    const result = await readProductVision(allocationFor(fixtureById("01_one_product_square")), SHEET_BYTES, {
      chat: () => new Promise<string>(() => {}),
      timeoutMs: 40,
    });
    assert.strictEqual(result.vision, null);
    assert.ok(/timed out/i.test(result.reason || ""), `expected a timeout, got ${result.reason}`);
  });
  await check("no panels or no bytes is skipped, not failed", async () => {
    clearVisionCache();
    const noBytes = await readProductVision(allocationFor(fixtureById("01_one_product_square")), [], {
      chat: async () => {
        throw new Error("must not be called");
      },
    });
    assert.strictEqual(noBytes.source, "skipped");
    const noPanels = await readProductVision(null, SHEET_BYTES, {
      chat: async () => {
        throw new Error("must not be called");
      },
    });
    assert.strictEqual(noPanels.source, "skipped");
  });
  await check("a failed pass leaves the sheet exactly as it is without one", () => {
    const fx = fixtureById("01_one_product_square");
    const withoutVision = sheetWith(fx, []);
    const noVision = buildArtDirectionSheet({
      assetType: fx.assetType,
      aspectRatio: fx.aspectRatio,
      industry: fx.industry,
      concept: fx.concept,
      brand: fx.brand,
      copy: fx.copy,
      products: fx.products.map((p, i) => ({ id: String(i + 1), description: p.description })),
      allocation: allocationFor(fx),
      productFacts: fx.productFacts,
    });
    assert.deepStrictEqual(withoutVision.lighting, noVision.lighting);
    assert.deepStrictEqual(withoutVision.camera, noVision.camera);
    assert.strictEqual(withoutVision.material_lighting_note, null);
  });

  // ── 4. The physics, keyed on behaviour and not on purpose ──────────────
  console.log("\nmaterial physics");
  await check("each family is recognised from what the pass actually saw", () => {
    assert.strictEqual(familyOf("clear glass"), "transmissive");
    assert.strictEqual(familyOf("frosted glass"), "transmissive", "frosted glass is transmissive first");
    assert.strictEqual(familyOf("brushed metal"), "metallic");
    assert.strictEqual(familyOf("glossy plastic"), "specular");
    assert.strictEqual(familyOf("glazed ceramic"), "specular", "glazed ceramic is specular, not scattering");
    assert.strictEqual(familyOf("kraft paper"), "scattering");
    assert.strictEqual(familyOf("something nobody named"), null);
    assert.strictEqual(familyOf(""), null);
  });
  await check("the dominant material is the one with the largest visible area", () => {
    const reading = readMaterials(["clear glass", "matte plastic"]);
    assert.strictEqual(reading?.dominant, "transmissive", "the first-listed material did not win");
    assert.strictEqual(reading?.secondary, "specular", "matte plastic reads specular by its plastic");
    assert.strictEqual(readMaterials([]), null);
    assert.strictEqual(readMaterials(["moonbeams"]), null, "an unrecognised material invented a family");
  });
  await check("lighting differs by material, and each answer is the physical one", () => {
    const glass = physicsFor(GLASS_DRINK)!;
    const matte = physicsFor(MATTE_BOX)!;
    const metal = physicsFor(METAL_DEVICE)!;
    const fabric = physicsFor(FABRIC_ITEM)!;

    // Transparent: lit THROUGH, or it reads as grey plastic.
    assert.ok(/^back_/.test(glass.lighting.key), `glass was lit from ${glass.lighting.key}`);
    assert.ok(/travels\s+THROUGH/i.test(glass.lighting.note), "the glass note does not say light passes through");
    assert.strictEqual(glass.lighting.rim, true, "a transparent product lost its rim");

    // Matte: raking, or the texture flattens.
    assert.ok(/^side_/.test(matte.lighting.key), `matte card was lit from ${matte.lighting.key}`);
    assert.ok(/rakes across/i.test(matte.lighting.note), "the matte note does not rake");

    // Metal: strip reflections.
    assert.ok(/strip reflections/i.test(metal.lighting.note), "the metal note has no strips");

    // Fabric is scattering, like card — the same optical answer, which is the point.
    assert.strictEqual(fabric.material.dominant, "scattering");
    assert.strictEqual(fabric.lighting.key, matte.lighting.key);

    // All four distinct where they should be.
    const notes = new Set([glass, matte, metal].map((p) => p.lighting.note));
    assert.strictEqual(notes.size, 3, "two different materials produced the same lighting note");
  });
  await check("a mixed product lights for the dominant and fills the secondary", () => {
    const mixed = physicsFor(MIXED)!;
    assert.strictEqual(mixed.material.dominant, "transmissive");
    assert.ok(mixed.lighting.secondary_note, "the secondary material got no fill rule");
    assert.ok(/gradient highlight|hot spot/i.test(mixed.lighting.secondary_note!));
  });
  await check("size changes the lens, in the direction geometry requires", () => {
    // Small needs LONGER: at a wide angle you must get close enough to stretch the near edge.
    assert.ok((sizeFor("fits in a hand")?.lens_delta_mm ?? 0) > 0);
    assert.ok((sizeFor("furniture-sized")?.lens_delta_mm ?? 0) < 0);
    assert.strictEqual(sizeFor("tabletop")?.lens_delta_mm, 0);
    assert.strictEqual(sizeFor(""), null);
    assert.strictEqual(sizeFor("unverified"), null, "the unverified sentinel produced a lens change");
    // A large product is seen from its own eye level.
    assert.strictEqual(sizeFor("furniture-sized")?.height, "subject_line");
  });
  await check("no materials means no physics, so nothing can act on a guess", () => {
    assert.strictEqual(physicsFor(visionItem("1")), null);
    assert.strictEqual(physicsFor(null), null);
  });

  // ── 5. THE LOAD-BEARING ONE: the industry still cannot decide anything ──
  console.log("\nthe industry lock, extended to the vision path");
  await check("the industry cannot change what the material decides", () => {
    const base = fixtureById("01_one_product_square");
    const a = sheetWith({ ...base, industry: "coffee_tea" }, [GLASS_DRINK]);
    const b = sheetWith({ ...base, industry: "electronics_tech" }, [GLASS_DRINK]);
    assert.deepStrictEqual(a.lighting, b.lighting, "the industry changed the lighting");
    assert.deepStrictEqual(a.camera, b.camera, "the industry changed the camera");
    assert.strictEqual(a.material_lighting_note, b.material_lighting_note, "the industry changed the note");
    assert.deepStrictEqual(
      a.products.map((p) => p.physics),
      b.products.map((p) => p.physics),
      "the industry changed the physics",
    );
  });
  await check("the MATERIAL does change it, which is the whole point", () => {
    const base = fixtureById("01_one_product_square");
    const glass = sheetWith(base, [GLASS_DRINK]);
    const matte = sheetWith(base, [MATTE_BOX]);
    assert.notStrictEqual(glass.lighting.key_direction, matte.lighting.key_direction);
    assert.notStrictEqual(glass.material_lighting_note, matte.material_lighting_note);
    assert.notStrictEqual(glass.lighting.rim, matte.lighting.rim);
    // The size class moved the lens too: a hand-held thing against a two-handed one.
    assert.notStrictEqual(glass.camera.lens_mm, matte.camera.lens_mm);
  });
  await check("the material override is recorded, not silent", () => {
    const sheet = sheetWith(fixtureById("01_one_product_square"), [GLASS_DRINK]);
    assert.ok(
      sheet.conflicts_resolved.some((c) => /lighting\.key_direction/.test(c) && /transmissive/.test(c)),
      `the override was silent: ${JSON.stringify(sheet.conflicts_resolved)}`,
    );
  });
  await check("the physics never reaches the prompt as a number", () => {
    const sheet = sheetWith(fixtureById("01_one_product_square"), [GLASS_DRINK]);
    assert.ok(sheet.material_lighting_note, "there is no note to check");
    assert.ok(!/\d/.test(sheet.material_lighting_note!), `a digit reached the note: ${sheet.material_lighting_note}`);
  });

  // ── 6. Print-rule branch (c) becomes reachable ─────────────────────────
  console.log("\nprint-rule branch (c)");
  await check("legible branding activates branch (c)", () => {
    const fx = fixtureById("01_one_product_square");
    const seen = visionItem("1", {
      materials: ["clear glass"],
      printed_branding: { present: true, description: "ORIGIN BLEND / COLD BREW", legible: true },
    });
    const input: SheetInput = {
      assetType: fx.assetType,
      aspectRatio: fx.aspectRatio,
      concept: fx.concept,
      brand: fx.brand,
      copy: fx.copy,
      products: [{ id: "1", description: fx.products[0].description }],
      allocation: allocationFor(fx),
      productVision: { products: [seen] },
    };
    const detected = detectedBrandingFrom(input);
    assert.ok(detected?.length, "legible branding was not detected");
    assert.strictEqual(printRuleForSheet(input).branch, "detected_branding");
    const sheet = buildArtDirectionSheet(input);
    assert.strictEqual(sheet.provenance.print_rule_branch, "detected_branding");
    assert.strictEqual(sheet.products[0].printed_branding, "ORIGIN BLEND / COLD BREW");
  });
  await check("branding that is present but ILLEGIBLE stays on branch (b)", () => {
    // The case the 512px floor creates on every five-product brief. Branch (c) would
    // wrongly claim to know what the label says.
    const fx = fixtureById("01_one_product_square");
    const seen = visionItem("1", {
      materials: ["clear glass"],
      printed_branding: { present: true, description: "something printed, too small to read", legible: false },
    });
    const input: SheetInput = {
      assetType: fx.assetType,
      aspectRatio: fx.aspectRatio,
      concept: fx.concept,
      brand: fx.brand,
      copy: fx.copy,
      products: [{ id: "1", description: fx.products[0].description }],
      allocation: allocationFor(fx),
      productVision: { products: [seen] },
    };
    assert.strictEqual(detectedBrandingFrom(input), null, "illegible branding was treated as readable");
    assert.strictEqual(printRuleForSheet(input).branch, "photographed_branding");
  });
  await check("a supplied logo still outranks anything read off a photograph", () => {
    const fx = fixtureById("01_one_product_square");
    const input: SheetInput = {
      assetType: fx.assetType,
      aspectRatio: fx.aspectRatio,
      concept: fx.concept,
      brand: fx.brand,
      copy: fx.copy,
      products: [{ id: "1", description: fx.products[0].description }],
      allocation: allocationFor(fx),
      brandKit: { hasLogoImage: true },
      productVision: {
        products: [
          visionItem("1", { printed_branding: { present: true, description: "ORIGIN BLEND", legible: true } }),
        ],
      },
    };
    assert.strictEqual(printRuleForSheet(input).branch, "supplied_logo");
  });
  await check("a legible label that disagrees with the brand name is recorded", () => {
    const fx = fixtureById("01_one_product_square");
    const sheet = sheetWith(
      { ...fx, brand: "Origin Blend" },
      [visionItem("1", { printed_branding: { present: true, description: "SOMEBODY ELSE CO", legible: true } })],
    );
    assert.ok(
      sheet.conflicts_resolved.some((c) => /does not match the brand name/i.test(c)),
      `the mismatch was silent: ${JSON.stringify(sheet.conflicts_resolved)}`,
    );
    // Recorded, not corrected: the client may be advertising a sub-brand.
    assert.strictEqual(sheet.products[0].printed_branding, "SOMEBODY ELSE CO");
  });
  await check("a matching label raises no conflict", () => {
    const sheet = sheetWith(
      { ...fixtureById("01_one_product_square"), brand: "Origin Blend" },
      [visionItem("1", { printed_branding: { present: true, description: "ORIGIN BLEND / COLD BREW", legible: true } })],
    );
    assert.ok(
      !sheet.conflicts_resolved.some((c) => /does not match the brand name/i.test(c)),
      "a matching label was reported as a mismatch",
    );
  });

  // ── 7. Panels are matched by label, never by array position ────────────
  console.log("\npanel matching");
  await check("a packed brief attaches each material to the right product", () => {
    // The allocation reorders products when it packs: on the five-drink brief the panel
    // order is not the upload order. Index matching would cross the wires.
    const fx = fixtureById("05_five_drinks_prices_florian");
    const panels = panelsToAsk(allocationFor(fx));
    // Give exactly one panel a material nobody else has.
    const target = panels[2];
    const answer = panels.map((p) =>
      p === target
        ? visionItem(p.panel, { materials: ["brushed metal"], size_class: "fits in a hand" })
        : visionItem(p.panel, { materials: ["clear glass"] }),
    );
    const sheet = sheetWith(fx, answer);
    const metallic = sheet.products.filter((p) => p.physics?.dominant === "metallic");
    assert.strictEqual(metallic.length, 1, `${metallic.length} products came back metallic, expected exactly one`);
  });
  await check("an answer about a panel that does not exist is ignored", () => {
    const sheet = sheetWith(fixtureById("01_one_product_square"), [
      visionItem("Z", { materials: ["brushed metal"] }),
    ]);
    assert.strictEqual(sheet.products[0].physics, null, "a phantom panel's material was used");
    // The material still comes from the client's own DESCRIPTION, which is the behaviour
    // with no vision pass at all — "amber glass bottle" names a material. Corrected from
    // the first draft of this test, which expected "unverified" and so would have passed
    // only if the description fallback had been broken.
    assert.strictEqual(sheet.products[0].material, "glass, wood");
    assert.strictEqual(sheet.material_lighting_note, null, "a phantom panel produced a lighting plan");
  });

  // ── 8. Telemetry carries no bytes and no copy ──────────────────────────
  console.log("\ntelemetry");
  await check("telemetry is counts and flags only", () => {
    const t = productVisionTelemetry({
      vision: { products: [GLASS_DRINK, visionItem("2", { printed_branding: { present: true, description: "X", legible: true } })] },
      source: "model",
    });
    const json = JSON.stringify(t);
    assert.ok(!/base64|buffer|fake-sheet/i.test(json), "telemetry carried image data");
    assert.ok(!/ORIGIN BLEND/.test(json), "telemetry carried label text");
    assert.strictEqual((t as { products: number }).products, 2);
    assert.strictEqual((t as { legible_branding: number }).legible_branding, 1);
    assert.deepStrictEqual(productVisionTelemetry(null), { product_vision: false });
  });

  // ── 9. Every fixture survives a vision answer ──────────────────────────
  console.log("\nevery brief survives a vision answer");
  for (const fx of GPT_BRIEF_FIXTURES) {
    await check(`sheet builds with vision — ${fx.id}`, () => {
      const panels = panelsToAsk(allocationFor(fx));
      const sheet = sheetWith(
        fx,
        panels.map((p) => visionItem(p.panel, { materials: ["clear glass"], size_class: "fits in a hand" })),
      );
      // The Zod parse inside the builder is the assertion; this checks it took effect.
      assert.ok(sheet.material_lighting_note, `${fx.id} produced no lighting note from an observed material`);
      assert.ok(sheet.products.every((p) => p.physics), `${fx.id} left a product without physics`);
    });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
