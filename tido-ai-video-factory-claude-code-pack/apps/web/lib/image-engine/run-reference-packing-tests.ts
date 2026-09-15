import assert from "assert";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { ReferencePackingService } from "./provider/reference-packing/ReferencePackingService";
import { gridFor, planPacking, rankForFullResolution } from "./provider/reference-packing/ReferencePackingStrategy";
import type { PackingResult } from "./provider/reference-packing/ReferencePackingTypes";
import type { ProviderReferenceImage } from "./provider/ImageGenerationProvider";
import type { ReferenceManifest } from "./types";

/**
 * Reference Packing.
 *
 * One question decides whether this module is correct: does every distinct
 * product that went in come out the other side. Everything else — grid shape,
 * which reference keeps full resolution, whether a label was drawn — is detail
 * that can be wrong without anyone being harmed. A product going missing cannot,
 * because the render that results looks finished.
 *
 * So the identity assertions are repeated in every case rather than factored
 * into one test that could be skipped, and the harness composes real images
 * through sharp rather than stubbing it: a sheet that only exists as a plan
 * proves nothing about a sheet that has to survive a resize.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
const pending: Promise<void>[] = [];

function check(name: string, fn: () => void | Promise<void>) {
  const record = (err?: any) => {
    if (err) {
      failed++;
      failures.push(`${name}: ${err.message}`);
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  };
  try {
    const out = fn();
    // Async tests were silently counted as passes here once, so a deliberate
    // throw inside a promise looked identical to a clean run. They are awaited.
    if (out && typeof (out as Promise<void>).then === "function") {
      pending.push((out as Promise<void>).then(() => record()).catch(record));
    } else {
      record();
    }
  } catch (err: any) {
    record(err);
  }
}

/** A real, decodable image of a given size and colour. */
async function image(w: number, h: number, rgb: [number, number, number]): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } },
  })
    .png()
    .toBuffer();
}

async function productRef(
  id: string,
  productId: string | undefined,
  size: [number, number] = [400, 400],
  role: string = "PRODUCT"
): Promise<ProviderReferenceImage> {
  return {
    reference_id: id,
    product_id: productId,
    role: role as ProviderReferenceImage["role"],
    mimeType: "image/png",
    buffer: await image(size[0], size[1], [200, 100, 50]),
  };
}

const LIMIT = 3;
const pack = (references: ProviderReferenceImage[], manifest?: ReferenceManifest, limit = LIMIT) =>
  ReferencePackingService.pack({ references, manifest, options: { limit } });

/** Every identity that arrived must be accounted for in the result. */
function assertNothingLost(result: PackingResult, expected: string[]) {
  assert.deepStrictEqual(
    [...result.products_out].sort(),
    [...expected].sort(),
    `products went in as ${expected.join(",")} and came out as ${result.products_out.join(",")}`
  );
  const inPacked = result.packed?.contains_products || [];
  const inOwnSlot = result.references
    .filter((r) => r.reference_id !== result.packed?.reference_id)
    .map((r) => r.product_id)
    .filter(Boolean) as string[];
  for (const p of expected) {
    assert.ok(
      inPacked.includes(p) || inOwnSlot.includes(p),
      `${p} is claimed as preserved but is in neither the sheet nor a slot of its own`
    );
  }
}

console.log("\n=== Reference Packing ===\n");

// ── the seven cases ─────────────────────────────────────────────────────────

check("Test 1 — one product is not packed", async () => {
  const refs = [await productRef("REF_01", "PRODUCT_01")];
  const r = await pack(refs);
  assert.strictEqual(r.status, "PASS_THROUGH");
  assert.strictEqual(r.references, refs, "the list was rebuilt for a payload that already fitted");
  assert.strictEqual(r.packed, undefined);
  assertNothingLost(r, ["PRODUCT_01"]);
});

check("Test 2 — three products pass through untouched", async () => {
  const refs = [
    await productRef("REF_01", "PRODUCT_01"),
    await productRef("REF_02", "PRODUCT_02"),
    await productRef("REF_03", "PRODUCT_03"),
  ];
  const r = await pack(refs);
  assert.strictEqual(r.status, "PASS_THROUGH");
  assert.strictEqual(r.references.length, 3);
  assert.strictEqual(r.packed, undefined, "a sheet was built for a payload the provider accepts");
  assertNothingLost(r, ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03"]);
});

check("Test 3 — four products produce a packed reference", async () => {
  const refs = [
    await productRef("REF_01", "PRODUCT_01"),
    await productRef("REF_02", "PRODUCT_02"),
    await productRef("REF_03", "PRODUCT_03"),
    await productRef("REF_04", "PRODUCT_04"),
  ];
  const r = await pack(refs);
  assert.strictEqual(r.status, "PACKED");
  assert.strictEqual(r.references.length, 3, "the provider ceiling was not respected");
  assert.ok(r.packed, "no identity map was produced");
  assert.strictEqual(r.packed!.reference_id, "PACKED_PRODUCTS_01");
  assert.deepStrictEqual(r.packed!.contains_products, [
    "PRODUCT_01",
    "PRODUCT_02",
    "PRODUCT_03",
    "PRODUCT_04",
  ]);
  assert.deepStrictEqual(r.packed!.source_reference_ids, ["REF_01", "REF_02", "REF_03", "REF_04"]);
  assertNothingLost(r, ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03", "PRODUCT_04"]);
});

check("Test 4 — five products all survive", async () => {
  const refs = [];
  for (let i = 1; i <= 5; i++) refs.push(await productRef(`REF_0${i}`, `PRODUCT_0${i}`));
  const r = await pack(refs);
  assert.strictEqual(r.status, "PACKED");
  assert.strictEqual(r.references.length, 3);
  assert.strictEqual(r.packed!.cells.length, 5, "a product has no cell in the sheet");
  assertNothingLost(r, ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03", "PRODUCT_04", "PRODUCT_05"]);
});

check("Test 5 — a duplicate view goes before anything is packed", async () => {
  const refs = [
    await productRef("REF_01", "PRODUCT_01"),
    await productRef("REF_02", "PRODUCT_01"),
    await productRef("REF_03", "PRODUCT_02"),
    await productRef("REF_04", "PRODUCT_03"),
  ];
  const r = await pack(refs);
  // Three identities and a spare photograph of one of them. Shedding the spare
  // is enough, and building a sheet instead would scale down three references
  // the provider was willing to take whole.
  assert.strictEqual(r.status, "ADAPTED");
  assert.strictEqual(r.packed, undefined);
  assert.strictEqual(r.dropped[0].reason, "REDUNDANT_VIEW_OF_SAME_PRODUCT");
  assertNothingLost(r, ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03"]);
});

check("Test 6 — a logo goes before any product is touched", async () => {
  const refs = [
    await productRef("REF_01", "PRODUCT_01"),
    await productRef("REF_02", "PRODUCT_02"),
    await productRef("REF_03", "PRODUCT_03"),
    await productRef("REF_04", undefined, [200, 200], "LOGO"),
  ];
  const r = await pack(refs);
  assert.strictEqual(r.status, "ADAPTED");
  assert.strictEqual(r.dropped[0].reason, "LOGO_NOT_RENDERED_BY_MODEL");
  assert.ok(!r.references.some((x) => x.role === "LOGO"));
  assertNothingLost(r, ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03"]);
});

check("Test 7 — no product disappears, across every shape of payload", async () => {
  // The single claim this module makes, checked against the cases most likely to
  // break it rather than against the one that is easy to pass.
  const cases: { name: string; refs: ProviderReferenceImage[]; expect: string[] }[] = [
    {
      name: "four products and a logo",
      refs: [
        await productRef("REF_01", "PRODUCT_01"),
        await productRef("REF_02", "PRODUCT_02"),
        await productRef("REF_03", "PRODUCT_03"),
        await productRef("REF_04", "PRODUCT_04"),
        await productRef("REF_05", undefined, [200, 200], "LOGO"),
      ],
      expect: ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03", "PRODUCT_04"],
    },
    {
      name: "six products",
      refs: await Promise.all(
        [1, 2, 3, 4, 5, 6].map((i) => productRef(`REF_0${i}`, `PRODUCT_0${i}`))
      ),
      expect: ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03", "PRODUCT_04", "PRODUCT_05", "PRODUCT_06"],
    },
    {
      name: "four products, two of them extra views",
      refs: [
        await productRef("REF_01", "PRODUCT_01"),
        await productRef("REF_02", "PRODUCT_01"),
        await productRef("REF_03", "PRODUCT_02"),
        await productRef("REF_04", "PRODUCT_03"),
        await productRef("REF_05", "PRODUCT_04"),
      ],
      expect: ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03", "PRODUCT_04"],
    },
  ];
  for (const c of cases) {
    const r = await pack(c.refs);
    assert.ok(r.references.length <= LIMIT, `${c.name}: sent ${r.references.length} references`);
    assert.notStrictEqual(r.status, "IMPOSSIBLE", `${c.name}: refused a payload it can pack`);
    assertNothingLost(r, c.expect);
  }
});

// ── the sheet itself ────────────────────────────────────────────────────────

check("The packed sheet is a real, decodable image of the declared size", async () => {
  const refs = [];
  for (let i = 1; i <= 4; i++) refs.push(await productRef(`REF_0${i}`, `PRODUCT_0${i}`));
  const r = await pack(refs);
  const sheet = r.references.find((x) => x.reference_id === "PACKED_PRODUCTS_01")!;
  const meta = await sharp(sheet.buffer as Buffer).metadata();
  assert.strictEqual(meta.width, r.packed!.sheet.width);
  assert.strictEqual(meta.height, r.packed!.sheet.height);
  assert.strictEqual(sheet.mimeType, "image/png");
});

check("Packing the same references twice produces the same bytes", async () => {
  // The idempotency key, the prompt cache and every before/after comparison
  // assume one input makes one request.
  const build = async () => {
    const refs = [];
    for (let i = 1; i <= 4; i++) refs.push(await productRef(`REF_0${i}`, `PRODUCT_0${i}`));
    const r = await pack(refs);
    return (r.references[0].buffer as Buffer).toString("base64");
  };
  assert.strictEqual(await build(), await build(), "the sheet is not deterministic");
});

check("Every cell has a distinct position and a source it came from", async () => {
  const refs = [];
  for (let i = 1; i <= 5; i++) refs.push(await productRef(`REF_0${i}`, `PRODUCT_0${i}`));
  const r = await pack(refs);
  const seen = new Set<string>();
  for (const cell of r.packed!.cells) {
    const key = `${cell.row}:${cell.column}`;
    assert.ok(!seen.has(key), `two products share cell ${key}`);
    seen.add(key);
    assert.ok(cell.source_reference_id, "a cell has no source reference");
    assert.ok(cell.width > 0 && cell.height > 0, "a cell has no area");
    assert.ok(
      cell.left + cell.width <= r.packed!.sheet.width &&
        cell.top + cell.height <= r.packed!.sheet.height,
      "a cell falls outside the sheet"
    );
  }
});

check("A tall product and a wide product are both contained, never cropped", async () => {
  // Cropping to fill a square cell would cut off part of a product, which is the
  // loss this module exists to prevent, arriving by a different door.
  const refs = [
    await productRef("REF_01", "PRODUCT_01", [200, 900]),
    await productRef("REF_02", "PRODUCT_02", [900, 200]),
    await productRef("REF_03", "PRODUCT_03", [400, 400]),
    await productRef("REF_04", "PRODUCT_04", [400, 400]),
  ];
  const r = await pack(refs);
  assert.strictEqual(r.status, "PACKED");
  assertNothingLost(r, ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03", "PRODUCT_04"]);
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "reference-packing", "ReferencePackingService.ts"),
    "utf-8"
  );
  assert.ok(/fit:\s*"contain"/.test(src), "the sheet no longer contains, so it may be cropping");
  assert.ok(!/fit:\s*"cover"/.test(src), "cover crops the product");
});

check("The highest-resolution reference is the one kept at full size", async () => {
  const refs = [
    await productRef("REF_01", "PRODUCT_01", [300, 300]),
    await productRef("REF_02", "PRODUCT_02", [1600, 1600]),
    await productRef("REF_03", "PRODUCT_03", [300, 300]),
    await productRef("REF_04", "PRODUCT_04", [800, 800]),
  ];
  const r = await pack(refs);
  const ownSlots = r.references.filter((x) => x.reference_id !== "PACKED_PRODUCTS_01");
  assert.strictEqual(ownSlots.length, 2);
  assert.strictEqual(ownSlots[0].reference_id, "REF_02", "the most detailed reference was scaled into a cell");
  assert.strictEqual(ownSlots[1].reference_id, "REF_04");
});

// ── refusal, still ──────────────────────────────────────────────────────────

check("More products than one sheet can hold is refused, not squeezed", async () => {
  const refs = [];
  for (let i = 1; i <= 12; i++) refs.push(await productRef(`REF_${i}`, `PRODUCT_${i}`));
  const r = await pack(refs);
  assert.strictEqual(r.status, "IMPOSSIBLE");
  assert.ok(/12|legibly/.test(r.reason || ""), "the refusal does not say what the obstacle was");
  assert.strictEqual(r.references.length, 0);
});

check("A ceiling of one carries the sheet and nothing else", async () => {
  const refs = [];
  for (let i = 1; i <= 4; i++) refs.push(await productRef(`REF_0${i}`, `PRODUCT_0${i}`));
  const r = await pack(refs, undefined, 1);
  assert.strictEqual(r.status, "PACKED");
  assert.strictEqual(r.references.length, 1);
  assertNothingLost(r, ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03", "PRODUCT_04"]);
});

check("An unreadable reference fails the pack rather than leaving a hole", async () => {
  const refs = [
    await productRef("REF_01", "PRODUCT_01"),
    await productRef("REF_02", "PRODUCT_02"),
    await productRef("REF_03", "PRODUCT_03"),
    {
      reference_id: "REF_04",
      product_id: "PRODUCT_04",
      role: "PRODUCT" as const,
      mimeType: "image/png",
      buffer: Buffer.from("this is not an image"),
    },
  ];
  const r = await pack(refs);
  assert.strictEqual(r.status, "IMPOSSIBLE", "a product that could not be drawn was quietly skipped");
  assert.strictEqual(r.products_out.length, 0);
});

// ── the plan, without pixels ────────────────────────────────────────────────

check("The strategy decides without reading a single buffer", () => {
  const bare = (id: string, pid?: string, role = "PRODUCT"): ProviderReferenceImage => ({
    reference_id: id,
    product_id: pid,
    role: role as ProviderReferenceImage["role"],
    mimeType: "image/png",
    buffer: undefined as never,
  });
  const plan = planPacking({
    references: [
      bare("REF_01", "PRODUCT_01"),
      bare("REF_02", "PRODUCT_02"),
      bare("REF_03", "PRODUCT_03"),
      bare("REF_04", "PRODUCT_04"),
    ],
    limit: 3,
  });
  assert.strictEqual(plan.status, "PACKED");
  assert.strictEqual(plan.toPack.length, 4);
  assert.strictEqual(plan.toKeep.length, 2);
});

check("The grid stays as square as the count allows", () => {
  assert.deepStrictEqual(gridFor(4), { rows: 2, columns: 2 });
  assert.deepStrictEqual(gridFor(5), { rows: 2, columns: 3 });
  assert.deepStrictEqual(gridFor(9), { rows: 3, columns: 3 });
  assert.deepStrictEqual(gridFor(0), { rows: 0, columns: 0 });
});

check("Ranking is stable when two references are the same size", () => {
  const a = { reference_id: "REF_01", mimeType: "image/png", buffer: Buffer.alloc(10) } as ProviderReferenceImage;
  const b = { reference_id: "REF_02", mimeType: "image/png", buffer: Buffer.alloc(10) } as ProviderReferenceImage;
  assert.deepStrictEqual(
    rankForFullResolution([a, b]).map((r) => r.reference_id),
    ["REF_01", "REF_02"],
    "equal scores do not fall back to input order"
  );
});

// ── boundaries ──────────────────────────────────────────────────────────────

check("No packing logic lives inside the provider", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "ImgStudioImageGenerationProvider.ts"),
    "utf-8"
  );
  assert.ok(/ReferencePackingService\.pack\(/.test(src), "the provider does not call the packing module");
  for (const leak of ["gridFor", "buildSheet", "fit: \"contain\"", "composite("]) {
    assert.ok(!src.includes(leak), `packing logic leaked into the provider: ${leak}`);
  }
});

check("Packing runs before normalization and before the request", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "ImgStudioImageGenerationProvider.ts"),
    "utf-8"
  );
  const packed = src.indexOf("ReferencePackingService.pack(");
  const normalized = src.indexOf("ImageNormalizationService.normalizePayload");
  assert.ok(packed > 0 && packed < normalized, "images are normalized before they are packed");
});

check("The ceiling never moved up into business logic", () => {
  for (const file of [
    ["service", "SimpleImageGenerationOrchestratorService.ts"],
    ["compiler", "MasterPromptCompilerService.ts"],
    ["evolution", "ExperimentPipeline.ts"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", ...file), "utf-8");
    assert.ok(
      !/IMGSTUDIO_MAX_REFERENCE_IMAGES|ReferencePackingService|planPacking/.test(src),
      `${file[1]} now knows about the provider ceiling or the packing layer`
    );
  }
});

check("The packing module reaches no network and no model", () => {
  const dir = path.join(process.cwd(), "lib", "image-engine", "provider", "reference-packing");
  for (const file of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, file), "utf-8");
    for (const forbidden of ["fetch(", "axios", "LLMProvider", "generateChatCompletion", "CreativeDirector"]) {
      assert.ok(!src.includes(forbidden), `${file} reaches for ${forbidden}`);
    }
  }
});

check("Telemetry reports counts and identities, never image content", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "reference-packing", "ReferencePackingService.ts"),
    "utf-8"
  );
  const logs = src.match(/console\.log\("\[REFERENCE_PACKING\]\[[A-Z]+\]",[\s\S]*?\}\);/g) || [];
  assert.strictEqual(logs.length, 2, "the two required log points are not both present");
  for (const block of logs) {
    assert.ok(
      !/buffer|base64|toString\(|filename/.test(block),
      "a packing log carries image content"
    );
  }
});

void (async () => {
  await Promise.all(pending);
  console.log("");
  console.log("=".repeat(74));
  console.log(`${passed} passed, ${failed} failed`);
  console.log("=".repeat(74));
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
})();
