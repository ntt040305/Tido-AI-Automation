/**
 * Phase 5.6.3 — typography as art direction. Offline: no model, no database.
 *
 * What this suite is for
 * ----------------------
 * Three claims, each of which is easy to state and easy to get wrong, so each
 * is measured rather than described:
 *
 *   1. TYPOGRAPHY CHANGES BECAUSE THE MEANING CHANGES. The same product under
 *      four different creative ideas must produce four different typographic
 *      languages -- and must do so because the ideas differ, not because a
 *      keyword tripped a preset. Section 2 is the acceptance case for that,
 *      including the counter-example the rebuild exists for: a racing car whose
 *      atmosphere is described as "airy" must NOT come out dreamlike.
 *   2. EVERY BEHAVIOUR ACTUALLY RENDERS. A vocabulary the rasteriser ignores is
 *      worse than none, because the record would claim an effect nobody saw.
 *      Each axis is drawn through the real renderer and compared against the
 *      same words set plain.
 *   3. LEGIBILITY OUTRANKS DECORATION. A behaviour that would drop a line under
 *      its contrast floor is attenuated or dropped, and the reason recorded.
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
  buildTypographyDNA, treatmentPaint, treatmentForContrast, categoryHint,
  typographyDnaTelemetry, renderDnaForImagePrompt, TREATMENT_AXES, NEUTRAL_TREATMENT,
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

const SECTIONS: Record<string, string[]> = {
  concept: ["big_idea", "campaign_concept", "visual_story", "creative_tension", "emotional_hook", "message_strategy"],
  visual_world: ["visual_world", "environment_logic", "color_story", "visual_metaphor", "styling", "props", "atmosphere", "composition_logic"],
  photography: ["camera_language", "lens_character", "focus_behavior", "lighting_behavior", "depth_feeling", "material_rendering"],
  design: ["font_character", "typographic_voice", "hierarchy_logic", "spacing_behavior", "placement_reason", "contrast_strategy"],
  layout: ["visual_balance", "product_position", "text_area", "negative_space", "attention_flow", "composition_balance"],
  brand_expression: ["visual_language", "color_system", "material_language", "emotional_direction"],
};

/** A blueprint carrying only the decisions named, shaped as the director writes them. */
function blueprint(fields: Record<string, string>): unknown {
  const bp: Record<string, Record<string, unknown> | null> = {};
  for (const [section, keys] of Object.entries(SECTIONS)) {
    bp[section] = {};
    for (const k of keys) {
      (bp[section] as Record<string, unknown>)[k] = fields[k]
        ? { value: fields[k], because: "fixture", derived_from: "product_truth", confidence: "high" }
        : null;
    }
  }
  return bp;
}

// ── the acceptance case: ONE product, FOUR creative ideas ──────────────────
//
// Written as a director would write them: full sentences across the sections
// the director actually fills, not keyword bait. The same bottle of coffee
// every time; only the meaning changes.

const COFFEE = {
  luxury: blueprint({
    big_idea: "Coffee as a considered ritual for people who have stopped rushing",
    emotional_hook: "restraint as a form of confidence",
    creative_tension: "abundance everywhere, and the discipline to take only one cup",
    visual_world: "a refined, almost empty interior in the hour before anyone else is awake",
    atmosphere: "still, composed, expensive without saying so",
    lighting_behavior: "one low directional light, deep falloff, nothing filled in",
    material_rendering: "matte glass and stone, no highlights competing with the label",
    typographic_voice: "editorial",
    emotional_direction: "quiet authority",
  }),
  playful: blueprint({
    big_idea: "The cold one you drink with your feet in a canal",
    emotional_hook: "the first cold mouthful on a day that is too hot",
    campaign_concept: "summer, loud and unserious",
    visual_world: "bright poolside colour, fruit and ice everywhere",
    atmosphere: "playful, splashing, high energy",
    lighting_behavior: "hard midday sun, saturated and cheerful",
    color_story: "an airy, daylight-bright background with cool highlights",
    emotional_direction: "fun, immediate, nothing precious",
  }),
  futuristic: blueprint({
    big_idea: "Coffee engineered to a specification, not brewed by feel",
    emotional_hook: "the confidence of something calibrated",
    visual_world: "a clean technical environment, screens and instrumentation",
    atmosphere: "precise, controlled, quietly futuristic",
    lighting_behavior: "even digital light with a luminous edge along the bottle",
    material_rendering: "brushed metal and glass under a technical light",
    emotional_direction: "precision and performance",
    typographic_voice: "technical",
  }),
  organic: blueprint({
    big_idea: "Grown by people whose names are on the sack",
    emotional_hook: "made by someone, not by something",
    visual_world: "a wooden table, soil-dusted beans, harvest light",
    atmosphere: "warm, natural, unhurried",
    styling: "handmade paper labels, artisan packaging, small batch",
    material_rendering: "unpolished wood and rough paper stock",
    emotional_direction: "honest and earthy",
    typographic_voice: "crafted",
  }),
};

/** The counter-example. Airy atmosphere, but the idea is speed and precision. */
const RACING = blueprint({
  big_idea: "A car engineered for the last tenth of a second",
  emotional_hook: "the precision of something built to a tolerance",
  visual_world: "a test track at dawn, the car in motion",
  atmosphere: "light and airy morning air, the car cutting through it",
  color_story: "airy pale sky, cool asphalt, a single saturated accent",
  lighting_behavior: "hard directional sun raking along the bodywork",
  material_rendering: "polished carbon and machined metal",
  emotional_direction: "speed, precision, engineering",
});

const KIT = normalizeBrandKit({
  name: "Lumi",
  colors: [{ hex: "#1f3a2e", role: "primary" }, { hex: "#e8b04a", role: "accent" }],
  fonts: { heading: "Cambria", body: "Segoe UI" },
  has_logo: false,
});

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

/** How far apart two treatments are, across every behaviour and the type itself. */
function distance(a: any, b: any): number {
  let d = 0;
  for (const axis of TREATMENT_AXES) d += Math.abs(a[axis] - b[axis]);
  d += Math.abs(a.weight - b.weight) / 300;
  d += Math.abs(a.tracking - b.tracking) * 12;
  return Math.round(d * 100) / 100;
}

const active = (t: any) => TREATMENT_AXES.filter((a: string) => t[a] >= 0.12).map((a: string) => `${a} ${t[a].toFixed(2)}`);

// ── rasterising, for the behaviours that claim to render ───────────────────

const DARK = { bg: "#14181c", fg: "#f2efe8" };
const LIGHT = { bg: "#f4efe6", fg: "#1f2328" };

/** One axis at full strength, drawn through the real rasteriser. */
async function rasterise(axis: string | null, ground = DARK, opts: { size?: number; scale?: boolean } = {}) {
  const size = opts.size ?? 64;
  const treatment = { ...NEUTRAL_TREATMENT, ...(axis ? { [axis]: 1 } : {}) };
  const paint = treatmentPaint({ treatment, accent: "#e8b04a" }, "probe", ground.fg, {
    accent: "#e8b04a",
    size: opts.scale === false ? 64 : size,
  });
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
    // Ink is whatever differs from the ground: the BRIGHT pixels on a dark
    // ground and the DARK ones on a light one. Counting "brighter than 40" on a
    // light ground counted the whole canvas and made every surface treatment
    // look like it changed 4% of the type.
    if (ground === DARK ? b > 40 : b < 200) {
      lit++;
      ink += b;
    }
  }
  return { hash: crypto.createHash("md5").update(data).digest("hex"), grey, lit, ink, mean: lit ? ink / lit : 0 };
}

/**
 * How much of the picture a behaviour visibly changed, as a share of the area
 * the plain type covers. Direction-agnostic: it counts pixels a person could
 * tell apart, whether the effect lightened or darkened them.
 */
function visibleChange(a: { grey: number[] }, plain: { grey: number[]; lit: number }): number {
  let changed = 0;
  for (let i = 0; i < plain.grey.length; i++) if (Math.abs(a.grey[i] - plain.grey[i]) > 12) changed++;
  return changed / Math.max(1, plain.lit);
}

async function main() {
  console.log("\nTypography DNA — creative reasoning\n");

  // ── 1. no presets remain ────────────────────────────────────────────────
  console.log("1 — the preset table is gone, and cannot come back");

  await check("no keyword-to-named-style table survives in the module", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "evolution/experiment/TypographyDNA.ts"), "utf-8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // The shape that shipped the defect: a rule list whose entries name one
    // finished look, read first-match-wins.
    assert.ok(!/material:\s*"(glow|metallic|glass|paper|mist|embossed|plain)"/.test(code), "a named material is still being assigned");
    assert.ok(!/RULES\.find/.test(code), "a first-match rule lookup is back: one reading would decide everything again");
    assert.ok(!/type Material\b/.test(code), "the closed list of named looks is back");
    // What must be there instead.
    assert.ok(/TREATMENT_AXES/.test(code), "the continuous axes are missing");
    assert.ok(/FIELD_WEIGHT/.test(code), "field weighting is missing: where a phrase appears has to count");
  });

  await check("every quality can argue: at least one pushes a behaviour negative", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "evolution/experiment/TypographyDNA.ts"), "utf-8");
    // Without negative pulls there is no disagreement, and without
    // disagreement the strongest single reading wins by default -- which is
    // first-match-wins wearing a different coat.
    const negatives = (src.match(/softness:\s*-/g) || []).length;
    assert.ok(negatives >= 3, `only ${negatives} qualities suppress softness; evidence cannot argue`);
  });

  // ── 2. THE ACCEPTANCE CASE ──────────────────────────────────────────────
  console.log("\n2 — one product, four creative ideas, four typographic languages");

  await check("the same product under four ideas produces four different treatments", () => {
    const names = ["luxury", "playful", "futuristic", "organic"] as const;
    const dnas = names.map((n) => buildTypographyDNA({ blueprint: (COFFEE as any)[n], copyLines: 2, brandKit: KIT }));
    for (let i = 0; i < names.length; i++) {
      console.log(`      ${names[i].padEnd(11)} ${active(dnas[i].treatment).join(", ") || "solid ink"} · ${dnas[i].treatment.weight}/${dnas[i].treatment.tracking}`);
    }
    // Every pair has to differ, and by more than rounding: this is the whole
    // claim of the phase.
    for (let i = 0; i < dnas.length; i++) {
      for (let j = i + 1; j < dnas.length; j++) {
        const d = distance(dnas[i].treatment, dnas[j].treatment);
        assert.ok(d >= 0.35, `${names[i]} and ${names[j]} are ${d} apart: the same typography for two different ideas`);
      }
    }
    // And the roles have to be reasoned, not stamped.
    for (const d of dnas) {
      assert.ok(d.typography_role.length > 30, `the role is a label, not a decision: "${d.typography_role}"`);
      assert.ok(d.uniqueness_reason.includes("from "), "the reason does not say which field produced it");
    }
  });

  await check("each of the four reads the way a designer would describe it", () => {
    const lux = buildTypographyDNA({ blueprint: COFFEE.luxury, copyLines: 2, brandKit: KIT });
    const play = buildTypographyDNA({ blueprint: COFFEE.playful, copyLines: 2, brandKit: KIT });
    const tech = buildTypographyDNA({ blueprint: COFFEE.futuristic, copyLines: 2, brandKit: KIT });
    const org = buildTypographyDNA({ blueprint: COFFEE.organic, copyLines: 2, brandKit: KIT });

    // Restraint spends space, not decoration.
    assert.ok(lux.treatment.tracking >= 0.04, `luxury tracking ${lux.treatment.tracking} is not generous`);
    assert.ok(lux.treatment.luminosity < 0.2 && lux.treatment.relief < 0.2, `luxury was decorated: ${active(lux.treatment)}`);
    assert.ok(lux.font_need.contrast >= 0.5, "a luxury editorial voice does not want modulated strokes");

    // Play is solid and up-front, and heavier than restraint.
    assert.ok(play.treatment.weight > lux.treatment.weight, `playful ${play.treatment.weight} is not heavier than luxury ${lux.treatment.weight}`);

    // The near future is lit and spaced like an interface.
    assert.ok(tech.treatment.luminosity >= 0.2 || tech.treatment.sheen >= 0.2, `futuristic has no surface at all: ${active(tech.treatment)}`);
    assert.ok(tech.treatment.softness < 0.2, `futuristic came out soft (${tech.treatment.softness}); precision should have suppressed it`);

    // The hand shows, and nothing is machined.
    assert.ok(org.font_need.humanist, "an artisan brief did not ask for humanist letterforms");
    assert.ok(org.treatment.sheen < 0.15, `an organic brief got a polished surface: ${org.treatment.sheen}`);
    assert.ok(org.treatment.contact >= 0.15, "printed and handmade evidence produced no ink-on-surface behaviour");
  });

  await check("a racing car whose atmosphere is 'airy' does NOT get dreamlike type", () => {
    // The defect this rebuild exists for, stated as the user stated it. The
    // brief says "airy" twice -- in the atmosphere AND the colour story -- and
    // still must lose to what the work is actually about.
    const d = buildTypographyDNA({ blueprint: RACING, copyLines: 1 });
    console.log(`      racing: ${active(d.treatment).join(", ") || "solid ink"} · ${d.treatment.weight}/${d.treatment.tracking}`);
    assert.ok(d.treatment.softness < 0.2, `softness ${d.treatment.softness}: the car got dreamlike typography`);
    assert.ok(d.treatment.weight >= 700, `weight ${d.treatment.weight} is not the weight of a performance brief`);
    assert.ok(d.treatment.sheen >= 0.2, "polished carbon and raking light produced no surface");
    // And it must be able to SAY it argued, which the old table could not.
    assert.ok(/contested/.test(d.because.uniqueness), `the disagreement was not recorded: ${d.because.uniqueness}`);
    assert.ok(/precision|motion/.test(d.because.uniqueness), d.because.uniqueness);

    // The same words in a brief that IS about air keep their softness: the
    // rule is the argument, not a ban on the word.
    const dream = buildTypographyDNA({ blueprint: COFFEE.luxury, copyLines: 1 });
    const airy = buildTypographyDNA({
      blueprint: blueprint({ atmosphere: "weightless morning haze, everything drifting", emotional_hook: "the moment before waking" }),
      copyLines: 1,
    });
    assert.ok(airy.treatment.softness > 0.4, `a brief that really is about air lost its softness: ${airy.treatment.softness}`);
    assert.ok(airy.treatment.softness > dream.treatment.softness);
  });

  await check("where a phrase appears decides how much it counts", () => {
    // The live failure: "airy" in a COLOUR note set the whole typographic
    // language. The same phrase in the atmosphere is real evidence; in a
    // palette note it is weak.
    const inColour = buildTypographyDNA({ blueprint: blueprint({ color_story: "an airy, daylight-bright white background" }), copyLines: 2 });
    const inAtmosphere = buildTypographyDNA({ blueprint: blueprint({ atmosphere: "an airy, weightless morning" }), copyLines: 2 });
    assert.ok(
      inAtmosphere.treatment.softness > inColour.treatment.softness * 1.8,
      `a palette note (${inColour.treatment.softness}) counts nearly as much as the atmosphere (${inAtmosphere.treatment.softness})`,
    );
  });

  await check("more of the brief saying the same thing means more of the behaviour", () => {
    const once = buildTypographyDNA({ blueprint: blueprint({ atmosphere: "a luminous glow" }), copyLines: 1 });
    const everywhere = buildTypographyDNA({
      blueprint: blueprint({
        atmosphere: "a luminous glow", lighting_behavior: "backlit and radiant",
        big_idea: "the bottle that glows", emotional_hook: "illuminated from within",
      }),
      copyLines: 1,
    });
    assert.ok(everywhere.treatment.luminosity > once.treatment.luminosity,
      `one mention (${once.treatment.luminosity}) produced as much as four (${everywhere.treatment.luminosity})`);
  });

  await check("nothing in the brief means nothing applied — a decision, not an omission", () => {
    for (const bp of [null, undefined, blueprint({})]) {
      const d = buildTypographyDNA({ blueprint: bp as never, copyLines: 2 });
      for (const axis of TREATMENT_AXES) assert.strictEqual(d.treatment[axis], 0, `${axis} was invented from nothing`);
      assert.ok(/plain|nothing/.test(d.uniqueness_reason), d.uniqueness_reason);
    }
  });

  await check("the same input always resolves the same way", () => {
    const a = buildTypographyDNA({ blueprint: COFFEE.organic, personality: "crafted", brandKit: KIT, copyLines: 3 });
    const b = buildTypographyDNA({ blueprint: COFFEE.organic, personality: "crafted", brandKit: KIT, copyLines: 3 });
    assert.deepStrictEqual(a, b, "the DNA is not deterministic");
  });

  // ── 3. the role is reasoned, and is not an enum ─────────────────────────
  console.log("\n3 — what typography is FOR, per artwork");

  await check("the role changes with how much the picture is already carrying", async () => {
    const busy = await mapOf(await noisyScene());
    const carrying = buildTypographyDNA({ blueprint: COFFEE.futuristic, copyLines: 1, map: busy });
    const quiet = buildTypographyDNA({ blueprint: COFFEE.luxury, copyLines: 1, map: await mapOf(await flatScene("#efeae1")) });
    assert.notStrictEqual(carrying.typography_role, quiet.typography_role, "the role ignored what the picture is doing");
    assert.ok(/signature|step|quiet/.test(carrying.typography_role), carrying.typography_role);
    assert.ok(carrying.because.typography_role.includes("picture"), carrying.because.typography_role);
  });

  await check("a lot of copy is a different job from one line", () => {
    const one = buildTypographyDNA({ blueprint: COFFEE.luxury, copyLines: 1 });
    const many = buildTypographyDNA({ blueprint: COFFEE.luxury, copyLines: 5 });
    assert.notStrictEqual(one.typography_role, many.typography_role);
    assert.ok(/information|order|clarity|act on/.test(many.typography_role), many.typography_role);
    assert.ok(!one.font_need.display === false || one.typography_role !== many.typography_role);
  });

  await check("the layout's own decisions constrain the role", () => {
    // Typography is part of the composition, so what the layout reserved for
    // it counts: a strip down one edge is not somewhere a hero statement can
    // live, however good the idea is.
    const idea = { big_idea: "An idea worth saying out loud", emotional_hook: "conviction" };
    const roomy = buildTypographyDNA({ blueprint: blueprint({ ...idea, negative_space: "a generous quiet upper third reserved for copy" }), copyLines: 1 });
    const cramped = buildTypographyDNA({ blueprint: blueprint({ ...idea, negative_space: "a narrow strip along the lower margin" }), copyLines: 1 });
    assert.notStrictEqual(roomy.typography_role, cramped.typography_role, "the reserved area did not change the job");
    assert.ok(/hero/.test(roomy.typography_role), roomy.typography_role);
    assert.ok(/signature|quiet/.test(cramped.typography_role), cramped.typography_role);
    assert.ok(/little room|strip|margin/.test(cramped.because.typography_role), cramped.because.typography_role);
    // And the director's stated reading order is carried, not re-invented.
    const ordered = buildTypographyDNA({
      blueprint: blueprint({ ...idea, hierarchy_logic: "the price is read last, after the promise" }),
      copyLines: 1,
    });
    assert.ok(ordered.typography_role.includes("price is read last"), ordered.typography_role);
  });

  await check("the role quotes the brief rather than naming a category", () => {
    const d = buildTypographyDNA({ blueprint: COFFEE.organic, copyLines: 1 });
    // A role built from the director's words is per-brief by construction; a
    // label would be identical across briefs that share a label.
    const other = buildTypographyDNA({ blueprint: COFFEE.luxury, copyLines: 1 });
    assert.notStrictEqual(d.typography_role, other.typography_role);
    assert.ok(d.emotional_purpose.length > 10 && d.relationship_to_product.length > 10);
  });

  await check("every reasoning field is populated and traceable", () => {
    const d = buildTypographyDNA({ blueprint: COFFEE.futuristic, copyLines: 2, brandKit: KIT });
    for (const k of ["typography_role", "emotional_purpose", "relationship_to_product", "relationship_to_scene", "visual_behavior", "uniqueness_reason"]) {
      assert.ok(String((d as any)[k]).length > 20, `${k} is empty or a stub: "${(d as any)[k]}"`);
    }
    for (const k of ["personality", "treatment", "typography_role", "uniqueness"]) {
      assert.ok((d.because[k] || "").length > 10, `${k} was decided without a recorded reason`);
    }
    assert.ok(d.because.treatment.includes("("), "the reasons do not name the fields they came from");
  });

  // ── 4. reasoning comes before the typeface ──────────────────────────────
  console.log("\n4 — the letters are chosen to express what was decided");

  await check("the font need is derived from the idea, and differs across the four", () => {
    const needs = (["luxury", "playful", "futuristic", "organic"] as const).map((n) => {
      const d = buildTypographyDNA({ blueprint: (COFFEE as any)[n], copyLines: 2 });
      return `${n}: ${d.font_need.contrast.toFixed(2)}/${d.font_need.humanist ? "hand" : "built"}/${d.font_need.display ? "display" : "text"}`;
    });
    for (const n of needs) console.log(`      ${n}`);
    assert.strictEqual(new Set(needs.map((n) => n.split(": ")[1])).size >= 3, true, `only ${new Set(needs).size} distinct needs across four ideas`);
  });

  await check("the compositor decides the treatment before it picks a face", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "evolution/experiment/EditableDesign.ts"), "utf-8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const dna = code.indexOf("buildTypographyDNA(");
    const font = code.indexOf("selectPairing(");
    assert.ok(dna > 0 && font > 0, "one of the two calls is missing");
    assert.ok(dna < font, "the typeface is chosen before the creative reasoning that should drive it");
    assert.ok(/need: dna\.font_need/.test(code), "the reasoning is not handed to the typeface selector");
  });

  await check("the need actually moves the chosen face", () => {
    const { selectFont } = require("./evolution/experiment/FontIntelligence");
    const modulated = selectFont({ personality: "direct", lines: ["BOLD"], need: { contrast: 0.9, humanist: false, display: false } });
    const even = selectFont({ personality: "direct", lines: ["BOLD"], need: { contrast: 0.05, humanist: false, display: false } });
    const hand = selectFont({ personality: "direct", lines: ["BOLD"], need: { contrast: 0.2, humanist: true, display: false } });
    assert.notStrictEqual(modulated.family, even.family, "stroke contrast did not change the face");
    assert.notStrictEqual(hand.family, even.family, "asking for a hand did not change the face");
    assert.strictEqual(modulated.class, "serif", `a modulated need chose ${modulated.class}`);
  });

  // ── 5. every behaviour renders ──────────────────────────────────────────
  console.log("\n5 — the behaviours are what the renderer can actually draw");

  await check("every axis draws something VISIBLY different from plain type", async () => {
    const plains = { dark: await rasterise(null, DARK), light: await rasterise(null, LIGHT) };
    const weak: string[] = [];
    const seen: string[] = [];
    for (const axis of TREATMENT_AXES) {
      const onDark = visibleChange(await rasterise(axis, DARK), plains.dark);
      const onLight = visibleChange(await rasterise(axis, LIGHT), plains.light);
      const best = Math.max(onDark, onLight);
      seen.push(`${axis} ${(best * 100).toFixed(0)}%`);
      if (best < 0.1) weak.push(`${axis} changes ${(best * 100).toFixed(1)}% of the type's area at its best: invisible`);
    }
    console.log(`      visible change vs plain: ${seen.join(", ")}`);
    assert.deepStrictEqual(weak, [], `behaviours that do not show:\n    ${weak.join("\n    ")}`);
  });

  await check("behaviours COMBINE: two together differ from either alone", async () => {
    // The point of axes rather than named looks. No preset could express this.
    const plain = await rasterise(null, DARK);
    const paint = treatmentPaint(
      { treatment: { ...NEUTRAL_TREATMENT, softness: 0.6, luminosity: 0.7, contact: 0.4 }, accent: "#e8b04a" },
      "combo", DARK.fg, { size: 64 },
    );
    const attrs = Object.entries(paint.attrs).map(([k, v]) => `${k}="${v}"`).join(" ");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="160"><rect width="620" height="160" fill="${DARK.bg}"/>` +
      `<defs>${paint.defs}</defs><text x="24" y="104" font-family="Segoe UI" font-size="64" font-weight="700" ${attrs}>Giảm giá 50%</text></svg>`;
    const { data, info } = await sharp(Buffer.from(svg)).png().raw().toBuffer({ resolveWithObject: true });
    const grey: number[] = [];
    for (let i = 0; i < data.length; i += info.channels) grey.push((data[i] + data[i + 1] + data[i + 2]) / 3);
    const combo = visibleChange({ grey }, plain);
    const soft = visibleChange(await rasterise("softness", DARK), plain);
    const lum = visibleChange(await rasterise("luminosity", DARK), plain);
    console.log(`      soft ${(soft * 100).toFixed(0)}% · luminous ${(lum * 100).toFixed(0)}% · both+contact ${(combo * 100).toFixed(0)}%`);
    assert.ok(combo > 0.2, `the combination changed ${(combo * 100).toFixed(0)}% of the type: the chain did not apply`);
    assert.ok(Math.abs(combo - soft) > 0.05 && Math.abs(combo - lum) > 0.05, "the combination renders as one of its parts");
  });

  await check("every filter and gradient referenced is also defined", () => {
    for (const axis of TREATMENT_AXES) {
      const paint = treatmentPaint({ treatment: { ...NEUTRAL_TREATMENT, [axis]: 1 }, accent: "#e8b04a" }, "probe", "#ffffff", {});
      for (const m of JSON.stringify(paint.attrs).matchAll(/url\(#([^)]+)\)/g)) {
        assert.ok(paint.defs.includes(`id="${m[1]}"`), `${axis} references #${m[1]} and defines nothing`);
      }
    }
    // And a chain of several still defines exactly one filter, with every
    // intermediate result produced before it is consumed.
    const all = treatmentPaint(
      { treatment: { ...NEUTRAL_TREATMENT, softness: 0.5, luminosity: 0.5, relief: 0.5, contact: 0.5, sheen: 0.5 }, accent: "#e8b04a" },
      "all", "#ffffff", {},
    );
    assert.strictEqual((all.defs.match(/<filter /g) || []).length, 1, "the chain produced more than one filter");
    for (const m of all.defs.matchAll(/in="([a-z_]+)"/g)) {
      if (m[1] === "SourceGraphic") continue;
      assert.ok(all.defs.indexOf(`result="${m[1]}"`) < all.defs.indexOf(`in="${m[1]}"`), `${m[1]} is used before it is produced`);
    }
  });

  await check("two layers wearing the same behaviour get their own definitions", () => {
    const t = { treatment: { ...NEUTRAL_TREATMENT, luminosity: 0.8 }, accent: null };
    const a = treatmentPaint(t, "headline", "#fff", {});
    const b = treatmentPaint(t, "cta", "#fff", {});
    // Shared ids across layers is the classic SVG bug: the last definition wins
    // and both layers get it.
    assert.notStrictEqual(a.defs, b.defs, "two layers emitted the same definition id");
    assert.ok(a.defs.includes("headline") && b.defs.includes("cta"));
  });

  await check("a treatment sized for a probe still shows on a production headline", async () => {
    // Offsets and blurs scale with the type's size. Measured at 320px against
    // the same treatment sized for 64px, fixed pixels cost most of the effect.
    for (const [axis, ground] of [["luminosity", DARK], ["softness", DARK], ["contact", LIGHT], ["relief", LIGHT]] as const) {
      const small = visibleChange(await rasterise(axis, ground), await rasterise(null, ground));
      const bigPlain = await rasterise(null, ground, { size: 320 });
      const scaled = visibleChange(await rasterise(axis, ground, { size: 320 }), bigPlain);
      const fixed = visibleChange(await rasterise(axis, ground, { size: 320, scale: false }), bigPlain);
      console.log(`      ${axis}: 64px ${(small * 100).toFixed(0)}% → 320px ${(scaled * 100).toFixed(0)}% (unscaled ${(fixed * 100).toFixed(0)}%)`);
      assert.ok(scaled > small * 0.7, `${axis} loses its treatment on large type`);
      assert.ok(scaled >= fixed, `${axis} scaled worse than fixed pixels; the scaling is upside down`);
    }
  });

  // ── 6. legibility outranks decoration ───────────────────────────────────
  console.log("\n6 — measured against the render, not only the idea");

  await check("emitted light is dropped on a frame that came back bright", async () => {
    const bp = blueprint({ atmosphere: "a luminous radiant glow", lighting_behavior: "backlit and radiant" });
    const dark = buildTypographyDNA({ blueprint: bp, copyLines: 1, map: await mapOf(await flatScene("#12161a")) });
    assert.ok(dark.treatment.luminosity > 0.3, "a dark frame lost its light");
    const bright = buildTypographyDNA({ blueprint: bp, copyLines: 1, map: await mapOf(await flatScene("#f6f3ec")) });
    assert.strictEqual(bright.treatment.luminosity, 0, "light was kept on a bright frame");
    assert.ok(bright.refused.some((r: string) => /luminosity/.test(r)), "the refusal was not recorded");
  });

  await check("a busy frame attenuates rather than deletes", async () => {
    const bp = blueprint({ atmosphere: "weightless drifting haze", visual_world: "clear glass and water" });
    const calm = buildTypographyDNA({ blueprint: bp, copyLines: 1, map: await mapOf(await flatScene("#d8d2c8")) });
    const busy = buildTypographyDNA({ blueprint: bp, copyLines: 1, map: await mapOf(await noisyScene()) });
    assert.ok(busy.treatment.softness < calm.treatment.softness, "a busy frame kept the same soft edges");
    assert.ok(busy.treatment.translucency < calm.treatment.translucency, "a busy frame kept the same transparency");
    assert.ok(busy.refused.some((r: string) => /busy/.test(r)), `no reason was recorded: ${JSON.stringify(busy.refused)}`);
  });

  await check("a dark frame gets enough weight to hold light strokes up", async () => {
    const d = buildTypographyDNA({
      blueprint: blueprint({ atmosphere: "weightless drifting haze", emotional_hook: "restraint" }),
      personality: "quiet", copyLines: 1, map: await mapOf(await flatScene("#0c0f12")),
    });
    assert.ok(d.treatment.weight >= 500, `weight ${d.treatment.weight} on a dark frame`);
    assert.ok(/dark/.test(d.because.weight), "the raise was not explained");
  });

  await check("transparency is spent down to what the contrast affords", () => {
    // Mid grey on white: legal as solid ink, illegal thinned.
    const tight = treatmentForContrast({ ...NEUTRAL_TREATMENT, translucency: 0.8 }, "#767676", "#ffffff");
    assert.ok(tight.treatment.translucency < 0.8, "transparency was kept where there was nothing to spend");
    assert.ok(tight.refused.some((r: string) => /4\.5/.test(r)), `the floor was not cited: ${tight.refused}`);
    // White on near-black has ratio to spare, so it survives in full.
    const roomy = treatmentForContrast({ ...NEUTRAL_TREATMENT, translucency: 0.8 }, "#ffffff", "#0a0a0a");
    assert.strictEqual(roomy.treatment.translucency, 0.8, "transparency was reduced where the contrast could afford it");
  });

  await check("a brand's surface colour is checked in the colour it will be drawn in", () => {
    // A graded surface REPLACES the ink with the brand's colour, so the
    // contrast the layout engine verified no longer applies to it.
    const dark = treatmentForContrast({ ...NEUTRAL_TREATMENT, sheen: 0.8 }, "#ffffff", "#0a0a0a", "#1f3a2e");
    assert.strictEqual(dark.treatment.sheen, 0, "a dark surface colour was kept on a dark frame");
    assert.ok(dark.refused.some((r: string) => /sheen/.test(r)));
    const gold = treatmentForContrast({ ...NEUTRAL_TREATMENT, sheen: 0.8 }, "#ffffff", "#0a0a0a", "#e8b04a");
    assert.strictEqual(gold.treatment.sheen, 0.8, "a gold surface was refused on a dark frame");
  });

  await check("a brand that forbids a behaviour does not get it", () => {
    const kit = normalizeBrandKit({
      name: "Restraint", colors: [{ hex: "#101010", role: "primary" }],
      fonts: {}, has_logo: false, style: { forbidden: ["glow"], preferred: [], references: [] },
    });
    const d = buildTypographyDNA({ blueprint: blueprint({ atmosphere: "a luminous radiant glow behind the bottle" }), brandKit: kit, copyLines: 1 });
    assert.strictEqual(d.treatment.luminosity, 0);
    assert.ok(d.refused.some((r: string) => /luminosity/.test(r) && /forbid/.test(r)), JSON.stringify(d.refused));
  });

  // ── 7. the category, recognised rather than invented ────────────────────
  console.log("\n7 — the category comes from the director's own words");

  await check("a category is recognised, in English and Vietnamese", () => {
    assert.strictEqual(categoryHint(blueprint({ visual_story: "a cup of coffee on a wet table" })), "beverage");
    assert.strictEqual(categoryHint(blueprint({ visual_story: "một ly cà phê buổi sáng" })), "beverage");
    assert.strictEqual(categoryHint(blueprint({ visual_world: "a serum bottle on wet skin" })), "beauty");
    assert.strictEqual(categoryHint(blueprint({ big_idea: "the laptop that keeps up" })), "technology");
  });

  await check("nothing recognisable means no category, not a guess", () => {
    assert.strictEqual(categoryHint(blueprint({ big_idea: "a promise kept quietly" })), null);
    assert.strictEqual(categoryHint(null), null);
  });

  // ── 8. what the image prompt is told ────────────────────────────────────
  console.log("\n8 — the prompt asks for a frame, never for lettering");

  await check("a plain treatment adds nothing to the prompt", () => {
    assert.strictEqual(renderDnaForImagePrompt(buildTypographyDNA({ blueprint: blueprint({}), copyLines: 2 })), undefined);
    assert.strictEqual(renderDnaForImagePrompt(null), undefined);
  });

  await check("a strong behaviour asks the frame to be ready for it, briefly", () => {
    const lengths: string[] = [];
    for (const [name, bp] of [
      ["metal", blueprint({ material_rendering: "polished chrome under a hard raking light" })],
      ["glow", blueprint({ atmosphere: "a luminous radiant glow", lighting_behavior: "backlit" })],
      ["glass", blueprint({ visual_world: "transparent glass and clear water", material_rendering: "crystal" })],
      ["mist", blueprint({ atmosphere: "weightless drifting haze", emotional_hook: "the dream before waking" })],
    ] as const) {
      const line = renderDnaForImagePrompt(buildTypographyDNA({ blueprint: bp, copyLines: 1 }));
      assert.ok(line, `${name} told the renderer nothing`);
      // The budget: the last healthy render measured 31,892 of the provider's
      // 32,000. A line that pushes a render over the limit costs the image.
      assert.ok(line.length <= 95, `${name} is ${line.length} chars; the prompt has about 100 spare`);
      assert.ok(/copy area/.test(line), line);
      lengths.push(`${name} ${line.length}`);
    }
    console.log(`      prompt cost: ${lengths.join(", ")} chars`);
  });

  await check("the prompt line never names a typeface, a weight or a word of the copy", () => {
    for (const bp of Object.values(COFFEE).concat([RACING])) {
      const line = renderDnaForImagePrompt(buildTypographyDNA({ blueprint: bp, copyLines: 2 })) || "";
      for (const bad of [/Cambria|Segoe|Georgia|Arial|serif/i, /font|typeface|px|pt\b/i, /\b(headline|write|spell|render the text)\b/i]) {
        assert.ok(!bad.test(line), `the prompt line leaks "${bad}": ${line}`);
      }
      for (const l of [...EN, ...VI]) assert.ok(!line.includes(l), "the prompt line carries the client's copy");
    }
  });

  // ── 9. the compositor, end to end ───────────────────────────────────────
  console.log("\n9 — the reasoning reaches the picture");

  await check("the design carries the reasoning, and the SVG carries the behaviour", async () => {
    const { doc, plan } = design(EN, "1:1", KIT);
    const c = await composeEditable({
      document: doc, brandKit: KIT, plan, blueprint: COFFEE.futuristic,
      scene: await flatScene("#14181c"), logo: null,
    });
    const dna = c.design.typography_dna;
    assert.ok(dna, "the design records no typographic art direction");
    assert.ok(dna.typography_role.length > 30, "the design records no role");
    for (const t of texts(c.design)) assert.ok(t.treatment, `${t.role} has no treatment, not even a neutral one`);
    const svg = editableSvg(c.design, {}, { skipScene: true });
    assert.ok(/data-treatment="/.test(svg), "the SVG does not say what it drew");
    assert.ok(/<defs>/.test(svg) && svg.indexOf("<defs>") < svg.indexOf("<text"), "definitions come after their first use");
  });

  await check("only the headline wears the treatment", async () => {
    const { doc, plan } = design(EN, "1:1", KIT);
    const c = await composeEditable({
      document: doc, brandKit: KIT, plan,
      blueprint: blueprint({ atmosphere: "weightless drifting haze", emotional_hook: "the dream before waking" }),
      scene: await flatScene("#101418"), logo: null,
    });
    assert.ok(c.design.typography_dna.treatment.softness > 0.3, "the design lost its treatment entirely");
    for (const t of texts(c.design)) {
      const treated = TREATMENT_AXES.some((a: string) => (t.treatment?.[a] ?? 0) >= 0.12);
      if (t.role === "headline") assert.ok(treated, "the headline did not get the treatment");
      else assert.ok(!treated, `${t.role} was decorated; only the headline carries the voice`);
    }
  });

  await check("the treatment never touches the client's words", async () => {
    for (const [lines, bp] of [[EN, COFFEE.futuristic], [VI, COFFEE.organic], [VI, COFFEE.playful]] as const) {
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
    const c = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: COFFEE.playful, scene: await flatScene("#101418"), logo: null });
    const svg = editableSvg(c.design, {}, { skipScene: true });
    assert.strictEqual((svg.match(/<text /g) || []).length, texts(c.design).length, "a text layer was not written as text");
    assert.ok(!/<path/.test(svg), "the type was converted to outlines");
  });

  await check("two different ideas produce two different served images", async () => {
    const { doc, plan } = design(EN, "1:1", KIT);
    const scene = await flatScene("#14181c");
    const a = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: COFFEE.luxury, scene, logo: null });
    const b = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: COFFEE.futuristic, scene, logo: null });
    const h = (buf: Buffer) => crypto.createHash("md5").update(buf).digest("hex");
    assert.notStrictEqual(h(a.composite), h(b.composite), "two different creative ideas rendered the same picture");
    assert.strictEqual((await sharp(b.composite).metadata()).width, 1024, "the composite lost its size");
  });

  await check("no blueprint composites exactly as it did before this phase", async () => {
    const { doc, plan } = design(EN, "1:1", KIT);
    const before = await composeEditable({ document: doc, brandKit: KIT, plan, scene: await flatScene("#e9e2d6"), logo: null });
    for (const t of texts(before.design)) {
      for (const axis of TREATMENT_AXES) {
        assert.strictEqual(t.treatment?.[axis] ?? 0, 0, `${t.role} was decorated with no direction to justify it`);
      }
    }
    assert.ok(!/data-treatment/.test(editableSvg(before.design, {}, { skipScene: true })), "a plain design still declared a behaviour");
  });

  await check("a Vietnamese headline keeps a face that can draw it whatever the treatment", async () => {
    const { doc, plan } = design(VI, "1:1", KIT);
    const c = await composeEditable({ document: doc, brandKit: KIT, plan, blueprint: COFFEE.playful, scene: await flatScene("#14181c"), logo: null });
    const svg = editableSvg(c.design, {}, { skipScene: true });
    for (const b of ["Georgia", "Times New Roman", "Impact", "Arial Black", "Book Antiqua"]) {
      assert.ok(!svg.includes(b), `the overlay names ${b}, which cannot draw Vietnamese`);
    }
  });

  // ── 10. telemetry ───────────────────────────────────────────────────────
  console.log("\n10 — what is logged");

  await check("telemetry names decisions and never the copy", () => {
    const d = buildTypographyDNA({ blueprint: COFFEE.organic, personality: "crafted", copyLines: 3 });
    const t = JSON.stringify(typographyDnaTelemetry(d));
    for (const l of [...EN, ...VI]) assert.ok(!t.includes(l), "the telemetry leaked the client's copy");
    assert.ok(/behaviour/.test(t) && /role/.test(t) && /font_need/.test(t));
    assert.deepStrictEqual(typographyDnaTelemetry(null), { typography_dna: false });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
