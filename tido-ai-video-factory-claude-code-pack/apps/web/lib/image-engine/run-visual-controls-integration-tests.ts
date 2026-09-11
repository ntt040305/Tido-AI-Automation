import assert from "assert";
import fs from "fs";
import path from "path";
import { VisualDirectionPlanner } from "./director/VisualDirectionPlanner";
import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import { ProductRoutingEntry, RoutingResultSchema, SimpleInputRequestV1 } from "./types";

/**
 * CIOS Phase 4.1.5 — integration, not benchmark.
 *
 * Why this file exists
 * -------------------
 * The unit suite proved the resolver resolves and the director pipeline honours
 * a control. It proved nothing about the product, because the control panel was
 * never mounted and the director pipeline is never called by a route — verified
 * by grep: `VisualDirectionControlPanel` was referenced by exactly one file,
 * itself, and `CreativeDirectorPipeline` by three tests and three benchmarks.
 * A feature that passes every unit test and is unreachable in the app is not a
 * feature.
 *
 * So these tests walk the chain the user's click actually travels:
 *
 *   panel → creative_direction.visual_controls → picture-engine.api FormData
 *         → route → SimpleInputAdapterService → hardRequirements
 *         → USER_HARD_CONSTRAINTS in the compiled prompt
 *
 * The two ends are checked by reading the files that wire them, because a
 * component that is never imported cannot be caught by a runtime assertion —
 * that is exactly how this shipped unmounted in the first place.
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

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf-8");

function routing(products: ProductRoutingEntry[]): RoutingResultSchema {
  return {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    routing_summary: "Integration fixture",
    global_retrieval_queries: [
      { query: "Product photography", importance: "PRIMARY", reason: "Standard" } as never,
    ],
    products,
  } as RoutingResultSchema;
}

const PRODUCT: ProductRoutingEntry = {
  product_id: "PRODUCT_01",
  product_name: "Kem dưỡng da",
  reference_ids: ["REF_01"],
  retrieval_queries: [],
} as never;

function adapt(request: Partial<SimpleInputRequestV1>) {
  const req: SimpleInputRequestV1 = {
    concept: "Ảnh sản phẩm kem dưỡng da",
    useCase: "Poster",
    aspectRatio: "4:5",
    images: [{ reference_id: "REF_01", filename: "p.png", mimeType: "image/png" }],
    ...request,
  } as SimpleInputRequestV1;
  return SimpleInputAdapterService.adapt(req, routing([PRODUCT]));
}

console.log("\nCIOS Phase 4.1.5 — UI to prompt integration\n");

// ── The two ends of the wire ──────────────────────────────────────────────

check("The control panel is imported by the real brief panel", () => {
  const panel = read("features/picture-engine/components/brief/CreativeBriefPanel.tsx");
  assert.ok(
    /import\s*\{\s*VisualDirectionControlPanel\s*\}/.test(panel),
    "CreativeBriefPanel does not import the control panel"
  );
  assert.ok(/<VisualDirectionControlPanel/.test(panel), "the panel is imported but never rendered");
});

check("The panel sits at the end of the flow, just before Generate", () => {
  // Phase 4.1.5 revision: it is a recommendation to review, not a question to
  // answer before describing the brief.
  const panel = read("features/picture-engine/components/brief/CreativeBriefPanel.tsx");
  const panelAt = panel.indexOf("<VisualDirectionControlPanel");
  const uploaderAt = panel.indexOf("<BrandIdentityUploader");
  const ctaAt = panel.indexOf("{/* Submit CTA */}");
  assert.ok(panelAt > uploaderAt, "the panel still sits before the reference uploads");
  assert.ok(ctaAt > panelAt, "the panel is not before the Generate button");
});

check("The panel receives the concept and format it plans from", () => {
  const panel = read("features/picture-engine/components/brief/CreativeBriefPanel.tsx");
  assert.ok(/concept=\{brief\.creative_concept/.test(panel), "the panel cannot see the concept");
  assert.ok(/assetType=\{brief\.asset_type\}/.test(panel), "the panel cannot see the format");
});

check("The panel is wired to the brief state, both ways", () => {
  const panel = read("features/picture-engine/components/brief/CreativeBriefPanel.tsx");
  assert.ok(
    /value=\{brief\.creative_direction\?\.visual_controls/.test(panel),
    "the panel does not read its value from the brief"
  );
  assert.ok(
    /onUpdateCreativeDirection\(\{\s*visual_controls:/.test(panel),
    "the panel does not write back to the brief"
  );
});

check("The API service forwards the controls to the server", () => {
  const api = read("features/picture-engine/services/picture-engine.api.ts");
  assert.ok(
    /visual_controls:\s*brief\.creative_direction\?\.visual_controls/.test(api),
    "visual_controls is not included in the request payload"
  );
});

check("The route forwards creativeDirection to the engine", () => {
  const route = read("app/api/image/generate-simple/route.ts");
  assert.ok(/creativeDirection/.test(route), "the route drops creativeDirection");
});

// ── The engine end: controls become client requirements ───────────────────

check("A selected control becomes a hard requirement", () => {
  const adapted = adapt({
    creativeDirection: { visual_controls: { camera: "low_angle" } },
  });
  assert.ok(adapted.success, "adapter rejected the request");
  const joined = adapted.hardRequirements.join(" | ");
  assert.ok(/low-angle hero perspective/.test(joined), `not in hard requirements: ${joined}`);
  assert.ok(/important and aspirational/.test(joined), `no creative meaning carried: ${joined}`);
});

check("The user-facing label travels with the instruction", () => {
  const adapted = adapt({
    creativeDirection: { visual_controls: { lighting: "luxury_soft" } },
  });
  const joined = adapted.hardRequirements.join(" | ");
  assert.ok(/Ánh sáng mềm sang trọng/.test(joined), `label missing: ${joined}`);
  assert.ok(/soft directional key light/.test(joined), joined);
});

check("Several controls all arrive", () => {
  const adapted = adapt({
    creativeDirection: {
      visual_controls: { camera: "low_angle", lighting: "luxury_soft", color_mood: "dark_luxury" },
    },
  });
  const joined = adapted.hardRequirements.join(" | ");
  for (const needle of [
    "low-angle hero perspective",
    "soft directional key light",
    "dark low-key palette",
  ]) {
    assert.ok(joined.includes(needle), `missing "${needle}"`);
  }
});

check("A control written in the concept is hard, because the user wrote it", () => {
  const adapted = adapt({ concept: "Ảnh sản phẩm, chụp góc thấp" });
  const joined = adapted.hardRequirements.join(" | ");
  assert.ok(/low-angle hero perspective/.test(joined), `concept control lost: ${joined}`);
});

check("An AI suggestion never becomes a hard requirement", () => {
  // Corrected in the regression recovery patch. This test previously asserted
  // the opposite — that an untouched panel injects the whole displayed plan —
  // and that behaviour put six lines of machine-derived camera, lens, lighting,
  // composition, typography and colour direction into USER_HARD_CONSTRAINTS on
  // every render. It diluted the client's own voice and created a second
  // authority on camera and lighting, contradicting the ART DIRECTION block.
  //
  // A suggestion is not a requirement.
  const auto = adapt({});
  const withEmpty = adapt({ creativeDirection: { visual_controls: {} } });
  assert.deepStrictEqual(withEmpty.hardRequirements, auto.hardRequirements);
  const joined = auto.hardRequirements.join(" | ");
  assert.ok(
    !/three-quarter camera angle|controlled studio lighting|telephoto compression/.test(joined),
    `an AI suggestion was forced as a hard requirement: ${joined}`
  );
});

check("The plan the panel shows is still derived identically on the server", () => {
  // Determinism still matters — it is what lets the panel display a plan without
  // shipping it — even though the plan no longer binds as a hard requirement.
  const concept = "Poster mỹ phẩm cao cấp";
  const shown = VisualDirectionPlanner.plan({ concept, assetType: "Poster" });
  const again = VisualDirectionPlanner.plan({ concept, assetType: "Poster" });
  assert.deepStrictEqual(shown, again, "the planner is not deterministic");
  assert.ok(Object.keys(shown).length >= 5, "the panel would have nothing to show");
});

check("Tự chọn leaves the control entirely to art direction", () => {
  const unbound = adapt({ creativeDirection: { visual_controls: { camera: "auto" } } });
  const joined = unbound.hardRequirements.join(" | ");
  assert.ok(!/camera angle/i.test(joined), `Tự chọn still forced a camera: ${joined}`);
});

check("Only the control the user chose becomes hard", () => {
  const adapted = adapt({ creativeDirection: { visual_controls: { camera: "high_angle" } } });
  const camera = adapted.hardRequirements.filter((h: string) => /elevated camera looking down/.test(h));
  assert.strictEqual(camera.length, 1, "the chosen camera is missing or duplicated");
  // The five untouched controls contribute nothing.
  for (const leaked of ["telephoto compression", "controlled studio lighting", "rule-of-thirds"]) {
    assert.ok(
      !adapted.hardRequirements.join(" | ").includes(leaked),
      `an untouched control leaked in: ${leaked}`
    );
  }
});

check("A user selection still beats a conflicting concept here", () => {
  const adapted = adapt({
    concept: "Ảnh sản phẩm chụp từ trên xuống",
    creativeDirection: { visual_controls: { camera: "low_angle" } },
  });
  const joined = adapted.hardRequirements.join(" | ");
  assert.ok(/low-angle hero perspective/.test(joined), joined);
  assert.ok(!/directly overhead top-down/.test(joined), `both angles reached the prompt: ${joined}`);
});

check("Controls do not displace the user's own hard requirements", () => {
  const adapted = adapt({
    hardRequirements: ["Không dùng chữ tiếng Anh"],
    creativeDirection: { visual_controls: { camera: "low_angle" } },
  });
  const joined = adapted.hardRequirements.join(" | ");
  assert.ok(joined.includes("Không dùng chữ tiếng Anh"), "the user's own requirement was lost");
  assert.ok(/low-angle hero perspective/.test(joined), "the control was lost");
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
