/**
 * The reference sheet, drawn with real pixels.
 *
 * `run-model-profile-tests.ts` checks the PLAN — how many slots, which panel, what
 * size each should be. This checks the DRAWING, because a plan that is right and a
 * sheet that is wrong look identical from the plan's side: a stretched product, a
 * label sitting over a bottle, or two panels overlapping are all invisible until
 * something reads the actual image.
 *
 * So these tests build real images with `sharp`, pack them, and then measure the
 * composed sheet.
 *
 * No network, no model, no provider. `sharp` only.
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { ReferencePackingService } from "./provider/reference-packing/ReferencePackingService";
import type { ProviderReferenceImage } from "./provider/ImageGenerationProvider";
import { SUNBURST, NANO_BANANA_2 } from "./models/image-model-profiles";
import { PACKING_DEFAULTS } from "./provider/reference-packing/ReferencePackingTypes";
import { DROP_REASON_VI, type DropReason } from "./provider/reference-capacity";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

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
    const msg = (e as Error).message.split("\n")[0];
    failures.push(`${name}\n    ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${msg}`);
  }
}

/** A solid rectangle of a known size and colour, so it can be found again. */
async function image(width: number, height: number, rgb: [number, number, number]): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } },
  })
    .png()
    .toBuffer();
}

async function product(
  id: string,
  width = 1200,
  height = 1200,
  rgb: [number, number, number] = [200, 30, 30],
): Promise<ProviderReferenceImage> {
  return {
    reference_id: id,
    product_id: `PRODUCT_${id}`,
    role: "PRODUCT",
    mimeType: "image/png",
    buffer: await image(width, height, rgb),
    filename: `${id}.png`,
  };
}

const OPTS = (p: typeof SUNBURST) => ({
  limit: p.maxReferences,
  maxCells: p.maxPanelsPerSheet,
  sheetSize: p.sheetSizePx,
  minPanelLongestSidePx: p.minPanelLongestSidePx,
});

async function main() {
  console.log("\n=== REFERENCE SHEET RENDERING ===\n");

  console.log("-- geometry of a composed sheet --");

  await check("more products than slots are packed, and every product survives", async () => {
    const refs = await Promise.all([product("A"), product("B"), product("C"), product("D"), product("E")]);
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    assert.strictEqual(r.status, "PACKED", `expected PACKED, got ${r.status}: ${r.reason || ""}`);
    assert.ok(r.references.length <= SUNBURST.maxReferences, `sent ${r.references.length}, limit ${SUNBURST.maxReferences}`);
    assert.strictEqual(r.products_in.length, 5);
    assert.deepStrictEqual(
      r.products_in.filter((p) => !r.products_out.includes(p)),
      [],
      "a product entered and did not come out",
    );
  });

  await check("the sheet is the size the profile asked for", async () => {
    const refs = await Promise.all([product("A"), product("B"), product("C")]);
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    assert.ok(r.packed, "no sheet was built");
    assert.strictEqual(r.packed!.sheet.width, SUNBURST.sheetSizePx);
    assert.strictEqual(r.packed!.sheet.height, SUNBURST.sheetSizePx);
    const meta = await sharp(r.references[0].buffer as Buffer).metadata();
    assert.strictEqual(meta.width, SUNBURST.sheetSizePx, "the drawn sheet is not the planned size");
    assert.strictEqual(meta.height, SUNBURST.sheetSizePx);
  });

  await check("the sheet size follows the ROW, so a different model gets a different sheet", async () => {
    const refs = await Promise.all([product("A"), product("B"), product("C"), product("D")]);
    const sun = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    // Nano Banana 2 allows 3 slots and 9 cells, so the same four images pack
    // differently. Proof the geometry is not a constant in this module any more.
    const nb2 = await ReferencePackingService.pack({ references: refs, options: OPTS(NANO_BANANA_2) });
    assert.ok(sun.references.length <= 2, `Sunburst sent ${sun.references.length}`);
    assert.ok(nb2.references.length <= 3, `NB2 sent ${nb2.references.length}`);
    assert.notStrictEqual(sun.references.length, nb2.references.length, "both models packed identically");
  });

  await check("panels never overlap", async () => {
    const refs = await Promise.all([product("A"), product("B"), product("C"), product("D")]);
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    const cells = r.packed!.cells;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        const overlaps =
          a.left < b.left + b.width && b.left < a.left + a.width &&
          a.top < b.top + b.height && b.top < a.top + a.height;
        assert.ok(!overlaps, `cells ${a.source_reference_id} and ${b.source_reference_id} overlap`);
      }
    }
  });

  await check("every cell is inside the sheet", async () => {
    const refs = await Promise.all([product("A"), product("B"), product("C"), product("D"), product("E")]);
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    const sheet = r.packed!.sheet;
    for (const c of r.packed!.cells) {
      assert.ok(c.left >= 0 && c.top >= 0, `${c.source_reference_id} starts outside the sheet`);
      assert.ok(c.left + c.width <= sheet.width, `${c.source_reference_id} runs off the right edge`);
      assert.ok(c.top + c.height <= sheet.height, `${c.source_reference_id} runs off the bottom`);
    }
  });

  await check("aspect ratios are preserved — nothing is stretched", async () => {
    // A wide image, a tall one and a square one in the same sheet.
    const refs = [
      { ...(await product("WIDE", 2000, 1000)), reference_id: "WIDE", product_id: "PRODUCT_WIDE" },
      { ...(await product("TALL", 1000, 2000)), reference_id: "TALL", product_id: "PRODUCT_TALL" },
      { ...(await product("SQ", 1500, 1500)), reference_id: "SQ", product_id: "PRODUCT_SQ" },
    ];
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    const cells = r.packed!.cells;
    for (const c of cells) {
      if (!c.original_width || !c.original_height || !c.rendered_width || !c.rendered_height) continue;
      const before = c.original_width / c.original_height;
      const after = c.rendered_width / c.rendered_height;
      assert.ok(
        Math.abs(before - after) < 0.03,
        `${c.source_reference_id} was stretched: ${before.toFixed(2)} became ${after.toFixed(2)}`,
      );
    }
  });

  await check("nothing is upscaled: a small photo stays small", async () => {
    const refs = [
      { ...(await product("TINY", 200, 200)), reference_id: "TINY", product_id: "PRODUCT_TINY" },
      await product("BIG", 2000, 2000),
    ];
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    const tiny = (r.packed?.cells || []).find((c) => c.source_reference_id === "TINY");
    if (tiny && tiny.rendered_width) {
      assert.ok(tiny.rendered_width <= 200, `a 200px image was drawn at ${tiny.rendered_width}px`);
      assert.strictEqual(tiny.downscale, 1, "an un-shrunk panel reported a downscale other than 1");
    }
  });

  console.log("\n-- the numbers I can judge the loss by --");

  await check("every panel reports its original size, its rendered size and the downscale", async () => {
    const refs = await Promise.all([product("A", 2048, 2048), product("B", 2048, 2048), product("C", 2048, 2048)]);
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    for (const c of r.packed!.cells) {
      assert.strictEqual(c.original_width, 2048, `${c.source_reference_id} lost its original width`);
      assert.ok(c.rendered_width && c.rendered_width > 0, `${c.source_reference_id} has no rendered width`);
      assert.ok(typeof c.downscale === "number", `${c.source_reference_id} has no downscale`);
      // Three 2048px products on a 1024px sheet must lose a lot; the point is that
      // the figure is reported rather than left to be guessed from the grid.
      assert.ok(c.downscale! < 1, `${c.source_reference_id} claims no loss on a packed sheet`);
      const longest = Math.max(c.rendered_width!, c.rendered_height!);
      assert.ok(
        Math.abs(c.downscale! - longest / 2048) < 0.01,
        `${c.source_reference_id}: downscale ${c.downscale} does not match ${longest}/2048`,
      );
    }
  });

  await check("a panel below the identity floor is reported, and the sheet is still built", async () => {
    // Four 2048px products on a 1024px sheet: a 2x2 grid gives cells under 512px,
    // which is Sunburst's floor.
    const refs = await Promise.all([
      product("A", 2048, 2048), product("B", 2048, 2048), product("C", 2048, 2048), product("D", 2048, 2048),
    ]);
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    assert.ok(r.warnings && r.warnings.length > 0, "four products on one 1024px sheet produced no warning");
    for (const w of r.warnings!) {
      assert.strictEqual(w.code, "PANEL_BELOW_IDENTITY_FLOOR");
      assert.strictEqual(w.floor_px, SUNBURST.minPanelLongestSidePx);
      assert.ok(w.longest_side_px < w.floor_px, "a warning fired above the floor");
    }
    // A warning is not a refusal.
    assert.strictEqual(r.status, "PACKED");
    assert.ok(r.references.length > 0, "the sheet was withheld because of a warning");
  });

  await check("no warning when the panels are comfortably large", async () => {
    // Two products at the Sunburst limit: each keeps its own slot, nothing packs.
    const refs = await Promise.all([product("A"), product("B")]);
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    assert.strictEqual(r.status, "PASS_THROUGH", `expected no packing, got ${r.status}`);
    assert.ok(!r.warnings || r.warnings.length === 0, "a pass-through payload produced a panel warning");
  });

  await check("the floor comes from the profile, not from a constant in the module", async () => {
    const refs = await Promise.all([
      product("A", 2048, 2048), product("B", 2048, 2048), product("C", 2048, 2048), product("D", 2048, 2048),
    ]);
    // An absurdly high floor must make every panel warn; a floor of 1 must silence
    // all of them. Same images, same sheet — only the declared floor differs.
    const strict = await ReferencePackingService.pack({
      references: refs,
      options: { ...OPTS(SUNBURST), minPanelLongestSidePx: 4096 },
    });
    const lax = await ReferencePackingService.pack({
      references: refs,
      options: { ...OPTS(SUNBURST), minPanelLongestSidePx: 1 },
    });
    assert.ok((strict.warnings || []).length > 0, "a 4096px floor produced no warnings");
    assert.strictEqual((lax.warnings || []).length, 0, "a 1px floor still produced warnings");
    // And the default exists for a caller that declares nothing.
    assert.ok(PACKING_DEFAULTS.minPanelLongestSidePx > 0);
  });

  console.log("\n-- labels --");

  await check("the label band sits above the picture, never over it", async () => {
    const refs = await Promise.all([product("A"), product("B"), product("C")]);
    const r = await ReferencePackingService.pack({
      references: refs,
      options: { ...OPTS(SUNBURST), label: true },
    });
    for (const c of r.packed!.cells) {
      // The cell box includes the band; the picture is shorter than the box by it.
      assert.ok(
        (c.rendered_height ?? 0) <= c.height,
        `${c.source_reference_id}: the picture is taller than its cell, so it covers the label band`,
      );
    }
    // The band is reserved in the geometry, which is what keeps letters off products.
    const src = read("lib/image-engine/provider/reference-packing/ReferencePackingService.ts");
    assert.ok(/imageH = label \? cellH - LABEL_BAND : cellH/.test(src), "the label band is no longer reserved");
    assert.ok(/top: label \? top \+ LABEL_BAND : top/.test(src), "the picture is no longer offset below the band");
  });

  console.log("\n-- nothing is lost silently --");

  await check("every drop reason has a Vietnamese sentence", async () => {
    const reasons: DropReason[] = [
      "INSPIRATION_TRAVELS_AS_TEXT",
      "LOGO_NOT_RENDERED_BY_MODEL",
      "REDUNDANT_VIEW_OF_SAME_PRODUCT",
      "UNCLASSIFIED_REFERENCE",
      "SUPPORTING_CONTEXT",
    ];
    for (const r of reasons) {
      const vi = DROP_REASON_VI[r];
      assert.ok(vi && vi.length > 20, `${r} has no real Vietnamese reason`);
      assert.ok(
        /[àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(vi),
        `${r} is not Vietnamese: ${vi}`,
      );
    }
  });

  await check("a dropped reference is reported with its reason, not swallowed", async () => {
    const refs = [
      await product("A"),
      await product("B"),
      {
        reference_id: "STYLE",
        role: "INSPIRATION_REFERENCE",
        mimeType: "image/png",
        buffer: await image(1000, 1000, [20, 20, 200]),
        filename: "mood.png",
      } as ProviderReferenceImage,
    ];
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    assert.ok(r.dropped.length > 0, "the style reference travelled as an image");
    const styleDrop = r.dropped.find((d) => d.reference_id === "STYLE");
    assert.ok(styleDrop, "the style reference was neither sent nor reported");
    assert.ok(DROP_REASON_VI[styleDrop!.reason], `no Vietnamese reason for ${styleDrop!.reason}`);
  });

  await check("the result exposes packed, dropped and warnings for the response to carry", async () => {
    const refs = await Promise.all([
      product("A", 2048, 2048), product("B", 2048, 2048), product("C", 2048, 2048), product("D", 2048, 2048),
    ]);
    const r = await ReferencePackingService.pack({ references: refs, options: OPTS(SUNBURST) });
    assert.ok(typeof r.status === "string");
    assert.ok(Array.isArray(r.dropped));
    assert.ok(Array.isArray(r.products_in) && Array.isArray(r.products_out));
    assert.ok(Array.isArray(r.warnings));
    // The transport puts exactly these on remoteDetails.reference_packing.
    const provider = read("lib/image-engine/provider/ImgStudioImageGenerationProvider.ts");
    assert.ok(/reference_packing: \{/.test(provider), "the transport does not surface the packing result");
    assert.ok(/DROP_REASON_VI\[d\.reason\]/.test(provider), "the surfaced drops carry no Vietnamese reason");
    assert.ok(/REFERENCE_COUNT_GUARD/.test(provider), "the pre-dispatch count guard is gone");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  if (failed) process.exit(1);
}

main();
