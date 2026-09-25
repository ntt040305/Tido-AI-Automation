/**
 * Phase 5 — Professional Design Output. Offline: no model, no database.
 *
 * 5.1 the editable design document, 5.2 typography, 5.3 layout, 5.4 brand kit,
 * and the three acceptance cases: exact text, no text, brand kit applied. The
 * live half is `lib/persistence/verify-design-output.ts`.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { buildGeometry, placementLabel, sideFromComposition, renderGeometry } = require("./evolution/experiment/LayoutGeometry");
const { buildTypographySystem, assignTextRoles, geometryRolesFor, renderTypography } = require("./evolution/experiment/TypographySystem");
const { buildCreativeDocument, canvasFor } = require("./evolution/experiment/CreativeDocument");
const {
  normalizeBrandKit, normalizeHex, contrastRatio, readableOn, brandKitBrief, brandKitDirective,
  forbiddenStylesIn, preferredStylesIn, wantsGenerousSpace,
} = require("./evolution/experiment/BrandKit");
const { evaluateDirections, BRAND_VIOLATION_PENALTY } = require("./evolution/experiment/DirectionEvaluator");
const { resolveTextRequirement, checkRenderedText } = require("./compiler/ExactCopyIntegrityValidator");
const { DESIGN_CONTEXT_KEYS } = require("./evolution/VisionReviewLayer");
const { syncDesignDocument } = require("../persistence/record-generation");

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
  colors: [{ hex: "#1A2B3C", role: "primary" }, { hex: "f5c400", role: "accent" }, "#fff"],
  fonts: { heading: "Playfair Display", body: "Inter" },
  style: { preferred: ["minimal", "luxury"], forbidden: ["neon", "cartoon"], typography_preference: "serif headline, sans body" },
  has_logo: true,
});

const LINES = ["Summer Sale 50%", "Chỉ trong tuần này", "Đặt ngay 0901 234 567"];

/** The pipeline's own sequence: roles → geometry → typography → document. */
function design(opts: { lines: string[]; ratio?: string; kit?: unknown; hint?: string; products?: number }) {
  const lines = assignTextRoles(opts.lines);
  const geometry = buildGeometry({
    ratio: opts.ratio || "4:5",
    copyRoles: geometryRolesFor(lines),
    productCount: opts.products ?? 1,
    hasLogo: Boolean((opts.kit as { has_logo?: boolean } | null)?.has_logo),
    compositionHint: opts.hint ?? null,
    brandKit: opts.kit ?? null,
  });
  const typography = buildTypographySystem({ geometry, lines, brandKit: opts.kit ?? null });
  const document = buildCreativeDocument({ geometry, typography, brandKit: opts.kit ?? null, canvasLongEdge: 2048 });
  return { lines, geometry, typography, document };
}

const textElements = (doc: { elements: any[] }): any[] => doc.elements.filter((e) => e.type === "text");

async function main() {
  // ── 5.1 ──────────────────────────────────────────────────────────────────
  console.log("\n5.1 — the editable design document");

  await check("canvas has pixel width, height and aspect ratio for every supported ratio", () => {
    assert.deepStrictEqual(canvasFor("1:1"), { width: 2048, height: 2048, aspect_ratio: "1:1", unit: "px" });
    assert.deepStrictEqual(canvasFor("4:5"), { width: 1638, height: 2048, aspect_ratio: "4:5", unit: "px" });
    assert.deepStrictEqual(canvasFor("9:16"), { width: 1152, height: 2048, aspect_ratio: "9:16", unit: "px" });
    assert.deepStrictEqual(canvasFor("16:9"), { width: 2048, height: 1152, aspect_ratio: "16:9", unit: "px" });
  });

  await check("every layer has type, position, size, rotation, opacity, z-index and styling", () => {
    const { document } = design({ lines: LINES, kit: KIT });
    assert.strictEqual(document.version, 2);
    for (const e of document.elements) {
      assert.ok(["image", "text", "background", "effect"].includes(e.layer_type), `${e.id} has layer_type ${e.layer_type}`);
      assert.ok(e.position_px && Number.isFinite(e.position_px.x) && Number.isFinite(e.position_px.y), `${e.id} has no pixel position`);
      assert.ok(e.size_px && e.size_px.width > 0 && e.size_px.height > 0, `${e.id} has no pixel size`);
      assert.ok(Number.isFinite(e.rotation), `${e.id} has no rotation`);
      assert.ok(e.opacity >= 0 && e.opacity <= 1, `${e.id} opacity out of range`);
      assert.ok(Number.isFinite(e.z_index), `${e.id} has no z-index`);
      assert.ok(e.style && typeof e.style === "object", `${e.id} has no style`);
    }
  });

  await check("layers sit inside the canvas", () => {
    const { document } = design({ lines: LINES, kit: KIT, ratio: "9:16" });
    for (const e of document.elements) {
      assert.ok(e.position_px.x >= 0 && e.position_px.x <= document.canvas.width, `${e.id} x outside canvas`);
      assert.ok(e.position_px.y >= 0 && e.position_px.y <= document.canvas.height, `${e.id} y outside canvas`);
    }
  });

  await check("text layers stack above image layers", () => {
    const { document } = design({ lines: LINES, kit: KIT });
    const product = document.elements.find((e: { type: string }) => e.type === "product");
    for (const t of textElements(document)) assert.ok(t.z_index > product.z_index);
  });

  await check("the document is carried as hidden design context through the vision loop", () => {
    assert.ok(DESIGN_CONTEXT_KEYS.includes("designDocument"));
    const pipeline = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    assert.ok(/capturedDocument = doc/.test(pipeline), "the pipeline does not capture the document it rendered from");
    assert.strictEqual((pipeline.match(/attachDesignContext\([^)]*capturedDocument/g) || []).length, 2, "both result paths must attach the document");
  });

  await check("the stored document is synchronised with the served render's text check", () => {
    const { document } = design({ lines: LINES, kit: KIT });
    const result = {
      generationId: "gen_1",
      imageUrl: "/api/generated/gen_1/output.webp",
      visionTrace: {
        selected: 2,
        versions: [
          { version: 1, analysis: { analyzed_image: true, text_check: { compliant: false, missing: [LINES[2]], incorrect: [], unwanted: [] } } },
          { version: 2, analysis: { analyzed_image: true, text_check: { compliant: false, missing: [], incorrect: [{ expected: LINES[1], rendered: "Chi trong tuan nay" }], unwanted: [] } } },
        ],
      },
    };
    const synced = syncDesignDocument(document, result);
    assert.strictEqual(synced.sync.generation_id, "gen_1");
    assert.strictEqual(synced.sync.served_version, 2, "must check the version that was served, not the first");
    assert.strictEqual(synced.sync.rendered_from_document, true);
    assert.strictEqual(synced.sync.raster_is_flat, true);
    assert.strictEqual(synced.sync.text_layers, 3);
    assert.strictEqual(synced.sync.text_layers_verified, 2);
    const byContent = Object.fromEntries(textElements(synced).map((e: any) => [e.content, e.verified_in_render]));
    assert.deepStrictEqual(byContent, { [LINES[0]]: true, [LINES[1]]: false, [LINES[2]]: true });
    assert.strictEqual(syncDesignDocument(null, result), null);
  });

  await check("without a vision review, text layers are left unverified rather than assumed", () => {
    const { document } = design({ lines: LINES });
    const synced = syncDesignDocument(document, { generationId: "g" });
    assert.strictEqual(synced.sync.text_check_compliant, null);
    assert.strictEqual(synced.sync.text_layers_verified, null);
    assert.ok(textElements(synced).every((e: any) => e.verified_in_render === undefined));
  });

  await check("the design document is persisted on creative_blueprints (0013)", () => {
    const sql = read("../../packages/infrastructure/migrations/0013_design_output.sql");
    assert.ok(/alter table (public\.)?creative_blueprints\s+add column if not exists design_document jsonb/i.test(sql));
    const repo = read("../../packages/infrastructure/src/supabase/intelligence.repository.ts");
    assert.ok(/design_document: doc\(input\.designDocument\)/.test(repo));
    const rec = read("lib/persistence/record-generation.ts");
    assert.ok(/designDocument: syncDesignDocument\(/.test(rec));
  });

  // ── 5.2 ──────────────────────────────────────────────────────────────────
  console.log("\n5.2 — typography intelligence");

  await check("roles: first line is the headline, a closing action is the CTA, the rest support", () => {
    assert.deepStrictEqual(assignTextRoles(LINES).map((l: { role: string }) => l.role), ["headline", "subheadline", "cta"]);
    assert.deepStrictEqual(assignTextRoles(["Ưu đãi hè", "Giảm 50%", "Áp dụng toàn quốc"]).map((l: { role: string }) => l.role), ["headline", "subheadline", "body"]);
    assert.deepStrictEqual(assignTextRoles(["Visit www.lumi.vn"]).map((l: { role: string }) => l.role), ["headline"], "a single line leads, whatever it says");
  });

  await check("the director's role labels win over order", () => {
    const lines = assignTextRoles(["Mua ngay", "Cà phê rang mộc"], [{ text: "Mua ngay", role: "CTA" }, { text: "Cà phê rang mộc", role: "HEADLINE" }]);
    assert.deepStrictEqual(lines.map((l: { role: string }) => l.role), ["cta", "headline"]);
  });

  await check("no exact line is ever dropped, whatever roles the director assigned", () => {
    // Live defect found by CASE 1: the director labelled the first line
    // PRODUCT_NAME (body); the geometry laid out that line's band as
    // "subheadline", typography looked for "supporting", and the document
    // silently lost the line -- 3 lines in, 2 text layers out.
    const L = ["Cà phê ủ lạnh Origin Blend", "Giảm 20% – chỉ trong tuần này!", "Đặt ngay: 0909 123 456"];
    const labellings = [
      [{ text: L[0], role: "PRODUCT_NAME" }, { text: L[1], role: "OFFER" }, { text: L[2], role: "CTA" }],
      [{ text: L[0], role: "SUPPORTING_TEXT" }, { text: L[1], role: "SUPPORTING_TEXT" }, { text: L[2], role: "SUPPORTING_TEXT" }],
      [{ text: L[0], role: "CTA" }, { text: L[1], role: "CTA" }, { text: L[2], role: "HEADLINE" }],
    ];
    for (const labels of labellings) {
      for (const ratio of ["1:1", "9:16", "16:9"]) {
        const lines = assignTextRoles(L, labels);
        const geometry = buildGeometry({ ratio, copyRoles: geometryRolesFor(lines), productCount: 1 });
        const typography = buildTypographySystem({ geometry, lines });
        for (const s of typography.specs) assert.ok(geometry.zones.some((z: { name: string }) => z.name === s.zone), `${s.role} points at missing zone ${s.zone}`);
        const document = buildCreativeDocument({ geometry, typography, canvasLongEdge: 2048 });
        assert.deepStrictEqual(textElements(document).map((e) => e.content).sort(), [...L].sort(), `${ratio} ${labels.map((l) => l.role)}`);
      }
    }
  });

  await check("every spec carries its line verbatim -- never reworded, recased or trimmed of accents", () => {
    const { typography } = design({ lines: LINES, kit: KIT });
    assert.deepStrictEqual(typography.specs.map((s: { text: string }) => s.text), LINES);
  });

  await check("the typography block states the treatment and never repeats the words", () => {
    // It used to repeat them. Measured on a three-line brief, each line then
    // reached the image model three times in one prompt -- here, in the
    // compiler's copy section, and in the text directive appended last -- three
    // blocks each telling a renderer to set type from the same string. That is
    // where duplicated text in the render came from.
    //
    // The treatment still travels in full. Only the copy is gone, replaced by
    // the line's number in the directive's own authoritative list.
    const { typography } = design({ lines: LINES, kit: KIT });
    const rendered = renderTypography(typography);
    for (const l of LINES) assert.ok(!rendered.includes(l), `the typography block still repeats "${l}"`);
    for (let i = 0; i < LINES.length; i++) {
      assert.ok(rendered.includes(`line ${i + 1} of the text list`), `line ${i + 1} is not addressable`);
    }
    assert.ok(/Playfair Display/.test(rendered), "the brand font was lost with the copy");
    assert.ok(/set each listed line exactly once/i.test(rendered), "nothing forbids drawing a line twice");
  });

  await check("hierarchy: headline largest, CTA separated, scale strictly ordered", () => {
    const { typography } = design({ lines: LINES });
    const scale = Object.fromEntries(typography.specs.map((s: { role: string; scale: number }) => [s.role, s.scale]));
    assert.ok(scale.headline > scale.subheadline && scale.subheadline > scale.cta);
    assert.deepStrictEqual(typography.attention_order.map((a: { role: string }) => a.role), ["headline", "subheadline", "cta"]);
  });

  await check("font pairing comes from the brand when it has fonts, from the personality otherwise", () => {
    const branded = design({ lines: LINES, kit: KIT }).typography;
    assert.strictEqual(branded.specs[0].font_family, "Playfair Display");
    assert.strictEqual(branded.specs[1].font_family, "Inter");
    assert.ok(branded.pairing, "no pairing recorded");
    const plain = design({ lines: LINES }).typography;
    assert.ok(plain.specs.every((s: { font_family?: string; font_class?: string }) => !s.font_family && s.font_class), "invented a typeface without a brand");
  });

  await check("spacing and readability: line heights per role, Vietnamese diacritics protected", () => {
    const { typography } = design({ lines: LINES });
    for (const s of typography.specs) assert.ok(s.line_height >= 1 && s.line_height <= 1.5, `${s.role} line height ${s.line_height}`);
    assert.ok(typography.readability_rules.some((r: string) => /diacritic|dấu/i.test(r)), "Vietnamese diacritics rule missing");
  });

  await check("contrast: the CTA plate meets WCAG AA and records its ratio", () => {
    const { typography } = design({ lines: LINES, kit: KIT });
    const cta = typography.specs.find((s: { role: string }) => s.role === "cta");
    assert.ok(cta.contrast.ratio >= 4.5, `CTA contrast ${cta.contrast.ratio}`);
    assert.strictEqual(cta.contrast.ratio, contrastRatio(cta.color, "#f5c400"));
    assert.ok(/#f5c400/.test(cta.treatment), "the CTA plate is not the brand accent");
  });

  await check("typography decisions are stored with the run (typography row + document styles)", () => {
    const rec = read("lib/persistence/record-generation.ts");
    assert.ok(/typography/.test(rec));
    const { document } = design({ lines: LINES, kit: KIT });
    for (const t of textElements(document) as any[]) {
      assert.ok(t.style.font_size_px > 0 && t.style.line_height && t.style.color && t.style.contrast, `${t.id} lacks stored styling`);
    }
  });

  // ── 5.3 ──────────────────────────────────────────────────────────────────
  console.log("\n5.3 — layout intelligence");

  await check("placement labels read the frame in thirds", () => {
    assert.strictEqual(placementLabel(20, 15), "top-left");
    assert.strictEqual(placementLabel(64, 55), "center-right");
    assert.strictEqual(placementLabel(50, 85), "bottom-center");
    assert.strictEqual(sideFromComposition("product placed right of centre"), "right");
    assert.strictEqual(sideFromComposition("bottle on the left third"), "left");
    assert.strictEqual(sideFromComposition("bottle centred"), null);
  });

  await check("director puts the product right: product center-right, headline top-left, CTA bottom", () => {
    const { geometry } = design({ lines: LINES, hint: "product placed right of centre" });
    const d = geometry.decisions;
    assert.strictEqual(d.product_placement, "center-right");
    assert.strictEqual(d.headline_placement, "top-left");
    assert.strictEqual(d.cta_placement, "bottom area");
    assert.strictEqual(d.alignment, "left");
    assert.strictEqual(d.balance, "asymmetric");
    assert.ok(/opposite side/.test(d.because));
  });

  await check("no composition hint keeps the original centred layout", () => {
    const d = design({ lines: LINES }).geometry.decisions;
    assert.strictEqual(d.balance, "symmetric");
    assert.strictEqual(d.alignment, "centre");
  });

  await check("layout decisions state grid, whitespace and hierarchy, and reach the render prompt", () => {
    const { geometry } = design({ lines: LINES, hint: "the cup sits in the left third" });
    const d = geometry.decisions;
    assert.ok(/grid/.test(d.grid) && d.whitespace.share > 0 && d.whitespace.label);
    assert.strictEqual(d.hierarchy[0], "product");
    assert.ok(/^- layout: product center-left/m.test(renderGeometry(geometry)), "the decisions are not in the prompt");
  });

  await check("a premium brand gets more whitespace than the same layout without it", () => {
    const plain = design({ lines: LINES }).geometry.decisions.whitespace.share;
    const premium = design({ lines: LINES, kit: KIT }).geometry.decisions.whitespace.share;
    assert.ok(premium > plain, `premium ${premium} vs plain ${plain}`);
  });

  await check("no copy: the frame is composed for the image alone", () => {
    const d = design({ lines: [] }).geometry.decisions;
    assert.strictEqual(d.headline_placement, null);
    assert.strictEqual(d.cta_placement, null);
    assert.strictEqual(d.alignment, "none");
  });

  // ── 5.4 ──────────────────────────────────────────────────────────────────
  console.log("\n5.4 — brand kit");

  await check("normalisation: hex cleaned, roles defaulted, unsafe characters stripped, name required", () => {
    assert.strictEqual(normalizeHex("F5C400"), "#f5c400");
    assert.strictEqual(normalizeHex("#abc"), "#aabbcc");
    assert.strictEqual(normalizeHex("red"), null);
    assert.deepStrictEqual(KIT.colors.map((c: { hex: string; role: string }) => `${c.role}:${c.hex}`), ["primary:#1a2b3c", "accent:#f5c400", "secondary:#ffffff"]);
    assert.strictEqual(normalizeBrandKit({ colors: ["#000"] }), null);
    const dirty = normalizeBrandKit({ name: "<script>x</script>Brand", style: { forbidden: Array(30).fill(0).map((_, i) => `s${i}`) } });
    assert.ok(!/[<>]/.test(dirty.name));
    assert.strictEqual(dirty.style.forbidden.length, 10);
  });

  await check("contrast maths is WCAG", () => {
    assert.strictEqual(contrastRatio("#000000", "#ffffff"), 21);
    assert.strictEqual(readableOn("#1a2b3c"), "#ffffff");
    assert.strictEqual(readableOn("#f5c400"), "#111111");
  });

  await check("the director's brief carries palette, fonts, preferences, forbidden styles and the logo", () => {
    const b = brandKitBrief(KIT);
    for (const s of ["#1a2b3c", "Playfair Display", "minimal", "Never propose: neon, cartoon", "logo"]) assert.ok(b.includes(s), `brief lacks ${s}`);
  });

  await check("the render directive: palette, logo exactly once and unaltered, forbidden styles avoided", () => {
    const d = brandKitDirective(KIT);
    assert.ok(/exactly once, unaltered/.test(d) && /never on the product/.test(d));
    assert.ok(/Avoid entirely: neon, cartoon/.test(d));
    assert.ok(/Set the supplied text in the brand's fonts/.test(d));
  });

  await check("no text: the brand kit never mentions fonts, so it cannot invite typography", () => {
    for (const block of [brandKitBrief(KIT, "none"), brandKitDirective(KIT, "none")]) {
      assert.ok(!/Playfair|Inter|font|typography/i.test(block), `font lines leaked into a no-text brief:\n${block}`);
      assert.ok(/#1a2b3c/.test(block), "the palette must still apply");
    }
    // Phase 5.5 named the render prompt's final block `finalDirective`; both
    // director paths pass that one value, and it is built from the text mode.
    const pipeline = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    assert.ok(/brandKitDirective\(decision\.brandKit, textRequirement\.mode\)/.test(pipeline));
    assert.strictEqual((pipeline.match(/^\s+finalDirective,$/gm) || []).length, 2, "a render path skips the brand directive");
    assert.ok(/brandKitBrief\(decision\.brandKit, textRequirement\.mode\)/.test(pipeline));
  });

  await check("the brand block reaches the image provider, after the prompt and before the text directive", async () => {
    // What the provider receives, not what the source says: `master_prompt.md`
    // is written before this final block is appended, so it cannot show it.
    const { ExperimentPipeline } = require("./evolution/ExperimentPipeline");
    const { textDirective } = require("./compiler/ExactCopyIntegrityValidator");
    const req = resolveTextRequirement({ contentMessage: LINES.join("\n") });
    let sent = "";
    const inner = { name: "capture", async generateImage(i: { prompt: string }) { sent = i.prompt; return { success: true }; } };
    const wrapped = ExperimentPipeline.wrapProvider(
      inner, null, false, undefined, undefined, false, undefined, false, undefined,
      [brandKitDirective(KIT, req.mode), textDirective(req)].filter(Boolean).join("\n\n"),
    );
    await wrapped.generateImage({ prompt: "BASE PROMPT", aspectRatio: "1:1", references: [] });
    const at = (s: string) => sent.indexOf(s);
    assert.ok(at("BASE PROMPT") === 0, "the compiled prompt must lead");
    assert.ok(at("BRAND KIT — Lumi Coffee") > 0 && at("exactly once, unaltered") > 0, "the brand block did not reach the provider");
    assert.ok(at(textDirective(req)) > at("BRAND KIT"), "the text directive must have the last word");
    for (const l of LINES) assert.ok(sent.includes(l));
  });

  await check("style matching and premium spacing read the brand's own words", () => {
    assert.deepStrictEqual(forbiddenStylesIn(["bright NEON signage"], KIT), ["neon"]);
    assert.deepStrictEqual(preferredStylesIn(["a minimal still life"], KIT), ["minimal"]);
    assert.strictEqual(wantsGenerousSpace(KIT), true);
    assert.strictEqual(wantsGenerousSpace(normalizeBrandKit({ name: "Loud", style: { preferred: ["bold"] } })), false);
  });

  await check("the evaluator marks down a route built on a forbidden style and credits a preferred one", () => {
    const cand = (route: string, visual: string) => ({
      route, core_idea: "the cup at dawn", visual_language: visual, composition: "cup right third",
      typography: "headline top left", lighting: "soft", why_this_route: "calm",
      assessment: { product: { stance: "supports" }, audience: { stance: "supports" }, brand: { stance: "neutral" }, channel: { stance: "supports" }, feasibility: { stance: "supports" } },
    });
    const judgment = { strategy: { selected: "A", candidates: [cand("A", "neon glow, cyberpunk"), cand("B", "minimal, warm stone")] } };
    const plain = evaluateDirections(judgment, {});
    const branded = evaluateDirections(judgment, { brandKit: KIT });
    const [pa, pb] = plain.evaluations;
    const [ba, bb] = branded.evaluations;
    assert.ok(Math.abs(pa.score - BRAND_VIOLATION_PENALTY - ba.score) < 1e-6, "forbidden style not penalised");
    assert.strictEqual(ba.risk.level, "high");
    assert.deepStrictEqual(ba.signals.brand_violations, ["neon"]);
    assert.ok(bb.score > pb.score, "preferred style not credited");
    assert.deepStrictEqual(bb.signals.brand_matches, ["minimal"]);
  });

  await check("brand kit flows through the router as plain data, never an account", () => {
    const router = read("lib/image-engine/evolution/PipelineRouter.ts");
    assert.ok(/brand\?: BrandIdentity \| null/.test(router));
    assert.ok(/brandKit: context\.brand/.test(router) || /brandKit:\s*[^,\n]*context\.brand/.test(router));
  });

  await check("the render route resolves the kit for a verified person only, and sends the logo as LOGO", () => {
    const route = read("app/api/image/generate-simple/route.ts");
    assert.ok(/resolveActor\(identity\)/.test(route) && /loadBrandKitForRender\(actor\.data, brandKitId\)/.test(route));
    assert.ok(/formData\.getAll\("logoImages"\)/.test(route));
    assert.ok(/role: "LOGO"/.test(route));
    assert.ok(/brand: brandKit\?\.summary\.kit \?\? null/.test(route));
    assert.ok(/projectId: brandKit\.summary\.id/.test(route), "the run is not linked to the brand's project");
  });

  await check("the client sends the logo under logoImages, never as a product image", () => {
    const api = read("features/picture-engine/services/picture-engine.api.ts");
    assert.ok(!/append\("images", logoAsset/.test(api) && !/append\("images", blob, logoAsset/.test(api));
    assert.strictEqual((api.match(/append\("logoImages"/g) || []).length, 2);
    assert.ok(/brandKitId/.test(api));
  });

  await check("brand kit API: signed out is 401, an invisible kit is 404", () => {
    const list = read("app/api/brand-kits/route.ts");
    const one = read("app/api/brand-kits/[id]/route.ts");
    assert.ok(/status: 401/.test(list) && /status: 401/.test(one));
    assert.ok(/status: 404/.test(one));
    assert.ok(!/org_id|orgId/.test(one), "a single-kit route must not take a workspace from the request");
  });

  await check("a brand logo's wordmark is not counted as generated text", () => {
    const none = resolveTextRequirement({});
    assert.strictEqual(checkRenderedText([{ text: "LUMI", on_logo: true }], none).compliant, true);
    assert.strictEqual(checkRenderedText([{ text: "LUMI", on_logo: true }, { text: "Wake up", on_product: false }], none).compliant, false);
  });

  await check("a render whose only attachment is the brand logo routes the brief as the product", async () => {
    // Live defect found by CASE 3: the logo now travels as LOGO rather than as
    // an unroled (= PRODUCT) image, so a logo-only render reached retrieval
    // with no product at all and failed with KNOWLEDGE_RETRIEVAL_FAILED.
    const sharp = require("sharp");
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#1f3a2e" } }).png().toBuffer();
    const { SimpleImageGenerationOrchestratorService } = require("./service/SimpleImageGenerationOrchestratorService");
    const { KnowledgeRouterService } = require("./service/KnowledgeRouterService");
    const { SimpleInputAdapterService } = require("./service/SimpleInputAdapterService");
    const seen: number[] = [];
    const stub = { analyzeProductReferences: async (i: { images: unknown[] }) => { seen.push(i.images.length); return { success: false, error: { code: "STOP", message: "stop" } }; } };
    const base = { concept: "cold brew poster", useCase: "Poster", aspectRatio: "1:1", copyItems: [] };
    const img = (role?: string) => ({ reference_id: "REF_01", buffer: png, mimeType: "image/png", filename: "a.png", ...(role ? { role } : {}) });
    await SimpleImageGenerationOrchestratorService.generateSimpleImage({ ...base, images: [img("LOGO")] }, { routerService: stub });
    await SimpleImageGenerationOrchestratorService.generateSimpleImage({ ...base, images: [img()] }, { routerService: stub });
    await SimpleImageGenerationOrchestratorService.generateSimpleImage({ ...base, useCase: "Product Hero", images: [img("LOGO")] }, { routerService: stub });
    assert.deepStrictEqual(seen, [0, 1, 1], "logo-only must route as text; a product photo, or a use case that needs one, must still be analysed");

    const routed = await new KnowledgeRouterService().analyzeProductReferences({ images: [], concept: base.concept, useCase: "Poster" });
    const adapted = SimpleInputAdapterService.adapt({ ...base, images: [img("LOGO")] }, routed.routing);
    assert.ok(adapted.resolvedRoutingResult.products.length > 0, "retrieval would still see no product");
    assert.deepStrictEqual(adapted.brandAssets.map((b: { reference_id: string }) => b.reference_id), ["REF_01"], "the logo lost its LOGO role");
    assert.ok(adapted.generationReferences.some((r: { reference_id: string; role: string }) => r.reference_id === "REF_01" && r.role === "LOGO"), "the logo would not reach the renderer");
  });

  // ── Acceptance ───────────────────────────────────────────────────────────
  console.log("\nAcceptance");

  await check("CASE 1 — text provided: exact text preserved, typography generated, editable text layer exists", () => {
    const req = resolveTextRequirement({ contentMessage: LINES.join("\n") });
    assert.strictEqual(req.mode, "exact");
    const { typography, document } = design({ lines: req.lines });
    assert.strictEqual(document.text_mode, "exact");
    assert.ok(!typography.disabled && typography.specs.length === 3);
    const texts = textElements(document) as any[];
    assert.deepStrictEqual(texts.map((t) => t.content), LINES, "text layers do not hold the exact lines");
    for (const t of texts) {
      assert.strictEqual(t.layer_type, "text");
      assert.strictEqual(t.editable, true);
      assert.ok(t.editable_properties.includes("content") && t.editable_properties.includes("font"));
    }
  });

  await check("CASE 2 — no text: no text layer, no typography", () => {
    const req = resolveTextRequirement({});
    assert.strictEqual(req.mode, "none");
    const { typography, document, geometry } = design({ lines: req.lines });
    assert.strictEqual(typography.disabled, true);
    assert.strictEqual(typography.specs.length, 0);
    assert.strictEqual(typography.pairing, null);
    assert.strictEqual(document.text_mode, "none");
    assert.strictEqual(textElements(document).length, 0);
    assert.ok(!geometry.zones.some((z: { name: string }) => ["headline", "subheadline", "cta", "supporting"].includes(z.name)));
  });

  await check("CASE 2b — no text with a brand kit: logo layer only, still no text layer", () => {
    const { document } = design({ lines: [], kit: KIT });
    assert.strictEqual(textElements(document).length, 0);
    assert.ok(document.elements.some((e: any) => e.style?.source === "brand_logo"));
  });

  await check("CASE 3 — brand kit applied: logo, colours, fonts and style respected", () => {
    const { document, typography, geometry } = design({ lines: LINES, kit: KIT, hint: "product right of centre" });
    assert.deepStrictEqual(document.brand, { name: "Lumi Coffee", colors: ["#1a2b3c", "#f5c400", "#ffffff"], fonts: { heading: "Playfair Display", body: "Inter" } });
    const logo = document.elements.find((e: any) => e.style?.source === "brand_logo");
    assert.ok(logo, "no logo layer");
    assert.strictEqual(logo.content, "Lumi Coffee logo");
    const product = document.elements.find((e: any) => e.type === "product");
    const overlaps = (a: any, b: any) =>
      Math.abs(a.position_px.x - b.position_px.x) * 2 < a.size_px.width + b.size_px.width &&
      Math.abs(a.position_px.y - b.position_px.y) * 2 < a.size_px.height + b.size_px.height;
    assert.ok(!overlaps(logo, product), "the logo sits on the product");
    const palette = KIT.colors.map((c: { hex: string }) => c.hex).concat(["#111111", "#ffffff"]);
    for (const t of textElements(document) as any[]) assert.ok(palette.includes(t.style.color), `${t.id} colour ${t.style.color} off-palette`);
    assert.strictEqual(typography.specs[0].font_family, "Playfair Display");
    assert.strictEqual(geometry.decisions.whitespace.label, "large premium spacing");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
