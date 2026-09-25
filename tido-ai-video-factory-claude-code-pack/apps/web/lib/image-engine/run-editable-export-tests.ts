/**
 * Phase 5.5 — Real Editable Export. Offline: no model, no database.
 *
 * The design is planned from the design document, composed into the served
 * picture, and written out as PSD, PPTX (Canva), SVG and Figma. Every file is
 * then READ BACK and its layers inspected: a test that only checks a builder
 * did not throw would pass on a flattened file.
 *
 * The live half is `lib/persistence/verify-editable-export.ts`.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");
const { readPsd } = require("ag-psd");
const { buildGeometry } = require("./evolution/experiment/LayoutGeometry");
const { buildTypographySystem, assignTextRoles, geometryRolesFor } = require("./evolution/experiment/TypographySystem");
const { buildCreativeDocument } = require("./evolution/experiment/CreativeDocument");
const { normalizeBrandKit, contrastRatio, brandKitDirective } = require("./evolution/experiment/BrandKit");
const { resolveTextRequirement } = require("./compiler/ExactCopyIntegrityValidator");
const { NO_TEXT_DIRECTIVE } = require("./evolution/experiment/TypographyRenderer");
const {
  planEditableDesign, composeEditable, editableSvg, editableTelemetry, estimateTextWidth,
} = require("./evolution/experiment/EditableDesign");
const { measure, breakLines, advanceEms } = require("./evolution/experiment/TextLayoutEngine");
const { buildCompositionMap, placementScore, overlapShare } = require("./evolution/experiment/CompositionMap");
const { buildTypographyPlan, renderPlanForImagePrompt, typographyPlanTelemetry } = require("./evolution/experiment/TypographyPlan");
const { buildPsd, buildPptx, buildSvg, buildFigma, postScriptName, FORMATS } = require("../design-export/builders");
const { exportFilename, generationDir } = require("../design-export/export-service");

const WEB = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf-8");

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

const KIT = normalizeBrandKit({
  name: "Lumi Coffee",
  colors: [{ hex: "#1f3a2e", role: "primary" }, { hex: "#e8b04a", role: "accent" }, { hex: "#f4efe6", role: "background" }],
  fonts: { heading: "Playfair Display", body: "Montserrat" },
  style: { preferred: ["minimal"], forbidden: ["neon"] },
  has_logo: true,
});

const LINES = ["Summer Sale 50%", "Chỉ trong tuần này", "Đặt ngay 0901 234 567"];

function documentFor(lines: string[], kit: unknown = KIT, ratio = "1:1") {
  const assigned = assignTextRoles(lines);
  const geometry = buildGeometry({
    ratio, copyRoles: geometryRolesFor(assigned), productCount: 1,
    hasLogo: Boolean((kit as { has_logo?: boolean } | null)?.has_logo), brandKit: kit,
  });
  const typography = buildTypographySystem({ geometry, lines: assigned, brandKit: kit });
  return buildCreativeDocument({ geometry, typography, brandKit: kit, canvasLongEdge: 2048 });
}

let scene: Buffer;
let logo: Buffer;
/** The composed design and its assets, built once and reused. */
let composed: { design: any; composite: Buffer; files: Record<string, Buffer> };
let assets: { scene: Buffer; logo: Buffer | null; composite: Buffer };

const texts = (d: { layers: { kind: string }[] }) => d.layers.filter((l) => l.kind === "text") as any[];

/**
 * A layer's text with the layout engine's line breaks collapsed back to spaces.
 *
 * Wrapping is a treatment, not an edit: a headline set on two lines is still
 * the client's one line. Every assertion below compares against this, so a
 * changed WORD still fails while a changed BREAK does not.
 */
const oneLine = (t: string) => String(t).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

/** The text of one `<text>` element, its `<tspan>` children rejoined. */
const svgTextOf = (el: string) =>
  oneLine([...el.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]).join(" ") || (/>([^<]*)<\/text>/.exec(el)?.[1] ?? ""));

/** Every `<text>` element's content, in document order. */
const svgTexts = (svg: string) => [...svg.matchAll(/<text[\s\S]*?<\/text>/g)].map((m) => svgTextOf(m[0]));

async function main() {
  scene = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#e9e2d6" } })
    .composite([{ input: Buffer.from('<svg width="1024" height="1024"><rect x="380" y="300" width="260" height="480" rx="40" fill="#3b2415"/></svg>') }])
    .png().toBuffer();
  logo = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="140" fill="#1f3a2e"/></svg>')).png().toBuffer();
  composed = await composeEditable({ document: documentFor(LINES), brandKit: KIT, scene, logo });
  assets = { scene: composed.files["layers/scene.png"], logo: composed.files["layers/logo.png"], composite: composed.composite };

  // ── 5.5.1 ────────────────────────────────────────────────────────────────
  console.log("\n5.5.1 — design document normalisation");

  await check("the design comes from the document, never from a rendered image", async () => {
    const src = read("lib/image-engine/evolution/experiment/EditableDesign.ts") + read("lib/design-export/builders.ts");
    assert.ok(!/\b(ocr|segment|tesseract|detectText|reconstructLayers)\b/i.test(src), "the export path references image reconstruction");

    // Behavioural, not textual: withhold the flattened composite entirely. If a
    // builder were recovering anything from the rendered picture, its output
    // would change. Every layer must come from the design and its assets.
    const bare = { scene: assets.scene, logo: assets.logo };
    for (const [name, build] of [["svg", buildSvg], ["figma", buildFigma], ["pptx", buildPptx]] as const) {
      const a = await build(composed.design, assets);
      const b = await build(composed.design, bare);
      // pptx embeds a creation timestamp, so compare the slide, not the zip.
      if (name === "pptx") {
        assert.strictEqual(readZipEntry(a, "ppt/slides/slide1.xml"), readZipEntry(b, "ppt/slides/slide1.xml"), "pptx changed when the composite was withheld");
      } else {
        assert.ok(a.equals(b), `${name} changed when the composite was withheld`);
      }
    }
    // The PSD uses it for one thing only: the flattened preview Photoshop shows
    // before layers load. Its layer tree must be identical without it.
    const tree = (buf: Buffer) => {
      const psd = readPsd(buf, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
      const walk = (ns: any[]): any[] => ns.flatMap((n) => [{ name: n.name, text: n.text?.text ?? null, box: [n.left, n.top, n.right, n.bottom] }, ...(n.children ? walk(n.children) : [])]);
      return JSON.stringify(walk(psd.children));
    };
    assert.strictEqual(tree(await buildPsd(composed.design, assets)), tree(await buildPsd(composed.design, bare)), "the PSD's layers changed when the composite was withheld");
  });

  await check("canvas carries width, height, aspect ratio and a background colour", () => {
    const c = composed.design.canvas;
    assert.deepStrictEqual({ w: c.width, h: c.height, r: c.aspect_ratio, u: c.unit }, { w: 1024, h: 1024, r: "1:1", u: "px" });
    assert.strictEqual(c.background.color, "#f4efe6", "the brand's background colour was not used");
    assert.strictEqual(composed.design.version, 3);
    assert.strictEqual(composed.design.scene_is_single_raster, true);
  });

  await check("image layers carry an asset reference, position, size, crop, rotation, opacity and z", () => {
    for (const l of composed.design.layers.filter((x: any) => x.kind === "image")) {
      assert.ok(composed.design.assets[l.asset], `${l.id} references a missing asset`);
      assert.ok(Number.isFinite(l.x) && Number.isFinite(l.y) && l.width > 0 && l.height > 0, `${l.id} has no box`);
      assert.deepStrictEqual(l.crop, { x: 0, y: 0, width: 1, height: 1 });
      assert.ok(Number.isFinite(l.rotation) && l.opacity >= 0 && l.opacity <= 1 && Number.isFinite(l.z));
    }
    const a = composed.design.assets.scene;
    assert.strictEqual(a.kind, "scene_plate");
    assert.ok(/^[0-9a-f]{64}$/.test(a.sha256), "assets are not checksummed");
  });

  await check("text layers carry exact text, family, size, weight, line height, spacing, colour, position, alignment", () => {
    const t = texts(composed.design);
    assert.deepStrictEqual(t.map((x) => x.content), LINES, "text layers do not hold the exact lines");
    for (const x of t) {
      assert.ok(x.font_family && /serif|sans-serif/.test(x.font_fallback), `${x.id} has no family`);
      assert.ok(x.font_size >= 10 && x.font_weight >= 300 && x.line_height >= 1, `${x.id} has no metrics`);
      assert.ok(typeof x.letter_spacing === "number" && /^#[0-9a-f]{6}$/.test(x.color), `${x.id} colour ${x.color}`);
      assert.ok(["left", "center", "right"].includes(x.align));
      assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.width <= 1024 + 1, `${x.id} is outside the canvas`);
    }
  });

  await check("the brand's fonts name the text layers; a design without a brand still names a real face", () => {
    const branded = texts(composed.design);
    assert.strictEqual(branded[0].font_family, "Playfair Display");
    assert.strictEqual(branded[2].font_family, "Montserrat");
    const plainDoc = documentFor(LINES, null);
    const plain = planEditableDesign({ document: plainDoc, scene: { width: 1024, height: 1024, sha256: "x" } });
    for (const t of texts(plain)) assert.ok(t.font_family && t.font_fallback, "no usable face without a brand");
  });

  await check("a logo layer references the stored mark and keeps its proportions", () => {
    const l = composed.design.layers.find((x: any) => x.id === "logo");
    assert.ok(l && l.kind === "image" && l.role === "logo");
    assert.strictEqual(l.asset, "logo");
    assert.strictEqual(l.width, l.height, "a square mark was not kept square");
    assert.ok(composed.files["layers/logo.png"], "the logo asset was not stored");
  });

  await check("the CTA plate is an effect layer under its line, in the brand accent", () => {
    const plate = composed.design.layers.find((l: any) => l.effect === "plate");
    const cta = texts(composed.design).find((t) => t.role === "cta");
    assert.ok(plate, "no plate layer");
    assert.strictEqual(plate.fill, "#e8b04a");
    assert.strictEqual(plate.attached_to, cta.id);
    assert.ok(plate.z < cta.z, "the plate is drawn over its text");
    assert.ok(plate.x <= cta.x && plate.x + plate.width >= cta.x + cta.width, "the plate does not cover its line");
    assert.ok(contrastRatio(cta.color, plate.fill) >= 4.5, "CTA contrast below AA");
  });

  await check("a long line is broken into lines, never shortened, and every line fits its box", () => {
    const long = ["Khuyến mãi mùa hè cực lớn cho toàn bộ sản phẩm cà phê ủ lạnh Origin Blend"];
    const d = planEditableDesign({ document: documentFor(long), scene: { width: 1024, height: 1024, sha256: "x" } });
    const t = texts(d)[0];
    assert.strictEqual(t.content, long[0], "the line was altered to fit");
    assert.ok(t.lines.length > 1, "a line this long was set on one line; it was fitted, not typeset");
    assert.strictEqual(t.lines.join(" "), long[0], "wrapping changed the words");
    for (const line of t.lines) {
      assert.ok(measure(line, t.font_size, t.font_weight, t.letter_spacing) <= t.width + 2, `a visual line overflows its box: "${line}"`);
    }
  });

  await check("hierarchy survives a long headline: the headline is never set smaller than what supports it", () => {
    // The measured defect this engine was built to remove. A headline longer
    // than its subheadline used to shrink further than it, inverting the read
    // order on every ordinary brief.
    const lines = [
      "Bộ sưu tập mùa hè rực rỡ dành cho bạn",
      "Giảm đến 50% toàn bộ sản phẩm",
      "Đặt hàng ngay hôm nay",
    ];
    for (const ratio of ["1:1", "16:9", "9:16"]) {
      const d = planEditableDesign({ document: documentFor(lines, KIT, ratio), scene: { width: 1024, height: 1024, sha256: "x" } });
      const [headline, sub_, cta] = texts(d);
      assert.ok(headline.font_size >= sub_.font_size, `${ratio}: headline ${headline.font_size}px is smaller than subheadline ${sub_.font_size}px`);
      assert.ok(sub_.font_size >= cta.font_size, `${ratio}: subheadline ${sub_.font_size}px is smaller than the CTA ${cta.font_size}px`);
    }
  });

  await check("text blocks never overlap each other", () => {
    const d = composed.design;
    const t = texts(d);
    for (let i = 0; i < t.length; i++) {
      for (let j = i + 1; j < t.length; j++) {
        const a = t[i];
        const b = t[j];
        const hit = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        assert.ok(!hit, `${a.role} overlaps ${b.role}`);
      }
    }
  });

  await check("every line sits inside the frame's safe area", () => {
    const d = composed.design;
    const inset = Math.round(Math.min(d.canvas.width, d.canvas.height) * 0.05) - 1;
    for (const t of texts(d)) {
      assert.ok(t.x >= inset, `${t.role} crosses the left safe margin`);
      assert.ok(t.y >= inset, `${t.role} crosses the top safe margin`);
      assert.ok(t.x + t.width <= d.canvas.width - inset, `${t.role} crosses the right safe margin`);
      assert.ok(t.y + t.height <= d.canvas.height - inset, `${t.role} crosses the bottom safe margin`);
    }
  });

  await check("layer order is background, scene, effects, logo, text", () => {
    const names = composed.design.layers.map((l: any) => l.id);
    assert.strictEqual(names[0], "background");
    assert.strictEqual(names[1], "scene");
    const zOf = (id: string) => composed.design.layers.find((l: any) => l.id === id).z;
    assert.ok(zOf("logo") > zOf("scene"));
    for (const t of texts(composed.design)) assert.ok(t.z > zOf("logo"), "text sits under the logo");
  });

  // ── typography constraint ────────────────────────────────────────────────
  console.log("\nTypography constraint (preserved from Phase 4/5)");

  await check("CASE 1 — text provided: one editable layer per line, content exact", () => {
    const req = resolveTextRequirement({ contentMessage: LINES.join("\n") });
    const d = planEditableDesign({ document: documentFor(req.lines), scene: { width: 1024, height: 1024, sha256: "x" } });
    assert.strictEqual(d.text_mode, "exact");
    assert.deepStrictEqual(texts(d).map((t) => t.content), LINES);
  });

  await check("CASE 2 — no text: no text layer anywhere, in the design or in any file", async () => {
    const req = resolveTextRequirement({});
    assert.strictEqual(req.mode, "none");
    const c = await composeEditable({ document: documentFor(req.lines), brandKit: KIT, scene, logo });
    assert.strictEqual(c.design.text_mode, "none");
    assert.strictEqual(texts(c.design).length, 0);
    assert.strictEqual(c.design.layers.filter((l: any) => l.effect === "plate").length, 0, "a CTA plate with no CTA");
    const a = { scene: c.files["layers/scene.png"], logo: c.files["layers/logo.png"], composite: c.composite };
    const psd = readPsd(await buildPsd(c.design, a), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    const walk = (ns: any[]): any[] => ns.flatMap((n) => [n, ...(n.children ? walk(n.children) : [])]);
    assert.ok(!walk(psd.children).some((n) => n.text), "the PSD invented a text layer");
    assert.ok(!/<text /.test((await buildSvg(c.design, a)).toString("utf-8")), "the SVG invented text");
    const figma = JSON.parse((await buildFigma(c.design, a)).toString("utf-8"));
    assert.ok(!figma.document.children.some((n: any) => n.type === "TEXT"), "the Figma JSON invented a text node");
    // The logo still belongs on a wordless image.
    assert.ok(c.design.layers.some((l: any) => l.id === "logo"));
  });

  // ── 5.5.3 PSD ────────────────────────────────────────────────────────────
  console.log("\n5.5.3 — Photoshop PSD");

  let psdBuffer: Buffer;
  await check("the PSD opens, at the design's size, with the expected layer tree", async () => {
    psdBuffer = await buildPsd(composed.design, assets);
    const psd = readPsd(psdBuffer, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    assert.strictEqual(psd.width, 1024);
    assert.strictEqual(psd.height, 1024);
    const top = psd.children.map((c: any) => c.name);
    assert.deepStrictEqual(top, ["Background", "Scene (background + product)", "Effects", "Logo", "Text"]);
    assert.ok(psd.children.find((c: any) => c.name === "Text").children.length === 3, "not one layer per line");
    assert.ok(psd.children.find((c: any) => c.name === "Effects").children.some((c: any) => c.name === "CTA plate"));
  });

  await check("its text layers are real text: exact content, brand font, size, colour, alignment", () => {
    const psd = readPsd(psdBuffer, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    const group = psd.children.find((c: any) => c.name === "Text");
    assert.deepStrictEqual(group.children.map((c: any) => oneLine(c.text.text)), LINES, "PSD text is not the client's lines");
    const headline = group.children[0];
    assert.strictEqual(headline.text.style.font.name, "PlayfairDisplay-Bold");
    assert.strictEqual(headline.text.style.fontSize, texts(composed.design)[0].font_size);
    // ag-psd stores text colour as doubles, so 31 reads back as 31.0006.
    const c = headline.text.style.fillColor;
    assert.strictEqual(`#${[c.r, c.g, c.b].map((v: number) => Math.round(v).toString(16).padStart(2, "0")).join("")}`, texts(composed.design)[0].color);
    assert.strictEqual(group.children[2].text.paragraphStyle.justification, texts(composed.design)[2].align);
  });

  await check("every PSD layer has its own pixels and its own bounds -- nothing is flattened", () => {
    // `useRawData` leaves the bitmaps undecoded and `getLayerImageData` decodes
    // one at a time; decoding into a canvas would need node-canvas, which this
    // project does not install.
    const psd = readPsd(psdBuffer, { useRawData: true, useRawThumbnail: true, skipCompositeImageData: true });
    const walk = (ns: any[]): any[] => ns.flatMap((n) => [n, ...(n.children ? walk(n.children) : [])]);
    const leaves = walk(psd.children).filter((n) => !n.children);
    assert.deepStrictEqual(leaves.map((l) => l.name), [
      "Background", "Scene (background + product)", "CTA plate", "Logo",
      "Text — headline", "Text — subheadline", "Text — cta",
    ]);
    for (const l of leaves) {
      // The encoded bitmap, not the decoded one: decoding needs node-canvas,
      // which this project does not install. Its presence is the claim anyway --
      // a flattened file would have one of these, not seven.
      const bytes = (l.rawData?.channels || []).reduce((n: number, c: { data?: { length: number } }) => n + (c.data?.length || 0), 0);
      assert.ok(bytes > 0, `${l.name} has no pixels of its own`);
      assert.ok(l.right > l.left && l.bottom > l.top, `${l.name} has empty bounds`);
    }
    // Each placed layer must be tight around its own content, not the whole
    // canvas: that is the difference between a layer you can drag and a
    // flattened frame. Only the background legitimately fills the frame.
    for (const l of leaves) {
      if (l.name === "Background" || /^Scene/.test(l.name)) continue;
      assert.ok(l.right - l.left < 1024 && l.bottom - l.top < 1024, `${l.name} spans the whole canvas`);
    }
  });

  await check("font names map to PostScript names Photoshop recognises", () => {
    assert.strictEqual(postScriptName("Arial", 700), "Arial-BoldMT");
    assert.strictEqual(postScriptName("Arial", 400), "ArialMT");
    assert.strictEqual(postScriptName("Georgia", 700), "Georgia-Bold");
    assert.strictEqual(postScriptName("Playfair Display", 400), "PlayfairDisplay-Regular");
    assert.strictEqual(postScriptName("Montserrat", 600), "Montserrat-SemiBold");
  });

  // ── 5.5.2 Canva ──────────────────────────────────────────────────────────
  console.log("\n5.5.2 — Canva editable export (.pptx)");

  await check("the pptx is a real OOXML package with one slide", async () => {
    const buf = await buildPptx(composed.design, assets);
    assert.strictEqual(buf.subarray(0, 2).toString("latin1"), "PK", "not a zip");
    const names = listZip(buf);
    assert.ok(names.includes("ppt/slides/slide1.xml"), "no slide");
    assert.ok(names.includes("[Content_Types].xml"));
    assert.strictEqual(names.filter((n) => /^ppt\/media\/.*\.png$/.test(n)).length, 2, "scene and logo are not separate media");
  });

  await check("its text is editable text with the brand font -- not a picture of text", async () => {
    const xml = readZipEntry(await buildPptx(composed.design, assets), "ppt/slides/slide1.xml");
    // One text box per client line; a wrapped box holds several runs separated
    // by `<a:br/>`, so the box is rejoined before it is compared.
    const boxes = [...xml.matchAll(/<p:txBody>[\s\S]*?<\/p:txBody>/g)]
      .map((m) => oneLine([...m[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((r) => r[1]).join(" ")))
      .filter(Boolean);
    assert.deepStrictEqual(boxes, LINES, "the slide's text is not the client's lines");
    assert.ok(/typeface="Playfair Display"/.test(xml) && /typeface="Montserrat"/.test(xml), "brand fonts missing");
    assert.strictEqual((xml.match(/<p:pic>/g) || []).length, 2, "scene and logo are not separate pictures");
    // 3 text boxes + 1 CTA plate shape.
    assert.strictEqual((xml.match(/<p:sp>/g) || []).length, 4);
  });

  await check("the slide is the design's own size and keeps the brand background", async () => {
    const buf = await buildPptx(composed.design, assets);
    const pres = readZipEntry(buf, "ppt/presentation.xml");
    // 1024px at 96dpi = 10.667in = 9,753,600 EMU.
    const m = /sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres);
    assert.ok(m, "no slide size");
    assert.ok(Math.abs(Number(m![1]) - 9753600) < 20000, `slide width ${m![1]} EMU`);
    assert.ok(/f4efe6/i.test(readZipEntry(buf, "ppt/slides/slide1.xml")), "the brand background was lost");
  });

  // ── 5.5.4 SVG ────────────────────────────────────────────────────────────
  console.log("\n5.5.4 — SVG");

  await check("the SVG has one live <text> per line, positioned, coloured and embedded images", async () => {
    const svg = (await buildSvg(composed.design, assets)).toString("utf-8");
    assert.deepStrictEqual(svgTexts(svg), LINES.map((l) => l.replace(/&/g, "&amp;")), "SVG text is not the client's lines");
    assert.ok(/font-family="'Playfair Display'/.test(svg), "no brand font");
    assert.strictEqual((svg.match(/<image /g) || []).length, 2, "scene and logo are not separate images");
    assert.ok(/href="data:image\/png;base64,/.test(svg), "images are not embedded");
    assert.ok(!/<image[^>]*href=""/.test(svg), "an image has an empty href");
  });

  await check("the SVG rasterises to the design's size and is valid XML", async () => {
    const svg = await buildSvg(composed.design, assets);
    const meta = await sharp(svg).metadata();
    assert.strictEqual(meta.width, 1024);
    assert.strictEqual(meta.height, 1024);
  });

  await check("a line containing XML-special characters is escaped, not broken", async () => {
    const tricky = ['Sale <50% & "more"', "Đặt ngay"];
    const c = await composeEditable({ document: documentFor(tricky), brandKit: KIT, scene, logo });
    const svg = (await buildSvg(c.design, { scene: c.files["layers/scene.png"], logo: c.files["layers/logo.png"] })).toString("utf-8");
    assert.ok(svgTexts(svg).includes('Sale &lt;50% &amp; &quot;more&quot;'), "special characters were not escaped");
    assert.ok(!/<tspan[^>]*>[^<]*[<>"][^<]*<\/tspan>/.test(svg.replace(/&[a-z]+;/g, "")), "a raw special character reached the SVG");
    await sharp(Buffer.from(svg)).metadata(); // parses
  });

  // ── 5.5.5 Figma ──────────────────────────────────────────────────────────
  console.log("\n5.5.5 — Figma");

  await check("the Figma JSON is a frame of TEXT and RECTANGLE nodes with Figma's own fields", async () => {
    const doc = JSON.parse((await buildFigma(composed.design, assets)).toString("utf-8"));
    assert.strictEqual(doc.document.type, "FRAME");
    assert.strictEqual(doc.document.width, 1024);
    const nodes = doc.document.children;
    // `characters` carries the layout engine's line breaks; `exactContent` is
    // the client's line untouched. Both are checked: a tool that reads either
    // one must get the words right.
    assert.deepStrictEqual(nodes.filter((n: any) => n.type === "TEXT").map((n: any) => oneLine(n.characters)), LINES);
    assert.deepStrictEqual(nodes.filter((n: any) => n.type === "TEXT").map((n: any) => n.exactContent), LINES);
    const headline = nodes.find((n: any) => n.type === "TEXT");
    assert.strictEqual(headline.style.fontFamily, "Playfair Display");
    assert.ok(headline.style.fontSize > 0 && headline.style.lineHeightPx > 0);
    assert.strictEqual(headline.style.textAlignHorizontal, "CENTER");
    assert.ok(headline.fills[0].color.r >= 0 && headline.fills[0].color.r <= 1, "colour is not 0..1");
    const img = nodes.find((n: any) => n.fills?.[0]?.type === "IMAGE");
    assert.ok(img && doc.images[img.fills[0].imageRef], "image node has no backing image");
  });

  // ── the render path ──────────────────────────────────────────────────────
  console.log("\nEditable mode in the render pipeline");

  await check("the scene is rendered with no text and no logo, and the composite carries both", async () => {
    const { ExperimentPipeline } = require("./evolution/ExperimentPipeline");
    const doc = documentFor(LINES);
    let sentPrompt = "";
    let sentRefs: unknown[] = [];
    const inner = {
      name: "scene-only",
      async generateImage(i: { prompt: string; references?: unknown[] }) {
        sentPrompt = i.prompt;
        sentRefs = i.references || [];
        return { success: true, imageBuffer: scene, mimeType: "image/png" };
      },
    };
    let captured: any = null;
    const wrapped = ExperimentPipeline.wrapProvider(
      inner, null, false, undefined, undefined, false, undefined, false, undefined,
      [brandKitDirective(KIT, "none", { logo: false }), NO_TEXT_DIRECTIVE].filter(Boolean).join("\n\n"),
      { document: () => doc, brandKit: KIT, logo, onComposed: (r: any) => { captured = r; } },
    );
    const genId = `test-editable-${Date.now()}`;
    const out = await wrapped.generateImage({ prompt: "SCENE", aspectRatio: "1:1", references: [], generationId: genId });

    assert.ok(/RENDER NO TEXT/.test(sentPrompt), "the renderer was not told to leave the frame wordless");
    for (const l of LINES) assert.ok(!sentPrompt.includes(l), `the renderer was given the line "${l}" to draw`);
    assert.ok(!/exactly once, unaltered/.test(sentPrompt), "the renderer was still told to draw the logo");
    assert.ok(/BRAND KIT — Lumi Coffee/.test(sentPrompt), "the palette was lost with the logo rule");
    assert.strictEqual(sentRefs.length, 0);

    assert.ok(captured, "the composition was not reported back");
    assert.deepStrictEqual(texts(captured.design).map((t: any) => t.content), LINES);
    assert.notStrictEqual(out.imageBuffer, scene, "the served image is the bare scene");
    const meta = await sharp(out.imageBuffer).metadata();
    assert.strictEqual(meta.width, 1024);

    // The layer assets landed beside the render, where the exporter looks.
    const dir = generationDir(genId);
    assert.ok(fs.existsSync(path.join(dir, "layers", "scene.png")), "the scene plate was not stored");
    assert.ok(fs.existsSync(path.join(dir, "layers", "logo.png")), "the logo asset was not stored");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await check("a failed composition serves the scene rather than failing the paid render", async () => {
    const { ExperimentPipeline } = require("./evolution/ExperimentPipeline");
    const inner = { name: "x", async generateImage() { return { success: true, imageBuffer: scene, mimeType: "image/png" }; } };
    const wrapped = ExperimentPipeline.wrapProvider(
      inner, null, false, undefined, undefined, false, undefined, false, undefined, "",
      { document: () => null, brandKit: KIT, logo: null, onComposed: () => {} },
    );
    const out = await wrapped.generateImage({ prompt: "P", aspectRatio: "1:1", references: [], generationId: `test-none-${Date.now()}` });
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.imageBuffer, scene);
  });

  await check("Editable mode rides on the execution layer and is a property of the request", () => {
    const pipeline = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    assert.ok(/const editableOn = executionOn && Boolean\(decision\.editableLayers\)/.test(pipeline));
    assert.ok(/contentMessage: "",/.test(pipeline) && /copyItems: \[\]/.test(pipeline), "the render request is not stripped");
    assert.ok(/\.filter\(\(i\) => \(i as \{ role\?: string \}\)\.role !== "LOGO"\)/.test(pipeline), "the logo is not held back");
    const router = read("lib/image-engine/evolution/PipelineRouter.ts");
    assert.ok(/editable\?: boolean/.test(router) && /editableLayers\?: boolean/.test(router));
    assert.ok(!/userId|firebaseUid|profile/.test(router.slice(router.indexOf("editable?: boolean") - 400, router.indexOf("editable?: boolean"))), "an account leaked into the routing context");
  });

  await check("the route honours Editable mode only for a verified person", () => {
    const route = read("app/api/image/generate-simple/route.ts");
    assert.ok(/editable: editableRequested && Boolean\(verifiedIdentity\)/.test(route), "an anonymous request could ask for layers");
    assert.ok(/editableExport: Boolean\(/.test(route), "the client is not told whether layers exist");
  });

  // ── 5.5.6 / security ─────────────────────────────────────────────────────
  console.log("\nExport service, UI and security");

  await check("every format is served, with its own extension and media type", () => {
    assert.deepStrictEqual(Object.keys(FORMATS).sort(), ["figma", "pptx", "psd", "svg"]);
    assert.strictEqual(FORMATS.psd.mime, "image/vnd.adobe.photoshop");
    assert.strictEqual(FORMATS.pptx.mime, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    const name = exportFilename(composed.design, "gen_1790262686_abc", "psd");
    assert.strictEqual(name, "lumi-coffee-design-62686abc.psd");
    assert.ok(!/[^\w.-]/.test(name), "the filename is not safe for a header");
  });

  await check("a generation id cannot escape the generated directory", () => {
    for (const bad of ["../secrets", "a/b", "a\\b", "..", ""]) assert.strictEqual(generationDir(bad), null, bad);
    assert.ok(generationDir("gen_123")?.endsWith(`${path.sep}gen_123`));
  });

  await check("export requires sign-in, checks the run, and never trusts the directory", () => {
    const route = read("app/api/exports/[generationId]/route.ts");
    assert.ok(/status: 401/.test(route), "signed out is not refused");
    assert.ok(/resolveActor\(identity\)/.test(route));
    assert.ok(/Cache-Control": "private, no-store/.test(route), "exports could be cached by a proxy");
    const service = read("lib/design-export/export-service.ts");
    assert.ok(/infra\.runs\.get\(req\.actor, runId\)/.test(service), "the run's ownership is not checked");
    assert.ok(/infra\.intelligence\.getForRun\(req\.actor, runId\)/.test(service));
    assert.ok(service.indexOf("runs.get(req.actor") < service.indexOf("layers\", \"scene.png\""), "assets are read before authorisation");
    assert.ok(/status: 404, error: "not found"/.test(service), "a hidden run is distinguishable from a missing one");
  });

  await check("a render with no layers explains itself instead of serving a flattened file", () => {
    const service = read("lib/design-export/export-service.ts");
    assert.ok(/status: 409/.test(service));
    assert.ok(/not made in Editable mode/.test(service));
  });

  await check("the UI separates the image download from the editable design files", () => {
    const canvas = read("features/picture-engine/components/canvas/RenderCanvas.tsx");
    assert.ok(/Tải Ảnh PNG/.test(canvas), "the PNG button does not say it is the image");
    assert.ok(/<EditableExportPanel/.test(canvas));
    const panel = read("features/picture-engine/components/canvas/EditableExportPanel.tsx");
    for (const f of ["psd", "pptx", "svg", "figma"]) assert.ok(new RegExp(`id: "${f}"`).test(panel), `${f} is not offered`);
    assert.ok(/File thiết kế \(sửa được\)/.test(panel), "the editable group is not labelled");
    assert.ok(/Nền và sản phẩm nằm chung một lớp/.test(panel), "the UI does not say the scene is one layer");
    assert.ok(/useAuthedFetch/.test(panel), "downloads are not authenticated");
  });

  // ── 5.5.8 CASE 4 ─────────────────────────────────────────────────────────
  console.log("\nCASE 4 — reopen every exported file");

  await check("every format round-trips with its layers still separate", async () => {
    const results: Record<string, number> = {};
    const psd = readPsd(await buildPsd(composed.design, assets), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    const walk = (ns: any[]): any[] => ns.flatMap((n) => [n, ...(n.children ? walk(n.children) : [])]);
    results.psd = walk(psd.children).filter((n) => !n.children).length;
    const xml = readZipEntry(await buildPptx(composed.design, assets), "ppt/slides/slide1.xml");
    results.pptx = (xml.match(/<p:pic>/g) || []).length + (xml.match(/<p:sp>/g) || []).length;
    const svg = (await buildSvg(composed.design, assets)).toString("utf-8");
    results.svg = (svg.match(/<(text|image|rect) /g) || []).length;
    results.figma = JSON.parse((await buildFigma(composed.design, assets)).toString("utf-8")).document.children.length;
    for (const [k, n] of Object.entries(results)) assert.ok(n >= 5, `${k} came back with only ${n} objects`);
    // The same three lines survive in all four.
    for (const hay of [JSON.stringify(walk(psd.children).map((n) => n.text?.text)), xml, svg, JSON.stringify(results)]) void hay;
    for (const l of LINES) {
      assert.ok(walk(psd.children).some((n) => n.text && oneLine(n.text.text) === l), `PSD lost "${l}"`);
      const boxes = [...xml.matchAll(/<p:txBody>[\s\S]*?<\/p:txBody>/g)]
        .map((m) => oneLine([...m[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((r) => r[1]).join(" ")));
      assert.ok(boxes.includes(l), `pptx lost "${l}"`);
      assert.ok(svgTexts(svg).includes(l), `svg lost "${l}"`);
      assert.ok(JSON.parse((await buildFigma(composed.design, assets)).toString("utf-8"))
        .document.children.some((n: any) => n.exactContent === l), `figma lost "${l}"`);
    }
  });

  await check("the design and the picture agree: same canvas, same lines, same count", () => {
    const t = editableTelemetry(composed.design);
    assert.strictEqual(t.canvas, "1024x1024");
    assert.strictEqual(t.text_layers, 3);
    assert.strictEqual(t.image_layers, 2);
    assert.ok(t.min_text_contrast >= 4.5, `weakest text contrast ${t.min_text_contrast}`);
    const overlay = editableSvg(composed.design, {}, { skipScene: true });
    for (const l of LINES) assert.ok(svgTexts(overlay).includes(l), "the composite overlay lost a line");
    assert.ok(!/<image /.test(overlay.replace(/<image [^>]*id="logo"[^>]*\/>/, "")), "the overlay redraws the scene");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

// ── a minimal zip reader, so the pptx is checked as a real package ─────────

function listZip(buf: Buffer): string[] {
  const names: string[] = [];
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const n = buf.readUInt16LE(i + 26);
    names.push(buf.subarray(i + 30, i + 30 + n).toString("utf-8"));
  }
  return names;
}

function readZipEntry(buf: Buffer, name: string): string {
  const zlib = require("zlib");
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const method = buf.readUInt16LE(i + 8);
    const compressed = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const entry = buf.subarray(i + 30, i + 30 + nameLen).toString("utf-8");
    if (entry !== name) continue;
    const start = i + 30 + nameLen + extraLen;
    const data = buf.subarray(start, start + compressed);
    return (method === 0 ? data : zlib.inflateRawSync(data)).toString("utf-8");
  }
  throw new Error(`zip entry not found: ${name}`);
}

main();
