import assert from "assert";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { ReferencePackingService } from "./provider/reference-packing/ReferencePackingService";
import {
  applyPackedReferenceProtocol,
  needsProtocol,
  renderPackedReferenceProtocol,
} from "./provider/reference-packing/PackedReferenceProtocol";
import type { PackingResult } from "./provider/reference-packing/ReferencePackingTypes";
import type { ProviderReferenceImage } from "./provider/ImageGenerationProvider";

/**
 * Packed Reference Map Communication.
 *
 * The packing layer put four products into three images. This layer tells the
 * renderer what it is looking at, and the tests are arranged around the four
 * readings of that image which are plausible and wrong:
 *
 *   the grid is a layout      → rules 1 and 2 must forbid it
 *   the labels are artwork    → rule 3 must forbid drawing them
 *   the padding is a backdrop → rule 5 must name it as padding
 *   six images, six products  → the companion section must state the real count
 *
 * The fourth is the one that was not in the original specification and is the
 * most dangerous: packing sends the sheet AND the highest-resolution originals,
 * so two products arrive twice and nothing in the image says so.
 *
 * Running through the compiled `COMPILED` fixture rather than a hand-written map
 * keeps the assertions honest — the block is checked as it will actually be
 * built, from a sheet that was actually composed.
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
    if (out && typeof (out as Promise<void>).then === "function") {
      pending.push((out as Promise<void>).then(() => record()).catch(record));
    } else {
      record();
    }
  } catch (err: any) {
    record(err);
  }
}

const COMPILED = [
  "## ROLE",
  "Make a commercial photograph.",
  "## CONFLICT PRIORITY",
  "Product identity outranks styling.",
  "## FINAL OUTPUT",
  "Render it.",
].join("\n");

async function productRef(
  id: string,
  productId: string,
  size: [number, number] = [400, 400]
): Promise<ProviderReferenceImage> {
  return {
    reference_id: id,
    product_id: productId,
    role: "PRODUCT",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: size[0], height: size[1], channels: 3, background: { r: 180, g: 90, b: 70 } },
    })
      .png()
      .toBuffer(),
  };
}

async function packN(n: number, limit = 3): Promise<PackingResult> {
  const refs: ProviderReferenceImage[] = [];
  for (let i = 1; i <= n; i++) {
    refs.push(await productRef(`REF_${String(i).padStart(2, "0")}`, `PRODUCT_${String(i).padStart(2, "0")}`));
  }
  return ReferencePackingService.pack({ references: refs, options: { limit } });
}

console.log("\n=== Packed Reference Map Communication ===\n");

// ── A and B: the prompt that must not change ────────────────────────────────

check("A — one product produces no protocol and no prompt change", async () => {
  const result = await packN(1);
  assert.strictEqual(result.status, "PASS_THROUGH");
  assert.strictEqual(needsProtocol(result), false);
  const out = applyPackedReferenceProtocol(COMPILED, result);
  // The same string, not an equal one. A rebuilt prompt is a new chance to
  // change whitespace in something the budget layer already measured.
  assert.strictEqual(out, COMPILED, "the prompt was rewritten for an unpacked render");
  assert.ok(!out.includes("PACKED_REFERENCE_PROTOCOL"));
});

check("B — three products pass through with no protocol", async () => {
  const result = await packN(3);
  assert.strictEqual(result.status, "PASS_THROUGH");
  const out = applyPackedReferenceProtocol(COMPILED, result);
  assert.strictEqual(out, COMPILED);
});

check("B2 — shedding to fit is not packing, so still no protocol", async () => {
  // Three products and a logo. The logo goes, nothing is packed, and a sheet
  // that was never built must not be described.
  const refs = [
    await productRef("REF_01", "PRODUCT_01"),
    await productRef("REF_02", "PRODUCT_02"),
    await productRef("REF_03", "PRODUCT_03"),
    {
      reference_id: "REF_04",
      role: "LOGO" as const,
      mimeType: "image/png",
      buffer: await sharp({ create: { width: 100, height: 100, channels: 3, background: "#fff" } })
        .png()
        .toBuffer(),
    },
  ];
  const result = await ReferencePackingService.pack({ references: refs, options: { limit: 3 } });
  assert.strictEqual(result.status, "ADAPTED");
  assert.strictEqual(needsProtocol(result), false);
  assert.strictEqual(applyPackedReferenceProtocol(COMPILED, result), COMPILED);
});

check("A missing or failed packing result leaves the prompt alone", () => {
  assert.strictEqual(applyPackedReferenceProtocol(COMPILED, null), COMPILED);
  assert.strictEqual(applyPackedReferenceProtocol(COMPILED, undefined), COMPILED);
  assert.strictEqual(
    applyPackedReferenceProtocol(COMPILED, {
      status: "IMPOSSIBLE",
      references: [],
      dropped: [],
      products_in: [],
      products_out: [],
    }),
    COMPILED
  );
});

// ── C: four products ────────────────────────────────────────────────────────

check("C — four products produce the protocol", async () => {
  const result = await packN(4);
  assert.strictEqual(result.status, "PACKED");
  const out = applyPackedReferenceProtocol(COMPILED, result);
  assert.ok(out.startsWith(COMPILED), "the compiled prompt was altered rather than extended");
  assert.ok(out.includes("## PACKED_REFERENCE_PROTOCOL"));
  assert.ok(out.includes("PACKED_REFERENCE_MAP"));
  assert.ok(out.includes("PACKED_PRODUCTS_01"));
});

check("C — the mapping names every cell with its row and column", async () => {
  const result = await packN(4);
  const block = renderPackedReferenceProtocol(result);
  assert.ok(block.includes("- PRODUCT_01 (REF_01) → row 0 column 0"));
  assert.ok(block.includes("- PRODUCT_02 (REF_02) → row 0 column 1"));
  assert.ok(block.includes("- PRODUCT_03 (REF_03) → row 1 column 0"));
  assert.ok(block.includes("- PRODUCT_04 (REF_04) → row 1 column 1"));
});

check("C — the block gives no layout instruction", async () => {
  const result = await packN(4);
  const block = renderPackedReferenceProtocol(result);
  // Every mention of a position must be either inside the cell mapping or a
  // prohibition. A line that tells the renderer where to put something would be
  // this layer deciding composition, which belongs to the creative strategy.
  for (const line of block.split("\n")) {
    if (!/row \d|column \d|grid|place|arrange|position/i.test(line)) continue;
    const isMapping = line.startsWith("- PRODUCT") || line.startsWith("Cell mapping");
    const isProhibition = /^\d\. Do not|not a composition|not a layout|never by/i.test(line);
    assert.ok(
      isMapping || isProhibition,
      `a positional line is neither a mapping nor a prohibition: "${line}"`
    );
  }
  assert.ok(block.includes("Do not reproduce the grid arrangement."));
  assert.ok(block.includes("Do not place the products where the sheet places them."));
  assert.ok(/not a composition reference/i.test(block));
  assert.ok(/not a layout suggestion/i.test(block));
});

check("C — the block forbids drawing the sheet's own labels", async () => {
  // The cells carry burned-in PRODUCT_01 text. A renderer reproducing it would
  // break the locked rule that the model generates no text of its own.
  const result = await packN(4);
  const block = renderPackedReferenceProtocol(result);
  assert.ok(/Do not draw the words PRODUCT_01/.test(block));
  assert.ok(/Do not render the sheet itself/.test(block));
  assert.ok(/padding/.test(block), "the grey field is not identified as padding");
});

check("C — the block names the identity attributes to extract", async () => {
  const block = renderPackedReferenceProtocol(await packN(4));
  for (const attr of ["shape", "material", "colour", "logo", "texture", "unique details"]) {
    assert.ok(block.includes(attr), `the protocol does not ask for ${attr}`);
  }
});

// ── the duplication hazard ──────────────────────────────────────────────────

check("C — references that also travel whole are declared as repeats", async () => {
  // The sheet holds four; two of them are sent again at full resolution. Three
  // images, six product depictions, four actual products. Unexplained, this is
  // an invitation to render six.
  const result = await packN(4);
  const companions = result.references.filter((r) => r.reference_id !== "PACKED_PRODUCTS_01");
  assert.strictEqual(companions.length, 2);
  const block = renderPackedReferenceProtocol(result);
  for (const c of companions) {
    assert.ok(block.includes(c.reference_id), `${c.reference_id} is in the payload but not explained`);
  }
  assert.ok(/not additional ones/.test(block), "the repeats are not stated to be repeats");
  assert.ok(/4 distinct products/.test(block), "the true product count is not stated");
});

check("A ceiling of one sends only the sheet and claims no companions", async () => {
  const result = await packN(4, 1);
  assert.strictEqual(result.references.length, 1);
  const block = renderPackedReferenceProtocol(result);
  assert.ok(!/ALSO ARRIVE WHOLE/.test(block), "companions were described where there are none");
  assert.ok(/Preserve all 4 listed products/.test(block));
});

// ── D: five and more ────────────────────────────────────────────────────────

check("D — five products are all declared", async () => {
  const result = await packN(5);
  const block = renderPackedReferenceProtocol(result);
  for (let i = 1; i <= 5; i++) {
    const id = `PRODUCT_0${i}`;
    assert.ok(block.includes(id), `${id} is in the sheet but not in the map`);
  }
  assert.ok(/Preserve all 5 listed products/.test(block));
  assert.ok(/There are 5 distinct products/.test(block));
});

check("D — six products are all declared, and the count follows the brief", async () => {
  const result = await packN(6);
  const block = renderPackedReferenceProtocol(result);
  for (let i = 1; i <= 6; i++) {
    assert.ok(block.includes(`PRODUCT_0${i}`), `PRODUCT_0${i} is missing from the map`);
  }
  assert.ok(/Preserve all 6 listed products/.test(block));
  assert.strictEqual(result.packed!.cells.length, 6);
});

check("D — every declared product maps to a cell that exists in the sheet", async () => {
  for (const n of [4, 5, 6, 9]) {
    const result = await packN(n);
    const block = renderPackedReferenceProtocol(result);
    const declared = [...block.matchAll(/^- (PRODUCT_\d+) \((REF_\d+)\) → row (\d) column (\d)$/gm)];
    assert.strictEqual(declared.length, n, `${n} products but ${declared.length} mapping lines`);
    for (const [, productId, refId, row, col] of declared) {
      const cell = result.packed!.cells.find((c) => c.product_id === productId);
      assert.ok(cell, `${productId} is declared but has no cell`);
      assert.strictEqual(cell!.source_reference_id, refId, `${productId} names the wrong source`);
      assert.strictEqual(cell!.row, Number(row), `${productId} claims the wrong row`);
      assert.strictEqual(cell!.column, Number(col), `${productId} claims the wrong column`);
    }
  }
});

// ── invariants ──────────────────────────────────────────────────────────────

check("The block is deterministic for the same sheet", async () => {
  const a = renderPackedReferenceProtocol(await packN(4));
  const b = renderPackedReferenceProtocol(await packN(4));
  assert.strictEqual(a, b);
});

check("The block stays small enough to append to a compiled prompt", async () => {
  // It is appended after the budget manager and the optimizer have both already
  // run, so it is spent budget nobody upstream accounted for.
  const block = renderPackedReferenceProtocol(await packN(4));
  assert.ok(block.length < 2000, `the protocol adds ${block.length} characters`);
  console.log(`      (protocol is ${block.length} chars for 4 products)`);
});

check("The block decides nothing creative", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "reference-packing", "PackedReferenceProtocol.ts"),
    "utf-8"
  );
  for (const forbidden of ["CreativeDirector", "strategy_route", "staging", "LLMProvider", "fetch("]) {
    assert.ok(!src.includes(forbidden), `the protocol layer reaches for ${forbidden}`);
  }
});

check("Composition is explicitly handed back to the creative layer", async () => {
  const block = renderPackedReferenceProtocol(await packN(4));
  assert.ok(
    /Composition is decided by the creative direction stated elsewhere in this prompt, never by/.test(
      block
    ),
    "the block does not defer composition to the creative layer"
  );
});

// ── wiring ──────────────────────────────────────────────────────────────────

check("Both prompt sites in the provider send the effective prompt", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "ImgStudioImageGenerationProvider.ts"),
    "utf-8"
  );
  assert.ok(/formData\.append\("prompt", effectivePrompt\)/.test(src), "the multipart path sends the raw prompt");
  assert.ok(/prompt: effectivePrompt,/.test(src), "the JSON path sends the raw prompt");
  const applied = src.indexOf("applyPackedReferenceProtocol(input.prompt");
  const sent = src.indexOf('formData.append("prompt"');
  assert.ok(applied > 0 && applied < sent, "the protocol is applied after the request is built");
});

check("No protocol text lives in the provider", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "ImgStudioImageGenerationProvider.ts"),
    "utf-8"
  );
  for (const leak of ["PACKED_REFERENCE_PROTOCOL", "Cell mapping", "Do not reproduce the grid"]) {
    assert.ok(!src.includes(leak), `protocol wording leaked into the provider: ${leak}`);
  }
});

check("Nothing upstream of the provider learned about the sheet", () => {
  // The compiler finished its work before a sheet existed. If it starts knowing
  // about packing, the prompt and the payload have two authors again.
  for (const file of [
    ["service", "SimpleImageGenerationOrchestratorService.ts"],
    ["compiler", "MasterPromptCompilerService.ts"],
    ["evolution", "ExperimentPipeline.ts"],
    ["evolution", "experiment", "NanoBananaPromptComposer.ts"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", ...file), "utf-8");
    assert.ok(
      !/PACKED_REFERENCE|PackedReference|applyPackedReferenceProtocol/.test(src),
      `${file[file.length - 1]} now knows about packed references`
    );
  }
});

check("The packing service was not modified to serve this layer", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "reference-packing", "ReferencePackingService.ts"),
    "utf-8"
  );
  assert.ok(
    !/PackedReferenceProtocol|renderPackedReferenceProtocol|PACKED_REFERENCE_PROTOCOL/.test(src),
    "the packing service now depends on the protocol layer"
  );
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
