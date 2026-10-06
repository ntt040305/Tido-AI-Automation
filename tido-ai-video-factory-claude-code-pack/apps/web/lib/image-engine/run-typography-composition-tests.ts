/**
 * Typography Composition Hardening — offline. No model, no database, no network.
 *
 * What this suite is for
 * ----------------------
 * Four defects were MEASURED on this engine before the phase, and each one has
 * a test here that fails if it comes back:
 *
 *   1. Each client line reached the image model three times in one prompt, in
 *      three sections that each told a renderer to set type. Duplicated text in
 *      the render followed from duplicated instructions in the prompt.
 *   2. The compositor fitted every line to ONE line by shrinking it, so the
 *      headline -- the longest string -- shrank furthest. On a three-line brief
 *      it came back at 35px under a 41px subheadline: hierarchy inverted, on
 *      every frame, deterministically.
 *   3. The planned headline band and the planned product box intersect on every
 *      square frame. `scoreLayout` said so in its own notes and nothing read
 *      the note.
 *   4. Contrast was a binary black-or-white guess with no ratio verified and no
 *      scrim available, so a line over busy pixels was unreadable at any size.
 *
 * The four acceptance cases the phase was specified against are at the end.
 */

import assert from "assert";
import fs from "fs";
import path from "path";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");
const { buildGeometry, renderGeometry } = require("./evolution/experiment/LayoutGeometry");
const { buildTypographySystem, assignTextRoles, geometryRolesFor, renderTypography } = require("./evolution/experiment/TypographySystem");
const { buildCreativeDocument } = require("./evolution/experiment/CreativeDocument");
const { normalizeBrandKit, contrastRatio } = require("./evolution/experiment/BrandKit");
const { resolveTextRequirement, textDirective } = require("./compiler/ExactCopyIntegrityValidator");
const { NO_TEXT_DIRECTIVE } = require("./evolution/experiment/TypographyRenderer");
const { buildTypographyPlan, renderPlanForImagePrompt, renderPlanForRecord, typographyPlanTelemetry } = require("./evolution/experiment/TypographyPlan");
const { buildCompositionMap, placementScore, overlapShare, regionOf, bestPlacements } = require("./evolution/experiment/CompositionMap");
const { layoutText, breakLines, advanceEms, measure, clampTo } = require("./evolution/experiment/TextLayoutEngine");
const { planEditableDesign, composeEditable, editableTelemetry, editableSvg } = require("./evolution/experiment/EditableDesign");
const { critiqueTypography, renderTypographyCritique, typographyCritiqueTelemetry } = require("./evolution/experiment/TypographyCritique");

const WEB = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf-8");

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

const KIT = normalizeBrandKit({
  name: "Lumi Coffee",
  colors: [{ hex: "#1f3a2e", role: "primary" }, { hex: "#e8b04a", role: "accent" }, { hex: "#f4efe6", role: "background" }],
  fonts: { heading: "Playfair Display", body: "Montserrat" },
  has_logo: false,
});

/** The whole chain, as the pipeline runs it. */
function design(lines: string[], ratio = "1:1", kit: unknown = null) {
  const req = resolveTextRequirement({ contentMessage: lines.join("\n") });
  const assigned = assignTextRoles(req.lines);
  const geometry = buildGeometry({ ratio, copyRoles: geometryRolesFor(assigned), productCount: 1, brandKit: kit });
  const typography = buildTypographySystem({ geometry, lines: assigned, brandKit: kit });
  const plan = buildTypographyPlan({ mode: req.mode, lines: assigned, geometry, typography, brandKit: kit, ratio });
  const doc = buildCreativeDocument({ geometry, typography, brandKit: kit, canvasLongEdge: 2048, plan });
  return { req, assigned, geometry, typography, plan, doc };
}

/** A scene with its content where the caller says, and quiet elsewhere. */
async function scene(opts: { width?: number; height?: number; product?: { x: number; y: number; w: number; h: number }; busy?: boolean } = {}) {
  const W = opts.width ?? 1024;
  const H = opts.height ?? 1024;
  const p = opts.product ?? { x: 620, y: 300, w: 300, h: 500 };
  // A detailed object: stripes give it real gradient energy, which is what the
  // composition map looks for. A flat rectangle has edges but no interior.
  const stripes = Array.from({ length: 24 }, (_, i) =>
    `<rect x="${p.x}" y="${p.y + i * (p.h / 24)}" width="${p.w}" height="${p.h / 48}" fill="${i % 2 ? "#111" : "#d8cfc0"}"/>`
  ).join("");
  const noise = opts.busy
    ? Array.from({ length: 300 }, (_, i) => `<circle cx="${(i * 97) % W}" cy="${(i * 61) % H}" r="6" fill="${i % 3 ? "#222" : "#eee"}"/>`).join("")
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#e9e2d6"/>${noise}` +
    `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="24" fill="#3b2415"/>${stripes}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const texts = (d: { layers: { kind: string }[] }) => d.layers.filter((l) => l.kind === "text") as any[];
const oneLine = (t: string) => String(t).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

const EN = ["Summer Sale 50%", "Up to half price on everything", "Shop now"];
const VI = ["Giảm giá 50% hôm nay!", "Áp dụng cho toàn bộ sản phẩm cà phê", "Đặt ngay 0901 234 567"];

/** Every `<text>` element's content in an overlay, `<tspan>` children rejoined. */
const svgTexts = (svg: string): string[] =>
  [...svg.matchAll(/<text[\s\S]*?<\/text>/g)].map((m) =>
    oneLine([...m[0].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((t) => t[1]).join(" ") || (/>([^<]*)<\/text>/.exec(m[0])?.[1] ?? "")),
  );

async function main() {
  // ── 1. the prompt stops carrying the words more than once ────────────────
  console.log("\n1 — one statement of the copy, not three");

  await check("the typography block states treatment and never repeats a client line", () => {
    const { typography } = design(EN);
    const block = renderTypography(typography);
    for (const l of EN) assert.ok(!block.includes(l), `the typography block repeats "${l}"`);
    assert.ok(/line 1 of the text list/.test(block), "a line cannot be referred to without quoting it");
    assert.ok(/set each listed line exactly once/i.test(block), "nothing forbids drawing a line twice");
  });

  await check("across every prompt section the copy appears once, in the directive that owns it", () => {
    const { geometry, typography, req } = design(EN);
    const sections = [renderGeometry(geometry), renderTypography(typography), textDirective(req)].filter(Boolean) as string[];
    for (const l of EN) {
      const carriers = sections.filter((s) => s.includes(l)).length;
      assert.strictEqual(carriers, 1, `"${l}" is carried by ${carriers} sections, not 1`);
    }
    assert.ok(textDirective(req).includes(EN[0]), "the directive is not the carrier");
  });

  await check("the directive forbids setting a line twice", () => {
    const d = textDirective(resolveTextRequirement({ contentMessage: EN.join("\n") }));
    assert.ok(/appears EXACTLY ONCE/.test(d), "nothing states the one-block rule");
    assert.ok(/describing these lines, not additional ones/.test(d), "earlier sections are not reconciled");
  });

  // ── 2. the plan ──────────────────────────────────────────────────────────
  console.log("\n2 — the typography plan");

  await check("a plan is built from the client's lines and decides space, not words", () => {
    const { plan } = design(EN);
    assert.strictEqual(plan.text_mode, "exact");
    assert.strictEqual(plan.headline.content, EN[0]);
    assert.strictEqual(plan.subtitle.content, EN[1]);
    assert.strictEqual(plan.cta.content, EN[2]);
    assert.deepStrictEqual(plan.blocks.map((b: any) => b.hierarchy), [1, 2, 4]);
    assert.ok(plan.headline.scale > plan.subtitle.scale && plan.subtitle.scale > plan.cta.scale, "the plan does not order the sizes");
    assert.ok(plan.space.width > 0 && plan.space.height > 0, "no space was reserved");
    assert.ok(plan.style.personality && plan.style.font_direction, "no style direction");
  });

  await check("a long headline is allowed more lines than a short one; a CTA is never wrapped", () => {
    const short = design(["Sale"]).plan;
    const long = design(["Bộ sưu tập mùa hè rực rỡ dành riêng cho bạn trong tuần này"]).plan;
    assert.strictEqual(short.headline.max_lines, 1);
    assert.ok(long.headline.max_lines >= 2, "a long headline is still held to one line");
    assert.strictEqual(design(EN).plan.cta.max_lines, 1, "the action was allowed to wrap");
  });

  await check("the image prompt block carries geometry and not one word of copy", () => {
    const { plan } = design(EN);
    const block = renderPlanForImagePrompt(plan)!;
    for (const l of EN) assert.ok(!block.includes(l), `the image prompt block carries "${l}"`);
    assert.ok(/Reserve a clean, quiet area at \d+% across/.test(block), "no reserved area is stated");
    assert.ok(/Place the product in/.test(block), "the product is not positioned");
    assert.ok(/no product edges, no high-frequency pattern/.test(block), "the area is not required to be quiet");
    assert.ok(/lines? of type will be set there/.test(block), "the line count is not transmitted");
  });

  await check("the record block carries the copy; the image block never does", () => {
    const { plan } = design(EN);
    const record = renderPlanForRecord(plan)!;
    for (const l of EN) assert.ok(record.includes(l), "the record lost a line");
    assert.notStrictEqual(record, renderPlanForImagePrompt(plan));
  });

  await check("telemetry reports shape and never the copy", () => {
    const t = typographyPlanTelemetry(design(VI).plan);
    const json = JSON.stringify(t);
    for (const l of VI) assert.ok(!json.includes(l), "telemetry leaked the client's copy");
    assert.strictEqual(t.blocks, 3);
    assert.deepStrictEqual(t.roles, ["headline", "subheadline", "cta"]);
  });

  // ── 3. measurement and line breaking ─────────────────────────────────────
  console.log("\n3 — measurement and line breaking");

  await check("combining diacritics carry no advance, so Vietnamese is not over-measured", () => {
    // "Giảm" is 4 letters; NFD makes it 5 code points. A width that counted the
    // tone mark would set every Vietnamese line smaller than it needs to be.
    const withMarks = advanceEms("Giảm giá", 400, 0);
    const without = advanceEms("Giam gia", 400, 0);
    assert.ok(Math.abs(withMarks - without) < 0.01, `diacritics changed the width: ${withMarks} vs ${without}`);
  });

  await check("narrow and wide letters do not measure the same", () => {
    assert.ok(advanceEms("WWWW", 400, 0) > advanceEms("iiii", 400, 0) * 2, "the estimator is a flat per-character factor");
  });

  await check("breaking never splits a word and never exceeds the line allowance", () => {
    const text = "Up to half price on everything in the summer collection";
    const lines = breakLines(text, 300, 30, 700, 0, 3);
    assert.ok(lines, "nothing fitted");
    assert.ok(lines.length <= 3);
    assert.strictEqual(lines.join(" "), text, "wrapping changed the words");
    for (const l of lines) assert.ok(measure(l, 30, 700, 0) <= 300, `"${l}" overflows`);
  });

  await check("a string that cannot fit in its allowance returns null rather than overflowing", () => {
    assert.strictEqual(breakLines("Supercalifragilistic", 40, 30, 700, 0, 2), null);
    assert.strictEqual(breakLines("a b c d e f g h i j k", 30, 30, 700, 0, 2), null);
  });

  await check("breaking is balanced, not greedy: no one-word last line where a better break exists", () => {
    const lines = breakLines("Summer Sale 50% Today", 240, 34, 700, 0, 2)!;
    assert.strictEqual(lines.length, 2);
    const widths = lines.map((l: string) => measure(l, 34, 700, 0));
    assert.ok(Math.max(...widths) / Math.min(...widths) < 2.2, `ragged break: ${JSON.stringify(lines)}`);
  });

  // ── 4. hierarchy, the measured defect ────────────────────────────────────
  console.log("\n4 — hierarchy cannot invert");

  await check("the headline is never set smaller than what supports it, on any ratio", () => {
    const lines = ["Bộ sưu tập mùa hè rực rỡ dành cho bạn", "Giảm đến 50% toàn bộ sản phẩm", "Đặt hàng ngay hôm nay"];
    for (const [ratio, W, H] of [["1:1", 1024, 1024], ["16:9", 1820, 1024], ["9:16", 1024, 1820]] as const) {
      const { doc } = design(lines, ratio, KIT);
      const d = planEditableDesign({ document: doc, brandKit: KIT, scene: { width: W, height: H, sha256: "x" } });
      const [h, s, c] = texts(d);
      assert.ok(h.font_size >= s.font_size, `${ratio}: headline ${h.font_size}px under subheadline ${s.font_size}px`);
      assert.ok(s.font_size >= c.font_size, `${ratio}: subheadline ${s.font_size}px under CTA ${c.font_size}px`);
      assert.ok(h.font_size / c.font_size >= 1.3, `${ratio}: spread ${h.font_size}/${c.font_size} is too flat to lead`);
    }
  });

  await check("a long headline gains a line rather than losing its size", () => {
    const { doc } = design(["Bộ sưu tập mùa hè rực rỡ dành cho bạn", "Giảm đến 50%"], "1:1", KIT);
    const d = planEditableDesign({ document: doc, brandKit: KIT, scene: { width: 1024, height: 1024, sha256: "x" } });
    const h = texts(d)[0];
    assert.ok(h.lines.length >= 2, "the headline was squeezed onto one line");
    assert.strictEqual(h.lines.join(" "), "Bộ sưu tập mùa hè rực rỡ dành cho bạn");
    assert.ok(h.font_size >= texts(d)[1].font_size, "it was squeezed below its subheadline");
  });

  await check("every block sits inside the safe area and none overlaps another", () => {
    const { doc } = design(VI, "1:1", KIT);
    const d = planEditableDesign({ document: doc, brandKit: KIT, scene: { width: 1024, height: 1024, sha256: "x" } });
    const t = texts(d);
    const inset = Math.round(1024 * 0.05) - 1;
    for (const b of t) {
      assert.ok(b.x >= inset && b.y >= inset, `${b.role} crosses the top-left safe margin`);
      assert.ok(b.x + b.width <= 1024 - inset && b.y + b.height <= 1024 - inset, `${b.role} crosses the bottom-right safe margin`);
    }
    for (let i = 0; i < t.length; i++) {
      for (let j = i + 1; j < t.length; j++) {
        const [a, b] = [t[i], t[j]];
        assert.ok(!(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height), `${a.role} overlaps ${b.role}`);
      }
    }
  });

  // ── 5. the composition map ───────────────────────────────────────────────
  console.log("\n5 — reading the render");

  await check("the map finds the product where the scene actually put it", async () => {
    const buf = await scene({ product: { x: 620, y: 300, w: 300, h: 500 } });
    const { data } = await sharp(buf).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const map = buildCompositionMap({ rgb: data, size: 64 });
    assert.ok(map.product, "no busy area was found in a frame with a product in it");
    assert.ok(map.product.x >= 50, `the product was located at ${map.product.x}% across, but it was drawn on the right`);
    assert.ok(map.focal && map.focal.x >= 50, "the focal point is not on the product");
  });

  await check("a flat frame has no product box, and says so rather than guessing", async () => {
    const flat = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#cccccc" } }).png().toBuffer();
    const { data } = await sharp(flat).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.strictEqual(buildCompositionMap({ rgb: data, size: 64 }).product, null);
  });

  await check("a quiet area scores above a busy one", async () => {
    const buf = await scene({ product: { x: 620, y: 200, w: 340, h: 640 } });
    const { data } = await sharp(buf).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const map = buildCompositionMap({ rgb: data, size: 64 });
    const quiet = placementScore(map, { x: 6, y: 10, width: 40, height: 25 });
    const busy = placementScore(map, { x: 58, y: 25, width: 35, height: 40 });
    assert.ok(quiet > busy + 2, `quiet ${quiet} is not clearly better than busy ${busy}`);
    assert.ok(bestPlacements(map, { width: 40, height: 25 }, { x: 5, y: 5, width: 90, height: 90 }, 3)[0].x < 50, "the best area is not the empty side");
  });

  // ── 6. contrast and the scrim ────────────────────────────────────────────
  console.log("\n6 — a line the picture cannot carry gets a scrim");

  await check("type over busy pixels is given a scrim, and the scrim is a real layer", async () => {
    const busy = await scene({ busy: true, product: { x: 380, y: 300, w: 260, h: 440 } });
    const { doc } = design(EN, "1:1");
    const c = await composeEditable({ document: doc, scene: busy, logo: null });
    const scrims = c.design.layers.filter((l: any) => l.kind === "effect" && l.effect === "scrim");
    assert.ok(scrims.length > 0, "no scrim over a frame that is noise everywhere");
    for (const s of scrims) {
      assert.ok(s.opacity > 0 && s.opacity < 1, `a scrim at ${s.opacity} is a plate, not a scrim`);
      const owner = texts(c.design).find((t: any) => t.id === s.attached_to);
      assert.ok(owner, "a scrim belongs to no line");
      assert.ok(s.x <= owner.x && s.x + s.width >= owner.x + owner.width, "the scrim does not cover its line");
      assert.ok(s.z < owner.z, "the scrim is drawn over its line");
    }
    assert.ok((c.design.layout_notes || []).some((n: string) => /scrim/.test(n)), "the design does not record why");
  });

  await check("a quiet frame needs no scrim", async () => {
    const calm = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#f2ece2" } }).png().toBuffer();
    const { doc } = design(EN, "1:1");
    const c = await composeEditable({ document: doc, scene: calm, logo: null });
    assert.strictEqual(c.design.layers.filter((l: any) => l.kind === "effect" && l.effect === "scrim").length, 0, "a scrim was added to a clean frame");
  });

  await check("every line clears its contrast floor against what it sits on", async () => {
    const buf = await scene({ product: { x: 600, y: 250, w: 340, h: 560 } });
    const { doc } = design(EN, "1:1", KIT);
    const c = await composeEditable({ document: doc, brandKit: KIT, scene: buf, logo: null });
    for (const t of texts(c.design)) {
      const plate = c.design.layers.find((l: any) => l.kind === "effect" && l.attached_to === t.id);
      if (plate?.effect !== "plate") continue;
      assert.ok(contrastRatio(t.color, plate.fill) >= 4.5, `${t.role} is ${contrastRatio(t.color, plate.fill).toFixed(1)}:1 on its plate`);
    }
  });

  // ── 7. the critique ──────────────────────────────────────────────────────
  console.log("\n7 — the typographic critique");

  await check("a line read twice in the render is reported as a duplicate", () => {
    const c = critiqueTypography({
      visibleText: [{ text: "Summer Sale 50%" }, { text: "SUMMER SALE 50%" }, { text: "Shop now" }],
    });
    const dup = c.findings.filter((f: any) => f.area === "duplicate_text");
    assert.strictEqual(dup.length, 1, `expected one duplicate finding, got ${dup.length}`);
    assert.strictEqual(dup[0].source, "observed");
    assert.strictEqual(dup[0].severity, "blocking");
    assert.strictEqual(c.scores.duplicate_free, 2);
    assert.strictEqual(c.shippable, false);
  });

  await check("the same words printed on the product are not a duplicate", () => {
    const c = critiqueTypography({
      visibleText: [{ text: "Lumi Coffee" }, { text: "Lumi Coffee", on_product: true }, { text: "Lumi Coffee", on_logo: true }],
    });
    assert.strictEqual(c.findings.filter((f: any) => f.area === "duplicate_text").length, 0);
  });

  await check("a block over the product is reported, with the share that crosses it", () => {
    const c = critiqueTypography({
      design: {
        canvas: { width: 1000, height: 1000 },
        layers: [{ kind: "text", id: "t", role: "headline", content: "x", lines: ["x"], font_size: 60, x: 600, y: 300, width: 300, height: 100, color: "#111", z: 1 }],
      } as any,
      map: { product: { x: 55, y: 20, width: 40, height: 60 } },
    });
    const hit = c.findings.find((f: any) => f.area === "collision");
    assert.ok(hit, "a headline drawn across the product was not reported");
    assert.strictEqual(hit.source, "measured");
    assert.ok(/crosses the product/.test(hit.what) && /%/.test(hit.what), "the finding does not say how much");
  });

  await check("an inverted hierarchy is reported in the designer's own terms", () => {
    const c = critiqueTypography({
      design: {
        canvas: { width: 1000, height: 1000 },
        layers: [
          { kind: "text", id: "h", role: "headline", content: "a", lines: ["a"], font_size: 35, x: 100, y: 100, width: 200, height: 40, color: "#111", z: 1 },
          { kind: "text", id: "s", role: "subheadline", content: "b", lines: ["b"], font_size: 41, x: 100, y: 300, width: 200, height: 45, color: "#111", z: 2 },
        ],
      } as any,
    });
    const hit = c.findings.find((f: any) => f.area === "hierarchy");
    assert.ok(hit, "a subheadline larger than its headline was not reported");
    assert.ok(/read in the wrong order/.test(hit.what), `unhelpful wording: ${hit.what}`);
    assert.ok(/35px/.test(hit.what) && /41px/.test(hit.what), "the finding is not checkable");
  });

  await check("a clean design produces no findings and says so", () => {
    const c = critiqueTypography({
      design: {
        canvas: { width: 1000, height: 1000 },
        layers: [
          { kind: "text", id: "h", role: "headline", content: "a", lines: ["a"], font_size: 90, x: 80, y: 120, width: 400, height: 100, color: "#111", z: 1 },
          { kind: "text", id: "s", role: "subheadline", content: "b", lines: ["b"], font_size: 40, x: 80, y: 280, width: 300, height: 48, color: "#111", z: 2 },
        ],
      } as any,
      textCheck: { mode: "exact", required: ["a", "b"], missing: [], incorrect: [], case_styled: [], unwanted: [], compliant: true },
      visibleText: [{ text: "a" }, { text: "b" }],
    });
    assert.deepStrictEqual(c.findings, []);
    assert.strictEqual(c.shippable, true);
    assert.strictEqual(renderTypographyCritique(c), undefined);
  });

  await check("critique telemetry carries counts and scores, never the copy", () => {
    const c = critiqueTypography({ visibleText: [{ text: VI[0] }, { text: VI[0] }] });
    const json = JSON.stringify(typographyCritiqueTelemetry(c));
    assert.ok(!json.includes(VI[0]), "telemetry leaked the client's copy");
    assert.strictEqual(typographyCritiqueTelemetry(c).blocking, 1);
  });

  // ── 7b. the review fails closed ──────────────────────────────────────────
  //
  // Migration task 0.2. `worst()` returned 10 for an area with no findings, and a
  // vision call that failed produced no findings — so a review that saw nothing
  // scored a flawless 10/10 and called the frame shippable. "Never checked" and
  // "checked and clean" rendered identically, which is the one pair of states this
  // system most needed to keep apart.

  await check("a vision call that returned nothing scores null, not 10", () => {
    const c = critiqueTypography({});
    assert.strictEqual(c.verdict, "unverified");
    for (const [area, score] of Object.entries(c.scores)) {
      assert.strictEqual(score, null, `${area} scored ${score} on a review that saw nothing`);
    }
    assert.strictEqual(c.shippable, false, "a review that saw nothing called the frame shippable");
    assert.deepStrictEqual(c.findings, [], "findings were invented from no observation");
  });

  await check("a design with no vision call is unverified, but keeps its measured findings", () => {
    // The arithmetic over the design is still real and is still reported. What is
    // withheld is the verdict, because the half that reads pixels never ran.
    const c = critiqueTypography({
      design: {
        canvas: { width: 1000, height: 1000 },
        layers: [
          { kind: "text", id: "h", role: "headline", content: "a", lines: ["a"], font_size: 35, x: 100, y: 100, width: 200, height: 40, color: "#111", z: 1 },
          { kind: "text", id: "s", role: "subheadline", content: "b", lines: ["b"], font_size: 41, x: 100, y: 300, width: 200, height: 45, color: "#111", z: 2 },
        ],
      } as any,
    });
    assert.strictEqual(c.verdict, "unverified");
    assert.ok(c.findings.some((f: any) => f.area === "hierarchy"), "the measured finding was dropped");
    assert.strictEqual(c.scores.hierarchy, null, "an unverified review still scored a dimension");
    assert.strictEqual(c.shippable, false);
  });

  await check("an empty visibleText array IS an observation and is scored", () => {
    // A model reporting that it read no text is a real answer about a real frame.
    // Only a null or absent list means the call did not happen.
    const c = critiqueTypography({ visibleText: [] });
    assert.strictEqual(c.verdict, "verified");
    assert.strictEqual(c.scores.duplicate_free, 10);
    assert.strictEqual(c.shippable, true);
  });

  await check("a textCheck alone is also an observation", () => {
    const c = critiqueTypography({
      textCheck: { mode: "exact", required: ["a"], missing: [], incorrect: [], case_styled: [], unwanted: [], compliant: true } as any,
    });
    assert.strictEqual(c.verdict, "verified");
    assert.strictEqual(c.scores.readability, 10);
  });

  await check("an unverified review can never be shippable, even with no findings", () => {
    for (const input of [{}, { visibleText: null }, { textCheck: null }, { visibleText: null, textCheck: null }]) {
      const c = critiqueTypography(input as any);
      assert.strictEqual(c.shippable, false, `shippable on ${JSON.stringify(input)}`);
      assert.strictEqual(c.verdict, "unverified");
    }
  });

  await check("telemetry says which verdict it is, so a log of 10s cannot be misread", () => {
    const blind = typographyCritiqueTelemetry(critiqueTypography({}));
    assert.strictEqual(blind.verdict, "unverified");
    assert.strictEqual(blind.shippable, false);
    const seen = typographyCritiqueTelemetry(critiqueTypography({ visibleText: [] }));
    assert.strictEqual(seen.verdict, "verified");
  });

  await check("an unverified critique must not recommend a re-render", () => {
    // Paying for a second render because our own vision call failed would charge
    // the user for an outage. Source-level, because the guard is the point.
    const review = read("lib/image-engine/evolution/experiment/VisionReview.ts");
    assert.ok(
      /critique\?\.verdict === "unverified" \? \[\]/.test(review),
      "judgeTypography does not short-circuit on an unverified critique",
    );
    assert.ok(/re-render/.test(review), "the re-render recommendation path is no longer here to guard");
  });

  await check("the UI shows 'Chưa kiểm tra được' instead of a score or a tick", () => {
    const panel = read("features/picture-engine/components/strategy/CreativeDirectionPanel.tsx");
    assert.ok(/Chưa kiểm tra được/.test(panel), "the panel has no unverified state");
    assert.ok(
      /typography_critique\?\.verdict === "unverified"/.test(panel),
      "the panel does not read the verdict",
    );
    // The ticks are the fabrication risk: praise printed for a review that never
    // happened.
    const m = /const strengths = [^;]*;/.exec(panel);
    assert.ok(m, "the strengths derivation was not found");
    assert.ok(/!reviewUnverified/.test(m![0]), "strengths are still shown on an unverified review");
    // And the verdict has to survive the trip to the browser.
    const types = read("features/picture-engine/types/picture-engine.types.ts");
    assert.ok(/typography_critique\?: \{/.test(types), "the client type cannot see the critique");
  });

  await check("the vision review attaches the critique and the analyzer asks for what it needs", () => {
    const review = read("lib/image-engine/evolution/VisionReviewLayer.ts");
    assert.ok(/critiqueTypography/.test(review), "the review never runs the critique");
    assert.ok(/analysis\.typography_critique = critique\(/.test(review), "the critique is not attached to the analysis");
    const analyzer = read("lib/image-engine/evolution/experiment/VisionAnalyzerService.ts");
    for (const asked of ["DUPLICATION", "COLLISION", "HIERARCHY", "READABILITY", "BALANCE"]) {
      assert.ok(analyzer.includes(asked), `the vision prompt never asks about ${asked}`);
    }
    assert.ok(/The headline overlaps the product silhouette/.test(analyzer), "the prompt does not model the answer it wants");
  });

  // ── 8. the four acceptance cases ─────────────────────────────────────────
  console.log("\nAcceptance");

  await check('CASE 1 — "Summer Sale 50%": the scene prompt paints no text, the output is one editable layer', async () => {
    const lines = ["Summer Sale 50%"];
    const { plan, doc, req } = design(lines, "1:1", KIT);

    // What the image model is told in Editable mode.
    const scenePrompt = [renderGeometry(design(lines).geometry, { sceneOnly: true }), renderPlanForImagePrompt(plan), NO_TEXT_DIRECTIVE].join("\n\n");
    assert.ok(!scenePrompt.includes(lines[0]), "the scene prompt carries the copy");
    assert.ok(/RENDER NO TEXT/.test(scenePrompt), "the model is not told to render no text");
    assert.ok(!/\bheadline\b/i.test(scenePrompt), "the scene prompt still names a headline");
    assert.ok(/clear area 1/.test(scenePrompt), "the copy zone is not transmitted as a clear area");

    // What the person gets.
    const c = await composeEditable({ document: doc, brandKit: KIT, scene: await scene(), logo: null });
    assert.strictEqual(texts(c.design).length, 1, "not exactly one text layer");
    assert.strictEqual(texts(c.design)[0].content, lines[0], "the line was altered");
    assert.strictEqual(texts(c.design)[0].lines.join(" "), lines[0]);
    assert.strictEqual(c.design.text_mode, "exact");

    // And the composited overlay -- what is actually drawn onto the scene --
    // still carries it as live text rather than as a picture of text.
    const overlay = editableSvg(c.design, {}, { skipScene: true });
    assert.ok(/<text[\s\S]*?<\/text>/.test(overlay), "the overlay drew no text element");
    assert.ok(oneLine(overlay.replace(/<[^>]+>/g, " ")).includes(lines[0]), "the overlay lost the line");
  });

  await check("CASE 2 — Vietnamese: accents survive, nothing is duplicated, the type is professional", async () => {
    const lines = ["Giảm giá 50% hôm nay!"];
    const { doc } = design(lines, "1:1", KIT);
    const c = await composeEditable({ document: doc, brandKit: KIT, scene: await scene(), logo: null });
    const t = texts(c.design);
    assert.strictEqual(t.length, 1, "one supplied line produced more than one layer");
    assert.strictEqual(t[0].content, "Giảm giá 50% hôm nay!", "an accent or a tone mark was lost");
    assert.strictEqual(t[0].content.normalize("NFC"), lines[0].normalize("NFC"));
    assert.ok(t[0].font_size >= 24, `set at ${t[0].font_size}px — too small to lead a frame`);
    // Professional: inside the safe area, and not crossing the product.
    const inset = Math.round(1024 * 0.05) - 1;
    assert.ok(t[0].x >= inset && t[0].x + t[0].width <= 1024 - inset, "the line crosses the safe margin");
    const box = { x: (t[0].x / 1024) * 100, y: (t[0].y / 1024) * 100, width: (t[0].width / 1024) * 100, height: (t[0].height / 1024) * 100 };
    assert.ok(overlapShare(box, c.design.scene_content.product) < 0.25, "the line crosses the product");
    // The overlay keeps the accents as text, not as a picture of text, and
    // keeps them byte-exact: a dropped diacritic is a different word.
    const overlay = editableSvg(c.design, {}, { skipScene: true });
    assert.ok(svgTexts(overlay).some((t) => t === lines[0]), `the overlay lost the Vietnamese line: ${JSON.stringify(svgTexts(overlay))}`);
  });

  await check("CASE 3 — no text: no typography, no invented slogan, and the prompt says so", async () => {
    const { plan, doc, typography } = design([], "1:1", KIT);
    assert.strictEqual(plan.text_mode, "none");
    assert.strictEqual(plan.headline, null);
    assert.strictEqual(plan.cta, null);
    assert.deepStrictEqual(plan.blocks, []);
    assert.strictEqual(plan.space, null);
    assert.strictEqual(typography.disabled, true);

    const block = renderPlanForImagePrompt(plan)!;
    assert.ok(/this frame carries no typography/i.test(block), "the model is not told the frame has no text");
    assert.ok(/no band of empty space is being reserved/.test(block), "the model is told to leave a gap for type that is not coming");

    const c = await composeEditable({ document: doc, brandKit: KIT, scene: await scene(), logo: null });
    assert.strictEqual(texts(c.design).length, 0, "a frame with no supplied text was given typography");
    assert.strictEqual(c.design.text_mode, "none");
    const overlay = editableSvg(c.design, {}, { skipScene: true });
    assert.ok(!/<text/.test(overlay), "the overlay invented a text layer");
  });

  await check("CASE 4 — a complex product: the type moves clear of it and the column stays balanced", async () => {
    // The product is where the composition prompt asks for it: to one side,
    // leaving the other for copy. The renderer put it slightly differently
    // from the pre-render grid, which is the normal case and the reason the
    // map exists.
    const complex = await scene({ product: { x: 620, y: 250, w: 320, h: 540 } });
    const { doc } = design(EN, "1:1", KIT);
    const c = await composeEditable({ document: doc, brandKit: KIT, scene: complex, logo: null });
    const product = c.design.scene_content.product;
    assert.ok(product, "the product was not located in the render");

    for (const t of texts(c.design)) {
      const box = { x: (t.x / 1024) * 100, y: (t.y / 1024) * 100, width: (t.width / 1024) * 100, height: (t.height / 1024) * 100 };
      const share = overlapShare(box, product);
      assert.strictEqual(Math.round(share * 100) < 10, true, `${t.role} sits ${Math.round(share * 100)}% over the product`);
    }
    assert.strictEqual(c.design.moved_for_product, true, "the column was not moved off the pre-render plan");
    assert.ok(c.design.placement_score >= 8, `the chosen column scored ${c.design.placement_score}`);
    assert.ok((c.design.layout_notes || []).some((n: string) => /clear of the product/.test(n)), "the move was not recorded");

    // Balanced: one column, read top to bottom, hierarchy intact.
    const t = texts(c.design);
    const centres = t.map((b: any) => b.x + b.width / 2);
    assert.ok(Math.max(...centres) - Math.min(...centres) < 1024 * 0.35, "the blocks do not share a column");
    for (let i = 1; i < t.length; i++) assert.ok(t[i].y >= t[i - 1].y + t[i - 1].height, "the blocks are not stacked in reading order");
    assert.ok(t[0].font_size > t[1].font_size && t[1].font_size > t[2].font_size, "moving the column cost the hierarchy");

    const critique = critiqueTypography({ design: c.design, map: { product }, visibleText: EN.map((text) => ({ text })) });
    assert.deepStrictEqual(critique.findings.filter((f: any) => f.area === "collision"), []);
    assert.strictEqual(critique.scores.hierarchy, 10);
  });

  await check("CASE 4b — when the render leaves nowhere clear, the engine says so instead of pretending", async () => {
    // The product dead centre, against what the composition prompt asked for.
    // There is no area of any usable width that clears it, and the honest
    // behaviours are: record that, protect every line the picture cannot carry,
    // and let the critique report what remains.
    const centred = await scene({ product: { x: 330, y: 180, w: 380, h: 660 } });
    const { doc } = design(EN, "1:1", KIT);
    const c = await composeEditable({ document: doc, brandKit: KIT, scene: centred, logo: null });
    const product = c.design.scene_content.product;

    assert.ok(
      (c.design.layout_notes || []).some((n: string) => /no clearer area exists/.test(n)),
      "the engine did not record that it had nowhere to put the copy",
    );
    for (const t of texts(c.design)) {
      const box = { x: (t.x / 1024) * 100, y: (t.y / 1024) * 100, width: (t.width / 1024) * 100, height: (t.height / 1024) * 100 };
      if (overlapShare(box, product) < 0.2) continue;
      const scrim = c.design.layers.find((l: any) => l.kind === "effect" && l.attached_to === t.id);
      assert.ok(scrim, `${t.role} crosses the product with nothing protecting it`);
    }
    const critique = critiqueTypography({ design: c.design, map: { product }, visibleText: EN.map((text) => ({ text })) });
    assert.ok(critique.findings.some((f: any) => f.area === "collision"), "the critique did not report the collision it can measure");
    assert.strictEqual(critique.shippable, false, "a frame with type across the product was called shippable");
  });

  await check("hybrid typography is the architecture, not a mode or a user choice", () => {
    // Phase 5.6.2. Before this, setting type ourselves was opt-in: the DEFAULT
    // render asked the image model to spell, which is what it is measurably
    // worst at and what locked rule 8 forbids for logo, price, CTA and
    // subtitle. It must now engage from the work itself -- text supplied, or a
    // mark to place -- and from no switch at all.
    const pipeline = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    const decl = /const editableOn = executionOn && \(hasTextToSet \|\| hasMarkToPlace\);/;
    assert.ok(decl.test(pipeline), "hybrid typography is no longer derived from the work itself");
    assert.ok(/const hasTextToSet = textRequirement\.lines\.length > 0;/.test(pipeline), "text presence is not what engages it");
    assert.ok(!/editableLayers/.test(pipeline), "a routing switch still gates typography");

    // And no switch survives anywhere else in the system.
    const router = read("lib/image-engine/evolution/PipelineRouter.ts");
    const route = read("app/api/image/generate-simple/route.ts");
    const api = read("features/picture-engine/services/picture-engine.api.ts");
    for (const [name, src] of [["router", router], ["route", route], ["client", api]] as const) {
      assert.ok(!/editableLayers|editableExport|editable_export/.test(src), `${name} still carries an editable switch`);
    }
  });

  await check("the words never reach the image model, and the model is told to draw none", () => {
    // The two halves of the contract, asserted on the pipeline's own wiring:
    // the render request is stripped of the copy and the mark, and the final
    // directive carries the typography PLAN (space) plus "render no text".
    const pipeline = read("lib/image-engine/evolution/ExperimentPipeline.ts");
    const stripped = pipeline.slice(pipeline.indexOf("const renderSource ="), pipeline.indexOf("const renderSource =") + 700);
    assert.ok(/contentMessage: ""/.test(stripped), "the copy is not stripped from the render request");
    assert.ok(/copyItems: \[\]/.test(stripped), "the copy items are not stripped");
    assert.ok(/role !== "LOGO"/.test(stripped), "the mark is not held back from the renderer");

    // Bounded by the NEXT declaration rather than by a character count: a
    // 700-char window failed the moment the directive grew a line, although
    // every invariant below still held.
    const dStart = pipeline.indexOf("const finalDirective =");
    const directive = pipeline.slice(dStart, pipeline.indexOf("const editableHooks", dStart));
    assert.ok(/renderPlanForImagePrompt\(capturedPlan\)/.test(directive), "the typography intention is not transmitted");
    assert.ok(/NO_TEXT_DIRECTIVE/.test(directive), "the model is not told to render no text");
    assert.ok(!/textDirective\(textRequirement\)/.test(directive.split("      : ")[0]), "the exact words are sent on the hybrid path");
  });

  await check("the design document is the only source: typography never reads the composed picture", async () => {
    // The layout engine reads the SCENE (to find quiet areas and the product)
    // and the design document (for the words). It must never read the finished
    // composite, which already has the type on it -- that would be a feedback
    // loop, and the first step toward reconstructing layers from pixels.
    const c = await composeEditable({ document: design(EN, "1:1", KIT).doc, brandKit: KIT, scene: await scene(), logo: null });
    const a = editableSvg(c.design, {}, { skipScene: true });
    const b = editableSvg(c.design, {}, { skipScene: true });
    assert.strictEqual(a, b, "the overlay is not deterministic from the design alone");
    const src = read("lib/image-engine/evolution/experiment/TextLayoutEngine.ts") + read("lib/image-engine/evolution/experiment/CompositionMap.ts");
    assert.ok(!/\b(ocr|tesseract|segment|detectText|reconstructLayers)\b/i.test(src), "the layout path references image reconstruction");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
