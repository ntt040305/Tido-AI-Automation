/**
 * The model profile, and the allocation that decides what gets sent.
 *
 * WHY THESE TWO TOGETHER
 * ----------------------
 * The provider accepts two images per call and refuses a third with HTTP 400
 * before rendering (`03-provider-capabilities.md` §2.2). The system still has to
 * accept many images from a user. So one row says what the ceiling is, and one
 * pure function decides how many photographs fit under it — and the two have to
 * agree, which is what this suite checks.
 *
 * The invariants in §2 are the contract three readers depend on: the transport
 * attaches these slots, the brief's section C describes these slots, and the
 * checks count against these slots. If allocation is not deterministic and
 * lossless, the prompt can describe an arrangement the provider never received.
 *
 * Pure. No model call, no network, no clock. Sheet RENDERING (sharp) is covered by
 * `run-reference-packing-tests.ts`.
 */
import assert from "assert";
import fs from "fs";
import path from "path";

import {
  IMAGE_MODEL_PROFILES,
  SUNBURST,
  NANO_BANANA_2,
  DEFAULT_PROFILE,
  activeProfile,
  profileForProviderId,
  profileTelemetry,
} from "./models/image-model-profiles";
import { IMAGE_ENGINE_CONFIG } from "./config";
import { checkIntake } from "./service/intake-limits";
import {
  promptDialect,
  engineForActiveModel,
  gptDialectAvailable,
  PromptDialectNotBuiltError,
  promptEngineVersion,
  engineTelemetry,
  labelLockVerified,
} from "./prompt-v2/engine-selector";
import {
  allocateReferences,
  smallPanels,
  gridForPanels,
  type AllocationInput,
  type Allocation,
} from "./provider/reference-packing/reference-allocation";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
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

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** n product images across `distinctProducts` products, plus an optional logo. */
function inputs(n: number, withLogo: boolean, distinctProducts = n): AllocationInput[] {
  const out: AllocationInput[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `p${i + 1}`,
      kind: "product",
      productId: `PRODUCT_${String((i % Math.max(1, distinctProducts)) + 1).padStart(2, "0")}`,
      width: 2000,
      height: 2000,
      filename: `product-${i + 1}.png`,
    });
  }
  if (withLogo) out.push({ id: "logo", kind: "logo", width: 800, height: 400, filename: "logo.png" });
  return out;
}

const OPTS = (limit: number, maxPanels = 4, sheet = 1024) => ({
  limit,
  maxPanelsPerSheet: maxPanels,
  sheetSizePx: sheet,
});

function allPanelIds(a: Allocation): string[] {
  return a.slots.flatMap((s) => s.panels.map((p) => p.sourceImageId));
}

function main() {
  console.log("\n=== MODEL PROFILE + REFERENCE ALLOCATION ===\n");

  // ── 1. The profile ──────────────────────────────────────────────────────
  console.log("-- the two rows --");

  check("exactly two rows, Sunburst default", () => {
    assert.strictEqual(IMAGE_MODEL_PROFILES.length, 2);
    assert.strictEqual(DEFAULT_PROFILE, SUNBURST);
  });

  check("Sunburst carries only the values 03 proved", () => {
    assert.strictEqual(SUNBURST.providerId, "0927e191-1aef-4c56-a3ac-df0c47d84e80");
    assert.strictEqual(SUNBURST.promptDialect, "gpt-image");
    assert.deepStrictEqual([...SUNBURST.ratios], ["1:1", "9:16", "16:9"]);
    assert.ok(!SUNBURST.ratios.includes("4:5"), "4:5 was refused with HTTP 400 and must not be offered");
    assert.strictEqual(SUNBURST.resolutionTier, "1K");
    assert.strictEqual(SUNBURST.quality, "high");
    // The number this whole packing effort exists for.
    assert.strictEqual(SUNBURST.maxReferences, 2);
    assert.strictEqual(SUNBURST.timeoutMs, 160000);
    assert.strictEqual(SUNBURST.latencyMs.max, 76400, "the observed maximum is the one measured in 03 §2.3");
  });

  check("Nano Banana 2 is the rollback and keeps today's values", () => {
    assert.strictEqual(NANO_BANANA_2.providerId, "flow-nano-banana-2");
    assert.strictEqual(NANO_BANANA_2.promptDialect, "gemini");
    assert.strictEqual(NANO_BANANA_2.quality, "standard", "today's provider default is standard");
    assert.strictEqual(NANO_BANANA_2.maxReferences, 3, "config.ts:172-175 measured 3 for this model");
  });

  check("every unproven claim is named, not guessed", () => {
    assert.ok(SUNBURST.unverified.length >= 5, "the probe left more unknown than this lists");
    const joined = SUNBURST.unverified.join(" ");
    assert.ok(/quality/i.test(joined), "the quality echo is not recorded as unverified");
    assert.ok(/prompt length/i.test(joined), "the prompt-length ceiling is not recorded as unverified");
    // And it is stated at the field too, where a reader will actually be.
    assert.ok(/UNVERIFIED-EFFECT/.test(read("lib/image-engine/models/image-model-profiles.ts")));
  });

  check("every value points at its evidence", () => {
    const src = read("lib/image-engine/models/image-model-profiles.ts");
    assert.ok(/03-provider-capabilities\.md/.test(src), "no reference to the measurement document");
    for (const cited of ["1024×1024", "720×1280", "1280×720", "tối đa 2 ảnh", "76.4 s"]) {
      assert.ok(src.includes(cited), `the profile does not cite ${cited}`);
    }
  });

  check("the active row follows IMGSTUDIO_PROVIDER_ID, and rollback is one value", () => {
    assert.strictEqual(activeProfile({ IMGSTUDIO_PROVIDER_ID: SUNBURST.providerId }), SUNBURST);
    assert.strictEqual(activeProfile({ IMGSTUDIO_PROVIDER_ID: "flow-nano-banana-2" }), NANO_BANANA_2);
    // Absent, so a fresh environment renders with the default rather than crashing.
    assert.strictEqual(activeProfile({}), DEFAULT_PROFILE);
  });

  check("an unknown id falls back to the default and warns", () => {
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => warnings.push(a.map(String).join(" "));
    try {
      assert.strictEqual(activeProfile({ IMGSTUDIO_PROVIDER_ID: "not-a-model" }), DEFAULT_PROFILE);
    } finally {
      console.warn = orig;
    }
    assert.strictEqual(warnings.length, 1, "an unknown model id was accepted silently");
    assert.ok(/not-a-model/.test(warnings[0]));
    // profileForProviderId itself never guesses.
    assert.strictEqual(profileForProviderId("not-a-model"), null);
    assert.strictEqual(profileForProviderId(""), null);
    assert.strictEqual(profileForProviderId(null), null);
  });

  check("telemetry carries no secret", () => {
    const json = JSON.stringify(profileTelemetry());
    assert.ok(!/key|token|secret|authorization/i.test(json), `telemetry looks like it leaks: ${json}`);
  });

  // ── 2. Allocation invariants, over the whole grid ───────────────────────
  //
  // n in 0..8 x logo in {yes, no} x limit in {2, 3, 4, 8}. 72 cases, every one
  // checked against the same six invariants.
  console.log("\n-- allocation invariants, n=0..8 x logo x M in {2,3,4,8} --");

  const LIMITS = [2, 3, 4, 8];

  check("slots never exceed the provider's limit", () => {
    for (const M of LIMITS) {
      for (let n = 0; n <= 8; n++) {
        for (const L of [false, true]) {
          const a = allocateReferences(inputs(n, L), OPTS(M));
          assert.ok(a.slots.length <= M, `n=${n} L=${L} M=${M} produced ${a.slots.length} slots`);
        }
      }
    }
  });

  check("every image is in exactly one panel, or in dropped, or the run is impossible", () => {
    for (const M of LIMITS) {
      for (let n = 0; n <= 8; n++) {
        for (const L of [false, true]) {
          const ins = inputs(n, L);
          const a = allocateReferences(ins, OPTS(M));
          if (a.impossible) continue; // nothing is sent; the caller raises
          const placed = allPanelIds(a);
          assert.strictEqual(new Set(placed).size, placed.length, `n=${n} L=${L} M=${M}: an image is in two panels`);
          for (const input of ins) {
            const inPanel = placed.includes(input.id);
            const isDropped = a.dropped.some((d) => d.what === (input.filename || input.id));
            assert.ok(
              inPanel !== isDropped,
              `n=${n} L=${L} M=${M}: ${input.id} is ${inPanel ? "both sent and dropped" : "neither sent nor dropped"}`,
            );
          }
        }
      }
    }
  });

  check("a distinct product is never dropped while something lower-priority is kept", () => {
    for (const M of LIMITS) {
      for (let n = 0; n <= 8; n++) {
        for (const L of [false, true]) {
          const a = allocateReferences(inputs(n, L), OPTS(M));
          if (a.impossible) continue;
          const droppedProduct = a.dropped.some((d) => /^product-/.test(d.what));
          if (!droppedProduct) continue;
          // Every product here is distinct, so any product drop must mean nothing
          // lower-priority survived.
          const keptLogo = allPanelIds(a).includes("logo");
          assert.ok(!keptLogo, `n=${n} L=${L} M=${M}: a product was dropped while the logo image was kept`);
        }
      }
    }
  });

  check("the order is deterministic and stable", () => {
    for (const M of LIMITS) {
      for (let n = 0; n <= 8; n++) {
        for (const L of [false, true]) {
          const a = allocateReferences(inputs(n, L), OPTS(M));
          const b = allocateReferences(inputs(n, L), OPTS(M));
          assert.deepStrictEqual(a, b, `n=${n} L=${L} M=${M} is not deterministic`);
        }
      }
    }
  });

  check("slot numbering is 1..k with no gaps — it is what the prompt names", () => {
    for (const M of LIMITS) {
      for (let n = 0; n <= 8; n++) {
        for (const L of [false, true]) {
          const a = allocateReferences(inputs(n, L), OPTS(M));
          a.slots.forEach((s, i) => assert.strictEqual(s.index, i + 1, `n=${n} L=${L} M=${M} numbering`));
        }
      }
    }
  });

  check("nothing is packed when everything fits", () => {
    for (const M of LIMITS) {
      for (let n = 0; n <= 8; n++) {
        for (const L of [false, true]) {
          const needed = n + (L ? 1 : 0);
          if (needed > M) continue;
          const a = allocateReferences(inputs(n, L), OPTS(M));
          assert.strictEqual(a.packed, false, `n=${n} L=${L} M=${M} packed although it fits`);
          assert.strictEqual(a.slots.length, needed, `n=${n} L=${L} M=${M} slot count`);
          for (const s of a.slots) {
            assert.strictEqual(s.panels.length, 1, "a fitting allocation put two panels in one slot");
            assert.strictEqual(s.kind, "single");
          }
          assert.deepStrictEqual(a.dropped, [], "a fitting allocation dropped something");
        }
      }
    }
  });

  check("a bigger limit needs no code change: M=8 gives 8 images 8 slots", () => {
    const a = allocateReferences(inputs(8, false), OPTS(8));
    assert.strictEqual(a.slots.length, 8);
    assert.strictEqual(a.packed, false);
    const withLogo = allocateReferences(inputs(7, true), OPTS(8));
    assert.strictEqual(withLogo.slots.length, 8);
    assert.strictEqual(withLogo.packed, false);
  });

  // ── 3. The case that matters: M = 2 ─────────────────────────────────────
  console.log("\n-- M = 2, the live ceiling --");

  check("2 products + logo: two slots, the logo rides on one", () => {
    const a = allocateReferences(inputs(2, true), OPTS(2));
    assert.strictEqual(a.slots.length, 2);
    assert.strictEqual(a.packed, true);
    assert.ok(allPanelIds(a).includes("logo"), "the logo was dropped although it fits as a strip");
    // Products stay in separate slots at full size while there are slots for them.
    const productSlots = a.slots.filter((s) => s.panels.some((p) => p.role === "product"));
    assert.strictEqual(productSlots.length, 2, "two products should hold one slot each");
    const logoPanel = a.slots.flatMap((s) => s.panels).find((p) => p.role === "logo")!;
    assert.strictEqual(logoPanel.label, "LOGO");
    assert.ok(logoPanel.outWidth <= 256, `the logo strip is not small: ${logoPanel.outWidth}px`);
  });

  check("5 products, no logo: two sheets, panels spread evenly", () => {
    const a = allocateReferences(inputs(5, false), OPTS(2));
    assert.strictEqual(a.slots.length, 2);
    const counts = a.slots.map((s) => s.panels.length).sort();
    assert.deepStrictEqual(counts, [2, 3], `panels were not spread evenly: ${counts}`);
    assert.strictEqual(a.dropped.length, 0, "nothing needed to be dropped at 5 of 8 capacity");
  });

  check("8 products + logo at M=2: capacity is exactly reached", () => {
    // 2 slots x 4 panels = 8, minus one panel for the logo = 7 products.
    const a = allocateReferences(inputs(8, true), OPTS(2));
    assert.ok(!a.impossible, `8 distinct products should still fit by shedding the logo image: ${a.impossible?.reason_vi}`);
    assert.strictEqual(a.slots.length, 2);
    const products = a.slots.flatMap((s) => s.panels).filter((p) => p.role === "product");
    assert.strictEqual(products.length, 8, "a distinct product was dropped");
    // The logo gave up its panel, and said so in Vietnamese.
    assert.ok(!allPanelIds(a).includes("logo"));
    assert.ok(a.dropped.some((d) => /logo/i.test(d.what) && /chỉ được mô tả bằng chữ/.test(d.reason_vi)));
  });

  check("9 distinct products at M=2 is impossible, and says so rather than losing one", () => {
    const a = allocateReferences(inputs(9, false), OPTS(2));
    assert.ok(a.impossible, "9 distinct products were quietly made to fit");
    assert.deepStrictEqual(a.slots, [], "an impossible allocation still proposed slots");
    assert.ok(/tách thành nhiều lần tạo/.test(a.impossible!.reason_vi), "the reason does not tell the user what to do");
    assert.strictEqual(a.impossible!.products.length, 9);
  });

  check("extra angles are shed before a distinct product", () => {
    // 9 images, 3 distinct products: 3 primaries + 6 extra angles. Capacity 8.
    const a = allocateReferences(inputs(9, false, 3), OPTS(2));
    assert.ok(!a.impossible, "shedding one extra angle was enough and should have been done");
    const products = a.slots.flatMap((s) => s.panels).filter((p) => p.role === "product");
    assert.strictEqual(products.length, 8);
    assert.strictEqual(a.dropped.length, 1);
    assert.ok(/góc chụp thêm/.test(a.dropped[0].reason_vi), `wrong reason: ${a.dropped[0].reason_vi}`);
    // All three distinct products are still represented.
    const ids = new Set(products.map((p) => p.productId));
    assert.strictEqual(ids.size, 3, "a distinct product lost its last panel");
  });

  check("the first panel of each product comes before any extra angle", () => {
    // Two products, three angles each, interleaved on input.
    const ins: AllocationInput[] = [
      { id: "a1", kind: "product", productId: "P1", width: 1000, height: 1000 },
      { id: "b1", kind: "product", productId: "P2", width: 1000, height: 1000 },
      { id: "a2", kind: "product", productId: "P1", width: 1000, height: 1000 },
      { id: "b2", kind: "product", productId: "P2", width: 1000, height: 1000 },
      { id: "a3", kind: "product", productId: "P1", width: 1000, height: 1000 },
    ];
    const a = allocateReferences(ins, OPTS(2));
    const order = allPanelIds(a);
    // Buckets round-robin, so position in the flattened order is not input order —
    // but the two primaries must be allocated before any extra angle is.
    assert.ok(order.indexOf("a1") < order.indexOf("a3"), "an extra angle outranked its own primary");
    assert.ok(order.includes("a1") && order.includes("b1"), "a primary was not allocated");
  });

  // ── 4. Geometry ─────────────────────────────────────────────────────────
  console.log("\n-- geometry --");

  check("aspect ratios are preserved, and nothing is upscaled", () => {
    const wide: AllocationInput[] = [
      { id: "w1", kind: "product", productId: "P1", width: 2000, height: 1000 },
      { id: "w2", kind: "product", productId: "P2", width: 1000, height: 2000 },
      { id: "small", kind: "product", productId: "P3", width: 200, height: 200 },
    ];
    const a = allocateReferences(wide, OPTS(2));
    const panels = a.slots.flatMap((s) => s.panels);
    const w1 = panels.find((p) => p.sourceImageId === "w1")!;
    assert.ok(Math.abs(w1.outWidth / w1.outHeight - 2) < 0.02, `2:1 became ${w1.outWidth}x${w1.outHeight}`);
    const w2 = panels.find((p) => p.sourceImageId === "w2")!;
    assert.ok(Math.abs(w2.outWidth / w2.outHeight - 0.5) < 0.02, `1:2 became ${w2.outWidth}x${w2.outHeight}`);
    const small = panels.find((p) => p.sourceImageId === "small")!;
    assert.ok(small.outWidth <= 200 && small.outHeight <= 200, `a 200px image was upscaled to ${small.outWidth}`);
  });

  check("panels fit inside their sheet", () => {
    for (let n = 1; n <= 8; n++) {
      const a = allocateReferences(inputs(n, true), OPTS(2));
      if (a.impossible) continue;
      for (const slot of a.slots) {
        for (const p of slot.panels) {
          assert.ok(p.outWidth <= slot.width, `panel ${p.label} is wider than its sheet`);
          assert.ok(p.outHeight <= slot.height, `panel ${p.label} is taller than its sheet`);
        }
      }
    }
  });

  check("the grid rule matches the one the packing service already uses", () => {
    assert.deepStrictEqual(gridForPanels(1), { rows: 1, columns: 1 });
    assert.deepStrictEqual(gridForPanels(2), { rows: 1, columns: 2 });
    assert.deepStrictEqual(gridForPanels(4), { rows: 2, columns: 2 });
    assert.deepStrictEqual(gridForPanels(9), { rows: 3, columns: 3 });
    // The rule itself, as `ReferencePackingStrategy.gridFor` states it.
    const strategy = read("lib/image-engine/provider/reference-packing/ReferencePackingStrategy.ts");
    assert.ok(/Math\.ceil\(Math\.sqrt\(n\)\)/.test(strategy), "the existing grid rule changed");
  });

  check("a panel under the profile's floor is reported, not corrected", () => {
    // 8 products on 2 sheets = 4 panels each; a 1024 sheet in a 2x2 grid gives
    // ~496px cells, which is under Sunburst's 512px floor.
    const a = allocateReferences(inputs(8, false), OPTS(2, 4, 1024));
    const small = smallPanels(a, SUNBURST.minPanelLongestSidePx);
    assert.ok(small.length > 0, "8 products on two 1024px sheets should warn about panel size");
    for (const s of small) assert.ok(s.longestSidePx < 512);
    // And the allocation is still returned — a warning is not a refusal.
    assert.strictEqual(a.slots.length, 2);
  });

  check("the style reference never travels as an image", () => {
    const ins: AllocationInput[] = [
      { id: "p1", kind: "product", productId: "P1", width: 1000, height: 1000, filename: "p1.png" },
      { id: "s1", kind: "style", width: 1000, height: 1000, filename: "mood.png" },
    ];
    const a = allocateReferences(ins, OPTS(2));
    assert.ok(!allPanelIds(a).includes("s1"), "a style reference was attached as an image");
    assert.ok(a.dropped.some((d) => d.what === "mood.png" && /bằng chữ/.test(d.reason_vi)));
    // And it did not cost the product its slot.
    assert.strictEqual(a.slots.length, 1);
    assert.strictEqual(a.packed, false);
  });

  check("a second logo image is dropped with a reason", () => {
    const ins: AllocationInput[] = [
      { id: "p1", kind: "product", productId: "P1", width: 1000, height: 1000 },
      { id: "l1", kind: "logo", width: 400, height: 200, filename: "logo-a.png" },
      { id: "l2", kind: "logo", width: 400, height: 200, filename: "logo-b.png" },
    ];
    const a = allocateReferences(ins, OPTS(2));
    assert.ok(allPanelIds(a).includes("l1"));
    assert.ok(!allPanelIds(a).includes("l2"));
    assert.ok(a.dropped.some((d) => d.what === "logo-b.png"));
  });

  check("no images at all is an empty allocation, not an error", () => {
    const a = allocateReferences([], OPTS(2));
    assert.deepStrictEqual(a.slots, []);
    assert.deepStrictEqual(a.dropped, []);
    assert.strictEqual(a.packed, false);
    assert.ok(!a.impossible);
  });

  check("every dropped entry carries a Vietnamese reason", () => {
    for (const M of LIMITS) {
      for (let n = 0; n <= 8; n++) {
        for (const L of [false, true]) {
          const a = allocateReferences(inputs(n, L), OPTS(M));
          for (const d of a.dropped) {
            assert.ok(d.reason_vi.trim().length > 10, `thin reason for ${d.what}: ${d.reason_vi}`);
            assert.ok(/[àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(d.reason_vi), `not Vietnamese: ${d.reason_vi}`);
          }
        }
      }
    }
  });

  // ── 4b. Intake caps ─────────────────────────────────────────────────────
  //
  // Separate from the provider's ceiling on purpose: what a person may ATTACH and
  // what travels in one call are two different numbers, and before this there was no
  // cap on either side — neither the uploader nor the route counted or measured
  // anything, so eight 12-megapixel photographs were accepted and buffered.
  console.log("\n-- intake caps --");

  const L = IMAGE_ENGINE_CONFIG.INTAKE_LIMITS;
  const file = (size: number, type = "image/png", name = "x.png") => ({ size, type, name });
  const channel = (items: unknown[], max: number, types: readonly string[]) => ({
    label: "ảnh sản phẩm",
    items,
    max,
    types,
  });

  check("the caps are the ones asked for: 8 products, 1 logo, 1 style", () => {
    assert.strictEqual(L.maxProductImages, 8);
    assert.strictEqual(L.maxLogoImages, 1);
    assert.strictEqual(L.maxStyleImages, 1);
    assert.ok(L.maxBytesPerImage > 0 && L.maxTotalBytes >= L.maxBytesPerImage);
  });

  check("the intake cap is bigger than the provider's ceiling, deliberately", () => {
    // The whole point of packing: a person may attach more than the model takes.
    assert.ok(
      L.maxProductImages > SUNBURST.maxReferences,
      "the intake cap collapsed onto the provider limit; packing would be pointless",
    );
    // And the allocator can actually carry that many on this model.
    const a = allocateReferences(inputs(L.maxProductImages, false), OPTS(SUNBURST.maxReferences, SUNBURST.maxPanelsPerSheet, SUNBURST.sheetSizePx));
    assert.ok(!a.impossible, "the intake cap allows more products than the allocator can pack");
  });

  check("eight products are accepted, nine are refused with the number", () => {
    assert.strictEqual(checkIntake([channel(Array.from({ length: 8 }, () => file(1000)), 8, L.acceptedMimeTypes)], L), null);
    const p = checkIntake([channel(Array.from({ length: 9 }, () => file(1000)), 8, L.acceptedMimeTypes)], L);
    assert.ok(p, "a ninth product image was accepted");
    assert.strictEqual(p!.code, "TOO_MANY_IMAGES");
    assert.ok(/9/.test(p!.message_vi) && /8/.test(p!.message_vi), `the message hides the numbers: ${p!.message_vi}`);
  });

  check("an oversize file and an oversize total are each refused", () => {
    const big = checkIntake([channel([file(L.maxBytesPerImage + 1)], 8, L.acceptedMimeTypes)], L);
    assert.strictEqual(big?.code, "IMAGE_TOO_LARGE");
    // Eight files each just under the per-file cap exceed the total.
    const many = Array.from({ length: 8 }, () => file(L.maxBytesPerImage - 1));
    const total = checkIntake([channel(many, 8, L.acceptedMimeTypes)], L);
    assert.strictEqual(total?.code, "UPLOAD_TOO_LARGE");
  });

  check("type validation is kept, and an absent type is tolerated", () => {
    const bad = checkIntake([channel([file(1000, "image/gif")], 8, L.acceptedMimeTypes)], L);
    assert.strictEqual(bad?.code, "UNSUPPORTED_IMAGE_TYPE");
    // Some clients omit the type; the bytes are read during normalisation anyway.
    assert.strictEqual(checkIntake([channel([file(1000, "")], 8, L.acceptedMimeTypes)], L), null);
    // A logo may be a vector, and only a logo.
    assert.strictEqual(
      checkIntake([{ label: "ảnh logo", items: [file(1000, "image/svg+xml")], max: 1, types: L.acceptedLogoMimeTypes }], L),
      null,
    );
    assert.ok(checkIntake([channel([file(1000, "image/svg+xml")], 8, L.acceptedMimeTypes)], L));
  });

  check("every refusal is in Vietnamese and names its limit", () => {
    const problems = [
      checkIntake([channel(Array.from({ length: 9 }, () => file(1000)), 8, L.acceptedMimeTypes)], L),
      checkIntake([channel([file(L.maxBytesPerImage + 1)], 8, L.acceptedMimeTypes)], L),
      checkIntake([channel(Array.from({ length: 8 }, () => file(L.maxBytesPerImage - 1)), 8, L.acceptedMimeTypes)], L),
      checkIntake([channel([file(1000, "image/gif")], 8, L.acceptedMimeTypes)], L),
    ];
    for (const p of problems) {
      assert.ok(p, "a case that should be refused was accepted");
      assert.ok(
        /[àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(p!.message_vi),
        `not Vietnamese: ${p!.message_vi}`,
      );
      assert.ok(!/undefined|NaN/.test(p!.message_vi), `broken message: ${p!.message_vi}`);
      // Counts only, never a buffer.
      assert.ok(!JSON.stringify(p!.detail).includes("buffer"));
    }
  });

  check("the server is never stricter than the client: one constant, read by both", () => {
    const route = read("app/api/image/generate-simple/route.ts");
    const uploader = read("features/picture-engine/components/brief/BrandIdentityUploader.tsx");
    for (const [label, src] of [["route", route], ["uploader", uploader]] as const) {
      assert.ok(/INTAKE_LIMITS/.test(src), `the ${label} does not read the shared constant`);
      assert.ok(/checkIntake/.test(src), `the ${label} does not run the shared check`);
      // No second copy of the numbers.
      assert.ok(!/maxProductImages:\s*\d+/.test(src), `the ${label} restates a cap`);
    }
    // The route refuses rather than trimming.
    assert.ok(/TOO_MANY_IMAGES|intakeProblem/.test(route), "the route does not act on the check");
    assert.ok(!/rawImages\.slice\(/.test(route), "the route trims the attachment list instead of refusing");
  });

  check("the uploader tells the user when packing will happen", () => {
    const uploader = read("features/picture-engine/components/brief/BrandIdentityUploader.tsx");
    assert.ok(/sẽ được ghép thành/.test(uploader), "no packing notice");
    // The number comes from the profile, so it cannot become a lie on screen.
    assert.ok(/activeProfile\(\)\.maxReferences/.test(uploader), "the notice hardcodes the ceiling");
  });

  // ── 5. Dialect routing ──────────────────────────────────────────────────
  console.log("\n-- dialect routing --");

  const SUN_ENV = { IMGSTUDIO_PROVIDER_ID: SUNBURST.providerId };
  const NB2_ENV = { IMGSTUDIO_PROVIDER_ID: NANO_BANANA_2.providerId };

  check("the dialect follows the model, not the PROMPT_ENGINE flag", () => {
    assert.strictEqual(promptDialect(SUN_ENV), "gpt-image");
    assert.strictEqual(promptDialect(NB2_ENV), "gemini");
    // A flag asking for v1 cannot make a GPT model read a Gemini prompt.
    assert.strictEqual(promptDialect({ ...SUN_ENV, PROMPT_ENGINE: "v1" }), "gpt-image");
    assert.strictEqual(promptDialect({ ...SUN_ENV, PROMPT_ENGINE: "v2" }), "gpt-image");
  });

  check("Nano Banana 2 keeps today's behaviour exactly", () => {
    assert.deepStrictEqual(engineForActiveModel(NB2_ENV), { dialect: "gemini", engine: "v1" });
    assert.deepStrictEqual(engineForActiveModel({ ...NB2_ENV, PROMPT_ENGINE: "v2" }), {
      dialect: "gemini",
      engine: "v2",
    });
    // And the flag's own default is untouched.
    assert.strictEqual(promptEngineVersion({}), "v1");
  });

  check("Sunburst now routes to the GPT engine instead of throwing", () => {
    // Phase 3 is built, so the dialect is available and the "not built" refusal cannot
    // fire for it any more. The typed error is KEPT for the next dialect that gets named
    // before it is written.
    assert.strictEqual(gptDialectAvailable(), true, "Phase 3 is built; this should be true");
    assert.deepStrictEqual(engineForActiveModel(SUN_ENV), { dialect: "gpt-image", engine: "v2-gpt" });
    assert.ok(PromptDialectNotBuiltError, "the typed error was deleted rather than kept");
  });

  check("it routes to the GPT engine whatever PROMPT_ENGINE says", () => {
    // The dialect is a fact about the model. A flag cannot send a GPT model a Gemini
    // prompt, and it cannot send it v1 either.
    for (const flag of ["v1", "v2", "", "V2", "nonsense"]) {
      assert.deepStrictEqual(engineForActiveModel({ ...SUN_ENV, PROMPT_ENGINE: flag }), {
        dialect: "gpt-image",
        engine: "v2-gpt",
      });
    }
  });

  check("the label-lock gate is OFF by default and is NOT the availability flag", () => {
    // Two different questions: "is the dialect written" and "has the one thing it cannot
    // decide for itself been confirmed against the real model". Conflating them would
    // mean either refusing every render or shipping an unverified assumption.
    assert.strictEqual(labelLockVerified({}), false, "the label-lock gate must default to closed");
    assert.strictEqual(labelLockVerified({ GPT_LABEL_LOCK_VERIFIED: "true" }), true);
    assert.strictEqual(labelLockVerified({ GPT_LABEL_LOCK_VERIFIED: "yes" }), false, "only an exact true opens it");
    assert.strictEqual(engineTelemetry(SUN_ENV).gpt_label_lock_verified, false);
  });

  check("there is STILL no v1 fallback path for the GPT dialect", () => {
    // The standing rule survives Phase 3: never engine v1 for this dialect. v1 writes
    // Gemini prose, and handing it to Sunburst costs 150-250 VND for an image that looks
    // like a result and reports nothing wrong.
    const src = read("lib/image-engine/prompt-v2/engine-selector.ts");
    const fn = /export function engineForActiveModel[\s\S]*?\n\}/.exec(src);
    assert.ok(fn, "engineForActiveModel not found");
    assert.ok(!/engine: "v1"/.test(fn![0]), "a v1 fallback exists on the GPT path");
    // The engine falls back to CODE, not to a Gemini builder.
    const engine = read("lib/image-engine/prompt-v2/build-gpt.ts");
    assert.ok(/buildGptFallbackPrompt/.test(engine), "the GPT engine has no code-built fallback");
    assert.ok(
      !/buildSimplePrompt|MasterPromptCompiler/.test(engine),
      "the GPT engine reaches for a Gemini builder",
    );
  });

  check("no model name or resolution tier is hardcoded on the live path", () => {
    // The defect this closes: the provider id defaulted to "flow-nano-banana-2" in
    // six places and the resolution tier defaulted to "1K" in one and "2K" in
    // another (config.ts:128 vs CampaignOrchestratorService.ts:218). A model switch
    // that has to be made in seven places is a model switch that will be made in
    // six.
    const LIVE = [
      "lib/image-engine/provider/ImgStudioImageGenerationProvider.ts",
      "lib/image-engine/service/ImageGenerationService.ts",
      "lib/image-engine/service/SimpleImageGenerationOrchestratorService.ts",
      "lib/image-engine/campaign/CampaignOrchestratorService.ts",
      "lib/image-engine/evolution/ExperimentPipeline.ts",
      "app/api/campaign/render-asset/route.ts",
      "app/api/image/provider/route.ts",
    ];
    for (const rel of LIVE) {
      const src = read(rel);
      assert.ok(
        !/"flow-nano-banana-2"/.test(src),
        `${rel} still names a model; it belongs in models/image-model-profiles.ts`,
      );
      assert.ok(
        !/OUTPUT_RESOLUTION\s*\|\|\s*"2K"/.test(src),
        `${rel} still defaults the resolution tier to 2K`,
      );
    }
    // And the one file that is allowed to name them does.
    const profiles = read("lib/image-engine/models/image-model-profiles.ts");
    assert.ok(/"flow-nano-banana-2"/.test(profiles), "the rollback id is not declared anywhere");
  });

  check("telemetry names the dialect, so a log makes the routing visible", () => {
    const t = engineTelemetry(SUN_ENV);
    assert.strictEqual(t.prompt_dialect, "gpt-image");
    assert.strictEqual(t.gpt_dialect_available, true);
    assert.strictEqual(engineTelemetry(NB2_ENV).prompt_dialect, "gemini");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
  if (failed) process.exit(1);
}

main();
