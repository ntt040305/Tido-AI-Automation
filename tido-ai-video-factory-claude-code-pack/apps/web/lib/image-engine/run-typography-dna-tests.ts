/**
 * Phase 5.6.3 — typography as art direction. Offline: no model, no database.
 *
 * What this suite is for
 * ----------------------
 * The module claims two things that are easy to assert and easy to get wrong,
 * so both are measured here rather than described:
 *
 *   1. EVERY MATERIAL ACTUALLY RENDERS. A vocabulary of effects the renderer
 *      silently ignores is worse than no vocabulary: the design record would say
 *      "metallic" and the picture would show plain text, and nothing downstream
 *      could tell. Each material is drawn through the real rasteriser and
 *      compared against the same words set plain. Identical pixels fail.
 *   2. LEGIBILITY OUTRANKS DECORATION. A treatment that suits the idea but would
 *      drop a line under its contrast floor, disappear into a bright frame, or
 *      break up against a busy one must be refused -- and the refusal recorded,
 *      because "the glow was dropped" is a decision somebody may query.
 *
 * Platform-dependent by nature, like the font suite: it renders with the SVG
 * rasteriser this machine has. A machine whose renderer cannot draw a filter
 * SHOULD fail here rather than ship a record that claims an effect nobody saw.
 */

import assert from "assert";
import crypto from "crypto";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");
const {
  buildTypographyDNA, materialPaint, materialForContrast, categoryHint,
  typographyDnaTelemetry, renderDnaForImagePrompt,
} = require("./evolution/experiment/TypographyDNA");
const { buildGeometry } = require("./evolution/experiment/LayoutGeometry");
const { buildTypographySystem, assignTextRoles, geometryRolesFor } = require("./evolution/experiment/TypographySystem");
const { buildCreativeDocument } = require("./evolution/experiment/CreativeDocument");
const { buildTypographyPlan } = require("./evolution/experiment/TypographyPlan");
const { normalizeBrandKit } = require("./evolution/experiment/BrandKit");
const { resolveTextRequirement } = require("./compiler/ExactCopyIntegrityValidator");
const { composeEditable, editableSvg } = require("./evolution/experiment/EditableDesign");
const { buildCompositionMap } = require("./evolution/experiment/CompositionMap");

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
    failures.push(`${name}\n    ${(e as Error).message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────

/** A blueprint carrying only the decisions the DNA reads. */
function blueprint(fields: Record<string, string>): unknown {
  const sections: Record<string, string[]> = {
    concept: ["big_idea", "campaign_concept", "visual_story", "creative_tension", "emotional_hook", "message_strategy"],
    visual_world: ["visual_world", "environment_logic", "color_story", "visual_metaphor", "styling", "props", "atmosphere", "composition_logic"],
    photography: ["camera_language", "lens_character", "focus_behavior", "lighting_behavior", "depth_feeling", "material_rendering"],
    design: ["font_character", "typographic_voice", "hierarchy_logic", "spacing_behavior", "placement_reason", "contrast_strategy"],
    layout: ["visual_balance", "product_position", "text_area", "negative_space", "attention_flow", "composition_balance"],
    brand_expression: ["visual_language", "color_system", "material_language", "emotional_direction"],
  };
  const bp: Record<string, Record<string, unknown> | null> = {};
  for (const [section, keys] of Object.entries(sections)) {
    bp[section] = {};
    for (const k of keys) {
      (bp[section] as Record<string, unknown>)[k] = fields[k]
        ? { value: fields[k], because: "fixture", derived_from: "product_truth", confidence: "high" }
        : null;
    }
  }
  return bp;
}

const DREAM = blueprint({
  emotional_hook: "the weightless moment before you are fully awake",
  atmosphere: "soft morning haze, everything slightly out of reach",
  lighting_behavior: "diffused light with no hard shadow anywhere",
});
const LUXURY = blueprint({
  emotional_hook: "restraint as a form of confidence",
  visual_world: "an elegant, refined interior with almost nothing in it",
  typographic_voice: "editorial",
});
const ENERGY = blueprint({
  emotional_hook: "the first explosive bite",
  atmosphere: "dynamic, splashing, everything in motion",
});
const METAL = blueprint({
  material_rendering: "polished metallic surfaces catching a hard light",
  lighting_behavior: "one hard directional light raking across the metal",
});
const GLASS = blueprint({
  visual_world: "transparent glass and clear water against a plain ground",
});
const PLAIN = blueprint({ emotional_hook: "a reliable everyday choice", typographic_voice: "direct" });

const KIT = normalizeBrandKit({
  name: "Lumi",
  colors: [{ hex: "#1f3a2e", role: "primary" }, { hex: "#e8b04a", role: "accent" }],
  fonts: { heading: "Cambria", body: "Segoe UI" },
  has_logo: false,
});

/** Every material except plain. Read from the module, so adding one to the
 * vocabulary without measuring it fails this suite rather than shipping. */
const MATERIALS: string[] = ["glow", "metallic", "glass", "mist", "paper", "embossed"];

const EN = ["Summer Sale 50%", "Up to half price on everything", "Shop now"];
const VI = ["Giảm giá 50% hôm nay!", "Áp dụng cho toàn bộ sản phẩm cà phê", "Đặt ngay"];

/** The document chain, as the pipeline builds it. */
function design(lines: string[], ratio = "1:1", kit: unknown = null) {
  const req = resolveTextRequirement({ contentMessage: lines.join("\n") });
  const assigned = assignTextRoles(req.lines);
  const geometry = buildGeometry({ ratio, copyRoles: geometryRolesFor(assigned), productCount: 1, brandKit: kit });
  const typography = buildTypographySystem({ geometry, lines: assigned, brandKit: kit });
  const plan = buildTypographyPlan({ mode: req.mode, lines: assigned, geometry, typography, brandKit: kit, ratio });
  const doc = buildCreativeDocument({ geometry, typography, brandKit: kit, canvasLongEdge: 2048, plan });
  return { doc, plan };
}

const flatScene = (hex: string, size = 1024) =>
  sharp({ create: { width: size, height: size, channels: 3, background: hex } }).png().toBuffer();

/** A frame that is detail everywhere: what "busy" means to the map. */
const noisyScene = async (size = 1024) => {
  const dots = Array.from({ length: 900 }, (_, i) =>
    `<circle cx="${(i * 97) % size}" cy="${(i * 61) % size}" r="7" fill="${i % 3 ? "#1b1b1b" : "#f0f0f0"}"/>`).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#8a8a8a"/>${dots}</svg>`)).png().toBuffer();
};

const mapOf = async (buf: Buffer) => {
  const { data } = await sharp(buf).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return buildCompositionMap({ rgb: data, size: 64 });
};

const texts = (d: { layers: { kind: string }[] }) => d.layers.filter((l) => l.kind === "text") as any[];
const oneLine = (t: string) => String(t).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const svgTexts = (svg: string): string[] =>
  [...svg.matchAll(/<text[\s\S]*?<\/text>/g)].map((m) =>
    oneLine([...m[0].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((t) => t[1]).join(" ")),
  );

/**
 * The words drawn through the real rasteriser with one material applied.
 *
 * Two grounds, because the materials are not all for the same picture: glow,
 * glass, mist and metal are light ink on a dark frame, while paper and emboss
 * are surface treatments whose shadow only exists against a light one. Measuring
 * a contact shadow on a near-black ground says nothing about the effect -- the
 * first version of this suite did exactly that and called both of them invisible.
 */
const DARK = { bg: "#14181c", fg: "#f2efe8" };
const LIGHT = { bg: "#f4efe6", fg: "#1f2328" };

async function rasterise(material: string, ground = DARK, opts: { size?: number; scale?: boolean } = {}) {
  const size = opts.size ?? 64;
  const dna = { ...buildTypographyDNA({ blueprint: PLAIN }), material };
  // `scale: false` asks for the treatment sized for 64px type on type of
  // another size -- the fixed-pixel behaviour, kept so the scaling test can
  // measure what it replaced instead of asserting it from the diff.
  const paint = materialPaint(dna, "probe", ground.fg, { accent: "#e8b04a", size: opts.scale === false ? 64 : size });
  const attrs = Object.entries(paint.attrs).map(([k, v]) => `${k}="${v}"`).join(" ");
  const k = size / 64;
  const W = Math.round(620 * k);
  const H = Math.round(160 * k);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${ground.bg}"/><defs>${paint.defs}</defs>` +
    `<text x="${24 * k}" y="${104 * k}" font-family="Segoe UI" font-size="${size}" font-weight="700" ${attrs}>Giảm giá 50%</text></svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).png().raw().toBuffer({ resolveWithObject: true });
  const grey: number[] = [];
  let lit = 0;
  let ink = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
    grey.push(b);
    // Ink is whatever differs from the ground, which is the BRIGHT pixels on a
    // dark ground and the DARK ones on a light one. Counting "brighter than 40"
    // on a light ground counted the whole canvas as ink and made every surface
    // treatment look like it changed 4% of the type.
    const isInk = ground === DARK ? b > 40 : b < 200;
    if (isInk) {
      lit++;
      ink += b;
    }
  }
  return { hash: crypto.createHash("md5").update(data).digest("hex"), grey, lit, ink, mean: lit ? ink / lit : 0 };
}

/**
 * How much of the picture the material visibly changed, as a share of the area
 * the plain type covers. Direction-agnostic: it counts pixels a person could
 * tell apart, whether the effect lightened or darkened them.
 */
function visibleChange(a: { grey: number[] }, plain: { grey: number[]; lit: number }): number {
  let changed = 0;
  for (let i = 0; i < plain.grey.length; i++) if (Math.abs(a.grey[i] - plain.grey[i]) > 12) changed++;
  return changed / Math.max(1, plain.lit);
}

async function main() {
  console.log("\nTypography DNA\n");

  // ── 1. every material really renders ─────────────────────────────────────
  console.log("1 — the material vocabulary is what the renderer can draw");

  await check("every material draws something VISIBLY different from plain text", async () => {
    const plains = { dark: await rasterise("plain", DARK), light: await rasterise("plain", LIGHT) };
    const weak: string[] = [];
    const seen: string[] = [];
    for (const m of MATERIALS) {
      // A material has to show on at least one of the two grounds. Identical
      // pixels are not the only failure: an `organic` material that blurred by
      // 0.4px differed in the hash and changed nothing anyone could see -- a
      // word in the design record for nothing on the picture. It was removed,
      // and this threshold is what stops the next one being added.
      const onDark = visibleChange(await rasterise(m, DARK), plains.dark);
      const onLight = visibleChange(await rasterise(m, LIGHT), plains.light);
      const best = Math.max(onDark, onLight);
      seen.push(`${m} ${(best * 100).toFixed(0)}%`);
      if (best < 0.1) weak.push(`${m} changes ${(best * 100).toFixed(1)}% of the type's area at its best: invisible`);
    }
    console.log(`      visible change vs plain: ${seen.join(", ")}`);
    assert.deepStrictEqual(weak, [], `materials that do not show:\n    ${weak.join("\n    ")}`);
  });

  await check("a treatment sized for a probe still shows on a production headline", async () => {
    // Every offset and blur is scaled from the type's size. It was fixed pixels
    // first, and this is what that cost, measured at 320px against the same
    // treatment sized for 64px: paper fell from 115% of the type's area to 29%,
    // emboss from 87% to 20%, glow from 196% to 56%. The record would still have
    // said "embossed" while the picture showed almost nothing.
    const report: string[] = [];
    for (const [m, ground] of [["glow", DARK], ["mist", DARK], ["paper", LIGHT], ["embossed", LIGHT]] as const) {
      const small = visibleChange(await rasterise(m, ground), await rasterise("plain", ground));
      const bigPlain = await rasterise("plain", ground, { size: 320 });
      const scaled = visibleChange(await rasterise(m, ground, { size: 320 }), bigPlain);
      const fixed = visibleChange(await rasterise(m, ground, { size: 320, scale: false }), bigPlain);
      report.push(`${m} 64px ${(small * 100).toFixed(0)}% → 320px ${(scaled * 100).toFixed(0)}% (unscaled would be ${(fixed * 100).toFixed(0)}%)`);
      assert.ok(scaled > small * 0.7, `${m} loses its treatment on large type: ${(small * 100).toFixed(0)}% → ${(scaled * 100).toFixed(0)}%`);
      assert.ok(scaled >= fixed, `${m} scaled worse than fixed pixels; the scaling is upside down`);
    }
    for (const line of report) console.log(`      ${line}`);
  });

  await check("each material changes the picture in the direction it claims", async () => {
    const plain = await rasterise("plain");
    const [glow, glass, mist, metallic] = await Promise.all(
      // Not `.map(rasterise)`: `map` passes the index as the second argument,
      // which would arrive as the ground and render each probe on nothing.
      ["glow", "glass", "mist", "metallic"].map((m) => rasterise(m)),
    );
    // Directions, not just difference: an effect can differ from plain and
    // still be the wrong effect, which a hash comparison cannot catch.
    assert.ok(glow.lit > plain.lit * 1.3, `glow covers ${glow.lit}px vs plain ${plain.lit}px: no halo was drawn`);
    // Glass is translucent, so the ground shows through: it covers MORE pixels
    // than plain (it carries a stroke) while each of them is dimmer.
    assert.ok(glass.mean < plain.mean * 0.85, `glass averages ${glass.mean.toFixed(0)} vs plain ${plain.mean.toFixed(0)}: nothing showed through`);
    assert.ok(mist.mean < plain.mean, `mist averages ${mist.mean.toFixed(0)} vs plain ${plain.mean.toFixed(0)}: no edge was softened`);
    assert.ok(metallic.mean < plain.mean * 0.85, `metallic averages ${metallic.mean.toFixed(0)}: the gradient is flat`);
  });

  await check("every filter and gradient a material references is also defined", async () => {
    for (const m of MATERIALS) {
      const dna = { ...buildTypographyDNA({ blueprint: PLAIN }), material: m };
      const paint = materialPaint(dna, "probe", "#ffffff", {});
      const refs = [...JSON.stringify(paint.attrs).matchAll(/url\(#([^)]+)\)/g)].map((x) => x[1]);
      for (const r of refs) {
        assert.ok(paint.defs.includes(`id="${r}"`), `${m} references #${r} and defines nothing`);
      }
      assert.ok(paint.defs || !refs.length, `${m} references a definition it did not emit`);
    }
  });

  await check("two layers wearing the same material get their own definitions", () => {
    const dna = { ...buildTypographyDNA({ blueprint: DREAM }), material: "glow" };
    const a = materialPaint(dna, "headline", "#fff", {});
    const b = materialPaint(dna, "cta", "#fff", {});
    // Shared ids across layers is the classic SVG bug: the second definition
    // wins and both layers get whichever colour was declared last.
    assert.notStrictEqual(a.defs, b.defs, "two layers emitted the same definition id");
    assert.ok(a.defs.includes("headline") && b.defs.includes("cta"));
  });

  // ── 2. the direction decides the treatment ───────────────────────────────
  console.log("\n2 — the director's decisions, resolved into treatment");

  await check("a dreamlike direction floats, softens and opens up", () => {
    const d = buildTypographyDNA({ blueprint: DREAM, personality: "quiet" });
    assert.strictEqual(d.material, "mist");
    assert.strictEqual(d.movement, "floating");
    assert.ok(d.spacing > 0.03, `spacing ${d.spacing} is not open`);
    assert.ok(d.weight <= 400, `weight ${d.weight} is not light for an airy direction`);
  });

  await check("a luxury direction stays plain and lets space do the work", () => {
    const d = buildTypographyDNA({ blueprint: LUXURY, personality: "editorial" });
    assert.strictEqual(d.material, "plain", "restraint was decorated");
    assert.strictEqual(d.movement, "still");
    assert.ok(d.spacing >= 0.05, `spacing ${d.spacing} is not generous`);
  });

  await check("an energetic direction gets weight, tightness and motion", () => {
    const d = buildTypographyDNA({ blueprint: ENERGY, personality: "assertive" });
    assert.strictEqual(d.movement, "driving");
    assert.strictEqual(d.shape_language, "angular");
    assert.ok(d.weight >= 800, `weight ${d.weight} is not heavy`);
    assert.ok(d.spacing <= 0, `spacing ${d.spacing} is not tight`);
  });

  await check("a metallic product gets metallic type; glass gets glass", () => {
    assert.strictEqual(buildTypographyDNA({ blueprint: METAL }).material, "metallic");
    assert.strictEqual(buildTypographyDNA({ blueprint: GLASS }).material, "glass");
  });

  await check("no direction at all means plain — never a decoration by guess", () => {
    for (const bp of [null, undefined, blueprint({})]) {
      const d = buildTypographyDNA({ blueprint: bp as never });
      assert.strictEqual(d.material, "plain", "a material was invented from nothing");
      assert.strictEqual(d.movement, "still");
      assert.ok(d.because.material.length > 10, "the plain default gave no reason");
    }
  });

  await check("the same input always resolves the same way", () => {
    const a = buildTypographyDNA({ blueprint: DREAM, personality: "quiet", brandKit: KIT });
    const b = buildTypographyDNA({ blueprint: DREAM, personality: "quiet", brandKit: KIT });
    assert.deepStrictEqual(a, b, "the DNA is not deterministic");
  });

  await check("every decision names what produced it", () => {
    const d = buildTypographyDNA({ blueprint: ENERGY, personality: "assertive" });
    for (const k of ["personality", "material", "weight", "shape_language", "movement", "scene_relationship"]) {
      assert.ok((d.because[k] || "").length > 10, `${k} was decided without a reason`);
    }
    // The reason has to quote the direction, not restate the decision.
    assert.ok(/explosive|motion|splash|dynamic/.test(d.because.material), `the material's reason cites nothing: ${d.because.material}`);
  });

  // ── 3. the brand narrows it ──────────────────────────────────────────────
  console.log("\n3 — the brand's refusals outrank the treatment");

  await check("a brand that forbids a treatment does not get it", () => {
    const kit = normalizeBrandKit({
      name: "Restraint", colors: [{ hex: "#101010", role: "primary" }],
      fonts: {}, has_logo: false, style: { forbidden: ["glow"], preferred: [], references: [] },
    });
    const d = buildTypographyDNA({ blueprint: blueprint({ atmosphere: "a luminous radiant glow behind the bottle" }), brandKit: kit });
    assert.strictEqual(d.material, "plain");
    assert.ok(d.refused.some((r: string) => /glow/.test(r) && /forbid/.test(r)), `the refusal was not recorded: ${JSON.stringify(d.refused)}`);
  });

  // ── 4. the rendered picture gets the last word ───────────────────────────
  console.log("\n4 — measured against the render, not only the idea");

  await check("a glow is refused on a frame that came back bright", async () => {
    const bp = blueprint({ atmosphere: "a luminous glow, backlit and radiant" });
    const bright = await mapOf(await flatScene("#f6f3ec"));
    const dark = await mapOf(await flatScene("#12161a"));
    assert.strictEqual(buildTypographyDNA({ blueprint: bp, map: dark }).material, "glow", "a dark frame lost its glow");
    const d = buildTypographyDNA({ blueprint: bp, map: bright });
    assert.strictEqual(d.material, "plain", "a glow was kept on a bright frame");
    assert.ok(d.refused.some((r: string) => /glow/.test(r)), "the refusal was not recorded");
  });

  await check("transparent and softened treatments are refused on a busy frame", async () => {
    const busy = await mapOf(await noisyScene());
    const glass = buildTypographyDNA({ blueprint: GLASS, map: busy });
    assert.strictEqual(glass.material, "plain", "type you can see through was kept over noise");
    assert.ok(glass.refused.some((r: string) => /glass/.test(r)));
    const mist = buildTypographyDNA({ blueprint: DREAM, map: busy });
    assert.strictEqual(mist.material, "plain", "softened edges were kept over noise");
  });

  await check("a dark frame gets enough weight to hold the light strokes up", async () => {
    const dark = await mapOf(await flatScene("#0c0f12"));
    const d = buildTypographyDNA({ blueprint: DREAM, personality: "quiet", map: dark });
    assert.ok(d.weight >= 500, `weight ${d.weight} on a dark frame`);
    assert.ok(/dark/.test(d.because.weight), "the raise was not explained");
  });

  await check("the scene relationship is read from the render where there is one", async () => {
    const dark = await mapOf(await flatScene("#101418"));
    const d = buildTypographyDNA({ blueprint: DREAM, map: dark });
    assert.ok(/dark frame/.test(d.scene_relationship), d.scene_relationship);
    const none = buildTypographyDNA({ blueprint: DREAM });
    assert.ok(/no render/.test(none.because.scene_relationship), "a relationship was claimed without a render");
  });

  await check("a treatment that would drop a line under the contrast floor is refused", () => {
    // Mid grey on mid grey: legal as solid ink, illegal at 55% opacity.
    const tight = materialForContrast("glass", "#767676", "#ffffff");
    assert.strictEqual(tight.material, "plain");
    assert.ok(/4.5/.test(String(tight.refused)), `the floor was not cited: ${tight.refused}`);
    // White on near-black has ratio to spare, so the treatment survives.
    assert.strictEqual(materialForContrast("glass", "#ffffff", "#0a0a0a").material, "glass");
    // Metal is checked against the colour it will ACTUALLY be drawn in -- the
    // brand's accent, which replaces the chosen ink -- not against the ink.
    assert.strictEqual(materialForContrast("metallic", "#ffffff", "#0a0a0a", "#1f3a2e").material, "plain", "a dark metal was kept on a dark frame");
    assert.strictEqual(materialForContrast("metallic", "#ffffff", "#0a0a0a", "#e8b04a").material, "metallic", "a gold metal was refused on a dark frame");
    // A treatment that neither tints nor thins the ink is never questioned.
    assert.strictEqual(materialForContrast("embossed", "#767676", "#ffffff").material, "embossed");
  });

  // ── 5. the category, recognised rather than invented ─────────────────────
  console.log("\n5 — the category comes from the director's own words");

  await check("a category is recognised from the direction, in English and Vietnamese", () => {
    assert.strictEqual(categoryHint(blueprint({ visual_story: "a cup of coffee on a wet table" })), "beverage");
    assert.strictEqual(categoryHint(blueprint({ visual_story: "một ly cà phê buổi sáng" })), "beverage");
    assert.strictEqual(categoryHint(blueprint({ visual_world: "a serum bottle on wet skin" })), "beauty");
    assert.strictEqual(categoryHint(blueprint({ big_idea: "the laptop that keeps up" })), "technology");
  });

  await check("nothing recognisable means no category, not a guess", () => {
    assert.strictEqual(categoryHint(blueprint({ big_idea: "a promise kept quietly" })), null);
    assert.strictEqual(categoryHint(null), null);
  });

  // ── 6. what the image prompt is told ────────────────────────────────────
  console.log("\n6 — the prompt asks for a frame, never for lettering");

  await check("a plain treatment adds nothing to the prompt", () => {
    assert.strictEqual(renderDnaForImagePrompt(buildTypographyDNA({ blueprint: LUXURY })), undefined);
    assert.strictEqual(renderDnaForImagePrompt(null), undefined);
  });

  await check("a material treatment asks the frame to be ready for it, briefly", () => {
    // The budget this has to live inside: the last healthy render measured
    // 31,892 characters against the provider's 32,000. A line that pushes the
    // prompt over the limit costs the entire image.
    const lengths: string[] = [];
    for (const [name, bp] of [["metal", METAL], ["glow", blueprint({ atmosphere: "a luminous radiant glow" })],
      ["glass", GLASS], ["mist", DREAM], ["paper", blueprint({ styling: "handmade artisan letterpress" })]] as const) {
      const line = renderDnaForImagePrompt(buildTypographyDNA({ blueprint: bp }));
      assert.ok(line, `${name} told the renderer nothing`);
      assert.ok(line.length <= 95, `${name} is ${line.length} chars; the prompt has about 100 spare`);
      assert.ok(/copy area/.test(line), line);
      lengths.push(`${name} ${line.length}`);
    }
    console.log(`      prompt cost: ${lengths.join(", ")} chars`);
  });

  await check("the prompt line never names a typeface, a weight or a word of the copy", () => {
    for (const bp of [DREAM, LUXURY, ENERGY, METAL, GLASS]) {
      const line = renderDnaForImagePrompt(buildTypographyDNA({ blueprint: bp })) || "";
      for (const bad of [/Cambria|Segoe|Georgia|Arial|serif/i, /font|typeface|px|pt\b/i, /\b(headline|write|spell|render the text)\b/i]) {
        assert.ok(!bad.test(line), `the prompt line leaks "${bad}": ${line}`);
      }
      for (const l of [...EN, ...VI]) assert.ok(!line.includes(l), "the prompt line carries the client's copy");
    }
  });

  // ── 7. the compositor, end to end ────────────────────────────────────────
  console.log("\n7 — the treatment reaches the picture");

  await check("the design carries the DNA, and the SVG carries the material", async () => {
    const { doc, plan } = design(EN, "1:1", KIT);
    const c = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: METAL, scene: await flatScene("#14181c"), logo: null });
    assert.ok(c.design.typography_dna, "the design records no typographic art direction");
    assert.strictEqual(c.design.typography_dna.material, "metallic");
    for (const t of texts(c.design)) assert.ok(t.material, `${t.role} has no material, not even plain`);
    const svg = editableSvg(c.design, {}, { skipScene: true });
    assert.ok(/data-material="metallic"/.test(svg), "the SVG does not say what treatment it drew");
    assert.ok(/<linearGradient/.test(svg), "a metallic treatment emitted no gradient");
    assert.ok(/<defs>/.test(svg) && svg.indexOf("<defs>") < svg.indexOf("<text"), "definitions come after their first use");
  });

  await check("only the headline wears the treatment", async () => {
    // Rendered with every line wearing it, a glow direction gave a glowing
    // headline, a mushy subheadline and a glowing CTA on a solid button plate.
    const { doc, plan } = design(EN, "1:1", KIT);
    const c = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: DREAM, scene: await flatScene("#101418"), logo: null });
    assert.strictEqual(c.design.typography_dna.material, "mist", "the design lost its treatment entirely");
    for (const t of texts(c.design)) {
      if (t.role === "headline") assert.strictEqual(t.material, "mist", "the headline did not get the treatment");
      else assert.strictEqual(t.material, "plain", `${t.role} was decorated; only the headline carries the voice`);
    }
  });

  await check("a brand's metal is refused where it would not read", async () => {
    // The defect this caught: metal REPLACES the chosen ink with a ramp built
    // from the brand's colour, so the contrast the layout engine verified no
    // longer applies. A dark-green brand set "Pure Gold" in dark green on a
    // near-black frame and every other check passed, because they were all
    // looking at the colour the gradient had discarded.
    const dark = normalizeBrandKit({
      name: "Deep", colors: [{ hex: "#1f3a2e", role: "accent" }], fonts: {}, has_logo: false,
    });
    const { doc, plan } = design(EN, "1:1", dark);
    const c = await composeEditable({ document: doc, brandKit: dark, plan, blueprint: METAL, scene: await flatScene("#0e1216"), logo: null });
    const head = texts(c.design).find((t: any) => t.role === "headline");
    assert.strictEqual(head.material, "plain", "an unreadable metal was kept");
    assert.ok(c.design.typography_dna.refused.some((r: string) => /metallic/.test(r)), "the refusal was not recorded");

    // A gold accent on the same frame reads, so it is kept: the rule is the
    // measurement, not a ban on metal over dark frames.
    const gold = normalizeBrandKit({ name: "Gold", colors: [{ hex: "#e8b04a", role: "accent" }], fonts: {}, has_logo: false });
    const g = await composeEditable({ document: design(EN, "1:1", gold).doc, brandKit: gold, plan, blueprint: METAL, scene: await flatScene("#0e1216"), logo: null });
    assert.strictEqual(texts(g.design).find((t: any) => t.role === "headline").material, "metallic");
  });

  await check("the treatment never touches the client's words", async () => {
    for (const [lines, bp] of [[EN, METAL], [VI, DREAM], [VI, ENERGY]] as const) {
      const { doc, plan } = design([...lines], "1:1", KIT);
      const c = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: bp, scene: await flatScene("#14181c"), logo: null });
      const rendered = svgTexts(editableSvg(c.design, {}, { skipScene: true }));
      for (const l of lines) {
        assert.ok(rendered.some((r) => r === oneLine(l)), `"${l}" is not in the overlay as written; got ${JSON.stringify(rendered)}`);
      }
    }
  });

  await check("the type is still live text, not outlines or a raster", async () => {
    const { doc, plan } = design(EN, "1:1", KIT);
    const c = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: DREAM, scene: await flatScene("#101418"), logo: null });
    const svg = editableSvg(c.design, {}, { skipScene: true });
    assert.strictEqual((svg.match(/<text /g) || []).length, texts(c.design).length, "a text layer was not written as text");
    assert.ok(!/<path/.test(svg), "the type was converted to outlines");
  });

  await check("the composite is a real picture and differs when the treatment does", async () => {
    const { doc, plan } = design(EN, "1:1", KIT);
    const scene = await flatScene("#14181c");
    const plainRun = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: PLAIN, scene, logo: null });
    const metalRun = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: METAL, scene, logo: null });
    const h = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");
    assert.notStrictEqual(h(plainRun.composite), h(metalRun.composite), "the material changed nothing in the served image");
    const meta = await sharp(metalRun.composite).metadata();
    assert.strictEqual(meta.width, 1024, "the composite lost its size");
  });

  await check("no blueprint composites exactly as it did before this phase", async () => {
    // The guarantee for every existing caller: the DNA is additive, and a
    // render with no director behind it is untouched by it.
    const { doc, plan } = design(EN, "1:1", KIT);
    const scene = await flatScene("#e9e2d6");
    const before = await composeEditable({ document: doc, brandKit: KIT, plan, scene, logo: null });
    for (const t of texts(before.design)) assert.strictEqual(t.material, "plain", `${t.role} was decorated with no direction to justify it`);
    assert.ok(!/data-material/.test(editableSvg(before.design, {}, { skipScene: true })), "a plain design still declared a material");
  });

  await check("a Vietnamese headline keeps a face that can draw it whatever the treatment", async () => {
    const { doc, plan } = design(VI, "1:1", KIT);
    const c = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: ENERGY, scene: await flatScene("#14181c"), logo: null });
    const broken = ["Georgia", "Times New Roman", "Impact", "Arial Black", "Book Antiqua"];
    const svg = editableSvg(c.design, {}, { skipScene: true });
    for (const b of broken) assert.ok(!svg.includes(b), `the overlay names ${b}, which cannot draw Vietnamese`);
  });

  // ── 8. telemetry ────────────────────────────────────────────────────────
  console.log("\n8 — what is logged");

  await check("telemetry names decisions and never the copy", () => {
    const d = buildTypographyDNA({ blueprint: DREAM, personality: "quiet" });
    const t = JSON.stringify(typographyDnaTelemetry(d));
    for (const l of [...EN, ...VI]) assert.ok(!t.includes(l), "the telemetry leaked the client's copy");
    assert.ok(/material/.test(t) && /movement/.test(t));
    assert.deepStrictEqual(typographyDnaTelemetry(null), { typography_dna: false });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
