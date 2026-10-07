import assert from "assert";
import fs from "fs";
import path from "path";
import {
  CapacityPlan,
  capacityTelemetry,
  describeOverCapacity,
  planReferenceCapacity,
} from "./provider/reference-capacity";
import type { ProviderReferenceImage } from "./provider/ImageGenerationProvider";
import type { ReferenceManifest } from "./types";

/**
 * Provider Constraint Handling.
 *
 * ImgStudio refuses a fourth image with HTTP 400. The tests below are arranged
 * around the one judgement in the adapter that matters: shedding a reference is
 * only free when no product identity leaves with it. Everything that can be shed
 * for free is shed; a product the client uploaded never is.
 *
 * The second theme is that a payload which already fitted must be untouched.
 * This code sits in front of every ImgStudio call in the system, including every
 * single-product render, and the cheapest way for it to cause damage is to
 * reorder or rebuild a list that was fine.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function ref(
  id: string,
  role?: string,
  productId?: string
): ProviderReferenceImage {
  return {
    reference_id: id,
    product_id: productId,
    role: role as ProviderReferenceImage["role"],
    mimeType: "image/png",
    buffer: Buffer.from([1, 2, 3]),
  };
}

const plan = (references: ProviderReferenceImage[], limit = 3, manifest?: ReferenceManifest) =>
  planReferenceCapacity({ references, manifest, limit });

console.log("\n=== Provider Constraint Handling ===\n");

// ── the path that must not change ───────────────────────────────────────────

check("A payload already within the limit is returned untouched", () => {
  const refs = [ref("REF_01", "PRODUCT", "PRODUCT_01"), ref("REF_02", "LOGO")];
  const p = plan(refs, 3);
  assert.strictEqual(p.status, "WITHIN_LIMIT");
  // Same array, not a copy. A rebuilt list is a new opportunity to reorder.
  assert.strictEqual(p.send, refs, "the reference list was rebuilt");
  assert.strictEqual(p.dropped.length, 0);
});

check("Exactly at the limit is within it", () => {
  const refs = [
    ref("REF_01", "PRODUCT", "PRODUCT_01"),
    ref("REF_02", "PRODUCT", "PRODUCT_02"),
    ref("REF_03", "PRODUCT", "PRODUCT_03"),
  ];
  const p = plan(refs, 3);
  assert.strictEqual(p.status, "WITHIN_LIMIT");
  assert.strictEqual(p.send.length, 3);
});

check("No references at all is not a failure", () => {
  const p = plan([], 3);
  assert.strictEqual(p.status, "WITHIN_LIMIT");
  assert.strictEqual(p.send.length, 0);
});

check("A limit of zero disables the check rather than blocking everything", () => {
  // A misconfigured env must not take the renderer offline.
  const refs = [ref("REF_01", "PRODUCT", "PRODUCT_01")];
  const p = plan(refs, 0);
  assert.strictEqual(p.status, "WITHIN_LIMIT");
  assert.strictEqual(p.send, refs);
});

check("The plan mutates neither the list nor any reference in it", () => {
  const refs = [
    ref("REF_01", "PRODUCT", "PRODUCT_01"),
    ref("REF_02", "PRODUCT", "PRODUCT_02"),
    ref("REF_03", "PRODUCT", "PRODUCT_03"),
    ref("REF_04", "LOGO"),
  ];
  const before = JSON.stringify(refs.map((r) => ({ ...r, buffer: undefined })));
  const p = plan(refs, 3);
  assert.strictEqual(p.status, "ADAPTED");
  assert.strictEqual(refs.length, 4, "the input list was shortened in place");
  assert.strictEqual(
    JSON.stringify(refs.map((r) => ({ ...r, buffer: undefined }))),
    before,
    "a reference was edited in place"
  );
});

// ── shedding what costs nothing ─────────────────────────────────────────────

check("A logo is shed before any product", () => {
  // Locked product rule: the model never renders logos, they are composited
  // deterministically. A logo in the edit payload is the cheapest thing there.
  const p = plan([
    ref("REF_01", "PRODUCT", "PRODUCT_01"),
    ref("REF_02", "PRODUCT", "PRODUCT_02"),
    ref("REF_03", "PRODUCT", "PRODUCT_03"),
    ref("REF_04", "LOGO"),
  ]);
  assert.strictEqual(p.status, "ADAPTED");
  assert.deepStrictEqual(p.send.map((r) => r.reference_id), ["REF_01", "REF_02", "REF_03"]);
  assert.strictEqual(p.dropped[0].reason, "LOGO_NOT_RENDERED_BY_MODEL");
});

check("An inspiration reference goes before a logo", () => {
  // Its style already travelled as analyzed text; the orchestrator withholds the
  // image on its own path for the same reason.
  const p = plan(
    [
      ref("REF_01", "PRODUCT", "PRODUCT_01"),
      ref("REF_02", "PRODUCT", "PRODUCT_02"),
      ref("REF_03", "LOGO"),
      ref("REF_04", "INSPIRATION_REFERENCE"),
    ],
    3
  );
  assert.strictEqual(p.status, "ADAPTED");
  assert.strictEqual(p.dropped.length, 1);
  assert.strictEqual(p.dropped[0].reference_id, "REF_04");
  assert.strictEqual(p.dropped[0].reason, "INSPIRATION_TRAVELS_AS_TEXT");
  assert.ok(p.send.some((r) => r.role === "LOGO"), "the logo went before the inspiration image");
});

check("A second view of one product is shed; the product still travels", () => {
  const p = plan([
    ref("REF_01", "PRODUCT", "PRODUCT_01"),
    ref("REF_02", "PRODUCT", "PRODUCT_01"),
    ref("REF_03", "PRODUCT", "PRODUCT_02"),
    ref("REF_04", "PRODUCT", "PRODUCT_03"),
  ]);
  assert.strictEqual(p.status, "ADAPTED");
  assert.strictEqual(p.dropped[0].reason, "REDUNDANT_VIEW_OF_SAME_PRODUCT");
  const carried = new Set(p.send.map((r) => r.product_id));
  assert.deepStrictEqual([...carried].sort(), ["PRODUCT_01", "PRODUCT_02", "PRODUCT_03"]);
});

check("The first view of a product is the one that stays", () => {
  const p = plan([
    ref("REF_01", "PRODUCT", "PRODUCT_01"),
    ref("REF_02", "PRODUCT", "PRODUCT_01"),
    ref("REF_03", "PRODUCT", "PRODUCT_01"),
    ref("REF_04", "PRODUCT", "PRODUCT_02"),
  ]);
  assert.strictEqual(p.status, "ADAPTED");
  assert.ok(p.send.some((r) => r.reference_id === "REF_01"), "the client's first upload was dropped");
});

check("Shedding stops the moment the payload fits", () => {
  // Five references, a ceiling of four, two things that could go. Only one
  // should: an adapter that empties every cheap tier is throwing away context
  // the provider would have accepted.
  const p = plan(
    [
      ref("REF_01", "PRODUCT", "PRODUCT_01"),
      ref("REF_02", "PRODUCT", "PRODUCT_02"),
      ref("REF_03", "PRODUCT", "PRODUCT_03"),
      ref("REF_04", "LOGO"),
      ref("REF_05", "INSPIRATION_REFERENCE"),
    ],
    4
  );
  assert.strictEqual(p.status, "ADAPTED");
  assert.strictEqual(p.dropped.length, 1, "more was shed than the ceiling required");
  assert.strictEqual(p.dropped[0].reference_id, "REF_05");
});

check("Unclassified references go before deliberate supporting ones", () => {
  const p = plan(
    [
      ref("REF_01", "PRODUCT", "PRODUCT_01"),
      ref("REF_02", "PRODUCT", "PRODUCT_02"),
      ref("REF_03", "SUPPORT_REFERENCE"),
      ref("REF_04", "UNKNOWN"),
    ],
    3
  );
  assert.strictEqual(p.status, "ADAPTED");
  assert.strictEqual(p.dropped[0].reference_id, "REF_04");
  assert.strictEqual(p.dropped[0].reason, "UNCLASSIFIED_REFERENCE");
});

// ── the refusal ─────────────────────────────────────────────────────────────

check("Four distinct products against a ceiling of three is refused, not trimmed", () => {
  // The reported case. Nothing here is free to shed, so nothing is shed.
  const p = plan([
    ref("REF_01", "PRODUCT", "PRODUCT_01"),
    ref("REF_02", "PRODUCT", "PRODUCT_02"),
    ref("REF_03", "PRODUCT", "PRODUCT_03"),
    ref("REF_04", "PRODUCT", "PRODUCT_04"),
  ]);
  assert.strictEqual(p.status, "OVER_CAPACITY");
  assert.strictEqual(p.over_by, 1);
  assert.strictEqual(p.dropped.length, 0, "a product was dropped to make it fit");
  assert.deepStrictEqual(p.distinct_products, [
    "PRODUCT_01",
    "PRODUCT_02",
    "PRODUCT_03",
    "PRODUCT_04",
  ]);
});

check("The refusal names the products rather than only counting them", () => {
  const p = plan([
    ref("REF_01", "PRODUCT", "PRODUCT_01"),
    ref("REF_02", "PRODUCT", "PRODUCT_02"),
    ref("REF_03", "PRODUCT", "PRODUCT_03"),
    ref("REF_04", "PRODUCT", "PRODUCT_04"),
  ]);
  const message = describeOverCapacity(p);
  assert.ok(/3/.test(message), "the message does not say what the limit is");
  assert.ok(/4/.test(message), "the message does not say how many arrived");
  assert.strictEqual(p.distinct_products.length, 4);
});

check("Free shedding is attempted before any refusal", () => {
  // Five: four products and a logo. The logo goes, and the answer is still no —
  // but the report has to show the logo was tried, or the operator cannot tell
  // a refusal that gave up early from one that had nowhere left to go.
  const p = plan([
    ref("REF_01", "PRODUCT", "PRODUCT_01"),
    ref("REF_02", "PRODUCT", "PRODUCT_02"),
    ref("REF_03", "PRODUCT", "PRODUCT_03"),
    ref("REF_04", "PRODUCT", "PRODUCT_04"),
    ref("REF_05", "LOGO"),
  ]);
  assert.strictEqual(p.status, "OVER_CAPACITY");
  assert.strictEqual(p.over_by, 1);
  assert.strictEqual(p.dropped.length, 1);
  assert.strictEqual(p.dropped[0].role, "LOGO");
});

// ── identity, however it is spelled ─────────────────────────────────────────

check("A reference with no role but a product id is a product", () => {
  // The common shape for a plain single upload. Reading it as unclassified would
  // shed the only thing the brief is about.
  const p = plan([
    ref("REF_01", undefined, "PRODUCT_01"),
    ref("REF_02", undefined, "PRODUCT_02"),
    ref("REF_03", undefined, "PRODUCT_03"),
    ref("REF_04", undefined, "PRODUCT_04"),
  ]);
  assert.strictEqual(p.status, "OVER_CAPACITY");
  assert.strictEqual(p.dropped.length, 0);
});

check("Identity is read from the manifest when the reference does not carry it", () => {
  // The manifest is the one place that already decided two uploads are the same
  // object. Re-deciding it here would be a second opinion against a settled one.
  const manifest = {
    product_identity_locks: [
      { product_id: "PRODUCT_01", reference_ids: ["REF_01", "REF_02"], canonical_name: "", key_features: [], preserve_aspects: [] },
      { product_id: "PRODUCT_02", reference_ids: ["REF_03"], canonical_name: "", key_features: [], preserve_aspects: [] },
      { product_id: "PRODUCT_03", reference_ids: ["REF_04"], canonical_name: "", key_features: [], preserve_aspects: [] },
    ],
  } as unknown as ReferenceManifest;
  const p = plan(
    [ref("REF_01"), ref("REF_02"), ref("REF_03"), ref("REF_04")],
    3,
    manifest
  );
  assert.strictEqual(p.status, "ADAPTED", "the duplicate view the manifest identified was not used");
  assert.strictEqual(p.dropped[0].reference_id, "REF_02");
  assert.strictEqual(p.dropped[0].reason, "REDUNDANT_VIEW_OF_SAME_PRODUCT");
});

check("Without a manifest, unroled references are still not mistaken for products", () => {
  const p = plan([ref("REF_01"), ref("REF_02"), ref("REF_03"), ref("REF_04")], 3);
  // Nothing identifies any of these, so they are unclassified and sheddable.
  assert.strictEqual(p.status, "ADAPTED");
  assert.strictEqual(p.dropped[0].reason, "UNCLASSIFIED_REFERENCE");
});

// ── telemetry ───────────────────────────────────────────────────────────────

check("Telemetry carries counts and ids, never image content", () => {
  const p = plan([
    ref("REF_01", "PRODUCT", "PRODUCT_01"),
    ref("REF_02", "PRODUCT", "PRODUCT_02"),
    ref("REF_03", "PRODUCT", "PRODUCT_03"),
    ref("REF_04", "LOGO"),
  ]);
  const t = capacityTelemetry(p);
  const serialized = JSON.stringify(t);
  assert.ok(!/buffer|base64|filename/i.test(serialized), "telemetry leaks payload detail");
  assert.strictEqual(t.received, 4);
  assert.strictEqual(t.sending, 3);
  assert.strictEqual(t.status, "ADAPTED");
});

// ── the wiring ──────────────────────────────────────────────────────────────

check("The shedding ladder is still the one thing deciding what is free to drop", () => {
  // The provider no longer calls this module directly — the packing layer went
  // in front of it. That is fine, and it is also exactly how two modules start
  // deciding separately what a logo is worth. The strategy must keep delegating.
  const src = fs.readFileSync(
    path.join(
      process.cwd(), "lib", "image-engine", "provider", "reference-packing", "ReferencePackingStrategy.ts"
    ),
    "utf-8"
  );
  assert.ok(
    /planReferenceCapacity\(/.test(src),
    "the packing strategy has stopped delegating the shedding decision"
  );
  for (const reimplemented of ["LOGO_NOT_RENDERED_BY_MODEL", "INSPIRATION_TRAVELS_AS_TEXT"]) {
    assert.ok(
      !src.includes(reimplemented),
      `the packing strategy has its own copy of the ladder: ${reimplemented}`
    );
  }
});

check("Capacity is settled before anything is normalized or sent", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "ImgStudioImageGenerationProvider.ts"),
    "utf-8"
  );
  const checked = src.indexOf("ReferencePackingService.pack(");
  const normalized = src.indexOf("ImageNormalizationService.normalizePayload");
  const posted = src.indexOf("await fetch(");
  assert.ok(checked > 0, "the capacity path is not wired in");
  assert.ok(normalized > 0 && checked < normalized, "images are normalized before the ceiling is settled");
  assert.ok(posted < 0 || checked < posted, "the request is sent before the ceiling is settled");
});

check("The ceiling is declared as a capability, not written into the call", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "provider", "ImgStudioImageGenerationProvider.ts"),
    "utf-8"
  );
  // The capability moved from one global constant to a per-MODEL row.
  //
  // `config.ts:172-175` declared 3 for every ImgStudio model, quoting the
  // provider's "maximum 3 images per edit request". That is true of Nano Banana 2
  // and false of GPT-Image-2.5-Sunburst, which refuses a THIRD image with HTTP 400
  // (`docs/migration/03-provider-capabilities.md` §2.2). One number could not be
  // right for both, so each model now declares its own in
  // `models/image-model-profiles.ts`.
  //
  // The property this test exists for is unchanged: the ceiling is read from a
  // declaration, never written into the call.
  assert.ok(
    /profile\.maxReferences/.test(src),
    "the limit is not read from the active model's declared capability"
  );
  assert.ok(
    /const referenceLimit\b/.test(src) && /limit: referenceLimit/.test(src),
    "the limit is not resolved once and passed by name"
  );
  assert.ok(
    !/limit:\s*\d+\b/.test(src),
    "a literal number is being passed as the limit, so the capability declaration is decorative"
  );
});

check("Nothing in the Stable orchestrator or pipeline was taught this limit", () => {
  // The capability belongs to the provider. A count leaking upstream would make
  // every other provider's ceiling a change in two places.
  for (const file of [
    ["service", "SimpleImageGenerationOrchestratorService.ts"],
    ["compiler", "MasterPromptCompilerService.ts"],
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", ...file), "utf-8");
    assert.ok(
      !/IMGSTUDIO_MAX_REFERENCE_IMAGES|planReferenceCapacity/.test(src),
      `${file[1]} now knows the provider's reference ceiling`
    );
  }
});

console.log("");
console.log("=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
